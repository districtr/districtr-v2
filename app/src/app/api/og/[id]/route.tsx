import {API_URL} from '@/app/utils/api/constants';
import {ImageResponse} from 'next/og';
import fs from 'fs';
import {DocumentObject} from '@/app/utils/api/apiHandlers/types';

export async function GET(_: Request, {params}: {params: Promise<{id: string}>}) {
  const {id} = await params;
  const mapDocument = await fetch(`${API_URL}/api/document/${id}`).then(res =>
    res.ok ? (res.json() as Promise<NonNullable<DocumentObject>>) : null
  );
  if (!mapDocument) {
    return new ImageResponse(<p>Map not found</p>);
  }
  const title = mapDocument.map_metadata?.name ?? 'Districtr Map';
  const logoImage = fs.readFileSync('./public/districtr_logo.jpg') as any;
  const base64Image = Buffer.from(logoImage).toString('base64');
  const dataURI = 'data:image/jpeg;base64,' + base64Image;

  const thumbnail = await fetch(`${API_URL}/api/document/${id}/thumbnail`).then(res =>
    res.ok ? res.arrayBuffer() : (fs.readFileSync('./public/home-megaphone-square.png') as any)
  );
  const thumbnailURI = 'data:image/png;base64,' + Buffer.from(thumbnail).toString('base64');
  // Load the font in an edge-compatible way
  const nunitoBold = fs.readFileSync('./public/Nunito-Bold.ttf');
  const nunitoMedium = fs.readFileSync('./public/Nunito-Medium.ttf');

  return new ImageResponse(
    (
      <>
        <div
          style={{
            border: '20px solid #0099cd',
            boxSizing: 'border-box',
            fontFamily: "'Nunito', sans-serif",
            display: 'flex',
            flexDirection: 'row',
            height: '600px',
            margin: '0',
            padding: '12px',
            width: '1128px',
            position: 'relative',
            backgroundColor: 'white',
            zIndex: 10,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              width: '600px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h1
                style={{
                  fontSize: '72px',
                  fontFamily: "'Nunito', sans-serif",
                  fontWeight: '700',
                  textAlign: 'center',
                  padding: '0',
                  margin: '0',
                }}
              >
                {title}
              </h1>
              <div style={{display: 'flex', flexDirection: 'row', gap: '10px'}}>
                {mapDocument.map_metadata?.draft_status === 'ready_to_share' ? (
                  <p style={{color: 'green', textTransform: 'uppercase'}}>Ready to Share</p>
                ) : mapDocument.map_metadata?.draft_status === 'in_progress' ? (
                  <p style={{color: 'blue', textTransform: 'uppercase'}}>In Progress</p>
                ) : mapDocument.map_metadata?.draft_status === 'scratch' ? (
                  <p style={{color: 'orange', textTransform: 'uppercase'}}>Scratch Work</p>
                ) : null}
                <p>{mapDocument.num_districts} districts</p>
              </div>
              {!!mapDocument?.map_metadata?.description?.length && (
                <p style={{fontSize: '24px', fontWeight: 'bold'}}>
                  {mapDocument.map_metadata.description}
                </p>
              )}
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                marginTop: 'auto',
              }}
            >
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  flexDirection: 'row',
                  fontSize: '28px',
                  fontWeight: '600',
                  justifyContent: 'center',
                  lineHeight: '40px',
                }}
              >
                <img
                  src={dataURI}
                  style={{
                    height: '160px',
                    marginRight: '10px',
                    width: '416px',
                  }}
                />
              </div>
            </div>
          </div>
          {!!thumbnailURI && (
            <div
              style={{
                display: 'flex',
                height: '500px',
                width: '500px',
                flexGrow: 1,
                justifyContent: 'flex-end',
                float: 'right',
                marginLeft: 'auto',
                marginRight: '0',
              }}
            >
              <img
                src={thumbnailURI}
                style={{
                  height: '500px',
                  width: '500px',
                }}
              />
            </div>
          )}
        </div>
      </>
    ),
    {
      width: 1128,
      height: 600,
      fonts: [
        {
          name: 'Nunito',
          data: nunitoMedium,
          style: 'normal',
          weight: 400,
        },
        {
          name: 'Nunito',
          data: nunitoBold,
          style: 'normal',
          weight: 700,
        },
      ],
    }
  );
}
