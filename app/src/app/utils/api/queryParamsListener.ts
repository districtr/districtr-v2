import { useMapStore } from "@/app/store/mapStore";
import { updateGetDocumentFromId } from "./queries";
export let previousDocumentID = ''

export const getSearchParamsObersver = () => {
  // next ssr safety
  if (typeof window === "undefined") {
    return
  }

  const observer = new MutationObserver(() => {
    const documentId = new URLSearchParams(window.location.search).get(
      "document_id"
    );
    if (documentId && documentId !== previousDocumentID) {
      previousDocumentID = documentId
      updateGetDocumentFromId(documentId)
    }
  });
  const config = { subtree: true, childList: true };
  // start listening to changes
  observer.observe(document, config);
  return observer;
};
