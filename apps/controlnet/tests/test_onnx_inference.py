"""
Tests for ONNX Inference - Category Theory Implementation

Tests verify:
- Pure functions (no side effects)
- Functor laws (identity, composition)
- Monad laws (left identity, right identity, associativity)
- Error handling (fail-fast)
- Composition correctness
"""

import pytest
import numpy as np
from unittest.mock import Mock, patch, MagicMock
from dataclasses import dataclass

from cga_core.onnx_inference import (
    ModelSpec,
    ModelBytes,
    ModelSession,
    InferenceInput,
    InferenceResult,
    load_bytes_from_gcs,
    create_session,
    tokenize_prompt,
    run_inference,
    process_outputs,
    bind,
    fmap,
    compose,
    inference_pipeline,
    parallel_inference,
    partition_results,
)
from cga_core.types import Left, Right


# =====================================================
# Test Data
# =====================================================

@pytest.fixture
def model_spec():
    return ModelSpec(
        model_id="test-model",
        storage_url="gs://test-bucket/models/test.onnx",
        family="toxicity",
        tenant_id=None
    )


@pytest.fixture
def model_bytes():
    return ModelBytes(
        model_id="test-model",
        bytes_data=b"fake onnx data",
        size_bytes=14
    )


# =====================================================
# Pure Function Tests
# =====================================================

def test_tokenize_prompt_is_pure():
    """Test tokenize_prompt is pure (same input → same output)"""
    prompt = "test prompt"
    model_id = "test-model"
    
    result1 = tokenize_prompt(prompt, model_id)
    result2 = tokenize_prompt(prompt, model_id)
    
    assert isinstance(result1, Right)
    assert isinstance(result2, Right)
    
    # Same input produces same output (pure function)
    np.testing.assert_array_equal(
        result1.value.inputs["input_ids"],
        result2.value.inputs["input_ids"]
    )


def test_tokenize_prompt_different_inputs():
    """Test tokenize_prompt with different inputs"""
    result1 = tokenize_prompt("prompt 1", "model-1")
    result2 = tokenize_prompt("prompt 2", "model-2")
    
    assert isinstance(result1, Right)
    assert isinstance(result2, Right)
    assert result1.value.model_id != result2.value.model_id


def test_process_outputs_is_pure():
    """Test process_outputs is pure"""
    logits = np.array([[0.1, 0.9, 0.5]])
    
    result1 = process_outputs([logits], "model-1", "Model 1", "toxicity")
    result2 = process_outputs([logits], "model-1", "Model 1", "toxicity")
    
    assert isinstance(result1, Right)
    assert isinstance(result2, Right)
    assert result1.value == result2.value


# =====================================================
# Functor Laws
# =====================================================

def test_fmap_identity():
    """Functor law: fmap id = id"""
    right_val = Right(42)
    identity = lambda x: x
    
    result = fmap(right_val, identity)
    
    assert result == right_val


def test_fmap_composition():
    """Functor law: fmap (g ∘ f) = fmap g ∘ fmap f"""
    right_val = Right(10)
    f = lambda x: x * 2
    g = lambda x: x + 1
    
    # fmap (g ∘ f)
    composed = lambda x: g(f(x))
    left_side = fmap(right_val, composed)
    
    # fmap g ∘ fmap f
    right_side = fmap(fmap(right_val, f), g)
    
    assert left_side == right_side


def test_fmap_on_left():
    """fmap on Left returns Left (error propagation)"""
    left_val = Left("error")
    f = lambda x: x * 2
    
    result = fmap(left_val, f)
    
    assert isinstance(result, Left)
    assert result.value == "error"


# =====================================================
# Monad Laws (Either)
# =====================================================

def test_bind_left_identity():
    """Monad law: bind (return a) f = f a"""
    a = 42
    f = lambda x: Right(x * 2)
    
    # bind (return a) f
    left_side = bind(Right(a), f)
    
    # f a
    right_side = f(a)
    
    assert left_side == right_side


