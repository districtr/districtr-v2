
describe('open prod site', () =>{
  it('passes', () => {
    cy.visit('http://localhost:3000/map').wait(1000)
    // cklick button value="import-export"
    cy.get('button[value="import-export"]').click()
    // click button aria-label="Paste map data"
    cy.get('button[aria-label="Paste map data"]').click()
    // find text area
    cy.get('textarea').should('exist')
    cy.fixture('test zone assignments districtr 2025-01-07.json').then((assignments) => {
      cy.get('textarea').paste({pastePayload: JSON.stringify(assignments),simple: true})
      cy.get('textarea').type(" ")
    })
    // find aria-label="Load map data from pasted JSON"
    cy.get('button[aria-label="Load map data from pasted JSON"]').click().wait(1000)
    // click on pan
    cy.get('button[value="pan"]').click()
  })
})