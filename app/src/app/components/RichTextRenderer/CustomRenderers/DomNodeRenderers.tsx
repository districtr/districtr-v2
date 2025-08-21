import {DOMNode} from 'html-react-parser';
import BoilerplateNodeRenderer from '../../Cms/RichTextEditor/extensions/Boierplate/BoilerplateNodeRenderer';
import {ContentHeader} from '../../Static/ContentHeader';
import {CommentSubmissionForm} from '../../Forms/CommentSubmissionForm';
import {PlanGallery} from '../../Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import {MapCreateButtons} from '../../Cms/RichTextEditor/extensions/MapCreateButtons/MapCreateButtons';

export const domNodeReplacers = (disabled: boolean) => {
  const domNodeReplaceFn = (domNode: DOMNode) => {
    if (domNode.type === 'tag' && domNode.attribs?.['data-type']?.length) {
      switch (domNode.attribs['data-type']) {
        case 'boilerplate-node':
          const data = domNode.attribs['data-custom-content'];
          const customContent = data ? JSON.parse(data) : null;
          return <BoilerplateNodeRenderer customContent={customContent} />;
        case 'section-header-node':
          // Remove outer quotes
          const title = domNode.attribs['data-title']?.slice(1, -1);
          return <ContentHeader title={title} />;
        case 'plan-gallery-node': {
          const ids = JSON.parse(domNode.attribs['ids'] ?? 'null');
          const tags = JSON.parse(domNode.attribs['tags'] ?? 'null');
          const title = JSON.parse(domNode.attribs['title'] ?? 'null');
          const description = JSON.parse(domNode.attribs['description'] ?? 'null');
          const limit = JSON.parse(domNode.attribs['limit'] ?? 'null');
          const paginate = JSON.parse(domNode.attribs['paginate'] ?? 'null');
          const showListView = JSON.parse(domNode.attribs['showListView'] ?? 'null');
          const showThumbnails = JSON.parse(domNode.attribs['showThumbnails'] ?? 'null');
          const showTitles = JSON.parse(domNode.attribs['showTitles'] ?? 'null');
          const showDescriptions = JSON.parse(domNode.attribs['showDescriptions'] ?? 'null');
          const showUpdatedAt = JSON.parse(domNode.attribs['showUpdatedAt'] ?? 'null');
          const showTags = JSON.parse(domNode.attribs['showTags'] ?? 'null');
          const showModule = JSON.parse(domNode.attribs['showModule'] ?? 'null');
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
        case 'form-node':
          const mandatoryTags = JSON.parse(domNode.attribs['mandatoryTags'] ?? 'null');
          const allowListModules = JSON.parse(domNode.attribs['allowListModules'] ?? 'null');
          return (
            <CommentSubmissionForm
              disabled={disabled}
              mandatoryTags={mandatoryTags}
              allowListModules={allowListModules}
            />
          );
        case 'map-create-buttons-node':
          const views = JSON.parse(domNode.attribs['views'] ?? 'null');
          const type = JSON.parse(domNode.attribs['type'] ?? 'null');
          return <MapCreateButtons views={views} type={type} />;
      }
    }
  };
  return domNodeReplaceFn;
};
