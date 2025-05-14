import type {Metadata} from 'next';
import {Header} from '@components/Static/Header';
import {Footer} from '../components/Static/Footer';
import {Box, Flex} from '@radix-ui/themes';

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
    <Flex direction="column" className="min-h-[100vh]" justify="center">
      <Header />
      <Box className="w-full flex-grow p-4 max-w-screen-lg mx-auto px-4 xl:px-0">{children}</Box>
      <Footer />
    </Flex>
  );
}
