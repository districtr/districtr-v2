import React from 'react';

/** Focus mark: corner brackets around a ring, sized and colored like a Radix
 * icon (15px, currentColor). `filled` fills the ring's center for a focused
 * district. Artwork: "Focus" by Noun Project (noun_focus_3549272). */
export const FocusIcon: React.FC<{filled?: boolean}> = ({filled}) => (
  <svg width="15" height="15" viewBox="200 200 800 800" fill="currentColor" aria-hidden>
    {filled ? (
      <circle cx="600" cy="600" r="156" />
    ) : (
      <path d="m600 444a156 156 0 1 0 0 312a156 156 0 1 0 0-312zm0 72a84 84 0 1 1 0 168a84 84 0 1 1 0-168z" />
    )}
    <path d="m936 348c0-22.277-8.8516-43.645-24.602-59.398-15.754-15.75-37.121-24.602-59.398-24.602h-120v72h120c3.1836 0 6.2344 1.2656 8.4844 3.5156s3.5156 5.3008 3.5156 8.4844v120h72z" />
    <path d="m864 852c0 3.1836-1.2656 6.2344-3.5156 8.4844s-5.3008 3.5156-8.4844 3.5156h-120v72h120c22.277 0 43.645-8.8516 59.398-24.602 15.75-15.754 24.602-37.121 24.602-59.398v-120h-72z" />
    <path d="m264 852c0 22.277 8.8516 43.645 24.602 59.398 15.754 15.75 37.121 24.602 59.398 24.602h120v-72h-120c-6.6289 0-12-5.3711-12-12v-120h-72z" />
    <path d="m264 348v120h72v-120c0-6.6289 5.3711-12 12-12h120v-72h-120c-22.277 0-43.645 8.8516-59.398 24.602-15.75 15.754-24.602 37.121-24.602 59.398z" />
  </svg>
);
