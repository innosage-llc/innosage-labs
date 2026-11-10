export type Destination = 'overview' | 'inbox' | 'projects' | 'tasks' | 'notes';
export interface NavigationProps {
  currentScreen: string;
  onNavigate: (destination: Destination) => void;
}
export function WorkspaceNavigation(_props: NavigationProps) { return null; }
