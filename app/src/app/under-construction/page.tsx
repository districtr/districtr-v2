import type {Metadata} from 'next';
import Image from 'next/image';
import {Button, Flex, Heading, Text} from '@radix-ui/themes';
import {SiteBanner} from '@components/SiteBanner';

export const metadata: Metadata = {
  title: 'Under Construction',
  description: 'Districtr is temporarily unavailable while we make improvements.',
  robots: {index: false},
};

export default function UnderConstructionPage() {
  return (
    <Flex align="center" justify="center" className="min-h-screen bg-districtrLightBlue p-6">
      <SiteBanner overlay />
      <Flex
        direction="column"
        align="center"
        gap="4"
        className="w-full max-w-xl rounded-2xl bg-white px-8 py-10 text-center shadow-xl"
      >
        <Image src="/districtr_logo.jpg" alt="Districtr" width={320} height={119} priority />
        <Heading as="h1" size="8">
          We&apos;ll be right back
        </Heading>
        <Text size="4" color="gray">
          Districtr is down for maintenance while we make improvements. Your saved maps will be here
          when we&apos;re back.
        </Text>
        {/* A full page load, so the proxy decides whether maintenance is over. */}
        <Button size="3" asChild>
          <a href="/">Try again</a>
        </Button>
      </Flex>
    </Flex>
  );
}
