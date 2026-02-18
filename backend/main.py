"""
StealthPitch — FastAPI Backend
================================
REST API wrapping the RAG engine and TEE simulator.
Exposes endpoints for file ingestion, chat (SSE streaming),
attestation data, and health checks.
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

# ── App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="StealthPitch API",
    description="TEE-based AI Due-Diligence Agent — Backend API",
    version="2.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",    # Next.js dev
        "http://localhost",         # Docker production
        "http://frontend:3000",     # Docker internal
        "*",                        # Allow all in dev (tighten in prod)
    ],
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


# ── Endpoints ────────────────────────────────────────────────────────

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    """Liveness check — returns service status and document availability."""
    return HealthResponse(
        status="ok",
        has_documents=rag_engine.has_documents(),
        version="2.0.0",
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
