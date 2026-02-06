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
import {ZoneComment} from '@/app/utils/api/apiHandlers/types';
import {useMapControlsStore} from '@/app/store/mapControlsStore';
import {
  postZoneComment,
  patchZoneComment,
  deleteZoneComment,
} from '@/app/utils/api/apiHandlers/zoneComments';

interface CommentEditorProps {
  existingComment?: ZoneComment;
  onSave: (title: string, comment: string) => void;
  onCancel: () => void;
  isSaving?: boolean;
}

const CommentEditor: React.FC<CommentEditorProps> = ({
  existingComment,
  onSave,
  onCancel,
  isSaving = false,
}) => {
  // Local state while actively typing - state lives in mapDocument only when not editing
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
        <Button size="1" variant="soft" color="gray" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          size="1"
          variant="solid"
          onClick={handleSave}
          disabled={!title.trim() || !comment.trim() || isSaving}
        >
          <CheckIcon />
          {isSaving ? 'Saving...' : 'Save'}
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
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const comments = useMapStore(state => state.getZoneCommentsForZone(zone));
  const addZoneComment = useMapStore(state => state.addZoneComment);
  const editZoneComment = useMapStore(state => state.editZoneComment);
  const removeZoneComment = useMapStore(state => state.removeZoneComment);
  const mapDocument = useMapStore(state => state.mapDocument);
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const isEditing = useMapControlsStore(state => state.isEditing);
  const selectedZone = useMapControlsStore(state => state.selectedZone);

  const handleAddComment = async (title: string, comment: string) => {
    if (!mapDocument?.document_id) return;
    setIsSaving(true);
    setSaveError(null);
    const result = await postZoneComment(mapDocument.document_id, zone, title, comment);
    if (result.ok) {
      addZoneComment(zone, {
        id: result.response.id,
        zone,
        title: result.response.title,
        comment: result.response.comment,
        created_at: result.response.created_at,
      });
      setIsAddingComment(false);
    } else {
      setSaveError(result.error);
      setErrorNotification({
        message: `Failed to save comment: ${result.error}`,
        severity: 2,
      });
    }
    setIsSaving(false);
  };

  const handleEditComment = async (index: number, title: string, comment: string) => {
    const existingComment = comments[index];
    if (!existingComment?.id) return;
    setIsSaving(true);
    setSaveError(null);
    const result = await patchZoneComment(existingComment.id, title, comment);
    if (result.ok) {
      editZoneComment(zone, index, result.response.title, result.response.comment);
      setEditingIndex(null);
    } else {
      setSaveError(result.error);
      setErrorNotification({
        message: `Failed to update comment: ${result.error}`,
        severity: 2,
      });
    }
    setIsSaving(false);
  };

  const handleDeleteClick = (index: number) => {
    setDeleteConfirmIndex(index);
  };

  const handleConfirmDelete = async () => {
    const index = deleteConfirmIndex;
    if (index === null) return;
    setDeleteConfirmIndex(null);

    const existingComment = comments[index];
    if (existingComment?.id) {
      setIsSaving(true);
      const result = await deleteZoneComment(existingComment.id);
      if (result.ok) {
        removeZoneComment(zone, index);
      } else {
        setErrorNotification({
          message: `Failed to delete comment: ${result.error}`,
          severity: 2,
        });
      }
      setIsSaving(false);
    } else {
      removeZoneComment(zone, index);
    }
  };

  const commentCount = comments.length;
  const shouldShowPublic =
    !isEditing && commentCount > 0;
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

          {saveError && (
            <Text size="1" color="red">
              {saveError}
            </Text>
          )}

          {isAddingComment && (
            <CommentEditor
              onSave={handleAddComment}
              onCancel={() => {
                setIsAddingComment(false);
                setSaveError(null);
              }}
              isSaving={isSaving}
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
                  <Box key={comment.id ?? index}>
                    {editingIndex === index ? (
                      <CommentEditor
                        existingComment={comment}
                        onSave={(title, commentText) =>
                          handleEditComment(index, title, commentText)
                        }
                        onCancel={() => {
                          setEditingIndex(null);
                          setSaveError(null);
                        }}
                        isSaving={isSaving}
                      />
                    ) : (
                      <Flex direction="column" gap="1" className="p-2 bg-gray-50 rounded">
                        <Flex justify="between" align="start">
                          <Text size="1" weight="medium">
                            {comment.title}
                          </Text>
                          {isEditing && (
                            <Flex gap="1">
                              <IconButton
                                size="1"
                                variant="ghost"
                                onClick={() => setEditingIndex(index)}
                                disabled={isSaving}
                              >
                                <Pencil1Icon />
                              </IconButton>
                              <IconButton
                                size="1"
                                variant="ghost"
                                color="red"
                                onClick={() => handleDeleteClick(index)}
                                disabled={isSaving}
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
