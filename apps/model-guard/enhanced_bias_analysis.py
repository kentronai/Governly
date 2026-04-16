import pandas as pd
import numpy as np
import pickle
import joblib
from fairlearn.metrics import (
    MetricFrame,
    selection_rate,
    true_positive_rate,
    false_positive_rate,
    false_negative_rate,
    demographic_parity_difference,
    demographic_parity_ratio,
    equal_opportunity_difference,
    equalized_odds_difference
)
from sklearn.metrics import accuracy_score, precision_score, recall_score, confusion_matrix
from sklearn.preprocessing import LabelEncoder
from itertools import combinations
import traceback
import json
import warnings
warnings.filterwarnings('ignore')

class BiasAnalysisEngine:
    """
    Enhanced bias detection system supporting multiple workflows and encoding methods
    """
    
    def __init__(self):
        self.results = {}
        self.model = None
        self.model_data = None
        self.feature_columns = []
        self.encoded_columns = []
        self.label_encoders = {}
        
    def load_model(self, model_path):
        """
        Load a trained model from pickle file
        """
        try:
            with open(model_path, 'rb') as f:
                self.model_data = pickle.load(f)
            
            # Handle different model save formats
            if isinstance(self.model_data, dict):
                self.model = self.model_data.get('model')
                self.feature_columns = self.model_data.get('feature_columns', [])
                self.encoded_columns = self.model_data.get('encoded_columns', [])
                self.label_encoders = self.model_data.get('label_encoders', {})
            else:
                # Direct model object
                self.model = self.model_data
                
            print(f"✅ Model loaded successfully from {model_path}")
            print(f"Model type: {type(self.model)}")
            if hasattr(self.model, 'feature_names_in_'):
                print(f"Model expects {len(self.model.feature_names_in_)} features")
            return True
        except Exception as e:
            try:
                # Try joblib if pickle fails
                self.model_data = joblib.load(model_path)
                if isinstance(self.model_data, dict):
                    self.model = self.model_data.get('model')
                    self.feature_columns = self.model_data.get('feature_columns', [])
                    self.encoded_columns = self.model_data.get('encoded_columns', [])
                else:
                    self.model = self.model_data
                print(f"✅ Model loaded successfully from {model_path} using joblib")
                return True
            except Exception as e2:
                print(f"❌ Failed to load model: {str(e)} | {str(e2)}")
                raise Exception(f"Model loading failed: {str(e)}")
    
    def preprocess_features_for_prediction(self, df, feature_columns):
        """
        Preprocess features to match training preprocessing.
        
        IMPORTANT: This assumes the model was trained with one-hot encoding.
        For other preprocessing types (label encoding, scaling, etc.), 
        the model should be saved with preprocessing information.
        """
        try:
            print(f"Preprocessing features: {feature_columns}")
            
            # Select only the feature columns
            feature_df = df[feature_columns].copy()
            
            # Apply one-hot encoding using pd.get_dummies (assumes training used this)
            encoded_df = pd.get_dummies(feature_df)
            
            print(f"One-hot encoded: {len(encoded_df.columns)} columns")
            
            # If we have stored encoded columns from training, align with them
            if self.encoded_columns:
                print(f"Aligning with training columns ({len(self.encoded_columns)} columns)")
                
                # Add missing columns with 0s
                for col in self.encoded_columns:
                    if col not in encoded_df.columns:
                        encoded_df[col] = 0
                
                # Remove extra columns and reorder to match training
                encoded_df = encoded_df[self.encoded_columns]
            else:
                print("⚠️  No training column info found - using current encoding")
            
            return encoded_df
            
        except Exception as e:
            print(f"Feature preprocessing error: {str(e)}")
            raise Exception(f"Feature preprocessing failed: {str(e)}")
    
    def generate_predictions(self, df, feature_columns, target_column):
        """
        Generate predictions using loaded model with one-hot encoding
        """
        try:
            if self.model is None:
                raise ValueError("No model loaded")
            
            print(f"Generating predictions for {len(df)} samples")
            print(f"Using features: {feature_columns}")
            
            # Preprocess features using one-hot encoding
            X = self.preprocess_features_for_prediction(df, feature_columns)
            
            print(f"Preprocessed data shape: {X.shape}")
            
            # Generate predictions
            if hasattr(self.model, 'predict_proba'):
                # For probabilistic predictions, use threshold of 0.5
                predictions_proba = self.model.predict_proba(X)
                if predictions_proba.shape[1] > 1:
                    predictions = (predictions_proba[:, 1] > 0.5).astype(int)
                else:
                    predictions = (predictions_proba[:, 0] > 0.5).astype(int)
            else:
                predictions = self.model.predict(X)
            
            # Ensure binary predictions
            unique_preds = np.unique(predictions)
            if len(unique_preds) > 2:
                # Convert to binary if multi-class
                predictions = (predictions > np.median(predictions)).astype(int)
            
            print(f"✅ Generated {len(predictions)} predictions")
            print(f"Prediction distribution: {np.bincount(predictions)}")
            
            return predictions
            
        except Exception as e:
            print(f"Prediction generation error: {str(e)}")
            raise Exception(f"Prediction generation failed: {str(e)}")
    
    def validate_dataset(self, df, required_columns, dataset_name="Dataset"):
        """
        Validate dataset has required columns and data
        """
        try:
            if df is None or df.empty:
                raise ValueError(f"{dataset_name} is empty")
            
            missing_columns = [col for col in required_columns if col not in df.columns]
            if missing_columns:
                available_cols = list(df.columns)
                raise ValueError(f"Missing columns in {dataset_name}: {missing_columns}. Available columns: {available_cols}")
            
            # Check for sufficient data
            if len(df) < 10:
                raise ValueError(f"{dataset_name} has insufficient data (minimum 10 rows required)")
            
            print(f"✅ {dataset_name} validation passed: {len(df)} rows, {len(df.columns)} columns")
            return True
            
        except Exception as e:
            raise Exception(f"{dataset_name} validation failed: {str(e)}")

    def comprehensive_bias_analysis(self, 
                                  testing_df, 
                                  actual_col, 
                                  predicted_col, 
                                  sensitive_attrs,
                                  training_df=None,
                                  model_file=None,
                                  feature_columns=None,
                                  target_column=None,
                                  analysis_option='model-prediction'):
        """
        Complete bias detection system supporting multiple workflows:
        
        1. MODEL-PREDICTION WORKFLOW (Currently Active):
           - Upload PKL model + CSV dataset
           - Model generates predictions on dataset
           - Analyze bias between actual vs predicted values
           
        2. DATASET-ONLY WORKFLOW (Commented out for now):
           - Upload CSV dataset with both actual and predicted columns
           - Directly analyze bias between existing columns
           - No model inference needed
        """
        
        try:
            print("🚀 COMPREHENSIVE BIAS DETECTION ANALYSIS")
            print("="*100)
            print(f"Analysis Option: {analysis_option}")
            print(f"Testing samples: {len(testing_df):,}")
            if training_df is not None:
                print(f"Training samples: {len(training_df):,}")
            print(f"Sensitive attributes: {sensitive_attrs}")
            
            self.results = {}
            
            # Validate sensitive attributes exist in dataset
            missing_attrs = [attr for attr in sensitive_attrs if attr not in testing_df.columns]
            if missing_attrs:
                raise ValueError(f"Sensitive attributes not found in dataset: {missing_attrs}")
            
            # Handle different analysis options
            if analysis_option == 'model-prediction':
                
                # Validate inputs for model prediction
                if model_file is None:
                    raise ValueError("Model file is required for model-prediction option")
                if feature_columns is None or len(feature_columns) == 0:
                    raise ValueError("Feature columns are required for model-prediction option")
                if target_column is None:
                    raise ValueError("Target column is required for model-prediction option")
                
                # Load model
                self.load_model(model_file)
                
                # Validate required columns for prediction
                required_cols = feature_columns + [target_column] + sensitive_attrs
                self.validate_dataset(testing_df, required_cols, "Test Dataset")
                
                # Set actual column to target column
                actual_col = target_column
                
                # Generate predictions
                predictions = self.generate_predictions(testing_df, feature_columns, target_column)
                
                # Add predictions to dataframe
                testing_df = testing_df.copy()
                testing_df['model_predictions'] = predictions
                predicted_col = 'model_predictions'
                
                print(f"✅ Generated {len(predictions)} predictions")
                
            else:  # dataset-only option
                # TODO: Dataset-only workflow (commented out for now)
                # print(f"Using dataset-only workflow")
                # 
                # # Validate required columns exist
                # required_cols = [actual_col, predicted_col] + sensitive_attrs
                # self.validate_dataset(testing_df, required_cols, "Test Dataset")
                # 
                # print(f"Using '{actual_col}' as actual and '{predicted_col}' as predicted")
                
                raise ValueError("Dataset-only analysis is currently disabled. Please use model-prediction option.")
            
            # Validate data types and values
            unique_actual = testing_df[actual_col].nunique()
            unique_predicted = testing_df[predicted_col].nunique()
            
            if unique_actual > 2 or unique_predicted > 2:
                print("⚠️  Warning: Non-binary values detected. Converting to binary classification...")
                # Convert to binary if needed
                testing_df[actual_col] = (testing_df[actual_col] > testing_df[actual_col].median()).astype(int)
                testing_df[predicted_col] = (testing_df[predicted_col] > testing_df[predicted_col].median()).astype(int)
            
            print(f"Actual values distribution: {testing_df[actual_col].value_counts().to_dict()}")
            print(f"Predicted values distribution: {testing_df[predicted_col].value_counts().to_dict()}")
            
            # =============================================================================
            # SECTION 1: TRAINING DATA BIAS ANALYSIS (Commented out - not used in current workflow)
            # =============================================================================
            # TODO: Training data bias analysis - commented out for now since we don't have training data
            # if training_df is not None:
            #     print("\n" + "="*80)
            #     print("📊 SECTION 1: TRAINING DATA BIAS ANALYSIS")
            #     print("="*80)
            #     
            #     try:
            #         # Validate training data
            #         training_required_cols = [actual_col] + sensitive_attrs
            #         self.validate_dataset(training_df, training_required_cols, "Training Dataset")
            #         
            #         training_results = self.analyze_training_data_bias(training_df, actual_col, sensitive_attrs)
            #         self.results["training_data_analysis"] = training_results
            #     except Exception as e:
            #         print(f"❌ Training data analysis failed: {str(e)}")
            #         self.results["training_data_analysis"] = {"error": str(e)}
            
            # =============================================================================
            # SECTION 1: MODEL PREDICTIONS ANALYSIS
            # =============================================================================
            print("\n🤖 MODEL PREDICTIONS ANALYSIS")
            
            model_analysis_results = {}
            for attr in sensitive_attrs:
                try:
                    print(f"\nAnalyzing {attr.upper()}:")
                    model_results = self.analyze_model_predictions(
                        testing_df, actual_col, predicted_col, attr
                    )
                    model_analysis_results[attr] = model_results
                    
                    # Display results
                    self.display_model_results(attr, model_results)
                    
                except Exception as e:
                    print(f"❌ Model analysis failed for {attr}: {str(e)}")
                    model_analysis_results[attr] = {"error": str(e)}
            
            self.results["model_analysis"] = model_analysis_results
            
            # =============================================================================
            # SECTION 2: INTERSECTIONAL ANALYSIS
            # =============================================================================
            try:
                print("\n🔗 INTERSECTIONAL ANALYSIS")
                
                intersectional_results = self.intersectional_analysis(
                    testing_df, actual_col, predicted_col, sensitive_attrs
                )
                self.results["intersectional_analysis"] = intersectional_results
                
            except Exception as e:
                print(f"❌ Intersectional analysis failed: {str(e)}")
                self.results["intersectional_analysis"] = {"error": str(e)}
            
            # =============================================================================
            # SECTION 3: COMPREHENSIVE SUMMARY
            # =============================================================================
            try:
                print("\n" + "="*80)
                print("📋 COMPREHENSIVE BIAS ASSESSMENT SUMMARY")
                print("="*80)
                
                final_assessment = self.generate_final_assessment()
                self.results["final_assessment"] = final_assessment
                
            except Exception as e:
                print(f"❌ Final assessment generation failed: {str(e)}")
                self.results["final_assessment"] = {"error": str(e)}
            
            print("\n" + "="*100)
            print("✅ COMPREHENSIVE BIAS ANALYSIS COMPLETE")
            print("="*100)
            
            return self.results
            
        except Exception as e:
            error_msg = f"Bias analysis failed: {str(e)}"
            print(f"❌ {error_msg}")
            print(f"Stack trace: {traceback.format_exc()}")
            
            return {
                "error": error_msg,
                "traceback": traceback.format_exc(),
                "partial_results": self.results
            }
    
    # TODO: Training data bias analysis function (commented out - not used in current workflow)
    # def analyze_training_data_bias(self, training_df, actual_col, sensitive_attrs):
    #     """
    #     Analyze bias in training data
    #     """
    #     training_results = {}
    #     
    #     for attr in sensitive_attrs:
    #         if attr not in training_df.columns:
    #             print(f"Warning: {attr} not found in training data")
    #             continue
    #             
    #         try:
    #             historical_rates = training_df.groupby(attr)[actual_col].agg(['mean', 'count'])
    #             max_rate = historical_rates['mean'].max()
    #             min_rate = historical_rates['mean'].min()
    #             training_di = min_rate / max_rate if max_rate > 0 else 0
    #             
    #             print(f"\n{attr.upper()} - Historical Rates:")
    #             for group, row in historical_rates.iterrows():
    #                 print(f"   {group}: {row['mean']:.1%} ({int(row['count'])} samples)")
    #             
    #             print(f"   Training Disparate Impact: {training_di:.3f}")
    #             status = "🔴 SEVERELY BIASED" if training_di < 0.5 else "🟡 BIASED" if training_di < 0.8 else "🟢 ACCEPTABLE"
    #             print(f"   Status: {status}")
    #             
    #             training_results[attr] = {
    #                 "historical_rates": {str(k): float(v) for k, v in historical_rates['mean'].to_dict().items()},
    #                 "sample_sizes": {str(k): int(v) for k, v in historical_rates['count'].to_dict().items()},
    #                 "training_disparate_impact": float(training_di),
    #                 "is_biased": bool(training_di < 0.8),
    #                 "severity": "severe" if training_di < 0.5 else "moderate" if training_di < 0.8 else "acceptable"
    #             }
    #             
    #         except Exception as e:
    #             print(f"Error analyzing training data for {attr}: {str(e)}")
    #             training_results[attr] = {"error": str(e)}
    #     
    #     return training_results
    
    def analyze_model_predictions(self, testing_df, actual_col, predicted_col, sensitive_attr):
        """
        Analyze model predictions for bias
        """
        try:
            y_true = testing_df[actual_col]
            y_pred = testing_df[predicted_col]
            sensitive_features = testing_df[sensitive_attr]
            
            # Define metrics
            metrics = {
                "accuracy": accuracy_score,
                "precision": precision_score,
                "recall": recall_score,
                "TPR": true_positive_rate,
                "FPR": false_positive_rate,
                "FNR": false_negative_rate,
                "selection_rate": selection_rate
            }
            
            # Calculate metrics using fairlearn
            mf = MetricFrame(
                metrics=metrics, 
                y_true=y_true, 
                y_pred=y_pred, 
                sensitive_features=sensitive_features
            )
            
            # Calculate fairness metrics
            dp_ratio = demographic_parity_ratio(y_true, y_pred, sensitive_features=sensitive_features)
            dp_diff = demographic_parity_difference(y_true, y_pred, sensitive_features=sensitive_features)
            eo_diff = equal_opportunity_difference(y_true, y_pred, sensitive_features=sensitive_features)
            
            # EEOC compliance thresholds
            EEOC_THRESHOLDS = {
                "adverse_impact_ratio": 0.80,
                "dp_diff_threshold": 0.05,
                "eo_diff_threshold": 0.05
            }
            
            dp_ratio_compliant = float(dp_ratio) >= EEOC_THRESHOLDS["adverse_impact_ratio"]
            dp_diff_compliant = abs(float(dp_diff)) <= EEOC_THRESHOLDS["dp_diff_threshold"]
            eo_diff_compliant = abs(float(eo_diff)) <= EEOC_THRESHOLDS["eo_diff_threshold"]
            
            compliance_checks = [dp_ratio_compliant, dp_diff_compliant, eo_diff_compliant]
            total_compliant = sum(compliance_checks)
            
            if total_compliant == 3:
                overall_status = "🟢 FULLY EEOC COMPLIANT"
                risk_level = "LOW"
            elif total_compliant >= 2:
                overall_status = "🟡 PARTIAL COMPLIANCE"
                risk_level = "MEDIUM"
            else:
                overall_status = "🔴 MAJOR EEOC VIOLATIONS"
                risk_level = "HIGH"
            
            # Convert all results to standard Python types
            def convert_dict_values(d):
                result = {}
                for k, v in d.items():
                    if isinstance(v, dict):
                        result[str(k)] = convert_dict_values(v)
                    elif isinstance(v, (np.integer, np.int64, np.int32)):
                        result[str(k)] = int(v)
                    elif isinstance(v, (np.floating, np.float64, np.float32)):
                        result[str(k)] = float(v)
                    elif isinstance(v, (np.bool_, bool)):
                        result[str(k)] = bool(v)
                    else:
                        result[str(k)] = v
                return result
            
            return {
                "metrics_by_group": convert_dict_values(mf.by_group.to_dict()),
                "metric_differences": convert_dict_values(mf.difference().to_dict()),
                "fairness_metrics": {
                    "adverse_impact_ratio": float(dp_ratio),
                    "demographic_parity_difference": abs(float(dp_diff)),
                    "equal_opportunity_difference": abs(float(eo_diff))
                },
                "compliance": {
                    "dp_ratio_compliant": bool(dp_ratio_compliant),
                    "dp_diff_compliant": bool(dp_diff_compliant),
                    "eo_diff_compliant": bool(eo_diff_compliant),
                    "total_compliant": int(total_compliant),
                    "overall_status": overall_status,
                    "risk_level": risk_level
                },
                "selection_rates": convert_dict_values(mf.by_group['selection_rate'].to_dict())
            }
            
        except Exception as e:
            raise Exception(f"Model prediction analysis failed: {str(e)}")
    
    def display_model_results(self, attr, model_results):
        """
        Display model analysis results in formatted way
        """
        try:
            print(f"\n📊 DETAILED METRICS BY {attr.upper()} GROUP:")
            print("="*90)
            
            # Create formatted table
            metrics_by_group = model_results["metrics_by_group"]
            groups = list(model_results["selection_rates"].keys())
            
            # Header
            print(f"{'Group':<15} {'Accuracy':<10} {'Precision':<11} {'Recall':<8} {'TPR':<8} {'FPR':<8} {'Selection':<10}")
            print("-" * 90)
            
            # Data rows
            for group in groups:
                accuracy = metrics_by_group.get('accuracy', {}).get(group, 0)
                precision = metrics_by_group.get('precision', {}).get(group, 0)
                recall = metrics_by_group.get('recall', {}).get(group, 0)
                tpr = metrics_by_group.get('TPR', {}).get(group, 0)
                fpr = metrics_by_group.get('FPR', {}).get(group, 0)
                selection = model_results["selection_rates"][group]
                
                print(f"{str(group):<15} {accuracy:<10.3f} {precision:<11.3f} {recall:<8.3f} {tpr:<8.3f} {fpr:<8.3f} {selection:<10.1%}")
            
            # Compliance status
            print(f"\n⚖️ EEOC COMPLIANCE STATUS:")
            fairness_metrics = model_results['fairness_metrics']
            compliance = model_results['compliance']
            
            print(f"   Adverse Impact Ratio: {fairness_metrics['adverse_impact_ratio']:.3f} "
                  f"({'✅ PASS' if compliance['dp_ratio_compliant'] else '❌ FAIL'} - Need ≥0.80)")
            print(f"   Demographic Parity Diff: {fairness_metrics['demographic_parity_difference']:.3f} "
                  f"({'✅ PASS' if compliance['dp_diff_compliant'] else '❌ FAIL'} - Need ≤0.05)")
            print(f"   Equal Opportunity Diff: {fairness_metrics['equal_opportunity_difference']:.3f} "
                  f"({'✅ PASS' if compliance['eo_diff_compliant'] else '❌ FAIL'} - Need ≤0.05)")
            print(f"   Overall Status: {compliance['overall_status']}")
            
        except Exception as e:
            print(f"Error displaying results for {attr}: {str(e)}")
    
    def intersectional_analysis(self, testing_df, actual_col, predicted_col, sensitive_attrs):
        """
        Perform intersectional bias analysis
        """
        try:
            print("Testing bias across combinations of protected attributes...")
            
            # Single attribute analysis
            print("\nSingle Attribute Results:")
            single_results = {}
            for attr in sensitive_attrs:
                if attr in testing_df.columns:
                    try:
                        dp_ratio = demographic_parity_ratio(
                            testing_df[actual_col], 
                            testing_df[predicted_col], 
                            sensitive_features=testing_df[attr]
                        )
                        eo_diff = equal_opportunity_difference(
                            testing_df[actual_col], 
                            testing_df[predicted_col], 
                            sensitive_features=testing_df[attr]
                        )
                        print(f"   {attr}: DI={dp_ratio:.3f}, EO_diff={abs(eo_diff):.3f}")
                        single_results[attr] = {
                            "disparate_impact": float(dp_ratio), 
                            "equal_opportunity_diff": abs(float(eo_diff))
                        }
                    except Exception as e:
                        print(f"   {attr}: Error - {str(e)}")
                        single_results[attr] = {"error": str(e)}
            
            # Pairwise intersectional analysis
            print(f"\nIntersectional Analysis:")
            intersectional_results = {}
            
            for attr_pair in combinations(sensitive_attrs, 2):
                attr1, attr2 = attr_pair
                if attr1 in testing_df.columns and attr2 in testing_df.columns:
                    try:
                        print(f"\n   {attr1.upper()} × {attr2.upper()} Intersection:")
                        
                        # Create intersectional groups
                        df_temp = testing_df.copy()
                        df_temp['intersectional_group'] = (
                            df_temp[attr1].astype(str) + ' × ' + df_temp[attr2].astype(str)
                        )
                        
                        intersectional_rates = df_temp.groupby('intersectional_group')[predicted_col].mean()
                        
                        if len(intersectional_rates) > 1:
                            max_rate = intersectional_rates.max()
                            min_rate = intersectional_rates.min()
                            intersectional_di = min_rate / max_rate if max_rate > 0 else 0
                            
                            print(f"     Selection Rates:")
                            for group, rate in intersectional_rates.items():
                                sample_size = len(df_temp[df_temp['intersectional_group'] == group])
                                print(f"       {group}: {rate:.1%} (n={sample_size})")
                            
                            print(f"     Intersectional Disparate Impact: {intersectional_di:.3f}")
                            
                            worse_than_individual = (
                                intersectional_di < single_results.get(attr1, {}).get("disparate_impact", 1) or
                                intersectional_di < single_results.get(attr2, {}).get("disparate_impact", 1)
                            )
                            
                            status = "🔴 WORSE than individual attributes" if worse_than_individual else "🟡 Similar to individual"
                            print(f"     Status: {status}")
                            
                            intersectional_results[f"{attr1}_x_{attr2}"] = {
                                "intersectional_disparate_impact": float(intersectional_di),
                                "group_rates": {str(k): float(v) for k, v in intersectional_rates.to_dict().items()},
                                "worse_than_individual": bool(worse_than_individual)
                            }
                        else:
                            print(f"     Insufficient groups for analysis")
                            
                    except Exception as e:
                        print(f"     Error: {str(e)}")
                        intersectional_results[f"{attr1}_x_{attr2}"] = {"error": str(e)}
            
            return {"single_attribute": single_results, "intersectional": intersectional_results}
            
        except Exception as e:
            raise Exception(f"Intersectional analysis failed: {str(e)}")
    
    def generate_final_assessment(self):
        """
        Generate final assessment and recommendations
        """
        try:
            # Count issues
            high_risk_models = 0
            medium_risk_models = 0
            biased_training = 0  # For future use when training data analysis is enabled
            
            # Analyze model results
            if "model_analysis" in self.results:
                for attr_result in self.results["model_analysis"].values():
                    if "compliance" in attr_result:
                        risk_level = attr_result["compliance"].get("risk_level", "UNKNOWN")
                        if risk_level == "HIGH":
                            high_risk_models += 1
                        elif risk_level == "MEDIUM":
                            medium_risk_models += 1
            
            # TODO: Training data analysis (commented out for now)
            # if "training_data_analysis" in self.results:
            #     for attr_result in self.results["training_data_analysis"].values():
            #         if "is_biased" in attr_result and attr_result["is_biased"]:
            #             biased_training += 1
            
            # Generate recommendation
            if high_risk_models > 0:
                final_recommendation = "🔴 DO NOT DEPLOY - High risk bias detected"
                priority = "P0 - Immediate remediation required"
                actions = [
                    "Address training data bias through data collection or sampling techniques",
                    "Apply bias mitigation algorithms (fairness constraints, post-processing)",
                    "Retrain model with bias-aware techniques",
                    "Conduct legal review before any deployment"
                ]
            elif medium_risk_models > 0 or biased_training > 0:  # biased_training for future use
                final_recommendation = "🟡 CAUTION - Legal review recommended"
                priority = "P1 - Address before deployment"
                actions = [
                    "Enhanced bias monitoring and periodic audits",
                    "Consider bias mitigation techniques",
                    "Legal team consultation recommended",
                    "Document bias assessment for compliance records"
                ]
            else:
                final_recommendation = "🟢 SAFE TO DEPLOY with monitoring"
                priority = "P3 - Standard monitoring"
                actions = [
                    "Implement standard bias monitoring",
                    "Periodic bias audits (quarterly recommended)",
                    "Monitor for data drift and model performance"
                ]
            
            print(f"Overall Recommendation: {final_recommendation}")
            print(f"Priority: {priority}")
            print("Recommended Actions:")
            for i, action in enumerate(actions, 1):
                print(f"   {i}. {action}")
            
            return {
                "recommendation": final_recommendation,
                "priority": priority,
                "actions": actions,
                "training_bias_count": int(biased_training),  # Will be 0 until training analysis is enabled
                "model_high_risk_count": int(high_risk_models),
                "model_medium_risk_count": int(medium_risk_models)
            }
            
        except Exception as e:
            raise Exception(f"Final assessment generation failed: {str(e)}")
