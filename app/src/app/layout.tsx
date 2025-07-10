import type {Metadata} from 'next';
import {Nunito} from 'next/font/google';
import {Theme} from '@radix-ui/themes';
import {getDocument} from '@/app/utils/api/apiHandlers/getDocument';
import {FeedbackForm} from './components/FeedbackForm';
import '@radix-ui/themes/styles.css';
import './globals.css';

const nunito = Nunito({
  subsets: ['latin'],
  weight: ['200', '300', '400', '500', '600', '700', '800', '900'],
  style: ['normal', 'italic'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Districtr 2.0',
  description: 'Create districting maps',
  openGraph: {
    title: 'Get Started',
    description: 'Create districting maps',
    siteName: 'Districtr 2.0',
    images: [
      {
        url: 'https://beta.districtr.org/_next/image?url=%2Fdistrictr_logo.jpg&w=1920&q=75',
        width: 1136,
        height: 423,
      },
    ],
  },
};

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
      <body className={nunito.className}>
        <Theme accentColor="indigo" grayColor="gray" radius="large" scaling="95%">
          <main>{children}</main>
          <FeedbackForm />
        </Theme>
      </body>
    </html>
  );
}
