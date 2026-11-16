#!/usr/bin/env python3
"""Deterministic Chinese report from redacted aggregate schemas only."""
LABELS = {
 'downloads': '下载目录', 'documents': '文档目录', 'pictures': '图片/图库目录',
 'movies': '视频目录', 'music': '音乐目录', 'desktop': '桌面',
 'application_support': '应用支持数据', 'developer_data': '开发工具数据',
 'codex_data': 'Codex 数据', 'virtual_machines': '虚拟机数据',
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
 'drilldown_failed_or_timed_out': '官方目录下钻失败或超时，保留顶层测量',
 'source_process_failed_or_timed_out': '来源进程失败或超时'}
REASONS.update(output_encoding_invalid='输出编码无法识别，保留已知退出/诊断',
               upstream_no_candidates_scope_unverified='官方本次范围未找到候选；完整范围未验证',
               installed_help_incompatible='本版本帮助与固定参数不兼容',
               preflight_command_or_data_boundary_failed='预检/数据边界失败；具体根因未验证')


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


FILE_TYPES = {'video':'视频', 'images':'图片/照片', 'audio':'音频', 'documents':'文档/文本',
 'spreadsheets':'表格', 'archives_installers':'压缩包/安装镜像', 'databases':'数据库',
 'virtual_disks':'虚拟磁盘', 'source_and_config':'源码/配置', 'compiled':'编译文件/二进制',
 'other_or_no_extension':'其他/无已知扩展名'}
CONTEXTS = {'application_bundles':'应用包内文件', 'photo_libraries':'照片图库内文件',
 'virtual_machine_packages':'虚拟机包内文件', 'cache_directories':'约定缓存目录内文件',
 'build_and_dependency_directories':'约定构建/依赖目录内文件', 'other_directories':'其他目录内文件'}
DIAGNOSTICS = {'sandbox_initialization_denied':'sandbox 初始化被宿主拒绝',
 'shell_temporary_file_denied':'观察到 shell 临时文件被拒绝', 'permission_denied':'观察到权限拒绝',
 'operation_not_permitted':'观察到操作不允许', 'read_only_filesystem':'观察到只读文件系统',
 'dependency_not_found':'观察到缺少命令', 'storage_exhausted':'观察到空间不足',
 'project_discovery_incomplete':'观察到项目发现不完整', 'artifacts_skipped':'观察到候选被跳过',
 'upstream_preview_incomplete':'上游标记预览不完整', 'terminated_by_signal':'进程被信号终止',
 'unclassified_nonzero_exit':'非零退出，未识别具体原因', 'command_timeout':'达到时间上限',
 'executable_or_file_missing':'命令或文件不存在', 'os_operation_failed':'本地 OS 操作失败'}


def failure_detail(source):
    stage = {'preflight':'预检','version':'版本','help':'帮助','audit':'审核','preview_readback':'预览回读'}.get(source.get('command_stage'))
    code = source.get('command_exit_code')
    parts = [REASONS.get(source.get('reason'), '未测量/覆盖未知；未推测原因')]
    if stage:
        parts.append('阶段：' + stage)
    if type(code) is int:
        parts.append('退出码：' + str(code))
    markers = source.get('diagnostic_categories', [])
    if isinstance(markers, list):
        parts += [DIAGNOSTICS[x] for x in markers if isinstance(x, str) and x in DIAGNOSTICS]
    return '；'.join(parts)


