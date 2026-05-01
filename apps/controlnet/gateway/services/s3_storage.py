"""
AWS S3 Storage Service.

Handles file uploads to S3 for policy documents and other files. Mirrors the
public surface of ``GCSStorageService`` so existing call sites can be swapped
out by the storage factory without changes.
"""

from typing import Optional
import structlog
import boto3
from botocore.exceptions import ClientError

from gateway.config import get_settings

logger = structlog.get_logger(__name__)


class S3StorageService:
    """Service for uploading and managing files in AWS S3."""

    def __init__(self):
        settings = get_settings()

        self.region = settings.aws_region
        self.bucket_name = settings.s3_model_bucket  # general-purpose bucket on EC2

        if not self.bucket_name:
            raise ValueError(
                "S3 bucket not configured - set S3_MODEL_BUCKET (used as the "
                "general-purpose object store on AWS deployments)"
            )

        # boto3 picks creds up from env vars (AWS_ACCESS_KEY_ID/SECRET) or the
        # EC2 instance profile. No credentials JSON file is needed.
        self.client = boto3.client("s3", region_name=self.region)

    def upload_policy_file(
        self,
        file_data: bytes,
        policy_id: str,
        filename: str,
        content_type: str = "application/pdf",
    ) -> str:
        """Upload a policy file to S3 and return its HTTPS URL."""
        key = f"policies/{policy_id}/{filename}"
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=file_data,
            ContentType=content_type,
        )
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{key}"

    def delete_policy_file(self, policy_id: str) -> bool:
        """Delete every object under ``policies/{policy_id}/``."""
        prefix = f"policies/{policy_id}/"
        paginator = self.client.get_paginator("list_objects_v2")
        keys: list[dict] = []
        for page in paginator.paginate(Bucket=self.bucket_name, Prefix=prefix):
            for obj in page.get("Contents", []):
                keys.append({"Key": obj["Key"]})
                if len(keys) == 1000:
                    self.client.delete_objects(
                        Bucket=self.bucket_name,
                        Delete={"Objects": keys},
                    )
                    keys = []
        if keys:
            self.client.delete_objects(
                Bucket=self.bucket_name,
                Delete={"Objects": keys},
            )
        return True

    def get_policy_file_url(self, policy_id: str, filename: str) -> str:
        key = f"policies/{policy_id}/{filename}"
        return f"https://{self.bucket_name}.s3.{self.region}.amazonaws.com/{key}"


_s3_service: Optional[S3StorageService] = None


def get_s3_service() -> S3StorageService:
    """Singleton accessor for the S3 storage service."""
    global _s3_service
    if _s3_service is None:
        _s3_service = S3StorageService()
    return _s3_service
