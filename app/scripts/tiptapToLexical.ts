/**
 * Tiptap JSON → Payload Lexical JSON converter
 *
 * Converts Tiptap/ProseMirror document JSON to the Lexical JSON format
 * used by Payload CMS 3.0's rich text editor.
 *
 * Standard nodes: paragraph, heading, bulletList, orderedList, listItem,
 *   blockquote, codeBlock, hardBreak, horizontalRule, image
 * Marks: bold, italic, underline, strike, code, link, color/textStyle
 * Custom blocks: planGalleryNode, commentGalleryNode, formNode,
 *   mapCreateButtonsNode, boilerplateNode, sectionHeaderNode
 */

// ─── Lexical format bitmask ────────────────────────────────────────────────
const FORMAT = {
  BOLD: 1,
  ITALIC: 2,
  STRIKETHROUGH: 4,
  UNDERLINE: 8,
  CODE: 16,
  SUBSCRIPT: 32,
  SUPERSCRIPT: 64,
} as const;

// ─── Types ─────────────────────────────────────────────────────────────────

interface TiptapNode {
  type: string;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
  attrs?: Record<string, unknown>;
}

interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
interface LexicalNode {
  type: string;
  version: number;
  [key: string]: unknown;
}

// Loose output type for converter functions — allows extra properties
type AnyLexicalNode = Record<string, unknown> & {type: string; version: number};

interface LexicalTextNode extends LexicalNode {
  type: 'text';
  text: string;
  format: number;
  detail: number;
  mode: 'normal' | 'token' | 'segmented';
  style: string;
}

interface LexicalElementNode extends LexicalNode {
  children: LexicalNode[];
  direction: 'ltr' | 'rtl' | null;
  format: '' | 'left' | 'center' | 'right' | 'justify';
  indent: number;
}

interface LexicalRoot {
  root: {
    type: 'root';
    children: AnyLexicalNode[];
    direction: 'ltr' | 'rtl' | null;
    format: string;
    indent: number;
    version: number;
  };
}

// ─── Mark → format bitmask conversion ──────────────────────────────────────

function marksToFormat(marks?: TiptapMark[]): number {
  if (!marks) return 0;
  let format = 0;
  for (const mark of marks) {
    switch (mark.type) {
      case 'bold':
        format |= FORMAT.BOLD;
        break;
      case 'italic':
        format |= FORMAT.ITALIC;
        break;
      case 'strike':
        format |= FORMAT.STRIKETHROUGH;
        break;
      case 'underline':
        format |= FORMAT.UNDERLINE;
        break;
      case 'code':
        format |= FORMAT.CODE;
        break;
    }
  }
  return format;
}

function marksToStyle(marks?: TiptapMark[]): string {
  if (!marks) return '';
  const styles: string[] = [];
  for (const mark of marks) {
    if (mark.type === 'textStyle' && mark.attrs?.color) {
      styles.push(`color: ${mark.attrs.color}`);
    }
    if (mark.type === 'color' && mark.attrs?.color) {
      styles.push(`color: ${mark.attrs.color}`);
    }
  }
  return styles.join('; ');
}

function hasLinkMark(marks?: TiptapMark[]): TiptapMark | undefined {
  return marks?.find(m => m.type === 'link');
}

// ─── Node converters ───────────────────────────────────────────────────────

function makeElementBase(type: string) {
  return {
    type,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
  };
}

function convertTextNode(node: TiptapNode): AnyLexicalNode[] {
  const linkMark = hasLinkMark(node.marks);
  const nonLinkMarks = node.marks?.filter(m => m.type !== 'link');

  const textNode: LexicalTextNode = {
    type: 'text',
    text: node.text || '',
    format: marksToFormat(nonLinkMarks),
    detail: 0,
    mode: 'normal',
    style: marksToStyle(nonLinkMarks),
    version: 1,
  };

  // If this text has a link mark, wrap it in a link node
  if (linkMark) {
    const linkNode: AnyLexicalNode = {
      ...makeElementBase('link'),
      type: 'link',
      fields: {
        url: linkMark.attrs?.href || '',
        newTab: linkMark.attrs?.target === '_blank',
        linkType: 'custom',
      },
      children: [textNode],
      version: 3,
    };
    return [linkNode];
  }

  return [textNode];
}

