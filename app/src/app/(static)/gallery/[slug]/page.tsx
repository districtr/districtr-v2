import parse from 'html-react-parser';
import {notFound} from 'next/navigation';
import {Box, Flex, Heading} from '@radix-ui/themes';
import {PlanGallery} from '@/app/components/Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import {getGallery} from '@/app/utils/api/cmsContent';

export const revalidate = 3600;

/**
 * Public curated plan gallery (CMS `galleries` app). The CMS serves the
 * curated plan ids + captions; PlanGallery fetches the plan data itself from
 * the FastAPI backend client-side.
 */
export default async function Page({params}: {params: Promise<{slug: string}>}) {
  const {slug} = await params;
  const gallery = await getGallery(slug);

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
      <PlanGallery
        ids={gallery.entries.map(entry => entry.document_public_id)}
        title=""
        description=""
        paginate
        showThumbnails
        showTitles
      />
    </Flex>
  );
}
