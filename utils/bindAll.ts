/**
 * Binds object to self on specified keys.
 * @param {strings[]} keys 
 * @param {any} obj 
 */

export function bindAll(keys : string[], obj : any) {
    keys.forEach(key => {
      obj[key] = obj[key].bind(obj);
    });
  }