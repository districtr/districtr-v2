export const getPublicId = async (documentId: string) => {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL}/api/document/${documentId}/public_id`
  );

  if (!response.ok) {
    throw new Error(`Failed to generate public ID: ${response.statusText}`);
  }

  return response.json();
};
