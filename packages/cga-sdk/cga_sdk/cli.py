"""
CLI for CGA SDK

Command-line interface for the CGA SDK.
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path
from typing import Optional

import httpx

from .guard import Guard
from .types import SDKConfig, OnFailAction


async def cmd_test_connection(args):
    """Test connection to the gateway"""
    print(f"Testing connection to {args.gateway_url}...")
    
    try:
        client = httpx.AsyncClient(timeout=10.0)
        response = await client.get(f"{args.gateway_url}/health")
        
        if response.status_code == 200:
            print("✅ Connection successful!")
            print(f"Response: {response.json()}")
        else:
            print(f"❌ Connection failed: HTTP {response.status_code}")
            
        await client.aclose()
        
    except Exception as e:
        print(f"❌ Connection failed: {e}")


async def cmd_list_guards(args):
    """List available guards from gateway"""
    print(f"Fetching guards from {args.gateway_url}...")
    
    try:
        config = SDKConfig(gateway_url=args.gateway_url, api_key=args.api_key)
        guard = Guard(config=config)
        
        guards = await guard.list_available_guards()
        
        print(f"✅ Found {len(guards)} guards:")
        for g in guards:
            tier = g.get("tier", "unknown")
            desc = g.get("description", "No description")
            print(f"  - {g.get('id', 'unknown')} ({tier}): {desc}")
        
    except Exception as e:
        print(f"❌ Failed to list guards: {e}")


async def cmd_validate(args):
    """Validate content using guards"""
    print(f"Validating content...")
    
    try:
        config = SDKConfig(gateway_url=args.gateway_url, api_key=args.api_key)
        guard = Guard(config=config)
        
        # Configure guard
        if args.guards:
            guard = guard.use(args.guards.split(","))
        elif args.policy:
            guard = guard.use_policy(args.policy)
        else:
            print("❌ Must specify --guards or --policy")
            return
        
        # Read content
        if args.file:
            content = Path(args.file).read_text()
        else:
            content = args.content
        
        # Validate
        result = await guard.validate(content)
        
        if result.valid:
            print("✅ Content passed validation!")
        else:
            print(f"❌ Validation failed with {len(result.violations)} violation(s):")
            for v in result.violations:
                print(f"  - [{v.severity}] {v.rule_id}: {v.message}")
        
    except Exception as e:
        print(f"❌ Validation failed: {e}")


async def cmd_policy_info(args):
    """Get policy information"""
    print(f"Fetching policy info for '{args.policy_id}'...")
    
    try:
        config = SDKConfig(gateway_url=args.gateway_url, api_key=args.api_key)
        guard = Guard(config=config)
        
        policy = await guard.get_policy_info(args.policy_id)
        
        print("✅ Policy info:")
        print(json.dumps(policy, indent=2))
        
    except Exception as e:
        print(f"❌ Failed to get policy info: {e}")


def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(
        description="CGA SDK Command Line Interface",
        prog="cga-sdk"
    )
    
    parser.add_argument(
        "--gateway-url",
        default="http://localhost:8000",
        help="Gateway URL (default: http://localhost:8000)"
    )
    parser.add_argument(
        "--api-key",
        help="API key for authentication"
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    # Test connection command
    test_parser = subparsers.add_parser("test", help="Test connection to gateway")
    test_parser.set_defaults(func=cmd_test_connection)
    
    # List guards command
    list_parser = subparsers.add_parser("list", help="List available guards")
    list_parser.set_defaults(func=cmd_list_guards)
    
    # Validate command
    validate_parser = subparsers.add_parser("validate", help="Validate content")
    validate_parser.add_argument(
        "--guards",
        help="Comma-separated list of guard IDs (e.g., toxicity.block,pii.detect)"
    )
    validate_parser.add_argument(
        "--policy",
        help="Policy ID to use"
    )
    validate_parser.add_argument(
        "--content",
        help="Content to validate (or use --file)"
    )
    validate_parser.add_argument(
        "--file",
        help="File containing content to validate"
    )
    validate_parser.set_defaults(func=cmd_validate)
    
    # Policy info command
    policy_parser = subparsers.add_parser("policy", help="Get policy information")
    policy_parser.add_argument("policy_id", help="Policy ID")
    policy_parser.set_defaults(func=cmd_policy_info)
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    try:
        return asyncio.run(args.func(args)) or 0
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        return 0
    except Exception as e:
        print(f"❌ Error: {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
