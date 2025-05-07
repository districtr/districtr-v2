import { unstable_noStore as noStore} from "next/cache";

export const GET = async () => {
  noStore();
  const formUrl = process.env.NEXT_PUBLIC_FEEDBACK_FORM;
  if (!formUrl || !URL.canParse(formUrl)) {
    return new Response('Form URL not found', {status: 404});
  }
  return new Response(JSON.stringify({
    formUrl,
  }), {
    headers: {
      'Cache-Control': 'no-cache, no-store, max-age=0, must-revalidate',
    },
  });
};