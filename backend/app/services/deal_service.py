"""
StealthPitch — Deal Room Manager
==================================
Manages the NDAI deal lifecycle:
  1. Founder creates a room with acceptance threshold
  2. Investor joins with budget cap
  3. AI agents negotiate inside TEE (dual-agent RAG)
  4. Atomic outcome: ACCEPT (release docs + payment) or EXIT (delete all)
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Dict, List, Optional

from app.repositories.chat_repository import chat_store
from app.repositories.deal_repository import deal_store
from app.services.blockchain_service import blockchain

logger = logging.getLogger(__name__)


class DealStatus(str, Enum):
    CREATED = "created"  # Founder created room, no investor yet
    FUNDED = "funded"  # Investor joined and deposited funds
    NEGOTIATING = "negotiating"  # Active AI agent negotiation
    ACCEPTED = "accepted"  # Deal accepted — docs + payment released
    EXITED = "exited"  # Deal exited — everything deleted
    CANCELLED = "cancelled"  # Deal cancelled


@dataclass
class NegotiationMessage:
    role: str  # "investor", "seller_agent", "buyer_agent"
    content: str
    timestamp: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class DealRoom:
    room_id: str
    session_id: str
    status: DealStatus

    # Founder (Seller) side
    seller_address: str = ""
    seller_threshold: float = 0.0  # Min acceptable price in XTZ
    documents_ingested: bool = False

    # Investor (Buyer) side
    buyer_address: str = ""
    buyer_budget: float = 0.0  # Max budget cap in XTZ

    # Negotiation state
    proposed_price: float = 0.0  # Current proposed price
    negotiation_history: List[NegotiationMessage] = field(default_factory=list)

    # Blockchain
    tx_history: List[dict] = field(default_factory=list)

    # Timestamps
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    settled_at: Optional[str] = None


_deals: Dict[str, DealRoom] = {}


def create_room(seller_address: str, threshold: float) -> DealRoom:
    """Founder creates a new deal room with acceptance threshold."""
    room_id = str(uuid.uuid4())[:8]

    session_id = chat_store.ensure_deal_session(
        deal_room_id=room_id,
        wallet_address=seller_address,
        participant_role="founder",
        title_fallback=f"Deal Room {room_id}"
    )

    room = DealRoom(
        room_id=room_id,
        session_id=session_id,
        status=DealStatus.CREATED,
        seller_address=seller_address,
        seller_threshold=threshold,
    )

    threshold_wei = int(threshold * 1e18)
    tx_result = blockchain.create_deal_onchain(room_id, seller_address, threshold_wei)
    room.tx_history.append(
        {
            "action": "create_deal",
            "result": tx_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )

    _deals[room_id] = room
    _persist(room)
    logger.info(f"Deal room {room_id} created. Threshold: {threshold} XTZ")
    return room


def join_room(room_id: str, buyer_address: str, budget: float) -> DealRoom:
    """Investor joins a deal room with budget cap."""
    room = get_room(room_id)
    if room is None:
        raise ValueError(f"Deal room {room_id} not found")
    if room.status != DealStatus.CREATED:
        raise ValueError(f"Deal room {room_id} is not in CREATED state (current: {room.status})")

    room.buyer_address = buyer_address
    room.buyer_budget = budget
    room.status = DealStatus.FUNDED

    chat_store.ensure_deal_session(
        deal_room_id=room_id,
        wallet_address=buyer_address,
        participant_role="investor",
        title_fallback=f"Deal Room {room_id}"
    )

    amount_wei = int(budget * 1e18)
    tx_result = blockchain.deposit_funds(room_id, amount_wei)
    room.tx_history.append(
        {
            "action": "deposit_funds",
            "result": tx_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )

    _persist(room)
    logger.info(f"Investor joined room {room_id}. Budget: {budget} XTZ")
    return room


def add_negotiation_message(room_id: str, role: str, content: str) -> DealRoom:
    """Add a negotiation message to the deal room history."""
    room = get_room(room_id)
    if room is None:
        raise ValueError(f"Deal room {room_id} not found")

    room.negotiation_history.append(NegotiationMessage(role=role, content=content))

    if room.status == DealStatus.FUNDED:
        room.status = DealStatus.NEGOTIATING

    _persist(room)
    return room


def update_proposed_price(room_id: str, price: float) -> DealRoom:
    """Update the proposed price during negotiation."""
    room = get_room(room_id)
    if room is None:
        raise ValueError(f"Deal room {room_id} not found")

    room.proposed_price = price
    _persist(room)
    return room


def accept_deal(room_id: str) -> DealRoom:
    """Accept the deal — trigger smart contract to release funds."""
    room = get_room(room_id)
    if room is None:
        raise ValueError(f"Deal room {room_id} not found")
    if room.status not in (DealStatus.FUNDED, DealStatus.NEGOTIATING):
        raise ValueError(f"Deal room {room_id} cannot be accepted (status: {room.status})")
    if room.proposed_price <= 0:
        raise ValueError("No price has been proposed yet")
    if room.proposed_price < room.seller_threshold:
        raise ValueError(f"Proposed price ({room.proposed_price}) is below seller threshold ({room.seller_threshold})")
    if room.proposed_price > room.buyer_budget:
        raise ValueError(f"Proposed price ({room.proposed_price}) exceeds buyer budget ({room.buyer_budget})")

    price_wei = int(room.proposed_price * 1e18)
    tx_result = blockchain.accept_deal_onchain(room_id, price_wei)
    room.tx_history.append(
        {
            "action": "accept_deal",
            "result": tx_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )

    room.status = DealStatus.ACCEPTED
    room.settled_at = datetime.now(timezone.utc).isoformat()

    _persist(room)
    logger.info(f"Deal {room_id} ACCEPTED at {room.proposed_price} XTZ")
    return room


def exit_deal(room_id: str) -> DealRoom:
    """Exit the deal — refund investor, delete session data."""
    room = get_room(room_id)
    if room is None:
        raise ValueError(f"Deal room {room_id} not found")
    if room.status not in (DealStatus.FUNDED, DealStatus.NEGOTIATING):
        raise ValueError(f"Deal room {room_id} cannot be exited (status: {room.status})")

    tx_result = blockchain.exit_deal_onchain(room_id)
    room.tx_history.append(
        {
            "action": "exit_deal",
            "result": tx_result,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )

    room.status = DealStatus.EXITED
    room.settled_at = datetime.now(timezone.utc).isoformat()
    room.negotiation_history = []

    _persist(room)
    logger.info(f"Deal {room_id} EXITED — investor refunded, data deleted")
    return room


def mark_documents_ingested(room_id: str) -> DealRoom:
    """Mark that documents have been ingested into the TEE for this room."""
    room = get_room(room_id)
    if room is None:
        raise ValueError(f"Deal room {room_id} not found")
    room.documents_ingested = True
    _persist(room)
    return room


def get_room(room_id: str) -> Optional[DealRoom]:
    """Get a deal room by ID (in-memory first, then Supabase fallback)."""
    room = _deals.get(room_id)
    if room is not None:
        return room
    row = deal_store.get_room(room_id)
    if row is None:
        return None
    room = _row_to_room(row)
    _deals[room_id] = room
    return room


def get_all_rooms() -> List[DealRoom]:
    """Get all deal rooms."""
    return list(_deals.values())


def room_to_dict(room: DealRoom) -> dict:
    """Serialize a DealRoom to a JSON-safe dict."""
    return {
        "room_id": room.room_id,
        "session_id": room.session_id,
        "status": room.status.value,
        "seller_address": room.seller_address,
        "seller_threshold": room.seller_threshold,
        "documents_ingested": room.documents_ingested,
        "buyer_address": room.buyer_address,
        "buyer_budget": room.buyer_budget,
        "proposed_price": room.proposed_price,
        "negotiation_count": len(room.negotiation_history),
        "negotiation_history": [
            {"role": message.role, "content": message.content, "timestamp": message.timestamp}
            for message in room.negotiation_history
        ],
        "tx_history": room.tx_history,
        "created_at": room.created_at,
        "settled_at": room.settled_at,
        "blockchain": {
            "available": blockchain.is_available,
            "explorer": blockchain.explorer_url,
            "onchain_status": _get_onchain_status(room.room_id),
        },
    }


def _persist(room: DealRoom) -> None:
    """Write-through: persist room state to Supabase."""
    try:
        deal_store.save_room(room_to_dict(room))
    except Exception as exc:
        logger.error("_persist failed for %s: %s", room.room_id, exc)


def _row_to_room(row: dict) -> DealRoom:
    """Reconstruct a DealRoom dataclass from a Supabase row."""
    return DealRoom(
        room_id=row["room_id"],
        session_id=row.get("session_id", ""),
        status=DealStatus(row["status"]),
        seller_address=row.get("seller_address", ""),
        seller_threshold=float(row.get("seller_threshold", 0)),
        buyer_address=row.get("buyer_address", ""),
        buyer_budget=float(row.get("buyer_budget", 0)),
        proposed_price=float(row.get("proposed_price", 0)),
        documents_ingested=row.get("documents_ingested", False),
        tx_history=row.get("tx_history", []),
        created_at=row.get("created_at", ""),
        settled_at=row.get("settled_at"),
    )


def _get_onchain_status(room_id: str) -> Optional[dict]:
    """Get the on-chain status for a deal room."""
    try:
        return blockchain.get_deal_onchain(room_id)
    except Exception:
        return None

