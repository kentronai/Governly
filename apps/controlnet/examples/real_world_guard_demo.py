#!/usr/bin/env python3
"""
Real-World Complex Guard Demo

Demonstrates enterprise-grade guardrails for common business scenarios:
1. Financial Services Compliance (no financial advice)
2. Competitor Mention Prevention
3. Brand Protection & Tone Enforcement
4. Regulatory Compliance (GDPR, CCPA)
5. Professional Liability Protection
"""

import asyncio
import os
import re
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

try:
    import openai
    OPENAI_AVAILABLE = True
    # Configure OpenAI
    openai.api_key = os.getenv("OPENAI_API_KEY")
except ImportError:
    OPENAI_AVAILABLE = False
    openai = None

from cga_core import guard, Violation, Left_, Right_, is_left, get_violations, get_context
from cga_sdk import wrap_llm, load_policy


@dataclass
class CompanyProfile:
    """Company profile for context-aware guardrails"""
    name: str = "InvestWise Corp"
    industry: str = "financial_services"
    compliance_level: str = "strict"  # strict, moderate, basic
    competitors: List[str] = None
    restricted_topics: List[str] = None
    
    def __post_init__(self):
        if self.competitors is None:
            self.competitors = [
                "Vanguard", "Fidelity", "Charles Schwab", "E*TRADE", 
                "TD Ameritrade", "Robinhood", "Wealthfront", "Betterment"
            ]
        if self.restricted_topics is None:
            self.restricted_topics = [
                "specific investment advice", "guaranteed returns", 
                "stock picks", "market timing", "tax advice"
            ]


