import { useEffect, useState } from "react";
import { Modal, ScrollView, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, TextInput, useNativeState } from "@expo/ui";
import { Host } from "@expo/ui/jetpack-compose";
import { proClient } from "./ProAccess";
import { useTheme } from "./ui/theme";

export function ProSettings({ onClose }: { onClose: () => void }) {
  const { palette, spacing, typography } = useTheme();
  const key = useNativeState("");
  const [hasKey, setHasKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    void proClient
      ?.profile()
      .then((profile) => setConfigured(!!profile))
      .catch(() => setMessage("Could not read the saved Pro configuration."))
      .finally(() => setBusy(false));
    if (!proClient) {
      setBusy(false);
      setMessage("Pro is not configured for this build.");
    }
  }, []);
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await proClient!.configure(key.get());
      key.set("");
      setHasKey(false);
      setConfigured(true);
      setMessage("Pro transcription access verified.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not validate Pro access.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await proClient!.remove();
      setConfigured(false);
      setMessage("Pro key removed from this device.");
    } catch {
      setMessage("Could not remove the saved key.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      onRequestClose={() => {
        if (!busy) onClose();
      }}
    >
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.background }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        >
          <Text
            accessibilityRole="header"
            style={[typography.heading, { color: palette.text }]}
          >
            InnoSage Pro
          </Text>
          <Text style={{ color: palette.text }}>
            {configured ? "Pro key saved" : "Free access"}
          </Text>
          <Text style={{ color: palette.text }}>
            Pro transcription supports recordings up to 4 hours and 512 MiB.
            Access is verified when you submit a new job.
          </Text>
          <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
            <TextInput
              accessibilityLabel="InnoSage Pro API key"
              placeholder="InnoSage Pro API key"
              value={key}
              onChangeText={(text) => setHasKey(!!text.trim())}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              textStyle={{ color: palette.text }}
              style={{
                width: "100%",
                borderColor: palette.border,
                borderWidth: 1,
                padding: spacing.md,
              }}
            />
          </Host>
          <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
            <Button
              label={busy ? "Checking…" : "Verify and save key"}
              disabled={busy || !hasKey || !proClient}
              onPress={save}
            />
          </Host>
          {configured ? (
            <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
              <Button
                label="Remove Pro key"
                variant="outlined"
                disabled={busy}
                onPress={remove}
              />
            </Host>
          ) : null}
          {message ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.text }}
            >
              {message}
            </Text>
          ) : null}
          <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
            <Button
              label="Back to recordings"
              variant="text"
              disabled={busy}
              onPress={onClose}
            />
          </Host>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
