export type ServiceId = 'staging' | 'production';
export const SERVICE_KEY = 'recorder.transcription.service';
export const services = {
  staging: {
    label: 'InnoSage · Staging',
    workerURL: 'https://api-staging.draft.innosage.co',
    routerURL: 'https://rd.innosage.co:8443',
  },
  production: {
    label: 'InnoSage · Production',
    workerURL: 'https://api.draft.innosage.co',
    routerURL: 'https://speech-router.innosage.co:8443',
  },
} as const;
export function serviceId(value: string | null): ServiceId {
  if (value === null) return 'staging'; // Preserve the existing APK's default.
  if (value === 'staging' || value === 'production') return value;
  throw new Error('Unknown transcription service. Choose a service in Settings.');
}
export function serviceForWorker(workerURL: string): ServiceId {
  for (const id of ['staging', 'production'] as const) {
    if (services[id].workerURL === workerURL) return id;
  }
  throw new Error('This transcription belongs to an unsupported service.');
}
