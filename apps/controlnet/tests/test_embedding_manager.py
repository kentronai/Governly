"""
Test Embedding Manager - Centralized Caching

Verifies:
1. Prompt embedding caching works
2. Centroid caching works
3. Cache invalidation works
4. No embeddings created during request time (after first call)
"""

import pytest
import numpy as np
from unittest.mock import Mock, AsyncMock
from cga_core.embedding_manager import (
    EmbeddingManager,
    compute_text_hash,
    normalize_vector,
    EmbeddingCache
)


class TestPureFunctions:
    """Test pure functions (no side effects)"""
    
    def test_compute_text_hash(self):
        """Hash function should be deterministic"""
        text = "hello world"
        hash1 = compute_text_hash(text)
        hash2 = compute_text_hash(text)
        
        assert hash1 == hash2
        assert len(hash1) == 16  # Truncated SHA256
        assert compute_text_hash("different") != hash1
    
    def test_normalize_vector(self):
        """Vector normalization should be idempotent"""
        vector = np.array([3.0, 4.0])
        normalized = normalize_vector(vector)
        
        # Check L2 norm is 1
        assert np.allclose(np.linalg.norm(normalized), 1.0)
        
        # Normalize again should give same result
        normalized2 = normalize_vector(normalized)
        assert np.allclose(normalized, normalized2)
    
    def test_normalize_zero_vector_fails(self):
        """Should fail fast on zero vector"""
        vector = np.array([0.0, 0.0])
        
        with pytest.raises(ValueError, match="Cannot normalize zero vector"):
            normalize_vector(vector)


class TestEmbeddingCache:
    """Test cache data structure"""
    
    def test_create_empty_cache(self):
        """Cache should start empty"""
        cache = EmbeddingCache.create()
        
        assert len(cache.prompt_embeddings) == 0
        assert len(cache.centroid_cache) == 0


