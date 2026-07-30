/*
* @function

* @name confirmMapDocumentUrlParameter
* @param {object} mapDocument - The document to confirm (document_id and public_id)
* @param {string} routePrefix - The edit route prefix ('map' or 'coi')
* @returns {boolean} - True if the URL parameter is correct, false otherwise
* @description
* This function confirms that the URL parameter matches the given document. Useful
* when doing important operations. Edit URLs display the public_id, but internal
* navigation may still use the UUID, so either counts as a match.
*/
export const confirmMapDocumentUrlParameter = (
  mapDocument: {document_id: string; public_id?: number | null},
  routePrefix: string = 'map'
) => {
  const {pathname} = new URL(window.location.href);
  return (
    pathname === `/${routePrefix}/${mapDocument.document_id}/edit` ||
    (mapDocument.public_id != null && pathname === `/${routePrefix}/${mapDocument.public_id}/edit`)
  );
};
