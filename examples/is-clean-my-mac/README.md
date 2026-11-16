# is-clean-my-mac — 先审核，再决定

中文 Codex Skill，编排官方 Mole 与确定性本地清单。目标请求：

> 全面审核我的 Mac 磁盘，给我清理计划，先不要清理。

当前目标是**对话中直接展示编号的文件类型/候选决策表**，不能只链接报告或给总占用。Mole overview 不提供完整文件类型统计，因此随附 30 秒有界、只读 Home 文件名/stat 枚举，给出视频、图片、文档、压缩包、数据库、虚拟盘等已测子集；不读取内容、不把 Home 子集称作全盘。

**精确编号清理仍受上游能力阻塞。** Mole 1.72 的 clean 无类别/路径选择器且会重新扫描（可能涉及未批准 Trash），purge --yes 作用于所有适合候选。当前编号行全部 review-only；用户批准编号不能授权宽范围命令。随附方案绑定/新鲜度/范围/重叠检查只会返回准确阻塞与前后可用空间观察，不执行真实清理。需要官方 manifest + selected-ID apply 接口后才能启用；详见 [第二轮修复证据](evidence/file-type-and-row-repair.md)。

固定审核四源：磁盘类别占用、clean 缓存预览、purge 构建/依赖预览、Codex workspace/worktree 清单。原始私人路径留在本机，模型只收到聚合 JSON。不会清理用户文件，也不把 worktree 占用当作可回收空间。

## 一句话安装或更新

在 MacBook 本地 Codex 输入：

> 请阅读 https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt 并替我安装或更新 is-clean-my-mac，先说明具体计划并获得我的同意，不要扫描或清理磁盘。

Agent 自行获取新检出、检查源码、预检、展示计划并调用唯一安装器。网络受宿主限制时，包括首次 URL 获取，必须走准确范围的宿主审批，不能关闭安全机制。你只需批准必要计划或处理缺失前置条件、真实冲突；不需要自己执行清单或输入 INSTALL。

已有 Mole CLI 和官方 Skill 保留，不升级。未知来源、修改、符号链接、legacy 同名 Skill 冲突停止。旧的受管理 InnoSage Skill 可用 `--update-managed --plan` 检查更新；明确同意后使用相同入口和参数，旧文件保留在 Skills 目录外的唯一备份，收据更新。不会覆盖已有源码检出或绕过本地修改保护。

安装成功后启动新 Codex 会话，发现 `mole` 与 `is-clean-my-mac`，再发送上面的同一句审核请求。使用 Luna 的原有设置即可；不要求更长提示词或更高推理预算。

## 当前证据与限制

Jim 已在 MacBook 验证过现有 Mole 1.72.0 保留、两个 Skill 安装及新会话发现；旧版真实审核暴露了 schema、根发现与预览可用性问题。本次修复提供可选字段兼容、固定公开类别、clean 新鲜清单聚合、自动本地根发现、独立数量覆盖及四源统一入口。确定性 renderer 直接返回简短编号类型/候选表与准确失败信息，完整报告/聚合证据/绑定方案另存新建本地文件，避免长重复 JSON 掩盖核心答案。**修复实现合并不等于 MacBook 端到端验收，issue #70 保持打开。** 见 [修复证据](evidence/p0-audit-repair.md) 与 [最小验证交接](MACBOOK-VERIFY.md)。

Mole 1.72.0 官方发行 analyzer 的 SHA-256 已核对，并在 8 KiB 合成目录运行；不是对用户全盘结果的保证。适配器支持 1.54.0/1.72.0，其他版本失败关闭，不升级。未知扩展保留已知测量但标 PARTIAL，核心格式无法识别则 FAILED。

Mole 原生 analyze 即使 JSON 模式也会尝试修剪 analyzer 缓存，purge 在解析帮助前也可能保存配置。因此所有 Mole 调用（包括版本/帮助）必须经过随附的 macOS sandbox：禁止网络、主机缓存/日志/配置写入和提权；只允许私有 scratch 与 `/dev/null`，clean 额外仅允许精确的 `~/.config/mole/clean-list.txt` 预览文件。HOME 保持真实值。clean 的物理父目录不存在、目标是链接/硬链接，或边界无法启动时停止该来源，不修复配置/权限、不直接重跑 Mole。Apple Bash 的临时回退需要拒绝固定系统临时根 metadata，导致的受阻结果保留 PARTIAL/FAILED。

purge 可在此写入拒绝边界内尝试官方 dry-run；未经验证的运行时自动发现范围仍 scope_verified=false/PARTIAL，不推测根数、不把候选数当根数。完整官方 clean/purge 运行仍需 MacBook 验证；若实际运行受阻，准确保留失败，不扩大允许写入范围。

## 环境与维护者检查

本地 macOS 12+、Codex CLI、Homebrew、Node.js 22.20+ / npm/npx、Python 3.9+、可用的 macOS sandbox-exec。Intel 未验收。安装器不会代装这些前置工具、提权或授予 Full Disk Access。首次缺少 CLI 的 Homebrew 安装分支仍只有模拟测试，不要求卸载现有 Mole 来制造验收。

手动备用是同一个入口：`sh examples/is-clean-my-mac/install.sh --plan`，批准后去掉 `--plan`；受管理更新同时加 `--update-managed`。没有 --yes 捷径。宿主网络或 sandbox 审批不能被 INSTALL 替代。

维护者本地检查：

```sh
python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -v
python3 -B examples/is-clean-my-mac/tests/check_runtime_boundary.py
```

第二条只做合成系统调用证明，不运行 Mole；嵌套 sandbox 受限时需宿主支持的精确命令审批。Skill 还使用 skill-creator 的 `quick_validate.py` 检查结构。详细行为约束见 [审核契约](.agents/skills/is-clean-my-mac/references/audit-contract.md) 与 [安全策略](.agents/skills/is-clean-my-mac/references/safety-policy.md)。不做远程 CI、不宣称普遍模型一致。

## 来源与许可

本例原创代码采用仓库 [MIT](../../LICENSE)。[Mole](https://github.com/tw93/Mole) 及官方 Skill 是独立 [GPL-3.0](https://github.com/tw93/Mole/blob/V1.72.0/LICENSE) 依赖，不 vendor、fork 或重新许可。官方 Skill 由固定 `skills@1.8.1` 从 `tw93/Mole@V1.72.0` 获取；本例只有一份规范 Skill 和一个安装器。
