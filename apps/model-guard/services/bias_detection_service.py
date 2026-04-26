"""
Bias Detection Service for ModelGuard.

This service provides comprehensive bias detection capabilities for ML models,
integrating with the existing ModelGuard architecture.
"""

import os
import tempfile
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession

from enhanced_bias_analysis import BiasAnalysisEngine
from models import ModelArtifact, ModelScan, ScanFinding
from gateway.db import get_db
from gateway.config import get_settings
from adapters.gcs import GCSManager


class BiasDetectionService:
    """
    Service for detecting bias in ML models and datasets.
    
    This service integrates the proven BiasAnalysisEngine from the POC
    with the ModelGuard architecture for production use.
    """
    
    def __init__(self, db_session: Optional[AsyncSession] = None):
        """
        Initialize the bias detection service.
        
        Args:
            db_session: Database session for storing results
        """
        self.db_session = db_session
        self.bias_engine = BiasAnalysisEngine()
    
    async def analyze_bias_from_files(
        self,
        tenant_id: str,
        user_id: str,
        dataset_file: bytes,
        target_column: str,
        sensitive_columns: List[str],
        model_file: Optional[bytes] = None,
        feature_columns: Optional[List[str]] = None,
        analysis_option: str = "model-prediction"
    ) -> Dict[str, Any]:
        """
        Analyze bias from uploaded model and dataset files (legacy method).
        
        Args:
            tenant_id: Tenant identifier
            user_id: User identifier
            dataset_file: Dataset file bytes
            target_column: Target column name
            sensitive_columns: List of sensitive attribute columns
            model_file: Model file bytes (optional for dataset-only analysis)
            feature_columns: List of feature columns (for model prediction)
            analysis_option: Analysis mode ('model-prediction' or 'dataset-only')
            
        Returns:
            Dictionary containing analysis results
        """
        # This is the original method - keeping for backward compatibility
        # Implementation remains the same as before
        try:
            print(f"🚀 Starting bias analysis for tenant {tenant_id}")
            print(f"Analysis option: {analysis_option}")
            print(f"Target column: {target_column}")
            print(f"Sensitive columns: {sensitive_columns}")
            
            # Process files in temporary directory
            with tempfile.TemporaryDirectory() as temp_dir:
                # Save dataset
                dataset_path = os.path.join(temp_dir, 'dataset.csv')
                with open(dataset_path, 'wb') as f:
                    f.write(dataset_file)
                
                # Load and validate dataset
                testing_df = pd.read_csv(dataset_path)
                print(f"Dataset loaded - Shape: {testing_df.shape}")
                print(f"Columns: {list(testing_df.columns)}")
                
                # Validate required columns exist
                required_cols = [target_column] + sensitive_columns
                missing_cols = [col for col in required_cols if col not in testing_df.columns]
                if missing_cols:
                    raise ValueError(f"Required columns not found in dataset: {missing_cols}")
                
                # Save model if provided
                model_path = None
                if model_file and analysis_option == "model-prediction":
                    model_path = os.path.join(temp_dir, 'model.pkl')
                    with open(model_path, 'wb') as f:
                        f.write(model_file)
                    print(f"Model saved to: {model_path}")
                
                # Configure analysis parameters
                if analysis_option == "model-prediction":
                    if not model_path:
                        raise ValueError("Model file is required for model-prediction option")
                    if not feature_columns:
                        raise ValueError("Feature columns are required for model-prediction option")
                    
                    final_actual_col = target_column
                    final_predicted_col = 'model_predictions'
                    final_target_column = target_column
                    final_feature_columns = feature_columns
                
                else:  # dataset-only (currently disabled)
                    raise ValueError("Dataset-only analysis is currently disabled. Please use model-prediction option.")
                
                # Run comprehensive bias analysis using your proven POC implementation
                results = self.bias_engine.comprehensive_bias_analysis(
                    testing_df=testing_df,
                    actual_col=final_actual_col,
                    predicted_col=final_predicted_col,
                    sensitive_attrs=sensitive_columns,
                    training_df=None,  # Optional training data
                    model_file=model_path,
                    feature_columns=final_feature_columns,
                    target_column=final_target_column,
                    analysis_option=analysis_option
                )
                
                print("✅ Bias analysis completed successfully")
                
                # Store results in database
                result_id = await self._store_bias_analysis_results(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    results=results,
                    configuration={
                        'target_column': target_column,
                        'sensitive_columns': sensitive_columns,
                        'feature_columns': feature_columns,
                        'analysis_option': analysis_option,
                        'dataset_shape': list(testing_df.shape),
                        'dataset_filename': 'dataset.csv',
                        'dataset_file_bytes': dataset_file,  # Include dataset bytes for hash calculation
                        'model_filename': 'model.pkl' if model_file else None,
                        'dataset_size_bytes': len(dataset_file),
                        'model_size_bytes': len(model_file) if model_file else None
                    }
                )
                
                return {
                    'success': True,
                    'scan_id': str(result_id),
                    'analysis_option': analysis_option,
                    'dataset_shape': list(testing_df.shape),
                    'configuration': {
                        'target_column': target_column,
                        'sensitive_columns': sensitive_columns,
                        'feature_columns': feature_columns
                    },
                    'results': results
                }
                
        except Exception as e:
            print(f"❌ Error in bias analysis: {str(e)}")
            print(traceback.format_exc())
            return {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }
    
    async def analyze_bias_from_gcs(
        self,
        tenant_id: str,
        user_id: str,
        dataset_file: bytes,
        target_column: str,
        sensitive_columns: List[str],
        model_gcs_url: str,
        feature_columns: Optional[List[str]] = None,
        analysis_option: str = "model-prediction"
    ) -> Dict[str, Any]:
        """
        Analyze bias from GCS model URL and uploaded dataset file.
        
        Args:
            tenant_id: Tenant identifier
            user_id: User identifier
            dataset_file: Dataset file bytes
            target_column: Target column name
            sensitive_columns: List of sensitive attribute columns
            model_gcs_url: GCS URL of the model (e.g., gs://bucket/path/to/model.pkl)
            feature_columns: List of feature columns (for model prediction)
            analysis_option: Analysis mode ('model-prediction' or 'dataset-only')
            
        Returns:
            Dictionary containing analysis results
        """
        try:
            print(f"🚀 Starting bias analysis for tenant {tenant_id}")
            print(f"Analysis option: {analysis_option}")
            print(f"Target column: {target_column}")
            print(f"Sensitive columns: {sensitive_columns}")
            print(f"Model GCS URL: {model_gcs_url}")
            
            # Pick S3 if configured, fall back to GCS for back-compat.
            settings = get_settings()
            using_s3 = bool(settings.s3_bucket_name)
            s3_manager = None
            gcs_manager = None
            if using_s3:
                from adapters.s3 import S3Manager
                s3_manager = S3Manager(
                    bucket_name=settings.s3_bucket_name,
                    region=settings.aws_region,
                )
            else:
                gcs_manager = GCSManager(
                    bucket_name=settings.gs_bucket_name,
                    project_id=settings.gs_project_id,
                    credentials_path=settings.gs_credentials_path,
                )
            
            # Process files in temporary directory
            with tempfile.TemporaryDirectory() as temp_dir:
                # Save dataset
                dataset_path = os.path.join(temp_dir, 'dataset.csv')
                with open(dataset_path, 'wb') as f:
                    f.write(dataset_file)
                
                # Load and validate dataset
                testing_df = pd.read_csv(dataset_path)
                print(f"Dataset loaded - Shape: {testing_df.shape}")
                print(f"Columns: {list(testing_df.columns)}")
                
                # Validate required columns exist
                required_cols = [target_column] + sensitive_columns
                missing_cols = [col for col in required_cols if col not in testing_df.columns]
                if missing_cols:
                    raise ValueError(f"Required columns not found in dataset: {missing_cols}")
                
                # Download model from user's GCS URL to temporary location only
                # NOTE: We do NOT store models permanently in ModelGuard's GCS bucket
                # This ensures we always use the latest version from user's bucket
                model_path = None
                model_sha256 = None
                
                if analysis_option == "model-prediction":
                    print(f"📥 Processing model from object storage: {model_gcs_url}")
                    try:
                        # Step 1: Download user-supplied model. Accepts s3:// or gs:// URLs.
                        print(f"🔄 Step 1: Downloading model from user's object-storage URL...")

                        if model_gcs_url.startswith("s3://"):
                            url_parts = model_gcs_url[5:].split("/", 1)
                            if len(url_parts) != 2:
                                raise ValueError(f"Invalid S3 URL format: {model_gcs_url}")
                            user_bucket, user_object_path = url_parts
                            temp_model_path = os.path.join(temp_dir, "user_model.pkl")
                            import boto3
                            from botocore.exceptions import ClientError
                            user_s3 = boto3.client("s3", region_name=settings.aws_region)
                            try:
                                user_s3.head_object(Bucket=user_bucket, Key=user_object_path)
                            except ClientError as exc:
                                code = exc.response.get("Error", {}).get("Code", "")
                                if code in {"404", "NoSuchKey", "NotFound"}:
                                    raise ValueError(f"Model not found at user's S3 URL: {model_gcs_url}")
                                raise
                            user_s3.download_file(user_bucket, user_object_path, temp_model_path)
                            print(f"✅ Model downloaded from user's S3 to: {temp_model_path}")
                        elif model_gcs_url.startswith("gs://"):
                            url_parts = model_gcs_url[5:].split("/", 1)
                            if len(url_parts) != 2:
                                raise ValueError(f"Invalid GCS URL format: {model_gcs_url}")
                            user_bucket, user_object_path = url_parts
                            temp_model_path = os.path.join(temp_dir, "user_model.pkl")

                            from google.cloud import storage
                            user_gcs_client = storage.Client.from_service_account_json(
                                settings.gs_credentials_path,
                                project=settings.gs_project_id,
                            )
                            user_bucket_obj = user_gcs_client.bucket(user_bucket)
                            user_blob = user_bucket_obj.blob(user_object_path)
                            if not user_blob.exists():
                                raise ValueError(f"Model not found at user's GCS URL: {model_gcs_url}")
                            user_blob.download_to_filename(temp_model_path)
                            print(f"✅ Model downloaded from user's GCS to: {temp_model_path}")
                        else:
                            raise ValueError(
                                f"Invalid object-storage URL format (expected s3:// or gs://): {model_gcs_url}"
                            )
                        
                        # Step 2: Calculate SHA-256 hash of the downloaded model
                        print(f"🔄 Step 2: Calculating SHA-256 hash...")
                        import hashlib
                        with open(temp_model_path, 'rb') as f:
                            model_sha256 = hashlib.sha256(f.read()).hexdigest()
                        print(f"✅ Model SHA-256: {model_sha256}")
                        
                        # Step 3: Use the temporary model file directly for analysis
                        print(f"🔄 Step 3: Using temporary model file for analysis...")
                        model_path = temp_model_path
                        print(f"✅ Model ready for analysis: {model_path}")
                        
                    except Exception as e:
                        raise ValueError(f"Failed to process model from GCS: {str(e)}")
                
                # Configure analysis parameters
                if analysis_option == "model-prediction":
                    if not model_path:
                        raise ValueError("Model file is required for model-prediction option")
                    if not feature_columns:
                        raise ValueError("Feature columns are required for model-prediction option")
                    
                    final_actual_col = target_column
                    final_predicted_col = 'model_predictions'
                    final_target_column = target_column
                    final_feature_columns = feature_columns
                
                # TODO: Dataset-only workflow (commented out for now)
                # This would allow users to upload a dataset with both actual and predicted columns
                # else:  # dataset-only
                #     # For dataset-only, we need both actual and predicted columns
                #     # User should specify both actual_col and predicted_col
                #     if not predicted_column:
                #         raise ValueError("Predicted column is required for dataset-only option")
                #     
                #     final_actual_col = target_column  # This is the actual column
                #     final_predicted_col = predicted_column  # This is the predicted column
                #     final_target_column = None
                #     final_feature_columns = None
                
                else:  # dataset-only (currently disabled)
                    raise ValueError("Dataset-only analysis is currently disabled. Please use model-prediction option.")
                
                # Run comprehensive bias analysis using your proven POC implementation
                results = self.bias_engine.comprehensive_bias_analysis(
                    testing_df=testing_df,
                    actual_col=final_actual_col,
                    predicted_col=final_predicted_col,
                    sensitive_attrs=sensitive_columns,
                    training_df=None,  # Optional training data
                    model_file=model_path,
                    feature_columns=final_feature_columns,
                    target_column=final_target_column,
                    analysis_option=analysis_option
                )
                
                print("✅ Bias analysis completed successfully")
                
                # Store results in database
                result_id = await self._store_bias_analysis_results(
                    tenant_id=tenant_id,
                    user_id=user_id,
                    results=results,
                    configuration={
                        'target_column': target_column,
                        'sensitive_columns': sensitive_columns,
                        'feature_columns': feature_columns,
                        'analysis_option': analysis_option,
                        'dataset_shape': list(testing_df.shape),
                        'dataset_filename': 'dataset.csv',  # Will be updated with actual filename
                        'dataset_file_bytes': dataset_file,  # Include dataset bytes for hash calculation
                        'model_gcs_url': model_gcs_url,
                        'model_sha256': model_sha256 if 'model_sha256' in locals() else None,
                        'dataset_size_bytes': len(dataset_file),
                        'model_size_bytes': os.path.getsize(model_path) if model_path and os.path.exists(model_path) else None
                    }
                )
                
                return {
                    'success': True,
                    'scan_id': str(result_id),  # result_id is actually the scan_id now
                    'analysis_option': analysis_option,
                    'dataset_shape': list(testing_df.shape),
                    'configuration': {
                        'target_column': target_column,
                        'sensitive_columns': sensitive_columns,
                        'feature_columns': feature_columns
                    },
                    'results': results
                }
                
        except Exception as e:
            print(f"❌ Error in bias analysis: {str(e)}")
            print(traceback.format_exc())
            return {
                'success': False,
                'error': str(e),
                'traceback': traceback.format_exc()
            }
    
    async def _store_bias_analysis_results(
        self,
        tenant_id: str,
        user_id: str,
        results: Dict[str, Any],
        configuration: Dict[str, Any]
    ) -> str:
        """
        Store bias analysis results in the database using existing ModelGuard tables.
        
        Args:
            tenant_id: Tenant identifier
            user_id: User identifier
            results: Analysis results
            configuration: Analysis configuration
            
        Returns:
            Scan ID (ModelScan.id)
        """
        if not self.db_session:
            # If no DB session, return a mock ID
            print("⚠️  No database session available, returning mock ID")
            return str(uuid4())
        
        try:
            print(f"🔍 Storing bias analysis results for tenant: {tenant_id}")
            print(f"🔍 Configuration: {configuration}")
            
            # Calculate SHA-256 hash for the dataset
            import hashlib
            dataset_sha256 = hashlib.sha256(configuration.get('dataset_file_bytes', b'')).hexdigest()
            
            # Check if artifact already exists
            from sqlalchemy.future import select
            stmt = select(ModelArtifact).filter(
                ModelArtifact.tenant_id == tenant_id,
                ModelArtifact.sha256 == dataset_sha256,
                ModelArtifact.source == 'bias'
            )
            result = await self.db_session.execute(stmt)
            existing_artifact = result.scalar_one_or_none()
            
            if existing_artifact:
                print(f"✅ Using existing artifact with ID: {existing_artifact.id}")
                artifact = existing_artifact
            else:
                # Create a ModelArtifact entry for bias analysis
                # Use 'bias' as source to distinguish from security scans
                artifact = ModelArtifact(
                    tenant_id=tenant_id,
                    source='bias',  # Distinguishes bias scans from security scans
                    uri=f"bias://{configuration.get('dataset_filename', 'dataset.csv')}",
                    filename=configuration.get('dataset_filename', 'dataset.csv'),
                    size_bytes=configuration.get('dataset_size_bytes', 0),
                    sha256=dataset_sha256,
                    content_type='application/csv',
                    detected_format='csv',
                    approval_status='approved',  # Bias analysis doesn't need approval workflow
                    # Store bias-specific metadata in artifact_metadata
                    artifact_metadata={
                        'scan_type': 'bias',
                        'analysis_type': configuration.get('analysis_option', 'model-prediction'),
                        'model_gcs_url': configuration.get('model_gcs_url'),
                        'model_sha256': configuration.get('model_sha256'),
                        'target_column': configuration.get('target_column'),
                        'sensitive_columns': configuration.get('sensitive_columns', []),
                        'feature_columns': configuration.get('feature_columns', []),
                        'dataset_shape': configuration.get('dataset_shape', [0, 0]),
                        'dataset_columns': configuration.get('dataset_columns', {}),
                        'model_size_bytes': configuration.get('model_size_bytes'),
                        'storage_type': 'temporary',  # Indicates this is temporary storage only
                    },
                    created_by=user_id
                )
                self.db_session.add(artifact)
            
            await self.db_session.flush()  # Get the ID
            
            # Ensure artifact ID is set
            if not artifact.id:
                print("❌ Artifact ID is None after flush, committing...")
                await self.db_session.commit()
                await self.db_session.refresh(artifact)
            
            print(f"✅ Created/Using artifact with ID: {artifact.id}")
            
            # Extract summary metrics from results
            final_assessment = results.get('final_assessment', {})
            overall_risk_level = final_assessment.get('priority', 'P3 - Standard monitoring')
            if 'P0' in overall_risk_level:
                risk_level = 'CRITICAL'
            elif 'P1' in overall_risk_level:
                risk_level = 'HIGH'
            elif 'P2' in overall_risk_level:
                risk_level = 'MEDIUM'
            else:
                risk_level = 'LOW'
            
            # Check overall EEOC compliance
            eeoc_compliant = True
            bias_violations_count = 0
            
            if 'model_analysis' in results:
                for attr_result in results['model_analysis'].values():
                    if 'compliance' in attr_result:
                        if not attr_result['compliance'].get('overall_status', '').startswith('🟢'):
                            eeoc_compliant = False
                        if attr_result['compliance'].get('risk_level') in ['HIGH', 'CRITICAL']:
                            bias_violations_count += 1
            
            # Create a ModelScan entry for bias analysis results
            # Store complete bias analysis in report_json
            bias_report = {
                'scan_type': 'bias',
                'model_analysis': results.get('model_analysis', {}),
                'intersectional_analysis': results.get('intersectional_analysis', {}),
                'final_assessment': final_assessment,
                'summary': {
                    'overall_risk_level': risk_level,
                    'eeoc_compliant': eeoc_compliant,
                    'bias_violations_count': bias_violations_count
                }
            }
            
            # Ensure artifact ID is valid before creating scan
            if not artifact.id:
                raise ValueError("Artifact ID is None, cannot create scan")
            
            scan = ModelScan(
                tenant_id=tenant_id,
                artifact_id=artifact.id,
                status='success',
                engine_version='bias-detection-1.0.0',
                report_json=bias_report,
                created_by=user_id,
                started_at=datetime.utcnow(),
                finished_at=datetime.utcnow()
            )
            
            self.db_session.add(scan)
            await self.db_session.flush()  # Get the ID
            print(f"✅ Created scan with ID: {scan.id}")
            
            # Create findings for bias violations
            findings = self._extract_bias_findings(results, tenant_id, scan.id)
            for finding in findings:
                self.db_session.add(finding)
            
            await self.db_session.commit()
            print(f"✅ Successfully committed bias analysis to database. Scan ID: {scan.id}")
            
            return str(scan.id)
        
        except Exception as e:
            await self.db_session.rollback()
            print(f"Error storing bias analysis results: {str(e)}")
            raise
    
    def _extract_bias_findings(
        self,
        results: Dict[str, Any],
        tenant_id: str,
        scan_id: str
    ) -> List[ScanFinding]:
        """
        Extract bias findings from analysis results using ScanFinding model.
        
        Args:
            results: Analysis results
            tenant_id: Tenant identifier
            scan_id: Scan identifier (ModelScan.id)
            
        Returns:
            List of bias findings as ScanFinding objects
        """
        findings = []
        
        try:
            # Extract bias violations from model analysis
            if 'model_analysis' in results:
                for attribute, attr_results in results['model_analysis'].items():
                    if 'compliance' in attr_results:
                        compliance = attr_results['compliance']
                        risk_level = compliance.get('risk_level', 'LOW')
                        
                        # Only create findings for violations
                        if risk_level in ['HIGH', 'CRITICAL']:
                            finding = ScanFinding(
                                tenant_id=tenant_id,
                                scan_id=scan_id,
                                rule_id=f'BIAS.{attribute.upper()}.COMPLIANCE',  # Bias-specific rule ID
                                severity=self._map_bias_severity(risk_level.lower()),
                                title=f"Bias Violation: {attribute}",
                                description=compliance.get('overall_status', f'Bias violation detected in {attribute}'),
                                evidence=compliance,
                                remediation=attr_results.get('recommendations', [])
                            )
                            findings.append(finding)
                        
                        # Check individual fairness metrics
                        if 'fairness_metrics' in attr_results:
                            fairness_metrics = attr_results['fairness_metrics']
                            
                            # Check demographic parity
                            if not compliance.get('dp_ratio_compliant', True):
                                finding = ScanFinding(
                                    tenant_id=tenant_id,
                                    scan_id=scan_id,
                                    rule_id=f'BIAS.{attribute.upper()}.DEMOGRAPHIC_PARITY',
                                    severity='High',
                                    title=f"Demographic Parity Violation: {attribute}",
                                    description=f"Adverse impact ratio below 0.80 threshold for {attribute}",
                                    evidence=fairness_metrics,
                                    remediation=['Apply demographic parity constraints', 'Retrain with fairness-aware algorithms']
                                )
                                findings.append(finding)
                            
                            # Check equal opportunity
                            if not compliance.get('eo_diff_compliant', True):
                                finding = ScanFinding(
                                    tenant_id=tenant_id,
                                    scan_id=scan_id,
                                    rule_id=f'BIAS.{attribute.upper()}.EQUAL_OPPORTUNITY',
                                    severity='High',
                                    title=f"Equal Opportunity Violation: {attribute}",
                                    description=f"Equal opportunity difference exceeds 0.05 threshold for {attribute}",
                                    evidence=fairness_metrics,
                                    remediation=['Apply equal opportunity constraints', 'Post-process predictions']
                                )
                                findings.append(finding)
        
        except Exception as e:
            print(f"Error extracting bias findings: {str(e)}")
        
        return findings
    
    def _map_bias_severity(self, bias_severity: str) -> str:
        """
        Map bias severity to standard severity levels.
        
        Args:
            bias_severity: Bias-specific severity
            
        Returns:
            Standard severity level
        """
        mapping = {
            'critical': 'Critical',
            'high': 'High',
            'medium': 'Medium',
            'low': 'Low',
            'info': 'Info'
        }
        return mapping.get(bias_severity.lower(), 'Medium')
    
    async def get_bias_analysis_results(
        self,
        tenant_id: str,
        scan_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve bias analysis results by scan ID.
        
        Args:
            tenant_id: Tenant identifier
            scan_id: Scan identifier (ModelScan.id)
            
        Returns:
            Analysis results or None if not found
        """
        if not self.db_session:
            return None
        
        try:
            # Query the model scan with bias results
            scan = self.db_session.query(ModelScan).filter(
                ModelScan.id == scan_id,
                ModelScan.tenant_id == tenant_id
            ).first()
            
            if not scan or not scan.report_json:
                return None
            
            # Check if this is a bias scan
            report_data = scan.report_json
            if report_data.get('scan_type') != 'bias':
                return None
            
            # Return the bias analysis results with additional metadata
            return {
                'model_analysis': report_data.get('model_analysis', {}),
                'intersectional_analysis': report_data.get('intersectional_analysis', {}),
                'final_assessment': report_data.get('final_assessment', {}),
                'overall_risk_level': report_data.get('summary', {}).get('overall_risk_level', 'UNKNOWN'),
                'eeoc_compliant': report_data.get('summary', {}).get('eeoc_compliant', False),
                'bias_violations_count': report_data.get('summary', {}).get('bias_violations_count', 0),
                'processing_time_ms': None,  # Not stored in ModelScan
                'created_at': scan.created_at.isoformat() if scan.created_at else None
            }
            
        except Exception as e:
            print(f"Error retrieving bias analysis results: {str(e)}")
            return None
    
    async def list_bias_analyses(
        self,
        tenant_id: str,
        limit: int = 50,
        offset: int = 0
    ) -> List[Dict[str, Any]]:
        """
        List bias analyses for a tenant using existing ModelGuard tables.
        
        Args:
            tenant_id: Tenant identifier
            limit: Maximum number of results
            offset: Offset for pagination
            
        Returns:
            List of bias analysis summaries
        """
        if not self.db_session:
            return []
        
        try:
            # Query model scans that are bias analyses
            scans = self.db_session.query(ModelScan).join(ModelArtifact).filter(
                ModelScan.tenant_id == tenant_id,
                ModelScan.status == 'success',
                ModelArtifact.source == 'bias'  # Only bias scans
            ).order_by(ModelScan.created_at.desc()).offset(offset).limit(limit).all()
            
            results = []
            for scan in scans:
                # Get the associated artifact
                artifact = self.db_session.query(ModelArtifact).filter(
                    ModelArtifact.id == scan.artifact_id
                ).first()
                
                if not artifact or not scan.report_json:
                    continue
                
                # Extract summary from report_json
                report_data = scan.report_json
                summary = report_data.get('summary', {})
                metadata = artifact.artifact_metadata or {}
                
                results.append({
                    'artifact_id': str(artifact.id),
                    'scan_id': str(scan.id),  # Use scan_id instead of result_id
                    'analysis_type': metadata.get('analysis_type', 'model-prediction'),
                    'target_column': metadata.get('target_column', 'unknown'),
                    'sensitive_columns': metadata.get('sensitive_columns', []),
                    'dataset_shape': metadata.get('dataset_shape', [0, 0]),
                    'overall_risk_level': summary.get('overall_risk_level', 'UNKNOWN'),
                    'eeoc_compliant': summary.get('eeoc_compliant', False),
                    'bias_violations_count': summary.get('bias_violations_count', 0),
                    'created_at': scan.created_at.isoformat(),
                    'status': artifact.status
                })
            
            return results
            
        except Exception as e:
            print(f"Error listing bias analyses: {str(e)}")
            return []
