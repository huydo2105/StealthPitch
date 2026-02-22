"""FastAPI application entrypoint with modular route registration."""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.chat import router as chat_router
from app.api.routes.deals import router as deals_router
from app.api.routes.health import router as health_router
from app.api.routes.ingest import router as ingest_router
from app.core.config import get_settings


def create_app() -> FastAPI:
    """Create and configure FastAPI application."""
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        description=settings.app_description,
        version=settings.app_version,
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    application.include_router(health_router)
    application.include_router(ingest_router)
    application.include_router(chat_router)
    application.include_router(deals_router)
    return application


app = create_app()

