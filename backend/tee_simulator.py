"""
StealthPitch — TEE Attestation Simulator
=========================================
Mocks a Phala Network dstack / Intel TDX remote attestation quote.
In production, these values would come from the hardware enclave via
the dstack SDK over /var/run/dstack.sock.
"""

import hashlib
import secrets
import time
import json
from datetime import datetime, timezone


def _sha256_hex(data: str) -> str:
    """Return a deterministic-looking SHA-256 hex digest."""
    return hashlib.sha256(data.encode()).hexdigest()


def _random_hex(length: int = 64) -> str:
    """Return a cryptographically-random hex string."""
    return secrets.token_hex(length // 2)


# ---------------------------------------------------------------------------
# Pre-computed "hardware-bound" measurements (deterministic per build)
# ---------------------------------------------------------------------------
_ENCLAVE_CODE_HASH = _sha256_hex("stealthpitch::enclave::v1.0.0::gemini-3-pro")
_SIGNER_HASH = _sha256_hex("phala::dstack::signer::0xCAFEBABE")

_RTMR0 = _sha256_hex("bios::firmware::acpi::tables::v2.4")
_RTMR1 = _sha256_hex("kernel::cmdline::intel_iommu=on::tee=on")
_RTMR2 = _sha256_hex("rootfs::sha256::stealthpitch-image-digest")
_RTMR3 = _sha256_hex("runtime::python3.10::langchain::chromadb")


def get_tdx_quote() -> dict:
    """
    Return a mock Intel TDX / Phala dstack remote attestation quote.

    In a real deployment this would be fetched from the TEE hardware
    via ``/var/run/dstack.sock``.
    """
    now = datetime.now(timezone.utc)
    report_data = _sha256_hex(f"stealthpitch::session::{now.isoformat()}")

    quote = {
        "version": 4,
        "tee_type": "TDX",
        "attestation_provider": "Phala Network dstack",
        "mrenclave": _ENCLAVE_CODE_HASH,
        "mrsigner": _SIGNER_HASH,
        "isv_prod_id": 1,
        "isv_svn": 2,
        "runtime_measurements": {
            "rtmr0": _RTMR0,
            "rtmr1": _RTMR1,
            "rtmr2": _RTMR2,
            "rtmr3": _RTMR3,
        },
        "report_data": report_data,
        "tcb_status": "UpToDate",
        "advisory_ids": [],
        "timestamp": now.isoformat(),
        "pck_certificate_chain": [
            "-----BEGIN CERTIFICATE-----\nMIIE...(Processor Certificate)...truncated\n-----END CERTIFICATE-----",
            "-----BEGIN CERTIFICATE-----\nMIID...(Platform CA)...truncated\n-----END CERTIFICATE-----",
            "-----BEGIN CERTIFICATE-----\nMIIC...(Root CA)...truncated\n-----END CERTIFICATE-----",
        ],
        "signature": _random_hex(128),
    }
    return quote


def get_tee_health() -> dict:
    """
    Return synthetic TEE health / status indicators.
    """
    return {
        "enclave_status": "ACTIVE",
        "memory_encryption": "AES-256-XTS (TME-MK)",
        "integrity_protection": "ENABLED",
        "seal_key_status": "DERIVED",
        "secure_clock_drift_ms": round(secrets.randbelow(50) * 0.1, 1),
        "dstack_socket": "/var/run/dstack.sock",
        "dstack_connected": True,
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": 3600 + secrets.randbelow(86400),
        "confidential_vm": {
            "provider": "Phala Network",
            "cpu_flags": ["TDX", "AES-NI", "AVX-512", "TME"],
            "numa_nodes": 1,
            "encrypted_memory_mb": 8192,
        },
    }


def get_attestation_summary() -> str:
    """Pretty-printed attestation payload for display purposes."""
    return json.dumps(get_tdx_quote(), indent=2)


if __name__ == "__main__":
    print("=== TDX Quote ===")
    print(get_attestation_summary())
    print("\n=== TEE Health ===")
    print(json.dumps(get_tee_health(), indent=2))
