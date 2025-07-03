'use client';
import {Flex, Grid} from '@radix-ui/themes';
import React, {useEffect, useState} from 'react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Link from '@tiptap/extension-link';
import Image from 'next/image';
import {CreateButton} from '@/app/components/Static/Interactions/CreateButton';
import {getAvailableDistrictrMaps} from '@/app/utils/api/apiHandlers/getAvailableDistrictrMaps';
import {DistrictrMap} from '@/app/utils/api/apiHandlers/types';
import {FALLBACK_PLACE_IMAGES} from '@/app/constants/notifications';
import RichTextEditor from '../../RichTextEditor';
import RichTextRenderer from '@/app/components/RichTextRenderer/RichTextRenderer';

interface GroupNodeRendererProps {
  customContent?: object;
  groupSlugs?: string[];
}

// Extensions for rendering the rich text content
const extensions = [
  StarterKit,
  Underline,
  TextStyle,
  Color,
  Link.configure({
    HTMLAttributes: {
      class: 'text-blue-500 underline',
    },
  }),
];

const GroupNodeRenderer: React.FC<GroupNodeRendererProps> = ({customContent, groupSlugs = []}) => {
  const [groupMaps, setGroupMaps] = useState<DistrictrMap[]>([]);

  // In a real implementation, fetch the maps for each group
  useEffect(() => {
    const fetchGroupMaps = async () => {
      Promise.all(
        groupSlugs.map(slug =>
          getAvailableDistrictrMaps({
            group: slug,
          })
        )
      ).then(results => {
        setGroupMaps(results.flat());
      });
    };

    if (groupSlugs.length > 0) {
      fetchGroupMaps();
    }
  }, [groupSlugs]);

  return (
    <Flex
      direction="column"
      gapY="4"
      className="group-container my-4 p-4 bg-gray-50 rounded-md border border-gray-200"
    >
      {/* Render custom content if available */}
      {!!customContent && <RichTextRenderer content={customContent} />}
      {/* Render groups and their maps */}
      <Grid
        gap="2"
        columns={{
          initial: '1',
          md: '2',
          lg: '4',
        }}
      >
        {groupMaps.map((view, i) => (
          <Flex key={view.districtr_map_slug} className="items-center capitalize" direction="column" gapY="4" py="4">
            <object
              type="image/png"
              data={`https://tilesets1.cdn.districtr.org/thumbnails/${view.districtr_map_slug}.png`}
              width="150"
              height="150"
              aria-label="Preview with map outline"
              style={{borderRadius: 10}}
            >
              <Image src={FALLBACK_PLACE_IMAGES[i % 3]} alt="Fallback image" width="150" height="150" />
            </object>
            <CreateButton
              key={i}
              view={{
                ...view,
              }}
            />
          </Flex>
        ))}
      </Grid>
    </Flex>
  );
};

export default GroupNodeRenderer;
