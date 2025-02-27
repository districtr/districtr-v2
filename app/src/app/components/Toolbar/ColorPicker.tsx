import React, {useEffect, useRef} from 'react';
import {Button, CheckboxGroup, Flex, Text} from '@radix-ui/themes';
import {styled} from '@stitches/react';
import * as RadioGroup from '@radix-ui/react-radio-group';
import {blackA} from '@radix-ui/colors';
import {useMapStore} from '@/app/store/mapStore';

type ColorPickerProps<T extends boolean = false> = T extends true
  ? {
      defaultValue: number[];
      value?: number[];
      onValueChange: (indices: number[], color: string[]) => void;
      colorArray: string[];
      multiple: true;
    }
  : {
      defaultValue: number;
      value?: number;
      onValueChange: (i: number, color: string) => void;
      colorArray: string[];
      multiple?: false;
    };

export const ColorPicker = <T extends boolean>({
  defaultValue,
  value,
  onValueChange,
  colorArray,
  multiple,
}: ColorPickerProps<T>) => {
  const mapDocument = useMapStore(state => state.mapDocument);
  const hotkeyRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const numDistricts = mapDocument?.num_districts ?? 4;

  const handleKeyPressSubmit = () => {
    if (!hotkeyRef.current) return;
    const index = parseInt(hotkeyRef.current) - 1;
    const newValue = colorArray[index];
    hotkeyRef.current = null;
    if (multiple) {
      console.log('!!!', defaultValue, value, newValue);
    } else {
      onValueChange(index, newValue);
    }
  };
  useEffect(() => {
    // add a listener for option or alt key press and release
    const handleKeyPress = (event: KeyboardEvent) => {
      const activeElement = document.activeElement;
      // if active element is an input, don't do anything
      if (activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement)
        return;
      // if command/control held down, don't do anything
      if (event.metaKey || event.ctrlKey) return;
      // if key is digit, set selected zone to that digit
      if (!event.code.includes('Digit')) return;
      let value = event.key;
      if (numDistricts >= 10) {
        hotkeyRef.current = (hotkeyRef.current || '') + value;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        if (hotkeyRef?.current?.length === 2) {
          handleKeyPressSubmit();
        } else {
          timeoutRef.current = setTimeout(() => {
            handleKeyPressSubmit();
          }, 250);
        }
      } else {
        hotkeyRef.current = value;
        handleKeyPressSubmit();
      }
    };

    document.addEventListener('keydown', handleKeyPress);

    return () => {
      document.removeEventListener('keydown', handleKeyPress);
    };
  }, []);

  if (multiple) {
    return (
      <div>
        <CheckboxGroupRoot
          defaultValue={defaultValue.map(i => colorArray[i])}
          value={value?.map(i => colorArray[i]) || []}
          onValueChange={values => {
            const indices = values.map(f => colorArray.indexOf(f));
            onValueChange(indices, values);
          }}
          style={{
            justifyContent: 'flex-start',
          }}
        >
          <Flex direction="row" wrap="wrap">
            {!!mapDocument &&
              colorArray.slice(0, numDistricts).map((color, i) => (
                <Flex direction="column" align="center" key={i}>
                  <CheckboxGroupItem
                    key={i}
                    // @ts-ignore Correct behavior, global CSS variables need to be extended
                    style={{'--accent-indicator': color}}
                    value={color}
                  >
                    {/* <RadioGroupIndicator /> */}
                  </CheckboxGroupItem>
                  <Text size="1">{i + 1}</Text>
                </Flex>
              ))}
          </Flex>
        </CheckboxGroupRoot>
      </div>
    );
  }

  return (
    <div>
      <RadioGroupRoot
        onValueChange={value => {
          const index = colorArray.indexOf(value);
          if (index !== -1) onValueChange(index, value);
        }}
        value={value !== undefined ? colorArray[value] : undefined}
        defaultValue={colorArray[defaultValue]}
      >
        <Flex direction="row" wrap="wrap">
          {!!mapDocument &&
            colorArray.slice(0, numDistricts).map((color, i) => (
              <Flex direction="column" align="center" key={i}>
                <RadioGroupItem key={i} style={{backgroundColor: color}} value={color}>
                  <RadioGroupIndicator />
                </RadioGroupItem>
                <Text size="1">{i + 1}</Text>
              </Flex>
            ))}
        </Flex>
      </RadioGroupRoot>
    </div>
  );
};

const StyledColorPicker = styled(Button, {
  width: 25,
  height: 25,
  borderRadius: 10,
  margin: 5,
  '&:selected': {
    border: '2px solid',
  },
});

const groupItemCSS = {
  width: 20,
  height: 20,
  '&:hover': {backgroundColor: blackA.blackA4},
  '&:focus': {boxShadow: `0 0 0 2px black`},
  margin: 2.5,
  alignItems: 'center',
  border: '1px solid #ccc',
  borderRadius: '8px',
  cursor: 'pointer',
};
const RadioGroupItem = styled(RadioGroup.Item, groupItemCSS);
const CheckboxGroupItem = styled(CheckboxGroup.Item, {
  ...groupItemCSS,
  margin: 0.5,
  backgroundColor: 'var(--accent-indicator)',
  '& svg': {
    backgroundColor: 'var(--accent-indicator)',
  },
});

const groupIndicatorCSS = {
  // display: "flex",
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  position: 'relative',
  textAlign: '-webkit-center',
  '&::after': {
    content: '""',
    display: 'block',
    width: 7,
    height: 7,
    borderRadius: '50%',
    backgroundColor: '#fff',
  },
};
const RadioGroupIndicator = styled(RadioGroup.Indicator, groupIndicatorCSS);
const groupRootCSS = {};
const RadioGroupRoot = styled(RadioGroup.Root, groupRootCSS);
const CheckboxGroupRoot = styled(CheckboxGroup.Root, {
  ...groupRootCSS,
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'center',
});
