import { prepareStoredStatePayload } from './config-store.js';

// Performs the large JSON.stringify, default-master compaction, and second
// serialization entirely off the UI thread. Only the <=1MB storage write and
// live-string swap happen in the window context.
self.addEventListener('message', ({ data }) => {
  const { generation, config, compact, selectedConverter, defaultsByConverter } = data || {};
  try {
    const fullJson = JSON.stringify(config, null, compact ? 0 : 2);
    const defaults = {
      ...defaultsByConverter,
      [selectedConverter]: {
        ...(defaultsByConverter[selectedConverter] || {}),
        supportConfigJson: fullJson,
      },
    };
    const prepared = prepareStoredStatePayload(selectedConverter, defaults);
    self.postMessage({ generation, fullJson, payload: prepared.payload,
      status: prepared.status });
  } catch (error) {
    self.postMessage({ generation, error: String(error?.message || error) });
  }
});
