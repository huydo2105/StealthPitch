"""Shared dependencies and helper utilities for API routes."""

from __future__ import annotations

import json
from typing import Dict, Optional

from app.services import rag_service, tee_service

_sessions: Dict[str, object] = {}


def get_or_create_chain(session_id: str, room_id: Optional[str] = None) -> object:
    """Return existing QA chain for a session or create one."""
    cache_key = f"{session_id}::{room_id or ''}"
    if cache_key not in _sessions:
        _sessions[cache_key] = rag_service.get_qa_chain(room_id=room_id)
    return _sessions[cache_key]


def build_signed_envelope(payload: dict) -> dict:
    """Sign a payload and return signature metadata envelope."""
    payload_json = json.dumps(payload, sort_keys=True)
    signature_meta = tee_service.sign_data(payload_json)
    return {
        "signature_payload": payload_json,
        "signature": signature_meta["signature"],
        "signature_algorithm": signature_meta["algorithm"],
        "signing_public_key_pem": tee_service.get_signing_public_key_pem(),
    }

