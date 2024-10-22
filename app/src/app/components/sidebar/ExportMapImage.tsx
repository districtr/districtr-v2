import { Button } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";

export function ExportMapImage() {
  const mapRef = useMapStore((state) => state.getMapRef());

  const handleClickExportMapImage = () => {
    // set timeout of two seconds to allow the map to render
    setTimeout(() => {
      if (mapRef) {
        console.log("there is a map");
        mapRef.once("render", () => {
          console.log("it is rendered");
          const canvas = document.querySelector("canvas");
          if (canvas) {
            const imgData = mapRef._canvas.toDataURL();
            console.log(mapRef._canvas);
            console.log(imgData);
            const a = document.createElement("a");
            a.href = imgData;
            a.download = `mapa.png`;
            a.click();
          }
        });
      }
    }, 1000);
  };

  //     if (mapRef) {
  //       console.log("there is a map");
  //       mapRef.once("render", () => {
  //         const canvas = document.querySelector("canvas");
  //         if (canvas) {
  //           const strDownloadMime = "image/octet-stream";
  //           const imgData = mapRef._canvas.toDataURL();
  //           console.log(mapRef._canvas);
  //           console.log(imgData);
  //           const a = document.createElement("a");
  //           a.href = imgData;
  //           a.download = `mapa.png`;
  //           a.click();
  //         }
  //       });
  //     }
  //   };

  return (
    <Button onClick={handleClickExportMapImage} variant={"outline"}>
      Save Map Image
    </Button>
  );
}
