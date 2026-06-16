#!/usr/bin/env node
// start-vite-dev.mjs
// Managed Vite dev server starter for use as Tauri's beforeDevCommand.
// - Spawns Vite directly (no extra npm layer).
// - On any termination of *this* process (tauri window close, CLI shutdown, signals),
//   forcefully terminates the Vite child *and its subtree* (prevents rogue node servers).
// - Win32: taskkill /T + parentPid poll (tasklist). Unix: pkill -P or kill -TERM fallback.
// - Keeps behavior identical to `vite` for HMR, port 5173, etc.

import { spawn, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The beforeDevCommand runs with cwd = source/src-tauri (from tauri.conf.json location).
// Frontend lives at ../frontend relative to that.
const frontendDir = path.resolve(__dirname, '..');

const viteCli = path.join(frontendDir, 'node_modules', 'vite', 'bin', 'vite.js');

const child = spawn(process.execPath, [viteCli], {
  cwd: frontendDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    FORCE_COLOR: '1',
  },
});

let terminated = false;

function killViteTree() {
  if (terminated || !child || typeof child.pid !== 'number') return;
  terminated = true;

  // Ask nicely first
  try {
    child.kill('SIGTERM');
  } catch {
    /* best-effort; ignore termination errors during shutdown */
  }

  if (process.platform === 'win32') {
    // Force the whole tree (children of this vite node too)
    try {
      execSync(`taskkill /PID ${child.pid} /T /F`, { stdio: 'ignore', timeout: 2000 });
    } catch {
      /* best-effort; ignore termination errors during shutdown */
    }
  } else {
    // Cross-platform best-effort tree kill (unix pkill of children or TERM the pid)
    try {
      execSync(`pkill -P ${child.pid} 2>/dev/null || kill -TERM ${child.pid} 2>/dev/null || true`, { stdio: 'ignore', timeout: 1500 });
    } catch {
      /* best-effort; ignore on platforms without pkill or during shutdown */
    }
  }
}

function shutdown(exitCode = 0) {
  killViteTree();
  // small delay so tree has time to reap before wrapper exits
  setTimeout(() => process.exit(exitCode), 120);
}

// If the Vite child itself exits, take wrapper down (normal path)
child.on('exit', (code, signal) => {
  killViteTree();
  process.exit(code ?? (signal ? 1 : 0));
});

// Signals sent to the wrapper (tauri CLI typically uses these or closes stdio)
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
process.on('SIGHUP', () => shutdown(0));

// Belt-and-suspenders: on any exit of wrapper, ensure child is dead.
process.on('exit', () => {
  killViteTree();
});

// Windows-specific: poll whether our direct parent (the tauri CLI node process) is still alive.
// If it disappeared without sending us a signal (taskkill, window close on intermediate, etc.),
// we self-terminate and take Vite with us.
if (process.platform === 'win32') {
  const parentPid = process.ppid;
  if (parentPid && parentPid > 1) {
    const iv = setInterval(() => {
      try {
        const out = execSync(
          `tasklist /FI "PID eq ${parentPid}" /NH`,
          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 700 }
        );
        if (!out || !String(out).match(new RegExp(`\\b${parentPid}\\b`))) {
          clearInterval(iv);
          shutdown(0);
        }
      } catch {
        // tasklist can fail transiently; on repeated failure the CLI term path will have caught it.
      }
    }, 1800);
  }
}
