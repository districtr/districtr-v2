import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';
import NextLink from 'next/link';

export default function GuidePage() {
  return (
    <Flex direction="column" gapY="4" className="max-w-screen-lg mx-auto">
      <Heading as="h1" size="8">
        Contact
      </Heading>
      <Text size="3">
        If you have a bug to report, a feature to request, or want to talk about using districtr for
        your community, please reach out.
      </Text>{' '}
      <Text size="3">
        <b>Email:</b> <a href="mailto:Districtr@mggg.org">Districtr@mggg.org</a>
      </Text>
    </Flex>
  );
}
