/**
 * Generates a randomized id of length.
 * @param {number} len 
 * @returns {string} a randomized string of length len.
 */

export function generateId(len : number) {
    const arr = new Uint8Array((len || 40) / 2);
    const crypto = window.crypto ? window.crypto : (window as any).msCrypto;
    crypto.getRandomValues(arr);
    return Array.from(arr, dec2hex).join("");
  }

// Copied from stackoverflow https://stackoverflow.com/questions/1349404/generate-random-string-characters-in-javascript
 function dec2hex(dec : number) {
    return ("0" + dec.toString(16)).substr(-2);
}