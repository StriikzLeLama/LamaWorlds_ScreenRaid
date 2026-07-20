\# klipy-js

Typed JavaScript/TypeScript SDK for the KLIPY API.

\## Installation

\`\`\`sh
npm install klipy-js
\`\`\`

\`\`\`sh
pnpm add klipy-js
\`\`\`

\## Quick Start

\`\`\`ts
import { KlipyClient } from 'klipy-js'

const client = new KlipyClient({ apiKey: 'your-api-key' })

const results = await client.gifs.search({ q: 'hello' })
console.log(results.data)
\`\`\`

\## Initialization

\`\`\`ts
const client = new KlipyClient({ apiKey: '...' })
\`\`\`

\`apiKey\` is required. The client throws if it is missing or empty.

The client exposes five readonly properties and two utility methods:

\| Property \| Type \|
\|---\|---\|
\| \`client.gifs\` \| \`GifClient\` \|
\| \`client.stickers\` \| \`StickerClient\` \|
\| \`client.memes\` \| \`MemeClient\` \|
\| \`client.emojis\` \| \`EmojiClient\` \|
\| \`client.clips\` \| \`ClipClient\` \|

\## API

\### Media clients — gifs, stickers, memes, emojis

The four media clients (\`gifs\`, \`stickers\`, \`memes\`, \`emojis\`) share the same method signatures but return different types depending on the content type.

Each method returns a promise.

\#### \`search(params)\`

Search media by query string.

\`\`\`ts
const results = await client.gifs.search({ q: 'hello' })
// typeof results — MediaPaginatedPage<'gif'>
\`\`\`

\`params\` — \`MediaSearchParams\`:

\| Field \| Type \| Required \|
\|---\|---\|---\|
\| \`q\` \| \`string\` \| yes \|
\| \`customerId\` \| \`string\` \| no \|
\| \`page\` \| \`number\` \| no \|
\| \`perPage\` \| \`number\` \| no \|
\| \`locale\` \| \`string\` \| no \|
\| \`contentFilter\` \| \`ContentFilter\` \| no \|
\| \`formatFilter\` \| \`FormatFilter\` \| no \|

\#### \`trending(params)\`

Get trending media.

\`\`\`ts
const results = await client.stickers.trending({})
\`\`\`

\`params\` — \`MediaTrendingParams\` (same as \`MediaSearchParams\` without \`q\`).

\#### \`categories(params)\`

Get available categories.

\`\`\`ts
const cats = await client.memes.categories({ locale: 'en' })
// typeof cats — CategoriesData
\`\`\`

\`params\` — \`MediaCategoriesParams\`:

\| Field \| Type \| Required \|
\|---\|---\|---\|
\| \`locale\` \| \`string\` \| no \|

\#### \`recent(params)\`

Get recently used media for a customer.

\`\`\`ts
const recent = await client.emojis.recent({ customerId: 'cust-1' })
\`\`\`

\`params\` — \`MediaRecentParams\`:

\| Field \| Type \| Required \|
\|---\|---\|---\|
\| \`customerId\` \| \`string\` \| yes \|
\| \`page\` \| \`number\` \| no \|
\| \`perPage\` \| \`number\` \| no \|

\#### \`items(params)\`

Get specific items by slug(s).

\`\`\`ts
const items = await client.gifs.items({ slugs: 'hello-wave,party' })
\`\`\`

\`params\` — \`MediaItemsParams\`:

\| Field \| Type \| Required \|
\|---\|---\|---\|
\| \`slugs\` \| \`string\` \| yes \|

\#### \`hideFromRecents(params)\`

Remove an item from a customer's recent list.

\`\`\`ts
await client.gifs.hideFromRecents({ slug: 'hello', customerId: 'cust-1' })
\`\`\`

\`params\` — \`MediaHideFromRecentsParams\`:

\| Field \| Type \| Required \|
\|---\|---\|---\|
\| \`slug\` \| \`string\` \| yes \|
\| \`customerId\` \| \`string\` \| yes \|

\#### \`shareTrigger(params)\`

Register a share event for analytics.

\`\`\`ts
await client.gifs.shareTrigger({ slug: 'hello', customerId: 'cust-1' })
\`\`\`

\`params\` — \`MediaShareTriggerParams\`:

\| Field \| Type \| Required \|
\|---\|---\|---\|
\| \`slug\` \| \`string\` \| yes \|
\| \`q\` \| \`string\` \| no \|
\| \`customerId\` \| \`string\` \| no \|

\#### \`report(params)\`

Report an item.

\`\`\`ts
await client.gifs.report({ slug: 'hello', reason: 'spam' })
\`\`\`

\`params\` — \`MediaReportParams\`:

\| Field \| Type \| Required \|
\|---\|---\|---\|
\| \`slug\` \| \`string\` \| yes \|
\| \`reason\` \| \`MediaReportReasons\` \| yes \|
\| \`customerId\` \| \`string\` \| no \|

\`MediaReportReasons\` values: \`'nudity' \| 'violence' \| 'hate\_speech' \| 'harassment' \| 'spam' \| 'misinformation' \| 'copyright' \| 'offensive' \| 'illegal' \| 'broken' \| 'low\_quality' \| 'not\_relevant'\`

\### Clip client

\`client.clips\` has the same methods as the media clients but returns clip-specific types.

\`\`\`ts
const results = await client.clips.search({ q: 'hello' })
// typeof results — ClipPaginatedPage
const cats = await client.clips.categories({ locale: 'en' })
const recent = await client.clips.recent({ customerId: 'cust-1' })
const items = await client.clips.items({ slugs: 'hello-wave' })
await client.clips.hideFromRecents({ slug: 'hello', customerId: 'cust-1' })
await client.clips.shareTrigger({ slug: 'hello' })
await client.clips.report({ slug: 'hello', reason: 'spam' })
\`\`\`

The \`search\`, \`trending\`, and \`recent\` methods return \`ClipPaginatedPage\`. The \`items\` method returns \`ClipPage\`. All other methods return \`void\`.

\### Search suggestions

\`client.searchSuggestions(params)\` and \`client.autocomplete(params)\` return search term suggestions directly on the client.

\`\`\`ts
const suggestions = await client.searchSuggestions({ q: 'hel', limit: 5 })
// typeof suggestions — string\[\]
const auto = await client.autocomplete({ q: 'hel', limit: 5 })
// typeof auto — string\[\]
\`\`\`

\`params\` — \`SuggestionParams\`:

\| Field \| Type \| Required \|
\|---\|---\|---\|
\| \`q\` \| \`string\` \| yes \|
\| \`limit\` \| \`number\` \| no \|

\## Pagination

Methods that return paginated results accept \`page\` and \`perPage\` in their params. The response includes pagination fields directly on the result object:

\`\`\`ts
interface Pagination {
 current\_page: number
 per\_page: number
 has\_next: boolean
}
\`\`\`

\`ClipPaginatedPage\` extends \`ClipPage\` + \`Pagination\`.
\`MediaPaginatedPage\` extends \`MediaPage\` \+ \`Pagination\`.

\`\`\`ts
const page1 = await client.gifs.search({ q: 'hello', page: 1, perPage: 20 })
console.log(page1.current\_page) // 1
console.log(page1.has\_next) // true
\`\`\`

\## Types

The package exports the following types for consumers:

\*\*Media types\*\*
\`MediaContentType\`, \`MediaItem\`, \`MediaPage\`, \`MediaPaginatedPage\`, \`Meta\`, \`Pagination\`, \`Rendition\`, \`CategoriesData\`, \`Category\`

\*\*Clip types\*\*
\`ClipItem\`, \`ClipPage\`, \`ClipPaginatedPage\`

\*\*Client types\*\*
\`GifClient\`, \`StickerClient\`, \`MemeClient\`, \`EmojiClient\`, \`ClipClient\`

\*\*Param types\*\*
\`MediaSearchParams\`, \`MediaTrendingParams\`, \`MediaRecentParams\`, \`MediaCategoriesParams\`, \`MediaItemsParams\`, \`MediaHideFromRecentsParams\`, \`MediaShareTriggerParams\`, \`MediaReportParams\`, \`MediaPaginationParams\`, \`SuggestionParams\`

\*\*Filter types\*\*
\`ContentFilter\` (\`'off' \| 'low' \| 'medium' \| 'high'\`), \`FormatFilter\` (\`'gif' \| 'webp' \| 'jpg' \| 'mp4' \| 'webm'\`), \`MediaReportReasons\`

\## Error Handling

When the API returns a non-2xx status, the client throws a \`KlipyApiError\`:

\`\`\`ts
import { KlipyApiError } from 'klipy-js'

try {
 await client.gifs.search({ q: 'hello' })
}
catch (error) {
 if (error instanceof KlipyApiError) {
 console.log(error.status) // number
 console.log(error.body) // unknown
 }
}