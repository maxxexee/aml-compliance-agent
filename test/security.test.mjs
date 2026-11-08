import test from 'node:test';
import assert from 'node:assert/strict';
import { apiKeysMatch, requireApiKey, createRateLimiter } from '../api/security.js';

function createRequest(headers = {}, ip = '203.0.113.7') {
  const normalized = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]),
  );
  return {
    ip,
    socket: { remoteAddress: ip },
    get(name) {
      return normalized[name.toLowerCase()];
    },
  };
}

function createResponse() {
  const headers = {};
  return {
    statusCode: 200,
    body: undefined,
    headers,
    set(name, value) {
      headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('accepts every request when no key is configured', () => {
  assert.equal(apiKeysMatch('anything', ''), true);
  assert.equal(apiKeysMatch(undefined, undefined), true);
});

test('matches the configured key and rejects everything else', () => {
  assert.equal(apiKeysMatch('secret-key', 'secret-key'), true);
  assert.equal(apiKeysMatch('secret-key ', 'secret-key'), false);
  assert.equal(apiKeysMatch('SECRET-KEY', 'secret-key'), false);
  assert.equal(apiKeysMatch('', 'secret-key'), false);
  assert.equal(apiKeysMatch(undefined, 'secret-key'), false);
});

test('requireApiKey passes the request through with a valid header', () => {
  const middleware = requireApiKey('secret-key');
  const req = createRequest({ 'x-api-key': 'secret-key' });
  const res = createResponse();
  let called = false;

  middleware(req, res, () => { called = true; });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body, undefined);
});

test('requireApiKey returns 401 without a valid header', () => {
  const middleware = requireApiKey('secret-key');
  const req = createRequest({});
  const res = createResponse();
  let called = false;

  middleware(req, res, () => { called = true; });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.error, 'unauthorized');
});

test('requireApiKey is a no-op when authentication is disabled', () => {
  const middleware = requireApiKey(undefined);
  const req = createRequest({});
  const res = createResponse();
  let called = false;

  middleware(req, res, () => { called = true; });

  assert.equal(called, true);
});

test('rate limiter allows requests up to the limit and reports headers', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => 1_000 });
  const res = createResponse();
  let passed = 0;

  limiter(createRequest(), createResponse(), () => { passed += 1; });
  limiter(createRequest(), res, () => { passed += 1; });

  assert.equal(passed, 2);
  assert.equal(res.headers['X-RateLimit-Limit'], '2');
  assert.equal(res.headers['X-RateLimit-Remaining'], '0');
});

test('rate limiter returns 429 once the window is exhausted', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => 1_000 });
  let passed = 0;

  limiter(createRequest(), createResponse(), () => { passed += 1; });
  limiter(createRequest(), createResponse(), () => { passed += 1; });

  const res = createResponse();
  limiter(createRequest(), res, () => { passed += 1; });

  assert.equal(passed, 2);
  assert.equal(res.statusCode, 429);
  assert.equal(res.body.error, 'rate limit exceeded');
  assert.equal(res.body.limit, 2);
  assert.equal(res.headers['X-RateLimit-Remaining'], '0');
  assert.equal(res.headers['Retry-After'], '60');
});

test('rate limiter keys buckets per client address', () => {
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => 1_000 });
  const first = createResponse();
  const second = createResponse();
  let passed = 0;

  limiter(createRequest({}, '198.51.100.1'), first, () => { passed += 1; });
  limiter(createRequest({}, '198.51.100.2'), second, () => { passed += 1; });

  assert.equal(passed, 2);
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
});

test('rate limiter resets after the window elapses', () => {
  let clock = 1_000;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 1, now: () => clock });
  let passed = 0;

  limiter(createRequest(), createResponse(), () => { passed += 1; });

  const blocked = createResponse();
  limiter(createRequest(), blocked, () => { passed += 1; });
  assert.equal(blocked.statusCode, 429);

  clock = 62_000;
  const allowed = createResponse();
  limiter(createRequest(), allowed, () => { passed += 1; });

  assert.equal(passed, 2);
  assert.equal(allowed.statusCode, 200);
  assert.equal(allowed.headers['X-RateLimit-Remaining'], '0');
});
