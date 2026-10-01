from __future__ import annotations

import json

from app.ai.agents.base import Agent, AgentTask
from app.ai.prompts import RESUME_HEALTH, SYSTEM_SAFETY
from app.ai.schemas import ResumeHealthRequest, ResumeHealthResult


class ResumeHealthAgent(Agent):
    operation = 'resume_health'
    response_model = ResumeHealthResult

    def build_task(self, request: ResumeHealthRequest) -> AgentTask:
        return AgentTask(
            operation=self.operation,
            system_prompt=SYSTEM_SAFETY,
            user_prompt=RESUME_HEALTH.format(resume=json.dumps(request.resume.model_dump(mode='json'), ensure_ascii=False)),
            response_model=self.response_model,
        )
