'use client';
import React, {useCallback, useEffect, useState} from 'react';
import * as Accordion from '@radix-ui/react-accordion';
import {
  Callout,
  Dialog,
  Flex,
  Heading,
  Link,
  Select,
  Separator,
  Spinner,
  Text,
} from '@radix-ui/themes';
import {Cross2Icon, InfoCircledIcon, TriangleRightIcon} from '@radix-ui/react-icons';
import {ParentSize} from '@visx/responsive';
import type {DocumentEvaluation} from '@utils/api/apiHandlers/getEvaluation';
import {formatElectionKey} from '@utils/elections';
import {useEnsembleSegment, useEnsembleSummary} from './ensembleData';
import {
  CATEGORY_LABELS,
  ensembleComparisonSentence,
  findEnsembleMetric,
  metricsInCategory,
  resolveFocus,
  type EnsembleCategory,
  type EnsembleMetricFocus,
} from './ensembleMetrics';
import {ENSEMBLE_MODAL_TEXT, fillEnsembleText} from './ensembleModalText';
import {EnsembleHistogram} from './EnsembleHistogram';
import {SegmentTables} from './SegmentTables';
import {SegmentThumbnail} from './SegmentThumbnail';

/** Matches the help-tip demonstration modal, the app's other wide explainer. */
const MODAL_MAX_WIDTH = 720;
const CHART_HEIGHT = 280;
/** Which of the two collapsible sections are open, remembered per browser. */
const SECTIONS_KEY = 'districtr-ensemble-modal-sections';
const DEFAULT_SECTIONS = ['demonstration'];

const readStoredSections = (): string[] => {
  try {
    const stored = window.localStorage.getItem(SECTIONS_KEY);
    if (!stored) return DEFAULT_SECTIONS;
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return DEFAULT_SECTIONS;
    return parsed.filter((value): value is string => typeof value === 'string');
  } catch {
    return DEFAULT_SECTIONS;
  }
};

const CollapsibleSection: React.FC<{value: string; heading: string; children: React.ReactNode}> = ({
  value,
  heading,
  children,
}) => (
  <Accordion.Item value={value}>
    <Accordion.Trigger asChild>
      <Flex align="center" gap="1" className="cursor-pointer w-full group" py="2">
        <TriangleRightIcon
          width={16}
          height={16}
          className="transition-transform duration-200 group-data-[state=open]:rotate-90"
        />
        <Heading size="4">{heading}</Heading>
      </Flex>
    </Accordion.Trigger>
    <Accordion.Content>{children}</Accordion.Content>
  </Accordion.Item>
);

export interface EnsembleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The map module whose package to read, e.g. `co_congressional_districts_v2`. */
  moduleSlug: string;
  /** The preset the evaluation panel is comparing against. */
  presetKey: string;
  presetLabel: string;
  /** Plan count of this preset, from the package index; the text falls back to
   * the summary's own count when it is absent. */
  nPlans?: number;
  /** Opens the histogram on one metric — the "more info" path out of a popup. */
  focus?: EnsembleMetricFocus | null;
  /** The reader's own plan, for the "This plan" marker. */
  evaluation?: DocumentEvaluation;
}

/**
 * The explanation behind the ensemble comparison: how the plans are made, a
 * hundred consecutive plans to look at, and the full distribution of any metric
 * with the reader's plan marked on it.
 *
 * The segment and its thumbnails are an order of magnitude larger than the
 * summary the panel loads, so they are fetched only once this is open.
 */