function convertChildren(nodes?: TiptapNode[]): AnyLexicalNode[] {
  if (!nodes) return [];
  return nodes.flatMap(convertNode);
}

function convertInlineChildren(nodes?: TiptapNode[]): AnyLexicalNode[] {
  if (!nodes || nodes.length === 0) return [];
  return nodes.flatMap(node => {
    if (node.type === 'text') return convertTextNode(node);
    if (node.type === 'hardBreak') return [{type: 'linebreak', version: 1}];
    // For inline images or other inline nodes, convert normally
    return convertNode(node);
  });
}

function convertParagraph(node: TiptapNode): AnyLexicalNode {
  return {
    ...makeElementBase('paragraph'),
    children: convertInlineChildren(node.content),
    textFormat: 0,
    textStyle: '',
  };
}

function convertHeading(node: TiptapNode): AnyLexicalNode {
  const level = (node.attrs?.level as number) || 1;
  return {
    ...makeElementBase('heading'),
    tag: `h${level}`,
    children: convertInlineChildren(node.content),
  };
}

function convertBulletList(node: TiptapNode): AnyLexicalNode {
  return {
    ...makeElementBase('list'),
    tag: 'ul',
    listType: 'bullet',
    start: 1,
    children: convertChildren(node.content),
  };
}

function convertOrderedList(node: TiptapNode): AnyLexicalNode {
  return {
    ...makeElementBase('list'),
    tag: 'ol',
    listType: 'number',
    start: (node.attrs?.start as number) || 1,
    children: convertChildren(node.content),
  };
}

function convertListItem(node: TiptapNode): AnyLexicalNode {
  // Tiptap listItems contain paragraphs; Lexical listItems contain inline content directly
  // However, Payload's Lexical also wraps list item content in a paragraph-like structure
  // We'll keep the nested structure as Lexical expects it
  return {
    ...makeElementBase('listitem'),
    value: 1,
    children: convertChildren(node.content),
  };
}

function convertBlockquote(node: TiptapNode): AnyLexicalNode {
  return {
    ...makeElementBase('quote'),
    children: convertChildren(node.content),
  };
}

function convertCodeBlock(node: TiptapNode): AnyLexicalNode {
  // Extract text content from the code block
  const text = node.content?.map(n => n.text || '').join('') || '';
  return {
    ...makeElementBase('code'),
    language: (node.attrs?.language as string) || '',
    children: [
      {
        type: 'code-highlight',
        text,
        format: 0,
        detail: 0,
        mode: 'normal',
        style: '',
        version: 1,
        highlightType: undefined,
      },
    ],
  };
}

function convertHorizontalRule(): AnyLexicalNode {
  return {
    type: 'horizontalrule',
    version: 1,
  };
}

function convertImage(node: TiptapNode): AnyLexicalNode {
  // Base64 images can't go through Payload media collection directly.
  // Store as a custom inline image node. For production migration,
  // base64 images should be uploaded to Payload's media collection first.
  const src = (node.attrs?.src as string) || '';

  if (src.startsWith('data:')) {
    // Base64 image — store as a paragraph with a placeholder comment.
    // These should be manually uploaded to media collection post-migration.
    return {
      ...makeElementBase('paragraph'),
      children: [
        {
          type: 'text',
          text: `[IMAGE: base64 image — needs manual upload to media collection]`,
          format: FORMAT.ITALIC,
          detail: 0,
          mode: 'normal',
          style: '',
          version: 1,
        },
      ],
      // Store original src for manual migration
      __migrationMeta: {
        originalType: 'image',
        src,
        alt: node.attrs?.alt || '',
        title: node.attrs?.title || '',
      },
    };
  }

  // URL-based image — can potentially be auto-uploaded
  return {
    ...makeElementBase('paragraph'),
    children: [
      {
        type: 'text',
        text: `[IMAGE: ${src}]`,
        format: FORMAT.ITALIC,
        detail: 0,
        mode: 'normal',
        style: '',
        version: 1,
      },
    ],
    __migrationMeta: {
      originalType: 'image',
      src,
      alt: node.attrs?.alt || '',
      title: node.attrs?.title || '',
    },
  };
}

