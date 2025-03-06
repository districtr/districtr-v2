import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect, useMemo, useState} from 'react';
import {TwitterPicker, type ColorResult} from 'react-color';
import {Cross2Icon} from '@radix-ui/react-icons';
import {
  Box,
  Flex,
  Dialog,
  RadioGroup,
} from '@radix-ui/themes';
import {styled} from '@stitches/react';

const DialogContentContainer = styled(Dialog.Content, {
  maxWidth: 'calc(100vw - 2rem)',
  maxHeight: 'calc(100vh-2rem)',
});

const groupItemCSS = {
  width: 40,
  height: 40,
  margin: 2.5,
  alignItems: 'center',
  border: '1px solid #ccc',
  borderRadius: '8px',
};
const RadioGroupItem = styled(RadioGroup.Item, groupItemCSS);
const RadioGroupRoot = styled(RadioGroup.Root, {});

export const ColorChangeModal: React.FC<{
  open?: boolean;
  onClose?: () => void;
  showTrigger?: boolean;
}> = ({open, onClose, showTrigger}) => {
  const colorScheme = useMapStore(store => store.colorScheme);
  const setColorScheme = useMapStore(store => store.setColorScheme);
  const mapDocument = useMapStore(store => store.mapDocument);
  const numDistricts = mapDocument?.num_districts ?? 4;
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const [colorSelectIndex, setColorSelectIndex] = useState(-1);

  const filteredColors = useMemo(() =>
    colorScheme.filter(color => !colorScheme.slice(0, numDistricts).includes(color)).slice(0, 17),
    [colorScheme, numDistricts]
  );

  const handleColorPick = (idx: number, color: ColorResult) => {
    if (colorScheme.slice(0, numDistricts).includes(color.hex)) {
      // reject repeating a district color
      return;
    }
    let dupe = [...colorScheme];
    dupe[colorSelectIndex] = color.hex;
    setColorScheme(dupe);
    setColorSelectIndex(-1);
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
      <DialogContentContainer className="max-w-[50vw]">
        <Flex align="center" className="mb-4">
          <Dialog.Title className="m-0 text-xl font-bold flex-1">Change District Colors</Dialog.Title>

          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Box className="max-h-[50vh] overflow-y-auto">
          <RadioGroupRoot onValueChange={(value: String) => {
            setColorSelectIndex(Number(value));
          }}>
            <Flex direction="row" wrap="wrap" style={{ paddingBottom: '15rem' }}>
              {!!mapDocument &&
                colorScheme.slice(0, numDistricts).map((color, i) => (
                  <Flex direction="column" key={i}>
                    <RadioGroupItem style={{backgroundColor: color}} value={String(i)}>
                    </RadioGroupItem>
                    <div style={{ display: i === colorSelectIndex ? 'block' : 'none', width: 0}}>
                      <TwitterPicker
                        color={color}
                        colors={filteredColors}
                        onChangeComplete={color => handleColorPick(i, color)}
                      />
                    </div>
                  </Flex>
                ))}
            </Flex>
          </RadioGroupRoot>
        </Box>
      </DialogContentContainer>
    </Dialog.Root>
  );
};