export const EnsembleModal: React.FC<EnsembleModalProps> = ({
  open,
  onOpenChange,
  moduleSlug,
  presetKey,
  presetLabel,
  nPlans,
  focus,
  evaluation,
}) => {
  const summaryQuery = useEnsembleSummary(moduleSlug, presetKey, open);
  const segmentQuery = useEnsembleSegment(moduleSlug, presetKey, open);
  const summary = summaryQuery.data;
  const segment = segmentQuery.data;

  const [selection, setSelection] = useState<EnsembleMetricFocus | null>(focus ?? null);
  const [stepIndex, setStepIndex] = useState(0);
  const [animating, setAnimating] = useState(false);
  const [openSections, setOpenSections] = useState<string[]>(DEFAULT_SECTIONS);

  useEffect(() => {
    setOpenSections(readStoredSections());
  }, []);
  const handleSectionsChange = (values: string[]) => {
    setOpenSections(values);
    try {
      window.localStorage.setItem(SECTIONS_KEY, JSON.stringify(values));
    } catch {
      // A browser refusing storage costs the reader a remembered preference, nothing more.
    }
  };

  // Each opening starts from whatever metric the caller pointed at; the reader's
  // own later choices then stand until the modal is closed. Depending on the
  // focus fields rather than the object keeps a caller's inline object from
  // resetting the selection on every render.
  const focusCategory = focus?.category;
  const focusMetric = focus?.metric;
  const focusElection = focus?.election;
  useEffect(() => {
    if (!open) return;
    setSelection(
      focusCategory && focusMetric
        ? {category: focusCategory, metric: focusMetric, election: focusElection}
        : null
    );
  }, [open, focusCategory, focusMetric, focusElection]);

  // Animation is a timer: it has no business running behind a closed dialog.
  useEffect(() => {
    if (!open) setAnimating(false);
  }, [open]);
  useEffect(() => {
    setStepIndex(0);
    setAnimating(false);
  }, [presetKey, moduleSlug]);

  const handleSelectMetric = useCallback((next: EnsembleMetricFocus) => setSelection(next), []);

  const resolved = resolveFocus(selection, summary);
  const metric = findEnsembleMetric(resolved.metric)!;
  const dist = summary ? metric.distribution(summary, resolved.election) : undefined;
  const steps = segment?.steps ?? [];
  const step = steps[Math.min(stepIndex, Math.max(0, steps.length - 1))];
  const planValue = evaluation ? metric.planValue(evaluation, resolved.election) : undefined;
  const stepValue = step ? metric.stepValue(step, resolved.election) : undefined;
  const planCount = nPlans ?? summary?.n_plans;
  const planCountText = planCount ? planCount.toLocaleString() : 'the ensemble’s';
  const stepNumber = step ? step.plan : 0;
  const elections = summary?.elections ?? [];

  const substitutions = {plans: planCountText, preset: presetLabel};

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Content style={{maxWidth: MODAL_MAX_WIDTH}}>
        <Flex align="start" justify="between">
          <Dialog.Title className="m-0 flex-1">
            <Heading size="4">{ENSEMBLE_MODAL_TEXT.title}</Heading>
          </Dialog.Title>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label={ENSEMBLE_MODAL_TEXT.close}
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Dialog.Description size="2" color="gray" mb="2">
          {fillEnsembleText(ENSEMBLE_MODAL_TEXT.subtitle, substitutions)}
        </Dialog.Description>

        <Flex direction="column" style={{maxHeight: '70vh', overflowY: 'auto'}} pr="2">
          <Accordion.Root type="multiple" value={openSections} onValueChange={handleSectionsChange}>
            <CollapsibleSection
              value="methodology"
              heading={ENSEMBLE_MODAL_TEXT.methodologyHeading}
            >
              <Flex direction="column" gap="2" pb="2">
                {ENSEMBLE_MODAL_TEXT.methodologyParagraphs.map((paragraph, index) => (
                  <Text size="2" as="p" key={index}>
                    {fillEnsembleText(paragraph, substitutions)}
                  </Text>
                ))}
                <Flex direction="column" gap="1" mt="1">
                  {ENSEMBLE_MODAL_TEXT.methodologyReferences.map(reference => (
                    <Text size="1" key={reference.text}>
                      {reference.href ? (
                        <Link href={reference.href} target="_blank" rel="noopener noreferrer">
                          {reference.text}
                        </Link>
                      ) : (
                        reference.text
                      )}
                    </Text>
                  ))}
                </Flex>
              </Flex>
            </CollapsibleSection>

            <CollapsibleSection
              value="demonstration"
              heading={ENSEMBLE_MODAL_TEXT.demonstrationHeading}
            >
              {segmentQuery.isLoading && (
                <Flex align="center" gap="2" py="3">
                  <Spinner />
                  <Text size="2">{ENSEMBLE_MODAL_TEXT.loading}</Text>
                </Flex>
              )}
              {segmentQuery.isError && (
                <Callout.Root color="amber" size="1" my="2">
                  <Callout.Icon>
                    <InfoCircledIcon />
                  </Callout.Icon>
                  <Callout.Text>{ENSEMBLE_MODAL_TEXT.loadFailed}</Callout.Text>
                </Callout.Root>
              )}
              {segment && step && (
                <Flex direction="column" gap="3" pb="2">
                  <Text size="2" as="p">
                    {fillEnsembleText(ENSEMBLE_MODAL_TEXT.demonstrationIntro, {
                      first: segment.start.toLocaleString(),
                      last: (segment.start + segment.steps.length - 1).toLocaleString(),
                    })}
                  </Text>
                  <Flex gap="4" align="start" wrap="wrap">
                    <div style={{flex: '0 0 30%', minWidth: 180}}>
                      <SegmentThumbnail
                        moduleSlug={moduleSlug}
                        presetKey={presetKey}
                        stepCount={segment.steps.length}
                        index={stepIndex}
                        onIndexChange={setStepIndex}
                        planNumber={stepNumber}
                        animating={animating}
                        onAnimatingChange={setAnimating}
                      />
                    </div>
                    <div style={{flex: '1 1 0', minWidth: 280}}>
                      <SegmentTables
                        step={step}
                        focus={resolved}
                        onSelectMetric={handleSelectMetric}
                      />
                    </div>
                  </Flex>
                </Flex>
              )}
            </CollapsibleSection>
          </Accordion.Root>

          <Separator size="4" my="2" />

          <Heading size="4" mb="2">
            {ENSEMBLE_MODAL_TEXT.histogramHeading}
          </Heading>
          <Flex gap="2" align="center" wrap="wrap" mb="2">
            <Select.Root
              size="1"
              value={resolved.category}
              onValueChange={value => {
                const category = value as EnsembleCategory;
                const first = metricsInCategory(category)[0];
                setSelection({
                  category,
                  metric: first.id,
                  election: first.perElection ? resolved.election : undefined,
                });
              }}
            >
              <Select.Trigger aria-label="Metric category" />
              <Select.Content>
                {(Object.keys(CATEGORY_LABELS) as EnsembleCategory[]).map(category => (
                  <Select.Item key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            <Select.Root
              size="1"
              value={resolved.metric}
              onValueChange={value => {
                const next = findEnsembleMetric(value)!;
                setSelection({
                  category: next.category,
                  metric: next.id,
                  election: next.perElection ? resolved.election : undefined,
                });
              }}
            >
              <Select.Trigger aria-label="Metric" />
              <Select.Content>
                {metricsInCategory(resolved.category).map(option => (
                  <Select.Item key={option.id} value={option.id}>
                    {option.label}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
            {metric.perElection && elections.length > 0 && (
              <Select.Root
                size="1"
                value={resolved.election ?? elections[0]}
                onValueChange={value =>
                  setSelection({category: metric.category, metric: metric.id, election: value})
                }
              >
                <Select.Trigger aria-label="Election" />
                <Select.Content>
                  {elections.map(election => (
                    <Select.Item key={election} value={election}>
                      {formatElectionKey(election)}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
            )}
          </Flex>

          {summaryQuery.isLoading && (
            <Flex align="center" justify="center" py="5">
              <Spinner />
            </Flex>
          )}
          {summaryQuery.isError && (
            <Callout.Root color="amber" size="1" my="2">
              <Callout.Icon>
                <InfoCircledIcon />
              </Callout.Icon>
              <Callout.Text>{ENSEMBLE_MODAL_TEXT.summaryFailed}</Callout.Text>
            </Callout.Root>
          )}
          {dist && (
            <>
              <Text size="1" color="gray" mb="1">
                {fillEnsembleText(ENSEMBLE_MODAL_TEXT.histogramIntro, substitutions)}
              </Text>
              <div style={{width: '100%', height: CHART_HEIGHT}}>
                <ParentSize>
                  {({width}) => (
                    <EnsembleHistogram
                      dist={dist}
                      format={metric.format}
                      planValue={planValue}
                      planLabel={ENSEMBLE_MODAL_TEXT.thisPlanMarker}
                      stepValue={stepValue}
                      stepLabel={fillEnsembleText(ENSEMBLE_MODAL_TEXT.stepLabel, {
                        step: stepNumber.toLocaleString(),
                      })}
                      width={width}
                      height={CHART_HEIGHT}
                      percentAxisLabel={ENSEMBLE_MODAL_TEXT.axisLabel}
                      metricLabel={metric.label}
                    />
                  )}
                </ParentSize>
              </div>
              <Text size="2" as="p" mt="2" mb="2">
                {ensembleComparisonSentence({dist, value: planValue, format: metric.format})}
              </Text>
              {planValue === undefined && (
                <Text size="1" color="gray" mb="2">
                  {ENSEMBLE_MODAL_TEXT.noPlanValue}
                </Text>
              )}
            </>
          )}
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

/**
 * Open/close plumbing for a caller that opens the modal from several places —
 * the panel's "About these plans" link and every popup's "more info".
 */
export const useEnsembleModalController = () => {
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState<EnsembleMetricFocus | null>(null);

  const openOnMetric = useCallback((next?: EnsembleMetricFocus | null) => {
    setFocus(next ?? null);
    setOpen(true);
  }, []);

  return {
    open,
    focus,
    openOnMetric,
    close: useCallback(() => setOpen(false), []),
    /** Spread onto `<EnsembleModal {...modalProps} … />`. */
    modalProps: {open, onOpenChange: setOpen, focus},
  };
};

export default EnsembleModal;
