"""
Default Guardrails Implementation

Core production-ready guardrails for AI safety and content moderation.
All guards follow CGA architecture with functional programming principles.

Guards:
1. profanity_detect: T0 regex-based profanity detection
2. jailbreak_detect: T1 pattern-based jailbreak/prompt injection detection
3. toxicity_detect: T1 pattern-based toxicity detection
4. harmful_instructions_detect: T0 actionable wrongdoing detection
5. pii_detect: T0 regex-based PII detection with anonymization
"""

import re
from typing import List, Literal, Optional, Dict, Any

from cga_core import guard, Violation, Ctx, Either, Right_, Left_, Guard


# ============================================================================
# PROFANITY DETECTION (T0)
# ============================================================================

# Profanity patterns by severity level
PROFANITY_PATTERNS = {
    "mild": [
        r"\b(?:damn|hell|crap|darn|heck)\b",
    ],
    "moderate": [
        r"\b(?:shit|bitch|ass|bastard|piss|dick|cock)\b",
        r"\b(?:asshole|bullshit|dumbass|jackass)\b",
    ],
    "severe": [
        r"\b(?:fuck|fucking|fucked|fucker|motherfucker)\b",
        r"\b(?:cunt|pussy|whore|slut)\b",
    ],
}


@guard("profanity.detect", tier="T0", description="Detects profane and offensive language", performance_budget_ms=3.0)
def profanity_detect(
    threshold: float = 1.0,
    severity: Literal["low", "med", "high", "critical"] = "high",
    categories: Optional[List[str]] = None
) -> Guard:
    """
    Detects profane and offensive language using regex patterns.
    
    This guard categorizes profanity into mild, moderate, and severe levels
    and triggers violations based on configurable thresholds.
    
    Args:
        threshold: Minimum number of profane words to trigger violation (default: 1.0)
        severity: Severity level for violations (low/med/high/critical)
        categories: List of profanity categories to check (mild/moderate/severe).
                   If None, checks all categories.
    
    Returns:
        Guard that detects profanity and returns violations if found
        
    Example:
        >>> guard = profanity_detect(threshold=1.0, severity="high")
        >>> # Will detect any profane word and return a violation
    """
    # Validate threshold
    if threshold < 1.0:
        raise ValueError(f"Invalid threshold={threshold}. Must be >= 1.0")
    
    # Handle string input (convert to list)
    if isinstance(categories, str):
        categories = [categories]
    
    # Default to checking all categories
    if categories is None:
        categories = ["mild", "moderate", "severe"]
    
    # Compile patterns for requested categories
    compiled_patterns = {}
    for category in categories:
        if category in PROFANITY_PATTERNS:
            compiled_patterns[category] = [
                re.compile(pattern, re.IGNORECASE) 
                for pattern in PROFANITY_PATTERNS[category]
            ]
    
    async def run(ctx: Ctx) -> Either:
        """Run profanity detection on context."""
        # Extract text from context (works for both input and output phases)
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                last_msg = messages[-1]
                text = last_msg.get("content", "") if isinstance(last_msg, dict) else str(last_msg)
        
        if not isinstance(text, str) or not text.strip():
            return Right_(ctx)
        
        # Detect profanity by category
        violations = []
        detected_by_category = {}
        total_matches = 0
        
        for category, patterns in compiled_patterns.items():
            matches = []
            for pattern in patterns:
                found = pattern.findall(text)
                if found:
                    matches.extend(found)
            
            if matches:
                detected_by_category[category] = {
                    "count": len(matches),
                    "words": list(set(matches))  # Unique words only
                }
                total_matches += len(matches)
        
        # Check if threshold is met
        if total_matches >= threshold:
            # Calculate score based on severity and count
            category_weights = {"mild": 0.3, "moderate": 0.6, "severe": 1.0}
            max_weight = max(
                category_weights.get(cat, 0.5) 
                for cat in detected_by_category.keys()
            )
            score = min(max_weight * (total_matches / threshold), 1.0)
            
            violations.append(Violation(
                rule_id="profanity.detect",
                severity=severity,
                message=f"Profanity detected: {total_matches} instances across {len(detected_by_category)} categories",
                score=score,
                evidence={
                    "total_matches": total_matches,
                    "detected_by_category": detected_by_category,
                    "threshold": threshold,
                    "text_length": len(text)
                }
            ))
        
        return Left_(violations) if violations else Right_(ctx)
    
    return run


