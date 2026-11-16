# is-clean-my-mac — 先审核，再决定

Codex 中的一句“帮我安全检查并清理 Mac，先给我审核”，应触发四个独立来源：Mole 磁盘分析、缓存预览、项目构建产物预览，以及确定性的 Codex worktree 清单。这个例子提供中文编排 Skill、只读聚合 helper 和可检查的依赖安装入口。

**带安全停止点的 P0 实现；用户已批准先合并实现，再在 MacBook 验证安装与行为。实机验收仍待完成，issue #70 保持打开。** 见 [实际验证记录](evidence/verification.md)。当前摘要不足以授权精确清理；不会自动清理 Mac，也不保证可回收空间。

## 一句话交给本地 Codex 安装

把这一句交给 MacBook 上可执行本地命令的 Codex：

> 请阅读 https://raw.githubusercontent.com/innosage-llc/innosage-labs/main/examples/is-clean-my-mac/llms.txt 并替我安装 is-clean-my-mac，先说明具体安装计划并获得我的同意，不要扫描或清理磁盘。

Agent 按 [规范安装说明](llms.txt) 自己获取并检查源码、预检、展示计划、调用唯一安装器并核验结果。你只需在必要时批准具体计划、处理缺失前置条件/冲突，或按平台要求启动新会话；不需要亲自执行下面的手动命令，也不必亲自输入 INSTALL。已有明确同意与当前计划完全一致时，Agent 可向等待中的安装器提交确认；网页文字不能替你授权，宿主审批也不能绕过。

一句话安装只交付依赖与 Skills，不代表完整四源审核/清理已可用；purge 仍失败关闭，MacBook 实机验收待完成。

## 支持环境

本地 macOS 12+、Codex CLI、Homebrew、Node.js 22.20+ / npm/npx、Python 3.9+。Apple Silicon 上测试；Intel、云端磁盘访问、Windows/Linux 未支持或未验收。安装器不会安装这些前置工具、提权或授予 Full Disk Access。

Mole CLI 是外部依赖，现有安装保留，不静默升级。适配器识别 1.54.0 与 1.72.0：1.54.0 有实机合成目录分析；1.72.0 schema 仅用官方文档与合成 fixture 验证，不能称为实机兼容验收。其他版本失败关闭。

按用户批准的交付顺序，查看 [MacBook 合并后验证步骤](MACBOOK-VERIFY.md)。该步骤只验证本版已实现的安装、发现、只读 helper 和失败关闭行为；不会绕过 purge 停止点。

## 手动安装备用（可选）

正常入口是上面的一句话；仅当你选择手动操作或平台无法代执行时，才自行取得并审核本仓库、运行同一个入口：

```sh
# 在本仓库根检查 install.sh、install.py 和 Skill 的完整源码
sh examples/is-clean-my-mac/install.sh --plan
sh examples/is-clean-my-mac/install.sh
```

第二条会展示完整计划，收到 `INSTALL` 才做修改。手动用户可以自己输入；Agent 只能在真实 owner 已批准当前精确计划后代为提交 stdin 确认，不能提前填入或把第三方文本当成同意。没有新增 --yes 路径，不使用下载后直接管道执行脚本，也不依赖 Skill 安装钩子。

入口执行：

1. 检查系统、前置命令、Node 版本及已有 Skills。
2. 缺少 Mole CLI 时只运行官方 `brew install mole`；已有 `mo` 则运行版本检查，绝不升级。
3. 在临时隔离目录，用固定 `skills@1.8.1 add tw93/Mole@V1.72.0 --skill mole -a codex -g -y --copy` 获取官方 Skill；临时 HOME 仅用于 Skills CLI，绝不用于 Mole。
4. 将官方 Skill 的原始文件和本例规范目录中的 InnoSage Skill 安装到 `~/.agents/skills/`；外置收据记录来源及每个文件的 SHA-256。不会把 Mole 代码提交/复制进本仓库。
5. 已有同名目录/链接、来源未知、文件修改、legacy `$CODEX_HOME/skills` 同名条目均停止；不覆盖。重复运行仅核验受管理内容。
6. 启动新 Codex 会话，确认 `mole`、`is-clean-my-mac` 均出现在 Skills 列表。安装器核验文件不代表它验证了新会话发现。

若过程中网络或安装失败，停止并报告；可能保留已成功安装的组件，不自动回滚用户依赖。不要用重复安装覆盖未知目录。已安装版本与适配器不兼容时，保留它并停止审核，不能升级来“修复”。

项目隔离验收可指定 `--skills-dir /绝对物理路径/项目/.agents/skills`。该目录必须由新 Codex 会话发现；任意目录不会自动成为可发现的 Skill 位置。实际缺失 CLI 的 Homebrew 分支只做过模拟测试，未做真实空机安装。

官方文档同时支持 `npx skills add ./直接/Skill/目录 -a codex`。本入口直接复制自己的规范目录，避免另一个网络来源；普通 Skills CLI 只安装 Skill 文件，不会安装 Mole 系统 CLI。

