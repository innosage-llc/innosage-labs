---
name: is-clean-my-mac
description: 在本地 macOS Codex 全面审核 Mac 磁盘、缓存/构建候选和 Codex workspace/worktree 占用，生成中文清理计划；先审核，任何真实清理另行审批。
---

# is-clean-my-mac

用户说“全面审核我的 Mac 磁盘，给我清理计划，先不要清理。”时，直接完成以下审核，不要求更长提示词或换模型。读取 [审核契约](references/audit-contract.md) 和 [安全策略](references/safety-policy.md)。

1. 确认本地 macOS 和当前会话的官方 `mole` Skill；读取其 macOS 参考。缺依赖时读 [Agent 安装入口](https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt)，在真实 owner 批准具体计划后代为安装。不要以安装为由扫描，不把手动清单退给用户。文件存在但会话未发现，只交接启动新会话。
2. 简短说明将审核四个来源、不删除候选文件；clean 会创建或更新官方 `~/.config/mole/clean-list.txt` 预览文件，临时产物留在私有 scratch。随附运行边界禁止网络、主机缓存/日志/配置写入及提权，连版本和帮助都在边界内。不能把 Mole 原生命令直接输出给模型；analyze JSON 模式也可能尝试修剪缓存。
3. 运行唯一审核入口：`python3 -B <本 Skill>/scripts/audit-all.py`。它确定性地执行 worktree 清单及 analyze、clean、purge 三个聚合适配器，默认每个 Mole 来源上限 180 秒，worktree 上限 30 秒；一个失败仍尝试其余来源。不要自行猜 worktree 根、预先要求用户确认根或跳过来源。自动发现只读取 CODEX_HOME、本机固定 app metadata 的根列表及 worktree 文件元数据；不读取会话、源码、凭据或文档内容。
4. 若宿主限制导致嵌套 sandbox 无法初始化，只按宿主支持的审批流程申请运行**同一个带内层写入边界的 helper**；说明具体原因，不改为直接运行 Mole、不取消内层边界、不提权。必要审批被拒绝就保留 FAILED/UNKNOWN，继续独立来源。缺少物理预览父目录、链接/硬链接、未知版本/格式均按结果停止该来源；不创建配置目录或修复权限。
5. 入口已用确定性 renderer 生成完整中文 `report_markdown` 和新建的脱敏 `report_path` 文件。先打开/链接该本地报告，并直接呈现其中数字与四源/类别表；不要用泛泛步骤替代，不重新计算或省略字段。用聚合 JSON 解释：磁盘类别占用、缓存/构建候选、workspace 元数据数量、worktree 数量与占用、每源覆盖及准确失败原因。保留 measured/observed 下界和 null，不把 UNKNOWN 填零。`actual_freed_bytes` 始终 null；worktree 占用不是可回收空间，全部 Git/活动阻塞 UNKNOWN。来源和 insight 类别可能重叠，不相加。
6. 依据 [风险与恢复成本](references/audit-contract.md#风险与恢复成本) 给出可行动的优先级：证据来自哪个来源、需要复核什么、重新下载/重建成本、活动任务风险。analyze 的 cleanable 标记不是删除授权；缓存也不能一律称为安全。原始私人候选留在本地预览中，聚合摘要不足以授权精确删除。给出计划后等待用户逐项批准精确范围；本版不执行真实清理或整个 worktree 删除。

## 覆盖与运行边界

适配器支持 Mole 1.54.0/1.72.0。1.72.0 有已校验官方发行二进制的合成目录运行证据，仍不等于 MacBook 端到端验收。可选字段缺失不拒绝整个 JSON；未知字段/状态保留已知测量并报告 PARTIAL，未知核心形状 FAILED。输出只含固定公开类别和数值，不泄漏路径、文件名或未知字段值。

`purge --dry-run` 仅在已验证的 macOS 写入拒绝边界内运行；上游源加载时的配置保存也被拒绝。无已验证配置根时使用官方运行时发现，scope_verified=false，结果至多 PARTIAL；不伪造根数量。边界不可用就失败关闭，不用确认参数绕过。clean 仅允许精确预览文件写入，邻近配置、日志和缓存仍禁止。系统临时根的 metadata 被拒绝，让 Apple Bash 的 heredoc 使用私有 cwd；因此受阻扫描保持 PARTIAL/FAILED，不能放宽到整个 /tmp。上游若切换 cwd 后无法创建临时文件，也保留失败。
