import {unstable_noStore as noStore} from 'next/cache';

/**
 * Reports the build tag of the currently deployed frontend.
 *
 * NEXT_PUBLIC_BUILD_TAG is the git SHA written to .env.production by the
 * deploy workflow. The same value is inlined into the client bundle at build
 * time, so a client whose inlined tag differs from this response is running a
 * bundle from before the latest deploy (see VersionCheck.tsx). Returns
 * `{version: null}` in local dev, which disables the check.
 */
export const GET = async () => {
  noStore();
  return new Response(
    JSON.stringify({
      version: process.env.NEXT_PUBLIC_BUILD_TAG ?? null,
    }),
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      },
    }
  );
};
