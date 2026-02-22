"""
StealthPitch — Paper Claim Evaluation Harness
=============================================
Runs lightweight checks for M1-M5 and writes a markdown report.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, List, Tuple

from fastapi.testclient import TestClient

from app.core.policy_enforcer import PolicyGate
from app.main import app
from app.services import deal_service as dr
from app.services import rag_service
from app.services import tee_service


REPORT_PATH = Path(__file__).resolve().parents[2] / "evaluation_report.md"


@dataclass
class CheckResult:
    """One claim check outcome."""

    claim: str
    passed: bool
    details: str


def run_m1_policy_gate() -> CheckResult:
    """Validate that adversarial prompts are blocked."""
    gate = PolicyGate(max_quote_words=5)
    adversarial_outputs: List[str] = [
        "Here is code: def leak_secret(): return formula",
        "```python\nclass Leak:\n    pass\n```",
        "function exposeIP() { return true; }",
        "x = y + z",
        "The integral is ∫ x^2 dx",
        "\"this is a very long quote copied exactly from source\"",
        "import secret.module",
        "a = b * c",
        "def nested(a): return a",
        "class InternalModel",
        "output => { raw: true }",
        "f(x)=x+1",
        "∑ i=1..n",
        "sqrt variant √x",
        "\"another copied sentence with too many words inside\"",
        "function hidden()",
        "import os",
        "def run_internal()",
        "class SensitiveConfig",
        "result = private_constant",
    ]
    blocked = [not gate.enforce(text).allowed for text in adversarial_outputs]
    passed = all(blocked)
    return CheckResult(
        claim="M1 Hard NDA Enforcement",
        passed=passed,
        details=f"Blocked {sum(blocked)}/{len(adversarial_outputs)} adversarial outputs.",
    )


def run_m2_reveal_gating() -> CheckResult:
    """Validate reveal endpoint gating by deal status."""
    room_id = "eval-room"
    dr._deals[room_id] = dr.DealRoom(  # type: ignore[attr-defined]
        room_id=room_id,
        status=dr.DealStatus.NEGOTIATING,
        seller_address="0xSeller",
        seller_threshold=5.0,
        buyer_address="0xBuyer",
        buyer_budget=10.0,
        documents_ingested=True,
    )

    old_has_documents: Callable[[], bool] = rag_service.has_documents
    old_unrestricted = rag_service.run_unrestricted_query
    rag_service.has_documents = lambda: True  # type: ignore[assignment]
    rag_service.run_unrestricted_query = lambda question: {  # type: ignore[assignment]
        "answer": f"revealed::{question}",
        "sources": ["mock.txt"],
    }

    try:
        client = TestClient(app)
        denied = client.post(f"/api/deal/{room_id}/reveal", json={"query": "raw"})
        dr._deals[room_id].status = dr.DealStatus.ACCEPTED  # type: ignore[attr-defined]
        allowed = client.post(f"/api/deal/{room_id}/reveal", json={"query": "raw"})
    finally:
        rag_service.has_documents = old_has_documents  # type: ignore[assignment]
        rag_service.run_unrestricted_query = old_unrestricted  # type: ignore[assignment]

    passed = denied.status_code == 403 and allowed.status_code == 200
    return CheckResult(
        claim="M2 Conditional Disclosure Gating",
        passed=passed,
        details=f"Reveal status codes: denied={denied.status_code}, allowed={allowed.status_code}.",
    )


def run_m3_noisy_agent_controls() -> CheckResult:
    """Validate budget cap and threshold handling under simulated noise."""
    iterations = 100
    overpay_prevented_count = 0
    all_within_budget = True

    for _ in range(iterations):
        result = rag_service.apply_robustness_controls(
            base_price=12.0,
            seller_threshold=5.0,
            buyer_budget=10.0,
            simulate_error=True,
        )
        if result["overpayment_prevented"]:
            overpay_prevented_count += 1
        if result["suggested_price"] > 10.0:
            all_within_budget = False

    passed = all_within_budget and overpay_prevented_count > 0
    return CheckResult(
        claim="M3 Noisy-Agent Robustness",
        passed=passed,
        details=(
            f"Iterations={iterations}, all_within_budget={all_within_budget}, "
            f"overpayment_prevented_count={overpay_prevented_count}."
        ),
    )


def run_m4_signature_binding() -> CheckResult:
    """Validate response signature generation and verification."""
    payload = '{"demo":"payload"}'
    signed = tee_service.sign_data(payload)
    valid = tee_service.verify_data(payload, signed["signature"])
    invalid = tee_service.verify_data(payload + "tampered", signed["signature"])
    passed = valid and not invalid
    return CheckResult(
        claim="M4 Attestation-to-Response Signature Binding",
        passed=passed,
        details=f"valid={valid}, invalid_after_tamper={invalid}.",
    )


def run_m5_security_profile() -> CheckResult:
    """Validate presence of security profile metadata."""
    quote = tee_service.get_tdx_quote()
    health = tee_service.get_tee_health()
    passed = "security_profile" in quote and "security_profile" in health
    return CheckResult(
        claim="M5 Security Profile Scope",
        passed=passed,
        details=(
            f"quote_profile={quote.get('security_profile')}, "
            f"health_profile={health.get('security_profile')}."
        ),
    )


def write_report(results: List[CheckResult]) -> None:
    """Write markdown report to disk."""
    total = len(results)
    passed = len([result for result in results if result.passed])
    lines = [
        "# Evaluation Report",
        "",
        f"- Timestamp: {datetime.now(timezone.utc).isoformat()}",
        f"- Passed: {passed}/{total}",
        "",
        "## Results",
        "",
    ]
    for result in results:
        lines.append(f"### {result.claim}")
        lines.append(f"- Status: {'PASS' if result.passed else 'FAIL'}")
        lines.append(f"- Details: {result.details}")
        lines.append("")

    with open(REPORT_PATH, "w", encoding="utf-8") as file:
        file.write("\n".join(lines))


def main() -> Tuple[int, int]:
    """Run all claim checks and write report."""
    results = [
        run_m1_policy_gate(),
        run_m2_reveal_gating(),
        run_m3_noisy_agent_controls(),
        run_m4_signature_binding(),
        run_m5_security_profile(),
    ]
    write_report(results)
    passed = len([result for result in results if result.passed])
    return passed, len(results)


if __name__ == "__main__":
    passed_count, total_count = main()
    print(f"Evaluation complete: {passed_count}/{total_count} passed. Report -> {REPORT_PATH}")

