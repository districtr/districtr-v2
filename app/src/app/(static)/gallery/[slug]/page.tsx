import parse from 'html-react-parser';
import {notFound} from 'next/navigation';
import {Box, Flex, Heading, Text} from '@radix-ui/themes';
import {PlanGallery} from '@/app/components/Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import {getGallery} from '@/app/utils/api/cmsContent';
import {getServerSession} from '@/app/lib/auth';

// Gallery pages are dynamic (no ISR): group_only galleries are token-gated, so
// each request reads the session and fetches with the viewer's credentials.

/**
 * Public curated plan gallery (CMS `galleries` app). The CMS serves the
 * curated plan ids + captions; PlanGallery fetches the plan data itself from
 * the FastAPI backend client-side.
 */
export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  const session = await getServerSession();
  const gallery = await getGallery(slug, session?.tokenSet?.accessToken);

  if (!gallery) {
    notFound();
  }

  return (
    <Flex direction="column" width="100%">
      <Heading as="h1" size="6" mb="4">
        {gallery.title}
      </Heading>
      {!!gallery.description && (
        <Box className="prose prose-sm max-w-none my-4">{parse(gallery.description)}</Box>
      )}
      {gallery.entries.length === 0 ? (
        <Text size="3" color="gray" my="4">
          This gallery doesn&apos;t have any plans yet.
        </Text>
      ) : (
        <PlanGallery
          ids={gallery.entries.map(entry => entry.document_public_id)}
          title=""
          description=""
          paginate
          showThumbnails
          showTitles
        />
      )}
    </Flex>
  );
}
