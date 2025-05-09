import { DevTeam } from '@/app/components/Static/Content/DevTeam';
import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';
import NextLink from 'next/link';

export default function GuidePage() {
  return (
    <Flex direction="column" gapY="4" className="max-w-screen-lg mx-auto">
      <Heading as="h1" size="8">
        About Districtr
      </Heading>
      <Flex direction="column" gapY="4" py="4">
        <Heading>Origin Story</Heading>

        <Text size="3">
          The goal of Districtr is to put the tools of redistricting in the hands of the public,
          with an emphasis on meeting the needs of civil rights organizations, community groups, and
          redistricting commissions.
        </Text>

        <Text size="3">
          Districtr came about from a conversation with Lawyers for Civil Rights (LCR), the Boston
          arm of the national Lawyers&apos; Committee for Civil Rights Under Law. LCR was describing
          their work with community members in Lowell, MA, who were frustrated about not having a
          voice in the city council. In those conversations, a few places kept coming up...
        </Text>

        <Text size="3">
          Like <b>Clemente Park</b>, a much-loved meeting point for the city&apos;s Asian and Latinx
          populations, which felt unsafe at night because the city had not provided lighting...
        </Text>

        <Text size="3">
          And <b>Lowell High School</b>, the city&apos;s only public high school, which serves over
          3000 students. The city announced plans to move it from its traditional downtown location,
          but without sufficient outreach to communities around the city about possible new sites.
        </Text>

        <Text size="3">
          Our idea was to create a mapping tool whose fundamental principle is to{' '}
          <b>ask the community what matters</b>. With maps that build COIs around relevant zones and
          landmarks, paired with community narratives, we can start to see local interests come to
          life.
        </Text>
        <Heading>Our Values</Heading>

        <Text size="3">
          <b>Accessibility.</b> Participating in the redistricting process should be approachable
          for everyone. Districtr is engineered for maximum accessibility. It&apos;s entirely
          in-browser with no login and no downloads, it works on tablets as well as computers, and
          we assign each plan its own web address for easy sharing.
        </Text>

        <Text size="3">
          <b>Openness and transparency.</b> The entire project is open source, with permissive
          licenses. We don&apos;t collect any information about users.
        </Text>

        <Text size="3">
          <b>Maps not metrics.</b> We don&apos;t think that good maps can be measured in
          one-size-fits-all metrics, so we&apos;ve built a more lightweight mapping experience that
          doesn&apos;t put scores front and center. You can export maps from Districtr in forms that
          can be read in the other major redistricting software.
        </Text>

        <Text size="3">
          <b>All politics is local.</b> We&apos;ve got 760,000-person congressional districts and
          13,000-person city council districts, and every scale in between: county commissions,
          school zones, library boards—you name it, we map it.
        </Text>

        <Text size="3">
          <b>Responsiveness to the community.</b> We aim to highlight specific local rules,
          principles, and priorities whenever possible. We also build event pages for organizers so
          they can see an overview of maps from the group at a glance.
        </Text>
        <Heading className="text-districtrIndigo pt-6">Still have questions?</Heading>

        <Text size="3">
          If you are interested in partnering with us or sponsoring a voting rights project, reach
          out to us at{' '}
          <NextLink legacyBehavior href="mailto:Districtr@mggg.org">
            <Link>Districtr@mggg.org</Link>
          </NextLink>
          .
        </Text>

        <Text size="3">Our team aims to respond to requests for new modules within a week.</Text>

      <DevTeam />
      </Flex>
    </Flex>
  );
}
