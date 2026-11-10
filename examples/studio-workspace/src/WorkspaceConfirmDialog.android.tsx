import { AlertDialog, Host, Text, TextButton } from '@expo/ui/jetpack-compose';
import { testID as testIDModifier } from '@expo/ui/jetpack-compose/modifiers';
import { useTheme, type ConfirmDialogProps } from '../ui';

export type { ConfirmDialogProps } from '../ui';

export function WorkspaceConfirmDialog({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  testID,
}: ConfirmDialogProps) {
  const { mode, palette } = useTheme();

  if (!visible) return null;

  return (
    <Host colorScheme={mode} matchContents>
      <AlertDialog
        onDismissRequest={onCancel}
        colors={{
          containerColor: palette.surface,
          titleContentColor: palette.text,
          textContentColor: palette.text,
        }}
        modifiers={testID ? [testIDModifier(testID)] : undefined}
      >
        <AlertDialog.Title>
          <Text style={{ typography: 'titleLarge' }}>{title}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <Text>{message}</Text>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton onClick={onCancel} colors={{ contentColor: palette.muted }}>
            <Text>{cancelLabel}</Text>
          </TextButton>
        </AlertDialog.DismissButton>
        <AlertDialog.ConfirmButton>
          <TextButton onClick={onConfirm} colors={{ contentColor: palette.danger }}>
            <Text>{confirmLabel}</Text>
          </TextButton>
        </AlertDialog.ConfirmButton>
      </AlertDialog>
    </Host>
  );
}
