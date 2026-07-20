export type MediaContentType = 'gif' \| 'sticker' \| 'meme' \| 'emoji'

export interface Meta {
 item\_min\_width: number
 ad\_max\_resize\_percent: number
}

export interface Pagination {
 current\_page: number
 per\_page: number
 has\_next: boolean
}

export interface Rendition {
 url: string
 width: number
 height: number
 size: number
}

export interface MediaFormats {
 gif: Rendition
 webp: Rendition
 jpg: Rendition
 png: Rendition
 mp4: Rendition
 webm: Rendition
}

export type GifFormats = Pick
export type StickerFormats = Pick
export type MemeFormats = Pick
export type EmojiFormats = Pick

export interface FormatVariantMap {
 gif: GifFormats
 sticker: StickerFormats
 meme: MemeFormats
 emoji: EmojiFormats
}

export interface MediaItem {
 id: number
 slug: string
 title: string
 file: MediaFile
 tags: string\[\]
 type: T
 blur\_preview: string
}

export interface MediaFile {
 hd: TFormat
 md: TFormat
 sm: TFormat
 xs: TFormat
}

export interface MediaPage {
 data: MediaItem\[\]
 meta: Meta
}

export interface MediaPaginatedPage
 extends MediaPage, Pagination { }

export interface CategoriesData {
 locale: string
 categories: Category\[\]
}

export interface Category {
 category: string
 query: string
 preview\_url: string
}

export interface KlipyResponse {
 result: boolean
 data: T
}

export interface KlipyApiErrorResponse {
 errors: unknown
}