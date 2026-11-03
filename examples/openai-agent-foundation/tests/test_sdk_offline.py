"""Genuine SDK Runner/HITL/delegation with a fake model, zero external API calls."""
import asyncio
from pathlib import Path

from agents import Agent, Runner, SQLiteSession, function_tool, ModelSettings, RunState, set_tracing_disabled
set_tracing_disabled(True)
from agents.models.interface import Model, ModelResponse
from agents.usage import Usage
from openai.types.responses import ResponseFunctionToolCall, ResponseOutputMessage, ResponseOutputText


def fncall(name,number):
    return ResponseFunctionToolCall(
        type="function_call",name=name,arguments=('{"input":"Draft a safe synthetic internal note."}' if name=="delegate_editor" else "{}"),
        call_id=f"call_{number}",status="completed",
    )


def final(message,number):
    return ResponseOutputMessage(
        id=f"msg_{number}",type="message",role="assistant",status="completed",
        content=[ResponseOutputText(type="output_text",text=message,annotations=[])],
    )


class ScriptedModel(Model):
    """Deterministic but actually drives SDK model/tool/agent orchestration."""
    def __init__(self):
        self.cmo_count=0
        self.editor_count=0

    async def get_response(self,system_instructions,input,model_settings,tools,output_schema,
                           handoffs,tracing,*,previous_response_id,conversation_id,prompt):
        is_editor="Editor role" in (system_instructions or "")
        if is_editor:
            self.editor_count+=1
            output=[final("【MOCK SDK】内部 Editor 草稿；禁止外部发布。",20)]
        else:
            self.cmo_count+=1
            if self.cmo_count==1:
                output=[fncall("read_evidence",1)]
            elif self.cmo_count==2:
                output=[fncall("delegate_editor",2)]
            else:
                output=[final("【MOCK SDK】CMO 已按授权完成内部交接。",30)]
        return ModelResponse(output=output,usage=Usage(requests=1),response_id=None)

    async def stream_response(self,*args,**kwargs):
        if False:
            yield None
        raise NotImplementedError("Offline test uses non-streaming Runner")


def test_sdk_tools_handoff_hitl_resume_and_sqlite_session(tmp_path):
    async def journey():
        model=ScriptedModel()
        called=[]
        @function_tool
        def read_evidence() -> str:
            """Read a synthetic, approved test source without network activity."""
            called.append("read_evidence")
            return "synthetic-approved-strategy-v1 / intake-sim-001 (not public)"
        editor=Agent(name="Test Editor",instructions="Editor role; no real channels",
                     model=model,model_settings=ModelSettings(store=False))
        delegate=editor.as_tool(tool_name="delegate_editor",
            tool_description="Draft an internal synthetic note",needs_approval=True)
        cmo=Agent(name="Test CMO",instructions="CMO role, one bounded synthetic decision",
                  model=model,model_settings=ModelSettings(store=False),
                  tools=[read_evidence,delegate])
        session=SQLiteSession("sdk-offline-test",tmp_path/"official-sdk-session.sqlite")
        first=await Runner.run(cmo,"Use synthetic sources and ask Editor for draft",
                               session=session,max_turns=8)
        assert called==["read_evidence"]
        assert len(first.interruptions)==1
        assert model.editor_count==0  # Human gate prevented delegation before approval.
        serialized=first.to_state().to_string()
        state_path=tmp_path/"paused-runstate.json"
        state_path.write_text(serialized,encoding="utf-8")
        restored=await RunState.from_string(cmo,state_path.read_text(encoding="utf-8"))
        for item in restored.get_interruptions():
            restored.approve(item)
        final_run=await Runner.run(cmo,restored,session=session,max_turns=8)
        assert not final_run.interruptions
        assert "CMO" in str(final_run.final_output)
        assert model.editor_count==1
        assert model.cmo_count>=3
        saved=await session.get_items()
        assert len(saved)>=1
        return len(saved)
    saved=asyncio.run(journey())
    assert saved>0


def test_sdk_decline_stops_editor_execution(tmp_path):
    async def journey():
        model=ScriptedModel()
        @function_tool
        def read_evidence() -> str:
            """Return synthetic evidence for a gated Editor tool."""
            return "synthetic evidence"
        editor=Agent(name="Reject Editor",instructions="Editor role",model=model)
        cmo=Agent(name="Reject CMO",instructions="CMO role",model=model,
                  tools=[read_evidence,editor.as_tool(
                      tool_name="delegate_editor",tool_description="internal draft",
                      needs_approval=True)])
        session=SQLiteSession("sdk-declined",tmp_path/"declined.sqlite")
        first=await Runner.run(cmo,"Read and delegate",session=session,max_turns=8)
        assert first.interruptions
        state=first.to_state()
        for item in state.get_interruptions():
            state.reject(item)
        outcome=await Runner.run(cmo,state,session=session,max_turns=8)
        assert not outcome.interruptions
        assert model.editor_count==0
    asyncio.run(journey())
