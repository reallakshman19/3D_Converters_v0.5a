/**
 * R15 J2/J4. Commit prepared Worker results in separate browser tasks.
 * The bounded localStorage write happens once; the full live-config swap and
 * journal clearing are generation-guarded and never share the write task.
 */
export function commitXmlCiiPreparedSave({
  payload, fullJson, status, isCurrent, writePayload, setConfig, clearJournal,
  defer = fn => setTimeout(fn, 0),
}) {
  return new Promise((resolve, reject) => {
    const superseded = () => { resolve('superseded'); };
    defer(() => {
      if (!isCurrent()) return superseded();
      try { writePayload(payload); }
      catch (error) { reject(error); return; }
      defer(() => {
        if (!isCurrent()) return superseded();
        try { setConfig(fullJson); }
        catch (error) { reject(error); return; }
        defer(() => {
          if (!isCurrent()) return superseded();
          try { clearJournal(); }
          catch (error) { reject(error); return; }
          resolve(status);
        });
      });
    });
  });
}
