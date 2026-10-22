/* Embedded after gen.js in a Blob worker; no network or DOM dependencies. */
'use strict';
let batchIndex, batchProfiles, batchConfig, currentJob, currentHistory;
self.onmessage = ({data}) => {
  try {
    if (data.type === 'init') {
      batchIndex = WTEngine.buildIndex(data.lex);
      batchProfiles = data.profiles; batchConfig = data.config;
      self.postMessage({type: 'ready'});
    } else if (data.type === 'attempts') {
      if (currentJob !== data.jobId) {
        currentJob = data.jobId; currentHistory = data.history;
        if (!currentHistory) throw new Error('生成历史缺失');
      }
      const results = data.poolSpec ? WTEngine.generatePoolAttempts(data.poolSpec, batchIndex, batchProfiles,
        batchConfig, data.start, data.count) : WTEngine.generateAttempts(data.number, batchIndex, batchProfiles,
        batchConfig, currentHistory, data.start, data.count);
      self.postMessage({type: 'results', requestId: data.requestId, results});
    }
  } catch (error) {
    self.postMessage({type: 'error', requestId: data.requestId, message: error.message || String(error)});
  }
};
