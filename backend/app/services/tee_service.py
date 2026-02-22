"""
StealthPitch — TEE Manager (Hybrid Mode)
========================================
Handles Intel TDX remote attestation via Phala Network dstack.
Falls back to simulation mode if the TEE socket is unavailable (dev mode).
"""

import base64
import hashlib
import logging
import os
import secrets
from datetime import datetime, timezone

import requests_unixsocket
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Constants
DSTACK_SOCKET_PATH = "/var/run/dstack.sock"
# Use URL-encoded socket path for requests-unixsocket
DSTACK_QUOTE_URL = "http+unix://%2Fvar%2Frun%2Fdstack.sock/api/v1/quote"
SECURITY_PROFILE = os.getenv("SECURITY_PROFILE", "baseline").strip().lower()
_SIGNING_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())


def _is_tee_available() -> bool:
    """Check if the dstack socket exists and is connectable."""
    return os.path.exists(DSTACK_SOCKET_PATH)


def _sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()


def _random_hex(length: int = 64) -> str:
    return secrets.token_hex(length // 2)


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


def _get_simulated_quote() -> dict:
    """Return a mock Intel TDX quote for local development."""
    now = datetime.now(timezone.utc)
    report_data = _sha256_hex(f"stealthpitch::session::{now.isoformat()}")

    quote = {
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
    if SECURITY_PROFILE == "high-value":
        quote["tee_type"] = "Threshold-TEE (Simulated)"
        quote["attestation_provider"] = "Phala + Nitro + Azure (Mock)"
        quote["multi_provider_quotes"] = [
            {"provider": "Phala", "quote": _random_hex(64)},
            {"provider": "AWS Nitro", "quote": _random_hex(64)},
            {"provider": "Azure CC", "quote": _random_hex(64)},
        ]
    return quote


def get_tdx_quote() -> dict:
    """Get TDX quote from hardware if available, else simulate."""
    if _is_tee_available():
        try:
            quote = _get_real_quote()
            quote["security_profile"] = SECURITY_PROFILE
            return quote
        except Exception:
            logger.warning("TEE socket found but request failed. Falling back to simulation.")
            quote = _get_simulated_quote()
            quote["security_profile"] = SECURITY_PROFILE
            return quote
    quote = _get_simulated_quote()
    quote["security_profile"] = SECURITY_PROFILE
    return quote


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
        "security_profile": SECURITY_PROFILE,
        "threshold_mode": SECURITY_PROFILE == "high-value",
        "signing_algorithm": "ECDSA_P256_SHA256",
        "signing_public_key_pem": get_signing_public_key_pem(),
        "confidential_vm": {
            "provider": "Phala Network",
            "cpu_flags": ["TDX"] if is_real else ["x86_64"],
            "numa_nodes": 1,
            "encrypted_memory_mb": 8192 if is_real else 0,
        },
    }


def get_signing_public_key_pem() -> str:
    """Return enclave signing public key in PEM format."""
    public_key = _SIGNING_PRIVATE_KEY.public_key()
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return public_bytes.decode("utf-8")


def sign_data(payload: str) -> dict:
    """Sign payload bytes with enclave key and return signature metadata."""
    signature = _SIGNING_PRIVATE_KEY.sign(
        payload.encode("utf-8"),
        ec.ECDSA(hashes.SHA256()),
    )
    return {
        "algorithm": "ECDSA_P256_SHA256",
        "signature": base64.b64encode(signature).decode("utf-8"),
        "signed_at": datetime.now(timezone.utc).isoformat(),
    }


def verify_data(payload: str, signature_b64: str) -> bool:
    """Verify payload signature against enclave public key."""
    try:
        signature = base64.b64decode(signature_b64.encode("utf-8"))
        _SIGNING_PRIVATE_KEY.public_key().verify(
            signature,
            payload.encode("utf-8"),
            ec.ECDSA(hashes.SHA256()),
        )
        return True
    except (InvalidSignature, ValueError):
        return False

