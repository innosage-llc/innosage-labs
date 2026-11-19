import type { File } from 'expo-file-system';
import type { DraftKind, draftStore } from './draftDocumentModel';

// Metro selects the native Android implementation in the bundled Recorder build.
// Other platforms keep their existing transcript and summary flows.
export const draftEditorIsBundled = () => false;
export async function createDraftDocument(_recording:File, _kind:DraftKind):Promise<ReturnType<typeof draftStore>> {
  throw new Error('The bundled Draft editor is available only on Android.');
}
