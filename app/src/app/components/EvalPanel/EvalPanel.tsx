'use client';
import {useQuery} from '@tanstack/react-query';
import {Flex, Heading, Spinner, Text} from '@radix-ui/themes';
import {useMapStore} from '@store/mapStore';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {getEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {BasicsSection} from './BasicsSection';
import {PartisanSection} from './PartisanSection';
import {CountySplitsSection} from './CountySplitsSection';
import {CompactnessSection} from './CompactnessSection';

export const EvalPanel: React.FC = () => {
  const mapDocument = useMapStore(state => state.mapDocument);

  const publicId = mapDocument?.public_id;

  const {
    data: envelope,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['evaluation', publicId],
    queryFn: async () => {
      if (!publicId) return null;
      const result = await getEvaluation(String(publicId));
      if (!result.ok) throw new Error(result.error.detail);
      return result.response;
    },
    enabled: !!publicId,
  });

  const evaluation = envelope?.metrics;

  const evalTablesOnly = useMapControlsStore(state => state.evalTablesOnly);
  const setEvalTablesOnly = useMapControlsStore(state => state.setEvalTablesOnly);

  const planName = mapDocument?.map_metadata?.name ?? 'Untitled Plan';
  const snapshotDate = mapDocument?.updated_at
    ? new Date(mapDocument.updated_at).toLocaleString()
    : null;

  return (
    <div className="eval-panel h-full overflow-y-auto flex-shrink-0 border-l border-gray-200 bg-white w-1/2">
      <Flex direction="column" p="5" gap="1">
        <Flex justify="between" align="center">
          <Text size="1" className="uppercase tracking-widest">
            Districtr · Evaluation Report
          </Text>
          <label>
            <Flex align="center" gap="1">
              <input
                type="checkbox"
                checked={evalTablesOnly}
                onChange={e => setEvalTablesOnly(e.target.checked)}
              />
              <Text size="1">Tables only</Text>
            </Flex>
          </label>
        </Flex>
        <Heading size="5" mt="1">
          Districting Plan Metrics
        </Heading>
        <Text size="2">{planName}</Text>
        {snapshotDate && (
          <Text size="1">
            Snapshot of {snapshotDate} · Plan id {publicId}
          </Text>
        )}
      </Flex>

      {isLoading && (
        <Flex justify="center" mt="6">
          <Spinner />
        </Flex>
      )}

      {isError && (
        <Flex p="5">
          <Text color="red" size="2">
            Failed to load evaluation metrics.
          </Text>
        </Flex>
      )}

      {evaluation && (
        <Flex direction="column" gap="5" px="5" pb="5">
          <BasicsSection evaluation={evaluation} />
          <PartisanSection evaluation={evaluation} />
          <CountySplitsSection evaluation={evaluation} />
          <CompactnessSection evaluation={evaluation} />
        </Flex>
      )}
    </div>
  );
};
