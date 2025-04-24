'use client';
import LegacyRedirect from './legacy-redirect';

export default function MapDefaultPage() {
  // This page serves as a compatibility layer for legacy URLs
  return <LegacyRedirect />;
}