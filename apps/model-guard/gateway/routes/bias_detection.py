"""
Bias Detection API Routes for ModelGuard.

Provides FastAPI endpoints for bias detection functionality.
"""

import os
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from services.bias_detection_service import BiasDetectionService
from gateway.db import get_db
from gateway.auth import require_tenant_auth


router = APIRouter(tags=["bias-detection"])


@router.post("/analyze-gcs")
async def analyze_bias_gcs(
    dataset_file: UploadFile = File(..., description="Dataset CSV file"),
    model_gcs_url: str = Form(..., description="GCS URL of the model (e.g., gs://bucket/path/to/model.pkl)"),
    target_column: str = Form(..., description="Target column name"),
    sensitive_columns: str = Form(..., description="Comma-separated sensitive column names"),
    feature_columns: Optional[str] = Form(None, description="Comma-separated feature column names"),
    analysis_option: str = Form("model-prediction", description="Analysis option: model-prediction (dataset-only coming soon)"),
    db: Session = Depends(get_db),
    tenant_context = Depends(require_tenant_auth)
):
    """
    Analyze bias in model from GCS URL and uploaded dataset file.
    
    ⚠️  IMPORTANT PREPROCESSING REQUIREMENT:
    This system currently supports ONLY models trained with ONE-HOT ENCODING.
    
    Supported Model Training:
    ✅ Models trained with pd.get_dummies() or sklearn.preprocessing.OneHotEncoder
    ❌ Models trained with LabelEncoder, StandardScaler, or other preprocessing
    
    Currently supports:
    - model-prediction: GCS model URL + CSV dataset, generate predictions and analyze bias
    
    TODO: Future support for:
    - dataset-only: Upload CSV with actual and predicted columns already present
    - Multiple preprocessing types: LabelEncoder, StandardScaler, etc.
    
    Args:
        dataset_file: CSV dataset file
        model_gcs_url: GCS URL of the model (e.g., gs://bucket/path/to/model.pkl)
        target_column: Name of the target column
        sensitive_columns: Comma-separated list of sensitive attribute columns
        feature_columns: Comma-separated list of feature columns (required for model prediction)
        analysis_option: Analysis mode (currently only 'model-prediction' supported)
        db: Database session
        tenant_context: Current authenticated tenant context
        
    Returns:
        Bias analysis results
    """
    try:
        # Validate file types
        if not dataset_file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Dataset file must be a CSV file")
        
        # Validate GCS URL format
        if not model_gcs_url.startswith('gs://'):
            raise HTTPException(status_code=400, detail="Model GCS URL must start with 'gs://'")
        
        # Basic GCS URL validation
        if len(model_gcs_url.split('/')) < 4:
            raise HTTPException(status_code=400, detail="Invalid GCS URL format. Expected: gs://bucket/path/to/model.pkl")
        
        # Parse sensitive columns
        sensitive_cols = [col.strip() for col in sensitive_columns.split(',') if col.strip()]
        if not sensitive_cols:
            raise HTTPException(status_code=400, detail="At least one sensitive column is required")
        
        # Parse feature columns if provided
        feature_cols = None
        if feature_columns:
            feature_cols = [col.strip() for col in feature_columns.split(',') if col.strip()]
        
        # Validate analysis option (only model-prediction supported for now)
        if analysis_option not in ['model-prediction']:
            raise HTTPException(status_code=400, detail="Only 'model-prediction' option is currently supported")
        
        # Validate required parameters for model-prediction
        if analysis_option == "model-prediction" and not model_gcs_url:
            raise HTTPException(status_code=400, detail="Model GCS URL is required for model-prediction analysis")
        
        if analysis_option == "model-prediction" and not feature_columns:
            raise HTTPException(status_code=400, detail="Feature columns are required for model-prediction analysis")
        
        # Add preprocessing requirement warning
        print("⚠️  PREPROCESSING REQUIREMENT: This system supports ONLY models trained with ONE-HOT ENCODING")
        print("   Supported: pd.get_dummies(), sklearn.preprocessing.OneHotEncoder")
        print("   NOT Supported: LabelEncoder, StandardScaler, MinMaxScaler, etc.")
        
        # Read dataset file contents
        dataset_content = await dataset_file.read()
        
        # Initialize bias detection service
        print(f"🔍 Database session type: {type(db)}")
        print(f"🔍 Database session is None: {db is None}")
        bias_service = BiasDetectionService(db_session=db)
        
        # Run bias analysis
        results = await bias_service.analyze_bias_from_gcs(
            tenant_id=tenant_context.tenant_id,
            user_id=tenant_context.auth.user_id,
            dataset_file=dataset_content,
            target_column=target_column,
            sensitive_columns=sensitive_cols,
            model_gcs_url=model_gcs_url,
            feature_columns=feature_cols,
            analysis_option=analysis_option
        )
        
        print(f"🔍 Analysis results success: {results.get('success', False)}")
        print(f"🔍 Analysis results scan_id: {results.get('scan_id', 'None')}")
        
        if not results.get('success'):
            raise HTTPException(status_code=500, detail=results.get('error', 'Bias analysis failed'))
        
        return JSONResponse(content=results)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/analyze")
