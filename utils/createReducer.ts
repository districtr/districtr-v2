/**
 * Lightweight implementation of a createReducer function.
 * @param handlers 
 * @returns a redux reducer function.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function createReducer(handlers : any) {
    return (state : any, action : any) => {
      if (handlers.hasOwnProperty(action.type)) {
        return handlers[action.type](state, action);
      }
      return state;
    };
  }