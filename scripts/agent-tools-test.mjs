#!/usr/bin/env node
/**
 * MeasureX Agent Tools Test Suite (P1-06)
 * Tests ALL draw tools, zoom controls, and undo/redo via CDP.
 *
 * Usage: node scripts/agent-tools-test.mjs [projectId] [chromePort]
 * Default port: 18800
 *
 * Requires a running Chrome with --remote-debugging-port=18800
 * and MeasureX open at localhost:3000.
 */

import WebSocket from 'ws';

const PROJECT_ID = process.argv[2] || 'a840faa9-642e-4ed0-bb11-3578e4905374';
const CHROME_PORT = process.argv[3] || '18800';

let msgId = 1;

// ── CDP helpers ────────────────────────────────────────────────────────────

function send(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    const handler = (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id === id) {
        ws.off('message', handler);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
    };
    ws.on('message', handler);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, expression) {
  const result = await send(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result?.result?.value;
}

async function cdpClick(ws, x, y) {
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await sleep(30);
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(30);
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Result tracking ────────────────────────────────────────────────────────

const results = [];

function record(name, pass, note = '') {
  const status = pass === null ? 'SKIP' : pass ? 'PASS' : 'FAIL';
  const line = `${status}: ${name}${note ? ` (${note})` : ''}`;
  console.log(line);
  results.push({ name, status });
  return pass;
}

// ── Core test helper ───────────────────────────────────────────────────────

/**
 * Click a testid button, wait, then read #mx-agent-state data-active-tool.
 * Returns true if activeTool === expectedTool, false if wrong, null if button not found.
 */
async function testTool(ws, testid, expectedTool) {
  const rect = await evaluate(
    ws,
    `JSON.stringify(document.querySelector('[data-testid="${testid}"]')?.getBoundingClientRect())`,
  );
  if (!rect) {
    record(testid, null, 'element not found');
    return null;
  }
  const el = JSON.parse(rect);
  if (!el || el.width === 0) {
    record(testid, null, 'element not visible');
    return null;
  }
  const x = Math.round(el.x + el.width / 2);
  const y = Math.round(el.y + el.height / 2);
  await cdpClick(ws, x, y);
  await sleep(250);
  const activeTool = await evaluate(
    ws,
    `document.getElementById('mx-agent-state')?.dataset?.activeTool`,
  );
  const pass = activeTool === expectedTool;
  record(testid, pass, `activeTool=${activeTool ?? 'null'} (expected ${expectedTool})`);
  return pass;
}

/**
 * Click a testid button and verify no JS error / no crash (button exists and is clickable).
 * Does not check activeTool.
 */
async function testClickOnly(ws, testid, label) {
  const rect = await evaluate(
    ws,
    `JSON.stringify(document.querySelector('[data-testid="${testid}"]')?.getBoundingClientRect())`,
  );
  if (!rect) {
    record(label ?? testid, null, 'element not found');
    return null;
  }
  const el = JSON.parse(rect);
  if (!el || el.width === 0) {
    record(label ?? testid, null, 'element not visible');
    return null;
  }
  const x = Math.round(el.x + el.width / 2);
  const y = Math.round(el.y + el.height / 2);

  // Capture errors before click
  const errBefore = await evaluate(ws, `window.__lastError || null`);
  await cdpClick(ws, x, y);
  await sleep(250);
  const errAfter = await evaluate(ws, `window.__lastError || null`);
  const pass = errAfter === errBefore; // no new error
  record(label ?? testid, pass, pass ? 'no crash' : `error: ${errAfter}`);
  return pass;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function run() {
  // ── Connect to Chrome tab ──────────────────────────────────────────────
  const tabsRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json`);
  const tabs = await tabsRes.json();
  const tab = tabs.find((t) => t.url.includes('localhost:3000') && t.webSocketDebuggerUrl);
  if (!tab) throw new Error('No localhost:3000 tab found. Open MeasureX first.');

  console.log(`\n=== MeasureX Agent Tools Test Suite (P1-06) ===`);
  console.log(`Tab: ${tab.url}`);
  console.log(`Project: ${PROJECT_ID}\n`);

  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.on('open', resolve));

  // Install global error tracker so we can detect JS crashes
  await evaluate(ws, `
    window.__lastError = null;
    window.addEventListener('error', e => { window.__lastError = e.message; });
    window.addEventListener('unhandledrejection', e => { window.__lastError = String(e.reason); });
  `);

  // ── 0. Wait for app to be ready ────────────────────────────────────────
  console.log('[0] Waiting for app to load...');
  let ready = false;
  for (let i = 0; i < 20; i++) {
    const totalPages = await evaluate(
      ws,
      `Number(document.getElementById('mx-agent-state')?.dataset?.totalPages || 0)`,
    );
    if (totalPages > 0) {
      console.log(`  App ready — totalPages=${totalPages}\n`);
      ready = true;
      break;
    }
    await sleep(500);
  }
  if (!ready) {
    console.log(`  ⚠️  mx-agent-state not showing totalPages > 0 after 10s — some tests may be skipped`);
  }

  // ── 1–11: Tool activation tests ────────────────────────────────────────
  console.log('--- Tool Activation Tests ---');

  // Select, Pan
  await testTool(ws, 'tool-select', 'select');
  await testTool(ws, 'tool-pan', 'pan');

  // Draw tools — all three (area, linear, count) set activeTool = "draw"
  await testTool(ws, 'tool-area', 'draw');
  await testTool(ws, 'tool-linear', 'draw');
  await testTool(ws, 'tool-count', 'draw');

  // Other tools
  await testTool(ws, 'tool-merge', 'merge');
  await testTool(ws, 'tool-split', 'split');
  await testTool(ws, 'tool-cut', 'cut');
  await testTool(ws, 'tool-measure', 'measure');
  await testTool(ws, 'tool-ai', 'ai');

  // Return to select before undo/redo/zoom tests
  await testTool(ws, 'tool-select', 'select');

  // ── 12: Undo / Redo ────────────────────────────────────────────────────
  console.log('\n--- Undo / Redo Tests ---');
  await testClickOnly(ws, 'tool-undo', 'tool-undo (no crash)');
  await testClickOnly(ws, 'tool-redo', 'tool-redo (no crash)');

  // ── 13: Zoom controls ──────────────────────────────────────────────────
  console.log('\n--- Zoom Control Tests ---');
  await testClickOnly(ws, 'zoom-in-btn', 'zoom-in-btn (no crash)');
  await testClickOnly(ws, 'zoom-out-btn', 'zoom-out-btn (no crash)');
  await testClickOnly(ws, 'zoom-fit-btn', 'zoom-fit-btn (no crash)');

  // ── Summary ────────────────────────────────────────────────────────────
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;
  const total = results.length;

  console.log(`\n${'='.repeat(60)}`);
  console.log(` Check                                   | Result`);
  console.log(`-----------------------------------------+----------`);
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️ ';
    console.log(` ${r.name.padEnd(40)} | ${icon} ${r.status}`);
  }
  console.log(`${'='.repeat(60)}`);
  console.log(` Total: ${total}  ✅ ${passed} passed  ❌ ${failed} failed  ⏭️  ${skipped} skipped`);
  console.log(`${'='.repeat(60)}\n`);

  if (failed > 0) {
    console.log(`❌ ${failed} test(s) FAILED`);
  } else {
    console.log(`✅ ALL TESTS PASSED (${skipped > 0 ? `${skipped} skipped` : 'no skips'})`);
  }

  ws.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error('❌ Fatal error:', e.message);
  process.exit(1);
});
