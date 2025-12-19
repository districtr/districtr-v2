import type {Config} from 'tailwindcss';
import typography from '@tailwindcss/typography';
const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
      width: {
        'full-minus-sidebar': 'calc(100% - var(--sidebar-width))',
        sidebar: 'var(--sidebar-width)',
      },
      colors: {
        districtrLightBlue: '#ccf2ff',
        districtrBlue: '#0099cd',
        districtrDarkBlue: '#006b9c',
        districtrIndigo: 'rgba(0, 0, 139)'
      }
    },
  },
  plugins: [typography],
};
export default config;
