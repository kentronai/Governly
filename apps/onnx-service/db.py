"""Database connection for ONNX service"""

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from functools import lru_cache

from config import get_settings


@lru_cache()
def get_engine():
    """Get cached database engine"""
    settings = get_settings()
    
    return create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )


# Create session factory
engine = get_engine()
async_session_factory = sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


@asynccontextmanager
async def get_session(commit: bool = False) -> AsyncGenerator[AsyncSession, None]:
    """
    Get database session as async context manager.
    
    Args:
        commit: If True, commit on success (for writes). If False, no commit (for reads).
    """
    async with async_session_factory() as session:
        try:
            yield session
            if commit:
                await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency for FastAPI to get database session."""
    async with get_session() as session:
        yield session
