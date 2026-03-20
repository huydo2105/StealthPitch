"""
StealthPitch - Deterministic Agent Reliability Checks
=====================================================
These checks are designed to be:
- deterministic (pure functions over inputs)
- cheap to run inside a TEE
- easy to bind into an attested/signed response payload
"""

from __future__ import annotations

import math
import re
from dataclasses import asdict, dataclass
from typing import Any, Dict, Iterable, List, Optional

from app.core.policy_enforcer import PolicyGate


@dataclass(frozen=True)
class ReliabilityCheck:
    """One deterministic check outcome."""

    check_id: str
    passed: bool
    details: str


def _num_variants(value: float) -> List[str]:
    """Generate common textual variants for a float (for leak detection)."""
    variants: List[str] = []
    for decimals in (0, 1, 2, 3):
        s = f"{value:.{decimals}f}"
        if decimals == 0:
            variants.append(s)
            continue
        # Add both "10.0" and "10" variants when value is an integer.
        if s.endswith(".0") or s.endswith(".00") or s.endswith(".000"):
            variants.append(s)
            variants.append(s.split(".", 1)[0])
        else:
            variants.append(s)

    # De-dupe while preserving order.
    seen: set[str] = set()
    out: List[str] = []
    for v in variants:
        if v not in seen:
            seen.add(v)
            out.append(v)
    return out


def _keyword_number_proximity(
    text: str,
    *,
    number: float,
    keywords: Iterable[str],
    window_chars: int = 48,
) -> bool:
    """Return True if any keyword appears near the sensitive numeric value."""
    lowered = text.lower()
    num_alts = _num_variants(number)

    # Word boundary around the number reduces false positives like "210" containing "10".
    num_pat = r"(?:%s)" % "|".join(re.escape(v) for v in num_alts)
    key_pat = r"(?:%s)" % "|".join(re.escape(k.lower()) for k in keywords)

    pattern = re.compile(
        rf"(\b{key_pat}\b.{{0,{window_chars}}}\b{num_pat}\b)|(\b{num_pat}\b.{{0,{window_chars}}}\b{key_pat}\b)",
        re.IGNORECASE | re.DOTALL,
    )
    return pattern.search(lowered) is not None


def evaluate_negotiation_reliability(
    *,
    mentions_agent: bool,
    buyer_text: str,
    seller_text: str,
    suggested_price: float,
    buyer_budget: float,
    seller_threshold: float,
    policy_gate: Optional[PolicyGate] = None,
    under_threshold_flag: Optional[bool] = None,
    overpayment_prevented_flag: Optional[bool] = None,
) -> Dict[str, Any]:
    """Run deterministic checks for a negotiation turn and return a structured report."""
    gate = policy_gate or PolicyGate(max_quote_words=5)
    checks: List[ReliabilityCheck] = []

    # 1) Price invariants.
    within_budget = suggested_price <= buyer_budget + 1e-9
    checks.append(
        ReliabilityCheck(
            check_id="price_within_budget",
            passed=within_budget,
            details=f"suggested_price={suggested_price} buyer_budget={buyer_budget}",
        )
    )

    non_negative = suggested_price >= -1e-9
    checks.append(
        ReliabilityCheck(
            check_id="price_non_negative",
            passed=non_negative,
            details=f"suggested_price={suggested_price}",
        )
    )

    # 2) Buyer agent must emit a parseable suggested price marker (when agent is used).
    if mentions_agent:
        match = re.search(r"SUGGESTED_PRICE:\s*([\d.]+)", buyer_text)
        ok = bool(match)
        parsed = None
        if match:
            try:
                parsed = float(match.group(1))
                ok = math.isfinite(parsed)
            except ValueError:
                ok = False
        checks.append(
            ReliabilityCheck(
                check_id="buyer_suggested_price_parseable",
                passed=ok,
                details=f"parsed={parsed!r}",
            )
        )
    else:
        checks.append(
            ReliabilityCheck(
                check_id="buyer_suggested_price_parseable",
                passed=True,
                details="skipped (agent not invoked)",
            )
        )

    # 3) Final outputs should be safe under PolicyGate.
    buyer_safe = gate.enforce(buyer_text).allowed
    seller_safe = gate.enforce(seller_text).allowed
    checks.append(
        ReliabilityCheck(
            check_id="buyer_policy_safe",
            passed=buyer_safe,
            details="PolicyGate.enforce(buyer_text).allowed must be True",
        )
    )
    checks.append(
        ReliabilityCheck(
            check_id="seller_policy_safe",
            passed=seller_safe,
            details="PolicyGate.enforce(seller_text).allowed must be True",
        )
    )

    # 4) Budget/threshold leak heuristics (only meaningful when agents are invoked).
    if mentions_agent:
        budget_keywords = ("budget", "cap", "limit", "maximum", "max")
        threshold_keywords = ("threshold", "minimum", "min", "acceptance")
        budget_leak = _keyword_number_proximity(buyer_text, number=buyer_budget, keywords=budget_keywords)
        threshold_leak = _keyword_number_proximity(seller_text, number=seller_threshold, keywords=threshold_keywords)
        checks.append(
            ReliabilityCheck(
                check_id="buyer_no_budget_leak",
                passed=not budget_leak,
                details="heuristic check: avoid stating budget/cap near its numeric value",
            )
        )
        checks.append(
            ReliabilityCheck(
                check_id="seller_no_threshold_leak",
                passed=not threshold_leak,
                details="heuristic check: avoid stating threshold/minimum near its numeric value",
            )
        )
    else:
        checks.append(
            ReliabilityCheck(
                check_id="buyer_no_budget_leak",
                passed=True,
                details="skipped (agent not invoked)",
            )
        )
        checks.append(
            ReliabilityCheck(
                check_id="seller_no_threshold_leak",
                passed=True,
                details="skipped (agent not invoked)",
            )
        )

    # 5) Consistency checks against robustness flags when provided.
    expected_under_threshold = suggested_price < seller_threshold
    if under_threshold_flag is not None:
        checks.append(
            ReliabilityCheck(
                check_id="under_threshold_flag_consistent",
                passed=bool(under_threshold_flag) == expected_under_threshold,
                details=f"flag={under_threshold_flag} expected={expected_under_threshold}",
            )
        )

    if overpayment_prevented_flag is not None:
        # Overpayment prevented is a pre-clamp signal; we still include it for attested auditability.
        checks.append(
            ReliabilityCheck(
                check_id="overpayment_flag_present",
                passed=True,
                details=f"flag={overpayment_prevented_flag} (informational)",
            )
        )

    passed_count = sum(1 for c in checks if c.passed)
    return {
        "version": "v1",
        "passed": passed_count == len(checks),
        "passed_count": passed_count,
        "total_count": len(checks),
        "checks": [asdict(c) for c in checks],
        "inputs": {
            "mentions_agent": mentions_agent,
            "suggested_price": suggested_price,
            "buyer_budget": buyer_budget,
            "seller_threshold": seller_threshold,
        },
    }
