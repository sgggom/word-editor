  /* ---------- 词库配置与浏览（由同步脚本内嵌） ---------- */
  const vocabularyIndex = WPLibrary.catalogIndex(libraryData);
  const vocabularyWords = [...vocabularyIndex.keys()].sort();
  const libraryDrafts = new Map();
  let bankDraft = null, bankCompiled = null, bankEffective = new Map();
  let bankTargetSet = new Set(), bankExtraSet = new Set(), bankExcludedSet = new Set();
  const bankState = {view: 'list', q: '', mode: 'exact', sort: 'alpha', scope: 'result', role: '', game: '', config: '', sourceRole: '', page: 0, pageSize: 60, picked: ''};
  let bankMatches = [], bankTimer = 0, bankCardRequest = 0;
  const provenanceLoads = new Map();
  const cloneLibrary = x => JSON.parse(JSON.stringify(x));
  function shortZh(s) { return String(s || '').split(/[；;。]/)[0].slice(0, 42); }
  function libraryDirty() {
    return bankDraft && JSON.stringify(bankDraft) !== JSON.stringify(libraryRecipes.find(r => r.id === bankDraft.id));
  }
  function rememberBankDraft() { if (bankDraft) libraryDrafts.set(bankDraft.id, cloneLibrary(bankDraft)); }
  function chooseBankRecipe(id) {
    rememberBankDraft();
    bankDraft = cloneLibrary(libraryDrafts.get(id) || selectedRecipe(id));
    if (!bankDraft.targetPool.sources.length && bankDraft.extraPool.sources.length) libraryRangeState.pool = 'extraPool';
    else if (bankDraft.targetPool.sources.length && !bankDraft.extraPool.sources.length) libraryRangeState.pool = 'targetPool';
    bankState.page = 0; bankState.picked = '';
    renderLibraryEditor(); updateLibraryPreview();
  }
  function recipeOptionHtml() {
    const rows = new Map(libraryRecipes.map(r => [r.id, r]));
    for (const [id, draft] of libraryDrafts) if (!rows.has(id)) rows.set(id, draft);
    if (bankDraft) rows.set(bankDraft.id, bankDraft);
    return [...rows.values()].map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + (r.id === defaultLibraryId ? ' · 默认' : '') + '</option>').join('');
  }
  function sourceEditor(poolKey, source, i) {
    const game = libraryData.games.find(g => g.id === source.gameId);
    return '<div class="lib-source" data-pool="' + poolKey + '" data-index="' + i + '">' +
      '<div class="lib-source-head"><select data-field="game" aria-label="来源游戏">' + libraryData.games.map(g => '<option value="' + esc(g.id) + '"' + (g.id === game.id ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') +
      '</select><button type="button" data-remove-source aria-label="移除此来源">×</button></div>' +
      '<select data-field="config" aria-label="来源版本"><option value="*">全部版本（合并）</option>' + game.configs.map(c => '<option value="' + esc(c.id) + '"' + (source.configId === c.id ? ' selected' : '') + '>' + esc(c.label) + '</option>').join('') + '</select>' +
      '<div class="lib-roles">' + WPLibrary.ROLES.map(r => '<label><input type="checkbox" data-field="role" value="' + r + '"' + (source.roles.includes(r) ? ' checked' : '') + '>' + WPLibrary.ROLE_LABELS[r] + '</label>').join('') + '</div></div>';
  }
  function poolEditor(key, name) {
    const pool = bankDraft[key];
    const selectionNote = pool.operation === 'regions' ? '<div class="lib-region-summary">区域多选 · 已选 <b>' + pool.selectedRegions.length + '</b> 个区域<button type="button" data-edit-pool-chart="' + key + '">在饼图中编辑</button><small>调整来源、版本或词类后，需要重新选择区域。</small></div>' : '';
    const exclusion = key === 'extraPool' || pool.excludeTargets ? '<label class="lib-exclude-targets"><input type="checkbox" data-exclude-targets="' + key + '"' + (pool.excludeTargets ? ' checked' : '') + '>剔除所选游戏全部版本的必答候选（3–8 字母）</label>' : '';
    return '<section class="lib-pool"><div class="lib-pool-heading"><h4>' + name + '</h4><select data-operation="' + key + '" aria-label="' + name + '运算"><option value="union"' + (pool.operation === 'union' ? ' selected' : '') + '>并集 · 任一来源</option><option value="intersection"' + (pool.operation === 'intersection' ? ' selected' : '') + '>交集 · 每个来源</option><option value="regions"' + (pool.operation === 'regions' ? ' selected' : '') + '>区域多选</option></select></div>' + selectionNote +
      exclusion + pool.sources.map((s, i) => sourceEditor(key, s, i)).join('') + '<button type="button" class="ghost" data-add-source="' + key + '">＋ 添加来源</button></section>';
  }
  function renderLibraryEditor() {
    $('#librarySelect').innerHTML = recipeOptionHtml(); $('#librarySelect').value = bankDraft.id;
    $('#bankFilters').innerHTML = poolEditor('targetPool', '必答候选池') + poolEditor('extraPool', '额外词池') +
      '<p class="note">每个来源先合并所选词类；全部版本先取并集，再参与词池运算。两个词池独立配置。</p>';
    $('#librarySetDefault').disabled = !libraryRecipes.some(r => r.id === bankDraft.id);
    $('#libraryApplyLevel').disabled = !ours() || !libraryRecipes.some(r => r.id === bankDraft.id) || !!batchRun;
    updateSourceConfigFilter();
  }
  function updateLibraryPreview() {
    try {
      bankCompiled = WPLibrary.compile(libraryData, bankDraft, {abbr: [...abbrSet]});
      bankEffective = new Map(bankCompiled.lex.map(x => [x.word, x.role]));
      bankTargetSet = new Set(bankCompiled.targetWords); bankExtraSet = new Set(bankCompiled.extraWords); bankExcludedSet = new Set(bankCompiled.excluded);
      const s = bankCompiled.stats;
      $('#libraryStats').innerHTML = '<div><b>' + s.candidates.toLocaleString() + '</b><span>生效必答候选</span></div><div><b>' + s.extras.toLocaleString() + '</b><span>生效仅额外</span></div><div><b>' + s.total.toLocaleString() + '</b><span>集合去重结果</span></div>' +
        '<p class="note">必答池 ' + s.target + ' · 额外池 ' + s.extra + ' · 重叠 ' + s.overlap + ' · 不适用 ' + s.excluded + ' · 禁表降为额外 ' + s.downgraded + '</p>';
      $('#libraryStatus').textContent = (libraryDirty() ? '配置未保存' : '已保存 · v' + bankDraft.revision) + (s.candidates ? '' : ' · 无生效必答候选，不能生成');
      $('#librarySave').disabled = false;
    } catch (e) {
      bankCompiled = null; bankEffective = new Map(); bankTargetSet = new Set(); bankExtraSet = new Set(); bankExcludedSet = new Set();
      $('#libraryStats').textContent = e.message; $('#libraryStatus').textContent = '配置需要调整'; $('#librarySave').disabled = true;
    }
    rememberBankDraft(); renderBank();
  }
  function updateSourceConfigFilter() {
    const game = libraryData.games.find(g => g.id === bankState.game);
    $('#bankGame').innerHTML = '<option value="">所有游戏</option>' + libraryData.games.map(g => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join('');
    $('#bankGame').value = bankState.game;
    $('#bankConfig').innerHTML = '<option value="">所有版本</option>' + (game ? game.configs.map(c => '<option value="' + esc(c.id) + '">' + esc(c.label) + '</option>').join('') : '');
    $('#bankConfig').value = bankState.config; $('#bankConfig').disabled = !game;
  }
  function bankWordRole(word) {
    if (bankState.scope === 'level') return levelLibrary().entries.get(word)?.role || '';
    return bankEffective.get(word) || '';
  }
  function bankWild(q) { return new RegExp('^' + q.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\?/g, '.').replace(/\*/g, '.*') + '$', 'u'); }
  function computeBank() {
    const mode = /[?*]/.test(bankState.q) ? 'wild' : bankState.mode;
    const pattern = mode === 'wild' ? bankWild(bankState.q) : null;
    const base = bankState.view === 'range' ? rangeWords() : bankState.scope === 'catalog' ? vocabularyWords : bankState.scope === 'level' ? [...levelLibrary().valid].sort() : (bankCompiled?.words || []);
    const q = bankState.q;
    bankMatches = base.filter(w => {
      if (q && !(mode === 'wild' ? pattern.test(w) : mode === 'exact' ? w === q : mode === 'prefix' ? w.startsWith(q) : w.includes(q))) return false;
      const role = bankState.role;
      if (role === 'candidate' || role === 'extra') { if (bankWordRole(w) !== role) return false; }
      else if (role === 'excluded' && !bankExcludedSet.has(w)) return false;
      else if (role === 'targetPool' && !bankTargetSet.has(w)) return false;
      else if (role === 'extraPool' && !bankExtraSet.has(w)) return false;
      return !bankState.game && !bankState.sourceRole || (vocabularyIndex.get(w) || []).some(s =>
        (!bankState.game || s.gameId === bankState.game) && (!bankState.config || s.configId === bankState.config) && (!bankState.sourceRole || s.role === bankState.sourceRole));
    });
    if (bankState.sort === 'length') bankMatches.sort((a, b) => a.length - b.length || a.localeCompare(b));
    else if (bankState.sort === 'sources') bankMatches.sort((a, b) => new Set(vocabularyIndex.get(b)?.map(s => s.gameId)).size - new Set(vocabularyIndex.get(a)?.map(s => s.gameId)).size || a.localeCompare(b));
    const pages = Math.max(1, Math.ceil(bankMatches.length / bankState.pageSize));
    bankState.page = Math.max(0, Math.min(pages - 1, bankState.page));
    return {total: base.length, pages};
  }
  function sourceSummary(word) {
    const ids = new Set((vocabularyIndex.get(word) || []).map(s => s.gameId));
    return libraryData.games.filter(g => ids.has(g.id)).map(g => g.name).join(' · ');
  }
  function fillBankDefs(root) {
    const need = new Map();
    root.querySelectorAll('[data-def]').forEach(el => { const letter = el.dataset.def; if (!need.has(letter)) need.set(letter, []); need.get(letter).push(el); });
    for (const [letter, els] of need) {
      if (location.protocol === 'file:') { els.forEach(el => el.textContent = '释义需本地服务'); continue; }
      loadShard(letter).then(dict => els.forEach(el => { if (el.isConnected) el.textContent = shortZh(dict?.[el.dataset.w]?.[1]) || '暂无释义'; })).catch(() => els.forEach(el => { if (el.isConnected) el.textContent = '释义未加载'; }));
    }
  }
  async function loadProvenance(game) {
    if (!provenanceLoads.has(game.id)) {
      const promise = (async () => {
        if (location.protocol === 'file:') throw new Error('完整关卡出处需要通过本地服务打开项目。词库配置和生成可离线使用。');
        const response = await fetch(game.provenance);
        if (!response.ok) throw new Error('来源关卡加载失败：HTTP ' + response.status);
        const raw = await response.arrayBuffer();
        const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'));
        return JSON.parse(await new Response(stream).text());
      })();
      provenanceLoads.set(game.id, promise);
      promise.catch(() => provenanceLoads.delete(game.id));
    }
    return provenanceLoads.get(game.id);
  }
  function provenanceMarkup(game, word) {
    return game.configs.map(c => {
      const levels = new Map();
      for (const role of WPLibrary.ROLES) {
        const at = c.words[role].indexOf(word);
        if (at < 0) continue;
        for (const ref of c.wordLevels[role][at]) {
          if (!levels.has(ref)) levels.set(ref, []);
          levels.get(ref).push(WPLibrary.ROLE_LABELS[role]);
        }
      }
      if (!levels.size) return '';
      const items = [...levels].sort((a, b) => a[0] - b[0]).map(([ref, roles]) => {
        const [number, id, shard] = c.levelCatalog[ref];
        const label = c.levelKind === 'sharded' ? '分片 ' + shard + ' · 序号 ' + number : number == null ? '未映射关卡' : '第 ' + number + ' 关';
        return label + '（ID ' + id + '）· ' + roles.join(' / ');
      });
      const completions = (c.completions || []).filter(x => x[1] === word).map(x => x[3] + ' + ' + x[2] + ' → ' + x[1]);
      return '<details class="lib-provenance"><summary>' + esc(game.name + ' · ' + c.label) + ' · ' + levels.size + ' 个来源位置</summary>' +
        (c.sourceAliases ? '<p class="note">相同资源副本：' + esc(c.sourceAliases.join('、')) + '</p>' : '') +
        '<ol>' + items.slice(0, 100).map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
        (items.length > 100 ? '<details><summary>其余 ' + (items.length - 100) + ' 个位置</summary><p class="lib-ref-text">' + esc(items.slice(100).join('\n')) + '</p></details>' : '') +
        (completions.length ? '<p>答案补全：' + esc([...new Set(completions)].join('；')) + '</p>' : '') + '</details>';
    }).join('');
  }
  function renderBankCard() {
    const card = $('#bankCard'), word = bankState.picked, request = ++bankCardRequest;
    card.hidden = !word; if (!word) { card.innerHTML = ''; return; }
    const role = bankWordRole(word), sources = vocabularyIndex.get(word) || [];
    const roleText = role ? AUDIT_ROLE[role] : bankExcludedSet.has(word) ? '不符合生成词长或字母范围' : '未进入当前配置的生效词表';
    card.innerHTML = '<div class="g-top"><b>' + esc(word) + '</b><span>' + roleText + '</span></div><p id="bankDef" class="note"></p>' +
      '<p class="note">' + esc(sourceSummary(word) || '当前资源中没有来源记录') + '</p>' +
      '<details id="bankSources"><summary>查看全部游戏、版本和来源关卡</summary><div id="bankProvenance">展开后加载</div></details>';
    const uses = campaign.levels.flatMap((d, i) => d.words.includes(word) || d.extras.includes(word) ? [i] : []);
    if (uses.length) card.insertAdjacentHTML('beforeend', '<div class="blevels">' + uses.slice(0, 100).map(i => '<button type="button" data-jump="' + i + '">第 ' + (i + 1) + ' 关</button>').join('') + '</div>');
    if (/^[A-Z]/.test(word) && location.protocol !== 'file:') loadShard(word[0].toLowerCase()).then(dict => {
      if (request === bankCardRequest) $('#bankDef').textContent = dict?.[word.toLowerCase()]?.[1] || '暂无释义';
    }).catch(() => {});
    const details = $('#bankSources'); let started = false;
    details.addEventListener('toggle', async () => {
      if (!details.open || started) return; started = true;
      const holder = $('#bankProvenance'); holder.textContent = '正在加载来源关卡…';
      const games = libraryData.games.filter(g => sources.some(s => s.gameId === g.id));
      const results = await Promise.allSettled(games.map(g => loadProvenance(g)));
      if (request !== bankCardRequest) return;
      holder.innerHTML = results.map((r, i) => r.status === 'fulfilled' ? provenanceMarkup(r.value, word) : '<p class="bad">' + esc(games[i].name + '：' + r.reason.message) + '</p>').join('') || '没有来源记录';
      if (results.some(r => r.status === 'rejected')) started = false;
    });
  }
  function renderBank() {
    if (!bankDraft) return;
    renderLibraryRange();
    const snapshotView = bankState.scope === 'level';
    for (const option of $('#bankRole').options) {
      option.disabled = snapshotView && ['targetPool', 'extraPool', 'excluded'].includes(option.value);
    }
    if (snapshotView && ['targetPool', 'extraPool', 'excluded'].includes(bankState.role)) {
      bankState.role = ''; $('#bankRole').value = '';
    }
    const stat = computeBank(), slice = bankMatches.slice(bankState.page * bankState.pageSize, (bankState.page + 1) * bankState.pageSize);
    const scopeNote = bankState.view === 'range' ? ' · ' + rangeSelectionLabel() : snapshotView ? ' · 本关快照：' + levelLibrary().snapshot.recipe.name + ' v' + levelLibrary().snapshot.recipe.revision : '';
    $('#bankMeta').textContent = bankMatches.length + ' / ' + stat.total + ' 词 · 第 ' + (bankState.page + 1) + ' / ' + stat.pages + ' 页' + scopeNote;
    $('#bankList').innerHTML = slice.map(w => '<button type="button" class="brow' + (w === bankState.picked ? ' on' : '') + '" data-w="' + esc(w) + '"><b class="gw">' + esc(w) + '</b><span>' + (AUDIT_ROLE[bankWordRole(w)] || (bankExcludedSet.has(w) ? '不适用' : '来源词条')) + '</span><span class="nums" title="' + esc(sourceSummary(w)) + '">' + new Set((vocabularyIndex.get(w) || []).map(s => s.gameId)).size + ' 款游戏</span><span class="bzh"' + (/^[A-Z]/.test(w) ? ' data-def="' + w[0].toLowerCase() + '" data-w="' + esc(w.toLowerCase()) + '"' : '') + '>…</span></button>').join('') || '<p class="note" style="padding:16px">没有符合条件的词条。</p>';
    $('#bankPage').innerHTML = '<button type="button" id="bankPrev"' + (!bankState.page ? ' disabled' : '') + '>上一页</button><button type="button" id="bankNext"' + (bankState.page + 1 >= stat.pages ? ' disabled' : '') + '>下一页</button>';
    fillBankDefs($('#bankList')); renderBankCard();
  }
  function openBank(q) {
    if (!bankDraft) bankDraft = cloneLibrary(selectedRecipe());
    if (q != null) {
      bankState.q = WPLibrary.normalize(q); bankState.page = 0;
      if (bankState.q) { bankState.view = 'list'; bankState.scope = 'catalog'; bankState.role = ''; bankState.game = ''; bankState.config = ''; bankState.sourceRole = ''; }
    }
    bankState.picked = bankState.q && !/[?*]/.test(bankState.q) && bankState.mode === 'exact' ? bankState.q : '';
    $('#bankFind').value = bankState.q; $('#bankMode').value = bankState.mode; $('#bankScope').value = bankState.scope;
    $('#bankRole').value = bankState.role; $('#bankSourceRole').value = bankState.sourceRole;
    $('#bank').hidden = false; renderLibraryEditor(); updateLibraryPreview();
  }
  async function saveBankRecipe() {
    WPLibrary.compile(libraryData, bankDraft, {abbr: [...abbrSet]});
    const old = libraryRecipes.find(r => r.id === bankDraft.id), recipe = cloneLibrary(bankDraft);
    recipe.name = recipe.name.trim(); recipe.revision = old ? old.revision + 1 : 1;
    WPLibrary.validateRecipe(recipe, libraryData);
    const next = libraryRecipes.filter(r => r.id !== recipe.id).concat(recipe);
    await saveLibraryState(next);
    bankDraft = cloneLibrary(recipe); libraryDrafts.delete(recipe.id);
    renderLibraryEditor(); updateLibraryPreview(); toast('词库已保存；已有的关卡仍使用原版本');
    return recipe;
  }
  async function libraryAction(action) {
    const buttons = [...document.querySelectorAll('[data-library-action]')];
    buttons.forEach(b => b.disabled = true);
    try { await action(); } catch (e) { toast(e.message || '词库操作失败'); $('#libraryStatus').textContent = e.message || '词库操作失败'; }
    finally { buttons.forEach(b => b.disabled = false); if (bankDraft) { renderLibraryEditor(); $('#librarySave').disabled = !bankCompiled; } }
  }
  async function newBankRecipe(copy, name) {
    const recipe = copy ? cloneLibrary(bankDraft) : WPLibrary.defaultRecipe(libraryData);
    recipe.id = newId(); recipe.name = name; recipe.revision = 1; recipe.datasetHash = libraryData.datasetHash;
    WPLibrary.compile(libraryData, recipe, {abbr: [...abbrSet]});
    await saveLibraryState(libraryRecipes.concat(recipe));
    rememberBankDraft(); bankDraft = cloneLibrary(recipe);
    bankState.scope = 'result'; $('#bankScope').value = 'result'; bankState.page = 0; bankState.picked = '';
    renderLibraryEditor(); updateLibraryPreview(); toast(copy ? '词库副本已创建' : '词库已创建，可继续配置范围');
  }
  async function renameBankRecipe(name) {
    if (name === bankDraft.name) return;
    const saved = libraryRecipes.find(r => r.id === bankDraft.id);
    if (saved) {
      const renamed = Object.assign(cloneLibrary(saved), {name, revision: saved.revision + 1});
      WPLibrary.validateRecipe(renamed, libraryData);
      await saveLibraryState(libraryRecipes.map(r => r.id === saved.id ? renamed : r));
      bankDraft.revision = renamed.revision;
    }
    bankDraft.name = name;
    renderLibraryEditor(); updateLibraryPreview(); toast('词库已重命名');
  }
  let libraryNameMode = 'new', libraryNameBusy = false;
  function openLibraryNameDialog(mode) {
    libraryNameMode = mode;
    const copy = mode === 'copy', rename = mode === 'rename';
    $('#libraryNameTitle').textContent = rename ? '重命名词库' : copy ? '复制词库' : '新建词库';
    $('#libraryNameHint').textContent = rename ? '为当前词库设置新名称。' : copy ? '为当前配置的副本命名。' : '命名后可配置必答池和额外池的范围。';
    $('#libraryNameConfirm').textContent = rename ? '保存名称' : copy ? '创建副本' : '新建';
    $('#libraryName').value = rename ? bankDraft.name : copy ? (bankDraft.name.slice(0, 75) + ' · 副本') : '';
    $('#libraryNameError').hidden = true; $('#libraryNameError').textContent = '';
    $('#libraryName').removeAttribute('aria-invalid');
    $('#libraryNameDialog').showModal(); $('#libraryName').focus(); $('#libraryName').select();
  }
  function exportBank(kind) {
    const rows = bankMatches;
    const cell = x => '"' + String(x ?? '').replace(/"/g, '""') + '"';
    const content = kind === 'txt' ? rows.join('\n') + '\n' : '\uFEFFword,effective_role,in_target_pool,in_extra_pool,excluded,sources\n' + rows.map(w => [w, bankWordRole(w), bankTargetSet.has(w), bankExtraSet.has(w), bankExcludedSet.has(w), (vocabularyIndex.get(w) || []).map(s => s.gameId + '/' + s.configId + '/' + s.role).join('|')].map(cell).join(',')).join('\n') + '\n';
    download(bankDraft.name.replace(/[\\/:*?"<>|]/g, '_') + '.' + kind, content);
  }
  $('#btnBank').onclick = () => openBank($('#bankQ').value);
  $('#bankClose').onclick = () => { rememberBankDraft(); $('#bank').hidden = true; hideGloss(); };
  $('#bankQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); openBank($('#bankQ').value); } });
  $('#librarySelect').onchange = e => chooseBankRecipe(e.target.value);
  $('#libraryName').oninput = () => {
    $('#libraryNameError').hidden = true; $('#libraryName').removeAttribute('aria-invalid');
  };
  $('#libraryNew').onclick = () => openLibraryNameDialog('new');
  $('#libraryCopy').onclick = () => openLibraryNameDialog('copy');
  $('#libraryRename').onclick = () => openLibraryNameDialog('rename');
  $('#libraryNameCancel').onclick = () => { if (!libraryNameBusy) $('#libraryNameDialog').close(); };
  $('#libraryNameDialog').addEventListener('cancel', e => { if (libraryNameBusy) e.preventDefault(); });
  $('#libraryNameForm').onsubmit = async e => {
    e.preventDefault(); if (libraryNameBusy) return;
    const input = $('#libraryName'), error = $('#libraryNameError'), name = input.value.trim();
    if (!name || name.length > 80) {
      error.textContent = name ? '词库名称不能超过 80 个字符。' : '请输入词库名称。'; error.hidden = false;
      input.setAttribute('aria-invalid', 'true'); input.focus(); return;
    }
    libraryNameBusy = true;
    const controls = [...$('#libraryNameForm').querySelectorAll('input, button')];
    controls.forEach(el => el.disabled = true);
    try {
      if (libraryNameMode === 'rename') await renameBankRecipe(name);
      else await newBankRecipe(libraryNameMode === 'copy', name);
      $('#libraryNameDialog').close();
    } catch (e) { error.textContent = e.message || '词库操作失败'; error.hidden = false; }
    finally { libraryNameBusy = false; controls.forEach(el => el.disabled = false); if ($('#libraryNameDialog').open) input.focus(); }
  };
  $('#librarySave').onclick = () => libraryAction(saveBankRecipe);
  $('#libraryDelete').onclick = () => libraryAction(async () => {
    const id = bankDraft.id, next = libraryRecipes.filter(r => r.id !== id);
    if (!next.length) next.push(cloneLibrary(initialRecipe));
    const fallbackId = next.some(r => r.id === initialRecipe.id) ? initialRecipe.id : next[0].id;
    await saveLibraryState(next, id === defaultLibraryId ? fallbackId : defaultLibraryId);
    libraryDrafts.delete(id); bankDraft = null; chooseBankRecipe(defaultLibraryId); toast('配置已删除；关卡快照已保留');
  });
  $('#librarySetDefault').onclick = () => libraryAction(async () => {
    if (libraryDirty()) throw new Error('请先保存配置，再设为默认');
    await saveLibraryState(libraryRecipes, bankDraft.id); toast('已设为后续新建和生成的默认词库');
  });
  $('#libraryApplyLevel').onclick = () => libraryAction(async () => {
    if (libraryDirty()) throw new Error('请先保存配置，再应用到本关');
    rebindCurrentLibrary(bankDraft.id); await persist(); renderBank(); toast('本关已切换词库并重新校验');
  });
  $('#libraryExport').onclick = () => libraryAction(async () => {
    if (!bankCompiled) throw new Error('请先修正配置');
    download(bankDraft.name.replace(/[\\/:*?"<>|]/g, '_') + '.wordlibrary.json', JSON.stringify({kind: 'wordpages-library', schemaVersion: 1, recipe: bankDraft, snapshot: WPLibrary.snapshot(libraryData, bankDraft, {abbr: [...abbrSet]})}, null, 2));
  });
  $('#libraryImport').onclick = () => $('#libraryFile').click();
  $('#libraryFile').onchange = e => libraryAction(async () => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    const data = JSON.parse(await file.text());
    if (data.kind !== 'wordpages-library' || data.schemaVersion !== 1) throw new Error('这不是词库配置文件');
    WPLibrary.validateRecipe(data.recipe, libraryData); WPLibrary.validateSnapshot(data.snapshot);
    if (JSON.stringify(data.recipe) !== JSON.stringify(data.snapshot.recipe)) throw new Error('配置与快照不一致');
    if (JSON.stringify(WPLibrary.snapshot(libraryData, data.recipe, data.snapshot.rules)) !== JSON.stringify(data.snapshot)) throw new Error('快照词表与配置不一致');
    rememberBankDraft(); bankDraft = cloneLibrary(data.recipe); bankDraft.id = newId(); bankDraft.revision = 1;
    bankDraft.name += ' · 导入'; await saveBankRecipe();
    toast('配置已导入；生成时采用本机当前缩写禁表');
  });
  $('#bankFilters').addEventListener('change', e => {
    if (e.target.dataset.operation) configurePoolOperation(e.target.dataset.operation, e.target.value);
    else if (e.target.dataset.excludeTargets) bankDraft[e.target.dataset.excludeTargets].excludeTargets = e.target.checked;
    else {
      const row = e.target.closest('[data-pool]'); if (!row) return;
      const source = bankDraft[row.dataset.pool].sources[+row.dataset.index];
      if (e.target.dataset.field === 'game') { source.gameId = e.target.value; source.configId = '*'; }
      else if (e.target.dataset.field === 'config') source.configId = e.target.value;
      else if (e.target.dataset.field === 'role') source.roles = [...row.querySelectorAll('[data-field="role"]:checked')].map(el => el.value);
      refreshRegionBinding(row.dataset.pool);
    }
    bankState.page = 0; renderLibraryEditor(); updateLibraryPreview();
  });
  $('#bankFilters').addEventListener('click', e => {
    const chart = e.target.closest('[data-edit-pool-chart]');
    if (chart) { libraryRangeState.pool = chart.dataset.editPoolChart; showLibraryView('range'); return; }
    const add = e.target.closest('[data-add-source]'), del = e.target.closest('[data-remove-source]');
    let poolKey;
    if (add) {
      const key = add.dataset.addSource; poolKey = key;
      bankDraft[key].sources.push({gameId: '07_Word_Tiles', configId: '*', roles: key === 'targetPool' ? ['target'] : ['extra', 'onlyExtra', 'bonus']});
    } else if (del) { const row = del.closest('[data-pool]'); poolKey = row.dataset.pool; bankDraft[poolKey].sources.splice(+row.dataset.index, 1); }
    else return;
    refreshRegionBinding(poolKey);
    renderLibraryEditor(); updateLibraryPreview();
  });
  $('#bankFind').oninput = e => {
    bankState.q = WPLibrary.normalize(e.target.value); $('#bankQ').value = bankState.q;
    bankState.page = 0; bankState.picked = bankState.q && !/[?*]/.test(bankState.q) && bankState.mode === 'exact' ? bankState.q : '';
    clearTimeout(bankTimer); bankTimer = setTimeout(renderBank, 100);
  };
  for (const [id, key] of [['bankMode','mode'],['bankSort','sort'],['bankScope','scope'],['bankRole','role'],['bankGame','game'],['bankConfig','config'],['bankSourceRole','sourceRole']]) {
    $('#' + id).onchange = e => {
      bankState[key] = e.target.value; bankState.page = 0;
      if (key === 'game') { bankState.config = ''; updateSourceConfigFilter(); }
      renderBank();
    };
  }
  $('#bankCsv').onclick = () => exportBank('csv'); $('#bankTxt').onclick = () => exportBank('txt');
  $('#bank').addEventListener('click', e => {
    const row = e.target.closest('.brow');
    if (row) { bankState.picked = row.dataset.w; renderBankCard(); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) { goLevel(+jump.dataset.jump + 1); return; }
    if (e.target.id === 'bankPrev') { bankState.page--; renderBank(); }
    if (e.target.id === 'bankNext') { bankState.page++; renderBank(); }
  });
  $('#levelLibraryChange').onclick = () => { openBank(''); toast('选择并保存配置后，点击“应用到本关”'); };
  /* ---------- 词库配置与浏览结束 ---------- */
