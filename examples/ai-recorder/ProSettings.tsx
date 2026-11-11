import { useEffect, useState } from "react";
import { Button, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { clientForService, selectedService, selectService } from "./ProAccess";
import { openAIAccess } from "./OpenAIAccess";
import { services, type ServiceId } from "./ServiceConfig";
import { useTheme } from "./ui/theme";

function accessFor(id: ServiceId) {
  return id === 'openai' ? openAIAccess : clientForService(id);
}

export function ProSettings({ onClose }: { onClose: () => void }) {
  const { palette, spacing, typography } = useTheme();
  const [key, setKey] = useState("");
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
    setKey("");
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
      await access.configure(key);
      setKey("");
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
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        >
          <Text
            accessibilityRole="header"
            style={[typography.heading, { color: palette.text }]}
          >
            Transcription service
          </Text>
          <Text style={{ color: palette.muted }}>Choose the service for new transcriptions.</Text>
          {!isOpenAI ? <Text style={{ color: palette.muted }}>InnoSage Pro uploads are Android-only. On iOS, choose OpenAI direct, or use staging Free access with your authorized gateway.</Text> : null}
          {(['production', 'staging', 'openai'] as const).map(id => (
            <View key={id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Pressable accessibilityRole="radio" accessibilityLabel={services[id].label}
                accessibilityState={{ checked: service === id, disabled: busy }} disabled={busy}
                onPress={() => void changeService(id)} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center' }}>
                <Text style={{ color: palette.text, fontSize: 24 }}>{service === id ? '◉' : '○'}</Text>
              </Pressable>
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
          <View style={{ width: "100%" }}>
            <TextInput
              accessibilityLabel={isOpenAI ? "OpenAI API key" : `${service} InnoSage Pro API key`}
              placeholder={isOpenAI ? "OpenAI API key" : `${service === "production" ? "Production" : "Staging"} Pro API key`}
              value={key}
              onChangeText={(text) => { setKey(text); setHasKey(!!text.trim()); }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              style={{
                color: palette.text,
                width: "100%",
                borderColor: palette.border,
                borderWidth: 1,
                padding: spacing.md,
              }}
            />
          </View>
          <View style={{ width: "100%" }}>
            <Button
              title={busy ? "Checking…" : "Verify and save key"}
              disabled={busy || !hasKey || !isOpenAI}
              onPress={save}
            />
          </View>
          {configured ? (
            <View style={{ width: "100%" }}>
              <Button
                title="Remove key"
                disabled={busy}
                onPress={remove}
              />
            </View>
          ) : null}
          {message ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.text }}
            >
              {message}
            </Text>
          ) : null}
          <View style={{ width: "100%" }}>
            <Button
              title="Back to recordings"
              disabled={busy}
              onPress={onClose}
            />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
