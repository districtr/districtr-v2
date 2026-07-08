import {Badge, Flex, Heading, Text} from '@radix-ui/themes';

export default function DirectoryPage() {
  return (
    <Flex direction="column" gap="3" align="start">
      <Flex align="center" gap="3">
        <Heading size="7" as="h1">
          Official Plan Directory
        </Heading>
        <Badge color="amber" variant="soft" size="2">
          Coming soon
        </Badge>
      </Flex>
      <Text size="3" color="gray">
        Browse official enacted and proposed redistricting plans. This directory is coming soon.
      </Text>
    </Flex>
  );
}
