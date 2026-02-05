'use client';
import {
  Flex,
  Text,
  Button,
  TextArea,
  TextField,
  IconButton,
  Badge,
  Box,
  Popover,
  Separator,
  ScrollArea,
} from '@radix-ui/themes';
import {
  ChatBubbleIcon,
  PlusIcon,
  Cross2Icon,
  Pencil1Icon,
  CheckIcon,
} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useState} from 'react';
import {ZoneComment} from '@/app/utils/api/apiHandlers/types';
import { useMapControlsStore } from '@/app/store/mapControlsStore';

interface CommentEditorProps {
  existingComment?: ZoneComment;
  onSave: (title: string, comment: string) => void;
  onCancel: () => void;
}

const CommentEditor: React.FC<CommentEditorProps> = ({existingComment, onSave, onCancel}) => {
  const [title, setTitle] = useState(existingComment?.title || '');
  const [comment, setComment] = useState(existingComment?.comment || '');

  const handleSave = () => {
    if (title.trim() && comment.trim()) {
      onSave(title.trim(), comment.trim());
    }
  };

  return (
    <Flex direction="column" gap="2" className="p-2 bg-gray-50 rounded-md">
      <TextField.Root
        placeholder="Comment title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        size="1"
      />
      <TextArea
        placeholder="Enter your comment..."
        value={comment}
        onChange={e => setComment(e.target.value)}
        size="1"
        rows={3}
      />
      <Flex gap="2" justify="end">
        <Button size="1" variant="soft" color="gray" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          size="1"
          variant="solid"
          onClick={handleSave}
          disabled={!title.trim() || !comment.trim()}
        >
          <CheckIcon />
          Save
        </Button>
      </Flex>
    </Flex>
  );
};

interface ZoneCommentPopoverProps {
  zone: number;
  color: string;
  disabled?: boolean;
}

export const ZoneCommentPopover: React.FC<ZoneCommentPopoverProps> = ({zone, color, disabled}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const comments = useMapStore(state => state.getZoneCommentsForZone(zone));
  const addZoneComment = useMapStore(state => state.addZoneComment);
  const editZoneComment = useMapStore(state => state.editZoneComment);
  const removeZoneComment = useMapStore(state => state.removeZoneComment);
  const mapDocument = useMapStore(state => state.mapDocument);
  const isEditing = mapDocument?.access === 'edit' && !disabled;
  const selectedZone = useMapControlsStore(state => state.selectedZone);

  const handleAddComment = (title: string, comment: string) => {
    addZoneComment(zone, title, comment);
    setIsAddingComment(false);
  };

  const handleEditComment = (index: number, title: string, comment: string) => {
    editZoneComment(zone, index, title, comment);
    setEditingIndex(null);
  };

  const handleRemoveComment = (index: number) => {
    if (confirm('Are you sure you want to delete this comment?')) {
      removeZoneComment(zone, index);
    }
  };

  const commentCount = comments.length;
  const hasUnsaved = comments.some(c => c.isLocal);
  const shouldShowPublic = !isEditing && commentCount > 0
  const shouldShowEditing = isEditing && (isAddingComment || commentCount > 0 || selectedZone === zone)
  return (
    <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
      <Popover.Trigger>
        <IconButton
          variant="ghost"
          size="1"
          className={`relative mr-4
            ${shouldShowPublic || shouldShowEditing ? 'opacity-100' : 'opacity-0'}
            hover:opacity-100
            transition-opacity duration-200
            `}
          disabled={disabled}
          style={{
            color: commentCount > 0 ? color : undefined,
          }}
        >
          <ChatBubbleIcon />
          {commentCount > 0 && (
            <Badge
              size="1"
              variant="solid"
              className="absolute top-0 right-0 min-w-[8px] h-[8px] p-0 flex items-center justify-center text-[10px] rounded-full"
              style={{
                backgroundColor: color
              }}
            >

            </Badge>
          )}
        </IconButton>
      </Popover.Trigger>
      <Popover.Content style={{width: 300}} align="start">
        <Flex direction="column" gap="2">
          <Flex align="center" justify="between">
            <Flex align="center" gap="2">
              <Box
                className="w-3 h-3 rounded-full border border-gray-400"
                style={{backgroundColor: color}}
              />
              <Text size="2" weight="bold">
                District {zone} Comments
              </Text>
            </Flex>
            {isEditing && !isAddingComment && (
              <IconButton size="1" variant="ghost" onClick={() => setIsAddingComment(true)}>
                <PlusIcon />
              </IconButton>
            )}
          </Flex>

          {isAddingComment && (
            <CommentEditor onSave={handleAddComment} onCancel={() => setIsAddingComment(false)} />
          )}

          {comments.length === 0 && !isAddingComment ? (
            <Text size="1" color="gray" className="py-2 text-center">
              No comments yet.
              {isEditing && ' Click + to add one.'}
            </Text>
          ) : (
            <ScrollArea style={{maxHeight: 250}}>
              <Flex direction="column" gap="2">
                {comments.map((comment, index) => (
                  <Box key={index}>
                    {editingIndex === index ? (
                      <CommentEditor
                        existingComment={comment}
                        onSave={(title, commentText) => handleEditComment(index, title, commentText)}
                        onCancel={() => setEditingIndex(null)}
                      />
                    ) : (
                      <Flex direction="column" gap="1" className="p-2 bg-gray-50 rounded">
                        <Flex justify="between" align="start">
                          <Text size="1" weight="medium">
                            {comment.title}
                            {comment.isLocal && (
                              <Badge size="1" color="orange" className="ml-2">
                                unsaved
                              </Badge>
                            )}
                          </Text>
                          {isEditing && (
                            <Flex gap="1">
                              <IconButton
                                size="1"
                                variant="ghost"
                                onClick={() => setEditingIndex(index)}
                              >
                                <Pencil1Icon />
                              </IconButton>
                              <IconButton
                                size="1"
                                variant="ghost"
                                color="red"
                                onClick={() => handleRemoveComment(index)}
                              >
                                <Cross2Icon />
                              </IconButton>
                            </Flex>
                          )}
                        </Flex>
                        <Text size="1" color="gray">
                          {comment.comment}
                        </Text>
                      </Flex>
                    )}
                    {index < comments.length - 1 && <Separator size="4" className="my-1" />}
                  </Box>
                ))}
              </Flex>
            </ScrollArea>
          )}
        </Flex>
      </Popover.Content>
    </Popover.Root>
  );
};

export default ZoneCommentPopover;
