import { Button } from "@radix-ui/themes";
import { useMapStore } from "@/app/store/mapStore";
import { SaveMapImageModal } from "./SaveMapImageModal";
import React from "react";

export function ExportMapImage() {
  const mapRef = useMapStore((state) => state.getMapRef());
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const openModal = () => setDialogOpen(true);
  const closeModal = () => setDialogOpen(false);

  const handleClickExportMapImage = () => {
    // set timeout of two seconds to allow the map to render

    // show modal
    setDialogOpen(true);
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
            alert("Download started");
            a.click();
          }
        });
      }
    }, 100);
  };

  return (
    <div>
      <SaveMapImageModal open={dialogOpen} onClose={closeModal} />
      <Button
        variant="ghost"
        size="3"
        onClick={handleClickExportMapImage}
        style={{ margin: 0 }}
      >
        Export
      </Button>
    </div>
  );
}
