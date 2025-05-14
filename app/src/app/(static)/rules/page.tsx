import {CTA} from '@/app/components/Static/Content/CTA';
import {ContentSection} from '@/app/components/Static/ContentSection';
import {Flex, Heading, Text, Link, Box, Grid, Blockquote} from '@radix-ui/themes';
import NextLink from 'next/link';

const RuleSection: React.FC<{
  title: string;
  description: string;
  image: string;
  imageAlt: string;
}> = ({title, description, image, imageAlt}) => {
  return (
    <Flex direction="row" align="center">
      <Text>
        <b>{title}:</b> {description}
      </Text>
      <img src={image} alt={imageAlt} width={200} height="auto" />
    </Flex>
  );
};

export default function GuidePage() {
  return (
    <Flex direction="column" gapY="4">
      <Heading as="h1">Rules of Redistricting</Heading>
      <Text size="3">
        A combination of national, state, and local rules guide the redistricting process. While the
        federal requirements apply universally, state and local governments can establish additional
        constraints and priorities.
      </Text>
      <Text size="3">
        The rules are complicated and sometimes quite vague! Here is a short explainer.
      </Text>
      <ContentSection title="Federal Requirements">
        <Grid
          columns={{
            initial: '1',
            md: '2',
          }}
          gap="2"
        >
          <RuleSection
            title="Population balance"
            description="Districts should have very close to the same Population"
            image="/equalpop.png"
            imageAlt="Equal Population"
          />
          <RuleSection
            title="Voting Rights Act compliance"
            description="Districts cannot block minority groups from electing candidates of choice"
            image="/vra.png"
            imageAlt="Voting Rights"
          />
        </Grid>
      </ContentSection>
      <ContentSection title="Common State and Local Requirements">
        <Grid
          columns={{
            initial: '1',
            md: '2',
          }}
          gap="2"
        >
          <RuleSection
            title="Communities of Interest"
            description="Groups with significant shared interests should be kept together"
            image="/farmers - coi.png"
            imageAlt="Communities of Interest"
          />
          <RuleSection
            title="Contiguity"
            description="Each district should be one connected piece"
            image="/nesting - contiguity.png"
            imageAlt="Contiguity"
          />
          <RuleSection
            title="Compactness"
            description={`District shapes should be “reasonable”`}
            image="/compactness.png"
            imageAlt="Compactness"
          />
          <RuleSection
            title="Boundary preservation"
            description="District lines should follow natural and official boundaries, such as rivers or town and county borders"
            image="/boundary_pres.png"
            imageAlt="Boundary preservation"
          />
        </Grid>
      </ContentSection>
      <Blockquote className="my-12" size="3">
        For a slightly more detailed discussion, here&apos;s a{' '}
        <NextLink
          legacyBehavior
          href="https://districtr.org/assets/the-rules-for-districtr.pdf"
          target="_blank"
        >
          <Link target="_blank">handout</Link>
        </NextLink>
        . friend of the Lab Doug Spencer maintains a guide to state-by-state rules at{' '}
        <NextLink legacyBehavior href="https://redistricting.lls.edu/" target="_blank">
          <Link target="_blank">All About Redistricting</Link>
        </NextLink>
        . The Brennan Center also has an excellent{' '}
        <NextLink
          legacyBehavior
          href="https://www.brennancenter.org/sites/default/files/2019-08/Report_CGR-2010-edition.pdf"
          target="_blank"
        >
          <Link target="_blank">Citizens Guide to Redistricting</Link>
        </NextLink>
        , summarized in their{' '}
        <NextLink
          legacyBehavior
          href="https://www.brennancenter.org/our-work/research-reports/50-state-guide-redistricting"
          target="_blank"
        >
          <Link target="_blank">50 State handout</Link>
        </NextLink>
        .
      </Blockquote>
      <CTA />
    </Flex>
  );
}
