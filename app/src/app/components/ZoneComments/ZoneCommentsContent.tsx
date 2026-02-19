'use client';
import {
  Flex,
  Text,
  Button,
  TextArea,
  IconButton,
  Box,
  Separator,
  ScrollArea,
  AlertDialog,
  Tooltip,
  Badge,
} from '@radix-ui/themes';
import {PlusIcon, Cross2Icon, Pencil1Icon, ExclamationTriangleIcon, CheckIcon} from '@radix-ui/react-icons';
import {useMapStore} from '@/app/store/mapStore';
import {useState} from 'react';
import {DocumentComment} from '@/app/utils/api/apiHandlers/types';
import {MODERATION_COMMENT_TEXT} from '@/app/constants/notifications';

const MAX_COMMENT_LENGTH = 240;
const MAX_COMMENTS_PER_DISTRICT = 10;
import {flagComment} from '@/app/utils/api/apiHandlers/reviewHandlers';

interface CommentFlagButtonProps {
  comment: DocumentComment;
  isFlagged: boolean;
  isFlagging: boolean;
  onFlag: (comment: DocumentComment) => void;
}

export const CommentFlagButton: React.FC<CommentFlagButtonProps> = ({
  comment,
  isFlagged,
  isFlagging,
  onFlag,
}) => {
  const parsedId = comment.comment_id ? parseInt(String(comment.comment_id), 10) : NaN;
  if (Number.isNaN(parsedId)) return null;

  return (
    <Tooltip
      content={
        comment.moderated
          ? 'This comment was moderated. If you believe this was in error, flag for review.'
          : 'Is this comment offensive? Flag for review.'
      }
    >
        <IconButton
          size="1"
          variant="ghost"
          color={isFlagged ? 'green' : 'amber'}
          onClick={() => onFlag(comment)}
          disabled={isFlagging || isFlagged}
        >
          <ExclamationTriangleIcon />
        </IconButton>
    </Tooltip>
  );
};

interface CommentEditorProps {
  existingComment?: DocumentComment;
  onSave: (text: string) => void;
  onCancel: () => void;
}

export const CommentEditor: React.FC<CommentEditorProps> = ({
  existingComment,
  onSave,
  onCancel,
}) => {
  const [text, setText] = useState(existingComment?.text || '');
  const setErrorNotification = useMapStore(state => state.setErrorNotification);

  const handleSave = () => {
    const trimmed = text.trim();
    if (trimmed === MODERATION_COMMENT_TEXT) {
      setErrorNotification({
        message: "Please edit your comment to remove the moderation message.",
        severity: 2,
      });
      return;
    }
    if (trimmed) {
      if (trimmed.length > MAX_COMMENT_LENGTH) {
        setErrorNotification({
          message: `Comment must be ${MAX_COMMENT_LENGTH} characters or less.`,
          severity: 2,
        });
        return;
      }
      onSave(trimmed);
    }
  };

  return (
    <Flex direction="column" gap="2" className="p-2 bg-gray-50 rounded-md">
      <TextArea
        placeholder="Enter your comment... (max 240 characters)"
        value={text}
        onChange={e => setText(e.target.value.slice(0, MAX_COMMENT_LENGTH))}
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
          disabled={!text.trim() || text.trim().length > MAX_COMMENT_LENGTH}
        >
          <CheckIcon />
          Save
        </Button>
      </Flex>
    </Flex>
  );
};

export interface ZoneCommentsContentProps {
  zone: number;
  color: string;
  /** When true, show add/edit/delete controls */
  showEditingControls?: boolean;
  /** When true, show + button to add new comment */
  showAddButton?: boolean;
  /** Max height for scroll area */
  scrollMaxHeight?: number;
}

export const ZoneCommentsContent: React.FC<ZoneCommentsContentProps> = ({
  zone,
  color,
  showEditingControls = false,
  showAddButton = false,
  scrollMaxHeight = 250,
}) => {
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [deleteConfirmIndex, setDeleteConfirmIndex] = useState<number | null>(null);
  const [flaggingCommentId, setFlaggingCommentId] = useState<number | null>(null);
  const [flaggedCommentIds, setFlaggedCommentIds] = useState<Set<number>>(new Set());

  const comments = useMapStore(state => state.getZoneCommentsForZone(zone));
  const setErrorNotification = useMapStore(state => state.setErrorNotification);
  const addZoneComment = useMapStore(state => state.addZoneComment);
  const editZoneComment = useMapStore(state => state.editZoneComment);
  const removeZoneComment = useMapStore(state => state.removeZoneComment);

  const handleAddComment = (text: string) => {
    const commentsForZone = useMapStore.getState().getZoneCommentsForZone(zone);
    if (commentsForZone.length >= MAX_COMMENTS_PER_DISTRICT) {
      setErrorNotification({
        message: `Maximum ${MAX_COMMENTS_PER_DISTRICT} comments per district.`,
        severity: 2,
      });
      return;
    }
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

  const handleFlagComment = async (comment: DocumentComment) => {
    const parsedId = comment.comment_id ? parseInt(String(comment.comment_id), 10) : NaN;
    if (Number.isNaN(parsedId)) return;
    setFlaggingCommentId(parsedId);
    const result = await flagComment(parsedId);
    setFlaggingCommentId(null);
    if (result.ok) {
      setFlaggedCommentIds(prev => new Set(prev).add(parsedId));
    } else {
      setErrorNotification({message: result.error ?? 'Failed to flag comment.', severity: 2});
    }
  };

  return (
    <>
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
          {showAddButton && !isAddingComment && (
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
            {showEditingControls && ' Click + to add one.'}
          </Text>
        ) : (
          <ScrollArea style={{maxHeight: scrollMaxHeight}}>
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
                      {comment.moderated && (
                        <Badge size="1" color="amber">
                          Moderated: This comment will not be visible to the public.
                        </Badge>
                      )}
                      <Flex justify="between" align="center" gap="1">
                        <Text size="1" style={{flex: 1, minWidth: 0}}>
                          {comment.text}
                        </Text>
                        <Flex gap="1" style={{flexShrink: 0}} align="center" justify="center">
                          {showEditingControls && (
                            <>
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
                            </>
                          )}
                          <CommentFlagButton
                            comment={comment}
                            isFlagged={
                              comment.comment_id
                                ? flaggedCommentIds.has(parseInt(String(comment.comment_id), 10))
                                : false
                            }
                            isFlagging={
                              comment.comment_id
                                ? flaggingCommentId === parseInt(String(comment.comment_id), 10)
                                : false
                            }
                            onFlag={handleFlagComment}
                          />
                        </Flex>
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
