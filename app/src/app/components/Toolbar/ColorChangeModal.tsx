import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect, useMemo, useState} from 'react';
import {TwitterPicker, type ColorResult} from 'react-color';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Box, Flex, Dialog, Heading, Button} from '@radix-ui/themes';
import {ColorPicker} from './ColorPicker';
import {colorScheme as DefaultColorScheme} from '@constants/colors';
import {idb} from '@/app/utils/idb/idb';
import {useColorScheme} from '@/app/hooks/useColorScheme';

export const ColorChangeModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const colorScheme = useColorScheme();
  const mutateMapDocument = useMapStore(store => store.mutateMapDocument);
  const mapDocument = useMapStore(store => store.mapDocument);
  const numDistricts = mapDocument?.num_districts ?? 4;
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const [colorSelectIndex, setColorSelectIndex] = useState(0);
  const [innerColorScheme, setInnerColorScheme] = useState(colorScheme);
  const setNotification = useMapStore(store => store.setNotification);

  useEffect(() => {
    setInnerColorScheme(colorScheme);
  }, [colorScheme]);

  // Prefer unused colors first, but always offer the full palette — with many
  // districts every color may be in use, and an empty picker is a dead end.
  const swatchColors = useMemo(() => {
    const used = new Set(innerColorScheme.slice(0, numDistricts));
    const unused = DefaultColorScheme.filter(color => !used.has(color));
    return [...unused, ...DefaultColorScheme.filter(color => used.has(color))];
  }, [innerColorScheme, numDistricts]);

  const handleColorPick = (idx: number, color: ColorResult) => {
    // Preserve the full scheme length — slicing to numDistricts here used to
    // truncate the saved color_scheme. Duplicates are allowed: with more
    // districts than palette colors they're unavoidable.
    const dupe = [...innerColorScheme];
    dupe[colorSelectIndex] = color.hex;
    setInnerColorScheme(dupe);
  };

  const handleSave = async () => {
    if (!mapDocument?.document_id) return;
    const _idbResult = await idb.updateColorScheme(mapDocument.document_id, innerColorScheme);
    mutateMapDocument({color_scheme: innerColorScheme});
    onClose?.();
  };

  const handleCancel = () => {
    setInnerColorScheme(colorScheme);
    onClose?.();
  };

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={isOpen =>
        isOpen ? setDialogOpen(isOpen) : onClose ? onClose() : setDialogOpen(isOpen)
      }
    >
      <Dialog.Content className="max-w-[600px] max-h-[80vw]">
        <Flex align="start">
          <Dialog.Title className="m-0 flex-1">
            <Heading size="4">Customize District Colors</Heading>
          </Dialog.Title>

          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Box className="max-h-[40vh] overflow-y-auto">
          <Heading size="2" className="mb-1">
            Select a district to change its color
          </Heading>
          <ColorPicker
            defaultValue={0}
            value={colorSelectIndex}
            onValueChange={(value: number) => {
              setColorSelectIndex(value);
            }}
            _colorScheme={innerColorScheme}
          />
          {colorSelectIndex !== undefined && (
            <Flex direction="column" gapY="2" mt="4">
              <hr />
              <Heading size="2">
                Choose a color for <u>District {colorSelectIndex + 1}</u>
              </Heading>
              <TwitterPicker
                color={innerColorScheme[colorSelectIndex]}
                colors={swatchColors}
                onChangeComplete={color => handleColorPick(colorSelectIndex, color)}
                triangle="hide"
                className="!shadow-none !w-full"
              />
            </Flex>
          )}
        </Box>
        {/* save button */}
        <Flex justify="end" gapX="2">
          <Button onClick={handleSave}>Save</Button>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};
