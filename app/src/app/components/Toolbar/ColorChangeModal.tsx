import {colorsInZoneOrder, districtHeading, fitsBadge, zoneLabel} from '@/app/utils/zoneLabels';
import {useZoneOrder} from '@/app/hooks/useZoneLabel';
import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect, useMemo, useState} from 'react';
import {Cross2Icon, ShuffleIcon} from '@radix-ui/react-icons';
import {ACCESS_STATES} from '@constants/document/state';
import {
  AlertDialog,
  Box,
  Flex,
  Dialog,
  Button,
  DropdownMenu,
  IconButton,
  Text,
  TextField,
} from '@radix-ui/themes';
import {DISTRICT_PALETTES} from '@constants/colors';
import {
  colorDistance,
  extendColorArray,
  getReadableTextColor,
  latexBaseAlternative,
  looksUnassigned,
  matchingPalette,
  NEAR_DUPLICATE_DISTANCE,
  randomColorsInRange,
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
  const zoneOrder = useZoneOrder();
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const aliases = mapDocument?.map_metadata?.zone_aliases;
  const heading = (zone: number) => districtHeading(zone, aliases);
  // Starts on the panel's first row, which is the first swatch.
  const [colorSelectIndex, setColorSelectIndex] = useState(() => (zoneOrder[0] ?? 1) - 1);
  const [innerColorScheme, setInnerColorScheme] = useState(colorScheme);
  const [colorText, setColorText] = useState('');
  const [colorTextTouched, setColorTextTouched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const setNotification = useMapStore(store => store.setNotification);

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
  // Which district (1-based) owns each color, so no two districts share one.
  const ownerOf = useMemo(() => {
    const map = new Map<string, number>();
    innerColorScheme.slice(0, numDistricts).forEach((color, i) => {
      const key = color.toLowerCase();
      if (!map.has(key)) map.set(key, i + 1);
    });
    return map;
  }, [innerColorScheme, numDistricts]);
  const otherOwner = (color: string) => {
    const owner = ownerOf.get(color.toLowerCase());
    return owner && owner !== colorSelectIndex + 1 ? owner : undefined;
  };
  // Another district whose color is nearly the same, which the user may still
  // choose (exact matches are otherOwner's).
  const nearOwner = (color: string) => {
    const index = innerColorScheme
      .slice(0, numDistricts)
      .findIndex(
        (other, i) =>
          i !== colorSelectIndex && colorDistance(color, other) < NEAR_DUPLICATE_DISTANCE
      );
    return index === -1 ? undefined : index + 1;
  };

  // The palette the districts mostly come from, if any, offered in full. Ties
  // go to the shorter palette, or Set3 and Paired would read as the default.
  const currentPalette = useMemo(
    () => matchingPalette(innerColorScheme.slice(0, numDistricts), 0.5),
    [innerColorScheme, numDistricts]
  );

  // Only palette colors no district uses yet; when none are left, the
  // similar tones row is the whole offer.
  const freePaletteColors =
    currentPalette?.colors.filter(color => !ownerOf.has(color.toLowerCase())) ?? [];

  // One row of random colors in the current districts' tone range. They are
  // drawn on open, on palette change and on shuffle, not on every pick, so the
  // options don't jump around while the user is choosing.
  const SUGGESTION_COUNT = 16;
  const shuffleSuggestions = (scheme: string[] = innerColorScheme) =>
    setSuggestions(randomColorsInRange(scheme.slice(0, numDistricts), SUGGESTION_COUNT));

  const typedColor = resolveColorInput(colorText);
  const colorTextInvalid = colorTextTouched && !typedColor;
  const typedOwner = typedColor ? otherOwner(typedColor) : undefined;
  const latexAlternative = typedColor ? latexBaseAlternative(colorText) : null;
  // Text in the field that isn't the selected district's color yet: typed and
  // not applied, or held back.
  const pendingText =
    colorText.trim() !== '' && typedColor?.toLowerCase() !== selectedColor.toLowerCase();
  // Colors that could be confused on the map wait for a "Use anyway" instead
  // of applying; only an unknown color or another district's exact color is
  // refused outright (the toolbar picker tells districts apart by color).
  const typedNearOwner =
    pendingText && typedColor && !typedOwner ? nearOwner(typedColor) : undefined;
  const typedUnassigned =
    pendingText && !!typedColor && !typedOwner && !typedNearOwner && looksUnassigned(typedColor);
  const typedWarning = !!typedNearOwner || typedUnassigned;
  const pendingRefused = pendingText && (!typedColor || !!typedOwner || typedWarning);
  const lowerScheme = (scheme: string[]) =>
    scheme
      .slice(0, numDistricts)
      .map(color => color.toLowerCase())
      .join();
  const dirty = pendingText || lowerScheme(innerColorScheme) !== lowerScheme(colorScheme);

  const setDistrictColor = (hex: string) => {
    if (otherOwner(hex)) return;
    // Preserve the full scheme length — slicing to numDistricts here used to
    // truncate the saved color_scheme.
    const dupe = [...innerColorScheme];
    dupe[colorSelectIndex] = hex;
    setInnerColorScheme(dupe);
  };

  // Typed text applies on Enter or blur, not per keystroke, so `tangerine`
  // never applies `tan` on the way. The preview box shows it meanwhile. A
  // color that could be confused on the map stays in the field with a note
  // and a "Use anyway" button.
  const commitColorText = (text = colorText) => {
    setColorTextTouched(true);
    const hex = resolveColorInput(text);
    if (!hex || hex === selectedColor.toLowerCase()) return;
    if (nearOwner(hex) || looksUnassigned(hex)) return;
    setDistrictColor(hex);
  };
  // Swatches go through the field too, so a held-back one shows its note.
  const pickColor = (hex: string) => {
    setColorText(hex);
    commitColorText(hex);
  };

  const handleApplyPalette = (palette: (typeof DISTRICT_PALETTES)[number]) => {
    // A palette shorter than the scheme is extended with new hues in its own
    // style rather than cycled, so no two districts end up sharing a color.
    // Colors follow the panel's row order, not district numbers, so a
    // reordered panel reads in palette order top to bottom.
    const scheme = colorsInZoneOrder(
      extendColorArray([...palette.colors], Math.max(innerColorScheme.length, numDistricts)),
      zoneOrder
    );
    setInnerColorScheme(scheme);
    shuffleSuggestions(scheme);
  };

  const closeDialog = () => {
    setConfirmDiscard(false);
    onClose ? onClose() : setDialogOpen(false);
  };

  const handleSave = async () => {
    if (!mapDocument?.document_id) return;
    // A refused entry stays in the field with its message; saving now would
    // drop it without a word.
    if (pendingRefused) {
      setColorTextTouched(true);
      return;
    }
    const _idbResult = await idb.updateColorScheme(mapDocument.document_id, innerColorScheme);
    mutateMapDocument({color_scheme: innerColorScheme});
    closeDialog();
  };

  // Cancel, X, Escape and overlay clicks all come here, and ask first when
  // there is something to lose.
  const requestClose = () => (dirty ? setConfirmDiscard(true) : closeDialog());

  // The draft loads once per opening. Keyed on `open`, not the scheme: an
  // autosave rebuilds color_scheme as a new array and would reset the draft.
  useEffect(() => {
    setDialogOpen(open || false);
    if (!open) return;
    setInnerColorScheme(colorScheme);
    setColorText(colorScheme[colorSelectIndex] ?? '');
    setColorTextTouched(false);
    setConfirmDiscard(false);
    shuffleSuggestions(colorScheme);
  }, [open]);

  const suggestionSwatch = (color: string) => {
    const owner = otherOwner(color);
    return (
      <ColorSwatch
        key={color}
        color={color}
        label={owner ? `${color}, used by ${heading(owner)}` : color}
        selected={color.toLowerCase() === selectedColor.toLowerCase()}
        disabled={!!owner}
        onClick={() => pickColor(color)}
        round
      />
    );
  };

  return (
    <Dialog.Root
      open={dialogOpen}
      onOpenChange={isOpen => (isOpen ? setDialogOpen(true) : requestClose())}
    >
      <Dialog.Content className="max-w-[600px]">
        <Flex align="start">
          <Dialog.Title size="4" className="m-0 flex-1">
            Customize district colors
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
            {/* A menu, not a Select: a Select's closed trigger applies the
                typeahead match at once, so typing "t" would recolor every
                district. Menu items apply only on click or Enter. */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <Button variant="surface" color="gray">
                  Apply a palette
                  <DropdownMenu.TriggerIcon />
                </Button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content>
                {DISTRICT_PALETTES.map(palette => (
                  <DropdownMenu.Item
                    key={palette.name}
                    className="cursor-pointer"
                    onSelect={() => handleApplyPalette(palette)}
                  >
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
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </Flex>

          <Box>
            <Text as="p" size="2" weight="medium" mb="1">
              Pick a district
            </Text>
            {/* Keyed by district, not color like the toolbar picker, so districts
                that share a color (saved before colors had to be unique) stay
                individually selectable. Panel order, like an applied palette. */}
            <Flex wrap="wrap" gap="1" className="max-h-[25vh] overflow-y-auto p-1">
              {zoneOrder.map(zone => (
                <ColorSwatch
                  key={zone}
                  color={innerColorScheme[zone - 1]}
                  label={heading(zone)}
                  selected={zone - 1 === colorSelectIndex}
                  onClick={() => setColorSelectIndex(zone - 1)}
                >
                  {/* Like the map badges: a label too long for the swatch is in
                      its title and the heading below. */}
                  {fitsBadge(zoneLabel(zone, aliases)) && zoneLabel(zone, aliases)}
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
                {heading(colorSelectIndex + 1)}
              </Text>
              <TextField.Root
                className="flex-1"
                value={colorText}
                onChange={event => {
                  setColorText(event.target.value);
                  setColorTextTouched(false);
                }}
                onBlur={() => commitColorText()}
                onKeyDown={event => event.key === 'Enter' && commitColorText()}
                placeholder="rebeccapurple, BrickRed, #ff8800"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label={`Color for ${heading(colorSelectIndex + 1)}`}
                aria-invalid={colorTextInvalid || !!typedOwner}
              />
              {/* Button size 2 matches the TextField's height. */}
              <Button
                asChild
                variant="surface"
                color="gray"
                className="relative shrink-0 cursor-pointer focus-within:ring-2 focus-within:ring-gray-900"
              >
                <label title="Pick any color">
                  Custom color
                  <input
                    type="color"
                    className="sr-only"
                    value={selectedColor}
                    onChange={event => pickColor(event.target.value)}
                  />
                </label>
              </Button>
            </Flex>
            <Flex align="center" gapX="2">
              <Text
                size="1"
                color={
                  colorTextInvalid || typedOwner
                    ? 'red'
                    : typedWarning && colorTextTouched
                      ? 'amber'
                      : 'gray'
                }
              >
                {colorTextInvalid
                  ? "We don't recognize that color. Try a CSS or LaTeX color name, or a hex code like #ff8800 (without transparency)."
                  : typedOwner
                    ? `${heading(typedOwner)} already has this color. Each district needs its own, so try a different shade.`
                    : typedNearOwner && colorTextTouched
                      ? `This looks a lot like ${heading(typedNearOwner)}'s color, so the two may be hard to tell apart on the map.`
                      : typedUnassigned && colorTextTouched
                        ? 'This is close to the gray of unassigned areas, so the district may be hard to spot on the map.'
                        : latexAlternative
                          ? `This is the CSS color. LaTeX's color by this name is different (${latexAlternative.hex}); type ${latexAlternative.input} to use it.`
                          : 'Type a CSS or LaTeX color name or a hex code and press Enter, or pick a suggestion.'}
              </Text>
              {typedWarning && colorTextTouched && typedColor && (
                <Button
                  size="1"
                  variant="soft"
                  color="gray"
                  className="shrink-0"
                  onClick={() => setDistrictColor(typedColor)}
                >
                  Use anyway
                </Button>
              )}
            </Flex>
            {currentPalette && freePaletteColors.length > 0 && (
              <>
                <Text size="1" weight="medium" mt="1">
                  {currentPalette.name}
                </Text>
                <div className={SWATCH_GRID}>
                  {freePaletteColors.map(color => suggestionSwatch(color))}
                </div>
              </>
            )}
            <Flex align="center" gapX="1" mt="1">
              <Text size="1" weight="medium">
                Similar tones
              </Text>
              <IconButton
                size="1"
                variant="ghost"
                color="gray"
                aria-label="Shuffle similar tones"
                title="Shuffle"
                onClick={() => shuffleSuggestions()}
              >
                <ShuffleIcon />
              </IconButton>
            </Flex>
            <div className={SWATCH_GRID}>{suggestions.map(color => suggestionSwatch(color))}</div>
          </Flex>
        </Flex>
        <Flex justify="end" gapX="2" mt="4">
          <Button variant="soft" color="gray" onClick={requestClose}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save</Button>
        </Flex>
        <AlertDialog.Root open={confirmDiscard} onOpenChange={setConfirmDiscard}>
          <AlertDialog.Content maxWidth="400px">
            <AlertDialog.Title>Discard color changes?</AlertDialog.Title>
            <AlertDialog.Description size="2">
              Your district color changes haven&apos;t been saved.
            </AlertDialog.Description>
            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Cancel>
                <Button variant="soft" color="gray">
                  Keep editing
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action>
                <Button variant="solid" color="red" onClick={closeDialog}>
                  Discard
                </Button>
              </AlertDialog.Action>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>
      </Dialog.Content>
    </Dialog.Root>
  );
};

/**
 * The display options' way into the dialog, showing the districts' current
 * colors. Callers own the dialog, outside any popover that would unmount it.
 */
export const DistrictColorsButton: React.FC<{onClick: () => void}> = ({onClick}) => {
  const colorScheme = useColorScheme();
  const zoneOrder = useZoneOrder();
  const disabled = useMapStore(store => store.mapStatus?.access) === ACCESS_STATES.READ;
  return (
    <Button onClick={onClick} variant="outline" size="1" mt="2" disabled={disabled}>
      <Flex aria-hidden className={`overflow-hidden rounded-sm ${disabled ? 'opacity-50' : ''}`}>
        {zoneOrder.slice(0, 12).map(zone => (
          <Box
            key={zone}
            width="10px"
            height="10px"
            style={{backgroundColor: colorScheme[zone - 1]}}
          />
        ))}
      </Flex>
      Customize colors
    </Button>
  );
};

// Palette colors and similar tones share one grid, so their circles match.
const SWATCH_GRID = 'grid grid-cols-[repeat(16,minmax(0,1fr))] justify-items-center gap-1';

const ColorSwatch: React.FC<{
  color: string;
  label: string;
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Circles that fill their SWATCH_GRID cell (up to size-7), so colors
   * don't read as more district buttons. */
  round?: boolean;
  children?: React.ReactNode;
}> = ({color, label, selected, disabled, onClick, round, children}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={selected}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex shrink-0 items-center justify-center border border-black/10 font-medium ${
      round ? 'aspect-square w-full max-w-7 rounded-full' : 'size-8 rounded-md text-xs'
    } ${
      selected
        ? 'ring-2 ring-offset-1 ring-gray-900'
        : disabled
          ? 'cursor-not-allowed'
          : 'hover:ring-2 hover:ring-gray-300'
    }`}
    style={{
      backgroundColor: color,
      color: getReadableTextColor(color) ?? '#111',
      // A slash marks colors another district already uses; fading them
      // instead makes them read as lighter tints on offer.
      backgroundImage: disabled
        ? 'linear-gradient(to top right, transparent calc(50% - 1px), rgb(0 0 0 / 0.6) calc(50% - 1px), rgb(0 0 0 / 0.6) calc(50% + 1px), transparent calc(50% + 1px))'
        : undefined,
    }}
  >
    {/* text-box trims the span to the digits' cap height, so flex centering
        centers the ink, not an em box padded by descender space. It must sit
        on the span: it isn't inherited by the button's anonymous flex item. */}
    {children != null && <span className="[text-box:trim-both_cap_alphabetic]">{children}</span>}
  </button>
);
