import {ReactNode} from 'react';

export interface ChangelogEntry {
  date: string;
  title: string;
  bullets: Array<string | ReactNode>;
}

export const changelogEntries: ChangelogEntry[] = [
  {
    date: '2026-01-12',
    title: 'Save performance improvements',
    bullets: [
      'Improved save performance of local save',
    ],
  }
];

