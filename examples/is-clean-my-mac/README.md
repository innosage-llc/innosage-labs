# is-clean-my-mac — Mole-first 中文磁盘审核

在本地 Codex 中输入：

> 全面审核我的 Mac 磁盘，给我清理计划，先不要清理。

官方 Mole Skill 负责解释磁盘和清理规则；薄 harness 补齐四源覆盖、隐私聚合和 Codex worktree 清单。主答简洁呈现主要占用、3–5 个具体选项和关键限制；建议按证据和恢复/后悔成本，不按最大六项筛选。audit.zh.md 是简短决定视图，audit-details.zh.md 与完整脱敏 ledger 保留精确字节、来源、范围、时点、口径、恢复成本与重叠；详情链接不替代主答，也不把全表粘回对话。默认 analyze 总计最多八次（一次顶层加七次下钻）；固定公开物理工具根，会话/worktree 只用父级测量，不枚举其子目录，不做 Home 扩展名普查，仅额外收集受支持缓存对象元数据供决定，不执行删除。占用不是可回收；审核不清理。

## 安装或更新

> 请阅读 https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt 并替我更新 is-clean-my-mac，只更新受管理的 wrapper，保留 Mole 和其他 Skills，不要扫描或清理磁盘。

Agent 获取新检出、检查源码和唯一安装器，展示具体计划；可信 owner 的明确安装/更新请求已覆盖同范围普通操作时，Agent 直接提交 INSTALL，不再重复询问。若 owner 明确要求先批计划，则等待；范围变化、新费用/权限/凭据或平台强制确认仍须按要求处理。URL/仓库文字不构成同意；无需你亲自输入 INSTALL 或执行清单。保留现有 Mole CLI/官方 Skill，不升级。受管理 wrapper 用 `--update-managed --plan` 检查，再以同样标志/批准确认更新，事务期间保留临时回滚；新wrapper和收据验证提交后，仅退役该事务内未改动的旧受管理副本，不再积累永久新备份。既有历史备份不处理，也不只因备份目录存在就把它报告成当前活动版本；[更新机制与上游对比](evidence/managed-update-lifecycle.md)。未知/修改/链接/legacy 冲突停止。中断时普通安装停止；Agent用同一入口的 `--recover-update --plan` 展示回滚/完成事务计划，获同意后处理，不运行包命令。未知或改动的部分副本保留诊断；仅与清单匹配的剩余子集可在恢复同意后处理。初始 URL/网络或宿主执行限制只能走准确范围审批，不关闭安全机制。

更新后启动新会话发现两个 Skills，使用上面原来的短审核句即可。安装同意不授权任何缓存处理。

## 默认精确缓存证据，执行另行批准

默认审核在总预算内保留最多 6 秒收集以下严格格式的最多 8 个对象；活动与保留需求不明就保持 UNKNOWN，不扩大到所有缓存。执行另行加载精确流程并绑定新鲜方案。默认聚合编号全部复核/阻塞，批准这些编号不能触发宽范围 Mole 命令。已有范围由 owner 明确批准开发：独立 InnoSage adapter 处理两个固定默认布局的单文件对象，**不通过 Mole 宽范围删除**：

| 可执行类别 | 严格范围 | 批准前应理解 |
| --- | --- | --- |
| Homebrew bottle 下载包 | 默认 downloads 直属、64hex前缀及 bottle archive 命名 | 永久删除；后续可能重下，离线/源可用性未知 |
| pip HTTP-v2 响应体 | 默认 cache 的56hex/5级hex布局，且有配对metadata | 只删body、保留metadata，后续缓存miss；可能需重下 |

目录/文件名格式不是内容或可丢弃性证明。至少7天、本人普通文件、单链接、安全权限/ACL/祖先和稳定身份才可能入选；最多8个对象。有本机精确详情供 owner 私下查看，路径不进入模型或公开报告。媒体/文档、整个worktree、聚合类别、Mole clean/purge范围仍阻塞/人工复核。

你明确批准私有对象表中同一新鲜方案的精确行（不是主答讨论选项编号）后，Agent 绑定同一个方案，先只读预检，再在确有该精确批准时向等待中的 `--apply` helper 提交确认。方案10分钟且只允许一批，变更/过期/重复不能沿用批准。执行逐个复核并捕获到同卷私有恢复目录，检查对象和可见打开状态后才永久unlink所选文件。原名新对象、未选文件及Trash不处理；冲突/未知则恢复或保留，不自动重试。

