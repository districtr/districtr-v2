import axios from 'axios';

export const getSharePlanLink = async ({
  document_id,
  password,
  access_type,
}: {
  document_id: string | undefined;
  password: string | null;
  access_type: string | undefined;
}) => {
  try {
    const res = await axios.post(
      `${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/share`,
      {
        password: password ?? null,
        access_type: access_type ?? 'read',
      }
    );
    if (!res.data) {
      throw new Error('No token returned from API');
    }
    return res.data;
  } catch (err) {
    console.error('Error in getSharePlanLink: ', err);
    throw err;
  }
};
