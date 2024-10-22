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
    }, 100);
  };

  return (
    <Button onClick={handleClickExportMapImage} variant={"outline"}>
      Save Map Image
    </Button>
  );
}
