import assert from 'node:assert/strict';
import { test } from 'node:test';
import { browserTestEndpoint } from '../../scripts/browser-test-endpoint';

test('browser endpoint retains default port and explicit IPv4 loopback', () => {
  assert.deepEqual(browserTestEndpoint(), { port: 5173, baseURL: 'http://127.0.0.1:5173' });
});

test('browser endpoint accepts separate projects and both allowed bounds', () => {
  for (const port of [1024, 53173, 65535]) assert.deepEqual(browserTestEndpoint(String(port)), { port, baseURL: `http://127.0.0.1:${port}` });
});

test('browser endpoint rejects invalid ports and shell or URL text', () => {
  for (const value of ['', '0', '80', '65536', '-1', '1.5', '05173', ' 5173', '5173 ', 'NaN', '53173 --host', 'http://localhost:5173']) {
    assert.throws(() => browserTestEndpoint(value), /RUSTSMF_PLAYWRIGHT_PORT/);
  }
});
