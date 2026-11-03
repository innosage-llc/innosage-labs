"""Offline tests: all data synthetic; no OpenAI / Xiaohongshu network requests."""
import os
import tempfile
from pathlib import Path

import pytest
from backend.fixtures import FEEDBACK_STRONG, INTAKE
from backend.logic import decide
from backend.store import Store
from backend.workflow import Workflow, Problem


@pytest.fixture()
def flow(tmp_path):
    return Workflow(Store(tmp_path / "isolated-27.sqlite"))


def first_round(flow):
    flow.load()
    result=flow.start()
    assert result["mode"]=="DETERMINISTIC_FIXTURE_NOT_LLM"
    return result


def first_feedback(flow):
    first_round(flow)
    flow.review_draft("approval-run-01",True)
    flow.simulate_publication("run-01")
    return flow.import_feedback("run-01","weak")


def test_load_is_idempotent(flow):
    assert flow.load()["already_exists"] is False
    before=len(flow.db.events())
    assert flow.load()["already_exists"] is True
    assert len(flow.db.events())==before
    assert len(flow.db.all("bots"))==2


def test_first_run_is_source_grounded_and_has_real_task_ownership(flow):
    run=first_round(flow)
    assert run["decision"]["source_ids"]==["synthetic-approved-strategy-v1","intake-sim-001"]
    assert run["decision"]["used_feedback"] is False
    assert run["usage"]["provider_requests"]==0
    assert run["status"]=="READY_FOR_REVIEW"
    tasks=flow.db.all("tasks")
    assert len(tasks)==2
    cmo,editor=next(t for t in tasks if t["bot"]=="cmo"),next(t for t in tasks if t["bot"]=="editor")
    assert editor["parent_task_id"]==cmo["id"]
    assert editor["status"]=="READY_FOR_APPROVAL"
    assert editor["handoff_input"]["source_ids"]==run["decision"]["source_ids"]
    artifact=flow.db.get("artifacts","artifact-run-01")
    assert artifact["publishable"] is False
    assert "用户愿意为工作台付费" not in artifact["caption"]


def test_no_publication_without_approved_draft(flow):
    first_round(flow)
    with pytest.raises(Problem):
        flow.simulate_publication("run-01")
    flow.review_draft("approval-run-01",False)
    with pytest.raises(Problem):
        flow.simulate_publication("run-01")
    with pytest.raises(Problem):
        flow.review_draft("approval-run-01",True)


def test_two_round_feedback_changes_next_action(flow):
    inserted=first_feedback(flow)
    assert inserted["created"] is True
    run2=flow.start()
    assert run2["feedback_id"]=="feedback-run-01"
    assert run2["decision"]["used_feedback"] is True
    assert run2["decision"]["outcome"]=="ADJUST"
    assert run2["changed_from_prior"] is True
    assert "feedback-run-01" in run2["source_ids"]
    assert run2["decision"]["feedback_summary"]["questions_about_steps"]==2
    assert run2["decision"]["strategy_version"]==1
    proposed=flow.db.get("revisions","proposal-run-02")
    assert proposed["status"]=="PENDING"
    # strategy is NOT silently rewritten merely because an agent proposed it.
    assert flow.db.get("strategy","strategy")["version"]==1


def test_counterfactual_is_sensitive_to_feedback(flow):
    first_feedback(flow)
    result=flow.counterfactual()
    assert result["changes_with_evidence"] is True
    assert result["changes_with_counterfactual"] is True
    assert result["without_feedback"]["outcome"]=="CONTINUE"
    assert result["strong_feedback"]["outcome"]=="CONTINUE"


def test_strong_feedback_does_not_force_adjust(flow):
    first_round(flow)
    flow.review_draft("approval-run-01",True)
    flow.simulate_publication("run-01")
    flow.import_feedback("run-01","strong")
    run=flow.start()
    assert run["decision"]["outcome"]=="CONTINUE"
    assert run["decision"]["used_feedback"]
    assert run["decision"]["feedback_summary"]["save_rate"]==0.15
    assert flow.db.all("revisions")==[]


