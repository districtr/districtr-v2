'use client';
import {useEffect, useState} from 'react';
import {useRouter, useSearchParams} from 'next/navigation';
import axios from 'axios';

export default function LegacyRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  useEffect(() => {
    const fetchAndRedirect = async () => {
      try {
        const documentId = searchParams.get('document_id');
        const rowNumber = searchParams.get('row_number');
        
        if (rowNumber) {
          // If row_number is specified, redirect to new route format
          router.replace(`/map/${rowNumber}`);
        } else if (documentId) {
          // For backward compatibility, look up the row ID from document ID
          try {
            const response = await axios.get(
              `${process.env.NEXT_PUBLIC_API_URL}/api/document/${documentId}/row`
            );
            
            const rowId = response.data;
            if (rowId) {
              router.replace(`/map/${rowId}`);
            } else {
              setError('Could not find a valid map ID');
              setTimeout(() => router.replace('/'), 3000);
            }
          } catch (err) {
            console.error('Error looking up row ID:', err);
            setError('Error looking up map. You will be redirected to the home page.');
            setTimeout(() => router.replace('/'), 3000);
          }
        } else {
          // No ID provided, redirect to home page
          router.replace('/');
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAndRedirect();
  }, [router, searchParams]);
  
  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center">
      {isLoading ? (
        <p>Looking up map information...</p>
      ) : error ? (
        <p className="text-red-600">{error}</p>
      ) : (
        <p>Redirecting to map...</p>
      )}
    </div>
  );
}