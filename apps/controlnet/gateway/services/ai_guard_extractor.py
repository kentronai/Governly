"""
AI-Assisted Guard Parameter Extraction Service.

Uses OpenAI to analyze policy descriptions and extract:
1. Suggested guardrails based on requirements
2. Parameter configurations for each guardrail
3. Composition strategies

This augments user selections with intelligent defaults.
"""

import logging
from typing import Dict, Any, List, Optional
from openai import AsyncOpenAI
import json

logger = logging.getLogger(__name__)


class AIGuardExtractor:
    """
    Extract guardrail configurations from policy descriptions using AI.
    """
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize with OpenAI client."""
        self.client = AsyncOpenAI(api_key=api_key)
        
    SYSTEM_PROMPT = """You are an AI governance expert that analyzes policy descriptions and extracts guardrail configurations.

Given a policy description, you must:
1. Identify which guardrails are mentioned or implied
2. Extract specific parameters for each guardrail
3. Suggest appropriate thresholds and configurations

Available Guardrails:
- pii.detect_pii: Detect PII and provide anonymized version if detected (types: EMAIL, PHONE, SSN, CREDIT_CARD, etc., anonymize_mode: mask/remove)
- toxicity.block: Block toxic content (categories: profanity, harassment, threats)
- toxicity.detect: Detect toxicity without blocking
- safety.toxicity.local_onnx: ONNX-based toxicity detection (threshold: 0-1)
- safety.jailbreak.local_onnx: ONNX jailbreak detection (threshold: 0-1)
- politics.block: Block political content (patterns_strong, patterns_weak, threshold)
- business.financial_compliance: Financial services compliance (compliance_level, require_disclaimers)
- business.competitor_protection: Block competitor mentions (competitors: list)
- business.professional_liability: Block professional advice (blocked_advice_types: list)
- business.brand_tone: Enforce brand voice (unprofessional_patterns, required_tone)
- business.financial_advice_onnx: ONNX financial advice detection
- business.legal_advice_onnx: ONNX legal advice detection
- schema.validate.structure: JSON schema validation (schema_id, required_fields)
- tools.allowlist: Tool allowlist (allowed_tools: list)
- tools.args.validator: Validate tool arguments (required_args, forbidden_patterns)
- tools.result.filter: Filter tool results (max_result_length, forbidden_patterns)

Output Format (JSON):
{
  "suggested_guards": [
    {
      "key": "pii.detect_pii",
      "phase": "input",
      "params": {"types": ["EMAIL", "PHONE"], "anonymize_mode": "mask", "threshold": 1.0},
      "priority": "high",
      "reasoning": "Description mentions protecting customer data"
    }
  ],
  "parameter_suggestions": {
    "pii.detect_pii": {
      "types": ["EMAIL", "PHONE", "SSN"],
      "anonymize_mode": "mask",
      "threshold": 1.0
    },
    "toxicity.block": {
      "categories": ["profanity", "harassment"],
      "threshold": 0.1
    }
  },
  "composition_suggestion": {
    "input": "allOf",
    "output": "allOf"
  },
  "confidence": 0.95
}

Rules:
1. Only suggest guards explicitly or implicitly mentioned in the description
2. Extract specific parameters from the description (e.g., competitor names, thresholds)
3. If description mentions "strict" or "comprehensive", use low thresholds (0.1-0.3)
4. If description mentions "moderate" or "lenient", use higher thresholds (0.5-0.7)
5. Always include reasoning for each suggestion
6. Be conservative - don't over-suggest guards
"""

    USER_TEMPLATE = """Policy Description:
\"\"\"
{description}
\"\"\"

User-Selected Guardrails:
{selected_guardrails}

