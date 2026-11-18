# 四源审核契约

每个来源必须记录 command、version、scope_verified、presence、completeness、duration/timeout、measurement、error_category。路径、仓库名、文件名、用户名、原始 stderr 不返回模型。

| 来源 | 固定请求 | 含义 |
| --- | --- | --- |
| analyze | `mo analyze --json`，先验证本版本帮助 | 一般磁盘占用；不是候选或释放估算 |
| clean | `mo clean --dry-run` | 缓存/日志候选；仅允许精确本地 clean-list 预览文件写入 |
| purge | 当前在版本/帮助/预览进程启动前暂停：`purge_lifecycle_unverified` | 预览不可用，候选 UNKNOWN；不是零或成功，clean 不能替代 |
| worktrees | 随附 Python helper | 已验证根的独立数量与已分配磁盘字节，不是可回收空间 |

仅 helper 的聚合 stdout 可直接进入模型。Mole 来源必须由本地、版本固定、具备对应 fixtures 的适配器处理；未知格式失败关闭。本例适配器支持 1.54.0/1.72.0 聚合类别；预览摘要保守为 PARTIAL，不授权精确清理。

`PRESENT`=确认根存在；`ABSENT`=已验证根确实不存在；`UNKNOWN`=无法确定。
`COMPLETE`=已验证范围内枚举完毕；`PARTIAL`=覆盖未完成或估算/重叠尚未验证；只有精确测量子集才称下界；`FAILED`=未获得可靠结果。任何失败/超时/权限拒绝/未验证自定义根都不能变成零。helper 字节部分结果的 occupied_bytes 为 null，observed 字节为下界；数量有独立 worktree_count_completeness，浅层枚举完成时可保留精确数量。

按实际已分配块计算，唯一 inode 去重；不跟随符号链接，发现链接标 PARTIAL。APFS 克隆/压缩、共享块不能推算成实际物理释放量；活动文件系统随时变化，COMPLETE 仅表示枚举覆盖，不是原子快照。根下一级 repo 或 slot/repo 的 `.git` 标记用于计数；无法识别的目录结构标 PARTIAL。helper 不读取仓库文件、用户文档、对话或凭据内容；唯一内容读取是有大小边界的本机 .codex-global-state.json 根元数据，仅提取固定根列表并输出白名单聚合；不执行 Git/网络/配置修改；全部 Git 和活动性字段保守为 UNKNOWN。无论 Git 是否干净，整个 worktree 都不是候选。

中文报告必须分别列出：worktree 总占用、purge 构建候选、clean 缓存候选、确认候选估计、条件性/未知潜力、覆盖状态。父子/不同来源可能重叠，缺少已验证消重信息时不相加。

审核表列：类别、大小/下界、来源、原因、重建/下载成本、活动阻塞、副作用、永久删除/废纸篓/可恢复性、不确定性、精确支持操作。未确认的候选估计及实际释放值为 UNKNOWN，而非零。

## 风险与恢复成本

以当前实测类别为依据，未测量的类别写 UNKNOWN，不承诺一定存在或能释放：

| 固定类别 | 证据与建议 | 风险/恢复成本 |
| --- | --- | --- |
| app/browser/homebrew/developer caches、logs | clean 新鲜预览中的条目数和舍入估算；有未测量条目时保留 PARTIAL 舍入估算，不称下界 | 可能重新下载、重新登录或丢失排障日志；活动应用/离线可用性需复核；下载大小/耗时未知 |
| xcode_derived_data、build_and_dependencies | analyze 占用只是复核信号；purge 预览才是构建候选估算 | 需重新编译/下载依赖，可能影响当前任务；源码、整个仓库/worktree 不属于候选 |
| container_data、xcode_simulators | 仅表示占用，不自动归类可删除 | 可能包含数据库、卷、模拟器状态；先确认官方支持的精确范围与备份 |
| ios_backups、old_downloads、xcode_archives | 只列占用与人工复核需求 | 可能是唯一备份、用户文件或发布归档；不能仅凭年龄或体积建议删除 |
| home、user_library、applications、system_library、other | 磁盘类别/未分类聚合 | 不推导可回收字节，不做自动清理建议 |
| worktrees | 独立数量、已分配占用或 observed 下界；workspace_count 是保存根元数据快照 | 全部 Git/活动状态 UNKNOWN；不删除整个 worktree；重建、未推送内容和任务状态未知 |