# ============================================================================
# JAILBREAK DETECTION (T1)
# ============================================================================

# Jailbreak/prompt injection patterns
JAILBREAK_PATTERNS = [
    # Instruction override attempts
    r"(?i)ignore\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?|prompts?|commands?)",
    r"(?i)disregard\s+(?:all\s+)?(?:previous|prior|above|earlier)\s+(?:instructions?|rules?|prompts?)",
    r"(?i)forget\s+(?:all\s+)?(?:previous|prior|earlier)\s+(?:instructions?|rules?|everything)",
    r"(?i)ignore\s+(?:the\s+)?(?:above|previous)\s+(?:and|then)",
    
    # Role-playing attacks
    r"(?i)you\s+are\s+(?:now\s+)?(?:in\s+)?(?:a\s+)?(?:developer|admin|god|root|sudo|unrestricted|DAN)\s+mode",
    r"(?i)act\s+as\s+(?:if\s+you\s+are\s+)?(?:a\s+)?(?:DAN|evil|jailbreak|unrestricted|unfiltered)",
    r"(?i)pretend\s+(?:you\s+are|to\s+be)\s+(?:a\s+)?(?:DAN|evil|unfiltered|unrestricted|without\s+(?:rules|limits))",
    r"(?i)roleplay\s+as\s+(?:a\s+)?(?:evil|harmful|unrestricted|without.*(?:rules|limits|restrictions))",
    
    # System override attempts
    r"(?i)new\s+instructions?\s+(?:override|replace|supersede|take\s+priority)",
    r"(?i)system\s+(?:override|bypass|disable)\s+(?:safety|rules?|restrictions?|filters?)",
    r"(?i)enable\s+(?:developer|admin|god|debug)\s+mode",
    r"(?i)activate\s+(?:developer|admin|god|debug)\s+mode",
    
    # Context manipulation
    r"(?i)from\s+now\s+on,?\s+you\s+(?:will|must|should)\s+(?:not\s+)?(?:follow|obey|ignore)",
    r"(?i)you\s+must\s+(?:not\s+)?(?:follow|obey|comply\s+with)\s+(?:any\s+)?(?:previous|earlier)",
]


@guard("jailbreak.detect", tier="T1", description="Detects prompt injection and jailbreak attempts", performance_budget_ms=20.0)
def jailbreak_detect(
    threshold: float = 0.6,
    severity: Literal["low", "med", "high", "critical"] = "critical"
) -> Guard:
    """
    Detects jailbreak and prompt injection attempts.
    
    This guard identifies attempts to circumvent AI safety measures through
    prompt manipulation, role-playing attacks, and instruction override attempts.
    
    Args:
        threshold: Detection threshold (0.0-1.0). Lower values are more sensitive.
        severity: Severity level for violations (typically critical)
    
    Returns:
        Guard that detects jailbreak attempts
        
    Example:
        >>> guard = jailbreak_detect(threshold=0.6, severity="critical")
        >>> # Will detect "ignore all previous instructions" type prompts
    """
    # Validate threshold
    if not 0.0 <= threshold <= 1.0:
        raise ValueError(f"Invalid threshold={threshold}. Must be between 0.0 and 1.0")
    
    # Compile all patterns
    compiled_patterns = [re.compile(pattern) for pattern in JAILBREAK_PATTERNS]
    
    async def run(ctx: Ctx) -> Either:
        """Run jailbreak detection on context."""
        # Extract text
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                last_msg = messages[-1]
                text = last_msg.get("content", "") if isinstance(last_msg, dict) else str(last_msg)
        
        if not isinstance(text, str) or not text.strip():
            return Right_(ctx)
        
        # Count pattern matches
        pattern_matches = sum(1 for pattern in compiled_patterns if pattern.search(text))
        
        # Every pattern is deliberately narrow (explicit instruction
        # override, safety bypass, DAN/developer-mode activation, etc.). A
        # single clear match must cross the default 0.6 threshold; requiring
        # three different attack phrases allowed common one-line jailbreaks
        # to pass. Additional matches increase confidence without changing the
        # fail-closed decision.
        score = (
            min(0.65 + ((pattern_matches - 1) * 0.15), 1.0)
            if pattern_matches
            else 0.0
        )
        
        if score >= threshold:
            violations = [Violation(
                rule_id="jailbreak.detect",
                severity=severity,
                message=f"Jailbreak/prompt injection attempt detected (confidence: {score:.2f})",
                score=score,
                evidence={
                    "pattern_matches": pattern_matches,
                    "threshold": threshold,
                    "text_preview": text[:200] + "..." if len(text) > 200 else text
                }
            )]
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# ============================================================================
# TOXICITY DETECTION (T1)
# ============================================================================

