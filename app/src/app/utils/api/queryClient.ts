import {QueryClient} from '@tanstack/react-query';
export const queryClient = new QueryClient();

/**
 * For the evaluation report: each query loads once and is never refetched, so the
 * page stays the snapshot its header names until the reader reloads it.
 */
export const reportQueryClient = new QueryClient({
  defaultOptions: {
    queries: {refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: false},
  },
});
