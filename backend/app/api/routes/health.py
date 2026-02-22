"""Health and attestation routes."""

from __future__ import annotations

from fastapi import APIRouter

from app.schemas import AttestationResponse, HealthResponse
from app.services import deal_service, rag_service, tee_service

router = APIRouter(tags=["system"])


@router.get("/api/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """Return service health and active deal count."""
    active = len([room for room in deal_service.get_all_rooms() if room.status.value in ("created", "funded", "negotiating")])
    return HealthResponse(
        status="ok",
        has_documents=rag_service.has_documents(),
        version="3.0.0",
        active_deals=active,
    )


@router.get("/api/attestation", response_model=AttestationResponse)
async def get_attestation() -> AttestationResponse:
    """Return simulated/real TEE quote and health state."""
    return AttestationResponse(
        quote=tee_service.get_tdx_quote(),
        health=tee_service.get_tee_health(),
    )

