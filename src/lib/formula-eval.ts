/**
 * formula-eval.ts
 * Shared formula evaluator for Excel-like custom formulas.
 * Used by CustomFormulas component (display) and QuantitiesPanel (quantity overrides).
 *
 * Syntax: = <expr>
 * Supports: +, -, *, /, ^ with correct precedence, parentheses,
 *           numeric literals, and classification name references (case-insensitive).
 */

type Token =
  | { type: 'number'; value: number }
  | { type: 'op'; value: string }
  | { type: 'paren'; value: '(' | ')' }
  | { type: 'ref'; name: string };

export function tokenizeFormula(input: string, classificationNames: string[]): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = input.trim();

  // Sort names by length descending so longer names match first
  const sortedNames = [...classificationNames].sort((a, b) => b.length - a.length);

  while (i < s.length) {
    if (/\s/.test(s[i])) { i++; continue; }

    if (/[\d.]/.test(s[i])) {
      let num = '';
      while (i < s.length && /[\d.]/.test(s[i])) { num += s[i]; i++; }
      const parsed = parseFloat(num);
      if (isNaN(parsed)) throw new Error(`Invalid number: ${num}`);
      tokens.push({ type: 'number', value: parsed });
      continue;
    }

    if ('+-*/^'.includes(s[i])) {
      tokens.push({ type: 'op', value: s[i] });
      i++;
      continue;
    }

    if (s[i] === '(' || s[i] === ')') {
      tokens.push({ type: 'paren', value: s[i] as '(' | ')' });
      i++;
      continue;
    }

    let matched = false;
    for (const name of sortedNames) {
      if (s.substring(i, i + name.length).toLowerCase() === name.toLowerCase()) {
        tokens.push({ type: 'ref', name });
        i += name.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    throw new Error(`Unexpected character: "${s[i]}"`);
  }

  return tokens;
}

export function evaluateFormula(tokens: Token[], quantities: Record<string, number>): number {
  let pos = 0;

  function peek(): Token | undefined { return tokens[pos]; }
  function consume(): Token { return tokens[pos++]; }
  function opValue(t: Token | undefined): string | undefined {
    return t && t.type === 'op' ? t.value : undefined;
  }

  function parseExpr(): number {
    let left = parseTerm();
    let op = opValue(peek());
    while (op === '+' || op === '-') {
      consume();
      const right = parseTerm();
      left = op === '+' ? left + right : left - right;
      op = opValue(peek());
    }
    return left;
  }

  function parseTerm(): number {
    let left = parsePower();
    let op = opValue(peek());
    while (op === '*' || op === '/') {
      consume();
      const right = parsePower();
      left = op === '*' ? left * right : left / right;
      op = opValue(peek());
    }
    return left;
  }

  function parsePower(): number {
    let base = parseUnary();
    while (opValue(peek()) === '^') {
      consume();
      const exp = parseUnary();
      base = Math.pow(base, exp);
    }
    return base;
  }

  function parseUnary(): number {
    const op = opValue(peek());
    if (op === '+' || op === '-') {
      consume();
      const val = parseAtom();
      return op === '-' ? -val : val;
    }
    return parseAtom();
  }

  function parseAtom(): number {
    const t = peek();
    if (!t) throw new Error('Unexpected end of formula');

    if (t.type === 'number') {
      consume();
      return t.value;
    }

    if (t.type === 'ref') {
      consume();
      const val = quantities[t.name.toLowerCase()];
      if (val === undefined) throw new Error(`Unknown reference: "${t.name}"`);
      return val;
    }

    if (t.type === 'paren' && t.value === '(') {
      consume();
      const val = parseExpr();
      const closing = peek();
      if (!closing || closing.type !== 'paren' || closing.value !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      consume();
      return val;
    }

    throw new Error('Unexpected token');
  }

  const result = parseExpr();
  if (pos < tokens.length) throw new Error('Unexpected tokens after expression');
  return result;
}

/**
 * Evaluate a classification's custom formula string against a quantities map.
 * Returns null if no formula, formula is empty, or evaluation fails.
 * quantities: { [classificationName.toLowerCase()]: number }
 */
export function applyCustomFormula(
  formula: string | undefined,
  classificationNames: string[],
  quantities: Record<string, number>,
): number | null {
  if (!formula) return null;
  const raw = formula.startsWith('=') ? formula.slice(1).trim() : formula.trim();
  if (!raw) return null;
  try {
    const tokens = tokenizeFormula(raw, classificationNames);
    if (tokens.length === 0) return null;
    const result = evaluateFormula(tokens, quantities);
    return isFinite(result) ? result : null;
  } catch {
    return null;
  }
}
