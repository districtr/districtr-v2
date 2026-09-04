import Image from '@tiptap/extension-image';

/** Tiptap Image with an editable max-width (px), persisted in the img style so
 * it round-trips through the stored HTML/JSON and the public renderer. */
export const CmsImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      maxWidth: {
        default: null,
        parseHTML: element => {
          const value = (element as HTMLElement).style?.maxWidth;
          return value ? parseInt(value, 10) || null : null;
        },
        renderHTML: attributes =>
          attributes.maxWidth
            ? {style: `max-width: ${attributes.maxWidth}px; height: auto; width: 100%;`}
            : {},
      },
    };
  },
});

export default CmsImage;
