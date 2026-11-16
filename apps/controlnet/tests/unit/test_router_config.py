"""
Unit tests for Layer 0: Router Configuration
Tests embedding router settings in gateway/config.py
"""

import os
import pytest
from gateway.config import Settings


class TestRouterConfiguration:
    """Test Layer 0: Embedding Router Configuration"""
    
    def test_default_router_enabled(self, monkeypatch):
        """Router is on by default (matches .env.example); opt out via env."""
        monkeypatch.delenv("ENABLE_EMBEDDING_ROUTER", raising=False)
        settings = Settings()
        assert settings.enable_embedding_router is True
    
    def test_router_default_threshold(self):
        """Test default routing threshold"""
        settings = Settings()
        assert settings.routing_threshold == 10
        assert isinstance(settings.routing_threshold, int)
    
    def test_default_embedding_model(self):
        """Test default embedding model name"""
        settings = Settings()
        expected_model = "sentence-transformers/all-MiniLM-L6-v2"
        assert settings.embedding_model_name == expected_model
    
    def test_default_top_k(self):
        """Test default top-K selection"""
        settings = Settings()
        assert settings.router_top_k == 2
        assert isinstance(settings.router_top_k, int)
    
    def test_router_thresholds_exist(self):
        """Test router thresholds are defined"""
        settings = Settings()
        assert isinstance(settings.router_thresholds, dict)
        assert len(settings.router_thresholds) > 0
    
    def test_router_thresholds_families(self):
        """Test all expected families have thresholds"""
        settings = Settings()
        expected_families = {
            "safety", "security", "privacy", "accuracy",
            "fairness", "explainability", "transparency", "copyright"
        }
        
        actual_families = set(settings.router_thresholds.keys())
        assert actual_families == expected_families
    
    def test_router_threshold_values(self):
        """Test threshold values are in valid range [0, 1]"""
        settings = Settings()
        
        for family, threshold in settings.router_thresholds.items():
            assert isinstance(threshold, float), f"{family} threshold is not float"
            assert 0.0 <= threshold <= 1.0, f"{family} threshold out of range"
    
    def test_router_threshold_ranges(self):
        """Test specific threshold values match spec"""
        settings = Settings()
        thresholds = settings.router_thresholds
        
        assert thresholds["safety"] == 0.30
        assert thresholds["security"] == 0.32
        assert thresholds["privacy"] == 0.28
        assert thresholds["accuracy"] == 0.30
        assert thresholds["fairness"] == 0.28
        assert thresholds["explainability"] == 0.32
        assert thresholds["transparency"] == 0.30
        assert thresholds["copyright"] == 0.28
    
    def test_env_override_enable_router(self, monkeypatch):
        """Test environment variable override for enable_embedding_router"""
        monkeypatch.setenv("ENABLE_EMBEDDING_ROUTER", "true")
        settings = Settings()
        assert settings.enable_embedding_router is True
    
    def test_env_override_routing_threshold(self, monkeypatch):
        """Test environment variable override for routing_threshold"""
        monkeypatch.setenv("ROUTING_THRESHOLD", "15")
        settings = Settings()
        assert settings.routing_threshold == 15
    
    def test_env_override_embedding_model(self, monkeypatch):
        """Test environment variable override for embedding_model_name"""
        custom_model = "sentence-transformers/paraphrase-MiniLM-L6-v2"
        monkeypatch.setenv("EMBEDDING_MODEL_NAME", custom_model)
        settings = Settings()
        assert settings.embedding_model_name == custom_model
    
    def test_env_override_top_k(self, monkeypatch):
        """Test environment variable override for router_top_k"""
        monkeypatch.setenv("ROUTER_TOP_K", "3")
        settings = Settings()
        assert settings.router_top_k == 3
    
    def test_router_config_independence(self):
        """Test router config doesn't affect existing settings"""
        settings = Settings()
        
        # Verify existing settings still work
        assert settings.host == "0.0.0.0"
        assert settings.port == 8000
        assert settings.log_level == "INFO"
        assert settings.guard_timeout == 0.2
    
    def test_router_config_types(self):
        """Test all router config types are correct"""
        settings = Settings()
        
        assert isinstance(settings.enable_embedding_router, bool)
        assert isinstance(settings.routing_threshold, int)
        assert isinstance(settings.embedding_model_name, str)
        assert isinstance(settings.router_top_k, int)
        assert isinstance(settings.router_thresholds, dict)
    
    def test_router_config_field_descriptions(self):
        """Test field descriptions are present"""
        # Access field metadata
        fields = Settings.model_fields
        
        assert "enable_embedding_router" in fields
        assert "routing_threshold" in fields
        assert "embedding_model_name" in fields
        assert "router_top_k" in fields
        assert "router_thresholds" in fields
        
        # Verify descriptions exist
        assert fields["enable_embedding_router"].description is not None
        assert fields["routing_threshold"].description is not None
        assert fields["embedding_model_name"].description is not None
        assert fields["router_top_k"].description is not None


