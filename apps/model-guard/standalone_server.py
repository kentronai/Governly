"""
Standalone ModelGuard Server - No Database, No Auth Required.

This is a simplified version for local testing with Postman.
Just run: python standalone_server.py

Then test with:
POST http://localhost:8001/scan
{
  "uri": "https://example.com/model.onnx"
}
"""

import asyncio
import hashlib
import os
import shutil
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx
from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

# Import core scanning modules
from modelguard_core.sniff import FormatDetector
from modelguard_core.types import ModelFormat
from modelguard_core.sbom import build_sbom, extract_sbom_features
from modelguard_core.scanners.pickle_detector import scan_for_pickle
from modelguard_core.scanners.custom_ops_scanner import scan_custom_operators
from modelguard_core.scanners.backdoor_scanner import scan_for_backdoors
from modelguard_core.scanners.metadata_validator import validate_metadata
from modelguard_core.report.json_report import generate_json_report

# Create FastAPI app
app = FastAPI(
    title="ModelGuard Standalone",
    description="Test model security scanning locally",
    version="1.0.0"
)


class ScanRequest(BaseModel):
    """Simple scan request."""
    uri: str
    

class ScanResponse(BaseModel):
    """Simple scan response."""
    scan_id: str
    status: str
    format: str
    findings_count: int
    critical_count: int
    high_count: int
    medium_count: int
    low_count: int
    approval_status: str
    scan_duration_ms: int
    findings: List[Dict[str, Any]]


# Temporary storage
TEMP_DIR = Path(tempfile.gettempdir()) / "modelguard_standalone"
TEMP_DIR.mkdir(exist_ok=True)


