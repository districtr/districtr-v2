import {unstable_noStore as noStore} from 'next/cache';

export const GET = async () => {
  noStore();
  return new Response(
    JSON.stringify({
      formUrl: process.env.NEXT_PUBLIC_FEEDBACK_FORM ?? null,
      debugSelectionPoints: process.env.NEXT_PUBLIC_DEBUG_SELECTION_POINTS === 'true',
    }),
    {
      headers: {
        'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
      },
    }
  );
};