Task:
1. Analyze the policy description
2. For each user-selected guardrail, suggest appropriate parameters based on the description
3. Identify any additional guardrails that should be recommended (but don't force them)
4. Extract specific values mentioned (e.g., competitor names, compliance levels, thresholds)
5. Return JSON response in the specified format

Focus on extracting concrete parameters from the description. For example:
- If "Vanguard" or "Fidelity" are mentioned, add them to competitor lists
- If "HIPAA" or "financial services" are mentioned, configure compliance accordingly
- If threshold values are mentioned, use those exact values
"""

    async def extract_guard_parameters(
        self,
        description: str,
        selected_guardrails: List[Dict[str, Any]],
        file_content: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract guardrail parameters from policy description.
        
        Args:
            description: Natural language policy description
            selected_guardrails: List of guardrails selected by user (with IDs and keys)
            file_content: Optional uploaded file content (PDF/DOCX text)
            
        Returns:
            Dict with suggested_guards, parameter_suggestions, composition_suggestion, confidence
            
        Raises:
            Exception: If AI extraction fails
        """
        try:
            # Combine description with file content if available
            full_description = description
            if file_content:
                full_description = f"{description}\n\nAdditional Context:\n{file_content}"
            
            # Format selected guardrails for context
            selected_keys = [
                f"- {g.get('key', 'unknown')} (phase: {g.get('phase', 'input')})"
                for g in selected_guardrails
            ]
            selected_str = "\n".join(selected_keys) if selected_keys else "None selected yet"
            
            # Call OpenAI
            prompt = self.USER_TEMPLATE.format(
                description=full_description.strip(),
                selected_guardrails=selected_str
            )
            
            logger.info(f"Extracting guard parameters with AI for description length: {len(full_description)}")
            
            response = await self.client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": self.SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            
            content = response.choices[0].message.content.strip()
            extracted = json.loads(content)
            
            logger.info(f"✅ Extracted {len(extracted.get('suggested_guards', []))} guard suggestions")
            
            return extracted
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            # Return safe fallback
            return {
                "suggested_guards": [],
                "parameter_suggestions": {},
                "composition_suggestion": {"input": "allOf", "output": "allOf"},
                "confidence": 0.0
            }
        except Exception as e:
            logger.error(f"AI guard extraction failed: {e}")
            raise
    
    async def merge_user_selections_with_ai(
        self,
        user_guardrails: List[Dict[str, Any]],
        ai_extraction: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Merge user-selected guardrails with AI-suggested parameters.
        
        Args:
            user_guardrails: Guardrails selected by user from UI
            ai_extraction: AI-extracted parameters and suggestions
            
        Returns:
            Enhanced list of guardrails with merged parameters
        """
        enhanced_guardrails = []
        parameter_suggestions = ai_extraction.get("parameter_suggestions", {})
        
        for user_guard in user_guardrails:
            enhanced = user_guard.copy()
            
            # Get guardrail key from database lookup or user input
            guard_key = user_guard.get("key")
            
            # Merge AI-suggested parameters with user-provided ones
            if guard_key in parameter_suggestions:
                ai_params = parameter_suggestions[guard_key]
                user_params = enhanced.get("params", {})
                
                # User params take precedence, AI fills in gaps
                merged_params = {**ai_params, **user_params}
                enhanced["params"] = merged_params
                
                logger.info(f"✅ Merged AI params for {guard_key}: {merged_params}")
            
            enhanced_guardrails.append(enhanced)
        
        return enhanced_guardrails
    
    async def suggest_additional_guards(
        self,
        description: str,
        current_guards: List[str]
    ) -> List[Dict[str, Any]]:
        """
        Suggest additional guardrails based on description.
        
        Args:
            description: Policy description
            current_guards: List of already selected guardrail keys
            
        Returns:
            List of suggested guardrails not yet selected
        """
        try:
            extraction = await self.extract_guard_parameters(
                description=description,
                selected_guardrails=[{"key": k} for k in current_guards]
            )
            
            suggested = extraction.get("suggested_guards", [])
            
            # Filter out guards already selected
            additional = [
                s for s in suggested
                if s.get("key") not in current_guards
            ]
            
            return additional
            
        except Exception as e:
            logger.error(f"Failed to suggest additional guards: {e}")
            return []



    async def create_dynamic_guardrails_from_prompt(
        self,
        ai_system_policy_prompt: str,
        existing_guardrails: List[Dict]
    ) -> List[Dict]:
        """
        Create dynamic guardrails from AI prompt that will only exist in the policy YAML.
        These are NOT stored in the database.
        
        Returns:
            List of dynamic guardrail definitions for YAML generation
        """
        
        existing_keys = [g.get("key", "") for g in existing_guardrails]
        
        prompt = f"""
        Analyze this policy prompt and create NEW guardrail definitions that don't already exist:
        
        POLICY PROMPT: {ai_system_policy_prompt}
        
        EXISTING GUARDRAILS: {existing_keys}
        
        Create NEW guardrails needed for this policy. Return JSON with "dynamic_guardrails" array.
        
        For each new guardrail:
        {{
        "id": "unique_dynamic_id",
        "key": "category.specific_name", 
        "description": "What this guardrail does",
        "phase": "input" or "output",
        "target": "messages[*].content" or "output" or custom JSONPath,
        "params": {{
            // Specific parameters extracted from the prompt
        }}
        }}
        
        Focus on creating guardrails that are:
        1. NOT covered by existing guardrails
        2. Specific to the policy requirements
        3. Have concrete, actionable parameters
        4. Are enforceable rules, not just descriptions
        
        Examples of good dynamic guardrails:
        - Competitor detection with specific company names
        - Compliance monitoring with specific regulations
        - Industry-specific content filtering
        - Custom business rules
        """
        
        response = await self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        
        try:
            result = json.loads(response.choices[0].message.content)
            dynamic_guardrails = result.get("dynamic_guardrails", [])
            
            logger.info(f"✅ Created {len(dynamic_guardrails)} dynamic guardrails")
            return dynamic_guardrails
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response: {e}")
            return []
    
# Singleton instance
_extractor_instance: Optional[AIGuardExtractor] = None


def get_ai_guard_extractor() -> AIGuardExtractor:
    """Get singleton instance of AIGuardExtractor."""
    global _extractor_instance
    if _extractor_instance is None:
        _extractor_instance = AIGuardExtractor()
    return _extractor_instance

