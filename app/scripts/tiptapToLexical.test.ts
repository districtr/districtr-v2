/**
 * Tests for Tiptap → Lexical converter
 *
 * Run: npx tsx scripts/tiptapToLexical.test.ts
 */

import {tiptapToLexical, convertCmsContentBody, type TiptapNode} from './tiptapToLexical';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function assertEqual(actual: unknown, expected: unknown, message: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
    console.error(`    Expected: ${e}`);
    console.error(`    Actual:   ${a}`);
  }
}

// ─── Test: Empty document ──────────────────────────────────────────────────

console.log('\n--- Empty / null documents ---');

{
  const result = tiptapToLexical({type: 'doc', content: []});
  assert(result.root.type === 'root', 'empty doc produces root node');
  assertEqual(result.root.children.length, 0, 'empty doc has no children');
}

{
  const result = tiptapToLexical(null as any);
  assert(result.root.type === 'root', 'null input produces root node');
  assertEqual(result.root.children.length, 0, 'null input has no children');
}

// ─── Test: Plain paragraph ─────────────────────────────────────────────────

console.log('\n--- Plain paragraph ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{type: 'text', text: 'Hello world'}],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  assertEqual(result.root.children.length, 1, 'one paragraph child');
  const para = result.root.children[0] as any;
  assertEqual(para.type, 'paragraph', 'child is paragraph');
  assertEqual(para.children[0].type, 'text', 'paragraph has text child');
  assertEqual(para.children[0].text, 'Hello world', 'text content matches');
  assertEqual(para.children[0].format, 0, 'no formatting');
}

// ─── Test: Bold + italic text ──────────────────────────────────────────────

console.log('\n--- Bold + italic marks ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Bold and italic',
            marks: [{type: 'bold'}, {type: 'italic'}],
          },
        ],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const text = (result.root.children[0] as any).children[0];
  assertEqual(text.format, 1 | 2, 'bold (1) + italic (2) = 3');
}

// ─── Test: Underline + strike ──────────────────────────────────────────────

console.log('\n--- Underline + strikethrough ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Styled',
            marks: [{type: 'underline'}, {type: 'strike'}],
          },
        ],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const text = (result.root.children[0] as any).children[0];
  assertEqual(text.format, 8 | 4, 'underline (8) + strike (4) = 12');
}

// ─── Test: Link mark ───────────────────────────────────────────────────────

console.log('\n--- Link mark ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Click here',
            marks: [{type: 'link', attrs: {href: 'https://example.com', target: '_blank'}}],
          },
        ],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const para = result.root.children[0] as any;
  const linkNode = para.children[0];
  assertEqual(linkNode.type, 'link', 'link mark creates link node');
  assertEqual(linkNode.fields.url, 'https://example.com', 'URL preserved');
  assertEqual(linkNode.fields.newTab, true, 'target _blank → newTab true');
  assertEqual(linkNode.children[0].text, 'Click here', 'text inside link');
}

// ─── Test: Bold link ───────────────────────────────────────────────────────

console.log('\n--- Bold text with link ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Bold link',
            marks: [{type: 'bold'}, {type: 'link', attrs: {href: 'https://example.com'}}],
          },
        ],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const link = (result.root.children[0] as any).children[0];
  assertEqual(link.type, 'link', 'creates link node');
  assertEqual(link.children[0].format, 1, 'text inside link is bold');
}

// ─── Test: Color/textStyle ─────────────────────────────────────────────────

console.log('\n--- Color style ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Red text',
            marks: [{type: 'textStyle', attrs: {color: '#ff0000'}}],
          },
        ],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const text = (result.root.children[0] as any).children[0];
  assertEqual(text.style, 'color: #ff0000', 'color style preserved');
}

// ─── Test: Heading ─────────────────────────────────────────────────────────

console.log('\n--- Headings ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {type: 'heading', attrs: {level: 1}, content: [{type: 'text', text: 'Title'}]},
      {type: 'heading', attrs: {level: 2}, content: [{type: 'text', text: 'Subtitle'}]},
      {type: 'heading', attrs: {level: 3}, content: [{type: 'text', text: 'Section'}]},
    ],
  };
  const result = tiptapToLexical(doc);
  assertEqual((result.root.children[0] as any).tag, 'h1', 'h1 tag');
  assertEqual((result.root.children[1] as any).tag, 'h2', 'h2 tag');
  assertEqual((result.root.children[2] as any).tag, 'h3', 'h3 tag');
}

