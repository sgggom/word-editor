#!/usr/bin/env python3
"""Standalone verifier for 字页 (wordpages) game levels {g,t,e,n,o}.
Written independently of the editor/generator JS. Simulates the game rules from game.js:
  * a word is traced over 4-adjacent tiles (up/down/left/right), no tile twice in one word;
  * a tile is usable while its remaining count n > 0 and it is not under a closed curtain
    (curtain [req, cells] is closed while fewer than req required words are found);
  * finding a required word decrements every tile on its path by 1; extras consume nothing;
  * required words may be found in any order; the level is won when all are found.
Checks: shape, word policy, exhaustive play over EVERY order and EVERY path choice
(start solvable, zero reachable dead-end states), the game's own solve() within its 60000 budget,
extra-word completeness, no required repeats within 10 levels.
Usage: verify_levels.py levels.json [--wordbank DIR] [--report out.json]"""
import sys, json, csv, os, re, time, argparse

def load_lists(wb, here):
    graded = {}
    with open(os.path.join(wb, 'question_words_v2.csv'), newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            graded[r['Word'].strip().upper()] = {'band': r['band'].strip(), 'spec': str(r.get('specialist', '')).strip().lower() in ('1', 'true', 'yes')}
    valid = {w.strip().upper() for w in open(os.path.join(wb, 'validation_words.txt'), encoding='utf-8') if w.strip()}
    mild = {w.strip().upper() for w in open(os.path.join(wb, 'allowed_mild_words.txt'), encoding='utf-8') if w.strip()}
    flagged = {w.strip().upper() for w in open(os.path.join(wb, 'flagged_offensive.txt'), encoding='utf-8') if w.strip()}
    spec = set()
    with open(os.path.join(wb, 'specialist_words.csv'), newline='', encoding='utf-8') as f:
        for r in csv.DictReader(f):
            spec.add(r['Word'].strip().upper())
    bad = {w.strip().upper() for w in open(os.path.join(here, 'ldnoobw_en.txt'), encoding='utf-8') if re.fullmatch(r'[A-Za-z]+', w.strip())}
    return graded, valid, mild, flagged, spec, bad

def neighbours(W, H):
    nb = []
    for i in range(W * H):
        r, c = divmod(i, W)
        o = []
        if r > 0: o.append(i - W)
        if r < H - 1: o.append(i + W)
        if c > 0: o.append(i - 1)
        if c < W - 1: o.append(i + 1)
        nb.append(o)
    return nb

def word_paths(word, letters, nb, usable):
    out = []
    n = len(letters)
    def go(i, k, path, seen):
        if i in seen or not usable[i] or letters[i] != word[k]:
            return
        path.append(i); seen.add(i)
        if k == len(word) - 1:
            out.append(tuple(path))
        else:
            for j in nb[i]:
                go(j, k + 1, path, seen)
        path.pop(); seen.discard(i)
    for s in range(n):
        go(s, 0, [], set())
    return out

def findable_words(letters, nb, wordset, maxlen=10):
    prefixes = set()
    for w in wordset:
        for k in range(1, len(w) + 1):
            prefixes.add(w[:k])
    found = set()
    def go(i, s, seen):
        s2 = s + letters[i]
        if s2 not in prefixes:
            return
        if s2 in wordset:
            found.add(s2)
        if len(s2) >= maxlen:
            return
        seen.add(i)
        for j in nb[i]:
            if j not in seen:
                go(j, s2, seen)
        seen.discard(i)
    for i in range(len(letters)):
        go(i, '', set())
    return found

def closed_cells(curtains, nfound):
    s = set()
    for req, cells in curtains:
        if nfound < req:
            s.update(cells)
    return s

def exhaustive(letters, nb, words, counts, curtains, cap=2_000_000):
    T = len(words)
    full = (1 << T) - 1
    memo = {}
    stats = {'states': 0, 'dead': 0, 'dead_example': None}
    sys.setrecursionlimit(10000)
    def moves(cnt, mask):
        nf = bin(mask).count('1')
        closed = closed_cells(curtains, nf)
        usable = [cnt[i] > 0 and i not in closed for i in range(len(cnt))]
        res = []
        for w in range(T):
            if mask >> w & 1:
                continue
            seen = set()
            for p in word_paths(words[w], letters, nb, usable):
                key = frozenset(p)
                if key in seen:
                    continue
                seen.add(key)
                res.append((w, p))
        return res
    def solve(cnt, mask):
        if mask == full:
            return ()
        key = (cnt, mask)
        if key in memo:
            return memo[key]
        stats['states'] += 1
        if stats['states'] > cap:
            raise OverflowError
        best = None
        for w, p in moves(cnt, mask):
            c2 = list(cnt)
            for i in p:
                c2[i] -= 1
            r = solve(tuple(c2), mask | (1 << w))
            if r is not None and best is None:
                best = ((w, p),) + r
        if best is None:
            stats['dead'] += 1
            if stats['dead_example'] is None:
                stats['dead_example'] = [words[i] for i in range(T) if mask >> i & 1]
        memo[key] = best
        return best
    sol = solve(tuple(counts), 0)
    return sol, stats

def game_solve(letters, W, H, words, counts, curtains, budget=60000):
    """Port of game.js solve(): returns 'ok', None (no solution) or '?' (budget exceeded)."""
    nb = neighbours(W, H)
    cnt = list(counts)
    failed = set()
    b = [budget]
    class Budget(Exception): pass
    def paths_for(word, avail, limit=400):
        res = []
        def dfs(i, k, path, used):
            if len(res) >= limit: return
            if not avail[i] or i in used or letters[i] != word[k]: return
            used.add(i); path.append(i)
            if k == len(word) - 1: res.append(list(path))
            else:
                r, c = divmod(i, W)
                if r > 0: dfs(i - W, k + 1, path, used)
                if r < H - 1: dfs(i + W, k + 1, path, used)
                if c > 0: dfs(i - 1, k + 1, path, used)
                if c < W - 1: dfs(i + 1, k + 1, path, used)
            used.discard(i); path.pop()
        for i in range(len(letters)): dfs(i, 0, [], set())
        return res
    def rec(rem, nf):
        if not rem: return True
        key = ''.join(str(x) for x in cnt) + '|' + ','.join(map(str, rem))
        if key in failed: return False
        b[0] -= 1
        if b[0] < 0: raise Budget
        closed = closed_cells(curtains, nf)
        avail = [cnt[i] > 0 and i not in closed for i in range(len(cnt))]
        opts = [(w, paths_for(words[w], avail)) for w in rem]
        if not closed:
            if any(not ps for _, ps in opts):
                failed.add(key); return False
            opts.sort(key=lambda o: len(o[1])); opts = opts[:1]
        else:
            opts = sorted([o for o in opts if o[1]], key=lambda o: len(o[1]))
        for w, ps in opts:
            seen = set()
            for p in ps:
                sig = tuple(sorted(p))
                if sig in seen: continue
                seen.add(sig)
                for i in p: cnt[i] -= 1
                ok = rec([x for x in rem if x != w], nf + 1)
                for i in p: cnt[i] += 1
                if ok: return True
        failed.add(key); return False
    try:
        return 'ok' if rec(list(range(len(words))), 0) else None
    except Budget:
        return '?'

def check_level(lv, idx, L):
    graded, valid, mild, flagged, spec, bad = L
    errs, info = [], {}
    g = str(lv.get('g', ''))
    rows = g.split(',')
    if not rows or any(len(r) != len(rows[0]) or not re.fullmatch(r'[A-Z]+', r) for r in rows):
        return ['bad grid'], info
    H, W = len(rows), len(rows[0])
    if not (2 <= W <= 6 and 2 <= H <= 5): errs.append('size %dx%d' % (W, H))
    letters = ''.join(rows); N = W * H
    nb = neighbours(W, H)
    words = str(lv.get('t', '')).split()
    extras = str(lv.get('e', '')).split() if lv.get('e') else []
    n = str(lv.get('n', ''))
    if len(n) != N: return errs + ['n length %d != %d' % (len(n), N)], info
    counts = [int(ch, 36) for ch in n]
    if any(c < 1 for c in counts): errs.append('tile with count 0')
    curtains = [(int(p[0]), [int(x) for x in p[1]]) for p in lv.get('o', [])]
    if not words: errs.append('no required words')
    if len(set(words)) != len(words): errs.append('duplicate required word')
    nonnormal = 0
    for w in words:
        if not re.fullmatch(r'[A-Z]{3,}', w): errs.append('bad word ' + w); continue
        gi = graded.get(w)
        if gi is None: errs.append('required not in graded bank: ' + w); continue
        if gi['band'] not in ('easy', 'medium', 'hard'): errs.append('required band %s: %s' % (gi['band'], w))
        if gi['band'] == 'hard': nonnormal += 1
        if gi['spec'] or w in spec: errs.append('required specialist: ' + w)
        if w in mild: errs.append('required mild word: ' + w)
        if w in flagged: errs.append('required flagged word: ' + w)
        if w in bad: errs.append('required blocked word: ' + w)
    info['nonnormal'] = nonnormal
    if sum(counts) != sum(len(w) for w in words):
        errs.append('tile uses %d != letters in required words %d' % (sum(counts), sum(len(w) for w in words)))
    # exhaustive game simulation
    t0 = time.time()
    try:
        sol, st = exhaustive(letters, nb, words, counts, curtains)
    except OverflowError:
        return errs + ['state space too large to prove'], info
    info['states'] = st['states']; info['ms'] = round((time.time() - t0) * 1000)
    if sol is None:
        errs.append('UNSOLVABLE from start')
    else:
        # replay the solution step by step with fresh rule checks, incl. the last word
        cnt = list(counts); found = 0
        for w, p in sol:
            closed = closed_cells(curtains, found)
            ok = ''.join(letters[i] for i in p) == words[w] and len(set(p)) == len(p)
            ok = ok and all(cnt[i] > 0 and i not in closed for i in p)
            ok = ok and all(p[k + 1] in nb[p[k]] for k in range(len(p) - 1))
            if not ok: errs.append('replay failed at ' + words[w])
            for i in p: cnt[i] -= 1
            found += 1
        if found != len(words): errs.append('solution incomplete')
        info['last_word'] = words[sol[-1][0]] if sol else None
        info['left_over_uses'] = sum(cnt)
    if st['dead']:
        errs.append('%d reachable dead-end states (e.g. after %s)' % (st['dead'], st['dead_example']))
    gs = game_solve(letters, W, H, words, counts, curtains)
    if gs != 'ok': errs.append('game solve() result %r' % (gs,))
    # extras
    validall = valid | set(graded)
    validall = {w for w in validall if 3 <= len(w) <= 10 and (w not in bad or w in mild)}
    board = findable_words(letters, nb, validall)
    for w in extras:
        if w not in board: errs.append('extra not traceable: ' + w)
        if w in bad and w not in mild: errs.append('extra blocked: ' + w)
        if w in words: errs.append('extra also required: ' + w)
    missing = board - set(words) - set(extras)
    if missing: errs.append('valid board words missing from e: ' + ' '.join(sorted(missing)[:10]))
    return errs, info

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('levels')
    ap.add_argument('--wordbank', default='/workspace/wordbank')
    ap.add_argument('--report')
    a = ap.parse_args()
    here = os.path.dirname(os.path.abspath(__file__))
    L = load_lists(a.wordbank, here)
    data = json.load(open(a.levels, encoding='utf-8'))
    if isinstance(data, dict): data = [data]
    t0 = time.time()
    fails, out = 0, []
    allwords = []
    for i, lv in enumerate(data):
        errs, info = check_level(lv, i, L)
        ws = str(lv.get('t', '')).split()
        for j in range(max(0, i - 10), i):
            rep = set(ws) & set(str(data[j].get('t', '')).split())
            if rep: errs.append('required repeated within 10 levels (level #%d): %s' % (j + 1, ' '.join(sorted(rep))))
        allwords += ws
        if errs:
            fails += 1
            print('FAIL #%d id=%s: %s' % (i + 1, lv.get('id'), '; '.join(errs)))
        out.append({'index': i + 1, 'id': lv.get('id'), 'errors': errs, **info})
    short = sum(1 for w in allwords if len(w) <= 4)
    nonnormal = sum(o.get('nonnormal', 0) for o in out)
    summ = {'levels': len(data), 'failed': fails, 'required_words': len(allwords),
            'share_3_4_letters': round(short / max(1, len(allwords)), 4),
            'share_normal': round(1 - nonnormal / max(1, len(allwords)), 4),
            'total_states_explored': sum(o.get('states', 0) for o in out),
            'max_states_one_level': max([o.get('states', 0) for o in out] or [0]),
            'seconds': round(time.time() - t0, 1)}
    print(json.dumps(summ, ensure_ascii=False))
    if a.report:
        json.dump({'summary': summ, 'levels': out}, open(a.report, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    sys.exit(1 if fails else 0)

if __name__ == '__main__':
    main()
