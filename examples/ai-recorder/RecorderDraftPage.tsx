import { useCallback, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ActionButton } from './ui/ActionButton';
import { AppHeader } from './ui/AppChrome';
import { useTheme } from './ui/theme';

export type RecorderDraftPageProps = {
  title: string;
  editor: ReactNode;
  onBack: () => void;
  backPending: boolean;
  retrySave: (() => void) | undefined;
  message: string | undefined;
};

/**
 * Full-screen Android modal shell for editing a Recorder transcript or summary draft.
 * Preserves supplied editor scrolling, prioritizes narrow-width content above the IME,
 * and exposes non-obscuring error feedback with optional save retry.
 */
export function RecorderDraftPage({
  title,
  editor,
  onBack,
  backPending,
  retrySave,
  message,
}: RecorderDraftPageProps) {
  const { palette, spacing, typography } = useTheme();
  const trimmedMessage = message?.trim() ?? '';
  const hasMessage = trimmedMessage.length > 0;

  // Guard both hardware and software back triggers while a back/save transition is pending.
  const handleBack = useCallback(() => {
    if (!backPending) {
      onBack();
    }
  }, [backPending, onBack]);

  return (
    <Modal
      visible
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={handleBack}
    >
      <SafeAreaView
        edges={['top', 'bottom']}
        style={{ flex: 1, backgroundColor: palette.background }}
      >
        <AppHeader
          title={title}
          onBack={handleBack}
          backDisabled={backPending}
        />
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {hasMessage ? (
            <View
              accessibilityRole="alert"
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.sm,
                backgroundColor: palette.danger,
                paddingHorizontal: spacing.lg,
                paddingVertical: spacing.sm,
              }}
            >
              <Text
                selectable
                style={{
                  ...typography.body,
                  color: palette.onDanger,
                  flex: 1,
                  flexShrink: 1,
                }}
              >
                {trimmedMessage}
              </Text>
              {retrySave ? (
                <View style={{ flexShrink: 0 }}>
                  <ActionButton
                    title="Retry"
                    onPress={retrySave}
                    accessibilityLabel="Retry save"
                    variant="tonal"
                    fullWidth={false}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
          <View style={{ flex: 1 }}>{editor}</View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
