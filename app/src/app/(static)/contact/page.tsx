import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';

export default function GuidePage() {
  return (
    <Flex direction="column" gapY="4">
      <Heading as="h1" size="8">
        Contact
      </Heading>
      <Text size="3">
        If you have a bug to report, a feature to request, or want to talk about using Districtr for
        your community, please reach out.
      </Text>{' '}
      <Text size="3">
        <b>Email:</b> <a href="mailto:Districtr@mggg.org">Districtr@mggg.org</a>
      </Text>
    </Flex>
  );
}
