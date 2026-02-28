"""Chat and wallet-scoped history routes."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator, Optional

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from app.deps import build_signed_envelope, get_or_create_chain
from app.repositories.chat_repository import chat_store, is_valid_wallet_address, normalize_wallet_address
from app.schemas import ChatRequest, ChatResponse, WalletMessagesResponse, WalletSessionsResponse
from app.services import rag_service, tee_service

router = APIRouter(tags=["chat"])


@router.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest) -> ChatResponse:
    """Handle non-streaming chat query with optional wallet history persistence."""
    if not rag_service.has_documents():
        raise HTTPException(
            status_code=400,
            detail="No documents ingested yet. Upload files first via /api/ingest.",
        )

    session_id = request.session_id or str(uuid.uuid4())
    wallet_address = request.wallet_address
    deal_room_id = request.deal_room_id
    participant_role = request.participant_role or "member"
    session_title = deal_room_id or (request.query[:80] if request.query else "Chat Session")

    if deal_room_id and not wallet_address:
        raise HTTPException(status_code=400, detail="wallet_address is required when deal_room_id is set")

    if wallet_address:
        if not is_valid_wallet_address(wallet_address):
            raise HTTPException(status_code=400, detail="Invalid wallet_address format")
        normalized_wallet = normalize_wallet_address(wallet_address)
        if deal_room_id:
            session_id = chat_store.ensure_deal_session(
                deal_room_id=deal_room_id,
                wallet_address=normalized_wallet,
                participant_role=participant_role,
                title_fallback=session_title,
            )
        else:
            chat_store.ensure_session(
                session_id=session_id,
                wallet_address=normalized_wallet,
                title=session_title,
            )
        chat_store.save_message(
            session_id=session_id,
            wallet_address=normalized_wallet,
            role="user",
            content=request.query,
            metadata={"transport": "http", "path": "/api/chat", "deal_room_id": deal_room_id},
        )
    chain = get_or_create_chain(session_id)

    try:
        result = rag_service.run_chain_query(chain=chain, question=request.query, enforce_policy=True)
        quote = tee_service.get_tdx_quote()
        payload = {
            "answer": result["answer"],
            "session_id": session_id,
            "sources": result["sources"],
            "policy": result["policy"],
            "quote_hash": quote.get("report_data", ""),
            "issued_at": datetime.now(timezone.utc).isoformat(),
        }
        signed = build_signed_envelope(payload)

        if wallet_address:
            normalized_wallet = normalize_wallet_address(wallet_address)
            chat_store.save_message(
                session_id=session_id,
                wallet_address=normalized_wallet,
                role="assistant",
                content=result["answer"],
                metadata={
                    "sources": result["sources"],
                    "policy": result["policy"],
                    "signature": signed["signature"],
                    "deal_room_id": deal_room_id,
                },
            )

        return ChatResponse(
            answer=result["answer"],
            session_id=session_id,
            sources=result["sources"],
            policy=result["policy"],
            attestation_quote=quote,
            signature=signed["signature"],
            signature_algorithm=signed["signature_algorithm"],
            signature_payload=signed["signature_payload"],
            signing_public_key_pem=signed["signing_public_key_pem"],
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(exc)}")


@router.post("/api/chat/stream")
async def chat_stream(request: ChatRequest) -> EventSourceResponse:
    """Handle chat query and stream chunks via SSE."""
    if not rag_service.has_documents():
        raise HTTPException(
            status_code=400,
            detail="No documents ingested yet. Upload files first via /api/ingest.",
        )

    session_id = request.session_id or str(uuid.uuid4())
    wallet_address = request.wallet_address
    deal_room_id = request.deal_room_id
    participant_role = request.participant_role or "member"
    normalized_wallet: Optional[str] = None
    session_title = deal_room_id or (request.query[:80] if request.query else "Chat Session")

    if deal_room_id and not wallet_address:
        raise HTTPException(status_code=400, detail="wallet_address is required when deal_room_id is set")

    if wallet_address:
        if not is_valid_wallet_address(wallet_address):
            raise HTTPException(status_code=400, detail="Invalid wallet_address format")
        normalized_wallet = normalize_wallet_address(wallet_address)
        if deal_room_id:
            session_id = chat_store.ensure_deal_session(
                deal_room_id=deal_room_id,
                wallet_address=normalized_wallet,
                participant_role=participant_role,
                title_fallback=session_title,
            )
        else:
            chat_store.ensure_session(
                session_id=session_id,
                wallet_address=normalized_wallet,
                title=session_title,
            )
        chat_store.save_message(
            session_id=session_id,
            wallet_address=normalized_wallet,
            role="user",
            content=request.query,
            metadata={"transport": "sse", "path": "/api/chat/stream", "deal_room_id": deal_room_id},
        )
    chain = get_or_create_chain(session_id)

    async def event_generator() -> AsyncGenerator[dict, None]:
        """Yield streamed answer chunks and final metadata event."""
        try:
            result = rag_service.run_chain_query(chain=chain, question=request.query, enforce_policy=True)
            answer = result["answer"]
            quote = tee_service.get_tdx_quote()

            words = answer.split(" ")
            buffer = ""
            for index, word in enumerate(words):
                buffer += word + " "
                if len(buffer) > 15 or index == len(words) - 1:
                    yield {
                        "event": "message",
                        "data": json.dumps({"chunk": buffer.strip(), "done": False}),
                    }
                    buffer = ""
                    await asyncio.sleep(0.03)

            payload = {
                "answer": answer,
                "session_id": session_id,
                "sources": result["sources"],
                "policy": result["policy"],
                "quote_hash": quote.get("report_data", ""),
                "issued_at": datetime.now(timezone.utc).isoformat(),
            }
            signed = build_signed_envelope(payload)

            if normalized_wallet:
                chat_store.save_message(
                    session_id=session_id,
                    wallet_address=normalized_wallet,
                    role="assistant",
                    content=answer,
                    metadata={
                        "sources": result["sources"],
                        "policy": result["policy"],
                        "signature": signed["signature"],
                        "deal_room_id": deal_room_id,
                    },
                )

            yield {
                "event": "message",
                "data": json.dumps(
                    {
                        "chunk": "",
                        "done": True,
                        "session_id": session_id,
                        "sources": result["sources"],
                        "policy": result["policy"],
                        "attestation_quote": quote,
                        "signature": signed["signature"],
                        "signature_algorithm": signed["signature_algorithm"],
                        "signature_payload": signed["signature_payload"],
                        "signing_public_key_pem": signed["signing_public_key_pem"],
                    }
                ),
            }
        except Exception as exc:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc)}),
            }

    return EventSourceResponse(event_generator())


@router.get("/api/chat/sessions/{wallet_address}", response_model=WalletSessionsResponse)
async def list_wallet_sessions(
    wallet_address: str,
    limit: int = 20,
    offset: int = 0,
) -> WalletSessionsResponse:
    """List chat sessions for a specific wallet address."""
    if not is_valid_wallet_address(wallet_address):
        raise HTTPException(status_code=400, detail="Invalid wallet_address format")
    normalized_wallet = normalize_wallet_address(wallet_address)
    sessions = chat_store.list_sessions(
        wallet_address=normalized_wallet,
        limit=max(1, min(limit, 100)),
        offset=max(0, offset),
    )
    return WalletSessionsResponse(wallet_address=normalized_wallet, sessions=sessions)


@router.get("/api/chat/sessions/{session_id}/messages", response_model=WalletMessagesResponse)
async def list_wallet_messages(
    session_id: str,
    limit: int = 200,
    offset: int = 0,
) -> WalletMessagesResponse:
    """List messages for a wallet-scoped chat session."""
    messages = chat_store.list_messages(
        session_id=session_id,
        limit=max(1, min(limit, 1000)),
        offset=max(0, offset),
    )
    return WalletMessagesResponse(
        session_id=session_id,
        messages=messages,
    )

 
