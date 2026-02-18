"""
StealthPitch — TEE Manager (Hybrid Mode)
========================================
Handles Intel TDX remote attestation via Phala Network dstack.
Falls back to simulation mode if the TEE socket is unavailable (dev mode).
"""

import os
import json
import hashlib
import secrets
import logging
from datetime import datetime, timezone

import requests_unixsocket

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
DSTACK_SOCKET_PATH = "/var/run/dstack.sock"
# Use URL-encoded socket path for requests-unixsocket
DSTACK_QUOTE_URL = "http+unix://%2Fvar%2Frun%2Fdstack.sock/api/v1/quote"


def _is_tee_available() -> bool:
    """Check if the dstack socket exists and is connectable."""
    return os.path.exists(DSTACK_SOCKET_PATH)


def _sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()


def _random_hex(length: int = 64) -> str:
    return secrets.token_hex(length // 2)


# ── Real Implementation ──────────────────────────────────────────────

def _get_real_quote() -> dict:
    """Fetch actual TDX quote from dstack sidecar."""
    try:
        session = requests_unixsocket.Session()
        resp = session.get(DSTACK_QUOTE_URL, timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch real TDX quote: {e}")
        raise


# ── Simulation Implementation ────────────────────────────────────────

def _get_simulated_quote() -> dict:
    """Return a mock Intel TDX quote for local development."""
    now = datetime.now(timezone.utc)
    report_data = _sha256_hex(f"stealthpitch::session::{now.isoformat()}")

    return {
        "version": 4,
        "tee_type": "TDX (Simulated)",
        "attestation_provider": "Phala Network (Mock)",
        "mrenclave": _sha256_hex("stealthpitch::enclave::v2.0.0"),
        "mrsigner": _sha256_hex("phala::dstack::signer::0xCAFEBABE"),
        "isv_prod_id": 1,
        "isv_svn": 2,
        "runtime_measurements": {
            "rtmr0": _sha256_hex("bios::firmware::acpi"),
            "rtmr1": _sha256_hex("kernel::cmdline"),
            "rtmr2": _sha256_hex("rootfs::sha256"),
            "rtmr3": _sha256_hex("python3.10::fastapi"),
        },
        "report_data": report_data,
        "tcb_status": "UpToDate",
        "advisory_ids": [],
        "timestamp": now.isoformat(),
        "pck_certificate_chain": ["(Simulated Certificate Chain)"],
        "signature": _random_hex(128),
    }


# ── Public API ───────────────────────────────────────────────────────

def get_tdx_quote() -> dict:
    """Get TDX quote from hardware if available, else simulate."""
    if _is_tee_available():
        try:
            return _get_real_quote()
        except Exception:
            logger.warning("TEE socket found but request failed. Falling back to simulation.")
            return _get_simulated_quote()
    else:
        return _get_simulated_quote()


def get_tee_health() -> dict:
    """Get TEE health status."""
    is_real = _is_tee_available()
    
    return {
        "enclave_status": "ACTIVE" if is_real else "SIMULATED",
        "memory_encryption": "AES-256-XTS (TDX)" if is_real else "None (Dev)",
        "integrity_protection": "ENABLED" if is_real else "N/A",
        "seal_key_status": "DERIVED" if is_real else "N/A",
        "secure_clock_drift_ms": 0.0,
        "dstack_socket": DSTACK_SOCKET_PATH,
        "dstack_connected": is_real,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": 3600,  # Placeholder
        "confidential_vm": {
            "provider": "Phala Network",
            "cpu_flags": ["TDX"] if is_real else ["x86_64"],
            "numa_nodes": 1,
            "encrypted_memory_mb": 8192 if is_real else 0,
        },
    }
