import { useState } from 'react';

const initialsOf = (name, email) => {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts.at(-1)[0] : source.slice(0, 2);
  return letters.toUpperCase();
};

/** Profile picture (e.g. from Google) with initials as the fallback. */
export default function Avatar({ src, name, email, size = 36, className = '' }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: size * 0.38 };

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        style={style}
        className={`shrink-0 rounded-full object-cover ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={style}
      className={`flex shrink-0 items-center justify-center rounded-full bg-brand/10 font-bold text-brand ${className}`}
    >
      {initialsOf(name, email)}
    </span>
  );
}
