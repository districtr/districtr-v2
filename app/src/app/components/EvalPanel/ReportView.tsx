'use client';
import {Button, Flex, Text} from '@radix-ui/themes';
import {AppNotification} from '@components/AppNotification';
import {useMapStore} from '@store/mapStore';
import {EvalPanel} from './EvalPanel';
import {ReportMapFigure} from './ReportMapFigure';
import {ReportPartsProvider, useReportStatus} from './reportStatus';

interface ReportViewProps {
  /** Set when the plan itself could not be loaded. */
  planError: Error | null;
}

/**
 * The report page: the print button with the report under it. The button works
 * once every part of the report has loaded. A plan that could not be loaded gets
 * its message in place of the report.
 */
export const ReportView: React.FC<ReportViewProps> = ({planError}) => {
  const planLoaded = useMapStore(state => !!state.mapDocument);
  const {status, setPart} = useReportStatus({
    plan: planError ? 'failed' : planLoaded ? 'ready' : 'loading',
  });

  return (
    <div className="eval-report-root h-screen h-dvh w-screen overflow-y-auto">
      <Flex justify="center" py="3" className="print:hidden">
        <Button disabled={status !== 'ready'} onClick={() => window.print()}>
          {status === 'loading' ? 'Preparing the report…' : 'Print / Save as PDF'}
        </Button>
      </Flex>
      <ReportPartsProvider value={setPart}>
        {planError ? (
          <article className="eval-report">
            <Text color="red" size="2">
              Failed to load document: {planError.message}
            </Text>
          </article>
        ) : (
          <EvalPanel mode="report" mapFigure={<ReportMapFigure />} />
        )}
      </ReportPartsProvider>
      <AppNotification />
    </div>
  );
};
