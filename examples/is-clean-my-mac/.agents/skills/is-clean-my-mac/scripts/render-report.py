#!/usr/bin/env python3
"""Deterministic Chinese report from redacted aggregate schemas only."""
LABELS = {
 'home': '用户目录', 'user_library': '用户 Library', 'applications': '应用程序',
 'system_library': '系统 Library', 'other': '其他/未分类', 'logs': '日志',
 'caches': '缓存', 'homebrew_cache': 'Homebrew 缓存', 'xcode_derived_data': 'Xcode DerivedData',
 'xcode_simulators': 'Xcode 模拟器', 'xcode_archives': 'Xcode 归档',
 'ios_backups': 'iOS 备份', 'old_downloads': '旧下载', 'container_data': '容器数据',
 'developer_caches': '开发工具缓存', 'app_caches': '应用缓存',
 'build_and_dependencies': '构建/依赖占用', 'user_caches_and_logs': '用户缓存/日志',
 'browser_caches': '浏览器缓存', 'cloud_and_office_caches': 'Cloud/Office 缓存',
 'app_utilities': '应用工具', 'system_caches': '系统缓存', 'external_volume': '外部卷',
 'node_modules': 'Node 依赖', '.build': 'Swift 构建', 'build': '构建产物',
 'target': '构建 target', 'dist': '构建 dist', '.next': 'Next 构建', '.nuxt': 'Nuxt 构建',
 'vendor': 'vendor 依赖', 'Pods': 'CocoaPods 依赖', 'other_build_artifacts': '其他构建产物'}
SOURCES = {'mole-analyze': 'Mole analyze', 'mole-clean': 'Mole clean 预览',
           'mole-purge': 'Mole purge 预览', 'codex-worktree-inventory': 'Codex worktree 清单'}
STATUS = {'COMPLETE': 'COMPLETE', 'PARTIAL': 'PARTIAL', 'FAILED': 'FAILED',
          'PRESENT': 'PRESENT', 'ABSENT': 'ABSENT', 'UNKNOWN': 'UNKNOWN',
          'METADATA_SNAPSHOT': '元数据快照'}
REASONS = {
 'upstream_reports_complete': '上游报告范围内完成', 'coverage_or_extension_unverified': '覆盖/扩展字段未完全验证',
 'preview_summary_only_scope_and_overlap_unverified': '预览范围/重叠尚未精确验证',
 'stderr_present_preview_may_be_incomplete': '运行有诊断，预览可能不完整',
 'runtime_sandbox_initialization_denied': '宿主不允许嵌套 sandbox；仅可申请同一受保护 helper 的宿主审批',
 'guarded_version_command_failed': '受保护版本检查失败', 'command_timeout': '达到时间上限',
 'preview_parent_not_physical': '预览物理父目录未就绪；不自动修复配置',
 'preview_target_not_regular': '预览目标为链接/非受支持文件，已保护',
 'preview_not_fresh_or_bounded': '预览不新鲜或超出大小边界', 'preview_not_published': '未得到新预览',
 'unsupported_mole_version_no_upgrade_attempted': '版本不受支持；未升级',
 'write_boundary_unavailable': '写入拒绝边界不可用', 'command_failed': '受保护命令失败',
 'scan_unavailable': '扫描不可用', 'unrecognized_output': '核心输出形状未知',
 'source_process_failed_or_timed_out': '来源进程失败或超时'}


def number(value):
    return str(value) if type(value) is int and value >= 0 else 'UNKNOWN'


def size(value):
    if type(value) is not int or value < 0:
        return 'UNKNOWN'
    return f'{value:,} B（约 {value / 1000**3:.3f} GB）'


def risk(category):
    if category in ('ios_backups', 'old_downloads', 'xcode_archives', 'container_data', 'xcode_simulators'):
        return '可能是唯一备份/个人数据/容器或模拟器状态；仅复核，恢复保障未知'
    if category in ('xcode_derived_data', 'build_and_dependencies', 'node_modules', '.build', 'build', 'target', 'dist', '.next', '.nuxt', 'vendor', 'Pods', 'other_build_artifacts'):
        return '可能需要重新编译或下载依赖；活动任务、网络与重建耗时未知'
    if category in ('caches', 'homebrew_cache', 'developer_caches', 'app_caches', 'user_caches_and_logs', 'browser_caches', 'cloud_and_office_caches', 'app_utilities', 'system_caches', 'logs'):
        return '可能重新下载/登录/重建，日志可能用于排障；先确认活动应用和离线需求'
    return '仅占用证据，不推导可删除空间；需要精确范围与用途复核'


