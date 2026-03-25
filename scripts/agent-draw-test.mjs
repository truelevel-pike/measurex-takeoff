#!/usr/bin/env node
/**
 * MeasureX Agent Draw Test
 * Tests the full agent polygon drawing workflow via CDP.
 * 
 * Proven workflow (2026-03-25):
 * 1. Open project in ?agent=1 mode
 * 2. Select classification via data-classification-id
 * 3. Click "Draw Area (D)" toolbar button
 * 4. Click "Rect" mode button
 * 5. Two CDP canvas clicks at viewport coordinates
 * 6. Verify polygon-label appears with SF measurement
 * 
 * Usage: node scripts/agent-draw-test.mjs [projectId] [chromePort]
 */

import WebSocket from 'ws';

const PROJECT_ID = process.argv[2] || 'a840faa9-642e-4ed0-bb11-3578e4905374';
const CHROME_PORT = process.argv[3] || '18800';
const BASE_URL = `http://localhost:3000`;

let msgId = 1;

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
  const result = await send(ws, 'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return result?.result?.value;
}

async function cdpClick(ws, x, y) {
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await new Promise(r => setTimeout(r, 50));
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await new Promise(r => setTimeout(r, 30));
  await send(ws, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  console.log(`  CDP click at (${x}, ${y})`);
}

async function run() {
  // Get WS URL for the MeasureX tab
  const tabsRes = await fetch(`http://127.0.0.1:${CHROME_PORT}/json`);
  const tabs = await tabsRes.json();
  const tab = tabs.find(t => t.url.includes('localhost:3000') && t.webSocketDebuggerUrl);
  if (!tab) throw new Error('No localhost:3000 tab found. Open MeasureX first.');
  
  console.log(`Connecting to tab: ${tab.url}`);
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(resolve => ws.on('open', resolve));

  // Step 1: Get canvas position
  console.log('\n[1] Getting canvas position...');
  const canvasInfo = JSON.parse(await evaluate(ws, `
    (() => {
      const c = document.querySelector('[data-testid="canvas-area"]');
      if(!c) return JSON.stringify({err: 'canvas not found'});
      const r = c.getBoundingClientRect();
      return JSON.stringify({l: Math.round(r.left), t: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height)});
    })()
  `));
  
  if (canvasInfo.err) throw new Error(canvasInfo.err);
  console.log(`  Canvas: left=${canvasInfo.l}, top=${canvasInfo.t}, ${canvasInfo.w}x${canvasInfo.h}`);

  // Step 2: Select first classification
  console.log('\n[2] Selecting first classification...');
  const selectResult = await evaluate(ws, `
    (() => {
      const rows = document.querySelectorAll('[data-classification-id]');
      if(rows.length === 0) return 'no classifications found';
      rows[0].click();
      return 'selected: ' + rows[0].dataset.classificationId;
    })()
  `);
  console.log(`  ${selectResult}`);

  // Step 3: Click Draw Area button
  console.log('\n[3] Clicking Draw Area toolbar button...');
  const drawBtn = await evaluate(ws, `
    (() => {
      const btn = document.querySelector('button[aria-label="Draw Area (D)"]');
      if(!btn) return 'draw button not found';
      btn.click();
      return 'clicked';
    })()
  `);
  console.log(`  ${drawBtn}`);
  await new Promise(r => setTimeout(r, 300));

  // Step 4: Click Rect mode button
  console.log('\n[4] Activating Rectangle mode...');
  const rectBtn = await evaluate(ws, `
    (() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const rect = btns.find(b => b.textContent.trim() === 'Rect');
      if(!rect) return 'rect button not found';
      rect.click();
      return 'clicked rect';
    })()
  `);
  console.log(`  ${rectBtn}`);
  await new Promise(r => setTimeout(r, 200));

  // Step 5: Draw rectangle via CDP
  // Use center-left quarter of canvas for corner 1, center-right for corner 2
  const c1x = canvasInfo.l + Math.round(canvasInfo.w * 0.1);
  const c1y = canvasInfo.t + Math.round(canvasInfo.h * 0.1);
  const c2x = canvasInfo.l + Math.round(canvasInfo.w * 0.5);
  const c2y = canvasInfo.t + Math.round(canvasInfo.h * 0.5);

  console.log(`\n[5] Drawing rectangle: (${c1x},${c1y}) → (${c2x},${c2y})`);
  await cdpClick(ws, c1x, c1y);
  await new Promise(r => setTimeout(r, 800));
  await cdpClick(ws, c2x, c2y);
  await new Promise(r => setTimeout(r, 500));

  // Step 6: Verify polygon label
  console.log('\n[6] Checking for polygon label...');
  const label = await evaluate(ws, `
    (() => {
      const labels = document.querySelectorAll('[data-testid="polygon-label"]');
      if(labels.length === 0) return null;
      return labels[labels.length-1].textContent.trim();
    })()
  `);
  
  if (label) {
    console.log(`\n✅ SUCCESS — Polygon drawn: ${label}`);
  } else {
    console.log('\n⚠️  No polygon-label found. Check quantities panel for SF value.');
    // Check quantities panel
    const total = await evaluate(ws, `document.querySelector('[data-testid="quantities-total-area"]')?.textContent?.trim() || 'not found'`);
    console.log(`  Quantities total: ${total}`);
  }

  ws.close();
}

run().catch(e => { console.error('❌ Error:', e.message); process.exit(1); });
