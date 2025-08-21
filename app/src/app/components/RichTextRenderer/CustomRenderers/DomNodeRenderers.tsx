import {DOMNode} from 'html-react-parser';
import BoilerplateNodeRenderer from '../../Cms/RichTextEditor/extensions/Boierplate/BoilerplateNodeRenderer';
import {ContentHeader} from '../../Static/ContentHeader';
import {CommentSubmissionForm} from '../../Forms/CommentSubmissionForm';
import {PlanGallery} from '../../Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import {readBool, readCSV, readNumber} from './DomNodeRendererUtils';

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
          const ids = JSON.parse(domNode.attribs['ids'] ?? 'undefined');
          const tags = JSON.parse(domNode.attribs['tags'] ?? 'undefined');
          const title = domNode.attribs['title'];
          const description = domNode.attribs['description'];
          const limit = JSON.parse(domNode.attribs['limit'] ?? 'undefined');
          const paginate = JSON.parse(domNode.attribs['paginate'] ?? 'undefined');
          const showListView = JSON.parse(domNode.attribs['showListView'] ?? 'undefined');
          const showThumbnails = JSON.parse(domNode.attribs['showThumbnails']);
          const showTitles = JSON.parse(domNode.attribs['showTitles']);
          const showDescriptions = JSON.parse(domNode.attribs['showDescriptions']);
          const showUpdatedAt = JSON.parse(domNode.attribs['showUpdatedAt']);
          const showTags = JSON.parse(domNode.attribs['showTags']);
          const showModule = JSON.parse(domNode.attribs['showModule']);
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
          const mandatoryTags = JSON.parse(domNode.attribs['mandatoryTags']);
          const allowListModules = JSON.parse(domNode.attribs['allowListModules']);
          return (
            <CommentSubmissionForm
              disabled={disabled}
              mandatoryTags={mandatoryTags}
              allowListModules={allowListModules}
            />
          );
      }
    }
  };
  return domNodeReplaceFn;
};
