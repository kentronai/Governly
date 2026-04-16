"""
Hugging Face metadata extractor.

This module provides functionality to extract metadata from Hugging Face Hub
using the HF Hub API for models downloaded from HF repositories.
"""

import asyncio
import json
import re
from typing import Any, Dict, List, Optional, Tuple, TYPE_CHECKING
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel

if TYPE_CHECKING:
    from ..types import ModelMetadata


class HFModelInfo(BaseModel):
    """Hugging Face model information from Hub API."""
    
    model_id: Optional[str] = None
    author: Optional[str] = None
    downloads: Optional[int] = None
    likes: Optional[int] = None
    pipeline_tag: Optional[str] = None
    library_name: Optional[str] = None
    created_at: Optional[str] = None
    last_modified: Optional[str] = None
    private: Optional[bool] = None
    gated: Optional[bool] = None
    tags: List[str] = []
    model_card: Optional[str] = None


class HFMetadataExtractor:
    """Extracts metadata from Hugging Face Hub API."""
    
    def __init__(self, timeout: float = 30.0):
        """
        Initialize HF metadata extractor.
        
        Args:
            timeout: Request timeout in seconds
        """
        self.timeout = timeout
        self.base_url = "https://huggingface.co/api"
    
    def _parse_hf_uri(self, uri: str) -> Optional[str]:
        """
        Parse Hugging Face URI to extract model ID.
        
        Args:
            uri: Hugging Face URI (e.g., hf://chetwinlow1/Ovi/model.safetensors)
            
        Returns:
            Model ID (e.g., chetwinlow1/Ovi) or None if invalid
        """
        if not uri.startswith('hf://'):
            return None
        
        # Remove hf:// prefix
        uri_path = uri[5:]
        
        # Split into parts - repo_id is organization/model
        path_parts = uri_path.split('/')
        if len(path_parts) < 2:
            return None
        
        # Model ID is the first two parts (organization/model)
        return f"{path_parts[0]}/{path_parts[1]}"
    
    def _extract_file_path(self, uri: str) -> Optional[str]:
        """
        Extract file path from Hugging Face URI.
        
        Args:
            uri: Hugging Face URI (e.g., hf://hf-internal-testing/tiny-random-vit/pytorch_model.bin)
            
        Returns:
            File path (e.g., pytorch_model.bin) or None if invalid
        """
        if not uri.startswith('hf://'):
            return None
        
        # Remove hf:// prefix
        uri_path = uri[5:]
        
        # Split into parts
        path_parts = uri_path.split('/')
        if len(path_parts) < 3:
            return None
        
        # File path is everything after the repo_id (first two parts)
        return '/'.join(path_parts[2:])
    
    async def _fetch_model_info(self, model_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch model information from HF Hub API.
        
        Args:
            model_id: Hugging Face model ID (e.g., chetwinlow1/Ovi)
            
        Returns:
            Model information dictionary or None if failed
        """
        url = f"{self.base_url}/models/{model_id}"
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.json()
        except Exception as e:
            print(f"⚠️  Failed to fetch HF model info for {model_id}: {e}")
            return None
    
    async def _fetch_model_card(self, model_id: str) -> Optional[str]:
        """
        Fetch model card content from HF Hub.
        
        Args:
            model_id: Hugging Face model ID
            
        Returns:
            Model card content or None if failed
        """
        url = f"https://huggingface.co/{model_id}/raw/main/README.md"
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.get(url)
                response.raise_for_status()
                return response.text
        except Exception as e:
            print(f"⚠️  Failed to fetch HF model card for {model_id}: {e}")
            return None
    
    def _parse_model_info(self, api_data: Dict[str, Any]) -> HFModelInfo:
        """
        Parse HF Hub API response into structured model info.
        
        Args:
            api_data: Raw API response data
            
        Returns:
            Structured model information
        """
        return HFModelInfo(
            model_id=api_data.get('modelId'),
            author=api_data.get('author'),
            downloads=api_data.get('downloads'),
            likes=api_data.get('likes'),
            pipeline_tag=api_data.get('pipeline_tag'),
            library_name=api_data.get('library_name'),
            created_at=api_data.get('created_at'),
            last_modified=api_data.get('last_modified'),
            private=api_data.get('private'),
            gated=api_data.get('gated'),
            tags=api_data.get('tags', [])
        )
    
    
    async def extract_metadata(self, uri: str) -> Optional[HFModelInfo]:
        """
        Extract Hugging Face metadata from URI.
        
        Args:
            uri: Hugging Face URI (e.g., hf://chetwinlow1/Ovi/model.safetensors)
            
        Returns:
            HF model information or None if extraction failed
        """
        # Parse model ID from URI
        model_id = self._parse_hf_uri(uri)
        if not model_id:
            print(f"⚠️  Invalid HF URI format: {uri}")
            return None
        
        print(f"🔍 Fetching HF metadata for model: {model_id}")
        
        # Fetch model info and model card concurrently
        model_info_task = self._fetch_model_info(model_id)
        model_card_task = self._fetch_model_card(model_id)
        
        try:
            model_info_data, model_card = await asyncio.gather(
                model_info_task,
                model_card_task,
                return_exceptions=True
            )
            
            # Handle exceptions
            if isinstance(model_info_data, Exception):
                print(f"⚠️  Error fetching model info: {model_info_data}")
                return None
            
            if isinstance(model_card, Exception):
                print(f"⚠️  Error fetching model card: {model_card}")
                model_card = None
            
            # Parse model info
            if model_info_data:
                hf_info = self._parse_model_info(model_info_data)
                hf_info.model_card = model_card
                print(f"✅ Successfully fetched HF metadata for {model_id}")
                return hf_info
            else:
                print(f"⚠️  No model info data received for {model_id}")
                return None
                
        except Exception as e:
            print(f"⚠️  Error during HF metadata extraction: {e}")
            return None
    
    def merge_with_model_metadata(
        self, 
        model_metadata: 'ModelMetadata', 
        hf_info: HFModelInfo
    ) -> 'ModelMetadata':
        """
        Merge HF metadata with existing model metadata.
        
        Args:
            model_metadata: Existing model metadata
            hf_info: HF model information
            
        Returns:
            Updated model metadata with HF information
        """
        # Update HF-specific fields
        model_metadata.hf_model_id = hf_info.model_id
        model_metadata.hf_author = hf_info.author
        model_metadata.hf_downloads = hf_info.downloads
        model_metadata.hf_likes = hf_info.likes
        model_metadata.hf_pipeline_tag = hf_info.pipeline_tag
        model_metadata.hf_library_name = hf_info.library_name
        model_metadata.hf_created_at = hf_info.created_at
        model_metadata.hf_last_modified = hf_info.last_modified
        model_metadata.hf_private = hf_info.private
        model_metadata.hf_gated = hf_info.gated
        model_metadata.hf_model_card = hf_info.model_card
        
        # Merge tags
        if hf_info.tags:
            existing_tags = set(model_metadata.tags)
            new_tags = set(hf_info.tags)
            model_metadata.tags = list(existing_tags.union(new_tags))
        
        # Update author if not set
        if not model_metadata.author and hf_info.author:
            model_metadata.author = hf_info.author
        
        # Update license if not set
        if not model_metadata.license and hf_info.model_id:
            # Try to extract license from model card
            if hf_info.model_card:
                license_match = re.search(r'license[:\s]+([^\n\r]+)', hf_info.model_card, re.IGNORECASE)
                if license_match:
                    model_metadata.license = license_match.group(1).strip()
        
        # Update description if not set or generic
        if (not model_metadata.description or 
            model_metadata.description.startswith("PyTorch model") or
            model_metadata.description.startswith("ONNX model")):
            if hf_info.pipeline_tag:
                model_metadata.description = f"HF {hf_info.pipeline_tag} model"
            elif hf_info.library_name:
                model_metadata.description = f"HF {hf_info.library_name} model"
        
        return model_metadata


# Convenience functions for easy integration
async def extract_hf_metadata(uri: str) -> Optional[HFModelInfo]:
    """
    Convenience function to extract HF metadata.
    
    Args:
        uri: Hugging Face URI
        
    Returns:
        HF model information or None
    """
    extractor = HFMetadataExtractor()
    return await extractor.extract_metadata(uri)


