import {Flex, Heading, Text} from '@radix-ui/themes';
import abbreviations from './abbreviations.json';
import React from 'react';
import { CreateButton } from '@/app/components/Static/Interactions/CreateButton';

const PlacePage = async ({params}: {params: Promise<{place: string}>}) => {
  const {place} = await params;
  const placeTitleCase = place
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  const name = place in abbreviations ? abbreviations[place as keyof typeof abbreviations] : place;
  const views = await fetch(`${process.env.NEXT_SERVER_API_URL}/api/gerrydb/views`).then(r =>
    r.json()
  );
  const filteredViews = views.filter((view: any) =>
    view.gerrydb_table_name.toLowerCase().includes(name.toLocaleLowerCase())
  );

  return (
    <Flex direction={'column'} className="max-w-screen-xl mx-auto p-4">
      <Heading>{placeTitleCase}</Heading>
      <Text>Blank Map</Text>
      {filteredViews.map((view, i) => (
        <CreateButton view={view} />
      ))}
    </Flex>
  );
};
export default PlacePage;
