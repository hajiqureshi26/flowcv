from __future__ import annotations

from app.ai.agents.base import Agent, AgentTask
from app.ai.prompts import JD_ANALYZE, SYSTEM_SAFETY
from app.ai.schemas import JDAnalysisRequest, JDAnalysisResult


class JDAnalyzerAgent(Agent):
    operation = 'jd_analyze'
    response_model = JDAnalysisResult

    def build_task(self, request: JDAnalysisRequest) -> AgentTask:
        return AgentTask(
            operation=self.operation,
            system_prompt=SYSTEM_SAFETY,
            user_prompt=JD_ANALYZE.format(job_description=request.job_description),
            response_model=self.response_model,
        )