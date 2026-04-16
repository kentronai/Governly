"""
Reports endpoints for ModelGuard API.

This module provides REST API endpoints for generating and exporting scan reports.
"""

from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
import logging

from gateway.auth import TenantContext, require_tenant_auth
from gateway.db import get_async_session
from models import ModelScan, ScanFinding, ModelArtifact
from modelguard_core.report.sarif_report import generate_sarif_report
from modelguard_core.report.json_report import generate_json_report

from sqlalchemy import select
from sqlalchemy.orm import selectinload


logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/{scan_id}")
async def get_scan_results(
    scan_id: str,
    ctx: TenantContext = Depends(require_tenant_auth)
):
    """
    Get complete scan results including status, findings, and recommendations.
    
    Args:
        scan_id: Scan identifier
        ctx: Tenant context from authentication
        
    Returns:
        Complete scan results with findings and recommendations
    """
    logger.info(f"Getting scan results for: {scan_id} (tenant: {ctx.tenant_id})")
    
    try:
        # Validate UUID format
        try:
            scan_uuid = UUID(scan_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid scan ID format"
            )
        
        # Get database session
        session = await get_async_session()
        
        try:
            # Query scan with related data
            result = await session.execute(
                select(ModelScan)
                .where(
                    ModelScan.id == scan_uuid,
                    ModelScan.tenant_id == ctx.tenant_id
                )
            )
            scan = result.scalar_one_or_none()
            
            if not scan:
                raise HTTPException(
                    status_code=404,
                    detail=f"Scan not found: {scan_id}"
                )
            
            # Get artifact info
            artifact_result = await session.execute(
                select(ModelArtifact)
                .where(ModelArtifact.id == scan.artifact_id)
            )
            artifact = artifact_result.scalar_one_or_none()
            
            # Get findings
            findings_result = await session.execute(
                select(ScanFinding)
                .where(ScanFinding.scan_id == scan_uuid)
                .order_by(ScanFinding.severity)
            )
            findings = findings_result.scalars().all()
            
            # Build response
            findings_data = []
            severity_counts = {"Critical": 0, "High": 0, "Medium": 0, "Low": 0, "Info": 0}
            
            for finding in findings:
                findings_data.append({
                    'id': str(finding.id),
                    'rule_id': finding.rule_id,
                    'severity': finding.severity,
                    'title': finding.title,
                    'description': finding.description,
                    'evidence': finding.evidence or {},
                    'remediation': finding.remediation or {},
                    'cve_id': finding.cve_id,
                    'suppressed': finding.suppressed,
                    'created_at': finding.created_at.isoformat()
                })
                severity_counts[finding.severity] = severity_counts.get(finding.severity, 0) + 1
            
            response = {
                "scan_id": str(scan.id),
                "artifact_id": str(scan.artifact_id),
                "status": scan.status,
                "approval_status": artifact.approval_status if artifact else "unknown",
                "scan_duration_ms": int((scan.finished_at - scan.started_at).total_seconds() * 1000) if scan.finished_at and scan.started_at else None,
                "created_at": scan.created_at.isoformat(),
                "completed_at": scan.finished_at.isoformat() if scan.finished_at else None,
                
                "model_info": {
                    "uri": artifact.uri if artifact else None,
                    "format": artifact.detected_format if artifact else None,
                    "size_bytes": artifact.size_bytes if artifact else None,
                    "sha256": artifact.sha256 if artifact else None,
                    "blocked_reason": artifact.blocked_reason if artifact else None
                } if artifact else None,
                
                "summary": {
                    "findings_count": len(findings_data),
                    "critical_count": severity_counts["Critical"],
                    "high_count": severity_counts["High"],
                    "medium_count": severity_counts["Medium"],
                    "low_count": severity_counts["Low"],
                    "info_count": severity_counts["Info"]
                },
                
                "findings": findings_data,
                "sbom": scan.sbom
            }
            
            return response
            
        finally:
            await session.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get scan results: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get scan results: {str(e)}"
        )


