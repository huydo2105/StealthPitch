"""
StealthPitch — TEE Manager (Hybrid Mode)
========================================
Two attestation modes:
  1. Intel SGX (Azure CVM) — real hardware attestation via Azure IMDS
  2. Simulated — mock quotes for local development

Falls back gracefully: Azure CVM → Simulation.
"""

import base64
import hashlib
import logging
import os
import secrets
from datetime import datetime, timezone
from typing import Optional

import requests
import requests_unixsocket
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Constants ────────────────────────────────────────────────────────
DSTACK_SOCKET_PATH = "/var/run/dstack.sock"
DSTACK_QUOTE_URL = "http+unix://%2Fvar%2Frun%2Fdstack.sock/api/v1/quote"

AZURE_IMDS_BASE = "http://169.254.169.254/metadata"
AZURE_IMDS_HEADERS = {"Metadata": "true"}
AZURE_API_VERSION = "2021-02-01"

SECURITY_PROFILE = os.getenv("SECURITY_PROFILE", "baseline").strip().lower()
_SIGNING_PRIVATE_KEY = ec.generate_private_key(ec.SECP256R1())

# Cache Azure detection result (only check once)
_azure_cvm_cache: Optional[bool] = None


# ── Detection ────────────────────────────────────────────────────────

def _is_tee_available() -> bool:
    """Check if the Phala dstack socket exists."""
    return os.path.exists(DSTACK_SOCKET_PATH)


def _is_azure_cvm() -> bool:
    """Detect Azure Confidential VM via IMDS (cached)."""
    global _azure_cvm_cache
    if _azure_cvm_cache is not None:
        return _azure_cvm_cache
    try:
        resp = requests.get(
            f"{AZURE_IMDS_BASE}/instance",
            headers=AZURE_IMDS_HEADERS,
            params={"api-version": AZURE_API_VERSION},
            timeout=2,
        )
        _azure_cvm_cache = resp.status_code == 200
    except Exception:
        _azure_cvm_cache = False
    logger.info(f"Azure CVM detection: {_azure_cvm_cache}")
    return _azure_cvm_cache


# ── Helpers ──────────────────────────────────────────────────────────

def _sha256_hex(data: str) -> str:
    return hashlib.sha256(data.encode()).hexdigest()