# Toxicity patterns by category
TOXICITY_PATTERNS = {
    "harassment": [
        r"(?i)\b(?:kill\s+yourself|kys|hang\s+yourself|jump\s+off|end\s+yourself)\b",
        r"(?i)\b(?:you\s+should\s+die|you\s+deserve\s+to\s+die|hope\s+you\s+die)\b",
        r"(?i)\b(?:stupid|idiot|moron|retard|dumbass|imbecile|pathetic)\b",
        r"(?i)\b(?:worthless|useless|waste\s+of\s+space|piece\s+of\s+(?:shit|crap))\b",
    ],
    "hate_speech": [
        r"(?i)\b(?:nigger|nigga|chink|gook|wetback|spic|kike|heeb|raghead)\b",
        r"(?i)\b(?:faggot|dyke|tranny|shemale|homo|fag)\b",
    ],
    "threats": [
        r"(?i)\b(?:i\s+will\s+kill|i'll\s+kill|i\s+will\s+murder|i'll\s+murder)\b",
        r"(?i)\b(?:i\s+will\s+hurt|i'll\s+hurt|i\s+will\s+beat|i'll\s+beat)\b",
        r"(?i)\b(?:i'm\s+going\s+to\s+(?:kill|hurt|destroy|harm))\b",
        r"(?i)\b(?:watch\s+out|you're\s+dead|you're\s+gonna\s+(?:die|regret))\b",
    ],
    "abuse": [
        r"(?i)\b(?:rape|rapist|molest)\b",
        r"(?i)\b(?:whore|slut|prostitute|hooker)\b",
        r"(?i)\b(?:sexual\s+(?:predator|abuse|harassment|assault))\b",
    ],
}


@guard("toxicity.detect", tier="T1", description="Detects toxic, harmful, and abusive content", performance_budget_ms=10.0)
def toxicity_detect(
    threshold: float = 0.5,
    severity: Literal["low", "med", "high", "critical"] = "high",
    categories: Optional[List[str]] = None
) -> Guard:
    """
    Detects toxic, harmful, and abusive content.
    
    This guard identifies various forms of toxic content including harassment,
    hate speech, threats, and abuse. Each category can be weighted differently.
    
    Args:
        threshold: Score threshold for violations (0.0-1.0)
        severity: Severity level for violations
        categories: List of toxicity categories to check (harassment/hate_speech/threats/abuse).
                   If None, checks all categories.
    
    Returns:
        Guard that detects toxic content
        
    Example:
        >>> guard = toxicity_detect(threshold=0.5, categories=["harassment", "threats"])
        >>> # Will detect harassment and threats only
    """
    # Validate threshold
    if not 0.0 <= threshold <= 1.0:
        raise ValueError(f"Invalid threshold={threshold}. Must be between 0.0 and 1.0")
    
    # Handle string input (convert to list)
    if isinstance(categories, str):
        categories = [categories]
    
    # Default to all categories
    if categories is None:
        categories = ["harassment", "hate_speech", "threats", "abuse"]
    
    # Compile patterns for requested categories
    compiled_patterns = {}
    for category in categories:
        if category in TOXICITY_PATTERNS:
            compiled_patterns[category] = [
                re.compile(pattern) for pattern in TOXICITY_PATTERNS[category]
            ]
    
    # Category weights (severity of toxicity type)
    category_weights = {
        "harassment": 0.6,
        "hate_speech": 0.9,
        "threats": 0.95,
        "abuse": 0.85,
    }
    
    async def run(ctx: Ctx) -> Either:
        """Run toxicity detection on context."""
        # Extract text
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                last_msg = messages[-1]
                text = last_msg.get("content", "") if isinstance(last_msg, dict) else str(last_msg)
        
        if not isinstance(text, str) or not text.strip():
            return Right_(ctx)
        
        # Detect toxicity by category
        detected_categories = []
        total_score = 0.0
        
        for category, patterns in compiled_patterns.items():
            matches = 0
            for pattern in patterns:
                matches += len(pattern.findall(text))
            
            if matches > 0:
                # Calculate category score
                weight = category_weights.get(category, 0.5)
                category_score = min(matches * weight, 1.0)
                total_score += category_score
                
                detected_categories.append({
                    "category": category,
                    "matches": matches,
                    "score": category_score,
                    "weight": weight
                })
        
        # Normalize total score
        total_score = min(total_score, 1.0)
        
        if total_score >= threshold:
            violations = [Violation(
                rule_id="toxicity.detect",
                severity=severity,
                message=f"Toxic content detected (score: {total_score:.2f})",
                score=total_score,
                evidence={
                    "total_score": total_score,
                    "threshold": threshold,
                    "detected_categories": detected_categories,
                    "num_categories": len(detected_categories)
                }
            )]
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# ============================================================================
# HARMFUL / CRIMINAL INSTRUCTIONS DETECTION (T0)
# ============================================================================