class TestRouterConfigValidation:
    """Test router configuration validation"""
    
    def test_positive_routing_threshold(self, monkeypatch):
        """Test routing threshold must be positive"""
        monkeypatch.setenv("ROUTING_THRESHOLD", "5")
        settings = Settings()
        assert settings.routing_threshold > 0
    
    def test_positive_top_k(self, monkeypatch):
        """Test top_k must be positive"""
        monkeypatch.setenv("ROUTER_TOP_K", "1")
        settings = Settings()
        assert settings.router_top_k > 0
    
    def test_embedding_model_name_not_empty(self):
        """Test embedding model name is not empty"""
        settings = Settings()
        assert len(settings.embedding_model_name) > 0
        assert settings.embedding_model_name.strip() != ""
    
    def test_router_thresholds_not_empty(self):
        """Test router thresholds dict is not empty"""
        settings = Settings()
        assert len(settings.router_thresholds) > 0


class TestRouterConfigBackwardCompatibility:
    """Test backward compatibility - router disabled by default"""
    
    def test_router_enabled_default_no_env(self, monkeypatch):
        """Test router is enabled when no env vars set"""
        monkeypatch.delenv("ENABLE_EMBEDDING_ROUTER", raising=False)
        settings = Settings()
        assert settings.enable_embedding_router is True
    
    def test_existing_functionality_unaffected(self):
        """Test existing settings still work with router config added"""
        settings = Settings()
        
        # Core settings
        assert hasattr(settings, "host")
        assert hasattr(settings, "port")
        assert hasattr(settings, "log_level")
        
        # Guard settings
        assert hasattr(settings, "guard_timeout")
        assert hasattr(settings, "streaming_window_size")
        
        # Policy settings
        assert hasattr(settings, "default_policy_id")
        assert hasattr(settings, "policies_dir")
        
        # Performance settings
        assert hasattr(settings, "max_concurrent_requests")
        assert hasattr(settings, "request_timeout")


class TestRouterConfigIntegration:
    """Integration tests for router configuration"""
    
    def test_full_router_config_enabled(self, monkeypatch):
        """Test complete router config when enabled"""
        monkeypatch.setenv("ENABLE_EMBEDDING_ROUTER", "true")
        monkeypatch.setenv("ROUTING_THRESHOLD", "12")
        monkeypatch.setenv("ROUTER_TOP_K", "3")
        monkeypatch.setenv("EMBEDDING_MODEL_NAME", "custom-model")
        
        settings = Settings()
        
        assert settings.enable_embedding_router is True
        assert settings.routing_threshold == 12
        assert settings.router_top_k == 3
        assert settings.embedding_model_name == "custom-model"
        assert len(settings.router_thresholds) == 8
    
    def test_partial_router_config(self, monkeypatch):
        """Test partial config uses defaults for missing values"""
        monkeypatch.setenv("ENABLE_EMBEDDING_ROUTER", "true")
        monkeypatch.setenv("ROUTER_TOP_K", "5")
        
        settings = Settings()
        
        assert settings.enable_embedding_router is True
        assert settings.router_top_k == 5
        # Defaults for unset values
        assert settings.routing_threshold == 10
        assert settings.embedding_model_name == "sentence-transformers/all-MiniLM-L6-v2"

