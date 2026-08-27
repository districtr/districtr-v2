'use client';
import {useEffect, useState} from 'react';
import {useParams} from 'next/navigation';
import {QueryClientProvider} from '@tanstack/react-query';
import {Flex, Heading, Text, Link, Spinner} from '@radix-ui/themes';
import {queryClient} from '@/app/utils/api/queryClient';
import {useLegacyCheck} from '@/app/hooks/useLegacyCheck';

function LegacyPlanRedirect() {
  const {id} = useParams<{id: string}>();
  const {legacyUrl, exists, isChecking} = useLegacyCheck(`/plan/${id}`);
  const [seconds, setSeconds] = useState(5);
  // Only an affirmative "not there" stops the redirect; a failed check still sends
  // people to legacy, which is where the plan lived before this page existed.
  const redirecting = !isChecking && exists !== false;

  useEffect(() => {
    if (!redirecting) return;
    if (seconds <= 0) {
      window.location.replace(legacyUrl);
      return;
    }
    const timer = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, legacyUrl, redirecting]);

  if (exists === false) {
    return (
      <Flex direction="column" gapY="4" align="center" py="9">
        <Heading as="h1">Plan not found</Heading>
        <Text size="3">We couldn&apos;t find plan {id} on classic Districtr.</Text>
        <Link href="/">Back to the Districtr 2.0 home page</Link>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gapY="4" align="center" py="9">
      <Heading as="h1">This plan lives on classic Districtr</Heading>
      {isChecking ? (
        <Flex align="center" gapX="2">
          <Spinner />
          <Text size="3">Looking up plan {id} on classic Districtr&hellip;</Text>
        </Flex>
      ) : (
        <Text size="3">
          Plan {id} was made with the original version of Districtr. Redirecting you in {seconds}{' '}
          second{seconds === 1 ? '' : 's'}&hellip;
        </Text>
      )}
      <Link href={legacyUrl}>Take me there now</Link>
    </Flex>
  );
}

export default function LegacyPlanRedirectPage() {
  return (
    <QueryClientProvider client={queryClient}>
      <LegacyPlanRedirect />
    </QueryClientProvider>
  );
}
