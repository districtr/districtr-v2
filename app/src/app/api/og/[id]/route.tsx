import {API_URL} from '@/app/utils/api/constants';
import {DRAFT_STATUS_TEXT, DraftStatus} from '@constants/document/draftStatus';
import {OG_IMAGE_SIZE, publicShareUrl} from '@/app/utils/metadata/pageMetadataUtils';
import {isUUID} from '@/app/utils/metadata/isUUID';
import {ImageResponse} from 'next/og';
import fs from 'fs';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';

const DISTRICTR_BLUE = '#0099cd';

const STATUS_PILL_COLORS: Record<DraftStatus, {bg: string; text: string}> = {
  scratch: {bg: '#f1f5f9', text: '#475569'},
  in_progress: {bg: '#ffedd5', text: '#9a3412'},
  ready_to_share: {bg: '#dcfce7', text: '#166534'},
};

const loadFonts = () => [
  {name: 'Nunito', data: fs.readFileSync('./public/Nunito-Medium.ttf'), weight: 400 as const},
  {name: 'Nunito', data: fs.readFileSync('./public/Nunito-Bold.ttf'), weight: 700 as const},
];

const clamp = (text: string, max: number) =>
  text.length > max ? text.slice(0, max - 1).trimEnd() + '…' : text;

const PasswordWarningBanner = ({publicUrl}: {publicUrl: string | null}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      backgroundColor: '#b91c1c',
      color: 'white',
      padding: '24px 56px',
      textAlign: 'center',
    }}
  >
    <div style={{display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '16px'}}>
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="10" width="16" height="11" rx="2" fill="white" />
        <path d="M8 10V7a4 4 0 118 0v3" stroke="white" strokeWidth="2.5" fill="none" />
      </svg>
      <p style={{fontSize: '40px', fontWeight: 700, margin: 0}}>This link grants edit access</p>
    </div>
    <p style={{fontSize: '26px', margin: '10px 0 0', opacity: 0.95}}>
      Share this link with care: anyone who has it can edit the map.
    </p>
    {!!publicUrl && (
      <p style={{fontSize: '26px', margin: '6px 0 0', opacity: 0.95}}>
        To share publicly, use <span style={{fontWeight: 700, marginLeft: '8px'}}>{publicUrl}</span>
      </p>
    )}
  </div>
);

export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  // Edit links leak write access — the metadata layer flags them with ?warn=1
  // (legacy UUID-in-path links are caught here directly)
  const isPasswordLink = isUUID(id) || new URL(request.url).searchParams.has('warn');

  const mapDocument = await fetch(`${API_URL}/api/document/${id}`, {
    next: {revalidate: 300},
  })
    .then(res => (res.ok ? (res.json() as Promise<NonNullable<DocumentObject>>) : null))
    .catch(() => null);
  const fonts = loadFonts();

  if (!mapDocument) {
    return new ImageResponse(
      (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            width: '100%',
            height: '100%',
            backgroundColor: 'white',
            fontFamily: "'Nunito', sans-serif",
          }}
        >
          {isPasswordLink && <PasswordWarningBanner publicUrl={null} />}
          <div
            style={{
              display: 'flex',
              flexGrow: 1,
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '48px',
              color: '#334155',
            }}
          >
            Map not found
          </div>
        </div>
      ),
      // 404 + no-store so a transient API failure isn't cached as the permanent card
      {...OG_IMAGE_SIZE, fonts, status: 404, headers: {'cache-control': 'no-store'}}
    );
  }

  const title = clamp(mapDocument.map_metadata?.name ?? 'Districtr Map', 70);
  const description = mapDocument.map_metadata?.description
    ? clamp(mapDocument.map_metadata.description, 160)
    : null;
  const draftStatus = mapDocument.map_metadata?.draft_status;
  const pill = draftStatus ? STATUS_PILL_COLORS[draftStatus] : null;

  const thumbnail = await fetch(`${API_URL}/api/document/${id}/thumbnail`, {
    next: {revalidate: 300},
  })
    .then(res => (res.ok ? res.arrayBuffer() : null))
    .catch(() => null);
  const thumbnailURI = thumbnail
    ? 'data:image/png;base64,' + Buffer.from(thumbnail).toString('base64')
    : 'data:image/png;base64,' +
      fs.readFileSync('./public/home-megaphone-square.png').toString('base64');

  const thumbSize = isPasswordLink ? 380 : 480;

  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: '100%',
          height: '100%',
          backgroundColor: 'white',
          fontFamily: "'Nunito', sans-serif",
        }}
      >
        {isPasswordLink ? (
          <PasswordWarningBanner publicUrl={publicShareUrl(mapDocument)} />
        ) : (
          <div style={{display: 'flex', height: '14px', backgroundColor: DISTRICTR_BLUE}} />
        )}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            flexGrow: 1,
            padding: isPasswordLink ? '32px 56px' : '48px 56px',
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flexGrow: 1,
              paddingRight: '48px',
              maxWidth: '620px',
            }}
          >
            <div style={{display: 'flex', flexDirection: 'row', gap: '14px', alignItems: 'center'}}>
              {!!pill && !!draftStatus && (
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: pill.bg,
                    color: pill.text,
                    fontSize: '24px',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '1px',
                    padding: '8px 22px',
                    borderRadius: '999px',
                  }}
                >
                  {DRAFT_STATUS_TEXT[draftStatus]}
                </div>
              )}
              {!!mapDocument.num_districts && (
                <div
                  style={{
                    display: 'flex',
                    backgroundColor: '#e0f2fe',
                    color: '#075985',
                    fontSize: '24px',
                    fontWeight: 700,
                    padding: '8px 22px',
                    borderRadius: '999px',
                  }}
                >
                  {mapDocument.num_districts} districts
                </div>
              )}
            </div>
            <h1
              style={{
                fontSize: title.length > 40 ? '52px' : '64px',
                fontWeight: 700,
                color: '#0f172a',
                lineHeight: 1.15,
                margin: '28px 0 0',
              }}
            >
              {title}
            </h1>
            {!!mapDocument.map_module && (
              <p
                style={{
                  fontSize: '30px',
                  color: DISTRICTR_BLUE,
                  fontWeight: 700,
                  margin: '16px 0 0',
                }}
              >
                {mapDocument.map_module}
              </p>
            )}
            {!!description && (
              <p style={{fontSize: '26px', color: '#475569', lineHeight: 1.4, margin: '16px 0 0'}}>
                {description}
              </p>
            )}
          </div>
          <div
            style={{
              display: 'flex',
              width: `${thumbSize}px`,
              height: `${thumbSize}px`,
              alignSelf: 'center',
              backgroundColor: '#f8fafc',
              border: '2px solid #e2e8f0',
              borderRadius: '24px',
              overflow: 'hidden',
            }}
          >
            <img
              src={thumbnailURI}
              alt=""
              style={{
                width: `${thumbSize - 4}px`,
                height: `${thumbSize - 4}px`,
                objectFit: 'cover',
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...OG_IMAGE_SIZE,
      fonts,
      // Override ImageResponse's default year-long immutable cache-control so
      // renames/status changes reach the card within the data-cache window
      headers: {'cache-control': 'public, s-maxage=300, stale-while-revalidate=86400'},
    }
  );
}
