import type {Metadata} from 'next';
import {Header} from '@components/Static/Header';
import {Footer} from '../components/Static/Footer';
import {EditorStateReset} from '@components/Static/EditorStateReset';
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
      <EditorStateReset />
      <Header />
      <Box className="w-full flex-grow p-4 pt-0 max-w-screen-lg mx-auto px-4 xl:px-0">{children}</Box>
      <Footer />
    </Flex>
  );
}
