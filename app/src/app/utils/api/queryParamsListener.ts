import { updateDocumentFromId } from "./queries";

export const getSearchParamsObersver = () => {
  let previousUrl = '';
  const observer = new MutationObserver(function(mutations) {
    if (window.location.href !== previousUrl) {
        previousUrl = window.location.href;
        updateDocumentFromId.refetch()
      }
  });
  
  const config = {subtree: true, childList: true};

  // start listening to changes
  observer.observe(document, config);
  return observer
}