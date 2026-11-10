import { Host, Button as ExpoButton, Text as ExpoText } from '@expo/ui';
import { StyleSheet, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import type { UniversalStyle, UniversalTextStyle } from '@expo/ui';
import { Button as ExistingButton, useTheme, type ButtonProps as ExistingButtonProps } from '../ui';

export type WorkspaceButtonProps = ExistingButtonProps;
export type { ButtonProps } from '../ui';

function toUniversalStyle(style: StyleProp<ViewStyle>): UniversalStyle | undefined {
  const flat = StyleSheet.flatten(style);
  if (!flat) return undefined;

  const supported = {
    width: flat.width,
    height: flat.height,
    padding: flat.padding,
    paddingHorizontal: flat.paddingHorizontal,
    paddingVertical: flat.paddingVertical,
    paddingTop: flat.paddingTop,
    paddingBottom: flat.paddingBottom,
    paddingLeft: flat.paddingLeft,
    paddingRight: flat.paddingRight,
    backgroundColor: flat.backgroundColor,
    borderRadius: flat.borderRadius,
    borderWidth: flat.borderWidth,
    borderColor: flat.borderColor,
    opacity: flat.opacity,
  };
  return Object.fromEntries(Object.entries(supported).filter(([, value]) => value !== undefined)) as UniversalStyle;
}

function toUniversalTextStyle(style: StyleProp<TextStyle>): UniversalTextStyle | undefined {
  const flat = StyleSheet.flatten(style);
  if (!flat) return undefined;

  const supported = {
    fontSize: flat.fontSize,
    fontWeight: flat.fontWeight,
    fontFamily: flat.fontFamily,
    color: flat.color,
    lineHeight: flat.lineHeight,
    letterSpacing: flat.letterSpacing,
    textAlign: flat.textAlign,
  };
  return Object.fromEntries(Object.entries(supported).filter(([, value]) => value !== undefined)) as UniversalTextStyle;
}

/** Ordinary workspace actions rendered with the Expo UI universal Button. */
export function WorkspaceButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  testID,
  accessibilityLabel,
  style,
  textStyle,
}: WorkspaceButtonProps) {
  if (accessibilityLabel && accessibilityLabel !== label) {
    return <ExistingButton {...{ label, onPress, variant, disabled, testID, accessibilityLabel, style, textStyle }} />;
  }

  const { palette } = useTheme();
  const expoVariant = variant === 'primary' ? 'filled' : 'outlined';
  const baseStyle = toUniversalStyle(style) ?? {};
  const baseTextStyle = toUniversalTextStyle(textStyle) ?? {};
  const universalStyle: UniversalStyle = variant === 'danger'
    ? {
        ...baseStyle,
        borderColor: baseStyle.borderColor ?? palette.danger,
        borderWidth: baseStyle.borderWidth ?? 1,
      }
    : baseStyle;
  const universalTextStyle: UniversalTextStyle = variant === 'danger'
    ? { ...baseTextStyle, color: baseTextStyle.color ?? palette.danger }
    : baseTextStyle;

  return (
    <Host matchContents>
      <ExpoButton
        label={label}
        onPress={onPress}
        variant={expoVariant}
        disabled={disabled}
        testID={testID}
        style={universalStyle}
      >
        <ExpoText textStyle={universalTextStyle}>{label}</ExpoText>
      </ExpoButton>
    </Host>
  );
}
