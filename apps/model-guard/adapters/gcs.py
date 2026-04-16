"""
Google Cloud Storage adapter for model storage and retrieval.

This module provides functionality to store and retrieve models from Google Cloud Storage,
supporting the hybrid approach where models are stored in GCS and temporarily downloaded
to local storage for scanning.
"""

import hashlib
import os
import tempfile
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import urlparse

from .storage import StorageAdapter


class GCSStorageAdapter(StorageAdapter):
    """Adapter for storing and retrieving models from Google Cloud Storage."""
    
    def __init__(self, bucket_name: str, project_id: str, credentials_path: Optional[str] = None):
        """
        Initialize GCS storage adapter.
        
        Args:
            bucket_name: GCS bucket name
            project_id: Google Cloud project ID
            credentials_path: Path to GCS credentials JSON file
        """
        self.bucket_name = bucket_name
        self.project_id = project_id
        self.credentials_path = credentials_path
        self._client = None
    
    @property
    def client(self):
        """Get or create GCS client."""
        if self._client is None:
            try:
                from google.cloud import storage
                
                # Initialize client with credentials if provided
                if self.credentials_path and os.path.exists(self.credentials_path):
                    self._client = storage.Client.from_service_account_json(
                        self.credentials_path,
                        project=self.project_id
                    )
                else:
                    # Use default credentials (e.g., from environment)
                    self._client = storage.Client(project=self.project_id)
                    
            except ImportError:
                raise RuntimeError(
                    "google-cloud-storage is required for GCS operations. "
                    "Install with: pip install google-cloud-storage"
                )
            except Exception as e:
                raise RuntimeError(f"Failed to initialize GCS client: {str(e)}")
        
        return self._client
    
    def _generate_gcs_path(self, uri: str, sha256_hash: str) -> str:
        """
        Generate GCS object path for a model.
        
        Args:
            uri: Original model URI
            sha256_hash: SHA-256 hash of the model
            
        Returns:
            GCS object path
        """
        # Extract filename from URI
        parsed = urlparse(uri)
        filename = Path(parsed.path).name
        if not filename:
            filename = "model"
        
        # Create organized path: models/{source}/{sha256_prefix}/{filename}
        source = self._get_source_from_uri(uri)
        sha256_prefix = sha256_hash[:8]  # First 8 chars for organization
        
        return f"models/{source}/{sha256_prefix}/{filename}"
    
    def _get_source_from_uri(self, uri: str) -> str:
        """Extract source type from URI."""
        if uri.startswith('hf://'):
            return 'huggingface'
        elif uri.startswith('s3://'):
            return 's3'
        elif uri.startswith('http://') or uri.startswith('https://'):
            return 'http'
        elif uri.startswith('file://'):
            return 'file'
        else:
            return 'unknown'
    
    async def upload_to_gcs(self, local_path: Path, uri: str, sha256_hash: str) -> str:
        """
        Upload a local file to GCS.
        
        Args:
            local_path: Path to local file
            uri: Original model URI
            sha256_hash: SHA-256 hash of the file
            
        Returns:
            GCS object path
        """
        try:
            bucket = self.client.bucket(self.bucket_name)
            gcs_path = self._generate_gcs_path(uri, sha256_hash)
            blob = bucket.blob(gcs_path)
            
            # Upload file to GCS
            blob.upload_from_filename(str(local_path))
            
            print(f"✅ Uploaded model to GCS: gs://{self.bucket_name}/{gcs_path}")
            return gcs_path
            
        except Exception as e:
            raise RuntimeError(f"Failed to upload to GCS: {str(e)}")
    
    async def download_from_gcs(self, gcs_path: str, dest_dir: Path) -> Tuple[Path, str]:
        """
        Download a file from GCS to local directory.
        
        Args:
            gcs_path: GCS object path
            dest_dir: Local destination directory
            
        Returns:
            Tuple of (downloaded_path, sha256_hash)
        """
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(gcs_path)
            
            # Ensure destination directory exists
            dest_dir.mkdir(parents=True, exist_ok=True)
            
            # Extract filename from GCS path
            filename = Path(gcs_path).name
            dest_path = dest_dir / filename
            
            # Check if blob exists
            if not blob.exists():
                raise RuntimeError(f"GCS object does not exist: gs://{self.bucket_name}/{gcs_path}")
            
            # Download file from GCS
            blob.download_to_filename(str(dest_path))
            
            # Verify file was downloaded
            if not dest_path.exists():
                raise RuntimeError(f"Downloaded file does not exist: {dest_path}")
            
            # Calculate SHA-256 hash
            sha256_hash = hashlib.sha256()
            with open(dest_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b''):
                    sha256_hash.update(chunk)
            
            print(f"✅ Downloaded model from GCS: gs://{self.bucket_name}/{gcs_path}")
            return dest_path, sha256_hash.hexdigest()
            
        except Exception as e:
            raise RuntimeError(f"Failed to download from GCS: {str(e)}")
    
    async def check_exists_in_gcs(self, uri: str, sha256_hash: str) -> Optional[str]:
        """
        Check if a model already exists in GCS.
        
        Args:
            uri: Original model URI
            sha256_hash: SHA-256 hash of the model
            
        Returns:
            GCS object path if exists, None otherwise
        """
        try:
            gcs_path = self._generate_gcs_path(uri, sha256_hash)
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(gcs_path)
            
            if blob.exists():
                print(f"✅ Model already exists in GCS: gs://{self.bucket_name}/{gcs_path}")
                return gcs_path
            
            return None
            
        except Exception as e:
            print(f"⚠️  Error checking GCS existence: {e}")
            return None
    
    async def delete_from_gcs(self, gcs_path: str) -> bool:
        """
        Delete a file from GCS.
        
        Args:
            gcs_path: GCS object path
            
        Returns:
            True if deleted, False otherwise
        """
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(gcs_path)
            
            if blob.exists():
                blob.delete()
                print(f"✅ Deleted model from GCS: gs://{self.bucket_name}/{gcs_path}")
                return True
            
            return False
            
        except Exception as e:
            print(f"⚠️  Error deleting from GCS: {e}")
            return False
    
    async def download(self, uri: str, dest_dir: Path) -> Tuple[Path, str]:
        """
        Download model from URI to destination directory.
        
        This method is required by the StorageAdapter interface but is not used
        in the GCS hybrid approach. Use upload_to_gcs and download_from_gcs instead.
        
        Args:
            uri: Model URI
            dest_dir: Destination directory
            
        Returns:
            Tuple of (downloaded_path, sha256_hash)
        """
        raise NotImplementedError(
            "GCS adapter uses upload_to_gcs and download_from_gcs methods instead of download"
        )


