import { ProServiceError } from './ProClient';

export class KnownServiceFailure extends Error {}

/** A status read must release the screen even when the connection stops responding. */
export function readOperationWithDeadline<T>(
  read: (signal: AbortSignal) => Promise<T>,
  signal: AbortSignal,
  timeoutMillis = 30_000,
): Promise<T> {
  return read(AbortSignal.any([signal, AbortSignal.timeout(timeoutMillis)]));
}

export function statusRecoveryMessage(error: unknown): string {
  if (error instanceof KnownServiceFailure || error instanceof ProServiceError) return error.message;
  return 'Could not check this operation. Its status is still unknown. Check your connection and try this same operation again.';
}