def file_type_report(data):
    value = data if isinstance(data, dict) else {}
    coverage = STATUS.get(value.get('completeness'), 'UNKNOWN')
    lines = ['## 什么类型的文件占空间', '',
      f"本机 Home 目录元数据枚举：{coverage}；已测 {number(value.get('observed_file_count'))} 个普通文件，分配占用 {size(value.get('observed_allocated_bytes'))}，逻辑大小 {size(value.get('observed_logical_bytes'))}。",
      '这是独立的文件名扩展名/stat 测量，不是 Mole 类别推断；不读文件内容，不能验证文件真实格式。排除系统目录、其他用户、外部卷和链接目标。PARTIAL 只描述已测子集，比例不代表整个磁盘。', '',
      '| 文件类型 | 已测分配占用 | 逻辑大小 | 文件数 | 占已测分配字节 | 计划中的处理边界 |',
      '| --- | --- | --- | --- | --- | --- |']
    rows = 0
    for row in value.get('categories', []):
        if not isinstance(row, dict) or not isinstance(row.get('category'), str) or row['category'] not in FILE_TYPES:
            continue
        key = row['category']
        percent = row.get('percent_of_observed_allocated')
        percent = f'{percent:.2f}%' if type(percent) in (int, float) and 0 <= percent <= 100 else 'UNKNOWN'
        action = ('可能含 VM/数据库或应用状态；先用所属应用确认用途和备份' if key in ('databases','virtual_disks')
                  else '可能需重新获取安装源；先核对用途/重复与恢复方式' if key == 'archives_installers'
                  else '可能是个人内容或唯一副本；仅凭类型/体积不删除')
        lines.append(f"| {FILE_TYPES[key]} | {size(row.get('allocated_bytes'))} | {size(row.get('logical_bytes'))} | {number(row.get('file_count'))} | {percent} | {action} |")
        rows += 1
    if not rows:
        lines.append('| UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 未获得类型测量，不推测为零 |')
    lines += ['', '同一批已测文件的目录用途维度（不能与上表或 Mole 相加）：', '',
              '| 目录用途 | 已测分配占用 | 文件数 |', '| --- | --- | --- |']
    for row in value.get('contexts', []):
        if isinstance(row, dict) and isinstance(row.get('category'), str) and row['category'] in CONTEXTS:
            lines.append(f"| {CONTEXTS[row['category']]} | {size(row.get('allocated_bytes'))} | {number(row.get('file_count'))} |")
    lines += ['', f"未能读取的条目：{number(value.get('unavailable_entries'))}；跳过的链接：{number(value.get('skipped_symlinks'))}；扫描的元数据条目：{number(value.get('enumerated_entries'))}。APFS 克隆/共享块不等于可实际释放字节。", '']
    return lines


