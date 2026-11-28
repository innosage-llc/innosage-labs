import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, View } from "react-native";
import { Host, ListItem, Text as NativeText, TextInput, useNativeState } from "@expo/ui";
import { ServiceChoice } from "./ServiceChoice";
import { gatewayAvailable } from "./GatewayConnection";
import { supportsProUpload } from "./NativeUpload";
import { clientForService, selectedService, selectService } from "./ProAccess";
import { openAIAccess } from "./OpenAIAccess";
import { services, type ServiceId } from "./ServiceConfig";
import { DetailShell } from "./ui/DetailShell";
import { ActionButton } from "./ui/ActionButton";
import { ServiceSettingsLayout } from "./ui/service-flow";
import { useTheme } from "./ui/theme";

function accessFor(id: ServiceId) {
  return id === 'openai' ? openAIAccess : clientForService(id);
}

export function ProSettings({ onClose }: { onClose: () => void }) {
  const { mode, palette, spacing, typography } = useTheme();
  const android = Platform.OS === 'android';
  const ios = Platform.OS === 'ios';
  const [managingKeys, setManagingKeys] = useState(false);
  const working = useRef(false);
  const key = useNativeState("");
  const [knownService, setService] = useState<ServiceId>();
  const service = knownService ?? "staging";
  const access = accessFor(service);
  const isOpenAI = service === "openai";
  const environment = service === "production" ? "Production" : "Staging";
  const canConfigureKey = isOpenAI || supportsProUpload;
  const [hasKey, setHasKey] = useState(false);
  const [configured, setConfigured] = useState<boolean>();
  const [readAttempt, setReadAttempt] = useState(0);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    void selectedService().then(async id => {
      if (active) setService(id);
      if (active) setService(id);
      const profile = await accessFor(id).profile();
      if (active) setConfigured(!!profile);
    }).catch(() => { if (active) setMessage("Could not read the transcription settings."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [readAttempt]);
  async function changeService(id: ServiceId) {
    if (busy || working.current || id === (ios ? knownService : service)) return;
    working.current = true;
    setBusy(true);
    setMessage("");
    key.set("");
    setHasKey(false);
    try {
      await selectService(id);
      const profile = await accessFor(id).profile().then(Boolean, () => undefined);
      setService(id);
      setConfigured(profile);
      setMessage(profile === undefined ? "Could not read the saved key. Replace or remove it to continue." : "Default saved for new transcriptions. Existing jobs keep their service.");
    } catch {
      setMessage("Could not change service. Previous selection retained.");
    } finally { working.current = false; setBusy(false); }
  }
  async function save() {
    if (!canConfigureKey || busy || working.current) return;
    working.current = true;
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
      working.current = false;
      setBusy(false);
    }
  }
  async function remove() {
    if (busy || working.current) return;
    working.current = true;
    setBusy(true);
    try {
      await access.remove();
      setConfigured(false);
      setMessage("Key removed from this device.");
    } catch {
      setMessage("Could not remove the saved key.");
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  function goBack() {
    if (busy || working.current) return;
    if (!managingKeys) {
      onClose();
      return;
    }
    key.set('');
    setHasKey(false);
    setMessage('');
    setManagingKeys(false);
  }
  function openKeys() {
    if (configured !== undefined) setMessage('');
    setManagingKeys(true);
  }

  const keyControls = <>
    {android ? <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>Service keys</Text> : null}
    <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>{services[service].label}</Text>
    <Text style={{ color: palette.muted }}>
      {isOpenAI ? 'Use your OpenAI Platform project key. Recordings go directly to OpenAI and use your project’s API quota.'
        : !supportsProUpload ? service === 'production'
          ? 'Production uploads are unavailable on this platform.'
          : gatewayAvailable(service)
            ? 'Free access is available for staging transcriptions. Pro uploads are unavailable on this platform.'
            : 'Staging Free access is unavailable in this build. Pro uploads are unavailable on this platform.'
        : gatewayAvailable(service)
          ? `Free guest access is available. Add and verify an optional ${environment} Pro key.`
          : `${environment} Free access is unavailable in this build. A ${environment} Pro key is required.`}
      {' '}Keys are saved separately. Changing service does not transfer your key or restart existing jobs.
    </Text>
    <Text style={{ color: palette.text }}>
      {configured === undefined ? busy ? "Reading saved key status…" : "Saved key status is unavailable." : configured ? "Key saved" : "No key saved for this service"}
    </Text>
    {configured === undefined && !busy ? <ActionButton title="Retry reading settings" onPress={() => {
      setBusy(true);
      setMessage('');
      setReadAttempt(attempt => attempt + 1);
    }} /> : null}
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
    {canConfigureKey && configured !== false && !busy ? (
      <ActionButton title="Remove key" variant="outlined" disabled={busy} onPress={remove} />
    ) : null}
  </>;

  if (ios) {
    return <ServiceSettingsLayout service={knownService} serviceLabel={services[service].label}
      stagingAvailable={gatewayAvailable('staging')} managingKeys={managingKeys} canConfigureKey={canConfigureKey}
      busy={busy} message={message} keys={keyControls} onChange={id => { void changeService(id); }}
      onOpenKeys={openKeys} onBack={goBack} />;
  }

  return (
    <Modal onRequestClose={goBack}>
      <DetailShell title={android ? managingKeys ? 'Transcription service' : 'Settings' : 'Transcription service'}
        quietTitle={android} onBack={goBack} backLabel={managingKeys ? 'Back to transcription service' : 'Back to settings'} backDisabled={busy}>
        <KeyboardAvoidingView behavior="height" style={{ flex: 1 }}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: android ? spacing.xxl : spacing.lg, gap: spacing.md }}
        >
          {!managingKeys ? <>
            {android ? <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>Transcription service</Text> : null}
            <Text style={{ color: palette.muted }}>
              {android ? 'Applies to new transcriptions. Existing jobs keep their original service.' : 'Choose the service for new transcriptions.'}
            </Text>
            <ServiceChoice service={service} busy={busy} onChange={id => void changeService(id)} />
          </> : null}
          {android && !managingKeys ? (
            <Host matchContents={{ vertical: true }} colorScheme={mode}>
              <ListItem colors={{ containerColor: palette.background, contentColor: palette.text }}
                onPress={!busy ? openKeys : undefined}>
                <NativeText>Manage service keys</NativeText>
              </ListItem>
            </Host>
          ) : <>
            {keyControls}
          </>}
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
      </DetailShell>
    </Modal>
  );
}
