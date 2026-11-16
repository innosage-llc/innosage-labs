# 安全策略

- Mole 的官方 Skill 约束其命令语义与版本；Mole 本身仅使用官方支持表面。新授权的独立精确 adapter 是另一个窄范围能力，不伪装为 Mole 执行。
- 安装同意只覆盖已展示的依赖安装计划，不覆盖任何扫描、清理或系统权限更改。
- 禁止整体删除 worktree、原始 shell 删除、force/remove/prune、清空废纸篓、提权、Full Disk Access、配置更改。除已获逐行同意的精确 adapter 内部捕获/恢复外，不移动真实数据。年龄、合并、分支名、干净状态都不能证明可删除。
- 活动/未知、dirty、untracked、ignored、unpushed、detached、locked 均保留。helper 的 UNKNOWN 不可被模型推断改为安全。
- 评估中禁止真实 `mo clean`、`mo purge`、`mo optimize`、`mo uninstall`、`mo installer`、`mo slim`；只允许已验证的分析/预览，且先确保本地脱敏边界。
- 缺失依赖、版本帮助不兼容、根覆盖未知、无法脱敏、无法精确限定操作时停止；展示准确的剩余门槛。
- 不读取源代码、文档、对话或凭据来审核磁盘。发布只用合成 fixtures 或已审核的聚合证据。
- 操作授权必须对应当前候选、范围、命令、副作用和不可恢复成本。Mole 交互选择按官方规则交给用户终端；独立 adapter 的 stdin 确认仅可在真实 owner 批准后由 Agent 提交，不能伪造同意或改用其他删除路径。

- 新明确授权仅允许随附精确 adapter 在真实 owner 逐行批准后处理两类单文件下载缓存。原始 shell 删除和宽范围 Mole 仍禁止；不因失败改用其他删除路径。
- 开发/fixture 批准不授权真实用户缓存处理。成功永久删除无备份，批准前必须说明。状态、私有清单、恢复映射不进入模型；用户可本地查看。
- 未选文件、Trash、新替代对象、整棵 worktree 和未知状态均保留。过程崩溃恢复不等于已证明断电/恶意同 UID 隔离。
