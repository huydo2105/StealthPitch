"""Deal room and post-acceptance reveal routes."""

from __future__ import annotations

import os
import tempfile
from datetime import datetime, timezone
from typing import Any, Dict, List

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.deps import build_signed_envelope
from app.repositories.chat_repository import chat_store, is_valid_wallet_address, normalize_wallet_address
from app.repositories.deal_repository import deal_store
from app.schemas import ConfirmTxRequest, CreateDealRequest, DealHumanMessageRequest, JoinDealRequest, NegotiateRequest, RevealRequest
from app.services import deal_service, rag_service, tee_service

router = APIRouter(tags=["deals"])


@router.post("/api/deal/create")
async def create_deal(request: CreateDealRequest) -> Dict[str, Any]:
    """Founder creates a deal room with a seller threshold."""
    try:
        room = deal_service.create_room(
            seller_address=request.seller_address,
            threshold=request.threshold,
        )
        return deal_service.room_to_dict(room)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create deal: {str(exc)}")


@router.post("/api/deal/{room_id}/join")
async def join_deal(room_id: str, request: JoinDealRequest) -> Dict[str, Any]:
    """Investor joins a deal room with budget cap."""
    try:
        room = deal_service.join_room(
            room_id=room_id,
            buyer_address=request.buyer_address,
            budget=request.budget,
        )
        return deal_service.room_to_dict(room)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to join deal: {str(exc)}")


@router.get("/api/deal/{room_id}")
async def get_deal(room_id: str) -> Dict[str, Any]:
    """Return current state for a deal room."""
    room = deal_service.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail=f"Deal room {room_id} not found")
    return deal_service.room_to_dict(room)


@router.get("/api/deals")
async def list_deals() -> List[Dict[str, Any]]:
    """List all deal rooms."""
    return [deal_service.room_to_dict(room) for room in deal_service.get_all_rooms()]


@router.get("/api/deals/wallet/{wallet_address}")
async def list_wallet_deals(wallet_address: str) -> List[Dict[str, Any]]:
    """Return deal rooms involving this wallet, newest first."""
    return deal_store.list_rooms_by_wallet(wallet_address)


@router.post("/api/deal/{room_id}/confirm_tx")
async def confirm_tx(room_id: str, request: ConfirmTxRequest) -> Dict[str, Any]:
    """Frontend calls this after MetaMask confirms a wagmi tx.

    action='create'  → records tx hash (status stays 'created').
    action='deposit' → records tx hash and sets status → 'funded'.
    """
    try:
        room = deal_service.confirm_tx(room_id, request.action, request.tx_hash)
        return deal_service.room_to_dict(room)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"confirm_tx failed: {str(exc)}")


