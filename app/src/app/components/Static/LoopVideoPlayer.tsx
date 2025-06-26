'use client';
import {Box} from '@radix-ui/themes';
import {useEffect, useRef} from 'react';
import {useInView} from 'react-intersection-observer';

export const LoopVideoPlayer: React.FC<{videoUrl: string}> = ({videoUrl}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const {ref, inView} = useInView({
    threshold: 0.2,
  });

  useEffect(() => {
    if (!videoRef.current) return;

    if (inView) {
      try {
        videoRef.current.currentTime = 0;
        // Use play() as a Promise to handle potential interruptions
        const playPromise = videoRef.current.play();

        // If the browser supports Promises for play()
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
    } else {
      try {
        // Only pause if the video is actually playing
        if (!videoRef.current.paused) {
          videoRef.current.pause();
        }
        videoRef.current.currentTime = 0;
      } catch (error) {
        console.error('Error pausing video:', error);
      }
    }
  }, [inView]);

  return (
    <Box
      ref={ref}
      className="w-full h-auto max-w-[800px] mx-auto shadow-xl m-4 border-districtrIndigo border-2 rounded-lg overflow-hidden"
    >
      <video ref={videoRef} src={videoUrl} loop muted playsInline preload="true" />
    </Box>
  );
};
