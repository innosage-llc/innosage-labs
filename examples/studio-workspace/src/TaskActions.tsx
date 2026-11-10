export interface TaskActionsProps {
  title: string;
  nextStatusLabel: string;
  disabled: boolean;
  onChangeStatus: () => void;
  onDelete: () => void;
}

export function TaskActions(_props: TaskActionsProps) {
  return null;
}
