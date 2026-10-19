/* Shared, deterministic vocabulary set compiler. Browser and Node use the same code. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WPLibrary = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const ROLES = ['target', 'extra', 'onlyExtra', 'bonus'];
  const ROLE_LABELS = {target: '目标词', extra: '额外词', onlyExtra: 'onlyExtra', bonus: 'bonus'};
  const normalize = word => String(word).normalize('NFC').trim().replace(/\s+/g, ' ').toUpperCase();
  const sorted = values => [...new Set(values)].sort();
  const sourceKey = source => JSON.stringify([source.gameId, source.configId, sorted(source.roles)]);
  function uniquePoolSources(pool) {
    const seen = new Set(), sources = [];
    for (const source of pool.sources) {
      const key = sourceKey(source);
      if (seen.has(key)) continue;
      seen.add(key);
      sources.push({key, source: {gameId: source.gameId, configId: source.configId, roles: sorted(source.roles)}});
    }
    return sources;
  }
  function defaultRecipe(data) {
    const games = ['07_Word_Tiles', '06_Zen_Word', '05_Words_of_Wonders', '04_Wordscapes'];
    const sources = roles => games.map(gameId => ({gameId, configId: '*', roles: roles.slice()}));
    return {id: 'four-game-main', name: '四款游戏词库', revision: 1, datasetHash: data.datasetHash,
      targetPool: {operation: 'union', sources: sources(['target'])},
      extraPool: {operation: 'union', sources: sources(['extra', 'onlyExtra', 'bonus'])}};
  }
  function validateRecipe(recipe, data) {
    if (!recipe || !String(recipe.id || '').trim() || !String(recipe.name || '').trim()) throw new Error('请填写词库名称');
    if (recipe.datasetHash !== data.datasetHash) throw new Error('词库配置的数据版本与当前项目不一致');
    if (!Number.isInteger(recipe.revision) || recipe.revision < 1) throw new Error('词库版本无效');
    for (const key of ['targetPool', 'extraPool']) {
      const pool = recipe[key];
      if (!pool || !['union', 'intersection', 'regions'].includes(pool.operation) || !Array.isArray(pool.sources)) throw new Error('词池运算格式无效');
      for (const source of pool.sources) {
        const game = data.games.find(g => g.id === source.gameId);
        if (!game || (source.configId !== '*' && !game.configs.some(c => c.id === source.configId))) throw new Error('来源游戏或版本不存在');
        if (!Array.isArray(source.roles) || !source.roles.length || source.roles.some(r => !ROLES.includes(r))) throw new Error('每个来源至少选择一种词类');
      }
      if (pool.operation === 'regions') {
        const keys = uniquePoolSources(pool).map(s => s.key), fullMask = (1n << BigInt(keys.length)) - 1n;
        if (!Array.isArray(pool.regionSources) || JSON.stringify(pool.regionSources) !== JSON.stringify(keys)) throw new Error('区域选择与词池来源不一致，请重新选择区域');
        if (!Array.isArray(pool.selectedRegions) || new Set(pool.selectedRegions).size !== pool.selectedRegions.length || pool.selectedRegions.some(mask => typeof mask !== 'string' || !/^[1-9]\d*$/.test(mask) || BigInt(mask) > fullMask)) throw new Error('词池的区域选择无效');
      }
    }
    return recipe;
  }
  const sourceCache = new WeakMap();
  const partitionCache = new WeakMap();
  function sourceWords(data, source) {
    let cache = sourceCache.get(data);
    if (!cache) sourceCache.set(data, cache = new Map());
    const roles = sorted(source.roles), key = JSON.stringify([source.gameId, source.configId, roles]);
    if (!cache.has(key)) {
      const game = data.games.find(g => g.id === source.gameId);
      const configs = source.configId === '*' ? game.configs : game.configs.filter(c => c.id === source.configId);
      cache.set(key, new Set(configs.flatMap(c => roles.flatMap(r => c.words[r]).map(normalize))));
    }
    return cache.get(key);
  }
  function partitionPool(data, pool) {
    const sources = uniquePoolSources(pool), cacheKey = JSON.stringify(sources.map(s => s.key));
    let cache = partitionCache.get(data);
    if (!cache) partitionCache.set(data, cache = new Map());
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const membership = new Map();
    const entries = sources.map(({key, source}, index) => {
      const words = sourceWords(data, source), bit = 1n << BigInt(index);
      for (const word of words) membership.set(word, (membership.get(word) || 0n) | bit);
      return {key, source, words};
    });
    const regions = new Map(), union = sorted(membership.keys());
    for (const word of union) {
      const mask = membership.get(word).toString();
      if (!regions.has(mask)) regions.set(mask, []);
      regions.get(mask).push(word);
    }
    const fullMask = entries.length ? ((1n << BigInt(entries.length)) - 1n).toString() : '0';
    const result = {entries, regions, union, fullMask, common: regions.get(fullMask) || []};
    cache.set(cacheKey, result);
    while (cache.size > 16) cache.delete(cache.keys().next().value);
    return result;
  }
  function selectedRegionMasks(pool, partition) {
    if (pool.operation === 'regions') return new Set(pool.selectedRegions);
    if (pool.operation === 'intersection') return new Set(partition.fullMask === '0' ? [] : [partition.fullMask]);
    return new Set(partition.regions.keys());
  }
  function withRegionSelection(pool, masks) {
    return {...pool, operation: 'regions', regionSources: uniquePoolSources(pool).map(s => s.key),
      selectedRegions: [...new Set([...masks].map(String))].sort((a, b) => BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)};
  }
  function evaluatePool(data, pool) {
    if (!pool.sources.length) return new Set();
    if (pool.operation === 'regions') {
      const partition = partitionPool(data, pool);
      return new Set(pool.selectedRegions.flatMap(mask => partition.regions.get(mask) || []));
    }
    const sources = pool.sources.map(s => sourceWords(data, s));
    if (pool.operation === 'union') return new Set(sources.flatMap(s => [...s]));
    sources.sort((a, b) => a.size - b.size);
    return new Set([...sources[0]].filter(w => sources.every(s => s.has(w))));
  }
  function compile(data, recipe, rules = {}) {
    validateRecipe(recipe, data);
    const target = evaluatePool(data, recipe.targetPool), extra = evaluatePool(data, recipe.extraPool);
    const abbreviations = new Set((rules.abbr || []).map(normalize));
    const words = sorted([...target, ...extra]), lex = [], excluded = [], downgraded = [];
    for (const word of words) {
      if (target.has(word) && /^[A-Z]{3,8}$/.test(word)) {
        const role = abbreviations.has(word) ? 'extra' : 'candidate';
        lex.push({word, role});
        if (role === 'extra') downgraded.push(word);
      } else if (extra.has(word) && /^[A-Z]{2,8}$/.test(word)) lex.push({word, role: 'extra'});
      else excluded.push(word);
    }
    return {lex, words, targetWords: sorted(target), extraWords: sorted(extra), excluded, downgraded,
      stats: {target: target.size, extra: extra.size, overlap: [...target].filter(w => extra.has(w)).length,
        total: words.length, candidates: lex.filter(x => x.role === 'candidate').length,
        extras: lex.filter(x => x.role === 'extra').length, excluded: excluded.length, downgraded: downgraded.length}};
  }
  // A stable content identifier; collisions are checked by the snapshot registry before insertion.
  function contentId(value) {
    let a = 2166136261, b = 5381;
    for (const c of JSON.stringify(value)) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b, 33) ^ c.charCodeAt(0); }
    return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
  }
  function snapshot(data, recipe, rules = {}) {
    const compiled = compile(data, recipe, rules);
    const body = {schemaVersion: 1, recipe: JSON.parse(JSON.stringify(recipe)),
      rules: {abbr: sorted((rules.abbr || []).map(normalize))}, lex: compiled.lex};
    return {id: 'lib-' + contentId(body), ...body};
  }
  function validateSnapshot(value) {
    if (!value || value.schemaVersion !== 1 || !value.recipe || !Array.isArray(value.lex) || !value.rules || !Array.isArray(value.rules.abbr)) throw new Error('词库快照缺失或格式无效');
    if (typeof value.recipe.id !== 'string' || !value.recipe.id || typeof value.recipe.name !== 'string' || !value.recipe.name.trim() || !Number.isInteger(value.recipe.revision) || value.recipe.revision < 1 || typeof value.recipe.datasetHash !== 'string' || !value.recipe.datasetHash) throw new Error('词库快照版本信息无效');
    if (value.rules.abbr.some(w => typeof w !== 'string')) throw new Error('词库快照禁表无效');
    const seen = new Set();
    for (const entry of value.lex) {
      if (!entry || !['candidate', 'extra'].includes(entry.role) || !new RegExp(entry.role === 'candidate' ? '^[A-Z]{3,8}$' : '^[A-Z]{2,8}$').test(entry.word) || seen.has(entry.word)) throw new Error('词库快照词条无效');
      seen.add(entry.word);
    }
    const body = {schemaVersion: 1, recipe: value.recipe, rules: value.rules, lex: value.lex};
    if (value.id !== 'lib-' + contentId(body)) throw new Error('词库快照校验失败');
    return value;
  }
  function catalogIndex(data) {
    const index = new Map();
    for (const game of data.games) for (const config of game.configs) for (const role of ROLES) for (const value of config.words[role]) {
      const word = normalize(value);
      if (!index.has(word)) index.set(word, []);
      index.get(word).push({gameId: game.id, configId: config.id, role});
    }
    return index;
  }
  return {ROLES, ROLE_LABELS, normalize, defaultRecipe, validateRecipe, sourceKey, uniquePoolSources, sourceWords, partitionPool, selectedRegionMasks, withRegionSelection, evaluatePool, compile, snapshot, validateSnapshot, catalogIndex, contentId};
});
