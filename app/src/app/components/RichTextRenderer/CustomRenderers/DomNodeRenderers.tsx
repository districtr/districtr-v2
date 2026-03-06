import {DOMNode} from 'html-react-parser';
import BoilerplateNodeRenderer from '../../Cms/RichTextEditor/extensions/Boilerplate/BoilerplateNodeRenderer';
import {ContentHeader} from '../../Static/ContentHeader';
import {CommentSubmissionForm} from '../../Forms/CommentSubmissionForm';
import {PlanGallery} from '../../Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import {MapCreateButtons} from '../../Cms/RichTextEditor/extensions/MapCreateButtons/MapCreateButtons';
import {CommentGallery} from '../../Cms/RichTextEditor/extensions/CommentGallery/CommentGallery';
import {
  COMMENT_GALLERY_ATTRS,
  FORM_NODE_ATTRS,
  MAP_CREATE_BUTTONS_NODE_ATTRS,
  PLAN_GALLERY_ATTRS,
  RICH_TEXT_DATA_ATTRIBUTES,
  RICH_TEXT_NODE_TYPES,
} from '@constants/cms/richText';

type AttributedDomNode = DOMNode & {attribs?: Record<string, string | undefined>};

const parseJsonAttribute = (domNode: AttributedDomNode, attrName: string) =>
  JSON.parse(domNode.attribs?.[attrName] ?? 'null');

export const domNodeReplacers = (disabled: boolean) => {
  const domNodeReplaceFn = (domNode: DOMNode) => {
    const attributedNode = domNode as AttributedDomNode;
    const nodeType = attributedNode.attribs?.[RICH_TEXT_DATA_ATTRIBUTES.TYPE];
    if (domNode.type === 'tag' && nodeType?.length) {
      switch (nodeType) {
        case RICH_TEXT_NODE_TYPES.BOILERPLATE: {
          const customContent = parseJsonAttribute(
            attributedNode,
            RICH_TEXT_DATA_ATTRIBUTES.CUSTOM_CONTENT
          );
          return <BoilerplateNodeRenderer customContent={customContent} />;
        }
        case RICH_TEXT_NODE_TYPES.SECTION_HEADER: {
          const title = parseJsonAttribute(attributedNode, RICH_TEXT_DATA_ATTRIBUTES.TITLE);
          return <ContentHeader title={title} />;
        }
        case RICH_TEXT_NODE_TYPES.PLAN_GALLERY: {
          const ids = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.IDS);
          const tags = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.TAGS);
          const title = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.TITLE);
          const description = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.DESCRIPTION);
          const limit = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.LIMIT);
          const paginate = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.PAGINATE);
          const showListView = parseJsonAttribute(
            attributedNode,
            PLAN_GALLERY_ATTRS.SHOW_LIST_VIEW
          );
          const showThumbnails = parseJsonAttribute(
            attributedNode,
            PLAN_GALLERY_ATTRS.SHOW_THUMBNAILS
          );
          const showTitles = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.SHOW_TITLES);
          const showDescriptions = parseJsonAttribute(
            attributedNode,
            PLAN_GALLERY_ATTRS.SHOW_DESCRIPTIONS
          );
          const showUpdatedAt = parseJsonAttribute(
            attributedNode,
            PLAN_GALLERY_ATTRS.SHOW_UPDATED_AT
          );
          const showTags = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.SHOW_TAGS);
          const showModule = parseJsonAttribute(attributedNode, PLAN_GALLERY_ATTRS.SHOW_MODULE);
          return (
            <PlanGallery
              ids={ids}
              tags={tags}
              title={title}
              description={description}
              paginate={paginate}
              limit={limit}
              showListView={showListView}
              showThumbnails={showThumbnails}
              showTitles={showTitles}
              showDescriptions={showDescriptions}
              showUpdatedAt={showUpdatedAt}
              showTags={showTags}
              showModule={showModule}
            />
          );
        }
        case RICH_TEXT_NODE_TYPES.FORM: {
          const mandatoryTags = parseJsonAttribute(attributedNode, FORM_NODE_ATTRS.MANDATORY_TAGS);
          const allowListModules = parseJsonAttribute(
            attributedNode,
            FORM_NODE_ATTRS.ALLOW_LIST_MODULES
          );
          return (
            <CommentSubmissionForm
              disabled={disabled}
              mandatoryTags={mandatoryTags}
              allowListModules={allowListModules}
            />
          );
        }
        case RICH_TEXT_NODE_TYPES.MAP_CREATE_BUTTONS: {
          const views = parseJsonAttribute(attributedNode, MAP_CREATE_BUTTONS_NODE_ATTRS.VIEWS);
          const type = parseJsonAttribute(attributedNode, MAP_CREATE_BUTTONS_NODE_ATTRS.TYPE);
          return <MapCreateButtons views={views} type={type} />;
        }
        case RICH_TEXT_NODE_TYPES.COMMENT_GALLERY: {
          const ids = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.IDS);
          const tags = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.TAGS);
          const limit = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.LIMIT);
          const place = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.PLACE);
          const state = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.STATE);
          const zipCode = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.ZIP_CODE);
          const showIdentifier = parseJsonAttribute(
            attributedNode,
            COMMENT_GALLERY_ATTRS.SHOW_IDENTIFIER
          );
          const showTitles = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.SHOW_TITLES);
          const title = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.TITLE);
          const description = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.DESCRIPTION);
          const showPlaces = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.SHOW_PLACES);
          const showStates = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.SHOW_STATES);
          const showZipCodes = parseJsonAttribute(
            attributedNode,
            COMMENT_GALLERY_ATTRS.SHOW_ZIP_CODES
          );
          const showCreatedAt = parseJsonAttribute(
            attributedNode,
            COMMENT_GALLERY_ATTRS.SHOW_CREATED_AT
          );
          const showListView = parseJsonAttribute(
            attributedNode,
            COMMENT_GALLERY_ATTRS.SHOW_LIST_VIEW
          );
          const paginate = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.PAGINATE);
          const showFilters = parseJsonAttribute(
            attributedNode,
            COMMENT_GALLERY_ATTRS.SHOW_FILTERS
          );
          const showMaps = parseJsonAttribute(attributedNode, COMMENT_GALLERY_ATTRS.SHOW_MAPS);
          return (
            <CommentGallery
              ids={ids}
              tags={tags}
              limit={limit}
              place={place}
              state={state}
              zipCode={zipCode}
              showIdentifier={showIdentifier}
              showTitles={showTitles}
              showPlaces={showPlaces}
              title={title}
              description={description}
              showStates={showStates}
              showZipCodes={showZipCodes}
              showCreatedAt={showCreatedAt}
              showListView={showListView}
              paginate={paginate}
              showFilters={showFilters}
              showMaps={showMaps}
            />
          );
        }
      }
    }
  };
  return domNodeReplaceFn;
};
