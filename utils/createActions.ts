/**
 * Lightweight implementation of a createActions function.
 * @param handlers 
 * @returns an action creator for an action type.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function createActions(handlers : any) {
    let actions : any = {};
    for (let actionType in handlers) {
      actions[actionType] = (actionInfo: any) => ({
        ...actionInfo,
        type: actionType
      });
    }
    return actions;
  }