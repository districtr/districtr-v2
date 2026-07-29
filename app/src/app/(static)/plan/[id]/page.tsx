'use client';
import {useEffect, useState} from 'react';
import {useParams} from 'next/navigation';
import {Flex, Heading, Text, Link} from '@radix-ui/themes';
import {LEGACY_DISTRICTR_URL} from '@/app/constants/legacy';

export default function LegacyPlanRedirect() {
  const {id} = useParams<{id: string}>();
  const url = `${LEGACY_DISTRICTR_URL}/plan/${id}`;
  const [seconds, setSeconds] = useState(5);

  useEffect(() => {
    if (seconds <= 0) {
      window.location.replace(url);
      return;
    }
    const timer = setTimeout(() => setSeconds(s => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, url]);

  return (
    <Flex direction="column" gapY="4" align="center" py="9">
      <Heading as="h1">This plan lives on classic Districtr</Heading>
      <Text size="3">
        Plan {id} was made with the original version of Districtr. Redirecting you in {seconds}{' '}
        second{seconds === 1 ? '' : 's'}&hellip;
      </Text>
      <Link href={url}>Take me there now</Link>
    </Flex>
  );
}
