'use client';

import NextLink from 'next/link';
import { useParams as useNextParams, usePathname, useRouter, useSearchParams as useNextSearchParams } from 'next/navigation';
import { forwardRef, useCallback, useEffect, useMemo } from 'react';

// The handful of react-router APIs the screens used, on top of Next.js navigation, so the
// screens moved over unchanged. Paths are absolute (Next has no relative routes).

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  to: string;
  replace?: boolean;
  state?: unknown;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ to, replace, state: _state, ...rest }, ref) {
  return <NextLink ref={ref} href={to} replace={replace} {...rest} />;
});

type NavLinkProps = Omit<LinkProps, 'className'> & {
  className?: string | ((s: { isActive: boolean }) => string);
  end?: boolean;
};

export function NavLink({ to, className, end, ...rest }: NavLinkProps) {
  const pathname = usePathname() ?? '';
  const isActive = end ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  return <Link to={to} className={typeof className === 'function' ? className({ isActive }) : className} {...rest} />;
}

/** Remembers where to go after logging in (react-router's location state). */
const FROM_KEY = '3k.from';

export function useNavigate() {
  const router = useRouter();
  // Stable, like react-router's: screens list it in effect dependencies.
  return useCallback((to: string | number, opts: { replace?: boolean; state?: { from?: string } } = {}) => {
    if (typeof to === 'number') {
      router.back();
      return;
    }
    try {
      if (opts.state?.from) sessionStorage.setItem(FROM_KEY, opts.state.from);
    } catch {
      // ignore
    }
    if (opts.replace) router.replace(to);
    else router.push(to);
  }, [router]);
}

export function Navigate({ to, replace = true, state }: { to: string; replace?: boolean; state?: { from?: string } }) {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(to, { replace, state });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);
  return null;
}

/** pathname + search, and the `from` a guard stored before sending the visitor to log in. */
export function useLocation() {
  const pathname = usePathname() ?? '/';
  const search = useNextSearchParams()?.toString() ?? '';
  return useMemo(() => {
    let from: string | null = null;
    try {
      from = sessionStorage.getItem(FROM_KEY);
    } catch {
      // ignore
    }
    return { pathname, search: search ? `?${search}` : '', state: from ? { from } : null };
  }, [pathname, search]);
}

/** Clears the remembered destination once it has been used. */
export const forgetFrom = () => {
  try {
    sessionStorage.removeItem(FROM_KEY);
  } catch {
    // ignore
  }
};

export function useParams<T extends Record<string, string>>() {
  return (useNextParams() ?? {}) as T;
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams | Record<string, string>) => void] {
  const params = useNextSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const current = new URLSearchParams(params?.toString() ?? '');
  const set = (next: URLSearchParams | Record<string, string>) => {
    const qs = new URLSearchParams(next as Record<string, string>).toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };
  return [current, set];
}
