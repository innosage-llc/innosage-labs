---
name: is-clean-my-mac
description: 在本地 macOS Codex 中安全检查磁盘和 Codex worktree；用于“帮我安全检查并清理 Mac，先给我审核”等请求。编排官方 Mole 和只读清单，先报告、再逐项审批。
---

# is-clean-my-mac

先审核，再由用户决定。读取 [审核契约](references/audit-contract.md) 和 [安全策略](references/safety-policy.md)。

1. 预检本地 macOS、`mo --version`、当前会话可用的官方 `mole` Skill。缺依赖即停止，指向本例安装入口；文件已安装而会话未发现时，请用户启动新会话。读取官方 Mole Skill 及对应 macOS 参考；命令语义以安装版本的帮助为准，不能假设最新版兼容。
2. 固定四个独立来源：Mole analyze、clean dry-run、purge dry-run、随附 worktree 清单。不得因模型认为“已覆盖”而跳过任何来源。执行前遵守下述本地隐私边界。
3. 在本机确认 Codex 实际 worktree 根（包括 CODEX_HOME、自定义配置或主机覆盖）。运行 `python3 -B <本 Skill>/scripts/audit-codex-worktrees.py --root <已验证绝对物理根>`。没有已验证根时直接运行 helper，报告 UNKNOWN；不能猜路径、递归搜索整个用户目录或把找不到当作零。只有已确认没有主机覆盖，才可用 `--confirm-default-root`。
4. 按契约逐源报告，解释缓存重建、依赖下载、活动任务与恢复成本。worktree 占用不是可回收空间。Git 阻塞状态 UNKNOWN 是保护状态。
5. 给出中文审核表，等待用户批准当前精确候选范围内的官方支持操作。仅讨论检查或泛称“清理”不是删除授权。不能安全限定范围就停止。评估始终只读/预览，任何评估提示都不授权删除。
6. 实际操作后，用相同测量方法复核，分别报告估算、实际释放、移入废纸篓及失败/跳过项；不自动重试跳过项。

## 本地数据边界

原始 Mole JSON/预览含私人路径；不要直接调用会把 stdout/stderr 返回托管模型的 shell 工具。使用本 Skill 的 `scripts/audit-mole.py --source analyze`、`--source clean`、`--source purge --confirm-purge-roots`，分别调用固定的只读/预览命令，在本地临时 spool 聚合后仅返回白名单字段。purge 根必须先由用户/本地主机验证，不能猜测后传确认参数。clean 预览会写 Mole 自己的预览/日志文件，提前说明此副作用。

适配器仅支持 Mole 1.54.0/1.72.0 的固定 schema（1.54 有实机合成目录测试，1.72 仅有官方文档与合成 fixture 验证）；版本或格式不认识就 FAILED，不升级或猜测。当前版本输出不能证明所有扫描覆盖或精确候选范围，适配器保守报告 PARTIAL；不允许用该摘要授权真实清理。要执行精确清理，须在用户自己的终端审核官方完整预览及精确支持范围，或另行交付已验证的本地范围适配器。不要用模型阅读原始输出充当脱敏器，不声称 PARTIAL 是完整审核。见示例 README 的验证记录。

## 当前 purge 停止门槛

实机安装的 Mole 1.54.0 在解析 purge 的帮助/预览参数前加载项目配置；首次自动发现可能写配置。随附适配器因此在调用 purge（含帮助）前返回 `purge_configuration_write_boundary_unverified`。1.72.0 的无配置写入边界亦未实机验收，不冒险调用。该来源为 FAILED；本例目前无法完成真实四源审核。不能用确认根参数绕过、修改配置或宣称空结果。只有另行验证无配置写入的运行边界后才能解除此门槛。
