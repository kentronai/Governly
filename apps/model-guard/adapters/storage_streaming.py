"""
Streaming storage adapter for large models.

This module provides efficient handling of large model files through:
- Partial downloads (only download what's needed)
- Streaming analysis (analyze while downloading)
- Size checks before full download
- Memory-efficient processing
"""

import hashlib
import tempfile
from pathlib import Path
from typing import Optional, Tuple, AsyncIterator
from urllib.parse import urlparse

import httpx


class StreamingScanResult:
    """Result from streaming scan without full download."""
    
    def __init__(self):
        self.format_detected: Optional[str] = None
        self.file_size: Optional[int] = None
        self.first_mb_hash: Optional[str] = None
        self.is_safe_format: bool = False
        self.requires_full_scan: bool = True
        self.early_findings: list = []


class StreamingStorageAdapter:
    """Adapter for efficient handling of large model files."""
    
    def __init__(self, max_size_mb: int = 2000):
        """
        Initialize streaming adapter.
        
        Args:
            max_size_mb: Maximum file size to download (default 2GB)
        """
        self.max_size_mb = max_size_mb
        self.max_size_bytes = max_size_mb * 1024 * 1024
    
    async def check_size(self, uri: str) -> Tuple[int, bool]:
        """
        Check file size before downloading.
        
        Args:
            uri: File URI
            
        Returns:
            Tuple of (size_bytes, is_within_limit)
        """
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.head(uri, follow_redirects=True)
                
                # Get Content-Length header
                size_str = response.headers.get('Content-Length')
                if size_str:
                    size_bytes = int(size_str)
                    is_ok = size_bytes <= self.max_size_bytes
                    return size_bytes, is_ok
                
                # If no Content-Length, assume unknown (proceed with caution)
                return 0, True
                
        except Exception as e:
            # If HEAD request fails, allow download attempt
            return 0, True
    
    async def partial_download(
        self, 
        uri: str, 
        dest_dir: Path,
        num_bytes: int = 1024 * 1024  # 1MB default
    ) -> Tuple[Path, bytes]:
        """
        Download only first N bytes of file for quick analysis.
        
        Args:
            uri: File URI
            dest_dir: Destination directory
            num_bytes: Number of bytes to download
            
        Returns:
            Tuple of (file_path, downloaded_bytes)
        """
        filename = Path(urlparse(uri).path).name or "model_partial"
        dest_path = dest_dir / f"{filename}.partial"
        
        downloaded_bytes = b''
        
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            # Try Range request first
            try:
                headers = {'Range': f'bytes=0-{num_bytes-1}'}
                async with client.stream('GET', uri, headers=headers) as response:
                    if response.status_code in (200, 206):
                        # Range request worked
                        async for chunk in response.aiter_bytes(chunk_size=8192):
                            downloaded_bytes += chunk
                            if len(downloaded_bytes) >= num_bytes:
                                break
                    else:
                        # Range not supported, fall back to regular download
                        raise RuntimeError("Range not supported")
                        
            except Exception:
                # Fallback: Download first N bytes without Range header
                async with client.stream('GET', uri, follow_redirects=True) as response:
                    response.raise_for_status()
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        downloaded_bytes += chunk
                        if len(downloaded_bytes) >= num_bytes:
                            break
        
        # Write partial file
        with open(dest_path, 'wb') as f:
            f.write(downloaded_bytes)
        
        return dest_path, downloaded_bytes
    
    async def quick_scan(self, uri: str) -> StreamingScanResult:
        """
        Perform quick scan by downloading only first 1MB.
        
        This is enough to:
        - Detect file format (magic bytes)
        - Check for pickle usage (first opcodes)
        - Determine if full scan is needed
        
        Args:
            uri: File URI
            
        Returns:
            StreamingScanResult with preliminary findings
        """
        result = StreamingScanResult()
        
        # Check file size first
        file_size, is_ok = await self.check_size(uri)
        result.file_size = file_size
        
        if not is_ok:
            result.requires_full_scan = False
            result.early_findings.append({
                'severity': 'HIGH',
                'title': f'File too large ({file_size / (1024**3):.2f} GB)',
                'recommendation': 'Consider using smaller model or SafeTensors format'
            })
            return result
        
        # Download first 1MB for analysis
        temp_dir = Path(tempfile.mkdtemp(prefix='modelguard_quick_'))
        try:
            partial_path, first_mb = await self.partial_download(
                uri, 
                temp_dir,
                num_bytes=1024 * 1024  # 1MB
            )
            
            # Quick format detection
            from ..modelguard_core.sniff import FormatDetector
            format_type, error = FormatDetector.detect_from_bytes(first_mb)
            result.format_detected = format_type.value if format_type else None
            
            # Calculate hash of first MB
            result.first_mb_hash = hashlib.sha256(first_mb).hexdigest()[:16]
            
            # Check if it's a safe format (SafeTensors, ONNX)
            if format_type and format_type.value in ['safetensors', 'onnx']:
                result.is_safe_format = True
                result.requires_full_scan = True  # Still scan, but likely safe
            
            # Quick pickle check
            if format_type and format_type.value == 'pytorch':
                result.is_safe_format = False
                result.early_findings.append({
                    'severity': 'CRITICAL',
                    'title': 'PyTorch pickle format detected',
                    'recommendation': 'Full scan required - pickle can contain malicious code'
                })
                result.requires_full_scan = True
            
            return result
            
        finally:
            # Cleanup
            import shutil
            if temp_dir.exists():
                shutil.rmtree(temp_dir)
    
    async def download_with_progress(
        self, 
        uri: str, 
        dest_dir: Path,
        on_progress: Optional[callable] = None
    ) -> Tuple[Path, str, int]:
        """
        Download with progress tracking and size monitoring.
        
        Args:
            uri: File URI
            dest_dir: Destination directory
            on_progress: Optional callback(bytes_downloaded, total_bytes)
            
        Returns:
            Tuple of (file_path, sha256_hash, total_bytes)
        """
        # Check size first
        file_size, is_ok = await self.check_size(uri)
        
        if not is_ok:
            raise ValueError(
                f"File too large: {file_size / (1024**3):.2f} GB "
                f"(limit: {self.max_size_mb / 1024} GB)"
            )
        
        # Download with monitoring
        filename = Path(urlparse(uri).path).name or "model"
        dest_path = dest_dir / filename
        
        sha256_hash = hashlib.sha256()
        bytes_downloaded = 0
        
        async with httpx.AsyncClient(timeout=600.0) as client:  # 10 min timeout
            async with client.stream('GET', uri) as response:
                response.raise_for_status()
                
                # Get total size if available
                total_size = int(response.headers.get('Content-Length', 0))
                
                with open(dest_path, 'wb') as f:
                    async for chunk in response.aiter_bytes(chunk_size=65536):  # 64KB chunks
                        f.write(chunk)
                        sha256_hash.update(chunk)
                        bytes_downloaded += len(chunk)
                        
                        # Progress callback
                        if on_progress:
                            on_progress(bytes_downloaded, total_size)
                        
                        # Safety check - abort if exceeds limit
                        if bytes_downloaded > self.max_size_bytes:
                            raise ValueError(f"Download exceeded size limit")
        
        return dest_path, sha256_hash.hexdigest(), bytes_downloaded


