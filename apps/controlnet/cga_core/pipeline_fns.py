"""
Pure functions for chat completions pipeline
Each function is small, focused, and returns Either
No fallbacks, fail-fast principle
"""

import asyncio
import uuid
import structlog
from typing import Dict, Any, List, Optional

from .types import Either, Left_, Right_, Ctx

logger = structlog.get_logger(__name__)


# === REQUEST EXTRACTION ===

def extract_model_id_from_request(request: Any, body: Dict[str, Any]) -> str:
    """Extract model ID from request with priority: header > body"""
    model_id = request.headers.get("x-model-id")
    if model_id:
        return model_id
    
    model_id = body.get("model")
    if model_id:
        return model_id
    
    raise ValueError("Model ID not specified. Provide via X-Model-ID header or 'model' field in body.")


def extract_user_api_key_from_request(request: Any, auth_context: Any) -> str:
    """Extract user's provider API key for BYOK mode"""
    # Playground mode (Clerk JWT)
    if auth_context.auth.auth_mode == "clerk_jwt":
        import os
        openai_key = os.getenv("OPENAI_API_KEY")
        if not openai_key:
            raise ValueError("Gateway configuration error: OPENAI_API_KEY not configured for playground mode.")
        logger.info(f"🔑 Using environment OPENAI_API_KEY (prefix: {openai_key[:15]}...)")
        return openai_key
    
    # API key mode (standard BYOK)
    auth_header = request.headers.get("authorization")
    if not auth_header:
        raise ValueError(
            "Missing Authorization header with provider API key. "
            "Provide your OpenAI/Anthropic/etc API key via 'Authorization: Bearer <key>' header."
        )
    
    # Strip "Bearer " prefix if present
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    
    return auth_header


async def extract_request_params(ctx: Ctx) -> Either:
    """Extract model_id, api_key, policy_id from request
    
    Policy resolution priority:
    1. X-Policy-ID header (explicit)
    2. policy_id in request body (for third-party apps)
    3. Default policy (if configured in settings)
    """
    request = ctx["request"]
    body = ctx["body"]
    context = ctx["tenant_context"]
    
    try:
        model_id = extract_model_id_from_request(request, body)
        user_api_key = extract_user_api_key_from_request(request, context)
        
        # Extract policy_id with fallback chain
        policy_id = request.headers.get("x-policy-id")
        
        # If not in header, check body (for third-party app compatibility)
        if not policy_id:
            policy_id = body.get("policy_id")
            if policy_id:
                logger.info(f"📋 Using policy_id from request body: {policy_id}")
        
        # If still not found, check for default policy
        if not policy_id:
            # Get default policy from settings if available
            settings = getattr(request.app.state, 'settings', None)
            if settings and hasattr(settings, 'default_policy_id'):
                policy_id = settings.default_policy_id
                if policy_id:
                    logger.info(f"📋 Using default policy_id from settings: {policy_id}")
        
        # If no policy at all, return error
        if not policy_id:
            return Left_([{
                "rule_id": "request.missing_policy_id",
                "message": "No policy specified. Provide via X-Policy-ID header, 'policy_id' field in body, or configure a default policy.",
                "severity": "critical"
            }])
        
        trace_id = request.headers.get("x-trace-id", str(uuid.uuid4()))
        
        return Right_({
            **ctx,
            "model_id": model_id,
            "user_api_key": user_api_key,
            "policy_id": policy_id,
            "trace_id": trace_id
        })
    except ValueError as e:
        return Left_([{
            "rule_id": "request.extraction_failed",
            "message": str(e),
            "severity": "critical"
        }])
    except Exception as e:
        return Left_([{
            "rule_id": "request.extraction_error",
            "message": str(e),
            "severity": "critical"
        }])


# === MODEL RESOLUTION ===

