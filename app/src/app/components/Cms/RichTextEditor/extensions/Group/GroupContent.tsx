import {Flex, Heading, Text} from '@radix-ui/themes';

const GroupDefaultContent = (
  <Flex direction="column" gap="4">
    <Heading as="h2">Map Groups</Heading>
    <Text>
      Explore our collection of maps organized by geography. Each group contains maps focused on specific regions or administrative divisions.
    </Text>
    <Text>
      Select a map to start drawing districts, exploring demographics, or analyzing communities of interest.
    </Text>
  </Flex>
);

export const groupContent = {
  GroupDefaultContent,
};