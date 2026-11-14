import { useEffect, useRef, useState } from 'react';
import { Linking, Text, TextInput, View } from 'react-native';
import { Host, Switch } from '@expo/ui/jetpack-compose';
import { semantics } from '@expo/ui/jetpack-compose/modifiers';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { meetingEssentials, thinkingBudgets, type ThinkingEffort, type SummaryCitation } from './OpenAIClient';
import { openAIAccess } from './OpenAIAccess';
import { useTheme } from './ui/theme';
import { ActionButton } from './ui/ActionButton';

type Summary = { recipe: string; model: string; source: 'original' | 'revision'; text: string; citations?: SummaryCitation[]; effort?: ThinkingEffort; webSearch?: boolean };
type Props = {
  original: File;
  revision: File;
  output: File;
  save: (file: File, text: string) => Promise<void>;
  onLockChange: (locked: boolean) => void;
};

export function TranscriptSummary({ original, revision, output, save, onLockChange }: Props) {
  const { palette, spacing } = useTheme();
  const [open, setOpen] = useState(false);
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

  function savedFiles() {
    return output.parentDirectory.list()
      .filter((entry): entry is File => entry instanceof File && entry.name.startsWith(output.name + '.') && entry.name.endsWith('.json'))
      .sort((a, b) => b.name.localeCompare(a.name));
  }

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
      const previous = savedFiles();
      const next = new File(output.parentDirectory, `${output.name}.${Date.now()}-${randomUUID()}.json`);
      await save(next, JSON.stringify(result));
      for (const file of previous) {
        try { file.delete(); } catch { /* The new summary has already been saved. */ }
      }
      try { if (output.exists) output.delete(); } catch { /* Legacy copy. */ }
      setSummary(result);
      setUnsaved(undefined);
    } catch {
      setUnsaved(result);
      throw new Error('Summary is ready. Retry saving before closing the transcript.');
    }
  }

  return (
    <View style={{ gap: spacing.sm }}>
      <ActionButton title={open ? 'Hide summary' : 'Summarize'} disabled={busy || !!unsaved} onPress={() => {
        setOpen(!open);
        if (!open && !summary) void run(async () => {
          const file = savedFiles()[0] ?? output;
          if (!file.exists) return;
          const saved = JSON.parse(await file.text()) as Summary;
          if (typeof saved.text !== 'string' || typeof saved.model !== 'string') throw new Error('Could not read the saved summary.');
          setSummary(saved);
        });
      }} />
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
            <Host matchContents style={{ minWidth: 60 }}>
              <Switch modifiers={[semantics({ contentDescription: 'Search the web' })]}
                enabled={!busy} value={webSearch} onCheckedChange={setWebSearch} />
            </Host>
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
        {revision.exists ? <ActionButton title={source === 'original' ? 'Source: Original · Switch to saved revision' : 'Source: Saved revision · Switch to original'}
          disabled={busy} onPress={() => setSource(source === 'original' ? 'revision' : 'original')} /> : null}
        <Text style={{ color: palette.muted }}>Only the selected transcript text is sent to OpenAI for this summary. The source, model, and thinking budget are saved with the result on this device. Summary generation uses your OpenAI project quota.
          {recipe === 'custom' && webSearch ? ' Web search is on. OpenAI may use relevant details from the text to form public web queries.' : ' Web search is off.'}</Text>
        <ActionButton title={busy ? 'Working…' : unsaved ? 'Retry saving summary' : 'Generate summary'} variant="primary"
          disabled={busy || (!unsaved && (!recipe || !model || (recipe === 'custom' && !instructions.trim())))} onPress={() => void run(async signal => {
            if (unsaved) { await persist(unsaved); return; }
            const transcript = (await (source === 'revision' ? revision : original).text()).trim();
            if (!transcript) throw new Error('The selected transcript is empty.');
            if (!recipe) return;
            const searchEnabled = recipe === 'custom' && webSearch;
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

function CitedSummary({ summary }: { summary: Summary }) {
  const { palette } = useTheme();
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
  return <Text selectable style={{ color: palette.text }}>{parts}{characters.slice(start).join('')}</Text>;
}
