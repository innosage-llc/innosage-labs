import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import type { ConfirmDialogProps } from '../ui';

export type { ConfirmDialogProps } from '../ui';

export function WorkspaceConfirmDialog({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
}: ConfirmDialogProps) {
  const presented = useRef(false);
  const callbacks = useRef({ onCancel, onConfirm });
  callbacks.current = { onCancel, onConfirm };

  useEffect(() => {
    if (!visible) {
      presented.current = false;
      return;
    }
    if (presented.current) return;
    presented.current = true;
    Alert.alert(title, message, [
      { text: cancelLabel, style: 'cancel', onPress: () => callbacks.current.onCancel() },
      { text: confirmLabel, style: 'destructive', onPress: () => callbacks.current.onConfirm() },
    ]);
  }, [visible, title, message, confirmLabel, cancelLabel]);

  return null;
}