固定入口 `audit-all.py` 保留四源状态；当前 purge 预检返回暂停而不启动外部命令，其他来源独立处理；不需要模型补充根路径。worktree_count_completeness 与字节枚举覆盖分别报告，部分字节结果不抹掉已完成的浅层数量枚举。自动发现只覆盖本机 CODEX_HOME 约定，其他主机或未知自定义根仍 UNKNOWN。

运行边界禁止网络和除私有 scratch、`/dev/null`、clean 精确预览文件之外的写入；禁止 sudo 和系统管理工具。HOME 保持真实值；继承的 MO_ANALYZE_PATH、BASH_ENV 和 Mole 测试/跳过变量不传给子进程。Apple Bash 临时文件回退需要拒绝固定系统临时根 metadata，所以 /tmp 下的软件/审核根可能失败；失败时不扩大权限。clean 的物理父目录缺失或目标为链接/硬链接时失败关闭，不创建配置目录。运行时结果只有聚合候选，不足以授权精确删除。

## 默认 Mole-first 审核与可选模式

默认保留四个 core 来源，另加受保护 `mo status --json` 容量投影；Mole 官方 Skill 负责解释。status 仅支持已核验的1.72结构，投影唯一内置根卷 total/used及同记录差额，丢弃进程、用户、设备、网络和其他元数据。差额不是 Finder 含purgeable可用空间，未知结构/版本保持 UNKNOWN。

默认共享总墙钟预算300秒，可用 --timeout 降低；core时间预留按预算比例分配：status10、analyze100、清单30、clean130、purge30。提前完成释放时间给后续来源，每个来源仍有上限；下钻不能侵占预览保留时间。analyze最多八次测量（顶层+七次下钻），每次下钻最多30秒；优先最大已观测未解释允许范围，不能让微小工具分支抢占大型已知目录。允许根与物理/同设备边界见代码固定清单；不跟链接、不扩到任意返回路径。会话/worktree只用父级测量。Colima显式测量仍独立，不能填补或改变父总量。

`--include-file-types` 仍是可选旧元数据普查。默认审核在总预算内保留最多 6 秒，调用已有严格 Homebrew bottle / pip HTTP-v2 候选收集器，最多 8 个对象；`--precise-candidates` 保留兼容。元数据与精确本机身份留私有对象文件，模型只接收脱敏决策字段。该有限候选集不代替官方 Mole，不覆盖整类开发/浏览器缓存；预算/保护失败保留 UNKNOWN，不从聚合总量制造对象。

主答 summary_markdown / audit.zh.md 简洁呈现容量、主要占用、3–5 个具体选项及关键限制，不强制粘贴完整证据表。audit-details.zh.md 与 evidence-ledger.json 保留精确字节、来源、稳定 ID、覆盖/矛盾；主答须链接真实生成的详情。讨论编号不是执行选择行。clean/purge 预览分开呈现，部分 clean 结果不能替代 purge；失败、超时、中断不变成零。默认聚合行没有精确目标，均 review-only。用户批准编号不能扩大到 `mo clean` / `purge --yes`；后者不支持把本表作为精确选择清单，clean 还可能清空 Trash。不得改配置、调用私有函数或解析 TUI。

## 新授权的独立精确缓存能力

当前开发/测试批准没有授权清理真实用户文件。只有私有清单绑定的Homebrew bottle/pip HTTP-v2单文件行可能actionable；其他聚合行仍review-only。公开方案包含私有清单hash和随机对象ID；路径只在人类本机详情中。逐行批准、描述符复核、原生排他捕获、有限打开观察、持久恢复状态与计量详见 [精确执行契约](precise-execution.md)。本能力不调用Mole删除引擎。若已有Mole clean whitelist或无法确认其状态，v1全部精确对象转人工，不读取/修改其保护内容来绕过。

## 当前 purge 暂停及生命周期限制

官方 1.72 timeout 后端能建立独立子进程组。隔离的官方 Perl 后端 fixture 证明：只取消外层进程组不能保证终止全部子组；TERM 宽限也不能覆盖直接子进程退出但孙进程忽略 TERM 的情况。实验性 mktemp 路由已撤回，4 MiB 单文件限制和既有写入/网络拒绝不变；没有新进程扫描器或宽范围 kill。purge 在任何子进程前明确 FAILED/blocked，不宣称预览成功。其他来源沿用既有运行边界，但不能据旧的同组子进程测试宣称全部后代生命周期已证明。真实 MacBook 验收仍未完成。

详情链接只验证本机可读、大小和 SHA-256；未验证客户端打开，临时保留不保证。精确对象身份/分配量和逻辑量/年龄/保护观察可用于复核，活动和保留未知时不得称可立即删除。
