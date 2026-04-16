"""
Inference Engine - Runs ONNX inference

Pure functional inference with Either for error handling.
Reuses logic from controlnet but as a standalone service.
"""

import logging
import time
from typing import Any
from dataclasses import dataclass

import numpy as np

from model_loader import LoadedModel, get_cached_model_by_category

logger = logging.getLogger(__name__)


# =====================================================
# Types
# =====================================================

@dataclass(frozen=True)
class InferenceRequest:
    """Immutable inference request"""
    prompt: str
    risk_category: str


@dataclass(frozen=True)
class InferenceResult:
    """Immutable inference result"""
    model_id: str
    model_name: str
    risk_category: str
    predictions: list[dict[str, Any]]
    max_confidence: float
    latency_ms: float


# =====================================================
# Pure Functions
# =====================================================

def tokenize_input(prompt: str, model: LoadedModel) -> dict[str, np.ndarray]:
    """
    Tokenize prompt using pre-loaded tokenizer
    
    Pure function: (prompt, model) → input tensors
    Uses cached tokenizer from LoadedModel (no disk I/O)
    """
    # Use pre-loaded tokenizer
    tokenizer = model.tokenizer
    
    logger.debug(f"Using cached tokenizer for {model.risk_category}")
    
    # Tokenize
    max_length = 512
    encoded = tokenizer(
        prompt,
        max_length=max_length,
        padding="max_length",
        truncation=True,
        return_tensors="np"
    )
    
    # Build inputs
    inputs = {
        "input_ids": encoded["input_ids"].astype(np.int64),
        "attention_mask": encoded["attention_mask"].astype(np.int64)
    }
    
    # Add token_type_ids if required by model
    if "token_type_ids" in model.input_names:
        if "token_type_ids" in encoded:
            inputs["token_type_ids"] = encoded["token_type_ids"].astype(np.int64)
        else:
            # Some models need token_type_ids but tokenizer doesn't provide it
            inputs["token_type_ids"] = np.zeros([1, max_length], dtype=np.int64)
    
    return inputs


def run_model_inference(model: LoadedModel, inputs: dict[str, np.ndarray]) -> np.ndarray:
    """
    Run ONNX model inference
    
    Pure function: (model, inputs) → logits
    Raises on failure (fail-fast)
    """
    outputs = model.session.run(None, inputs)
    return outputs[0]  # First output is logits


def process_logits(
    logits: np.ndarray,
    risk_category: str,
    model_id: str,
    model_name: str,
    label_mapping: dict[int, str] | None = None,
    class_labels: list[str] | None = None
) -> dict[str, Any]:
    """
    Process model logits to predictions
    
    Pure function: logits → predictions
    Handles:
    - Sequence classification (toxicity, jailbreak): shape (1, num_classes)
    - Token classification (PII): shape (1, num_tokens, num_classes)
    """
    logger.debug(f"Logits shape for {risk_category}: {logits.shape}")
    
    # Detect model type by output shape
    is_token_classification = len(logits.shape) == 3  # (batch, tokens, classes)
    
    if is_token_classification:
        # Token classification (e.g., PII/NER)
        # Take max across all tokens to get overall confidence
        # Shape: (1, num_tokens, num_classes) -> (num_classes,)
        max_per_class = np.max(logits[0], axis=0)  # Max across tokens for each class
        probabilities = 1 / (1 + np.exp(-max_per_class))  # Sigmoid
        
        # Get top 3 classes
        top_indices = np.argsort(probabilities)[-3:][::-1]
        
        predictions = []
        for idx in top_indices:
            idx_val = int(idx) if isinstance(idx, (int, np.integer)) else int(idx.item())
            conf_val = float(probabilities[idx])
            
            # Get label from mapping or class_labels
            label = None
            if label_mapping and idx_val in label_mapping:
                label = label_mapping[idx_val]
            elif class_labels and 0 <= idx_val < len(class_labels):
                label = class_labels[idx_val]
            
            # Filter out "O" (Outside) labels and strip "I-" prefix
            if label and label != "O":
                # Strip "I-" prefix if present
                processed_label = label[2:] if label.startswith("I-") else label
                
                pred = {
                    "class_index": idx_val,
                    "confidence": conf_val,
                    "label": processed_label
                }
                predictions.append(pred)
        
        max_confidence = float(np.max(probabilities))
        logger.debug(f"Token classification for {risk_category}, max confidence: {max_confidence}")
        
    else:
        # Sequence classification (e.g., toxicity, jailbreak)
        # Detect if multi-label or multi-class
        is_multi_label = risk_category in ["toxicity", "safety"] or logits.shape[-1] > 10
        
        if is_multi_label:
            # Multi-label: sigmoid
            probabilities = 1 / (1 + np.exp(-logits[0]))
            logger.debug(f"Using sigmoid for {risk_category}")
        else:
            # Multi-class: softmax
            exp_logits = np.exp(logits[0] - np.max(logits[0]))
            probabilities = exp_logits / np.sum(exp_logits)
            logger.debug(f"Using softmax for {risk_category}")
        
        # Top 3 predictions (or all if <= 3 classes for binary classification)
        num_classes = len(probabilities)
        top_k = min(3, num_classes) if num_classes > 2 else num_classes
        top_indices = np.argsort(probabilities)[-top_k:][::-1]
        
        predictions = []
        for idx in top_indices:
            idx_val = int(idx) if isinstance(idx, (int, np.integer)) else int(idx.item())
            conf_val = float(probabilities[idx])
            
            # Get label from mapping or class_labels
            label = None
            if label_mapping and idx_val in label_mapping:
                label = label_mapping[idx_val]
                logger.debug(f"Found label from label_mapping: {label} for class {idx_val}")
            elif class_labels and 0 <= idx_val < len(class_labels):
                label = class_labels[idx_val]
                logger.debug(f"Found label from class_labels: {label} for class {idx_val}")
            else:
                logger.warning(f"No label found for class {idx_val} (label_mapping: {label_mapping}, class_labels: {class_labels})")
            
            # For sequence classification, show all labels (don't filter "O" which is only for token classification)
            if label:
                # Strip "I-" prefix if present (for token classification labels)
                processed_label = label[2:] if label.startswith("I-") else label
                
                pred = {
                    "class_index": idx_val,
                    "confidence": conf_val,
                    "label": processed_label
                }
                predictions.append(pred)
            else:
                # Even without label, include the prediction with class_index
                pred = {
                    "class_index": idx_val,
                    "confidence": conf_val,
                    "label": f"Class_{idx_val}"
                }
                predictions.append(pred)
        
        max_confidence = float(np.max(probabilities))
    
    return {
        "predictions": predictions,
        "max_confidence": max_confidence,
        "model_id": model_id,
        "model_name": model_name,
        "risk_category": risk_category
    }


