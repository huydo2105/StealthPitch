"""
StealthPitch — Supabase Deal Store
===================================
Persist deal rooms so history survives backend restarts.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def _normalize(wallet: str) -> str:
    return wallet.strip().lower()


class SupabaseDealStore:
    """Store and query deal rooms in Supabase Postgres."""

    def __init__(self) -> None:
        self.supabase_url = os.getenv("SUPABASE_URL", "").strip()
        self.supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        self._client = None
        self._initialized = False

    def _ensure_init(self) -> None:
        if self._initialized:
            return
        self._initialized = True
        if not self.supabase_url or not self.supabase_service_role_key:
            logger.info("Supabase deal store disabled: missing credentials.")
            return
        try:
            from supabase import create_client

            self._client = create_client(self.supabase_url, self.supabase_service_role_key)
            logger.info("Supabase deal store initialized.")
        except Exception as exc:
            logger.error("Supabase deal store init failed: %s", exc)
            self._client = None

    @property
    def enabled(self) -> bool:
        self._ensure_init()
        return self._client is not None

    # ── Write ────────────────────────────────────────────────────────

    def save_room(self, room_dict: Dict[str, Any]) -> None:
        """Upsert a deal room row from a serialised room dict."""
        if not self.enabled:
            return
        try:
            payload = {
                "room_id": room_dict["room_id"],
                "session_id": room_dict["session_id"],  
                "status": room_dict["status"],
                "seller_address": _normalize(room_dict.get("seller_address", "")),
                "seller_threshold": room_dict.get("seller_threshold", 0),
                "buyer_address": _normalize(room_dict.get("buyer_address", "")),
                "buyer_budget": room_dict.get("buyer_budget", 0),
                "proposed_price": room_dict.get("proposed_price", 0),
                "documents_ingested": room_dict.get("documents_ingested", False),
                "tx_history": room_dict.get("tx_history", []),
                "created_at": room_dict.get("created_at", datetime.now(timezone.utc).isoformat()),
                "settled_at": room_dict.get("settled_at"),
            }
            self._client.table("deal_rooms").upsert(payload).execute()
        except Exception as exc:
            logger.error("save_room failed: %s", exc)

    # ── Read ─────────────────────────────────────────────────────────

    def get_room(self, room_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single deal room by ID."""
        if not self.enabled:
            return None
        try:
            resp = (
                self._client.table("deal_rooms")
                .select("*")
                .eq("room_id", room_id)
                .limit(1)
                .execute()
            )
            return resp.data[0] if resp.data else None
        except Exception as exc:
            logger.error("get_room failed: %s", exc)
            return None

    def list_rooms_by_wallet(
        self, wallet_address: str, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """Return deal rooms where the wallet is seller or buyer, newest first."""
        if not self.enabled:
            return []
        try:
            normalized = _normalize(wallet_address)
            resp = (
                self._client.table("deal_rooms")
                .select("*")
                .or_(f"seller_address.eq.{normalized},buyer_address.eq.{normalized}")
                .order("created_at", desc=True)
                .limit(limit)
                .execute()
            )
            return resp.data or []
        except Exception as exc:
            logger.error("list_rooms_by_wallet failed: %s", exc)
            return []


deal_store = SupabaseDealStore()
