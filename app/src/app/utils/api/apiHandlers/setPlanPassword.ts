import axios from 'axios';

export const setPlanPassword = async ({
  document_id,
  password,
}: {
  document_id: string | undefined;
  password: string | null;
}) => {
  try {
    const res = await axios.patch<{status: string}>(
      `${process.env.NEXT_PUBLIC_API_URL}/api/document/${document_id}/password`,
      {
        password: password ?? null,
      }
    );
    if (!res.data) {
      throw new Error('No token returned from API');
    }
    return res.data;
  } catch (err) {
    console.error('Error in setPlanPassword: ', err);
    throw err;
  }
};
