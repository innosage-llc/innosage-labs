# 四源审核契约

每个来源必须记录 command、version、scope_verified、presence、completeness、duration/timeout、measurement、error_category。路径、仓库名、文件名、用户名、原始 stderr 不返回模型。

| 来源 | 固定请求 | 含义 |
| --- | --- | --- |
| analyze | `mo analyze --json`，先验证本版本帮助 | 一般磁盘占用；不是候选或释放估算 |
| clean | `mo clean --dry-run` | 缓存/日志候选；仅允许精确本地 clean-list 预览文件写入 |
| purge | `mo purge --dry-run`，在写入拒绝边界内验证帮助；未验证运行时根保持 PARTIAL | 项目构建/依赖候选；缺根、拒绝访问、超时均不完整 |
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
| app/browser/homebrew/developer caches、logs | clean 新鲜预览中的条目数和舍入估算；有未测量条目时保留下界 | 可能重新下载、重新登录或丢失排障日志；活动应用/离线可用性需复核；下载大小/耗时未知 |
| xcode_derived_data、build_and_dependencies | analyze 占用只是复核信号；purge 预览才是构建候选估算 | 需重新编译/下载依赖，可能影响当前任务；源码、整个仓库/worktree 不属于候选 |
| container_data、xcode_simulators | 仅表示占用，不自动归类可删除 | 可能包含数据库、卷、模拟器状态；先确认官方支持的精确范围与备份 |
| ios_backups、old_downloads、xcode_archives | 只列占用与人工复核需求 | 可能是唯一备份、用户文件或发布归档；不能仅凭年龄或体积建议删除 |
| home、user_library、applications、system_library、other | 磁盘类别/未分类聚合 | 不推导可回收字节，不做自动清理建议 |
| worktrees | 独立数量、已分配占用或 observed 下界；workspace_count 是保存根元数据快照 | 全部 Git/活动状态 UNKNOWN；不删除整个 worktree；重建、未推送内容和任务状态未知 |

新版固定入口 `audit-all.py` 自动尝试四源；不需要模型补充根路径。worktree_count_completeness 与字节枚举覆盖分别报告，部分字节结果不抹掉已完成的浅层数量枚举。自动发现只覆盖本机 CODEX_HOME 约定，其他主机或未知自定义根仍 UNKNOWN。

运行边界禁止网络和除私有 scratch、`/dev/null`、clean 精确预览文件之外的写入；禁止 sudo 和系统管理工具。HOME 保持真实值；继承的 MO_ANALYZE_PATH、BASH_ENV 和 Mole 测试/跳过变量不传给子进程。Apple Bash 临时文件回退需要拒绝固定系统临时根 metadata，所以 /tmp 下的软件/审核根可能失败；失败时不扩大权限。clean 的物理父目录缺失或目标为链接/硬链接时失败关闭，不创建配置目录。运行时结果只有聚合候选，不足以授权精确删除。

## 文件类型与可执行行

目录/insight 分类不是文件类型。analyze 证据附带独立有界 Home 文件名/stat 枚举，固定扩展名类与目录用途是同一批文件的两个维度，不能相加。分类不读内容、不验证真实格式，未覆盖系统、其他用户/卷/链接目标；PARTIAL 比例仅针对已测普通文件的分配字节。

对话直接呈现编号 summary_markdown；完整报告链接不能替代核心类型表。每次方案有新 plan_id、固定行号与10分钟展示绑定有效期，这不是实际目标新鲜度证明。当前聚合行无精确目标/官方选择操作，全部 review-only。行号批准只绑定该方案，不能扩大到 mo clean/purge --yes；stale、重叠、未知ID、缺范围或不支持的操作均阻塞。批准响应说明每行阻塞、statvfs前后磁盘可用空间及下一步；未执行实际释放null。磁盘可用差值含并发变化，不能归功于清理。

Mole 1.72 clean 无选择列表且重新扫描，可能清空未选Trash；purge无人值守覆盖全部适合项。对于这些聚合行，仍需官方精确接口才能执行，不能改配置、调用私有函数或猜TUI索引。旧协议模拟executor仅在tests里；用户新明确授权的独立精确adapter只处理两类单文件下载缓存，见下文。

硬链接若有不同扩展名，类型按首次遇到的名字归属；总字节去重，但分类归属可能变化。未知格式保留other类别，不能靠读取内容补齐。

## 新授权的独立精确缓存能力

当前开发/测试批准没有授权清理真实用户文件。只有私有清单绑定的Homebrew bottle/pip HTTP-v2单文件行可能actionable；其他聚合行仍review-only。公开方案包含私有清单hash和随机对象ID；路径只在人类本机详情中。逐行批准、描述符复核、原生排他捕获、有限打开观察、持久恢复状态与计量详见 [精确执行契约](precise-execution.md)。本能力不调用Mole删除引擎。若已有Mole clean whitelist或无法确认其状态，v1全部精确对象转人工，不读取/修改其保护内容来绕过。
