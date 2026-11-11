import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Modal, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, TextInput, useNativeState } from "@expo/ui";
import { Host, RadioButton } from "@expo/ui/jetpack-compose";
import { clientForService, selectedService, selectService } from "./ProAccess";
import { openAIAccess } from "./OpenAIAccess";
import { services, type ServiceId } from "./ServiceConfig";
import { semantics } from "@expo/ui/jetpack-compose/modifiers";
import { AppHeader } from "./ui/AppChrome";
import { useTheme } from "./ui/theme";

function accessFor(id: ServiceId) {
  return id === 'openai' ? openAIAccess : clientForService(id);
}

export function ProSettings({ onClose }: { onClose: () => void }) {
  const { palette, spacing, typography } = useTheme();
  const key = useNativeState("");
  const [service, setService] = useState<ServiceId>("staging");
  const access = accessFor(service);
  const isOpenAI = service === "openai";
  const [hasKey, setHasKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void selectedService().then(async id => {
      const profile = await accessFor(id).profile();
      if (active) { setService(id); setConfigured(!!profile); }
    }).catch(() => { if (active) setMessage("Could not read the transcription settings."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function changeService(id: ServiceId) {
    setBusy(true);
    setMessage("");
    key.set("");
    setHasKey(false);
    try {
      const profile = await accessFor(id).profile();
      await selectService(id);
      setService(id);
      setConfigured(!!profile);
      setMessage("Default saved for new transcriptions. Existing jobs keep their service.");
    } catch {
      setMessage("Could not change service. Previous selection retained.");
    } finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    setMessage("");
    try {
      await access.configure(key.get());
      key.set("");
      setHasKey(false);
      setConfigured(true);
      setMessage(isOpenAI ? "OpenAI model access verified. Your first transcription checks quota and billing." : "Pro transcription access verified.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not validate transcription access.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await access.remove();
      setConfigured(false);
      setMessage("Key removed from this device.");
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
        <AppHeader title="Transcription service" onBack={onClose} backLabel="Back to settings" backDisabled={busy} />
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        >
          <Text style={{ color: palette.muted }}>Choose the service for new transcriptions.</Text>
          {(['production', 'staging', 'openai'] as const).map(id => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Host matchContents style={{ minWidth: 48 }}>
                <RadioButton selected={service === id} enabled={!busy} onClick={() => void changeService(id)}
                  modifiers={[semantics({ contentDescription: services[id].label })]} />
              </Host>
              <Text onPress={busy ? undefined : () => void changeService(id)} style={{ color: palette.text }}>{services[id].label}</Text>
            </View>
          ))}
          <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>{services[service].label}</Text>
          <Text style={{ color: palette.muted }}>
            {isOpenAI ? 'Use your OpenAI Platform project key. Recordings go directly to OpenAI and use your project’s API quota.' : service === 'production' ? 'Requires a production Pro key. Free transcription is currently available only on staging.' : 'Use a staging Pro key, or transcribe with Free access.'}
            {' '}Keys are saved separately. Changing service does not transfer your key or restart existing jobs.
          </Text>
          <Text style={{ color: palette.text }}>
            {configured ? "Key saved" : "No key saved for this service"}
          </Text>
          <Text style={{ color: palette.text }}>
            {isOpenAI ? "M4A recordings under 25 MB." : "Pro supports recordings up to 4 hours and 512 MiB."}
          </Text>
          <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
            <TextInput
              accessibilityLabel={isOpenAI ? "OpenAI API key" : `${service} InnoSage Pro API key`}
              placeholder={isOpenAI ? "OpenAI API key" : `${service === "production" ? "Production" : "Staging"} Pro API key`}
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
              disabled={busy || !hasKey}
              onPress={save}
            />
          </Host>
          {configured ? (
            <Host matchContents={{ vertical: true }} style={{ width: "100%" }}>
              <Button
                label="Remove key"
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

        </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
