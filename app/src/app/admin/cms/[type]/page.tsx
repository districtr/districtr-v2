import {CmsContentTypes} from '@/app/utils/api/cms';
import {CMSAdminPage} from './CmsPage';

export default async function Page({params}: {params: Promise<{type: CmsContentTypes}>}) {
  const {type} = await params;
  return <CMSAdminPage contentType={type} />;
}
