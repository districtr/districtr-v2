import { mergeConfig, type UserConfig } from 'vite';

export default (config: UserConfig) => {
  // Important: always return the modified config
  return mergeConfig(config, {
    resolve: {
      alias: {
        '@': '/src',
      },
    },
    server: {
      allowedHosts: ['strapi', 'frontend', 'localhost'],
      host: "0.0.0.0",
      port: 1337,
    },
  });
};
