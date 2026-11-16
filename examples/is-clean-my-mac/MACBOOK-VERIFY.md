# MacBook：一句话安装与可选验证

用户已选择先交付 main 上的实现，再在 MacBook 做安装与行为验证。**实现交付不等于 issue #70 验收完成。** 当前可以验证依赖安装、Skill 发现、合成只读清单和 purge 失败关闭；完整四源审核仍受上游配置写入边界限制，需要后续产品工作，不能通过换一台 Mac 或加一个确认参数解除。

## 默认入口：交给 Agent 执行

在 MacBook 的本地 Codex 中只发这一句：

> 请阅读 https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt 并替我安装 is-clean-my-mac，先说明具体安装计划并获得我的同意，不要扫描或清理磁盘。

由 Agent 阅读 [llms.txt](llms.txt)，自行获取安全检出、检查源码、预检并展示当前安装计划。若你尚未明确同意该精确范围，回复是否同意；同意后由 Agent 向等待中的安装器提交 INSTALL 并继续核验。无需你亲自输入 INSTALL 或逐项执行本页命令。缺少前置工具、来源冲突、凭据/平台能力不足时，Agent 应说明具体原因和最小必要交接，不应把整份手动清单退给你。

Agent 的正常结果应简短说明三个组件的安装/保留状态、CLI 版本、两个 Skills 的新会话发现状态及准确剩余问题。安装过程中不运行任何磁盘扫描、预览或清理来证明成功。若平台必须由你启动新会话，只需要这一个必要交接；文件存在不等于已验证发现。

以下是自愿核验或排障时的手动备用，不是正常一句话安装的必做步骤。

## 手动备用 1：获取 main 并检查源码、前置条件及计划

在自己的终端创建一个新检出，避免影响现有项目：

```sh
git clone --branch main https://github.com/innosage-llc/innosage-labs.git innosage-labs-verification
cd innosage-labs-verification
git rev-parse HEAD
uname -m
sw_vers -productVersion
```

核对 HEAD 与交付时提供的 main SHA。若目标目录已经存在，clone 会停止；不要 reset、覆盖或删除现有检出。

需要本地 macOS 12+、Codex CLI、Homebrew、Node.js 22.20+ / npm/npx、Python 3.9+。已有 Apple Silicon 合成测试；Intel 实机兼容未验收。Homebrew 本身还需要满足其当前系统要求。缺少前置工具时，安装入口会停止并给出具体提示，不会代装它们、提权或更改系统权限。

```sh
less examples/is-clean-my-mac/install.sh
less examples/is-clean-my-mac/install.py
less examples/is-clean-my-mac/.agents/skills/is-clean-my-mac/SKILL.md
sh examples/is-clean-my-mac/install.sh --plan
```

`--plan` 应不安装、不扫描、不清理。检查计划中的来源和目标：官方 Mole Skill 固定来自 `tw93/Mole@V1.72.0`，Skills CLI 固定为 1.8.1，本例 Skill 来自当前规范目录。

预期冲突行为：同名 Skill 来源未知、已修改、目标为符号链接或存在 legacy 同名 Skill 时停止；不覆盖。请先核对所有权，不要删除/重命名未知内容来强行通过。现有 Mole CLI 应保留，不能为制造“首次安装”结果而卸载它。未知 CLI 版本在运行时应停止，不升级或降级来绕过适配器。

## 手动备用 2：明确同意安装，并验证重复运行

只有在你审核并同意计划后运行：

```sh
sh examples/is-clean-my-mac/install.sh
```

手动运行时在提示处输入 `INSTALL`；委托 Agent 时，Agent 可在你已明确批准当前精确计划后提交这一确认，无需你亲自键入。不得在真正批准前自动填入、伪造同意或绕过宿主审批。这仅覆盖展示的依赖安装，不同意磁盘扫描或清理。

- Mole CLI 缺失时，安装器运行官方 `brew install mole`；此真实缺失分支此前仅有模拟覆盖，等待你的 MacBook 验证。
- Mole CLI 已存在时仅检查版本，保留现有安装；该情况不能算作缺失分支验收。
- 官方 Skill 通过官方 Skills CLI 获取；本例不包含上游 GPL 源码副本。
- 默认安装到 `~/.agents/skills/`，旁边的收据记录来源与文件哈希。网络或中途失败时停止，可能保留已成功安装的组件；不自动回滚或移除依赖。

再次运行同一入口，应核验已有受管理文件，不重复下载/安装，不升级 CLI、不重复创建 Skill：