# Financial Services Compliance Guard
@guard("compliance.financial_services")
def financial_services_compliance(
    company_profile: CompanyProfile,
    allow_general_education: bool = True,
    require_disclaimers: bool = True
) -> callable:
    """
    Prevents providing specific financial advice while allowing general education
    
    Real-world scenario: Investment firms need chatbots that can educate
    but cannot provide personalized investment advice due to SEC regulations
    """
    
    async def run(ctx: Dict[str, Any]) -> Any:
        violations = []
        content = extract_all_content(ctx)
        
        # Check for specific financial advice patterns
        advice_patterns = [
            r"\b(you should|I recommend|buy|sell|invest in)\s+(?:stocks?|bonds?|ETFs?|funds?)\b",
            r"\b(guaranteed|promise[sd]?)\s+(?:returns?|profits?|gains?)\b",
            r"\b(?:this|that)\s+(?:stock|investment)\s+(?:will|is going to)\b",
            r"\b(?:put|invest)\s+\$?\d+\s+(?:in|into)\b",
            r"\b(?:now is the time to|perfect time to)\s+(?:buy|sell|invest)\b"
        ]
        
        for pattern in advice_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                violations.append(Violation(
                    rule_id="compliance.financial_services",
                    severity="critical",
                    message=f"Specific financial advice detected: {pattern}",
                    score=1.0
                ))
        
        # Check for missing disclaimers in financial content (only for output phase)
        phase = ctx.get("phase", "input")
        if require_disclaimers and phase == "output" and has_financial_content(content):
            disclaimer_patterns = [
                r"not financial advice",
                r"consult.*financial advisor",
                r"past performance.*not.*guarantee",
                r"investments.*risk",
                r"educational.*only",
                r"informational purposes only"
            ]
            
            has_disclaimer = any(re.search(p, content, re.IGNORECASE) for p in disclaimer_patterns)
            if not has_disclaimer:
                violations.append(Violation(
                    rule_id="compliance.financial_services",
                    severity="high",
                    message="Financial content missing required disclaimer",
                    score=0.9
                ))
        
        # Check for prohibited guarantees
        guarantee_patterns = [
            r"\b(?:guaranteed|guarantee)\s+(?:profit|return|gain|income)\b",
            r"\b(?:risk-free|no risk|zero risk)\s+investment\b",
            r"\b(?:sure thing|can't lose|certain to)\b"
        ]
        
        for pattern in guarantee_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                violations.append(Violation(
                    rule_id="compliance.financial_services",
                    severity="critical",
                    message="Prohibited investment guarantee detected",
                    score=1.0
                ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# Competitor Mention Guard
@guard("brand.competitor_protection")
def competitor_protection(
    company_profile: CompanyProfile,
    action: str = "block"  # block, redirect, disclaimer
) -> callable:
    """
    Prevents promoting competitors or allows controlled mentions with disclaimers
    
    Real-world scenario: Company chatbots should not recommend competitors
    or should handle competitor mentions strategically
    """
    
    async def run(ctx: Dict[str, Any]) -> Any:
        violations = []
        content = extract_all_content(ctx)
        
        # Check for competitor mentions
        mentioned_competitors = []
        for competitor in company_profile.competitors:
            if re.search(rf"\b{re.escape(competitor)}\b", content, re.IGNORECASE):
                mentioned_competitors.append(competitor)
        
        if mentioned_competitors:
            if action == "block":
                violations.append(Violation(
                    rule_id="brand.competitor_protection",
                    severity="medium",
                    message=f"Competitor mention detected: {', '.join(mentioned_competitors)}",
                    score=0.7
                ))
            elif action == "redirect":
                # Transform content to redirect to company services
                ctx["competitor_redirect"] = {
                    "mentioned": mentioned_competitors,
                    "redirect_message": f"While {', '.join(mentioned_competitors)} offer services, "
                                      f"let me tell you about {company_profile.name}'s advantages..."
                }
        
        # Check for positive competitor recommendations
        positive_competitor_patterns = [
            rf"\b(?:recommend|suggest|try|use|go with)\s+(?:{'|'.join(re.escape(c) for c in company_profile.competitors)})\b",
            rf"\b(?:{'|'.join(re.escape(c) for c in company_profile.competitors)})\s+(?:is|are)\s+(?:better|best|great|excellent)\b"
        ]
        
        for pattern in positive_competitor_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                violations.append(Violation(
                    rule_id="brand.competitor_protection",
                    severity="high",
                    message="Positive competitor recommendation detected",
                    score=0.9
                ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# Professional Liability Guard
@guard("liability.professional_protection")
def professional_liability_protection(
    protected_domains: List[str] = None,
    require_qualifications: bool = True
) -> callable:
    """
    Prevents providing advice in regulated domains without proper disclaimers
    
    Real-world scenario: Companies need to avoid liability for advice in
    legal, medical, tax, or other regulated domains
    """
    
    if protected_domains is None:
        protected_domains = ["legal", "medical", "tax", "accounting", "insurance"]
    
    async def run(ctx: Dict[str, Any]) -> Any:
        violations = []
        content = extract_all_content(ctx)
        
        # Domain-specific advice patterns
        domain_patterns = {
            "legal": [
                r"\b(?:you should|I recommend)\s+(?:sue|file|legal action)\b",
                r"\b(?:this is|that's)\s+(?:illegal|legal|lawful)\b",
                r"\b(?:your rights are|you have the right to)\b",
                r"\b(?:should I sue|can I sue|sue them|lawsuit|legal action)\b",
                r"\b(?:unfairly.*fired|wrongful.*termination)\b"
            ],
            "medical": [
                r"\b(?:you should|I recommend)\s+(?:take|stop taking|increase|decrease)\s+(?:medication|medicine)\b",
                r"\b(?:you have|this is|that's)\s+(?:cancer|diabetes|depression|anxiety)\b",
                r"\b(?:see a doctor|medical attention)\s+(?:immediately|right away|urgently)\b"
            ],
            "tax": [
                r"\b(?:you can|should)\s+(?:deduct|claim|write off)\b",
                r"\b(?:this is|that's)\s+(?:tax deductible|taxable)\b",
                r"\b(?:file|don't file)\s+(?:taxes|tax return)\b"
            ]
        }
        
        for domain, patterns in domain_patterns.items():
            if domain in protected_domains:
                for pattern in patterns:
                    if re.search(pattern, content, re.IGNORECASE):
                        violations.append(Violation(
                            rule_id="liability.professional_protection",
                            severity="critical",
                            message=f"Potential {domain} advice without qualification detected",
                            score=1.0
                        ))
        
        # Check for missing professional disclaimers
        if require_qualifications and has_professional_content(content):
            disclaimer_patterns = [
                r"not (?:legal|medical|tax|professional) advice",
                r"consult.*(?:attorney|doctor|tax professional|qualified professional)",
                r"for informational purposes only"
            ]
            
            has_disclaimer = any(re.search(p, content, re.IGNORECASE) for p in disclaimer_patterns)
            if not has_disclaimer:
                violations.append(Violation(
                    rule_id="liability.professional_protection",
                    severity="high",
                    message="Professional content missing liability disclaimer",
                    score=0.9
                ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# Brand Tone & Voice Guard
@guard("brand.tone_enforcement")
def brand_tone_enforcement(
    company_profile: CompanyProfile,
    required_tone: str = "professional",
    brand_values: List[str] = None
) -> callable:
    """
    Ensures responses maintain appropriate brand tone and values
    
    Real-world scenario: Companies need consistent brand voice across
    all customer interactions, especially in regulated industries
    """
    
    if brand_values is None:
        brand_values = ["trustworthy", "professional", "helpful", "transparent"]
    
    async def run(ctx: Dict[str, Any]) -> Any:
        violations = []
        content = extract_all_content(ctx)
        
        # Check for inappropriate casual language in professional context
        if required_tone == "professional":
            casual_patterns = [
                r"\b(?:gonna|wanna|gotta|dunno|yeah|nah|yep|nope)\b",
                r"\b(?:awesome|cool|sweet|dude|bro|hey there)\b",
                r"(?:lol|omg|wtf|tbh|imo|fyi)\b"
            ]
            
            for pattern in casual_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    violations.append(Violation(
                        rule_id="brand.tone_enforcement",
                        severity="medium",
                        message=f"Inappropriate casual language for professional context: {pattern}",
                        score=0.6
                    ))
        
        # Check for language that contradicts brand values
        if "trustworthy" in brand_values:
            untrustworthy_patterns = [
                r"\b(?:trust me|believe me|take my word)\b",
                r"\b(?:secret|insider|exclusive tip)\b",
                r"\b(?:quick scheme|easy money|get rich quick)\b"
            ]
            
            for pattern in untrustworthy_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    violations.append(Violation(
                        rule_id="brand.tone_enforcement",
                        severity="high",
                        message="Language contradicts trustworthy brand value",
                        score=0.8
                    ))
        
        if violations:
            return Left_(violations)
        
        return Right_(ctx)
    
    return run


# Real OpenAI Integration
async def create_openai_client():
    """Create OpenAI client with proper error handling"""
    if not OPENAI_AVAILABLE:
        raise ValueError("OpenAI library not installed")
    
    if not openai.api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    
    async def openai_chat_completion(messages, **kwargs):
        """OpenAI chat completion with error handling"""
        try:
            # Use the newer OpenAI client interface
            from openai import AsyncOpenAI
            client = AsyncOpenAI(api_key=openai.api_key)
            
            response = await client.chat.completions.create(
                model=kwargs.get("model", "gpt-3.5-turbo"),
                messages=messages,
                max_tokens=kwargs.get("max_tokens", 500),
                temperature=kwargs.get("temperature", 0.7)
            )
            return response
        except Exception as e:
            raise Exception(f"OpenAI API error: {str(e)}")
    
    return openai_chat_completion


# Utility Functions
def extract_all_content(ctx: Dict[str, Any]) -> str:
    """Extract all text content from context"""
    content_parts = []
    
    # Extract from messages
    messages = ctx.get("messages", [])
    for msg in messages:
        if "content" in msg:
            content_parts.append(msg["content"])
    
    # Extract from output if present
    if "output" in ctx:
        content_parts.append(str(ctx["output"]))
    
    return " ".join(content_parts)


def has_financial_content(content: str) -> bool:
    """Check if content contains financial topics"""
    financial_keywords = [
        "investment", "stock", "bond", "portfolio", "return", "profit",
        "financial", "money", "fund", "asset", "market", "trading"
    ]
    return any(keyword in content.lower() for keyword in financial_keywords)


def has_professional_content(content: str) -> bool:
    """Check if content contains professional advice topics"""
    professional_keywords = [
        "legal", "medical", "tax", "health", "law", "attorney", "doctor",
        "diagnosis", "treatment", "deduction", "lawsuit", "contract"
    ]
    return any(keyword in content.lower() for keyword in professional_keywords)


# Real-World Demo Scenarios
async def demo_real_world_scenarios():
    """Demonstrate real-world business guardrail scenarios"""
    print("🏢 Real-World Business Guardrails Demo")
    print("=" * 50)
    
    # Company profile for InvestWise Corp
    company = CompanyProfile(
        name="InvestWise Corp",
        industry="financial_services",
        compliance_level="strict"
    )
    
    # Create OpenAI client
    try:
        openai_client = await create_openai_client()
        print("✅ OpenAI client initialized")
    except Exception as e:
        print(f"❌ OpenAI client failed: {e}")
        print("❌ Demo requires valid OpenAI API key")
        return
    
    # Create guard instances
    financial_guard = financial_services_compliance(company)
    competitor_guard = competitor_protection(company, action="block")
    liability_guard = professional_liability_protection()
    tone_guard = brand_tone_enforcement(company)
    
    # Real-world test scenarios
    scenarios = [
        {
            "name": "🏦 Financial Advice Request",
            "user_input": "Should I buy Tesla stock right now? I have $10,000 to invest.",
            "expected": "Should be blocked - specific investment advice"
        },
        {
            "name": "📚 Financial Education",
            "user_input": "Can you explain what diversification means in investing?",
            "expected": "Should pass - general education"
        },
        {
            "name": "🏢 Competitor Mention",
            "user_input": "Is Vanguard better than your company for index funds?",
            "expected": "Should be blocked - competitor promotion"
        },
        {
            "name": "⚖️ Legal Advice Request",
            "user_input": "My employer fired me unfairly. Should I sue them?",
            "expected": "Should be blocked - legal advice"
        },
        {
            "name": "🎯 Brand Tone Violation",
            "user_input": "Hey dude, what's up with your awesome investment options?",
            "expected": "Should be flagged - unprofessional tone"
        },
        {
            "name": "✅ Compliant Response",
            "user_input": "What factors should I consider when choosing an investment strategy?",
            "expected": "Should pass - general guidance"
        }
    ]
    
    for i, scenario in enumerate(scenarios, 1):
        print(f"\n🧪 Scenario {i}: {scenario['name']}")
        print(f"User: {scenario['user_input']}")
        print(f"Expected: {scenario['expected']}")
        print("-" * 60)
        
        # Prepare context
        context = {
            "messages": [{"role": "user", "content": scenario["user_input"]}],
            "phase": "input",
            "company_profile": company
        }
        
        # Run guards in sequence
        guard_results = {}
        
        # Financial compliance
        result = await financial_guard(context.copy())
        guard_results["financial"] = result
        if is_left(result):
            violations = get_violations(result)
            print("❌ Financial Compliance: BLOCKED")
            for v in violations:
                print(f"   - {v['message']}")
            continue
        else:
            print("✅ Financial Compliance: PASSED")
        
        # Competitor protection
        result = await competitor_guard(context.copy())
        guard_results["competitor"] = result
        if is_left(result):
            violations = get_violations(result)
            print("❌ Competitor Protection: BLOCKED")
            for v in violations:
                print(f"   - {v['message']}")
            continue
        else:
            print("✅ Competitor Protection: PASSED")
        
        # Professional liability
        result = await liability_guard(context.copy())
        guard_results["liability"] = result
        if is_left(result):
            violations = get_violations(result)
            print("❌ Professional Liability: BLOCKED")
            for v in violations:
                print(f"   - {v['message']}")
            continue
        else:
            print("✅ Professional Liability: PASSED")
        
        # Brand tone
        result = await tone_guard(context.copy())
        guard_results["tone"] = result
        if is_left(result):
            violations = get_violations(result)
            print("⚠️  Brand Tone: FLAGGED")
            for v in violations:
                print(f"   - {v['message']}")
        else:
            print("✅ Brand Tone: PASSED")
        
        # If all guards passed, generate AI response
        if all(not is_left(result) for result in guard_results.values()):
            print("\n🤖 Generating AI Response...")
            try:
                # Create system prompt for compliant financial services
                system_prompt = f"""You are a helpful assistant for {company.name}, a financial services company. 

IMPORTANT GUIDELINES:
- Provide general financial education only, never specific investment advice
- Always include disclaimers for financial content
- Maintain professional tone
- Do not recommend specific stocks, bonds, or investments
- Encourage users to consult with qualified financial advisors
- Focus on educational content about financial concepts

Remember: You are providing general information only, not personalized financial advice."""

                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": scenario["user_input"]}
                ]
                
                response = await openai_client(messages, max_tokens=200)
                ai_response = response.choices[0].message.content
                
                print(f"AI: {ai_response}")
                
                # Run output guards on AI response
                output_context = context.copy()
                output_context["output"] = ai_response
                output_context["phase"] = "output"
                
                # Check output compliance
                output_violations = []
                for guard_name, guard_func in [
                    ("financial", financial_guard),
                    ("liability", liability_guard),
                    ("tone", tone_guard)
                ]:
                    result = await guard_func(output_context.copy())
                    if is_left(result):
                        violations = get_violations(result)
                        output_violations.extend(violations)
                
                if output_violations:
                    print("\n⚠️  Output Guard Violations:")
                    for v in output_violations:
                        print(f"   - {v['message']}")
                else:
                    print("\n✅ Output passed all guards")
                
            except Exception as e:
                print(f"❌ AI Response Error: {e}")




async def main():
    """Run real-world guardrails demo"""
    await demo_real_world_scenarios()


if __name__ == "__main__":
    asyncio.run(main())
