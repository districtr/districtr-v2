import { Box, Button, Flex, Heading, RadioCards } from "@radix-ui/themes";
import React, { useRef, useState } from "react";
import { Cross2Icon, GearIcon } from "@radix-ui/react-icons";
import DataPanels from "./DataPanels";

const MobileTopNav = () => {
  const [dataPanelOpen, setDataPanelOpen] = useState(false);
  const handleToggleDataPanel = () => setDataPanelOpen((prev) => !prev);

  const boxRef = useRef<HTMLDivElement>(null);
  const topBarHeight =
    boxRef.current?.getClientRects()?.[0]?.height || 44.90625;

  return (
    <Box
      className="w-full z-10 shadow-md flex-none relative"
      ref={boxRef}
      display={{
        initial: "block",
        sm: "none",
      }}
    >
      <Flex direction="row" gap="1" align="center" justify={"between"} pr="3">
        <Heading as="h3" size="3" className="border-r-2 p-3 flex-none">
          Districtr
        </Heading>
        <Flex align="center">
          <Button
            onClick={handleToggleDataPanel}
            variant="outline"
            color={dataPanelOpen ? "indigo" : "gray"}
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
          width={"100%"}
          height={`calc(100vh - ${topBarHeight}px`}
          top={`100%`}
          position={"absolute"}
          p="3"
          className="z-20 bg-white border-t-2"
          overflowY={"auto"}
        >
          <DataPanels />
        </Box>
      )}
    </Box>
  );
};

export default MobileTopNav;
