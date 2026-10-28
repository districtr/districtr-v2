import {useMapStore} from '@/app/store/mapStore';
import React, {useEffect, useMemo, useState} from 'react';
import {Cross2Icon, ShuffleIcon} from '@radix-ui/react-icons';
import {Box, Flex, Dialog, Button, IconButton, Select, Text, TextField} from '@radix-ui/themes';
import {DISTRICT_PALETTES} from '@constants/colors';
import {
  extendColorArray,
  getReadableTextColor,
  latexBaseAlternative,
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
  const [dialogOpen, setDialogOpen] = React.useState(open || false);
  const [colorSelectIndex, setColorSelectIndex] = useState(0);
  const [innerColorScheme, setInnerColorScheme] = useState(colorScheme);
  const [colorText, setColorText] = useState('');
  const [colorTextTouched, setColorTextTouched] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
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

  // The palette the districts mostly come from, if any, offered in full.
  const currentPalette = useMemo(() => {
    let best: {palette: (typeof DISTRICT_PALETTES)[number]; hits: number} | undefined;
    for (const palette of DISTRICT_PALETTES) {
      const colors = new Set(palette.colors.map(color => color.toLowerCase()));
      const hits = innerColorScheme
        .slice(0, numDistricts)
        .filter(color => colors.has(color.toLowerCase())).length;
      if (hits * 2 >= Math.min(numDistricts, palette.colors.length) && hits > (best?.hits ?? 0)) {
        best = {palette, hits};
      }
    }
    return best?.palette;
  }, [innerColorScheme, numDistricts]);

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

  const setDistrictColor = (hex: string) => {
    if (otherOwner(hex)) return;
    // Preserve the full scheme length — slicing to numDistricts here used to
    // truncate the saved color_scheme.
    const dupe = [...innerColorScheme];
    dupe[colorSelectIndex] = hex;
    setInnerColorScheme(dupe);
  };

  // Typed text applies on Enter or blur, not per keystroke, so `tangerine`
  // never applies `tan` on the way. The preview box shows it meanwhile.
  const commitColorText = (text = colorText) => {
    setColorTextTouched(true);
    const hex = resolveColorInput(text);
    if (hex && hex !== selectedColor.toLowerCase()) setDistrictColor(hex);
  };

  const handleApplyPalette = (name: string) => {
    const palette = DISTRICT_PALETTES.find(p => p.name === name);
    if (!palette) return;
    // A palette shorter than the scheme is extended with new hues in its own
    // style rather than cycled, so no two districts end up sharing a color.
    const scheme = extendColorArray(
      [...palette.colors],
      Math.max(innerColorScheme.length, numDistricts)
    );
    setInnerColorScheme(scheme);
    shuffleSuggestions(scheme);
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
    if (open) shuffleSuggestions(colorScheme);
  }, [open]);

  const suggestionSwatch = (color: string, fill?: boolean) => {
    const owner = otherOwner(color);
    return (
      <ColorSwatch
        key={color}
        color={color}
        label={owner ? `${color}, used by District ${owner}` : color}
        selected={color.toLowerCase() === selectedColor.toLowerCase()}
        disabled={!!owner}
        onClick={() => setDistrictColor(color)}
        round
        fill={fill}
      />
    );
  };

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
                that share a color (saved before colors had to be unique) stay
                individually selectable. */}
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
                onBlur={() => commitColorText()}
                onKeyDown={event => event.key === 'Enter' && commitColorText()}
                placeholder="rebeccapurple, BrickRed, #ff8800"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-label={`Color for District ${colorSelectIndex + 1}`}
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
                    onChange={event => {
                      setColorText(event.target.value);
                      commitColorText(event.target.value);
                    }}
                  />
                </label>
              </Button>
            </Flex>
            <Text size="1" color={colorTextInvalid || typedOwner ? 'red' : 'gray'}>
              {colorTextInvalid
                ? 'Not a usable color. Try a CSS or LaTeX color name, or a hex code (no transparency).'
                : typedOwner
                  ? `District ${typedOwner} already uses this color. Pick another.`
                  : latexAlternative
                    ? `This is the CSS color. LaTeX's color by this name is different (${latexAlternative.hex}); type ${latexAlternative.input} to use it.`
                    : 'Type a CSS or LaTeX color name or a hex code and press Enter, or pick a suggestion.'}
            </Text>
            {currentPalette && freePaletteColors.length > 0 && (
              <>
                <Text size="1" weight="medium" mt="1">
                  {currentPalette.name}
                </Text>
                <Flex wrap="wrap" gap="1">
                  {freePaletteColors.map(color => suggestionSwatch(color))}
                </Flex>
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
            <div className="grid grid-cols-[repeat(16,minmax(0,1fr))] justify-items-center gap-1">
              {suggestions.map(color => suggestionSwatch(color, true))}
            </div>
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
  disabled?: boolean;
  onClick: () => void;
  /** Small circles for colors, so they don't read as more district buttons. */
  round?: boolean;
  /** Grow to the grid cell (up to size-7) instead of a fixed size. */
  fill?: boolean;
  children?: React.ReactNode;
}> = ({color, label, selected, disabled, onClick, round, fill, children}) => (
  <button
    type="button"
    aria-label={label}
    aria-pressed={selected}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`inline-flex shrink-0 items-center justify-center border border-black/10 font-medium ${
      fill
        ? 'aspect-square w-full max-w-7 rounded-full'
        : round
          ? 'size-6 rounded-full'
          : 'size-8 rounded-md text-xs'
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
