import { podUrl } from '@aerogel/cypress';

/** Exercise the widget and its rs.js Solid backend rather than the old app authenticator. */
export function connectSolidStorage(): void {
    // cypress-solid resets the profile to a minimal identity with no storage
    // links. Advertise this real test Pod before exercising rs.js discovery.
    cy.solidUpdateDocument(
        '/profile/card',
        `INSERT DATA {
        <#me> <http://www.w3.org/ns/pim/space#storage> <${podUrl('/')}> .
    }`,
    );
    cy.window().then((window) => {
        (window as typeof window & { ponderStorage: { open(): void } }).ponderStorage.open();
    });
    cy.get('.rs-choose-solid').scrollIntoView().click();
    cy.get('[name="rs-provider-address"]').type(new URL(podUrl()).origin);
    cy.get('.rs-solid-connect').click();
    cy.solidLogin();
}
