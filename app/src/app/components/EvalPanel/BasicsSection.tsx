'use client';
import {EvalSection, EvalSubheading} from './EvalSection';
import {type EvalOptions, useEvalOption, useIsReport} from './evalMode';
import {Flex, Text, Select} from '@radix-ui/themes';
import {DistrictLabel} from './DistrictLabel';
import {useMapStore} from '@store/mapStore';
import {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {useDistrictHover} from '@/app/hooks/useDistrictHover';
import {useZoomToDistrict} from '@/app/hooks/useZoomToDistrict';
import {HoverTrigger, hoverHandlers} from './HoverTrigger';
import {districtHeading} from '@/app/utils/zoneLabels';

type DeviationView = EvalOptions['deviationView'];

function formatDeviation(value: number): string {
  if (value > 1) return 'over 100%';
  const pct = value * 100;
  const formatted = pct.toFixed(3);
  return formatted === '0.000' ? 'under 0.001%' : `${formatted}%`;
}

interface BasicsSectionProps {
  evaluation: DocumentEvaluation;
}

export const BasicsSection: React.FC<BasicsSectionProps> = ({evaluation}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const zoneAliases = mapDocument?.map_metadata?.zone_aliases;
  const {onDistrictEnter, onDistrictLeave} = useDistrictHover();
  const zoomToDistrict = useZoomToDistrict();

  const isReport = useIsReport();
  const [deviationView, setDeviationView] = useEvalOption('deviationView');

  const doc = mapDocument
    ? {
        numDistricts: mapDocument.num_districts ?? '—',
        dataSource: mapDocument.data_source_name ?? null,
        planName:
          (mapDocument.map_module ?? mapDocument.map_metadata.name)?.replace(
            /\s*\(\d+\)\s*$/,
            ''
          ) ?? null,
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
    <EvalSection value="basics" title="Basics">
      {/* Data Source and Plan Type */}
      {doc && (
        <Text size="2" as="p" mb="2">
          {doc.dataSource && (
            <>
              Uses <strong>{doc.dataSource}</strong> data.{' '}
            </>
          )}
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
      )}

      {/* Completeness */}
      {assigned_units && (
        <Text size="2" as="p" mb="2">
          {unassigned_population && (
            <>
              <strong>{unassigned_population.unassigned_population.toLocaleString()}</strong> of{' '}
              <strong>{unassigned_population.total_population.toLocaleString()}</strong> people are
              not yet assigned to a district.{' '}
            </>
          )}
          {assigned_units.total_child_count !== null &&
            assigned_units.assigned_child_count !== null &&
            (() => {
              const unassignedBlocks =
                assigned_units.total_child_count - assigned_units.assigned_child_count;
              return (
                <>
                  <strong>{unassignedBlocks.toLocaleString()}</strong> of{' '}
                  <strong>{assigned_units.total_child_count.toLocaleString()}</strong>{' '}
                  {unassignedBlocks === 1 ? 'block is' : 'blocks are'} not yet assigned to a
                  district.{' '}
                </>
              );
            })()}
          This plan is <strong>{isComplete ? 'complete' : 'incomplete'}</strong>.
        </Text>
      )}

      {/* Contiguity */}
      <EvalSubheading>Contiguity</EvalSubheading>
      <Text size="2" as="p" mb="2">
        A plan is called contiguous if every district is internally connected. This plan appears to
        be <strong>{isContiguous ? 'contiguous' : 'not contiguous'}</strong>. Note that contiguity
        can be subtle because of bodies of water and because of disconnected units.
      </Text>
      {nonContiguousDistricts.length > 0 && (
        <>
          <Text size="2" as="p" mb="1">
            The following districts are not contiguous:
          </Text>
          <Flex gap={isReport ? '0' : '2'} wrap="wrap" mb="2" className="eval-district-list">
            {nonContiguousDistricts.map(d => (
              <DistrictLabel
                key={d}
                zone={Number(d)}
                onClick={() => zoomToDistrict(Number(d))}
                {...hoverHandlers(() => onDistrictEnter([d]), onDistrictLeave)}
              />
            ))}
          </Flex>
        </>
      )}

      {/* Population Deviation */}
      <EvalSubheading>Population Deviation</EvalSubheading>
      <Text size="2" as="p" mb="2">
        The ideal size of a district is arrived at by dividing the total population of the state
        equally into the specified number of districts. Population deviation of a plan is measured
        as the largest amount that any district differs from ideal size. Legislative plans should
        typically have individual deviations under ±5%, which ensures a top-to-bottom deviation of
        under 10%. Congressional plans are typically more tightly balanced.
      </Text>
      {population_deviation ? (
        <>
          <Flex align="center" gap="2" mb="2" justify="end" display={isReport ? 'none' : 'flex'}>
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
            <HoverTrigger
              bold
              onEnter={() => onDistrictEnter([population_deviation.most_populous_district])}
              onLeave={onDistrictLeave}
            >
              {districtHeading(population_deviation.most_populous_district, zoneAliases)}
            </HoverTrigger>{' '}
            and least populous district is{' '}
            <HoverTrigger
              bold
              onEnter={() => onDistrictEnter([population_deviation.least_populous_district])}
              onLeave={onDistrictLeave}
            >
              {districtHeading(population_deviation.least_populous_district, zoneAliases)}
            </HoverTrigger>
            {deviationView !== 'max_absolute' && (
              <>
                , for a top-to-bottom deviation of{' '}
                <strong>{formatDeviation(population_deviation.top_to_bottom_deviation)}</strong>
              </>
            )}
            {deviationView === 'both' && <> and</>}
            {deviationView !== 'top_to_bottom' && (
              <>
                {deviationView === 'max_absolute' ? ', with' : ''} a maximal absolute deviation of{' '}
                <strong>
                  {population_deviation.maximal_absolute_deviation?.toLocaleString() ?? '—'}
                </strong>{' '}
                {population_deviation.maximal_absolute_deviation === 1 ? 'person' : 'people'}
              </>
            )}
            .
          </Text>
        </>
      ) : (
        <Text size="2">Not available for this plan.</Text>
      )}
    </EvalSection>
  );
};
