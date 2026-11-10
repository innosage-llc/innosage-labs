import './global.css';
import { WorkspaceNavigation } from './src/WorkspaceNavigation';
import { WorkspaceConfirmDialog } from './src/WorkspaceConfirmDialog';
import { WorkspaceFeedback } from './src/WorkspaceFeedback';
import { WorkspaceButton } from './src/WorkspaceButton';
import { BottomSheet, Button as ExpoButton, Column, Text as ExpoText } from '@expo/ui';



import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, Platform, ScrollView, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import {
  AppShell,
  Button,
  Chip,
  Feedback,
  ThemeProvider,
  UiText,
  useTheme,
} from './ui';
import { useWorkspace } from './src/useWorkspace';
import { WorkspaceTopBar, type TopBarAction } from './src/WorkspaceTopBar';
import {
  demoWorkspace,
  emptyWorkspace,
  newId,
  removeProject,
  removeTag,
  type Note,
  type Project,
  type Status,
  type Tag,
  type Task,
} from './src/model';

import {
  InboxScreen,
  NoteForm,
  NotesScreen,
  OverviewScreen,
  ProjectDetailScreen,
  ProjectForm,
  ProjectsScreen,
  SearchScreen,
  SettingsScreen,
  TaskForm,
  TasksScreen,
} from './src/screens';

type Screen =
  | 'overview'
  | 'inbox'
  | 'projects'
  | 'project-detail'
  | 'tasks'
  | 'notes'
  | 'search'
  | 'settings';

interface ConfirmDialogState {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}

interface FeedbackState {
  message: string;
  tone?: 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

interface WorkspaceAppProps {
  state: ReturnType<typeof useWorkspace>['state'];
  ready: boolean;
  busy: boolean;
  error: string | null;
  commit: ReturnType<typeof useWorkspace>['commit'];
  retry: ReturnType<typeof useWorkspace>['retry'];
}

function WorkspaceApp({ state, ready, busy, error, commit, retry }: WorkspaceAppProps) {
  const [captureOpen, setCaptureOpen] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<Screen>('overview');
  const [auxiliaryOrigin, setAuxiliaryOrigin] = useState<Screen>('overview');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [taskFilterTagId, setTaskFilterTagId] = useState<string | null>(null);

  const [editingTask, setEditingTask] = useState<
    Task | 'new' | { initialProjectId?: string | null } | null
  >(null);
  const [editingProject, setEditingProject] = useState<Project | 'new' | null>(null);
  const [editingNote, setEditingNote] = useState<
    Note | 'new' | { initialProjectId?: string | null } | null
  >(null);

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);


  const [formDirty, setFormDirty] = useState(false);
  const { palette } = useTheme();
  const android = Platform.OS === 'android';
  const mobile = android || Platform.OS === 'ios';

  // Close any active form
  const closeAnyForm = useCallback(() => {
    setEditingTask(null);
    setEditingProject(null);
    setEditingNote(null);
  }, []);

  const dismissForm = useCallback(() => {
    if (busy) return;
    if (!formDirty) {
      closeAnyForm();
      return;
    }
    setConfirmDialog({
      title: 'Discard changes?',
      message: 'Your unsaved changes will be lost.',
      confirmLabel: 'Discard',
      onConfirm: () => {
        setConfirmDialog(null);
        closeAnyForm();
      },
    });
  }, [busy, closeAnyForm, formDirty]);

  const isFormActive =
    editingTask !== null || editingProject !== null || editingNote !== null;
  const isAuxiliaryScreen = currentScreen === 'search' || currentScreen === 'settings';
  const openAuxiliaryScreen = (screen: 'search' | 'settings') => {
    if (!isAuxiliaryScreen) setAuxiliaryOrigin(currentScreen);
    setCurrentScreen(screen);
  };

