"""
Database connection management for ModelGuard.

This module provides database connectivity and session management
using SQLAlchemy with async support.
"""

from typing import AsyncGenerator, Optional

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import declarative_base

from gateway.config import get_settings
from gateway.cache import get_redis, close_redis


# Base class for declarative models
Base = declarative_base()

# Global engine and session maker
_engine: Optional[any] = None
_async_session_maker: Optional[async_sessionmaker] = None


def get_engine():
    """
    Get or create database engine.
    
    Returns:
        SQLAlchemy async engine
    """
    global _engine
    if _engine is None:
        settings = get_settings()
        
        # Convert postgres:// to postgresql+asyncpg://
        database_url = settings.database_url
        if database_url.startswith("postgresql://"):
            database_url = database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        elif database_url.startswith("postgres://"):
            database_url = database_url.replace("postgres://", "postgresql+asyncpg://", 1)
        
        _engine = create_async_engine(
            database_url,
            pool_size=settings.database_pool_size,
            max_overflow=settings.database_max_overflow,
            pool_timeout=settings.database_pool_timeout,
            pool_recycle=settings.database_pool_recycle,
            echo=settings.debug,
            future=True
        )
    
    return _engine


def get_session_maker() -> async_sessionmaker:
    """
    Get or create session maker.
    
    Returns:
        SQLAlchemy async session maker
    """
    global _async_session_maker
    if _async_session_maker is None:
        engine = get_engine()
        _async_session_maker = async_sessionmaker(
            engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False
        )
    
    return _async_session_maker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Get database session for dependency injection.
    
    Yields:
        Database session
    """
    session_maker = get_session_maker()
    async with session_maker() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_async_session() -> AsyncSession:
    """
    Get a new database session.
    
    Note: Caller is responsible for closing the session.
    
    Returns:
        New database session
    """
    session_maker = get_session_maker()
    return session_maker()


async def init_db() -> None:
    """
    Initialize database tables and Redis connection.
    
    Raises:
        Exception: If database or Redis initialization fails
    """
    # Initialize database
    engine = get_engine()
    # Skip table creation - tables already exist from Drizzle migrations
    # async with engine.begin() as conn:
    #     await conn.run_sync(Base.metadata.create_all)
    
    # Initialize Redis connection
    try:
        await get_redis()
    except Exception as e:
        # Redis is optional, log warning but don't fail
        import logging
        logging.warning(f"Redis initialization failed, caching disabled: {e}")


async def close_db() -> None:
    """Close database and Redis connections."""
    global _engine
    
    # Close database
    if _engine is not None:
        await _engine.dispose()
        _engine = None
    
    # Close Redis
    await close_redis()
