import { useEffect } from 'react';

// Self-dismissing notification banner. Calls onDismiss once after `duration`
// ms; the parent owns whether the toast is mounted at all.
export default function Toast({ message, duration = 5000, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
