'use client';
import {Box, Button, Flex, Text} from '@radix-ui/themes';
import {EyeNoneIcon} from '@radix-ui/react-icons';
import {useState} from 'react';

/**
 * Blur wrapper for submissions the moderation pass flagged (nsfw=true).
 * Nothing is withheld from the response — the reader just has to opt in.
 */
export const NsfwShield: React.FC<{nsfw: boolean; children: React.ReactNode}> = ({
  nsfw,
  children,
}) => {
  const [revealed, setRevealed] = useState(false);
  if (!nsfw || revealed) {
    return <>{children}</>;
  }
  return (
    <Box className="relative overflow-hidden h-full">
      <Box className="blur-md select-none pointer-events-none" aria-hidden>
        {children}
      </Box>
      <Flex
        className="absolute inset-0 bg-white/60"
        direction="column"
        align="center"
        justify="center"
        gap="2"
      >
        <EyeNoneIcon className="w-5 h-5 text-slate-500" />
        <Text size="1" color="gray" align="center" className="px-4">
          This submission may contain sensitive content.
        </Text>
        <Button size="1" variant="soft" color="gray" onClick={() => setRevealed(true)}>
          Show anyway
        </Button>
      </Flex>
    </Box>
  );
};
