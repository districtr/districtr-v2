import {ContentSection} from '@/app/components/Static/ContentSection';
import {getPublicPlans} from '@/app/utils/api/apiHandlers/getPublicPlans';
import {getCMSContent} from '@/app/utils/api/cms';
import {Box, Card, Flex, Grid, Heading, Link, Text} from '@radix-ui/themes';
import {cookies} from 'next/headers';

export const revalidate = 3600;

export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const [{slug}, userCookies] = await Promise.all([params, cookies()]);
  const language = userCookies.get('language')?.value ?? 'en';
  const [cmsData, publicPlans] = await Promise.all([
    getCMSContent(slug, language, 'places'),
    getPublicPlans(slug),
  ]).catch(() => [null, null]);

  return (
    <Flex direction="column" width="100%">
      <Heading as="h1" size="6" mb="4">
        Public Plans for {slug}
      </Heading>
      <ContentSection title="Open an existing plan">
        <Grid
          gap="2"
          columns={{
            initial: '1',
            md: '2',
            lg: '4',
          }}
        >
          {publicPlans!.map(plan => (
            <Card key={plan.document_id}>
              <Heading>
                <Link href={`/map?document_id=${plan.document_id}`}>
                  {plan.map_metadata?.name ?? plan.document_id}
                </Link>
              </Heading>
              <Text>
                Created {plan.created_at}, updated {plan.updated_at}
              </Text>
            </Card>
          ))}
        </Grid>
      </ContentSection>
    </Flex>
  );
}
