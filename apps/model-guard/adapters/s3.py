"""
AWS S3 adapter for model storage and retrieval.

Mirrors ``adapters/gcs.py`` so the hybrid storage approach (object store as
durable cache, local temp dir for scanning) works on AWS deployments.
"""

import hashlib
import os
import tempfile
from pathlib import Path
from typing import Optional, Tuple
from urllib.parse import urlparse

from .storage import StorageAdapter


class S3StorageAdapter(StorageAdapter):
    """Adapter for storing and retrieving models from AWS S3."""

    def __init__(self, bucket_name: str, region: str = "us-east-1"):
        self.bucket_name = bucket_name
        self.region = region
        self._client = None

    @property
    def client(self):
        """Lazy boto3 S3 client."""
        if self._client is None:
            try:
                import boto3
            except ImportError:
                raise RuntimeError(
                    "boto3 is required for S3 operations. Install with: pip install boto3"
                )
            try:
                self._client = boto3.client("s3", region_name=self.region)
            except Exception as e:
                raise RuntimeError(f"Failed to initialize S3 client: {str(e)}")
        return self._client

    def _generate_s3_path(self, uri: str, sha256_hash: str) -> str:
        parsed = urlparse(uri)
        filename = Path(parsed.path).name or "model"
        source = self._get_source_from_uri(uri)
        return f"models/{source}/{sha256_hash[:8]}/{filename}"

    def _get_source_from_uri(self, uri: str) -> str:
        if uri.startswith("hf://"):
            return "huggingface"
        if uri.startswith("s3://"):
            return "s3"
        if uri.startswith(("http://", "https://")):
            return "http"
        if uri.startswith("file://"):
            return "file"
        return "unknown"

    async def upload_to_s3(self, local_path: Path, uri: str, sha256_hash: str) -> str:
        try:
            key = self._generate_s3_path(uri, sha256_hash)
            self.client.upload_file(str(local_path), self.bucket_name, key)
            print(f"✅ Uploaded model to S3: s3://{self.bucket_name}/{key}")
            return key
        except Exception as e:
            raise RuntimeError(f"Failed to upload to S3: {str(e)}")

    async def download_from_s3(self, key: str, dest_dir: Path) -> Tuple[Path, str]:
        from botocore.exceptions import ClientError
        try:
            dest_dir.mkdir(parents=True, exist_ok=True)
            filename = Path(key).name
            dest_path = dest_dir / filename

            try:
                self.client.head_object(Bucket=self.bucket_name, Key=key)
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in {"404", "NoSuchKey", "NotFound"}:
                    raise RuntimeError(f"S3 object does not exist: s3://{self.bucket_name}/{key}")
                raise

            self.client.download_file(self.bucket_name, key, str(dest_path))

            if not dest_path.exists():
                raise RuntimeError(f"Downloaded file does not exist: {dest_path}")

            sha256_hash = hashlib.sha256()
            with open(dest_path, "rb") as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    sha256_hash.update(chunk)

            print(f"✅ Downloaded model from S3: s3://{self.bucket_name}/{key}")
            return dest_path, sha256_hash.hexdigest()
        except RuntimeError:
            raise
        except Exception as e:
            raise RuntimeError(f"Failed to download from S3: {str(e)}")

    async def check_exists_in_s3(self, uri: str, sha256_hash: str) -> Optional[str]:
        from botocore.exceptions import ClientError
        try:
            key = self._generate_s3_path(uri, sha256_hash)
            try:
                self.client.head_object(Bucket=self.bucket_name, Key=key)
                print(f"✅ Model already exists in S3: s3://{self.bucket_name}/{key}")
                return key
            except ClientError as e:
                code = e.response.get("Error", {}).get("Code", "")
                if code in {"404", "NoSuchKey", "NotFound"}:
                    return None
                raise
        except Exception as e:
            print(f"⚠️  Error checking S3 existence: {e}")
            return None

    async def delete_from_s3(self, key: str) -> bool:
        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=key)
            print(f"✅ Deleted model from S3: s3://{self.bucket_name}/{key}")
            return True
        except Exception as e:
            print(f"⚠️  Error deleting from S3: {e}")
            return False

    async def download(self, uri: str, dest_dir: Path) -> Tuple[Path, str]:
        raise NotImplementedError(
            "S3 adapter uses upload_to_s3 and download_from_s3 in hybrid mode"
        )


class S3Manager:
    """Manager for S3 operations in the hybrid storage approach."""

    def __init__(self, bucket_name: str, region: str = "us-east-1"):
        self.adapter = S3StorageAdapter(bucket_name, region)
        self.temp_dir = Path(tempfile.mkdtemp(prefix="modelguard_s3_"))
        self.temp_dir.mkdir(parents=True, exist_ok=True)

    async def store_model(self, local_path: Path, uri: str, sha256_hash: str) -> str:
        return await self.adapter.upload_to_s3(local_path, uri, sha256_hash)

    async def retrieve_model(self, key: str) -> Tuple[Path, str]:
        return await self.adapter.download_from_s3(key, self.temp_dir)

    async def check_model_exists(self, uri: str, sha256_hash: str) -> Optional[str]:
        return await self.adapter.check_exists_in_s3(uri, sha256_hash)

    def cleanup_temp_files(self) -> None:
        try:
            import shutil
            if self.temp_dir.exists():
                shutil.rmtree(self.temp_dir)
                print(f"✅ Cleaned up temporary directory: {self.temp_dir}")
        except Exception as e:
            print(f"⚠️  Failed to cleanup temp files: {e}")

    def __del__(self):
        self.cleanup_temp_files()
