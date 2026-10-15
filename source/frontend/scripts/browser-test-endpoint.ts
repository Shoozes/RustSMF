/** Keep browser readiness, navigation and the owned preview on one loopback port. */
export function browserTestEndpoint(value?: string): { port: number; baseURL: string } {
  const port = value === undefined ? 5173 : Number(value);
  if ((value !== undefined && !/^[1-9]\d{3,4}$/.test(value)) || port < 1024 || port > 65535) {
    throw new Error('RUSTSMF_PLAYWRIGHT_PORT must be an integer from 1024 to 65535.');
  }
  return { port, baseURL: `http://127.0.0.1:${port}` };
}
