/* Cumulative library unlocks, shared by the browser and Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./library'));
  else root.WPLibrarySchedule = factory(root.WPLibrary);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (library) {
  'use strict';
  const tiers = ['core', 'level1', 'level2', 'level3'], starts = [1, 101, 201, 501];
  function defaults(recipes) {
    const ids = new Set(recipes.map(r => r.id)), stagedIds = {}, unlockAt = {};
    for (const kind of ['target', 'extra']) {
      stagedIds[kind] = []; unlockAt[kind] = {};
      tiers.forEach((tier, index) => {
        const id = 'four-game-' + kind + '-' + tier;
        if (ids.has(id)) { stagedIds[kind].push(id); unlockAt[kind][id] = starts[index]; }
      });
    }
    return {stagedIds, unlockAt};
  }
  function compile(data, recipes, selection, rules = {}, range = {start: 1, count: 1}) {
    const start = range.start, end = start + range.count - 1, mode = selection.mode || 'fixed';
    if (!['fixed', 'staged'].includes(mode)) throw new Error('词库使用方式无效');
    if (!Number.isSafeInteger(start) || start < 1 || !Number.isSafeInteger(range.count) || range.count < 1 || !Number.isSafeInteger(end)) throw new Error('生成关号范围无效');
    const byId = new Map(recipes.map(r => [r.id, r])), groups = {}, boundaries = new Set([1]);
    for (const kind of ['target', 'extra']) {
      const ids = selection[kind + 'Ids'] || [];
      if (!Array.isArray(ids)) throw new Error('词库选择格式无效');
      groups[kind] = [...new Set(ids)].map(id => {
        const recipe = byId.get(id), from = mode === 'staged' ? selection.unlockAt?.[kind]?.[id] : 1;
        if (!recipe) throw new Error('所选词库已删除，请重新选择');
        if (!Number.isSafeInteger(from) || from < 1 || from > 99999) throw new Error(recipe.name + '：请填写 1–99999 的整数解锁关号');
        boundaries.add(from); return {recipe, from};
      });
    }
    const points = [...boundaries].sort((a, b) => a - b), stages = [];
    for (let i = 0; i < points.length; i++) {
      const unlockFrom = points[i], unlockTo = i + 1 < points.length ? points[i + 1] - 1 : null;
      if (unlockFrom > end || (unlockTo !== null && unlockTo < start)) continue;
      const active = Object.fromEntries(['target', 'extra'].map(kind => [kind, groups[kind].filter(x => x.from <= unlockFrom).map(x => x.recipe)]));
      const plan = library.combine(data, active, rules);
      stages.push({from: Math.max(start, unlockFrom), to: Math.min(end, unlockTo ?? end), unlockFrom, unlockTo,
        targetLibraryIds: active.target.map(r => r.id), extraLibraryIds: active.extra.map(r => r.id), plan});
    }
    return {mode, start, end, stages};
  }
  function stageFor(schedule, number) {
    const stage = schedule.stages.find(stage => number >= stage.from && number <= stage.to);
    if (!stage) throw new Error('关号不在本次生成范围内');
    return stage;
  }
  return {defaults, compile, stageFor};
});
