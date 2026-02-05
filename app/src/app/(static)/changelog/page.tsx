import {Flex, Heading, Text, Badge, Separator} from '@radix-ui/themes';
import packageJson from '../../../../package.json';
import Changelog from './changelog.mdx';

export const metadata = {
  title: 'Changelog | Districtr',
  description: 'View the latest updates and changes to Districtr',
};

export default function ChangelogPage() {
  const version = packageJson.version;

  return (
    <Flex direction="column" gapY="4">
      <Flex direction="row" align="center" gap="3">
        <Heading as="h1" size="8">
          Changelog
        </Heading>
        <Badge size="2" color="indigo" variant="soft">
          v{version}
        </Badge>
      </Flex>
      <Text size="3" color="gray">
        A history of updates, improvements, and fixes to Districtr.
      </Text>
      <Separator size="4" my="3" />
      <Flex direction="column" className="prose prose-slate max-w-none">
        <Changelog />
      </Flex>
    </Flex>
  );
}