# Require both an instruction-seeking phrase and a concrete harmful act. This
# blocks actionable requests while allowing high-level news, history, safety,
# prevention, and clearly non-instructional fictional discussion.
HARMFUL_INSTRUCTION_REQUEST_PATTERNS = [
    re.compile(
        r"\b(?:how\s+to|how\s+(?:do|can|would|should)\s+(?:i|we|you)|"
        r"give\s+me\s+(?:the\s+)?(?:steps|instructions|plan)|"
        r"(?:step[- ]by[- ]step|detailed)\s+(?:guide|instructions|plan)|"
        r"(?:best|easiest|fastest|safest)\s+way\s+to|"
        r"help\s+me\s+(?:to\s+)?|"
        r"(?:teach|show|tell)\s+me\s+how\s+to)\b",
        re.IGNORECASE,
    ),
]

# The act phrases allow up to a few filler words between the verb and its
# object — e.g. "steal SOMEONE ELSE money", "hack ANY COMPANY website" — because
# rigid adjacency (`steal money`, `hack a website`) was trivially bypassed by
# inserting qualifiers, synonyms, or typos. The separate request-phrase
# requirement below keeps this from over-firing on benign text.
_GAP = r"(?:\w+\s+){0,4}"  # up to 4 filler words between verb and target

HARMFUL_ACT_PATTERNS = {
    "violent_crime": [
        re.compile(
            r"\b(?:kill|murder|assassinate|kidnap|abduct|poison|strangle|"
            r"seriously\s+(?:hurt|injure)|(?:physically\s+)?attack)\b",
            re.IGNORECASE,
        ),
    ],
    "theft_and_burglary": [
        re.compile(
            rf"\brob(?:bing)?\s+{_GAP}"
            r"(?:bank|store|shop|house|home|person|people|someone|business|company)\b",
            re.IGNORECASE,
        ),
        re.compile(
            r"\b(?:bank\s+robbery|burglar(?:y|ize)|break\s+(?:in|into)|shoplift)\b",
            re.IGNORECASE,
        ),
        re.compile(
            rf"\bsteal(?:ing)?\s+{_GAP}"
            r"(?:money|cash|funds|credentials|car|wallet|goods|property|jewel)",
            re.IGNORECASE,
        ),
    ],
    "fraud_and_cybercrime": [
        re.compile(
            r"\b(?:commit(?:ting)?\s+fraud|launder(?:ing)?\s+money|phish(?:ing)?|"
            rf"scam(?:ming)?\s+{_GAP}(?:people|customers|users|someone|victims)|"
            rf"bypass(?:ing)?\s+{_GAP}"
            r"(?:authentication|security|login|2fa|mfa|password|firewall|paywall))\b",
            re.IGNORECASE,
        ),
        re.compile(
            rf"\bhack(?:ing)?\s+(?:in(?:to)?\s+)?{_GAP}"
            r"(?:account|bank|server|website|site|network|system|database|db|"
            r"app|portal|email|wi[- ]?fi|phone|computer|device|api|cloud)\b",
            re.IGNORECASE,
        ),
        re.compile(
            rf"\bsteal(?:ing)?\s+{_GAP}"
            r"(?:password|credit\s+card|identit(?:y|ies)|data|"
            r"personal\s+info|account)",
            re.IGNORECASE,
        ),
    ],
    "weapons_and_explosives": [
        re.compile(
            rf"\b(?:make|build|assemble|hide|detonate|manufacture|create)\s+{_GAP}"
            r"(?:bomb|explosive|weapon|gun|firearm|grenade|poison|malware|"
            r"ransomware|virus)\b",
            re.IGNORECASE,
        ),
    ],
}


