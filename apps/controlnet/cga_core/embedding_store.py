"""
Shared Embedding Store using LanceDB + GCS with Auto-Embedding

Uses LanceDB's built-in embedding registry - no manual embedding service needed!
LanceDB automatically handles embeddings on insert and search.
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
    - GCS persistence
    """
    
    def __init__(
        self,
        gcs_bucket: str,
        table_name: str = "risk_prompts",
        model_name: str = "all-MiniLM-L6-v2"
    ):
        self.gcs_bucket = gcs_bucket
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
            
            # Connect to GCS-backed LanceDB
            uri = f"gs://{gcs_bucket}/lancedb"
            
            # ========================================================
            # SIMPLE: Always use ADC (like production!)
            # ========================================================
            logger.info("🔑 Using Application Default Credentials (ADC)")
            logger.info("   ADC automatically finds credentials from:")
            logger.info("   1. Cloud Run service account (production)")
            logger.info("   2. ~/.config/gcloud/application_default_credentials.json (local/Docker)")
            logger.info("   3. GCE/GKE metadata service (if applicable)")
            logger.info("")
            logger.info("   💡 If credentials not found, run: gcloud auth application-default login")
            
            # Empty dict = use ADC (no files, no env vars!)
            self.db = lancedb.connect(uri, storage_options={})
            
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
            logger.error(f"GCS Bucket: {gcs_bucket}")
            logger.error(f"LanceDB URI: gs://{gcs_bucket}/lancedb")
            logger.error("")
            logger.error("💡 TROUBLESHOOTING:")
            logger.error("   1. Run: gcloud auth application-default login")
            logger.error(f"   2. Verify GCS bucket exists: gsutil ls gs://{gcs_bucket}")
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
            "storage": f"gs://{self.gcs_bucket}/lancedb/{self.table_name}"
        }
        
        # Category counts (no pandas!)
        if arrow_table.num_rows > 0:
            from collections import Counter
            category_counts = Counter(categories)
            stats["category_distribution"] = dict(category_counts)
        
        return stats