async def smart_download(
    uri: str, 
    max_size_mb: int = 2000
) -> Tuple[Path, str, dict]:
    """
    Smart download that handles large files efficiently.
    
    Strategy:
    1. Check file size
    2. Do quick scan (first 1MB)
    3. If safe format, proceed with full download
    4. If risky format, warn user before full download
    
    Args:
        uri: File URI
        max_size_mb: Maximum file size limit
        
    Returns:
        Tuple of (file_path, sha256, scan_metadata)
    """
    adapter = StreamingStorageAdapter(max_size_mb=max_size_mb)
    
    # Step 1: Quick scan
    quick_result = await adapter.quick_scan(uri)
    
    metadata = {
        'file_size': quick_result.file_size,
        'format': quick_result.format_detected,
        'early_findings': quick_result.early_findings,
        'scan_method': 'quick_scan'
    }
    
    # Step 2: Decide whether to proceed with full download
    if quick_result.file_size and quick_result.file_size > (500 * 1024 * 1024):  # > 500MB
        # Large file - only download if safe format
        if not quick_result.is_safe_format:
            raise ValueError(
                f"Large file ({quick_result.file_size / (1024**3):.2f} GB) "
                f"with risky format ({quick_result.format_detected}). "
                "Please convert to SafeTensors or ONNX format."
            )
    
    # Step 3: Full download
    temp_dir = Path(tempfile.mkdtemp(prefix='modelguard_'))
    
    file_path, sha256, total_bytes = await adapter.download_with_progress(
        uri,
        temp_dir
    )
    
    metadata['scan_method'] = 'full_download'
    metadata['total_bytes'] = total_bytes
    metadata['sha256'] = sha256
    
    return file_path, sha256, metadata
