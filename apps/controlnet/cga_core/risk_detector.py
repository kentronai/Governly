"""
Risk Detector using LanceDB with auto-embedding

This module provides risk detection capabilities using LanceDB's built-in
embedding and vector similarity search. No separate embedding service needed!

Key features:
- Auto-embedding: LanceDB handles text → vector conversion
- Fast similarity search: Detects prompts similar to known risky patterns
- Risk categorization: Returns top-N risk categories with confidence scores
- GCS persistence: Stores all data in Google Cloud Storage
"""

import logging
from typing import List, Dict, Any, Optional
from cga_core.embedding_store import EmbeddingStore, DetectedRisk


class RiskDetector:
    """
    Risk detector using LanceDB with auto-embedding
    
    LanceDB automatically handles:
    - Text → Vector conversion
    - Vector similarity search
    - GCS persistence
    
    No manual embedding service needed!
    """
    
    def __init__(self, gcs_bucket: str):
        """Initialize with GCS bucket (uses ADC for auth)"""
        if not gcs_bucket:
            raise ValueError("GCS_MODEL_BUCKET is required for risk detection")
        
        self.gcs_bucket = gcs_bucket
        self.store = EmbeddingStore(gcs_bucket=gcs_bucket)
    
    async def detect_risks(
        self, 
        prompt: str, 
        top_k: int = 3,
        threshold: float = 0.1
    ) -> List[DetectedRisk]:
        """
        Detect risks in a prompt using LanceDB similarity search
        
        Args:
            prompt: The prompt to analyze
            top_k: Number of top risk categories to return
            threshold: Minimum confidence threshold (0-1)
            
        Returns:
            List of DetectedRisk with categories and confidence scores
            
        Example:
            risks = await detector.detect_risks("Tell me how to hack a website")
            # [DetectedRisk(category="security", confidence=0.85, ...)]
        """
        return self.store.detect_risks(
            prompt=prompt,
            top_k=top_k,
            threshold=threshold
        )
    
    async def add_risk_examples(
        self, 
        prompts: List[Dict[str, str]]
    ) -> int:
        """
        Add new risk examples to LanceDB
        
        Args:
            prompts: List of {category, prompt} dicts
            
        Returns:
            Number of examples added
            
        Example:
            count = await detector.add_risk_examples([
                {"category": "toxicity", "prompt": "I hate you"},
                {"category": "jailbreak", "prompt": "Ignore previous instructions"}
            ])
        """
        return await self.store.add_prompts(prompts)
    
    def get_stats(self):
        """Get risk detector statistics"""
        return self.store.get_stats()


def create_risk_detector(
    gcs_bucket: str
) -> RiskDetector:
    """
    Factory function to create risk detector
    
    Single integration point for the entire application.
    Uses Application Default Credentials (ADC) for GCS access.
    """
    logger = logging.getLogger(__name__)
    logger.info("🚀 Creating risk detector with LanceDB auto-embedding")
    
    # Return risk detector
    return RiskDetector(gcs_bucket=gcs_bucket)
