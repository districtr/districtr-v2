const loadData = () => {
  cy.get('button[value="import-export"]').click()
  // click button aria-label="Paste map data"
  cy.get('button[aria-label="Paste map data"]').click()
  cy.fixture('test zone assignments districtr 2025-01-07.json').then((assignments) => {
    cy.get('textarea').paste({pastePayload: JSON.stringify(assignments),simple: true})
    cy.get('textarea').type(" ")
    cy.get('button[aria-label="Load map data from pasted JSON"]').click().wait(1000)
  })
}
const resetMap = () => {
  cy.get('button[aria-label="Reset map"]').click()
  cy.get('button[aria-label="Confirm reset map"]').click().wait(1500)
}

describe('open prod site', () =>{
  it('passes', () => {
    cy.visit('http://localhost:3000/map').wait(1000)
    // cklick button value="import-export"
    loadData()
    cy.get('button[value="pan"]').click().wait(1000)
    resetMap()
    // get button aria-label ="Reset map"
    loadData()
    
  })
})