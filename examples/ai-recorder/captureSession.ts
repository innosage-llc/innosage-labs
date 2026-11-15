import type { AudioRecorder, RecordingStatus } from 'expo-audio';
import type { CapturePhase } from './ui/navigation';

type Snapshot = {
  phase: CapturePhase;
  message: string;
  savedUri?: string;
  saveVersion: number;
};

type Dependencies = {
  recorder: AudioRecorder;
  microphone: () => Promise<{ granted: boolean; canAskAgain: boolean }>;
  notification: () => Promise<unknown>;
  audioMode: () => Promise<unknown>;
  save: (url: string) => Promise<string>;
  permissionMessage: (canAskAgain: boolean) => string;
  savedMessage: string;
};

/** Owns one capture independently of React surfaces within the current JS runtime. */
export class CaptureSession {
  readonly recorder: AudioRecorder;
  private snapshot: Snapshot = { phase: 'idle', message: '', saveVersion: 0 };
  private listeners = new Set<() => void>();
  private activeCapture = false;
  private finishedUrls = new Set<string>();
  // Keep the completion subscription with the owner, including between screen mounts.
  private completionSubscription;

  private readonly dependencies: Dependencies;
  private playbackBinding?: { pause: () => void };

  constructor(dependencies: Dependencies) {
    this.dependencies = dependencies;
    this.recorder = dependencies.recorder;
    this.completionSubscription = this.recorder.addListener('recordingStatusUpdate', status => {
      void this.complete(status);
    });
  }

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    // A screen detaches only its rendering subscription, never the capture or completion listener.
    return () => { this.listeners.delete(listener); };
  };
  private update(patch: Partial<Snapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach(listener => listener());
  }
  setPhase = (phase: CapturePhase) => { this.update({ phase }); };
  setMessage = (message: string) => { this.update({ message }); };

  bindPlayback(pause: () => void) {
    const binding = { pause };
    this.playbackBinding = binding;
    return () => {
      if (this.playbackBinding === binding) this.playbackBinding = undefined;
    };
  }

  async start() {
    if (this.snapshot.phase !== 'idle') return;
    this.update({ phase: 'starting', message: '', savedUri: undefined });
    try {
      const permission = await this.dependencies.microphone();
      if (!permission.granted) {
        this.setMessage(this.dependencies.permissionMessage(permission.canAskAgain));
        this.setPhase('idle');
        return;
      }
      await this.dependencies.notification();
      // Resolve the current surface after permission awaits. A detached player's
      // native object is released by its hook and must never be called later.
      this.playbackBinding?.pause();
      await this.dependencies.audioMode();
      await this.recorder.prepareToRecordAsync();
      this.activeCapture = true;
      this.recorder.record();
      this.setPhase('recording');
    } catch {
      this.activeCapture = false;
      this.setMessage('Could not start recording. Return to the app and try again.');
      this.setPhase('idle');
    }
  }

  async stop() {
    if (this.snapshot.phase !== 'recording') return;
    this.setPhase('saving');
    try {
      await this.recorder.stop();
    } catch {
      this.setMessage('Could not stop the recording.');
      this.setPhase(this.recorder.getStatus().isRecording ? 'recording' : 'idle');
    }
  }

  private async complete(status: RecordingStatus) {
    if (!status.isFinished || !this.activeCapture || (status.url && this.finishedUrls.has(status.url))) return;
    this.activeCapture = false;
    if (status.url) this.finishedUrls.add(status.url);
    this.setPhase('saving');
    try {
      if (status.hasError || !status.url) throw new Error('Recording did not finish.');
      const savedUri = await this.dependencies.save(status.url);
      this.update({ savedUri, saveVersion: this.snapshot.saveVersion + 1, message: this.dependencies.savedMessage });
    } catch {
      this.update({ savedUri: undefined, message: 'Could not save the recording.' });
    } finally {
      this.setPhase('idle');
    }
  }
}
