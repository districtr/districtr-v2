'use client';
import React, {useMemo} from 'react';
import {colorScheme} from '@constants/colors';
import type {EnsembleGeometry} from './ensembleTypes';

export interface PlanThumbnailProps {
  geometry: EnsembleGeometry;
  /** The app's 1-based zone number of every unit, in the geometry's order. */
  assignment: number[];
  alt: string;
}

/**
 * A plan drawn in the browser: the package's unit outlines, each filled with
 * its zone's colour from the app's palette. The outlines are the same for
 * every plan of a module, so only the fills change between plans.
 *
 * Units are drawn without strokes and with crisp edges, so neighbouring units
 * of one district join into a flat shape rather than showing their seams.
 */
export const PlanThumbnail: React.FC<PlanThumbnailProps> = ({geometry, assignment, alt}) => {
  const paths = useMemo(
    () =>
      geometry.paths.map((d, index) => {
        if (!d) return null;
        const zone = assignment[index];
        const fill = zone ? colorScheme[(zone - 1) % colorScheme.length] : 'var(--gray-5)';
        return <path key={index} d={d} fill={fill} />;
      }),
    [geometry, assignment]
  );
  return (
    <svg
      viewBox={`0 0 ${geometry.width} ${geometry.height}`}
      role="img"
      aria-label={alt}
      shapeRendering="crispEdges"
      style={{
        width: '100%',
        aspectRatio: '4 / 3',
        background: 'var(--gray-2)',
        borderRadius: 'var(--radius-2)',
      }}
    >
      {paths}
    </svg>
  );
};
