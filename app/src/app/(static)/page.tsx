import React from 'react';
import {Flex, Heading, Text, Link, Box} from '@radix-ui/themes';
import Image from 'next/image';
import NextLink from 'next/link';
import {ContentSection} from '../components/Static/ContentSection';
import {PlaceMap, ResponsivePlaceMap} from '../components/Static/PlaceMap/PlaceMap';

const Main: React.FC = () => {
  return (
    <Flex direction="column" className="min-h-[300vh] px-12 max-w-screen-xl mx-auto" gapY="9">
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
            MGGG Redistricting Lab
          </Link>
          , intended to promote public participation in redistricting around the United States.
          Redistricting is dividing up a jurisdiction (like a state, county, or city) into pieces
          that elect representatives. Where and how the lines are drawn influences everything from
          who has a shot at getting elected to how resources get allocated. Since the founding of
          the U.S. as a representative democracy, we've had the ideal that <b>districts</b> should
          be a way to communicate very local interests to our wider governing bodies. This only
          works if districts are built around <b>communities</b> of shared interest.
        </Text>
      </ContentSection>
      <ContentSection
        title="Use this tool to amplify your voice"
        flavorImage={<Image src="/home-megaphone.png" alt="megaphone" width={200} height={200} />}
      >
        <Flex direction="column" gapY="9">
          <Flex direction="row" align="center" justify="start" gapX="9">
            <Flex direction={'column'}>
              <Heading size="6" as="h3" className="text-purple-700 mb-4">
                You can draw districts.
              </Heading>
              <Text size="5">
                In the U.S., there's a big redistricting cycle every 10 years after new Census data
                is released. In most states, elected representatives in the state legislature are
                responsible for drawing the lines—including the districts for their own re-election.
                Following the 2020 Census, many states, cities, and counties experimented with
                collecting more public mapping input than ever before, and the Districtr team{' '}
                <Link href="https://mggg.org/cois" target="_blank">
                  was there to help
                </Link>
                .
              </Text>
              <Text size="5" className="mt-4">
                Now you can try your hand at redistricting! It's easy to make plans of your own and
                share them widely with Districtr.
              </Text>
            </Flex>
            <Image src="/districting-plan.svg" alt="draw" width={200} height={400} />
          </Flex>
          <Flex direction="row" align="center" justify="start" gapX="9">
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
        <Box className="max-w-4xl w-full h-[50vh] mx-auto">
          <ResponsivePlaceMap />
        </Box>
      </ContentSection>
    </Flex>
  );
};

export default Main;