def render(data):
    sources = {s.get('source'): s for s in data.get('sources', []) if isinstance(s, dict) and s.get('source') in SOURCES}
    lines = ['# Mac 磁盘审核与清理计划', '',
      '仅审核；本次未执行清理。实际释放：UNKNOWN（null）。来源及 insight 可能重叠，禁止相加；整个 worktree 不属于候选。', '',
      '| 来源 | 覆盖 | 范围验证 | 占用/已测下界 | 候选舍入估算 | 说明 |',
      '| --- | --- | --- | --- | --- | --- |']
    for name, label in SOURCES.items():
        s = sources.get(name, {})
        occupied = size(s.get('occupied_bytes'))
        if s.get('occupied_bytes') is None and type(s.get('observed_allocated_bytes')) is int:
            occupied = '至少 ' + size(s['observed_allocated_bytes'])
        reason = REASONS.get(s.get('reason'), '见独立覆盖/计数状态；未测量不当作零')
        lines.append(f"| {label} | {STATUS.get(s.get('completeness'), 'UNKNOWN')} | {'已验证本次范围' if s.get('scope_verified') is True else '未验证完整范围'} | {occupied} | {size(s.get('candidate_estimate_bytes'))} | {reason} |")
    wt = sources.get('codex-worktree-inventory', {})
    lines += ['', '## Codex workspace/worktree', '',
      f"- 保存的本机 workspace 根数量：{number(wt.get('workspace_count'))}；覆盖：{STATUS.get(wt.get('workspace_count_completeness'), 'UNKNOWN')}。仅本机保存根列表，未扫描这些 workspace。",
      f"- worktree 数量：{number(wt.get('worktree_count'))}；数量覆盖：{STATUS.get(wt.get('worktree_count_completeness'), 'UNKNOWN')}；已观察数量下界：{number(wt.get('observed_worktree_count'))}。",
      f"- worktree 占用：{size(wt.get('occupied_bytes'))}；已测分配字节下界：{size(wt.get('observed_allocated_bytes'))}；字节覆盖：{STATUS.get(wt.get('completeness'), 'UNKNOWN')}。",
      '- 其他主机/自定义根覆盖 UNKNOWN；Git、活动、未推送、未跟踪/忽略内容等阻塞均 UNKNOWN，保留所有 worktree。', '',
      '## 类别与候选证据', '', '| 来源 | 类别 | 已测大小/下界 | 条目 | 风险与恢复成本 |', '| --- | --- | --- | --- | --- |']
    rows = 0
    for name in ('mole-analyze', 'mole-clean', 'mole-purge'):
        for group in sources.get(name, {}).get('categories', []):
            if not isinstance(group, dict):
                continue
            key = group.get('category')
            key = key if isinstance(key, str) and key in LABELS else 'other'
            value = group.get('observed_bytes') if name == 'mole-analyze' else group.get('observed_candidate_estimate_bytes')
            count = group.get('measured_entries') if name == 'mole-analyze' else group.get('candidate_entries')
            uncertainty = '' if group.get('completeness') == 'COMPLETE' else '（PARTIAL/下界）'
            lines.append(f"| {SOURCES[name]} | {LABELS[key]} | {size(value)}{uncertainty} | {number(count)} | {risk(key)} |")
            rows += 1
    if not rows:
        lines.append('| UNKNOWN | 未获得类别证据 | UNKNOWN | UNKNOWN | 不据此推测候选或零占用 |')
    lines += ['', '## 建议顺序', '',
      '1. 先复核已测缓存/构建类别和本地官方预览的精确条目、活动任务及离线需求；候选估算不等于确定可回收空间。',
      '2. 有备份/容器/归档/下载占用时先核对用途与恢复保障；不凭大小或年龄删除。worktree 全部保留。',
      '3. 对 FAILED/PARTIAL 来源保留未知范围；仅解决准确的依赖、宿主审批或受支持边界问题，不扩大权限或直接重跑裸 Mole。',
      '4. 若以后要清理，另行审核官方支持操作、精确范围、不可恢复成本并逐项取得 owner 同意。本版到计划为止。', '',
      'clean 可能创建/更新精确的本地 clean-list 预览；主机缓存、日志、配置写入及提权由运行边界拒绝。恢复成本是类别常见影响，实际下载大小/耗时、备份及活动状态未验证。', '']
    return '\n'.join(lines)
