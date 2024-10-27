import { useMapStore } from "@/app/store/mapStore";
import React from "react";
import { Cross2Icon } from "@radix-ui/react-icons";
import {
  Button,
  Flex,
  Text,
  Table,
  Dialog,
  Box,
  TextField,
  IconButton,
} from "@radix-ui/themes";

interface SaveMapImageModalProps {
  open: boolean;
  onClose: () => void;
}

export const SaveMapImageModal = ({
  open,
  onClose,
}: SaveMapImageModalProps) => {
  console.log(open);
  return (
    <Dialog.Root open={open}>
      <Dialog.Content className="max-w-[75vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">
            Save Map Image
          </Dialog.Title>
          <Flex align="center" gap="2">
            <Button>Save</Button>
          </Flex>
          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
            onClick={onClose}
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
