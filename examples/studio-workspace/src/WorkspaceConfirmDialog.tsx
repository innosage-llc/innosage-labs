import { ConfirmDialog, type ConfirmDialogProps } from '../ui';

export type { ConfirmDialogProps } from '../ui';

export function WorkspaceConfirmDialog(props: ConfirmDialogProps) {
  return <ConfirmDialog {...props} />;
}
