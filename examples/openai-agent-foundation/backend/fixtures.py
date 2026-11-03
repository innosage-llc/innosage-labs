"""Synthetic, versioned fixtures. These are NOT external measurements."""
SCENARIO={"id":"foundation-synthetic-v1","synthetic":True,
    "title":"Codex 资讯关注 → AI 实操受众质量（合成案例）",
    "objective":"通过 AI 工具教程验证读者是否愿意收藏、复用并讨论",
    "active_experiment":"experiment-synthetic-319",
    "note":"只验证 Agent 架构；不是实际小红书数据。"}
STRATEGY={"id":"strategy","version":1,"accepted":True,
    "policy":"验证真正的 AI 工作流受众；不以浏览量单独证明需求，每轮选择一个行动。",
    "goal":SCENARIO["objective"],"source_id":"synthetic-approved-strategy-v1","history":[]}
INTAKE={"id":"intake-sim-001","synthetic":True,"status":"CANDIDATE",
    "source_type":"synthetic_meeting","source_id":"meeting-sim-001",
    "rights":"internal_test_only",
    "summary":"讨论了如何用 AI 减少录屏、会议资料及营销素材的手动搬运。",
    "customer_questions":["能不能直接复用自动化流程？","如何确认真的有效？"],
    "unverified_claims":["用户愿意为工作台付费","AI 提高实际转化率"],
    "approved_public_facts":[]}
APPROVED_FACTS={"id":"public-facts-sim","synthetic":True,"source_id":"approved-fixture-v1",
    "facts":["这是合成素材演示","未在真实平台发布"]}
FEEDBACK_WEAK={"id":"feedback-sim-001","synthetic":True,
    "source_type":"synthetic_xiaohongshu_observation",
    "period":"模拟发布后48小时","post_id":"fake-note-001",
    "views":1500,"favorites":12,
    "comments":["有没有一步一步可以跟着做的教程？",
                "能给可以复用的配置吗？","只有消息，没有实际操作过程。"],
    "missing":["真实读者身份","留存","付费行为"],
    "origin":"synthetic fixture, NOT platform evidence"}
FEEDBACK_STRONG={"id":"feedback-counterfactual-strong","synthetic":True,
    "period":"模拟发布后48小时","post_id":"fake-note-001",
    "views":1500,"favorites":225,
    "comments":["步骤很清楚，收藏以后准备照着操作。"],
    "missing":["真实读者身份","付费行为"],"origin":"synthetic counterfactual"}
