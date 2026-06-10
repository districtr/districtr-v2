'use client';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Heading, Callout} from '@radix-ui/themes';
import {InfoCircledIcon, TriangleRightIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';
import {type GeoUnit, GEO_UNITS, GEO_UNIT_LABELS} from '@constants/document/geoUnits';

interface BasicsSectionProps {
  evaluation: DocumentEvaluation;
}

const HOVER_BTN_STYLE: React.CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 0,
  font: 'inherit',
  fontWeight: 'bold',
  cursor: 'default',
  textDecoration: 'underline dotted',
};

const GEO_UNIT_DESCRIPTIONS: Record<GeoUnit, string> = {
  [GEO_UNITS.VTD]:
    'VTDs, also called "voting tabulation districts" or "voting districts," are the closest approximation of electoral precincts in Census geography.',
  [GEO_UNITS.BLOCK_GROUP]:
    'Block groups are Census geographic units that nest within counties and tracts, typically containing 600–3,000 people.',
  [GEO_UNITS.BLOCK]:
    'Census blocks are the smallest Census geographic unit, corresponding roughly to city blocks.',
};

export const BasicsSection: React.FC<BasicsSectionProps> = ({evaluation}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const {onDistrictEnter, onDistrictLeave} = useDistrictHover();

  const doc = mapDocument
    ? {
        numDistricts: mapDocument.num_districts ?? '—',
        dataSource: mapDocument.data_source_name,
        unitLabel: GEO_UNIT_LABELS[mapDocument.parent_geo_unit_type],
        unitDescription: GEO_UNIT_DESCRIPTIONS[mapDocument.parent_geo_unit_type],
        planName: mapDocument.map_module ?? mapDocument.map_metadata.name ?? null,
      }
    : null;

  const {assigned_units, unassigned_population, population_deviation, contiguous} = evaluation;
  const isContiguous = contiguous ? Object.values(contiguous).every(Boolean) : null;
  const nonContiguousDistricts = contiguous
    ? Object.entries(contiguous)
        .filter(([, v]) => !v)
        .map(([k]) => k)
        .sort((a, b) => Number(a) - Number(b))
    : [];

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
          <Heading size="2" align="center" mb="2" mt="4">
            Data, Units, and Plan Type
          </Heading>
          {doc && (
            <>
              <Callout.Root size="1" mb="2">
                <Callout.Icon>
                  <InfoCircledIcon />
                </Callout.Icon>
                <Callout.Text>
                  Uses <strong>{doc.dataSource}</strong> data on <strong>{doc.unitLabel}</strong>.
                </Callout.Text>
              </Callout.Root>
              {doc.unitDescription && (
                <Text size="2" as="p" mb="1">
                  {doc.unitDescription}
                </Text>
              )}
              <Text size="2" as="p">
                {doc.planName ? (
                  <>
                    The plan type is <strong>{doc.planName}</strong> ({doc.numDistricts} districts).
                  </>
                ) : (
                  <>
                    This plan has <strong>{doc.numDistricts}</strong> districts.
                  </>
                )}
              </Text>
            </>
          )}

          {/* Completeness */}
          <Heading size="2" align="center" mb="2" mt="4">
            Completeness
          </Heading>
          {assigned_units ? (
            <>
              <Text size="2" as="p">
                <strong>{assigned_units.assigned_count.toLocaleString()}</strong> of{' '}
                <strong>{assigned_units.total_count.toLocaleString()}</strong>{' '}
                {assigned_units.unit_type}s are assigned to a district
                {assigned_units.partially_assigned_count > 0 && (
                  <>
                    {' '}
                    ({assigned_units.partially_assigned_count.toLocaleString()} partially assigned)
                  </>
                )}
                .
              </Text>
              {unassigned_population && (
                <Text size="2" as="p">
                  <strong>{unassigned_population.unassigned_population.toLocaleString()}</strong> of{' '}
                  <strong>{unassigned_population.total_population.toLocaleString()}</strong> people
                  are not yet assigned to a district.
                </Text>
              )}
              <Text size="2" as="p" mb="2">
                This plan is{' '}
                <strong>
                  {assigned_units.assigned_count === assigned_units.total_count
                    ? 'complete'
                    : 'incomplete'}
                </strong>
                .
              </Text>
            </>
          ) : (
            <Text size="2" as="p" mb="2">
              Not available for this plan.
            </Text>
          )}

          {/* Contiguity */}
          <Heading size="2" align="center" mb="2" mt="4">
            Contiguity
          </Heading>
          <Text size="2" as="p" mb="2">
            A plan is called contiguous if every district is internally connected. This plan appears
            to be <strong>{isContiguous ? 'contiguous' : 'not contiguous'}</strong>. Note that
            contiguity can be subtle because of bodies of water and because of disconnected units.
            Open the plan in the editor&apos;s <em>Map validation</em> panel to examine contiguity
            gaps.
          </Text>
          {nonContiguousDistricts.length > 0 && (
            <Text size="2" as="p" mb="2">
              The following districts are not contiguous:{' '}
              {nonContiguousDistricts.map((d, i) => (
                <span key={d}>
                  <button
                    type="button"
                    style={HOVER_BTN_STYLE}
                    onMouseEnter={() => onDistrictEnter(d)}
                    onMouseLeave={onDistrictLeave}
                    onFocus={() => onDistrictEnter(d)}
                    onBlur={onDistrictLeave}
                  >
                    District {d}
                  </button>
                  {i < nonContiguousDistricts.length - 1 ? ', ' : ''}
                </span>
              ))}
            </Text>
          )}

          {/* Population Deviation */}
          <Heading size="2" align="center" mb="2" mt="4">
            Population Deviation
          </Heading>
          <Text size="2" as="p" mb="2">
            The ideal size of a district is arrived at by dividing the total population of the state
            equally into the specified number of districts. Population deviation of a plan is
            measured as the largest amount that any district differs from ideal size. Legislative
            plans should typically have individual deviations under ±5%, which ensures a
            top-to-bottom deviation of under 10%. Congressional plans are typically more tightly
            balanced.
          </Text>
          {population_deviation ? (
            <Text size="2" as="p">
              Your plan&apos;s most populous district is{' '}
              <button
                type="button"
                style={HOVER_BTN_STYLE}
                onMouseEnter={() => onDistrictEnter(population_deviation.most_populous_district)}
                onMouseLeave={onDistrictLeave}
                onFocus={() => onDistrictEnter(population_deviation.most_populous_district)}
                onBlur={onDistrictLeave}
              >
                District {population_deviation.most_populous_district}
              </button>{' '}
              and least populous district is{' '}
              <button
                type="button"
                style={HOVER_BTN_STYLE}
                onMouseEnter={() => onDistrictEnter(population_deviation.least_populous_district)}
                onMouseLeave={onDistrictLeave}
                onFocus={() => onDistrictEnter(population_deviation.least_populous_district)}
                onBlur={onDistrictLeave}
              >
                District {population_deviation.least_populous_district}
              </button>
              , for a top-to-bottom deviation of{' '}
              <strong>{(population_deviation.top_to_bottom_deviation * 100).toFixed(2)}%</strong>{' '}
              and a maximal absolute deviation of{' '}
              <strong>
                {population_deviation.maximal_absolute_deviation?.toLocaleString() ?? '—'}
              </strong>{' '}
              people.
            </Text>
          ) : (
            <Text size="2">Not available for this plan.</Text>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};
