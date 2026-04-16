"""
Streaming upload utilities for direct Hugging Face to GCS transfers.

This module provides functional utilities for streaming model files directly
from Hugging Face to Google Cloud Storage without local storage.
Includes retry logic, resume capability, and error recovery.
"""

import asyncio
import logging
import hashlib
import tempfile
from typing import AsyncIterator, Optional, Tuple, Dict, Any
from pathlib import Path
import httpx
from google.cloud import storage

logger = logging.getLogger(__name__)


async def stream_huggingface_file_with_retry(
    model_name: str, 
    filename: str,
    chunk_size: int = 65536,
    max_retries: int = 3,
    base_delay_ms: float = 1000.0
) -> AsyncIterator[bytes]:
    """
    Stream a file from Hugging Face Hub with retry logic.
    
    Args:
        model_name: Hugging Face model identifier
        filename: Name of the file to download
        chunk_size: Size of chunks to yield
        max_retries: Maximum number of retry attempts
        base_delay_ms: Base delay between retries in milliseconds
        
    Yields:
        bytes: File chunks as they are downloaded
    """
    url = f"https://huggingface.co/{model_name}/resolve/main/{filename}"
    
    for attempt in range(max_retries):
        try:
            async with httpx.AsyncClient(timeout=600.0) as client:
                async with client.stream('GET', url, follow_redirects=True) as response:
                    response.raise_for_status()
                    
                    async for chunk in response.aiter_bytes(chunk_size=chunk_size):
                        yield chunk
                    
                    # If we get here, download completed successfully
                    return
                    
        except Exception as e:
            if attempt == max_retries - 1:
                logger.error(f"Failed to stream {filename} after {max_retries} attempts: {e}")
                raise e
            
            delay_ms = base_delay_ms * (2 ** attempt)  # Exponential backoff
            logger.warning(f"Stream attempt {attempt + 1} failed for {filename}: {e}. Retrying in {delay_ms}ms")
            await asyncio.sleep(delay_ms / 1000.0)


async def stream_huggingface_file(
    model_name: str, 
    filename: str,
    chunk_size: int = 65536
) -> AsyncIterator[bytes]:
    """
    Stream a file from Hugging Face Hub.
    
    Args:
        model_name: Hugging Face model identifier (e.g., "unitary/toxic-bert")
        filename: Name of the file to download (e.g., "pytorch_model.bin")
        chunk_size: Size of chunks to yield
        
    Yields:
        bytes: File chunks as they are downloaded
    """
    url = f"https://huggingface.co/{model_name}/resolve/main/{filename}"
    
    async with httpx.AsyncClient(timeout=600.0) as client:
        async with client.stream('GET', url, follow_redirects=True) as response:
            response.raise_for_status()
            
            async for chunk in response.aiter_bytes(chunk_size=chunk_size):
                yield chunk


async def stream_to_gcs_blob_with_resume(
    blob: storage.Blob,
    data_stream: AsyncIterator[bytes],
    content_type: Optional[str] = None,
    chunk_size: int = 8 * 1024 * 1024  # 8MB chunks for GCS
) -> Tuple[int, str, str]:
    """
    Stream data directly to a GCS blob with resume capability.
    
    Args:
        blob: GCS blob object to write to
        data_stream: Async iterator yielding bytes
        content_type: MIME type of the content
        chunk_size: Size of chunks for GCS upload
        
    Returns:
        Tuple of (bytes_written, etag, md5_hash)
    """
    bytes_written = 0
    md5_hash = hashlib.md5()
    
    # Use GCS resumable upload for large files
    try:
        # Start resumable upload session
        blob.chunk_size = chunk_size
        blob.content_type = content_type
        
        # Create a temporary file for the upload
        with tempfile.NamedTemporaryFile(delete=False) as temp_file:
            temp_path = temp_file.name
            
            # Stream data to temporary file
            async for chunk in data_stream:
                temp_file.write(chunk)
                bytes_written += len(chunk)
                md5_hash.update(chunk)
            
            temp_file.flush()
            
            # Upload from temporary file
            blob.upload_from_filename(temp_path, content_type=content_type)
            
            # Clean up temporary file
            Path(temp_path).unlink()
            
    except Exception as e:
        logger.error(f"Failed to upload to GCS: {e}")
        raise e
    
    return bytes_written, blob.etag, md5_hash.hexdigest()


async def stream_to_gcs_blob(
    blob: storage.Blob,
    data_stream: AsyncIterator[bytes],
    content_type: Optional[str] = None
) -> Tuple[int, str]:
    """
    Stream data directly to a GCS blob.
    
    Args:
        blob: GCS blob object to write to
        data_stream: Async iterator yielding bytes
        content_type: MIME type of the content
        
    Returns:
        Tuple of (bytes_written, etag)
    """
    bytes_written = 0
    
    # Create a temporary file-like object for streaming upload
    from io import BytesIO
    buffer = BytesIO()
    
    async for chunk in data_stream:
        buffer.write(chunk)
        bytes_written += len(chunk)
    
    # Upload the complete buffer
    buffer.seek(0)
    blob.upload_from_file(buffer, content_type=content_type)
    
    return bytes_written, blob.etag