def validate_model_file(file_path: Path) -> tuple[bool, str]:
    """
    Validate a model file for basic integrity.
    
    Args:
        file_path: Path to the model file
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        if not file_path.exists():
            return False, "File does not exist"
        
        if not file_path.is_file():
            return False, "Path is not a file"
        
        file_size = file_path.stat().st_size
        if file_size == 0:
            return False, "File is empty"
        
        if file_size < 8:
            return False, "File is too small to be a valid model"
        
        # Check if file is readable
        with open(file_path, 'rb') as f:
            first_bytes = f.read(16)
            if len(first_bytes) == 0:
                return False, "File appears to be empty or unreadable"
        
        return True, ""
        
    except Exception as e:
        return False, f"File validation error: {str(e)}"


async def download_model(uri: str) -> tuple[Path, str]:
    """Download model from URI."""
    print(f"📥 Downloading model from: {uri}")
    
    filename = Path(uri).name or "model"
    dest_path = TEMP_DIR / f"{uuid.uuid4()}_{filename}"
    
    sha256_hash = hashlib.sha256()
    
    if uri.startswith("http://") or uri.startswith("https://"):
        # HTTP download with redirect following
        async with httpx.AsyncClient(timeout=300.0, follow_redirects=True) as client:
            async with client.stream('GET', uri, follow_redirects=True) as response:
                response.raise_for_status()
                
                with open(dest_path, 'wb') as f:
                    async for chunk in response.aiter_bytes(chunk_size=8192):
                        f.write(chunk)
                        sha256_hash.update(chunk)
        
        print(f"✅ Downloaded: {dest_path.stat().st_size / (1024**2):.2f} MB")
        
    elif uri.startswith("file://"):
        # Local file
        source_path = Path(uri[7:])
        if not source_path.exists():
            raise ValueError(f"File not found: {source_path}")
        
        with open(source_path, 'rb') as src:
            with open(dest_path, 'wb') as dst:
                for chunk in iter(lambda: src.read(8192), b''):
                    dst.write(chunk)
                    sha256_hash.update(chunk)
    else:
        raise ValueError(f"Unsupported URI scheme: {uri}")
    
    return dest_path, sha256_hash.hexdigest()


def extract_metadata(model_path: Path, format_type: ModelFormat) -> Dict[str, Any]:
    """Extract metadata from model."""
    print(f"📊 Extracting metadata for format: {format_type.value}")
    
    # Read model data
    with open(model_path, 'rb') as f:
        model_data = f.read()
    
    print(f"📁 Model file size: {len(model_data)} bytes ({len(model_data) / (1024**2):.2f} MB)")
    
    # Import appropriate extractor
    try:
        if format_type == ModelFormat.ONNX:
            from modelguard_core.extract.onnx import ONNXExtractor
            print(f"🔧 Initializing ONNX extractor...")
            extractor = ONNXExtractor(model_data)
        elif format_type == ModelFormat.PYTORCH:
            from modelguard_core.extract.pytorch import PyTorchExtractor
            print(f"🔧 Initializing PyTorch extractor...")
            extractor = PyTorchExtractor(model_data)
        elif format_type == ModelFormat.SAFETENSORS:
            from modelguard_core.extract.safetensors import SafeTensorsExtractor
            print(f"🔧 Initializing SafeTensors extractor...")
            extractor = SafeTensorsExtractor(model_data)
        elif format_type == ModelFormat.KERAS:
            from modelguard_core.extract.keras import KerasExtractor
            print(f"🔧 Initializing Keras extractor...")
            extractor = KerasExtractor(model_data)
        else:
            # Return minimal metadata for unsupported formats
            from modelguard_core.types import ModelMetadata
            print(f"⚠️ Unsupported format, returning minimal metadata")
            return ModelMetadata(
                format=format_type,
                file_size=len(model_data)
            )
        
        print(f"🔍 Extracting metadata...")
        metadata = extractor.extract_metadata()
        print(f"✅ Metadata extracted successfully")
        return metadata
        
    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error during metadata extraction: {error_msg}")
        
        # Provide specific guidance for common issues
        if "corrupted or invalid" in error_msg.lower():
            print(f"💡 This appears to be a corrupted ONNX file. Please verify the file integrity.")
        elif "not available" in error_msg.lower():
            print(f"💡 Missing required library. Please install the necessary dependencies.")
        elif "protobuf" in error_msg.lower():
            print(f"💡 Protobuf parsing error. The file may be in an unsupported ONNX version.")
        
        # Re-raise the exception with additional context
        raise RuntimeError(f"Failed to extract metadata from {format_type.value} model: {error_msg}")


def run_scanners(model_path: Path, format_type: ModelFormat, sbom_features: Any) -> List[Dict]:
    """Run all security scanners using SBOM features."""
    print(f"🔍 Running security scanners...")
    
    all_findings = []
    
    # Scanner 1: Pickle Detector (still uses model_path and format_type)
    findings = scan_for_pickle(model_path, format_type)
    all_findings.extend([{
        'id': f.id,
        'type': f.type,
        'severity': f.severity.value,
        'title': f.title,
        'description': f.description,
        'recommendation': f.recommendation,
        'scanner': f.scanner
    } for f in findings])
    print(f"  ✓ Pickle detector: {len(findings)} findings")
    
    # Scanner 2: Custom Ops Scanner (now uses SBOM features)
    findings = scan_custom_operators(sbom_features, format_type)
    all_findings.extend([{
        'id': f.id,
        'type': f.type,
        'severity': f.severity.value,
        'title': f.title,
        'description': f.description,
        'recommendation': f.recommendation,
        'scanner': f.scanner
    } for f in findings])
    print(f"  ✓ Custom ops scanner: {len(findings)} findings")
    
    # Scanner 3: Backdoor Scanner (now uses SBOM features)
    findings = scan_for_backdoors(sbom_features, format_type)
    all_findings.extend([{
        'id': f.id,
        'type': f.type,
        'severity': f.severity.value,
        'title': f.title,
        'description': f.description,
        'recommendation': f.recommendation,
        'scanner': f.scanner
    } for f in findings])
    print(f"  ✓ Backdoor scanner: {len(findings)} findings")
    
    # Scanner 4: Metadata Validator (now uses SBOM features)
    findings = validate_metadata(sbom_features, format_type)
    all_findings.extend([{
        'id': f.id,
        'type': f.type,
        'severity': f.severity.value,
        'title': f.title,
        'description': f.description,
        'recommendation': f.recommendation,
        'scanner': f.scanner
    } for f in findings])
    print(f"  ✓ Metadata validator: {len(findings)} findings")
    
    print(f"🔍 Total findings: {len(all_findings)}")
    return all_findings


def calculate_severity_counts(findings: List[Dict]) -> Dict[str, int]:
    """Calculate severity counts."""
    counts = {'critical': 0, 'high': 0, 'medium': 0, 'low': 0, 'info': 0}
    for finding in findings:
        severity = finding['severity']
        if severity in counts:
            counts[severity] += 1
    return counts


def determine_approval(severity_counts: Dict[str, int]) -> str:
    """Determine approval status."""
    if severity_counts['critical'] > 0:
        return "rejected"
    elif severity_counts['high'] > 0:
        return "pending_review"
    elif severity_counts['medium'] > 5:
        return "pending_review"
    else:
        return "approved"


@app.get("/")
async def root():
    """Root endpoint with usage info."""
    return {
        "service": "ModelGuard Standalone",
        "version": "1.0.0",
        "usage": {
            "scan_from_url": "POST /scan with body: {\"uri\": \"https://example.com/model.onnx\"}",
            "scan_upload": "POST /scan/upload with multipart form data",
            "debug_onnx": "POST /debug/onnx with multipart form data (for troubleshooting ONNX files)",
            "supported_formats": "GET /formats",
            "cleanup": "POST /cleanup to clean temporary files"
        },
        "note": "No authentication required for testing"
    }


@app.get("/health")
async def health():
    """Health check."""
    return {"status": "healthy"}


@app.get("/formats")
async def list_formats():
    """List supported model formats."""
    formats = []
    for format_type in ModelFormat:
        if format_type != ModelFormat.UNKNOWN:
            info = FormatDetector.get_format_info(format_type)
            formats.append({
                'format': format_type.value,
                'name': info['name'],
                'description': info['description'],
                'extensions': info['extensions']
            })
    
    return {"formats": formats, "total": len(formats)}


@app.post("/debug/onnx")
async def debug_onnx_file(file: UploadFile = File(...)):
    """
    Debug ONNX file to help diagnose parsing issues.
    
    This endpoint provides detailed information about an ONNX file
    without attempting to extract full metadata.
    """
    temp_path = None
    
    try:
        # Save uploaded file
        temp_path = TEMP_DIR / f"debug_{uuid.uuid4()}_{file.filename}"
        
        with open(temp_path, 'wb') as f:
            content = await file.read()
            f.write(content)
        
        file_size = temp_path.stat().st_size
        
        # Basic file info
        debug_info = {
            "filename": file.filename,
            "file_size_bytes": file_size,
            "file_size_mb": round(file_size / (1024**2), 2),
            "validation": {},
            "format_detection": {},
            "onnx_analysis": {}
        }
        
        # File validation
        is_valid, validation_error = validate_model_file(temp_path)
        debug_info["validation"] = {
            "is_valid": is_valid,
            "error": validation_error if not is_valid else None
        }
        
        if not is_valid:
            return debug_info
        
        # Format detection
        try:
            detected_format, error = FormatDetector.detect_from_file(temp_path)
            debug_info["format_detection"] = {
                "detected_format": detected_format.value if detected_format != ModelFormat.UNKNOWN else "unknown",
                "error": error if detected_format == ModelFormat.UNKNOWN else None
            }
        except Exception as e:
            debug_info["format_detection"] = {
                "detected_format": "unknown",
                "error": str(e)
            }
        
        # ONNX-specific analysis
        if debug_info["format_detection"]["detected_format"] == "onnx":
            try:
                with open(temp_path, 'rb') as f:
                    model_data = f.read()
                
                # Check first few bytes
                first_bytes = model_data[:32]
                debug_info["onnx_analysis"]["first_bytes_hex"] = first_bytes.hex()
                debug_info["onnx_analysis"]["first_bytes_ascii"] = ''.join(
                    chr(b) if 32 <= b <= 126 else '.' for b in first_bytes
                )
                
                # Try to import ONNX
                try:
                    import onnx
                    debug_info["onnx_analysis"]["onnx_version"] = onnx.__version__
                    debug_info["onnx_analysis"]["onnx_available"] = True
                except ImportError:
                    debug_info["onnx_analysis"]["onnx_available"] = False
                    debug_info["onnx_analysis"]["error"] = "ONNX library not installed"
                
                # Try basic ONNX loading
                if debug_info["onnx_analysis"].get("onnx_available", False):
                    try:
                        from modelguard_core.extract.onnx import ONNXExtractor
                        extractor = ONNXExtractor(model_data)
                        debug_info["onnx_analysis"]["load_successful"] = True
                        debug_info["onnx_analysis"]["model_loaded"] = extractor.model is not None
                    except Exception as e:
                        debug_info["onnx_analysis"]["load_successful"] = False
                        debug_info["onnx_analysis"]["error"] = str(e)
                
            except Exception as e:
                debug_info["onnx_analysis"]["error"] = f"Analysis failed: {str(e)}"
        
        return debug_info
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Debug analysis failed: {str(e)}")
    
    finally:
        # Cleanup
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)


@app.post("/cleanup")
async def cleanup_temp_files():
    """Clean up temporary model files."""
    try:
        if TEMP_DIR.exists():
            # Count files before cleanup
            files_before = list(TEMP_DIR.glob("*"))
            total_size_before = sum(f.stat().st_size for f in files_before if f.is_file())
            
            # Delete all files in temp directory
            for file_path in files_before:
                try:
                    if file_path.is_file():
                        file_path.unlink()
                except Exception as e:
                    print(f"Could not delete {file_path}: {e}")
            
            # Count after cleanup
            files_after = list(TEMP_DIR.glob("*"))
            deleted_count = len(files_before) - len(files_after)
            
            return {
                "status": "success",
                "deleted_files": deleted_count,
                "space_freed_mb": round(total_size_before / (1024**2), 2),
                "message": f"Cleaned up {deleted_count} temporary files, freed {total_size_before / (1024**2):.2f} MB"
            }
        else:
            return {
                "status": "success",
                "deleted_files": 0,
                "space_freed_mb": 0,
                "message": "No temporary files found"
            }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Cleanup failed: {str(e)}")


@app.post("/scan", response_model=ScanResponse)
async def scan_model(request: ScanRequest):
    """
    Scan a model from URI.
    
    Example:
    POST /scan
    {
      "uri": "https://example.com/model.onnx"
    }
    
    Or local file:
    {
      "uri": "file:///path/to/model.pth"
    }
    """
    scan_id = str(uuid.uuid4())
    start_time = time.time()
    
    print(f"\n{'='*60}")
    print(f"🔍 Starting scan: {scan_id}")
    print(f"{'='*60}")
    
    try:
        # Step 1: Download model
        model_path, sha256 = await download_model(request.uri)
        
        # Step 1.5: Validate downloaded file
        print(f"🔍 Validating downloaded file...")
        is_valid, validation_error = validate_model_file(model_path)
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Downloaded file validation failed: {validation_error}"
            )
        print(f"✅ File validation passed")
        
        # Step 2: Detect format
        print(f"🔎 Detecting format...")
        detected_format, error = FormatDetector.detect_from_file(model_path)
        
        if detected_format == ModelFormat.UNKNOWN:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown model format: {error}"
            )
        
        print(f"✅ Format detected: {detected_format.value}")
        
        # Step 3: Extract metadata
        metadata = extract_metadata(model_path, detected_format)
        
        # Step 4: Generate SBOM
        print(f"📋 Generating SBOM...")
        try:
            sbom = build_sbom(model_path, detected_format, metadata)
            print(f"✅ SBOM generated with {len(sbom.components)} components")
        except Exception as e:
            print(f"⚠️ SBOM generation failed: {e}")
            sbom = None
        
        # Step 5: Extract SBOM features for scanners
        print(f"🔍 Extracting SBOM features...")
        try:
            sbom_features = extract_sbom_features(sbom) if sbom else None
            print(f"✅ SBOM features extracted")
        except Exception as e:
            print(f"⚠️ SBOM feature extraction failed: {e}")
            sbom_features = None
        
        # Step 6: Run scanners with SBOM features
        if sbom_features is None:
            print(f"⚠️ Running scanners without SBOM features (fallback mode)")
        findings = run_scanners(model_path, detected_format, sbom_features)
        
        # Step 7: Calculate results
        severity_counts = calculate_severity_counts(findings)
        approval_status = determine_approval(severity_counts)
        
        scan_duration_ms = int((time.time() - start_time) * 1000)
        
        print(f"\n📊 Scan Results:")
        print(f"  Total findings: {len(findings)}")
        print(f"  Critical: {severity_counts['critical']}")
        print(f"  High: {severity_counts['high']}")
        print(f"  Medium: {severity_counts['medium']}")
        print(f"  Low: {severity_counts['low']}")
        print(f"  Approval: {approval_status.upper()}")
        print(f"  Duration: {scan_duration_ms}ms")
        print(f"{'='*60}\n")
        
        # Cleanup downloaded file
        try:
            model_path.unlink(missing_ok=True)
            print(f"🧹 Cleaned up: {model_path.name}")
        except Exception as e:
            print(f"⚠️ Cleanup warning: {e}")
        
        return ScanResponse(
            scan_id=scan_id,
            status="completed",
            format=detected_format.value,
            findings_count=len(findings),
            critical_count=severity_counts['critical'],
            high_count=severity_counts['high'],
            medium_count=severity_counts['medium'],
            low_count=severity_counts['low'],
            approval_status=approval_status,
            scan_duration_ms=scan_duration_ms,
            findings=findings
        )
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/scan/upload")
async def scan_uploaded_file(file: UploadFile = File(...)):
    """
    Scan an uploaded model file.
    
    Use Postman:
    - Method: POST
    - URL: http://localhost:8001/scan/upload
    - Body: form-data
    - Key: file (type: File)
    - Value: Select your model file
    """
    scan_id = str(uuid.uuid4())
    start_time = time.time()
    
    print(f"\n{'='*60}")
    print(f"🔍 Starting scan: {scan_id}")
    print(f"📁 Uploaded file: {file.filename}")
    print(f"{'='*60}")
    
    temp_path = None
    
    try:
        # Save uploaded file
        temp_path = TEMP_DIR / f"{scan_id}_{file.filename}"
        
        with open(temp_path, 'wb') as f:
            content = await file.read()
            f.write(content)
        
        print(f"✅ File saved: {temp_path.stat().st_size / (1024**2):.2f} MB")
        
        # Validate uploaded file
        print(f"🔍 Validating uploaded file...")
        is_valid, validation_error = validate_model_file(temp_path)
        if not is_valid:
            raise HTTPException(
                status_code=400,
                detail=f"Uploaded file validation failed: {validation_error}"
            )
        print(f"✅ File validation passed")
        
        # Detect format
        print(f"🔎 Detecting format...")
        detected_format, error = FormatDetector.detect_from_file(temp_path)
        
        if detected_format == ModelFormat.UNKNOWN:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown model format: {error}"
            )
        
        print(f"✅ Format detected: {detected_format.value}")
        
        # Extract metadata
        metadata = extract_metadata(temp_path, detected_format)
        
        # Generate SBOM
        print(f"📋 Generating SBOM...")
        try:
            sbom = build_sbom(temp_path, detected_format, metadata)
            print(f"✅ SBOM generated with {len(sbom.components)} components")
        except Exception as e:
            print(f"⚠️ SBOM generation failed: {e}")
            sbom = None
        
        # Extract SBOM features for scanners
        print(f"🔍 Extracting SBOM features...")
        try:
            sbom_features = extract_sbom_features(sbom) if sbom else None
            print(f"✅ SBOM features extracted")
        except Exception as e:
            print(f"⚠️ SBOM feature extraction failed: {e}")
            sbom_features = None
        
        # Run scanners with SBOM features
        if sbom_features is None:
            print(f"⚠️ Running scanners without SBOM features (fallback mode)")
        findings = run_scanners(temp_path, detected_format, sbom_features)
        
        # Calculate results
        severity_counts = calculate_severity_counts(findings)
        approval_status = determine_approval(severity_counts)
        
        scan_duration_ms = int((time.time() - start_time) * 1000)
        
        print(f"\n📊 Scan Results:")
        print(f"  Total findings: {len(findings)}")
        print(f"  Critical: {severity_counts['critical']}")
        print(f"  High: {severity_counts['high']}")
        print(f"  Medium: {severity_counts['medium']}")
        print(f"  Low: {severity_counts['low']}")
        print(f"  Approval: {approval_status.upper()}")
        print(f"  Duration: {scan_duration_ms}ms")
        print(f"{'='*60}\n")
        
        return {
            "scan_id": scan_id,
            "status": "completed",
            "format": detected_format.value,
            "filename": file.filename,
            "findings_count": len(findings),
            "critical_count": severity_counts['critical'],
            "high_count": severity_counts['high'],
            "medium_count": severity_counts['medium'],
            "low_count": severity_counts['low'],
            "approval_status": approval_status,
            "scan_duration_ms": scan_duration_ms,
            "findings": findings
        }
        
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    
    finally:
        # Cleanup
        if temp_path and temp_path.exists():
            temp_path.unlink(missing_ok=True)


if __name__ == "__main__":
    print("\n" + "="*60)
    print("🚀 ModelGuard Standalone Server")
    print("="*60)
    print("\n📝 Test with Postman:")
    print("  1. Scan from URL:")
    print("     POST http://localhost:8001/scan")
    print('     Body: {"uri": "https://example.com/model.onnx"}')
    print("\n  2. Upload file:")
    print("     POST http://localhost:8001/scan/upload")
    print("     Body: form-data, key=file, value=<your_model_file>")
    print("\n  3. Debug ONNX file (for troubleshooting):")
    print("     POST http://localhost:8001/debug/onnx")
    print("     Body: form-data, key=file, value=<your_onnx_file>")
    print("\n  4. List formats:")
    print("     GET http://localhost:8001/formats")
    print("\n  5. Clean up temp files:")
    print("     POST http://localhost:8001/cleanup")
    print("\n" + "="*60 + "\n")
    
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8001,
        log_level="info"
    )
