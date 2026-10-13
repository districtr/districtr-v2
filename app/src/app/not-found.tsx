'use client';
import {useEffect, useState} from 'react';
import {usePathname} from 'next/navigation';
import {QueryClientProvider} from '@tanstack/react-query';
import {Box, Flex, Heading, Link, Spinner, Text} from '@radix-ui/themes';
import {Header} from '@components/Static/Header';
import {Footer} from '@components/Static/Footer';
import {queryClient} from '@/app/utils/api/queryClient';
import {useLegacyCheck} from '@/app/hooks/useLegacyCheck';

function NotFoundInner() {
  const pathname = usePathname();
  const {legacyUrl, exists, isChecking} = useLegacyCheck(pathname);
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    if (!exists) return;
    if (seconds <= 0) {
      // window.location.replace, not a router push: this must navigate the
      // actual browsing context, including when this page is itself loaded
      // inside a third-party site's <iframe> (e.g. an embedded map preview
      // pointing at a legacy-only id) — replacing that frame's location is
      // the correct behavior there, not a parent-page navigation.
      window.location.replace(legacyUrl);
      return;
    }
    const timer = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [exists, seconds, legacyUrl]);

  return (
    <Flex direction="column" className="min-h-[100vh]" justify="center">
      <Header />
      <Box className="w-full flex-grow p-4 pt-0 max-w-screen-lg mx-auto px-4 xl:px-0">
        <Flex direction="column" gapY="4" align="center" py="9">
          <Heading as="h1">Page not found</Heading>
          <Text size="3" align="center">
            You&apos;ve landed on Districtr 2.0, and this page doesn&apos;t exist here.
          </Text>
          {isChecking && (
            <Flex align="center" gapX="2">
              <Spinner />
              <Text size="3">Checking the archives for legacy pages&hellip;</Text>
            </Flex>
          )}
          {exists && (
            <Text size="3" align="center">
              Looking for a page from the original Districtr? Redirecting you to{' '}
              <Link href={legacyUrl}>{legacyUrl.replace('https://', '')}</Link> in {seconds} second
              {seconds === 1 ? '' : 's'}&hellip;
            </Text>
          )}
          <Link href="/">Back to the Districtr 2.0 home page</Link>
        </Flex>
      </Box>
      <Footer />
    </Flex>
  );
}

export default function NotFound() {
  return (
    <QueryClientProvider client={queryClient}>
      <NotFoundInner />
    </QueryClientProvider>
  );
}
