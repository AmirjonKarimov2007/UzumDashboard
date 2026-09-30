const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the actual TypeScript interceptor with a deterministic network and
// auth store. No browser, credentials or external HTTP calls are required.
function fixture(post) {
  let request, responseError;
  const calls = { refresh: 0, retried: [], logout: 0 };
  let state = {
    user: { id: 'user-1' }, accessToken: 'old-access', refreshToken: 'old-refresh',
    isAuthenticated: true, adminSession: null,
    setTokens(accessToken, refreshToken) { state = { ...state, accessToken, refreshToken }; },
    logout() { calls.logout++; state = { ...state, user: null, accessToken: null, refreshToken: null, isAuthenticated: false }; },
  };
  const client = async (config) => { calls.retried.push(config); return { data: 'ok' }; };
  client.interceptors = {
    request: { use(fn) { request = fn; } },
    response: { use(_fn, onError) { responseError = onError; } },
  };
  const axios = {
    create: () => client,
    post: (...args) => { calls.refresh++; calls.refreshArgs = args; return post(...args); },
    isAxiosError: (error) => !!error?.isAxiosError,
  };
  const location = { pathname: '/dashboard', href: '/dashboard' };
  const exports = {};
  const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/api/client.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports, process: { env: {} }, window: { location },
    localStorage: { getItem: () => null }, console,
    require(name) {
      if (name === 'axios') return axios;
      if (name === '@/stores/auth-store') return { useAuthStore: { getState: () => state } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  return {
    calls, location, get state() { return state; },
    setState(update) { state = { ...state, ...update }; },
    unauthorized(config = request({ url: '/protected', headers: {} })) {
      return responseError({ isAxiosError: true, response: { status: 401 }, config });
    },
    request: () => request({ url: '/protected', headers: {} }),
  };
}

function failure(status) {
  return { isAxiosError: true, response: status ? { status } : undefined, message: 'fixture failure' };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

for (const status of [undefined, 429, 500, 503]) {
  test(`preserves the saved session on transient refresh failure ${status ?? 'offline'}`, async () => {
    const f = fixture(async () => { throw failure(status); });
    await assert.rejects(f.unauthorized());
    assert.equal(f.calls.logout, 0);
    assert.equal(f.state.refreshToken, 'old-refresh');
    assert.equal(f.location.href, '/dashboard');
    assert.equal(f.calls.refreshArgs[2].timeout, 30000);
  });
}
for (const status of [401, 403]) {
  test(`ends a definitively rejected refresh session (${status})`, async () => {
    const f = fixture(async () => { throw failure(status); });
    await assert.rejects(f.unauthorized());
    assert.equal(f.calls.logout, 1);
    assert.equal(f.state.refreshToken, null);
    assert.equal(f.location.href, '/login');
  });
}
test('rotates once for concurrent expired requests and retries both with the new token', async () => {
  const gate = deferred();
  const f = fixture(() => gate.promise);
  const first = f.unauthorized();
  const second = f.unauthorized();
  gate.resolve({ data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });
  await Promise.all([first, second]);
  assert.equal(f.calls.refresh, 1);
  assert.equal(f.calls.retried.length, 2);
  assert.ok(f.calls.retried.every((c) => c.headers.Authorization === 'Bearer new-access'));
  assert.equal(f.state.refreshToken, 'new-refresh');
});
test('reuses a newer token for a late 401 without rotating twice', async () => {
  const f = fixture(async () => { throw new Error('must not refresh'); });
  const original = f.request();
  f.setState({ accessToken: 'new-access', refreshToken: 'new-refresh' });
  await f.unauthorized(original);
  assert.equal(f.calls.refresh, 0);
  assert.equal(f.calls.retried[0].headers.Authorization, 'Bearer new-access');
});
test('a late refresh success cannot resurrect a logged-out session', async () => {
  const gate = deferred();
  const f = fixture(() => gate.promise);
  const result = f.unauthorized();
  f.state.logout();
  gate.resolve({ data: { accessToken: 'new-access', refreshToken: 'new-refresh' } });
  await assert.rejects(result);
  assert.equal(f.state.accessToken, null);
  assert.equal(f.calls.retried.length, 0);
});
test('a late refresh failure cannot log out a new session', async () => {
  const gate = deferred();
  const f = fixture(() => gate.promise);
  const result = f.unauthorized();
  f.setState({ user: { id: 'user-2' }, accessToken: 'second-access', refreshToken: 'second-refresh' });
  gate.reject(failure(401));
  await assert.rejects(result);
  assert.equal(f.calls.logout, 0);
  assert.equal(f.state.refreshToken, 'second-refresh');
});
test('never replays an old account request under a new account', async () => {
  const f = fixture(async () => { throw new Error('must not refresh'); });
  const original = f.request();
  f.setState({ user: { id: 'user-2' }, accessToken: 'second-access' });
  await assert.rejects(f.unauthorized(original));
  assert.equal(f.calls.retried.length, 0);
  assert.equal(f.calls.refresh, 0);
});
test('malformed refresh replies leave stored credentials intact', async () => {
  const f = fixture(async () => ({ data: {} }));
  await assert.rejects(f.unauthorized());
  assert.equal(f.state.accessToken, 'old-access');
  assert.equal(f.calls.logout, 0);
});
