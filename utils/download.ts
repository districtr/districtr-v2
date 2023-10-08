/**
 * Download implementation.
 * 
 * Creates element with downloadable content and 'clicks' 
 * @param {string} filename 
 * @param {string} text 
 * @param {boolean} isbinary 
 */

export function download(filename : string, text : string, isbinary : boolean) {
    let element = document.createElement("a");
    if (isbinary) {
      let blob = new Blob([text], {
        type: 'application/octet-stream'
      });
      element.setAttribute("href", window.URL.createObjectURL(blob));
    }
    else{
        element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(text));
    }
    element.setAttribute("download", filename);
  
    element.style.display = "none";
    document.body.appendChild(element);
  
    element.click();
  
    document.body.removeChild(element);
  }