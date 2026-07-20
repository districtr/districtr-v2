import {Flex, Link, Text} from '@radix-ui/themes';
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
    <nav aria-label="Guide sections" className="hidden lg:block w-56 shrink-0 sticky top-28 h-fit">
      <Flex direction="column" gapY="3">
        {entries.map(({title, subsections}) => (
          <Flex direction="column" gapY="1" key={title}>
            <Link
              href={`#${slugify(title)}`}
              size="3"
              weight="bold"
              color="gray"
              className="!cursor-pointer hover:!text-districtrBlue"
            >
              {title}
            </Link>
            {!!subsections?.length && (
              <Flex direction="column" gapY="1" className="pl-3">
                {subsections.map(sub => (
                  <Link
                    href={`#${slugify(sub)}`}
                    size="2"
                    color="gray"
                    className="!cursor-pointer hover:!text-districtrBlue"
                    key={sub}
                  >
                    <Text as="p" className="truncate">
                      {sub}
                    </Text>
                  </Link>
                ))}
              </Flex>
            )}
          </Flex>
        ))}
      </Flex>
    </nav>
  );
};
