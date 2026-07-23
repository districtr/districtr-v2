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
  const videoRef = useRef<HTMLVideoElement>(null);
  const {ref, inView} = useInView({
    threshold: 0.2,
  });
  const inViewRef = useRef(inView);
  inViewRef.current = inView;

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

  // Cycling to the next clip changes `src`, which the browser treats as a fresh load —
  // needs an explicit play() once that's ready, unlike the same-source restart above.
  useEffect(() => {
    setIsLoading(true);
    setHasError(false);
    if (inViewRef.current && index > 0) play();
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
        onLoadedData={() => setIsLoading(false)}
        onError={() => {
          setIsLoading(false);
          setHasError(true);
        }}
        muted
        playsInline
        preload="true"
        className={isLoading || hasError ? 'invisible' : undefined}
      />
    </Box>
  );
};
