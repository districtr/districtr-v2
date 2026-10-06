import type {Metadata} from 'next';
import {ExtractTool} from '@/app/components/Extract/ExtractTool';

export const metadata: Metadata = {
  title: 'Download data | Districtr',
  robots: {index: false, follow: false},
};

/** Data-extract tool for CMS data users. The page itself is public (tiles and
 * centroids already are); the extract service enforces the CMS-issued token. */
export default function ExtractPage() {
  return <ExtractTool />;
}
