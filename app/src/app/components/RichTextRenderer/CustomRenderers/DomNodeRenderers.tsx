import {DOMNode} from 'html-react-parser';
import BoilerplateNodeRenderer from '../../Cms/RichTextEditor/extensions/Boierplate/BoilerplateNodeRenderer';
import { PlanGallery } from '../../Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';

export const domNodeReplacers = (domNode: DOMNode) => {
  if (domNode.type === 'tag' && domNode.attribs?.['data-type']?.length) {
    switch (domNode.attribs['data-type']) {
      case 'boilerplate-node':
        const data = domNode.attribs['data-custom-content'];
        const customContent = data ? JSON.parse(data) : null;
        return <BoilerplateNodeRenderer customContent={customContent} />;
      case 'plan-gallery-node':
        const ids = domNode.attribs['ids']?.split(',')?.map(Number);
        const tags = domNode.attribs['tags']?.split(',');
        const title = domNode.attribs['title'];
        const description = domNode.attribs['description'];
        const paginate = JSON.parse(domNode.attribs['paginate'] ?? 'false');
        const limit = +(domNode.attribs['limit'] ?? 12);
        return <PlanGallery ids={ids} tags={tags} title={title} description={description} paginate={paginate} limit={limit} />;
    }
  }
};
