from __future__ import annotations

from dataclasses import dataclass
from typing import TypeVar

from pydantic import BaseModel


ResultT = TypeVar('ResultT', bound=BaseModel)


@dataclass(frozen=True)
class AgentTask:
    operation: str
    system_prompt: str
    user_prompt: str
    response_model: type[BaseModel]
    cacheable: bool = True


class Agent:
    operation: str
    response_model: type[BaseModel]

    def build_task(self, request: BaseModel) -> AgentTask:
        raise NotImplementedError