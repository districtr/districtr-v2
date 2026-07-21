/*
* @function

* @name confirmMapDocumentUrlParameter
* @param {object} mapDocument - The document to confirm (document_id and public_id)
* @param {string} basePath - The edit route base path
* @returns {boolean} - True if the URL parameter is correct, false otherwise
* @description
* This function confirms that the URL parameter matches the given document. Useful
* when doing important operations. Edit URLs display the public_id, but internal
* navigation may still use the UUID, so either counts as a match.
*/
export const confirmMapDocumentUrlParameter = (
  mapDocument: {document_id: string; public_id?: number | null},
  basePath: string = '/map/edit'
) => {
  const {pathname} = new URL(window.location.href);
  return (
    pathname === `${basePath}/${mapDocument.document_id}` ||
    (mapDocument.public_id != null && pathname === `${basePath}/${mapDocument.public_id}`)
  );
};
