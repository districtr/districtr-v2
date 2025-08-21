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
          const ids = readCSV(domNode.attribs['ids'])?.map(Number);
          const tags = readCSV(domNode.attribs['tags']);
          const title = domNode.attribs['title'];
          const description = domNode.attribs['description'];
          const limit = readNumber(domNode.attribs['limit']);
          const paginate = readBool(domNode.attribs['paginate']);
          const showListView = readBool(domNode.attribs['showListView']);
          const showThumbnails = readBool(domNode.attribs['showThumbnails']);
          const showTitles = readBool(domNode.attribs['showTitles']);
          const showDescriptions = readBool(domNode.attribs['showDescriptions']);
          const showUpdatedAt = readBool(domNode.attribs['showUpdatedAt']);
          const showTags = readBool(domNode.attribs['showTags']);
          const showModule = readBool(domNode.attribs['showModule']);
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
          const mandatoryTags = JSON.parse(domNode.attribs['data-mandatory-tags']);
          const allowListModules = JSON.parse(domNode.attribs['data-allow-list-modules']);
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
