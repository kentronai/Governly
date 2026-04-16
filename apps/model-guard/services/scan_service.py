"""
Model scanning service.

This module provides the main orchestration logic for scanning ML models,
coordinating format detection, metadata extraction, security scanning,
and report generation.
"""

import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

from sqlalchemy.ext.asyncio import AsyncSession

from modelguard_core.sniff import FormatDetector
from modelguard_core.types import (
    ModelFormat, SecurityFinding, ScanStatus,
    ApprovalStatus, ModelMetadata, SBOMFeatures
)
from modelguard_core.sbom import build_sbom, extract_sbom_features
from modelguard_core.scanners.pickle_detector import scan_for_pickle
from modelguard_core.scanners.custom_ops_scanner import scan_custom_operators
from modelguard_core.scanners.backdoor_scanner import scan_for_backdoors
from modelguard_core.scanners.metadata_validator import validate_metadata
from modelguard_core.report.json_report import generate_json_report
from modelguard_core.report.sarif_report import generate_sarif_report
from adapters.storage import download_model
from adapters.gcs import GCSManager
from models import ModelArtifact, ModelScan, ScanFinding
from gateway.db import get_async_session
from gateway.cache import get_cache_service
from services.audit_service import get_audit_service
from services.registry_sync_service import get_registry_sync_service


