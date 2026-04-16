#!/usr/bin/env python3
"""
ONNX Model Management CLI

Command-line tool for users to discover, configure, and manage ONNX models
in the Guardrails system.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent))

from cga_core.onnx_registry import get_onnx_registry, ONNXModelInfo


def cmd_list_models(args):
    """List available ONNX models"""
    registry = get_onnx_registry()
    models = registry.list_models(category=args.category)
    
    if not models:
        print("No models found.")
        return
    
    print(f"\n🤖 Available ONNX Models ({len(models)} total)")
    print("=" * 80)
    
    current_category = None
    for model in models:
        if model.category != current_category:
            current_category = model.category
            print(f"\n📂 {current_category.upper()} MODELS:")
            print("-" * 50)
        
        # Check if model file exists
        model_path = Path(model.model_path)
        status = "✅ Ready" if model_path.exists() else "⚠️  Download needed"
        
        print(f"\n🔹 {model.id}")
        print(f"   Name: {model.name}")
        print(f"   Status: {status}")
        print(f"   Description: {model.description}")
        
        if args.verbose:
            accuracy = f"{model.accuracy:.1%}" if model.accuracy else "N/A"
            size = f"{model.model_size_mb}MB" if model.model_size_mb else "N/A"
            languages = ", ".join(model.supported_languages) if model.supported_languages else "N/A"
            
            print(f"   Accuracy: {accuracy}")
            print(f"   Size: {size}")
            print(f"   Performance Budget: {model.performance_budget_ms}ms")
            print(f"   Default Threshold: {model.default_threshold}")
            print(f"   Labels: {', '.join(model.labels)}")
            print(f"   Languages: {languages}")
            
            if model.source_url:
                print(f"   Source: {model.source_url}")
            if model.license:
                print(f"   License: {model.license}")


def cmd_model_info(args):
    """Show detailed information about a specific model"""
    registry = get_onnx_registry()
    model = registry.get_model(args.model_id)
    
    if not model:
        print(f"❌ Model not found: {args.model_id}")
        print("\nAvailable models:")
        for m in registry.list_models():
            print(f"  - {m.id}")
        return
    
    model_path = Path(model.model_path)
    status = "✅ Ready" if model_path.exists() else "⚠️  Download needed"
    
    print(f"\n🤖 Model Information: {model.id}")
    print("=" * 60)
    print(f"Name: {model.name}")
    print(f"Category: {model.category}")
    print(f"Status: {status}")
    print(f"Description: {model.description}")
    print(f"Model Path: {model.model_path}")
    print()
    
    print("📊 Performance Metrics:")
    print(f"  Accuracy: {model.accuracy:.1%}" if model.accuracy else "  Accuracy: N/A")
    print(f"  Size: {model.model_size_mb}MB" if model.model_size_mb else "  Size: N/A")
    print(f"  Performance Budget: {model.performance_budget_ms}ms")
    print(f"  Default Threshold: {model.default_threshold}")
    print()
    
    print("🏷️  Labels:")
    for label in model.labels:
        print(f"  - {label}")
    print()
    
    print("🔧 Tokenizer Configuration:")
    for key, value in model.tokenizer_config.items():
        print(f"  {key}: {value}")
    print()
    
    if model.supported_languages:
        print(f"🌍 Supported Languages: {', '.join(model.supported_languages)}")
        print()
    
    if model.source_url:
        print(f"🔗 Source: {model.source_url}")
    if model.license:
        print(f"📄 License: {model.license}")
    
    print("\n💡 Usage Example:")
    print("```yaml")
    print("guards:")
    print(f"  - id: onnx.universal")
    print(f"    target: messages[*].content")
    print(f"    with:")
    print(f"      model_id: \"{model.id}\"")
    print(f"      threshold: {model.default_threshold}")
    if len(model.labels) > 1:
        violation_labels = [label for label in model.labels if label not in ["safe", "O", "neutral"]]
        if violation_labels:
            print(f"      target_labels: {violation_labels}")
    print("```")


def cmd_categories(args):
    """List available model categories"""
    registry = get_onnx_registry()
    categories = registry.get_categories()
    
    print(f"\n📂 Available Model Categories ({len(categories)} total)")
    print("=" * 50)
    
    for category in categories:
        models = registry.list_models(category=category)
        ready_count = sum(1 for m in models if Path(m.model_path).exists())
        
        print(f"\n🔹 {category.upper()}")
        print(f"   Models: {len(models)} total, {ready_count} ready")
        print(f"   Model IDs: {', '.join(m.id for m in models[:3])}" + 
              (f" (+{len(models)-3} more)" if len(models) > 3 else ""))


def cmd_stats(args):
    """Show model registry statistics"""
    registry = get_onnx_registry()
    stats = registry.get_model_stats()
    
    print(f"\n📊 ONNX Model Registry Statistics")
    print("=" * 40)
    print(f"Total Models: {stats['total_models']}")
    print(f"Loaded Sessions: {stats['loaded_sessions']}")
    print(f"Average Accuracy: {stats['average_accuracy']:.1%}")
    print(f"Total Size: {stats['total_size_mb']:.1f}MB")
    print()
    
    print("Models by Category:")
    for category, model_ids in stats['categories'].items():
        ready_count = sum(1 for mid in model_ids if Path(registry.get_model(mid).model_path).exists())
        print(f"  📂 {category}: {len(model_ids)} models ({ready_count} ready)")


def cmd_create_template(args):
    """Create a template for custom model configuration"""
    registry = get_onnx_registry()
    output_path = args.output or "custom_model_config.json"
    
    registry.create_model_config_template(output_path)
    
    print(f"\n📝 Custom Model Configuration Template")
    print("=" * 45)
    print(f"Template created: {output_path}")
    print()
    print("Next steps:")
    print("1. Edit the template with your model details")
    print("2. Place your .onnx model file in the models/ directory")
    print("3. Restart the system to load your custom model")
    print()
    print("Example usage in policy:")
    print("```yaml")
    print("guards:")
    print("  - id: onnx.universal")
    print("    with:")
    print("      model_id: \"my_custom_model\"")
    print("      threshold: 0.7")
    print("```")


def cmd_test_model(args):
    """Test a model with sample text"""
    registry = get_onnx_registry()
    model = registry.get_model(args.model_id)
    
    if not model:
        print(f"❌ Model not found: {args.model_id}")
        return
    
    session = registry.load_model_session(args.model_id)
    if not session:
        print(f"⚠️  Could not load model: {args.model_id}")
        print("Model file may not exist or ONNX Runtime may not be available")
        return
    
    test_text = args.text or "This is a test message for model evaluation"
    
    print(f"\n🧪 Testing Model: {model.id}")
    print("=" * 50)
    print(f"Model: {model.name}")
    print(f"Text: \"{test_text}\"")
    print()
    
    # This would require implementing the actual inference logic
    print("⚠️  Model testing requires implementing inference logic")
    print("Use the universal_onnx_guard in your policies for actual testing")


def cmd_download_guide(args):
    """Show guide for downloading models"""
    print(f"\n📥 ONNX Model Download Guide")
    print("=" * 40)
    print()
    print("🔹 Option 1: Convert from Hugging Face")
    print("```python")
    print("from transformers import AutoTokenizer, AutoModelForSequenceClassification")
    print("from transformers.onnx import export")
    print()
    print("# Load model")
    print("model_name = 'ProsusAI/finbert'")
    print("tokenizer = AutoTokenizer.from_pretrained(model_name)")
    print("model = AutoModelForSequenceClassification.from_pretrained(model_name)")
    print()
    print("# Export to ONNX")
    print("export(tokenizer, model, model.config, opset=11,")
    print("       output_path='models/financial_advice_finbert.onnx')")
    print("```")
    print()
    print("🔹 Option 2: Pre-trained Models")
    print("Popular models for conversion:")
    print("  Financial: ProsusAI/finbert, nlpaueb/sec-bert-base")
    print("  Legal: nlpaueb/legal-bert-base-uncased")
    print("  Toxicity: unitary/toxic-bert, martin-ha/toxic-comment-model")
    print("  Sentiment: cardiffnlp/twitter-roberta-base-sentiment-latest")
    print()
    print("🔹 Option 3: Custom Training")
    print("Train your own model and export to ONNX format")
    print()
    print("📁 Model Directory Structure:")
    print("models/")
    print("├── financial_advice_distilbert.onnx")
    print("├── legal_advice_bert.onnx")
    print("├── toxicity_detoxify.onnx")
    print("└── custom_model_config.json")


def main():
    parser = argparse.ArgumentParser(
        description="ONNX Model Management CLI for Guardrails",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s list                          # List all models
  %(prog)s list --category financial     # List financial models
  %(prog)s info financial_advice_distilbert  # Show model details
  %(prog)s categories                    # Show categories
  %(prog)s stats                         # Show statistics
  %(prog)s template                      # Create custom model template
  %(prog)s download-guide                # Show download guide
        """
    )
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # List command
    list_parser = subparsers.add_parser('list', help='List available models')
    list_parser.add_argument('--category', help='Filter by category')
    list_parser.add_argument('-v', '--verbose', action='store_true', help='Show detailed information')
    list_parser.set_defaults(func=cmd_list_models)
    
    # Info command
    info_parser = subparsers.add_parser('info', help='Show detailed model information')
    info_parser.add_argument('model_id', help='Model ID to show information for')
    info_parser.set_defaults(func=cmd_model_info)
    
    # Categories command
    categories_parser = subparsers.add_parser('categories', help='List model categories')
    categories_parser.set_defaults(func=cmd_categories)
    
    # Stats command
    stats_parser = subparsers.add_parser('stats', help='Show registry statistics')
    stats_parser.set_defaults(func=cmd_stats)
    
    # Template command
    template_parser = subparsers.add_parser('template', help='Create custom model template')
    template_parser.add_argument('-o', '--output', help='Output file path')
    template_parser.set_defaults(func=cmd_create_template)
    
    # Test command
    test_parser = subparsers.add_parser('test', help='Test a model with sample text')
    test_parser.add_argument('model_id', help='Model ID to test')
    test_parser.add_argument('--text', help='Text to test with')
    test_parser.set_defaults(func=cmd_test_model)
    
    # Download guide command
    download_parser = subparsers.add_parser('download-guide', help='Show model download guide')
    download_parser.set_defaults(func=cmd_download_guide)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        args.func(args)
    except Exception as e:
        print(f"❌ Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
