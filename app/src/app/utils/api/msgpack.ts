import {decode, encode} from '@msgpack/msgpack';
import {API_URL} from './constants';
import {fetchWithSession} from './session';

type ApiResult<T> = {ok: true; response: T} | {ok: false; error: {detail: string}};

type QueryParams = Record<string, string | number | (string | number)[] | undefined>;

function buildUrl(path: string, queryParams?: QueryParams): string {
  const apiUrl = API_URL || '';
  let fullPath = `${apiUrl}/api/${path}`;
  if (!queryParams) return fullPath;
  const url = new URL(fullPath);
  let touched = false;
  for (const [key, value] of Object.entries(queryParams)) {
    if (value == null) continue;
    touched = true;
    if (Array.isArray(value)) {
      value.forEach(v => url.searchParams.append(key, String(v)));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return touched ? url.toString() : fullPath;
}

async function readError(response: Response): Promise<{detail: string}> {
  return await response.json().catch(() => ({detail: response.statusText}));
}

// JSON.stringify(new Error(...)) is "{}" — surface the message instead.
function errorDetail(error: unknown): {detail: string} {
  return {detail: error instanceof Error ? error.message : String(error)};
}

export async function getMsgpack<T>(
  path: string,
  queryParams?: QueryParams
): Promise<ApiResult<T>> {
  try {
    const response = await fetchWithSession(buildUrl(path, queryParams), {
      headers: {Accept: 'application/msgpack'},
    });
    if (!response.ok) return {ok: false, error: await readError(response)};
    const buffer = await response.arrayBuffer();
    return {ok: true, response: decode(new Uint8Array(buffer)) as T};
  } catch (error) {
    return {ok: false, error: errorDetail(error)};
  }
}

export async function putMsgpack<TBody, TResponse>(
  path: string,
  body: TBody
): Promise<ApiResult<TResponse>> {
  try {
    const encoded = encode(body);
    const response = await fetchWithSession(buildUrl(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/msgpack',
        Accept: 'application/json',
      },
      body: encoded,
    });
    if (!response.ok) return {ok: false, error: await readError(response)};
    return {ok: true, response: (await response.json()) as TResponse};
  } catch (error) {
    return {ok: false, error: errorDetail(error)};
  }
}
