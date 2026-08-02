// Small hand-drawn outline icons for the nav bar — self-contained (no icon
// library dependency) so the app stays free of extra deps.
const common = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export function ItemsIcon(props) {
  return (
    <svg {...common} {...props}>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function AddIcon(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 8.5v7M8.5 12h7" />
    </svg>
  );
}

export function AdminIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M12 3.5l7 3v5.2c0 4.4-3 7.7-7 8.8-4-1.1-7-4.4-7-8.8V6.5l7-3z" />
      <path d="M9 12l2 2 4-4.2" />
    </svg>
  );
}

export function AccountIcon(props) {
  return (
    <svg {...common} {...props}>
      <circle cx="12" cy="8.3" r="3.3" />
      <path d="M5 20c0-3.6 3-6 7-6s7 2.4 7 6" />
    </svg>
  );
}

export function LogoutIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M9 4H6a1.5 1.5 0 00-1.5 1.5v13A1.5 1.5 0 006 20h3" />
      <path d="M13.5 16l4-4-4-4M17 12H9" />
    </svg>
  );
}

export function FilterIcon(props) {
  return (
    <svg {...common} {...props}>
      <path d="M4 5.5h16M7.5 12h9M10.5 18.5h3" />
    </svg>
  );
}
