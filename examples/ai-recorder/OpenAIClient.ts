const origin = 'https://api.openai.com/v1';
const model = 'gpt-transcribe';
export const openAIMaxBytes = 25_000_000;
type Http = (url: string, init: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export function openAIKey(value: string) {
  const key = value.trim();
  if (!key || /\s/.test(key) || key.length > 4096) throw new Error('Enter an OpenAI Platform API key.');
  return key;
}

async function request(http: Http, path: string, key: string, init: RequestInit) {
  const authorization = `Bearer ${openAIKey(key)}`;
  let response;
  try {
    response = await http(origin + path, {
      ...init,
      headers: { Authorization: authorization },
      redirect: 'error',
    });
  } catch {
    throw new Error('Could not reach OpenAI or the request timed out.');
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('OpenAI rejected this API key.');
    if (response.status === 403 || response.status === 404) {
      throw new Error('Check that your OpenAI project key has access to the requested model and endpoint.');
    }
    if (response.status === 429) throw new Error('Check your OpenAI project quota, billing, or rate limit.');
    if (response.status === 413) throw new Error('OpenAI rejected the recording size.');
    throw new Error('OpenAI could not complete the request.');
  }
  try {
    return await response.json();
  } catch {
    throw new Error('OpenAI returned an unreadable response.');
  }
}

export async function verifyOpenAI(http: Http, key: string) {
  const response = await request(http, '/models/' + model, key, {
    method: 'GET',
    signal: AbortSignal.timeout(15_000),
  });
  if (response?.id !== model) throw new Error('Could not verify access to the OpenAI transcription model.');
}

export async function transcribeOpenAI(http: Http, key: string, file: Blob, signal: AbortSignal) {
  if (file.size <= 0 || file.size >= openAIMaxBytes) {
    throw new Error('Choose a non-empty M4A recording smaller than 25 MB.');
  }
  const body = new FormData();
  body.append('model', model);
  body.append('file', file, 'recording.m4a');
  const response = await request(http, '/audio/transcriptions', key, {
    method: 'POST', body, signal: AbortSignal.any([signal, AbortSignal.timeout(300_000)]),
  });
  if (typeof response?.text !== 'string' || !response.text.trim()) {
    throw new Error('OpenAI returned no transcript.');
  }
  return response.text;
}
