import type {CommentGalleryProps} from "@/app/components/Cms/RichTextEditor/extensions/CommentGallery/CommentGallery";
import type {PlanGalleryProps} from "@/app/components/Cms/RichTextEditor/extensions/PlanGallery/PlanGallery";
import type {MapCreateButtonsProps} from "@/app/components/Cms/RichTextEditor/extensions/MapCreateButtons/MapCreateButtons";

export const NODE_TYPE_ATTRIBUTE_NAME = 'data-type';

export const RICH_TEXT_NODE_TYPES = {
  BOILERPLATE: 'boilerplate-node',
  SECTION_HEADER: 'section-header-node',
  PLAN_GALLERY: 'plan-gallery-node',
  FORM: 'form-node',
  MAP_CREATE_BUTTONS: 'map-create-buttons-node',
  COMMENT_GALLERY: 'comment-gallery-node',
} as const;

export const BOILERPLATE_ATTRIBUTE_NAME = 'data-custom-content';
export const SECTION_HEADER_ATTRIBUTE_NAME = 'data-title';

export const FORM_ATTRIBUTES = [
  { name: 'mandatoryTags', default: []},
  { name: 'allowListModules', default: []},
] as const;

type MapCreateButtonsAttrSpec<K extends keyof MapCreateButtonsProps> = {
  name: K;
  default?: any;
};

type AnyMapCreateButtonsAttrSpec = {
  [K in keyof MapCreateButtonsProps]: MapCreateButtonsAttrSpec<K>;
}[keyof MapCreateButtonsProps];

export const MAP_CREATE_BUTTONS_ATTRIBUTES = [
  { name: 'views', default: []},
  { name: 'type', default: 'simple'},
] as const satisfies readonly AnyMapCreateButtonsAttrSpec[];

type PlanGalleryAttrSpec<K extends keyof PlanGalleryProps> = {
  name: K;
  default?: any;
};

type AnyPlanGalleryAttrSpec = {
  [K in keyof PlanGalleryProps]: PlanGalleryAttrSpec<K>;
}[keyof PlanGalleryProps];

export const PLAN_GALLERY_ATTRIBUTES = [
  { name: 'ids', default: null},
  { name: 'tags', default: null},
  { name: 'title', default: null},
  { name: 'description', default: null},
  { name: 'paginate',default: true},
  { name: 'showListView',default: true},
  { name: 'showThumbnails',default: true},
  { name: 'showTitles',default: true},
  { name: 'showDescriptions',default: true},
  { name: 'showUpdatedAt',default: true},
  { name: 'showTags',default: true},
  { name: 'showModule',default: true},
  { name: 'limit', default: 12},
] as const satisfies readonly AnyPlanGalleryAttrSpec[];

type CommentGalleryAttrSpec<K extends keyof CommentGalleryProps> = {
  name: K;
  default?: any;
};

type AnyCommentGalleryAttrSpec = {
  [K in keyof CommentGalleryProps]: CommentGalleryAttrSpec<K>;
}[keyof CommentGalleryProps];

export const COMMENT_GALLERY_ATTRIBUTES = [
  { name: 'title', default: null},
  { name: 'description', default: null},
  { name: 'ids', default: null},
  { name: 'tags', default: null},
  { name: 'place', default: null},
  { name: 'state', default: null},
  { name: 'zipCode', default: null},
  { name: 'limit', default: 10},
  { name: 'showIdentifier', default: true},
  { name: 'showTitles', default: true},
  { name: 'showPlaces', default: true},
  { name: 'showStates', default: true},
  { name: 'showZipCodes', default: true},
  { name: 'showCreatedAt', default: true},
  { name: 'showListView', default: true},
  { name: 'paginate', default: true},
  { name: 'showFilters', default: false},
  { name: 'showMaps', default: true},
] as const satisfies readonly AnyCommentGalleryAttrSpec[];
