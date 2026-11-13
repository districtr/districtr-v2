'use client';
import {useEffect, useState} from 'react';
import {Flex, Spinner} from '@radix-ui/themes';
import {PublicMap} from '@components/Map/PublicMap';
import {useMapStore} from '@store/mapStore';

/** District labels are drawn smaller in the figure than on the interactive map. */
const ZONE_LABEL_SCALE = 0.7;

/**
 * Figure 1 of the report: the plan map as a still image. A live map draws the
 * plan unseen, and each time it settles a still of it is taken; the still is
 * what the reader sees and what prints. No still is taken before the districts
 * have reached the map, so the figure goes from a spinner to the finished map.
 */
export const ReportMapFigure: React.FC = () => {
  const getMapRef = useMapStore(state => state.getMapRef);
  const districtsLoaded = useMapStore(state => state.loadingStates.publicSourceLoaded);
  const [still, setStill] = useState<string | null>(null);

  useEffect(() => {
    const map = getMapRef();
    if (!map || !districtsLoaded) return;
    // A WebGL canvas can only be read right after a frame is drawn, so each time
    // the map goes idle one more frame is drawn and read in the same step. That
    // frame fires an idle event of its own from inside `redraw`; `capturing` is
    // set only for the length of that call, so it ignores no other idle event.
    let capturing = false;
    const onIdle = () => {
      // The document must not change while it prints: WebKit saves empty pages
      // when it does.
      if (capturing || window.matchMedia('print').matches) return;
      capturing = true;
      try {
        map.redraw();
        setStill(map.getCanvas().toDataURL('image/png'));
      } finally {
        capturing = false;
      }
    };
    map.on('idle', onIdle);
    if (map.loaded()) onIdle();
    return () => {
      map.off('idle', onIdle);
    };
  }, [getMapRef, districtsLoaded]);

  return (
    <figure className="eval-report-figure">
      <div className="eval-report-map">
        <div className="eval-report-map-live" aria-hidden="true">
          <PublicMap zoneLabelScale={ZONE_LABEL_SCALE} />
        </div>
        {still ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={still} alt="Map of the plan's districts" className="eval-report-map-still" />
        ) : (
          <Flex
            align="center"
            justify="center"
            className="absolute inset-0"
            role="status"
            aria-label="Loading the map"
          >
            <Spinner size="3" />
          </Flex>
        )}
      </div>
      <figcaption>The plan&apos;s districts.</figcaption>
    </figure>
  );
};
