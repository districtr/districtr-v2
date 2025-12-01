import { post } from '../factory';

export const patchSharePlan = async ({
  document_id,
  password,
  access_type,
}: {
  document_id: string | undefined;
  password: string | null;
  access_type: string | undefined;
}) => {
  const response = post<{
    password: string | null;
    access_type: string | undefined;
  }, {
    token: string;
    public_id: number;
  }>(`document/${document_id}/share`)({
    body: {
      password: password,
      access_type: access_type,
    }
  });
  return response;
};
