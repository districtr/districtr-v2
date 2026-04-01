'use client';
import React, {useState, useCallback} from 'react';
import {useDocumentInfo, useAuth} from '@payloadcms/ui';

type WorkflowStatus = 'draft' | 'pending_review' | 'approved' | 'changes_requested';

const STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending Review',
  approved: 'Approved',
  changes_requested: 'Changes Requested',
};

const STATUS_COLORS: Record<WorkflowStatus, string> = {
  draft: '#6b7280',
  pending_review: '#d97706',
  approved: '#059669',
  changes_requested: '#dc2626',
};

export default function WorkflowSidebar() {
  const {id, collectionSlug, initialData} = useDocumentInfo();
  const {user} = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotesInput, setShowNotesInput] = useState(false);
  const [notes, setNotes] = useState('');
  const [currentStatus, setCurrentStatus] = useState<WorkflowStatus | undefined>(undefined);

  const workflowStatus: WorkflowStatus =
    currentStatus ?? (initialData as any)?.workflowStatus ?? 'draft';
  const reviewNotes = (initialData as any)?.reviewNotes;
  const role = (user as any)?.role;
  const isAdmin = role === 'admin';
  const isEditor = role === 'editor';

  const updateWorkflow = useCallback(
    async (newStatus: WorkflowStatus, extraData?: Record<string, unknown>) => {
      if (!id || !collectionSlug) return;
      setLoading(true);
      setError(null);
      try {
        const body: Record<string, unknown> = {
          workflowStatus: newStatus,
          ...extraData,
        };

        // When approving, also publish the document
        if (newStatus === 'approved') {
          body._status = 'published';
        }

        const res = await fetch(`/api/${collectionSlug}/${id}`, {
          method: 'PATCH',
          headers: {'Content-Type': 'application/json'},
          credentials: 'include',
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          throw new Error(data?.errors?.[0]?.message || `Request failed (${res.status})`);
        }

        setCurrentStatus(newStatus);
        setShowNotesInput(false);
        setNotes('');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    },
    [id, collectionSlug]
  );

  // Don't render if document hasn't been saved yet
  if (!id) return null;

  return (
    <div
      style={{
        padding: '16px',
        borderTop: '1px solid var(--theme-elevation-150)',
        marginTop: '16px',
      }}
    >
      <h4
        style={{
          fontSize: '13px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--theme-elevation-400)',
          margin: '0 0 12px',
        }}
      >
        Workflow
      </h4>

      {/* Current Status */}
      <div style={{marginBottom: '12px'}}>
        <span
          style={{
            display: 'inline-block',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: 600,
            color: '#fff',
            backgroundColor: STATUS_COLORS[workflowStatus],
          }}
        >
          {STATUS_LABELS[workflowStatus]}
        </span>
      </div>

      {/* Review Notes (when changes are requested) */}
      {workflowStatus === 'changes_requested' && reviewNotes && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: 'var(--theme-elevation-50)',
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '13px',
          }}
        >
          <strong style={{display: 'block', marginBottom: '4px'}}>Reviewer Notes:</strong>
          {reviewNotes}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div
          style={{
            padding: '8px 12px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '13px',
            color: '#dc2626',
          }}
        >
          {error}
        </div>
      )}

      {/* Editor: Submit for Review */}
      {isEditor && (workflowStatus === 'draft' || workflowStatus === 'changes_requested') && (
        <button
          onClick={() => updateWorkflow('pending_review')}
          disabled={loading}
          style={{
            width: '100%',
            padding: '8px 16px',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Submitting...' : 'Submit for Review'}
        </button>
      )}

      {/* Admin: Approve / Request Changes for pending items */}
      {isAdmin && workflowStatus === 'pending_review' && (
        <div style={{display: 'flex', flexDirection: 'column', gap: '8px'}}>
          <button
            onClick={() => updateWorkflow('approved')}
            disabled={loading}
            style={{
              width: '100%',
              padding: '8px 16px',
              backgroundColor: '#059669',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? 'Approving...' : 'Approve & Publish'}
          </button>

          {!showNotesInput ? (
            <button
              onClick={() => setShowNotesInput(true)}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px 16px',
                backgroundColor: '#dc2626',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.6 : 1,
              }}
            >
              Request Changes
            </button>
          ) : (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '8px',
                border: '1px solid var(--theme-elevation-150)',
                borderRadius: '4px',
              }}
            >
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Describe what changes are needed..."
                rows={3}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid var(--theme-elevation-200)',
                  borderRadius: '4px',
                  fontSize: '13px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <div style={{display: 'flex', gap: '8px'}}>
                <button
                  onClick={() =>
                    updateWorkflow('changes_requested', {reviewNotes: notes})
                  }
                  disabled={loading || !notes.trim()}
                  style={{
                    flex: 1,
                    padding: '6px 12px',
                    backgroundColor: '#dc2626',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: loading || !notes.trim() ? 'not-allowed' : 'pointer',
                    opacity: loading || !notes.trim() ? 0.6 : 1,
                  }}
                >
                  {loading ? 'Sending...' : 'Send'}
                </button>
                <button
                  onClick={() => {
                    setShowNotesInput(false);
                    setNotes('');
                  }}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: 'transparent',
                    color: 'var(--theme-elevation-600)',
                    border: '1px solid var(--theme-elevation-200)',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Admin: Allow re-submitting approved content back to draft */}
      {isAdmin && workflowStatus === 'approved' && (
        <p style={{fontSize: '12px', color: 'var(--theme-elevation-400)', margin: 0}}>
          This content is published. Edit and save as draft to start a new review cycle.
        </p>
      )}

      {/* Editor: Pending review status message */}
      {isEditor && workflowStatus === 'pending_review' && (
        <p style={{fontSize: '12px', color: 'var(--theme-elevation-400)', margin: 0}}>
          Awaiting admin review. You will be able to edit once reviewed.
        </p>
      )}
    </div>
  );
}
