/// <reference types="cypress" />
// ***********************************************
// This example commands.ts shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })
//
// declare global {
//   namespace Cypress {
//     interface Chainable {
//       login(email: string, password: string): Chainable<void>
//       drag(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       dismiss(subject: string, options?: Partial<TypeOptions>): Chainable<Element>
//       visit(originalFn: CommandOriginalFn, url: string, options: Partial<VisitOptions>): Chainable<Element>
//     }
//   }
// }


/**
 * Simulates a paste event.
 *
 * @param subject A jQuery context representing a DOM element.
 * @param pasteOptions Set of options for a simulated paste event. 
 * @param pasteOptions.pastePayload Simulated data that is on the clipboard.
 * @param pasteOptions.simple Determines whether or not to use a simple paste. Use this when there is no paste event bound to the element
 *                              resolved by the selector.
 * @param pasteOptions.pasteFormat The format of the simulated paste payload. Default value is 'text'.
 *
 * @returns The subject parameter.
 *
 * @example
 * cy.get('some-selector').paste({
 *  pastePayload: 'yolo,
 *  simple: false,
*  });
 */
export function paste(subject: any, { pastePayload, simple = true, pasteType = 'text' }: any) {
  if (simple) {
      subject[0].value = pastePayload;
      return;
  }

  // https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event
  const pasteEvent = Object.assign(new Event('paste', { bubbles: true, cancelable: true }), {
      clipboardData: {
          getData: (type = pasteType) => pastePayload,
      },
  });
  subject[0].dispatchEvent(pasteEvent);

  return subject;
}

Cypress.Commands.add(
  // @ts-ignore
  'paste',
  {
      prevSubject: true,
  },
  paste
);