def test_strategy_is_applied_only_after_approval(flow):
    first_feedback(flow)
    flow.start()
    pending=flow.db.get("revisions","proposal-run-02")
    assert pending["status"]=="PENDING"
    assert flow.db.get("strategy","strategy")["version"]==1
    review=flow.review_strategy("proposal-run-02",True)
    assert review["status"]=="APPROVED"
    new_policy=flow.db.get("strategy","strategy")
    assert new_policy["version"]==2
    assert new_policy["source_id"]=="proposal-run-02"
    run3=flow.start()
    assert run3["decision"]["strategy_version"]==2
    assert "复用步骤" in run3["decision"]["policy_read"]
    assert len(flow.db.all("revisions"))==1  # Do not re-ask an accepted strategy change
    with pytest.raises(Problem):
        flow.review_strategy("proposal-run-02",True)


def test_rejected_proposal_does_not_promote_strategy(flow):
    first_feedback(flow)
    flow.start()
    assert flow.review_strategy("proposal-run-02",False)["status"]=="REJECTED"
    assert flow.db.get("strategy","strategy")["version"]==1
    run3=flow.start()
    assert run3["decision"]["strategy_version"]==1


def test_dedupe_publication_feedback(flow):
    first_round(flow)
    flow.review_draft("approval-run-01",True)
    assert flow.simulate_publication("run-01")["created"] is True
    assert flow.simulate_publication("run-01")["created"] is False
    assert flow.import_feedback("run-01")["created"] is True
    assert flow.import_feedback("run-01")["created"] is False
    assert len(flow.db.all("feedback"))==1
    assert len(flow.db.all("publications"))==1
    assert len([e for e in flow.db.events() if e["type"]=="audience.feedback_imported"])==1


def test_feedback_cannot_arrive_before_publication(flow):
    first_round(flow)
    with pytest.raises(Problem):
        flow.import_feedback("run-01")
    with pytest.raises(Problem):
        flow.import_feedback("does-not-exist")


def test_no_second_run_without_evidence(flow):
    first_round(flow)
    with pytest.raises(Problem):
        flow.start()


def test_durable_restart_and_context_projection(tmp_path):
    path=tmp_path/"isolated.sqlite"
    original=Workflow(Store(path))
    first_feedback(original)
    original.start()
    original.review_strategy("proposal-run-02",True)
    projection=original.context_projection()
    original.db.audit("test.simulated_context_discarded","test",{"loss":"only volatile summary"})
    del original
    restored=Workflow(Store(path))
    assert restored.db.get("strategy","strategy")["version"]==2
    assert [r["id"] for r in restored.db.all("rounds")]==["run-01","run-02"]
    assert restored.db.get("approvals","approval-run-01")["status"]=="APPROVED_INTERNAL"
    assert restored.db.all("feedback")[0]["linked_run_id"]=="run-01"
    assert restored.context_projection()["round_ids"]==projection["round_ids"]
    assert restored.context_projection()["sdk_compaction_executed"] is False


def test_candidate_is_never_public_truth(flow):
    run=first_round(flow)
    artifact=flow.db.get("artifacts","artifact-run-01")
    assert artifact["approved_fact_ids"]==["approved-fixture-v1"]
    assert artifact["candidate_claims_excluded"] is True
    assert artifact["publishable"] is False
    assert run["decision"]["source_ids"][-1]==INTAKE["id"]
    assert INTAKE["rights"]=="internal_test_only"


def test_invalid_buckets_and_reset_are_scoped(tmp_path):
    db=Store(tmp_path/"own-db.sqlite")
    flow=Workflow(db)
    flow.load()
    with pytest.raises(ValueError):
        db.put("old-demo-data","x",{})
    other=Store(tmp_path/"other-demo.sqlite")
    other.put("strategy","strategy",{"id":"foreign"})
    assert flow.reset()["cleared"] is True
    assert flow.db.all("scenario")==[]
    assert other.get("strategy","strategy")=={"id":"foreign"}
    assert (tmp_path/"other-demo.sqlite").exists()
