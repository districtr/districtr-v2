import React from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useMapStore } from "@/app/store/mapStore";
import { Button } from "@radix-ui/themes";
import { styled } from "@stitches/react";
import { ChevronRightIcon } from "@radix-ui/react-icons";

const ContextMenuButton = styled(Button, {
  backgroundColor: "white",
  color: "black",
  border: "1px solid black",
  borderRadius: "4px",
  padding: "4px 8px",
  cursor: "pointer",
  width: "100%",
  margin: "4px 0",
});

export const MapContextMenu: React.FC = () => {
  const contextMenu = useMapStore((state) => state.contextMenu);

  if (!contextMenu) return null;

  const handleShatter = () => {
    // TODO: shatter stuff
    contextMenu.close();
  };

  return (
    <ContextMenu.Root onOpenChange={contextMenu.close}>
      <ContextMenu.Trigger data-state="open" />
      <ContextMenu.Portal forceMount={true}>
        <ContextMenu.Content
          onEscapeKeyDown={contextMenu.close}
          onInteractOutside={contextMenu.close}
          onPointerDownOutside={contextMenu.close}
          className="bg-white shadow-md rounded-lg p-2 min-w-56"
          // This *could* be hanlded more elegantly, but doing it this way
          // isolates events in the context menu from the map pretty nicely
          // also, if in the future we need the context menu outside of the map,
          // this sets us up to do that
          style={{
            position: "fixed",
            top: contextMenu.y,
            left: contextMenu.x,
          }}
        >
          {contextMenu.data.id && (
            <ContextMenu.Item className="text-sm">
              <b>ID: {contextMenu.data.id}</b>
            </ContextMenu.Item>
          )}
          <ContextMenu.Separator />

          <ContextMenu.Item className="text-sm">
            <ContextMenuButton onClick={handleShatter}>
              Shatter
            </ContextMenuButton>
          </ContextMenu.Item>
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="group text-[13px] leading-none text-violet11 rounded-[3px] flex items-center h-[25px] px-[5px] relative select-none outline-none data-[state=open]:bg-violet4 data-[state=open]:text-violet11 data-[disabled]:text-mauve8 data-[disabled]:pointer-events-none data-[highlighted]:bg-violet9 data-[highlighted]:text-violet1 data-[highlighted]:data-[state=open]:bg-violet9 data-[highlighted]:data-[state=open]:text-violet1">
              Advanced Actions
              <div className="ml-auto pl-5 text-mauve11 group-data-[highlighted]:text-white group-data-[disabled]:text-mauve8">
                <ChevronRightIcon />
              </div>
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent
                className="min-w-[220px] bg-white rounded-md overflow-hidden p-[5px] shadow-[0px_10px_38px_-10px_rgba(22,_23,_24,_0.35),_0px_10px_20px_-15px_rgba(22,_23,_24,_0.2)]"
                sideOffset={2}
                alignOffset={-5}
              >
                <ContextMenu.Item className="text-[13px] leading-none text-violet11 rounded-[3px] flex items-center h-[25px] px-[5px] relative pl-[25px] select-none outline-none data-[disabled]:text-mauve8 data-[disabled]:pointer-events-none data-[highlighted]:bg-violet9 data-[highlighted]:text-violet1">
                  Something fancy
                </ContextMenu.Item>
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
};
