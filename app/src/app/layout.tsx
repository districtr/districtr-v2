import type {Metadata} from 'next';
import {Inter} from 'next/font/google';
import './globals.css';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';
import {getDocument} from '@/app/utils/api/apiHandlers/getDocument';
import {FeedbackForm} from './components/FeedbackForm';

const inter = Inter({subsets: ['latin']});

type MetadataProps = {
  searchParams: Promise<{document_id?: string | string[] | undefined}>;
};

const DISTRICTR_LOGO = [
  {
    url: 'https://districtr-v2-frontend.fly.dev/_next/image?url=%2Fdistrictr_logo.jpg&w=1920&q=75',
    width: 1136,
    height: 423,
  },
];

export async function generateMetadata({searchParams}: MetadataProps): Promise<Metadata> {
  const resolvedParams = await searchParams;
  const document_id = resolvedParams?.document_id ?? '';
  const singularDocumentId = Array.isArray(document_id) ? document_id[0] : document_id;
  if (!singularDocumentId) {
    return {
      title: 'Districtr 2.0',
      description: 'Create districting maps',
      openGraph: {
        title: 'Get Started',
        description: 'Create districting maps',
        siteName: 'Districtr 2.0',
        images: DISTRICTR_LOGO,
      },
    };
  }

  const mapDocument = await getDocument(singularDocumentId);
  const districtCount = mapDocument?.num_districts ? `${mapDocument.num_districts} districts` : '';
  return {
    title: 'Districtr 2.0',
    openGraph: {
      title: districtCount
        ? `${districtCount} - ${mapDocument?.map_metadata?.name ?? 'Shared Map'}`
        : (mapDocument?.map_metadata?.name ?? 'Get Started'),
      description: mapDocument?.map_metadata?.description ?? 'Create districting maps',
      siteName: 'Districtr 2.0',
      images: DISTRICTR_LOGO,
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <script
          defer
          src="https://analytics.ds.uchicago.edu/script.js"
          data-website-id="035a9218-84f6-4a19-80fc-92951dfa62ff"
        />
      </head>
      <body className={inter.className}>
        <Theme accentColor="indigo" grayColor="gray" radius="large" scaling="95%">
          <main>{children}</main>
          <FeedbackForm />
        </Theme>
      </body>
    </html>
  );
}
