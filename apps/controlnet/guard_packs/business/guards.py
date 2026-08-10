"""
Business Guardrails Implementation

Guards:
1. competitor_protection: T0 regex-based competitor-name detection
2. brand_tone: T1 regex phrase-matching + embedding-based tone detection
"""

import asyncio
import logging
import re
from typing import List, Literal, Optional

import numpy as np

from cga_core import guard, Violation, Ctx, Either, Right_, Left_, Guard

logger = logging.getLogger(__name__)


def _extract_text(ctx: Ctx) -> str:
    """Extract text from context (works for both input and output phases)."""
    text = ctx.get("output", "")

    if not text and "messages" in ctx:
        messages = ctx.get("messages", [])
        if isinstance(messages, list) and messages:
            last_msg = messages[-1]
            text = last_msg.get("content", "") if isinstance(last_msg, dict) else str(last_msg)

    return text if isinstance(text, str) else ""


# ============================================================================
# COMPETITOR PROTECTION (T0)
# ============================================================================


@guard("business.competitor_protection", tier="T0", description="Detects mentions of named competitors", performance_budget_ms=10.0)
def competitor_protection(
    competitors: List[str],
    restricted_topics: Optional[List[str]] = None,
    severity: Literal["low", "med", "high", "critical"] = "low"
) -> Guard:
    """
    Detects mentions of named competitor brands.

    If restricted_topics is set, a competitor mention only violates when it
    co-occurs with one of those topic terms in the same text (e.g. flag
    "OldCorp" only when discussed alongside "pricing" or "features", not an
    incidental mention). If restricted_topics is empty/None, any mention of
    a listed competitor is a violation.

    Args:
        competitors: Competitor names to detect (case-insensitive, word-boundary match).
        restricted_topics: If set, only flag competitor mentions that co-occur
            with one of these terms. If empty/None, flag any mention.
        severity: Severity level for violations.

    Returns:
        Guard that detects competitor mentions.
    """
    if not competitors:
        raise ValueError("competitor_protection requires at least one competitor name")

    competitor_patterns = {
        name: re.compile(r"\b" + re.escape(name) + r"\b", re.IGNORECASE)
        for name in competitors
    }
    topic_patterns = [
        re.compile(r"\b" + re.escape(topic) + r"\b", re.IGNORECASE)
        for topic in (restricted_topics or [])
    ]

    async def run(ctx: Ctx) -> Either:
        text = _extract_text(ctx)
        if not text.strip():
            return Right_(ctx)

        matched_competitors = [name for name, pattern in competitor_patterns.items() if pattern.search(text)]
        if not matched_competitors:
            return Right_(ctx)

        if topic_patterns:
            matched_topics = [
                topic for topic, pattern in zip(restricted_topics, topic_patterns)
                if pattern.search(text)
            ]
            if not matched_topics:
                # Competitor named, but not in a restricted context - allow.
                return Right_(ctx)
        else:
            matched_topics = []

        score = min(0.5 + 0.15 * len(matched_competitors) + 0.1 * len(matched_topics), 1.0)

        return Left_([Violation(
            rule_id="business.competitor_protection",
            severity=severity,
            message=f"Competitor mention detected: {', '.join(matched_competitors)}",
            score=score,
            evidence={
                "matched_competitors": matched_competitors,
                "matched_topics": matched_topics,
                "restricted_topics": restricted_topics or [],
            }
        )])

    return run


# ============================================================================
# BRAND TONE (T0)
# ============================================================================


# ----------------------------------------------------------------------
# Semantic tone detection
#
# Regex can only catch phrases someone thought to list in advance. This
# uses the same embedding model already shipped for the LanceDB risk
# router (all-MiniLM-L6-v2, see cga_core/embedding_store.py) to judge
# whether a response's overall register reads as casual/dismissive even
# when it contains none of the listed unprofessional_patterns - e.g.
# "sure, whatever you say" trips this, no banned word required.
#
# Method: embed a small fixed set of clearly-professional and
# clearly-casual reference sentences, take each set's mean vector as its
# centroid, and compare a candidate response's embedding to both via
# cosine similarity. If it sits closer to the casual centroid than the
# professional one by more than TONE_MARGIN, and its casual-similarity
# clears TONE_MIN_CONFIDENCE (to avoid firing on short/ambiguous text
# with a low signal either way), flag it. These two constants were tuned
# empirically against held-out professional/casual/neutral sentences not
# in the reference set below; see tests/unit/test_new_guardrails.py.
#
# Only required_tone="professional" is backed by real reference data
# today. Other values are accepted (so policies configuring them don't
# break) but only the phrase-pattern check applies for them - there is no
# "casual-required" or "friendly-required" reference set yet.
# ----------------------------------------------------------------------