def test_bind_right_identity():
    """Monad law: bind m return = m"""
    m = Right(42)
    
    result = bind(m, lambda x: Right(x))
    
    assert result == m


def test_bind_associativity():
    """Monad law: bind (bind m f) g = bind m (λx. bind (f x) g)"""
    m = Right(10)
    f = lambda x: Right(x * 2)
    g = lambda x: Right(x + 1)
    
    # bind (bind m f) g
    left_side = bind(bind(m, f), g)
    
    # bind m (λx. bind (f x) g)
    right_side = bind(m, lambda x: bind(f(x), g))
    
    assert left_side == right_side


def test_bind_on_left():
    """bind on Left short-circuits"""
    left_val = Left("error")
    f = lambda x: Right(x * 2)
    
    result = bind(left_val, f)
    
    assert isinstance(result, Left)
    assert result.value == "error"


# =====================================================
# Composition Tests
# =====================================================

def test_function_composition():
    """Test compose function"""
    f = lambda x: x * 2
    g = lambda x: x + 1
    
    composed = compose(f, g)
    
    assert composed(5) == g(f(5))
    assert composed(5) == 11


def test_compose_identity():
    """Composition with identity"""
    f = lambda x: x * 2
    identity = lambda x: x
    
    composed = compose(f, identity)
    
    assert composed(5) == f(5)


# =====================================================
# Error Handling Tests
# =====================================================

def test_load_bytes_invalid_url():
    """Test load_bytes_from_gcs with invalid URL"""
    spec = ModelSpec(
        model_id="test",
        storage_url="invalid://url",
        family="test"
    )
    
    result = load_bytes_from_gcs(spec)
    
    assert isinstance(result, Left)
    assert "Invalid GCS URL" in result.value


def test_load_bytes_malformed_url():
    """Test load_bytes_from_gcs with malformed URL"""
    spec = ModelSpec(
        model_id="test",
        storage_url="gs://bucket-only",
        family="test"
    )
    
    result = load_bytes_from_gcs(spec)
    
    assert isinstance(result, Left)


@patch('cga_core.onnx_inference.storage.Client')
def test_load_bytes_gcs_error(mock_client):
    """Test load_bytes_from_gcs with GCS error"""
    spec = ModelSpec(
        model_id="test",
        storage_url="gs://bucket/path/model.onnx",
        family="test"
    )
    
    # Mock GCS error
    mock_client.side_effect = Exception("GCS error")
    
    result = load_bytes_from_gcs(spec)
    
    assert isinstance(result, Left)
    assert "Failed to load from GCS" in result.value


def test_tokenize_empty_prompt():
    """Test tokenize with empty prompt"""
    result = tokenize_prompt("", "model-1")
    
    assert isinstance(result, Right)
    # Empty prompt should still return valid inputs (all padding)
    assert result.value.inputs["input_ids"].shape == (1, 512)


# =====================================================
# Pipeline Tests
# =====================================================

@patch('cga_core.onnx_inference.storage.Client')
@patch('cga_core.onnx_inference.ort.InferenceSession')
def test_inference_pipeline_success(mock_session, mock_client):
    """Test complete inference pipeline with mocks"""
    # Mock GCS
    mock_blob = Mock()
    mock_blob.download_as_bytes.return_value = b"fake onnx model data"
    mock_bucket = Mock()
    mock_bucket.blob.return_value = mock_blob
    mock_client_instance = Mock()
    mock_client_instance.bucket.return_value = mock_bucket
    mock_client.return_value = mock_client_instance
    
    # Mock ONNX session
    mock_session_instance = Mock()
    mock_session_instance.get_inputs.return_value = [Mock(name="input_ids"), Mock(name="attention_mask")]
    mock_session_instance.get_outputs.return_value = [Mock(name="logits")]
    mock_session_instance.run.return_value = [np.array([[0.1, 0.9, 0.5]])]
    mock_session.return_value = mock_session_instance
    
    # Run pipeline
    spec = ModelSpec(
        model_id="test-model",
        storage_url="gs://bucket/model.onnx",
        family="toxicity"
    )
    
    with patch('os.path.exists', return_value=False):
        result = inference_pipeline(spec, "test prompt", "Test Model")
    
    assert isinstance(result, Right)
    assert result.value.model_id == "test-model"
    assert result.value.family == "toxicity"
    assert "predictions" in result.value.predictions


