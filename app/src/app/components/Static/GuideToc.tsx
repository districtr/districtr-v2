import {Box, Flex, Link, Text} from '@radix-ui/themes';
import React from 'react';
import {slugify} from '@/app/utils/slugify';

export interface GuideTocEntry {
  title: string;
  subsections?: string[];
}

/** Sticky in-page anchor nav for the guide's sections and subheadings. Ids are
 * derived from the same titles passed to `ContentSection` and each subheading,
 * via the shared `slugify`, so the links can't drift out of sync with the page. */
export const GuideToc: React.FC<{entries: GuideTocEntry[]}> = ({entries}) => {
  return (
    <Box asChild className="hidden lg:block w-48 shrink-0">
      <nav aria-label="Guide sections">
        <Box className="sticky top-28">
          <Flex direction="column" gapY="2">
            {entries.map(({title, subsections}) => (
              <Box key={title}>
                <Link
                  href={`#${slugify(title)}`}
                  size="2"
                  weight="bold"
                  color="gray"
                  className="!cursor-pointer hover:!text-districtrBlue"
                >
                  {title}
                </Link>
                {!!subsections?.length && (
                  <Flex direction="column" gapY="1" className="pl-3 mt-1">
                    {subsections.map(sub => (
                      <Link
                        key={sub}
                        href={`#${slugify(sub)}`}
                        size="1"
                        color="gray"
                        className="!cursor-pointer hover:!text-districtrBlue"
                      >
                        <Text as="p" className="truncate">
                          {sub}
                        </Text>
                      </Link>
                    ))}
                  </Flex>
                )}
              </Box>
            ))}
          </Flex>
        </Box>
      </nav>
    </Box>
  );
};
