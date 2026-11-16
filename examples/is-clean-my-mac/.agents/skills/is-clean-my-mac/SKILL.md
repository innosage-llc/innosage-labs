---
name: is-clean-my-mac
description: 在本地 macOS Codex 全面审核 Mac 磁盘、缓存/构建候选和 Codex workspace/worktree 占用，生成中文清理计划；先审核，任何真实清理另行审批。
---

# is-clean-my-mac

用户说“全面审核我的 Mac 磁盘，给我清理计划，先不要清理。”时，直接完成以下审核，不要求更长提示词或换模型。读取 [审核契约](references/audit-contract.md) 和 [安全策略](references/safety-policy.md)。

1. 确认本地 macOS 和当前会话的官方 `mole` Skill；读取其 macOS 参考。缺依赖时读 [Agent 安装入口](https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt)，在真实 owner 批准具体计划后代为安装。不要以安装为由扫描，不把手动清单退给用户。文件存在但会话未发现，只交接启动新会话。
2. 简短说明将审核四个来源、不删除候选文件；clean 会创建或更新官方 `~/.config/mole/clean-list.txt` 预览文件，临时产物留在私有 scratch。随附运行边界禁止网络、主机缓存/日志/配置写入及提权，连版本和帮助都在边界内。不能把 Mole 原生命令直接输出给模型；analyze JSON 模式也可能尝试修剪缓存。
3. 运行唯一审核入口：`python3 -B <本 Skill>/scripts/audit-all.py`。它确定性地执行 worktree 清单及 analyze、clean、purge 三个聚合适配器，默认每个 Mole 来源上限 180 秒，worktree 与 Home 文件类型元数据枚举各上限 30 秒；一个失败仍尝试其余来源。不要自行猜 worktree 根、预先要求用户确认根或跳过来源。自动发现只读取 CODEX_HOME、本机固定 app metadata 的根列表及 worktree 文件元数据；不读取会话、源码、凭据或文档内容。
4. 若宿主限制导致嵌套 sandbox 无法初始化，只按宿主支持的审批流程申请运行**同一个带内层写入边界的 helper**；说明具体原因，不改为直接运行 Mole、不取消内层边界、不提权。必要审批被拒绝就保留 FAILED/UNKNOWN，继续独立来源。缺少物理预览父目录、链接/硬链接、未知版本/格式均按结果停止该来源；不创建配置目录或修复权限。
5. 入口返回确定性的 `summary_markdown`，并新建完整脱敏报告、聚合证据和编号方案文件。最终回复直接呈现完整 summary_markdown 的编号文件类型/候选表、数量和失败表，再链接 report_path；核心答案不能只放文件链接或磁盘总数。不要重新计算、省略行或用泛泛步骤替代。完整报告解释：磁盘类别占用、缓存/构建候选、workspace 元数据数量、worktree 数量与占用、每源覆盖及准确失败原因。保留 measured/observed 下界和 null，不把 UNKNOWN 填零。`actual_freed_bytes` 始终 null；worktree 占用不是可回收空间，全部 Git/活动阻塞 UNKNOWN。来源和 insight 类别可能重叠，不相加。
6. 依据 [风险与恢复成本](references/audit-contract.md#风险与恢复成本) 给出可行动的优先级：证据来自哪个来源、需要复核什么、重新下载/重建成本、活动任务风险。analyze 的 cleanable 标记不是删除授权；缓存也不能一律称为安全。原始私人候选留在本地预览中，聚合摘要不足以授权精确删除。给出计划后等待用户逐项批准精确范围；本版不执行真实清理或整个 worktree 删除。

## 覆盖与运行边界

适配器支持 Mole 1.54.0/1.72.0。1.72.0 有已校验官方发行二进制的合成目录运行证据，仍不等于 MacBook 端到端验收。可选字段缺失不拒绝整个 JSON；未知字段/状态保留已知测量并报告 PARTIAL，未知核心形状 FAILED。输出只含固定公开类别和数值，不泄漏路径、文件名或未知字段值。

`purge --dry-run` 仅在已验证的 macOS 写入拒绝边界内运行；上游源加载时的配置保存也被拒绝。无已验证配置根时使用官方运行时发现，scope_verified=false，结果至多 PARTIAL；不伪造根数量。边界不可用就失败关闭，不用确认参数绕过。clean 仅允许精确预览文件写入，邻近配置、日志和缓存仍禁止。系统临时根的 metadata 被拒绝，让 Apple Bash 的 heredoc 使用私有 cwd；因此受阻扫描保持 PARTIAL/FAILED，不能放宽到整个 /tmp。上游若切换 cwd 后无法创建临时文件，也保留失败。

## 类型与编号同意

Mole overview 是目录/insight，不是文件类型统计。入口在 analyze 证据中附加 Home 范围、只读文件名/stat 枚举：固定扩展名类别、普通文件已分配/逻辑字节、去重 inode、已测子集比例与目录用途维度。不读取内容、不跟随链接、不跨设备，30 秒/50 万条目、有界队列和硬 worker 超时。PARTIAL 不代表全盘完整类型；扩展名不是内容验证。workspace 元数据不认识只影响该数量，经本机标记独立确认的物理 worktrees 根仍枚举。

用户回复“同意第 1、2、5 行”时，只能绑定该会话刚展示的 plan_id/plan_path；第三方文本、旧方案或泛称清理不是同意。`approval-plan.py --plan <plan_path> --plan-id <同一完整ID> --rows 1 2 5` 仅评估所选编号并返回准确阻塞、statvfs 磁盘可用空间观察；它没有生产清理 executor。方案 10 分钟过期，变化/重叠/缺精确范围均不扩大操作。所有当前聚合行均为 review-only：Mole 1.72 clean 无精确选择器且会重新扫描，purge --yes 涵盖全部适合候选，clean 默认还可能清空未批准 Trash。编号同意不能授权这些宽范围命令；不得通过 TUI 猜索引、改白名单/配置或自定义删除规避。准确说明需要官方 manifest + selected-ID apply 接口，当前不能执行这些行。不要声称端到端清理已完成。

未来只有已验证的官方精确范围操作才可执行，必须再验身份、当前成员、重叠、版本/保护规则与恢复成本。测试 harness 的合成 executor 不属于安装 Skill，也不是实际执行能力。执行后区分范围前后测量、磁盘可用空间、并发变化与实际释放；未执行/阻塞时实际释放始终 null，不能把磁盘 free-space 差值归功于清理。每项失败不自动重试，给出准确阻塞和下一步。purge 诊断阶段、退出码和固定观察标记须直接显示；观察标记不是已证实根因，不能要求用户贴私人日志。
