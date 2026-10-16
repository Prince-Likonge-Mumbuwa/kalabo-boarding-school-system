// Run: cd sms-functions/functions && npm test   (Node test runner, not vitest)
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('./lib');

const unit = (seed) => {
  const v = Array.from({ length: 128 }, (_, i) => Math.sin(seed * 31 + i * 7.3));
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const mix = (a, b, t) => {
  const v = a.map((x, i) => x * (1 - t) + b[i] * t);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};

test('templates round-trip through encryption (Tick format)', async () => {
  const e = unit(1);
  const sealed = await lib.encryptTemplate('k', e);
  assert.equal(sealed.split('.').length, 3);
  const back = await lib.decryptTemplate('k', sealed);
  assert.equal(back.length, 128);
  back.forEach((x, i) => assert.ok(Math.abs(x - e[i]) < 1e-6));
  await assert.rejects(() => lib.decryptTemplate('wrong key', sealed));
});

test('each face matches at most one learner and each learner at most one face', () => {
  const alice = unit(1), ben = unit(2);
  const templates = [{ learnerId: 'A', vector: alice }, { learnerId: 'B', vector: ben }];
  const faces = [
    { box: [0, 0, 80, 80], embedding: mix(alice, ben, 0.1) },
    { box: [100, 0, 80, 80], embedding: mix(alice, ben, 0.2) }, // also closer to Alice
    { box: [200, 0, 80, 80], embedding: unit(9) }, // nobody
  ];
  const r = lib.matchFaces(faces, templates, { reviewThreshold: 0.363, matchThreshold: 0.45 });
  assert.equal(r[0].learnerId, 'A');
  assert.equal(r[0].verdict, 'match');
  assert.notEqual(r[1].learnerId, 'A'); // Alice already taken by the better face
  assert.equal(r[2].learnerId, null);
  assert.equal(r[2].verdict, 'unknown');
});

test('between the thresholds a match is only a suggestion', () => {
  const a = unit(3);
  const r = lib.matchFaces([{ box: [0, 0, 1, 1], embedding: a }], [{ learnerId: 'A', vector: a }], { reviewThreshold: 0.363, matchThreshold: 1.1 });
  assert.equal(r[0].verdict, 'review');
});

test('embeddings are validated', () => {
  assert.throws(() => lib.checkEmbedding([1, 2, 3]), lib.FaceInputError);
  assert.throws(() => lib.checkEmbedding(Array(128).fill(1)), lib.FaceInputError);
  assert.doesNotThrow(() => lib.checkEmbedding(unit(4)));
});

test('only active / no-status learners are counted, like the register', () => {
  assert.ok(lib.isCountedLearner({ status: 'active' }));
  assert.ok(lib.isCountedLearner({}));
  for (const s of ['archived', 'graduated', 'transferred']) assert.ok(!lib.isCountedLearner({ status: s }));
});

test('snapshot follows the learner record: new student number after promotion', () => {
  const before = lib.learnerSnapshot('doc1', { classId: 'F1A', className: 'Form 1A', studentId: 'F1A_007', fullName: 'Mwila Banda' });
  const after = lib.learnerSnapshot('doc1', { classId: 'F2A', className: 'Form 2A', studentId: 'F2A_007', fullName: 'Mwila Banda' });
  assert.equal(after.learnerId, 'doc1'); // identity unchanged
  assert.ok(lib.snapshotChanged(before, after));
  assert.ok(!lib.snapshotChanged(after, after));
});

test('settings are clamped and match ≥ review', () => {
  assert.deepEqual(lib.normalizeSettings(null), { enabled: false, reviewThreshold: 0.363, matchThreshold: 0.45 });
  const s = lib.normalizeSettings({ enabled: true, reviewThreshold: 0.5, matchThreshold: 0.4 });
  assert.equal(s.matchThreshold, 0.5);
  assert.equal(lib.normalizeSettings({ reviewThreshold: 'x' }).reviewThreshold, 0.363);
});

test('clean-up: leavers lose their faces; moved learners get a fresh snapshot', () => {
  const learners = new Map([
    ['stay', { classId: 'F2A', className: 'Form 2A', studentId: 'F2A_007', fullName: 'Mwila Banda', status: 'active' }],
    ['moved', { classId: 'F2B', className: 'Form 2B', studentId: 'F2B_003', fullName: 'Chipo Phiri' }],
    ['left', { classId: 'F5A', studentId: 'F5A_001', fullName: 'Gone', status: 'graduated' }],
    ['deleted', null],
  ]);
  const old = (id, extra) => ({ ...lib.learnerSnapshot(id, learners.get(id) || {}), ...extra });
  const status = new Map([
    ['stay', old('stay')],
    ['moved', { learnerId: 'moved', classId: 'F2A', className: 'Form 2A', studentId: 'F2A_010', fullName: 'Chipo Phiri' }],
    ['left', old('left')],
    ['deleted', { learnerId: 'deleted' }],
  ]);
  const r = lib.planReconcile([...status.keys()], learners, status, new Map());
  assert.deepEqual(r.remove.map((x) => x.learnerId).sort(), ['deleted', 'left']);
  assert.deepEqual(r.refresh.map((x) => x.learnerId), ['moved']);
  assert.equal(r.refresh[0].snapshot.studentId, 'F2B_003');
});
