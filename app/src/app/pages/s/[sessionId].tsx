import { useRouter } from "next/router"; // Import the correct type for router

const SessionPage = () => {
  const router = useRouter();
  const { sessionId } = router.query;

  return (
    <div>
      <h1>Session: {sessionId}</h1>
    </div>
  );
};

export default SessionPage;
