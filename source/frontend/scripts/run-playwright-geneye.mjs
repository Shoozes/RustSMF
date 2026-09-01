import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const playwrightCli = require.resolve('@playwright/test/cli');

await import(pathToFileURL(playwrightCli).href);
