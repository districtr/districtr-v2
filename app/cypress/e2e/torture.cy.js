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

const siteUrl = 'https://districtr-v2-241-app.fly.dev/map'


const iters = 10
Cypress._.times(iters, () => {
  describe('Open site and load data', () => {
    it('Data loads', () => {
      cy.visit(siteUrl).wait(1000)
      loadData()
      cy.get('button[value="pan"]').click().wait(1000)
      cy.get('rect.visx-bar', { timeout: 10000 }).should('be.visible');
      // find first g.visx-group
      // then find the second g.visx-group within it
      // then find the first instance of text and print the text
      cy.get('g.visx-group').eq(0).find('g.visx-group').eq(1).find('text').eq(0).invoke('text').then((text) => {
        // text should equal 4,609,400
        expect(text).to.equal('4,609,400')
      })
      resetMap()
    })
  })
});