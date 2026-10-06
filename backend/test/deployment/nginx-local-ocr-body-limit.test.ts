import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const config = readFileSync(new URL('../../../deployment/nginx/academiccloud.conf', import.meta.url), 'utf8');

test('only current-page and device-book PNG transports have streaming proxy exceptions while ordinary JSON stays bounded', () => {
  const paths = ['requests','device/book-page'];
  for (const path of paths) {
    const marker = `location = /api/reader/local-ocr/${path} {`;
    const start = config.indexOf(marker);
    assert.notEqual(start, -1);
    const location = config.slice(start, config.indexOf('\n    }', start));
    assert.match(location, /client_max_body_size 3m;/u);
    assert.match(location, /proxy_request_buffering off;/u);
    assert.match(location, /proxy_http_version 1\.1;/u);
    assert.match(location, /proxy_pass http:\/\/127\.0\.0\.1:3000;/u);
    assert.match(location, /proxy_next_upstream off;/u);
  }
  assert.equal(config.match(/client_max_body_size 3m;/gu)?.length, 2);
  assert.equal(config.match(/client_max_body_size 16k;/gu)?.length, 1);
  assert.doesNotMatch(/location \/api\/ \{([\s\S]*?)\n    \}/u.exec(config)?.[1] ?? '', /client_max_body_size/u);
});

test('only bounded OCR payload endpoints receive the result/probe exception', () => {
  const marker = 'location ~ "^/api/reader/local-ocr/(connect|device/complete|results/[A-Za-z0-9_-]{1,128})$" {';
  const start = config.indexOf(marker);
  assert.notEqual(start, -1);
  const location = config.slice(start, config.indexOf('\n    }', start));
  assert.match(location, /client_max_body_size 200k;/u);
  assert.match(location, /proxy_request_buffering off;/u);
  assert.match(location, /proxy_pass http:\/\/127\.0\.0\.1:3000;/u);
  const paths = new RegExp(marker.slice('location ~ "'.length, marker.indexOf('" {')));
  for (const path of ['/api/reader/local-ocr/connect', '/api/reader/local-ocr/device/complete', '/api/reader/local-ocr/results/valid-id']) assert.ok(paths.test(path));
  for (const path of ['/api/reader/local-ocr/pairing', '/api/reader/local-ocr/device/claim', '/api/reader/local-ocr/requests/id/cancel', '/api/reader/local-ocr/results/id/extra', '/api/other/connect']) assert.ok(!paths.test(path));
});
