# 合成演练报告（不是你的 Mac 的扫描结果）

这是实际执行 helper 与模型合成演练后的脱敏样例；Mole clean/purge 数据来自明确标记的合成 fixture。

| 来源 | 大小 | 覆盖与说明 |
| --- | --- | --- |
| Mole analyze | 8,192 字节 | 合成观察；1.54 schema 无完整覆盖证明，PARTIAL |
| Mole clean preview | 1 MB（1,000,000 字节）候选估计 | 合成摘要，PARTIAL；不是确认可删除范围 |
| Mole purge preview | 1 MB（1,000,000 字节）候选估计，另有未测量项 | 合成摘要，PARTIAL；实机调用目前被配置写入边界阻止 |
| Codex worktree helper | 正常 fixture：1 个，12,288 字节 | 合成根 COMPLETE；这是占用，不是可回收量 |

这些类别可能重叠，不能相加。确认候选总量、实际释放空间、废纸篓变化均为 UNKNOWN。worktree 的活动、dirty、untracked、ignored、unpushed、detached、locked 状态均 UNKNOWN，全部保留。

缓存可能需要重建，依赖目录可能需要重新下载；精确成本和副作用尚未确认。真实 clean 预览可能写 Mole 自己的预览清单/日志；真实清理可能永久删除，且官方文档指出 clean 涉及废纸篓。当前没有授权或执行任何真实清理，也不提出整体 worktree 删除建议。

下一步先解除 [验证记录](verification.md) 的具体门槛，再用实际、已脱敏、精确范围的官方预览让用户审核。不能用“清理一下”或本合成评估提示替代删除授权。
