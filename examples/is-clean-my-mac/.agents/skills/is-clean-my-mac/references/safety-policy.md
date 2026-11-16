# 安全策略

- 本例不是清理引擎。Mole 的官方 Skill 是命令语义和版本安全规则的权威；仅缩小其候选范围，不扩展。
- 安装同意只覆盖已展示的依赖安装计划，不覆盖任何扫描、清理或系统权限更改。
- 禁止整体删除 worktree、原始删除命令、force/remove/prune、移动真实数据、清空废纸篓、提权、Full Disk Access、配置更改。年龄、合并、分支名、干净状态都不能证明可删除。
- 活动/未知、dirty、untracked、ignored、unpushed、detached、locked 均保留。helper 的 UNKNOWN 不可被模型推断改为安全。
- 评估中禁止真实 `mo clean`、`mo purge`、`mo optimize`、`mo uninstall`、`mo installer`、`mo slim`；只允许已验证的分析/预览，且先确保本地脱敏边界。
- 缺失依赖、版本帮助不兼容、根覆盖未知、无法脱敏、无法精确限定操作时停止；展示准确的剩余门槛。
- 不读取源代码、文档、对话或凭据来审核磁盘。发布只用合成 fixtures 或已审核的聚合证据。
- 操作授权必须对应当前候选、范围、命令、副作用和不可恢复成本。交互选择/权限操作交给用户自己的终端，不通过自定义删除规避。
