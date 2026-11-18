---
name: is-clean-my-mac
description: 在本地 macOS 用官方 Mole 审核磁盘、解释主要占用和清理候选，补齐 Codex worktree 数量与占用，直接给出中文编号计划。
---

# is-clean-my-mac

用户说“全面审核我的 Mac 磁盘，给我清理计划，先不要清理。”时直接开始，不要求更长提示词或换模型。先读本机已安装的官方 **mole Skill**、macOS reference 和本例 [审核契约](references/audit-contract.md)。官方 Mole 决定命令语义、用途解释与恢复成本；harness 补齐覆盖、隐私和独立 worktree 清单。

## 六步审核

1. 确认官方 Skill、平台和版本。依赖缺失时走 [唯一安装入口](https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt)，可信 owner 已明确请求同范围安装/更新时，检查并说明实际计划后直接提交 INSTALL，不重复询问；仅审核请求不授权安装。owner 要求先批计划、范围变化或平台强制确认仍须等待。wrapper 更新不升级 Mole/前置工具/其他 Skills；安装不扫描。运行入口是**当前已读 SKILL.md 同目录**的 `scripts/audit-all.py`：`python3 -B <该 Skill 目录>/scripts/audit-all.py`。不从工作目录猜路径，不手造证据。入口先受保护验证版本/帮助，采集官方 status 的容量投影和 analyze overview；status 只输出同一系统卷容量/已用/差额，未知保持 UNKNOWN。
2. 诊断失败而不绕过。analyze 启动可能改缓存，purge 启动可能写配置；**版本、帮助、status、下钻、预览全部保留现有拒绝主机写入/网络边界**。clean 仅允许更新精确本地 clean-list。不得因官方通用示例而裸跑命令、改配置、权限或升级包。失败不变零；purge 保留阶段/退出码/观察标记，不推断根因。
3. 在共享总预算内先解释最大的未解释允许范围。analyze 最多八次测量（顶层加七次下钻），固定公开物理/同设备工具根，不跟链接。会话/worktree 用父级大小，不枚举其子目录；Colima 固定根是上游跳过父扫描后的显式测量。独立清单只给数量和分配字节/覆盖，**不是完成 Git 或活动安全审查**。未知个人目录、Other 留未知，不加新扫描器或读内容。
4. 顺序收集预览；当前 **purge 在任何子进程启动前暂停**，返回 `purge_lifecycle_unverified`，不能绕过或视为零候选。clean 仍单独处理，不能代替 purge。仅本地适配器读取官方预览清单，模型接收类别/舍入估算，不接收原始路径，不从聚合预览生成删除清单。预览值不是实际释放或唯一范围下界。说明永久删除、重下/重建、模拟器/容器唯一状态和未保护 Trash 风险；聚合命令重扫，无法按本表行号缩小。
5. 默认总墙钟预算 300 秒，入口给 core 来源保留时间；需要更短时可用 `--timeout`，耗尽明确报告，不自动无限重跑。`--include-file-types` 仍是另行请求的可选模式。默认额外保留最多 6 秒收集已有严格 Homebrew bottle / pip HTTP-v2 缓存格式的最多 8 个精确对象（`--precise-candidates` 保留兼容）；仅元数据，不读取内容、不扩大类别。精确对象的保护/身份是采集时观察，活动/保留需要 UNKNOWN 或新鲜预检，不能当成删除许可。
6. 直接给出简短主答：**容量/主要占用 → 3–5 个具体优先选项 → 会改变决策的限制**。默认使用 helper 的简洁 `summary_markdown`，可以自然措辞解释，不复制完整 ledger、全表或重复风险段。主答必须保留占用不等于可回收、clean/purge 分离与重叠、重要失败/不完整、唯一状态/恢复成本及未授权删除。证据不足时少列选项，不凑数。Other 保留为解释缺口，不挤掉会话和重要缓存候选。不要把“先保留”误写成建议删除。

## 主答简短，证据可追溯

`audit.zh.md` 是简洁主答；`audit-details.zh.md`、`evidence-ledger.json` 和 `review-plan.json` 保存精确字节、来源命令、稳定证据 ID、覆盖、观察时点、范围/父范围、矛盾和授权边界。提供 helper 返回的真实详情链接，不能编造或仅给链接而无结论。主答的 1–5 是讨论顺序，**不是可执行行号**；需要细查时用其中证据 ID 对应 ledger。模型可以压缩措辞，但不能删掉会改变选择的 caveat，也不能把上游总计改成分类求和、把 UNKNOWN 改成零。

purge 是单独的构建/依赖预览；当前因子进程取消边界未验证而暂停，只有工程修复并验证后才可在预算内恢复；clean 的部分目录数/大小不是完整 purge 结果。purge 失败、状态 1、超时或中断 130 按实际来源保留，不推断已删除、不宣称完整完成。purge 不等于删整个 worktree；预览也不能仅凭名称认定没有配置或临时写入。

overview/父子/insight/不同来源可能重叠；标签去重不证明范围互斥。即使类别之和等于 overview，也不是全盘已用或唯一字节下界。PARTIAL 可能是覆盖、舍入或未知重叠，不能一律称下界。Mole 与独立清单的不同口径不能相减；展示 workspace 未知、精确/已观察 worktree 数、字节覆盖以及 Git/活动状态 UNKNOWN。旧报告无墙钟/时点就保持未知，不把来源耗时相加冒充墙钟。

默认聚合行不是删除授权；批准编号不能替换成 `mo clean`、`purge --yes`、清空 Trash 或整棵 worktree 删除。官方交互选择只交接用户终端，不解析 TUI。默认精确对象的本机路径见 private-objects.zh.md，不上传原始路径；讨论到执行时才读 [可选流程](references/optional-execution-workflow.md) 和 [执行契约](references/precise-execution.md)，保留现有能力而不扩范围。实际执行仍需新鲜精确方案和真实逐行批准；报告逐行结果、可用空间变化与归因限制。

详情的 `artifact_verification` 只证明生成时本机文件可读及摘要；不是客户端点击成功或永久保存承诺。临时目录可能失效；不要虚称链接已打开。
