# is-clean-my-mac — Mole-first 中文磁盘审核

在本地 Codex 中输入：

> 全面审核我的 Mac 磁盘，给我清理计划，先不要清理。

官方 Mole Skill 负责解释磁盘和清理规则；薄 harness 补齐四源覆盖、隐私聚合和 Codex worktree 清单。Agent 在对话直接展示编号表：主要目录用途/占用、缓存和构建候选、数量/覆盖、风险和准确失败原因。默认 analyze 总计最多八次（一次顶层加七次下钻），在原有总时间预算内沿固定公开工具布局渐进测量 Codex worktrees/会话、Colima、Android 等；会话/worktree 只用父级测量，不枚举其子目录，不做 Home 扩展名普查，也不准备删除对象。占用不是可回收；审核不清理。

## 安装或更新

> 请阅读 https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt 并替我更新 is-clean-my-mac，先说明具体计划并获得我的同意，不要扫描或清理磁盘。

Agent 获取新检出、检查源码和唯一安装器，展示具体计划并在 owner 同意后操作；无需你亲自输入 INSTALL 或执行清单。保留现有 Mole CLI/官方 Skill，不升级。受管理 wrapper 用 `--update-managed --plan` 检查，再以同样标志/批准确认更新，事务期间保留临时回滚；新wrapper和收据验证提交后，仅退役该事务内未改动的旧受管理副本，不再积累永久新备份。既有历史备份不处理，也不只因备份目录存在就把它报告成当前活动版本；[更新机制与上游对比](evidence/managed-update-lifecycle.md)。未知/修改/链接/legacy 冲突停止。中断时普通安装停止；Agent用同一入口的 `--recover-update --plan` 展示回滚/完成事务计划，获同意后处理，不运行包命令。未知或改动的部分副本保留诊断；仅与清单匹配的剩余子集可在恢复同意后处理。初始 URL/网络或宿主执行限制只能走准确范围审批，不关闭安全机制。

更新后启动新会话发现两个 Skills，使用上面原来的短审核句即可。安装同意不授权任何缓存处理。

## 可选精确缓存流程（不在默认审核路径）

仅当用户另行要求审阅精确下载缓存对象时，Agent 加载可选流程并生成新方案。默认聚合编号全部复核/阻塞，批准这些编号不能触发宽范围 Mole 命令。已有范围由 owner 明确批准开发：独立 InnoSage adapter 处理两个固定默认布局的单文件对象，**不通过 Mole 宽范围删除**：

| 可执行类别 | 严格范围 | 批准前应理解 |
| --- | --- | --- |
| Homebrew bottle 下载包 | 默认 downloads 直属、64hex前缀及 bottle archive 命名 | 永久删除；后续可能重下，离线/源可用性未知 |
| pip HTTP-v2 响应体 | 默认 cache 的56hex/5级hex布局，且有配对metadata | 只删body、保留metadata，后续缓存miss；可能需重下 |

目录/文件名格式不是内容或可丢弃性证明。至少7天、本人普通文件、单链接、安全权限/ACL/祖先和稳定身份才可能入选；最多8个对象。有本机精确详情供 owner 私下查看，路径不进入模型或公开报告。媒体/文档、整个worktree、聚合类别、Mole clean/purge范围仍阻塞/人工复核。

你明确回复“同意第1、2行”后，Agent 绑定同一个方案，先只读预检，再在确有该精确批准时向等待中的 `--apply` helper 提交确认。方案10分钟且只允许一批，变更/过期/重复不能沿用批准。执行逐个复核并捕获到同卷私有恢复目录，检查对象和可见打开状态后才永久unlink所选文件。原名新对象、未选文件及Trash不处理；冲突/未知则恢复或保留，不自动重试。

成功没有自动备份。失败捕获/日志持久存于 **Application Support**，不在可被清扫的cache/temp里。恢复需另一次明确请求，且从不覆盖目的地新文件。仓库祖先（Home自身是仓库也包括）、共享权限、链接、跨卷、未知打开状态和自定义布局均保护；不放宽条件来制造成功。

报告区分被移除对象的原分配字节、卷可用空间前/后及差值；APFS共享/延迟、打开引用、并发和本工具记录开销使物理归因未知，实际可归因释放保持null。删除/记录异常、部分失败、恢复保留均逐行说明。

## 证据与限制

最新 MacBook 实际审核尚未达到用户目标；本次按已批准 Mole-first 方向修复，真实验收仍待 Jim。历史测试不证明当前可用或模型效果一致。见 [本次具体证据修复](evidence/specific-evidence.md)、[前次证据](evidence/mole-first-harness.md)、[精确执行证据](evidence/precise-cache-execution.md) 和 [MacBook验证](MACBOOK-VERIFY.md)。

四源仍为 Mole analyze、clean/purge预览及worktree清单。原始Mole数据在本地有界spool，内层边界阻止主机cache/config/log写入，clean仅可更新精确预览。Mole支持1.54.0/1.72.0，未知版本不升级。目录用途来自固定元数据规则，不是内容分类；未知项不猜测。不把Home当全盘、占用当可回收、不同维度/来源相加。worktree整体永不删除。

purge 在官方1.72受保护运行中仍可失败；本次真实复现了临时文件/写入拒绝及存储错误文本，不能据此声称磁盘真的已满或已确定 Jim 的原因。不得移除边界、写配置或假报零候选。其他源继续呈现，下钻失败保留顶层证据。

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
