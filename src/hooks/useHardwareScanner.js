import { useEffect, useRef } from 'react';

// Hardware scanners on PDAs (the built-in red-light scan engine) run in
// "keyboard wedge" mode: they type the barcode as a burst of keystrokes
// followed by Enter (or Tab). A person can't sustain this key rate, so a fast
// burst ending in Enter/Tab is treated as a scan rather than typing.
const MAX_KEY_GAP_MS = 50;
const MIN_LENGTH = 4;

// One shared window listener; only the highest-priority subscriber (latest
// mounted on ties) receives a scan, so a page that handles scans itself
// (priority 1, the default) overrides NavBar's app-wide fallback (priority 0).
const subscribers = [];
let buffer = '';
let lastKeyAt = 0;
let burstTarget = null;
let burstStartValue = null;

function isTextField(el) {
  return el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'radio');
}

// The wedge's keystrokes already landed in whatever field had focus (e.g. a
// quantity input). Put back the value from before the burst, through the
// native setter + an input event so React's controlled state follows too.
function restoreFieldValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function onKeyDown(e) {
  if (e.timeStamp - lastKeyAt > MAX_KEY_GAP_MS) {
    buffer = '';
    burstTarget = e.target;
    burstStartValue = isTextField(e.target) ? e.target.value : null;
  }
  lastKeyAt = e.timeStamp;

  if (e.ctrlKey || e.metaKey || e.altKey) {
    buffer = '';
    return;
  }
  if (e.key === 'Enter' || e.key === 'Tab') {
    const code = buffer;
    buffer = '';
    if (code.length < MIN_LENGTH) return;
    // A barcode box (useScanInput) submits its own scans in place.
    if (burstTarget?.closest?.('[data-scan-input]')) return;
    // Stops the Enter from also submitting whatever form had focus.
    e.preventDefault();
    e.stopPropagation();
    if (burstStartValue !== null && burstTarget?.isConnected) restoreFieldValue(burstTarget, burstStartValue);
    const top = subscribers.reduce((best, sub) => (!best || sub.priority >= best.priority ? sub : best), null);
    top?.handlerRef.current(code);
    return;
  }
  if (e.key.length === 1) buffer += e.key;
  // Scanners press Shift for uppercase (Code 39/128); anything else breaks the burst.
  else if (e.key !== 'Shift') buffer = '';
}

export function useHardwareScanner(onScan, { priority = 1 } = {}) {
  const handlerRef = useRef(onScan);
  handlerRef.current = onScan;

  useEffect(() => {
    const sub = { handlerRef, priority };
    subscribers.push(sub);
    // Capture phase, so the Enter is swallowed before any form sees it.
    if (subscribers.length === 1) window.addEventListener('keydown', onKeyDown, true);
    return () => {
      subscribers.splice(subscribers.indexOf(sub), 1);
      if (subscribers.length === 0) window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [priority]);
}
