/**
 * Lightweight implementation of redux combineReducers
 * 
 * @param reducers 
 * @returns callback function to handle state change.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function combineReducers(reducers : any) {
    return (state : any, action : any) => {
      let hasChanged = false;
      let nextState : any = {};
  
      for (let key in reducers) {
        nextState[key] = reducers[key](state[key], action);
        hasChanged = hasChanged || nextState[key] !== state[key];
      }
  
      return hasChanged ? nextState : state;
    };
  }