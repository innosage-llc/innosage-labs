import { useEffect, useMemo, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text } from "react-native";
import { TextInput, useNativeState } from "@expo/ui";
import { Host } from "@expo/ui";
import { ServiceChoice } from "./ServiceChoice";
import { gatewayAvailable } from "./GatewayConnection";
import { supportsProUpload } from "./NativeUpload";
import { clientForService, selectedService, selectService, voiceProfileManagerForStage } from "./ProAccess";
import { openAIAccess } from "./OpenAIAccess";
import { services, type ServiceId } from "./ServiceConfig";
import { voiceProfileStageEnabled } from "./VoiceProfileFlow";
import { DetailShell } from "./ui/DetailShell";
import { ActionButton } from "./ui/ActionButton";
import { useTheme } from "./ui/theme";
import { VoiceProfileManager } from "./ui/voice-profile/voice-profile-manager";

function accessFor(id: ServiceId) {
  return id === 'openai' ? openAIAccess : clientForService(id);
}

function canManageVoiceProfiles(service: ServiceId) {
  return Platform.OS === "android" && service === "staging" && supportsProUpload && voiceProfileStageEnabled(service);
}

function voiceProfileScope(service: ServiceId, profile: unknown) {
  if (!canManageVoiceProfiles(service) || !profile || typeof profile !== "object" || !("accountScope" in profile)) return;
  const { accountScope } = profile;
  if (typeof accountScope === "string" && /^[a-f0-9]{64}$/.test(accountScope)) return accountScope;
}

export function ProSettings({ onClose }: { onClose: () => void }) {
  const { palette, spacing, typography } = useTheme();
  const key = useNativeState("");
  const [service, setService] = useState<ServiceId>("staging");
  const access = accessFor(service);
  const isOpenAI = service === "openai";
  const environment = service === "production" ? "Production" : "Staging";
  const canConfigureKey = isOpenAI || supportsProUpload;
  const [hasKey, setHasKey] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [accountScope, setAccountScope] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const voiceProfiles = useMemo(() => {
    if (accountScope && canManageVoiceProfiles(service)) return voiceProfileManagerForStage(accountScope);
  }, [accountScope, service]);
  useEffect(() => {
    let active = true;
    void selectedService().then(async id => {
      const profile = await accessFor(id).profile();
      if (active) {
        setService(id);
        setConfigured(!!profile);
        setAccountScope(voiceProfileScope(id, profile));
      }
    }).catch(() => { if (active) setMessage("Could not read the transcription settings."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, []);
  async function refreshAccountScope() {
    if (canManageVoiceProfiles(service)) {
      const profile = await access.profile().catch(() => undefined);
      setAccountScope(voiceProfileScope(service, profile));
    }
  }
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
      setAccountScope(voiceProfileScope(id, profile));
      setMessage("Default saved for new transcriptions. Existing jobs keep their service.");
    } catch {
      setMessage("Could not change service. Previous selection retained.");
    } finally { setBusy(false); }
  }
  async function save() {
    if (!canConfigureKey) return;
    setBusy(true);
    setMessage("");
    setAccountScope(undefined);
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
      await refreshAccountScope();
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setAccountScope(undefined);
    try {
      await access.remove();
      setConfigured(false);
      setMessage("Key removed from this device.");
    } catch {
      setMessage("Could not remove the saved key.");
      await refreshAccountScope();
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (busy) return;
    setAccountScope(undefined);
    onClose();
  }
  return (
    <Modal onRequestClose={close}>
      <DetailShell title="Transcription service" onBack={close} backLabel="Back to settings" backDisabled={busy}>
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        >
          <Text style={{ color: palette.muted }}>Choose the service for new transcriptions.</Text>
          <ServiceChoice service={service} busy={busy} onChange={id => void changeService(id)} />
          <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>{services[service].label}</Text>
          <Text style={{ color: palette.muted }}>
            {isOpenAI ? 'Use your OpenAI Platform project key. Recordings go directly to OpenAI and use your project’s API quota.'
              : !supportsProUpload ? service === 'production'
                ? 'Production Pro is unavailable on iOS. Select Staging Free access or OpenAI direct.'
                : 'Use Free access for staging transcriptions. Pro uploads are unavailable on iOS.'
              : gatewayAvailable(service)
                ? `Free guest access is available. Add and verify an optional ${environment} Pro key.`
                : `${environment} Free access is unavailable in this build. A ${environment} Pro key is required.`}
            {' '}Keys are saved separately. Changing service does not transfer your key or restart existing jobs.
          </Text>
          <Text style={{ color: palette.text }}>
            {configured ? "Key saved" : "No key saved for this service"}
          </Text>
          {canConfigureKey ? <>
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
          <ActionButton title={busy ? "Checking…" : "Verify and save key"} variant="primary"
            disabled={busy || !hasKey} onPress={save} />
          </> : null}
          {configured ? (
            <ActionButton title="Remove key" variant="outlined" disabled={busy} onPress={remove} />
          ) : null}
          {message ? (
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.text }}
            >
              {message}
            </Text>
          ) : null}
          {!busy && configured && voiceProfiles ? (
            <VoiceProfileManager key={accountScope} onRestore={voiceProfiles.restore} onList={voiceProfiles.list}
              onEnroll={voiceProfiles.enroll} onDelete={voiceProfiles.delete} />
          ) : null}
        </ScrollView>
        </KeyboardAvoidingView>
      </DetailShell>
    </Modal>
  );
}
