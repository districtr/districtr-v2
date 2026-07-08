import type {Metadata} from 'next';
import {Flex, Heading, Text} from '@radix-ui/themes';

export const metadata: Metadata = {
  title: 'Under Construction | Districtr',
  description: 'Districtr is temporarily unavailable while we make improvements.',
  robots: {index: false},
};

export default function UnderConstructionPage() {
  return (
    <Flex direction="column" align="center" justify="center" gap="4" className="min-h-screen p-8">
      <Heading as="h1" size="8">
        🚧 Under Construction
      </Heading>
      <Text size="4" align="center">
        Districtr is temporarily unavailable while we make improvements.
        <br />
        Please check back soon.
      </Text>
    </Flex>
  );
}
