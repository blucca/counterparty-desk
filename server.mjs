import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { callClocked, reviewRecords } from './engine.mjs';

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/index.html': ['index.html', 'text/html; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/app.mjs': ['app.mjs', 'text/javascript; charset=utf-8'],
  '/recorded.json': ['recorded.json', 'application/json; charset=utf-8']
};
const json = (res, status, value) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
};
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/api/status') return json(res, 200, { live: Boolean(process.env.CLOCKED_API_KEY) });
    if (req.method === 'POST' && path === '/api/review') {
      if (!process.env.CLOCKED_API_KEY) return json(res, 503, { error: 'Set CLOCKED_API_KEY on the local server to review another thread.' });
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 40000) return json(res, 413, { error: 'Keep this thread under 40,000 characters.' });
      }
      let input;
      try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Send the two parties and messages as JSON.' }); }
      const records = await callClocked(input, process.env.CLOCKED_API_KEY);
      return json(res, 200, reviewRecords(input, records));
    }
    if (req.method === 'GET' && files[path]) {
      const [name, type] = files[path];
      const bytes = await readFile(fileURLToPath(new URL('./public/' + name, import.meta.url)));
      res.writeHead(200, { 'Content-Type': type });
      return res.end(bytes);
    }
    return json(res, 404, { error: 'Page not found.' });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
});
server.listen(Number(process.env.PORT || 8855), '127.0.0.1', () => console.log('Counterparty Desk: http://127.0.0.1:' + (process.env.PORT || 8855)));
