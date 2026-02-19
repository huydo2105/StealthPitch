"""
StealthPitch — FastAPI Backend
================================
REST API wrapping the RAG engine, TEE manager, and NDAI deal room.
Exposes endpoints for file ingestion, chat (SSE streaming),
attestation data, deal room management, and health checks.
"""

import os
import uuid
import tempfile
from typing import Dict, List, Optional

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse
import asyncio
import json

import rag_engine
import tee_manager
import deal_room as dr

# ── App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="StealthPitch API",
    description="TEE-based AI Due-Diligence Agent — NDAI Deal Protocol",
    version="3.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── In-memory session store for QA chains ────────────────────────────
_sessions: Dict[str, object] = {}


def _get_or_create_chain(session_id: str):
    """Get an existing QA chain for a session, or create a new one."""
    if session_id not in _sessions:
        _sessions[session_id] = rag_engine.get_qa_chain()
    return _sessions[session_id]


# ── Pydantic Models ─────────────────────────────────────────────────
class ChatRequest(BaseModel):
    query: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    session_id: str
    sources: List[str] = []


class IngestResponse(BaseModel):
    chunks_created: int
    files_processed: int
    message: str


class AttestationResponse(BaseModel):
    quote: dict
    health: dict


class HealthResponse(BaseModel):
    status: str
    has_documents: bool
    version: str
    active_deals: int


# ── Deal Room Models ────────────────────────────────────────────────
class CreateDealRequest(BaseModel):
    seller_address: str
    threshold: float  # Min acceptable price in XTZ


class JoinDealRequest(BaseModel):
    buyer_address: str
    budget: float  # Max budget cap in XTZ


class NegotiateRequest(BaseModel):
    query: str
    role: str = "investor"  # "investor" or "founder"


class AcceptDealRequest(BaseModel):
    pass  # Uses the proposed_price from negotiation


# ── Endpoints ────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Liveness check — returns service status and document availability."""
    active = len([r for r in dr.get_all_rooms() if r.status.value in ("created", "funded", "negotiating")])
    return HealthResponse(
        status="ok",
        has_documents=rag_engine.has_documents(),
        version="3.0.0",
        active_deals=active,
    )


