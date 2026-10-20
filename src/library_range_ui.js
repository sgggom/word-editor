  /* ---------- 词库范围视图（由同步脚本内嵌） ---------- */
  const libraryRangeState = {pool: 'targetPool', selection: {kind: 'result'}, focusedMask: '0', model: null, compiled: null, modelPool: '', rowsPage: 0, markupKey: '', chart: null};
  const poolOperationLabel = operation => ({union:'并集', intersection:'交集', regions:'区域多选'}[operation] || '');
  function rangeWords() {
    return WPLibraryOverlap.wordsFor(libraryRangeState.model, libraryRangeState.selection);
  }
  function resetRangeFilters() {
    Object.assign(bankState, {q: '', mode: 'exact', role: '', game: '', config: '', sourceRole: '', scope: 'result', picked: '', page: 0});
    for (const id of ['bankFind', 'bankQ', 'bankRole', 'bankGame', 'bankConfig', 'bankSourceRole']) $('#' + id).value = '';
    $('#bankMode').value = 'exact'; $('#bankScope').value = 'result'; updateSourceConfigFilter();
  }
  function rangeSelectionLabel() {
    const model = libraryRangeState.model;
    if (!model) return '饼图配置';
    const title = libraryRangeState.pool === 'targetPool' ? '必答候选池' : '额外词池';
    return title + ' · ' + poolOperationLabel(model.operation) + ' · 已选 ' + model.selectedMasks.size + ' 个区域' + (libraryRangeState.selection.kind === 'effective' ? ' · 生效词' : '');
  }
  function syncLibraryView() {
    const range = bankState.view === 'range';
    $('#bank .bk').dataset.view = range ? 'range' : 'list';
    $('#libraryRange').hidden = !range; $('#bankScope').disabled = range;
    for (const button of document.querySelectorAll('[data-library-view]')) {
      const on = button.dataset.libraryView === bankState.view;
      button.classList.toggle('on', on); button.setAttribute('aria-pressed', String(on));
    }
  }
  function showLibraryView(view) {
    bankState.view = view;
    libraryRangeState.selection = {kind: 'result'}; libraryRangeState.rowsPage = 0; libraryRangeState.markupKey = '';
    resetRangeFilters(); renderBank();
  }
  function configurePoolOperation(key, operation) {
    const pool = bankDraft[key];
    if (operation === 'regions') {
      if (pool.operation !== 'regions') bankDraft[key] = WPLibrary.withRegionSelection(pool, WPLibrary.selectedRegionMasks(pool, WPLibrary.partitionPool(libraryData, pool)));
    } else {
      bankDraft[key] = {...pool, operation};
      delete bankDraft[key].selectedRegions; delete bankDraft[key].regionSources;
    }
  }
  function refreshRegionBinding(key) {
    const pool = bankDraft[key];
    if (pool.operation !== 'regions') return;
    const keys = WPLibrary.uniquePoolSources(pool).map(s => s.key);
    if (JSON.stringify(keys) === JSON.stringify(pool.regionSources)) return;
    bankDraft[key] = WPLibrary.withRegionSelection(pool, []);
    toast('来源已改变，请在饼图中重新选择本词池的区域');
  }
  function updatePieConfiguration() {
    libraryRangeState.selection = {kind: 'result'};
    resetRangeFilters(); renderLibraryEditor(); updateLibraryPreview();
  }
  function toggleLibraryRegion(key) {
    const state = libraryRangeState, model = state.model;
    if (!model || !/^[1-9]\d*$/.test(String(key)) || BigInt(key) > BigInt(model.fullMask)) return;
    const masks = new Set(model.selectedMasks), value = String(key);
    const focused = document.activeElement?.closest('[data-range-mask], [data-mask]');
    const focusSelector = focused ? (focused.hasAttribute('data-range-mask') ? '[data-range-mask="' + value + '"]' : '#libraryRangeChart [data-mask="' + value + '"]') : '';
    if (masks.has(value)) masks.delete(value); else masks.add(value);
    bankDraft[state.pool] = WPLibrary.withRegionSelection(bankDraft[state.pool], masks);
    state.focusedMask = value;
    updatePieConfiguration();
    if (focusSelector) document.querySelector(focusSelector)?.focus({preventScroll: true});
  }
  function renderLibraryRange() {
    syncLibraryView();
    if (bankState.view !== 'range') return;
    const state = libraryRangeState;
    if (state.compiled !== bankCompiled || state.modelPool !== state.pool) {
      if (state.modelPool !== state.pool) state.focusedMask = '0';
      state.compiled = bankCompiled; state.modelPool = state.pool;
      state.model = bankCompiled ? WPLibraryOverlap.buildModel(libraryData, bankDraft, state.pool, bankCompiled) : null;
      state.selection = {kind: 'result'}; state.markupKey = '';
    }
    const model = state.model;
    $('#libraryRangePool').value = state.pool; $('#libraryRangeOperation').value = bankDraft[state.pool].operation;
    const title = state.pool === 'targetPool' ? '必答候选池' : '额外词池';
    const key = JSON.stringify([state.pool, state.selection, state.rowsPage, state.focusedMask, bankDraft.name, bankDraft.revision]);
    if (state.markupKey === key) return;
    state.markupKey = key;
    const fmt = value => value.toLocaleString('zh-CN');
    if (!model) {
      $('#libraryRangeMetrics').innerHTML = '';
      $('#libraryRangeChart').innerHTML = '<p class="note range-empty">请先修正词池配置，再选择区域。</p>';
      $('#libraryRangeSources').innerHTML = ''; $('#libraryRangeRegions').innerHTML = '';
      $('#libraryRangeCaption').textContent = ''; $('#libraryRangeSelection').textContent = '';
      state.chart = null; return;
    }
    const selected = model.selectedMasks, viewingEffective = state.selection.kind === 'effective';
    const metrics = [
      ['result', '已选 ' + selected.size + ' 个区域', model.result.length, !viewingEffective],
      ['union', '全选 · 并集', model.union.length, model.operation === 'union'],
      ['common', '仅共同区域 · 交集', model.common.length, model.operation === 'intersection'],
      ['effective', '查看生效' + (state.pool === 'targetPool' ? '必答' : '额外'), model.effective.length, viewingEffective]
    ];
    $('#libraryRangeMetrics').innerHTML = metrics.map(([kind, label, count, on]) => '<button type="button" data-range-kind="' + kind + '" class="range-stat' + (on ? ' on' : '') + '" aria-pressed="' + on + '"><span>' + label + '</span><b>' + fmt(count) + '</b></button>').join('');
    $('#libraryRangeSources').innerHTML = model.entries.map(e => '<div class="range-source" title="' + esc(e.label + ' · ' + e.detail) + '"><i style="background:' + esc(e.color) + '">' + e.letter + '</i><span><b>' + esc(e.label) + '</b><small>' + esc(e.detail) + '</small></span><strong>' + fmt(e.count) + '</strong></div>').join('');
    let caption = '点击区域选中，再次点击取消，可多选；保存后按选中区域生成。';
    if (bankDraft[state.pool].excludeTargets) caption += ' 已剔除所选游戏全部版本的必答候选（A–Z，3–8 字母）。';
    if (bankDraft[state.pool].excludeTwoLetter) caption += ' 已排除两字母词。';
    if (!model.entries.length) {
      state.chart = null; $('#libraryRangeChart').innerHTML = '<p class="note range-empty">这个词池还没有来源。点击“编辑来源”添加游戏。</p>';
    } else if (model.entries.length > 7) {
      state.chart = null; $('#libraryRangeChart').innerHTML = '<p class="note range-empty">当前有 ' + model.entries.length + ' 个来源，请在下方列表中多选精确区域。</p>';
    } else {
      const partition = {regions: new Map([...model.regions].map(([mask, words]) => [Number(mask), words]))};
      const focus = Number(state.focusedMask) || (selected.has(model.fullMask) ? Number(model.fullMask) : Number([...selected][0] || 0));
      state.chart = ProportionalVenn.buildProportionalVenn(model.entries, partition, focus, title, {maxInteriorLabels: 12, selectedMasks: [...selected].map(Number)});
      $('#libraryRangeChart').innerHTML = state.chart.markup;
      caption += ' ' + state.chart.note;
      const svg = $('#libraryRangeChart svg');
      svg.setAttribute('aria-label', bankDraft.name + ' · ' + title + ' · 多选区域配置');
      const circles = state.chart.geometry.filter(c => c.r > 0);
      if (circles.length) {
        const top = Math.min(...circles.map(c => c.y - c.r)) - 12;
        const bottom = Math.max(...circles.map(c => c.y + c.r)) + 12;
        svg.setAttribute('viewBox', '0 ' + top + ' 760 ' + (bottom - top));
        svg.querySelectorAll('[data-placement="external"]').forEach(node => node.remove());
      }
    }
    if (model.duplicateSources) caption += ' 相同来源已合并。';
    $('#libraryRangeCaption').textContent = caption;
    let selectedNote = '已选 ' + selected.size + ' 个区域，共 ' + fmt(model.result.length) + ' 词；本池生效 ' + fmt(model.effective.length) + ' 词。';
    if (!selected.size) selectedNote = '尚未选择区域。点击图中的区域或下方区域项，将词条加入本词池。';
    const undrawn = state.chart ? [...selected].filter(mask => (model.regions.get(mask)?.length || 0) && !state.chart.diagnostics.regions.find(r => String(r.mask) === mask)?.hasArea).length : 0;
    if (undrawn) selectedNote += ' ' + undrawn + ' 个已选组合未形成独立圆形区域，已计入词表，可在下方取消。';
    $('#libraryRangeSelection').textContent = selectedNote;
    const rows = WPLibraryOverlap.regionRows(model), pageSize = 18;
    const pages = Math.max(1, Math.ceil(rows.length / pageSize)); state.rowsPage = Math.max(0, Math.min(pages - 1, state.rowsPage));
    const visible = rows.slice(state.rowsPage * pageSize, (state.rowsPage + 1) * pageSize);
    $('#libraryRangeRegions').innerHTML = rows.length ? '<div class="range-region-heading"><b>选择精确区域 · 可多选</b><span>各区域互不重复；选中的区域合并为本词池</span></div><div class="range-region-grid">' + visible.map(row => {
      const label = row.key === model.fullMask ? '全部共有' : WPLibraryOverlap.regionLabel(model, row.key), on = selected.has(row.key);
      return '<button type="button" data-range-mask="' + row.key + '" class="range-region' + (on ? ' on' : '') + '" aria-pressed="' + on + '" title="' + esc(WPLibraryOverlap.regionLabel(model, row.key, true)) + '"><i class="range-check" aria-hidden="true">' + (on ? '✓' : '') + '</i><span>' + esc(label) + '</span><b>' + fmt(row.count) + '</b></button>';
    }).join('') + '</div>' + (pages > 1 ? '<div class="range-pages"><button type="button" data-range-page="-1"' + (!state.rowsPage ? ' disabled' : '') + '>上一页组合</button><span>' + (state.rowsPage + 1) + ' / ' + pages + '</span><button type="button" data-range-page="1"' + (state.rowsPage + 1 >= pages ? ' disabled' : '') + '>下一页组合</button></div>' : '') : '';
  }
  document.querySelectorAll('[data-library-view]').forEach(button => button.onclick = () => showLibraryView(button.dataset.libraryView));
  $('#libraryRangePool').onchange = e => {
    libraryRangeState.pool = e.target.value; libraryRangeState.rowsPage = 0; resetRangeFilters(); renderBank();
  };
  $('#libraryRangeOperation').onchange = e => {
    configurePoolOperation(libraryRangeState.pool, e.target.value); updatePieConfiguration();
  };
  $('#libraryRangeClear').onclick = () => {
    const key = libraryRangeState.pool; bankDraft[key] = WPLibrary.withRegionSelection(bankDraft[key], []); updatePieConfiguration();
  };
  $('#libraryRangeEdit').onclick = () => {
    const key = libraryRangeState.pool; showLibraryView('list');
    const input = document.querySelector('[data-operation="' + key + '"]'); input.scrollIntoView({block: 'start'}); input.focus();
  };
  $('#libraryRange').addEventListener('click', e => {
    const metric = e.target.closest('[data-range-kind]');
    if (metric) {
      const kind = metric.dataset.rangeKind;
      if (kind === 'union' || kind === 'common') { configurePoolOperation(libraryRangeState.pool, kind === 'union' ? 'union' : 'intersection'); updatePieConfiguration(); }
      else { libraryRangeState.selection = {kind}; resetRangeFilters(); renderBank(); }
      return;
    }
    const region = e.target.closest('[data-range-mask], [data-mask]'); if (region) { toggleLibraryRegion(region.dataset.rangeMask || region.dataset.mask); return; }
    const paging = e.target.closest('[data-range-page]'); if (paging) { libraryRangeState.rowsPage += Number(paging.dataset.rangePage); renderLibraryRange(); return; }
    const svg = e.target.closest('#libraryRangeChart svg');
    if (svg && libraryRangeState.chart) {
      const transform = svg.getScreenCTM(); if (!transform) return;
      const point = svg.createSVGPoint(); point.x = e.clientX; point.y = e.clientY;
      const local = point.matrixTransform(transform.inverse());
      const mask = ProportionalVenn.maskAt(local.x, local.y, libraryRangeState.chart.geometry);
      if (mask) toggleLibraryRegion(String(mask));
    }
  });
  $('#libraryRangeChart').addEventListener('keydown', e => {
    const region = e.target.closest('[data-mask]');
    if (region && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleLibraryRegion(region.dataset.mask); }
  });
  /* ---------- 词库范围视图结束 ---------- */
