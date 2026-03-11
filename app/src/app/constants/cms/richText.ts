export const RICH_TEXT_DATA_ATTRIBUTES = {
  TYPE: 'data-type',
  CUSTOM_CONTENT: 'data-custom-content',
  TITLE: 'data-title',
} as const;

export const RICH_TEXT_NODE_TYPES = {
  BOILERPLATE: 'boilerplate-node',
  SECTION_HEADER: 'section-header-node',
  PLAN_GALLERY: 'plan-gallery-node',
  FORM: 'form-node',
  MAP_CREATE_BUTTONS: 'map-create-buttons-node',
  COMMENT_GALLERY: 'comment-gallery-node',
} as const;

export type RichTextNodeType = (typeof RICH_TEXT_NODE_TYPES)[keyof typeof RICH_TEXT_NODE_TYPES];

export const getRichTextNodeSelector = (nodeType: RichTextNodeType) =>
  `div[${RICH_TEXT_DATA_ATTRIBUTES.TYPE}="${nodeType}"]`;

export const GALLERY_FILTER_TABS = {
  IDS: 'ids',
  TAGS: 'tags',
} as const;

export const COMMON_GALLERY_ATTRS = {
  IDS: GALLERY_FILTER_TABS.IDS,
  TAGS: GALLERY_FILTER_TABS.TAGS,
  TITLE: 'title',
  DESCRIPTION: 'description',
  LIMIT: 'limit',
  PAGINATE: 'paginate',
  SHOW_LIST_VIEW: 'showListView',
} as const;

export const PLAN_GALLERY_ATTRS = {
  ...COMMON_GALLERY_ATTRS,
  SHOW_THUMBNAILS: 'showThumbnails',
  SHOW_TITLES: 'showTitles',
  SHOW_DESCRIPTIONS: 'showDescriptions',
  SHOW_UPDATED_AT: 'showUpdatedAt',
  SHOW_TAGS: 'showTags',
  SHOW_MODULE: 'showModule',
} as const;

export const PLAN_GALLERY_DISPLAY_OPTIONS = [
  {key: PLAN_GALLERY_ATTRS.PAGINATE, label: 'Paginate Results'},
  {key: PLAN_GALLERY_ATTRS.SHOW_LIST_VIEW, label: 'Show List View'},
  {key: PLAN_GALLERY_ATTRS.SHOW_THUMBNAILS, label: 'Show Thumbnails'},
  {key: PLAN_GALLERY_ATTRS.SHOW_TITLES, label: 'Show Titles'},
  {key: PLAN_GALLERY_ATTRS.SHOW_DESCRIPTIONS, label: 'Show Descriptions'},
  {key: PLAN_GALLERY_ATTRS.SHOW_UPDATED_AT, label: 'Show Updated At'},
  {key: PLAN_GALLERY_ATTRS.SHOW_TAGS, label: 'Show Tags'},
  {key: PLAN_GALLERY_ATTRS.SHOW_MODULE, label: 'Show Module'},
] as const;

export type PlanGalleryDisplayOptionKey = (typeof PLAN_GALLERY_DISPLAY_OPTIONS)[number]['key'];

export const COMMENT_GALLERY_ATTRS = {
  ...COMMON_GALLERY_ATTRS,
  PLACE: 'place',
  STATE: 'state',
  ZIP_CODE: 'zipCode',
  SHOW_IDENTIFIER: 'showIdentifier',
  SHOW_TITLES: 'showTitles',
  SHOW_PLACES: 'showPlaces',
  SHOW_STATES: 'showStates',
  SHOW_ZIP_CODES: 'showZipCodes',
  SHOW_CREATED_AT: 'showCreatedAt',
  SHOW_FILTERS: 'showFilters',
  SHOW_MAPS: 'showMaps',
} as const;

export const COMMENT_GALLERY_DISPLAY_OPTIONS = [
  {key: COMMENT_GALLERY_ATTRS.PAGINATE, label: 'Paginate Results'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_LIST_VIEW, label: 'Show List View'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_IDENTIFIER, label: 'Show Identifier'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_TITLES, label: 'Show Titles'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_PLACES, label: 'Show Places'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_STATES, label: 'Show States'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_ZIP_CODES, label: 'Show Zip Codes'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_CREATED_AT, label: 'Show Created At'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_FILTERS, label: 'Show Filter Controls'},
  {key: COMMENT_GALLERY_ATTRS.SHOW_MAPS, label: 'Show Map Links'},
] as const;

export type CommentGalleryDisplayOptionKey =
  (typeof COMMENT_GALLERY_DISPLAY_OPTIONS)[number]['key'];

export const FORM_NODE_ATTRS = {
  MANDATORY_TAGS: 'mandatoryTags',
  ALLOW_LIST_MODULES: 'allowListModules',
} as const;

export const MAP_CREATE_BUTTONS_NODE_ATTRS = {
  VIEWS: 'views',
  TYPE: 'type',
} as const;
