import { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { RecorderSwitch } from './RecorderSwitch';
import { randomUUID } from 'expo-crypto';
import { File } from './localFiles';
import * as SecureStore from './credentialStore';
import { meetingEssentials, thinkingBudgets, type ThinkingEffort, type SummaryCitation } from './OpenAIClient';
import { openAIAccess } from './OpenAIAccess';
import { useTheme } from './ui/theme';
import { ActionButton } from './ui/ActionButton';
import { DetailShell } from './ui/DetailShell';
import { readSummaryInput } from './summaryDraftLifecycle';
import { readSavedRecordingSummary, savedSummaryFiles } from './savedRecordingDocuments';
import { summaryReaderSections } from './ui/document-content';

type Summary = { recipe: string; model: string; source: 'original' | 'revision'; text: string; citations?: SummaryCitation[]; effort?: ThinkingEffort; webSearch?: boolean };
export type RecipeRequest = Pick<Summary, 'recipe'|'model'|'source'> & {effort:ThinkingEffort; webSearch:boolean; instructions?:string};
export type SummaryProps = {
  original: File;
  hasRevision: boolean;
  readRevision: () => Promise<string | undefined>;
  output: File;
  save: (file: File, text: string) => Promise<void>;
  onLockChange: (locked: boolean) => void;
  generateInDraft?: (request: RecipeRequest, signal: AbortSignal) => Promise<void>;
  startOpen?: boolean;
};

export function TranscriptSummary({ original, hasRevision, readRevision, output, save, onLockChange, generateInDraft, startOpen }: SummaryProps) {
  const { palette, spacing } = useTheme();
  const [open, setOpen] = useState(!!generateInDraft || !!startOpen);
  const [recipe, setRecipe] = useState<string>();
  const [effort, setEffort] = useState<ThinkingEffort>('medium');
  const [instructions, setInstructions] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const customLoaded = useRef(false);
  const [models, setModels] = useState<string[]>([]);
  const [model, setModel] = useState('');
  const [choosing, setChoosing] = useState(false);
  const [source, setSource] = useState<Summary['source']>('original');
  const [summary, setSummary] = useState<Summary>();
  const [unsaved, setUnsaved] = useState<Summary>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => { onLockChange(busy || !!unsaved); }, [busy, unsaved, onLockChange]);

  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage('');
    try {
      await action(controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Could not complete the summary action.');
    } finally {
      active.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  async function persist(result: Summary) {
    try {
      const previous = savedSummaryFiles(output);
      const next = new File(output.parentDirectory, `${output.name}.${Date.now()}-${randomUUID()}.json`);
      await save(next, JSON.stringify(result));
      for (const file of previous) {
        try { await file.delete(); } catch { /* The new summary has already been saved. */ }
      }
      try { if (output.exists) await output.delete(); } catch { /* Legacy copy. */ }
      setSummary(result);
      setUnsaved(undefined);
    } catch {
      setUnsaved(result);
      throw new Error('Summary is ready. Retry saving before closing the transcript.');
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      {!generateInDraft && !startOpen ? <ActionButton title={open ? 'Hide summary' : 'Summarize'} disabled={busy || !!unsaved} onPress={() => {
        setOpen(!open);
        if (!open && !summary) void run(async () => {
          const file = savedSummaryFiles(output)[0] ?? output;
          if (!file.exists) return;
          const saved = JSON.parse(await file.text()) as Summary;
          if (typeof saved.text !== 'string' || typeof saved.model !== 'string') throw new Error('Could not read the saved summary.');
          setSummary(saved);
        });
      }} /> : null}
      {open ? <>
        <Text accessibilityRole="header" style={{ color: palette.text }}>Recipe library</Text>
        <ActionButton title={recipe === meetingEssentials.id ? '✓ Meeting Essentials' : 'Meeting Essentials'} disabled={busy || recipe === meetingEssentials.id} onPress={() => setRecipe(meetingEssentials.id)} />
        <ActionButton title={recipe === 'custom' ? '✓ Custom recipe' : 'Custom recipe'} disabled={busy || recipe === 'custom'} onPress={() => {
          setRecipe('custom');
          if (!customLoaded.current) void run(async () => {
            const value = await SecureStore.getItemAsync('recorder.custom-summary-recipe');
            if (value) {
              const saved = JSON.parse(value);
              if (typeof saved.instructions === 'string') setInstructions(saved.instructions);
              setWebSearch(saved.webSearch === true);
            }
            customLoaded.current = true;
          });
        }} />
        {recipe === 'custom' ? <>
          <TextInput accessibilityLabel="Custom recipe instructions" placeholder="Example: Fact-check the meeting’s claims and cite reliable sources."
            placeholderTextColor={palette.muted} editable={!busy} multiline maxLength={4000}
            value={instructions} onChangeText={setInstructions} style={{ color: palette.text, borderWidth: 1, borderColor: palette.muted, padding: spacing.sm }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: palette.text }}>Search the web</Text>
            <View style={{ minWidth: 60 }}>
              <RecorderSwitch label="Search the web"
                enabled={!busy} value={webSearch} onCheckedChange={setWebSearch} />
            </View>
          </View>
          <ActionButton title="Save custom recipe" disabled={busy || !instructions.trim()}
            onPress={() => void run(async () => {
              await SecureStore.setItemAsync('recorder.custom-summary-recipe', JSON.stringify({ instructions: instructions.trim(), webSearch }));
              customLoaded.current = true;
              setMessage('Custom recipe saved on this device.');
            })} />
        </> : null}
        <Text accessibilityRole="header" style={{ color: palette.text }}>Thinking budget</Text>
        {thinkingBudgets.map(budget => (
          <ActionButton key={budget.effort} title={effort === budget.effort ? '✓ ' + budget.label : budget.label}
            disabled={busy || effort === budget.effort} onPress={() => setEffort(budget.effort)} />
        ))}
        <ActionButton title={model ? 'Model: ' + model : 'Choose OpenAI model'} disabled={busy} onPress={() => {
          if (choosing) { setChoosing(false); return; }
          void run(async signal => {
            const available = await openAIAccess.summaryModels(signal);
            setModels(available);
            if (!available.includes(model)) setModel('');
            if (!available.length) setMessage('No GPT-5.6 or newer summary models are available for this OpenAI key.');
            setChoosing(true);
          });
        }} />
        {choosing ? models.map(id => (
          <ActionButton key={id} title={id} disabled={busy} variant="text" onPress={() => { setModel(id); setChoosing(false); }} />
        )) : null}
        {hasRevision ? <ActionButton title={source === 'original' ? 'Source: Original · Switch to saved revision' : 'Source: Saved revision · Switch to original'}
          disabled={busy} onPress={() => setSource(source === 'original' ? 'revision' : 'original')} /> : null}
        <Text style={{ color: palette.muted }}>Only the selected transcript text is sent to OpenAI for this summary. The source, model, and thinking budget are saved with the result on this device. Summary generation uses your OpenAI project quota.
          {recipe === 'custom' && webSearch ? ' Web search is on. OpenAI may use relevant details from the text to form public web queries.' : ' Web search is off.'}</Text>
        <ActionButton title={busy ? 'Working…' : unsaved ? 'Retry saving summary' : 'Generate summary'} variant="primary"
          disabled={busy || (!unsaved && (!recipe || !model || (recipe === 'custom' && !instructions.trim())))} onPress={() => void run(async signal => {
            if (unsaved) { await persist(unsaved); return; }
            if (!recipe) return;
            const searchEnabled = recipe === 'custom' && webSearch;
            if (generateInDraft) {
              await generateInDraft({recipe,model,source,effort,webSearch:searchEnabled,
                instructions:recipe === 'custom' ? instructions.trim() : undefined},signal);
              return;
            }
            const transcript = await readSummaryInput(source, () => original.text(), readRevision);
            const result = await openAIAccess.summarize(model, transcript, {
              effort, instructions: recipe === 'custom' ? instructions.trim() : undefined, webSearch: searchEnabled,
            }, signal);
            signal.throwIfAborted();
            await persist({ recipe, model, source, effort, webSearch: searchEnabled, ...result });
          })} />
        {unsaved ? <ActionButton title="Discard unsaved summary" variant="outlined" disabled={busy} onPress={() => { setUnsaved(undefined); setMessage(''); }} /> : null}
        {message ? <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Text> : null}
        {unsaved || summary ? <>
          <Text accessibilityRole="header" style={{ color: palette.text }}>{(unsaved ?? summary)?.recipe === 'custom' ? 'Custom recipe' : 'Meeting Essentials'}</Text>
          <Text style={{ color: palette.muted }}>{(unsaved ?? summary)?.model} · {(unsaved ?? summary)?.source === 'revision' ? 'Saved revision' : 'Original'}{unsaved ? ' · Unsaved' : ''}</Text>
          {(unsaved ?? summary)?.webSearch && !(unsaved ?? summary)?.citations?.length
            ? <Text style={{ color: palette.muted }}>No sources were returned. Treat factual claims as unverified.</Text> : null}
          <CitedSummary summary={(unsaved ?? summary)!} />
        </> : null}
      </> : null}
    </View>
  );
}

export function SavedRecordingSummary({ recording, recordingTitle, onClose, backLabel = 'Back to recording details' }: {
  recording: File;
  recordingTitle: string;
  onClose: () => void;
  backLabel?: string;
}) {
  const { palette, spacing, typography } = useTheme();
  const android = Platform.OS === 'android';
  const [summary, setSummary] = useState<Summary>();
  const [message, setMessage] = useState('Opening saved summary…');
  useEffect(() => {
    let current = true;
    void readSavedRecordingSummary(recording).then(saved => {
      if (!current) return;
      setSummary(saved);
      setMessage(saved ? '' : 'No readable summary is saved on this device.');
    }, () => {
      if (current) setMessage('Could not read the saved summary.');
    });
    return () => { current = false; };
  }, [recording]);
  return <Modal onRequestClose={onClose}>
    <DetailShell title="Summary" quietTitle backLabel={backLabel} onBack={onClose}>
      <ScrollView contentContainerStyle={{ padding: spacing.xxl, gap: spacing.md }}>
        <Text accessibilityRole={android ? 'header' : undefined}
          style={android ? [typography.title, { color: palette.text }] : [typography.dayLabel, { color: palette.muted }]}>{recordingTitle}</Text>
        {summary ? <>
          {!android ? <Text accessibilityRole="header" style={[typography.title, { color: palette.text }]}>
            {summary.recipe === 'custom' ? 'Custom summary' : 'Meeting summary'}
          </Text> : null}
          <Text style={[typography.caption, { color: palette.muted }]}>
            {android ? `${summary.recipe === 'custom' ? 'Custom recipe' : summary.recipe === meetingEssentials.id ? 'Meeting Essentials' : 'Summary'} · Saved on this device\n` : ''}
            {summary.model} · {summary.source === 'revision' ? 'Saved revision' : 'Original transcript'}
          </Text>
          {android ? <SavedSummarySections summary={summary} /> : <CitedSummary summary={summary} />}
        </> : <Text accessibilityLiveRegion="polite" style={[typography.body, { color: palette.muted }]}>{message}</Text>}
      </ScrollView>
    </DetailShell>
  </Modal>;
}

function SavedSummarySections({ summary }: { summary: Summary }) {
  const { palette, spacing, typography } = useTheme();
  const sections = summaryReaderSections(summary.text);
  const citations = summary.citations ?? [];
  const text = Array.from(summary.text);
  const sectionContains = (section: (typeof sections)[number], citation: SummaryCitation) =>
    (citation.start ?? citation.end) >= section.start && citation.end <= section.end;
  if (!sections.some(section => section.heading) ||
      citations.some(citation => !sections.some(section => sectionContains(section, citation)))) {
    return <View style={{ marginTop: spacing.xxl }}><CitedSummary summary={summary} /></View>;
  }

  return <View style={{ gap: spacing.xxl, marginTop: spacing.xxl }}>
    {sections.map(section => (
      <View key={section.start} style={{ gap: spacing.sm }}>
        {section.heading ? <Text accessibilityRole="header" style={[typography.heading, { color: palette.text }]}>{section.heading}</Text> : null}
        <CitedSummary summary={{
          ...summary,
          text: text.slice(section.start, section.end).join(''),
          citations: citations.filter(citation => sectionContains(section, citation)).map(citation => ({
            ...citation,
            start: citation.start === undefined ? undefined : citation.start - section.start,
            end: citation.end - section.start,
          })),
        }} />
      </View>
    ))}
  </View>;
}

function CitedSummary({ summary }: { summary: Summary }) {
  const { palette, typography } = useTheme();
  const characters = Array.from(summary.text);
  const citations = (summary.citations ?? []).filter(citation => Number.isInteger(citation.end) &&
    citation.end > 0 && citation.end <= characters.length && /^https?:\/\//i.test(citation.url))
    .sort((a, b) => a.end - b.end);
  let start = 0;
  const parts = citations.map((citation, index) => {
    const span = citation.start !== undefined && citation.start >= start && citation.start < citation.end
      ? characters.slice(citation.start, citation.end).join('') : '';
    const linkText = span.trim().replace(/^\((.*)\)$/, '$1');
    const existingLink = /^(?:\[[^\]]+\]\(https?:\/\/.+\)|https?:\/\/\S+)$/i.test(linkText);
    const fragment = characters.slice(start, existingLink ? citation.start : citation.end).join('');
    start = citation.end;
    return <Text key={index}>{fragment}<Text accessibilityRole="link" accessibilityLabel={citation.title}
      style={{ textDecorationLine: 'underline', color: palette.text }}
      onPress={() => { void Linking.openURL(citation.url).catch(() => {}); }}> [{index + 1}]</Text></Text>;
  });
  return <Text selectable style={[Platform.OS === 'android' && typography.body, { color: palette.text }]}>{parts}{characters.slice(start).join('')}</Text>;
}
