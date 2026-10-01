from app.ai.agents import ATSAgent, JDAnalyzerAgent, ResumeAgent, TailoringAgent
import pytest

from app.ai.schemas import ATSAnalysisRequest, ATSAnalysisResult, JDAnalysisRequest, JDAnalysisResult, ResumeImproveRequest, TailoringRequest
from app.schemas.resume import Resume


def sample_resume() -> Resume:
    return Resume.model_validate({
        'id': 'ai-test-resume',
        'updatedAt': '2026-09-27T00:00:00Z',
        'personal': {'name': 'Taylor Morgan'},
        'profile': {'type': 'doc', 'content': [{'type': 'paragraph', 'content': [{'type': 'text', 'text': 'Product engineer'}]}]},
    })


def test_agents_build_provider_neutral_tasks_and_keep_resume_facts_as_input() -> None:
    resume = sample_resume()
    resume_task = ResumeAgent().build_task(ResumeImproveRequest(resume=resume, section='profile', content='Product engineer'))
    jd_task = JDAnalyzerAgent().build_task(JDAnalysisRequest(job_description='Required: Python and distributed systems.'))
    ats_task = ATSAgent().build_task(ATSAnalysisRequest(resume=resume, job_description='Requires Python.'))
    tailor_task = TailoringAgent().build_task(TailoringRequest(resume=resume, job_description='Requires Python.'))

    assert resume_task.response_model.__name__ == 'ResumeImproveResult'
    assert 'Product engineer' in resume_task.user_prompt
    assert jd_task.operation == 'jd_analyze'
    assert ats_task.response_model.__name__ == 'ATSAnalysisResult'
    assert tailor_task.response_model.__name__ == 'TailoringResult'
    assert all('Do not invent' in task.system_prompt for task in [resume_task, jd_task, ats_task, tailor_task])
    assert not any(hasattr(agent, 'provider') for agent in [ResumeAgent(), JDAnalyzerAgent(), ATSAgent(), TailoringAgent()])


def test_ai_results_bound_item_counts_and_item_text():
    with pytest.raises(ValueError):
        ATSAnalysisResult(weak_evidence=[' '])
    with pytest.raises(ValueError):
        JDAnalysisResult(required_skills=['x' * 501])