// ─── Test: Bullet list ─────────────────────────────────────────────────────

console.log('\n--- Bullet list ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {type: 'paragraph', content: [{type: 'text', text: 'Item 1'}]},
            ],
          },
          {
            type: 'listItem',
            content: [
              {type: 'paragraph', content: [{type: 'text', text: 'Item 2'}]},
            ],
          },
        ],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const list = result.root.children[0] as any;
  assertEqual(list.type, 'list', 'list node type');
  assertEqual(list.tag, 'ul', 'unordered list tag');
  assertEqual(list.listType, 'bullet', 'bullet list type');
  assertEqual(list.children.length, 2, 'two list items');
  assertEqual(list.children[0].type, 'listitem', 'first child is listitem');
}

// ─── Test: Ordered list ────────────────────────────────────────────────────

console.log('\n--- Ordered list ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'orderedList',
        content: [
          {
            type: 'listItem',
            content: [
              {type: 'paragraph', content: [{type: 'text', text: 'First'}]},
            ],
          },
        ],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const list = result.root.children[0] as any;
  assertEqual(list.tag, 'ol', 'ordered list tag');
  assertEqual(list.listType, 'number', 'number list type');
}

// ─── Test: Blockquote ──────────────────────────────────────────────────────

console.log('\n--- Blockquote ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'blockquote',
        content: [{type: 'paragraph', content: [{type: 'text', text: 'A quote'}]}],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  assertEqual((result.root.children[0] as any).type, 'quote', 'blockquote → quote');
}

// ─── Test: Horizontal rule ─────────────────────────────────────────────────

console.log('\n--- Horizontal rule ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [{type: 'horizontalRule'}],
  };
  const result = tiptapToLexical(doc);
  assertEqual((result.root.children[0] as any).type, 'horizontalrule', 'horizontal rule type');
}

// ─── Test: Hard break ──────────────────────────────────────────────────────

console.log('\n--- Hard break ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {type: 'text', text: 'Line 1'},
          {type: 'hardBreak'},
          {type: 'text', text: 'Line 2'},
        ],
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const para = result.root.children[0] as any;
  assertEqual(para.children.length, 3, 'three children (text, break, text)');
  assertEqual(para.children[1].type, 'linebreak', 'hardBreak → linebreak');
}

// ─── Test: Custom blocks ───────────────────────────────────────────────────

console.log('\n--- Custom blocks: PlanGallery ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'planGalleryNode',
        attrs: {
          ids: [1, 2, 3],
          tags: ['featured'],
          title: 'Plans',
          description: 'Browse plans',
          paginate: true,
          showThumbnails: true,
          limit: 12,
        },
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const block = result.root.children[0] as any;
  assertEqual(block.type, 'block', 'custom node → block type');
  assertEqual(block.fields.blockType, 'planGallery', 'blockType is planGallery');
  assertEqual(block.fields.ids, [1, 2, 3], 'ids preserved');
  assertEqual(block.fields.tags, ['featured'], 'tags preserved');
  assertEqual(block.fields.title, 'Plans', 'title preserved');
  assertEqual(block.fields.limit, 12, 'limit preserved');
  assert(typeof block.fields.id === 'string', 'generated UUID for block id');
}

console.log('\n--- Custom blocks: CommentGallery ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'commentGalleryNode',
        attrs: {
          ids: [10],
          tags: ['approved'],
          place: 'Chicago',
          state: 'IL',
          showFilters: true,
          limit: 20,
        },
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const block = result.root.children[0] as any;
  assertEqual(block.fields.blockType, 'commentGallery', 'blockType is commentGallery');
  assertEqual(block.fields.place, 'Chicago', 'place preserved');
  assertEqual(block.fields.state, 'IL', 'state preserved');
  assertEqual(block.fields.showFilters, true, 'showFilters preserved');
}

