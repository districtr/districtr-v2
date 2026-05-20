'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Heading, Callout} from '@radix-ui/themes';
import {InfoCircledIcon, TriangleRightIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {SubsectionHeading} from './shared';

export function BasicsSection() {
  const mapDocument = useMapStore(state => state.mapDocument);

  const numDistricts = mapDocument?.num_districts ?? '—';
  const dataSource = mapDocument?.data_source_name ?? 'Unknown data source';
  const unitType = mapDocument?.child_geo_unit_type ?? mapDocument?.parent_geo_unit_type ?? 'units';
  const planName = mapDocument?.map_metadata?.name ?? 'Untitled Plan';

  return (
    <Accordion.Root type="single" collapsible defaultValue="basics">
      <Accordion.Item value="basics">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full" py="2">
            <TriangleRightIcon className="accordion-chevron" />
            <Heading size="4">Basics</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>
          {/* Data, Units, and Plan Type */}
          <SubsectionHeading>Data, Units, and Plan Type</SubsectionHeading>
          <Callout.Root size="1" mb="2">
            <Callout.Icon>
              <InfoCircledIcon />
            </Callout.Icon>
            <Callout.Text>
              Uses <strong>{dataSource}</strong> data on <strong>{unitType}</strong>.
            </Callout.Text>
          </Callout.Root>
          <Text size="2">
            The plan type is <strong>{planName}</strong> ({numDistricts} districts).
          </Text>

          {/* Completeness */}
          <SubsectionHeading>Completeness</SubsectionHeading>
          <Text size="2" as="p" mb="2">
            All <strong>{numDistricts}</strong> districts are present.{' '}
            <span className="text-gray-400">TODO: X/Y {unitType}s are assigned to a district.</span>{' '}
            This plan is <span className="text-gray-400">TODO: complete/incomplete</span>.
          </Text>

          {/* Contiguity */}
          <SubsectionHeading>Contiguity</SubsectionHeading>
          <Text size="2" color="gray" as="p" mb="2">
            A plan is called contiguous if every district is internally connected. Note that
            contiguity can be subtle because of bodies of water and because of disconnected units.
            Open the plan in the editor&apos;s <em>Map validation</em> panel to examine contiguity
            gaps.
          </Text>
          <Text size="2" as="p" mb="2">
            Status: <span className="text-gray-400">TODO: contiguity check not yet available</span>
          </Text>

          {/* Population Deviation */}
          <SubsectionHeading>Population Deviation</SubsectionHeading>
          <Text size="2" color="gray" as="p" mb="2">
            The ideal size of a district is arrived at by dividing the total population of the state
            equally into the specified number of districts. Population deviation of a plan is
            measured as the largest amount that any district differs from ideal size. Legislative
            plans should typically have individual deviations under ±5%, which ensures a
            top-to-bottom deviation of under 10%. Congressional plans are typically more tightly
            balanced.
          </Text>
          <Text size="2" as="p">
            Your plan&apos;s most populous district is{' '}
            <span className="text-gray-400">TODO</span> and least populous district is{' '}
            <span className="text-gray-400">TODO</span>, for a top-to-bottom deviation of{' '}
            <span className="text-gray-400">TODO</span>.
          </Text>
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