@router.post("/{scan_id}/sarif", response_class=Response)
async def export_sarif_report(
    scan_id: str,
    ctx: TenantContext = Depends(require_tenant_auth)
):
    """
    Export scan results in SARIF 2.1.0 format.
    
    SARIF (Static Analysis Results Interchange Format) is used by:
    - GitHub Security
    - GitLab Security Dashboard
    - Azure DevOps
    - Jenkins
    
    Args:
        scan_id: Scan identifier
        ctx: Tenant context from authentication
        
    Returns:
        SARIF 2.1.0 JSON document
    """
    logger.info(f"Generating SARIF report for scan: {scan_id} (tenant: {ctx.tenant_id})")
    
    try:
        # Validate UUID format
        try:
            scan_uuid = UUID(scan_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid scan ID format"
            )
        
        # Get database session
        session = await get_async_session()
        
        try:
            # Query scan with related data
            result = await session.execute(
                select(ModelScan)
                .where(
                    ModelScan.id == scan_uuid,
                    ModelScan.tenant_id == ctx.tenant_id
                )
                .options(
                    selectinload(ModelScan.artifact),
                    selectinload(ModelScan.findings)
                )
            )
            scan = result.scalar_one_or_none()
            
            if not scan:
                raise HTTPException(
                    status_code=404,
                    detail=f"Scan not found: {scan_id}"
                )
            
            # Check if scan is complete
            if scan.status != 'success':
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot generate report for scan with status: {scan.status}"
                )
            
            # Convert findings to dict format
            findings = []
            for finding in scan.findings:
                findings.append({
                    'rule_id': finding.rule_id,
                    'severity': finding.severity,
                    'title': finding.title,
                    'description': finding.description,
                    'evidence': finding.evidence or {},
                    'remediation': finding.remediation or {},
                    'cve_id': finding.cve_id,
                    'suppressed': finding.suppressed
                })
            
            # Generate SARIF report
            sarif_report = generate_sarif_report(
                artifact_uri=scan.artifact.uri,
                artifact_sha256=scan.artifact.sha256,
                artifact_format=scan.artifact.detected_format,
                findings=findings,
                scan_id=str(scan.id),
                scan_started_at=scan.started_at.isoformat() if scan.started_at else None,
                scan_finished_at=scan.finished_at.isoformat() if scan.finished_at else None
            )
            
            logger.info(f"Generated SARIF report with {len(findings)} findings")
            
            # Return SARIF JSON
            return Response(
                content=sarif_report,
                media_type="application/json",
                headers={
                    "Content-Disposition": f'attachment; filename="scan_{scan_id}.sarif"'
                }
            )
            
        finally:
            await session.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate SARIF report: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate SARIF report: {str(e)}"
        )


