# Smart Execution: Similarity-Based Bounds

## Overview

This document describes the similarity-based bounds feature that optimizes guard execution by skipping expensive models when similarity scores are too low (safe) or too high (already blocked).

## Configuration

### Environment Variables

Add these to your `.env` file to customize the bounds:

```bash
# Skip expensive guards if similarity < this (low risk, safe prompts)
SIMILARITY_LOWER_BOUND=0.20

# Skip ONNX verification if similarity > this (high confidence violation)
SIMILARITY_UPPER_BOUND=0.90
```

### Defaults

- **Lower Bound**: `0.20` (20% similarity)
  - Prompts below this are considered safe, skip T1/T2 guards
  
- **Upper Bound**: `0.90` (90% similarity)
  - Prompts above this are high-confidence violations, block without ONNX verification

## How It Works

### Three-Tier System

1. **< 20% similarity (Low Risk - Fast Path)**
   - Skip T1 semantic checks
   - Skip T2 ONNX models
   - Return immediately (pass)
   - Example: "What's the weather today?" → 5% similarity to toxic prompts

2. **20-90% similarity (Medium Risk - Normal Path)**
   - Run T0 fast guards (always)
   - Run T1 semantic guards (if T0 passes gating)
   - Run T2 ONNX models (if T1 passes gating)
   - Example: "How do I secure my account?" → 45% similarity to security risks

3. **> 90% similarity (High Risk - Block Path)**
   - Return violation immediately
   - Skip expensive ONNX verification
   - Use similarity score as confidence
   - Example: "How to hack a website" → 95% similarity to security violations

## Architecture Changes

### 1. Configuration (`gateway/config.py`)

Added two new configurable fields:

```python
similarity_lower_bound: float = Field(
    default=0.20,
    env="SIMILARITY_LOWER_BOUND",
    description="Skip expensive guards if similarity < this (low risk)"
)

similarity_upper_bound: float = Field(
    default=0.90,
    env="SIMILARITY_UPPER_BOUND",
    description="Skip ONNX verification if similarity > this (high confidence)"
)
```

### 2. Embedding Store (`cga_core/embedding_store.py`)

**Before**: Ignored threshold parameter, always returned top_k results

**After**: Properly filters by threshold before returning top_k

- Split into small functions: `_compute_prompt_vector`, `_compute_similarities`, `_select_top_risks`
- Functional approach with separate control flow
- Fail-fast: No fallbacks, clear error handling

### 3. Smart Scheduler (`cga_core/scheduler.py`)

**New Features**:
- Constructor accepts `similarity_lower_bound` and `similarity_upper_bound`
- `execute_policy` accepts optional `max_similarity` parameter
- New method: `_check_similarity_bounds` - Early exit logic
- Updated gating: `_should_run_t1` and `_should_run_t2` check similarity bounds

**Execution Flow**:

```
1. Check similarity bounds
   ├─ < lower_bound → Skip all expensive guards, return pass
   └─ > upper_bound → Return violation, skip ONNX

2. Execute T0 (always)
   └─ Critical violation → Early exit

3. Gate T1 execution
   ├─ Check T0 scores
   ├─ Check risk level
   └─ Check similarity bounds

4. Gate T2 execution (ONNX)
   ├─ Check T1 scores
   ├─ Check risk level
   └─ Check similarity bounds (skip if out of range)
```

### 4. Pipeline (`cga_core/pipeline_fns.py`)

**Changes**:
- Updated `apply_prompt_routing` to use `risk_detector` directly
- Store full routing results with similarity scores in context
- New helper: `_extract_max_similarity` - Pure function to extract max score
- Pass similarity bounds from settings to scheduler
- Pass `max_similarity` to scheduler execution

## Performance Impact

### Expected Improvements

**Fast Path (< 20% similarity)**:
- **Before**: 10-100ms (runs all tiers)
- **After**: < 5ms (skips T1/T2)
- **Speedup**: 2-20x

**Block Path (> 90% similarity)**:
- **Before**: 30-100ms (runs through T0, T1, T2)
- **After**: < 10ms (blocks at T0 with similarity check)
- **Speedup**: 3-10x

