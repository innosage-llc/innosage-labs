"""OpenAI Agents SDK decision-contract tests; no provider calls/secret access."""
import asyncio
import os
from types import SimpleNamespace
from unittest import TestCase
from unittest.mock import AsyncMock, patch

from server.agent_runtime import DecisionResult, ConsideredSource, decide_next_action


class AgentPolicyTests(TestCase):
    def _run(self, source, publishable):
        output=DecisionResult(
            outcome="ADJUST",next_action="Evaluate one test post",
            rationale="Grounded synthetic test",falsifier="No qualified replies",
            considered=[ConsideredSource(
                intake_id=source["id"],disposition="considered_and_used",
                reason="Explicit synthetic test")],
            publishable=publishable,title="Candidate heading",
            caption="Only synthetic test text",poster_lines=["Synthetic"],
            tags=["AI"]
        )
        result=SimpleNamespace(
            final_output=output,context_wrapper=SimpleNamespace(
                usage=SimpleNamespace(requests=1,input_tokens=15,output_tokens=20,total_tokens=35)))
        with patch.dict(os.environ,{"OPENAI_API_KEY":"sk-fixture-not-real"}), patch(
                "server.agent_runtime.Runner.run",
                new=AsyncMock(return_value=result)):
            return asyncio.run(decide_next_action("Synthetic business objective",[source]))

    def test_private_candidate_cannot_make_publishable_post(self):
        src={"id":"i_private","status":"ANALYZED_CANDIDATE","visibility":"private_candidate",
             "summary":"Internal discussion not approved for public use",
             "approved_public_claims":[]}
        result=self._run(src,True)
        self.assertFalse(result["publishable"])
        self.assertEqual(result["_model_usage"]["total_tokens"],35)
        self.assertGreater(len(result["verification_required"]),0)

    def test_only_reviewed_public_claims_can_support_public_draft(self):
        src={"id":"i_reviewed","status":"APPROVED_FOR_USE","visibility":"public_approved",
             "summary":"Internal discussion not approved for public use",
             "approved_public_claims":["InnoSage Draft is a local-first Markdown editor"]}
        result=self._run(src,True)
        self.assertTrue(result["publishable"])
        self.assertEqual(result["considered"][0]["intake_id"],"i_reviewed")
