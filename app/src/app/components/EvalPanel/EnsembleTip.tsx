'use client';
import React from 'react';
import {HoverCard, Link, Text} from '@radix-ui/themes';
import {formatNumber} from '@utils/numbers';
import type {NumberFormat} from '@constants/demography/format';
import {useEnsembleStore} from '@store/ensembleStore';
import type {EnsembleReference} from '@/app/hooks/useEnsembleReference';
import {
  compareToEnsemble,
  formatShare,
  selectDistribution,
  type EnsembleMetricRef,
} from '@utils/ensembleStats';
import {HOVER_CARD_CLOSE_DELAY, NEVER_MS, useHoverCard} from '@components/HelpTip/useHoverCard';
import {HELP_TIP_HOVER_DELAY} from '@components/HelpTip/HelpTip';

const CARD_WIDTH = 260;

interface EnsembleTipProps {
  ensemble: EnsembleReference;
  metric: EnsembleMetricRef;
  /** The plan's value, in the package's own orientation (Democratic point of view). */
  value: number | null | undefined;
  format: NumberFormat;
  /** The cell shows the metric's sign flipped (Republican point of view). */
  negate?: boolean;
  /** The cell shows `total - value` instead (Republican seat counts). */
  complementOf?: number;
  children: React.ReactNode;
}

/**
 * Hover text placing one metric cell against the ensemble, in the same hover-card
 * style as HelpTip, with a link into the ensemble modal on this metric.
 *
 * Renders its children untouched whenever the comparison can't be made — no
 * package for the module, distributions still loading, the plan incomplete, or
 * the package carrying no such series. Every cell can therefore be wrapped
 * unconditionally, and the whole layer disappears cleanly when it has nothing to
 * say.
 */
export const EnsembleTip: React.FC<EnsembleTipProps> = ({
  ensemble,
  metric,
  value,
  format,
  negate,
  complementOf,
  children,
}) => {
  const openModal = useEnsembleStore(state => state.openModal);
  const {open, setOpen, triggerRef, triggerProps, alignOffset, onPointerDownOutside} =
    useHoverCard(HELP_TIP_HOVER_DELAY);

  const distribution =
    ensemble.active && ensemble.summary ? selectDistribution(ensemble.summary, metric) : undefined;
  if (!distribution || value == null || !Number.isFinite(value)) return <>{children}</>;

  const decreasing = negate || complementOf !== undefined;
  const display = (x: number) => (complementOf !== undefined ? complementOf - x : negate ? -x : x);
  const {median, direction, share} = compareToEnsemble(distribution, value, {decreasing, display});

  return (
    <HoverCard.Root
      open={open}
      onOpenChange={setOpen}
      openDelay={NEVER_MS}
      closeDelay={HOVER_CARD_CLOSE_DELAY}
    >
      <HoverCard.Trigger>
        <span
          ref={triggerRef as React.Ref<HTMLSpanElement>}
          {...triggerProps}
          className="cursor-help"
          style={{textDecoration: 'underline dotted'}}
        >
          {children}
        </span>
      </HoverCard.Trigger>
      <HoverCard.Content
        style={{width: CARD_WIDTH}}
        align="start"
        alignOffset={alignOffset}
        onPointerDownOutside={onPointerDownOutside}
      >
        <Text size="2">
          The median of the ensemble of randomly generated plans is{' '}
          {formatNumber(median, format)} (
          <Link
            size="2"
            href="#"
            onClick={event => {
              event.preventDefault();
              openModal(metric);
            }}
          >
            more info
          </Link>
          ). This plan&apos;s value is {direction} than {formatShare(share)} of the ensemble plans.
        </Text>
      </HoverCard.Content>
    </HoverCard.Root>
  );
};
