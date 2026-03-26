#!/usr/bin/env tsx
/**
 * CMS Content Migration Script
 *
 * Reads Tags and Places content from the legacy `cms` schema tables,
 * converts Tiptap JSON body → Payload Lexical JSON, and outputs the
 * converted records. Can optionally write directly to Payload collections
 * via the Local API.
 *
 * Usage:
 *   # Dry run — output converted JSON to stdout
 *   npx tsx scripts/migrateCmsContent.ts --dry-run
 *
 *   # Write to Payload collections (requires DATABASE_URL and PAYLOAD_SECRET)
 *   npx tsx scripts/migrateCmsContent.ts --write
 *
 *   # Export to JSON files for inspection
 *   npx tsx scripts/migrateCmsContent.ts --export
 *
 * Requires: DATABASE_URL environment variable pointing to the PostgreSQL database.
 */

import {convertCmsContentBody, tiptapToLexical, type TiptapNode} from './tiptapToLexical';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const {Pool} = pg;

// ─── Types ─────────────────────────────────────────────────────────────────

interface CmsRow {
  id: string;
  slug: string;
  language: string;
  draft_content: Record<string, unknown> | null;
  published_content: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  author: string | null;
  // Tags-specific
  districtr_map_slug?: string | null;
  // Places-specific
  districtr_map_slugs?: string[] | null;
}

interface MigrationResult {
  id: string;
  slug: string;
  language: string;
  contentType: 'tags' | 'places';
  status: 'success' | 'error';
  error?: string;
  hadDraft: boolean;
  hadPublished: boolean;
}

// ─── Database queries ──────────────────────────────────────────────────────

async function fetchCmsContent(pool: pg.Pool, table: string): Promise<CmsRow[]> {
  const result = await pool.query(`SELECT * FROM cms.${table} ORDER BY created_at ASC`);
  return result.rows;
}

// ─── Content conversion ────────────────────────────────────────────────────

function convertRow(row: CmsRow): {
  draft: Record<string, unknown> | null;
  published: Record<string, unknown> | null;
  warnings: string[];
} {
  const warnings: string[] = [];

  const draft = convertCmsContentBody(row.draft_content);
  const published = convertCmsContentBody(row.published_content);

  // Check for base64 images that need manual handling
  const checkForBase64 = (content: Record<string, unknown> | null, label: string) => {
    if (!content?.body) return;
    const bodyStr = JSON.stringify(content.body);
    const base64Count = (bodyStr.match(/__migrationMeta/g) || []).length;
    if (base64Count > 0) {
      warnings.push(`${label}: ${base64Count} image(s) need manual upload to media collection`);
    }
  };

  checkForBase64(draft, 'draft');
  checkForBase64(published, 'published');

  return {draft, published, warnings};
}

// ─── Migration modes ───────────────────────────────────────────────────────