  const handleBackPress = useCallback(() => {
    if (confirmDialog) {
      setConfirmDialog(null);
      return true;
    }
    if (isFormActive) {
      dismissForm();
      return true;
    }
    if (mobile && isAuxiliaryScreen) {
      setCurrentScreen(auxiliaryOrigin);
      return true;
    }
    if (currentScreen === 'project-detail') {
      setCurrentScreen('projects');
      setSelectedProjectId(null);
      return true;
    }
    if (currentScreen !== 'overview') {
      setCurrentScreen('overview');
      return true;
    }
    return false;
  }, [confirmDialog, isFormActive, dismissForm, mobile, isAuxiliaryScreen, auxiliaryOrigin, currentScreen]);
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      handleBackPress
    );
    return () => subscription.remove();
  }, [handleBackPress]);

  // Loading error state (do NOT auto-reseed, show Retry)
  if (!ready && error) {
    return (
      <View
        testID="workspace-load-error"
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          gap: 16,
        }}
      >
        <Feedback
          testID="load-error-feedback"
          tone="error"
          message={error}
          actionLabel="Retry"
          onAction={() => void retry()}
        />
        <WorkspaceButton
          testID="load-error-retry-btn"
          label="Retry loading workspace"
          onPress={() => void retry()}
          disabled={busy}
        />
      </View>
    );
  }

  // Initial loading state
  if (!ready) {
    return (
      <View
        testID="workspace-loading-state"
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}
      >
        <UiText variant="heading">Loading workspace...</UiText>
      </View>
    );
  }

  // Active project
  const currentProject = selectedProjectId
    ? state.projects.find((p) => p.id === selectedProjectId) ?? null
    : null;

  // Handlers for Task mutations
  const handleSaveTask = async (data: {
    title: string;
    status: Status;
    projectId: string | null;
    tagIds: string[];
  }): Promise<boolean> => {
    const isEditingExisting =
      typeof editingTask === 'object' && editingTask !== null && 'id' in editingTask;
    const existingId = isEditingExisting ? (editingTask as Task).id : null;

    const success = await commit((prev) => {
      const validProjectId =
        data.projectId && prev.projects.some((p) => p.id === data.projectId)
          ? data.projectId
          : null;
      const validTagIds = data.tagIds.filter((id) => prev.tags.some((t) => t.id === id));

      if (isEditingExisting && existingId) {
        const index = prev.tasks.findIndex((t) => t.id === existingId);
        if (index === -1) {
          throw new Error('Task was deleted and cannot be updated.');
        }
        const updated: Task = {
          id: existingId,
          title: data.title,
          status: data.status,
          projectId: validProjectId,
          tagIds: validTagIds,
        };
        const nextTasks = [...prev.tasks];
        nextTasks[index] = updated;
        return { ...prev, tasks: nextTasks };
      } else {
        const newTask: Task = {
          id: newId(),
          title: data.title,
          status: data.status,
          projectId: validProjectId,
          tagIds: validTagIds,
        };
        return { ...prev, tasks: [...prev.tasks, newTask] };
      }
    });

    if (success) {
      setEditingTask(null);
      setFeedback({
        message: isEditingExisting ? 'Task updated.' : 'Task created.',
        tone: 'success',
      });
      return true;
    }
    return false;
  };

  const handleToggleTaskStatus = async (task: Task, nextStatus: Status) => {
    await commit((prev) => {
      const index = prev.tasks.findIndex((t) => t.id === task.id);
      if (index === -1) return prev;
      const nextTasks = [...prev.tasks];
      nextTasks[index] = { ...prev.tasks[index], status: nextStatus };
      return { ...prev, tasks: nextTasks };
    });
  };

  const handleDeleteTask = (task: Task) => {
    setConfirmDialog({
      title: 'Delete Task',
      message: `Are you sure you want to delete "${task.title}"?`,
      confirmLabel: 'Delete Task',
      onConfirm: async () => {
        setConfirmDialog(null);
        const success = await commit((prev) => ({
          ...prev,
          tasks: prev.tasks.filter((t) => t.id !== task.id),
        }));

        if (success) {
          if (editingTask && typeof editingTask === 'object' && 'id' in editingTask && editingTask.id === task.id) {
            setEditingTask(null);
          }
          setFeedback({
            message: `Task "${task.title}" deleted.`,
            tone: 'success',
            actionLabel: 'Undo',
            onAction: async () => {
              const toRestore = task;
              const restoredSuccessfully = await commit((prev) => {
                const validProjectId =
                  toRestore.projectId && prev.projects.some((p) => p.id === toRestore.projectId)
                    ? toRestore.projectId
                    : null;
                const validTagIds = toRestore.tagIds.filter((id) =>
                  prev.tags.some((t) => t.id === id)
                );
                const restored: Task = {
                  ...toRestore,
                  projectId: validProjectId,
                  tagIds: validTagIds,
                };
                return {
                  ...prev,
                  tasks: [...prev.tasks.filter((t) => t.id !== toRestore.id), restored],
                };
              });
              if (restoredSuccessfully) setFeedback(null);
            },
          });
        }
      },
    });
  };

  const handleBatchCompleteTasks = async (selectedIds: string[]) => {
    const eligibleIds = state.tasks.filter((task) => task.status !== 'done' && selectedIds.includes(task.id)).map((task) => task.id);
    if (eligibleIds.length === 0) return true;
    const success = await commit((prev) => ({
      ...prev,
      tasks: prev.tasks.map((task) =>
        eligibleIds.includes(task.id) ? { ...task, status: 'done' } : task
      ),
    }));
    if (success) {
      setFeedback({
        message: `Completed ${eligibleIds.length} task(s).`,
        tone: 'success',
      });
    }
    return success;
  };

  // Handlers for Project mutations
  const handleSaveProject = async (data: {
    title: string;
    description: string;
  }): Promise<boolean> => {
    const isEditingExisting =
      typeof editingProject === 'object' && editingProject !== null && 'id' in editingProject;
    const existingId = isEditingExisting ? (editingProject as Project).id : null;

    const success = await commit((prev) => {
      if (isEditingExisting && existingId) {
        const index = prev.projects.findIndex((p) => p.id === existingId);
        if (index === -1) {
          throw new Error('Project was deleted and cannot be updated.');
        }
        const updated: Project = {
          id: existingId,
          title: data.title,
          description: data.description,
        };
        const nextProjects = [...prev.projects];
        nextProjects[index] = updated;
        return { ...prev, projects: nextProjects };
      } else {
        const newProj: Project = {
          id: newId(),
          title: data.title,
          description: data.description,
        };
        return { ...prev, projects: [...prev.projects, newProj] };
      }
    });

    if (success) {
      setEditingProject(null);
      setFeedback({
        message: isEditingExisting ? 'Project updated.' : 'Project created.',
        tone: 'success',
      });
      return true;
    }
    return false;
  };

  const handleDeleteProject = (project: Project) => {
    setConfirmDialog({
      title: 'Delete Project',
      message: `Are you sure you want to delete "${project.title}"? Associated tasks and notes will be kept and unassigned (moved to Inbox / unassigned).`,
      confirmLabel: 'Delete Project',
      onConfirm: async () => {
        setConfirmDialog(null);
        const success = await commit((prev) => removeProject(prev, project.id));
        if (success) {
          if (selectedProjectId === project.id) {
            setSelectedProjectId(null);
            setCurrentScreen('projects');
          }
          setFeedback({
            message: `Project "${project.title}" deleted. Tasks and notes are now unassigned.`,
            tone: 'success',
          });
        }
      },
    });
  };

  // Handlers for Note mutations
  const handleSaveNote = async (data: {
    title: string;
    body: string;
    projectId: string | null;
    tagIds: string[];
  }): Promise<boolean> => {
    const isEditingExisting =
      typeof editingNote === 'object' && editingNote !== null && 'id' in editingNote;
    const existingId = isEditingExisting ? (editingNote as Note).id : null;

    const success = await commit((prev) => {
      const validProjectId =
        data.projectId && prev.projects.some((p) => p.id === data.projectId)
          ? data.projectId
          : null;
      const validTagIds = data.tagIds.filter((id) => prev.tags.some((t) => t.id === id));

      if (isEditingExisting && existingId) {
        const index = prev.notes.findIndex((n) => n.id === existingId);
        if (index === -1) {
          throw new Error('Note was deleted and cannot be updated.');
        }
        const updated: Note = {
          id: existingId,
          title: data.title,
          body: data.body,
          projectId: validProjectId,
          tagIds: validTagIds,
        };
        const nextNotes = [...prev.notes];
        nextNotes[index] = updated;
        return { ...prev, notes: nextNotes };
      } else {
        const newN: Note = {
          id: newId(),
          title: data.title,
          body: data.body,
          projectId: validProjectId,
          tagIds: validTagIds,
        };
        return { ...prev, notes: [...prev.notes, newN] };
      }
    });

    if (success) {
      setEditingNote(null);
      setFeedback({
        message: isEditingExisting ? 'Note updated.' : 'Note created.',
        tone: 'success',
      });
      return true;
    }
    return false;
  };

  const handleDeleteNote = (note: Note) => {
    setConfirmDialog({
      title: 'Delete Note',
      message: `Are you sure you want to delete note "${note.title}"?`,
      confirmLabel: 'Delete Note',
      onConfirm: async () => {
        setConfirmDialog(null);
        const success = await commit((prev) => ({
          ...prev,
          notes: prev.notes.filter((n) => n.id !== note.id),
        }));

        if (success) {
          if (editingNote && typeof editingNote === 'object' && 'id' in editingNote && editingNote.id === note.id) {
            setEditingNote(null);
          }
          setFeedback({
            message: `Note "${note.title}" deleted.`,
            tone: 'success',
            actionLabel: 'Undo',
            onAction: async () => {
              const toRestore = note;
              const restoredSuccessfully = await commit((prev) => {
                const validProjectId =
                  toRestore.projectId && prev.projects.some((p) => p.id === toRestore.projectId)
                    ? toRestore.projectId
                    : null;
                const validTagIds = toRestore.tagIds.filter((id) =>
                  prev.tags.some((t) => t.id === id)
                );
                const restored: Note = {
                  ...toRestore,
                  projectId: validProjectId,
                  tagIds: validTagIds,
                };
                return {
                  ...prev,
                  notes: [...prev.notes.filter((n) => n.id !== toRestore.id), restored],
                };
              });
              if (restoredSuccessfully) setFeedback(null);
            },
          });
        }
      },
    });
  };

  // Handlers for Tags and Settings
  const handleThemeChange = async (theme: 'light' | 'dark') => {
    await commit((prev) => ({ ...prev, theme }));
  };

  const handleCreateTag = async (title: string): Promise<boolean> => {
    return await commit((prev) => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error('Tag title cannot be empty.');
      if (prev.tags.some((t) => t.title.toLowerCase() === trimmed.toLowerCase())) {
        throw new Error('A tag with this name already exists.');
      }
      const newT: Tag = { id: newId(), title: trimmed };
      return { ...prev, tags: [...prev.tags, newT] };
    });
  };

  const handleRenameTag = async (tagId: string, title: string): Promise<boolean> => {
    return await commit((prev) => {
      const trimmed = title.trim();
      if (!trimmed) throw new Error('Tag title cannot be empty.');
      const index = prev.tags.findIndex((t) => t.id === tagId);
      if (index === -1) throw new Error('Tag was deleted.');
      if (
        prev.tags.some(
          (t) => t.id !== tagId && t.title.toLowerCase() === trimmed.toLowerCase()
        )
      ) {
        throw new Error('A tag with this name already exists.');
      }
      const updated: Tag = { id: tagId, title: trimmed };
      const nextTags = [...prev.tags];
      nextTags[index] = updated;
      return { ...prev, tags: nextTags };
    });
  };

  const handleDeleteTag = (tag: Tag) => {
    setConfirmDialog({
      title: 'Delete Tag',
      message: `Are you sure you want to delete tag "${tag.title}"? It will be removed from all tasks and notes.`,
      confirmLabel: 'Delete Tag',
      onConfirm: async () => {
        setConfirmDialog(null);
        const success = await commit((prev) => removeTag(prev, tag.id));
        if (success) {
          setFeedback({
            message: `Tag "${tag.title}" deleted and removed from references.`,
            tone: 'success',
          });
        }
      },
    });
  };

  const handleLoadDemoWorkspace = async () => {
    const success = await commit((prev) => {
      if (
        prev.projects.length > 0 ||
        prev.tasks.length > 0 ||
        prev.notes.length > 0 ||
        prev.tags.length > 0
      ) {
        throw new Error('Workspace is not empty. Demo data was not loaded.');
      }
      return { ...demoWorkspace(), theme: prev.theme };
    });

    if (success) {
      setFeedback({ message: 'Loaded synthetic demo workspace.', tone: 'success' });
    }
  };

  // Determine AppShell Title, Subtitle, and Header Actions
  let shellTitle = 'Studio Workspace';
  let shellSubtitle = 'Local-first productivity';
  let primaryAction: TopBarAction | undefined;

  if (editingTask !== null) {
    shellTitle =
      typeof editingTask === 'object' && 'id' in editingTask
        ? 'Edit Task'
        : 'New Task';
    shellSubtitle = 'Save or discard changes';
  } else if (editingProject !== null) {
    shellTitle =
      typeof editingProject === 'object' && 'id' in editingProject
        ? 'Edit Project'
        : 'New Project';
    shellSubtitle = 'Save or discard changes';
  } else if (editingNote !== null) {
    shellTitle =
      typeof editingNote === 'object' && 'id' in editingNote
        ? 'Edit Note'
        : 'New Note';
    shellSubtitle = 'Save or discard changes';
  } else {
    switch (currentScreen) {
      case 'overview':
        shellTitle = 'Work';
        shellSubtitle = 'Capture and resume your work';
        primaryAction = { label: 'Capture', onPress: () => setCaptureOpen(true), testID: 'header-work-capture' };
        break;
      case 'inbox':
        shellTitle = 'Inbox';
        shellSubtitle = 'Unassigned tasks';
        primaryAction = { label: 'New Task', onPress: () => setEditingTask({ initialProjectId: null }), testID: 'header-inbox-new-task' };
        break;
      case 'projects':
        shellTitle = 'Projects';
        shellSubtitle = `${state.projects.length} project(s)`;
        primaryAction = { label: 'New Project', onPress: () => setEditingProject('new'), testID: 'header-projects-new' };
        break;
      case 'project-detail':
        shellTitle = currentProject ? currentProject.title : 'Project Detail';
        shellSubtitle = 'Project items & scope';
        break;
      case 'tasks':
        shellTitle = 'Tasks';
        shellSubtitle = `${state.tasks.length} total task(s)`;
        primaryAction = { label: 'New Task', onPress: () => setEditingTask('new'), testID: 'header-tasks-new' };
        break;
      case 'notes':
        shellTitle = 'Notes';
        shellSubtitle = `${state.notes.length} note(s)`;
        primaryAction = { label: 'New Note', onPress: () => setEditingNote('new'), testID: 'header-notes-new' };
        break;
      case 'search':
        shellTitle = 'Search';
        shellSubtitle = 'Find across projects, tasks, notes & tags';
        break;
      case 'settings':
        shellTitle = 'Settings';
        shellSubtitle = 'Appearance and local data';
        break;
    }
  }

  const inboxCount = state.tasks.filter((t) => t.projectId === null).length;

  const navigationBar = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <Chip
        testID="nav-overview"
        label="Work"
        selected={!isFormActive && currentScreen === 'overview'}
        onPress={() => {
          closeAnyForm();
          setCurrentScreen('overview');
        }}
      />
      <Chip
        testID="nav-inbox"
        label={`Inbox (${inboxCount})`}
        selected={!isFormActive && currentScreen === 'inbox'}
        onPress={() => {
          closeAnyForm();
          setCurrentScreen('inbox');
        }}
      />
      <Chip
        testID="nav-projects"
        label={`Projects (${state.projects.length})`}
        selected={
          !isFormActive &&
          (currentScreen === 'projects' || currentScreen === 'project-detail')
        }
        onPress={() => {
          closeAnyForm();
          setCurrentScreen('projects');
        }}
      />
      <Chip
        testID="nav-tasks"
        label={`Tasks (${state.tasks.length})`}
        selected={!isFormActive && currentScreen === 'tasks'}
        onPress={() => {
          closeAnyForm();
          setTaskFilterTagId(null);
          setCurrentScreen('tasks');
        }}
      />
      <Chip
        testID="nav-notes"
        label={`Notes (${state.notes.length})`}
        selected={!isFormActive && currentScreen === 'notes'}
        onPress={() => {
          closeAnyForm();
          setCurrentScreen('notes');
        }}
      />
      <Chip
        testID="nav-search"
        label="Search"
        selected={!isFormActive && currentScreen === 'search'}
        onPress={() => {
          closeAnyForm();
          setCurrentScreen('search');
        }}
      />
      <Chip
        testID="nav-settings"
        label="Settings"
        selected={!isFormActive && currentScreen === 'settings'}
        onPress={() => {
          closeAnyForm();
          setCurrentScreen('settings');
        }}
      />
    </ScrollView>
  );

  const showSnackbar = android && !isFormActive && feedback !== null && !error &&
    feedback.tone !== 'error' && !feedback.actionLabel;
  const showBack = isFormActive || currentScreen === 'project-detail' || isAuxiliaryScreen;
  const defaultActions = primaryAction ? <Button {...primaryAction} disabled={busy} /> :
    !isFormActive && currentScreen === 'project-detail' ? (
      <Button label="Back to Projects" variant="secondary" onPress={handleBackPress} testID="header-project-back" />
    ) : null;

  return (
    <View style={{ flex: 1 }}>
    <AppShell
      testID="studio-workspace-app-shell"
      title={shellTitle}
      subtitle={mobile ? undefined : shellSubtitle}
      navigation={!mobile && !isFormActive ? navigationBar : undefined}
      actions={mobile ? undefined : defaultActions}
      header={mobile ? (
        <WorkspaceTopBar
          title={shellTitle}
          busy={busy}
          primaryAction={primaryAction}
          onBack={showBack ? handleBackPress : undefined}
          onSearch={!isFormActive && currentScreen !== 'search' ? () => openAuxiliaryScreen('search') : undefined}
          onSettings={!isFormActive && currentScreen !== 'settings' ? () => openAuxiliaryScreen('settings') : undefined}
        />
      ) : undefined}
    >
      {error && ready ? <Feedback message={error} tone="error" /> : null}
      {/* Global Feedback Banner */}
      {feedback && !isFormActive && !showSnackbar ? (
        <View style={{ marginBottom: 16 }}>
          <Feedback
            testID="global-feedback-banner"
            message={error ? "Previous action" : feedback.message}
            tone={error ? 'error' : feedback.tone ?? 'success'}
            actionLabel={feedback.actionLabel}
            onAction={feedback.onAction}
          />
        </View>
      ) : null}

      {/* Surface Router / Form View */}
      {editingTask !== null ? (
        <TaskForm
          task={editingTask}
          projects={state.projects}
          tags={state.tags}
          onSave={handleSaveTask}
          onCancel={dismissForm}
          onDirtyChange={setFormDirty}
          onDelete={handleDeleteTask}
          busy={busy}
        />
      ) : editingProject !== null ? (
        <ProjectForm
          project={editingProject}
          onSave={handleSaveProject}
          onCancel={dismissForm}
          onDirtyChange={setFormDirty}
          busy={busy}
        />
      ) : editingNote !== null ? (
        <NoteForm
          note={editingNote}
          projects={state.projects}
          tags={state.tags}
          onSave={handleSaveNote}
          onCancel={dismissForm}
          onDirtyChange={setFormDirty}
          onDelete={handleDeleteNote}
          busy={busy}
        />
      ) : currentScreen === 'overview' ? (
        <OverviewScreen
          workspace={state}
          onNavigate={(screen) => setCurrentScreen(screen)}
          onOpenProject={(id) => {
            setSelectedProjectId(id);
            setCurrentScreen('project-detail');
          }}
          onEditTask={(task) => setEditingTask(task)}
          onLoadDemo={handleLoadDemoWorkspace}
          busy={busy}
        />
      ) : currentScreen === 'inbox' ? (
        <InboxScreen
          workspace={state}
          onNewTask={() => setEditingTask({ initialProjectId: null })}
          onEditTask={(task) => setEditingTask(task)}
          onToggleStatus={handleToggleTaskStatus}
          onDeleteTask={handleDeleteTask}
          onBatchComplete={handleBatchCompleteTasks}
          busy={busy}
        />
      ) : currentScreen === 'projects' ? (
        <ProjectsScreen
          workspace={state}
          onNewProject={() => setEditingProject('new')}
          onSelectProject={(id) => {
            setSelectedProjectId(id);
            setCurrentScreen('project-detail');
          }}
          busy={busy}
        />
      ) : currentScreen === 'project-detail' ? (
        currentProject ? (
          <ProjectDetailScreen
            workspace={state}
            project={currentProject}
            onBack={mobile ? undefined : handleBackPress}
            onEditProject={(proj) => setEditingProject(proj)}
            onDeleteProject={handleDeleteProject}
            onNewTask={(projId) => setEditingTask({ initialProjectId: projId })}
            onEditTask={(task) => setEditingTask(task)}
            onToggleStatus={handleToggleTaskStatus}
            onDeleteTask={handleDeleteTask}
            onNewNote={(projId) => setEditingNote({ initialProjectId: projId })}
            onEditNote={(note) => setEditingNote(note)}
            onDeleteNote={handleDeleteNote}
            busy={busy}
          />
        ) : (
          <View style={{ gap: 16 }}>
            <Feedback
              tone="error"
              message="The selected project was not found or was deleted."
              actionLabel="Back to Projects"
              onAction={() => {
                setCurrentScreen('projects');
                setSelectedProjectId(null);
              }}
            />
          </View>
        )
      ) : currentScreen === 'tasks' ? (
        <TasksScreen
          workspace={state}
          initialTagId={taskFilterTagId}
          onNewTask={() => setEditingTask('new')}
          onEditTask={(task) => setEditingTask(task)}
          onToggleStatus={handleToggleTaskStatus}
          onDeleteTask={handleDeleteTask}
          onBatchComplete={handleBatchCompleteTasks}
          busy={busy}
        />
      ) : currentScreen === 'notes' ? (
        <NotesScreen
          workspace={state}
          onNewNote={() => setEditingNote('new')}
          onEditNote={(note) => setEditingNote(note)}
          onDeleteNote={handleDeleteNote}
          busy={busy}
        />
      ) : currentScreen === 'search' ? (
        <SearchScreen
          workspace={state}
          onOpenProject={(id) => {
            setSelectedProjectId(id);
            setCurrentScreen('project-detail');
          }}
          onEditTask={(task) => setEditingTask(task)}
          onEditNote={(note) => setEditingNote(note)}
          onSelectTagFilter={(tagId) => {
            setTaskFilterTagId(tagId);
            setCurrentScreen('tasks');
          }}
        />
      ) : currentScreen === 'settings' ? (
        <View style={{ gap: 16 }}>
          <SettingsScreen
            workspace={state}
            onThemeChange={handleThemeChange}
            onCreateTag={handleCreateTag}
            onRenameTag={handleRenameTag}
            onDeleteTag={handleDeleteTag}
            busy={busy}
          />
          {state.projects.length + state.tasks.length + state.notes.length + state.tags.length === 0 ? (
            <WorkspaceButton label="Load demo workspace" onPress={handleLoadDemoWorkspace} disabled={busy} />
          ) : (
            <Button
              label="Clear workspace"
              variant="danger"
              disabled={busy}
              onPress={() => setConfirmDialog({
                title: 'Clear workspace?',
                message: 'This permanently removes all projects, tasks, notes, and tags on this device.',
                confirmLabel: 'Clear workspace',
                onConfirm: async () => {
                  setConfirmDialog(null);
                  if (await commit((prev) => ({ ...emptyWorkspace(), theme: prev.theme }))) {
                    setTaskFilterTagId(null);
                    setFeedback({ message: 'Workspace cleared.', tone: 'success' });
                  }
                },
              })}
            />
          )}
        </View>
      ) : null}

      {/* Confirmation Dialog Modal */}
      <WorkspaceConfirmDialog
        testID="global-confirm-dialog"
        visible={confirmDialog !== null}
        title={confirmDialog?.title ?? 'Confirm'}
        message={confirmDialog?.message ?? ''}
        confirmLabel={confirmDialog?.confirmLabel ?? 'Confirm'}
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </AppShell>
    {showSnackbar && feedback ? (
      <WorkspaceFeedback
        message={feedback.message}
        testID="global-success-snackbar"
        style={{ position: 'absolute', bottom: 110, left: 16, right: 16, height: 72 }}
        onDismiss={() => setFeedback((current) => current === feedback ? null : current)}
      />
    ) : null}
    {mobile && !isFormActive && (
      <WorkspaceNavigation
        currentScreen={currentScreen}
        onNavigate={(destination) => {
          if (destination === 'tasks') setTaskFilterTagId(null);
          setCurrentScreen(destination);
        }}
      />
    )}
      <BottomSheet
        isPresented={captureOpen}
        onDismiss={() => setCaptureOpen(false)}
        testID="capture-sheet"
        contentPadding={{ top: 8, left: 24, right: 24, bottom: 24 }}
        containerColor={palette.surface}
        contentColor={palette.text}
      >
        <Column spacing={12}>
          <ExpoText textStyle={{ fontSize: 20, fontWeight: 'bold', color: palette.text }}>Capture</ExpoText>
          <ExpoButton label="Task" variant="outlined" testID="capture-task" onPress={() => {
            setCaptureOpen(false);
            setEditingTask('new');
          }} />
          <ExpoButton label="Note" variant="outlined" testID="capture-note" onPress={() => {
            setCaptureOpen(false);
            setEditingNote('new');
          }} />
          <ExpoButton label="Cancel" variant="text" testID="capture-cancel" onPress={() => setCaptureOpen(false)} />
        </Column>
      </BottomSheet>
    </View>
  );
}

function WorkspaceRoot() {
  const { state, ready, busy, error, commit, retry } = useWorkspace();
  return (
    <ThemeProvider mode={state.theme}>
      <WorkspaceApp
        state={state}
        ready={ready}
        busy={busy}
        error={error}
        commit={commit}
        retry={retry}
      />
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <WorkspaceRoot />
    </SafeAreaProvider>
  );
}