class TestEmbeddingManager:
    """Test embedding manager with mocked service"""
    
    @pytest.fixture
    def mock_embedding_service(self):
        """Mock embedding service"""
        service = Mock()
        service.model_name = "test-model"
        service.device = "cpu"
        service.encode = Mock(return_value=np.array([0.6, 0.8]))
        service.batch_encode = Mock(return_value=np.array([[0.6, 0.8], [0.8, 0.6]]))
        return service
    
    @pytest.fixture
    def manager(self, mock_embedding_service):
        """Create manager with mocked service"""
        # Reset singleton
        EmbeddingManager._instance = None
        return EmbeddingManager.create(mock_embedding_service)
    
    def test_singleton_pattern(self, mock_embedding_service):
        """Manager should be singleton"""
        EmbeddingManager._instance = None
        
        manager1 = EmbeddingManager.create(mock_embedding_service)
        manager2 = EmbeddingManager.create(mock_embedding_service)
        
        assert manager1 is manager2
    
    def test_encode_cached_first_call(self, manager, mock_embedding_service):
        """First call should compute embedding"""
        text = "hello world"
        
        vector = manager.encode_cached(text)
        
        # Should call underlying service
        mock_embedding_service.encode.assert_called_once_with(text, normalize=True)
        assert np.array_equal(vector, np.array([0.6, 0.8]))
    
    def test_encode_cached_second_call(self, manager, mock_embedding_service):
        """Second call should use cache (NO embedding during request)"""
        text = "hello world"
        
        # First call
        vector1 = manager.encode_cached(text)
        
        # Reset mock to verify it's not called again
        mock_embedding_service.encode.reset_mock()
        
        # Second call (should use cache)
        vector2 = manager.encode_cached(text)
        
        # Should NOT call underlying service
        mock_embedding_service.encode.assert_not_called()
        assert np.array_equal(vector1, vector2)
    
    def test_encode_without_cache(self, manager, mock_embedding_service):
        """encode() should always compute (no caching)"""
        text = "hello world"
        
        manager.encode(text)
        manager.encode(text)
        
        # Should be called twice (no caching)
        assert mock_embedding_service.encode.call_count == 2
    
    def test_batch_encode(self, manager, mock_embedding_service):
        """Batch encode should bypass cache"""
        texts = ["hello", "world"]
        
        vectors = manager.batch_encode(texts)
        
        mock_embedding_service.batch_encode.assert_called_once_with(texts, normalize=True)
        assert vectors.shape == (2, 2)
    
    def test_centroid_caching(self, manager):
        """Centroids should be cached per tenant"""
        tenant_id = "tenant-123"
        centroids = {
            "safety": np.array([0.1, 0.2]),
            "security": np.array([0.3, 0.4])
        }
        
        # Should be None initially
        assert manager.get_cached_centroids(tenant_id) is None
        
        # Cache centroids
        manager.cache_centroids(tenant_id, centroids)
        
        # Should retrieve from cache
        cached = manager.get_cached_centroids(tenant_id)
        assert cached is not None
        assert "safety" in cached
        assert np.array_equal(cached["safety"], centroids["safety"])
    
    def test_centroid_invalidation(self, manager):
        """Cache invalidation should work"""
        tenant_id = "tenant-123"
        centroids = {"safety": np.array([0.1, 0.2])}
        
        # Cache centroids
        manager.cache_centroids(tenant_id, centroids)
        assert manager.get_cached_centroids(tenant_id) is not None
        
        # Invalidate
        manager.invalidate_centroid_cache(tenant_id)
        assert manager.get_cached_centroids(tenant_id) is None
    
    def test_clear_prompt_cache(self, manager):
        """Clearing prompt cache should work"""
        # Cache some embeddings
        manager.encode_cached("text1")
        manager.encode_cached("text2")
        
        stats = manager.get_cache_stats()
        assert stats["prompt_embeddings_cached"] == 2
        
        # Clear cache
        manager.clear_prompt_cache()
        
        stats = manager.get_cache_stats()
        assert stats["prompt_embeddings_cached"] == 0
    
    def test_cache_stats(self, manager):
        """Cache stats should be accurate"""
        # Cache some data
        manager.encode_cached("text1")
        manager.encode_cached("text2")
        manager.cache_centroids("tenant-1", {"safety": np.array([0.1])})
        manager.cache_centroids("tenant-2", {"security": np.array([0.2])})
        
        stats = manager.get_cache_stats()
        
        assert stats["prompt_embeddings_cached"] == 2
        assert stats["tenants_with_centroids"] == 2
        assert stats["model_name"] == "test-model"
        assert stats["device"] == "cpu"


class TestRequestTimePerformance:
    """Verify no embeddings created during request time"""
    
    @pytest.fixture
    def manager_with_spy(self):
        """Manager with spy to count encode calls"""
        service = Mock()
        service.model_name = "test-model"
        service.device = "cpu"
        
        # Track calls
        call_count = {"encode": 0}
        
        def encode_spy(text, normalize=True):
            call_count["encode"] += 1
            return np.random.rand(384)
        
        service.encode = Mock(side_effect=encode_spy)
        
        EmbeddingManager._instance = None
        manager = EmbeddingManager.create(service)
        
        return manager, call_count
    
    def test_repeated_test_prompt_requests(self, manager_with_spy):
        """
        Simulate repeated /test-prompt requests
        Only first request should create embedding
        """
        manager, call_count = manager_with_spy
        prompt = "How do I hack a website?"
        
        # First request (should create embedding)
        vector1 = manager.encode_cached(prompt)
        assert call_count["encode"] == 1
        
        # Second request (should use cache - NO EMBEDDING CREATED)
        vector2 = manager.encode_cached(prompt)
        assert call_count["encode"] == 1  # Still 1!
        
        # Third request (should still use cache)
        vector3 = manager.encode_cached(prompt)
        assert call_count["encode"] == 1  # Still 1!
        
        # Verify all vectors are identical
        assert np.array_equal(vector1, vector2)
        assert np.array_equal(vector2, vector3)
        
        # This is the key improvement:
        # - Before: encode() called 3 times (~300ms total)
        # - After: encode() called 1 time (~100ms first, ~5ms cached)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

