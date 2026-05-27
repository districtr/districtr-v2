'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Table, Heading, Tooltip} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {SubsectionHeading, formatDecimal} from './shared';
import {useZoneColorGetter} from '@/app/hooks/useZoneColor';

// Scores computed on EPSG:5070 (NAD83 / Conus Albers) via gerrytools.
// All three districts are from the 2020 redistricting cycle.
const AL1 = {
  name: "Alabama's 1st Congressional District",
  polsby_popper: 0.1536,
  reock: 0.2091,
  image: '/al_district1.png',
};
const OK5 = {
  name: "Oklahoma's 5th Congressional District",
  polsby_popper: 0.3419,
  reock: 0.4993,
  image: '/ok_district5.png',
};
const CO5 = {
  name: "Colorado's 5th Congressional District",
  polsby_popper: 0.5589,
  reock: 0.5459,
  image: '/co_district5.png',
};

interface Props {
  evaluation: DocumentEvaluation;
}

function DistrictTooltip({name, image}: {name: string; image: string}) {
  return (
    <Tooltip
      content={
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={name} style={{width: 160, height: 160, objectFit: 'contain'}} />
      }
    >
      <span style={{textDecoration: 'underline dotted', cursor: 'help'}}>{name}</span>
    </Tooltip>
  );
}

function PerDistrictTable({
  polsby_popper,
  reock,
}: {
  polsby_popper: Record<string, number>;
  reock: Record<string, number>;
}) {
  const getZoneColor = useZoneColorGetter();
  const zones = Object.keys(polsby_popper).sort((a, b) => Number(a) - Number(b));

  return (
    <Table.Root size="1">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeaderCell>District</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell justify="end">Polsby-Popper</Table.ColumnHeaderCell>
          <Table.ColumnHeaderCell justify="end">Reock</Table.ColumnHeaderCell>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {zones.map(zone => (
          <Table.Row key={zone}>
            <Table.Cell>
              <Flex align="center" gap="2">
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: '50%',
                    backgroundColor: getZoneColor(Number(zone)),
                    flexShrink: 0,
                  }}
                />
                <Text size="2">{zone}</Text>
              </Flex>
            </Table.Cell>
            <Table.Cell justify="end">
              <Text size="2">{formatDecimal(polsby_popper[zone], 3)}</Text>
            </Table.Cell>
            <Table.Cell justify="end">
              <Text size="2">{formatDecimal(reock[zone], 3)}</Text>
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

export function CompactnessSection({evaluation}: Props) {
  const {cut_edges, polsby_popper, reock} = evaluation;

  return (
    <Accordion.Root type="single" collapsible defaultValue="compactness">
      <Accordion.Item value="compactness">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full" py="2">
            <TriangleRightIcon />
            <Heading size="4">Compactness</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>

          {/* Cut Edges */}
          <SubsectionHeading>Cut Edges</SubsectionHeading>
          {cut_edges ? (
            <>
              <Text size="2" mb="2" as="p">
                Your plan has{' '}
                <strong>{cut_edges.cut_count.toLocaleString()}</strong> cut edges between{' '}
                {cut_edges.unit_type}s.
              </Text>
              <Text size="2" as="p">
                One measurement of compactness is the number of <strong>cut edges</strong> in a
                districting plan. This counts the number of adjacent {cut_edges.unit_type}s that
                are separated into different districts. You should only compare cut edge counts
                between plans for the same state using the same units — a lower number means a more
                compact plan.
              </Text>
            </>
          ) : (
            <Text size="2">Not available for this plan.</Text>
          )}

          {/* Polsby-Popper */}
          <SubsectionHeading>Polsby-Popper Scores</SubsectionHeading>
          <Text size="2" as="p" mb="2">
            The <strong>Polsby-Popper score</strong> compares a district&apos;s area to its
            perimeter. Scores range from 0 to 1; higher scores indicate more compact districts.
            Unlike cut edges, this measure depends on map projection and boundary resolution rather
            than the choice of geographic units. For reference [2020 redistricting cycle], a score
            of {AL1.polsby_popper.toFixed(3)} is exemplified
            by <DistrictTooltip name={AL1.name} image={AL1.image} />; a score
            of {OK5.polsby_popper.toFixed(3)} is exemplified
            by <DistrictTooltip name={OK5.name} image={OK5.image} />; and a score
            of {CO5.polsby_popper.toFixed(3)} is exemplified
            by <DistrictTooltip name={CO5.name} image={CO5.image} />.
          </Text>
          {polsby_popper && (() => {
            const vals = Object.values(polsby_popper).filter(v => !isNaN(v));
            if (!vals.length) return null;
            const min = Math.min(...vals), max = Math.max(...vals);
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            return (
              <Text size="2" as="p" mb="3">
                In your plan, scores range from <strong>{min.toFixed(3)}</strong> to{' '}
                <strong>{max.toFixed(3)}</strong>, with a mean of <strong>{mean.toFixed(3)}</strong>.
              </Text>
            );
          })()}

          {/* Reock */}
          <SubsectionHeading>Reock Scores</SubsectionHeading>
          <Text size="2" as="p" mb="2">
            The <strong>Reock score</strong> is the ratio of a district&apos;s area to the area of
            the smallest circle that contains it. Like Polsby-Popper, scores range from 0 to 1;
            higher scores indicate more compact, circular districts. Reock is sensitive to map
            projection and is computed on-demand when the evaluation view is opened. For reference
            [2020 redistricting cycle], a score of {AL1.reock.toFixed(3)} is
            exemplified by <DistrictTooltip name={AL1.name} image={AL1.image} />; a score
            of {OK5.reock.toFixed(3)} is exemplified
            by <DistrictTooltip name={OK5.name} image={OK5.image} />; and a score
            of {CO5.reock.toFixed(3)} is exemplified
            by <DistrictTooltip name={CO5.name} image={CO5.image} />.
          </Text>
          {reock && (() => {
            const vals = Object.values(reock).filter(v => !isNaN(v));
            if (!vals.length) return null;
            const min = Math.min(...vals), max = Math.max(...vals);
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            return (
              <Text size="2" as="p" mb="3">
                In your plan, scores range from <strong>{min.toFixed(3)}</strong> to{' '}
                <strong>{max.toFixed(3)}</strong>, with a mean of <strong>{mean.toFixed(3)}</strong>.
              </Text>
            );
          })()}

          {/* Per-district detail */}
          {polsby_popper && (
            <>
              <Text size="1" className="uppercase tracking-widest" mb="1" as="p">
                Per-district scores
              </Text>
              <PerDistrictTable
                polsby_popper={polsby_popper}
                reock={reock ?? {}}
              />
            </>
          )}

        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
}