@guard(
    "harmful_instructions.detect",
    tier="T0",
    description="Blocks requests for actionable criminal or harmful instructions",
    performance_budget_ms=5.0,
)
def harmful_instructions_detect(
    threshold: float = 0.75,
    severity: Literal["low", "med", "high", "critical"] = "high",
    categories: Optional[List[str]] = None,
) -> Guard:
    """Detect requests for operational instructions enabling serious wrongdoing."""
    if not 0.0 <= threshold <= 1.0:
        raise ValueError(
            f"Invalid threshold={threshold}. Must be between 0.0 and 1.0"
        )

    if isinstance(categories, str):
        categories = [categories]
    selected_categories = categories or list(HARMFUL_ACT_PATTERNS.keys())
    compiled_categories = {
        category: HARMFUL_ACT_PATTERNS[category]
        for category in selected_categories
        if category in HARMFUL_ACT_PATTERNS
    }

    async def run(ctx: Ctx) -> Either:
        text = ctx.get("output", "")
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                last_msg = messages[-1]
                text = (
                    last_msg.get("content", "")
                    if isinstance(last_msg, dict)
                    else str(last_msg)
                )

        if not isinstance(text, str) or not text.strip():
            return Right_(ctx)

        asks_for_instructions = any(
            pattern.search(text)
            for pattern in HARMFUL_INSTRUCTION_REQUEST_PATTERNS
        )
        detected_categories = [
            category
            for category, patterns in compiled_categories.items()
            if any(pattern.search(text) for pattern in patterns)
        ]

        # An explicit instruction request plus a concrete harmful act is a
        # high-confidence match. Multiple categories raise confidence further.
        score = (
            min(0.92 + (0.04 * (len(detected_categories) - 1)), 1.0)
            if asks_for_instructions and detected_categories
            else 0.0
        )

        if score >= threshold:
            return Left_(
                [
                    Violation(
                        rule_id="harmful_instructions.detect",
                        severity=severity,
                        message=(
                            "Request for actionable criminal or harmful "
                            "instructions detected"
                        ),
                        score=score,
                        evidence={
                            "detected_categories": detected_categories,
                            "instruction_request": True,
                            "threshold": threshold,
                            "text_preview": (
                                text[:200] + "..." if len(text) > 200 else text
                            ),
                        },
                    )
                ]
            )

        return Right_(ctx)

    return run


# ============================================================================
# PII DETECTION (T0)
# ============================================================================

