"""
Test cases for CGA core types (Either, Violation, etc.)
"""

import pytest
from cga_core import (
    Violation,
    Left_,
    Right_,
    is_left,
    is_right,
    get_violations,
    get_context
)


class TestViolation:
    """Test Violation dataclass"""
    
    def test_violation_creation(self):
        """Violation should be created with required fields"""
        v = Violation(
            rule_id="test.rule",
            severity="high",
            message="Test violation"
        )
        
        assert v.rule_id == "test.rule"
        assert v.severity == "high"
        assert v.message == "Test violation"
        assert v.span is None
        assert v.score is None
        assert v.evidence is None
        assert v.tier is None
    
    def test_violation_with_optional_fields(self):
        """Violation should accept optional fields"""
        v = Violation(
            rule_id="test.rule",
            severity="med",
            message="Test",
            span={"start": 0, "end": 10},
            score=0.85,
            evidence={"pattern": "test"},
            tier="T1"
        )
        
        assert v.span == {"start": 0, "end": 10}
        assert v.score == 0.85
        assert v.evidence == {"pattern": "test"}
        assert v.tier == "T1"
    
    def test_violation_to_dict(self):
        """Violation should convert to dict"""
        v = Violation(
            rule_id="test.rule",
            severity="low",
            message="Test",
            score=0.5
        )
        
        d = v.to_dict()
        
        assert d["rule_id"] == "test.rule"
        assert d["severity"] == "low"
        assert d["message"] == "Test"
        assert d["score"] == 0.5


class TestEither:
    """Test Either type (Left/Right)"""
    
    def test_left_creation(self):
        """Left should wrap violations"""
        violations = [
            Violation(
                rule_id="test.rule",
                severity="high",
                message="Error"
            )
        ]
        
        left = Left_(violations)
        
        assert is_left(left)
        assert not is_right(left)
        assert left["_tag"] == "Left"
    
    def test_right_creation(self):
        """Right should wrap context"""
        ctx = {"messages": [{"role": "user", "content": "Hello"}]}
        
        right = Right_(ctx)
        
        assert is_right(right)
        assert not is_left(right)
        assert right["_tag"] == "Right"
    
    def test_get_violations(self):
        """get_violations should extract violations from Left"""
        violations = [
            Violation(
                rule_id="test.rule1",
                severity="high",
                message="Error 1"
            ),
            Violation(
                rule_id="test.rule2",
                severity="med",
                message="Error 2"
            )
        ]
        
        left = Left_(violations)
        extracted = get_violations(left)
        
        # get_violations returns list of dicts (violations are serialized)
        assert len(extracted) == 2
        assert extracted[0]["rule_id"] == "test.rule1"
        assert extracted[1]["rule_id"] == "test.rule2"
    
    def test_get_context(self):
        """get_context should extract context from Right"""
        ctx = {
            "messages": [{"role": "user", "content": "Hello"}],
            "model": "gpt-3.5-turbo"
        }
        
        right = Right_(ctx)
        extracted = get_context(right)
        
        assert extracted == ctx
        assert extracted["model"] == "gpt-3.5-turbo"
    
    def test_get_violations_from_right_raises(self):
        """get_violations should raise if called on Right"""
        right = Right_({"test": "data"})
        
        with pytest.raises(ValueError, match="Cannot get violations from Right"):
            get_violations(right)
    
    def test_get_context_from_left_raises(self):
        """get_context should raise if called on Left"""
        left = Left_([Violation("test", "high", "Error")])
        
        with pytest.raises(ValueError, match="Cannot get context from Left"):
            get_context(left)


class TestEitherTypeGuards:
    """Test is_left and is_right type guards"""
    
    def test_is_left_with_left(self):
        """is_left should return True for Left"""
        left = Left_([Violation("test", "high", "Error")])
        assert is_left(left) is True
    
    def test_is_left_with_right(self):
        """is_left should return False for Right"""
        right = Right_({"test": "data"})
        assert is_left(right) is False
    
    def test_is_right_with_right(self):
        """is_right should return True for Right"""
        right = Right_({"test": "data"})
        assert is_right(right) is True
    
    def test_is_right_with_left(self):
        """is_right should return False for Left"""
        left = Left_([Violation("test", "high", "Error")])
        assert is_right(left) is False


class TestViolationSeverity:
    """Test violation severity levels"""
    
    def test_severity_levels(self):
        """All severity levels should be valid"""
        severities = ["low", "med", "high", "critical"]
        
        for severity in severities:
            v = Violation(
                rule_id="test.rule",
                severity=severity,
                message="Test"
            )
            assert v.severity == severity


class TestViolationEvidence:
    """Test violation evidence field"""
    
    def test_evidence_can_be_dict(self):
        """Evidence can be a dictionary"""
        v = Violation(
            rule_id="test.rule",
            severity="high",
            message="Test",
            evidence={
                "pattern": "badword",
                "matches": 3,
                "context": "some text with badword"
            }
        )
        
        assert v.evidence["pattern"] == "badword"
        assert v.evidence["matches"] == 3
    
    def test_evidence_can_be_string(self):
        """Evidence can be a string"""
        v = Violation(
            rule_id="test.rule",
            severity="high",
            message="Test",
            evidence="Found profanity at position 10"
        )
        
        assert isinstance(v.evidence, str)
        assert "position 10" in v.evidence
    
    def test_evidence_can_be_list(self):
        """Evidence can be a list"""
        v = Violation(
            rule_id="test.rule",
            severity="high",
            message="Test",
            evidence=["match1", "match2", "match3"]
        )
        
        assert isinstance(v.evidence, list)
        assert len(v.evidence) == 3


if __name__ == "__main__":
    pytest.main([__file__, "-v"])

