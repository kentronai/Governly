"""
HuggingFace Hub adapter for downloading models.

This module provides functionality to download models from HuggingFace Hub.
"""

import hashlib
from pathlib import Path
from typing import Optional, Tuple

from .storage import StorageAdapter


class HuggingFaceAdapter(StorageAdapter):
    """Adapter for downloading models from HuggingFace Hub."""
    
    async def download(self, uri: str, dest_dir: Path) -> Tuple[Path, str]:
        """
        Download model from HuggingFace Hub.
        
        Args:
            uri: HuggingFace URI (hf://organization/model/file.onnx or hf://organization/model/subfolder/file.onnx)
            dest_dir: Destination directory
            
        Returns:
            Tuple of (downloaded_path, sha256_hash)
        """
        # Parse HuggingFace URI: hf://repo_id/path/to/file
        if not uri.startswith('hf://'):
            raise ValueError(f"Invalid HuggingFace URI: {uri}")
        
        # Remove hf:// prefix
        uri_path = uri[5:]
        
        # Split into parts - repo_id is organization/model, file_path is the rest
        path_parts = uri_path.split('/')
        if len(path_parts) < 3:
            raise ValueError(f"Invalid HuggingFace URI format: {uri}. Expected hf://organization/model/file_path")
        
        # repo_id is organization/model (first two parts)
        repo_id = f"{path_parts[0]}/{path_parts[1]}"
        # file_path is everything after the repo_id
        file_path = '/'.join(path_parts[2:])
        
        try:
            from huggingface_hub import hf_hub_download
            
            # Extract filename for destination
            filename = Path(file_path).name
            dest_path = dest_dir / filename
            
            # Download from HuggingFace
            # hf_hub_download automatically handles authentication via HF_TOKEN env var
            downloaded_path = hf_hub_download(
                repo_id=repo_id,
                filename=file_path,
                cache_dir=str(dest_dir),
                local_dir=str(dest_dir),
                local_dir_use_symlinks=False
            )
            
            # Calculate SHA-256 hash
            sha256_hash = hashlib.sha256()
            with open(downloaded_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b''):
                    sha256_hash.update(chunk)
            
            # Move to final destination if needed
            downloaded_path_obj = Path(downloaded_path)
            if downloaded_path_obj != dest_path:
                import shutil
                shutil.move(str(downloaded_path_obj), str(dest_path))
            
            return dest_path, sha256_hash.hexdigest()
            
        except ImportError:
            raise RuntimeError(
                "huggingface_hub is required for HuggingFace downloads. "
                "Install with: pip install huggingface-hub"
            )
        except Exception as e:
            raise RuntimeError(f"HuggingFace download failed: {str(e)}")


async def download_from_huggingface(
    repo_id: str,
    filename: str,
    dest_dir: Path,
    token: Optional[str] = None
) -> Tuple[Path, str]:
    """
    Convenience function to download from HuggingFace Hub.
    
    Args:
        repo_id: HuggingFace repository ID (e.g., "sentence-transformers/all-MiniLM-L6-v2")
        filename: Path to file in repository (e.g., "pytorch_model.bin")
        dest_dir: Destination directory
        token: Optional HuggingFace API token
        
    Returns:
        Tuple of (downloaded_path, sha256_hash)
    """
    uri = f"hf://{repo_id}/{filename}"
    
    # Set token if provided
    if token:
        import os
        os.environ['HF_TOKEN'] = token
    
    adapter = HuggingFaceAdapter()
    return await adapter.download(uri, dest_dir)