# PII regex patterns (following OpenAI guardrails-js reference)
PII_PATTERNS = {
    # Contact Information
    "EMAIL": re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b", re.IGNORECASE),
    "PHONE": re.compile(r"(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})"),
    
    # Financial Information
    "CREDIT_CARD": re.compile(r"\b(?:\d{4}[-\s]?){3}\d{4}\b"),
    "BANK_ACCOUNT": re.compile(r"\b\d{8,17}\b"),
    
    # Government IDs
    "SSN": re.compile(r"\b\d{3}-\d{2}-\d{4}\b"),
    "PASSPORT": re.compile(r"\b[A-Z]{1,2}\d{6,9}\b"),
    "DRIVERS_LICENSE": re.compile(r"\b[A-Z]\d{7,8}\b"),
    
    # Technical Identifiers
    "IP_ADDRESS": re.compile(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b"),
    "API_KEY": re.compile(r"\b[Aa][Pp][Ii][-_]?[Kk][Ee][Yy][-_:=\s]*[A-Za-z0-9+/]{20,}\b"),
    "JWT": re.compile(r"\beyJ[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]*\b"),
}

# Entity metadata for UI
PII_ENTITY_INFO = {
    "EMAIL": {"name": "Email Address", "category": "Contact", "risk": "Medium"},
    "PHONE": {"name": "Phone Number", "category": "Contact", "risk": "Medium"},
    "CREDIT_CARD": {"name": "Credit Card", "category": "Financial", "risk": "High"},
    "BANK_ACCOUNT": {"name": "Bank Account", "category": "Financial", "risk": "High"},
    "SSN": {"name": "Social Security Number", "category": "Government ID", "risk": "High"},
    "PASSPORT": {"name": "Passport Number", "category": "Government ID", "risk": "High"},
    "DRIVERS_LICENSE": {"name": "Driver's License", "category": "Government ID", "risk": "High"},
    "IP_ADDRESS": {"name": "IP Address", "category": "Technical", "risk": "Low"},
    "API_KEY": {"name": "API Key", "category": "Credentials", "risk": "High"},
    "JWT": {"name": "JWT Token", "category": "Credentials", "risk": "High"},
}


@guard("pii.detect", tier="T0", description="Detects and anonymizes Personal Identifiable Information", performance_budget_ms=5.0)
def pii_detect(
    types: Optional[List[str]] = None,
    threshold: float = 1.0,
    anonymize_mode: Literal["mask", "remove"] = "mask",
    severity: Literal["low", "med", "high", "critical"] = "high"
) -> Guard:
    """
    Detects Personal Identifiable Information (PII) and provides anonymized version.
    
    This guard detects various types of PII using regex patterns and returns
    violations with anonymized text that can be used programmatically.
    
    Supported PII types:
    - Contact: EMAIL, PHONE
    - Financial: CREDIT_CARD, BANK_ACCOUNT
    - Government: SSN, PASSPORT, DRIVERS_LICENSE
    - Technical: IP_ADDRESS, API_KEY, JWT
    
    Args:
        types: List of PII types to detect. If None, detects all types.
        threshold: Minimum number of PII instances to trigger violation (default: 1.0)
        anonymize_mode: How to anonymize PII - "mask" replaces with [TYPE], "remove" removes entirely
        severity: Severity level for violations
    
    Returns:
        Guard that detects PII and returns violations with anonymized text
        
    Example:
        >>> guard = pii_detect(types=["EMAIL", "PHONE"], anonymize_mode="mask")
        >>> # Will detect emails and phones, replacing them with [EMAIL] and [PHONE]
    """
    # Validate threshold
    if threshold < 1.0:
        raise ValueError(f"Invalid threshold={threshold}. Must be >= 1.0")
    
    # Handle string input (convert to list)
    if isinstance(types, str):
        types = [types]
    
    # Default to all PII types
    if types is None:
        types = list(PII_PATTERNS.keys())
    
    # Validate requested types
    invalid_types = [t for t in types if t not in PII_PATTERNS]
    if invalid_types:
        raise ValueError(f"Invalid PII types: {invalid_types}. Valid types: {list(PII_PATTERNS.keys())}")
    
    async def run(ctx: Ctx) -> Either:
        """Run PII detection on context."""
        # Extract text
        text = ctx.get("output", "")
        
        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                last_msg = messages[-1]
                text = last_msg.get("content", "") if isinstance(last_msg, dict) else str(last_msg)
        
        if not isinstance(text, str) or not text.strip():
            return Right_(ctx)
        
        # Detect PII
        detected_types = []
        total_matches = 0
        anonymized_text = text
        all_spans = []
        
        for pii_type in types:
            if pii_type not in PII_PATTERNS:
                continue
            
            pattern = PII_PATTERNS[pii_type]
            matches = list(pattern.finditer(text))
            
            if len(matches) > 0:
                detected_types.append(pii_type)
                total_matches += len(matches)
                
                # Store spans for evidence
                for match in matches:
                    all_spans.append({
                        "start": match.start(),
                        "end": match.end(),
                        # Never copy the detected secret into violation
                        # evidence or observability logs. Positions and type
                        # are sufficient for audit/reproduction.
                        "replacement": f"[{pii_type}]",
                        "type": pii_type
                    })
        
        # Anonymize if PII detected and threshold met
        if total_matches >= threshold:
            # Apply anonymization (process from end to start to preserve positions)
            for span in sorted(all_spans, key=lambda s: s["start"], reverse=True):
                if anonymize_mode == "mask":
                    replacement = f"[{span['type']}]"
                else:  # remove
                    replacement = ""
                
                anonymized_text = (
                    anonymized_text[:span["start"]] + 
                    replacement + 
                    anonymized_text[span["end"]:]
                )
            
            # Get entity info for detected types
            entity_info = {
                pii_type: PII_ENTITY_INFO.get(pii_type, {})
                for pii_type in detected_types
            }
            
            # Calculate score
            score = min(total_matches / 10.0, 1.0)
            
            violations = [Violation(
                rule_id="pii.detect",
                severity=severity,
                message=f"PII detected: {', '.join(detected_types)} ({total_matches} total instances)",
                score=score,
                span={"matches": all_spans},
                evidence={
                    "detected_types": detected_types,
                    "total_matches": total_matches,
                    "anonymized_text": anonymized_text,
                    "anonymize_mode": anonymize_mode,
                    "entity_info": entity_info,
                    "original_text_length": len(text),
                    "anonymized_text_length": len(anonymized_text),
                    "threshold": threshold
                }
            )]
            return Left_(violations)

        return Right_(ctx)

    return run


# ============================================================================
# PII REDACTION (T0)
# ============================================================================


@guard("pii.redact", tier="T0", description="Silently redacts Personal Identifiable Information without blocking", performance_budget_ms=5.0)
def pii_redact(
    types: Optional[List[str]] = None,
    mode: Literal["mask", "remove"] = "mask"
) -> Guard:
    """
    Redacts Personal Identifiable Information (PII) in place.

    Unlike pii.detect, this guard never blocks the request: it rewrites
    ctx["output"] with PII replaced and always returns Right_. It exists for
    policies that want to scrub PII from a response rather than reject it.

    On /v1/guard/check the redacted text comes back in the response body for
    the caller to use. On /v1/chat/completions (non-streaming) the gateway
    substitutes it into the returned message content before responding to
    the caller. Streaming responses are not redacted — chunks are already
    sent to the client by the time later PII would be recognized, and this
    guard does not buffer the stream.

    Args:
        types: List of PII types to redact. If None, redacts all types.
        mode: "mask" replaces each match with [TYPE], "remove" deletes it.

    Returns:
        Guard that redacts PII and passes the request through unmodified.
    """
    if isinstance(types, str):
        types = [types]

    if types is None:
        types = list(PII_PATTERNS.keys())

    invalid_types = [t for t in types if t not in PII_PATTERNS]
    if invalid_types:
        raise ValueError(f"Invalid PII types: {invalid_types}. Valid types: {list(PII_PATTERNS.keys())}")

    async def run(ctx: Ctx) -> Either:
        """Redact PII from context text, always passing through."""
        text = ctx.get("output", "")

        if not text and "messages" in ctx:
            messages = ctx.get("messages", [])
            if isinstance(messages, list) and messages:
                last_msg = messages[-1]
                text = last_msg.get("content", "") if isinstance(last_msg, dict) else str(last_msg)

        if not isinstance(text, str) or not text.strip():
            return Right_(ctx)

        all_spans = []
        for pii_type in types:
            pattern = PII_PATTERNS[pii_type]
            for match in pattern.finditer(text):
                all_spans.append({"start": match.start(), "end": match.end(), "type": pii_type})

        if not all_spans:
            return Right_(ctx)

        redacted_text = text
        for span in sorted(all_spans, key=lambda s: s["start"], reverse=True):
            replacement = f"[{span['type']}]" if mode == "mask" else ""
            redacted_text = redacted_text[:span["start"]] + replacement + redacted_text[span["end"]:]

        new_ctx = dict(ctx)
        new_ctx["output"] = redacted_text
        return Right_(new_ctx)

    return run
