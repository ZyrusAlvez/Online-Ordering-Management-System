'use client';

import { Link } from '@/utils/navigation';
import { Logo } from '@/view/components/Logo';

// SAMPLE TEXT. The Privacy Policy and Terms are placeholders written for the demo: the company
// details, retention periods and refund times are made up. Have them reviewed before real customers
// use the site.

export const UPDATED = 'October 18, 2026';

export type Section = { title: string; body: React.ReactNode };

/** The shared layout of the Privacy Policy and the Terms: a plain, readable column. */
export default function LegalPage({
  title,
  intro,
  sections,
  other,
}: {
  title: string;
  intro: React.ReactNode;
  sections: Section[];
  other: { to: string; label: string };
}) {
  return (
    <div className="min-h-screen bg-cream">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo />
          <Link to={other.to} className="text-sm font-semibold text-brand hover:underline">
            {other.label}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-10">
        <h1 className="font-display text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-ink-soft">Last updated {UPDATED}</p>
        <div className="mt-6 space-y-3 text-[15px] leading-relaxed text-ink">{intro}</div>

        <nav aria-label="On this page" className="mt-8 rounded-2xl border border-line bg-paper p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">On this page</p>
          <ol className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.title}>
                <a href={`#s${i + 1}`} className="hover:text-brand">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {sections.map((s, i) => (
          <section key={s.title} id={`s${i + 1}`} className="mt-10 scroll-mt-6">
            <h2 className="font-display text-2xl">
              {i + 1}. {s.title}
            </h2>
            <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-ink [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
              {s.body}
            </div>
          </section>
        ))}

        <p className="mt-12 border-t border-line pt-6 text-sm text-ink-soft">
          <Link to="/" className="font-semibold text-brand hover:underline">
            ← Back to 3K Kitchen
          </Link>
        </p>
      </main>
    </div>
  );
}
