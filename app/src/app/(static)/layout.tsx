import type {Metadata} from 'next';
import {Header} from '@components/Static/Header';
import {Footer} from '../components/Static/Footer';

export const metadata: Metadata = {
  title: 'Districtr 2.0',
  description: 'Districtr reboot',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
