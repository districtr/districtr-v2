import React from 'react';
import {Button, Checkbox, CheckboxGroup} from '@radix-ui/themes';
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
          {!!mapDocument &&
            colorArray.slice(0, mapDocument.num_districts ?? 4).map((color, i) => (
              <CheckboxGroupItem
                key={i}
                // @ts-ignore Correct behavior, global CSS variables need to be extended
                style={{'--accent-indicator': color}}
                value={color}
              >
                {/* <RadioGroupIndicator /> */}
              </CheckboxGroupItem>
            ))}
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
        {!!mapDocument &&
          colorArray.slice(0, mapDocument.num_districts ?? 4).map((color, i) => (
            <RadioGroupItem key={i} style={{backgroundColor: color}} value={color}>
              <RadioGroupIndicator />
            </RadioGroupItem>
          ))}
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
// const CheckBoxGroupIndicator = styled(Checkbox.., groupIndicatorCSS);

const groupRootCSS = {};
const RadioGroupRoot = styled(RadioGroup.Root, groupRootCSS);
const CheckboxGroupRoot = styled(CheckboxGroup.Root, {
  ...groupRootCSS,
  flexDirection: 'row',
  flexWrap: 'wrap',
  justifyContent: 'center',
});
