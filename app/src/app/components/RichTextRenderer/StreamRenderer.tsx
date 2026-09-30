import React from 'react';
import parse from 'html-react-parser';
import BoilerplateNodeRenderer from '@/app/components/Cms/RichTextEditor/extensions/Boilerplate/BoilerplateNodeRenderer';
import {ContentHeader} from '../Static/ContentHeader';
import {SubmissionForm} from '../Forms/SubmissionForm';
import {PlanGallery} from '../Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import {MapCreateButtons} from '../Cms/RichTextEditor/extensions/MapCreateButtons/MapCreateButtons';
import {CommentGallery} from '../Cms/RichTextEditor/extensions/CommentGallery/CommentGallery';
import {CMSBodyBlock} from '@/app/utils/api/cmsContent';

interface StreamRendererProps {
  body: CMSBodyBlock[];
  className?: string;
}

/**
 * Renders a Wagtail StreamField body (`[{type, value, id}]`) from the CMS
 * content API. `rich_text` blocks are plain prose HTML; every custom block
 * maps to its React component.
 */
const StreamRenderer: React.FC<StreamRendererProps> = ({body, className = ''}) => {
  const renderBlock = (block: CMSBodyBlock) => {
    switch (block.type) {
      case 'rich_text':
        return <React.Fragment key={block.id}>{parse(block.value)}</React.Fragment>;
      case 'boilerplate':
        return (
          <BoilerplateNodeRenderer
            key={block.id}
            customContent={block.value.customContent ?? undefined}
          />
        );
      case 'section_header':
        return <ContentHeader key={block.id} title={block.value.title} />;
      case 'plan_gallery':
      case 'curated_gallery':
        return <PlanGallery key={block.id} {...block.value} />;
      case 'comment_gallery':
        return <CommentGallery key={block.id} {...block.value} />;
      case 'form':
        return <SubmissionForm key={block.id} {...block.value} />;
      case 'map_create_buttons':
        return <MapCreateButtons key={block.id} {...block.value} />;
      default:
        return null;
    }
  };

  return <div className={`prose prose-sm max-w-none ${className}`}>{body.map(renderBlock)}</div>;
};

export default StreamRenderer;
