import {DOMNode} from 'html-react-parser';
import BoilerplateNodeRenderer from '../../Cms/RichTextEditor/extensions/Boierplate/BoilerplateNodeRenderer';
import {ContentHeader} from '../../Static/ContentHeader';
import {CommentSubmissionForm} from '../../Forms/CommentSubmissionForm';

export const domNodeReplacers = (disabled: boolean) =>
  (domNode: DOMNode) => {
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
