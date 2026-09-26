from __future__ import annotations

from pydantic import BaseModel


class DatabaseConfig(BaseModel):
    url: str = 'sqlite:///./flowcv.db'
    echo: bool = False


class StorageConfig(BaseModel):
    provider: str = 'memory'
    path: str = './storage'


class DatabaseSettings(BaseModel):
    database: DatabaseConfig = DatabaseConfig()
    storage: StorageConfig = StorageConfig()


def get_database_settings() -> DatabaseSettings:
    return DatabaseSettings()
