"""
Scan endpoints for ModelGuard API.

This module provides REST API endpoints for model scanning operations.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
import logging

from gateway.auth import TenantContext, require_tenant_auth
from schemas.scan_request import ScanModelRequest, RescanRequest
from schemas.scan_response import (
    ScanResponseSummary,
    ScanResponseDetailed,
    ScanErrorResponse
)
from services.scan_service import get_scan_service


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/model", response_model=ScanResponseSummary)
async def scan_model(
    request: ScanModelRequest,
    ctx: TenantContext = Depends(require_tenant_auth)
):
    """
    Scan a model from URI.
    
    Supports URIs:
    - HuggingFace: hf://repo/model.onnx
    - S3: s3://bucket/model.pth
    - HTTP: https://example.com/model.safetensors
    - File: file:///path/to/model
    
    Args:
        request: Scan request with model URI
        ctx: Tenant context from authentication
        
    Returns:
        Scan result summary
    """
    logger.info(f"Scanning model from URI: {request.uri} (tenant: {ctx.tenant_id})")
    
    try:
        # Get scan service
        scan_service = await get_scan_service()
        
        # Perform scan
        try:
            result = await scan_service.scan_model(
                uri=request.uri,
                tenant_id=ctx.tenant_id,
                user_id=ctx.auth.user_id,
                scan_options=request.scan_options
            )
        except Exception as e:
            logger.error(f"Scan service error: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Scan service error: {str(e)}"
            )
        
        # Check if scan failed
        if result.get('status') == 'failed':
            raise HTTPException(
                status_code=400,
                detail=result.get('error', 'Scan failed')
            )
        
        # Build response
        severity_counts = result.get('severity_counts', {})
        
        return ScanResponseSummary(
            scan_id=result['scan_id'],
            artifact_id=result['artifact_id'],
            status=result['status'],
            format=result['format'],
            findings_count=result['findings_count'],
            critical_count=severity_counts.get('critical', 0),
            high_count=severity_counts.get('high', 0),
            medium_count=severity_counts.get('medium', 0),
            low_count=severity_counts.get('low', 0),
            info_count=severity_counts.get('info', 0),
            approval_status=result['approval_status'],
            scan_duration_ms=result['scan_duration_ms'],
            created_at=result['created_at'],
            completed_at=result.get('completed_at')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Scan failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Scan failed: {str(e)}"
        )


@router.get("/model/{scan_id}", response_model=ScanResponseDetailed)
async def get_scan_results(
    scan_id: str,
    ctx: TenantContext = Depends(require_tenant_auth)
):
    """
    Get detailed scan results.
    
    Args:
        scan_id: Scan identifier
        ctx: Tenant context from authentication
        
    Returns:
        Detailed scan results with all findings
    """
    # In production, query database for scan results
    # For now, return error
    raise HTTPException(
        status_code=501,
        detail="Get scan results not yet implemented. Query database directly."
    )


@router.post("/upload", response_model=ScanResponseSummary)
async def scan_uploaded_file(
    file: UploadFile = File(...),
    ctx: TenantContext = Depends(require_tenant_auth)
):
    """
    Scan an uploaded model file.
    
    Args:
        file: Uploaded model file
        ctx: Tenant context from authentication
        
    Returns:
        Scan result summary
    """
    logger.info(f"Scanning uploaded file: {file.filename} (tenant: {ctx.tenant_id})")
    
    try:
        # Save uploaded file to temp location
        import tempfile
        from pathlib import Path
        
        temp_dir = Path(tempfile.mkdtemp(prefix='modelguard_upload_'))
        file_path = temp_dir / file.filename
        
        # Write uploaded file
        with open(file_path, 'wb') as f:
            content = await file.read()
            f.write(content)
        
        # Scan using file:// URI
        file_uri = f"file://{file_path}"
        
        # Get scan service
        scan_service = await get_scan_service()
        
        # Perform scan
        result = await scan_service.scan_model(
            uri=file_uri,
            tenant_id=ctx.tenant_id,
            user_id=ctx.auth.user_id,
            scan_options=None
        )
        
        # Check if scan failed
        if result.get('status') == 'failed':
            raise HTTPException(
                status_code=400,
                detail=result.get('error', 'Scan failed')
            )
        
        # Build response
        severity_counts = result.get('severity_counts', {})
        
        return ScanResponseSummary(
            scan_id=result['scan_id'],
            artifact_id=result['artifact_id'],
            status=result['status'],
            format=result['format'],
            findings_count=result['findings_count'],
            critical_count=severity_counts.get('critical', 0),
            high_count=severity_counts.get('high', 0),
            medium_count=severity_counts.get('medium', 0),
            low_count=severity_counts.get('low', 0),
            info_count=severity_counts.get('info', 0),
            approval_status=result['approval_status'],
            scan_duration_ms=result['scan_duration_ms'],
            created_at=result['created_at'],
            completed_at=result.get('completed_at')
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Upload scan failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Scan failed: {str(e)}"
        )
    finally:
        # Cleanup temp files
        try:
            import shutil
            if 'temp_dir' in locals() and temp_dir.exists():
                shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Failed to cleanup temp files: {e}")


@router.get("/formats")
async def list_supported_formats():
    """
    List supported model formats.
    
    Returns:
        List of supported formats with information
    """
    from modelguard_core.sniff import FormatDetector
    from modelguard_core.types import ModelFormat
    
    formats = []
    for format_type in ModelFormat:
        if format_type != ModelFormat.UNKNOWN:
            info = FormatDetector.get_format_info(format_type)
            formats.append({
                'format': format_type.value,
                'name': info['name'],
                'description': info['description'],
                'extensions': info['extensions'],
                'security_concerns': info['security_concerns'],
                'scan_capabilities': info['scan_capabilities']
            })
    
    return {
        'formats': formats,
        'total': len(formats)
    }
