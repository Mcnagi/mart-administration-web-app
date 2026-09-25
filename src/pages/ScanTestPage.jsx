// TEMPORARY diagnostic page (/scan-test) for figuring out how a PDA's built-in
// scanner delivers barcodes to the browser. Logs every raw keyboard/input
// event with its timing so the output can be reported back. Remove once the
// hardware-scanner integration is confirmed working.
import { useEffect, useRef, useState } from 'react';
import { useHardwareScanner } from '../hooks/useHardwareScanner';

export default function ScanTestPage() {
  const [log, setLog] = useState([]);
  const lastAt = useRef(0);

  // Overrides NavBar's jump-to-/add, so a recognised scan shows up here.
  useHardwareScanner((code) => setLog((prev) => [`>>> DETECTED SCAN: ${code}`, ...prev]));

  useEffect(() => {
    function record(e) {
      const now = e.timeStamp;
      const gap = lastAt.current ? Math.round(now - lastAt.current) : 0;
      lastAt.current = now;
      const parts = [e.type, `+${gap}ms`];
      if ('key' in e) parts.push(`key=${JSON.stringify(e.key)}`, `code=${e.code}`, `keyCode=${e.keyCode}`);
      if (e.type === 'input' || e.type === 'beforeinput') parts.push(`inputType=${e.inputType}`, `data=${JSON.stringify(e.data)}`);
      if (e.target?.tagName) parts.push(`on=${e.target.tagName.toLowerCase()}`);
      setLog((prev) => [parts.join('  '), ...prev].slice(0, 200));
    }
    const types = ['keydown', 'keyup', 'keypress', 'beforeinput', 'input', 'paste'];
    types.forEach((type) => window.addEventListener(type, record, true));
    return () => types.forEach((type) => window.removeEventListener(type, record, true));
  }, []);

  return (
    <div style={{ padding: 16 }}>
      <h2>Scanner test</h2>
      <p>1. Scan with nothing focused. 2. Tap the box below, then scan again. Send a screenshot of the log.</p>
      <input type="text" placeholder="Tap here, then scan" style={{ width: '100%', fontSize: 16, padding: 8 }} />
      <button type="button" onClick={() => setLog([])} style={{ margin: '8px 0' }}>Clear</button>
      <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {log.length ? log.join('\n') : '(no events yet)'}
      </pre>
    </div>
  );
}
