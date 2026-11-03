"""Bounded two-round Social Growth experiment with real, durable business state.

All actions in this module are deterministic synthetic tests, never real AI or XHS.
Live Agents SDK experimentation is separated behind an explicit spend gate.
"""
from __future__ import annotations

from copy import deepcopy
from threading import RLock

from .fixtures import SCENARIO, STRATEGY, INTAKE, APPROVED_FACTS, FEEDBACK_WEAK, FEEDBACK_STRONG
from .logic import decide, content_draft, strategy_proposal
from .store import Store, utcnow


class Problem(Exception):
    def __init__(self, message, code=409):
        super().__init__(message)
        self.code = code


class Workflow:
    def __init__(self, store: Store):
        self.db = store
        self.lock = RLock()

    def load(self):
        with self.lock:
            if self.db.get("scenario", SCENARIO["id"]):
                return {"loaded": True, "already_exists": True}
            self.db.put("scenario", SCENARIO["id"], deepcopy(SCENARIO),
                        action="scenario.loaded")
            self.db.put("strategy", "strategy", deepcopy(STRATEGY),
                        action="strategy.initially_approved")
            self.db.put("intakes", INTAKE["id"], deepcopy(INTAKE), action="intake.candidate_loaded")
            self.db.put("intakes", APPROVED_FACTS["id"], deepcopy(APPROVED_FACTS),
                        action="approved_fixture.loaded")
            for name,role in (("cmo","Social growth strategy"),("editor","Content drafting")):
                self.db.put("bots",name,{"id":name,"name":name.upper() if name=="cmo" else "Editor",
                    "role":role,"session_id":"bot-"+name,
                    "permitted_actions":["read_fixture","draft_internal_only"],
                    "status":"AVAILABLE"},action="bot.created")
            return {"loaded":True, "already_exists":False}

    def _ensure_loaded(self):
        if not self.db.get("scenario",SCENARIO["id"]):
            raise Problem("Load Sample Scenario first")

    def dashboard(self):
        return {
            "scenario":self.db.get("scenario",SCENARIO["id"]),
            "strategy":self.db.get("strategy","strategy"),
            "intakes":self.db.all("intakes"),
            "bots":self.db.all("bots"),
            "rounds":sorted(self.db.all("rounds"),key=lambda r:r["number"]),
            "tasks":self.db.all("tasks"),
            "artifacts":self.db.all("artifacts"),
            "approvals":self.db.all("approvals"),
            "feedback":self.db.all("feedback"),
            "publications":self.db.all("publications"),
            "revisions":self.db.all("revisions"),
            "sdk_probes":self.db.all("sdk_probes"),
            "events":self.db.events(45),
            "safety":{"simulation_only":True,"real_platform_actions":False,
                      "external_publication":False,"real_llm_test_passed":False},
        }

    def start(self):
        with self.lock:
            self._ensure_loaded()
            prior=sorted(self.db.all("rounds"),key=lambda r:r["number"])
            number=len(prior)+1
            if number > 1 and not self.db.all("feedback"):
                raise Problem("Import synthetic feedback before next loop")
            if number>3:
                raise Problem("Three rounds are sufficient for this bounded spike")
            if number==3 and any(r["status"]=="PENDING" for r in self.db.all("revisions")):
                raise Problem("Review the pending strategy proposal before another run")
            strategy=self.db.get("strategy","strategy")
            candidate=self.db.get("intakes",INTAKE["id"])
            public_facts=self.db.get("intakes",APPROVED_FACTS["id"])
            feedback=self.db.all("feedback")[-1] if self.db.all("feedback") else None
            decision=decide(strategy,candidate,feedback)
            rid=f"run-{number:02d}"
            pid="artifact-"+rid
            cmo_id="task-cmo-"+rid
            editor_id="task-editor-"+rid
            approval_id="approval-"+rid
            now=utcnow()
            last=prior[-1]["decision"] if prior else None
            record={
                "id":rid,"number":number,"created_at":now,"status":"READY_FOR_REVIEW",
                "mode":"DETERMINISTIC_FIXTURE_NOT_LLM","synthetic":True,
                "decision":decision,"baseline_next_action":last["next_action"] if last else None,
                "changed_from_prior":bool(last and last["next_action"]!=decision["next_action"]),
                "feedback_id":feedback["id"] if feedback else None,
                "agent_session":"bot-cmo","source_ids":decision["source_ids"],
                "usage":{"provider_requests":0,"input_tokens":0,"output_tokens":0,"cost_usd":0},
            }
            self.db.put("tasks",cmo_id,{"id":cmo_id,"bot":"cmo","run_id":rid,
                        "status":"COMPLETED","kind":"strategy_decision","created_at":now,
                        "source_ids":decision["source_ids"]},action="task.dispatched")
            self.db.put("rounds",rid,record,action="decision.recorded")
            self.db.put("tasks",editor_id,{"id":editor_id,"bot":"editor","run_id":rid,
                        "parent_task_id":cmo_id,"status":"READY_FOR_APPROVAL",
                        "kind":"content_draft","created_at":now,
                        "handoff_input":{"decision_id":rid,"source_ids":decision["source_ids"]}},
                        action="handoff.cmo_to_editor")
            artifact={"id":pid,"task_id":editor_id,"run_id":rid,
                      **content_draft(decision,public_facts)}
            self.db.put("artifacts",pid,artifact,action="draft.generated_synthetic")
            approval={"id":approval_id,"run_id":rid,"artifact_id":pid,
                      "status":"PENDING","kind":"INTERNAL_DRAFT_ONLY",
                      "created_at":now,"decision_at":None,
                      "warning":"Approving never publishes content"}
            self.db.put("approvals",approval_id,approval,action="approval.requested")
            proposal=strategy_proposal(decision,rid)
            if proposal and any(r["proposal"]==proposal["proposal"] for r in self.db.all("revisions")):
                proposal=None  # No duplicate approval for a previously decided proposal.
            if proposal:
                self.db.put("revisions",proposal["id"],proposal,
                            action="strategy.revision_proposed")
            return record

    def review_draft(self,approval_id: str,approve: bool):
        with self.lock:
            approval=self.db.get("approvals",approval_id)
            if not approval:
                raise Problem("Approval does not exist",404)
            if approval["status"]!="PENDING":
                raise Problem("Approval already resolved")
            approval["status"]="APPROVED_INTERNAL" if approve else "REJECTED"
            approval["decision_at"]=utcnow()
            self.db.put("approvals",approval_id,approval,actor="founder",
                        action="approval.accepted" if approve else "approval.rejected")
            artifact=self.db.get("artifacts",approval["artifact_id"])
            task=self.db.get("tasks",artifact["task_id"])
            task["status"]="COMPLETED" if approve else "REJECTED"
            self.db.put("tasks",task["id"],task,actor="founder",action="task.reviewed")
            return approval

    def simulate_publication(self,run_id: str):
        with self.lock:
            approval=self.db.get("approvals","approval-"+run_id)
            if not approval or approval["status"]!="APPROVED_INTERNAL":
                raise Problem("First approve the internal draft; no real publication is possible")
            pid="publication-"+run_id
            record={"id":pid,"run_id":run_id,"artifact_id":approval["artifact_id"],
                    "status":"MOCK_EXTERNAL_OUTCOME","synthetic":True,"platform_verified":False,
                    "post_id":"fake-note-001","created_at":utcnow()}
            created=self.db.once("publications",pid,record,
                event_key="mock-publication:"+run_id,
                event_type="publication.simulated",actor="founder")
            return {"record":self.db.get("publications",pid),"created":created}

    def import_feedback(self,run_id: str="run-01",fixture: str="weak"):
        with self.lock:
            if not self.db.get("publications","publication-"+run_id):
                raise Problem("Simulate a publication before importing feedback")
            if fixture not in {"weak","strong"}:
                raise Problem("Unknown synthetic feedback fixture",400)
            data=deepcopy(FEEDBACK_WEAK if fixture=="weak" else FEEDBACK_STRONG)
            data["id"]="feedback-"+run_id
            data["linked_run_id"]=run_id
            data["created_at"]=utcnow()
            created=self.db.once("feedback",data["id"],data,
                event_key="synthetic-feedback:"+run_id,
                event_type="audience.feedback_imported",actor="founder")
            return {"record":self.db.get("feedback",data["id"]),"created":created}

    def review_strategy(self,proposal_id: str,approve: bool):
        with self.lock:
            proposal=self.db.get("revisions",proposal_id)
            if not proposal:
                raise Problem("Strategy proposal not found",404)
            if proposal["status"]!="PENDING":
                raise Problem("Proposal already reviewed")
            proposal["status"]="APPROVED" if approve else "REJECTED"
            proposal["reviewed_at"]=utcnow()
            self.db.put("revisions",proposal_id,proposal,actor="founder",
                        action="strategy.revision_reviewed")
            if approve:
                strategy=self.db.get("strategy","strategy")
                strategy["version"]+=1
                strategy["policy"]=proposal["proposal"]
                strategy["source_id"]=proposal_id
                strategy["history"].append({"approved_revision_id":proposal_id,
                                             "approved_at":proposal["reviewed_at"]})
                self.db.put("strategy","strategy",strategy,actor="founder",
                            action="strategy.accepted_update")
            return proposal

    def counterfactual(self):
        self._ensure_loaded()
        strategy=self.db.get("strategy","strategy")
        intake=self.db.get("intakes",INTAKE["id"])
        observed=self.db.all("feedback")
        original=decide(strategy,intake,observed[-1] if observed else None)
        without=decide(strategy,intake,None)
        strong=decide(strategy,intake,FEEDBACK_STRONG)
        return {
            "synthetic":True,"actual_fixture_decision":original,
            "without_feedback":without,"strong_feedback":strong,
            "changes_with_evidence":(original["next_action"]!=without["next_action"]),
            "changes_with_counterfactual":(original["next_action"]!=strong["next_action"]),
            "notice":"Deterministic evidence sensitivity test, NOT proof of genuine LLM learning.",
        }

    def context_projection(self):
        """Context can be discarded while approved business state remains."""
        self._ensure_loaded()
        strategy=self.db.get("strategy","strategy")
        return {
            "kind":"BUSINESS_STATE_RECOVERY_ONLY",
            "sdk_compaction_executed":False,
            "strategy_version":strategy["version"],
            "strategy_source":strategy["source_id"],
            "round_ids":[r["id"] for r in self.db.all("rounds")],
            "approved_drafts":[a["id"] for a in self.db.all("approvals")
                               if a["status"]=="APPROVED_INTERNAL"],
            "info":"Independent SQLite records are restored on restart; real SDK compaction needs an authorized model run.",
        }

    def reset(self):
        with self.lock:
            self.db.clear_synthetic_demo()
            return {"cleared":True,"scope":"only the #27 synthetic database"}
