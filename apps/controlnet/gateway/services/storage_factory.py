"""
Object-storage factory.

Picks an S3 or GCS storage service based on which bucket env var is set.
S3 wins when both are configured, matching the routing logic in
``apps/controlnet/gateway/routes/model_download.py::_get_model_storage_backend``.
"""

from typing import Protocol

from gateway.config import get_settings


class _StorageProto(Protocol):
    bucket_name: str

    def upload_policy_file(
        self,
        file_data: bytes,
        policy_id: str,
        filename: str,
        content_type: str = "application/pdf",
    ) -> str: ...

    def delete_policy_file(self, policy_id: str) -> bool: ...

    def get_policy_file_url(self, policy_id: str, filename: str) -> str: ...


def get_storage_service() -> _StorageProto:
    """Return the S3 service when configured, falling back to GCS."""
    settings = get_settings()
    if settings.s3_model_bucket:
        from gateway.services.s3_storage import get_s3_service
        return get_s3_service()
    if settings.gcs_credentials_path and settings.gcs_bucket:
        from gateway.services.gcs_storage import get_gcs_service
        return get_gcs_service()
    raise RuntimeError(
        "No object storage configured: set either S3_MODEL_BUCKET (AWS) or "
        "GS_BUCKET_NAME + GS_CREDENTIALS_PATH (GCP)."
    )
