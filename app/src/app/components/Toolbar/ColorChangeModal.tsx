import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect, useMemo, useState} from 'react';
import {Cross2Icon} from '@radix-ui/react-icons';
import {Box, Flex, Dialog, Button, Select, Text, TextField} from '@radix-ui/themes';
import {colorScheme as DefaultColorScheme, DISTRICT_PALETTES} from '@constants/colors';
import {
  extendColorArray,
  getReadableTextColor,
  latexBaseAlternative,
  resolveColorInput,
} from '@/app/utils/colors';
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
  const [colorText, setColorText] = useState('');
  const [colorTextTouched, setColorTextTouched] = useState(false);
  const setNotification = useMapStore(store => store.setNotification);

  useEffect(() => {
    setInnerColorScheme(colorScheme);
  }, [colorScheme]);

  const selectedColor = innerColorScheme[colorSelectIndex] ?? '#000000';
  // The text field mirrors the selected district's color whenever something
  // other than typing changes it (district switch, swatch, palette, custom).
  // colorText is deliberately not a dependency: re-running on every keystroke
  // would overwrite what the user is typing.
  useEffect(() => {
    if (resolveColorInput(colorText)?.toLowerCase() === selectedColor.toLowerCase()) return;
    setColorText(selectedColor);
    setColorTextTouched(false);
  }, [selectedColor, colorSelectIndex]);
  const typedColor = resolveColorInput(colorText);
  const colorTextInvalid = colorTextTouched && !typedColor;
  const latexAlternative = typedColor ? latexBaseAlternative(colorText) : null;

  // Swatches keep a fixed order and show which district already uses them,
  // rather than reshuffling unused colors to the front after every pick.
  const usedBy = useMemo(() => {
    const map = new Map<string, number[]>();
    innerColorScheme.slice(0, numDistricts).forEach((color, i) => {
      const key = color.toLowerCase();
      map.set(key, [...(map.get(key) ?? []), i + 1]);
    });
    return map;
  }, [innerColorScheme, numDistricts]);

  const setDistrictColor = (hex: string) => {
    // Preserve the full scheme length — slicing to numDistricts here used to
    // truncate the saved color_scheme. Duplicates are allowed: with more
    // districts than palette colors they're unavoidable.
    const dupe = [...innerColorScheme];
    dupe[colorSelectIndex] = hex;
    setInnerColorScheme(dupe);
  };

  // Typed text applies on Enter or blur, not per keystroke, so `tangerine`
  // never applies `tan` on the way. The swatch previews it meanwhile.
  const commitColorText = () => {
    setColorTextTouched(true);
    if (typedColor && typedColor !== selectedColor.toLowerCase()) setDistrictColor(typedColor);
  };

  const handleApplyPalette = (name: string) => {
    const palette = DISTRICT_PALETTES.find(p => p.name === name);
    if (!palette) return;
    // A palette shorter than the scheme is extended with unused Districtr
    // colors rather than cycled, so no two districts end up sharing a color.
    setInnerColorScheme(
      extendColorArray([...palette.colors], Math.max(innerColorScheme.length, numDistricts))
    );
  };

  const handleSave = async () => {
    if (!mapDocument?.document_id) return;
    const _idbResult = await idb.updateColorScheme(mapDocument.document_id, innerColorScheme);
    mutateMapDocument({color_scheme: innerColorScheme});
    onClose?.();
  };

  const resetDraft = () => {
    setInnerColorScheme(colorScheme);
    setColorText(colorScheme[colorSelectIndex] ?? '');
    setColorTextTouched(false);
  };

  const handleCancel = () => {
    resetDraft();
    onClose?.();
  };

  useEffect(() => {
    setDialogOpen(open || false);
  }, [open]);

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={isOpen => {
        // X, Escape and overlay clicks discard the draft just like Cancel.
        if (!isOpen) resetDraft();
        isOpen ? setDialogOpen(isOpen) : onClose ? onClose() : setDialogOpen(isOpen);
      }}
    >
      <Dialog.Content className="max-w-[600px]">
        <Flex align="start">
          <Dialog.Title size="4" className="m-0 flex-1">
            Customize District Colors
          </Dialog.Title>

          <Dialog.Close
            className="rounded-full size-[24px] hover:bg-red-100 p-1"
            aria-label="Close"
          >
            <Cross2Icon />
          </Dialog.Close>
        </Flex>
        <Flex direction="column" gapY="4" mt="3">
          <Flex align="center" gapX="2">
            <Text size="2" weight="medium">
              All districts
            </Text>
            {/* Controlled to the placeholder: this is an action, so re-picking the
                same palette must fire again and no stale name should linger. */}
            <Select.Root value="" onValueChange={handleApplyPalette}>
              <Select.Trigger placeholder="Apply a palette" />
              <Select.Content>
                {DISTRICT_PALETTES.map(palette => (
                  <Select.Item key={palette.name} value={palette.name}>
                    <Flex align="center" gapX="2">
                      <Flex>
                        {palette.colors.slice(0, 12).map(color => (
                          <Box
                            key={color}
                            width="10px"
                            height="10px"
                            style={{backgroundColor: color}}
                          />
                        ))}
                      </Flex>
                      {palette.name}
                    </Flex>
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Flex>

          <Box>
            <Text as="p" size="2" weight="medium" mb="1">
              Pick a district
            </Text>
            {/* Keyed by index, not color like the toolbar picker, so districts
                that share a color stay individually selectable. */}
            <Flex wrap="wrap" gap="1" className="max-h-[25vh] overflow-y-auto p-1">
              {innerColorScheme.slice(0, numDistricts).map((color, i) => (
                <ColorSwatch
                  key={i}
                  color={color}
                  label={`District ${i + 1}`}
                  selected={i === colorSelectIndex}
                  onClick={() => setColorSelectIndex(i)}
                >
                  {i + 1}
                </ColorSwatch>
              ))}
            </Flex>
          </Box>

          <Flex direction="column" gapY="2" className="rounded-md border border-gray-200 p-3">
            <Flex align="center" gapX="2">
              <Box
                width="32px"
                height="32px"
                className="shrink-0 rounded-md border border-gray-300"
                style={{backgroundColor: typedColor ?? selectedColor}}
              />
              <Text size="2" weight="medium" className="shrink-0">
                District {colorSelectIndex + 1}
              </Text>
              <TextField.Root
                className="flex-1"
                value={colorText}
                onChange={event => {
                  setColorText(event.target.value);
                  setColorTextTouched(false);
                }}
                onBlur={commitColorText}
                onKeyDown={event => event.key === 'Enter' && commitColorText()}
                placeholder="rebeccapurple, BrickRed, #ff8800"
                aria-label={`Color for District ${colorSelectIndex + 1}`}
                aria-invalid={colorTextInvalid}
              />
              <label
                className="relative shrink-0 cursor-pointer rounded-md border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 focus-within:ring-2 focus-within:ring-gray-900"
                title="Pick any color"
              >
                Custom…
                <input
                  type="color"
                  className="sr-only"
                  value={selectedColor}
                  onChange={event => setDistrictColor(event.target.value)}
                />
              </label>
            </Flex>
            <Text size="1" color={colorTextInvalid ? 'red' : 'gray'}>
              {colorTextInvalid
                ? 'Not a usable color. Try a CSS or LaTeX color name, or a hex code (no transparency).'
                : latexAlternative
                  ? `LaTeX's base color by this name is different (${latexAlternative.hex}). Type ${latexAlternative.input} to use it.`
                  : 'Type a CSS or LaTeX color name or a hex code and press Enter, or pick a swatch.'}
            </Text>
            <Flex wrap="wrap" gap="1">
              {DefaultColorScheme.map(color => {
                const users = usedBy.get(color.toLowerCase());
                return (
                  <ColorSwatch
                    key={color}
                    color={color}
                    label={
                      users
                        ? `${color}, used by District${users.length > 1 ? 's' : ''} ${users.join(', ')}`
                        : color
                    }
                    selected={color.toLowerCase() === selectedColor.toLowerCase()}
                    onClick={() => setDistrictColor(color)}
                    round
                  >
                    {users?.[0]}
                  </ColorSwatch>
                );
              })}
            </Flex>
          </Flex>
        </Flex>
        <Flex justify="end" gapX="2" mt="4">
          <Button variant="soft" color="gray" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
};

const ColorSwatch: React.FC<{
  color: string;
  label: string;
  selected: boolean;
  onClick: () => void;
  /** Small circles for colors, so they don't read as more district buttons. */
  round?: boolean;
  children?: React.ReactNode;
}> = ({color, label, selected, onClick, round, children}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={selected}
    title={label}
    onClick={onClick}
    className={`inline-flex shrink-0 items-center justify-center border border-black/10 font-medium ${
      round ? 'size-7 rounded-full text-[10px]' : 'size-8 rounded-md text-xs'
    } ${selected ? 'ring-2 ring-offset-1 ring-gray-900' : 'hover:ring-2 hover:ring-gray-300'}`}
    style={{backgroundColor: color, color: getReadableTextColor(color) ?? '#111'}}
  >
    {/* text-box trims the span to the digits' cap height, so flex centering
        centers the ink, not an em box padded by descender space. It must sit
        on the span: it isn't inherited by the button's anonymous flex item. */}
    {children != null && <span className="[text-box:trim-both_cap_alphabetic]">{children}</span>}
  </button>
);
