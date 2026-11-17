---
name: is-clean-my-mac
description: 在本地 macOS 用官方 Mole 审核磁盘、解释主要占用和清理候选，补齐 Codex worktree 数量与占用，直接给出中文编号计划。
---

# is-clean-my-mac

用户说“全面审核我的 Mac 磁盘，给我清理计划，先不要清理。”时直接开始，不要求更长提示词或换模型。先读本机已安装的官方 **mole Skill**、macOS reference 和本例 [审核契约](references/audit-contract.md)。官方 Mole 决定命令语义、用途解释与恢复成本；harness 补齐覆盖、隐私和独立 worktree 清单。

## 六步审核

1. 确认官方 Skill、平台和版本。依赖缺失时走 [唯一安装入口](https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt)，具体计划经真实 owner 同意后安装/更新；安装不扫描。运行入口是**当前已读 SKILL.md 同目录**的 `scripts/audit-all.py`：`python3 -B <该 Skill 目录>/scripts/audit-all.py`。不从工作目录猜路径，不手造证据。入口先受保护验证版本/帮助，采集官方 status 的容量投影和 analyze overview；status 只输出同一系统卷容量/已用/差额，未知保持 UNKNOWN。
2. 诊断失败而不绕过。analyze 启动可能改缓存，purge 启动可能写配置；**版本、帮助、status、下钻、预览全部保留现有拒绝主机写入/网络边界**。clean 仅允许更新精确本地 clean-list。不得因官方通用示例而裸跑命令、改配置、权限或升级包。失败不变零；purge 保留阶段/退出码/观察标记，不推断根因。
3. 在共享总预算内先解释最大的未解释允许范围。analyze 最多八次测量（顶层加七次下钻），固定公开物理/同设备工具根，不跟链接。会话/worktree 用父级大小，不枚举其子目录；Colima 固定根是上游跳过父扫描后的显式测量。独立清单只给数量和分配字节/覆盖，**不是完成 Git 或活动安全审查**。未知个人目录、Other 留未知，不加新扫描器或读内容。
4. 顺序收集 clean/purge 预览。仅本地适配器读取官方预览清单，模型接收类别/舍入估算，不接收原始路径，不默认生成删除清单。预览值不是实际释放或唯一范围下界。说明永久删除、重下/重建、模拟器/容器唯一状态和未保护 Trash 风险；聚合命令重扫，无法按本表行号缩小。
5. 默认总墙钟预算 300 秒，入口给 core 来源保留时间；需要更短时可用 `--timeout`，耗尽明确报告，不自动无限重跑。`--include-file-types` 和 `--precise-candidates` 是另行请求的旧可选模式，不参与默认审核。
6. 直接在对话给出：**容量基线 → 主要占用 → 预览估算与已确认可执行潜力 → 编号建议 → 覆盖/矛盾**。以 helper 的 `summary_markdown` 和本地 evidence-ledger 为依据，可按官方 Skill 简洁解释，不仅贴链接。保留证据 ID，跳号正常，不重编号。占用不等于清理优先级；按证据、后悔风险、恢复成本排序，保留会话与重要预览类别；Other 单列解释缺口，不挤掉建议。ledger 记录测量类型、范围/父范围、时点、来源、覆盖、重叠、矛盾、恢复成本与下一步，未知不补造。

## 测量、解释与授权分开

最终答复直接使用 helper 已筛选的 `summary_markdown` 表格与覆盖段，不重新编号、删列或摘要这些测量字段；可在其后用官方 Skill 补充简短解释。必须保留 `decision_guardrails` 来源/执行边界、观察时点 UNKNOWN、workspace 数量/覆盖及 worktree 精确数/已观察数的区别。这防止压缩时丢失证据身份，把上游总计改写成分类之和、把未知根因改写成没有诊断，或省略永久删除/Trash 风险；不是新的执行授权。

overview/父子/insight/不同来源可能重叠；标签去重不证明范围互斥。即使类别之和等于 overview，也不是全盘已用或唯一字节下界。PARTIAL 可能是覆盖、舍入或未知重叠，不能一律称下界。Mole 与独立清单的不同口径不能相减；展示 workspace 未知、精确/已观察 worktree 数、字节覆盖以及 Git/活动状态 UNKNOWN。旧报告无墙钟/时点就保持未知，不把来源耗时相加冒充墙钟。

默认聚合行不是删除授权；批准编号不能替换成 `mo clean`、`purge --yes`、清空 Trash 或整棵 worktree 删除。官方交互选择只交接用户终端，不解析 TUI。用户另行要求精确缓存对象时才读 [可选流程](references/optional-execution-workflow.md) 和 [执行契约](references/precise-execution.md)，保留现有能力而不扩范围。实际执行仍需新鲜精确方案和真实逐行批准；报告逐行结果、可用空间变化与归因限制。
