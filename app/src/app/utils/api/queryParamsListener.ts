import { updateDocumentFromId } from "./queries";

export const getSearchParamsObersver = () => {
  let previousDocumentID = "";
  const observer = new MutationObserver(() => {
    const documentId = new URLSearchParams(window.location.search).get(
      "document_id"
    );
    if (documentId && documentId !== previousDocumentID) {
      previousDocumentID = documentId;
      updateDocumentFromId.refetch();
    }
  });
  const config = { subtree: true, childList: true };
  // start listening to changes
  observer.observe(document, config);
  return observer;
};
