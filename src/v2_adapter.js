/* Keep the editor/game format stable while the generator uses the v2 model. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WTV2Adapter = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  function toGame(level) {
    return {
      id: 'g' + level.number,
      name: '生成 ' + level.number,
      g: Array.from({length: level.height}, (_, i) => level.grid.slice(i * level.width, (i + 1) * level.width).join('')).join(','),
      t: level.targets.join(' '),
      e: level.extras.join(' '),
      n: level.counts.map(c => c.toString(36)).join(''),
      // v2 has no measured rarity. Preserve the field without inventing grades.
      lv: '', ty: '', curtains: []
    };
  }
  return {toGame};
});
