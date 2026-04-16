"""
Google Cloud Storage Service

Handles file uploads to GCS for policy documents and other files.
"""

from typing import Optional
from pathlib import Path
import structlog
from google.cloud import storage
from google.oauth2 import service_account

from gateway.config import get_settings

logger = structlog.get_logger(__name__)


class GCSStorageService:
    """Service for uploading and managing files in Google Cloud Storage"""
    
    def __init__(self):
        """Initialize GCS client with credentials"""
        settings = get_settings()
        
        self.project_id = settings.gcp_project_id
        self.bucket_name = settings.gcs_bucket
        self.credentials_path = settings.gcs_credentials_path
        
        if not self.credentials_path:
            logger.warning("gcs_credentials_not_set", message="GCS credentials path not configured")
            raise ValueError("GCS credentials not configured - set GS_CREDENTIALS_PATH")
        
        if not Path(self.credentials_path).exists():
            raise FileNotFoundError(f"GCS credentials file not found: {self.credentials_path}")
        
        # Initialize credentials and client
        self.credentials = service_account.Credentials.from_service_account_file(
            self.credentials_path
        )
        self.client = storage.Client(
            credentials=self.credentials,
            project=self.project_id
        )
        self.bucket = self.client.bucket(self.bucket_name)
    
    def upload_policy_file(
        self,
        file_data: bytes,
        policy_id: str,
        filename: str,
        content_type: str = "application/pdf"
    ) -> str:
        """
        Upload policy file to GCS
        
        Args:
            file_data: File bytes to upload
            policy_id: Policy UUID
            filename: Original filename
            content_type: MIME type of file
            
        Returns:
            GCS public URL of uploaded file
        """
        # Create GCS path: policies/{policy_id}/{filename}
        gcs_path = f"policies/{policy_id}/{filename}"
        
        # Create blob
        blob = self.bucket.blob(gcs_path)
        
        # Set content type
        blob.content_type = content_type
        
        # Upload file
        blob.upload_from_string(file_data, content_type=content_type)
        
        # Generate public URL
        gcs_url = f"https://storage.googleapis.com/{self.bucket_name}/{gcs_path}"
        
        return gcs_url
    
    def delete_policy_file(self, policy_id: str) -> bool:
        """
        Delete all files for a policy
        
        Args:
            policy_id: Policy UUID
            
        Returns:
            True if successful
        """
        # List all blobs with prefix
        prefix = f"policies/{policy_id}/"
        blobs = self.bucket.list_blobs(prefix=prefix)
        
        # Delete all matching blobs
        for blob in blobs:
            blob.delete()
        
        return True
    
    def get_policy_file_url(self, policy_id: str, filename: str) -> str:
        """
        Get GCS URL for a policy file
        
        Args:
            policy_id: Policy UUID
            filename: Filename
            
        Returns:
            GCS public URL
        """
        gcs_path = f"policies/{policy_id}/{filename}"
        return f"https://storage.googleapis.com/{self.bucket_name}/{gcs_path}"


# Global instance
_gcs_service: Optional[GCSStorageService] = None


def get_gcs_service() -> GCSStorageService:
    """Get or create GCS service instance"""
    global _gcs_service
    if _gcs_service is None:
        _gcs_service = GCSStorageService()
    return _gcs_service
