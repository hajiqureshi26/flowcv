from __future__ import annotations

import json

from app.ai.agents.base import Agent, AgentTask
from app.ai.prompts import RESUME_IMPROVE, SYSTEM_SAFETY
from app.ai.schemas import ResumeImproveRequest, ResumeImproveResult


class ResumeAgent(Agent):
    operation = 'resume_improve'
    response_model = ResumeImproveResult

    def build_task(self, request: ResumeImproveRequest) -> AgentTask:
        payload = {
            'operation': request.operation,
            'section': request.section,
            'selected_text': request.content,
            'resume_context': request.resume.model_dump(mode='json'),
        }
        return AgentTask(
            operation=self.operation,
            system_prompt=SYSTEM_SAFETY,
            user_prompt=RESUME_IMPROVE.format(request=json.dumps(payload, ensure_ascii=False)),
            response_model=self.response_model,
        )