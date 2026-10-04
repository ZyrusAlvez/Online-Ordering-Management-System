import { Link } from 'react-router-dom';
import { useSiteImage } from '../lib/siteImages.js';

export const RESTAURANT = '3K Kitchen';
export const BRANCH = 'GMA Terminal Branch';

export function Logo({ to = '/', size = 44, text = true, light = false, className = '' }) {
  const logo = useSiteImage('logo');
  const body = (
    <span className={`inline-flex items-center gap-3 ${className}`}>
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className="rounded-full bg-white object-cover ring-1 ring-line"
        style={{ width: size, height: size }}
      />
      {text && (
        <span className="whitespace-nowrap leading-none">
          <span className={`block font-script text-2xl ${light ? 'text-white' : 'text-ink'}`}>
            {RESTAURANT}
          </span>
          <span
            className={`block text-[10px] font-medium uppercase tracking-[0.2em] max-[420px]:hidden ${light ? 'text-sun' : 'text-sun-dark'}`}
          >
            {BRANCH}
          </span>
        </span>
      )}
    </span>
  );
  return to ? <Link to={to}>{body}</Link> : body;
}
