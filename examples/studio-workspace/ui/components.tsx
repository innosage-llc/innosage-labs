import React, { useRef, type ReactNode } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  View,
  findNodeHandle,
  useWindowDimensions,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

export interface UiTextProps extends TextProps {
  variant?: 'title' | 'heading' | 'body' | 'caption';
}

export function UiText({ variant = 'body', style, ...props }: UiTextProps) {
  const { palette, typography } = useTheme();
  return <Text style={[typography[variant], { color: palette.text }, style]} {...props} />;
}

export interface SurfaceProps extends ViewProps {
  children?: ReactNode;
}

export function Surface({ style, ...props }: SurfaceProps) {
  const { palette, spacing } = useTheme();
  return (
    <View
      style={[{ backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 8, padding: spacing.md }, style]}
      {...props}
    />
  );
}

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  testID?: string;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  testID,
  accessibilityLabel,
  style,
  textStyle,
}: ButtonProps) {
  const { palette, spacing, typography } = useTheme();
  const variants = {
    primary: { bg: palette.accent, border: palette.accent, text: palette.onAccent },
    secondary: { bg: palette.surface, border: palette.border, text: palette.text },
    danger: { bg: palette.danger, border: palette.danger, text: palette.onDanger },
  };
  const v = variants[variant] ?? variants.primary;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={accessibilityLabel || label}
      style={[
        {
          minHeight: 48,
          minWidth: 48,
          paddingHorizontal: spacing.lg,
          paddingVertical: spacing.sm,
          borderRadius: 8,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: 1,
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text style={[typography.body, { fontWeight: '600', color: v.text }, textStyle]}>{label}</Text>
    </Pressable>
  );
}

export interface FieldProps extends TextInputProps {
  label: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  error,
  containerStyle,
  style,
  testID,
  accessibilityHint,
  ...props
}: FieldProps) {
  const { palette, spacing, typography } = useTheme();

  return (
    <View style={[{ marginBottom: spacing.md }, containerStyle]}>
      <Text style={[typography.caption, { color: palette.text, fontWeight: '600', marginBottom: spacing.xs }]}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        accessibilityHint={accessibilityHint ?? error}
        aria-invalid={!!error}
        placeholderTextColor={palette.muted}
        style={[
          typography.body,
          {
            minHeight: 48,
            borderWidth: 1,
            borderColor: error ? palette.danger : palette.controlBorder,
            borderRadius: 8,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            backgroundColor: palette.surface,
            color: palette.text,
          },
          style,
        ]}
        {...props}
      />
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={[typography.caption, { color: palette.danger, marginTop: spacing.xs }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Chip({ label, selected = false, onPress, testID, style }: ChipProps) {
  const { palette, spacing, typography } = useTheme();

  const chipContent = (
    <Text style={[typography.caption, { color: selected ? palette.onAccent : palette.text, fontWeight: selected ? '600' : '400' }]}>
      {label}
    </Text>
  );

  const containerStyle: StyleProp<ViewStyle> = [
    {
      minHeight: 48,
      minWidth: 48,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: selected ? palette.accent : palette.border,
      backgroundColor: selected ? palette.accent : palette.surface,
      justifyContent: 'center',
      alignItems: 'center',
    },
    style,
  ];

  if (!onPress) {
    return (
      <View
        testID={testID}
        accessibilityLabel={label}
        style={containerStyle}
      >
        {chipContent}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      {...(Platform.OS === 'web' ? { 'aria-pressed': !!selected } : {})}
      accessibilityLabel={label}
      style={containerStyle}
    >
      {chipContent}
    </Pressable>
  );
}

export interface SegmentOption {
  id: string;
  label: string;
}

export interface SegmentedControlProps {
  options: readonly SegmentOption[] | SegmentOption[];
  value: string;
  onChange: (id: string) => void;
  accessibilityLabel?: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  accessibilityLabel = 'View mode',
  testID,
  style,
}: SegmentedControlProps) {
  const { palette, spacing, typography } = useTheme();

  return (
    <View
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      {...(Platform.OS === 'web' ? { role: 'group' } : {})}
      style={[{ flexDirection: 'row', flexWrap: 'wrap', backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 8, padding: spacing.xs, gap: spacing.xs }, style]}
    >
      {options.map((option) => {
        const isSelected = option.id === value;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChange(option.id)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            {...(Platform.OS === 'web' ? { 'aria-pressed': isSelected } : {})}
            accessibilityLabel={option.label}
            style={{
              minHeight: 48,
              minWidth: 48,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
              borderRadius: 6,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: isSelected ? palette.accent : 'transparent',
              flexGrow: 1,
            }}
          >
            <Text style={[typography.body, { color: isSelected ? palette.onAccent : palette.muted, fontWeight: isSelected ? '600' : '400' }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export interface ListRowProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  trailing?: ReactNode;
  selected?: boolean;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({ title, subtitle, onPress, trailing, selected = false, testID, style }: ListRowProps) {
  const { palette, spacing, typography } = useTheme();
  const descriptiveLabel = subtitle ? `${title}, ${subtitle}` : title;

  const content = (
    <View style={{ flex: 1, minHeight: 48, justifyContent: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.md }}>
      <Text style={[typography.body, { color: palette.text, fontWeight: '500' }]}>{title}</Text>
      {subtitle ? <Text style={[typography.caption, { color: palette.muted, marginTop: spacing.xs }]}>{subtitle}</Text> : null}
    </View>
  );

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: palette.surface,
          borderColor: palette.border,
          borderBottomWidth: 1,
          borderLeftWidth: selected ? 4 : 0,
          borderLeftColor: palette.accent,
          minHeight: 48,
        },
        style,
      ]}
    >
      {onPress ? (
        <Pressable
          testID={testID}
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={descriptiveLabel}
          accessibilityState={{ selected: !!selected }}
          {...(Platform.OS === 'web' && selected ? { 'aria-current': true } : {})}
          style={{ flex: 1 }}
        >
          {content}
        </Pressable>
      ) : (
        <View
          testID={testID}
          accessible={true}
          accessibilityLabel={descriptiveLabel}
          {...(Platform.OS === 'web' ? { role: 'group' } : {})}
          accessibilityState={{ selected: !!selected }}
          {...(Platform.OS === 'web' && selected ? { 'aria-current': true } : {})}
          style={{ flex: 1 }}
        >
          {content}
        </View>
      )}
      {trailing ? (
        <View style={{ minHeight: 48, justifyContent: 'center', alignItems: 'center', paddingRight: spacing.md }}>
          {trailing}
        </View>
      ) : null}
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ title, description, actionLabel, onAction, testID, style }: EmptyStateProps) {
  const { palette, spacing, typography } = useTheme();

  return (
    <View testID={testID} style={[{ padding: spacing.xxl, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Text style={[typography.heading, { color: palette.text, textAlign: 'center', marginBottom: spacing.sm }]}>
        {title}
      </Text>
      <Text style={[typography.body, { color: palette.muted, textAlign: 'center', marginBottom: actionLabel && onAction ? spacing.lg : 0 }]}>
        {description}
      </Text>
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}

export interface FeedbackProps {
  message: string;
  tone?: 'success' | 'error';
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}

export function Feedback({ message, tone = 'success', actionLabel, onAction, testID, style }: FeedbackProps) {
  const { palette, spacing, typography } = useTheme();
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
      {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} variant="secondary" style={{ minHeight: 48 }} /> : null}
    </View>
  );
}

export interface AppShellProps {
  title: string;
  subtitle?: string;
  navigation?: ReactNode;
  actions?: ReactNode;
  header?: ReactNode;
  children: ReactNode;
  testID?: string;
}

export function AppShell({ title, subtitle, navigation, actions, header, children, testID }: AppShellProps) {
  const { mode, palette, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 800;
  const barStyle = mode === 'dark' ? 'light-content' : 'dark-content';

  const defaultHeader = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        rowGap: spacing.sm,
        columnGap: spacing.md,
        paddingHorizontal: spacing.lg,
        paddingVertical: spacing.md,
        borderBottomWidth: 1,
        borderColor: palette.border,
        backgroundColor: palette.surface,
      }}
    >
      <View style={{ flexShrink: 1, flexGrow: 1, marginRight: spacing.md, minWidth: 160 }}>
        <Text style={[typography.title, { color: palette.text }]}>{title}</Text>
        {subtitle ? <Text style={[typography.caption, { color: palette.muted, marginTop: spacing.xs }]}>{subtitle}</Text> : null}
      </View>
      {actions ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs }}>
          {actions}
        </View>
      ) : null}
    </View>
  );

  return (
    <View
      testID={testID}
      style={{
        flex: 1,
        backgroundColor: palette.background,
        paddingTop: insets.top,
        paddingBottom: insets.bottom,
        paddingLeft: insets.left,
        paddingRight: insets.right,
      }}
    >
      <StatusBar barStyle={barStyle} />
      <View style={{ flex: 1, flexDirection: isDesktop ? 'row' : 'column' }}>
        {navigation ? (
          <View
            style={[
              { backgroundColor: palette.surface, borderColor: palette.border },
              isDesktop
                ? { width: 260, borderRightWidth: 1 }
                : { borderBottomWidth: 1, padding: spacing.sm },
            ]}
          >
            {isDesktop ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ padding: spacing.md }}
              >
                {navigation}
              </ScrollView>
            ) : (
              navigation
            )}
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          {header ?? defaultHeader}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ padding: isDesktop ? spacing.lg : spacing.md }}
            >
              {children}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </View>
    </View>
  );
}

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  testID?: string;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  testID,
}: ConfirmDialogProps) {
  const { palette, spacing, typography } = useTheme();
  const insets = useSafeAreaInsets();
  const titleRef = useRef<React.ComponentRef<typeof Text>>(null);

  const handleShow = () => {
    if (Platform.OS !== 'web' && titleRef.current) {
      const handle = findNodeHandle(titleRef.current);
      if (handle && AccessibilityInfo?.setAccessibilityFocus) {
        AccessibilityInfo.setAccessibilityFocus(handle);
      }
    }
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      onRequestClose={onCancel}
      onShow={handleShow}
      {...(Platform.OS === 'web' ? { accessibilityLabel: title } : {})}
      testID={testID}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: Math.max(insets.top, spacing.lg),
          paddingBottom: Math.max(insets.bottom, spacing.lg),
          paddingLeft: Math.max(insets.left, spacing.lg),
          paddingRight: Math.max(insets.right, spacing.lg),
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 480,
            maxHeight: '80%',
            backgroundColor: palette.surface,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: palette.border,
            padding: spacing.lg,
          }}
        >
          <Text
            ref={titleRef}
            accessible
            accessibilityRole="header"
            style={[typography.heading, { color: palette.text, marginBottom: spacing.sm }]}
          >
            {title}
          </Text>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{ marginVertical: spacing.sm }}
            contentContainerStyle={{ paddingVertical: spacing.xs }}
          >
            <Text style={[typography.body, { color: palette.text }]}>{message}</Text>
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' }}>
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} />
            <Button label={confirmLabel} variant="primary" onPress={onConfirm} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