```sh
sh examples/is-clean-my-mac/install.sh
```

若发现本地修改或来源冲突，停止是预期行为。不要要求安装器覆盖来“修复”它。

## 手动备用 3：启动全新的本地 Codex 会话

结束旧会话，按你平时的方式在本地 Codex CLI 启动新会话。确认可用 Skills 列表同时包含：

- `mole`
- `is-clean-my-mac`

可以只问：

> 仅根据当前会话的 Skills 列表，确认是否有 mole 和 is-clean-my-mac。不要运行命令、磁盘审计或清理。

文件存在不等于当前会话已发现。若其中一个缺失，先停在发现问题，不运行原始 Mole 命令作为替代。无需把登录信息、令牌或原始安装日志发给模型。

## 手动备用 4：验证只读 helper 与不确定性护栏

从仓库根运行合成 fixture 测试：

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -v
```

当前预期 27 个测试通过，包括独立 `du` 尺寸比对、配置默认/自定义根、缺失根、权限拒绝模拟、预算/超时、符号链接交换、重复 inode、隐私输出、未知状态和安装冲突。测试创建自己的临时合成 fixture，不扫描你的真实 worktree 或清理真实数据。

再运行未提供已验证根的 helper：

```sh
python3 -B examples/is-clean-my-mac/.agents/skills/is-clean-my-mac/scripts/audit-codex-worktrees.py
```

**预期退出码 2**，`presence` 为 `UNKNOWN`，`completeness` 为 `FAILED`，数量/占用为 `null`，原因是根配置未验证。它不能搜索用户目录或猜测默认路径后报告零。真实根必须先在本机确认，包括 CODEX_HOME 和主机自定义覆盖；本指南不替你猜根。

有实际根的后续只读测试仍只能把 `occupied_bytes` 当作占用。全部活动/Git 阻塞 UNKNOWN 必须保留，整个 worktree 不能成为删除候选。

## 手动备用 5：验证 purge 安全停止，不直接运行上游 purge

**不要直接运行上游 purge，连帮助和 dry-run 也不能当作无配置写入的安全检查。** 已检查的 Mole 在解析参数前加载项目配置，缺少可用配置时可能自动发现并保存根；它还可能初始化日志。当前示例没有经过验证的无配置写入隔离边界。

只验证本例的适配器停止行为：

```sh
python3 -B examples/is-clean-my-mac/.agents/skills/is-clean-my-mac/scripts/audit-mole.py --source purge
```

预期退出码 2，`completeness=FAILED`，候选/实际释放为 `null`：

- CLI 1.54.0 / 1.72.0：`reason=purge_configuration_write_boundary_unverified`，在任何上游 purge 帮助/预览调用前停止。
- 其他版本：`reason=unsupported_mole_version_no_upgrade_attempted`，更早停止。
- CLI 不可用或预检失败：同样失败关闭；不能把它解释为空结果。

该适配器会读取 CLI 版本，但不调用上游 purge/help。测试套件还有独立回归断言。确认根参数不能绕过停止点；不要改 Mole 配置、替换 HOME、改代码或手动运行上游命令来“通过”这一步。

## 可记录的结果与仍不能验收的部分

本地记录架构、系统/CLI/Node/Python 版本、测试通过数、两个 Skill 是否被新会话发现、安装/重复运行是否符合计划，以及上述两种停止状态。仅分享这些聚合结果；原始 Mole JSON、预览清单、路径、文件名、仓库名和个人日志留在本机。

| 现在可以验证 | 仍待完成 |
| --- | --- |
| 前置条件、计划、明确安装同意、冲突保护和重复运行 | Mole 原本已安装时，真实缺失 CLI 安装分支仍未验证 |
| 新会话发现两个 Skills | 一句中文触发完整真实四源审核尚未验证 |
| 合成 helper 计数/占用、未知/部分状态、无原始路径输出 | 真实配置范围、精确候选范围、来源重叠和实际完整覆盖 |
| purge 在危险初始化前停止 | 可在无配置写入边界内执行的官方 purge 能力，需要后续产品工作 |

本文没有让你运行真实 clean 预览、完整磁盘审核或任何清理。Mole clean 预览会写自己的清单/日志；其原始输出也不应直接进入托管模型。未测量的实际释放必须是 UNKNOWN/null，不能填写 0 或从 worktree 占用推算。issue #70 保持打开以跟踪这些真实验收与能力缺口；合并实现不会将它们标为通过。
