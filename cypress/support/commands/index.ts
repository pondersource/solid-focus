import { defineCommands } from '@aerogel/cypress';

import * as navigationCommands from './navigation';
import * as stubsCommands from './stubs';
import * as storageCommands from './storage';

const commands = {
    ...navigationCommands,
    ...stubsCommands,
    ...storageCommands,
};

type Commands = typeof commands;

defineCommands(commands);

declare global {
    namespace Cypress {
        interface Chainable extends Commands {}
    }
}
