import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';

test('production-сервер принимает HTTP и корректно завершается по SIGINT', { timeout: 15000 }, async () => {
  // stdin carries Ctrl+C on Windows, where process.kill(SIGINT) forcibly terminates.
  const child = spawn(process.execPath, ['--input-type=module', '-e', `
    process.stdin.resume();
    process.stdin.on('data', () => { process.emit('SIGINT'); process.stdin.destroy(); });
    await import('./dist/index.js');
  `], { cwd: new URL('..', import.meta.url), env: { ...process.env, DATABASE_URL: '', PORT: '31987' }, stdio: 'pipe' });
  let output = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { output += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { output += chunk; });
  const exited = once(child, 'exit');
  try {
    for (let attempt = 0; attempt < 80 && !output.includes('Server listening'); attempt++) {
      if (child.exitCode !== null) assert.fail(output);
      await setTimeout(50);
    }
    assert.match(output, /Server listening/);
    const response = await fetch('http://127.0.0.1:31987/api/health');
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'ok' });
    child.stdin.write('stop');
    const [code] = await exited;
    assert.equal(code, 0, output);
    assert.match(output, /Сервер остановлен/);
  } finally {
    if (child.exitCode === null) child.kill();
  }
});
