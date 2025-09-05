'use client';
import PermissionGuard from '@/app/admin/components/PermissionGuard';
import { queryClient } from '@/app/utils/api/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';

export default function ReviewLayout({children}: {children: React.ReactNode}) {
  return <QueryClientProvider client={queryClient}>
    <PermissionGuard requiredScope="create:content_review">{children}</PermissionGuard>
  </QueryClientProvider>;
}