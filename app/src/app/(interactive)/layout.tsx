import {SiteBanner} from '@components/SiteBanner';

export default function InteractiveLayout({children}: Readonly<{children: React.ReactNode}>) {
  return (
    <>
      <SiteBanner overlay />
      {children}
    </>
  );
}
