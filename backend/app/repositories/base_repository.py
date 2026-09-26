from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Generic, TypeVar

T = TypeVar('T')


class BaseRepository(ABC, Generic[T]):
    @abstractmethod
    def create(self, item: T) -> T:
        raise NotImplementedError

    @abstractmethod
    def get_by_id(self, item_id: str) -> T | None:
        raise NotImplementedError

    @abstractmethod
    def update(self, item_id: str, item: T) -> T | None:
        raise NotImplementedError

    @abstractmethod
    def delete(self, item_id: str) -> bool:
        raise NotImplementedError
