import {withSentryConfig} from '@sentry/nextjs';
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/admin/:path*",
        destination: "http://strapi:1337/admin/:path*",
      },
    ];
  },
  async redirects() {
    return [
      // Basic redirect
      {
        source: '/',
        destination: '/map',
        permanent: true,
      },
    ];
  },
  experimental: {
    missingSuspenseWithCSRBailout: false,
  },
  resolve: {
    alias: {
      '@src': 'app/src',
      '@components': 'app/src/components',
      '@utils': 'app/src/utils',
      '@api': 'app/src/api',
      '@store': 'app/src/store',
      '@constants': 'app/src/constants',
    },
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: 'mggg-districtr',
  project: 'districtr-v2-app',

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Automatically annotate React components to show their full name in breadcrumbs and session replay
  reactComponentAnnotation: {
    // Injecting additional properties is breaking components that return symbols or more complex objects rather than DOM elements
    // Sentry is **NOT** able to exclude paths or components from this annotation
    // Unfortunately we need to disable it.
    enabled: false,
    ignoredComponents: [
      'MetaLayers',
      'Source',
      'Layer',
      'ZoneNumbersLayer',
      'PopulationTextLayer',
      'ZoneLayers',
      'ZoneLayerGroup',
    ],
  },

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: '/monitoring',

  // Hides source maps from generated client bundles
  hideSourceMaps: true,

  // Automatically tree-shake Sentry logger statements to reduce bundle size
  disableLogger: true,

  // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
  // See the following for more information:
  // https://docs.sentry.io/product/crons/
  // https://vercel.com/docs/cron-jobs
  automaticVercelMonitors: true,
});