async def analyze_bias_legacy(
    dataset_file: UploadFile = File(..., description="Dataset CSV file"),
    model_file: Optional[UploadFile] = File(None, description="Model PKL file (required for model-prediction)"),
    target_column: str = Form(..., description="Target column name"),
    sensitive_columns: str = Form(..., description="Comma-separated sensitive column names"),
    feature_columns: Optional[str] = Form(None, description="Comma-separated feature column names"),
    analysis_option: str = Form("model-prediction", description="Analysis option: model-prediction (dataset-only coming soon)"),
    db: Session = Depends(get_db),
    tenant_context = Depends(require_tenant_auth)
):
    """
    Analyze bias in uploaded model and dataset files (legacy endpoint).
    
    ⚠️  IMPORTANT PREPROCESSING REQUIREMENT:
    This system currently supports ONLY models trained with ONE-HOT ENCODING.
    
    Supported Model Training:
    ✅ Models trained with pd.get_dummies() or sklearn.preprocessing.OneHotEncoder
    ❌ Models trained with LabelEncoder, StandardScaler, or other preprocessing
    
    Currently supports:
    - model-prediction: Upload PKL model + CSV dataset, generate predictions and analyze bias
    
    TODO: Future support for:
    - dataset-only: Upload CSV with actual and predicted columns already present
    - Multiple preprocessing types: LabelEncoder, StandardScaler, etc.
    
    Args:
        dataset_file: CSV dataset file
        model_file: PKL model file (required for model-prediction)
        target_column: Name of the target column
        sensitive_columns: Comma-separated list of sensitive attribute columns
        feature_columns: Comma-separated list of feature columns (required for model prediction)
        analysis_option: Analysis mode (currently only 'model-prediction' supported)
        db: Database session
        tenant_context: Current authenticated tenant context
        
    Returns:
        Bias analysis results
    """
    try:
        # Validate file types
        if not dataset_file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="Dataset file must be a CSV file")
        
        if model_file and not model_file.filename.endswith('.pkl'):
            raise HTTPException(status_code=400, detail="Model file must be a PKL file")
        
        # Parse sensitive columns
        sensitive_cols = [col.strip() for col in sensitive_columns.split(',') if col.strip()]
        if not sensitive_cols:
            raise HTTPException(status_code=400, detail="At least one sensitive column is required")
        
        # Parse feature columns if provided
        feature_cols = None
        if feature_columns:
            feature_cols = [col.strip() for col in feature_columns.split(',') if col.strip()]
        
        # Validate analysis option (only model-prediction supported for now)
        if analysis_option not in ['model-prediction']:
            raise HTTPException(status_code=400, detail="Only 'model-prediction' option is currently supported")
        
        # Validate required files for model-prediction
        if analysis_option == "model-prediction" and not model_file:
            raise HTTPException(status_code=400, detail="Model file is required for model-prediction analysis")
        
        if analysis_option == "model-prediction" and not feature_columns:
            raise HTTPException(status_code=400, detail="Feature columns are required for model-prediction analysis")
        
        # Add preprocessing requirement warning
        print("⚠️  PREPROCESSING REQUIREMENT: This system supports ONLY models trained with ONE-HOT ENCODING")
        print("   Supported: pd.get_dummies(), sklearn.preprocessing.OneHotEncoder")
        print("   NOT Supported: LabelEncoder, StandardScaler, MinMaxScaler, etc.")
        
        # Read file contents
        dataset_content = await dataset_file.read()
        model_content = None
        if model_file:
            model_content = await model_file.read()
        
        # Initialize bias detection service
        print(f"🔍 Database session type: {type(db)}")
        print(f"🔍 Database session is None: {db is None}")
        bias_service = BiasDetectionService(db_session=db)
        
        # Run bias analysis using legacy method
        results = await bias_service.analyze_bias_from_files(
            tenant_id=tenant_context.tenant_id,
            user_id=tenant_context.auth.user_id,
            dataset_file=dataset_content,
            target_column=target_column,
            sensitive_columns=sensitive_cols,
            model_file=model_content,
            feature_columns=feature_cols,
            analysis_option=analysis_option
        )
        
        print(f"🔍 Analysis results success: {results.get('success', False)}")
        print(f"🔍 Analysis results scan_id: {results.get('scan_id', 'None')}")
        
        if not results.get('success'):
            raise HTTPException(status_code=500, detail=results.get('error', 'Bias analysis failed'))
        
        return JSONResponse(content=results)
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/results/{scan_id}")
async def get_bias_results(
    scan_id: str,
    db: Session = Depends(get_db),
    tenant_context = Depends(require_tenant_auth)
):
    """
    Retrieve bias analysis results by scan ID.
    
    Args:
        scan_id: Scan identifier (ModelScan.id)
        db: Database session
        tenant_context: Current authenticated tenant context
        
    Returns:
        Bias analysis results
    """
    try:
        # Validate scan ID format
        try:
            UUID(scan_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid scan ID format")
        
        # Initialize bias detection service
        bias_service = BiasDetectionService(db_session=db)
        
        # Get results
        results = await bias_service.get_bias_analysis_results(
            tenant_id=tenant_context.tenant_id,
            scan_id=scan_id
        )
        
        if results is None:
            raise HTTPException(status_code=404, detail="Bias analysis results not found")
        
        return JSONResponse(content={
            'success': True,
            'scan_id': scan_id,
            'results': results
        })
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/analyses")
async def list_bias_analyses(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    tenant_context = Depends(require_tenant_auth)
):
    """
    List bias analyses for the current tenant.
    
    Args:
        limit: Maximum number of results
        offset: Offset for pagination
        db: Database session
        current_user: Current authenticated user
        
    Returns:
        List of bias analysis summaries
    """
    try:
        # Validate pagination parameters
        if limit < 1 or limit > 100:
            raise HTTPException(status_code=400, detail="Limit must be between 1 and 100")
        if offset < 0:
            raise HTTPException(status_code=400, detail="Offset must be non-negative")
        
        # Initialize bias detection service
        bias_service = BiasDetectionService(db_session=db)
        
        # Get analyses
        analyses = await bias_service.list_bias_analyses(
            tenant_id=tenant_context.tenant_id,
            limit=limit,
            offset=offset
        )
        
        return JSONResponse(content={
            'success': True,
            'analyses': analyses,
            'pagination': {
                'limit': limit,
                'offset': offset,
                'count': len(analyses)
            }
        })
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.post("/extract-columns")
async def extract_dataset_columns(
    dataset_file: UploadFile = File(..., description="Dataset CSV file"),
    tenant_context = Depends(require_tenant_auth)
):
    """
    Extract column names from uploaded dataset file.
    
    This endpoint helps the frontend dynamically populate column selection dropdowns.
    
    Args:
        dataset_file: CSV dataset file
        current_user: Current authenticated user
        
    Returns:
        List of column names and their types
    """
    try:
        # Validate file type
        if not dataset_file.filename.endswith('.csv'):
            raise HTTPException(status_code=400, detail="File must be a CSV file")
        
        # Read file contents
        dataset_content = await dataset_file.read()
        
        # Parse CSV to extract columns
        import pandas as pd
        import io
        
        df = pd.read_csv(io.BytesIO(dataset_content))
        
        # Analyze column types
        columns_info = []
        for col in df.columns:
            col_info = {
                'name': col,
                'type': str(df[col].dtype),
                'unique_values': df[col].nunique(),
                'null_count': df[col].isnull().sum(),
                'sample_values': df[col].dropna().head(5).tolist()
            }
            columns_info.append(col_info)
        
        return JSONResponse(content={
            'success': True,
            'columns': columns_info,
            'total_rows': len(df),
            'total_columns': len(df.columns)
        })
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@router.get("/health")
async def health_check():
    """
    Health check endpoint for bias detection service.
    
    Returns:
        Service health status
    """
    return JSONResponse(content={
        'status': 'healthy',
        'service': 'bias-detection',
        'message': 'Bias detection service is running'
    })
