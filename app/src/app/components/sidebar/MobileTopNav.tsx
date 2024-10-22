import { Box, Button, Flex, Heading } from "@radix-ui/themes";
import React, { useRef, useState } from "react";
import { Cross2Icon, GearIcon } from "@radix-ui/react-icons";
import DataPanels from "./DataPanels";

const MobileTopNav = () => {
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const handleToggleDataPanel = () => setDataPanelOpen((prev) => !prev);

  const boxRef = useRef<HTMLDivElement>(null);
  const topBarHeight =
    boxRef.current?.getClientRects()?.[0]?.height || 44.90625;
  const isLandscape = typeof window !== 'undefined' && window.matchMedia("(orientation: landscape)").matches;

  return (
    <Box
      className="w-full bg-white z-10 shadow-md flex-none relative landscape:w-0"
      ref={boxRef}
      display={{
        initial: "block",
        md: "none",
      }}
    >
      <Flex direction="row" gap="1" align="center" justify={"between"} pr="3">
        <Heading
          as="h3"
          size="3"
          className="border-r-2 p-3 flex-none landscape:hidden"
        >
          Districtr
        </Heading>
        <Flex
          align="center"
          className="landscape:z-50 landscape:bg-white landscape:absolute landscape:top-1 landscape:left-1 landscape:w-auto"
        >
          <Button
            onClick={handleToggleDataPanel}
            variant="outline"
            color={dataPanelOpen ? "indigo" : "gray"}
            className="landscape:bg-white"
            style={{
              background: "white",
            }}
          >
            <GearIcon fill={dataPanelOpen ? "indigo" : "gray"} />
            Reports & Settings
          </Button>
          <Flex
            className={`flex-none overflow-hidden transition-all duration-300 ease-in-out ${
              dataPanelOpen ? "w-4 ml-2" : "w-0 ml-0"
            }
            p-0 m-0
            
          `}
          >
            <Button onClick={handleToggleDataPanel} variant="ghost" color="red">
              <Cross2Icon />
            </Button>
          </Flex>
        </Flex>
      </Flex>
      {dataPanelOpen && (
        <Box
          className={`absolute p-4 z-20 bg-white border-t-2 w-full top-[100%] overflow-y-auto landscape:w-[100vw] landscape:top-0 landscape:pt-12 landscape:h-[100vh]`}
          style={{
            height: isLandscape ? undefined : `calc(100vh - ${topBarHeight}px)`,
          }}
        >
          <DataPanels />
        </Box>
      )}
    </Box>
  );
};

export default MobileTopNav;
