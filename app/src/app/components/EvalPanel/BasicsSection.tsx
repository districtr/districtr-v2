'use client';
import {useState} from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {Flex, Text, Heading, Select} from '@radix-ui/themes';
import {TriangleRightIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';

type DeviationView = 'top_to_bottom' | 'max_absolute' | 'both';

function formatDeviation(value: number): string {
  const pct = value * 100;
  const formatted = pct.toFixed(3);
  return formatted === '0.000' ? 'under 0.001%' : `${formatted}%`;
}

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

export const BasicsSection: React.FC<BasicsSectionProps> = ({evaluation}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const {onDistrictEnter, onDistrictLeave} = useDistrictHover();

  const [deviationView, setDeviationView] = useState<DeviationView>('top_to_bottom');

  const doc = mapDocument
    ? {
        numDistricts: mapDocument.num_districts ?? '—',
        dataSource: mapDocument.data_source_name ?? null,
        planName: (mapDocument.map_module ?? mapDocument.map_metadata.name)?.replace(/\s*\(\d+\)\s*$/, '') ?? null,
      }
    : null;

  const {assigned_units, unassigned_population, population_deviation, contiguous} = evaluation;
  const splitCount = assigned_units?.split_count ?? 0;
  const isComplete =
    assigned_units != null &&
    assigned_units.assigned_count + splitCount === assigned_units.total_count &&
    assigned_units.partially_assigned_count === 0;
  const isContiguous = contiguous ? Object.values(contiguous).every(Boolean) : null;
  const nonContiguousDistricts = contiguous
    ? Object.entries(contiguous)
        .filter(([, v]) => !v)
        .map(([k]) => k)
        .sort((a, b) => Number(a) - Number(b))
    : [];

  return (
    <Accordion.Root type="single" collapsible>
      <Accordion.Item value="basics">
        <Accordion.Trigger asChild>
          <Flex align="center" gap="1" className="cursor-pointer w-full group" py="2">
            <TriangleRightIcon width={16} height={16} className="transition-transform duration-200 group-data-[state=open]:rotate-90" />
            <Heading size="4">Basics</Heading>
          </Flex>
        </Accordion.Trigger>
        <Accordion.Content>
          {/* Data Source and Plan Type */}
          {doc && (
            <Text size="2" as="p" mt="4" mb="2">
              {doc.dataSource && <>Uses <strong>{doc.dataSource}</strong> data. </>}
              {doc.planName ? (
                <>The plan type is <strong>{doc.planName}</strong> ({doc.numDistricts} districts).</>
              ) : (
                <>This plan has <strong>{doc.numDistricts}</strong> districts.</>
              )}
            </Text>
          )}

          {/* Completeness */}
          {assigned_units && (
            <Text size="2" as="p" mb="2">
              {unassigned_population && (
                <>
                  <strong>{unassigned_population.unassigned_population.toLocaleString()}</strong> of{' '}
                  <strong>{unassigned_population.total_population.toLocaleString()}</strong> people
                  are not yet assigned to a district.{' '}
                </>
              )}
              This plan is <strong>{isComplete ? 'complete' : 'incomplete'}</strong>.
            </Text>
          )}

          {/* Contiguity */}
          <Heading size="3" align="center" mb="2" mt="4">
            Contiguity
          </Heading>
          <Text size="2" as="p" mb="2">
            A plan is called contiguous if every district is internally connected. This plan appears
            to be <strong>{isContiguous ? 'contiguous' : 'not contiguous'}</strong>. Note that
            contiguity can be subtle because of bodies of water and because of disconnected units.
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
          <Heading size="3" align="center" mb="2" mt="4">
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
            <>
              <Flex align="center" gap="2" mb="2" justify="end">
                <Text size="1" color="gray">
                  Show
                </Text>
                <Select.Root
                  value={deviationView}
                  onValueChange={v => setDeviationView(v as DeviationView)}
                  size="1"
                >
                  <Select.Trigger />
                  <Select.Content>
                    <Select.Item value="both">Both</Select.Item>
                    <Select.Item value="top_to_bottom">Top-to-bottom</Select.Item>
                    <Select.Item value="max_absolute">Max absolute</Select.Item>
                  </Select.Content>
                </Select.Root>
              </Flex>
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
                {deviationView !== 'max_absolute' && (
                  <>
                    , for a top-to-bottom deviation of{' '}
                    <strong>{formatDeviation(population_deviation.top_to_bottom_deviation)}</strong>
                  </>
                )}
                {deviationView === 'both' && <> and</>}
                {deviationView !== 'top_to_bottom' && (
                  <>
                    {deviationView === 'max_absolute' ? ', with' : ''} a maximal absolute deviation
                    of{' '}
                    <strong>
                      {population_deviation.maximal_absolute_deviation?.toLocaleString() ?? '—'}
                    </strong>{' '}
                    people
                  </>
                )}
                .
              </Text>
            </>
          ) : (
            <Text size="2">Not available for this plan.</Text>
          )}
        </Accordion.Content>
      </Accordion.Item>
    </Accordion.Root>
  );
};
