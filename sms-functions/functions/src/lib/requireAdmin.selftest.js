// node --test src/lib/requireAdmin.selftest.js
const test = require('node:test');
const assert = require('node:assert');
const { requireAdmin, bearer } = require('./requireAdmin');

function fakeRes() {
  const r = { statusCode: 200, body: null };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  return r;
}
const req = (auth) => ({ headers: auth ? { authorization: auth } : {}, get(h) { return this.headers[h.toLowerCase()]; } });
const auth = { verifyIdToken: async (t) => { if (t === 'good') return { uid: 'U1' }; if (t === 'teacher') return { uid: 'U2' }; if (t === 'pending') return { uid: 'U3' }; throw new Error('bad token'); } };
const users = { U1: { userType: 'admin', status: 'active', fullName: 'Head Teacher' }, U2: { userType: 'teacher', status: 'active' }, U3: { userType: 'admin', status: 'pending' } };
const db = { collection: () => ({ doc: (id) => ({ get: async () => ({ exists: !!users[id], data: () => users[id] }) }) }) };

test('reads the Bearer token', () => {
  assert.strictEqual(bearer(req('Bearer abc')), 'abc');
  assert.strictEqual(bearer(req('')), '');
});

test('lets an approved administrator through', async () => {
  const res = fakeRes();
  const u = await requireAdmin(req('Bearer good'), res, { auth, db });
  assert.deepStrictEqual(u, { uid: 'U1', name: 'Head Teacher' });
  assert.strictEqual(res.statusCode, 200);
});

test('401 without a token, or with a bad one', async () => {
  for (const h of ['', 'Bearer nope']) {
    const res = fakeRes();
    assert.strictEqual(await requireAdmin(req(h), res, { auth, db }), null);
    assert.strictEqual(res.statusCode, 401);
    assert.strictEqual(res.body.success, false);
  }
});

test('403 for a teacher or a pending admin', async () => {
  for (const t of ['teacher', 'pending']) {
    const res = fakeRes();
    assert.strictEqual(await requireAdmin(req(`Bearer ${t}`), res, { auth, db }), null);
    assert.strictEqual(res.statusCode, 403);
  }
});
