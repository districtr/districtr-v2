import React from 'react';
import {tooltipContent} from './content';
import {IconButton, Tooltip} from '@radix-ui/themes';
import {InfoCircledIcon} from '@radix-ui/react-icons';
type TipKey = keyof typeof tooltipContent;

export const InfoTip: React.FC<{tips: TipKey | TipKey[]}> = ({tips}) => {
  const content = Array.isArray(tips)
    ? tips.map(t => tooltipContent[t]).join('/n')
    : tooltipContent[tips];
  return (
    <Tooltip content={content}>
      <IconButton variant="ghost" size="1" color="gray" mx="1">
        <InfoCircledIcon />
      </IconButton>
    </Tooltip>
  );
};