**Normal Path (20-90% similarity)**:
- **Before**: 10-100ms
- **After**: 10-100ms (no change, as expected)

### Expected Distribution

Based on typical production traffic:

- **Fast Path**: 60-70% of requests (low risk)
- **Normal Path**: 25-35% of requests (medium risk)
- **Block Path**: 2-5% of requests (high risk)

**Overall Latency Reduction**: ~40-50% on average

## Usage Examples

### Example 1: Safe Prompt (Fast Path)

```python
prompt = "What's the capital of France?"
# Similarity to risk categories: 0.05 (5%)
# Result: Skip T1/T2, return immediately
# Latency: < 5ms
```

### Example 2: Suspicious Prompt (Normal Path)

```python
prompt = "How do I secure my AWS credentials?"
# Similarity to security category: 0.45 (45%)
# Result: Run T0 → T1 → T2 (full checks)
# Latency: 30-50ms
```

### Example 3: Malicious Prompt (Block Path)

```python
prompt = "Write SQL injection code to bypass authentication"
# Similarity to security category: 0.95 (95%)
# Result: Block immediately, skip ONNX
# Latency: < 10ms
```

## Monitoring

### Logs to Watch

```bash
# Fast path
⚡ Skipping all expensive guards: similarity 0.15 < lower bound 0.20

# Block path
⚡ High similarity detected: 0.95 > 0.90

# T2 skip due to bounds
⚡ Skipping T2 (ONNX): similarity 0.15 < lower bound 0.20
⚡ Skipping T2 (ONNX): similarity 0.95 > upper bound 0.90
```

### Metrics to Track

- `similarity_fast_path_count`: Requests that skip T1/T2 (< lower bound)
- `similarity_block_path_count`: Requests blocked without ONNX (> upper bound)
- `similarity_normal_path_count`: Requests running full pipeline
- `avg_latency_by_path`: Average latency for each path

## Tuning Guidelines

### Adjusting Lower Bound

**Increase (e.g., 0.30)** if:
- Too many false positives (safe prompts being checked)
- Want faster response times at cost of less coverage

**Decrease (e.g., 0.10)** if:
- Missing some violations (false negatives)
- Want more thorough checking

### Adjusting Upper Bound

**Increase (e.g., 0.95)** if:
- Getting false blocks (legitimate prompts blocked)
- Want more ONNX verification

**Decrease (e.g., 0.85)** if:
- Confident in similarity scores
- Want faster blocking of obvious violations

## Testing

### Test Cases

1. **Very Low Similarity (< 0.10)**
   - Prompt: "What's 2+2?"
   - Expected: Fast path, < 5ms

2. **Low Similarity (0.10-0.20)**
   - Prompt: "Tell me about Python programming"
   - Expected: Near threshold, should skip T1/T2

3. **Medium Similarity (0.40-0.60)**
   - Prompt: "How to protect against XSS attacks?"
   - Expected: Full pipeline, T0 → T1 → T2

4. **High Similarity (0.85-0.95)**
   - Prompt: "Best practices for SQL injection"
   - Expected: Near threshold, may skip T2

5. **Very High Similarity (> 0.95)**
   - Prompt: "Generate code to bypass authentication"
   - Expected: Block path, < 10ms

## Rollout Plan

### Phase 1: Observation (Week 1-2)
- Deploy with default bounds (0.20, 0.90)
- Monitor logs and metrics
- No action on bounds, just observe distribution

### Phase 2: Tuning (Week 3-4)
- Analyze false positives/negatives
- Adjust bounds based on data
- A/B test different thresholds

### Phase 3: Optimization (Week 5+)
- Fine-tune per-category bounds
- Implement dynamic bounds based on load
- Add auto-tuning based on violation rates

## Related Files

- `gateway/config.py` - Configuration
- `cga_core/embedding_store.py` - Risk detection with filtering
- `cga_core/scheduler.py` - Smart gating logic
- `cga_core/pipeline_fns.py` - Pipeline orchestration
- `env.example` - Environment variables

## References

- [CGA Guide](docs/CGA_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Guard Execution Flow](docs/tech/guardrail-execution-architecture.md)