console.log('\n--- Custom blocks: FormNode ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'formNode',
        attrs: {
          mandatoryTags: ['feedback', 'public'],
          allowListModules: ['module-1'],
        },
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const block = result.root.children[0] as any;
  assertEqual(block.fields.blockType, 'commentSubmissionForm', 'blockType is commentSubmissionForm');
  assertEqual(block.fields.mandatoryTags, ['feedback', 'public'], 'mandatoryTags preserved');
}

console.log('\n--- Custom blocks: MapCreateButtons ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'mapCreateButtonsNode',
        attrs: {
          views: [{name: 'Map 1', districtr_map_slug: 'map-1'}],
          type: 'megaphone',
        },
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const block = result.root.children[0] as any;
  assertEqual(block.fields.blockType, 'mapCreateButtons', 'blockType is mapCreateButtons');
  assertEqual(block.fields.type, 'megaphone', 'type preserved');
}

console.log('\n--- Custom blocks: SectionHeader ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'sectionHeaderNode',
        attrs: {title: 'My Section'},
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const block = result.root.children[0] as any;
  assertEqual(block.fields.blockType, 'sectionHeader', 'blockType is sectionHeader');
  assertEqual(block.fields.title, 'My Section', 'title preserved');
}

console.log('\n--- Custom blocks: Boilerplate ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {
        type: 'boilerplateNode',
        attrs: {customContent: {key: 'value'}},
      },
    ],
  };
  const result = tiptapToLexical(doc);
  const block = result.root.children[0] as any;
  assertEqual(block.fields.blockType, 'boilerplate', 'blockType is boilerplate');
  assertEqual(block.fields.customContent, {key: 'value'}, 'customContent preserved');
}

// ─── Test: convertCmsContentBody ───────────────────────────────────────────

console.log('\n--- convertCmsContentBody ---');

{
  const content = {
    title: 'My Page',
    subtitle: 'A subtitle',
    body: {
      type: 'doc',
      content: [{type: 'paragraph', content: [{type: 'text', text: 'Hello'}]}],
    },
  };
  const result = convertCmsContentBody(content);
  assertEqual(result?.title, 'My Page', 'title preserved');
  assertEqual(result?.subtitle, 'A subtitle', 'subtitle preserved');
  assertEqual((result?.body as any)?.root?.type, 'root', 'body converted to Lexical root');
}

{
  const result = convertCmsContentBody(null);
  assertEqual(result, null, 'null input returns null');
}

// ─── Test: Complex mixed document ──────────────────────────────────────────

console.log('\n--- Complex mixed document ---');

{
  const doc: TiptapNode = {
    type: 'doc',
    content: [
      {type: 'heading', attrs: {level: 1}, content: [{type: 'text', text: 'Welcome'}]},
      {
        type: 'paragraph',
        content: [
          {type: 'text', text: 'This is '},
          {type: 'text', text: 'bold', marks: [{type: 'bold'}]},
          {type: 'text', text: ' text.'},
        ],
      },
      {type: 'sectionHeaderNode', attrs: {title: 'Plans'}},
      {
        type: 'planGalleryNode',
        attrs: {ids: [1], tags: [], title: 'Plans', paginate: true, limit: 6},
      },
      {type: 'horizontalRule'},
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [{type: 'paragraph', content: [{type: 'text', text: 'Item'}]}],
          },
        ],
      },
      {type: 'formNode', attrs: {mandatoryTags: ['test'], allowListModules: []}},
    ],
  };

  const result = tiptapToLexical(doc);
  assertEqual(result.root.children.length, 7, 'seven top-level nodes');
  assertEqual((result.root.children[0] as any).type, 'heading', 'first is heading');
  assertEqual((result.root.children[1] as any).type, 'paragraph', 'second is paragraph');
  assertEqual((result.root.children[2] as any).type, 'block', 'third is block (sectionHeader)');
  assertEqual((result.root.children[3] as any).type, 'block', 'fourth is block (planGallery)');
  assertEqual((result.root.children[4] as any).type, 'horizontalrule', 'fifth is hr');
  assertEqual((result.root.children[5] as any).type, 'list', 'sixth is list');
  assertEqual((result.root.children[6] as any).type, 'block', 'seventh is block (form)');
}

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${'='.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('All tests passed! ✓');
}
