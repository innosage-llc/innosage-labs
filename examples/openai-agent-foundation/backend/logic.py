"""Explicitly deterministic offline engine; not actual LLM reasoning."""
from __future__ import annotations

def decide(strategy: dict,intake: dict,feedback: dict | None) -> dict:
    sources=[strategy["source_id"],intake["id"]]
    if feedback is None:
        return {
            "outcome":"CONTINUE",
            "next_action":"先用简短 AI 自动化案例，测试读者是否需要真实操作教程",
            "reason":"尚无该实验的受众反馈；优先验证问题而非假定已经产生增长。",
            "prediction":"评论应该揭示用户是否需要操作步骤、配置和可复制成果。",
            "falsifier":"用户不要求复用步骤、收藏与互动质量没有改善，则调整表达方式。",
            "source_ids":sources,"used_feedback":False,
            "uncertainties":["尚无真实互动证据","此为合成环境"],
            "strategy_version":strategy["version"],"policy_read":strategy["policy"],
        }
    sources.append(feedback["id"])
    views=int(feedback.get("views",0))
    fav=int(feedback.get("favorites",0))
    rate=fav/views if views>0 else None
    comments=feedback.get("comments",[])
    asks=sum(any(token in str(c) for token in ("步骤","教程","配置","复用","怎么做"))
             for c in comments)
    if rate is None:
        outcome,action,why=("SKIP","先核对互动指标口径，再决定是否改变内容",
                            "浏览分母缺失，不能据不完整数据判断兴趣变化。")
    elif rate<0.03 and asks>=2:
        outcome,action,why=("ADJUST",
            "下一篇采用逐步操作 + 可复制配置的 AI 工作流教程，验证内容可复用性",
            f"模拟 {views} 次浏览仅 {fav} 次收藏，且有 {asks} 条评论询问步骤/配置，支持调整表达方式。")
    elif rate>=0.10:
        outcome,action,why=("CONTINUE",
            "保持教程方向，继续测试读者是否能够实际复用",
            f"模拟收藏率 {rate:.1%}，当前格式出现积极信号，但不能外推到真实用户。")
    else:
        outcome,action,why=("CONTINUE",
            "继续收集更可靠的受众反馈，暂时不修改已批准策略",
            "模拟反馈不足以支持稳定的受众偏好判断。")
    return {
        "outcome":outcome,"next_action":action,"reason":why,
        "prediction":"下一轮观察收藏、具体问题及复用意图，而非只看浏览量。",
        "falsifier":"下轮没有复用兴趣或指标口径无法比较。",
        "source_ids":sources,"used_feedback":True,
        "feedback_summary":{"id":feedback["id"],"views":views,"favorites":fav,
            "save_rate":round(rate,4) if rate is not None else None,
            "questions_about_steps":asks,"period":feedback.get("period","unknown")},
        "uncertainties":feedback.get("missing",[]),
        "strategy_version":strategy["version"],"policy_read":strategy["policy"],
    }

def content_draft(decision: dict,public_facts: dict) -> dict:
    title=("AI 工作流：给出可复制的步骤" if decision["outcome"]=="ADJUST"
           else "AI 自动化怎么开始？一个内部示例")
    return {
        "title":title,
        "caption":"【模拟 · 内部审核 · 禁止发布】\n"+decision["next_action"]+
            "\n这是合成资料测试草稿，没有真实用户证词或增长结论。",
        "tags":["内部演示","AI工作流"],
        "approved_fact_ids":[public_facts["source_id"]],
        "candidate_claims_excluded":True,"synthetic":True,"publishable":False,
    }

def strategy_proposal(decision: dict,run_id: str):
    if not decision.get("used_feedback") or decision["outcome"]!="ADJUST":
        return None
    if decision.get("policy_read")==("下一轮内容优先提供复用步骤，观察具体提问与收藏，"
                                    "而非只看浏览量。"):
        return None
    return {
        "id":"proposal-"+run_id,"run_id":run_id,"status":"PENDING","synthetic":True,
        "proposal":"下轮内容优先提供复用步骤，观察具体提问与收藏，而非只看浏览量。",
        "reason":decision["reason"],"source_ids":decision["source_ids"],
        "requires_founder_approval":True,
    }
