import type { CompletedTranscript, SpeakerResult } from './transcriptCompletion';
export type CommitCompletion = (recording: string, text: string, speakers?: SpeakerResult) => Promise<CompletedTranscript>;
export const commitCompletion: CommitCompletion | undefined = undefined;
