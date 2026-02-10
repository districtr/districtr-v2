'use client';
import {
  Flex,
  Text,
  Button,
  TextArea,
  IconButton,
  Badge,
  Box,
  Popover,
  Separator,
  ScrollArea,
  AlertDialog,
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
import {DocumentComment} from '@/app/utils/api/apiHandlers/types';
import {useMapControlsStore} from '@/app/store/mapControlsStore';

interface CommentEditorProps {
  existingComment?: DocumentComment;
  onSave: (text: string) => void;
  onCancel: () => void;
}

const CommentEditor: React.FC<CommentEditorProps> = ({
  existingComment,
  onSave,
  onCancel,
}) => {
  const [text, setText] = useState(existingComment?.text || '');

  const handleSave = () => {
    if (text.trim()) {
      onSave(text.trim());
    }
  };

  return (
    <Flex direction="column" gap="2" className="p-2 bg-gray-50 rounded-md">
      <TextArea
        placeholder="Enter your comment..."
        value={text}
        onChange={e => setText(e.target.value)}
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
          disabled={!text.trim()}
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

export const ZoneCommentPopover: React.FC<ZoneCommentPopoverProps> = ({
  zone,
  color,
  disabled,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);

  const comments = useMapStore(state => state.getZoneCommentsForZone(zone));
  const addZoneComment = useMapStore(state => state.addZoneComment);
  const editZoneComment = useMapStore(state => state.editZoneComment);
  const removeZoneComment = useMapStore(state => state.removeZoneComment);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const selectedZone = useMapControlsStore(state => state.selectedZone);

  const handleAddComment = (text: string) => {
    addZoneComment(zone, {
      comment_id: crypto.randomUUID(),
      zone,
      text,
    });
    setIsAddingComment(false);
  };

  const handleEditComment = (index: number, text: string) => {
    editZoneComment(zone, index, text);
    setEditingIndex(null);
  };

  const handleDeleteClick = (index: number) => {
    setDeleteConfirmIndex(index);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmIndex === null) return;
    removeZoneComment(zone, deleteConfirmIndex);
    setDeleteConfirmIndex(null);
  };

  const commentCount = comments.length;
  const shouldShowPublic = !isEditing && commentCount > 0;
  const shouldShowEditing =
    isEditing && (isAddingComment || commentCount > 0 || selectedZone === zone);

  return (
    <>
      <Popover.Root open={isOpen} onOpenChange={setIsOpen}>
        <Popover.Trigger>
          <IconButton
            variant="ghost"
            size="1"
            className={`relative mr-2
              ${shouldShowPublic || shouldShowEditing ? 'opacity-100' : 'opacity-0'}
              ${isEditing && 'hover:opacity-100'}
              transition-opacity duration-200
            `}
            style={{
              color: commentCount > 0 ? color : undefined,
            }}
            disabled={disabled}
          >
            <ChatBubbleIcon />
            {commentCount > 0 && (
              <Badge
                size="1"
                variant="solid"
                className="absolute top-0 right-0 min-w-[8px] h-[8px] p-0 flex items-center justify-center text-[10px] rounded-full"
                style={{
                  backgroundColor: color,
                }}
              />
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
              <CommentEditor
                onSave={handleAddComment}
                onCancel={() => setIsAddingComment(false)}
              />
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
                    <Box key={comment.comment_id ?? index}>
                      {editingIndex === index ? (
                        <CommentEditor
                          existingComment={comment}
                          onSave={text => handleEditComment(index, text)}
                          onCancel={() => setEditingIndex(null)}
                        />
                      ) : (
                        <Flex direction="column" gap="1" className="p-2 bg-gray-50 rounded">
                          <Flex justify="between" align="start">
                            <Text size="1" style={{flex: 1}}>
                              {comment.text}
                            </Text>
                            {isEditing && (
                              <Flex gap="1" style={{flexShrink: 0}}>
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
                                  onClick={() => handleDeleteClick(index)}
                                >
                                  <Cross2Icon />
                                </IconButton>
                              </Flex>
                            )}
                          </Flex>
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

      <AlertDialog.Root
        open={deleteConfirmIndex !== null}
        onOpenChange={open => !open && setDeleteConfirmIndex(null)}
      >
        <AlertDialog.Content style={{maxWidth: 400}}>
          <AlertDialog.Title>Delete Comment</AlertDialog.Title>
          <AlertDialog.Description size="2">
            Are you sure you want to delete this comment? This cannot be undone.
          </AlertDialog.Description>
          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray">
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action>
              <Button variant="solid" color="red" onClick={handleConfirmDelete}>
                Delete
              </Button>
            </AlertDialog.Action>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </>
  );
};

export default ZoneCommentPopover;
