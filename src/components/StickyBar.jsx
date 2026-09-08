// Generic floating bar primitives, pinned to the top or bottom of the
// *viewport* (not the page) and anchored to the left, mid, or right edge.
// Each bar is sized to its own content (not a percentage of the viewport),
// so stretching or shrinking the browser window never reflows the bar
// itself — only its anchor point moves with the edge it's pinned to.
//
// StickyBottom additionally clears iOS Safari's floating URL/search bar via
// env(safe-area-inset-bottom) (see .sticky-bottom-bar in index.css).
//
// Usage: <StickyTop align="left">...</StickyTop>, <StickyBottom align="right">...</StickyBottom>
// `align` is one of 'left' | 'mid' | 'right' (default 'mid').

function StickyBar({ position, align = 'mid', className = '', children, ...rest }) {
  const classes = ['sticky-bar', `sticky-${position}-bar`, `sticky-align-${align}`, className]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={classes} {...rest}>
      {children}
    </div>
  );
}

export function StickyTop(props) {
  return <StickyBar position="top" {...props} />;
}

export function StickyBottom(props) {
  return <StickyBar position="bottom" {...props} />;
}
