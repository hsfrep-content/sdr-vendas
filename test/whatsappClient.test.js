const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { removeStaleBrowserLocks } = require('../src/whatsapp/whatsappClient');

function tmpSessionDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sdr-session-'));
}

test('removeStaleBrowserLocks apaga cadeados do Chrome em qualquer nível da sessão', () => {
  const root = tmpSessionDir();
  const defaultDir = path.join(root, 'session', 'Default');
  fs.mkdirSync(defaultDir, { recursive: true });

  fs.writeFileSync(path.join(root, 'session', 'SingletonLock'), 'stale');
  fs.writeFileSync(path.join(root, 'session', 'SingletonSocket'), 'stale');
  fs.writeFileSync(path.join(defaultDir, 'SingletonCookie'), 'stale');
  fs.writeFileSync(path.join(defaultDir, 'Preferences.json'), '{}');

  removeStaleBrowserLocks(root);

  assert.equal(fs.existsSync(path.join(root, 'session', 'SingletonLock')), false);
  assert.equal(fs.existsSync(path.join(root, 'session', 'SingletonSocket')), false);
  assert.equal(fs.existsSync(path.join(defaultDir, 'SingletonCookie')), false);
  assert.equal(fs.existsSync(path.join(defaultDir, 'Preferences.json')), true);
});

test('removeStaleBrowserLocks não falha quando a pasta de sessão ainda não existe', () => {
  const root = path.join(tmpSessionDir(), 'nao-existe');
  assert.doesNotThrow(() => removeStaleBrowserLocks(root));
});
