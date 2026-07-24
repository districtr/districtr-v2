import {NextRequest, NextResponse} from 'next/server';
import {LEGACY_DISTRICTR_URL} from '@/app/constants/legacy';

/**
 * Checks whether a path exists on the legacy Districtr site. Runs server-side
 * because the legacy site doesn't send CORS headers.
 */
export const GET = async (req: NextRequest) => {
  const path = req.nextUrl.searchParams.get('path') ?? '';
  // Only allow same-site paths; '//' would be a protocol-relative URL to another host.
  if (!path.startsWith('/') || path.startsWith('//')) {
    return NextResponse.json({exists: false});
  }
  try {
    const res = await fetch(`${LEGACY_DISTRICTR_URL}${path}`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return NextResponse.json({exists: res.ok});
  } catch {
    return NextResponse.json({exists: false});
  }
};
