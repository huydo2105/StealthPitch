"""
StealthPitch — Response Policy Enforcer
=======================================
Deterministic guardrails for NDA-style output restrictions.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, List


@dataclass
class PolicyResult:
    """Result of a policy check on model output."""

    allowed: bool
    reason: str
    sanitized_text: str
    violations: List[str]


class PolicyGate:
    """Enforce hard output checks beyond prompt-level constraints."""

    _CODE_PATTERNS: tuple[re.Pattern[str], ...] = (
        re.compile(r"```"),
        re.compile(r"\bdef\s+\w+\("),
        re.compile(r"\bclass\s+\w+"),
        re.compile(r"\bfunction\s+\w+\("),
        re.compile(r"=>\s*\{"),
        re.compile(r"\bimport\s+[a-zA-Z0-9_.]+"),
    )

    _FORMULA_PATTERNS: tuple[re.Pattern[str], ...] = (
        re.compile(r"[∑∫√∞±]"),
        re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\s*=\s*[-+*/A-Za-z0-9_().]+"),
    )

    def __init__(self, max_quote_words: int = 5) -> None:
        """Initialize policy settings."""
        self.max_quote_words = max_quote_words

    def enforce(self, text: str) -> PolicyResult:
        """Evaluate text and return allow/block decision with sanitized output."""
        violations = self._collect_violations(text)
        if not violations:
            return PolicyResult(
                allowed=True,
                reason="allowed",
                sanitized_text=text,
                violations=[],
            )

        reason = violations[0]
        return PolicyResult(
            allowed=False,
            reason=reason,
            sanitized_text=f"[REDACTED: {reason}]",
            violations=violations,
        )

    def _collect_violations(self, text: str) -> List[str]:
        """Collect all rule violations for response text."""
        violations: List[str] = []

        if self._matches_any(text, self._CODE_PATTERNS):
            violations.append("POLICY_VIOLATION_CODE_DETECTED")
        if self._matches_any(text, self._FORMULA_PATTERNS):
            violations.append("POLICY_VIOLATION_FORMULA_DETECTED")
        if self._contains_long_quote(text):
            violations.append("POLICY_VIOLATION_LONG_QUOTE")

        return violations

    @staticmethod
    def _matches_any(text: str, patterns: Iterable[re.Pattern[str]]) -> bool:
        """Return True when any regex pattern matches text."""
        return any(pattern.search(text) is not None for pattern in patterns)

    def _contains_long_quote(self, text: str) -> bool:
        """Return True if quoted fragments exceed maximum allowed words."""
        quoted_fragments = re.findall(r"\"([^\"]+)\"|'([^']+)'", text)
        for pair in quoted_fragments:
            fragment = pair[0] or pair[1]
            if len(fragment.split()) > self.max_quote_words:
                return True
        return False

