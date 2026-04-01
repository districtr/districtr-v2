'use client';
import React, {useEffect, useState} from 'react';

interface PendingItem {
  id: string | number;
  title: string;
  slug: string;
  updatedAt: string;
  collectionType: 'tags' | 'places';
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

async function fetchPendingItems(collection: 'tags' | 'places'): Promise<PendingItem[]> {
  const params = new URLSearchParams({
    'where[workflowStatus][equals]': 'pending_review',
    limit: '100',
    sort: '-updatedAt',
  });

  const res = await fetch(`/api/${collection}?${params.toString()}`, {
    credentials: 'include',
  });

  if (!res.ok) return [];

  const data = await res.json();
  return (data.docs || []).map((doc: Record<string, unknown>) => ({
    id: doc.id,
    title: doc.title || 'Untitled',
    slug: doc.slug || '',
    updatedAt: doc.updatedAt as string,
    collectionType: collection,
  }));
}

export default function PendingReviewsView() {
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [tags, places] = await Promise.all([
          fetchPendingItems('tags'),
          fetchPendingItems('places'),
        ]);
        const combined = [...tags, ...places].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        setItems(combined);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pending reviews');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div style={{maxWidth: '960px', margin: '0 auto', padding: '24px'}}>
      <div style={{marginBottom: '24px'}}>
        <h1
          style={{
            fontSize: '24px',
            fontWeight: 700,
            margin: '0 0 4px',
          }}
        >
          Pending Reviews
        </h1>
        <p style={{fontSize: '14px', color: 'var(--theme-elevation-400)', margin: 0}}>
          Content submitted for review across all collections.
        </p>
      </div>

      {loading && (
        <p style={{fontSize: '14px', color: 'var(--theme-elevation-400)'}}>Loading...</p>
      )}

      {error && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            color: '#dc2626',
            fontSize: '14px',
          }}
        >
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            backgroundColor: 'var(--theme-elevation-50)',
            borderRadius: '6px',
            border: '1px solid var(--theme-elevation-100)',
          }}
        >
          <p style={{fontSize: '16px', fontWeight: 500, margin: '0 0 4px'}}>
            No pending reviews
          </p>
          <p style={{fontSize: '14px', color: 'var(--theme-elevation-400)', margin: 0}}>
            All content has been reviewed. Check back later.
          </p>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div
          style={{
            border: '1px solid var(--theme-elevation-150)',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          {/* Table Header */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 100px 180px 100px',
              gap: '12px',
              padding: '10px 16px',
              backgroundColor: 'var(--theme-elevation-50)',
              borderBottom: '1px solid var(--theme-elevation-150)',
              fontSize: '12px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              color: 'var(--theme-elevation-400)',
            }}
          >
            <span>Title</span>
            <span>Type</span>
            <span>Updated</span>
            <span>Action</span>
          </div>

          {/* Table Rows */}
          {items.map((item) => (
            <div
              key={`${item.collectionType}-${item.id}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 180px 100px',
                gap: '12px',
                padding: '12px 16px',
                borderBottom: '1px solid var(--theme-elevation-100)',
                alignItems: 'center',
                fontSize: '14px',
              }}
            >
              <span style={{fontWeight: 500}}>{item.title}</span>
              <span>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    backgroundColor:
                      item.collectionType === 'tags' ? '#ede9fe' : '#e0f2fe',
                    color: item.collectionType === 'tags' ? '#6d28d9' : '#0369a1',
                  }}
                >
                  {item.collectionType === 'tags' ? 'Tag' : 'Place'}
                </span>
              </span>
              <span style={{color: 'var(--theme-elevation-400)', fontSize: '13px'}}>
                {formatDate(item.updatedAt)}
              </span>
              <span>
                <a
                  href={`/admin/collections/${item.collectionType}/${item.id}`}
                  style={{
                    display: 'inline-block',
                    padding: '4px 12px',
                    backgroundColor: '#2563eb',
                    color: '#fff',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 500,
                    textDecoration: 'none',
                  }}
                >
                  Review
                </a>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
