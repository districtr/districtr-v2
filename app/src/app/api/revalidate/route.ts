import {revalidatePath} from 'next/cache';
import {NextResponse} from 'next/server';

// Busts the ISR cache (revalidate = 3600) for CMS-driven pages so admin edits
// show up immediately instead of after up to an hour.
// ponytail: unauthenticated and revalidates all CMS pages — worst case is extra
// page regeneration; add auth + per-slug paths if that ever matters.
export async function POST() {
  revalidatePath('/portals');
  revalidatePath('/places');
  revalidatePath('/portal/[slug]', 'page');
  revalidatePath('/place/[slug]', 'page');
  return NextResponse.json({revalidated: true});
}
