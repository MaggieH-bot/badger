interface BadgerAvatarProps {
  size?: number;
  className?: string;
  title?: string;
}

// Badger's face mark: white head with the signature dark eye-stripes, a dark
// snout, and ears peeking behind. Intrinsic black-and-white badger colors
// (not theme-driven) so it reads as a badger on any background. v1 — inline
// SVG, easy to refine.
export function BadgerAvatar({ size = 28, className, title }: BadgerAvatarProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 28 28"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {/* ears (drawn first so the head overlaps them) */}
      <circle cx="7" cy="7" r="2.6" fill="#2a2a2a" />
      <circle cx="21" cy="7" r="2.6" fill="#2a2a2a" />
      {/* head */}
      <ellipse cx="14" cy="14" rx="9.3" ry="10" fill="#f3f3ef" />
      {/* eye stripes — the badger's signature */}
      <rect x="9" y="6" width="3" height="13.5" rx="1.5" fill="#2a2a2a" />
      <rect x="16" y="6" width="3" height="13.5" rx="1.5" fill="#2a2a2a" />
      {/* snout */}
      <circle cx="14" cy="20.3" r="1.9" fill="#2a2a2a" />
    </svg>
  );
}
