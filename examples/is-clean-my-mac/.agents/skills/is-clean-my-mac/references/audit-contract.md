# 四源审核契约

每个来源必须记录 command、version、scope_verified、presence、completeness、duration/timeout、measurement、error_category。路径、仓库名、文件名、用户名、原始 stderr 不返回模型。

| 来源 | 固定请求 | 含义 |
| --- | --- | --- |
| analyze | `mo analyze --json`，先验证本版本帮助 | 一般磁盘占用；不是候选或释放估算 |
| clean | `mo clean --dry-run` | 缓存/日志候选；说明本地 clean-list 预览文件副作用 |
| purge | `mo purge --dry-run`，先验证帮助及实际配置扫描根 | 项目构建/依赖候选；缺根、拒绝访问、超时均不完整 |
| worktrees | 随附 Python helper | 已验证根的独立数量与已分配磁盘字节，不是可回收空间 |

仅 helper 的聚合 stdout 可直接进入模型。Mole 来源必须由本地、版本固定、具备对应 fixtures 的适配器处理；未知格式失败关闭。本例适配器支持 1.54.0 聚合摘要，未交付精确候选范围适配器；摘要保守为 PARTIAL，不授权清理。

`PRESENT`=确认根存在；`ABSENT`=已验证根确实不存在；`UNKNOWN`=无法确定。
`COMPLETE`=已验证范围内枚举完毕；`PARTIAL`=仅下界；`FAILED`=未获得可靠结果。任何失败/超时/权限拒绝/未验证自定义根都不能变成零。helper 部分结果的 count/occupied_bytes 为 null，仅 observed 字段为下界。

按实际已分配块计算，唯一 inode 去重；不跟随符号链接，发现链接标 PARTIAL。APFS 克隆/压缩、共享块不能推算成实际物理释放量；活动文件系统随时变化，COMPLETE 仅表示枚举覆盖，不是原子快照。根下一级 repo 或 slot/repo 的 `.git` 标记用于计数；无法识别的目录结构标 PARTIAL。helper 不读取文件内容，不执行 Git/网络/配置操作；全部 Git 和活动性字段保守为 UNKNOWN。无论 Git 是否干净，整个 worktree 都不是候选。

中文报告必须分别列出：worktree 总占用、purge 构建候选、clean 缓存候选、确认候选估计、条件性/未知潜力、覆盖状态。父子/不同来源可能重叠，缺少已验证消重信息时不相加。

审核表列：类别、大小/下界、来源、原因、重建/下载成本、活动阻塞、副作用、永久删除/废纸篓/可恢复性、不确定性、精确支持操作。未确认的候选估计及实际释放值为 UNKNOWN，而非零。
