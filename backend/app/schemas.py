"""Shared request and response models for API endpoints."""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel


class ChatRequest(BaseModel):
    """Input payload for chat requests."""

    query: str
    session_id: Optional[str] = None
    wallet_address: Optional[str] = None
    deal_room_id: Optional[str] = None
    participant_role: Optional[str] = None


class ChatResponse(BaseModel):
    """Response payload for non-streaming chat endpoint."""

    answer: str
    session_id: str
    sources: List[str] = []
    policy: Dict = {}
    attestation_quote: Dict
    signature: str
    signature_algorithm: str
    signature_payload: str
    signing_public_key_pem: str


class IngestResponse(BaseModel):
    """Response payload for ingestion endpoint."""

    chunks_created: int
    files_processed: int
    message: str


class AttestationResponse(BaseModel):
    """Response payload for attestation endpoint."""

    quote: Dict
    health: Dict


class HealthResponse(BaseModel):
    """Response payload for health endpoint."""

    status: str
    has_documents: bool
    version: str
    active_deals: int


class DealHumanMessageRequest(BaseModel):
    """Input payload for a human messaging in a deal room."""
    
    sender: str
    role: str
    content: str


class CreateDealRequest(BaseModel):
    """Input payload for deal creation."""

    seller_address: str
    threshold: float


class JoinDealRequest(BaseModel):
    """Input payload for joining a deal room."""

    buyer_address: str
    budget: float


class NegotiateRequest(BaseModel):
    """Input payload for negotiation message."""

    query: str
    role: str = "investor"
    wallet_address: Optional[str] = None


class RevealRequest(BaseModel):
    """Input payload for post-acceptance reveal queries."""

    query: str


class WalletSessionsResponse(BaseModel):
    """Response payload for wallet-scoped session list."""

    wallet_address: str
    sessions: List[Dict]


class WalletMessagesResponse(BaseModel):
    """Response payload for wallet-scoped message list."""

    wallet_address: Optional[str] = None
    session_id: str
    messages: List[Dict]

