import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';
import NextLink from 'next/link';

export default function GuidePage() {
  return (
    <Flex direction="column" gapY="4" className="max-w-screen-lg mx-auto">
      <Heading as="h1" size="8">Contact</Heading>
      <Text size="3">
        We&apos;d want to hear from you!
      </Text>{' '}
      <Text size="3">
        <b>Email:</b> <a href="mailto:Districtr@mggg.org">Districtr@mggg.org</a>
      </Text>
    </Flex>
  );
}
