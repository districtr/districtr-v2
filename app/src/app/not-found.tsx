'use client';
import {usePathname} from 'next/navigation';
import {Box, Flex, Heading, Link, Text} from '@radix-ui/themes';
import {Header} from '@components/Static/Header';
import {Footer} from '@components/Static/Footer';
import {LEGACY_DISTRICTR_URL} from '@/app/constants/legacy';

export default function NotFound() {
  const pathname = usePathname();
  const legacyUrl = `${LEGACY_DISTRICTR_URL}${pathname ?? ''}`;

  return (
    <Flex direction="column" className="min-h-[100vh]" justify="center">
      <Header />
      <Box className="w-full flex-grow p-4 pt-0 max-w-screen-lg mx-auto px-4 xl:px-0">
        <Flex direction="column" gapY="4" align="center" py="9">
          <Heading as="h1">Page not found</Heading>
          <Text size="3" align="center">
            You&apos;ve landed on Districtr 2.0, and this page doesn&apos;t exist here. Looking for
            a page from the original Districtr? Try{' '}
            <Link href={legacyUrl}>{legacyUrl.replace('https://', '')}</Link>.
          </Text>
          <Link href="/">Back to the Districtr 2.0 home page</Link>
        </Flex>
      </Box>
      <Footer />
    </Flex>
  );
}
