import {CTA} from '@/app/components/Static/Content/CTA';
import {DataIntroContent} from '@/app/components/Static/Content/DataIntroContent';
import {Flex, Heading, Text, Link} from '@radix-ui/themes';
import {LearnSubNav} from '@/app/components/Static/LearnSubNav';

export const metadata = {
  title: 'Data',
  description: 'The data sources behind Districtr maps',
};

export default function DataPage() {
  return (
    <Flex direction="column" gapY="4">
      <LearnSubNav />
      <Heading as="h1" size="8">
        Data
      </Heading>
      <DataIntroContent textSize="3" />
      <Text size="3">
        To compute the demographic categories like &quot;Black&quot; and &quot;Asian&quot; in
        Districtr v2, we use collections of columns from the Decennial Census. You can read more
        about exactly which columns we use{' '}
        <Link href="https://data-democracy.org/VAP-CVAP" target="_blank">
          here
        </Link>
        . On the backend, all of our data comes from the{' '}
        <Link href="https://data-democracy.org/" target="_blank">
          Data and Democracy Lab
        </Link>
        &apos;s{' '}
        <Link href="https://github.com/mggg/gerrydb-client-py" target="_blank">
          gerrydb
        </Link>{' '}
        database, which stores all sorts of geospatial data.
      </Text>
      <Text size="3">
        For most of our election results, we rely on the tabulations created by the team at{' '}
        <Link href="https://davesredistricting.org" target="_blank">
          Dave&apos;s Redistricting
        </Link>
        .
      </Text>
      <CTA />
    </Flex>
  );
}
