import {DOMNode} from 'html-react-parser';
import BoilerplateNodeRenderer from '../../Cms/RichTextEditor/extensions/Boilerplate/BoilerplateNodeRenderer';
import {ContentHeader} from '../../Static/ContentHeader';
import {CommentSubmissionForm} from '../../Forms/CommentSubmissionForm';
import {
  PlanGallery,
  PlanGalleryProps,
} from '../../Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import {
  MapCreateButtons,
  MapCreateButtonsProps,
} from '../../Cms/RichTextEditor/extensions/MapCreateButtons/MapCreateButtons';
import {
  CommentGallery,
  CommentGalleryProps,
} from '../../Cms/RichTextEditor/extensions/CommentGallery/CommentGallery';
import {
  NODE_TYPE_ATTR_NAME,
  RICH_TEXT_NODE_TYPES,
  BOILERPLATE_ATTRIBUTE_NAME,
  SECTION_HEADER_ATTRIBUTE_NAME,
  FORM_ATTRIBUTES,
  MAP_CREATE_BUTTONS_ATTRIBUTES,
  COMMENT_GALLERY_ATTRIBUTES,
  PLAN_GALLERY_ATTRIBUTES,
} from '@constants/cms';

export const domNodeReplacers = (disabled: boolean) => {
  const domNodeReplaceFn = (domNode: DOMNode) => {
    if (domNode.type === 'tag' && domNode.attribs?.[NODE_TYPE_ATTR_NAME]?.length) {
      switch (domNode.attribs[NODE_TYPE_ATTR_NAME]) {
        case RICH_TEXT_NODE_TYPES.BOILERPLATE: {
          const data = domNode.attribs[BOILERPLATE_ATTRIBUTE_NAME];
          const customContent = data ? JSON.parse(data) : null;
          return <BoilerplateNodeRenderer customContent={customContent} />;
        }
        case RICH_TEXT_NODE_TYPES.SECTION_HEADER: {
          // Remove outer quotes
          const title = domNode.attribs[SECTION_HEADER_ATTRIBUTE_NAME]?.slice(1, -1);
          return <ContentHeader title={title} />;
        }
        case RICH_TEXT_NODE_TYPES.PLAN_GALLERY: {
          const props = Object.fromEntries(
            PLAN_GALLERY_ATTRIBUTES.map(attr => [
              attr.name,
              JSON.parse(domNode.attribs[attr.name] ?? 'null'),
            ])
          ) as PlanGalleryProps;
          return <PlanGallery {...props} />;
        }
        case RICH_TEXT_NODE_TYPES.FORM: {
          const props = Object.fromEntries(
            FORM_ATTRIBUTES.map(attr => [
              attr.name,
              JSON.parse(domNode.attribs[attr.name] ?? 'null'),
            ])
          );
          return (
            <CommentSubmissionForm
              disabled={disabled}
              mandatoryTags={props.mandatoryTags}
              allowListModules={props.allowListModules}
            />
          );
        }
        case RICH_TEXT_NODE_TYPES.MAP_CREATE_BUTTONS: {
          const props = Object.fromEntries(
            MAP_CREATE_BUTTONS_ATTRIBUTES.map(attr => [
              attr.name,
              JSON.parse(domNode.attribs[attr.name] ?? 'null'),
            ])
          ) as MapCreateButtonsProps;
          return <MapCreateButtons {...props} />;
        }
        case RICH_TEXT_NODE_TYPES.COMMENT_GALLERY: {
          const props = Object.fromEntries(
            COMMENT_GALLERY_ATTRIBUTES.map(attr => [
              attr.name,
              JSON.parse(domNode.attribs[attr.name] ?? 'null'),
            ])
          ) as CommentGalleryProps;
          return <CommentGallery {...props} />;
        }
      }
    }
  };
  return domNodeReplaceFn;
};
