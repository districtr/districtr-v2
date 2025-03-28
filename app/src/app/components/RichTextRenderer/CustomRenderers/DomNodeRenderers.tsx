import { DOMNode } from "html-react-parser";
import BoilerplateNodeRenderer from "../../Cms/RichTextEditor/extensions/Boierplate/BoilerplateNodeRenderer";

export const domNodeReplacers = (domNode: DOMNode) => {
  if (domNode.type === 'tag' && domNode.attribs?.['data-type']?.length) {
    switch (domNode.attribs['data-type']) {
      case 'boilerplate-node':
        const data = domNode.attribs['data-custom-content'];
        const customContent = data ? JSON.parse(data) : null;
        return <BoilerplateNodeRenderer customContent={customContent} />;
    }
  }
}