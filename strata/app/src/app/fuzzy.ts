// Fuzzy matching for the command palette: subsequence match with bonuses for word starts and
// consecutive letters; Levenshtein for "Did you mean".

export interface FuzzyHit { score: number; hits: number[] }

const WORD_BREAK = /[\s\-_:./(]/;

export function fuzzyScore(query: string, text: string): FuzzyHit | null {
  const q = query.toLowerCase().trim();
  if (!q) return { score: 0, hits: [] };
  const t = text.toLowerCase();
  // Try every start position of the first letter and keep the best greedy run.
  let best: FuzzyHit | null = null;
  for (let start = t.indexOf(q[0]); start >= 0; start = t.indexOf(q[0], start + 1)) {
    let qi = 0, score = 0, prev = -2;
    const hits: number[] = [];
    for (let ti = start; ti < t.length && qi < q.length; ti++) {
      if (t[ti] !== q[qi]) continue;
      let s = 1;
      if (ti === 0 || WORD_BREAK.test(t[ti - 1])) s += 8;
      if (prev === ti - 1) s += 5;
      score += s;
      hits.push(ti);
      prev = ti;
      qi++;
    }
    if (qi < q.length) break;
    if (t.startsWith(q)) score += 12;
    score -= (t.length - q.length) * 0.04 + (hits[hits.length - 1] - hits[0] - q.length + 1) * 0.3;
    if (!best || score > best.score) best = { score, hits };
    if (start > 40) break;
  }
  return best;
}

export function levenshtein(a: string, b: string): number {
  a = a.toLowerCase(); b = b.toLowerCase();
  if (a === b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

/** Closest candidate by edit distance, comparing against the whole title and each word. */
export function closest(query: string, candidates: string[]): string | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;
  let best: string | null = null, bestD = Infinity;
  for (const c of candidates) {
    const parts = [c, ...c.split(/\s+/)];
    for (const p of parts) {
      const d = levenshtein(q, p.slice(0, Math.max(q.length, p.length)));
      const norm = d / Math.max(q.length, 1);
      if (norm < bestD) { bestD = norm; best = c; }
    }
  }
  return bestD <= 0.5 ? best : null;
}
