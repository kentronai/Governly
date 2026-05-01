"""
Risk Detector using LanceDB with auto-embedding

This module provides risk detection capabilities using LanceDB's built-in
embedding and vector similarity search. No separate embedding service needed!

Key features:
- Auto-embedding: LanceDB handles text → vector conversion
- Fast similarity search: Detects prompts similar to known risky patterns
- Risk categorization: Returns top-N risk categories with confidence scores
- Object storage persistence: Backed by AWS S3 (s3://) or GCS (gs://)
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
    - Object-storage persistence (S3 or GCS)
    """

    def __init__(self, bucket_uri: str):
        """Initialize with an S3 or GCS bucket URI (e.g. ``s3://my-bucket``)."""
        if not bucket_uri:
            raise ValueError("bucket_uri is required for risk detection")

        self.bucket_uri = bucket_uri
        self.store = EmbeddingStore(bucket_uri=bucket_uri)

    async def detect_risks(
        self,
        prompt: str,
        top_k: int = 3,
        threshold: float = 0.1
    ) -> List[DetectedRisk]:
        """
        Detect risks in a prompt using LanceDB similarity search.

        Args:
            prompt: The prompt to analyze
            top_k: Number of top risk categories to return
            threshold: Minimum confidence threshold (0-1)

        Returns:
            List of DetectedRisk with categories and confidence scores
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
        """Add new risk examples to LanceDB."""
        return await self.store.add_prompts(prompts)

    def get_stats(self):
        """Get risk detector statistics."""
        return self.store.get_stats()


def create_risk_detector(bucket_uri: str) -> RiskDetector:
    """
    Factory function to create a risk detector.

    ``bucket_uri`` should be either ``s3://<bucket>`` (AWS) or
    ``gs://<bucket>`` (GCP). For S3, AWS credentials are picked up from env
    vars or the EC2 instance profile. For GCS, Application Default Credentials
    are used.
    """
    logger = logging.getLogger(__name__)
    logger.info(
        "🚀 Creating risk detector with LanceDB auto-embedding (uri=%s)",
        bucket_uri,
    )
    return RiskDetector(bucket_uri=bucket_uri)
