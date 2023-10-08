/**
 * Handle HTTP responses by providing handlers for HTTP status codes.
 *
 * The `handlers` object should have handlers for each status code you want
 * to handle (e.g. 200, 500) as well as a "default" handler for all other
 * cases.
 *
 * @param {any} handlers
 * @returns a response specified by handler's implementation.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function handleResponse(handlers : any) {
    handlers = {
      // eslint-disable-next-line no-console
      default: (resp: any) => console.error("Request failed", resp),
      ...handlers
    };
    return (response: { status: PropertyKey; }) => {
      if (handlers.hasOwnProperty(response.status)) {
        return handlers[response.status](response);
      } else {
        return handlers.default(response);
      }
    };
  }