"""Application configuration from environment variables."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List


@dataclass(frozen=True)
class Settings:
    """Runtime settings for the FastAPI application."""

    app_name: str = "StealthPitch API"
    app_description: str = "TEE-based AI Due-Diligence Agent — NDAI Deal Protocol"
    app_version: str = "3.0.0"
    cors_allow_origins: List[str] = None
    cors_allow_credentials: bool = True
    cors_allow_methods: List[str] = None
    cors_allow_headers: List[str] = None


def get_settings() -> Settings:
    """Return immutable application settings."""
    return Settings(
        cors_allow_origins=["*"],
        cors_allow_methods=["*"],
        cors_allow_headers=["*"],
    )

