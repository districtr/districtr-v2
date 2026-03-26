import {API_URL} from './constants';
import {HTTP_METHOD} from 'next/dist/server/web/http';
import {AppSession} from '@/app/lib/session';
import {getPayloadToken} from './payloadAuth';

export type QueryParams = Record<string, string | number | boolean | (string | number)[]>;

/**
 * Resolve the Bearer token from either an Auth0 AppSession or Payload CMS cookie.
 * Auth0 session takes priority if provided; falls back to Payload token.
 */
function resolveAccessToken(session?: AppSession | null): string | null {
  if (session?.tokenSet?.accessToken) {
    return session.tokenSet.accessToken;
  }
  return getPayloadToken();
}

/**
 * API endpoint handler factory
 * @param API route excluding /api/
 * @returns A function that takes a method and returns the final API caller
 */
export const make = (path: string) => {
  return <TBody extends object, TResponse = any>(
    method: HTTP_METHOD,
    options: HeadersInit = {}
  ) => {
    return async ({
      body,
      session,
      queryParams,
    }: {
      body?: TBody;
      session?: AppSession | null;
      queryParams?: QueryParams;
    }): Promise<
      | {
          ok: true;
          response: TResponse;
        }
      | {
          ok: false;
          error: {
            detail: string;
          };
        }
    > => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        ...options,
      });

      const accessToken = resolveAccessToken(session);
      if (accessToken) {
        headers.append('Authorization', `Bearer ${accessToken}`);
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (method !== 'GET' && body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const apiUrl = API_URL || '';
      let fullPath = `${apiUrl}/api/${path}`;

      // Add query parameters if provided
      if (queryParams && Object.keys(queryParams).length > 0) {
        const url = new URL(fullPath);
        Object.entries(queryParams).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            value.forEach(v => url.searchParams.append(key, String(v)));
          } else {
            url.searchParams.set(key, String(value));
          }
        });
        fullPath = url.toString();
      }

      try {
        const response = await fetch(fullPath, fetchOptions);

        if (!response.ok) {
          const error = await response.json();
          return {
            ok: false,
            error: error,
          };
        }
        let responseContent = await response.text();
        try {
          responseContent = JSON.parse(responseContent);
        } catch (error) {
          // response was not json
        }

        return {
          ok: true,
          response: responseContent as TResponse,
        };
      } catch (error) {
        return {
          ok: false,
          error: {
            detail: JSON.stringify(error),
          },
        };
      }
    };
  };
};

export const get = <TResponse extends object>(path: string) =>
  make(path)<object, TResponse>('GET', {});
export const post = <TBody extends object, TResponse extends object>(path: string) =>
  make(path)<TBody, TResponse>('POST', {});
export const put = <TBody extends object, TResponse extends object>(path: string) =>
  make(path)<TBody, TResponse>('PUT', {});
export const patch = <TBody extends object, TResponse extends object>(path: string) =>
  make(path)<TBody, TResponse>('PATCH', {});
export const del = <TBody extends object, TResponse extends object>(path: string) =>
  make(path)<TBody, TResponse>('DELETE', {});
