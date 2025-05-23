import {API_URL} from './constants';
import {HTTP_METHOD} from 'next/dist/server/web/http';
import {ClientSession} from '@/app/lib/auth0';

/**
 * API endpoint handler factory
 * @param API route excluding /api/
 * @returns A function that takes a method and returns the final API caller
 * // TODO We should slowly start to convert all existing API callers to use this factory
 */
export const make = (path: string) => {
  return <TBody extends object, TResponse = any>(
    method: HTTP_METHOD,
    options: HeadersInit = {}
  ) => {
    return async ({
      body,
      session,
    }: {
      body?: TBody;
      session?: ClientSession;
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

      if (session?.tokenSet?.accessToken) {
        headers.append('Authorization', `Bearer ${session.tokenSet.accessToken}`);
      }

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (method !== 'GET' && body) {
        fetchOptions.body = JSON.stringify(body);
      }

      const apiUrl = API_URL || '';
      const fullPath = `${apiUrl}/api/${path}`;

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