PROFESSIONAL_TONE_EXAMPLES = [
    "Thank you for reaching out. I would be happy to help you resolve this issue.",
    "I appreciate your patience while we look into this matter.",
    "Could you please provide additional details so we can assist you further?",
    "We apologize for the inconvenience and are working to resolve it promptly.",
    "Please let us know if you have any further questions or concerns.",
    "I understand your frustration, and I want to make this right.",
    "Our team will follow up with you within one business day.",
    "I recommend reviewing the documentation for further guidance.",
]

CASUAL_TONE_EXAMPLES = [
    "yeah idk, just figure it out",
    "lol that is not my problem",
    "ugh whatever, ask someone else",
    "nah that is not gonna happen",
    "meh, good luck with that",
    "chill out, it is not a big deal",
    "dunno man, just google it",
    "that is kinda dumb tbh",
]

TONE_MARGIN = 0.06
TONE_MIN_CONFIDENCE = 0.10

_tone_model = None
_tone_centroids = None


def _load_tone_model():
    """Lazily load and cache the shared embedding model (module-level singleton)."""
    global _tone_model, _tone_centroids
    if _tone_model is not None:
        return _tone_model, _tone_centroids

    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer("all-MiniLM-L6-v2")

    def _centroid(examples: List[str]) -> np.ndarray:
        embeddings = model.encode(examples, normalize_embeddings=True)
        centroid = embeddings.mean(axis=0)
        norm = np.linalg.norm(centroid)
        return centroid / norm if norm > 0 else centroid

    centroids = {
        "professional": _centroid(PROFESSIONAL_TONE_EXAMPLES),
        "casual": _centroid(CASUAL_TONE_EXAMPLES),
    }

    _tone_model, _tone_centroids = model, centroids
    return _tone_model, _tone_centroids


def _score_tone(text: str) -> Optional[dict]:
    """Blocking embedding + similarity computation - always call via asyncio.to_thread."""
    model, centroids = _load_tone_model()
    vector = model.encode([text], normalize_embeddings=True)[0]
    sim_professional = float(np.dot(vector, centroids["professional"]))
    sim_casual = float(np.dot(vector, centroids["casual"]))
    return {"sim_professional": sim_professional, "sim_casual": sim_casual}


@guard("business.brand_tone", tier="T1", description="Detects unprofessional language via phrase patterns and semantic tone", performance_budget_ms=100.0)
def brand_tone(
    unprofessional_patterns: List[str],
    required_tone: str = "professional",
    severity: Literal["low", "med", "high", "critical"] = "low"
) -> Guard:
    """
    Detects unprofessional language two ways: exact phrase patterns you
    configure, and (when required_tone="professional") a semantic check
    against reference professional/casual sentences using sentence
    embeddings - see the module-level comment above for the method.

    The pattern check catches anything you explicitly listed. The tone
    check catches casual/dismissive register you didn't think to list, at
    the cost of being probabilistic rather than exact. Fail-open: if the
    embedding model can't be loaded (e.g. no network on first run, no
    cached weights), the tone check is skipped and only pattern matches
    are enforced - it never blocks the request as a side effect of its
    own failure.

    Args:
        unprofessional_patterns: Regex patterns to block (case-insensitive).
        required_tone: Only "professional" currently drives semantic
            detection. Other values are recorded but not enforced.
        severity: Severity level for violations.

    Returns:
        Guard that detects unprofessional language by pattern and/or tone.
    """
    compiled_patterns = [re.compile(pattern, re.IGNORECASE) for pattern in unprofessional_patterns]

    async def run(ctx: Ctx) -> Either:
        text = _extract_text(ctx)
        if not text.strip():
            return Right_(ctx)

        matches = []
        for pattern in compiled_patterns:
            found = pattern.findall(text)
            if found:
                matches.append(pattern.pattern)

        if matches:
            score = min(0.5 + 0.15 * len(matches), 1.0)
            return Left_([Violation(
                rule_id="business.brand_tone",
                severity=severity,
                message=f"Unprofessional language detected ({len(matches)} pattern(s) matched)",
                score=score,
                evidence={
                    "detection_method": "pattern",
                    "matched_patterns": matches,
                    "required_tone": required_tone,
                }
            )])

        if required_tone != "professional":
            return Right_(ctx)

        try:
            tone = await asyncio.to_thread(_score_tone, text)
        except Exception as e:
            logger.warning(f"business.brand_tone: tone model unavailable, skipping semantic check: {e}")
            return Right_(ctx)

        diff = tone["sim_casual"] - tone["sim_professional"]
        if diff > TONE_MARGIN and tone["sim_casual"] > TONE_MIN_CONFIDENCE:
            score = min(0.5 + diff, 1.0)
            return Left_([Violation(
                rule_id="business.brand_tone",
                severity=severity,
                message="Response tone reads as casual/dismissive rather than professional",
                score=score,
                evidence={
                    "detection_method": "semantic_tone",
                    "required_tone": required_tone,
                    "similarity_professional": round(tone["sim_professional"], 3),
                    "similarity_casual": round(tone["sim_casual"], 3),
                }
            )])

        return Right_(ctx)

    return run
