import React from 'react';
import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';
import Image from 'next/image';
import {ContentSection} from '../components/Static/ContentSection';
import {ResponsivePlaceMap} from '../components/Static/PlaceMap/PlaceMap';
import {ImportBlockAssignments} from '../components/Static/Interactions/ImportBlockAssignments';
import {DevTeam} from '../components/Static/Content/DevTeam';
import {CTA} from '../components/Static/Content/CTA';
import {AboutContent} from '../components/Static/Content/AboutContent';

const Main: React.FC = () => {
  return (
    <Flex direction="column" gapY="9">
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
          <Link href="https://data-democracy.org/" target="_blank">
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
                You can draw districts
              </Heading>
              <Text size="5">
                In the U.S., there&apos;s a big redistricting cycle every 10 years after new Census
                data is released... and lately, redistricting happens constantly, even mid-decade.
                In most states, elected representatives in the state legislature are responsible for
                drawing the lines—including the districts for their own re-election. Following the
                2020 Census, many states, cities, and counties experimented with collecting more
                public mapping input than ever before, and the Districtr team{' '}
                <Link href="https://data-democracy.org/cois" target="_blank">
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
                You can draw your community
              </Heading>
              <Text size="5">
                Communities of Interest (known as “COIs”) are areas or neighborhoods with
                significant shared interests that deserve consideration by representatives. Many
                states have rules that indicate that COIs should be kept whole by districting plans
                whenever possible; others just say that they should be “taken into account.”{' '}
              </Text>
              <Text size="5">
                This has been one of the hardest to handle of all the priorities in the
                redistricting world—if you show up at a meeting to say your community matters, how
                does that information make its way to the line-drawers?
              </Text>
              <Text size="5">
                Districtr lets you put your community on the map (literally!) by marking places that
                matter to make your shared interests visible. If you are interested in learning more
                about best practices for COI map collection, email us at{' '}
                <Link href="mailto:Districtr@data-democracy.org">Districtr@data-democracy.org</Link>
                .
              </Text>
              <Text size="5">
                For a detailed walkthrough of Districtr, visit our{' '}
                <Link href="/guide">guide page</Link>.
              </Text>
            </Flex>
            <Image src="/community.svg" alt="draw" width={200} height={400} />
          </Flex>
        </Flex>
      </ContentSection>
      <ContentSection title="Already have saved maps?">
        <Flex direction="column" gapY="3">
          <Text size="5">
            Open the <Link href="/catalog">Catalog page</Link> to view, filter, reopen, and remove
            maps that are saved in your local browser storage.
          </Text>
          <Text size="3" color="gray">
            These locally stored maps can be expunged if browser data is cleared.
          </Text>
        </Flex>
      </ContentSection>
      <ContentSection title="Where would you like to start?">
        <Flex direction="column" gapY="3">
          <Text size="5">
            Pick a state on the map, or upload a block-assignment file from another tool.
          </Text>
          <ImportBlockAssignments />
          <Box className="w-full aspect-square mx-auto lg:aspect-video">
            <ResponsivePlaceMap />
          </Box>
        </Flex>
      </ContentSection>
      <ContentSection title="About Districtr">
        <Flex direction="column" gapY="4" py="4">
          <AboutContent textSize="5" />
          <DevTeam />
        </Flex>
      </ContentSection>
      <CTA />
    </Flex>
  );
};

export default Main;
