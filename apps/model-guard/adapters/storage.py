"""
Storage adapters for downloading models from various sources.

This module provides adapters to download models from different storage
providers including HuggingFace, S3, HTTP/HTTPS, and local file system.
"""

import hashlib
import tempfile
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import urlparse

import httpx


class StorageAdapter:
    """Base class for storage adapters."""
    
    async def download(self, uri: str, dest_dir: Path) -> Tuple[Path, str]:
        """
        Download model from URI to destination directory.
        
        Args:
            uri: Model URI
            dest_dir: Destination directory
            
        Returns:
            Tuple of (downloaded_path, sha256_hash)
        """
        raise NotImplementedError


class HTTPStorageAdapter(StorageAdapter):
    """Adapter for downloading models via HTTP/HTTPS."""
    
    async def download(self, uri: str, dest_dir: Path) -> Tuple[Path, str]:
        """
        Download model from HTTP/HTTPS URL.
        
        Args:
            uri: HTTP/HTTPS URL
            dest_dir: Destination directory
            
        Returns:
            Tuple of (downloaded_path, sha256_hash)
        """
        # Extract filename from URL
        parsed = urlparse(uri)
        filename = Path(parsed.path).name
        
        if not filename:
            filename = "model"
        
        dest_path = dest_dir / filename
        
        # Download file
        sha256_hash = hashlib.sha256()
        
        async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
            async with client.stream('GET', uri) as response:
                response.raise_for_status()
                
                with open(dest_path, 'wb') as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)
                        sha256_hash.update(chunk)
        
        return dest_path, sha256_hash.hexdigest()


class S3StorageAdapter(StorageAdapter):
    """Adapter for downloading models from S3."""
    
    async def download(self, uri: str, dest_dir: Path) -> Tuple[Path, str]:
        """
        Download model from S3.
        
        Args:
            uri: S3 URI (s3://bucket/key)
            dest_dir: Destination directory
            
        Returns:
            Tuple of (downloaded_path, sha256_hash)
        """
        # Parse S3 URI
        if not uri.startswith('s3://'):
            raise ValueError(f"Invalid S3 URI: {uri}")
        
        parts = uri[5:].split('/', 1)
        if len(parts) != 2:
            raise ValueError(f"Invalid S3 URI format: {uri}")
        
        bucket, key = parts
        filename = Path(key).name
        dest_path = dest_dir / filename
        
        try:
            import boto3
            from botocore.exceptions import ClientError
            
            # Create S3 client
            s3_client = boto3.client('s3')
            
            # Download file
            sha256_hash = hashlib.sha256()
            
            # Download to temp file first to calculate hash
            with open(dest_path, 'wb') as f:
                s3_client.download_fileobj(
                    bucket,
                    key,
                    f,
                    Callback=lambda bytes_transferred: sha256_hash.update(bytes_transferred)
                )
            
            # Calculate hash from downloaded file
            with open(dest_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b''):
                    sha256_hash.update(chunk)
            
            return dest_path, sha256_hash.hexdigest()
            
        except ImportError:
            raise RuntimeError("boto3 is required for S3 downloads. Install with: pip install boto3")
        except ClientError as e:
            raise RuntimeError(f"S3 download failed: {str(e)}")


class LocalFileAdapter(StorageAdapter):
    """Adapter for accessing local files."""
    
    async def download(self, uri: str, dest_dir: Path) -> Tuple[Path, str]:
        """
        Copy local file to destination directory.
        
        Args:
            uri: File URI (file:///path/to/model)
            dest_dir: Destination directory
            
        Returns:
            Tuple of (downloaded_path, sha256_hash)
        """
        # Parse file URI
        if uri.startswith('file://'):
            file_path = Path(uri[7:])
        else:
            file_path = Path(uri)
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
        
        # Copy to destination
        filename = file_path.name
        dest_path = dest_dir / filename
        
        # Calculate hash while copying
        sha256_hash = hashlib.sha256()
        
        with open(file_path, 'rb') as src_f:
            with open(dest_path, 'wb') as dest_f:
                for chunk in iter(lambda: src_f.read(4096), b''):
                    dest_f.write(chunk)
                    sha256_hash.update(chunk)
        
        return dest_path, sha256_hash.hexdigest()


