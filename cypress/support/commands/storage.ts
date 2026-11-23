import { podUrl } from '@aerogel/cypress';

/** Exercise the widget and its rs.js Solid backend rather than the old app authenticator. */
export function connectSolidStorage(): void {
    cy.window().then((window) => {
        (window as typeof window & { ponderStorage: { open(): void } }).ponderStorage.open();
    });
    cy.get('.rs-choose-solid').click();
    cy.get('[name="rs-provider-address"]').type(new URL(podUrl()).origin);
    cy.get('.rs-solid-connect').click();
    cy.solidLogin();
}
