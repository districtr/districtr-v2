'use client';
import React from 'react';
import {Flex, Heading, Spinner, Text} from '@radix-ui/themes';
import {BarChartIcon, CheckIcon} from '@radix-ui/react-icons';

/** Fake "speed bump" steps shown while transitioning into the evaluation view. */
export const EVAL_TRANSITION_STEPS = ['Loading data', 'Cutting edges', 'Finalizing metrics'];

/** Per-step dwell time; total transition ≈ steps × this (~3s for 3 steps). */
export const EVAL_STEP_DURATION_MS = 1000;

/**
 * Full-screen overlay that walks through a few evaluation "preparation" steps
 * before the evaluation page loads. Purely a perceived-progress speed bump.
 */
export const EvalTransitionOverlay: React.FC<{activeStep: number; steps?: string[]}> = ({
  activeStep,
  steps = EVAL_TRANSITION_STEPS,
}) => {
  const progress = Math.min(100, ((activeStep + 1) / steps.length) * 100);
  return (
    <div
      className="fixed inset-0 z-[100000] flex items-center justify-center bg-white/90 backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <Flex
        direction="column"
        gap="4"
        className="w-[min(90vw,360px)] rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
      >
        <Flex align="center" gap="2">
          <BarChartIcon className="size-5 text-districtrBlue" />
          <Heading size="4">Preparing evaluation</Heading>
        </Flex>

        <Flex direction="column" gap="3">
          {steps.map((label, i) => {
            const done = i < activeStep;
            const active = i === activeStep;
            return (
              <Flex key={label} align="center" gap="3">
                <Flex align="center" justify="center" className="size-5 shrink-0">
                  {done ? (
                    <CheckIcon className="size-5 text-green-600" />
                  ) : active ? (
                    <Spinner size="2" />
                  ) : (
                    <span className="size-2 rounded-full bg-gray-300" />
                  )}
                </Flex>
                <Text
                  size="2"
                  color={active || done ? undefined : 'gray'}
                  weight={active ? 'medium' : 'regular'}
                >
                  {label}
                </Text>
              </Flex>
            );
          })}
        </Flex>

        <div className="h-1 w-full overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full bg-districtrBlue transition-all duration-500 ease-out"
            style={{width: `${progress}%`}}
          />
        </div>
      </Flex>
    </div>
  );
};
