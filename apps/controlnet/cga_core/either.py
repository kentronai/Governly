"""
Either Monad - Pure Functional Error Handling

A proper Either type with Left (error) and Right (success) cases.
Replaces the Dict-based approach with proper classes.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import TypeVar, Generic, Callable, Union

# Type variables for generic Either
L = TypeVar('L')  # Left type (error)
R = TypeVar('R')  # Right type (success)
R2 = TypeVar('R2')  # For mapping


@dataclass(frozen=True)
class Left(Generic[L]):
    """Left case - represents an error/failure"""
    value: L
    
    def is_left(self) -> bool:
        return True
    
    def is_right(self) -> bool:
        return False


@dataclass(frozen=True)
class Right(Generic[R]):
    """Right case - represents success"""
    value: R
    
    def is_left(self) -> bool:
        return False
    
    def is_right(self) -> bool:
        return True


# Either type: can be Left or Right
Either = Union[Left[L], Right[R]]


# =====================================================
# Monadic Operations
# =====================================================

def bind(either: Either[L, R], f: Callable[[R], Either[L, R2]]) -> Either[L, R2]:
    """
    Monadic bind (>>=) for Either
    
    If either is Left, return it (short-circuit)
    If either is Right, apply f to the value
    """
    if isinstance(either, Left):
        return either  # type: ignore
    return f(either.value)


def fmap(either: Either[L, R], f: Callable[[R], R2]) -> Either[L, R2]:
    """
    Functor map for Either
    
    Lifts a pure function into the Either context
    """
    if isinstance(either, Left):
        return either  # type: ignore
    return Right(f(either.value))


def unwrap_or(either: Either[L, R], default: R) -> R:
    """Get the value or return default if Left"""
    if isinstance(either, Right):
        return either.value
    return default


def unwrap_or_else(either: Either[L, R], f: Callable[[L], R]) -> R:
    """Get the value or compute from error"""
    if isinstance(either, Right):
        return either.value
    return f(either.value)


__all__ = ['Either', 'Left', 'Right', 'bind', 'fmap', 'unwrap_or', 'unwrap_or_else']

