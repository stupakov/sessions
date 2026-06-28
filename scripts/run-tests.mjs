#!/usr/bin/env node
// Run Vitest under Electron's bundled Node runtime — the app's *actual* runtime.
//
// Why not plain `vitest`? `better-sqlite3` is a native module compiled for Electron's
// ABI (via electron-rebuild). Electron's module ABI (132) is Electron-specific and does
// not match any standalone Node release, so a system `node` can't load the same binary
// the app ships. Rather than maintain a second build for tests, we run the test runner
// inside Electron (ELECTRON_RUN_AS_NODE=1) so it loads the exact binary the app uses.
//
// Electron's path and the Vitest CLI are resolved from node_modules (not PATH), so this
// works regardless of shell, OS, or whether `electron` happens to be on PATH. Extra args
// are forwarded, so `npm test -- <files>` / watch mode / reporters all work.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const electronBinary = require('electron') // default export = absolute path to the binary
const vitestCli = require.resolve('vitest/vitest.mjs')

const child = spawn(electronBinary, [vitestCli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 1)
})
child.on('error', (err) => {
  console.error('Failed to launch Electron for tests:', err)
  process.exit(1)
})
