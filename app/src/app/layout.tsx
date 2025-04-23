import type {Metadata} from 'next';
import {Inter} from 'next/font/google';
import './globals.css';
import {Theme} from '@radix-ui/themes';
import '@radix-ui/themes/styles.css';

const inter = Inter({subsets: ['latin']});

export const metadata: Metadata = {
  title: 'Districtr 2.0',
  description: 'Create districting maps',
  openGraph: {
    title: 'Get Started',
    description: 'Create districting maps',
    siteName: 'Districtr 2.0',
    images: [
      {
        url: 'https://districtr-v2-frontend.fly.dev/_next/image?url=%2Fdistrictr_logo.jpg&w=1920&q=75',
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
      <body className={inter.className}>
        <Theme accentColor="indigo" grayColor="gray" radius="large" scaling="95%">
          <main>{children}</main>
        </Theme>
      </body>
    </html>
  );
}
