/**
 * BM2 evidence only: watch durable, observable storage effects, not a
 * replacement of the browser Worker constructor (module-scoped Worker
 * references are not guaranteed to traverse that wrapper).
 */
export function observeBm2FetchCommit({ writes = [], fetchWriteStart = 0, readStorage,
  hasWorkerWriteMark = false } = {}) {
  const journalKey = 'model-converters.xml-cii.fetch-rating-journal.v1';
  const configKey = 'model-converters.defaults.v1';
  const recent = writes.slice(fetchWriteStart);
  const journalWrites = recent.filter(row => row.key === journalKey).length;
  const configWrites = recent.filter(row => row.key === configKey).length;
  const journal = readStorage(journalKey);
  const saved = readStorage(configKey);
  let compactSaved = false;
  if (saved && configWrites) {
    try {
      const configJson = JSON.parse(saved).defaultsByConverter?.xml_to_cii?.supportConfigJson;
      compactSaved = typeof configJson === 'string'
        && configJson === JSON.stringify(JSON.parse(configJson));
    } catch {}
  }
  return {
    ready: journalWrites > 0 && configWrites > 0 && journal === null,
    journalWrites,
    configWrites,
    journalCleared: journal === null,
    compactSaved,
    workerWriteMeasured: Boolean(hasWorkerWriteMark),
  };
}
