import { useEffect, useRef, useState } from 'react';
import { Button, Text, View } from 'react-native';
import { randomUUID } from 'expo-crypto';
import { File } from 'expo-file-system';
import { meetingEssentials } from './OpenAIClient';
import { openAIAccess } from './OpenAIAccess';
import { useTheme } from './ui/theme';

type Summary = { recipe: string; model: string; source: 'original' | 'revision'; text: string };
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
      <Button title={open ? 'Hide summary' : 'Summarize'} disabled={busy || !!unsaved} onPress={() => {
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
        <Button title={recipe ? '✓ Meeting Essentials' : 'Meeting Essentials'} disabled={busy || !!recipe} onPress={() => setRecipe(meetingEssentials.id)} />
        <Button title={model ? 'Model: ' + model : 'Choose OpenAI model'} disabled={busy} onPress={() => {
          if (choosing) { setChoosing(false); return; }
          void run(async signal => {
            const available = await openAIAccess.summaryModels(signal);
            setModels(available);
            if (!available.includes(model)) setModel('');
            if (!available.length) setMessage('No compatible text models are available for this OpenAI key.');
            setChoosing(true);
          });
        }} />
        {choosing ? models.map(id => (
          <Button key={id} title={id} disabled={busy} onPress={() => { setModel(id); setChoosing(false); }} />
        )) : null}
        {revision.exists ? <Button title={source === 'original' ? 'Source: Original · Switch to saved revision' : 'Source: Saved revision · Switch to original'}
          disabled={busy} onPress={() => setSource(source === 'original' ? 'revision' : 'original')} /> : null}
        <Text style={{ color: palette.muted }}>Generate sends the selected transcript text to OpenAI.</Text>
        <Button title={busy ? 'Working…' : unsaved ? 'Retry saving summary' : 'Generate summary'}
          disabled={busy || (!unsaved && (!recipe || !model))} onPress={() => void run(async signal => {
            if (unsaved) { await persist(unsaved); return; }
            const transcript = (await (source === 'revision' ? revision : original).text()).trim();
            if (!transcript) throw new Error('The selected transcript is empty.');
            const text = await openAIAccess.summarize(model, transcript, signal);
            signal.throwIfAborted();
            await persist({ recipe: meetingEssentials.id, model, source, text });
          })} />
        {unsaved ? <Button title="Discard unsaved summary" disabled={busy} onPress={() => { setUnsaved(undefined); setMessage(''); }} /> : null}
        {message ? <Text accessibilityLiveRegion="polite" style={{ color: palette.text }}>{message}</Text> : null}
        {unsaved || summary ? <>
          <Text accessibilityRole="header" style={{ color: palette.text }}>Meeting Essentials</Text>
          <Text style={{ color: palette.muted }}>{(unsaved ?? summary)?.model} · {(unsaved ?? summary)?.source === 'revision' ? 'Saved revision' : 'Original'}{unsaved ? ' · Unsaved' : ''}</Text>
          <Text selectable style={{ color: palette.text }}>{(unsaved ?? summary)?.text}</Text>
        </> : null}
      </> : null}
    </View>
  );
}