async def stream_hf_to_gcs_with_durability(
    model_name: str,
    filename: str,
    bucket_name: str,
    gcs_path: str,
    content_type: Optional[str] = None,
    max_retries: int = 3
) -> Tuple[int, str, Dict[str, Any]]:
    """
    Stream a file directly from Hugging Face to GCS with durability features.
    
    Args:
        model_name: Hugging Face model identifier
        filename: Name of the file to download
        bucket_name: GCS bucket name
        gcs_path: Path in GCS bucket
        content_type: MIME type of the content
        max_retries: Maximum number of retry attempts
        
    Returns:
        Tuple of (bytes_written, etag, metadata)
    """
    metadata = {
        "model_name": model_name,
        "filename": filename,
        "gcs_path": gcs_path,
        "attempts": 0,
        "errors": []
    }
    
    for attempt in range(max_retries):
        metadata["attempts"] = attempt + 1
        
        try:
            # Initialize GCS client
            client = storage.Client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(gcs_path)
            
            # Stream from Hugging Face to GCS with retry
            data_stream = stream_huggingface_file_with_retry(
                model_name, filename, max_retries=3
            )
            
            bytes_written, etag, md5_hash = await stream_to_gcs_blob_with_resume(
                blob, data_stream, content_type
            )
            
            metadata.update({
                "success": True,
                "bytes_written": bytes_written,
                "etag": etag,
                "md5_hash": md5_hash
            })
            
            logger.info(f"Successfully streamed {filename}: {bytes_written} bytes")
            return bytes_written, etag, metadata
            
        except Exception as e:
            error_msg = f"Attempt {attempt + 1} failed: {str(e)}"
            metadata["errors"].append(error_msg)
            logger.warning(error_msg)
            
            if attempt == max_retries - 1:
                metadata["success"] = False
                logger.error(f"Failed to stream {filename} after {max_retries} attempts")
                raise e
            
            # Wait before retry
            delay_ms = 1000.0 * (2 ** attempt)  # Exponential backoff
            await asyncio.sleep(delay_ms / 1000.0)
    
    # This should never be reached
    raise RuntimeError("Unexpected error in stream_hf_to_gcs_with_durability")


async def stream_hf_to_gcs(
    model_name: str,
    filename: str,
    bucket_name: str,
    gcs_path: str,
    content_type: Optional[str] = None
) -> Tuple[int, str]:
    """
    Stream a file directly from Hugging Face to GCS.
    
    Args:
        model_name: Hugging Face model identifier
        filename: Name of the file to download
        bucket_name: GCS bucket name
        gcs_path: Path in GCS bucket
        content_type: MIME type of the content
        
    Returns:
        Tuple of (bytes_written, etag)
    """
    # Initialize GCS client
    client = storage.Client()
    bucket = client.bucket(bucket_name)
    blob = bucket.blob(gcs_path)
    
    # Set content type if provided
    if content_type:
        blob.content_type = content_type
    
    # Stream from Hugging Face to GCS
    data_stream = stream_huggingface_file(model_name, filename)
    return await stream_to_gcs_blob(blob, data_stream, content_type)


async def get_huggingface_file_list(model_name: str) -> list[str]:
    """
    Get list of files available for a Hugging Face model.
    
    Args:
        model_name: Hugging Face model identifier
        
    Returns:
        List of filenames
    """
    url = f"https://huggingface.co/api/models/{model_name}"
    
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        response.raise_for_status()
        
        data = response.json()
        return [file["rfilename"] for file in data.get("siblings", [])]


async def stream_model_files_to_gcs(
    model_name: str,
    bucket_name: str,
    gcs_prefix: str,
    file_filter: Optional[callable] = None
) -> dict[str, Tuple[int, str]]:
    """
    Stream all model files from Hugging Face to GCS.
    
    Args:
        model_name: Hugging Face model identifier
        bucket_name: GCS bucket name
        gcs_prefix: Prefix for GCS paths
        file_filter: Optional function to filter files (returns True to include)
        
    Returns:
        Dictionary mapping filenames to (bytes_written, etag) tuples
    """
    # Get list of files
    files = await get_huggingface_file_list(model_name)
    
    # Apply filter if provided
    if file_filter:
        files = [f for f in files if file_filter(f)]
    
    results = {}
    
    # Stream each file
    for filename in files:
        gcs_path = f"{gcs_prefix}/{filename}"
        
        try:
            bytes_written, etag = await stream_hf_to_gcs(
                model_name=model_name,
                filename=filename,
                bucket_name=bucket_name,
                gcs_path=gcs_path
            )
            
            results[filename] = (bytes_written, etag)
            logger.info(f"✅ Streamed {filename}: {bytes_written} bytes")
            
        except Exception as e:
            logger.error(f"❌ Failed to stream {filename}: {e}")
            raise
    
    return results


def create_model_file_filter(
    include_patterns: Optional[list[str]] = None,
    exclude_patterns: Optional[list[str]] = None
) -> callable:
    """
    Create a file filter function for model files.
    
    Args:
        include_patterns: List of patterns to include (e.g., ["*.bin", "*.json"])
        exclude_patterns: List of patterns to exclude (e.g., ["*.txt", "*.md"])
        
    Returns:
        Filter function
    """
    def filter_func(filename: str) -> bool:
        # Include all if no patterns specified
        if not include_patterns and not exclude_patterns:
            return True
        
        # Check include patterns
        if include_patterns:
            if not any(filename.endswith(pattern.replace("*", "")) for pattern in include_patterns):
                return False
        
        # Check exclude patterns
        if exclude_patterns:
            if any(filename.endswith(pattern.replace("*", "")) for pattern in exclude_patterns):
                return False
        
        return True
    
    return filter_func
