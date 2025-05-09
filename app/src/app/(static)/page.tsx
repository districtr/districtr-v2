import React from 'react';
import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';
import Image from 'next/image';
import NextLink from 'next/link';
import {ContentSection} from '../components/Static/ContentSection';
import {ResponsivePlaceMap} from '../components/Static/PlaceMap/PlaceMap';
import {DevTeam} from '../components/Static/Content/DevTeam';
import {CTA} from '../components/Static/Content/CTA';

const Main: React.FC = () => {
  return (
    <Flex direction="column" className="max-w-screen-lg mx-auto" gapY="9">
      <Flex direction="column" align="center" justify="center">
        <Image src="/districtr_logo.jpg" alt="logo" width={800} height={300} />
        <Heading size="7" as="h2" className="pb-4">
          <i>You</i> draw the lines.
        </Heading>
        <Text size="4">
          Districtr is a free browser-based tool for drawing districts and mapping your community.
        </Text>
      </Flex>
      <ContentSection
        title="Help shape our democracy!"
        flavorImage={<Image src="/home-hands.png" alt="hands" width={200} height={200} />}
      >
        <Text size="5">
          Districtr is a project of the{' '}
          <Link href="https://mggg.org/" target="_blank">
            Data and Democracy Lab
          </Link>
          , intended to promote public participation in redistricting around the United States.
          Redistricting is dividing up a jurisdiction (like a state, county, or city) into pieces
          that elect representatives. Where and how the lines are drawn influences everything from
          who has a shot at getting elected to how resources get allocated. Since the founding of
          the U.S. as a representative democracy, we&apos;ve had the ideal that <b>districts</b>{' '}
          should be a way to communicate very local interests to our wider governing bodies. This
          only works if districts are built around <b>communities</b> of shared interest.
        </Text>
      </ContentSection>
      <ContentSection
        title="Use this tool to amplify your voice"
        flavorImage={<Image src="/home-megaphone.png" alt="megaphone" width={200} height={200} />}
      >
        <Flex direction="column" gapY="9">
          <Flex
            direction={{
              initial: 'column',
              md: 'row',
            }}
            align="center"
            justify="start"
            gapX="9"
            gap={{
              initial: '9',
              md: '0',
            }}
          >
            <Flex direction={'column'}>
              <Heading size="6" as="h3" className="text-purple-700 mb-4">
                You can draw districts.
              </Heading>
              <Text size="5">
                In the U.S., there&apos;s a big redistricting cycle every 10 years after new Census
                data is released. In most states, elected representatives in the state legislature
                are responsible for drawing the lines—including the districts for their own
                re-election. Following the 2020 Census, many states, cities, and counties
                experimented with collecting more public mapping input than ever before, and the
                Districtr team{' '}
                <Link href="https://mggg.org/cois" target="_blank">
                  was there to help
                </Link>
                .
              </Text>
              <Text size="5" className="mt-4">
                Now you can try your hand at redistricting! It&apos;s easy to make plans of your own
                and share them widely with Districtr.
              </Text>
            </Flex>
            <Image src="/districting-plan.svg" alt="draw" width={200} height={400} />
          </Flex>
          <Flex
            direction={{
              initial: 'column',
              md: 'row',
            }}
            align="center"
            justify="start"
            gapX="9"
            gapY={{
              initial: '9',
              md: '0',
            }}
          >
            <Flex direction={'column'} gapY="4">
              <Heading size="6" as="h3" className="text-orange-700 mb-4">
                You can draw your community.
              </Heading>
              <Text size="5">
                Communities of Interest (known as “COIs”) are groups or neighborhoods with
                significant shared interests that deserve consideration by representatives. Many
                states have rules that indicate that COIs should be kept whole by districting plans
                whenever possible.{' '}
              </Text>
              <Text size="5">
                But this has been one of the hardest to handle of all the priorities in the
                redistricting world—if you show up at a meeting to say your community matters, how
                does that information make its way to the line-drawers?
              </Text>
              <Text size="5">
                Districtr lets you put your community on the map (literally!) by marking places that
                matter to make your shared interests visible. If you are interested in learning more
                about best practices for COI map collection, check out our{' '}
                <NextLink legacyBehavior href="/training">
                  <Link>training materials</Link>
                </NextLink>
                .{' '}
              </Text>
              <Text size="5">
                For a detailed walkthrough of Districtr, visit our{' '}
                <NextLink href="/guide" legacyBehavior>
                  <Link>guide page</Link>
                </NextLink>
                .
              </Text>
            </Flex>
            <Image src="/community.svg" alt="draw" width={200} height={400} />
          </Flex>
        </Flex>
      </ContentSection>
      <ContentSection title="Where would you like to start?">
        <Box className="w-full aspect-square mx-auto lg:aspect-video">
          <ResponsivePlaceMap />
        </Box>
        <Text size="3" className="text-right mt-4">
          Import an existing plan or community map (coming soon)
        </Text>
        <br />
        <Text size="3" className="text-right mt-4">
          Features available by jurisdiction (coming soon)
        </Text>
      </ContentSection>
      <ContentSection title="About Districtr">
        <Flex direction="column" gapY="4" py="4">
          <Heading>Origin Story</Heading>

          <Text size="5">
            The goal of Districtr is to put the tools of redistricting in the hands of the public,
            with an emphasis on meeting the needs of civil rights organizations, community groups,
            and redistricting commissions.
          </Text>

          <Text size="5">
            Districtr came about from a conversation with Lawyers for Civil Rights (LCR), the Boston
            arm of the national Lawyers&apos; Committee for Civil Rights Under Law. LCR was
            describing their work with community members in Lowell, MA, who were frustrated about
            not having a voice in the city council. In those conversations, a few places kept coming
            up...
          </Text>

          <Text size="5">
            Like <b>Clemente Park</b>, a much-loved meeting point for the city&apos;s Asian and
            Latinx populations, which felt unsafe at night because the city had not provided
            lighting...
          </Text>

          <Text size="5">
            And <b>Lowell High School</b>, the city&apos;s only public high school, which serves
            over 3000 students. The city announced plans to move it from its traditional downtown
            location, but without sufficient outreach to communities around the city about possible
            new sites.
          </Text>

          <Text size="5">
            Our idea was to create a mapping tool whose fundamental principle is to{' '}
            <b>ask the community what matters</b>. With maps that build COIs around relevant zones
            and landmarks, paired with community narratives, we can start to see local interests
            come to life.
          </Text>
          <Heading>Our Values</Heading>

          <Text size="5">
            <b>Accessibility.</b> Participating in the redistricting process should be approachable
            for everyone. Districtr is engineered for maximum accessibility. It&apos;s entirely
            in-browser with no login and no downloads, it works on tablets as well as computers, and
            we assign each plan its own web address for easy sharing.
          </Text>

          <Text size="5">
            <b>Openness and transparency.</b> The entire project is open source, with permissive
            licenses. We don&apos;t collect any information about users.
          </Text>

          <Text size="5">
            <b>Maps not metrics.</b> We don&apos;t think that good maps can be measured in
            one-size-fits-all metrics, so we&apos;ve built a more lightweight mapping experience
            that doesn&apos;t put scores front and center. You can export maps from Districtr in
            forms that can be read in the other major redistricting software.
          </Text>

          <Text size="5">
            <b>All politics is local.</b> We&apos;ve got 760,000-person congressional districts and
            13,000-person city council districts, and every scale in between: county commissions,
            school zones, library boards—you name it, we map it.
          </Text>

          <Text size="5">
            <b>Responsiveness to the community.</b> We aim to highlight specific local rules,
            principles, and priorities whenever possible. We also build event pages for organizers
            so they can see an overview of maps from the group at a glance.
          </Text>
          <Heading className="text-districtrIndigo pt-6">Still have questions?</Heading>

          <Text size="5">
            If you are interested in partnering with us or sponsoring a voting rights project, reach
            out to us at{' '}
            <NextLink legacyBehavior href="mailto:Districtr@mggg.org">
              <Link>Districtr@mggg.org</Link>
            </NextLink>
            .
          </Text>

          <Text size="5">Our team aims to respond to requests for new modules within a week.</Text>

          <DevTeam />
        </Flex>
      </ContentSection>
      <CTA />
    </Flex>
  );
};

export default Main;
