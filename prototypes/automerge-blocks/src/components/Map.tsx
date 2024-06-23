import { useEffect, useRef } from "react";
import { AutomergeUrl } from "@automerge/automerge-repo";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { Plan } from "../App";

interface Point {
  x: number;
  y: number;
}

function boxAround(point: Point, radius: number) {
  const southwest = [point.x + radius, point.y + radius];
  const northeast = [point.x - radius, point.y - radius];
  return [northeast, southwest];
}

export default function Map({ docUrl }: { docUrl: AutomergeUrl }) {
  const [doc, changeDoc] = useDocument<Plan>(docUrl);
  const mapContainer = useRef(null);
  const map = useRef(null);

  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          wisconsin_blocks: {
            type: "vector",
            url: "pmtiles:///wisconsin_blocks_dontcoalesce.pmtiles",
            promoteId: "geoid",
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: {
              "background-color": "#efefef",
            },
          },
        ],
      },
      center: [-89.6787214, 44.3140374],
      zoom: 7,
      maxZoom: 20.9,
      minZoom: 7,
    });

    map.current.on("load", () => {
      const landmarkPaintProperty = {
        "fill-opacity": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          0.6,
          0,
        ],
        "fill-color": "#aaa",
      };

      map.current.addLayer({
        id: "blocks-hover",
        type: "fill",
        layout: {},
        source: "wisconsin_blocks",
        "source-layer": "tl_2023_55_tabblock20",
        paint: landmarkPaintProperty,
      });

      map.current.addLayer({
        id: "blocks-fill",
        type: "fill",
        source: "wisconsin_blocks",
        "source-layer": "tl_2023_55_tabblock20",
        paint: {
          "fill-color": [
            "match",
            ["feature-state", "color"],
            0,
            "#0099cd",
            1,
            "#ffca5d",
            2,
            "#00cd99",
            3,
            "#99cd00",
            4,
            "#cd0099",
            "#efefef",
          ],
        },
      });

      map.current.addLayer({
        id: "blocks",
        type: "line",
        source: "wisconsin_blocks",
        "source-layer": "tl_2023_55_tabblock20",
        paint: {
          "line-color": "#cccccc",
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            7,
            0.1,
            11,
            1,
            21,
            2,
          ],
        },
      });
    });

    // function onMouseMove(e, hover = true) {
    //   console.log(e.feature);
    //   const box = boxAround(e.point, 4);
    //   const features = map.current.queryRenderedFeatures(box, {
    //     layers: ["blocks-hover"],
    //   });
    //   if (features.length > 0) {
    //     features.forEach((feat) => {
    //       // console.log(feat.id, feat.state);
    //       map.current.setFeatureState(
    //         {
    //           source: "wisconsin_blocks",
    //           sourceLayer: "tl_2023_55_tabblock20",
    //           id: feat.id,
    //         },
    //         {
    //           ...feat.state,
    //           hover: hover,
    //         },
    //       );
    //     });
    //     // console.log(features.length);
    //     // console.log(features.map((f) => f.properties.geoid));
    //   }
    // }

    // map.current.on("mousemove", "blocks-hover", onMouseMove);
    // map.current.on("mouseleave", "blocks-hover", (e) => onMouseMove(e, false));

    map.current.addControl(new maplibregl.NavigationControl());

    // map.current.on("zoom", () => {
    //   console.log(map.current.getZoom());
    // });

    map.current.on("click", "blocks-fill", (e) => {
      const box = boxAround(e.point, 50);
      const features = map.current.queryRenderedFeatures(box, {
        layers: ["blocks-fill"],
      });

      const uniqueFeatures: Set<string> = new Set(
        features.map((f) => f.properties.geoid),
      );

      if (uniqueFeatures) {
        changeDoc((d) => {
          uniqueFeatures.forEach((key) => {
            const assignment = d.assignments[key];
            const newAssignment =
              assignment !== undefined ? d.assignments[key] + 1 : 0;
            d.assignments[key] = newAssignment;
          });
        });
      }
    });

    return () => {
      maplibregl.removeProtocol("pmtiles");
      map.current.remove();
    };
  }, []);

  useEffect(() => {
    console.log("doc was updated");
    if (doc && map) {
      Object.entries(doc.assignments).forEach(([key, value]) => {
        map.current.setFeatureState(
          {
            source: "wisconsin_blocks",
            sourceLayer: "tl_2023_55_tabblock20",
            id: key,
          },
          {
            color: value % 5,
          },
        );
      });
    }
  }, [doc, map]);

  return (
    <>
      <div ref={mapContainer}></div>
    </>
  );
}
