from __future__ import annotations

import json

from app.ai.agents.base import Agent, AgentTask
from app.ai.prompts import SYSTEM_SAFETY, TAILOR
from app.ai.schemas import TailoringRequest, TailoringResult


class TailoringAgent(Agent):
    operation = 'tailor'
    response_model = TailoringResult

    def build_task(self, request: TailoringRequest) -> AgentTask:
        payload = {
            'resume': request.resume.model_dump(mode='json'),
            'job_description': request.job_description,
        }
        return AgentTask(
            operation=self.operation,
            system_prompt=SYSTEM_SAFETY,
            user_prompt=TAILOR.format(input_data=json.dumps(payload, ensure_ascii=False)),
            response_model=self.response_model,
        )