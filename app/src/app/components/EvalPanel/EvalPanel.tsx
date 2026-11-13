'use client';
import {useEffect, useMemo, useState} from 'react';
import {useSearchParams} from 'next/navigation';
import {useQuery} from '@tanstack/react-query';
import {Button, Flex, Heading, Spinner, Text} from '@radix-ui/themes';
import {FileTextIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@store/mapStore';
import {evaluationQueryKey, getEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {MAP_ROUTES} from '@constants/document/routes';
import {BasicsSection} from './BasicsSection';
import {PartisanSection} from './PartisanSection';
import {CountySplitsSection} from './CountySplitsSection';
import {CompactnessSection} from './CompactnessSection';
import {
  DEFAULT_EVAL_OPTIONS,
  EvalModeProvider,
  EvalOptionsProvider,
  evalOptionsFromParams,
  evalOptionsToQuery,
  type EvalMode,
  type EvalOptions,
} from './evalMode';
import {ReportNotes} from './ReportNotes';
import {useReportPart} from './reportStatus';

interface EvalPanelProps {
  /** `report` lays the same content out as a document for paper. */
  mode?: EvalMode;
  /** Report only: the plan map, placed after the title block. */
  mapFigure?: React.ReactNode;
}

export const EvalPanel: React.FC<EvalPanelProps> = ({mode = 'screen', mapFigure}) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const setLoadingState = useMapStore(state => state.setLoadingState);

  const publicId = mapDocument?.public_id;
  const isReport = mode === 'report';

  // The report takes the selector choices from its link and never changes them;
  // the screen starts from the defaults and passes its choices on when exporting.
  const searchParams = useSearchParams();
  const [options, setOptions] = useState<EvalOptions>(() =>
    isReport ? evalOptionsFromParams(searchParams) : DEFAULT_EVAL_OPTIONS
  );
  const optionsContext = useMemo(
    () => ({
      options,
      setOption: <K extends keyof EvalOptions>(key: K, value: EvalOptions[K]) =>
        setOptions(current => ({...current, [key]: value})),
    }),
    [options]
  );

  const {
    data: envelope,
    isLoading,
    isError,
    isSuccess,
  } = useQuery({
    queryKey: evaluationQueryKey(publicId),
    queryFn: async () => {
      if (!publicId) return null;
      const result = await getEvaluation(String(publicId));
      if (!result.ok) throw new Error(result.error.detail);
      return result.response;
    },
    enabled: !!publicId,
  });

  // Signal the view-transition overlay, which holds the "Preparing evaluation"
  // preloader until metricsLoaded is true (see useViewTransition). Reset on mount,
  // mark loaded once the query settles. Without this the overlay hangs for the full
  // safety timeout on every eval navigation.
  useEffect(() => {
    setLoadingState('metricsLoaded', false);
  }, [setLoadingState]);
  useEffect(() => {
    if (!isLoading) setLoadingState('metricsLoaded', true);
  }, [isLoading, setLoadingState]);

  useReportPart('evaluation', isError ? 'failed' : isSuccess ? 'ready' : 'loading');

  const evaluation = envelope?.metrics;

  const planName = mapDocument?.map_metadata?.name ?? 'Untitled Plan';
  const snapshotDate = mapDocument?.updated_at
    ? new Date(mapDocument.updated_at).toLocaleString()
    : null;

  // The browser offers the page title as the PDF's file name.
  useEffect(() => {
    if (!isReport) return;
    const previous = document.title;
    document.title = `Districtr evaluation report – ${planName}`;
    return () => {
      document.title = previous;
    };
  }, [isReport, planName]);

  const status = (
    <>
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

      {evaluation && Object.keys(evaluation).length === 0 && (
        <Flex p="5">
          <Text size="3">
            This plan is empty. Please add at least one district in the draw mode to see its
            evaluation metrics.
          </Text>
        </Flex>
      )}
    </>
  );

  const sections = evaluation && Object.keys(evaluation).length > 0 && (
    <>
      <BasicsSection evaluation={evaluation} />
      <PartisanSection evaluation={evaluation} />
      <CountySplitsSection evaluation={evaluation} />
      <CompactnessSection evaluation={evaluation} />
    </>
  );

  if (isReport) {
    const planUrl =
      publicId && typeof window !== 'undefined'
        ? `${window.location.origin}/${MAP_ROUTES.DISTRICTS}/${publicId}`
        : null;
    return (
      <EvalModeProvider value="report">
        <EvalOptionsProvider value={optionsContext}>
          <article className="eval-report">
            <header className="eval-report-title">
              <Text size="1" className="uppercase tracking-widest">
                Districtr · Evaluation Report
              </Text>
              <Heading as="h1" size="7" mt="2">
                Districting Plan Evaluation Report
              </Heading>
              <Text size="4" as="p" mt="2">
                {planName}
              </Text>
              <Text size="2" as="p" mt="2">
                {[
                  mapDocument?.map_module,
                  mapDocument?.num_districts ? `${mapDocument.num_districts} districts` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              <Text size="2" as="p">
                {snapshotDate && <>Snapshot of {snapshotDate} · </>}Plan id {publicId}
                {planUrl && (
                  <>
                    {' '}
                    · <a href={planUrl}>{planUrl}</a>
                  </>
                )}
              </Text>
            </header>
            {mapFigure}
            {status}
            {sections}
            {sections && <ReportNotes />}
          </article>
        </EvalOptionsProvider>
      </EvalModeProvider>
    );
  }

  return (
    <EvalModeProvider value="screen">
      <EvalOptionsProvider value={optionsContext}>
        <div className="eval-panel h-full overflow-y-auto flex-shrink-0 border-l border-gray-200 bg-white w-1/2">
          <Flex direction="column" p="5" gap="1">
            <Flex align="center" justify="between" gap="3">
              <Text size="1" className="uppercase tracking-widest">
                Districtr · Evaluation Report
              </Text>
              {publicId && (
                <Button asChild size="1" variant="soft" className="print:hidden">
                  <a
                    href={`/${MAP_ROUTES.DISTRICTS}/${publicId}/report?${evalOptionsToQuery(options)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <FileTextIcon />
                    Printable report
                  </a>
                </Button>
              )}
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

          {status}

          {sections && (
            <Flex direction="column" gap="5" pl="2" pr="5" pb="5">
              {sections}
            </Flex>
          )}
        </div>
      </EvalOptionsProvider>
    </EvalModeProvider>
  );
};
