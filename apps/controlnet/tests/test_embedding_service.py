"""
Tests for Layer 2: Embedding Service
"""

import pytest
import numpy as np
from cga_core.embedding_service import EmbeddingService, SENTENCE_TRANSFORMERS_AVAILABLE


@pytest.mark.skipif(not SENTENCE_TRANSFORMERS_AVAILABLE, reason="sentence-transformers not installed")
@pytest.mark.asyncio
class TestEmbeddingService:
    """Test embedding service singleton pattern"""
    
    async def test_get_instance_loads_model(self):
        """Test that get_instance loads the model"""
        service = await EmbeddingService.get_instance()
        assert service is not None
        assert service._initialized is True
    
    async def test_encode_single_text(self):
        """Test encoding a single text"""
        service = await EmbeddingService.get_instance()
        text = "Test prompt for toxicity detection"
        
        embedding = service.encode(text, normalize=True)
        
        assert isinstance(embedding, np.ndarray)
        assert embedding.shape == (384,), f"Expected 384-dim, got {embedding.shape}"
        assert embedding.dtype == np.float32 or embedding.dtype == np.float64
    
    async def test_encode_normalization(self):
        """Test that embeddings are normalized"""
        service = await EmbeddingService.get_instance()
        text = "Normalized embedding test"
        
        embedding = service.encode(text, normalize=True)
        
        # Check L2 norm is approximately 1 (normalized)
        norm = np.linalg.norm(embedding)
        assert abs(norm - 1.0) < 0.01, f"Expected normalized vector, got norm {norm}"
    
    async def test_batch_encode(self):
        """Test batch encoding multiple texts"""
        service = await EmbeddingService.get_instance()
        texts = [
            "Safety: Toxic content detection",
            "Privacy: PII extraction",
            "Security: Jailbreak attempts"
        ]
        
        embeddings = service.batch_encode(texts, normalize=True)
        
        assert isinstance(embeddings, np.ndarray)
        assert embeddings.shape == (3, 384), f"Expected (3, 384), got {embeddings.shape}"
    
    async def test_singleton_pattern(self):
        """Test that multiple calls return same instance"""
        service1 = await EmbeddingService.get_instance()
        service2 = await EmbeddingService.get_instance()
        
        assert service1 is service2, "Should return same singleton instance"
    
    async def test_similarity_calculation(self):
        """Test that similar texts have high cosine similarity"""
        service = await EmbeddingService.get_instance()
        
        # Similar texts
        text1 = "Hate speech and toxic content"
        text2 = "Violence and harmful language"
        
        # Dissimilar text
        text3 = "What's the weather like today?"
        
        emb1 = service.encode(text1, normalize=True)
        emb2 = service.encode(text2, normalize=True)
        emb3 = service.encode(text3, normalize=True)
        
        # Calculate cosine similarity
        sim_12 = float(np.dot(emb1, emb2))
        sim_13 = float(np.dot(emb1, emb3))
        
        # Similar texts should have higher similarity
        assert sim_12 > sim_13, f"Expected sim(hate, violence) > sim(hate, weather), got {sim_12} vs {sim_13}"


@pytest.mark.asyncio
class TestEmbeddingServiceImportHandling:
    """Test import handling when sentence-transformers not available"""
    
    def test_import_error_message(self):
        """Test that error message is helpful"""
        from cga_core.embedding_service import EmbeddingService
        
        # The actual import check happens at runtime
        # This tests that the code structure is correct
        assert hasattr(EmbeddingService, 'get_instance')

