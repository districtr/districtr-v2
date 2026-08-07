import React from 'react';
import parse from 'html-react-parser';
import {domNodeReplacers} from './CustomRenderers/DomNodeRenderers';
import BoilerplateNodeRenderer from '@/app/components/Cms/RichTextEditor/extensions/Boilerplate/BoilerplateNodeRenderer';
import {ContentHeader} from '../Static/ContentHeader';
import {CommentSubmissionForm} from '../Forms/CommentSubmissionForm';
import {PlanGallery} from '../Cms/RichTextEditor/extensions/PlanGallery/PlanGallery';
import {MapCreateButtons} from '../Cms/RichTextEditor/extensions/MapCreateButtons/MapCreateButtons';
import {CommentGallery} from '../Cms/RichTextEditor/extensions/CommentGallery/CommentGallery';
import {CMSBodyBlock} from '@/app/utils/api/cmsContent';

interface StreamRendererProps {
  body: CMSBodyBlock[];
  className?: string;
  disabled?: boolean;
}

/**
 * Renders a Wagtail StreamField body (`[{type, value, id}]`) from the CMS
 * content API. HTML blocks go through the same html-react-parser pipeline as
 * the legacy TipTap renderer; custom blocks map to the same React components.
 */
const StreamRenderer: React.FC<StreamRendererProps> = ({
  body,
  disabled = false,
  className = '',
}) => {
  const parseOptions = {replace: domNodeReplacers(disabled)};

  const renderBlock = (block: CMSBodyBlock) => {
    switch (block.type) {
      case 'rich_text':
        return <React.Fragment key={block.id}>{parse(block.value, parseOptions)}</React.Fragment>;
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
        return <PlanGallery key={block.id} {...block.value} />;
      case 'comment_gallery':
        return <CommentGallery key={block.id} {...block.value} />;
      case 'form':
        return (
          <CommentSubmissionForm
            key={block.id}
            disabled={disabled}
            mandatoryTags={block.value.mandatoryTags}
            allowListModules={block.value.allowListModules}
          />
        );
      case 'map_create_buttons':
        return <MapCreateButtons key={block.id} {...block.value} />;
      default:
        return null;
    }
  };

  return <div className={`prose prose-sm max-w-none ${className}`}>{body.map(renderBlock)}</div>;
};

export default StreamRenderer;
