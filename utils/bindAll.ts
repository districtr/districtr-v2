/**
 * Binds object to self on specified keys.
 * @param {strings[]} keys 
 * @param {any} obj 
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */

export function bindAll(keys : string[], obj : any) {
    keys.forEach(key => {
      obj[key] = obj[key].bind(obj);
    });
  }