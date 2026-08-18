// Runs fn at idle time and returns a cancel() to abort it before it fires.
// Deferring an effect's real work this way lets React StrictMode's dev-only
// double mount/cleanup/mount cancel the first mount's scheduled work before
// it starts a real network read, so only the second mount's call actually
// runs (see ItemsContext.jsx for the original use of this trick).
export function scheduleIdle(fn) {
  const schedule = window.requestIdleCallback || ((cb) => setTimeout(cb, 0));
  const cancelSchedule = window.cancelIdleCallback || clearTimeout;
  const handle = schedule(fn);
  return () => cancelSchedule(handle);
}
