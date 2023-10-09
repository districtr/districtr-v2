/**
 * A mapping of state names and abbreviations to snake case form.
 * @type { Object }
 * @param {string} name - State name.
 * @param {string } value - Alias.
 * @see Original Districtr reference : {@link https://github.com/uchicago-dsi/districtr-legacy/blob/e88ef1a8be7e40d3a7a00360dc95fd4239dd6c43/src/utils.js}
 */
export const specialStates : {[name: string] : string}= {
    dc: "district_of_columbia",
    ma: "massachusetts",
    newhampshire: "new_hampshire",
    newjersey: "new_jersey",
    new_mexico_portal: "new_mexico",
    newyork: "new_york",
    nc: "north_carolina",
    northcarolina: "north_carolina",
    northdakota: "north_dakota",
    puertorico: "puerto_rico",
    puertorico_prec: "puerto_rico",
    // RI is OK
    southcarolina: "south_carolina",
    southdakota: "south_dakota",
    westvirginia: "west_virginia",
};