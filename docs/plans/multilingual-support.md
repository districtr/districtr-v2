# Multi-Lingual Support Plan

## Current State

Tags and Places collections have a `language` select field (en, es, zh, vi, ht, pt) with content duplicated per language. The public pages use a cookie-based `LanguagePicker` and fall back to English if the preferred language isn't available. This approach requires editors to manually create separate documents for each language of the same page.

## Goal

Enable true multi-lingual CMS content where a single Tag or Place document contains all language variants, editors can switch between languages in the Payload admin, and the public site serves the correct language automatically.

## Approach: Payload's Built-in Localization

Payload has native localization support via the `localization` config key. This replaces the manual `language` field approach.

### Implementation Steps

1. **Enable localization in payload.config.ts**
   ```ts
   localization: {
     locales: [
       { label: 'English', code: 'en' },
       { label: 'Spanish', code: 'es' },
       { label: 'Chinese', code: 'zh' },
       { label: 'Vietnamese', code: 'vi' },
       { label: 'Haitian Creole', code: 'ht' },
       { label: 'Portuguese', code: 'pt' },
     ],
     defaultLocale: 'en',
     fallback: true,
   }
   ```

2. **Update Tags and Places collections**
   - Remove the manual `language` select field
   - Remove the compound `slug + language` uniqueness concern (Payload handles this natively)
   - Mark `title`, `subtitle`, and `body` fields as `localized: true`
   - The `slug` field stays non-localized (same URL across languages)
   - `districtrMapSlug` / `districtrMapSlugs` stay non-localized

3. **Update public page data fetching** (`payloadCms.ts`)
   - Pass `locale` parameter to Payload Local API queries instead of filtering by language field
   - Payload automatically returns the correct locale with English fallback
   - The `availableLanguages` list comes from checking which locales have content via `payload.find({ locale: 'all' })`

4. **Update LanguagePicker integration**
   - Keep the cookie-based language preference
   - Pass the cookie value as `locale` to the Payload query
   - The picker's available languages come from the Payload locale config

5. **Admin experience**
   - Payload's admin panel adds a locale switcher in the toolbar automatically
   - Editors switch languages and edit the same document in different locales
   - No more creating separate documents per language

6. **Data migration**
   - Write a script that consolidates language variants:
     - Find all documents with the same slug but different `language` values
     - Merge them into a single document with localized fields
     - Delete the duplicate language-specific documents

### Key Files
- `app/src/payload.config.ts` — add `localization` config
- `app/src/collections/Tags.ts`, `Places.ts` — mark fields as `localized: true`, remove `language` field
- `app/src/app/utils/api/payloadCms.ts` — pass `locale` to queries
- `app/src/app/(app)/(static)/tag/[slug]/page.tsx` — pass language cookie as locale

### Effort Estimate
2-3 days (mostly migration script and testing across all 6 locales)
