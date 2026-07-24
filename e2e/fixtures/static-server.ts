import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FIXTURES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../test-fixtures');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/**
 * Serves `test-fixtures/*.html` over real HTTP (127.0.0.1, OS-assigned
 * port) instead of `file://` — content scripts and the picker's
 * `document.elementFromPoint` behave identically either way, but `file://`
 * requires the user to have enabled "Allow access to file URLs" for the
 * extension, which a fresh unpacked load in a throwaway test profile never
 * has. One server per worker; each test gets a fresh page against it, so
 * there's no shared mutable state between tests even though the server
 * itself is reused.
 */
export class StaticServer {
  private server: Server | undefined;
  private port = 0;

  async start(): Promise<void> {
    this.server = createServer((req, res) => {
      void (async () => {
        const requestPath = decodeURIComponent((req.url ?? '/').split('?')[0]);
        // Fixtures are a flat, known-small set of files — an allowlist of
        // exactly what's in test-fixtures/ is simpler and safer than trying
        // to sanitize an arbitrary path against directory traversal.
        const filename = requestPath === '/' ? null : requestPath.replace(/^\//, '');
        if (!filename || filename.includes('/') || filename.includes('..')) {
          res.writeHead(404).end('Not found');
          return;
        }
        try {
          const filePath = path.join(FIXTURES_DIR, filename);
          const contents = await readFile(filePath);
          const ext = path.extname(filename);
          res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] ?? 'application/octet-stream' });
          res.end(contents);
        } catch {
          res.writeHead(404).end('Not found');
        }
      })();
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    const address = this.server.address();
    if (!address || typeof address === 'string') throw new Error('Static server failed to bind a port');
    this.port = address.port;
  }

  url(filename: string): string {
    return `http://127.0.0.1:${this.port}/${filename}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.server?.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
