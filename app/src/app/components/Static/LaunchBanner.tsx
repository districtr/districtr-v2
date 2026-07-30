'use client';
import React, {useEffect, useState} from 'react';
import {Callout, Flex, IconButton, Link} from '@radix-ui/themes';
import {Cross2Icon, RocketIcon} from '@radix-ui/react-icons';
import {LEGACY_DISTRICTR_URL} from '../../constants/legacy';

const DISMISS_KEY = 'districtr-banner-dismissed-v2.3.0';

export const LaunchBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!localStorage.getItem(DISMISS_KEY));
  }, []);

  if (!visible) return null;

  return (
    <Callout.Root color="blue" size="1" className="max-w-screen-lg mx-auto w-full my-2">
      <Flex align="center" gap="2" justify="between" width="100%">
        <Flex align="center" gap="2">
          <Callout.Icon>
            <RocketIcon />
          </Callout.Icon>
          <Callout.Text>
            Welcome to the new Districtr! See <Link href="/updates">what&apos;s new</Link>, or visit
            the original site at{' '}
            <Link href={LEGACY_DISTRICTR_URL} target="_blank">
              legacy.districtr.org
            </Link>
            .
          </Callout.Text>
        </Flex>
        <IconButton
          variant="ghost"
          color="gray"
          aria-label="Dismiss announcement"
          onClick={() => {
            localStorage.setItem(DISMISS_KEY, '1');
            setVisible(false);
          }}
        >
          <Cross2Icon />
        </IconButton>
      </Flex>
    </Callout.Root>
  );
};