async function dryRun(pool: pg.Pool): Promise<void> {
  console.log('=== DRY RUN — Converting CMS content ===\n');

  const results: MigrationResult[] = [];

  for (const [table, contentType] of [
    ['tags_content', 'tags'],
    ['places_content', 'places'],
  ] as const) {
    const rows = await fetchCmsContent(pool, table);
    console.log(`\n--- ${contentType.toUpperCase()} (${rows.length} rows) ---\n`);

    for (const row of rows) {
      try {
        const {draft, published, warnings} = convertRow(row);

        console.log(
          `  ✓ ${row.slug} [${row.language}] — ` +
            `draft: ${draft ? 'yes' : 'no'}, published: ${published ? 'yes' : 'no'}`
        );

        for (const w of warnings) {
          console.log(`    ⚠ ${w}`);
        }

        results.push({
          id: row.id,
          slug: row.slug,
          language: row.language,
          contentType,
          status: 'success',
          hadDraft: !!draft,
          hadPublished: !!published,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ✗ ${row.slug} [${row.language}] — ERROR: ${errorMsg}`);
        results.push({
          id: row.id,
          slug: row.slug,
          language: row.language,
          contentType,
          status: 'error',
          error: errorMsg,
          hadDraft: !!row.draft_content,
          hadPublished: !!row.published_content,
        });
      }
    }
  }

  const successes = results.filter(r => r.status === 'success').length;
  const errors = results.filter(r => r.status === 'error').length;
  console.log(`\n=== Summary: ${successes} converted, ${errors} errors ===`);
}

async function exportToJson(pool: pg.Pool): Promise<void> {
  console.log('=== EXPORT — Writing converted content to JSON files ===\n');

  const outputDir = path.resolve(process.cwd(), 'scripts/migration-output');
  fs.mkdirSync(outputDir, {recursive: true});

  for (const [table, contentType] of [
    ['tags_content', 'tags'],
    ['places_content', 'places'],
  ] as const) {
    const rows = await fetchCmsContent(pool, table);
    const converted: Record<string, unknown>[] = [];

    for (const row of rows) {
      try {
        const {draft, published} = convertRow(row);

        converted.push({
          _originalId: row.id,
          slug: row.slug,
          language: row.language,
          author: row.author,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          ...(contentType === 'tags'
            ? {districtrMapSlug: row.districtr_map_slug}
            : {districtrMapSlugs: row.districtr_map_slugs}),
          // For Payload draft/publish, the published version goes in _status: 'published'
          // and draft goes in _status: 'draft'
          title: (published || draft)?.title || '',
          subtitle: (published || draft)?.subtitle || '',
          body: (published || draft)?.body || null,
          _hasDraft: !!draft,
          _hasPublished: !!published,
          _draftBody: draft?.body || null,
          _publishedBody: published?.body || null,
        });
      } catch (err) {
        console.error(`  ✗ Error converting ${row.slug}: ${err}`);
      }
    }

    const outFile = path.join(outputDir, `${contentType}.json`);
    fs.writeFileSync(outFile, JSON.stringify(converted, null, 2));
    console.log(`  Written ${converted.length} ${contentType} records to ${outFile}`);
  }
}

async function writeToPayload(pool: pg.Pool): Promise<void> {
  console.log('=== WRITE — Migrating content to Payload collections ===\n');
  console.log(
    'NOTE: This mode requires Payload collections (tags, places) to exist.\n' +
      'Run Phase 3 first to create the collections, then re-run this script.\n'
  );

  // Dynamically import Payload to get the Local API
  let payload: any;
  try {
    const {getPayload} = await import('payload');
    const config = (await import('../src/payload.config')).default;
    payload = await getPayload({config});
  } catch (err) {
    console.error('Failed to initialize Payload Local API:', err);
    console.error('Make sure Payload collections are defined and DATABASE_URL is set.');
    process.exit(1);
  }

  for (const [table, contentType] of [
    ['tags_content', 'tags'],
    ['places_content', 'places'],
  ] as const) {
    const rows = await fetchCmsContent(pool, table);
    console.log(`\nMigrating ${rows.length} ${contentType} records...\n`);

    for (const row of rows) {
      try {
        const {draft, published} = convertRow(row);
        const content = published || draft;
        if (!content) {
          console.log(`  - ${row.slug} [${row.language}]: no content, skipping`);
          continue;
        }

        const data: Record<string, unknown> = {
          slug: row.slug,
          language: row.language,
          title: content.title || '',
          subtitle: content.subtitle || '',
          body: content.body || null,
          _status: published ? 'published' : 'draft',
        };

        if (contentType === 'tags') {
          data.districtrMapSlug = row.districtr_map_slug;
        } else {
          data.districtrMapSlugs = row.districtr_map_slugs;
        }

        await payload.create({
          collection: contentType,
          data,
          draft: !published,
        });

        console.log(`  ✓ ${row.slug} [${row.language}]`);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`  ✗ ${row.slug} [${row.language}]: ${errorMsg}`);
      }
    }
  }

  console.log('\n=== Migration complete ===');
}

// ─── CLI ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] || '--dry-run';

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const pool = new Pool({connectionString: databaseUrl});

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('Connected to database.\n');

    // Check that CMS tables exist
    const tableCheck = await pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'cms'
       AND table_name IN ('tags_content', 'places_content')`
    );
    if (tableCheck.rows.length === 0) {
      console.error('ERROR: CMS tables not found in "cms" schema. Nothing to migrate.');
      process.exit(1);
    }
    console.log(
      `Found CMS tables: ${tableCheck.rows.map((r: {table_name: string}) => r.table_name).join(', ')}\n`
    );

    switch (mode) {
      case '--dry-run':
        await dryRun(pool);
        break;
      case '--export':
        await exportToJson(pool);
        break;
      case '--write':
        await writeToPayload(pool);
        break;
      default:
        console.log('Usage: npx tsx scripts/migrateCmsContent.ts [--dry-run|--export|--write]');
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