@router.post("/api/deal/{room_id}/negotiate")
async def negotiate_deal(room_id: str, request: NegotiateRequest) -> Dict[str, Any]:
    """Run dual-agent negotiation and return signed result."""
    room = deal_service.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail=f"Deal room {room_id} not found")
    if room.status.value not in ("funded", "negotiating"):
        raise HTTPException(status_code=400, detail=f"Deal room is in {room.status.value} state — cannot negotiate")
    if not rag_service.has_documents(room_id=room_id):
        raise HTTPException(status_code=400, detail="No documents ingested yet")

    normalized_wallet: str | None = None
    if request.wallet_address:
        if not is_valid_wallet_address(request.wallet_address):
            raise HTTPException(status_code=400, detail="Invalid wallet_address format")
        normalized_wallet = normalize_wallet_address(request.wallet_address)

    deal_service.add_negotiation_message(room_id, request.role, request.query)

    # If the investor explicitly proposed a price, apply it directly first.
    # This ensures the user's typed amount is the one recorded, not the AI's heuristic.
    if request.propose_price is not None and request.propose_price > 0:
        deal_service.update_proposed_price(room_id, request.propose_price)
        current_price = request.propose_price
    else:
        current_price = room.proposed_price

    try:
        mentions_agent = "@buyer_agent" in request.query.lower() or "@seller_agent" in request.query.lower()

        if mentions_agent:
            result = rag_service.negotiate(
                query=request.query,
                seller_threshold=room.seller_threshold,
                buyer_budget=room.buyer_budget,
                current_proposed_price=current_price,
                negotiation_history=[(msg.role, msg.content) for msg in room.negotiation_history],
                room_id=room_id,
            )
            buyer_response = result["buyer_agent_response"]
            seller_response = result["seller_agent_response"]
            ai_suggested_price = result.get("suggested_price", 0)
            sources = result.get("sources", [])
            policy = result.get("policy", {})
            robustness = result.get("robustness", {})
        else:
            buyer_response = "Price proposed directly; AI evaluation skipped at user request."
            seller_response = "Awaiting manual founder review (AI skipped)."
            ai_suggested_price = 0
            sources = []
            policy = {}
            robustness = {}

        actual_price = request.propose_price if (request.propose_price is not None and request.propose_price > 0) else ai_suggested_price

        if mentions_agent:
            deal_service.add_negotiation_message(room_id, "buyer_agent", buyer_response)
            deal_service.add_negotiation_message(room_id, "seller_agent", seller_response)

        # Only update proposed_price from the AI if the user did NOT specify an explicit price.
        # When the user specified a price, that already wins; the AI response is informational.
        if request.propose_price is None and actual_price > 0:
            deal_service.update_proposed_price(room_id, actual_price)

        quote = tee_service.get_tdx_quote()
        deal_chat_session_id: str | None = None
        if normalized_wallet:
            deal_chat_session_id = chat_store.ensure_deal_session(
                deal_room_id=room_id,
                wallet_address=normalized_wallet,
                participant_role=request.role,
                title_fallback=room_id,
            )
            # 1. Save the investor's manual command message
            chat_store.save_message(
                session_id=deal_chat_session_id,
                wallet_address=normalized_wallet,
                role=request.role,
                content=request.query,
                metadata={"transport": "http", "path": f"/api/deal/{room_id}/negotiate", "deal_room_id": room_id},
            )
            # 2. Add AI messages only if they were actually generated
            if mentions_agent:
                chat_store.save_message(
                    session_id=deal_chat_session_id,
                    wallet_address=normalized_wallet,
                    role="agent",
                    content=f"**Buyer Agent Assessment:**\n{buyer_response}",
                    metadata={"agent": "buyer_agent", "deal_room_id": room_id, "suggested_price": actual_price},
                )
                chat_store.save_message(
                    session_id=deal_chat_session_id,
                    wallet_address=normalized_wallet,
                    role="agent",
                    content=f"**Seller Agent Response:**\n{seller_response}",
                    metadata={"agent": "seller_agent", "deal_room_id": room_id},
                )
            else:
                # Still output an invisible or brief system update with the new price if we want,
                # but the user already sees their message. We'll emit one system message so the UI reacts.
                chat_store.save_message(
                    session_id=deal_chat_session_id,
                    wallet_address=normalized_wallet,
                    role="system",
                    content=f"Investor proposed {actual_price} XTZ.",
                    metadata={"agent": "system", "deal_room_id": room_id, "suggested_price": actual_price},
                )

        payload = {
            "room_id": room_id,
            "buyer_agent": buyer_response,
            "seller_agent": seller_response,
            "suggested_price": actual_price,
            "policy": policy,
            "robustness": robustness,
            "quote_hash": quote.get("report_data", ""),
            "issued_at": datetime.now(timezone.utc).isoformat(),
        }
        signed = build_signed_envelope(payload)
        return {
            "buyer_agent": buyer_response,
            "seller_agent": seller_response,
            "suggested_price": actual_price,
            "threshold_met": actual_price >= room.seller_threshold,
            "within_budget": actual_price <= room.buyer_budget,
            "sources": sources,
            "policy": policy,
            "robustness": robustness,
            "quote_hash": quote.get("report_data", ""),
            "tee_signature": signed["signature"],
            "signature_algorithm": signed["signature_algorithm"],
            "signature_payload": signed["signature_payload"],
            "signing_public_key_pem": signed["signing_public_key_pem"],
            "session_id": deal_chat_session_id,
            "room": deal_service.room_to_dict(deal_service.get_room(room_id)),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Negotiation error: {str(exc)}")


@router.post("/api/deal/{room_id}/message")
async def send_human_message(room_id: str, request: DealHumanMessageRequest) -> Dict[str, Any]:
    """Handle a direct human message in the deal room, and optionally trigger the Agent."""
    room = deal_service.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail="Deal room not found")

    if not is_valid_wallet_address(request.sender):
        raise HTTPException(status_code=400, detail="Invalid sender address format")

    wallet_address = normalize_wallet_address(request.sender)

    # 1. Ensure a session exists
    session_id = chat_store.ensure_deal_session(
        deal_room_id=room_id,
        wallet_address=wallet_address,
        participant_role=request.role,
        title_fallback=room_id,
    )

    # 2. Persist the human message (this emits a Supabase event)
    chat_store.save_message(
        session_id=session_id,
        wallet_address=wallet_address,
        role=request.role,
        content=request.content,
        metadata={"sender": wallet_address, "deal_room_id": room_id},
    )

    agent_replied = False

    # 3. Check if @BuyerAgent or @SellerAgent was mentioned
    msg_lower = request.content.lower()
    mentions_buyer = "@buyer_agent" in msg_lower
    mentions_seller = "@seller_agent" in msg_lower
    if mentions_buyer or mentions_seller:
        agent_role = "buyer_agent" if mentions_buyer else "seller_agent"
        if not rag_service.has_documents(room_id=room_id):
            # If no docs, agent replies with a canned message
            chat_store.save_message(
                session_id=session_id,
                wallet_address=wallet_address,
                role=agent_role,
                content="I am present, but no documents have been ingested yet. Please ingest the files first.",
                metadata={"agent": agent_role, "deal_room_id": room_id},
            )
            agent_replied = True
        else:
            try:
                # 4. Agent answers via RAG pipeline (this enforces PolicyGate rules)
                chain = rag_service.get_qa_chain(room_id=room_id)
                result = rag_service.run_chain_query(chain, request.content, [])

                chat_store.save_message(
                    session_id=session_id,
                    wallet_address=wallet_address,
                    role=agent_role,
                    content=result.get("answer", "I could not generate a response."),
                    metadata={
                        "agent": agent_role,
                        "deal_room_id": room_id,
                        "sources": result.get("sources", [])
                    },
                )
                agent_replied = True
            except Exception as e:
                chat_store.save_message(
                    session_id=session_id,
                    wallet_address=wallet_address,
                    role="system",
                    content=f"Agent error: {str(e)}",
                    metadata={"deal_room_id": room_id},
                )

    return {"session_id": session_id, "agent_replied": agent_replied}


