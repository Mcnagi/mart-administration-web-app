import { useEffect, useState } from 'react';

// True once the page has scrolled down more than `fraction` of the current
// viewport height (e.g. 0.05 for 5%) — false at the top, flips back once
// scrolled back above the threshold. Recomputed on scroll and on resize,
// since "5% of the viewport" moves with the viewport itself.
export function useScrolledPast(fraction) {
  const [past, setPast] = useState(false);

  useEffect(() => {
    function check() {
      setPast(window.scrollY > window.innerHeight * fraction);
    }
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [fraction]);

  return past;
}
