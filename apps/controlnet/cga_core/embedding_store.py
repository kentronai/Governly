"""
Shared Embedding Store using LanceDB with Auto-Embedding

Uses LanceDB's built-in embedding registry - no manual embedding service needed!
LanceDB automatically handles embeddings on insert and search.

Supports both AWS S3 (s3://) and GCS (gs://) backends via a bucket URI.
"""

import os
import logging
import numpy as np
from typing import List, Dict, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class DetectedRisk:
    """Risk detected from embedding similarity"""
    risk_category: str
    similarity: float
    severity: int
    confidence: float


class EmbeddingStore:
    """
    LanceDB-backed risk prompt store with auto-embedding

    Features:
    - Auto-embeds text using LanceDB's registry (no manual service!)
    - Stores risk prompts with categories
    - Computes centroids per risk category
    - Fast vector similarity search with ANN
    - S3 or GCS persistence (selected via bucket_uri scheme)
    """

    def __init__(
        self,
        bucket_uri: str,
        table_name: str = "risk_prompts",
        model_name: str = "all-MiniLM-L6-v2"
    ):
        """
        Args:
            bucket_uri: Object-storage URI for LanceDB. Either ``s3://<bucket>``
                or ``gs://<bucket>``. The ``/lancedb`` suffix is added
                automatically.
            table_name: LanceDB table name.
            model_name: Sentence-transformers embedding model.
        """
        if not bucket_uri:
            raise ValueError("bucket_uri is required (e.g. 's3://my-bucket' or 'gs://my-bucket')")
        # Strip trailing slash and any pre-existing /lancedb suffix
        normalized = bucket_uri.rstrip("/")
        if normalized.endswith("/lancedb"):
            normalized = normalized[: -len("/lancedb")]
        self.bucket_uri = normalized
        self.table_name = table_name
        self.model_name = model_name
        self.centroids: Dict[str, np.ndarray] = {}

        # Initialize LanceDB with auto-embedding
        try:
            import lancedb
            from lancedb.embeddings import get_registry
            from lancedb.pydantic import LanceModel, Vector

            # Register embedding model (LanceDB handles all encoding!)
            self.embedding_model = get_registry().get("sentence-transformers").create(
                name=model_name,
                device="cpu",
                normalize=True  # Normalized embeddings for cosine similarity
            )

            logger.info(f"✅ Registered embedding model: {model_name}")

            uri = f"{self.bucket_uri}/lancedb"

            # Pick storage_options based on scheme. boto3/AWS picks creds up
            # from env vars (AWS_ACCESS_KEY_ID/SECRET) or instance profile.
            storage_options: Dict[str, str] = {}
            if uri.startswith("s3://"):
                logger.info("🔑 Using AWS env credentials / instance profile for S3-backed LanceDB")
                aws_region = os.environ.get("AWS_REGION") or os.environ.get("AWS_DEFAULT_REGION")
                if aws_region:
                    storage_options["region"] = aws_region
            else:
                logger.info("🔑 Using Application Default Credentials (ADC) for GCS-backed LanceDB")

            self.db = lancedb.connect(uri, storage_options=storage_options)
            
            # Define schema with auto-embedding
            class RiskPrompt(LanceModel):
                prompt: str = self.embedding_model.SourceField()
                vector: Vector(self.embedding_model.ndims()) = self.embedding_model.VectorField()
                risk_category: str
                severity: int = 5
            
            self.RiskPrompt = RiskPrompt
            
            # Open or create table
            try:
                self.table = self.db.open_table(table_name)
                logger.info(f"✅ Opened existing LanceDB table: {table_name}")
            except Exception:
                # Create table with schema
                self.table = self.db.create_table(table_name, schema=RiskPrompt, mode="create")
                logger.info(f"✅ Created new LanceDB table: {table_name}")
            
            logger.info(f"📍 LanceDB storage: {uri}")
            
        except ImportError as e:
            raise ImportError(
                f"lancedb not installed or missing dependencies: {e}\n"
                "Install with: pip install lancedb pyarrow sentence-transformers"
            )
        except Exception as e:
            logger.error(f"Failed to initialize LanceDB: {e}")
            logger.error(f"LanceDB URI: {self.bucket_uri}/lancedb")
            logger.error("")
            logger.error("💡 TROUBLESHOOTING:")
            if self.bucket_uri.startswith("s3://"):
                logger.error("   1. Verify AWS_ACCESS_KEY_ID/SECRET are set or instance profile is attached")
                logger.error(f"   2. Verify S3 bucket exists: aws s3 ls {self.bucket_uri}")
                logger.error("   3. Check IAM permissions on bucket")
            else:
                logger.error("   1. Run: gcloud auth application-default login")
                logger.error(f"   2. Verify GCS bucket exists: gsutil ls {self.bucket_uri}")
                logger.error("   3. Check IAM permissions on bucket")
                logger.error("   4. Verify gcloud credentials mounted: ls -la ~/.config/gcloud/")
            raise
    
    def add_prompts_batch(self, prompts: List[Dict]):
        """
        Add risk prompts in batch (LanceDB auto-embeds!)
        
        Args:
            prompts: List of {prompt, risk_category, severity}
                    (NO vector needed - LanceDB auto-embeds!)
        """
        if not prompts:
            return
        
        try:
            # Add data directly - LanceDB will use the schema to auto-embed
            # Don't create Pydantic instances, just pass raw data
            self.table.add(prompts)
            logger.info(f"✅ Added {len(prompts)} risk prompts (auto-embedded)")
            
            # Recompute centroids
            self.compute_centroids()
        except Exception as e:
            logger.error(f"❌ Error in add_prompts_batch: {e}", exc_info=True)
            raise
    
    def compute_centroids(self) -> Dict[str, np.ndarray]:
        """
        Compute centroid (mean vector) for each risk category
        
        Returns:
            Dict mapping risk_category -> centroid vector
        """
        # Query all data using PyArrow (no pandas needed!)
        arrow_table = self.table.to_arrow()
        
        if arrow_table.num_rows == 0:
            logger.warning("No data in LanceDB to compute centroids")
            return {}
        
        # Convert to dict for easier processing
        categories = arrow_table['risk_category'].to_pylist()
        vectors = arrow_table['vector'].to_pylist()
        
        # Group by risk_category
        category_vectors = {}
        for cat, vec in zip(categories, vectors):
            if cat not in category_vectors:
                category_vectors[cat] = []
            category_vectors[cat].append(vec)
        
        # Compute centroids
        centroids = {}
        for category, vecs in category_vectors.items():
            # Convert to numpy array
            vectors_array = np.array(vecs)
            
            # Compute mean
            centroid = vectors_array.mean(axis=0)
            
            # Normalize
            norm = np.linalg.norm(centroid)
            if norm > 0:
                centroid = centroid / norm
            
            centroids[category] = centroid
        
        self.centroids = centroids
        logger.info(f"✅ Computed {len(centroids)} centroids from {arrow_table.num_rows} examples")
        
        return centroids
    
    def detect_risks(
        self,
        prompt: str,  # Takes TEXT, not vector!
        threshold: float = 0.45,  # Tuned for better detection (catches ~50% similarity)
        top_k: int = 3
    ) -> List[DetectedRisk]:
        """
        Detect risks from prompt using centroids
        
        Returns top_k risks sorted by similarity (ALWAYS returns top_k, ignores threshold).
        Threshold parameter kept for backward compatibility but not used for filtering.
        
        Args:
            prompt: Text prompt (LanceDB auto-embeds!)
            threshold: Similarity threshold (not used, kept for API compat)
            top_k: Number of top risks to return (default 3)
        
        Returns:
            List of top_k detected risks sorted by similarity
        """
        # Ensure centroids are computed
        if not self.centroids:
            self.compute_centroids()
        
        if not self.centroids:
            logger.warning("No centroids available for risk detection")
            return []
        
        # Get embedding for prompt using the embedding model directly
        prompt_vector = self.embedding_model.compute_source_embeddings([prompt])[0]
        
        # Normalize prompt vector (embeddings should be normalized for cosine similarity)
        prompt_norm = np.linalg.norm(prompt_vector)
        if prompt_norm > 0:
            prompt_vector = prompt_vector / prompt_norm
        
        # Compare to ALL centroids (don't filter by threshold)
        all_risks = []
        for category, centroid in self.centroids.items():
            # Dot product of normalized vectors = cosine similarity
            similarity = float(np.dot(prompt_vector, centroid))
            
            logger.debug(f"Risk category '{category}': similarity={similarity:.4f}")
            
            # Add ALL risks (no threshold filtering)
            all_risks.append(DetectedRisk(
                risk_category=category,
                similarity=similarity,
                severity=5,  # Default severity
                confidence=similarity
            ))
        
        # Sort by similarity (highest first)
        all_risks.sort(key=lambda x: x.similarity, reverse=True)
        
        # Return top_k
        top_risks = all_risks[:top_k]
        
        # Log detection summary
        if top_risks:
            logger.info(
                f"Top {len(top_risks)} risks: " + 
                ", ".join([f"{r.risk_category}({r.similarity:.3f})" for r in top_risks])
            )
        
        return top_risks
    
    async def sync_from_database(self, db_session) -> Dict:
        """
        Sync router prompts from PostgreSQL to LanceDB
        
        Reads ALL prompts with risk categories (not just linked ones).
        """
        from sqlalchemy import text
        
        # Query ALL active prompts with risk_category
        query = text("""
            SELECT 
                rp.prompt,
                rp.category as risk_category,
                5 as severity
            FROM router_prompts rp
            WHERE rp.is_active = true
              AND rp.category IS NOT NULL
              -- the store is shared by every tenant: only global rows, never
              -- tenant-tagged ones, may train it
              AND rp.metadata->>'tenant_id' IS NULL
        """)
        
        result = await db_session.execute(query)
        
        rows = result.fetchall()
        
        if not rows:
            logger.warning("No prompts found in database")
            return {"synced": 0}
        
        # Convert to risk prompts (LanceDB will auto-embed)
        risk_prompts = [
            {
                "prompt": row[0],
                "risk_category": row[1],
                "severity": int(row[2])
            }
            for row in rows
        ]
        
        # Add to LanceDB (auto-embeds!)
        self.add_prompts_batch(risk_prompts)
        
        logger.info(f"✅ Synced {len(risk_prompts)} prompts from database")
        
        return {"synced": len(risk_prompts)}
    
    def get_stats(self) -> Dict:
        """Get statistics about the risk prompt store"""
        arrow_table = self.table.to_arrow()
        
        # Get unique categories using PyArrow
        categories = arrow_table['risk_category'].to_pylist() if arrow_table.num_rows > 0 else []
        unique_categories = len(set(categories))
        
        stats = {
            "total_prompts": arrow_table.num_rows,
            "risk_categories": unique_categories,
            "centroids": len(self.centroids),
            "model": self.model_name,
            "storage": f"{self.bucket_uri}/lancedb/{self.table_name}"
        }
        
        # Category counts (no pandas!)
        if arrow_table.num_rows > 0:
            from collections import Counter
            category_counts = Counter(categories)
            stats["category_distribution"] = dict(category_counts)
        
        return stats