def test_parallel_inference_empty_list():
    """Test parallel_inference with empty list"""
    result = parallel_inference([], "test prompt", {})
    
    assert result == []


# =====================================================
# Result Partitioning Tests
# =====================================================

def test_partition_results_all_success():
    """Test partition_results with all successes"""
    results = [
        Right(InferenceResult("m1", "Model 1", "f1", {}, 10.0)),
        Right(InferenceResult("m2", "Model 2", "f2", {}, 20.0)),
    ]
    
    errors, successes = partition_results(results)
    
    assert len(errors) == 0
    assert len(successes) == 2


def test_partition_results_all_errors():
    """Test partition_results with all errors"""
    results = [
        Left("error 1"),
        Left("error 2"),
    ]
    
    errors, successes = partition_results(results)
    
    assert len(errors) == 2
    assert len(successes) == 0


def test_partition_results_mixed():
    """Test partition_results with mixed results"""
    results = [
        Right(InferenceResult("m1", "Model 1", "f1", {}, 10.0)),
        Left("error"),
        Right(InferenceResult("m2", "Model 2", "f2", {}, 20.0)),
    ]
    
    errors, successes = partition_results(results)
    
    assert len(errors) == 1
    assert len(successes) == 2


# =====================================================
# Integration Tests
# =====================================================

@pytest.mark.asyncio
async def test_run_onnx_inference_no_families():
    """Test run_onnx_inference with empty families"""
    result = await run_onnx_inference("test", [], None)
    
    assert result == {}


@pytest.mark.asyncio
@patch('cga_core.onnx_inference.storage.Client')
async def test_run_onnx_inference_no_models(mock_client):
    """Test run_onnx_inference when no models found"""
    mock_db = Mock()
    mock_result = Mock()
    mock_result.fetchall.return_value = []
    mock_db.execute.return_value = mock_result
    
    result = await run_onnx_inference("test", ["toxicity"], mock_db)
    
    assert "toxicity" in result
    assert result["toxicity"]["status"] == "no_models"


# =====================================================
# Property-Based Tests
# =====================================================

def test_tokenize_always_returns_512_tokens():
    """Property: tokenize always returns 512 tokens"""
    prompts = ["", "short", "a " * 100, "very " * 1000]
    
    for prompt in prompts:
        result = tokenize_prompt(prompt, "model-1")
        assert isinstance(result, Right)
        assert result.value.inputs["input_ids"].shape[1] == 512


def test_process_outputs_confidence_between_0_and_1():
    """Property: confidences are between 0 and 1"""
    logits = np.random.randn(1, 10)
    
    result = process_outputs([logits], "m1", "Model", "family")
    
    assert isinstance(result, Right)
    for pred in result.value["predictions"]:
        assert 0 <= pred["confidence"] <= 1


# =====================================================
# Immutability Tests
# =====================================================

def test_model_spec_immutable():
    """Test ModelSpec is immutable"""
    spec = ModelSpec("id", "url", "family")
    
    with pytest.raises(Exception):  # dataclass frozen
        spec.model_id = "new-id"


def test_inference_result_immutable():
    """Test InferenceResult is immutable"""
    result = InferenceResult("id", "name", "family", {}, 10.0)
    
    with pytest.raises(Exception):  # dataclass frozen
        result.latency_ms = 20.0

