"""
StealthPitch — Supabase Chat Store
==================================
Persist chat sessions and messages by wallet address.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)


def normalize_wallet_address(wallet_address: str) -> str:
    """Normalize wallet address for stable indexing."""
    return wallet_address.strip().lower()


def is_valid_wallet_address(wallet_address: str) -> bool:
    """Validate a hex EVM wallet address format."""
    normalized = normalize_wallet_address(wallet_address)
    if not normalized.startswith("0x"):
        return False
    if len(normalized) != 42:
        return False
    return all(ch in "0123456789abcdefx" for ch in normalized)


class SupabaseChatStore:
    """Store and query chat history in Supabase Postgres."""

    def __init__(self) -> None:
        """Initialize Supabase client if configuration is present."""
        self.supabase_url = os.getenv("SUPABASE_URL", "").strip()
        self.supabase_service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        self._client = None
        self._initialized = False

    def _ensure_init(self) -> None:
        """Lazily initialize the Supabase client."""
        if self._initialized:
            return
        self._initialized = True
        if not self.supabase_url or not self.supabase_service_role_key:
            logger.info("Supabase chat store disabled: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.")
            return
        try:
            from supabase import create_client

            self._client = create_client(self.supabase_url, self.supabase_service_role_key)
            logger.info("Supabase chat store initialized.")
        except Exception as exc:
            logger.error("Supabase init failed: %s", exc)
            self._client = None

    @property
    def enabled(self) -> bool:
        """Return whether the store is configured and available."""
        self._ensure_init()
        return self._client is not None

    def ensure_session(self, session_id: str, wallet_address: str, title: Optional[str] = None) -> None:
        """Create session if absent, scoped to wallet."""
        if not self.enabled:
            return
        try:
            normalized = normalize_wallet_address(wallet_address)
            payload = {
                "id": session_id,
                "wallet_address": normalized,
                "title": title or "Chat Session",
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            self._client.table("chat_sessions").upsert(payload).execute()
            self._upsert_participant(
                session_id=session_id,
                wallet_address=normalized,
                role="member",
            )
        except Exception as exc:
            logger.error("ensure_session failed: %s", exc)

    def ensure_deal_session(
        self,
        deal_room_id: str,
        wallet_address: str,
        participant_role: str = "member",
        title_fallback: Optional[str] = None,
    ) -> str:
        """Create or fetch a shared session for a deal room and register participant."""
        normalized = normalize_wallet_address(wallet_address)
        if not self.enabled:
            return str(uuid.uuid4())

        try:
            existing = (
                self._client.table("chat_sessions")
                .select("id")
                .eq("deal_room_id", deal_room_id)
                .limit(1)
                .execute()
            )
            if existing.data:
                session_id = existing.data[0]["id"]
            else:
                session_id = str(uuid.uuid4())
                payload = {
                    "id": session_id,
                    "wallet_address": normalized,
                    "deal_room_id": deal_room_id,
                    "title": deal_room_id or title_fallback or "Chat Session",
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                self._client.table("chat_sessions").upsert(payload).execute()

            self._upsert_participant(
                session_id=session_id,
                wallet_address=normalized,
                role=participant_role,
            )
            return session_id
        except Exception as exc:
            logger.error("ensure_deal_session failed: %s", exc)
            return str(uuid.uuid4())

    def touch_session(self, session_id: str, wallet_address: str) -> None:
        """Update session timestamp after message write."""
        if not self.enabled:
            return
        try:
            self._client.table("chat_sessions").update(
                {"updated_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", session_id).execute()
        except Exception as exc:
            logger.error("touch_session failed: %s", exc)

    def save_message(
        self,
        session_id: str,
        wallet_address: str,
        role: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Persist a chat message row."""
        if not self.enabled:
            return
        try:
            normalized = normalize_wallet_address(wallet_address)
            payload = {
                "session_id": session_id,
                "wallet_address": normalized,
                "role": role,
                "content": content,
                "metadata": metadata or {},
            }
            self._client.table("chat_messages").insert(payload).execute()
            self._upsert_participant(
                session_id=session_id,
                wallet_address=normalized,
                role=role,
            )
            self.touch_session(session_id=session_id, wallet_address=normalized)
        except Exception as exc:
            logger.error("save_message failed: %s", exc)

    def list_sessions(self, wallet_address: str, limit: int = 20, offset: int = 0) -> List[Dict[str, Any]]:
        """List wallet-scoped chat sessions newest first."""
        if not self.enabled:
            return []
        try:
            normalized = normalize_wallet_address(wallet_address)
            participant_rows = (
                self._client.table("chat_session_participants")
                .select("session_id")
                .eq("wallet_address", normalized)
                .execute()
            )
            session_ids = [row["session_id"] for row in (participant_rows.data or [])]
            if not session_ids:
                return []
            response = (
                self._client.table("chat_sessions")
                .select("*")
                .in_("id", session_ids)
                .order("updated_at", desc=True)
                .range(offset, offset + max(limit - 1, 0))
                .execute()
            )
            return response.data or []
        except Exception as exc:
            logger.error("list_sessions failed: %s", exc)
            return []

    def list_messages(
        self,
        session_id: str,
        limit: int = 200,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List wallet-scoped messages for a session oldest first."""
        if not self.enabled:
            return []
        try:
            participant = (
                self._client.table("chat_session_participants")
                .select("session_id")
                .eq("session_id", session_id)
                .limit(1)
                .execute()
            )
            if not participant.data:
                return []
            response = (
                self._client.table("chat_messages")
                .select("*")
                .eq("session_id", session_id)
                .order("created_at", desc=False)
                .range(offset, offset + max(limit - 1, 0))
                .execute()
            )
            return response.data or []
        except Exception as exc:
            logger.error("list_messages failed: %s", exc)
            return []

    def _upsert_participant(self, session_id: str, wallet_address: str, role: str) -> None:
        """Ensure participant membership exists for a session."""
        self._client.table("chat_session_participants").upsert(
            {
                "session_id": session_id,
                "wallet_address": wallet_address,
                "role": role,
            }
        ).execute()


chat_store = SupabaseChatStore()

