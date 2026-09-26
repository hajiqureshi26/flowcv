from __future__ import annotations

import json

from app.ai.agents.base import Agent, AgentTask
from app.ai.prompts import ATS_ANALYZE, SYSTEM_SAFETY
from app.ai.schemas import ATSAnalysisRequest, ATSAnalysisResult


class ATSAgent(Agent):
    operation = 'ats_analyze'
    response_model = ATSAnalysisResult

    def build_task(self, request: ATSAnalysisRequest) -> AgentTask:
        payload = {
            'resume': request.resume.model_dump(mode='json'),
            'job_description': request.job_description,
        }
        return AgentTask(
            operation=self.operation,
            system_prompt=SYSTEM_SAFETY,
            user_prompt=ATS_ANALYZE.format(input_data=json.dumps(payload, ensure_ascii=False)),
            response_model=self.response_model,
        )