/* Read-only word-path statistics. Stored board rows start at the bottom. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WPPathStats = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  function measure(letters, width, height, word) {
    const count = width * height;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
        !letters || letters.length !== count || typeof word !== 'string' || word.length < 2 || word.length > count) {
      return {minTurns:null, forward:false};
    }
    // In the visible board the start must be left, above, or above-left of the end.
    const isForward = (start, end) => start !== end && start % width <= end % width &&
      Math.floor(start / width) >= Math.floor(end / width);
    const ends = [];
    for (let i = 0; i < count; i++) if (letters[i] === word.at(-1)) ends.push(i);
    if (!ends.length) return {minTurns:null, forward:false};
    const used = new Uint8Array(count);
    let best = Infinity, forward = false;
    function walk(cell, at, turns, previous, start, couldBeForward) {
      if (used[cell] || letters[cell] !== word[at]) return;
      // Still explore equal/higher-turn paths if they can establish forward readability.
      if (turns >= best && (forward || !couldBeForward)) return;
      if (at === word.length - 1) {
        best = Math.min(best, turns);
        forward ||= isForward(start, cell);
        return;
      }
      used[cell] = 1;
      const row = Math.floor(cell / width), col = cell % width;
      const step = (next, direction) => walk(next, at + 1,
        turns + (previous !== null && previous !== direction ? 1 : 0), direction, start, couldBeForward);
      if (col > 0) step(cell - 1, -1);
      if (col + 1 < width) step(cell + 1, 1);
      if (row > 0) step(cell - width, -width);
      if (row + 1 < height) step(cell + width, width);
      used[cell] = 0;
    }
    for (let start = 0; start < count && !(best === 0 && forward); start++) {
      if (letters[start] === word[0]) walk(start, 0, 0, null, start, ends.some(end => isForward(start, end)));
    }
    return {minTurns:best === Infinity ? null : best, forward};
  }
  function analyze(letters, width, height, words) {
    const groups = {straight:[], oneTurn:[], multiTurn:[], forward:[], unreachable:[]};
    for (const word of new Set(words || [])) {
      const stat = measure(letters, width, height, word);
      if (stat.minTurns === null) { groups.unreachable.push(word); continue; }
      groups[stat.minTurns === 0 ? 'straight' : stat.minTurns === 1 ? 'oneTurn' : 'multiTurn'].push(word);
      if (stat.forward) groups.forward.push(word);
    }
    return groups;
  }
  return {measure, analyze};
});
