import axios from 'axios';

export const generateThumbnail = async (documentId: string) => {
  const response = await axios.post(
    `${process.env.NEXT_PUBLIC_API_URL}/api/document/${documentId}/thumbnail`,
    {
      documentId,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  console.log(response.data);
  return response.data;
};
