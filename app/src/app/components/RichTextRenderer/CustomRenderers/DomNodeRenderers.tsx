import {DOMNode} from 'html-react-parser';
import BoilerplateNodeRenderer from '../../Cms/RichTextEditor/extensions/Boilerplate/BoilerplateNodeRenderer';
import GroupNodeRenderer from '../../Cms/RichTextEditor/extensions/Group/GroupNodeRenderer';

export const domNodeReplacers = (domNode: DOMNode) => {
  if (domNode.type === 'tag' && domNode.attribs?.['data-type']?.length) {
    switch (domNode.attribs['data-type']) {
      case 'boilerplate-node':
        const boilerplateData = domNode.attribs['data-custom-content'];
        const boilerplateContent = boilerplateData ? JSON.parse(boilerplateData) : null;
        return <BoilerplateNodeRenderer customContent={boilerplateContent} />;
      
      case 'group-node':
        const groupData = domNode.attribs['data-custom-content'];
        const groupSlugsData = domNode.attribs['data-group-slugs'];
        const customContent = groupData ? JSON.parse(groupData) : null;
        const groupSlugs = groupSlugsData ? JSON.parse(groupSlugsData) : [];
        return <GroupNodeRenderer customContent={customContent} groupSlugs={groupSlugs} />;
    }
  }
};
