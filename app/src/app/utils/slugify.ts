/** Turns heading text into a URL-safe anchor id, e.g. for in-page table-of-contents links. */
export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
