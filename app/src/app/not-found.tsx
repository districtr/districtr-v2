'use client';
import {useEffect, useState} from 'react';
import {usePathname} from 'next/navigation';
import {Box, Flex, Heading, Link, Spinner, Text} from '@radix-ui/themes';
import {Header} from '@components/Static/Header';
import {Footer} from '@components/Static/Footer';
import {LEGACY_DISTRICTR_URL} from '@/app/constants/legacy';

export default function NotFound() {
  const pathname = usePathname();
  const legacyUrl = `${LEGACY_DISTRICTR_URL}${pathname ?? ''}`;
  // null = still checking, false = not on legacy, true = exists on legacy
  const [existsOnLegacy, setExistsOnLegacy] = useState<boolean | null>(null);

  useEffect(() => {
    if (!pathname) return;
    fetch(`/api/legacy-check?path=${encodeURIComponent(pathname)}`)
      .then(res => res.json())
      .then(data => setExistsOnLegacy(Boolean(data.exists)))
      .catch(() => setExistsOnLegacy(false));
  }, [pathname]);

  return (
    <Flex direction="column" className="min-h-[100vh]" justify="center">
      <Header />
      <Box className="w-full flex-grow p-4 pt-0 max-w-screen-lg mx-auto px-4 xl:px-0">
        <Flex direction="column" gapY="4" align="center" py="9">
          <Heading as="h1">Page not found</Heading>
          <Text size="3" align="center">
            You&apos;ve landed on Districtr 2.0, and this page doesn&apos;t exist here.
          </Text>
          {existsOnLegacy === null && (
            <Flex align="center" gapX="2">
              <Spinner />
              <Text size="3">Checking the archives for legacy pages&hellip;</Text>
            </Flex>
          )}
          {existsOnLegacy && (
            <Text size="3" align="center">
              Looking for a page from the original Districtr? Try{' '}
              <Link href={legacyUrl} target="_blank" rel="noopener noreferrer">
                {legacyUrl.replace('https://', '')}
              </Link>
              .
            </Text>
          )}
          <Link href="/">Back to the Districtr 2.0 home page</Link>
        </Flex>
      </Box>
      <Footer />
    </Flex>
  );
}
