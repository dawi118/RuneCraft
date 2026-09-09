import test from 'node:test';
import assert from 'node:assert/strict';
import { createSession, authorFrom } from '../src/lib/auth.mjs';

function configure(t, values = {}) {
  for (const name of ['ADMIN_TOKEN', 'SESSION_SECRET', 'ADMIN_MARC_TOKEN', 'ADMIN_DAVID_TOKEN']) {
    const previous = process.env[name];
    t.after(() => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; });
    if (values[name] === undefined) delete process.env[name]; else process.env[name] = values[name];
  }
}
const request = session => new Request('https://example.test', { headers: { cookie: session.cookie } });

test('the existing shared key alone signs in as Project authors', t => {
  configure(t, { ADMIN_TOKEN: 'existing-key' });
  const session = createSession('existing-key');
  assert.equal(session.author, 'Project authors');
  assert.equal(authorFrom(request(session)), 'Project authors');
  assert.match(session.cookie, /HttpOnly; SameSite=Strict/);
  assert.throws(() => createSession('wrong-key'), error => error.status === 401);
  assert.throws(() => createSession(''), error => error.status === 401);
  process.env.ADMIN_TOKEN = 'replacement-key';
  assert.equal(authorFrom(request(session)), null);
});

test('shared access preserves the original editor’s key normalization', t => {
  configure(t, { ADMIN_TOKEN: ' "ADMIN_TOKEN=existing-key" ' });
  assert.equal(authorFrom(request(createSession('Bearer existing-key'))), 'Project authors');
});

test('an optional session secret does not change the login key', t => {
  configure(t, { ADMIN_TOKEN: 'existing-key', SESSION_SECRET: 'separate-secret' });
  assert.equal(authorFrom(request(createSession('existing-key'))), 'Project authors');
  assert.throws(() => createSession('separate-secret'), error => error.status === 401);
});

test('missing shared key reports the actual configuration needed and fails closed', t => {
  configure(t, { SESSION_SECRET: 'separate-secret', ADMIN_MARC_TOKEN: 'old-named-key' });
  assert.throws(() => createSession('old-named-key'), error => error.status === 503 && error.message.includes('ADMIN_TOKEN'));
});
