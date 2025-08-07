import {CommentSubmissionForm} from '@/app/components/Forms/CommentSubmissionForm';

export default function DevPage() {
  // DEBUG ENV
  console.log('!!', process.env);
  return (
    <CommentSubmissionForm
      mandatoryTags={['ca-redistricting-2025']}
      allowListModules={['ca Congressional Districts (52)']}
    />
  );
}
