import {CMS_PUBLIC_URL, EXTRACT_URL} from './constants';

export type ExtractFormat = 'gpkg' | 'csv' | 'geojson' | 'shp';

export type ExtractToken =
  | {status: 'ok'; token: string}
  | {status: 'signed-out' | 'forbidden' | 'error'; detail: string};

/** A fresh 15-minute token from the CMS session (cms/authapi/views.py::extract_token).
 * The CMS is same-site, so `credentials: 'include'` sends its session cookie. */
export const getExtractToken = async (): Promise<ExtractToken> => {
  try {
    const res = await fetch(`${CMS_PUBLIC_URL}/api/extract-token/`, {credentials: 'include'});
    const body = await res.json();
    if (res.ok) return {status: 'ok', token: body.token};
    const status = res.status === 401 ? 'signed-out' : res.status === 403 ? 'forbidden' : 'error';
    return {status, detail: body.detail ?? res.statusText};
  } catch {
    return {status: 'error', detail: 'Could not reach the CMS'};
  }
};

export interface ExtractResult {
  url: string;
  filename: string;
  count: number;
  expires_at: string;
}

export const requestExtract = async (body: {
  layer: string;
  ids: string[];
  format: ExtractFormat;
}): Promise<{ok: true; result: ExtractResult} | {ok: false; detail: string}> => {
  const auth = await getExtractToken();
  if (auth.status !== 'ok') return {ok: false, detail: auth.detail};
  try {
    const res = await fetch(`${EXTRACT_URL}/extracts`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? {ok: true, result: json} : {ok: false, detail: json.detail ?? res.statusText};
  } catch {
    return {ok: false, detail: 'Could not reach the extract service'};
  }
};
