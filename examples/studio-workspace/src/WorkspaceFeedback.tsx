import { useEffect, useRef, useState } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ui';
import { WorkspaceButton } from './WorkspaceButton';

export type WorkspaceFeedbackDuration = 'short' | 'long';

export interface WorkspaceFeedbackProps {
  message: string;
  tone?: 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  onDismiss?: () => void;
  duration?: WorkspaceFeedbackDuration;
  id?: string | number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function WorkspaceFeedback({
  message,
  tone = 'success',
  actionLabel,
  onAction,
  onDismiss,
  duration = actionLabel ? 'long' : 'short',
  id,
  testID,
  style,
}: WorkspaceFeedbackProps) {
  const { palette, spacing, typography } = useTheme();
  const [visible, setVisible] = useState(true);
  const callbacks = useRef({ onAction, onDismiss });
  callbacks.current = { onAction, onDismiss };

  useEffect(() => {
    setVisible(true);
    const timeout = setTimeout(() => {
      setVisible(false);
      callbacks.current.onDismiss?.();
    }, duration === 'long' ? 10000 : 4000);
    return () => clearTimeout(timeout);
  }, [duration, id, message]);

  if (!visible) return null;
  const toneColor = tone === 'error' ? palette.danger : palette.success;

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: spacing.md,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: toneColor,
          backgroundColor: palette.surface,
          minHeight: 48,
          gap: spacing.sm,
        },
        style,
      ]}
    >
      <Text style={[typography.body, { color: toneColor, flex: 1, fontWeight: '500' }]}>{message}</Text>
      {actionLabel && onAction ? (
        <WorkspaceButton
          label={actionLabel}
          variant="secondary"
          onPress={() => {
            setVisible(false);
            callbacks.current.onAction?.();
          }}
        />
      ) : null}
    </View>
  );
}
