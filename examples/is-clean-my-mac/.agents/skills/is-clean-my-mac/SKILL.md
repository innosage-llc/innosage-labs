---
name: is-clean-my-mac
description: 在本地 macOS 用官方 Mole 审核磁盘、解释主要占用和清理候选，补齐 Codex worktree 数量与占用，直接给出中文编号计划。
---

# is-clean-my-mac

用户说“全面审核我的 Mac 磁盘，给我清理计划，先不要清理。”时直接开始；不要求更长提示词或换模型。

## Mole 为主，harness 补齐覆盖

先读取本机已安装的官方 **mole Skill** 和其 macOS reference。由它指导如何解释磁盘占用、按后悔/恢复成本排序、区分 clean/purge/uninstall 与个人数据的处理路线；不要只运行 helper 后给出机械状态。Mole 是命令语义和清理规则的权威。本 Skill 只补齐四源覆盖、隐私边界、worktree 清单及对话表。缺依赖时使用 [唯一安装入口](https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt)，获真实 owner 对具体计划的同意后安装/更新；安装本身不扫描或清理。

读取 [审核契约](references/audit-contract.md) 的边界。简短说明本次仅预览：Mole analyze 可能尝试改缓存，purge 启动可能尝试写配置；因此**包括版本/帮助/下钻的每次 Mole 调用都保留内层拒绝主机写入/网络边界**。clean 仅允许更新精确 clean-list 预览文件。不能为了遵循上游一般运行示例而绕过本机边界。

从刚读取的本 `SKILL.md` 所在目录定位 `scripts/audit-all.py`（不是工作目录根下），运行 `python3 -B <该 Skill 目录>/scripts/audit-all.py`。若找不到入口，核对已读 Skill 的路径；仍缺失则报告安装缺件，不手造方案/编号。它尝试 analyze、clean dry-run、purge dry-run 及独立 Codex 清单；在相同预算内最多下钻两个官方最大顶层目录，仅用官方 analyze，不做 Home 扩展名全量枚举，也不收集精确删除对象。原始路径/文件名留本地，模型只接收固定类别聚合。无法解释的 other 保留未知，不自行递归扫描或读文件内容来填满表格。

## 直接回答用户的决定

以官方 Mole Skill 的判断框架，先用一两句话解释**主要是什么占空间、优先复核什么、什么保留**。直接在对话展示 `summary_markdown` 的编号表和四源/工作区覆盖；链接不能代替表格。编号必须与 `summary_markdown` / plan 完全一致：不得重排、合并、拆分或重新编号；补充解释放表外。可压缩重复说明，不能省掉实测大小、来源、风险、下界/未知或失败原因。区分 Mole 实测与固定目录用途解释；后者不是内容验证。不要宣称目录类别是全盘文件扩展名普查。

占用与候选估算分开；父子下钻、insight 和来源可能重叠，不相加。worktree 数量与已测字节下界独立报告，workspace 元数据 UNKNOWN 不抹掉已测 worktree；整个 worktree 永不作为可回收。没有预览支持的类别不能说 Mole 可以清理。永久删除、重下/重编译、活动/离线及唯一副本风险按已观察类别解释；实际耗时/备份未验证就说未知。

purge FAILED 必须给出阶段、退出码和脱敏诊断，不能推断零候选、自动归咎 sandbox 或直接重跑裸命令。当前范围无法解决时说明具体下一步/限制，继续报告其他源。不得改配置、权限或升级包来制造成功。

## 后续动作

默认编号是复核行，不是精确删除授权。用户批准这些行时，不能替换为宽范围 `mo clean` / `purge --yes`：clean 重扫且可清空 Trash，purge 无人值守处理全部适合项，不能用行号缩小它们。官方交互选择只交接用户终端，不解析 TUI。

只有用户另行要求审阅受支持的精确下载缓存对象，才读 [可选精确流程](references/optional-execution-workflow.md) 和 [精确执行契约](references/precise-execution.md)，生成新方案；保留原有能力，不扩范围。审核、安装和工程测试同意都不授权清理。执行后必须逐行报告结果、前后可用空间和测量限制；未知物理归因不得冒充确定释放。
