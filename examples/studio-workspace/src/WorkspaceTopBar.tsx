export interface TopBarAction {
  label: string;
  onPress: () => void;
  testID: string;
}

export interface WorkspaceTopBarProps {
  title: string;
  busy: boolean;
  primaryAction?: TopBarAction;
  onBack?: () => void;
  onSearch?: () => void;
  onSettings?: () => void;
}

export function WorkspaceTopBar(_props: WorkspaceTopBarProps) {
  return null;
}
