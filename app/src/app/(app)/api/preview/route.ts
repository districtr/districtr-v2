import {draftMode} from 'next/headers';
import {NextResponse} from 'next/server';

/**
 * Enable Next.js Draft Mode for Payload CMS live preview.
 *
 * Payload's live preview iframe hits this endpoint to enable draft mode,
 * allowing the frontend pages to fetch unpublished draft content.
 */
export async function GET(request: Request) {
  const {searchParams} = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.PAYLOAD_SECRET) {
    return NextResponse.json({error: 'Invalid secret'}, {status: 401});
  }

  (await draftMode()).enable();
  return NextResponse.json({draft: true});
}

/**
 * Disable Next.js Draft Mode (exit preview).
 */
export async function DELETE() {
  (await draftMode()).disable();
  return NextResponse.json({draft: false});
}