@app.post("/api/ingest", response_model=IngestResponse)
async def ingest_files(files: List[UploadFile] = File(...)):
    """
    Upload one or more files (PDF or TXT) for RAG ingestion.
    Files are saved temporarily, processed by the RAG engine,
    then deleted.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    temp_paths = []
    try:
        for f in files:
            suffix = os.path.splitext(f.filename or "doc.txt")[1]
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            content = await f.read()
            tmp.write(content)
            tmp.close()
            temp_paths.append(tmp.name)

        chunk_count = rag_engine.ingest_documents(temp_paths)

        return IngestResponse(
            chunks_created=chunk_count,
            files_processed=len(files),
            message=f"Successfully ingested {len(files)} file(s) into {chunk_count} chunks.",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")
    finally:
        for p in temp_paths:
            try:
                os.unlink(p)
            except OSError:
                pass


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """
    Send a query to the RAG-powered AI agent.
    Returns the full answer (non-streaming).
    """
    if not rag_engine.has_documents():
        raise HTTPException(
            status_code=400,
            detail="No documents ingested yet. Upload files first via /api/ingest.",
        )

    session_id = request.session_id or str(uuid.uuid4())
    chain = _get_or_create_chain(session_id)

    try:
        result = chain.invoke({"question": request.query})
        answer = result.get("answer", "I couldn't generate a response.")

        sources = []
        for doc in result.get("source_documents", []):
            src = doc.metadata.get("source", "Unknown")
            if src not in sources:
                sources.append(src)

        return ChatResponse(
            answer=answer,
            session_id=session_id,
            sources=sources,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat error: {str(e)}")


@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    """
    Send a query and receive the response as a Server-Sent Events stream.
    Each event contains a chunk of the answer text.
    """
    if not rag_engine.has_documents():
        raise HTTPException(
            status_code=400,
            detail="No documents ingested yet. Upload files first via /api/ingest.",
        )

    session_id = request.session_id or str(uuid.uuid4())
    chain = _get_or_create_chain(session_id)

    async def event_generator():
        try:
            result = chain.invoke({"question": request.query})
            answer = result.get("answer", "")

            # Simulate streaming by chunking the response
            words = answer.split(" ")
            buffer = ""
            for i, word in enumerate(words):
                buffer += word + " "
                if len(buffer) > 15 or i == len(words) - 1:
                    yield {
                        "event": "message",
                        "data": json.dumps({"chunk": buffer.strip(), "done": False}),
                    }
                    buffer = ""
                    await asyncio.sleep(0.03)  # Small delay for streaming effect

            # Final event
            sources = []
            for doc in result.get("source_documents", []):
                src = doc.metadata.get("source", "Unknown")
                if src not in sources:
                    sources.append(src)

            yield {
                "event": "message",
                "data": json.dumps({
                    "chunk": "",
                    "done": True,
                    "session_id": session_id,
                    "sources": sources,
                }),
            }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps({"error": str(e)}),
            }

    return EventSourceResponse(event_generator())


@app.get("/api/attestation", response_model=AttestationResponse)
async def get_attestation():
    """Return TEE attestation quote and health status."""
    return AttestationResponse(
        quote=tee_manager.get_tdx_quote(),
        health=tee_manager.get_tee_health(),
    )


# ── Deal Room Endpoints ─────────────────────────────────────────────

@app.post("/api/deal/create")
async def create_deal(request: CreateDealRequest):
    """Founder creates a new deal room with acceptance threshold."""
    try:
        room = dr.create_room(
            seller_address=request.seller_address,
            threshold=request.threshold,
        )
        return dr.room_to_dict(room)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create deal: {str(e)}")


@app.post("/api/deal/{room_id}/join")
async def join_deal(room_id: str, request: JoinDealRequest):
    """Investor joins a deal room with budget cap."""
    try:
        room = dr.join_room(
            room_id=room_id,
            buyer_address=request.buyer_address,
            budget=request.budget,
        )
        return dr.room_to_dict(room)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to join deal: {str(e)}")


@app.get("/api/deal/{room_id}")
async def get_deal(room_id: str):
    """Get the current state of a deal room."""
    room = dr.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail=f"Deal room {room_id} not found")
    return dr.room_to_dict(room)


@app.get("/api/deals")
async def list_deals():
    """List all deal rooms."""
    return [dr.room_to_dict(r) for r in dr.get_all_rooms()]


@app.post("/api/deal/{room_id}/negotiate")
async def negotiate_deal(room_id: str, request: NegotiateRequest):
    """
    Send a query within the deal context. The AI agents evaluate the
    invention quality and negotiate price within budget/threshold constraints.
    """
    room = dr.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail=f"Deal room {room_id} not found")
    if room.status.value not in ("funded", "negotiating"):
        raise HTTPException(status_code=400, detail=f"Deal room is in {room.status.value} state — cannot negotiate")
    if not rag_engine.has_documents():
        raise HTTPException(status_code=400, detail="No documents ingested yet")

    # Record investor's query
    dr.add_negotiation_message(room_id, request.role, request.query)

    try:
        # Run dual-agent negotiation via RAG
        result = rag_engine.negotiate(
            query=request.query,
            seller_threshold=room.seller_threshold,
            buyer_budget=room.buyer_budget,
            current_proposed_price=room.proposed_price,
            negotiation_history=[(m.role, m.content) for m in room.negotiation_history],
        )

        # Record agent responses
        dr.add_negotiation_message(room_id, "buyer_agent", result["buyer_agent_response"])
        dr.add_negotiation_message(room_id, "seller_agent", result["seller_agent_response"])

        # Update proposed price if agent suggested one
        if result.get("suggested_price", 0) > 0:
            dr.update_proposed_price(room_id, result["suggested_price"])

        return {
            "buyer_agent": result["buyer_agent_response"],
            "seller_agent": result["seller_agent_response"],
            "suggested_price": result.get("suggested_price", 0),
            "threshold_met": result.get("suggested_price", 0) >= room.seller_threshold,
            "within_budget": result.get("suggested_price", 0) <= room.buyer_budget,
            "sources": result.get("sources", []),
            "room": dr.room_to_dict(dr.get_room(room_id)),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Negotiation error: {str(e)}")


@app.post("/api/deal/{room_id}/accept")
async def accept_deal_endpoint(room_id: str):
    """
    Accept the deal — trigger smart contract to release payment.
    The TEE backend is the authorized signer.
    """
    try:
        room = dr.accept_deal(room_id)
        return {
            "status": "accepted",
            "message": f"Deal sealed! {room.proposed_price} XTZ released to founder.",
            "room": dr.room_to_dict(room),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Accept failed: {str(e)}")


@app.post("/api/deal/{room_id}/exit")
async def exit_deal_endpoint(room_id: str):
    """
    Exit the deal — full refund to investor, delete session data.
    No information leaked — ironclad NDA enforced.
    """
    try:
        room = dr.exit_deal(room_id)
        return {
            "status": "exited",
            "message": "Deal exited. Investor refunded. All session data deleted.",
            "room": dr.room_to_dict(room),
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Exit failed: {str(e)}")


@app.post("/api/deal/{room_id}/ingest")
async def ingest_for_deal(room_id: str, files: List[UploadFile] = File(...)):
    """Upload files for a specific deal room."""
    room = dr.get_room(room_id)
    if room is None:
        raise HTTPException(status_code=404, detail=f"Deal room {room_id} not found")

    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    temp_paths = []
    try:
        for f in files:
            suffix = os.path.splitext(f.filename or "doc.txt")[1]
            tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
            content = await f.read()
            tmp.write(content)
            tmp.close()
            temp_paths.append(tmp.name)

        chunk_count = rag_engine.ingest_documents(temp_paths)
        dr.mark_documents_ingested(room_id)

        return {
            "chunks_created": chunk_count,
            "files_processed": len(files),
            "message": f"Successfully ingested {len(files)} file(s) into {chunk_count} chunks.",
            "room": dr.room_to_dict(dr.get_room(room_id)),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {str(e)}")
    finally:
        for p in temp_paths:
            try:
                os.unlink(p)
            except OSError:
                pass
