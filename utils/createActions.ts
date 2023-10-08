/**
 * Lightweight implementation of a createActions function.
 * @param handlers 
 * @returns an action creator for an action type.
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