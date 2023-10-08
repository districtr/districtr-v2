/**
 * Lightweight implementation of a createReducer function.
 * @param handlers 
 * @returns a redux reducer function.
 */

export function createReducer(handlers : any) {
    return (state : any, action : any) => {
      if (handlers.hasOwnProperty(action.type)) {
        return handlers[action.type](state, action);
      }
      return state;
    };
  }