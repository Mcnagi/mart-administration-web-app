import { useRef } from 'react';

// Same thresholds as useHardwareScanner: faster than anyone types.
const MAX_KEY_GAP_MS = 50;
const MIN_LENGTH = 4;
// A scan with no Enter suffix is submitted once the burst goes quiet.
const IDLE_SUBMIT_MS = 120;

// Makes a manual barcode box double as a PDA scanner target: whether the
// scanner types the code as keystrokes or fills it in one go, it's submitted
// automatically (on its Enter suffix, or after the burst goes idle), then the
// box keeps focus with its text selected, so the next scan replaces it —
// scan after scan with no taps. Normal typing still submits only on Enter.
// Spread the returned props onto the <input>; `onSubmit(code)` may be async.
export function useScanInput(onSubmit) {
  const ref = useRef(null);
  const submitRef = useRef(onSubmit);
  submitRef.current = onSubmit;
  const burst = useRef({ lastAt: 0, chars: 0 });
  const idleTimer = useRef(null);

  function submit() {
    clearTimeout(idleTimer.current);
    burst.current.chars = 0;
    const el = ref.current;
    const code = el?.value.trim();
    if (!code) return;
    // Selected right away, so a next scan arriving mid-lookup replaces this
    // code instead of being appended to it.
    el.select();
    Promise.resolve(submitRef.current(code)).finally(() => {
      // Leave the box alone if the next scan has already started typing.
      if (el.value !== code && el.value !== '') return;
      if (document.activeElement !== el) el.focus();
      el.select();
    });
  }

  function onInput(e) {
    const now = e.timeStamp;
    const { inputType, data } = e.nativeEvent;
    // Measured from the event's own inserted text, not the value's length,
    // so a pre-filled or replaced selection doesn't read as a multi-char
    // insert. Soft-keyboard composition reports the whole word so far in
    // `data` on every key, so it counts as one character like normal typing.
    let added = 0;
    if (inputType === 'insertCompositionText') added = 1;
    else if (typeof data === 'string') added = data.length;
    else if (inputType?.startsWith('insert')) added = 1;
    // Several characters in one event (scanner filling the box directly) or
    // keystrokes closer together than a person can type both count as a scan.
    const fast = added > 1 || now - burst.current.lastAt < MAX_KEY_GAP_MS;
    burst.current.lastAt = now;
    burst.current.chars = fast ? burst.current.chars + Math.max(added, 1) : Math.max(added, 0);
    clearTimeout(idleTimer.current);
    if (fast && burst.current.chars >= MIN_LENGTH) {
      idleTimer.current = setTimeout(submit, IDLE_SUBMIT_MS);
    }
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter') return;
    // Also keeps Enter from submitting a surrounding form (e.g. saving the
    // whole item form) — in a barcode box, Enter means "look this code up".
    e.preventDefault();
    submit();
  }

  // data-scan-input tells useHardwareScanner to leave bursts in this box to us.
  return { inputProps: { ref, onInput, onKeyDown, 'data-scan-input': '' }, submit };
}
