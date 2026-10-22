/* Ordered candidate reduction over a reusable per-batch worker pool. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WPBatchGenerator = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function threadCount(choice, hardware = 2) {
    const available = Math.max(1, Math.min(8, Math.floor(Number(hardware) || 2)));
    return choice === 'auto' ? Math.min(4, Math.max(1, available - 1)) :
      Math.max(1, Math.min(available, Math.floor(Number(choice) || 1)));
  }
  function cancelledError() { const error = new Error('生成已中止'); error.name = 'AbortError'; return error; }
  function create(options) {
    const engine = options.engine || globalThis.WTEngine;
    const config = {...engine.DEFAULTS, ...options.config}, profiles = options.profiles;
    const requested = Math.max(1, Math.min(8, Math.floor(Number(options.workers) || 1))), chunk = 4;
    const slots = [], timeoutMs = options.timeoutMs || 30000;
    let url = null, closed = false, fallback = false, active = null, sequence = 0, requestId = 0, index = null;
    let readyResolve, readySettled = false, initTimer;
    let status = {mode: 'starting', workers: requested, requested};
    const ready = new Promise(resolve => { readyResolve = resolve; });
    function report(mode, workers, reason = '') {
      status = {mode, workers, requested, reason}; options.onStatus?.({...status});
    }
    function settleReady() {
      if (readySettled) return;
      readySettled = true; clearTimeout(initTimer); readyResolve();
    }
    function destroyWorkers() {
      for (const slot of slots) {
        clearTimeout(slot.timer); slot.worker.onmessage = null; slot.worker.onerror = null;
        slot.worker.onmessageerror = null; slot.worker.terminate();
      }
      slots.length = 0;
      if (url) { URL.revokeObjectURL(url); url = null; }
    }
    function finish(job, error) {
      if (active !== job) return;
      active = null; clearTimeout(job.timer);
      if (error) job.reject(error);
      else job.resolve(job.poolSpec ? job.results : engine.finishGeneration(job.number, profiles, config, job.best));
    }
    function accept(job, results, start) {
      if (active !== job || closed) return;
      results.forEach((result, offset) => job.pending.set(start + offset, result));
      while (job.pending.has(job.cursor)) {
        const candidate = job.pending.get(job.cursor); job.pending.delete(job.cursor);
        if (job.poolSpec) job.results.push(candidate);
        else if (candidate && (!job.best || candidate.score > job.best.score)) job.best = candidate;
        const stop = !job.poolSpec && engine.stopAfterAttempt(job.best, candidate, job.cursor, job.limit);
        job.cursor++;
        if (stop || job.cursor >= job.limit) { finish(job); break; }
      }
      options.onProgress?.({number: job.number, checked: job.cursor, attempts: job.limit});
    }
    function localStep(job) {
      if (closed || active !== job) return;
      try {
        if (!index) index = engine.buildIndex(options.lex);
        const start = job.cursor;
        const count = Math.min(chunk, job.limit - start);
        accept(job, job.poolSpec ? engine.generatePoolAttempts(job.poolSpec, index, profiles, config, start, count) : engine.generateAttempts(job.number, index, profiles, config, job.history, start, count), start);
        if (active === job) job.timer = setTimeout(() => localStep(job), 0);
      } catch (error) { finish(job, error); }
    }
    function useFallback(reason) {
      if (closed || fallback) return;
      fallback = true; destroyWorkers(); report('fallback', 0, reason); settleReady();
      if (active) {
        // Restart this level against the same immutable history and attempt seeds.
        const job = active; job.best = null; job.cursor = job.start || 0; job.next = job.cursor; job.results = []; job.pending.clear();
        job.timer = setTimeout(() => localStep(job), 0);
      }
    }
    function dispatch() {
      const job = active;
      if (!job || closed || fallback) return;
      for (const slot of slots) {
        if (!slot.ready || slot.task || job.next >= job.limit || job.next >= job.cursor + requested * chunk * 2) continue;
        const task = {requestId: ++requestId, jobId: job.id, start: job.next, count: Math.min(chunk, job.limit - job.next)};
        job.next += task.count; slot.task = task;
        const message = {type: 'attempts', ...task, number: job.number, poolSpec: job.poolSpec};
        if (slot.lastJob !== job.id) { message.history = job.history; slot.lastJob = job.id; }
        slot.timer = setTimeout(() => useFallback('计算线程响应超时'), timeoutMs);
        try { slot.worker.postMessage(message); } catch (error) { useFallback(error.message); break; }
      }
    }
    try {
      if (typeof Worker !== 'function') throw new Error('浏览器不支持 Web Worker');
      url = URL.createObjectURL(new Blob([options.workerSource], {type: 'text/javascript'}));
      for (let i = 0; i < requested; i++) {
        const worker = new Worker(url), slot = {worker, ready: false, task: null, lastJob: 0, timer: null}; slots.push(slot);
        worker.onmessage = ({data}) => {
          if (closed || fallback) return;
          if (data.type === 'ready') {
            slot.ready = true;
            if (slots.length === requested && slots.every(s => s.ready)) { report('workers', requested); settleReady(); }
            return;
          }
          if (data.type === 'error') { useFallback(data.message || '计算线程异常'); return; }
          const task = slot.task;
          if (!task || data.requestId !== task.requestId) return;
          clearTimeout(slot.timer); slot.task = null;
          if (!Array.isArray(data.results) || data.results.length !== task.count) { useFallback('计算线程返回结果不完整'); return; }
          if (active?.id === task.jobId) accept(active, data.results, task.start);
          dispatch();
        };
        worker.onerror = event => { event.preventDefault?.(); useFallback(event.message || '计算线程不可用'); };
        worker.onmessageerror = () => useFallback('计算线程消息读取失败');
        worker.postMessage({type: 'init', lex: options.lex, profiles, config});
      }
      initTimer = setTimeout(() => useFallback('计算线程启动超时'), options.startupTimeoutMs || 5000);
    } catch (error) { useFallback(error.message); }
    function close() {
      if (closed) return;
      closed = true; destroyWorkers(); settleReady();
      if (active) finish(active, cancelledError());
    }
    return {
      async generateCandidates(poolSpec, start = 0, count = 32) {
        await ready;
        if (closed) throw cancelledError();
        if (active) throw new Error('上一批候选尚未完成');
        engine.poolTarget(poolSpec, profiles);
        if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(count) || count < 1 || count > 1024) throw new Error('候选范围无效');
        return new Promise((resolve, reject) => {
          const job = {id: ++sequence, poolSpec: structuredClone(poolSpec), history: {}, start, limit: start + count,
            results: [], cursor: start, next: start, pending: new Map(), timer: null, resolve, reject};
          active = job;
          if (fallback) job.timer = setTimeout(() => localStep(job), 0); else dispatch();
        });
      },
      async generateOne(number, history = {}) {
        await ready;
        if (closed) throw cancelledError();
        if (active) throw new Error('关卡必须按关序生成');
        return new Promise((resolve, reject) => {
          const job = {id: ++sequence, number, history: structuredClone(history), limit: engine.attemptLimit(config),
            best: null, cursor: 0, next: 0, pending: new Map(), timer: null, resolve, reject};
          active = job;
          if (fallback) job.timer = setTimeout(() => localStep(job), 0);
          else dispatch();
        });
      },
      cancel: close, close, status: () => ({...status})
    };
  }
  return {threadCount, create};
});
