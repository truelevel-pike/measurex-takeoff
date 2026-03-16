// Auto-scale detection tests for known Kirkland sample plan scales
// Run with: node test-auto-scale.mjs

const PDF_DPI = 72;

function normalizeScaleText(text) {
  return text
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/\bfeet\b/gi, 'ft')
    .replace(/\bfoot\b/gi, 'ft')
    .replace(/\binches\b/gi, 'in')
    .replace(/\binch\b/gi, 'in')
    .replace(/[\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseInchesToken(token) {
  const cleaned = token.trim().replace(/(\d)-(\d+\/\d+)/, '$1 $2');
  const mixed = cleaned.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = cleaned.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function hasNts(text) {
  return /\bN\.?T\.?S\.?\b/i.test(text) || /\bNOT\s+TO\s+SCALE\b/i.test(text);
}

function collectArchitecturalAndCivil(text, candidates) {
  const inchesToken = '(\\d+(?:\\.\\d+)?(?:[ -]\\d+\\/\\d+)?|\\d+\\/\\d+)';
  const prefix = '(\\bscale\\b\\s*:?\\s*)?';
  const inchUnit = '(?:"|in)';
  const footUnit = "(?:'|ft)";
  const footTail = '(?:\\s*[-]\\s*0\\s*(?:"|in)?)?';

  // Pattern 1: clear architectural e.g. 1/4" = 1'-0"
  const clear = new RegExp(
    `${prefix}${inchesToken}\\s*${inchUnit}\\s*=\\s*(\\d+(?:\\.\\d+)?)\\s*${footUnit}${footTail}`,
    'gi',
  );
  for (const match of text.matchAll(clear)) {
    const pref = match[1];
    const paperToken = match[2];
    const realFeet = Number(match[3]);
    const paperInches = parseInchesToken(paperToken);
    if (!paperInches || !Number.isFinite(realFeet) || realFeet <= 0) continue;
    const isLabeled = Boolean(pref && /\bscale\b/i.test(pref));
    const confidence = isLabeled ? 0.95 : 0.85;
    const label = `${paperToken.trim()}" = ${realFeet}'-0"`;
    const pixelsPerFoot = (paperInches * PDF_DPI) / realFeet;
    candidates.push({ label, confidence, pixelsPerFoot, matchIndex: match.index ?? 0 });
  }

  // Pattern 2: fuzzy e.g. 1" to 20'
  const fuzzy = new RegExp(
    `${prefix}${inchesToken}\\s*${inchUnit}\\s*(?:to|[-]|\\/)?\\s*(\\d+(?:\\.\\d+)?)\\s*${footUnit}`,
    'gi',
  );
  for (const match of text.matchAll(fuzzy)) {
    const pref = match[1];
    const paperToken = match[2];
    const realFeet = Number(match[3]);
    const paperInches = parseInchesToken(paperToken);
    if (!paperInches || !Number.isFinite(realFeet) || realFeet <= 0) continue;
    const isLabeled = Boolean(pref && /\bscale\b/i.test(pref));
    const confidence = isLabeled ? 0.85 : 0.65;
    const label = `${paperToken.trim()}" = ${realFeet}'`;
    const pixelsPerFoot = (paperInches * PDF_DPI) / realFeet;
    candidates.push({ label, confidence, pixelsPerFoot, matchIndex: match.index ?? 0 });
  }
}

function detectScale(text) {
  if (!text?.trim()) return null;
  const normalized = normalizeScaleText(text);
  if (!normalized) return null;
  if (hasNts(normalized)) return null;

  const candidates = [];
  collectArchitecturalAndCivil(normalized, candidates);

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return a.matchIndex - b.matchIndex;
  });
  return candidates[0];
}

// ---- TESTS ----

const tests = [
  // Kirkland page 1: site plan — 1 inch = 20 feet
  {
    desc: 'Kirkland p1 — civil text "SCALE 1 inch = 20 feet"',
    text: 'SCALE 1 inch = 20 feet',
    expectedPxPerFt: (1 * PDF_DPI) / 20,   // 3.6
  },
  {
    desc: 'Kirkland p1 — short form 1" = 20\'',
    text: '1" = 20\'',
    expectedPxPerFt: (1 * PDF_DPI) / 20,
  },
  {
    desc: 'Kirkland p1 — labelled "SCALE: 1" = 20\'"',
    text: "SCALE: 1\" = 20'",
    expectedPxPerFt: (1 * PDF_DPI) / 20,
  },
  // Kirkland page 2: floor plan — 1/4 inch = 1 foot
  {
    desc: 'Kirkland p2 — architectural "Scale: 1/4" = 1\'-0""',
    text: "Scale: 1/4\" = 1'-0\"",
    expectedPxPerFt: (0.25 * PDF_DPI) / 1,  // 18.0
  },
  {
    desc: 'Kirkland p2 — abbreviated "1/4 in = 1 ft"',
    text: '1/4 in = 1 ft',
    expectedPxPerFt: (0.25 * PDF_DPI) / 1,
  },
  {
    desc: 'Kirkland p2 — Togal-style "1/4" = 1\'0""',
    text: '1/4" = 1\'0"',
    expectedPxPerFt: (0.25 * PDF_DPI) / 1,
  },
  // NTS — should return null
  {
    desc: 'NTS — "Not to Scale"',
    text: 'Not to Scale',
    expectedPxPerFt: null,
  },
  {
    desc: 'NTS abbreviation — "N.T.S."',
    text: 'N.T.S.',
    expectedPxPerFt: null,
  },
];

let passed = 0, failed = 0;
console.log('=== auto-scale.ts Test Suite — Kirkland Sample Plans ===\n');

for (const t of tests) {
  const result = detectScale(t.text);
  const got = result?.pixelsPerFoot ?? null;
  const exp = t.expectedPxPerFt;

  let ok;
  if (exp === null) {
    ok = got === null;
  } else {
    ok = got !== null && Math.abs(got - exp) < 0.01;
  }

  if (ok) {
    const detail = got !== null ? `px/ft=${got.toFixed(3)}, confidence=${result.confidence}, label="${result.label}"` : 'null (NTS)';
    console.log(`✅ PASS  ${t.desc}`);
    console.log(`         → ${detail}`);
    passed++;
  } else {
    const detail = got !== null ? `px/ft=${got?.toFixed(3)}` : 'null';
    const expDetail = exp !== null ? `px/ft=${exp.toFixed(3)}` : 'null';
    console.log(`❌ FAIL  ${t.desc}`);
    console.log(`         → got: ${detail}  expected: ${expDetail}`);
    failed++;
  }
  console.log();
}

console.log(`=== Results: ${passed}/${passed + failed} passed ===`);
if (failed > 0) process.exit(1);
