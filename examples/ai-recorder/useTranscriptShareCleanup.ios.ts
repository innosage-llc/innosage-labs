import { useEffect } from 'react';
import { pruneTranscriptShareCache } from './transcriptTransfer.ios';

export function useTranscriptShareCleanup() {
  useEffect(pruneTranscriptShareCache, []);
}
