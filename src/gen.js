/* 字页批量出题 WPGen —— 先构造、再自检。
   规则（与 game.js 一致）：四方向相邻；一条路径不重复用格；每格有使用次数 n，
   每找到一个必答词，路径上每格减一，减到 0 的格子不能再用；额外词不消耗次数；
   必答词顺序不限；必答词全部找到即过关。生成器不放幕布。 */
(function (root) {
  'use strict';

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash() {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < arguments.length; i++) {
      const s = String(arguments[i]) + '|';
      for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 16777619) >>> 0; }
    }
    return h;
  }
  function nbr(W, H) {
    const out = [];
    for (let i = 0; i < W * H; i++) {
      const r = (i / W) | 0, c = i % W, o = [];
      if (r > 0) o.push(i - W);
      if (r < H - 1) o.push(i + W);
      if (c > 0) o.push(i - 1);
      if (c < W - 1) o.push(i + 1);
      out.push(o);
    }
    return out;
  }
  function turns(p) {
    let t = 0;
    for (let k = 2; k < p.length; k++) if (p[k] - p[k - 1] !== p[k - 1] - p[k - 2]) t++;
    return t;
  }
  function shuffle(a, R) {
    for (let i = a.length - 1; i > 0; i--) { const j = (R() * (i + 1)) | 0; const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }

  /* all paths of word on letters, restricted to avail (null = all) */
  function allPaths(letters, NB, word, avail, limit) {
    const N = letters.length, res = [], used = new Uint8Array(N), path = [];
    limit = limit || 5000;
    function dfs(i, k) {
      if (res.length >= limit) return;
      if (used[i] || letters[i] !== word[k] || (avail && !avail[i])) return;
      used[i] = 1; path.push(i);
      if (k === word.length - 1) res.push(path.slice());
      else { const nb = NB[i]; for (let j = 0; j < nb.length; j++) dfs(nb[j], k + 1); }
      used[i] = 0; path.pop();
    }
    for (let s = 0; s < N; s++) dfs(s, 0);
    return res;
  }

  function trieOf(words) {
    const t = {};
    words.forEach(w => { let n = t; for (let k = 0; k < w.length; k++) n = n[w[k]] = n[w[k]] || {}; n.$ = w; });
    return t;
  }
  function scan(letters, NB, trie) {
    const found = new Set(), N = letters.length, used = new Uint8Array(N);
    function dfs(i, node) {
      const nx = node[letters[i]]; if (!nx) return;
      if (nx.$) found.add(nx.$);
      used[i] = 1;
      const nb = NB[i]; for (let j = 0; j < nb.length; j++) if (!used[nb[j]]) dfs(nb[j], nx);
      used[i] = 0;
    }
    for (let i = 0; i < N; i++) dfs(i, trie);
    return found;
  }

  /* Exhaustive play-through over every order and every path choice.
     Returns {ok, states, dead, solution, overflow}. dead = reachable states, not finished,
     from which no sequence completes the level (a trap). */
  function exhaustive(letters, NB, words, counts, maxStates) {
    const T = words.length, memo = new Map();
    let states = 0, dead = 0, overflow = false;
    const full = (1 << T) - 1;
    const cnt = counts.slice();
    function moves(mask) {
      const avail = cnt.map(c => c > 0), out = [];
      for (let w = 0; w < T; w++) {
        if (mask & (1 << w)) continue;
        const seen = new Set();
        allPaths(letters, NB, words[w], avail, 5000).forEach(p => {
          const sig = p.slice().sort((a, b) => a - b).join(',');
          if (!seen.has(sig)) { seen.add(sig); out.push([w, p]); }
        });
      }
      return out;
    }
    function rec(mask) {
      if (mask === full) return true;
      const key = cnt.join(',') + '|' + mask;
      const m = memo.get(key);
      if (m !== undefined) return m;
      if (++states > maxStates) { overflow = true; throw 0; }
      let ok = false;
      const mv = moves(mask);
      for (let k = 0; k < mv.length; k++) {
        const p = mv[k][1];
        p.forEach(i => cnt[i]--);
        const r = rec(mask | (1 << mv[k][0]));
        p.forEach(i => cnt[i]++);
        if (r) ok = true;           /* keep exploring: we must visit every reachable state */
      }
      if (!ok) dead++;
      memo.set(key, ok);
      return ok;
    }
    let ok = false;
    try { ok = rec(0); } catch (e) { if (e !== 0) throw e; }
    return { ok: ok && !overflow, states: states, dead: dead, overflow: overflow };
  }

  /* Build the lexicon views the generator needs.
     Required pool is tier 0–1 (and tier 2, capped later). Tiers 3–4 stay extras. */
  function prepare(lexRows, validSet, policy) {
    const no = new Set([].concat(policy.blocked, policy.flagged, policy.mild, policy.specialist));
    const blocked = new Set(policy.blocked);
    const info = Object.create(null), pool = [];
    lexRows.forEach(r => {
      info[r.w] = r;
      if (!/^[A-Z]{3,7}$/.test(r.w)) return;
      if (r.spec || no.has(r.w)) return;
      if (r.tier !== 0 && r.tier !== 1 && r.tier !== 2) return;
      pool.push(r);
    });
    const valid = [];
    validSet.forEach(w => { if (/^[A-Z]{3,10}$/.test(w) && !blocked.has(w)) valid.push(w); });
    return { info: info, pool: pool, validTrie: trieOf(valid), no: no, blocked: blocked };
  }

  /* difficulty 0..1 for a level number under the curve */
  function curveAt(n, cfg) {
    const span = Math.max(1, cfg.to - cfg.from);
    const prog = Math.min(1, Math.max(0, (n - cfg.from) / span));
    let d = cfg.dStart + (cfg.dEnd - cfg.dStart) * prog;
    const P = Math.max(3, cfg.period | 0), pos = (n - cfg.from) % P; /* 0..P-1 */
    const amp = cfg.relief;
    if (pos === P - 1) d += amp * 0.6;              /* peak closes the block */
    else if (pos === 0 && n !== cfg.from) d -= amp;  /* relief right after a peak */
    else if (pos === Math.floor(P / 2)) d -= amp * 0.5;
    else d += amp * 0.25 * (pos / P);
    return Math.min(1, Math.max(0, d));
  }

  /* The editor's four dimensions turned into concrete targets. */
  function targetsFor(d, sizes, R) {
    const cells = 6 + 9 * d;
    let best = Infinity, cand = [];
    sizes.forEach(s => {
      const diff = Math.abs(s[0] * s[1] - cells);
      if (diff < best - 0.01) { best = diff; cand = [s]; } else if (Math.abs(diff - best) <= 0.01) cand.push(s);
    });
    const size = cand[(R() * cand.length) | 0];
    const N = size[0] * size[1];
    const usesPerCell = 1.4 + 2.2 * d;                    /* Word Tiles: ~1.4 at level 1, ~3.4 later */
    let T = Math.round(3.5 + 9 * d);
    T = Math.max(3, Math.min(14, T));
    const maxLen = Math.max(3, Math.min(7, N, Math.round(3.6 + 3.2 * d)));
    return {
      d: d, W: size[0], H: size[1], N: N, T: T,
      letters: Math.round(N * usesPerCell),
      maxLen: maxLen,
      scoreFloor: 0.85 - 0.13 * d,                        /* vocabulary: 0 → score≥0.85 (tier 0), 1 → score≥0.72 (tier 0–1) */
      tier2Max: d >= 0.8 ? 1 : 0,                         /* harder levels may include at most one tier-2 word */
      turny: d                                            /* path complexity: chance to prefer bendy paths */
    };
  }

  function eligible(P, tg, exclude) {
    return P.pool.filter(r => {
      if (r.w.length > tg.maxLen || r.w.length > tg.N) return false;
      if (exclude.has(r.w)) return false;
      if (r.tier === 2) return tg.tier2Max > 0;
      if (r.tier !== 0 && r.tier !== 1) return false;
      const s = r.score == null ? 0 : r.score;
      return s + 1e-9 >= tg.scoreFloor;
    });
  }

  /* random self-avoiding placement of word, may reuse cells whose letter matches */
  function place(word, grid, NB, R, needNew, preferTurn) {
    const N = grid.length, starts = shuffle([...Array(N).keys()], R), used = new Uint8Array(N);
    const path = [];
    let tries = 0;
    function dfs(i, k, fresh) {
      if (++tries > 4000) return false;
      if (used[i]) return false;
      if (grid[i] && grid[i] !== word[k]) return false;
      used[i] = 1; path.push(i);
      const f = fresh + (grid[i] ? 0 : 1);
      if (k === word.length - 1) {
        if (f >= needNew) return true;
      } else {
        let nb = shuffle(NB[i].slice(), R);
        if (path.length >= 2) {
          const dir = i - path[path.length - 2];
          const straightFirst = R() > preferTurn;
          nb.sort((a, b) => ((a - i === dir) === straightFirst ? -1 : 1) - ((b - i === dir) === straightFirst ? -1 : 1));
        }
        for (let j = 0; j < nb.length; j++) if (dfs(nb[j], k + 1, f)) return true;
      }
      used[i] = 0; path.pop();
      return false;
    }
    for (let s = 0; s < starts.length; s++) if (dfs(starts[s], 0, 0)) return path.slice();
    return null;
  }

  function pickWeighted(list, R, wfn) {
    let tot = 0; const ws = list.map(x => { const v = wfn(x); tot += v; return v; });
    let r = R() * tot;
    for (let i = 0; i < list.length; i++) { r -= ws[i]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }

  /* One attempt to build a level by construction. Returns {level, why}. */
  function attempt(P, tg, exclude, R, opts) {
    const N = tg.N, NB = nbr(tg.W, tg.H);
    const elig = eligible(P, tg, exclude);
    if (elig.length < 30) return { why: 'pool' };
    const byLen = {};
    elig.forEach(r => { (byLen[r.w.length] = byLen[r.w.length] || []).push(r); });
    const zw = r => Math.pow(Math.max(0.04, (r.score == null ? 0.8 : r.score) - 0.7), 2) * (r.tier === 0 ? 1.5 : 1);
    const grid = Array(N).fill('');
    const chosen = [];           /* {w, p, tier} */
    const used = new Set();
    /* 1) hero word: the longest of the level, from tier 0–1 */
    const heroLen = tg.maxLen >= 5 ? tg.maxLen - (R() < 0.35 ? 1 : 0) : tg.maxLen;
    const heroes = byLen[heroLen] || byLen[tg.maxLen];
    if (!heroes) return { why: 'pool' };
    const hero = pickWeighted(heroes.filter(r => r.tier < 2), R, zw);
    if (!hero) return { why: 'pool' };
    const hp = place(hero.w, grid, NB, R, 1, tg.turny);
    if (!hp) return { why: 'fill' };
    hp.forEach((c, k) => { grid[c] = hero.w[k]; });
    chosen.push({ w: hero.w, p: hp, tier: hero.tier }); used.add(hero.w);
    /* 2) cover every empty cell with short words placed through it */
    let guard = 0;
    while (grid.some(ch => !ch)) {
      if (++guard > 60) return { why: 'fill' };
      const empty = [];
      grid.forEach((ch, i) => { if (!ch) empty.push(i); });
      let ok = false;
      for (let t = 0; t < 40 && !ok; t++) {
        const L = R() < 0.55 ? 3 : (R() < 0.8 ? 4 : 5);
        const list = (byLen[Math.min(L, tg.maxLen)] || byLen[3] || []).filter(r => !used.has(r.w) && r.tier < 2);
        if (!list.length) continue;
        const r = pickWeighted(list, R, zw);
        const p = place(r.w, grid, NB, R, 1, tg.turny);
        if (!p) continue;
        p.forEach((c, k) => { grid[c] = r.w[k]; });
        chosen.push({ w: r.w, p: p, tier: r.tier }); used.add(r.w);
        ok = true;
      }
      if (!ok) return { why: 'fill' };
    }
    if (chosen.length > tg.T + 1) return { why: 'fill' };
    /* 3) everything the finished board spells */
    const eligTrie = trieOf(elig.map(r => r.w));
    const findable = [...scan(grid, NB, eligTrie)].filter(w => !used.has(w));
    const pathCache = {};
    const pathsFor = w => pathCache[w] || (pathCache[w] = allPaths(grid, NB, w, null, 2000));
    /* add required words until workload reached, keeping ~80% 3-4 letters */
    const longCap = Math.max(1, Math.round(tg.T * 0.25));
    let longN = chosen.filter(c => c.w.length >= 5).length;
    let tier2N = 0;
    const rest = shuffle(findable.slice(), R);
    rest.sort((a, b) => ((P.info[b].score || 0) - (P.info[a].score || 0)) + (R() - 0.5) * 0.06);
    for (let k = 0; k < rest.length && chosen.length < tg.T; k++) {
      const w = rest[k], inf = P.info[w];
      if (w.length >= 5 && longN >= longCap) continue;
      if (inf.tier === 2 && tier2N >= tg.tier2Max) continue;
      const ps = pathsFor(w);
      if (!ps.length) continue;
      /* path choice by complexity */
      const sorted = ps.slice().sort((a, b) => turns(a) - turns(b));
      const p = R() < tg.turny ? sorted[sorted.length - 1 - ((R() * Math.min(3, sorted.length)) | 0)] : sorted[(R() * Math.min(2, sorted.length)) | 0];
      chosen.push({ w: w, p: p, tier: inf.tier }); used.add(w);
      if (w.length >= 5) longN++;
      if (inf.tier === 2) tier2N++;
    }
    if (chosen.length < Math.max(3, tg.T - 1)) return { why: 'few' };
    const words = chosen.map(c => c.w);
    if (new Set(words).size !== words.length) return { why: 'dup' };
    const short = words.filter(w => w.length <= 4).length;
    if (words.length >= 5 && short / words.length < 0.6) return { why: 'mix' };
    /* 4) counts are exactly the uses of the constructed paths */
    const counts = Array(N).fill(0);
    chosen.forEach(c => c.p.forEach(i => counts[i]++));
    if (counts.some(c => c < 1 || c > 35)) return { why: 'count' };
    if (Math.max.apply(null, counts) > (opts.maxCount || 9)) return { why: 'count' };
    /* 5) rigor: exhaustive play-through (every order, every path) */
    const ex = exhaustive(grid, NB, words, counts, opts.maxStates || 60000);
    if (ex.overflow) return { why: 'big' };
    if (!ex.ok) return { why: 'unsolvable' };
    if (ex.dead > 0) return { why: 'trap' };
    /* 6) extras = all other valid words the board spells */
    const reqSet = new Set(words);
    const extras = [...scan(grid, NB, P.validTrie)].filter(w => !reqSet.has(w)).sort();
    /* game-format level; words sorted by length like toLevel() */
    const order = chosen.slice().sort((a, b) => a.w.length - b.w.length || a.w.localeCompare(b.w));
    const rows = [];
    for (let r = 0; r < tg.H; r++) rows.push(grid.slice(r * tg.W, (r + 1) * tg.W).join(''));
    const ty = order.map(c => (c.tier === 2 ? 1 : 0));
    const lv = {
      g: rows.join(','),
      t: order.map(c => c.w).join(' '),
      e: extras.join(' '),
      n: counts.map(c => c.toString(36)).join('')
    };
    if (ty.some(Boolean)) lv.ty = ty.join('');
    return { level: lv, stats: { states: ex.states, solution: order.map(c => ({ w: c.w, p: c.p })) } };
  }

  /* Generate one level number n. exclude: words used within 10 levels. */
  function generateOne(P, n, cfg, exclude) {
    const reasons = {};
    let tries = 0;
    for (let relax = 0; relax < 4; relax++) {
      for (let a = 0; a < (cfg.tries || 80); a++) {
        tries++;
        const R = rng(hash(cfg.seed, n, relax, a));
        let d = curveAt(n, cfg) - relax * 0.08;
        d = Math.max(0, d);
        const tg = targetsFor(d, cfg.sizes, R);
        const res = attempt(P, tg, exclude, R, cfg);
        if (res.level) return { level: res.level, tg: tg, tries: tries, reasons: reasons, relax: relax, stats: res.stats };
        reasons[res.why] = (reasons[res.why] || 0) + 1;
      }
    }
    return { level: null, tries: tries, reasons: reasons };
  }

  root.WPGen = { rng: rng, hash: hash, nbr: nbr, allPaths: allPaths, scan: scan, trieOf: trieOf,
    exhaustive: exhaustive, prepare: prepare, curveAt: curveAt, targetsFor: targetsFor,
    attempt: attempt, generateOne: generateOne };
})(typeof globalThis !== 'undefined' ? globalThis : this);