class StorageManager:
    """Manages model downloads from various storage providers."""
    
    def __init__(self, use_gcs: bool = False, gcs_manager=None):
        """
        Initialize storage manager with adapters.
        
        Args:
            use_gcs: Whether to use GCS for persistent storage
            gcs_manager: GCS manager instance for hybrid approach
        """
        self.adapters = {
            'http': HTTPStorageAdapter(),
            'https': HTTPStorageAdapter(),
            's3': S3StorageAdapter(),
            'file': LocalFileAdapter(),
            'hf': None  # Will be set when hf adapter is imported
        }
        
        self.use_gcs = use_gcs
        self.gcs_manager = gcs_manager
        self.temp_dir = Path(tempfile.mkdtemp(prefix='modelguard_'))
    
    def set_hf_adapter(self, adapter: StorageAdapter) -> None:
        """Set HuggingFace adapter."""
        self.adapters['hf'] = adapter
    
    async def download(self, uri: str) -> Tuple[Path, str, str]:
        """
        Download model from URI using hybrid GCS approach if enabled.
        
        Args:
            uri: Model URI
            
        Returns:
            Tuple of (downloaded_path, sha256_hash, source_type)
        """
        # Determine source type from URI
        if uri.startswith('hf://'):
            source_type = 'hf'
        elif uri.startswith('s3://'):
            source_type = 's3'
        elif uri.startswith('http://') or uri.startswith('https://'):
            source_type = 'https'
        elif uri.startswith('file://') or Path(uri).exists():
            source_type = 'file'
        else:
            raise ValueError(f"Unsupported URI format: {uri}")
        
        # Get appropriate adapter
        adapter = self.adapters.get(source_type)
        if not adapter:
            raise RuntimeError(f"No adapter available for source type: {source_type}")
        
        # Download model to local temp first
        model_path, sha256_hash = await adapter.download(uri, self.temp_dir)
        
        # If using GCS hybrid approach, store in GCS and return GCS path
        if self.use_gcs and self.gcs_manager:
            # Check if model already exists in GCS
            existing_gcs_path = await self.gcs_manager.check_model_exists(uri, sha256_hash)
            
            if existing_gcs_path:
                print(f"✅ Model already exists in GCS, using existing copy")
                # Download from GCS to local temp for scanning
                model_path, sha256_hash = await self.gcs_manager.retrieve_model(existing_gcs_path)
            else:
                print(f"✅ Storing new model in GCS")
                # Store in GCS
                gcs_path = await self.gcs_manager.store_model(model_path, uri, sha256_hash)
                # Download from GCS to local temp for scanning
                model_path, sha256_hash = await self.gcs_manager.retrieve_model(gcs_path)
        
        return model_path, sha256_hash, source_type
    
    def cleanup(self) -> None:
        """Clean up temporary files."""
        import shutil
        if self.temp_dir.exists():
            shutil.rmtree(self.temp_dir)


async def download_model(uri: str, use_gcs: bool = False, gcs_manager=None) -> Tuple[Path, str, str]:
    """
    Convenience function to download a model.
    
    Args:
        uri: Model URI
        use_gcs: Whether to use GCS for persistent storage
        gcs_manager: GCS manager instance for hybrid approach
        
    Returns:
        Tuple of (downloaded_path, sha256_hash, source_type)
    """
    manager = StorageManager(use_gcs=use_gcs, gcs_manager=gcs_manager)
    
    # Import and set HF adapter if available
    try:
        from .hf import HuggingFaceAdapter
        manager.set_hf_adapter(HuggingFaceAdapter())
    except ImportError:
        pass
    
    return await manager.download(uri)