def render(data):
    sources = {s.get('source'): s for s in data.get('sources', []) if isinstance(s, dict) and s.get('source') in SOURCES}
    lines = ['# Mac 磁盘审核与清理计划', '',
      '仅审核；本次未执行清理。实际释放：UNKNOWN（null）。来源及 insight 可能重叠，禁止相加；整个 worktree 不属于候选。', '']
    if 'file_type_inventory' in sources.get('mole-analyze', {}):
        lines += file_type_report(sources['mole-analyze']['file_type_inventory'])
    lines += ['## 四源覆盖与候选', '',
      '| 来源 | 覆盖 | 范围验证 | 占用/已测下界 | 候选舍入估算 | 说明 |',
      '| --- | --- | --- | --- | --- | --- |']
    for name, label in SOURCES.items():
        s = sources.get(name, {})
        occupied = size(s.get('occupied_bytes'))
        if s.get('completeness') != 'FAILED' and s.get('occupied_bytes') is None and type(s.get('observed_allocated_bytes')) is int:
            occupied = '至少 ' + size(s['observed_allocated_bytes'])
        reason = failure_detail(s)
        lines.append(f"| {label} | {STATUS.get(s.get('completeness'), 'UNKNOWN')} | {'已验证本次范围' if s.get('scope_verified') is True else '未验证完整范围'} | {occupied} | {size(s.get('candidate_estimate_bytes'))} | {reason} |")
    wt = sources.get('codex-worktree-inventory', {})
    lines += ['', '## Codex workspace/worktree', '',
      f"- 保存的本机 workspace 根数量：{number(wt.get('workspace_count'))}；覆盖：{STATUS.get(wt.get('workspace_count_completeness'), 'UNKNOWN')}。仅本机保存根列表，未扫描这些 workspace。",
      '- workspace 元数据无法识别时只保留该数量 UNKNOWN；有本机 app 标记和物理 worktrees 根可独立枚举，不把格式变化当作没有 worktree。',
      f"- worktree 数量：{number(wt.get('worktree_count'))}；数量覆盖：{STATUS.get(wt.get('worktree_count_completeness'), 'UNKNOWN')}；已观察数量下界：{number(wt.get('observed_worktree_count'))}。",
      f"- worktree 占用：{size(wt.get('occupied_bytes'))}；已测分配字节下界：{size(wt.get('observed_allocated_bytes') if wt.get('completeness') != 'FAILED' else None)}；字节覆盖：{STATUS.get(wt.get('completeness'), 'UNKNOWN')}。",
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
            uncertainty = (('' if group.get('completeness') == 'COMPLETE' else '（PARTIAL/已测子集）')
                           if name == 'mole-analyze' else '（PARTIAL/舍入估算，可能重叠）')
            lines.append(f"| {SOURCES[name]} | {LABELS[key]} | {size(value)}{uncertainty} | {number(count)} | {risk(key)} |")
            rows += 1
    if not rows:
        lines.append('| UNKNOWN | 未获得类别证据 | UNKNOWN | UNKNOWN | 不据此推测候选或零占用 |')
    lines += ['', '## 建议顺序', '',
      '1. 先复核已测缓存/构建类别和本地官方预览的精确条目、活动任务及离线需求；候选估算不等于确定可回收空间。',
      '2. 有备份/容器/归档/下载占用时先核对用途与恢复保障；不凭大小或年龄删除。worktree 全部保留。',
      '3. 对 FAILED/PARTIAL 来源保留未知范围；仅解决准确的依赖、宿主审批或受支持边界问题，不扩大权限或直接重跑裸 Mole。',
      '4. 若以后要清理，另行审核官方支持操作、精确范围、不可恢复成本并逐项取得 owner 同意。本版到计划为止。', '',
      'clean 可能创建/更新精确的本地 clean-list 预览；主机缓存、日志、配置写入及提权由运行边界拒绝。诊断标记只是观察到的文本/退出状态，不能单独证明根因。恢复成本是类别常见影响，实际下载大小/耗时、备份及活动状态未验证。', '']
    return '\n'.join(lines)


def render_summary(data, plan):
    """Numbered core answer delivered inline; no file click required for types."""
    sources = {s.get('source'):s for s in data.get('sources',[]) if isinstance(s,dict) and s.get('source') in SOURCES}
    types = sources.get('mole-analyze',{}).get('file_type_inventory',{})
    lines = ['## Mole 磁盘占用与候选决策表', '',
      f"方案 {plan['plan_id'][:12]}，10 分钟有效。占用来自官方 Mole；目录用途是固定路径规则的解释，不是文件内容/可删除性证明。下钻与父项重叠，不能相加；PARTIAL 为已测下界。", '',
      '| 行 | 类型/候选 | 占用或候选估算 | 条目数 | 风险/恢复与操作 |', '| --- | --- | --- | --- | --- |']
    for row in plan['rows']:
        key = row['category']
        if row['source']=='precise-cache' and row.get('actionable') is True:
            kind={'precise_homebrew_bottle':'Homebrew bottle下载缓存','precise_pip_http_body':'pip HTTP响应缓存'}.get(key,'UNKNOWN')
            token=row.get('scope_tokens',['UNKNOWN'])[0][:8]
            label='可执行：'+kind+' · 对象 '+token
            value='原分配 '+size(row.get('occupied_bytes'))
            decision='永久删除；可能需重下/离线不可用；'+number(row.get('age_days'))+'天，执行时复核'
        elif row['source']=='file-type-metadata':
            label = '文件类型：' + FILE_TYPES.get(key,'其他/未知')
            value = '已测占用 ' + size(row.get('occupied_bytes'))
            decision = '仅复核；可能个人/唯一内容，先核对用途与备份'
        elif row['source'] in ('mole-analyze', 'mole-analyze-drilldown'):
            label=('Mole 下钻：' if row['source']=='mole-analyze-drilldown' else 'Mole 占用：')+LABELS.get(key,'其他/未分类')
            value='已测占用/下界 '+size(row.get('occupied_bytes'))
            decision='仅复核；'+risk(key)
        elif row['source']=='codex-worktree-inventory':
            label='Codex worktree';value='占用 '+size(row.get('occupied_bytes'));decision='保留；Git/活动未知，禁止整棵删除'
        else:
            label=SOURCES.get(row['source'],'UNKNOWN')+'：'+LABELS.get(key,'无可执行范围')
            value='候选约 '+size(row.get('candidate_estimate_bytes'))
            decision='仅复核；可能重下/重建，当前官方命令无法精确选择本行'
        lines.append(f"| {row['row_id']} | {label} | {value} | {number(row.get('observed_count'))} | {decision} |")
    if not plan['rows']:
        lines.append('| — | UNKNOWN | UNKNOWN | UNKNOWN | 无可靠测量，不构造可批准操作 |')
    precise=plan.get('precise_collection',{})
    if precise:
        labels={'precise_runtime_unavailable':'本机精确执行运行时不可用，转人工','repository_protected':'祖先为仓库，保留','unsafe_directory':'目录权限不安全，保留',
                'mole_protection_configuration_present':'存在Mole保护配置，转人工',
                'mole_protection_configuration_present_or_unverifiable':'Mole保护状态无法验证，转人工',
                'custom_cache_overrides_uncovered':'自定义缓存位置未覆盖','candidate_budget_exhausted':'精确候选枚举达到预算',
                'candidate_display_limit':'只展示最多8个精确对象','precise_candidate_collection_failed':'精确候选收集失败',
                'cache_root_unavailable_or_unsafe':'默认缓存根不可用/不安全','candidate_entry_unavailable_or_unsafe':'部分候选不可用/不安全'}
        reasons=[labels[x] for x in precise.get('reasons',[]) if isinstance(x,str) and x in labels]
        lines += ['', '精确对象覆盖：'+STATUS.get(precise.get('completeness'),'UNKNOWN')+'；'+('；'.join(reasons) if reasons else '仅两个固定默认布局，未入选不表示没有缓存')+'。']
    wt=sources.get('codex-worktree-inventory',{})
    lines += ['', f"Codex workspace {number(wt.get('workspace_count'))}；worktree {number(wt.get('worktree_count'))}（数量 {STATUS.get(wt.get('worktree_count_completeness'),'UNKNOWN')}）；已测分配下界 {size(wt.get('observed_allocated_bytes') if wt.get('completeness')!='FAILED' else None)}（字节 {STATUS.get(wt.get('completeness'),'UNKNOWN')}）。", '',
      '| 来源 | 覆盖/准确失败信息 |', '| --- | --- |']
    for name,label in SOURCES.items():
        source=sources.get(name,{})
        lines.append(f"| {label} | {STATUS.get(source.get('completeness'),'UNKNOWN')}；{failure_detail(source)} |")
    for detail in sources.get('mole-analyze',{}).get('drilldowns',[]):
        label=LABELS.get(detail.get('scope_label'),'未分类目录')
        lines.append(f"| Mole 下钻（{label}） | {STATUS.get(detail.get('completeness'),'UNKNOWN')}；{failure_detail(detail)} |")
    actionable=any(row.get('actionable') for row in plan['rows'])
    explanation=('仅标记“可执行”的独立下载缓存对象支持按本方案编号批准：永久删除，无成功后的自动备份；格式按目录/文件名约定识别，不保证内容。失败捕获仅用于回退/保留恢复。其他行仍只复核；绝不扩大到整类、未选对象、Trash或worktree。每个方案只能执行一批，后续需新方案。'
                 if actionable else '当前行是复核证据，**均没有已验证的精确清理操作**。即使回复“同意第 1、2 行”，也不能改为 mo clean 或 purge --yes；它们会扩大范围，可能涉及未批准的 Trash/新候选。需要具体受支持对象并重新核验范围，才能开启执行。')
    lines += ['', explanation,
      '本次未清理；实际释放 UNKNOWN（null），估算/占用/磁盘可用空间不混用；来源与目录用途可能重叠，不相加。先复核最大占用用途/备份，缓存与构建候选再确认活动任务、下载/编译成本。', '']
    return '\n'.join(lines)
