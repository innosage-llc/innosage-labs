import { TaskActions } from './TaskActions';
import { WorkspaceButton } from './WorkspaceButton';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { ExpoCheckbox } from './ExpoCheckbox';
import { ExpoListRow, ExpoPicker, ExpoSegments } from './ExpoControls';
import { ExpoFilterChip } from './ExpoFilterChip';
import {
  Button,
  Chip,
  EmptyState,
  Feedback,
  Field,
  ListRow,
  Surface,
  UiText,
  useTheme,
} from '../ui';
import {
  type Note,
  type Project,
  type Status,
  type Tag,
  type Task,
  type Workspace,
} from './model';

// ============================================================================
// 1. Overview Screen
// ============================================================================

export interface OverviewScreenProps {
  workspace: Workspace;
  onNavigate: (screen: 'inbox' | 'projects' | 'tasks' | 'notes' | 'search' | 'settings') => void;
  onOpenProject: (projectId: string) => void;
  onEditTask: (task: Task) => void;
  onLoadDemo: () => void;
  busy: boolean;
}

export function OverviewScreen({
  workspace,
  onNavigate,
  onOpenProject,
  onEditTask,
  onLoadDemo,
  busy,
}: OverviewScreenProps) {
  const { spacing, palette } = useTheme();

  const isCompletelyEmpty =
    workspace.projects.length === 0 &&
    workspace.tasks.length === 0 &&
    workspace.notes.length === 0 &&
    workspace.tags.length === 0;

  if (isCompletelyEmpty) {
    return (
      <View testID="overview-empty-container" style={{ gap: spacing.lg }}>
        <EmptyState
          testID="overview-empty-state"
          title="Workspace is empty"
          description="Your local workspace has no projects, tasks, notes, or tags. Start from scratch or load synthetic demo data."
          actionLabel="Load demo workspace"
          onAction={onLoadDemo}
        />
      </View>
    );
  }

  const todoTasks = workspace.tasks.filter((t) => t.status === 'todo');
  const doingTasks = workspace.tasks.filter((t) => t.status === 'doing');
  const doneTasks = workspace.tasks.filter((t) => t.status === 'done');
  const inboxTasks = workspace.tasks.filter((t) => t.projectId === null);
  const recentTasks = workspace.tasks.slice(-5).reverse();

  return (
    <View testID="overview-screen" style={{ gap: spacing.lg }}>
      <View testID="overview-summary" style={{ gap: spacing.sm }}>
        <UiText variant="heading">Workspace summary</UiText>
        <UiText variant="body">
          {workspace.tasks.length} {workspace.tasks.length === 1 ? 'task' : 'tasks'} · {workspace.projects.length} {workspace.projects.length === 1 ? 'project' : 'projects'} · {workspace.notes.length} {workspace.notes.length === 1 ? 'note' : 'notes'}
        </UiText>
        <UiText variant="caption" style={{ color: palette.muted }}>
          {todoTasks.length} to do · {doingTasks.length} in progress · {doneTasks.length} done · {inboxTasks.length} in inbox
        </UiText>
      </View>

      <View testID="overview-recent-tasks" style={{ gap: spacing.sm }}>
        <UiText variant="heading">Recent tasks</UiText>
        {recentTasks.length === 0 ? (
          <EmptyState
            title="No tasks yet"
            description="Create your first task in Inbox or Tasks to track progress."
            actionLabel="Go to Tasks"
            onAction={() => onNavigate('tasks')}
          />
        ) : (
          <View>
            {recentTasks.map((task) => {
              const project = workspace.projects.find((p) => p.id === task.projectId);
              const tagNames = task.tagIds
                .map((id) => workspace.tags.find((t) => t.id === id)?.title)
                .filter(Boolean)
                .join(', ');
              const subtitleParts = [
                task.status.toUpperCase(),
                project ? project.title : 'Inbox',
                tagNames ? `Tags: ${tagNames}` : null,
              ].filter((name): name is string => typeof name === "string");

              return (
                <ListRow
                  key={task.id}
                  testID={`recent-task-${task.id}`}
                  title={task.title}
                  subtitle={subtitleParts.join(' · ')}
                  onPress={() => onEditTask(task)}
                />
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

// ============================================================================
// 2. Inbox Screen
// ============================================================================

export interface InboxScreenProps {
  workspace: Workspace;
  onNewTask: () => void;
  onEditTask: (task: Task) => void;
  onToggleStatus: (task: Task, nextStatus: Status) => void;
  onDeleteTask: (task: Task) => void;
  onBatchComplete: (selectedIds: string[]) => Promise<boolean>;
  busy: boolean;
}

export function InboxScreen({
  workspace,
  onNewTask,
  onEditTask,
  onToggleStatus,
  onDeleteTask,
  onBatchComplete,
  busy,
}: InboxScreenProps) {
  const { spacing, palette } = useTheme();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const inboxTasks = workspace.tasks.filter((t) => t.projectId === null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBatch = async () => {
    if (selectedIds.size === 0) return;
    if (await onBatchComplete(Array.from(selectedIds))) setSelectedIds(new Set());
  };

  return (
    <View testID="inbox-screen" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <UiText variant="heading">Inbox ({inboxTasks.length})</UiText>
        <Button label="New Task" onPress={onNewTask} testID="inbox-new-task-btn" disabled={busy} />
      </View>

      {selectedIds.size > 0 ? (
        <Surface testID="inbox-batch-bar" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
          <UiText variant="body">{selectedIds.size} task(s) selected</UiText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={`Batch Complete (${selectedIds.size})`}
              onPress={handleBatch}
              testID="inbox-batch-complete-btn"
              disabled={busy}
            />
            <Button
              label="Clear"
              variant="secondary"
              onPress={() => setSelectedIds(new Set())}
              testID="inbox-batch-clear-btn"
            />
          </View>
        </Surface>
      ) : null}

      {inboxTasks.length === 0 ? (
        <EmptyState
          testID="inbox-empty-state"
          title="Inbox zero"
          description="You have no unassigned tasks in your Inbox. Capture a new thought or assign existing tasks."
          actionLabel="Add to Inbox"
          onAction={onNewTask}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {inboxTasks.map((task) => {
            const isSelected = selectedIds.has(task.id);
            const tagNames = task.tagIds
              .map((id) => workspace.tags.find((t) => t.id === id)?.title)
              .filter((name): name is string => typeof name === "string");

            return (
              <Surface
                key={task.id}
                testID={`inbox-task-card-${task.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}
              >
                <ExpoCheckbox
                  testID={`inbox-select-${task.id}`}
                  label={isSelected ? `Deselect ${task.title}` : `Select ${task.title}`}
                  value={isSelected}
                  onValueChange={() => toggleSelect(task.id)}
                />

                <View style={{ flex: 1, minWidth: 160 }}>
                  <Button
                    label={task.title}
                    variant="secondary"
                    onPress={() => onEditTask(task)}
                    testID={`inbox-task-title-${task.id}`}
                    style={{ borderWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 0 }}
                    textStyle={{ fontWeight: '500', color: palette.text }}
                  />
                  {tagNames.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
                      {tagNames.map((name) => (
                        <Chip key={name} label={name} style={{ minHeight: 28, paddingVertical: 2, paddingHorizontal: 8 }} />
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Chip
                    label={task.status.toUpperCase()}
                    selected={task.status === 'done'}
                    onPress={() => {
                      const cycle: Record<Status, Status> = {
                        todo: 'doing',
                        doing: 'done',
                        done: 'todo',
                      };
                      onToggleStatus(task, cycle[task.status]);
                    }}
                    testID={`inbox-status-toggle-${task.id}`}
                  />
                  <Button
                    label="Delete" accessibilityLabel={`Delete ${task.title}`}
                    variant="danger"
                    onPress={() => onDeleteTask(task)}
                    testID={`inbox-delete-${task.id}`}
                    disabled={busy}
                  />
                </View>
              </Surface>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// 3. Projects Screen
// ============================================================================

export interface ProjectsScreenProps {
  workspace: Workspace;
  onNewProject: () => void;
  onSelectProject: (projectId: string) => void;
  busy: boolean;
}

export function ProjectsScreen({
  workspace,
  onNewProject,
  onSelectProject,
  busy,
}: ProjectsScreenProps) {
  const { spacing, palette } = useTheme();

  return (
    <View testID="projects-screen" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <UiText variant="heading">Projects ({workspace.projects.length})</UiText>
        <Button label="New Project" onPress={onNewProject} testID="projects-new-btn" disabled={busy} />
      </View>

      {workspace.projects.length === 0 ? (
        <EmptyState
          testID="projects-empty-state"
          title="No projects yet"
          description="Create projects to organize related tasks and notes into bounded areas."
          actionLabel="Create Project"
          onAction={onNewProject}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {workspace.projects.map((project) => {
            const relatedTasks = workspace.tasks.filter((t) => t.projectId === project.id);
            const relatedNotes = workspace.notes.filter((n) => n.projectId === project.id);
            const subtitle = `${relatedTasks.length} task(s) · ${relatedNotes.length} note(s)`;

            return (
              <Surface key={project.id} testID={`project-card-${project.id}`}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md }}>
                  <View style={{ flex: 1 }}>
                    <UiText variant="heading">{project.title}</UiText>
                    {project.description ? (
                      <UiText variant="body" style={{ color: palette.muted, marginTop: spacing.xs }}>
                        {project.description}
                      </UiText>
                    ) : null}
                    <UiText variant="caption" style={{ color: palette.muted, marginTop: spacing.sm }}>
                      {subtitle}
                    </UiText>
                  </View>
                  <Button
                    label="View Project"
                    variant="secondary"
                    onPress={() => onSelectProject(project.id)}
                    testID={`project-open-${project.id}`}
                  />
                </View>
              </Surface>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// 4. Project Detail Screen
// ============================================================================

export interface ProjectDetailScreenProps {
  workspace: Workspace;
  project: Project;
  onBack?: () => void;
  onEditProject: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  onNewTask: (projectId: string) => void;
  onEditTask: (task: Task) => void;
  onToggleStatus: (task: Task, nextStatus: Status) => void;
  onDeleteTask: (task: Task) => void;
  onNewNote: (projectId: string) => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  busy: boolean;
}

export function ProjectDetailScreen({
  workspace,
  project,
  onBack,
  onEditProject,
  onDeleteProject,
  onNewTask,
  onEditTask,
  onToggleStatus,
  onDeleteTask,
  onNewNote,
  onEditNote,
  onDeleteNote,
  busy,
}: ProjectDetailScreenProps) {
  const { spacing, palette } = useTheme();

  const projectTasks = workspace.tasks.filter((t) => t.projectId === project.id);
  const projectNotes = workspace.notes.filter((n) => n.projectId === project.id);

  return (
    <View testID="project-detail-screen" style={{ gap: spacing.lg }}>
      <Surface testID="project-detail-header-card">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm }}>
          {onBack ? <Button label="Back to Projects" variant="secondary" onPress={onBack} testID="project-detail-back-btn" /> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button label="Edit Project" variant="secondary" onPress={() => onEditProject(project)} testID="project-detail-edit-btn" disabled={busy} />
            <Button label="Delete Project" variant="danger" onPress={() => onDeleteProject(project)} testID="project-detail-delete-btn" disabled={busy} />
          </View>
        </View>
        <UiText variant="title">{project.title}</UiText>
        {project.description ? (
          <UiText variant="body" style={{ color: palette.muted, marginTop: spacing.xs }}>
            {project.description}
          </UiText>
        ) : null}
      </Surface>

      {/* Related Tasks */}
      <Surface testID="project-tasks-section">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <UiText variant="heading">Tasks ({projectTasks.length})</UiText>
          <Button label="Add Task" onPress={() => onNewTask(project.id)} testID="project-add-task-btn" disabled={busy} />
        </View>
        {projectTasks.length === 0 ? (
          <EmptyState
            title="No tasks in this project"
            description="Add tasks to track progress for this project."
            actionLabel="Add Task"
            onAction={() => onNewTask(project.id)}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {projectTasks.map((task) => (
              <Surface key={task.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
                <View style={{ flex: 1, minWidth: 160 }}>
                  <Button
                    label={task.title}
                    variant="secondary"
                    onPress={() => onEditTask(task)}
                    style={{ borderWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 0 }}
                    textStyle={{ fontWeight: '500', color: palette.text }}
                  />
                  <UiText variant="caption" style={{ color: palette.muted }}>
                    Status: {task.status.toUpperCase()}
                  </UiText>
                </View>
                <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                  <Chip
                    label={task.status === 'done' ? 'Completed' : 'Complete'}
                    selected={task.status === 'done'}
                    onPress={() => onToggleStatus(task, task.status === 'done' ? 'todo' : 'done')}
                  />
                  <Button label="Delete" accessibilityLabel={`Delete ${task.title}`} variant="danger" onPress={() => onDeleteTask(task)} disabled={busy} />
                </View>
              </Surface>
            ))}
          </View>
        )}
      </Surface>

      {/* Related Notes */}
      <Surface testID="project-notes-section">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
          <UiText variant="heading">Notes ({projectNotes.length})</UiText>
          <Button label="Add Note" onPress={() => onNewNote(project.id)} testID="project-add-note-btn" disabled={busy} />
        </View>
        {projectNotes.length === 0 ? (
          <EmptyState
            title="No notes in this project"
            description="Add documentation, specs, or meeting notes for this project."
            actionLabel="Add Note"
            onAction={() => onNewNote(project.id)}
          />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {projectNotes.map((note) => (
              <Surface key={note.id} style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button
                    label={note.title}
                    variant="secondary"
                    onPress={() => onEditNote(note)}
                    style={{ borderWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 0 }}
                    textStyle={{ fontWeight: '600', color: palette.text }}
                  />
                  <Button label="Delete" variant="danger" onPress={() => onDeleteNote(note)} disabled={busy} />
                </View>
                <UiText variant="body" numberOfLines={2} style={{ color: palette.muted }}>
                  {note.body}
                </UiText>
              </Surface>
            ))}
          </View>
        )}
      </Surface>
    </View>
  );
}

// ============================================================================
// 5. Tasks Screen (List and Board Views)
// ============================================================================

export interface TasksScreenProps {
  workspace: Workspace;
  initialTagId?: string | null;
  onNewTask: () => void;
  onEditTask: (task: Task) => void;
  onToggleStatus: (task: Task, nextStatus: Status) => void;
  onDeleteTask: (task: Task) => void;
  onBatchComplete: (selectedIds: string[]) => Promise<boolean>;
  busy: boolean;
}

export function TasksScreen({
  workspace,
  initialTagId = null,
  onNewTask,
  onEditTask,
  onToggleStatus,
  onDeleteTask,
  onBatchComplete,
  busy,
}: TasksScreenProps) {
  const { spacing, palette } = useTheme();

  const [selecting, setSelecting] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [sortOrder, setSortOrder] = useState('default');
  const [viewMode, setViewMode] = useState<string>('list'); // 'list' | 'board'
  const [statusFilter, setStatusFilter] = useState<string>('all'); // 'all' | 'todo' | 'doing' | 'done'
  const [projectFilter, setProjectFilter] = useState<string>('all'); // 'all' | 'inbox' | projectId
  const [tagFilter, setTagFilter] = useState<string>(initialTagId ?? 'all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBatch = async () => {
    if (selectedIds.size === 0) return;
    if (await onBatchComplete(Array.from(selectedIds))) setSelectedIds(new Set());
  };

  // Filter tasks
  const filteredTasks = workspace.tasks.filter((task) => {
    if (statusFilter !== 'all' && task.status !== statusFilter) return false;
    if (projectFilter === 'inbox' && task.projectId !== null) return false;
    if (projectFilter !== 'all' && projectFilter !== 'inbox' && task.projectId !== projectFilter) return false;
    if (tagFilter !== 'all' && !task.tagIds.includes(tagFilter)) return false;
    return true;
  });
  if (sortOrder === 'title') filteredTasks.sort((a, b) => a.title.localeCompare(b.title));

  return (
    <View testID="tasks-screen" style={{ gap: spacing.md }}>
      {/* Top Bar: View Mode and Actions */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <ExpoSegments
          testID="tasks-view-mode-toggle"
          options={[
            { id: 'list', label: 'List' },
            { id: 'board', label: 'Board' },
          ]}
          value={viewMode}
          onChange={setViewMode}
        />
        <Button label={showFilters ? "Hide filters" : "Filters & sort"} variant="secondary" onPress={() => setShowFilters(!showFilters)} />
        {Platform.OS === 'android' && viewMode === 'list' && (
          <Button label={selecting ? 'Done selecting' : 'Select tasks'} variant="secondary" onPress={() => {
            setSelecting(!selecting);
            setSelectedIds(new Set());
          }} />
        )}
      </View>

      {/* Filter Controls */}
      {showFilters && (
      <Surface testID="tasks-filter-surface" style={{ gap: spacing.sm }}>
        <ExpoSegments
          accessibilityLabel="Task sort order"
          options={[{ id: 'default', label: 'Default order' }, { id: 'title', label: 'Title A–Z' }]}
          value={sortOrder}
          onChange={setSortOrder}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs }}>
          <UiText variant="caption" style={{ fontWeight: '600', marginRight: spacing.xs }}>Status:</UiText>
          <ExpoSegments
            options={[
              { id: 'all', label: 'All' },
              { id: 'todo', label: 'Todo' },
              { id: 'doing', label: 'Doing' },
              { id: 'done', label: 'Done' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </View>

        <ExpoPicker
          testID="tasks-project-filter"
          label="Project"
          value={projectFilter}
          onValueChange={setProjectFilter}
          options={[
            { value: 'all', label: 'All Projects' },
            { value: 'inbox', label: 'Inbox (Unassigned)' },
            ...workspace.projects.map((project) => ({ value: project.id, label: project.title })),
          ]}
        />

        {/* Tag Filter Chips */}
        {workspace.tags.length > 0 ? (
          <ExpoPicker
            testID="tasks-tag-filter"
            label="Tag"
            value={tagFilter}
            onValueChange={setTagFilter}
            options={[
              { value: 'all', label: 'All Tags' },
              ...workspace.tags.map((tag) => ({ value: tag.id, label: tag.title })),
            ]}
          />
        ) : null}
      </Surface>
      )}

      {/* Batch Complete Bar */}
      {selectedIds.size > 0 ? (
        <Surface testID="tasks-batch-bar" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
          <UiText variant="body">{selectedIds.size} task(s) selected</UiText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button
              label={`Batch Complete (${selectedIds.size})`}
              onPress={handleBatch}
              testID="tasks-batch-complete-btn"
              disabled={busy}
            />
            <Button
              label="Clear"
              variant="secondary"
              onPress={() => setSelectedIds(new Set())}
              testID="tasks-batch-clear-btn"
            />
          </View>
        </Surface>
      ) : null}

      {/* View Content */}
      {filteredTasks.length === 0 ? (
        <EmptyState
          testID="tasks-empty-state"
          title="No tasks found"
          description="No tasks match the active filters or your workspace has no tasks yet."
          actionLabel="Create Task"
          onAction={onNewTask}
        />
      ) : viewMode === 'list' ? (
        /* List View */
        <View testID="tasks-list-container" style={{ gap: spacing.sm }}>
          {filteredTasks.map((task) => {
            const isSelected = selectedIds.has(task.id);
            const project = workspace.projects.find((p) => p.id === task.projectId);
            const tagNames = task.tagIds
              .map((id) => workspace.tags.find((t) => t.id === id)?.title)
              .filter((name): name is string => typeof name === "string");

            if (Platform.OS === 'android') {
              const statusLabels = { todo: 'To do', doing: 'In progress', done: 'Done' };
              const statusLabel = statusLabels[task.status];
              const nextStatus: Record<Status, Status> = { todo: 'doing', doing: 'done', done: 'todo' };
              return (
                <Surface key={task.id} testID={`task-row-${task.id}`} style={{ paddingVertical: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {selecting && (
                      <ExpoCheckbox
                        testID={`task-select-${task.id}`}
                        value={isSelected}
                        label={isSelected ? `Deselect ${task.title}` : `Select ${task.title}`}
                        onValueChange={() => toggleSelect(task.id)}
                      />
                    )}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${task.title}, ${statusLabel}`}
                      onPress={() => selecting ? toggleSelect(task.id) : onEditTask(task)}
                      style={{ flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: 6 }}
                    >
                      <UiText variant="body" style={{ fontWeight: '600' }}>{task.title}</UiText>
                      <UiText variant="caption" style={{ color: palette.muted }}>
                        {[project?.title ?? 'Inbox', statusLabel, ...tagNames].join(' · ')}
                      </UiText>
                    </Pressable>
                    {!selecting && (
                      <TaskActions
                        title={task.title}
                        nextStatusLabel={statusLabels[nextStatus[task.status]]}
                        disabled={busy}
                        onChangeStatus={() => onToggleStatus(task, nextStatus[task.status])}
                        onDelete={() => onDeleteTask(task)}
                      />
                    )}
                  </View>
                </Surface>
              );
            }

            return (
              <Surface
                key={task.id}
                testID={`task-row-${task.id}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}
              >
                <ExpoCheckbox
                  testID={`task-select-${task.id}`}
                  label={isSelected ? `Deselect ${task.title}` : `Select ${task.title}`}
                  value={isSelected}
                  onValueChange={() => toggleSelect(task.id)}
                />

                <View style={{ flex: 1, minWidth: 160 }}>
                  <Button
                    label={task.title}
                    variant="secondary"
                    onPress={() => onEditTask(task)}
                    testID={`task-title-click-${task.id}`}
                    style={{ borderWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 0 }}
                    textStyle={{ fontWeight: '500', color: palette.text }}
                  />
                  <UiText variant="caption" style={{ color: palette.muted }}>
                    {project ? project.title : 'Inbox'} · Status: {task.status.toUpperCase()}
                  </UiText>
                  {tagNames.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
                      {tagNames.map((name) => (
                        <Chip key={name} label={name} style={{ minHeight: 28, paddingVertical: 2, paddingHorizontal: 8 }} />
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
                  <Chip
                    label={task.status.toUpperCase()}
                    selected={task.status === 'done'}
                    onPress={() => {
                      const nextMap: Record<Status, Status> = { todo: 'doing', doing: 'done', done: 'todo' };
                      onToggleStatus(task, nextMap[task.status]);
                    }}
                  />
                  <Button
                    label="Delete" accessibilityLabel={`Delete ${task.title}`}
                    variant="danger"
                    onPress={() => onDeleteTask(task)}
                    testID={`task-delete-${task.id}`}
                    disabled={busy}
                  />
                </View>
              </Surface>
            );
          })}
        </View>
      ) : (
        /* Board View (Three status groups) */
        <View testID="tasks-board-container" style={{ gap: spacing.lg }}>
          {(['todo', 'doing', 'done'] as const).map((colStatus) => {
            const colTasks = filteredTasks.filter((t) => t.status === colStatus);
            const colTitle = colStatus === 'todo' ? 'To Do' : colStatus === 'doing' ? 'In Progress' : 'Done';

            return (
              <View key={colStatus} testID={`board-column-${colStatus}`} style={{ gap: spacing.sm }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <UiText variant="heading">{colTitle} ({colTasks.length})</UiText>
                </View>

                {colTasks.length === 0 ? (
                  <UiText variant="caption" style={{ color: palette.muted, paddingVertical: spacing.md }}>
                    No {colTitle.toLowerCase()} tasks
                  </UiText>
                ) : (
                  colTasks.map((task) => {
                    const isSelected = selectedIds.has(task.id);
                    const project = workspace.projects.find((p) => p.id === task.projectId);

                    return (
                      <Surface key={task.id} testID={`board-task-${task.id}`} style={{ borderWidth: 1, borderColor: palette.border, gap: spacing.xs }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <ExpoCheckbox
                            label={isSelected ? `Deselect ${task.title}` : `Select ${task.title}`}
                            value={isSelected}
                            onValueChange={() => toggleSelect(task.id)}
                          />
                          <Button
                            label="Delete" accessibilityLabel={`Delete ${task.title}`}
                            variant="danger"
                            onPress={() => onDeleteTask(task)}
                            disabled={busy}
                            style={{ minHeight: 48, paddingHorizontal: spacing.sm }}
                          />
                        </View>

                        <Button
                          label={task.title}
                          variant="secondary"
                          onPress={() => onEditTask(task)}
                          style={{ borderWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 0 }}
                          textStyle={{ fontWeight: '500', color: palette.text }}
                        />

                        {project ? (
                          <UiText variant="caption" style={{ color: palette.muted }}>
                            Project: {project.title}
                          </UiText>
                        ) : null}

                        {/* Status advancement buttons */}
                        <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs }}>
                          {colStatus !== 'todo' ? (
                            <Button
                              label="Move to Todo"
                              variant="secondary"
                              onPress={() => onToggleStatus(task, 'todo')}
                              style={{ minHeight: 48, paddingHorizontal: spacing.sm }}
                              disabled={busy}
                            />
                          ) : null}
                          {colStatus !== 'doing' ? (
                            <Button
                              label="Move to Doing"
                              variant="secondary"
                              onPress={() => onToggleStatus(task, 'doing')}
                              style={{ minHeight: 48, paddingHorizontal: spacing.sm }}
                              disabled={busy}
                            />
                          ) : null}
                          {colStatus !== 'done' ? (
                            <Button
                              label="Complete"
                              variant="secondary"
                              onPress={() => onToggleStatus(task, 'done')}
                              style={{ minHeight: 48, paddingHorizontal: spacing.sm }}
                              disabled={busy}
                            />
                          ) : null}
                        </View>
                      </Surface>
                    );
                  })
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// 6. Notes Screen
// ============================================================================

export interface NotesScreenProps {
  workspace: Workspace;
  onNewNote: () => void;
  onEditNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  busy: boolean;
}

export function NotesScreen({
  workspace,
  onNewNote,
  onEditNote,
  onDeleteNote,
  busy,
}: NotesScreenProps) {
  const { spacing, palette } = useTheme();
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');

  const filteredNotes = workspace.notes.filter((note) => {
    if (projectFilter === 'unassigned' && note.projectId !== null) return false;
    if (projectFilter !== 'all' && projectFilter !== 'unassigned' && note.projectId !== projectFilter) return false;
    if (tagFilter !== 'all' && !note.tagIds.includes(tagFilter)) return false;
    return true;
  });

  return (
    <View testID="notes-screen" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm }}>
        <UiText variant="heading">Notes ({workspace.notes.length})</UiText>
        <Button label="New Note" onPress={onNewNote} testID="notes-new-btn" disabled={busy} />
      </View>

      {/* Filter Chips */}
      {(workspace.projects.length > 0 || workspace.tags.length > 0) ? (
        <Surface testID="notes-filter-surface" style={{ gap: spacing.sm }}>
          {workspace.projects.length > 0 ? (
            <ExpoPicker
              testID="notes-project-filter"
              label="Project"
              value={projectFilter}
              onValueChange={setProjectFilter}
              options={[
                { value: 'all', label: 'All Projects' },
                { value: 'unassigned', label: 'Unassigned' },
                ...workspace.projects.map((project) => ({ value: project.id, label: project.title })),
              ]}
            />
          ) : null}

          {workspace.tags.length > 0 ? (
            <ExpoPicker
              testID="notes-tag-filter"
              label="Tag"
              value={tagFilter}
              onValueChange={setTagFilter}
              options={[
                { value: 'all', label: 'All Tags' },
                ...workspace.tags.map((tag) => ({ value: tag.id, label: tag.title })),
              ]}
            />
          ) : null}
        </Surface>
      ) : null}

      {filteredNotes.length === 0 ? (
        <EmptyState
          testID="notes-empty-state"
          title="No notes found"
          description={workspace.notes.length === 0 ? "You have not captured any notes yet. Capture ideas, meeting minutes, or references." : "No notes match the selected filters."}
          actionLabel="Create Note"
          onAction={onNewNote}
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {filteredNotes.map((note) => {
            const project = workspace.projects.find((p) => p.id === note.projectId);
            const tagNames = note.tagIds
              .map((id) => workspace.tags.find((t) => t.id === id)?.title)
              .filter((name): name is string => typeof name === "string");

            return (
              <Surface key={note.id} testID={`note-card-${note.id}`} style={{ gap: spacing.xs }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Button
                    label={note.title}
                    variant="secondary"
                    onPress={() => onEditNote(note)}
                    testID={`note-title-click-${note.id}`}
                    style={{ borderWidth: 0, justifyContent: 'flex-start', alignItems: 'flex-start', paddingHorizontal: 0 }}
                    textStyle={{ fontWeight: '600', color: palette.text }}
                  />
                  <Button
                    label="Delete"
                    variant="danger"
                    onPress={() => onDeleteNote(note)}
                    testID={`note-delete-${note.id}`}
                    disabled={busy}
                  />
                </View>

                <UiText variant="body" numberOfLines={3} style={{ color: palette.muted }}>
                  {note.body}
                </UiText>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs }}>
                  <UiText variant="caption" style={{ color: palette.muted }}>
                    {project ? `Project: ${project.title}` : 'Unassigned'}
                  </UiText>
                  {tagNames.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
                      {tagNames.map((name) => (
                        <Chip key={name} label={name} style={{ minHeight: 28, paddingVertical: 2, paddingHorizontal: 8 }} />
                      ))}
                    </View>
                  ) : null}
                </View>
              </Surface>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// 7. Search Screen
// ============================================================================

export interface SearchScreenProps {
  workspace: Workspace;
  onOpenProject: (projectId: string) => void;
  onEditTask: (task: Task) => void;
  onEditNote: (note: Note) => void;
  onSelectTagFilter: (tagId: string) => void;
}

export function SearchScreen({
  workspace,
  onOpenProject,
  onEditTask,
  onEditNote,
  onSelectTagFilter,
}: SearchScreenProps) {
  const { spacing, palette } = useTheme();
  const [query, setQuery] = useState('');

  const trimmed = query.trim().toLowerCase();

  const matchedProjects = trimmed
    ? workspace.projects.filter(
        (p) =>
          p.title.toLowerCase().includes(trimmed) ||
          p.description.toLowerCase().includes(trimmed)
      )
    : [];

  const matchedTasks = trimmed
    ? workspace.tasks.filter((t) => t.title.toLowerCase().includes(trimmed))
    : [];

  const matchedNotes = trimmed
    ? workspace.notes.filter(
        (n) =>
          n.title.toLowerCase().includes(trimmed) ||
          n.body.toLowerCase().includes(trimmed)
      )
    : [];

  const matchedTags = trimmed
    ? workspace.tags.filter((t) => t.title.toLowerCase().includes(trimmed))
    : [];

  const totalMatches =
    matchedProjects.length +
    matchedTasks.length +
    matchedNotes.length +
    matchedTags.length;

  return (
    <View testID="search-screen" style={{ gap: spacing.md }}>
      <Field
        testID="search-query-input"
        label="Search workspace"
        placeholder="Type keyword to search projects, tasks, notes, or tags..."
        value={query}
        onChangeText={setQuery}
        autoFocus
      />

      {!trimmed ? (
        <EmptyState
          testID="search-prompt-empty"
          title="Search workspace"
          description="Type keywords above to find matching projects, tasks, notes, or tags."
        />
      ) : totalMatches === 0 ? (
        <EmptyState
          testID="search-no-results"
          title="No items found"
          description={`No projects, tasks, notes, or tags match "${query.trim()}".`}
        />
      ) : (
        <View style={{ gap: spacing.lg }}>
          {/* Projects Matches */}
          {matchedProjects.length > 0 ? (
            <Surface testID="search-results-projects">
              <UiText variant="heading" style={{ marginBottom: spacing.sm }}>
                Projects ({matchedProjects.length})
              </UiText>
              <View style={{ borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}>
                {matchedProjects.map((p) => (
                  <ExpoListRow
                    key={p.id}
                    testID={`search-project-${p.id}`}
                    title={p.title}
                    subtitle={p.description || 'No description'}
                    onPress={() => onOpenProject(p.id)}
                  />
                ))}
              </View>
            </Surface>
          ) : null}

          {/* Tasks Matches */}
          {matchedTasks.length > 0 ? (
            <Surface testID="search-results-tasks">
              <UiText variant="heading" style={{ marginBottom: spacing.sm }}>
                Tasks ({matchedTasks.length})
              </UiText>
              <View style={{ borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}>
                {matchedTasks.map((t) => {
                  const proj = workspace.projects.find((p) => p.id === t.projectId);
                  return (
                    <ExpoListRow
                      key={t.id}
                      testID={`search-task-${t.id}`}
                      title={t.title}
                      subtitle={`${t.status.toUpperCase()} · ${proj ? proj.title : 'Inbox'}`}
                      onPress={() => onEditTask(t)}
                    />
                  );
                })}
              </View>
            </Surface>
          ) : null}

          {/* Notes Matches */}
          {matchedNotes.length > 0 ? (
            <Surface testID="search-results-notes">
              <UiText variant="heading" style={{ marginBottom: spacing.sm }}>
                Notes ({matchedNotes.length})
              </UiText>
              <View style={{ borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}>
                {matchedNotes.map((n) => {
                  const proj = workspace.projects.find((p) => p.id === n.projectId);
                  return (
                    <ExpoListRow
                      key={n.id}
                      testID={`search-note-${n.id}`}
                      title={n.title}
                      subtitle={`${proj ? proj.title : 'Unassigned'} · ${n.body.slice(0, 50)}...`}
                      onPress={() => onEditNote(n)}
                    />
                  );
                })}
              </View>
            </Surface>
          ) : null}

          {/* Tags Matches */}
          {matchedTags.length > 0 ? (
            <Surface testID="search-results-tags">
              <UiText variant="heading" style={{ marginBottom: spacing.sm }}>
                Tags ({matchedTags.length})
              </UiText>
              <View style={{ borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: palette.border }}>
                {matchedTags.map((tag) => {
                  const taskCount = workspace.tasks.filter((t) => t.tagIds.includes(tag.id)).length;
                  return (
                    <ExpoListRow
                      key={tag.id}
                      testID={`search-tag-${tag.id}`}
                      title={tag.title}
                      subtitle={`${taskCount} linked task(s) — tap to filter tasks`}
                      onPress={() => onSelectTagFilter(tag.id)}
                    />
                  );
                })}
              </View>
            </Surface>
          ) : null}
        </View>
      )}
    </View>
  );
}

// ============================================================================
// 8. Settings Screen
// ============================================================================

export interface SettingsScreenProps {
  workspace: Workspace;
  onThemeChange: (theme: 'light' | 'dark') => void;
  onCreateTag: (title: string) => Promise<boolean>;
  onRenameTag: (tagId: string, title: string) => Promise<boolean>;
  onDeleteTag: (tag: Tag) => void;
  busy: boolean;
}

export function SettingsScreen({
  workspace,
  onThemeChange,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
  busy,
}: SettingsScreenProps) {
  const { spacing, palette } = useTheme();

  const [newTagTitle, setNewTagTitle] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  const [renamingTagId, setRenamingTagId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);

  const handleCreateTag = async () => {
    const trimmed = newTagTitle.trim();
    if (!trimmed) {
      setTagError('Tag name is required.');
      return;
    }
    setTagError(null);
    const success = await onCreateTag(trimmed);
    if (success) {
      setNewTagTitle('');
    } else {
      setTagError('Tag already exists or failed to save.');
    }
  };

  const handleStartRename = (tag: Tag) => {
    setRenamingTagId(tag.id);
    setRenameTitle(tag.title);
    setRenameError(null);
  };

  const handleSaveRename = async (tagId: string) => {
    const trimmed = renameTitle.trim();
    if (!trimmed) {
      setRenameError('Tag name is required.');
      return;
    }
    setRenameError(null);
    const success = await onRenameTag(tagId, trimmed);
    if (success) {
      setRenamingTagId(null);
      setRenameTitle('');
    } else {
      setRenameError('Tag title already exists or failed to update.');
    }
  };

  return (
    <View testID="settings-screen" style={{ gap: spacing.lg }}>
      {/* Theme Settings */}
      <Surface testID="settings-theme-card">
        <UiText variant="heading" style={{ marginBottom: spacing.xs }}>
          Appearance
        </UiText>
        <UiText variant="caption" style={{ color: palette.muted, marginBottom: spacing.md }}>
          Theme preference is stored directly in your local workspace.
        </UiText>
        <ExpoSegments
          testID="theme-toggle-control"
          options={[
            { id: 'light', label: 'Light' },
            { id: 'dark', label: 'Dark' },
          ]}
          value={workspace.theme}
          onChange={(val) => onThemeChange(val as 'light' | 'dark')}
        />
      </Surface>

      {/* Local Storage Information */}
      <Surface testID="settings-storage-card">
        <UiText variant="heading" style={{ marginBottom: spacing.xs }}>
          Local-First Storage
        </UiText>
        <UiText variant="body" style={{ color: palette.text, marginBottom: spacing.sm }}>
          This workspace operates strictly on-device using local storage. No remote servers, cloud sync, or external analytics are configured.
        </UiText>
        <UiText variant="caption" style={{ color: palette.muted }}>
          Schema: v{workspace.version} · Items: {workspace.projects.length} project(s), {workspace.tasks.length} task(s), {workspace.notes.length} note(s), {workspace.tags.length} tag(s).
        </UiText>
      </Surface>

      {/* Tags Management */}
      <Surface testID="settings-tags-card">
        <UiText variant="heading" style={{ marginBottom: spacing.xs }}>
          Workspace Tags
        </UiText>
        <UiText variant="caption" style={{ color: palette.muted, marginBottom: spacing.md }}>
          Tags categorize tasks and notes. Deleting a tag cleanly unlinks it across all items.
        </UiText>

        {/* Add Tag Form */}
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Field
              testID="new-tag-input"
              label="New tag name"
              placeholder="e.g. Focus, Urgent, Design"
              value={newTagTitle}
              onChangeText={(text) => {
                setNewTagTitle(text);
                if (tagError) setTagError(null);
              }}
              error={tagError ?? undefined}
            />
          </View>
          <Button
            label="Add Tag"
            onPress={handleCreateTag}
            testID="add-tag-btn"
            disabled={busy}
            style={{ marginTop: 24 }}
          />
        </View>

        {/* Existing Tags List */}
        <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
          {workspace.tags.length === 0 ? (
            <UiText variant="caption" style={{ color: palette.muted }}>
              No tags defined yet.
            </UiText>
          ) : (
            workspace.tags.map((tag) => {
              const isRenaming = renamingTagId === tag.id;
              const linkedTasks = workspace.tasks.filter((t) => t.tagIds.includes(tag.id)).length;
              const linkedNotes = workspace.notes.filter((n) => n.tagIds.includes(tag.id)).length;

              if (isRenaming) {
                return (
                  <Surface key={tag.id} style={{ gap: spacing.sm, borderWidth: 1, borderColor: palette.accent }}>
                    <Field
                      label="Rename tag"
                      value={renameTitle}
                      onChangeText={(t) => {
                        setRenameTitle(t);
                        if (renameError) setRenameError(null);
                      }}
                      error={renameError ?? undefined}
                    />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }}>
                      <WorkspaceButton label="Cancel" variant="secondary" onPress={() => setRenamingTagId(null)} />
                      <Button label="Save" onPress={() => handleSaveRename(tag.id)} disabled={busy} />
                    </View>
                  </Surface>
                );
              }

              return (
                <Surface key={tag.id} testID={`tag-row-${tag.id}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: spacing.sm }}>
                  <View style={{ flex: 1, minWidth: 140 }}>
                    <UiText variant="heading" style={{ fontSize: 16 }}>{tag.title}</UiText>
                    <UiText variant="caption" style={{ color: palette.muted }}>
                      {linkedTasks} task(s) · {linkedNotes} note(s)
                    </UiText>
                  </View>
                  <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                    <Button
                      label="Rename"
                      variant="secondary"
                      onPress={() => handleStartRename(tag)}
                      testID={`tag-rename-${tag.id}`}
                      disabled={busy}
                    />
                    <Button
                      label="Delete"
                      variant="danger"
                      onPress={() => onDeleteTag(tag)}
                      testID={`tag-delete-${tag.id}`}
                      disabled={busy}
                    />
                  </View>
                </Surface>
              );
            })
          )}
        </View>
      </Surface>
    </View>
  );
}

// ============================================================================
// Forms: TaskForm, ProjectForm, NoteForm
// ============================================================================

export interface TaskFormProps {
  task: Task | 'new' | { initialProjectId?: string | null };
  projects: Project[];
  tags: Tag[];
  onSave: (data: { title: string; status: Status; projectId: string | null; tagIds: string[] }) => Promise<boolean>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onDelete?: (task: Task) => void;
  busy: boolean;
}

export function TaskForm({
  task,
  projects,
  tags,
  onSave,
  onCancel,
  onDirtyChange,
  onDelete,
  busy,
}: TaskFormProps) {
  const { spacing } = useTheme();

  const isExisting = typeof task === 'object' && 'id' in task;
  const initialProjectId =
    typeof task === 'object' && 'projectId' in task ? task.projectId : (task as { initialProjectId?: string | null }).initialProjectId ?? null;

  const [title, setTitle] = useState(isExisting ? (task as Task).title : '');
  const [status, setStatus] = useState<Status>(isExisting ? (task as Task).status : 'todo');
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [tagIds, setTagIds] = useState<string[]>(isExisting ? (task as Task).tagIds : []);

  const dirty = title !== (isExisting ? task.title : '') || status !== (isExisting ? task.status : 'todo') || projectId !== initialProjectId || JSON.stringify([...tagIds].sort()) !== JSON.stringify(isExisting ? [...task.tagIds].sort() : []);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleTag = (id: string) => {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError('Task title cannot be empty.');
      return;
    }
    setTitleError(null);
    setSubmitError(null);

    const success = await onSave({
      title: trimmed,
      status,
      projectId,
      tagIds,
    });

    if (!success) {
      setSubmitError('Failed to save task. Please inspect your inputs and retry.');
    }
  };

  return (
    <Surface testID="task-form" style={{ gap: spacing.md }}>
      {submitError ? (
        <Feedback tone="error" message={submitError} />
      ) : null}

      <Field
        testID="task-title-input"
        label="Title *"
        placeholder="What needs to be done?"
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (titleError) setTitleError(null);
        }}
        error={titleError ?? undefined}
        autoFocus
      />

      <View style={{ gap: spacing.xs }}>
        <UiText variant="caption" style={{ fontWeight: '600' }}>Status</UiText>
        <ExpoSegments
          testID="task-status-control"
          options={[
            { id: 'todo', label: 'To Do' },
            { id: 'doing', label: 'In Progress' },
            { id: 'done', label: 'Done' },
          ]}
          value={status}
          onChange={(val) => setStatus(val as Status)}
        />
      </View>

      <View style={{ gap: spacing.xs }}>
        <ExpoPicker
          testID="task-project-picker"
          label="Project Assignment"
          value={projectId ?? ''}
          onValueChange={(value) => setProjectId(value || null)}
          options={[
            { value: '', label: 'Unassigned (Inbox)' },
            ...projects.map((project) => ({ value: project.id, label: project.title })),
          ]}
        />
      </View>

      {tags.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <UiText variant="caption" style={{ fontWeight: '600' }}>Tags</UiText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: spacing.xs }}>
            {tags.map((t) => {
              const selected = tagIds.includes(t.id);
              return (
                <ExpoFilterChip
                  key={t.id}
                  label={t.title}
                  selected={selected}
                  onPress={() => toggleTag(t.id)}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        {isExisting && onDelete ? (
          <Button
            label="Delete Task"
            variant="danger"
            onPress={() => onDelete(task as Task)}
            testID="task-delete-in-form-btn"
            disabled={busy}
          />
        ) : null}
        <Button
          label="Cancel"
          variant="secondary"
          onPress={onCancel}
          testID="task-cancel-btn"
        />
        <Button
          label="Save Task"
          onPress={handleSave}
          testID="task-save-btn"
          disabled={busy}
        />
      </View>
    </Surface>
  );
}

export interface ProjectFormProps {
  project: Project | 'new';
  onSave: (data: { title: string; description: string }) => Promise<boolean>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  busy: boolean;
}

export function ProjectForm({
  project,
  onSave,
  onCancel,
  onDirtyChange,
  busy,
}: ProjectFormProps) {
  const { spacing } = useTheme();

  const isExisting = typeof project === 'object' && 'id' in project;

  const [title, setTitle] = useState(isExisting ? (project as Project).title : '');
  const [description, setDescription] = useState(isExisting ? (project as Project).description : '');
  const dirty = title !== (isExisting ? project.title : '') || description !== (isExisting ? project.description : '');
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError('Project title cannot be empty.');
      return;
    }
    setTitleError(null);
    setSubmitError(null);

    const success = await onSave({
      title: trimmed,
      description: description.trim(),
    });

    if (!success) {
      setSubmitError('Failed to save project. Please inspect your inputs and retry.');
    }
  };

  return (
    <Surface testID="project-form" style={{ gap: spacing.md }}>
      {submitError ? (
        <Feedback tone="error" message={submitError} />
      ) : null}

      <Field
        testID="project-title-input"
        label="Project Title *"
        placeholder="e.g. Q4 Launch, Website Redesign"
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (titleError) setTitleError(null);
        }}
        error={titleError ?? undefined}
        autoFocus
      />

      <Field
        testID="project-desc-input"
        label="Description"
        placeholder="Outline goals, scopes, or criteria..."
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        <WorkspaceButton label="Cancel" variant="secondary" onPress={onCancel} testID="project-cancel-btn" />
        <WorkspaceButton label="Save Project" onPress={handleSave} testID="project-save-btn" disabled={busy} />
      </View>
    </Surface>
  );
}

export interface NoteFormProps {
  note: Note | 'new' | { initialProjectId?: string | null };
  projects: Project[];
  tags: Tag[];
  onSave: (data: { title: string; body: string; projectId: string | null; tagIds: string[] }) => Promise<boolean>;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onDelete?: (note: Note) => void;
  busy: boolean;
}

export function NoteForm({
  note,
  projects,
  tags,
  onSave,
  onCancel,
  onDirtyChange,
  onDelete,
  busy,
}: NoteFormProps) {
  const { spacing } = useTheme();

  const isExisting = typeof note === 'object' && 'id' in note;
  const initialProjectId =
    typeof note === 'object' && 'projectId' in note ? note.projectId : (note as { initialProjectId?: string | null }).initialProjectId ?? null;

  const [title, setTitle] = useState(isExisting ? (note as Note).title : '');
  const [body, setBody] = useState(isExisting ? (note as Note).body : '');
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [tagIds, setTagIds] = useState<string[]>(isExisting ? (note as Note).tagIds : []);

  const dirty = title !== (isExisting ? note.title : '') || body !== (isExisting ? note.body : '') || projectId !== initialProjectId || JSON.stringify([...tagIds].sort()) !== JSON.stringify(isExisting ? [...note.tagIds].sort() : []);
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const toggleTag = (id: string) => {
    setTagIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) {
      setTitleError('Note title cannot be empty.');
      return;
    }
    setTitleError(null);
    setSubmitError(null);

    const success = await onSave({
      title: trimmed,
      body: body.trim(),
      projectId,
      tagIds,
    });

    if (!success) {
      setSubmitError('Failed to save note. Please inspect your inputs and retry.');
    }
  };

  return (
    <Surface testID="note-form" style={{ gap: spacing.md }}>
      {submitError ? (
        <Feedback tone="error" message={submitError} />
      ) : null}

      <Field
        testID="note-title-input"
        label="Title *"
        placeholder="Note title..."
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          if (titleError) setTitleError(null);
        }}
        error={titleError ?? undefined}
        autoFocus
      />

      <Field
        testID="note-body-input"
        label="Body"
        placeholder="Write note contents, markdown, or thoughts..."
        value={body}
        onChangeText={setBody}
        multiline
        numberOfLines={6}
      />

      <View style={{ gap: spacing.xs }}>
        <ExpoPicker
          testID="note-project-picker"
          label="Project Assignment"
          value={projectId ?? ''}
          onValueChange={(value) => setProjectId(value || null)}
          options={[
            { value: '', label: 'Unassigned' },
            ...projects.map((project) => ({ value: project.id, label: project.title })),
          ]}
        />
      </View>

      {tags.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <UiText variant="caption" style={{ fontWeight: '600' }}>Tags</UiText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: spacing.xs }}>
            {tags.map((t) => {
              const selected = tagIds.includes(t.id);
              return (
                <ExpoFilterChip
                  key={t.id}
                  label={t.title}
                  selected={selected}
                  onPress={() => toggleTag(t.id)}
                />
              );
            })}
          </ScrollView>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
        {isExisting && onDelete ? (
          <Button
            label="Delete Note"
            variant="danger"
            onPress={() => onDelete(note as Note)}
            testID="note-delete-in-form-btn"
            disabled={busy}
          />
        ) : null}
        <WorkspaceButton label="Cancel" variant="secondary" onPress={onCancel} testID="note-cancel-btn" />
        <WorkspaceButton label="Save Note" onPress={handleSave} testID="note-save-btn" disabled={busy} />
      </View>
    </Surface>
  );
}