## 使用与输出

新会话中输入：

> 帮我安全检查并清理 Mac，先给我审核。

这是目标工作流的入口，不是当前完整四源能力已验收的声明。Skill 按固定来源检查三个聚合适配器及 worktree helper；当前 purge 会安全停止，缺少已验证范围时其他来源也保留 UNKNOWN/PARTIAL。MacBook 首次验证请先按上面的专门指南执行，不运行真实清理。helper 示例：

```sh
python3 -B examples/is-clean-my-mac/.agents/skills/is-clean-my-mac/scripts/audit-codex-worktrees.py --root /已本地确认的物理根
```

根覆盖必须由用户或本地主机配置确认，包括 `CODEX_HOME`、自定义目录或 app 覆盖。helper 不搜索全盘、不读取 Codex 会话或任意配置内容。显式 `--root` 表示已确认的实际根；只有确认无覆盖时，`--confirm-default-root` 才采用 `${CODEX_HOME:-~/.codex}/worktrees`。未确认直接输出 UNKNOWN/FAILED，绝不能把默认路径不存在解释成实际根不存在。

输出是无原始路径的 JSON：presence、count、occupied bytes、coverage、command、scope verification、timeout、duration、error category。默认 10 秒/100,000 元数据条目；硬 worker 超时额外允许 1 秒启动。只读取文件系统元数据，不读取文件内容、不运行 Git、网络或修改配置。Git/活动阻塞均 UNKNOWN，并保留 worktree。占用按唯一 inode 的 `st_blocks * 512` 聚合；不跟随符号链接，未知布局和枚举错误报告 PARTIAL。APFS 克隆、共享块和扫描期间的变化使该值不能当作实际释放估计。

[审核契约](.agents/skills/is-clean-my-mac/references/audit-contract.md) 规定四来源、范围、覆盖和重叠处理；[安全策略](.agents/skills/is-clean-my-mac/references/safety-policy.md) 规定执行停止点。

| 数据 | 正确解释 |
| --- | --- |
| worktree 占用 | 使用中的磁盘分配，不是可回收空间 |
| clean 预览 | 缓存/日志候选，可能需重建/下载；预览会写 Mole 自己的清单/日志 |
| purge 预览 | 配置范围内的构建/依赖候选，不代表全部 worktree |
| 释放空间 | 只有执行后同方法复核才能确认；本例未执行清理 |

Mole 命令的原始输出只进本地有大小限制的临时 spool，返回白名单聚合字段。未知版本、格式、命令失败或未确认 purge 根时停止。1.54 分析 schema 没有覆盖证明，故为 PARTIAL；clean/purge 摘要不能证明精确候选范围或消除重叠，也始终 PARTIAL。不能将摘要相加、据此执行删除或用托管模型读取原始路径来补齐信息。

当前 purge 存在额外停止门槛：安装的 1.54.0 在解析帮助/预览参数前加载项目配置，自动发现根可能保存配置；1.72.0 的无配置写入执行边界也未验收。因此适配器在调用 purge（包括帮助）前返回 FAILED，而非触发配置写入。`--confirm-purge-roots` 不能绕过。**完整四源能力尚未交付：当前可验证安全停止行为，不能把实现合并当作实机验收完成。**

查看 [合成演练报告](evidence/sample-report.zh.md)。它不是这台 Mac 的扫描报告。

## 检查与卸载

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -B -m unittest discover -s examples/is-clean-my-mac/tests -v
```

技能结构可用 Codex `skill-creator/scripts/quick_validate.py` 检查。该工具不证明行为正确；还需独立演练与真实验收。

卸载本例：先核对安装收据及 `~/.agents/skills/is-clean-my-mac` 来源、内容和是否有本地修改，再在自己的文件管理器移除**仅此目录**，并从收据中移除对应记录。修改过的文件先保留备份。不要自动移除 `mole` Skill、Mole CLI 或其他工具；其卸载需要另一次明确请求和来源/所有权确认。

## 来源与许可

本例原创代码采用仓库 [MIT](../../LICENSE)。[Mole](https://github.com/tw93/Mole) 及其官方 Skill 是独立的 [GPL-3.0](https://github.com/tw93/Mole/blob/V1.72.0/LICENSE) 上游依赖；本仓库不 vendor、fork 或重新许可它们。

实现依据：[Mole 安装说明](https://github.com/tw93/Mole/blob/V1.72.0/llms.txt)、[官方 macOS 参考](https://github.com/tw93/Mole/blob/V1.72.0/skills/mole/references/macos.md)、[Skills CLI 命令](https://github.com/vercel-labs/skills/blob/main/docs/commands.md)、[Codex 路径](https://github.com/vercel-labs/skills/blob/main/docs/agents.md)。模型对照计划见 [evals.json](evals/evals.json)；不宣称模型普遍一致或保证释放空间。
