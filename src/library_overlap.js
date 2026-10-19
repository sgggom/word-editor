/* Exact source membership for vocabulary range charts. Geometry is a separate concern. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./library'));
  else root.WPLibraryOverlap = factory(root.WPLibrary);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Library) {
  'use strict';
  const sorted = values => [...values].sort();
  function buildModel(data, recipe, poolKey, compiled) {
    Library.validateRecipe(recipe, data);
    if (!['targetPool', 'extraPool'].includes(poolKey)) throw new Error('未知词池');
    const pool = recipe[poolKey], partition = Library.partitionPool(data, pool);
    const entries = partition.entries.map(({key, source, words}, index) => {
      const game = data.games.find(g => g.id === source.gameId);
      const config = game.configs.find(c => c.id === source.configId);
      return {id: key, source, index, letter: index < 26 ? String.fromCharCode(65 + index) : 'S' + (index + 1),
        label: game.name + (config ? ' · ' + config.label : ''),
        detail: (config ? config.label : '全部版本') + ' · ' + source.roles.map(r => Library.ROLE_LABELS[r]).join(' / '),
        color: game.color, words, count: words.size};
    });
    const {regions, union, fullMask, common} = partition;
    const selectedMasks = Library.selectedRegionMasks(pool, partition);
    const result = sorted([...selectedMasks].flatMap(mask => regions.get(mask) || []));
    const resultSet = new Set(result), effectiveRole = poolKey === 'targetPool' ? 'candidate' : 'extra';
    const effective = compiled.lex.filter(x => x.role === effectiveRole && resultSet.has(x.word)).map(x => x.word);
    return {poolKey, operation: pool.operation, entries, regions, union, common, result, effective, fullMask, selectedMasks,
      duplicateSources: pool.sources.length - entries.length};
  }
  function wordsFor(model, selection) {
    if (!model) return [];
    if (selection.kind === 'region') return model.regions.get(String(selection.key)) || [];
    if (selection.kind === 'source') return sorted(model.entries[Number(selection.key)]?.words || []);
    if (selection.kind === 'union') return model.union;
    if (selection.kind === 'common') return model.common;
    if (selection.kind === 'effective') return model.effective;
    return model.result;
  }
  function regionLabel(model, key, fullNames = false) {
    const mask = BigInt(key), included = [], excluded = [];
    for (const entry of model.entries) ((mask & (1n << BigInt(entry.index))) ? included : excluded).push(fullNames ? entry.label : entry.letter);
    if (!included.length) return '无来源';
    return included.join(' ∩ ') + (excluded.length ? '（不含 ' + excluded.join('、') + '）' : '（全部共有）');
  }
  function regionRows(model) {
    const rows = [...model.regions].map(([key, words]) => ({key, count: words.length}));
    if (model.entries.length && !model.regions.has(model.fullMask)) rows.push({key: model.fullMask, count: 0});
    for (const key of model.selectedMasks) if (key !== model.fullMask && !model.regions.has(key)) rows.push({key, count: 0});
    return rows.sort((a, b) => a.key === b.key ? 0 : a.key === model.fullMask ? -1 : b.key === model.fullMask ? 1 : b.count - a.count || (BigInt(a.key) < BigInt(b.key) ? -1 : 1));
  }
  return {buildModel, wordsFor, regionLabel, regionRows};
});
