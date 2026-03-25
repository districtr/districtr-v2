/* THIS FILE WAS GENERATED AUTOMATICALLY BY PAYLOAD. */
/* DO NOT MODIFY IT BECAUSE IT COULD BE REWRITTEN AT ANY TIME. */
import type {AdminViewProps} from 'payload';

import config from '@/payload.config';
import {importMap} from '../importMap/importMap.js';
import {NotFoundPage, generatePageMetadata} from '@payloadcms/next/views';

type Args = {
  params: Promise<{
    segments: string[];
  }>;
  searchParams: Promise<{
    [key: string]: string | string[];
  }>;
};

export const generateMetadata = ({params, searchParams}: Args) =>
  generatePageMetadata({config, params, searchParams});

const NotFound = ({params, searchParams}: Args) =>
  NotFoundPage({config, params, searchParams, importMap});

export default NotFound;
