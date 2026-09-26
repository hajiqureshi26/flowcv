from __future__ import annotations

from abc import ABC, abstractmethod


class Repository(ABC):
    @abstractmethod
    def create(self, item):
        raise NotImplementedError

    @abstractmethod
    def get_by_id(self, item_id: str):
        raise NotImplementedError

    @abstractmethod
    def update(self, item_id: str, item):
        raise NotImplementedError

    @abstractmethod
    def delete(self, item_id: str) -> bool:
        raise NotImplementedError
