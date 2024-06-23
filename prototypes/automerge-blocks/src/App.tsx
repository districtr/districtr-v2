import "./App.css";
import { AutomergeUrl, RawString } from "@automerge/automerge-repo";
// import { useDocument } from "@automerge/automerge-repo-react-hooks";
import { Assignments } from "./main";
import Map from "./components/Map";
import Stats from "./components/Stats";

export interface Plan {
  name: RawString;
  assignments: Assignments;
}

function App({ docUrl }: { docUrl: AutomergeUrl }) {
  // const [doc, changeDoc] = useDocument<Plan>(docUrl);

  return (
    <>
      <div id="sidebar" style={{ padding: "0 1rem" }}>
        <h1>Plan</h1>
        <Stats docUrl={docUrl} />
      </div>
      <Map docUrl={docUrl} />
    </>
  );
}

export default App;