async def resolve_model_target(ctx: Ctx) -> Either:
    """Resolve model to provider routing config"""
    from gateway.services.model_registry import resolve_model
    from gateway.llm_client import create_openai_client
    from gateway.db import get_db
    
    try:
        async for db_session in get_db():
            model_target = await resolve_model(
                model_id=ctx["model_id"],
                tenant_id=ctx["tenant_context"].tenant_id,
                db_session=db_session
            )
            break  # Only need first iteration
        
        # Create OpenAI-compatible client (works with all providers)
        provider_client = create_openai_client(
            api_key=ctx["user_api_key"],
            base_url=model_target.base_url
        )
        
        return Right_({
            **ctx,
            "model_target": model_target,
            "provider_client": provider_client
        })
    except Exception as e:
        return Left_([{
            "rule_id": "model.resolution_failed",
            "message": f"Failed to resolve model: {str(e)}",
            "severity": "critical"
        }])


# === POLICY RESOLUTION ===

async def resolve_policy(ctx: Ctx) -> Either:
    """Load policy and compiled guards"""
    trace_id = ctx.get("trace_id", "unknown")
    policy_id = ctx.get("policy_id", "unknown")
    
    # === DECISION LOG: POLICY RESOLUTION START ===
    logger.info(
        "decision.policy_resolution_start",
        extra={
            "trace_id": trace_id,
            "policy_id": policy_id,
            "tenant_id": ctx["tenant_context"].tenant_id
        }
    )
    
    try:
        policy_cache = ctx["request"].app.state.policy_cache
        compiled_guards, policy_metadata = await policy_cache.get_policy(
            tenant_id=ctx["tenant_context"].tenant_id,
            policy_id=ctx["policy_id"]
        )
        
        policy_hash = policy_metadata.get("hash", "unknown")
        policy_risk_categories = policy_metadata.get("policy_risk_categories", [])
        guards_by_tier = policy_metadata.get("guards_by_tier", {})
        
        # === DECISION LOG: POLICY LOADED ===
        logger.info(
            "decision.policy_loaded",
            extra={
                "trace_id": trace_id,
                "policy_id": policy_id,
                "policy_hash": policy_hash[:8] if policy_hash != "unknown" else "unknown",
                "policy_risk_categories": sorted(policy_risk_categories),
                "categories_count": len(policy_risk_categories),
                "guards_structure": {
                    tier: len(guards) if isinstance(guards, list) else 0
                    for tier, guards in guards_by_tier.items()
                },
                "cache_source": policy_metadata.get("source", "unknown")
            }
        )
        
        return Right_({
            **ctx,
            "compiled_guards": compiled_guards,
            "policy_metadata": policy_metadata,
            "policy_hash": policy_hash
        })
    except Exception as e:
        logger.error(
            "decision.policy_resolution_failed",
            extra={
                "trace_id": trace_id,
                "policy_id": policy_id,
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        return Left_([{
            "rule_id": "policy.resolution_failed",
            "message": f"Failed to load policy: {str(e)}",
            "severity": "critical"
        }])


# === PROMPT EXTRACTION ===

def extract_prompt_from_body(body: Dict[str, Any]) -> str:
    """Extract prompt text from request body messages"""
    if "messages" not in body:
        return ""
    
    messages = body["messages"]
    if not isinstance(messages, list) or not messages:
        return ""
    
    last_message = messages[-1]
    if not isinstance(last_message, dict) or "content" not in last_message:
        return ""
    
    return last_message["content"]


# === PROMPT ROUTING ===

async def apply_prompt_routing(ctx: Ctx) -> Either:
    """
    Apply embeddings-based risk detection routing (T1)
    
    Flow:
    1. Detect risk categories using embeddings (e.g., ['toxicity', 'safety', 'pii'])
    2. Filter by policy risk categories (only keep categories that have guards in policy)
    3. Store for ONNX inference (intersection of detected + policy categories)
    """
    from gateway.db import get_db
    
    policy_cache = ctx["request"].app.state.policy_cache
    policy_metadata = ctx.get("policy_metadata", {})
    trace_id = ctx.get("trace_id", "unknown")
    
    # Extract prompt
    prompt = extract_prompt_from_body(ctx["body"])
    
    # === DECISION LOG: T1 START ===
    logger.info(
        "decision.t1_routing_start",
        extra={
            "trace_id": trace_id,
            "policy_id": policy_metadata.get("policy_id", "unknown"),
            "prompt_length": len(prompt) if prompt else 0,
            "router_enabled": policy_cache.settings.enable_embedding_router
        }
    )
    
    # Skip routing if disabled or no prompt
    if not prompt or not policy_cache.settings.enable_embedding_router:
        logger.info(
            "decision.t1_routing_skipped",
            extra={
                "trace_id": trace_id,
                "reason": "no_prompt" if not prompt else "router_disabled",
                "prompt_exists": bool(prompt),
                "router_enabled": policy_cache.settings.enable_embedding_router
            }
        )
        return Right_({**ctx, "prompt": prompt, "selected_risk_categories": set(), "onnx_risk_categories": []})
    
    try:
        # Get risk detector from app state
        risk_detector = getattr(ctx["request"].app.state, "risk_detector", None)
        
        if not risk_detector:
            logger.warning(
                "decision.t1_routing_unavailable",
                extra={
                    "trace_id": trace_id,
                    "reason": "risk_detector_not_initialized"
                }
            )
            return Right_({**ctx, "prompt": prompt, "selected_risk_categories": set(), "onnx_risk_categories": []})
        
        # Step 1: Detect top K risk categories using embeddings (T1 - fast!)
        # Use settings for top_k and threshold configuration
        settings = policy_cache.settings
        detected_risks = await risk_detector.detect_risks(
            prompt=prompt,
            top_k=settings.router_top_k,
            threshold=settings.similarity_lower_bound  # Use lower bound as detection threshold
        )
        
        all_detected_categories = {risk.risk_category for risk in detected_risks}
        
        # Step 2: Filter by policy risk categories
        # Only keep categories that have guards in the policy
        policy_categories = set(policy_metadata.get("policy_risk_categories", []))
        filtered_risk_categories = all_detected_categories & policy_categories  # Intersection
        
        # Step 3: Filter by similarity threshold for ONNX (SMART BOUNDS)
        # Only run ONNX for categories with similarity >= lower_bound (0.20)
        # This prevents running expensive ONNX models for low-confidence detections
        settings = policy_cache.settings
        similarity_lower_bound = settings.similarity_lower_bound
        
        # Create mapping of category -> similarity for filtering
        category_similarity = {risk.risk_category: risk.similarity for risk in detected_risks}
        
        # Filter ONNX categories: must be in intersection AND above similarity threshold
        onnx_risk_categories_filtered = [
            category for category in filtered_risk_categories
            if category_similarity.get(category, 0) >= similarity_lower_bound
        ]
        
        # === DECISION LOG: T1 RESULTS ===
        logger.info(
            "decision.t1_routing_complete",
            extra={
                "trace_id": trace_id,
                "policy_id": policy_metadata.get("policy_id", "unknown"),
                "detected_categories": sorted(list(all_detected_categories)),
                "detected_count": len(all_detected_categories),
                "policy_categories": sorted(list(policy_categories)),
                "policy_categories_count": len(policy_categories),
                "intersection_categories": sorted(list(filtered_risk_categories)),
                "intersection_count": len(filtered_risk_categories),
                "onnx_categories_after_similarity_filter": sorted(onnx_risk_categories_filtered),
                "onnx_categories_filtered_count": len(onnx_risk_categories_filtered),
                "similarity_lower_bound": similarity_lower_bound,
                "will_run_onnx": len(onnx_risk_categories_filtered) > 0,
                "top_risks": [
                    {
                        "category": risk.risk_category,
                        "similarity": risk.similarity,
                        "confidence": risk.confidence,
                        "above_threshold": risk.similarity >= similarity_lower_bound
                    }
                    for risk in detected_risks
                ]
            }
        )
        
        # DEBUG: Show what's in policy_metadata
        if not policy_categories:
            logger.warning(
                "decision.t1_no_policy_categories",
                extra={
                    "trace_id": trace_id,
                    "policy_id": policy_metadata.get("policy_id", "unknown"),
                    "guard_keys": policy_metadata.get("guard_keys", []),
                    "impact": "no_onnx_will_run_even_if_risks_detected"
                }
            )
        
        # Store both for downstream use
        return Right_({
            **ctx,
            "prompt": prompt,
            "selected_risk_categories": all_detected_categories,  # All detected
            "onnx_risk_categories": onnx_risk_categories_filtered,  # Filtered by intersection AND similarity
            "detected_risks": detected_risks
        })
        
    except Exception as e:
        logger.error(
            "decision.t1_routing_failed",
            extra={
                "trace_id": trace_id,
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        return Left_([{
            "rule_id": "routing.failed",
            "message": f"Prompt routing failed: {str(e)}",
            "severity": "high"
        }])


# === ONNX DETECTION ===

async def run_onnx_detection(ctx: Ctx) -> Either:
    """
    Run ONNX model inference for detected risk categories via remote service (T2)
    
    Pure function that:
    1. Gets ONNX risk categories from context (filtered by prompt routing)
    2. Calls remote ONNX service for each category
    3. Checks predictions against threshold
    4. Returns Left if violations found, Right otherwise
    
    This is a separate pipeline step that runs BEFORE guards.
    Uses remote ONNX service by default (no environment variables needed).
    """
    onnx_risk_categories = ctx.get("onnx_risk_categories", [])
    trace_id = ctx.get("trace_id", "unknown")
    policy_metadata = ctx.get("policy_metadata", {})
    
    # === DECISION LOG: T2 START ===
    logger.info(
        "decision.t2_onnx_start",
        extra={
            "trace_id": trace_id,
            "policy_id": policy_metadata.get("policy_id", "unknown"),
            "onnx_categories": onnx_risk_categories,
            "onnx_categories_count": len(onnx_risk_categories),
            "will_run": len(onnx_risk_categories) > 0
        }
    )
    
    if not onnx_risk_categories:
        logger.info(
            "decision.t2_onnx_skipped",
            extra={
                "trace_id": trace_id,
                "reason": "no_intersection",
                "detected_categories": sorted(list(ctx.get('selected_risk_categories', set()))),
                "policy_categories": policy_metadata.get('policy_risk_categories', [])
            }
        )
        return Right_(ctx)
    
    logger.info(f"🤖 Running remote ONNX inference for risk categories: {onnx_risk_categories}")
    
    try:
        from cga_core.onnx_client import run_batch_remote_inference
        
        # ✅ OPTIMIZATION: Use batch endpoint - single HTTP call for all risk categories
        # This reduces latency from N×(network+inference) to 1×(network+inference)  
        # Example: 3 categories = 150ms → 50ms saved!
        onnx_results = await run_batch_remote_inference(
            prompt=ctx.get("prompt", ""),
            risk_categories=onnx_risk_categories
        )
        
        logger.info(f"✅ ONNX inference complete: {len(onnx_results)} categories")
        
        # Get threshold from settings (fail-safe default)
        try:
            settings = ctx["request"].app.state.settings
            threshold = getattr(settings, "onnx_detection_threshold", 0.5)
        except Exception:
            threshold = 0.5  # Fallback default
        
        # Check ONNX results for violations
        onnx_violations = _check_onnx_violations(onnx_results, threshold, trace_id)
        
        # === DECISION LOG: T2 RESULTS ===
        logger.info(
            "decision.t2_onnx_complete",
            extra={
                "trace_id": trace_id,
                "policy_id": policy_metadata.get("policy_id", "unknown"),
                "categories_checked": onnx_risk_categories,
                "categories_count": len(onnx_risk_categories),
                "threshold": threshold,
                "violations_found": len(onnx_violations),
                "passed": len(onnx_violations) == 0,
                "results_summary": {
                    category: {
                        "status": result.get("status"),
                        "predictions_count": len(result.get("predictions", [])),
                        "max_confidence": max([p.get("confidence", 0) for p in result.get("predictions", [])], default=0)
                    }
                    for category, result in onnx_results.items()
                }
            }
        )
        
        # If ONNX detected violations, fail immediately
        if onnx_violations:
            logger.warning(
                "decision.t2_onnx_violations",
                extra={
                    "trace_id": trace_id,
                    "violations_count": len(onnx_violations),
                    "violations": [
                        {
                            "rule_id": v["rule_id"],
                            "severity": v["severity"],
                            "score": v.get("score", 0)
                        }
                        for v in onnx_violations
                    ]
                }
            )
            return Left_(onnx_violations)
        
        logger.info(f"✅ ONNX passed: No violations detected")
        
        return Right_(ctx)
        
    except Exception as e:
        logger.error(
            "decision.t2_onnx_failed",
            extra={
                "trace_id": trace_id,
                "error": str(e),
                "error_type": type(e).__name__,
                "fail_open": True
            },
            exc_info=True
        )
        # Don't fail the request if ONNX fails - fail-open for gateway availability
        logger.warning("⚠️  ONNX inference failed but allowing request through (fail-open)")
        return Right_(ctx)


# =============================================================================
# VIOLATION LABELS CONFIG
# =============================================================================
# 
# Maps risk_category → labels that trigger violations
# Only predictions matching these labels (with confidence >= threshold) will block
# Labels not in this set are ignored
#
# If a risk_category is NOT in this config, all labels trigger (default behavior)
#
VIOLATION_LABELS_CONFIG: Dict[str, set[str]] = {
    "jailbreak": {"INJECTION"},
    "pii": {"EMAIL", "TELEPHONENUM"},
}


def _get_violation_labels(risk_category: str) -> set[str] | None:
    """
    Get violation labels for a risk category from config.
    
    Returns:
        Set of labels that trigger violations, or None if not configured
        (None means all labels can trigger violations - default behavior)
    """
    return VIOLATION_LABELS_CONFIG.get(risk_category.lower())


def _normalize_label(label: str) -> str:
    """
    Normalize label for matching (strip I- prefix, uppercase).
    
    Handles labels with or without "I-" prefix from token classification models.
    """
    if not label:
        return ""
    
    label_upper = label.upper()
    
    # Strip "I-" prefix if present (from NER/token classification models)
    if label_upper.startswith("I-"):
        return label_upper[2:]
    
    return label_upper


def _should_block_prediction(
    risk_category: str,
    class_index: int,
    label: str,
    confidence: float,
    threshold: float
) -> tuple[bool, str]:
    """
    Determine if a prediction should trigger a violation (block request).
    
    Uses VIOLATION_LABELS_CONFIG to determine which labels trigger violations:
    - If risk_category has configured violation_labels: only those labels can trigger
    - If not configured: all labels can trigger (default behavior)
    
    Args:
        risk_category: Risk category name
        class_index: Class index from model prediction
        label: Class label from model prediction (may have "I-" prefix)
        confidence: Prediction confidence score
        threshold: Confidence threshold for violations
        
    Returns:
        Tuple of (should_block: bool, reason: str)
    """
    normalized_label = _normalize_label(label)
    display_label = label or f"Class_{class_index}"
    
    # Get configured violation labels for this risk category
    violation_labels = _get_violation_labels(risk_category)
    
    # If violation_labels is configured, only those labels can trigger violations
    if violation_labels is not None:
        # Check if this label is in the violation set
        if normalized_label not in violation_labels:
            return False, f"{display_label} not in violation_labels {violation_labels}"
        
        # Label is in violation set - check confidence threshold
        if confidence >= threshold:
            return True, f"{display_label} in violation_labels, confidence {confidence:.2%} >= {threshold:.2%}"
        
        return False, f"{display_label} in violation_labels but confidence {confidence:.2%} < {threshold:.2%}"
    
    # No violation_labels configured - default behavior: all labels can trigger
    if confidence >= threshold:
        return True, f"Confidence {confidence:.2%} >= threshold {threshold:.2%}"
    
    return False, f"Confidence {confidence:.2%} < threshold {threshold:.2%}"


def _check_onnx_violations(onnx_results: Dict[str, Any], threshold: float, trace_id: str = "unknown") -> List[Dict[str, Any]]:
    """
    Check ONNX results for violations using VIOLATION_LABELS_CONFIG
    
    Uses VIOLATION_LABELS_CONFIG to determine which labels trigger violations:
    - jailbreak: Only INJECTION triggers (SAFE is allowed)
    - pii: Only EMAIL and TELEPHONENUM trigger (other PII types ignored)
    - Other categories: Configured in VIOLATION_LABELS_CONFIG or default (all labels)
    
    Args:
        onnx_results: Dictionary of ONNX inference results by risk category
        threshold: Confidence threshold for violations
        trace_id: Trace ID for logging
        
    Returns:
        List of violation dictionaries
    """
    violations = []
    
    for risk_category, result in onnx_results.items():
        if result.get("status") == "success":
            predictions = result.get("predictions", [])
            logger.info(f"📊 {risk_category}: {len(predictions)} predictions")
            
            # Check each prediction
            for pred in predictions:
                confidence = pred.get("confidence", 0.0)
                class_index = pred.get("class_index", -1)
                label = pred.get("label", "")
                
                # Use metadata-driven approach to determine if should block
                should_block, reason = _should_block_prediction(
                    risk_category=risk_category,
                    class_index=class_index,
                    label=label,
                    confidence=confidence,
                    threshold=threshold
                )
                
                if should_block:
                    # Create violation
                    # Use label as primary identifier in message (more human-readable)
                    display_label = label or f"Class_{class_index}"
                    violations.append({
                        "rule_id": f"{risk_category}.onnx_detection",
                        "message": f"{risk_category.title()} detected: {display_label} (confidence: {confidence:.2%})",
                        "severity": "critical",
                        "score": confidence,
                        "tier": "T2",
                        "phase": "input",
                        "evidence": {
                            "risk_category": risk_category,
                            "class_index": class_index,
                            "label": display_label,
                            "confidence": confidence,
                            "threshold": threshold,
                            "model_id": result.get("model_id"),
                            "latency_ms": result.get("latency_ms"),
                            "block_reason": reason
                        }
                    })
                else:
                    # Log allowed/ignored predictions for observability
                    logger.info(
                        f"✅ {risk_category}: Class {class_index} ({label or f'Class_{class_index}'}) - {reason} (confidence: {confidence:.2%})"
                    )
    
    return violations


# === GUARD EXECUTION ===

async def execute_input_guards_tiered(ctx: Ctx) -> Either:
    """
    Run input guards with tiered execution using SmartGuardScheduler (T0 always, T1/T2 conditional)
    
    Guards come from policy (configured guards).
    ONNX inference is now a separate pipeline step (run_onnx_detection).
    
    SmartGuardScheduler provides:
    - TRUE parallel execution within tiers (asyncio.gather)
    - Adaptive batching for large guard sets
    - CPU-optimized concurrency
    - Early exit on critical violations
    - Similarity-based bounds for fast/block paths
    
    Speed is critical - SmartGuardScheduler is faster than TieredGuardRunner!
    """
    from .scheduler import SmartGuardScheduler
    
    trace_id = ctx.get("trace_id", "unknown")
    policy_metadata = ctx.get("policy_metadata", {})
    policy_id = policy_metadata.get("policy_id", "unknown")
    
    # === DECISION LOG: T0 GUARDS START ===
    logger.info(
        "decision.t0_guards_start",
        extra={
            "trace_id": trace_id,
            "policy_id": policy_id,
            "phase": "input"
        }
    )
    
    if "guards_by_tier" not in policy_metadata:
        logger.warning(
            "decision.t0_no_guards_configured",
            extra={
                "trace_id": trace_id,
                "policy_id": policy_id
            }
        )
        return Right_({
            **ctx,
            "input_guards_passed": True,
            "tiers_run": []
        })
    
    # Extract guards organized by tier
    guards_by_tier = policy_metadata["guards_by_tier"]
    
    # Convert to list format expected by SmartGuardScheduler
    all_guards = []
    for tier in ["T0", "T1", "T2"]:
        tier_guards = guards_by_tier.get(tier, {})
        for guard_id, guard_fn in tier_guards.items():
            all_guards.append({
                "id": guard_id,
                "guard": guard_fn,
                "tier": tier
            })
    
    if not all_guards:
        logger.warning(
            "decision.t0_no_guards_to_execute",
            extra={
                "trace_id": trace_id,
                "policy_id": policy_id
            }
        )
        return Right_({
            **ctx,
            "input_guards_passed": True,
            "tiers_run": []
        })
    
    # === DECISION LOG: GUARDS STRUCTURE ===
    logger.info(
        "decision.guards_structure",
        extra={
            "trace_id": trace_id,
            "policy_id": policy_id,
            "total_guards": len(all_guards),
            "guards_by_tier": {
                tier: len([g for g in all_guards if g["tier"] == tier])
                for tier in ["T0", "T1", "T2"]
            }
        }
    )
    
    # Prepare context for guards (DON'T pollute the request body!)
    guard_context = {
        "phase": "input",
        "messages": ctx["body"].get("messages", []),
        "model": ctx["body"].get("model", ""),
        "tenant_id": ctx.get("tenant_context", {}).tenant_id if hasattr(ctx.get("tenant_context", {}), "tenant_id") else "system"
    }
    
    # Determine risk level based on routing
    selected_risk_categories = ctx.get("selected_risk_categories", set())
    if selected_risk_categories:
        # Risks detected - use medium or high
        risk_level = "high" if len(selected_risk_categories) > 2 else "medium"
    else:
        # No risks - use low (will skip T1/T2 if T0 passes)
        risk_level = "low"
    
    # Extract max similarity score from detected risks
    max_similarity = _extract_max_similarity(ctx.get("detected_risks", []))
    
    # === DECISION LOG: RISK ASSESSMENT ===
    logger.info(
        "decision.risk_assessment",
        extra={
            "trace_id": trace_id,
            "policy_id": policy_id,
            "risk_level": risk_level,
            "detected_categories": sorted(list(selected_risk_categories)),
            "max_similarity": max_similarity,
            "will_skip_t1_t2_if_t0_passes": risk_level == "low"
        }
    )
    
    # Get similarity bounds from settings
    try:
        settings = ctx["request"].app.state.settings
        similarity_lower_bound = getattr(settings, "similarity_lower_bound", 0.20)
        similarity_upper_bound = getattr(settings, "similarity_upper_bound", 0.90)
    except Exception:
        similarity_lower_bound = 0.20
        similarity_upper_bound = 0.90
    
    # Execute with SmartGuardScheduler (parallel execution + similarity bounds!)
    logger.info(f"🚀 Executing {len(all_guards)} guards with SmartGuardScheduler (parallel + similarity bounds)")
    
    try:
        scheduler = SmartGuardScheduler(
            similarity_lower_bound=similarity_lower_bound,
            similarity_upper_bound=similarity_upper_bound
        )
        result = await scheduler.execute_policy(
            guards=all_guards,
            context=guard_context,
            risk_level=risk_level,
            max_similarity=max_similarity  # ✨ NEW: Pass similarity for bounds checking
        )
        
        if result["_tag"] == "Left":
            violations = result["left"]
            
            # === DECISION LOG: GUARDS FAILED ===
            logger.warning(
                "decision.guards_failed",
                extra={
                    "trace_id": trace_id,
                    "policy_id": policy_id,
                    "violation_rule_id": violations[0].get('rule_id'),
                    "violation_severity": violations[0].get('severity'),
                    "violation_tier": violations[0].get('tier', 'unknown'),
                    "risk_level": risk_level
                }
            )
            
            return Left_([{
                **violations[0],
                "phase": "input"
            }])
        
        # All guards passed
        updated_context = result["right"]
        
        # Start with the original body to preserve all OpenAI parameters
        updated_body = ctx["body"].copy()
        
        # Update only fields that guards might have modified (e.g., messages)
        if "messages" in updated_context:
            updated_body["messages"] = updated_context["messages"]
        
        # === DECISION LOG: GUARDS PASSED ===
        logger.info(
            "decision.guards_passed",
            extra={
                "trace_id": trace_id,
                "policy_id": policy_id,
                "risk_level": risk_level,
                "total_guards": len(all_guards),
                "guards_by_tier": {
                    tier: len([g for g in all_guards if g["tier"] == tier])
                    for tier in ["T0", "T1", "T2"]
                }
            }
        )
        
        return Right_({
            **ctx,
            "body": updated_body,
            "input_guards_passed": True,
            "risk_level": risk_level
        })
        
    except Exception as e:
        logger.error(
            "decision.guards_execution_failed",
            extra={
                "trace_id": trace_id,
                "policy_id": policy_id,
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        return Left_([{
            "rule_id": "guards.execution_failed",
            "message": f"Guard execution failed: {str(e)}",
            "severity": "critical",
            "phase": "input"
        }])


def _extract_max_similarity(detected_risks: List[Any]) -> Optional[float]:
    """
    Extract maximum similarity score from detected risks
    
    Pure function that safely extracts the highest similarity score
    
    Args:
        detected_risks: List of risk detection results with similarity scores
        
    Returns:
        Maximum similarity score, or None if no risks detected
    """
    if not detected_risks:
        return None
    
    scores = [risk.similarity for risk in detected_risks if hasattr(risk, "similarity")]
    return max(scores) if scores else None

