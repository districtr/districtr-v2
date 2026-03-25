'use client';
import React from 'react';

/**
 * Custom navigation links for Payload admin sidebar.
 * These link to the custom views registered in payload.config.ts.
 */
export default function AdminNavLinks() {
  return (
    <div style={{padding: '0 16px'}}>
      <p
        style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--theme-elevation-400)',
          margin: '16px 0 8px',
        }}
      >
        Districtr Tools
      </p>
      <nav style={{display: 'flex', flexDirection: 'column', gap: '2px'}}>
        <a
          href="/admin/comment-review"
          style={{
            padding: '6px 8px',
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--theme-elevation-800)',
            textDecoration: 'none',
          }}
        >
          Comment Review
        </a>
        <a
          href="/admin/district-comments"
          style={{
            padding: '6px 8px',
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--theme-elevation-800)',
            textDecoration: 'none',
          }}
        >
          District Comments
        </a>
        <a
          href="/admin/thumbnails"
          style={{
            padding: '6px 8px',
            borderRadius: '4px',
            fontSize: '13px',
            color: 'var(--theme-elevation-800)',
            textDecoration: 'none',
          }}
        >
          Thumbnails
        </a>
      </nav>
    </div>
  );
}
