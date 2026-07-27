'use client';
import {Box, Flex, Spinner, Text} from '@radix-ui/themes';
import {useEffect, useMemo, useRef, useState} from 'react';
import {useInView} from 'react-intersection-observer';

/** Pause on the final frame for this long before advancing/restarting. */
const LOOP_HOLD_MS = 500;

/** Plays one video on a hold-then-restart loop, or — given an array — cycles through
 * each clip in sequence (video 1 -> video 2 -> ... -> video 1 -> ...), one <video>
 * element for all of them rather than showing every clip at once. */
export const LoopVideoPlayer: React.FC<{videoUrl: string | string[]}> = ({videoUrl}) => {
  const urls = useMemo(() => (Array.isArray(videoUrl) ? videoUrl : [videoUrl]), [videoUrl]);
  const [index, setIndex] = useState(0);
  // Each `src` change (including cycling to the next clip) is a fresh load — shown
  // as a spinner over the video's own reserved footprint rather than a blank/frozen
  // frame, so the modal's size doesn't jump once the video becomes ready.
  const [isLoading, setIsLoading] = useState(true);
  // Without this, a clip that 404s or CORS-fails just spins forever — `loadeddata`
  // never fires, and nothing else says so.
  const [hasError, setHasError] = useState(false);
  // Fraction (0-1) through the current clip's own timeline. Resets to 0 every time
  // `currentTime` does (loop restart or advancing to the next clip), so the bar
  // visibly snaps back rather than crawling to 100% and stalling — a fast, frequent
  // reset reads as "this clip is short," addressing the same time-commitment
  // hesitation that a duration label would, without implying a fixed runtime that
  // doesn't really apply to a looping clip.
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const {ref, inView} = useInView({
    // Nearly fully visible, not just partially: on a scrolling page with several
    // clips stacked (e.g. /guide), a lower threshold left the previous clip still
    // playing — and its progress bar still resetting/animating — while the next
    // one scrolled into view, which read as visual noise competing with the one
    // actually being watched. Not a strict 1: that made a clip pause over a
    // sliver of clipped padding/border, which felt too twitchy.
    threshold: 0.9,
  });
  const inViewRef = useRef(inView);
  inViewRef.current = inView;
  // True only for the very first render, to skip the `[index]` effect's own play()
  // call then (the separate `[inView]` effect below owns that first play). Not the
  // same thing as "index === 0": a multi-clip sequence wraps back to index 0 after
  // its last clip, and that transition needs an explicit play() just like any other
  // — checking `index > 0` there instead would skip it on every wrap, leaving the
  // video loaded but paused after one full cycle.
  const isFirstRenderRef = useRef(true);

  // A different `videoUrl` prop (e.g. HelpTip switching tips) should restart the cycle.
  useEffect(() => {
    setIndex(0);
  }, [urls]);

  // Looping is manual (no `loop` attribute) so the last frame can hold briefly before
  // restarting — or, for a multi-clip cycle, before advancing to the next one.
  const handleEnded = () => {
    window.setTimeout(() => {
      if (!inViewRef.current) return;
      if (urls.length > 1) {
        setIndex(i => (i + 1) % urls.length);
        return;
      }
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
      }
    }, LOOP_HOLD_MS);
  };

  const play = () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      video.currentTime = 0;
      const playPromise = video.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          // Ignore the "interrupted by pause" error specifically
          if (error.name !== 'AbortError') {
            console.error('Error playing video:', error);
          }
        });
      }
    } catch (error) {
      console.error('Error playing video:', error);
    }
  };

  // Cycling to the next clip (or wrapping back to the first) changes `src`, which
  // the browser treats as a fresh load — needs an explicit play() once that's
  // ready, unlike the same-source restart above.
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    setProgress(0);
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
    } else if (inViewRef.current) {
      play();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    if (!videoRef.current) return;

    if (inView) {
      play();
    } else {
      try {
        const video = videoRef.current;
        // Only pause if the video is actually playing
        if (!video.paused) {
          video.pause();
        }
        video.currentTime = 0;
      } catch (error) {
        console.error('Error pausing video:', error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView]);

  return (
    <Box
      ref={ref}
      className="relative w-full h-auto max-w-[800px] mx-auto shadow-xl m-4 border-districtrIndigo border-2 rounded-lg overflow-hidden"
      // Reserves a 16:9 footprint while loading/errored — an absolutely-positioned
      // spinner (or error message) has nothing to size itself against otherwise,
      // since the video has no intrinsic height yet and Box's own height is
      // otherwise content-derived.
      style={isLoading || hasError ? {aspectRatio: '16 / 9'} : undefined}
    >
      {isLoading && !hasError && (
        <Flex align="center" justify="center" className="absolute inset-0 bg-gray-50">
          <Spinner size="3" />
        </Flex>
      )}
      {hasError && (
        <Flex align="center" justify="center" className="absolute inset-0 bg-gray-50 p-4">
          <Text size="2" color="gray" align="center">
            This video couldn&apos;t load. Try again later.
          </Text>
        </Flex>
      )}
      <video
        ref={videoRef}
        src={urls[index]}
        onEnded={handleEnded}
        // Both events clear loading, not just one: `loadeddata` (first frame
        // decoded) and `canplay` (enough buffered to start) don't reliably fire in
        // the same order or both fire at all across browsers/first-load timing —
        // relying on only one left the first open of a session occasionally stuck
        // spinning even though the video was actually ready.
        onLoadedData={() => setIsLoading(false)}
        onCanPlay={() => setIsLoading(false)}
        onTimeUpdate={event => {
          const video = event.currentTarget;
          if (video.duration) setProgress(video.currentTime / video.duration);
        }}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        muted
        playsInline
        preload="auto"
        className={isLoading || hasError ? 'invisible' : undefined}
      />
      {!isLoading && !hasError && (
        // No native `controls`: a scrubber would let users seek into the middle of
        // our own handleEnded/index-cycling logic, and this bar's fast, frequent
        // reset to 0 (every loop restart or clip change) is itself the point — it
        // visibly communicates "this clip is short" without a duration label that
        // doesn't really apply to something that loops.
        <div
          className="absolute bottom-0 left-0 h-1 bg-districtrIndigo"
          style={{width: `${progress * 100}%`}}
        />
      )}
    </Box>
  );
};