# =====================================================
# Orchestration
# =====================================================

async def run_inference_async(request: InferenceRequest) -> InferenceResult:
    """
    Run complete inference pipeline with caching (ASYNC - NO BLOCKING!)
    
    Orchestration: request → cache check → model → tokenize → infer → process → result
    Raises on failure (fail-fast)
    """
    start_time = time.time()
    
    # Check cache first (NATIVE ASYNC - NO BLOCKING!)
    from cache import get_inference_cache
    cache = get_inference_cache()
    
    if cache:
        cached_result = await cache.get_cached_result(
            request.prompt, 
            request.risk_category
        )
        
        if cached_result:
            # Cache hit - return cached result
            logger.info(f"✅ Cache hit for {request.risk_category}")
            return InferenceResult(
                model_id=cached_result["model_id"],
                model_name=cached_result["model_name"],
                risk_category=cached_result["risk_category"],
                predictions=cached_result["predictions"],
                max_confidence=cached_result["max_confidence"],
                latency_ms=cached_result["latency_ms"]
            )
    
    # Cache miss or cache unavailable - run inference
    
    # Get cached model
    model = get_cached_model_by_category(request.risk_category)
    
    if model is None:
        raise ValueError(f"No model loaded for risk category: {request.risk_category}")
    
    # ✅ Offload blocking CPU work to thread pool
    import asyncio
    loop = asyncio.get_running_loop()
    
    # 1. Tokenize (CPU bound)
    inputs = await loop.run_in_executor(None, tokenize_input, request.prompt, model)
    
    # 2. Inference (CPU bound, releases GIL in ONNX Runtime)
    logits = await loop.run_in_executor(None, run_model_inference, model, inputs)
    
    # Process outputs
    processed = process_logits(
        logits,
        request.risk_category,
        model.model_id,
        model.name,  # LoadedModel has 'name', not 'model_name'
        label_mapping=model.label_mapping,
        class_labels=model.class_labels
    )
    
    latency_ms = (time.time() - start_time) * 1000
    
    result = InferenceResult(
        model_id=processed["model_id"],
        model_name=processed["model_name"],
        risk_category=processed["risk_category"],
        predictions=processed["predictions"],
        max_confidence=processed["max_confidence"],
        latency_ms=latency_ms
    )
    
    # Cache the result for future requests (NATIVE ASYNC - NO BLOCKING!)
    if cache:
        result_dict = {
            "model_id": result.model_id,
            "model_name": result.model_name,
            "risk_category": result.risk_category,
            "predictions": result.predictions,
            "max_confidence": result.max_confidence,
            "latency_ms": result.latency_ms
        }
        await cache.cache_result(
            request.prompt, 
            request.risk_category, 
            result_dict
        )
    
    return result


def run_inference(request: InferenceRequest) -> InferenceResult:
    """
    Sync wrapper for async inference (for backwards compatibility)
    
    NOTE: This is only for sync contexts. FastAPI endpoints should call run_inference_async directly.
    """
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(run_inference_async(request))


async def run_batch_inference_async(prompts: list[str], risk_categories: list[str]) -> dict[str, InferenceResult]:
    """
    Run inference for multiple risk categories (ASYNC - NO BLOCKING!)
    
    Orchestration: batch requests → concurrent inference → results
    Returns dict of risk_category → result
    """
    import asyncio
    
    # ✅ Run all inferences concurrently for better performance
    tasks = []
    for risk_category in risk_categories:
        request = InferenceRequest(
            prompt=prompts[0] if prompts else "",
            risk_category=risk_category
        )
        tasks.append(run_inference_async(request))
    
    # Gather results, capturing exceptions
    task_results = await asyncio.gather(*tasks, return_exceptions=True)
    
    # Build results dict, filtering out errors
    results = {}
    for i, (risk_category, task_result) in enumerate(zip(risk_categories, task_results)):
        if isinstance(task_result, Exception):
            logger.error(f"Inference failed for {risk_category}: {task_result}")
            # Skip failed categories (partial success is ok)
        else:
            results[risk_category] = task_result
    
    return results


def run_batch_inference(prompts: list[str], risk_categories: list[str]) -> dict[str, InferenceResult]:
    """
    Sync wrapper for batch inference (for backwards compatibility)
    
    NOTE: FastAPI endpoints should call run_batch_inference_async directly.
    """
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    
    return loop.run_until_complete(run_batch_inference_async(prompts, risk_categories))