@router.post("/{scan_id}/json", response_class=Response)
async def export_json_report(
    scan_id: str,
    ctx: TenantContext = Depends(require_tenant_auth)
):
    """
    Export scan results in JSON format.
    
    Args:
        scan_id: Scan identifier
        ctx: Tenant context from authentication
        
    Returns:
        JSON report document
    """
    logger.info(f"Generating JSON report for scan: {scan_id} (tenant: {ctx.tenant_id})")
    
    try:
        # Validate UUID format
        try:
            scan_uuid = UUID(scan_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid scan ID format"
            )
        
        # Get database session
        session = await get_async_session()
        
        try:
            # Query scan with related data
            result = await session.execute(
                select(ModelScan)
                .where(
                    ModelScan.id == scan_uuid,
                    ModelScan.tenant_id == ctx.tenant_id
                )
                .options(
                    selectinload(ModelScan.artifact),
                    selectinload(ModelScan.findings)
                )
            )
            scan = result.scalar_one_or_none()
            
            if not scan:
                raise HTTPException(
                    status_code=404,
                    detail=f"Scan not found: {scan_id}"
                )
            
            # Check if scan is complete
            if scan.status != 'success':
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot generate report for scan with status: {scan.status}"
                )
            
            # Convert findings to dict format
            findings = []
            for finding in scan.findings:
                findings.append({
                    'id': str(finding.id),
                    'rule_id': finding.rule_id,
                    'severity': finding.severity,
                    'title': finding.title,
                    'description': finding.description,
                    'evidence': finding.evidence or {},
                    'remediation': finding.remediation or {},
                    'cve_id': finding.cve_id,
                    'suppressed': finding.suppressed,
                    'created_at': finding.created_at.isoformat()
                })
            
            # Generate JSON report
            json_report = generate_json_report(
                artifact_uri=scan.artifact.uri,
                artifact_sha256=scan.artifact.sha256,
                artifact_format=scan.artifact.detected_format,
                artifact_size=scan.artifact.size_bytes,
                findings=findings,
                sbom=scan.sbom or {},
                scan_id=str(scan.id),
                scan_status=scan.status,
                scan_started_at=scan.started_at.isoformat() if scan.started_at else None,
                scan_finished_at=scan.finished_at.isoformat() if scan.finished_at else None,
                approval_status=scan.artifact.approval_status
            )
            
            logger.info(f"Generated JSON report with {len(findings)} findings")
            
            # Return JSON
            return Response(
                content=json_report,
                media_type="application/json",
                headers={
                    "Content-Disposition": f'attachment; filename="scan_{scan_id}.json"'
                }
            )
            
        finally:
            await session.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate JSON report: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to generate JSON report: {str(e)}"
        )


@router.get("/{scan_id}/summary")
async def get_report_summary(
    scan_id: str,
    ctx: TenantContext = Depends(require_tenant_auth)
):
    """
    Get a summary of scan results.
    
    Args:
        scan_id: Scan identifier
        ctx: Tenant context from authentication
        
    Returns:
        Scan summary with counts and status
    """
    logger.info(f"Getting report summary for scan: {scan_id} (tenant: {ctx.tenant_id})")
    
    try:
        # Validate UUID format
        try:
            scan_uuid = UUID(scan_id)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid scan ID format"
            )
        
        # Get database session
        session = await get_async_session()
        
        try:
            # Query scan with related data
            result = await session.execute(
                select(ModelScan)
                .where(
                    ModelScan.id == scan_uuid,
                    ModelScan.tenant_id == ctx.tenant_id
                )
                .options(
                    selectinload(ModelScan.artifact),
                    selectinload(ModelScan.findings)
                )
            )
            scan = result.scalar_one_or_none()
            
            if not scan:
                raise HTTPException(
                    status_code=404,
                    detail=f"Scan not found: {scan_id}"
                )
            
            # Calculate severity counts
            severity_counts = {
                'critical': 0,
                'high': 0,
                'medium': 0,
                'low': 0,
                'info': 0
            }
            
            for finding in scan.findings:
                severity = finding.severity.lower()
                if severity in severity_counts:
                    severity_counts[severity] += 1
            
            # Calculate scan duration
            scan_duration_ms = None
            if scan.started_at and scan.finished_at:
                duration = scan.finished_at - scan.started_at
                scan_duration_ms = int(duration.total_seconds() * 1000)
            
            return {
                'scan_id': str(scan.id),
                'artifact_id': str(scan.artifact_id),
                'status': scan.status,
                'format': scan.artifact.detected_format,
                'approval_status': scan.artifact.approval_status,
                'findings_count': len(scan.findings),
                'severity_counts': severity_counts,
                'scan_duration_ms': scan_duration_ms,
                'started_at': scan.started_at.isoformat() if scan.started_at else None,
                'finished_at': scan.finished_at.isoformat() if scan.finished_at else None,
                'artifact': {
                    'uri': scan.artifact.uri,
                    'sha256': scan.artifact.sha256,
                    'size_bytes': scan.artifact.size_bytes,
                    'filename': scan.artifact.filename
                }
            }
            
        finally:
            await session.close()
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get report summary: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get report summary: {str(e)}"
        )

