#!/usr/bin/env -S node --disable-proto delete --disallow-code-generation-from-strings

import { createServer } from 'node:http';
import { resolve, dirname } from 'node:path';
import { realpath, readFile, writeFile, mkdir } from 'node:fs/promises';

const BASE_DIR = resolve(dirname(new URL(import.meta.url).pathname), '..');
const RENDER_DIR = resolve(BASE_DIR, 'rendered');

await mkdir(RENDER_DIR, { recursive: true });

const port = process.env.PORT ?? 3000;
const server = createServer(handleRequest);
server.listen(port, '127.0.0.1');
console.log(`Serving ${BASE_DIR} on http://127.0.0.1:${port}/`);

process.on('SIGINT', () => {
  console.log('\nShutting down...');
  server.close();
});

async function readAllString(stream) {
  const parts = [];
  for await (const part of stream) {
    parts.push(Buffer.from(part));
  }
  return Buffer.concat(parts).toString();
}

async function handlePost(req, res) {
  const content = await readAllString(req);
  const frame = Number.parseInt(content.substr(0, content.indexOf(':')));
  const data = Buffer.from(content.substr(content.indexOf(',') + 1), 'base64');

  const filename = `f${frame.toFixed(0).padStart(6, '0')}.png`;

  console.log(`POST ${filename}`);
  await writeFile(resolve(RENDER_DIR, filename), data);

  res.statusCode = 200;
  res.end();
}

async function handleGet(req, res) {
  if (req.url === '/check') {
    res.statusCode = 200;
    res.end();
    return;
  }
  let path = req.url.replace(/^\//, '');
  if (path === '') {
    path = 'index.html';
  }
  path = resolve(BASE_DIR, path);
  if (!path.startsWith(BASE_DIR)) {
    throw new Error('bad path');
  }
  path = await realpath(path);
  if (!path.startsWith(BASE_DIR)) {
    throw new Error('bad path');
  }
  console.log(`GET ${path}`);
  const content = await readFile(path);
  if (path.endsWith('.html') || path.endsWith('.htm')) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
  } else if (path.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
  } else if (path.endsWith('.js') || path.endsWith('.mjs')) {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  } else if (path.endsWith('.png')) {
    res.setHeader('Content-Type', 'image/png');
  } else {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  }
  res.end(content);
}

async function handleRequest(req, res) {
  try {
    if (req.method === 'GET') {
      await handleGet(req, res);
    } else if (req.method === 'POST') {
      await handlePost(req, res);
    } else {
      throw new Error('unsupported method');
    }
  } catch (e) {
    res.statusCode = 500;
		res.setHeader('Content-Type', 'text/plain; charset=utf-8');
		res.end(e.message + '\n');
    req.close();
  }
}