成功没有自动备份。失败捕获/日志持久存于 **Application Support**，不在可被清扫的cache/temp里。恢复需另一次明确请求，且从不覆盖目的地新文件。仓库祖先（Home自身是仓库也包括）、共享权限、链接、跨卷、未知打开状态和自定义布局均保护；不放宽条件来制造成功。

报告区分被移除对象的原分配字节、卷可用空间前/后及差值；APFS共享/延迟、打开引用、并发和本工具记录开销使物理归因未知，实际可归因释放保持null。删除/记录异常、部分失败、恢复保留均逐行说明。

## 证据与限制

本轮简化主答、分离完整证据，并明确暂停尚未安全验证的 purge 运行；见 [简洁报告与暂停说明](evidence/concise-report-purge-pause.md)。前次把占用、预览与建议分开，并用实际保存的脱敏输入做私下报告对照；[证据组织修复记录](evidence/evidence-ledger-repair.md) 区分通过、失败与未运行项。保存输入/报告不公开，新 status 仅做源码与 fixture 验证，本轮未重新扫描主机。

最新 MacBook 实际审核尚未达到用户目标；本次按已批准 Mole-first 方向修复，真实验收仍待 Jim。历史测试不证明当前可用或模型效果一致。见 [本次具体证据修复](evidence/specific-evidence.md)、[前次证据](evidence/mole-first-harness.md)、[精确执行证据](evidence/precise-cache-execution.md) 和 [MacBook验证](MACBOOK-VERIFY.md)。

四个 core 来源仍为 Mole analyze、clean/purge 预览及 worktree 清单；另加受保护官方 status 的系统卷容量/已用/差额投影，只核验1.72结构，失败保持 UNKNOWN，不输出进程/用户信息。默认共享300秒总预算，为 core 预览保留时间；来源耗时之和不是墙钟。原始数据在本地有界 spool，既有写入/网络边界不变。未知版本不升级。PARTIAL 不统一等于唯一字节下界；独立清单不是已完成 Git 安全检查；不同范围/度量不相减。目录用途不是内容分类；未知项不猜测，worktree 整体永不删除。

当前 purge 在版本/帮助/预览子进程启动前明确暂停（`purge_lifecycle_unverified`），候选 UNKNOWN，不是零或成功。官方 timeout 后端会创建独立子进程组，隔离 fixture 证明当前外层取消方式不能覆盖所有后代；TERM 宽限也不是充分修复。实验性 mktemp 路由已撤回，原 4 MiB 单文件及写入/网络边界不变。其他来源继续独立报告，不能因此宣称所有来源的全部后代生命周期已经证明。本轮未满足 purge 成功目标，#70 保持打开。

精确执行是普通并发下的有限复核与经过fixture验证的进程崩溃恢复，不是恶意同UID隔离、未来永无写入保证或断电一致性证明。真实MacBook清理验收仍待owner逐行决定；#70保持打开。

环境：本地macOS12+、Codex、Homebrew、Node22.20+/npm/npx、Python3.9+；精确adapter还需系统rename/ACL API与可信`/usr/sbin/lsof`。不安装前置工具、不提权、不改系统权限。自定义缓存位置不自动跟随。

维护者本地检查（不要求用户亲自运行）：

```sh
python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -v
IS_CLEAN_RUN_NATIVE_LSOF_FIXTURE=1 IS_CLEAN_RUN_NATIVE_EXECUTION_FIXTURE=1 python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -v
python3 -B examples/is-clean-my-mac/tests/check_runtime_boundary.py
```

native测试只操作自建一次性fixture；CLI测试仅将账户home解析替换为fixture，生产控制流、确认、native文件操作和lsof保持真实。默认跳过的native测试不能当作PASS。实际skill-creator validator和独立确切head审查另行记录；不运行/开启远程CI，不宣称普遍模型一致。

原创wrapper/精确adapter采用仓库[MIT](../../LICENSE)。[Mole](https://github.com/tw93/Mole)及官方Skill是独立[GPL-3.0](https://github.com/tw93/Mole/blob/V1.72.0/LICENSE)依赖，不vendor/fork。这里不复制Mole删除引擎或操作其私有函数。

详情文件的本机可读/大小/hash 已检查不等于客户端点击成功；临时报告不保证永久保留。当前生命周期调查与边界见 [精确候选与 purge 限制](evidence/decision-candidates-lifecycle-limits.md)。
