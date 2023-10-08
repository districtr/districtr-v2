/**
 * Handle HTTP responses by providing handlers for HTTP status codes.
 *
 * The `handlers` object should have handlers for each status code you want
 * to handle (e.g. 200, 500) as well as a "default" handler for all other
 * cases.
 *
 * @param {any} handlers
 * @returns a response specified by handler's implementation.
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