class ScanService:
    """Main service for model security scanning."""
    
    def __init__(self, db_session: Optional[AsyncSession] = None, gcs_manager: Optional[GCSManager] = None):
        """
        Initialize scan service.
        
        Args:
            db_session: Optional database session for testing
            gcs_manager: Optional GCS manager for hybrid storage approach
        """
        self.extractors = {}
        self.db_session = db_session
        self.gcs_manager = gcs_manager
        self._register_extractors()
    
    def _register_extractors(self) -> None:
        """Register format-specific extractors."""
        from modelguard_core.extract.onnx import ONNXExtractor
        from modelguard_core.extract.pytorch import PyTorchExtractor
        from modelguard_core.extract.safetensors import SafeTensorsExtractor
        from modelguard_core.extract.gguf import GGUFExtractor
        from modelguard_core.extract.tensorflow import TensorFlowExtractor
        from modelguard_core.extract.tflite import TFLiteExtractor
        from modelguard_core.extract.keras import KerasExtractor
        
        self.extractors = {
            ModelFormat.ONNX: ONNXExtractor,
            ModelFormat.PYTORCH: PyTorchExtractor,
            ModelFormat.SAFETENSORS: SafeTensorsExtractor,
            ModelFormat.GGUF: GGUFExtractor,
            ModelFormat.TENSORFLOW: TensorFlowExtractor,
            ModelFormat.TFLITE: TFLiteExtractor,
            ModelFormat.KERAS: KerasExtractor,
        }
    
    async def scan_model(
        self,
        uri: str,
        tenant_id: str,
        user_id: str,
        scan_options: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Scan a model for security issues.
        
        Args:
            uri: Model URI
            tenant_id: Tenant identifier
            user_id: User identifier
            scan_options: Optional scan configuration
            
        Returns:
            Dictionary containing scan results
        """
        scan_id = str(uuid.uuid4())
        start_time = time.time()
        
        try:
            # Step 0: Validate model size for HuggingFace models (before download)
            hf_metadata = None
            if uri.startswith('hf://'):
                hf_metadata = await self._get_hf_metadata_and_validate_size(uri)
                if not hf_metadata['valid']:
                    return self._create_size_error_response(
                        scan_id, 
                        hf_metadata, 
                        start_time
                    )
                print(f"✅ Model size validation passed: {hf_metadata.get('file_size_mb', 'Unknown')} MB")
            
            # Step 1: Check if model already exists in GCS and get SHA256 from DB
            sha256_hash = None
            cached_result = None
            use_gcs = self.gcs_manager is not None
            
            if use_gcs and self.db_session:
                # Try to find existing model in database by URI
                from sqlalchemy.future import select
                stmt = select(ModelArtifact).filter(
                    ModelArtifact.uri == uri,
                    ModelArtifact.tenant_id == tenant_id
                )
                result = await self.db_session.execute(stmt)
                existing_artifact = result.scalar_one_or_none()
                
                if existing_artifact and existing_artifact.sha256:
                    sha256_hash = existing_artifact.sha256
                    print(f"✅ Found existing model in DB with SHA256: {sha256_hash[:8]}...")
                    
                    # Check cache first
                    cache_service = get_cache_service()
                    cached_result = await cache_service.get_cached_scan(sha256_hash)
                    
                    force_rescan = scan_options.get('force_rescan', False) if scan_options else False
                    if cached_result and not force_rescan:
                        print(f"✅ Cache hit! Using cached scan for SHA256: {sha256_hash[:8]}...")
                        # Return cached result with updated metadata
                        cached_result['scan_id'] = scan_id  # New scan ID
                        cached_result['created_at'] = datetime.utcnow().isoformat() + 'Z'
                        cached_result['cached'] = True
                        return cached_result
                    else:
                        print(f"⚠️  Cache miss for SHA256: {sha256_hash[:8]}... (cached_result: {cached_result is not None}, force_rescan: {force_rescan})")
            
            # Step 2: Download model using GCS hybrid approach if available
            model_path, sha256_hash, source_type = await download_model(
                uri, 
                use_gcs=use_gcs, 
                gcs_manager=self.gcs_manager
            )
            
            # Step 3: Check cache for existing scan (SHA256 dedup) - fallback
            if not cached_result:
                cache_service = get_cache_service()
                cached_result = await cache_service.get_cached_scan(sha256_hash)
                
                force_rescan = scan_options.get('force_rescan', False) if scan_options else False
                if cached_result and not force_rescan:
                    print(f"✅ Cache hit! Using cached scan for SHA256: {sha256_hash[:8]}...")
                    # Return cached result with updated metadata
                    cached_result['scan_id'] = scan_id  # New scan ID
                    cached_result['created_at'] = datetime.utcnow().isoformat() + 'Z'
                    cached_result['cached'] = True
                    return cached_result
            
            # Step 3: Detect format
            detected_format, format_error = FormatDetector.detect_from_file(model_path)
            
            if detected_format == ModelFormat.UNKNOWN:
                return self._create_error_response(
                    scan_id,
                    f"Unknown or unsupported model format: {format_error}",
                    start_time
                )
            
            # Step 3: Extract metadata
            metadata = await self._extract_metadata(model_path, detected_format, source_type, uri, hf_metadata=hf_metadata)
            
            # Step 4: Generate SBOM
            sbom = build_sbom(model_path, detected_format, metadata)
            
            # Step 5: Extract SBOM features for scanners
            sbom_features = extract_sbom_features(sbom)
            
            # Step 6: Run security scanners
            findings = await self._run_scanners(model_path, detected_format, metadata, sbom_features)
            
            # Step 6: Calculate scan duration
            scan_duration_ms = int((time.time() - start_time) * 1000)
            
            # Step 7: Generate reports
            json_report = generate_json_report(
                scan_id=scan_id,
                model_uri=uri,
                model_format=detected_format,
                metadata=metadata,
                findings=findings,
                sbom=sbom.dict() if hasattr(sbom, 'dict') else sbom,
                scan_status=ScanStatus.COMPLETED,
                scan_duration_ms=scan_duration_ms
            )
            
            sarif_report = generate_sarif_report(
                scan_id=scan_id,
                model_uri=uri,
                model_format=detected_format,
                findings=findings
            )
            
            # Step 8: Determine approval status
            approval_status, blocked_reason = self._determine_approval(findings)
            
            # Step 9: Persist to database
            artifact_id, scan_db_id = await self._persist_scan_results(
                scan_id=scan_id,
                tenant_id=tenant_id,
                user_id=user_id,
                uri=uri,
                source=source_type,
                filename=model_path.name,
                sha256=sha256_hash,
                size_bytes=model_path.stat().st_size,
                detected_format=detected_format.value,
                approval_status=approval_status.value,
                blocked_reason=blocked_reason,
                metadata=metadata,
                findings=findings,
                sbom=sbom.dict() if hasattr(sbom, 'dict') else sbom,
                json_report=json_report,
                sarif_report=sarif_report,
                scan_duration_ms=scan_duration_ms
            )
            
            # Step 10: Sync to ONNX Registry (if approved and ONNX format)
            registry_synced = False
            if approval_status == ApprovalStatus.APPROVED and detected_format == ModelFormat.ONNX:
                registry_sync_service = get_registry_sync_service()
                success, message = await registry_sync_service.sync_approved_model(
                    artifact_id=artifact_id,
                    tenant_id=tenant_id,
                    model_path=model_path,
                    metadata=metadata
                )
                registry_synced = success
                if success:
                    print(f"✅ {message}")
                else:
                    print(f"⚠️  {message}")
            
            # Step 11: Log audit events
            severity_counts = self._calculate_severity_counts(findings)
            audit_service = get_audit_service()
            
            # Log scan completion
            await audit_service.log_scan_completed(
                tenant_id=tenant_id,
                user_id=user_id,
                artifact_id=artifact_id,
                scan_id=scan_id,
                approval_status=approval_status.value,
                findings_count=len(findings),
                critical_count=severity_counts.get('critical', 0),
                high_count=severity_counts.get('high', 0),
                scan_duration_ms=scan_duration_ms
            )
            
            # Log approval/rejection
            if approval_status == ApprovalStatus.APPROVED:
                await audit_service.log_model_approved(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    artifact_id=artifact_id,
                    scan_id=scan_id,
                    added_to_registry=registry_synced
                )
            elif approval_status == ApprovalStatus.REJECTED:
                await audit_service.log_model_rejected(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    artifact_id=artifact_id,
                    scan_id=scan_id,
                    reason=blocked_reason or "Unknown"
                )
            
            # Step 12: Build response
            result = {
                'scan_id': scan_id,
                'artifact_id': artifact_id,
                'artifact': {
                    'uri': uri,
                    'source': source_type,
                    'filename': model_path.name,
                    'sha256': sha256_hash,
                    'size_bytes': model_path.stat().st_size,
                    'format': detected_format.value
                },
                'status': ScanStatus.COMPLETED.value,
                'format': detected_format.value,
                'metadata': self._metadata_to_dict(metadata),
                'findings': [self._finding_to_dict(f) for f in findings],
                'findings_count': len(findings),
                'severity_counts': self._calculate_severity_counts(findings),
                'sbom': sbom.dict() if hasattr(sbom, 'dict') else sbom,
                'approval_status': approval_status.value,
                'blocked_reason': blocked_reason,
                'registry_synced': registry_synced,  # ✅ NEW: Registry sync status
                'reports': {
                    'json': json_report,
                    'sarif': sarif_report
                },
                'scan_duration_ms': scan_duration_ms,
                'created_at': datetime.utcnow().isoformat() + 'Z',
                'completed_at': datetime.utcnow().isoformat() + 'Z',
                'tenant_id': tenant_id,
                'created_by': user_id,
                'cached': False  # This is a fresh scan
            }
            
            # Step 13: Cache the scan result for future use
            try:
                await cache_service.cache_scan_result(sha256_hash, result)
                await cache_service.cache_sbom(sha256_hash, sbom.dict() if hasattr(sbom, 'dict') else sbom)
                print(f"✅ Cached scan result for SHA256: {sha256_hash[:8]}...")
            except Exception as cache_error:
                print(f"⚠️  Failed to cache result: {cache_error}")
                # Don't fail the scan if caching fails
            
            return result
            
        except Exception as e:
            # Log audit event for failed scan
            try:
                audit_service = get_audit_service()
                await audit_service.log_scan_failed(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    uri=uri,
                    error=str(e)
                )
            except Exception as audit_error:
                print(f"⚠️  Failed to log audit event: {audit_error}")
            
            return self._create_error_response(
                scan_id,
                f"Scan failed: {str(e)}",
                start_time
            )
        finally:
            # Clean up temporary files if using GCS
            if self.gcs_manager:
                try:
                    self.gcs_manager.cleanup_temp_files()
                except Exception as cleanup_error:
                    print(f"⚠️  Failed to cleanup temp files: {cleanup_error}")
    
    async def _extract_metadata(
        self,
        model_path: Path,
        format_type: ModelFormat,
        source_type: str,
        uri: str,
        hf_metadata: Optional[Dict[str, Any]] = None
    ) -> ModelMetadata:
        """Extract metadata from model."""
        extractor_class = self.extractors.get(format_type)
        
        if not extractor_class:
            # Return minimal metadata for unsupported formats
            model_metadata = ModelMetadata(
                format=format_type,
                version=None,
                producer=None,
                description=f"Unsupported format: {format_type.value}",
                input_shapes=[],
                output_shapes=[],
                operators=[],
                custom_operators=[],
                external_data=[],
                file_size=model_path.stat().st_size
            )
        else:
            # Read model data
            with open(model_path, 'rb') as f:
                model_data = f.read()
            
            # Create extractor and extract metadata
            extractor = extractor_class(model_data)
            model_metadata = extractor.extract_metadata()
        
        # If this is a Hugging Face model, use pre-fetched metadata
        if source_type == 'hf' and hf_metadata:
            try:
                from modelguard_core.extract.hf_metadata import HFMetadataExtractor
                
                print(f"🔍 Using pre-fetched Hugging Face metadata for: {uri}")
                hf_extractor = HFMetadataExtractor()
                
                # Convert the validation result to HFModelInfo if we have the raw API data
                if 'hf_info' in hf_metadata:
                    hf_info = hf_metadata['hf_info']
                    model_metadata = hf_extractor.merge_with_model_metadata(model_metadata, hf_info)
                    print(f"✅ Successfully merged pre-fetched HF metadata")
                else:
                    print(f"⚠️  No HF info in pre-fetched metadata, using model file metadata only")
                    
            except ImportError:
                print(f"⚠️  httpx not available for HF metadata extraction")
            except Exception as e:
                print(f"⚠️  Error processing HF metadata: {e}")
        elif source_type == 'hf':
            print(f"⚠️  No pre-fetched HF metadata available, using model file metadata only")
        
        return model_metadata
    
    async def _run_scanners(
        self,
        model_path: Path,
        format_type: ModelFormat,
        metadata: ModelMetadata,
        sbom_features: SBOMFeatures
    ) -> List[SecurityFinding]:
        """Run all security scanners."""
        findings: List[SecurityFinding] = []
        
        # Run pickle detector
        findings.extend(scan_for_pickle(model_path, format_type))
        
        # Run custom ops scanner
        findings.extend(scan_custom_operators(sbom_features, format_type))
        
        # Run backdoor scanner
        findings.extend(scan_for_backdoors(sbom_features, format_type))
        
        # Run metadata validator
        findings.extend(validate_metadata(sbom_features, format_type))
        
        return findings
    
    def _determine_approval(
        self,
        findings: List[SecurityFinding]
    ) -> Tuple[ApprovalStatus, Optional[str]]:
        """Determine model approval status based on findings."""
        severity_counts = self._calculate_severity_counts(findings)
        
        # Critical findings = rejected
        if severity_counts['critical'] > 0:
            critical_findings = [
                f.title for f in findings 
                if f.severity.value == 'critical'
            ]
            return (
                ApprovalStatus.REJECTED,
                f"Critical security issues detected: {'; '.join(critical_findings[:3])}"
            )
        
        # High findings = requires review
        if severity_counts['high'] > 0:
            return (
                ApprovalStatus.PENDING_REVIEW,
                f"{severity_counts['high']} high severity finding(s) require review"
            )
        
        # Many medium findings = requires review
        if severity_counts['medium'] > 5:
            return (
                ApprovalStatus.PENDING_REVIEW,
                f"{severity_counts['medium']} medium severity findings require review"
            )
        
        # Otherwise approved
        return ApprovalStatus.APPROVED, None
    
    def _calculate_severity_counts(self, findings: List[SecurityFinding]) -> Dict[str, int]:
        """Calculate counts of findings by severity."""
        counts = {
            'critical': 0,
            'high': 0,
            'medium': 0,
            'low': 0,
            'info': 0
        }
        
        for finding in findings:
            severity = finding.severity.value
            if severity in counts:
                counts[severity] += 1
        
        return counts
    
    def _metadata_to_dict(self, metadata: ModelMetadata) -> Dict[str, Any]:
        """Convert ModelMetadata to dictionary."""
        return {
            'format': metadata.format.value,
            'version': metadata.version,
            'producer': metadata.producer,
            'description': metadata.description,
            'author': metadata.author,
            'license': metadata.license,
            'tags': metadata.tags,
            'input_shapes': metadata.input_shapes,
            'output_shapes': metadata.output_shapes,
            'operators': metadata.operators,
            'custom_operators': metadata.custom_operators,
            'external_data': metadata.external_data,
            'file_size': metadata.file_size,
            'created_at': metadata.created_at,
            # Hugging Face specific metadata
            'hf_model_id': metadata.hf_model_id,
            'hf_author': metadata.hf_author,
            'hf_downloads': metadata.hf_downloads,
            'hf_likes': metadata.hf_likes,
            'hf_pipeline_tag': metadata.hf_pipeline_tag,
            'hf_library_name': metadata.hf_library_name,
            'hf_created_at': metadata.hf_created_at,
            'hf_last_modified': metadata.hf_last_modified,
            'hf_private': metadata.hf_private,
            'hf_gated': metadata.hf_gated,
            'hf_model_card': metadata.hf_model_card
        }
    
    def _finding_to_dict(self, finding: SecurityFinding) -> Dict[str, Any]:
        """Convert SecurityFinding to dictionary."""
        return {
            'id': finding.id,
            'type': finding.type,
            'severity': finding.severity.value,
            'title': finding.title,
            'description': finding.description,
            'recommendation': finding.recommendation,
            'evidence': finding.evidence,
            'scanner': finding.scanner,
            'location': finding.location,
            'cwe_id': finding.cwe_id,
            'created_at': finding.created_at
        }
    
    async def _persist_scan_results(
        self,
        scan_id: str,
        tenant_id: str,
        user_id: str,
        uri: str,
        source: str,
        filename: str,
        sha256: str,
        size_bytes: int,
        detected_format: str,
        approval_status: str,
        blocked_reason: Optional[str],
        metadata: ModelMetadata,
        findings: List[SecurityFinding],
        sbom: Dict[str, Any],
        json_report: Dict[str, Any],
        sarif_report: Dict[str, Any],
        scan_duration_ms: int
    ) -> Tuple[str, str]:
        """
        Persist scan results to database.
        
        Returns:
            Tuple of (artifact_id, scan_id)
        """
        from sqlalchemy import select
        from sqlalchemy.exc import IntegrityError
        
        # Get or create database session
        if self.db_session:
            session = self.db_session
            should_close = False
        else:
            session = await get_async_session()
            should_close = True
        
        try:
            # Check if artifact already exists (SHA-256 deduplication)
            stmt = select(ModelArtifact).where(
                ModelArtifact.tenant_id == tenant_id,
                ModelArtifact.sha256 == sha256
            )
            result = await session.execute(stmt)
            artifact = result.scalar_one_or_none()
            
            if artifact:
                # Update existing artifact
                artifact.approval_status = approval_status
                artifact.blocked_reason = blocked_reason
                artifact.updated_by = user_id
                artifact.updated_at = datetime.utcnow()
            else:
                # Create new artifact
                artifact = ModelArtifact(
                    tenant_id=tenant_id,
                    source=source,
                    uri=uri,
                    filename=filename,
                    size_bytes=size_bytes,
                    sha256=sha256,
                    content_type='application/octet-stream',
                    detected_format=detected_format,
                    approval_status=approval_status,
                    blocked_reason=blocked_reason,
                    artifact_metadata=self._metadata_to_dict(metadata),
                    created_by=user_id,
                    updated_by=user_id
                )
                session.add(artifact)
                await session.flush()  # Get the artifact ID
            
            # Create scan record
            scan = ModelScan(
                id=uuid.UUID(scan_id),
                tenant_id=tenant_id,
                artifact_id=artifact.id,
                status='success',
                engine_version='1.0.0',  # TODO: Get from config
                sbom=sbom.dict() if hasattr(sbom, 'dict') else sbom,
                report_json=json_report,
                report_sarif=sarif_report,
                created_by=user_id,
                updated_by=user_id,
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow()
            )
            session.add(scan)
            await session.flush()  # Get the scan ID
            
            # Create finding records
            for finding in findings:
                scan_finding = ScanFinding(
                    tenant_id=tenant_id,
                    scan_id=scan.id,
                    rule_id=finding.id,
                    severity=finding.severity.value.capitalize(),  # 'Critical', 'High', etc.
                    title=finding.title,
                    description=finding.description,
                    evidence=finding.evidence or {},
                    remediation={'recommendation': finding.recommendation} if finding.recommendation else None,
                    cve_id=None,  # TODO: Map CWE to CVE if available
                    suppressed=False
                )
                session.add(scan_finding)
            
            # Commit transaction
            await session.commit()
            
            return str(artifact.id), str(scan.id)
            
        except IntegrityError as e:
            await session.rollback()
            # If duplicate key error, retry once
            raise Exception(f"Database integrity error: {str(e)}")
        except Exception as e:
            await session.rollback()
            raise Exception(f"Failed to persist scan results: {str(e)}")
        finally:
            if should_close:
                await session.close()
    
    def _create_error_response(
        self,
        scan_id: str,
        error_message: str,
        start_time: float
    ) -> Dict[str, Any]:
        """Create error response."""
        return {
            'scan_id': scan_id,
            'status': ScanStatus.FAILED.value,
            'error': error_message,
            'scan_duration_ms': int((time.time() - start_time) * 1000),
            'created_at': datetime.utcnow().isoformat() + 'Z'
        }
    
    async def _get_hf_metadata_and_validate_size(self, uri: str) -> Dict[str, Any]:
        """
        Get HuggingFace metadata and validate size in one API call.
        
        Args:
            uri: HuggingFace URI
            
        Returns:
            Combined validation and metadata result
        """
        try:
            from modelguard_core.extract.hf_metadata import HFMetadataExtractor
            
            # Get max size from config or use default
            max_size_mb = 200  # Default limit
            try:
                from gateway.config import get_settings
                settings = get_settings()
                # You can add max_model_size_mb to settings if needed
                # max_size_mb = getattr(settings, 'max_model_size_mb', 200)
            except Exception:
                pass  # Use default
            
            extractor = HFMetadataExtractor()
            
            # Get both size and metadata in one call
            model_id = extractor._parse_hf_uri(uri)
            file_path = extractor._extract_file_path(uri)
            
            if not model_id or not file_path:
                return {
                    'valid': False,
                    'error': f'Invalid HF URI format: {uri}',
                    'file_size_bytes': None,
                    'file_size_mb': None,
                    'max_size_mb': max_size_mb
                }
            
            # Fetch model info from HF API (single call)
            model_info = await extractor._fetch_model_info(model_id)
            if not model_info:
                return {
                    'valid': False,
                    'error': f'Could not fetch model info for {model_id}',
                    'file_size_bytes': None,
                    'file_size_mb': None,
                    'max_size_mb': max_size_mb
                }
            
            # Get siblings for error messages (but skip size check)
            siblings = model_info.get('siblings', [])
            
            # Skip HF API size check - go directly to HEAD request for size
            # (HF API consistently returns size=None, so HEAD request is more reliable)
            print(f"🔍 Getting file size via HEAD request (skipping HF API size check)...")
            head_result = await self._get_file_size_via_head_request(model_id, file_path)
            
            file_size = None
            
            if isinstance(head_result, dict):
                # HEAD request returned an error
                if head_result.get('error_type') == 'FILE_NOT_FOUND':
                    available_files = [s.get("rfilename") for s in siblings]
                    return {
                        'valid': False,
                        'error': f'The file "{file_path}" was not found in this model. Available files: {", ".join(available_files)}. Please try using one of these files instead.',
                        'file_size_bytes': None,
                        'file_size_mb': None,
                        'max_size_mb': max_size_mb,
                        'error_type': 'FILE_NOT_FOUND',
                        'available_files': available_files
                    }
                else:
                    error_type = head_result.get('error_type', 'UNKNOWN')
                    if error_type == 'HTTP_ERROR' and head_result.get('status_code') == 404:
                        return {
                            'valid': False,
                            'error': f'The model "{model_id}" was not found. Please check the model URL and try again.',
                            'file_size_bytes': None,
                            'file_size_mb': None,
                            'max_size_mb': max_size_mb,
                            'error_type': 'MODEL_NOT_FOUND'
                        }
                    else:
                        return {
                            'valid': False,
                            'error': f'Unable to access the model file. Please check your internet connection and try again.',
                            'file_size_bytes': None,
                            'file_size_mb': None,
                            'max_size_mb': max_size_mb,
                            'error_type': 'NETWORK_ERROR'
                        }
            elif head_result:
                file_size = head_result
                print(f"✅ Got file size via HEAD request: {file_size:,} bytes ({file_size / (1024*1024):.2f} MB)")
            else:
                print(f"⚠️  Could not get file size via HEAD request either")
            
            
            # Validate size
            max_size_bytes = max_size_mb * 1024 * 1024
            
            if file_size is None:
                # Reject unknown size for safety
                return {
                    'valid': False,
                    'error': 'Unable to determine the model size. Please try again or contact support if the issue persists.',
                    'file_size_bytes': None,
                    'file_size_mb': None,
                    'max_size_mb': max_size_mb,
                    'error_type': 'SIZE_UNKNOWN'
                }
            
            file_size_mb = file_size / (1024 * 1024)
            is_valid = file_size <= max_size_bytes
            
            print(f"📊 Size validation: {file_size_mb:.2f} MB vs {max_size_mb} MB limit")
            print(f"📊 Validation result: {'✅ PASS' if is_valid else '❌ FAIL'}")
            
            result = {
                'valid': is_valid,
                'file_size_bytes': file_size,
                'file_size_mb': round(file_size_mb, 2),
                'max_size_mb': max_size_mb,
                'error': None if is_valid else f'This model is {file_size_mb:.1f} MB, which exceeds our {max_size_mb} MB limit. Please choose a smaller model.',
                'error_type': None if is_valid else 'SIZE_LIMIT_EXCEEDED',
                'hf_info': extractor._parse_model_info(model_info)  # Include HF metadata
            }
            
            return result
            
        except Exception as e:
            return {
                'valid': False,
                'error': 'An unexpected error occurred while validating the model. Please try again or contact support.',
                'file_size_bytes': None,
                'file_size_mb': None,
                'max_size_mb': 200,
                'error_type': 'VALIDATION_ERROR'
            }
    
    async def _get_file_size_via_head_request(self, model_id: str, file_path: str) -> Optional[Union[int, Dict[str, Any]]]:
        """
        Get file size by making a HEAD request to the HuggingFace file URL.
        
        Args:
            model_id: HuggingFace model ID (e.g., google-bert/bert-base-uncased)
            file_path: File path (e.g., pytorch_model.bin)
            
        Returns:
            File size in bytes, error dict, or None if failed
        """
        try:
            import httpx
            
            # Construct the HuggingFace file URL
            file_url = f"https://huggingface.co/{model_id}/resolve/main/{file_path}"
            
            print(f"🔍 Making HEAD request to: {file_url}")
            
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.head(file_url)
                response.raise_for_status()
                
                # Get Content-Length header
                content_length = response.headers.get('content-length')
                if content_length:
                    file_size = int(content_length)
                    print(f"✅ Got file size from Content-Length header: {file_size:,} bytes")
                    return file_size
                else:
                    print(f"⚠️  No Content-Length header in response")
                    print(f"   Response headers: {dict(response.headers)}")
                    return None
                    
        except httpx.HTTPStatusError as e:
            if e.response.status_code == 404:
                print(f"⚠️  File not found (404): {file_path}")
                return {
                    'error_type': 'FILE_NOT_FOUND',
                    'error': f'File "{file_path}" not found in model "{model_id}"',
                    'status_code': 404
                }
            else:
                print(f"⚠️  HEAD request failed with status {e.response.status_code}: {e}")
                return {
                    'error_type': 'HTTP_ERROR',
                    'error': f'HTTP {e.response.status_code}: {str(e)}',
                    'status_code': e.response.status_code
                }
        except Exception as e:
            print(f"⚠️  HEAD request failed: {e}")
            return {
                'error_type': 'NETWORK_ERROR',
                'error': str(e)
            }
    
    
    def _create_size_error_response(
        self,
        scan_id: str,
        size_validation: Dict[str, Any],
        start_time: float
    ) -> Dict[str, Any]:
        """
        Create error response for validation failures.
        
        Args:
            scan_id: Scan ID
            size_validation: Size validation result
            start_time: Scan start time
            
        Returns:
            Error response dictionary
        """
        error_msg = size_validation.get('error', 'Model validation failed')
        error_type = size_validation.get('error_type', 'VALIDATION_ERROR')
        
        # Create user-friendly response based on error type
        if error_type == 'SIZE_LIMIT_EXCEEDED':
            file_size_mb = size_validation.get('file_size_mb', 'Unknown')
            max_size_mb = size_validation.get('max_size_mb', 200)
            
            return {
                'scan_id': scan_id,
                'status': ScanStatus.FAILED.value,
                'error': error_msg,
                'error_type': error_type,
                'details': {
                    'file_size_mb': file_size_mb,
                    'max_size_mb': max_size_mb,
                    'file_size_bytes': size_validation.get('file_size_bytes'),
                    'suggestion': 'Please choose a smaller model under 200MB.'
                },
                'scan_duration_ms': int((time.time() - start_time) * 1000),
                'created_at': datetime.utcnow().isoformat() + 'Z'
            }
        
        elif error_type == 'FILE_NOT_FOUND':
            available_files = size_validation.get('available_files', [])
            return {
                'scan_id': scan_id,
                'status': ScanStatus.FAILED.value,
                'error': error_msg,
                'error_type': error_type,
                'details': {
                    'available_files': available_files,
                    'suggestion': 'Please select one of the available files listed above.'
                },
                'scan_duration_ms': int((time.time() - start_time) * 1000),
                'created_at': datetime.utcnow().isoformat() + 'Z'
            }
        
        else:
            return {
                'scan_id': scan_id,
                'status': ScanStatus.FAILED.value,
                'error': error_msg,
                'error_type': error_type,
                'details': {
                    'suggestion': 'Please try again or contact support if the issue persists.'
                },
                'scan_duration_ms': int((time.time() - start_time) * 1000),
                'created_at': datetime.utcnow().isoformat() + 'Z'
            }


# Global service instance
_scan_service: Optional[ScanService] = None


async def get_scan_service() -> ScanService:
    """
    Get or create scan service instance with GCS integration.
    
    Returns:
        ScanService instance
    """
    global _scan_service
    if _scan_service is None:
        # Initialize GCS manager if configured
        gcs_manager = None
        try:
            from gateway.config import get_settings
            settings = get_settings()
            
            if settings.gs_project_id and settings.gs_bucket_name:
                gcs_manager = GCSManager(
                    bucket_name=settings.gs_bucket_name,
                    project_id=settings.gs_project_id,
                    credentials_path=settings.gs_credentials_path
                )
                print(f"✅ GCS integration enabled: {settings.gs_bucket_name}")
            else:
                print("⚠️  GCS not configured, using local storage only")
                
        except Exception as e:
            print(f"⚠️  Failed to initialize GCS: {e}")
        
        # Get database session
        db_session = await get_async_session()
        _scan_service = ScanService(db_session=db_session, gcs_manager=gcs_manager)
    return _scan_service
