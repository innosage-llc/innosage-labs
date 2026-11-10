import { useEffect, useRef } from 'react';
import React, { type ComponentType } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import {
  Host,
  Snackbar,
  SnackbarHost,
  type SnackbarHostProps,
  type SnackbarHostRef,
} from '@expo/ui/jetpack-compose';
import { fillMaxSize } from '@expo/ui/jetpack-compose/modifiers';
import { useTheme } from '../ui';
import type { WorkspaceFeedbackProps } from './WorkspaceFeedback';

type PositionedSnackbarHostProps = SnackbarHostProps & { style?: StyleProp<ViewStyle> };
// The SDK host forwards remaining React Native view props to its native view;
// its public type currently omits `style`, so expose that layout prop locally.
const PositionedSnackbarHost = SnackbarHost as ComponentType<PositionedSnackbarHostProps>;

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
  const host = useRef<SnackbarHostRef>(null);
  const request = useRef(0);
  const callbacks = useRef({ onAction, onDismiss });
  callbacks.current = { onAction, onDismiss };
  const { palette } = useTheme();
  const action = onAction ? actionLabel : undefined;
  const hostKey = `${id ?? ''}:${message}:${action ?? ''}`;

  useEffect(() => {
    const currentRequest = ++request.current;
    const show = host.current?.showSnackbar({ message, actionLabel: action, duration });
    show?.then((result) => {
      if (currentRequest !== request.current) return;
      if (result === 'actionPerformed') callbacks.current.onAction?.();
      else callbacks.current.onDismiss?.();
    }).catch(() => {
      // Native view disposal cancels the Compose coroutine; it is not a user action.
    });

    return () => {
      request.current += 1;
    };
  }, [action, duration, hostKey, message]);

  return (
    <View testID={testID} pointerEvents="box-none" style={style}>
      <Host style={{ flex: 1 }}>
      <PositionedSnackbarHost
        key={hostKey}
        ref={host}
        style={{ flex: 1 }}
        modifiers={[fillMaxSize()]}
      >
        <Snackbar
          containerColor={palette.surface}
          contentColor={palette.text}
          actionContentColor={tone === 'error' ? palette.danger : palette.accent}
        />
      </PositionedSnackbarHost>
      </Host>
    </View>
  );
}
