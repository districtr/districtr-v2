/*
* @function 

* @name confirmMapDocumentUrlParameter
* @param {string} document_id - The document ID to confirm
* @returns {boolean} - True if the URL parameter is correct, false otherwise
* @description
* This function confirms that the URL parameter is correct. Useful when doing important operations.
*/
export const confirmMapDocumentUrlParameter = (
  document_id: string,
  basePath: string = '/map/edit'
) => {
  const url = new URL(window.location.href);
  if (url.pathname !== `${basePath}/${document_id}`) {
    return false;
  }
  return true;
};