@router.post("/api/deal/{room_id}/accept")
async def accept_deal_endpoint(room_id: str) -> Dict[str, Any]:
    """Accept the deal and release payment."""
    try:
        room = deal_service.accept_deal(room_id)
        return {
            "status": "accepted",
            "message": f"Deal sealed! {room.proposed_price} XTZ released to founder.",
            "room": deal_service.room_to_dict(room),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Accept failed: {str(exc)}")


@router.post("/api/deal/{room_id}/exit")
async def exit_deal_endpoint(room_id: str) -> Dict[str, Any]:
    """Exit the deal and refund investor."""
    try:
        room = deal_service.exit_deal(room_id)
        return {
            "status": "exited",
            "message": "Deal exited. Investor refunded. All session data deleted.",
            "room": deal_service.room_to_dict(room),
        }
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Exit failed: {str(exc)}")


@router.post("/api/deal/{room_id}/ingest")
async def ingest_for_deal(room_id: str, files: List[UploadFile] = File(...)) -> Dict[str, Any]:
    """Upload files and ingest them for a specific deal room."""
    room = deal_service.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail=f"Deal room {room_id} not found")
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    temp_paths: List[str] = []
    try:
        for upload in files:
            suffix = os.path.splitext(upload.filename or "doc.txt")[1]
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            content = await upload.read()
            tmp.write(content)
            tmp.close()
            temp_paths.append(tmp.name)

        chunk_count = rag_service.ingest_documents(temp_paths, room_id=room_id)
        deal_service.mark_documents_ingested(room_id)
        return {
            "chunks_created": chunk_count,
            "files_processed": len(files),
            "message": f"Successfully ingested {len(files)} file(s) into {chunk_count} chunks.",
            "room": deal_service.room_to_dict(deal_service.get_room(room_id)),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(exc)}")
    finally:
        for path in temp_paths:
            try:
                os.unlink(path)
            except OSError:
                pass


@router.post("/api/deal/{room_id}/reveal")
async def reveal_after_accept(room_id: str, request: RevealRequest) -> Dict[str, Any]:
    """Return unrestricted disclosure after accepted settlement."""
    room = deal_service.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail=f"Deal room {room_id} not found")
    if room.status.value != "accepted":
        raise HTTPException(status_code=403, detail="Disclosure locked until deal is ACCEPTED")
    if not rag_service.has_documents():
        raise HTTPException(status_code=400, detail="No documents available for reveal")

    try:
        result = rag_service.run_unrestricted_query(request.query, room_id=room_id)
        quote = tee_service.get_tdx_quote()
        payload = {
            "room_id": room_id,
            "revealed_answer": result["answer"],
            "sources": result["sources"],
            "quote_hash": quote.get("report_data", ""),
            "issued_at": datetime.now(timezone.utc).isoformat(),
        }
        signed = build_signed_envelope(payload)
        return {
            "answer": result["answer"],
            "sources": result["sources"],
            "attestation_quote": quote,
            "signature": signed["signature"],
            "signature_algorithm": signed["signature_algorithm"],
            "signature_payload": signed["signature_payload"],
            "signing_public_key_pem": signed["signing_public_key_pem"],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Reveal failed: {str(exc)}")

