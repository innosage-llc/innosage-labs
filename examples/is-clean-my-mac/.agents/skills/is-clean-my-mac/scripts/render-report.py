#!/usr/bin/env python3
"""Deterministic Chinese report from redacted aggregate schemas only."""
LABELS = {
 'summary_only': '上游预览总览（分类未知）', 'downloads': '下载目录', 'documents': '文档目录', 'pictures': '图片/图库目录',
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
LABELS.update(codex_worktrees='Codex worktrees', codex_sessions='Codex 会话记录', colima_data='Colima 虚拟机/容器数据', android_data='Android 工具数据', android_sdk='Android SDK', android_emulators='Android 模拟器')
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
REASONS.update(capacity_snapshot='官方系统卷容量快照（差额口径）', capacity_schema_unverified='容量结构/根卷身份未验证', shared_budget_exhausted='共享总预算不足，来源未执行', output_encoding_invalid='输出编码无法识别，保留已知退出/诊断',
               purge_lifecycle_unverified='purge 预览已暂停：子进程取消边界未验证，未启动命令',
               upstream_purge_preview_incomplete='官方 purge 预览明确不完整，保留已观察候选而非完整结果',
               upstream_no_candidates_with_diagnostics='本次范围未观察到候选但有诊断，不代表无清理潜力',
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
    if category in ('codex_sessions','codex_worktrees','colima_data','android_emulators'):
        return '可能包含唯一历史、未推送工作或设备/卷状态；先保留，恢复保证未知'
    if category == 'android_sdk':
        return '可能需重新下载 SDK；项目依赖、离线可用性与耗时未知'
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
      '| 来源 | 覆盖 | 范围验证 | 已报告占用（不同口径） | 候选舍入估算 | 说明 |',
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
            if name == 'mole-analyze' and count == 0 and group.get('unknown_entries',0) > 0:
                value = count = None
            uncertainty = (('' if group.get('completeness') == 'COMPLETE' else '（PARTIAL/覆盖或重叠未知）')
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


def render_evidence_table(data, plan):
    """Numbered core answer delivered inline; no file click required for types."""
    sources = {s.get('source'):s for s in data.get('sources',[]) if isinstance(s,dict) and s.get('source') in SOURCES}
    types = sources.get('mole-analyze',{}).get('file_type_inventory',{})
    lines = ['## Mole 磁盘占用与候选决策表', '',
      f"方案 {plan['plan_id'][:12]}，10 分钟有效。占用来自官方 Mole；目录用途是固定路径规则的解释，不是文件内容/可删除性证明。下钻与父项重叠，不能相加；PARTIAL 可能是覆盖不足、舍入或重叠未知，不能统一称下界。", '',
      '| 行 | 类型/候选 | 占用或候选估算 | 条目数 | 风险/恢复与操作 |', '| --- | --- | --- | --- | --- |']
    for row in plan['rows']:
        key = row['category']
        if row['source']=='precise-cache' and row.get('actionable') is True:
            kind={'precise_homebrew_bottle':'Homebrew bottle下载缓存','precise_pip_http_body':'pip HTTP响应缓存'}.get(key,'UNKNOWN')
            token=row.get('scope_tokens',['UNKNOWN'])[0][:8]
            label='精确待决策：'+kind+' · 对象 '+token
            value='原分配 '+size(row.get('occupied_bytes'))
            decision='永久删除无备份；可能需重下/离线不可用；'+number(row.get('age_days'))+'天不是删除理由；活动 UNKNOWN，保留需求待定，执行前复核与单独批准'
        elif row['source']=='file-type-metadata':
            label = '文件类型：' + FILE_TYPES.get(key,'其他/未知')
            value = '已测占用 ' + size(row.get('occupied_bytes'))
            decision = '仅复核；可能个人/唯一内容，先核对用途与备份'
        elif row['source'] in ('mole-analyze', 'mole-analyze-drilldown'):
            label=('Mole 下钻：' if row['source']=='mole-analyze-drilldown' else 'Mole 占用：')+LABELS.get(key,'其他/未分类')
            value='已测占用/下界 '+size(row.get('occupied_bytes'))+'（'+STATUS.get(row.get('completeness'),'UNKNOWN')+'）'
            decision=next_step(key)
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


def next_step(category):
    """Useful review routes are not execution capabilities or deletion consent."""
    return {
      'codex_worktrees': '保留整棵 worktree；独立清单仅提供数量/分配字节，活动/未提交/未推送安全检查尚未完成',
      'codex_sessions': '会话历史可能唯一；在 Codex 中核对保留需求，未读会话内容，不自动删除',
      'codex_data': '优先看 worktrees 与会话子项；父子重叠，不能相加或视为可回收',
      'colima_data': '在 Colima/Docker 官方工具核对实例与卷用途/备份；可能含唯一数据，不直接删目录',
      'android_sdk': '在 Android Studio SDK Manager 核对不用的版本；需要重下，先确认项目依赖',
      'android_emulators': '在 Android Studio Device Manager 核对虚拟设备；设备数据可能丢失，先确认备份',
      'android_data': '核对 SDK/模拟器子项与项目需求；不直接删工具目录',
      'xcode_derived_data': '确认 Xcode 构建已停并评估重编译成本；按官方工具核对具体对象',
      'caches': '与 clean 预览分类交叉核对；先确认活动应用和离线需求，可能重下/重建',
    }.get(category, '仅复核；' + risk(category))


PUBLIC_SCOPE_IDS = {'public:' + name for name in (
    'home','user_library','applications','system_library','codex_home','codex_worktree_root',
    'codex_sessions_root','codex_archived_sessions_root','colima_home','android_library',
    'android_sdk_root','android_home','android_avd_root','library_caches','developer_library',
    'xcode_library','xcode_derived_data_root')}


def evidence_ledger(data, plan):
    """Measurements, interpretation and authorization remain separate fields."""
    sources = {s.get('source'): s for s in data.get('sources', []) if isinstance(s, dict)}
    contexts = []
    analyze = sources.get('mole-analyze', {})
    for source, scope, parent in [(analyze, 'overview', None)] + [
            (d, d.get('scope_id') if d.get('scope_id') in PUBLIC_SCOPE_IDS else 'UNKNOWN_legacy_scope',
             d.get('parent_scope') if d.get('parent_scope') in PUBLIC_SCOPE_IDS | {'overview'} else 'UNKNOWN')
            for d in analyze.get('drilldowns', [])]:
        for group in source.get('categories', []):
            contexts.append((group, source, scope, parent))
    analyze_context = iter(contexts)
    ledger = []
    for row in plan['rows']:
        name, key = row.get('source'), row.get('category')
        source = sources.get(name, {})
        scope, parent, group = 'UNKNOWN', None, {}
        if name in ('mole-analyze', 'mole-analyze-drilldown'):
            group, source, scope, parent = next(analyze_context, ({}, {}, 'UNKNOWN', None))
        elif name in ('mole-clean', 'mole-purge'):
            scope = name + ':preview'
        elif name == 'codex-worktree-inventory':
            scope = 'codex:inventory'
        stamp = source.get('observed_at_unix')
        if type(stamp) not in (int, float) or not 0 <= stamp <= 10**12:
            stamp = None
        preview = name in ('mole-clean', 'mole-purge')
        measurement = 'rounded_preview_estimate' if preview else 'independent_allocated_subset' if name == 'codex-worktree-inventory' else 'Mole_reported_occupied_bytes'
        amount = row.get('candidate_estimate_bytes') if preview else row.get('occupied_bytes')
        if name == 'codex-worktree-inventory' and amount is None:
            amount = source.get('observed_allocated_bytes') if source.get('completeness') != 'FAILED' else None
        if type(amount) is not int or amount < 0:
            amount = None
        contradictions = []
        if name in ('mole-analyze', 'mole-analyze-drilldown'):
            contradictions.append('overlapping_scopes_not_unique_total')
        if key in ('codex_worktrees', 'worktrees'):
            contradictions.append('Mole_and_inventory_scope_metrics_not_reconciled')
        if scope == 'public:home' or key == 'home':
            contradictions.append('overview_and_detail_coverage_not_reconciled')
        ledger.append(dict(evidence_id=row['row_id'], finding=LABELS.get(key, 'Codex worktree' if key == 'worktrees' else '其他/未知'),
            source=name if name in (*SOURCES, 'mole-analyze-drilldown', 'precise-cache', 'file-type-metadata') else 'UNKNOWN',
            source_command={'mole-analyze':'mo analyze --json', 'mole-analyze-drilldown':'mo analyze --json <verified public scope>',
                'mole-clean':'mo clean --dry-run','mole-purge':'mo purge --dry-run','codex-worktree-inventory':'bundled read-only inventory'}.get(name,'optional workflow'),
            category=key if key in LABELS or key == 'worktrees' else 'other', measured_size=amount,
            measurement_type=measurement, scan_completeness=STATUS.get(group.get('completeness', source.get('completeness')), 'UNKNOWN'),
            cleanup_coverage='aggregate_preview_only' if preview else 'not_established',
            recovery_cost=risk(key), overlap='UNKNOWN_may_overlap', contradictions=contradictions,
            recommended_next_step=next_step(key), scope_id=scope, parent_scope=parent,
            observation_time_unix=stamp, executable_authorization=False))
    for entry, row in zip(ledger, plan['rows']):
        evidence=row.get('decision_evidence')
        if row.get('source') == 'precise-cache' and isinstance(evidence, dict):
            entry.update(finding={'precise_homebrew_bottle':'Homebrew bottle 下载包','precise_pip_http_body':'pip HTTP 响应体'}.get(row['category'],'受支持缓存文件'),
                category=row['category'], measurement_type='exact_file_allocated_bytes',
                scope_id=evidence['candidate_id'], observation_time_unix=evidence['observed_at_unix'],
                scan_completeness=evidence['scan_completeness'], cleanup_coverage='one_manifest_bound_file_not_authorized',
                recovery_cost=evidence['recovery'], recommended_next_step=evidence['next_action'],
                decision_evidence=evidence)
    return ledger


def decision_guardrails(data):
    sources = {s.get('source'): s for s in data.get('sources', []) if isinstance(s, dict)}
    clean, purge = sources.get('mole-clean', {}), sources.get('mole-purge', {})
    return [
        'clean 的 ' + size(clean.get('candidate_estimate_bytes')) + ' 是上游摘要总计，不是本报告分类求和；PARTIAL/舍入/重叠未知，不保证实际释放。',
        'clean 会永久删除并重扫，可能清空未保护 Trash；没有按聚合编号选择的能力。聚合行没有精确对象范围，精确缓存行也没有删除授权，不能执行 broad clean、purge --yes 或整棵 worktree 删除。',
        'purge 保存的状态：' + STATUS.get(purge.get('completeness'),'UNKNOWN') + '；' + failure_detail(purge) + '。观察标记不是根因；不得改写成没有诊断或零候选。']


def render_summary(data, plan):
    if any(row.get('source') == 'file-type-metadata' for row in plan['rows']):
        return render_evidence_table(data, plan)
    sources = {s.get('source'): s for s in data.get('sources', []) if isinstance(s, dict)}
    ledger = evidence_ledger(data, plan)
    capacity = sources.get('mole-status', {})
    time_note = '部分/全部证据观察时点 UNKNOWN；这是保存记录，不能代表当前磁盘状态或沿用为执行批准。' if any(r['observation_time_unix'] is None for r in ledger) else '观察时点保留在 ledger；各来源不是原子快照，执行前仍需新鲜精确复核。'
    lines = [time_note, '', '## 必须保留的来源与执行边界', '', *decision_guardrails(data), '', '## 容量基线', '',
        '系统卷容量 ' + size(capacity.get('total_bytes')) + '；已用 ' + size(capacity.get('used_bytes')) + '；可用差额 ' + size(capacity.get('free_bytes')) + '。',
        '基线仅来自受保护的官方 status 同一卷 total − used；不是 Finder 含可清除空间的可用值。缺失保持 UNKNOWN。', '',
        '## 主要占用（不是清理优先级）', '',
        '| 证据 ID | 类型 | Mole 已观测字节 | 覆盖 |', '| --- | --- | --- | --- |']
    occupied = [r for r in ledger if r['source'] in ('mole-analyze','mole-analyze-drilldown')]
    specific = {'codex_worktrees','codex_sessions','colima_data','android_sdk','android_emulators','xcode_simulators','xcode_derived_data','container_data'}
    chosen = {}
    for row in occupied:
        key = row['category']
        if key in ('other','home','user_library','applications','system_library','codex_data','android_data'):
            continue
        score = (row['scan_completeness'] == 'COMPLETE', row['measured_size'] or 0)
        previous = chosen.get(key)
        if previous is None or score > (previous['scan_completeness'] == 'COMPLETE', previous['measured_size'] or 0):
            chosen[key] = row
    occupiers = sorted(chosen.values(), key=lambda r: (r['category'] in specific, r['measured_size'] or 0), reverse=True)
    for row in occupiers:
        lines.append(f"| {row['evidence_id']} | {row['finding']} | {size(row['measured_size'])} | {row['scan_completeness']} |")
    if not occupiers:
        lines.append('| — | 尚无可解释的分类 | UNKNOWN | UNKNOWN |')
    analyze = sources.get('mole-analyze', {})
    lines += ['', 'Mole overview 报告值 ' + size(analyze.get('occupied_bytes')) + '（' + STATUS.get(analyze.get('completeness'),'UNKNOWN') + '）；不是全盘已用或无条件唯一字节下界。']
    unknown = [r for r in occupied if r['category'] == 'other']
    if unknown:
        lines += ['', '未解释范围 Other（每条独立保留，可能嵌套；不合并、不据体积生成清理建议）：']
        lines += [f"- 证据 {r['evidence_id']}：{size(r['measured_size'])}；{r['scan_completeness']}；范围 {r['scope_id']}。" for r in unknown]
    lines += ['', '## 清理预览与已确认可执行潜力', '', '| 证据 ID | 预览类别 | 舍入候选估算 | 覆盖 |', '| --- | --- | --- | --- |']
    previews = [r for r in ledger if r['source'] in ('mole-clean','mole-purge') and r['measured_size'] is not None]
    for row in previews:
        lines.append(f"| {row['evidence_id']} | {row['finding']} | {size(row['measured_size'])} | {row['scan_completeness']}；仅聚合预览 |")
    clean = sources.get('mole-clean', {})
    lines += ['', 'Mole clean 预览总计：候选约 ' + size(clean.get('candidate_estimate_bytes')) + '（' + STATUS.get(clean.get('completeness'),'UNKNOWN') + '）。分类不额外加到总计；舍入、未测量和重叠使它不是保证或下界。',
        '已确认可精确执行的潜力 UNKNOWN：聚合行没有精确对象清单；如有严格缓存对象，其活动/保留仍待复核且没有删除授权。clean 永久删除并可能清空未保护 Trash；会重扫，不能按聚合行选择。purge --yes 也不能缩小到这些行。', '',
        '## 编号建议（证据、恢复成本与后悔风险优先）', '', '| 证据 ID | 建议 | 成本/保留理由 |', '| --- | --- | --- |']
    # Preview-backed review first, then preservation decisions for valuable data.
    # Other remains in its own coverage section and never displaces sessions/cache.
    recommendations = previews + [r for r in occupiers if r['category'] in specific]
    seen = set()
    for row in recommendations:
        key = (row['source'] if row in previews else 'occupancy',row['category'])
        if key in seen: continue
        seen.add(key)
        step = '先核对官方预览中具体范围及活动/离线需求；不执行聚合删除' if row in previews else row['recommended_next_step']
        lines.append(f"| {row['evidence_id']} | {row['finding']}：{step} | {row['recovery_cost']} |")
    wt = sources.get('codex-worktree-inventory', {})
    observed_count = wt.get('observed_worktree_count')
    lines += ['', '## 覆盖与矛盾', '',
        f"Codex workspace {number(wt.get('workspace_count'))}，workspace 覆盖 {STATUS.get(wt.get('workspace_count_completeness'),'UNKNOWN')}；worktree 精确数 {number(wt.get('worktree_count'))}，已观察数量 {number(observed_count)}；数量覆盖 {STATUS.get(wt.get('worktree_count_completeness'),'UNKNOWN')}。",
        '独立清单已测分配字节 ' + size(wt.get('observed_allocated_bytes') if wt.get('completeness') != 'FAILED' else None) + '；这是枚举子集，不能与 Mole 的目录字节相减来算缺口或可回收。Git/活动/未提交/未推送仍 UNKNOWN，清单不等于完成 Git 安全检查。',
        'overview 与 Home 下钻可能具有不同覆盖和时点；即使类别和等于 overview，也不证明不重叠。去重标签不证明范围互斥，不能相加，也不能跨父子/来源相减。PARTIAL 不统一解释为下界。', '',
        '| 来源 | 覆盖/失败 |', '| --- | --- |']
    for name, label in [('mole-status','Mole status 容量补充')] + list(SOURCES.items()):
        source = sources.get(name,{})
        lines.append(f"| {label} | {STATUS.get(source.get('completeness'),'UNKNOWN')}；{failure_detail(source)} |")
    if any(d.get('drilldown_budget_exhausted') for d in analyze.get('drilldowns', [])):
        lines.append('下钻覆盖 PARTIAL：达到调用/时间预算；已完成类别保留各自状态。')
    home_overview = [g.get('observed_bytes') for g in analyze.get('categories', []) if g.get('category') == 'home']
    home_details = [d.get('occupied_bytes') for d in analyze.get('drilldowns', []) if d.get('scope_label') == 'home']
    if home_overview and home_details:
        lines.append('Home overview 记录 ' + size(home_overview[0]) + '；Home 下钻记录 ' + size(home_details[0]) + '。覆盖/时点不一致尚未解释，不作算术调平。')
    known_inventory_reasons = {'count_unrecognized_root_contents','count_unrecognized_worktree_layout','scan_budget_exhausted','symlink_not_followed','unrecognized_root_contents','unrecognized_worktree_layout','entry_inaccessible_or_changed','enumeration_failed'}
    reasons = [x for x in wt.get('reasons', []) if isinstance(x,str) and x in known_inventory_reasons]
    if reasons:
        lines.append('清单覆盖标记：' + '、'.join(reasons) + '；未完成部分不推断为零。')
    exact_rows = [row for row in plan['rows'] if row.get('source') == 'precise-cache' and isinstance(row.get('decision_evidence'), dict)]
    if exact_rows:
        lines += ['', '## 精确缓存对象：可做保留决定，不等于已获执行批准', '',
            '仅固定 Homebrew bottle / pip HTTP 响应体布局；每行一个普通文件。身份绑定私有 manifest，精确路径只在本机 private-objects.zh.md。年龄/格式不能证明可丢弃；活动与保留需求仍待核对。', '',
            '| 方案行 / 对象 ID | 分配 / 逻辑字节 | 年龄 / 观察时点 / 覆盖 | 身份与保护 / 下一步 |', '| --- | --- | --- | --- |']
        for row in exact_rows:
            ev=row['decision_evidence']
            lines.append('| ' + str(row['row_id']) + ' / ' + ev['candidate_id'] + ' | '
                + size(ev['allocated_bytes']) + ' / ' + size(ev['logical_bytes']) + ' | '
                + number(row.get('age_days')) + ' 天 / ' + (str(ev['observed_at_unix']) if ev['observed_at_unix'] is not None else 'UNKNOWN') + ' / ' + ev['scan_completeness']
                + ' | 私有清单绑定；收集保护检查通过，执行前须重验。活动 UNKNOWN；先在本机核对保留/离线需求，再对所选对象做新鲜预检并单独批准 |')
        lines += ['', '这些分配字节不是保证释放量，可能已包含在 clean 总计中，不另相加。永久删除成功后无自动备份；重下来源/流量/离线可用性未验证。所选行操作仅支持严格单文件 adapter，不能改成宽范围 clean/purge/Trash。']
    elapsed = data.get('total_duration_seconds')
    lines += ['', '本次总墙钟耗时 ' + (str(elapsed) + ' 秒' if type(elapsed) in (int,float) and elapsed >= 0 else 'UNKNOWN；各来源耗时之和不是已验证墙钟时间') + '。',
        '方案 ' + plan['plan_id'][:12] + '；编号沿用证据 ID，跳号正常。完整 ledger/方案留本地，测量、解释和授权分开。所有默认聚合行均没有已验证的精确清理操作；批准编号不能扩大到 mo clean、purge --yes、Trash 或整棵 worktree。',
        '本次未清理；实际释放 UNKNOWN。会话/容器卷/模拟器可能含唯一数据；SDK/构建/缓存可能需重下或重建，恢复时间与成本未测。', '']
    return '\n'.join(lines)


def compact_size(value):
    """Human-scale decimal units; exact bytes stay in the linked ledger."""
    if type(value) is not int or value < 0:
        return 'UNKNOWN'
    for unit, scale in (('GB', 10**9), ('MB', 10**6), ('KB', 10**3)):
        if value >= scale:
            return f'{value / scale:.3f} {unit}'
    return f'{value} B'


def render_concise_summary(data, plan, details_link='audit-details.zh.md'):
    """Decision view, not the evidence ledger or an executable selection list."""
    if any(row.get('source') == 'file-type-metadata' for row in plan['rows']):
        return render_evidence_table(data, plan)  # Explicit legacy optional modes.
    from urllib.parse import quote
    from pathlib import PurePosixPath
    detail_href = quote(str(details_link), safe='/.:_-')
    ledger_href = quote(str(PurePosixPath(str(details_link)).parent / 'evidence-ledger.json'), safe='/.:_-')
    sources = {s.get('source'): s for s in data.get('sources', []) if isinstance(s, dict)}
    ledger = evidence_ledger(data, plan)
    capacity, analyze = sources.get('mole-status', {}), sources.get('mole-analyze', {})
    clean, purge = sources.get('mole-clean', {}), sources.get('mole-purge', {})
    wt = sources.get('codex-worktree-inventory', {})
    occupied = [r for r in ledger if r['source'] in ('mole-analyze', 'mole-analyze-drilldown')]
    chosen = {}
    for row in occupied:
        if row['measured_size'] is None:
            continue
        key = row['category']
        old = chosen.get(key)
        score = (row['scan_completeness'] == 'COMPLETE', row['measured_size'])
        if old is None or score > (old['scan_completeness'] == 'COMPLETE', old['measured_size']):
            chosen[key] = row
    broad = {'other', 'home', 'user_library', 'applications', 'system_library', 'codex_data', 'android_data'}
    selected = sorted((r for k, r in chosen.items() if k not in broad), key=lambda r: r['measured_size'], reverse=True)[:5]
    # Sessions are not disposable cache and must not disappear behind large containers.
    sessions = chosen.get('codex_sessions')
    if sessions and sessions not in selected:
        selected = selected[:4] + [sessions]
    display = lambda r: r['finding'] + ' ' + compact_size(r['measured_size']) + ('（' + r['scan_completeness'] + '）' if r['scan_completeness'] != 'COMPLETE' else '')
    ids = lambda rows: '〔证据 ' + '/'.join(str(r['evidence_id']) for r in rows) + '〕'
    lines = ['# 磁盘审核：先看这些', '',
        '本次未清理。容量 ' + compact_size(capacity.get('total_bytes')) + '，已用 ' + compact_size(capacity.get('used_bytes')) + '，可用差额 ' + compact_size(capacity.get('free_bytes')) + '（官方 status 口径，不含 Finder 可清除空间）。',
        '主要占用：' + ('；'.join(display(r) for r in selected) if selected else '尚无可靠分类测量') + '。占用不等于可回收，父子/来源可能重叠，不能相加。']
    other = chosen.get('other')
    if other:
        lines.append('另有未解释范围 Other ' + compact_size(other['measured_size']) + '（' + other['scan_completeness'] + '，不同范围可能嵌套，非额外可清理空间）。')
    lines += ['', 'clean 上游预览总计约 ' + compact_size(clean.get('candidate_estimate_bytes')) + '（' + STATUS.get(clean.get('completeness'), 'UNKNOWN') + '，不是分类求和）；仅舍入候选，不保证释放。',
        'purge 独立预览：' + STATUS.get(purge.get('completeness'), 'UNKNOWN') + '，候选约 ' + compact_size(purge.get('candidate_estimate_bytes')) + '；' + failure_detail(purge) + '。不能用 clean 结果替代，也不能与 clean 相加。', '', '## 建议选项（不是删除批准）', '']
    measured_preview = sorted([row for row in ledger if row['source'] == 'mole-clean'
        and type(row['measured_size']) is int and row['measured_size'] > 0],
        key=lambda row: row['measured_size'], reverse=True)[:2]
    if measured_preview:
        lines.insert(-3, 'clean 主要类别：' + '、'.join(display(row) for row in measured_preview)
            + '；仅部分分类估算，不与总计或精确对象相加。')
    options = []
    exact = [row for row in plan['rows'] if row.get('source') == 'precise-cache'
             and row.get('exact_scope') is True and isinstance(row.get('decision_evidence'), dict)]
    if exact:
        chosen_exact = sorted(exact, key=lambda row: -row['decision_evidence']['allocated_bytes'])[:2]
        labels = {'precise_homebrew_bottle': 'Homebrew bottle 下载包', 'precise_pip_http_body': 'pip HTTP 响应体'}
        objects = []
        for row in chosen_exact:
            evidence = row['decision_evidence']
            objects.append(labels.get(row['category'], '受支持缓存文件') + ' 对象 ' + evidence['candidate_id'][:8]
                + '（精确方案行 ' + str(row['row_id']) + '，分配 ' + compact_size(evidence['allocated_bytes'])
                + ' / 逻辑 ' + compact_size(evidence['logical_bytes']) + '，' + number(row.get('age_days')) + ' 天）')
        options.append('先决定这些精确缓存对象是否还需保留：' + '；'.join(objects)
            + '。本机详情可核对文件；身份/保护已检查但执行前须复核，活动 UNKNOWN，年龄不是删除理由。永久删除无备份，可能重下或离线失败；先核对保留需求，再做所选对象的新鲜预检和单独批准。')
    previews = [r for r in ledger if r['source'] == 'mole-clean' and type(r['measured_size']) is int and r['measured_size'] > 0]
    previews.sort(key=lambda r: r['measured_size'], reverse=True)
    if previews and not exact:
        rows = previews[:2]
        options.append('先复核 clean 缓存候选：' + '、'.join(display(r) for r in rows) + '。核对官方精确条目及活动应用/离线需求；可能重下、重建或重新登录，不按聚合类别直接删。' + ids(rows))
    sdk = chosen.get('android_sdk')
    if sdk:
        options.append('核对 Android SDK ' + compact_size(sdk['measured_size']) + '：用 SDK Manager 找不再依赖的版本；可能需重新下载，先确认项目和离线需求。这里只测占用，未确认可释放量。' + ids([sdk]))
    valuable = [chosen[k] for k in ('colima_data', 'container_data', 'android_emulators', 'xcode_simulators') if k in chosen]
    if valuable:
        valuable.sort(key=lambda r: r['measured_size'], reverse=True)
        rows = valuable[:2]
        options.append('复核 ' + '、'.join(display(r) for r in rows) + '：用所属容器/设备管理工具确认不用的实例与备份；卷、数据库或模拟器可能含唯一状态，不直接删目录。' + ids(rows))
    codex = [chosen[k] for k in ('codex_worktrees', 'codex_sessions') if k in chosen]
    if codex:
        options.append('先保留 ' + '、'.join(display(r) for r in codex) + '：在 Codex 核对历史/工作用途；会话可能唯一，Git/活动/未推送安全检查未完成，禁止整棵 worktree 删除。' + ids(codex))
    if len(options) < 5:
        candidate = purge.get('candidate_estimate_bytes')
        if type(candidate) is int and candidate >= 0 and purge.get('completeness') != 'FAILED':
            step = '复核 purge 构建/依赖候选约 ' + compact_size(candidate) + '：单独核对项目与可重建产物，先停相关任务并评估重新下载/编译成本；不是删源码、仓库或整个 worktree。'
        else:
            step = 'purge 暂不计清理收益：只在所需条件满足后安排一次受保护、限时预览；失败/超时/中断保留未知，不放宽权限、不无限重试。purge 查构建/依赖候选，不等于删除 worktree。'
        options.append(step)
    if len(options) < 3:
        remaining = [r for r in selected if r['category'] not in {'codex_sessions', 'codex_worktrees', 'android_sdk', 'colima_data', 'container_data', 'android_emulators', 'xcode_simulators'}]
        for row in remaining:
            if len(options) >= 3:
                break
            options.append('复核 ' + display(row) + '：' + next_step(row['category']) + '。未确认可回收量。' + ids([row]))
    # Sparse evidence yields fewer concrete options rather than fabricated findings.
    lines += [str(i) + '. ' + value for i, value in enumerate(options[:5], 1)]
    limits = []
    collection = plan.get('precise_collection')
    if isinstance(collection, dict) and not exact:
        limits.append('有限精确缓存收集 ' + STATUS.get(collection.get('completeness'), 'UNKNOWN') + '，未取得可用精确对象，不代表没有可清理对象；预算/保护/不支持范围见方案')
    if any(r['observation_time_unix'] is None for r in ledger):
        limits.append('观察时点 UNKNOWN，保存记录不代表当前状态')
    else:
        limits.append('各来源并非原子快照，执行前须重新核验')
    if 'codex-worktree-inventory' in sources:
        observed = wt.get('observed_worktree_count')
        count = 'worktree 精确数 ' + number(wt.get('worktree_count'))
        if type(observed) is int:
            count += '，已观察至少 ' + number(observed)
        limits.append(count + '；workspace 数量/覆盖 ' + number(wt.get('workspace_count')) + '/' + STATUS.get(wt.get('workspace_count_completeness'), 'UNKNOWN') + '；清单分配字节与 Mole 目录字节不可相减')
    home_top = [g.get('observed_bytes') for g in analyze.get('categories', []) if g.get('category') == 'home']
    home_detail = [d.get('occupied_bytes') for d in analyze.get('drilldowns', []) if d.get('scope_label') == 'home']
    if home_top and home_detail and home_top[0] != home_detail[0]:
        limits.append('Home overview 与下钻覆盖矛盾未解释，不能算术调平')
    if any(d.get('drilldown_budget_exhausted') for d in analyze.get('drilldowns', [])):
        limits.append('下钻达到预算，覆盖仍 PARTIAL')
    lines += ['', '关键限制：' + '；'.join(limits) + '。',
        ('精确对象仅为待决策的单文件快照，不是已批准或已确认可释放量；可能已包含在 clean 总计中，不另相加。' if exact else '已确认可精确执行的清理量 UNKNOWN。') + 'clean 实际清理会永久删除、重扫并可能清空未保护 Trash；预览不等于零副作用。编号仅用于讨论，不授权 broad clean、purge --yes 或删除文件。', '',
        '[查看完整证据、精确字节、来源与覆盖](' + detail_href + ') · [证据 ledger](' + ledger_href + ')', '']
    return '\n'.join(lines)