class GCSManager:
    """Manager for GCS operations in the hybrid approach."""
    
    def __init__(self, bucket_name: str, project_id: str, credentials_path: Optional[str] = None):
        """
        Initialize GCS manager.
        
        Args:
            bucket_name: GCS bucket name
            project_id: Google Cloud project ID
            credentials_path: Path to GCS credentials JSON file
        """
        self.adapter = GCSStorageAdapter(bucket_name, project_id, credentials_path)
        self.temp_dir = Path(tempfile.mkdtemp(prefix='modelguard_gcs_'))
        # Ensure temp directory exists
        self.temp_dir.mkdir(parents=True, exist_ok=True)
    
    async def store_model(self, local_path: Path, uri: str, sha256_hash: str) -> str:
        """
        Store a model in GCS.
        
        Args:
            local_path: Path to local model file
            uri: Original model URI
            sha256_hash: SHA-256 hash of the model
            
        Returns:
            GCS object path
        """
        return await self.adapter.upload_to_gcs(local_path, uri, sha256_hash)
    
    async def retrieve_model(self, gcs_path: str) -> Tuple[Path, str]:
        """
        Retrieve a model from GCS to local temporary storage.
        
        Args:
            gcs_path: GCS object path
            
        Returns:
            Tuple of (local_path, sha256_hash)
        """
        return await self.adapter.download_from_gcs(gcs_path, self.temp_dir)
    
    async def check_model_exists(self, uri: str, sha256_hash: str) -> Optional[str]:
        """
        Check if a model exists in GCS.
        
        Args:
            uri: Original model URI
            sha256_hash: SHA-256 hash of the model
            
        Returns:
            GCS object path if exists, None otherwise
        """
        return await self.adapter.check_exists_in_gcs(uri, sha256_hash)
    
    def cleanup_temp_files(self) -> None:
        """Clean up temporary files."""
        try:
            import shutil
            if self.temp_dir.exists():
                shutil.rmtree(self.temp_dir)
                print(f"✅ Cleaned up temporary directory: {self.temp_dir}")
        except Exception as e:
            print(f"⚠️  Failed to cleanup temp files: {e}")
    
    def __del__(self):
        """Cleanup on destruction."""
        self.cleanup_temp_files()
