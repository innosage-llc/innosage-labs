import { useEffect, useMemo, useRef, useState, type Ref } from 'react';
import { Alert, Platform, type ViewProps } from 'react-native';
import { requireNativeView } from 'expo';
import { randomUUID } from 'expo-crypto';
import { type DraftSnapshot } from './draftDocumentModel';
import type { createDraftDocument } from './draftDocumentStore';
import { parseRecorderEvent, prepareRecorderOpen, recorderDraftTitle } from './recorderDraftProtocol';
import { RecorderDraftPage } from './RecorderDraftPage';

type Props = {
  document: Awaited<ReturnType<typeof createDraftDocument>>;
  title: string;
  initial: string;
  onClose(): void;
  onCommitted(snapshot: DraftSnapshot): void;
};
type EditorRef = {sendDocumentMessage(message: string): Promise<void>};
type NativeEditor = ViewProps & {
  ref?: Ref<EditorRef>;
  onDocumentEvent(event: {nativeEvent:{message:string}}): void;
  onDocumentError(): void;
};
const LOAD_TIMEOUT = 12_000;

export function RecorderDraftHost({document, title, initial, onClose, onCommitted}: Props) {
  const NativeEditor = useMemo(() => Platform.OS === 'android' ? requireNativeView<NativeEditor>('RecorderDraftEditor') : undefined, []);
  const editor = useRef<EditorRef>(null);
  const [error, setError] = useState<string>();
  const [backPending, setBackPending] = useState(false);
  const session = useMemo(randomUUID, []);
  const notify = useRef({onClose, onCommitted});
  notify.current = {onClose, onCommitted};
  const state = useRef({
    active: false, ready: false, openIssued: false, opened: false, closed: false, backFailed: false,
    revision: 0, nextFlush: 0, awaitingBack: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
  }).current;

  useEffect(() => {
    state.active = true;
    const timer = setTimeout(() => {
      if (!state.opened && state.openIssued)
        setError('The offline editor did not confirm opening. Back will try to finish saving before leaving.');
      else if (!state.ready) setError('The offline editor did not finish starting. Go back and try again.');
    }, LOAD_TIMEOUT);
    return () => { state.active = false; clearTimeout(timer); clearTimeout(state.timer); };
  }, [state]);

  const post = (msg: Record<string, unknown>) => {
    if (state.active) void editor.current?.sendDocumentMessage(JSON.stringify({version:1, session, ...msg}))
      .catch(() => { if (state.active) setError('Could not reach the local editor.'); });
  };
  const close = () => {
    if (state.closed) return;
    state.closed = true;
    notify.current.onClose();
  };
  function back() {
    if (state.awaitingBack || state.closed) return;
    if (!state.openIssued) { close(); return; }
    if (state.backFailed) {
      Alert.alert('Close without a confirmed save?', 'Your last saved revision will remain. Recent edits might be lost.', [
        {text:'Keep editing', style:'cancel', onPress:() => { state.backFailed = false; }},
        {text:'Close draft', style:'destructive', onPress:close},
      ]);
      return;
    }
    const flushId = ++state.nextFlush;
    state.awaitingBack = flushId;
    setBackPending(true);
    post({type:'flush', flushId});
    state.timer = setTimeout(() => {
      state.awaitingBack = 0;
      state.backFailed = true;
      setBackPending(false);
      setError('The editor has not confirmed the local save. Keep editing or choose whether to close when you go Back.');
    }, LOAD_TIMEOUT);
  }

  async function receive(raw: string) {
    const event = parseRecorderEvent(raw, session, document.pageId);
    if (!state.active || state.closed || !event) return;
    switch (event.type) {
      case 'ready': {
        if (state.ready) return;
        state.ready = true;
        try {
          const snapshot = await document.recover();
          if (!state.active || state.closed) return;
          const opening = prepareRecorderOpen(document.pageId, title, initial, snapshot);
          if (!opening) {
            setError('This transcript is too large for the offline editor. Go back and choose Show original. The saved original and audio are unchanged.');
            return;
          }
          state.revision = opening.revision;
          // A mounted editor can accept input before we receive its opened event.
          // From dispatch onward, Back must confirm a flush or an explicit discard.
          state.openIssued = true;
          post(opening);
        } catch {
          if (state.active) setError('Could not open the saved document. No changes were made.');
        }
        break;
      }
      case 'opened':
        if (!state.openIssued) break;
        state.opened = true;
        if (state.awaitingBack) post({type:'flush', flushId:state.awaitingBack});
        else setError(undefined);
        break;
      case 'save': {
        if (!state.openIssued) return;
        state.opened = true;
        try {
          const saved = await document.commit(event.baseRevision, event.blocks);
          if (!state.active || state.closed) return;
          state.revision = saved.revision;
          state.backFailed = false;
          post({type:'saved', requestId:event.requestId, ok:true, revision:saved.revision});
          setError(undefined);
          notify.current.onCommitted(saved);
        } catch {
          post({type:'saved', requestId:event.requestId, ok:false, revision:state.revision});
        }
        break;
      }
      case 'flushed':
        if (event.flushId !== state.awaitingBack) break;
        clearTimeout(state.timer);
        if (state.awaitingBack && event.ok) close();
        else {
          state.awaitingBack = 0;
          state.backFailed = true;
          setBackPending(false);
          setError('The edit has not been saved. Retry the save in Draft, or choose whether to close on Back.');
        }
        break;
      case 'error':
        if (state.openIssued) state.backFailed = true;
        setError('Could not complete the local editor action. Check for unsaved edits before closing.');
        break;
    }
  }

  return <RecorderDraftPage
    title={recorderDraftTitle(title)}
    editor={NativeEditor ? <NativeEditor
      style={{flex:1}}
      ref={editor}
      onDocumentEvent={event => { void receive(event.nativeEvent.message); }}
      onDocumentError={() => setError('The offline editor is unavailable in this Recorder build.')}
    /> : null}
    onBack={back}
    backPending={backPending}
    retrySave={undefined}
    message={NativeEditor ? error : 'This Draft editor is only available on Android.'}
  />;
}
