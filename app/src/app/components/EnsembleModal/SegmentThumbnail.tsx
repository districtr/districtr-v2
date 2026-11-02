'use client';
import React, {useEffect, useRef} from 'react';
import {Button, Flex, Slider, Text} from '@radix-ui/themes';
import {PauseIcon, PlayIcon, TrackNextIcon} from '@radix-ui/react-icons';
import {ensembleThumbUrl} from './ensembleData';
import {ENSEMBLE_MODAL_TEXT, fillEnsembleText} from './ensembleModalText';

/** One frame every this many ms while animating — slow enough to see a single
 * merge-and-split land, fast enough that a hundred steps feel like a run. */
const FRAME_MS = 400;
/** How far around the selected step thumbnails are fetched. All hundred come to
 * roughly a megabyte, so they are pulled in a moving window instead: a few
 * behind for scrubbing back, more ahead because that is where both the slider
 * and the animation usually go. */
const PRELOAD_BEHIND = 3;
const PRELOAD_AHEAD = 8;

export interface SegmentThumbnailProps {
  moduleSlug: string;
  presetKey: string;
  stepCount: number;
  index: number;
  onIndexChange: (index: number) => void;
  /** The step's number within the chain, for its caption. */
  planNumber: number;
  animating: boolean;
  onAnimatingChange: (animating: boolean) => void;
}

/**
 * The selected step's districts, with the controls that move between steps.
 *
 * The thumbnails are plain SVG files on the CDN, fetched by the browser as
 * ordinary images: nothing here touches map geometry, and the animation timer
 * drives an `<img>` swap only.
 */
export const SegmentThumbnail: React.FC<SegmentThumbnailProps> = ({
  moduleSlug,
  presetKey,
  stepCount,
  index,
  onIndexChange,
  planNumber,
  animating,
  onAnimatingChange,
}) => {
  const requested = useRef(new Set<number>());
  // onIndexChange is read from a ref inside the timer so a caller that passes a
  // fresh closure every render doesn't restart the animation on every frame.
  const onIndexChangeRef = useRef(onIndexChange);
  onIndexChangeRef.current = onIndexChange;

  useEffect(() => {
    requested.current.clear();
  }, [moduleSlug, presetKey]);

  useEffect(() => {
    if (!stepCount) return;
    for (let offset = -PRELOAD_BEHIND; offset <= PRELOAD_AHEAD; offset++) {
      const target = (index + offset + stepCount) % stepCount;
      if (requested.current.has(target)) continue;
      requested.current.add(target);
      const image = new Image();
      image.src = ensembleThumbUrl(moduleSlug, presetKey, target);
    }
  }, [index, stepCount, moduleSlug, presetKey]);

  useEffect(() => {
    if (!animating || stepCount < 2) return;
    const timer = window.setInterval(() => {
      onIndexChangeRef.current((index + 1) % stepCount);
    }, FRAME_MS);
    return () => window.clearInterval(timer);
    // `index` is a dependency on purpose: each frame restarts the timer from the
    // step it just moved to, which keeps the interval honest when the slider is
    // dragged mid-animation.
  }, [animating, index, stepCount]);

  const caption = fillEnsembleText(ENSEMBLE_MODAL_TEXT.stepLabel, {
    step: planNumber.toLocaleString(),
  });

  return (
    <Flex direction="column" gap="2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ensembleThumbUrl(moduleSlug, presetKey, index)}
        alt={fillEnsembleText(ENSEMBLE_MODAL_TEXT.thumbnailAlt, {step: planNumber})}
        style={{
          width: '100%',
          aspectRatio: '4 / 3',
          objectFit: 'contain',
          background: 'var(--gray-2)',
          borderRadius: 'var(--radius-2)',
        }}
      />
      <Text size="2" weight="bold">
        {caption}
      </Text>
      <Slider
        value={[index]}
        min={0}
        max={Math.max(0, stepCount - 1)}
        step={1}
        size="1"
        aria-label="Step"
        onValueChange={value => {
          onAnimatingChange(false);
          onIndexChange(value[0]);
        }}
      />
      <Flex gap="2" wrap="wrap">
        <Button
          size="1"
          variant="soft"
          className="cursor-pointer"
          onClick={() => onAnimatingChange(!animating)}
        >
          {animating ? <PauseIcon /> : <PlayIcon />}
          {animating ? ENSEMBLE_MODAL_TEXT.pauseLabel : ENSEMBLE_MODAL_TEXT.animateLabel}
        </Button>
        <Button
          size="1"
          variant="soft"
          color="gray"
          className="cursor-pointer"
          onClick={() => {
            onAnimatingChange(false);
            onIndexChange((index + 1) % Math.max(1, stepCount));
          }}
        >
          <TrackNextIcon />
          {ENSEMBLE_MODAL_TEXT.stepForwardLabel}
        </Button>
      </Flex>
    </Flex>
  );
};
