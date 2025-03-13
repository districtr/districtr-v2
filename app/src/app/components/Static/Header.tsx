import React from 'react';
import {Flex, Heading} from '@radix-ui/themes';

export const Header: React.FC = () => (
  <Flex direction="row" justify={"between"} className="p-4 bg-gray-50 sticky top-0 shadow-sm">
    <Heading size="4" className="site-title">
      <a href="/">Districtr</a>
    </Heading>
  </Flex>
);