'use client';
import {CopyIcon, Cross1Icon, Cross2Icon} from '@radix-ui/react-icons';
import {Box, Button, Dialog, Flex, Heading, IconButton, Text, Tooltip} from '@radix-ui/themes';
import React, {useEffect, useState} from 'react';

export const FeedbackForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [formUrl, setFormUrl] = useState<string | undefined>(undefined);
  const [copyIndicator, setCopyIndicator] = useState(false);
  // To get ENV after build time, we need to have some realtime server endpoint with env
  // This allows us to modify this without having to rebuild the app
  useEffect(() => {
    fetch('/api/env')
      .then(res => (res.ok ? res.json() : Promise.reject(res)))
      .then(data => setFormUrl(data.formUrl))
      .catch();
  }, []);

  if (!formUrl || !URL.canParse(formUrl) || hidden) {
    return <div id="feedback-form-placeholder" className="hidden" />;
  }
  const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
  const copyUrlToClipboard = () => {
    navigator.clipboard.writeText(currentUrl);
    setCopyIndicator(true);
    setTimeout(() => setCopyIndicator(false), 4000);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger>
        <Box className="!fixed !bottom-0 !right-0 !z-[1000]">
          <Box
            className="size-full relatve p-4"
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
          >
            <Button className="opacity-90" id="feedback-button" color="grass">
              Feedback
            </Button>
            {hovering && (
              <IconButton
                className="!absolute !top-[-2px] !right-[2px] !rounded-full !p-1"
                variant="solid"
                color="gray"
                size="1"
                disabled={!hovering}
                onClick={() => {
                  setHidden(true);
                }}
              >
                <Cross2Icon fontSize="1" />
              </IconButton>
            )}
          </Box>
        </Box>
      </Dialog.Trigger>
      <Dialog.Content className="!max-w-[800px]">
        <Flex direction="column" gap="4" className="w-full h-auto max-h-[80vh] overflow-hidden">
          <Heading size="4">Help us improve Districtr v2</Heading>
          <Text>Found a bug or have a suggestion? Let us know!</Text>
          <Text>Please include your current URL in your feedback:</Text>
          <Flex direction="row" gap="2">
            <Text className="font-bold font-mono p-1 bg-gray-200 flex-1">{currentUrl}</Text>
            <Tooltip content={copyIndicator ? 'Copied to clipboard' : 'Copy URL'}>
              <IconButton
                size="2"
                onClick={copyUrlToClipboard}
                color={copyIndicator ? 'green' : 'blue'}
                className="!transition-colors !duration-500"
              >
                <CopyIcon />
              </IconButton>
            </Tooltip>
          </Flex>
          <Box className="w-full h-auto flex-1">
            <iframe src={formUrl} className="w-full h-[80vh]" />
          </Box>
        </Flex>
        <Dialog.Close>
          <IconButton className="!absolute !top-4 !right-4" variant="ghost">
            <Cross1Icon />
          </IconButton>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Root>
  );
};
