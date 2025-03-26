import {Flex, Heading} from '@radix-ui/themes';

export default function UpdatesPage() {
  return (
    <Flex className="w-full min-h-[100vh] mx-auto max-w-screen-lg" direction="column" gapY="4">
      <Heading as="h1">Updates</Heading>
      <Heading as="h2" size="4">
        Districtr v2 Beta coming soon!
      </Heading>
    </Flex>
  );
}
