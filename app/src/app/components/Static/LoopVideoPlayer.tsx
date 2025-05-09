"use client"
import { Box } from "@radix-ui/themes";
import { useEffect, useRef } from "react";
import { useInView } from "react-intersection-observer";

export const LoopVideoPlayer: React.FC<{videoUrl: string}> = ({videoUrl}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { ref, inView } = useInView({
    threshold: 0.2,
  });

  useEffect(() => {
    if (!videoRef.current) return;
    
    if (inView) {
      videoRef.current.play();
    } else {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, [inView]);

  return (
    <Box ref={ref} className="w-full h-auto max-w-[800px] mx-auto shadow-xl m-4 border-districtrIndigo border-2 rounded-lg overflow-hidden">
      <video ref={videoRef} src={videoUrl} loop muted playsInline />
    </Box>
  );
};