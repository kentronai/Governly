# Policy Update API Test Suite

## Overview

This document describes the test suite for the Policy Update API endpoint (`PUT /v1/policies/{policy_id}`).

## Test Files

1. **`tests/integration/test_policy_update.py`** - Comprehensive pytest test suite
2. **`test_update_policy_manual.py`** - Manual test script for quick verification

## Test Cases

### 1. Update Policy Metadata Only
- **Test**: `test_update_policy_metadata_only`
- **Purpose**: Verify updating name, description, status without changing guardrails
- **Expected**: Metadata updated, guardrails unchanged, YAML not regenerated

### 2. Add Guardrail to Policy
- **Test**: `test_add_guardrail_to_policy`
- **Purpose**: Verify adding a new guardrail to existing policy
- **Expected**: New guardrail added, YAML regenerated, cache invalidated

### 3. Remove Guardrail from Policy
- **Test**: `test_remove_guardrail_from_policy`
- **Purpose**: Verify removing a guardrail from policy
- **Expected**: Guardrail removed, YAML regenerated, count decreased

### 4. Update Guardrail Parameters
- **Test**: `test_update_guardrail_parameters`
- **Purpose**: Verify updating guardrail parameters (e.g., threshold)
- **Expected**: Parameters updated, YAML regenerated

### 5. Update Guardrail Order
- **Test**: `test_update_guardrail_order`
- **Purpose**: Verify changing guardrail execution order
- **Expected**: Order updated in database

### 6. Remove All Guardrails
- **Test**: `test_remove_all_guardrails`
- **Purpose**: Verify empty guardrails list removes all guardrails
- **Expected**: All guardrails removed, YAML regenerated

### 7. Update Composition Strategy
- **Test**: `test_update_composition_strategy`
- **Purpose**: Verify updating composition (allOf → anyOf)
- **Expected**: Composition updated, YAML regenerated

### 8. Update Nonexistent Policy
- **Test**: `test_update_nonexistent_policy`
- **Purpose**: Verify 404 error for non-existent policy
- **Expected**: HTTPException with status_code 404

### 9. Update with Invalid Guardrail
- **Test**: `test_update_with_invalid_guardrail`
- **Purpose**: Verify error handling for invalid guardrail ID
- **Expected**: HTTPException with status_code 400

### 10. YAML Regeneration Verification
- **Test**: `test_yaml_regeneration_after_update`
- **Purpose**: Verify YAML is regenerated after guardrail changes
- **Expected**: YAML content updated, includes new guardrails

## Running Tests

### Prerequisites
```bash
export DATABASE_URL="postgresql://user:pass@host/db"
```

### Run Integration Tests
```bash
cd apps/controlnet
pytest tests/integration/test_policy_update.py -v -s
```

### Run Manual Test Script
```bash
cd apps/controlnet
python test_update_policy_manual.py
```

### Run Specific Test
```bash
pytest tests/integration/test_policy_update.py::TestPolicyUpdate::test_update_policy_metadata_only -v
```

## API Usage Examples

### Example 1: Update Metadata Only
```bash
curl -X PUT http://localhost:8000/v1/policies/{policy_id} \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-api-key" \
  -H "X-Tenant-ID: tenant-123" \
  -d '{
    "name": "Updated Policy Name",
    "description": "Updated description"
  }'
```

### Example 2: Add Guardrail
```bash
curl -X PUT http://localhost:8000/v1/policies/{policy_id} \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-api-key" \
  -H "X-Tenant-ID: tenant-123" \
  -d '{
    "guardrails": [
      {
        "guardrail_id": "existing-uuid-1",
        "phase": "input",
        "params": {"threshold": 0.5},
        "order_index": 0
      },
      {
        "guardrail_id": "new-uuid-2",  // New guardrail
        "phase": "output",
        "params": {},
        "order_index": 1
      }
    ]
  }'
```

### Example 3: Remove Guardrail
```bash
curl -X PUT http://localhost:8000/v1/policies/{policy_id} \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-api-key" \
  -H "X-Tenant-ID: tenant-123" \
  -d '{
    "guardrails": [
      {
        "guardrail_id": "keep-this-uuid",
        "phase": "input",
        "params": {},
        "order_index": 0
      }
      // Removed guardrail omitted from list
    ]
  }'
```

### Example 4: Update Guardrail Parameters
```bash
curl -X PUT http://localhost:8000/v1/policies/{policy_id} \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-api-key" \
  -H "X-Tenant-ID: tenant-123" \
  -d '{
    "guardrails": [
      {
        "guardrail_id": "existing-uuid",
        "phase": "input",
        "params": {
          "threshold": 0.9,  // Updated from 0.5
          "severity": "high"
        },
        "order_index": 0
      }
    ]
  }'
```

### Example 5: Update Composition Strategy
```bash
curl -X PUT http://localhost:8000/v1/policies/{policy_id} \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: your-api-key" \
  -H "X-Tenant-ID: tenant-123" \
  -d '{
    "composition": {
      "input": "anyOf",  // Changed from allOf
      "output": "seq"    // Changed from allOf
    }
  }'
```

## Expected Response Format

### Success Response
```json
{
  "success": true,
  "policy_id": "uuid-here",
  "name": "Updated Policy Name",
  "description": "Updated description",
  "guardrails_count": 2,
  "application_id": "app-uuid",
  "message": "Policy updated successfully"
}
```

### Error Response (404)
```json
{
  "detail": "Policy {policy_id} not found or doesn't belong to tenant"
}
```

### Error Response (400)
```json
{
  "detail": "Invalid parameters for {guardrail_key}: {error_message}"
}
```

## Database Impact

The update endpoint affects these tables:

1. **`policies`**
   - Updates: `name`, `description`, `status`, `is_active`, `yaml`, `updated_at`, `updated_by`

2. **`policy_guardrails`**
   - Inserts: New guardrails
   - Updates: Existing guardrail params, phase, order_index
   - Deletes: Removed guardrails

3. **`application_policies`**
   - Updates: `application_id`, `policy_name` if changed
   - Inserts: New association if application_id provided
   - Deletes: Removes association if application_id is null/empty

## Cache Invalidation

The update endpoint automatically invalidates the policy cache:
- Memory cache cleared
- Redis cache cleared (if Redis available)
- Next request will recompile policy from database

## YAML Regeneration

YAML is automatically regenerated when:
- Guardrails are added/removed/updated
- Composition strategy changes
- Policy name/description changes (for consistency)

YAML is NOT regenerated when:
- Only metadata (status, is_active) changes without guardrail changes

## Edge Cases Handled

1. ✅ Empty guardrails list removes all guardrails
2. ✅ Invalid guardrail ID returns 400
3. ✅ Non-existent policy returns 404
4. ✅ Tenant isolation (cannot update other tenant's policy)
5. ✅ Parameter validation (invalid params return 400)
6. ✅ Application uniqueness validation
7. ✅ Transaction rollback on errors

## Verification Checklist

- [x] Update metadata only
- [x] Add guardrails
- [x] Remove guardrails
- [x] Update guardrail parameters
- [x] Update guardrail order
- [x] Update composition strategy
- [x] Remove all guardrails
- [x] YAML regeneration
- [x] Cache invalidation
- [x] Application association updates
- [x] Error handling (404, 400)
- [x] Transaction safety

