  /* ---------- 词库运行上下文（由同步脚本内嵌） ---------- */
  const libraryData = JSON.parse($('#gameVocab').textContent);
  const libraryPresetVersion = 'four-games-v1';
  const initialRecipe = WPLibrary.defaultRecipe(libraryData);
  const initialSnapshot = WPLibrary.snapshot(libraryData, initialRecipe);
  let libraryRecipes = [initialRecipe];
  let defaultLibraryId = initialRecipe.id;
  const libraryContexts = new Map();
  const verifiedSnapshots = new WeakSet();
  function freezeLibrary(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value); Object.values(value).forEach(freezeLibrary);
    }
    return value;
  }
  const AUDIT_ROLE = {candidate: '必答候选', extra: '仅额外'};
  let lex = makeLibraryContext(initialSnapshot);
  let trie = null;
  const lexApi = {tier: () => null, score: () => null, zipf: () => null, specialist: () => false};
  function makeLibraryContext(snap) {
    if (!verifiedSnapshots.has(snap)) { WPLibrary.validateSnapshot(snap); freezeLibrary(snap); verifiedSnapshots.add(snap); }
    if (!libraryContexts.has(snap.id)) {
      const ix = WTEngine.buildIndex(snap.lex);
      libraryContexts.set(snap.id, {id: snap.id, snapshot: snap, ix,
        tier: Object.create(null), score: Object.create(null), zipf: Object.create(null), spec: Object.create(null), theme: Object.create(null),
        valid: new Set(ix.acceptable.map(x => x.word)), entries: ix.byWord, trie: null});
    }
    return libraryContexts.get(snap.id);
  }
  function selectedRecipe(id = defaultLibraryId) {
    return libraryRecipes.find(r => r.id === id) || initialRecipe;
  }
  function selectedSnapshot(id = defaultLibraryId) {
    return WPLibrary.snapshot(libraryData, selectedRecipe(id), {abbr: [...abbrSet]});
  }
  function registerLibrarySnapshot(snap, camp = campaign) {
    WPLibrary.validateSnapshot(snap);
    if (!camp.librarySnapshots) camp.librarySnapshots = {};
    const old = camp.librarySnapshots[snap.id];
    if (old && JSON.stringify(old) !== JSON.stringify(snap)) throw new Error('词库快照标识冲突');
    camp.librarySnapshots[snap.id] = old || freezeLibrary(JSON.parse(JSON.stringify(snap)));
    return snap.id;
  }
  function ensureCampaignLibraries(camp) {
    if (!camp.librarySnapshots) camp.librarySnapshots = {};
    for (const d of camp.levels) {
      if (!d.librarySnapshotId) {
        if (!camp.librarySnapshots[initialSnapshot.id]) registerLibrarySnapshot(initialSnapshot, camp);
        d.librarySnapshotId = initialSnapshot.id;
      }
      const snap = camp.librarySnapshots[d.librarySnapshotId];
      if (!snap) throw new Error('关卡引用的词库快照缺失：' + d.librarySnapshotId);
      if (!verifiedSnapshots.has(snap)) { WPLibrary.validateSnapshot(snap); freezeLibrary(snap); verifiedSnapshots.add(snap); }
    }
    return camp;
  }
  function levelLibrary(d = cur()) {
    if (!d || d.origin === 'wt' || d.origin === 'zen') return makeLibraryContext(initialSnapshot);
    const snap = campaign.librarySnapshots && campaign.librarySnapshots[d.librarySnapshotId];
    if (!snap) throw new Error('本关词库快照缺失，请重新载入完整的关卡台文件');
    return makeLibraryContext(snap);
  }
  function activateLevelLibrary() {
    const next = levelLibrary();
    if (lex.id !== next.id) { lex = next; trie = null; suggCache = null; }
    const bar = $('#levelLibraryBar');
    if (bar) {
      bar.hidden = !ours();
      $('#levelLibraryName').textContent = next.snapshot.recipe.name + ' · v' + next.snapshot.recipe.revision;
    }
  }
  function requiredWord(w, d) {
    return (d && typeof d === 'object' ? levelLibrary(d) : lex).entries.get(w)?.role === 'candidate';
  }
  function ensureTrie() {
    if (!trie) trie = lex.trie || (lex.trie = C.buildTrie(lex.valid));
    return trie;
  }
  function bindNewLevel(d, id = defaultLibraryId) {
    d.librarySnapshotId = registerLibrarySnapshot(selectedSnapshot(id));
    return d;
  }
  function referencedLibrarySnapshots(camp = campaign) {
    const result = {};
    for (const d of camp.levels) {
      const id = d.librarySnapshotId;
      if (id && camp.librarySnapshots?.[id]) result[id] = camp.librarySnapshots[id];
    }
    return result;
  }
  async function loadLibraryState() {
    let state;
    try { state = await idbGet('kv', 'libraries'); } catch (e) {}
    try {
      const fallback = JSON.parse(localStorage.getItem('wp.leveldesk.libraries') || 'null');
      if (fallback && (!state || (fallback.savedAt || 0) > (state.savedAt || 0))) state = fallback;
    } catch (e) {}
    if (!state) { await saveLibraryState(); return; }
    if (state.schemaVersion !== 1 || !Array.isArray(state.recipes)) throw new Error('保存的词库配置格式无效');
    const ids = new Set();
    for (const recipe of state.recipes) {
      WPLibrary.validateRecipe(recipe, libraryData);
      if (ids.has(recipe.id)) throw new Error('保存的词库 ID 重复');
      ids.add(recipe.id);
    }
    libraryRecipes = state.recipes.length ? state.recipes : [initialRecipe];
    defaultLibraryId = libraryRecipes.some(r => r.id === state.defaultId) ? state.defaultId : libraryRecipes[0].id;
    if (state.presetVersion !== libraryPresetVersion) {
      // Install the requested default once, preserving saved recipes and all level snapshots.
      if (!libraryRecipes.some(r => r.id === initialRecipe.id)) libraryRecipes = libraryRecipes.concat(initialRecipe);
      await saveLibraryState(libraryRecipes, initialRecipe.id);
    }
  }
  async function saveLibraryState(recipes = libraryRecipes, defaultId = defaultLibraryId) {
    const state = {schemaVersion: 1, presetVersion: libraryPresetVersion, recipes, defaultId, savedAt: Date.now()};
    try { await idbPut('kv', state, 'libraries'); try { localStorage.removeItem('wp.leveldesk.libraries'); } catch (e) {} }
    catch (e) { localStorage.setItem('wp.leveldesk.libraries', JSON.stringify(state)); }
    libraryRecipes = recipes;
    defaultLibraryId = defaultId;
    syncLibrarySelectors();
  }
  function syncLibrarySelectors() {
    const select = $('#bLibrary');
    if (select) {
      const value = select.value || defaultLibraryId;
      select.innerHTML = libraryRecipes.map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + ' · v' + r.revision + '</option>').join('');
      select.value = libraryRecipes.some(r => r.id === value) ? value : defaultLibraryId;
    }
  }
  function rebindCurrentLibrary(recipeId) {
    if (!ours() || batchRun) throw new Error('请在我们的关卡中、生成结束后切换词库');
    snapshot();
    const d = cur();
    d.librarySnapshotId = registerLibrarySnapshot(selectedSnapshot(recipeId));
    // A retained game snapshot may no longer bypass vocabulary validation after an explicit rebind.
    delete d.gameSnap; delete d.snapBoardFp;
    boardKey = ''; suggCache = null; trie = null;
    persist(); render();
  }
  /* ---------- 词库运行上下文结束 ---------- */
