'use client';
import {cmsSubPages} from '../config';
import {NavigationCard} from '../components/NavigationCard';
import {Heading, Text, Grid} from '@radix-ui/themes';

export default function CmsHome() {
  return (
    <div className="space-y-6">
      <div>
        <Heading as="h1" size="6">
          Content Management
        </Heading>
        <Text className="text-gray-600 mt-2">
          Create and manage content pages for Districtr
        </Text>
      </div>

      <Grid columns={{initial: '1', md: '2', lg: '3'}} gap="4">
        {cmsSubPages.map(page => (
          <NavigationCard
            key={page.href}
            route={page.href}
            text={page.title}
            description={page.description}
            cta={page.cta}
          />
        ))}
      </Grid>
    </div>
  );
}