// ─── Custom block converters ───────────────────────────────────────────────
// These map Tiptap custom nodes → Payload Lexical "block" nodes.
// Block fields match the Payload block definitions from Phase 3.

function convertCustomBlock(node: TiptapNode): AnyLexicalNode {
  const blockTypeMap: Record<string, string> = {
    planGalleryNode: 'planGallery',
    commentGalleryNode: 'commentGallery',
    formNode: 'commentSubmissionForm',
    mapCreateButtonsNode: 'mapCreateButtons',
    boilerplateNode: 'boilerplate',
    sectionHeaderNode: 'sectionHeader',
  };

  const blockType = blockTypeMap[node.type];
  if (!blockType) {
    console.warn(`Unknown custom node type: ${node.type}`);
    return convertParagraph({type: 'paragraph', content: []});
  }

  // Pass through all attrs as block fields — Payload stores these directly
  const fields: Record<string, unknown> = {
    id: crypto.randomUUID(),
    blockType,
    blockName: '',
    ...(node.attrs || {}),
  };

  return {
    type: 'block',
    fields,
    format: '',
    version: 2,
  };
}

// ─── Main converter ────────────────────────────────────────────────────────

const CUSTOM_NODE_TYPES = new Set([
  'planGalleryNode',
  'commentGalleryNode',
  'formNode',
  'mapCreateButtonsNode',
  'boilerplateNode',
  'sectionHeaderNode',
]);

function convertNode(node: TiptapNode): AnyLexicalNode[] {
  if (node.type === 'text') return convertTextNode(node);

  switch (node.type) {
    case 'paragraph':
      return [convertParagraph(node)];
    case 'heading':
      return [convertHeading(node)];
    case 'bulletList':
      return [convertBulletList(node)];
    case 'orderedList':
      return [convertOrderedList(node)];
    case 'listItem':
      return [convertListItem(node)];
    case 'blockquote':
      return [convertBlockquote(node)];
    case 'codeBlock':
      return [convertCodeBlock(node)];
    case 'horizontalRule':
      return [convertHorizontalRule()];
    case 'hardBreak':
      return [{type: 'linebreak', version: 1}];
    case 'image':
      return [convertImage(node)];
    default:
      if (CUSTOM_NODE_TYPES.has(node.type)) {
        return [convertCustomBlock(node)];
      }
      console.warn(`Unhandled node type: ${node.type}, converting children only`);
      return convertChildren(node.content);
  }
}

/**
 * Convert a Tiptap document JSON object to Payload Lexical JSON.
 *
 * @param tiptapDoc - The Tiptap document (`{ type: "doc", content: [...] }`)
 * @returns Lexical root object (`{ root: { type: "root", children: [...] } }`)
 */
export function tiptapToLexical(tiptapDoc: TiptapNode): LexicalRoot {
  if (!tiptapDoc || tiptapDoc.type !== 'doc') {
    return {
      root: {
        type: 'root',
        children: [],
        direction: 'ltr',
        format: '',
        indent: 0,
        version: 1,
      },
    };
  }

  return {
    root: {
      type: 'root',
      children: convertChildren(tiptapDoc.content),
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
    },
  };
}

/**
 * Convert a full CMS content record's body field.
 * The CMS stores content as `{ title, subtitle, body: { type: "doc", ... } }`.
 * This converts just the body portion.
 */
export function convertCmsContentBody(
  content: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!content) return null;

  const result = {...content};

  if (result.body && typeof result.body === 'object' && (result.body as TiptapNode).type === 'doc') {
    result.body = tiptapToLexical(result.body as TiptapNode);
  }

  return result;
}

// ─── Export for use in migration script ────────────────────────────────────
export {FORMAT, type TiptapNode, type LexicalRoot, type LexicalNode, type AnyLexicalNode};