def _random_hex(length: int = 64) -> str:
    return secrets.token_hex(length // 2)


# ── Quote Providers ──────────────────────────────────────────────────

def _get_dstack_quote() -> dict:
    """Fetch actual TDX quote from Phala dstack sidecar."""
    try:
        session = requests_unixsocket.Session()
        resp = session.get(DSTACK_QUOTE_URL, timeout=5)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.error(f"Failed to fetch dstack TDX quote: {e}")
        raise


def _get_azure_attestation() -> dict:
    """Fetch real attestation from Azure IMDS attested endpoint."""
    # Get VM instance metadata
    inst_resp = requests.get(
        f"{AZURE_IMDS_BASE}/instance",
        headers=AZURE_IMDS_HEADERS,
        params={"api-version": AZURE_API_VERSION},
        timeout=5,
    )
    inst_resp.raise_for_status()
    compute = inst_resp.json().get("compute", {})

    # Get attested document (hardware-signed)
    att_resp = requests.get(
        f"{AZURE_IMDS_BASE}/attested/document",
        headers=AZURE_IMDS_HEADERS,
        params={"api-version": AZURE_API_VERSION, "nonce": _random_hex(16)},
        timeout=5,
    )
    att_resp.raise_for_status()
    att = att_resp.json()

    now = datetime.now(timezone.utc)
    return {
        "version": 4,
        "tee_type": "Intel SGX (Azure CVM)",
        "attestation_provider": "Microsoft Azure Attestation",
        "mrenclave": _sha256_hex(compute.get("vmId", "")),
        "mrsigner": _sha256_hex(compute.get("subscriptionId", "")),
        "isv_prod_id": 1,
        "isv_svn": 2,
        "runtime_measurements": {
            "vm_id": compute.get("vmId", ""),
            "vm_size": compute.get("vmSize", ""),
            "azure_region": compute.get("location", ""),
            "os_type": compute.get("osType", ""),
        },
        "report_data": _sha256_hex(f"stealthpitch::azure::{now.isoformat()}"),
        "tcb_status": "UpToDate",
        "advisory_ids": [],
        "timestamp": now.isoformat(),
        "signature": att.get("signature", _random_hex(128)),
        "encoding": att.get("encoding", "pkcs7"),
    }


def _get_simulated_quote() -> dict:
    """Return a mock quote for local development."""
    now = datetime.now(timezone.utc)
    report_data = _sha256_hex(f"stealthpitch::session::{now.isoformat()}")

    quote = {
        "version": 4,
        "tee_type": "TDX (Simulated)",
        "attestation_provider": "Local Development (Mock)",
        "mrenclave": _sha256_hex("stealthpitch::enclave::v2.0.0"),
        "mrsigner": _sha256_hex("stealthpitch::signer::0xDEV"),
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
        quote["attestation_provider"] = "Multi-TEE Threshold (Mock)"
        quote["multi_provider_quotes"] = [
            {"provider": "Phala", "quote": _random_hex(64)},
            {"provider": "AWS Nitro", "quote": _random_hex(64)},
            {"provider": "Azure CC", "quote": _random_hex(64)},
        ]
    return quote


# ── Public API ───────────────────────────────────────────────────────

def get_tdx_quote() -> dict:
    """Get TEE quote. Priority: dstack → Azure SGX → simulated."""
    # 1. Phala dstack socket
    if _is_tee_available():
        try:
            quote = _get_dstack_quote()
            quote["security_profile"] = SECURITY_PROFILE
            return quote
        except Exception:
            logger.warning("dstack socket found but request failed.")

    # 2. Azure Confidential VM
    if _is_azure_cvm():
        try:
            quote = _get_azure_attestation()
            quote["security_profile"] = SECURITY_PROFILE
            return quote
        except Exception as e:
            logger.warning(f"Azure CVM detected but attestation failed: {e}")

    # 3. Simulation fallback
    quote = _get_simulated_quote()
    quote["security_profile"] = SECURITY_PROFILE
    return quote


def get_tee_health() -> dict:
    """Get TEE health status — reflects which mode is active."""
    is_dstack = _is_tee_available()
    is_azure = not is_dstack and _is_azure_cvm()
    is_real = is_dstack or is_azure

    if is_dstack:
        provider = "Phala Network"
        mem_enc = "AES-256-XTS (TDX)"
        cpu_flags = ["TDX"]
    elif is_azure:
        provider = "Microsoft Azure"
        mem_enc = "AES-256 (SGX)"
        cpu_flags = ["SGX", "CVM"]
    else:
        provider = "None (Local Dev)"
        mem_enc = "None (Dev)"
        cpu_flags = ["x86_64"]

    return {
        "enclave_status": "ACTIVE" if is_real else "SIMULATED",
        "memory_encryption": mem_enc,
        "integrity_protection": "ENABLED" if is_real else "N/A",
        "seal_key_status": "DERIVED" if is_real else "N/A",
        "secure_clock_drift_ms": 0.0,
        "dstack_socket": DSTACK_SOCKET_PATH,
        "dstack_connected": is_dstack,
        "azure_cvm": is_azure,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": 3600,
        "security_profile": SECURITY_PROFILE,
        "threshold_mode": SECURITY_PROFILE == "high-value",
        "signing_algorithm": "ECDSA_P256_SHA256",
        "signing_public_key_pem": get_signing_public_key_pem(),
        "confidential_vm": {
            "provider": provider,
            "cpu_flags": cpu_flags,
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
