# 3K Kitchen Ordering System: Documentation

Everything about the system lives in this folder. If something is true of the app but not written
down here, that is a gap in the documentation: please add it.

## Start here

| I want to… | Read |
| --- | --- |
| Understand what the system is and how the pieces fit | [overview.md](./overview.md) |
| Get it running on my machine | [getting-started.md](./getting-started.md) |
| Learn how to *use* it (visitor, customer, cashier, kiosk, rider, admin, super admin) | [user-guide.md](./user-guide.md) |
| Log in and try every role | [test-accounts.md](./test-accounts.md) |
| Understand the business rules (branches, orders, scheduling, payments, chat, sales…) | [how-it-works.md](./how-it-works.md) |
| Find my way around the code, or add a feature | [architecture.md](./architecture.md) |
| Know what a screen can call | [api.md](./api.md) |
| Know what a field means, or what values it may hold | [data-dictionary.md](./data-dictionary.md) |
| Review how the system is protected | [security.md](./security.md) |
| Run the checks | [testing.md](./testing.md) |
| Put it on a server | [deployment.md](./deployment.md) |
| Keep it running, or fix something that broke | [operations.md](./operations.md) |
| Know *why* it was built this way | [decisions.md](./decisions.md) |
| See what has been built, and when | [changelog.md](./changelog.md) |

## The documents

| Document | What it contains | Who it is for |
| --- | --- | --- |
| [overview.md](./overview.md) | Purpose, users, channels, system diagram, technology, repository layout, current status | Everyone |
| [getting-started.md](./getting-started.md) | Supabase project, database migrations, `.env.local`, seeding, running, optional Google and GCash setup | Developers |
| [user-guide.md](./user-guide.md) | Step-by-step guides per role, with the real button and page names | Staff, owner, testers |
| [test-accounts.md](./test-accounts.md) | Every login (role, email, password, access) and a test walkthrough per role | Testers, developers |
| [how-it-works.md](./how-it-works.md) | The rules behind the screens: branches and who sees what, order and payment lifecycles, scheduled orders, pricing, delivery, kiosk, chat and photos, images, sales, sessions | Developers, owner |
| [architecture.md](./architecture.md) | The MVC layout, who enforces which rule, server actions, sign-in, live updates, "where does my change go?" | Developers |
| [api.md](./api.md) | Every controller and server action, who may call it, what it returns | Developers |
| [data-dictionary.md](./data-dictionary.md) | Every table and column, input rules and where each is enforced, JSON shapes, storage, access rules, known gaps | Developers, auditors |
| [security.md](./security.md) | Threat model, controls, rate limits (and what was lost), issues found and fixed, go-live checklist | Owner, developers, auditors |
| [testing.md](./testing.md) | Static checks, the end-to-end flow checks, testing by hand | Developers |
| [deployment.md](./deployment.md) | Every setting, production checklist, third-party setup, go-live checklist | Whoever hosts it |
| [operations.md](./operations.md) | Routine tasks, maintenance, troubleshooting table | Owner, support |
| [decisions.md](./decisions.md) | The significant design decisions and the reasoning behind each | Developers |
| [changelog.md](./changelog.md) | What was built, grouped by feature, with the migrations that go with it | Everyone |

## Keeping the documentation true

Documentation that drifts is worse than none, so the rule is: **change the docs in the same commit as the code.**

| If you change… | Update |
| --- | --- |
| A controller or server action, its input, or who may call it | [api.md](./api.md) |
| A table, column, constraint, bucket, policy or trigger (and add a migration) | [data-dictionary.md](./data-dictionary.md) and the migration table in [getting-started.md](./getting-started.md) |
| A field rule (length, format, limit) | `src/utils/validators/fields.ts`, `src/utils/validation.ts`, the DB constraint, and the rule table in [data-dictionary.md](./data-dictionary.md) |
| A screen or what a button does | [user-guide.md](./user-guide.md) |
| A login, password or role | [test-accounts.md](./test-accounts.md) |
| An environment variable | [deployment.md](./deployment.md) and `.env.example` |
| A business rule (what counts as a sale, who can cancel…) | [how-it-works.md](./how-it-works.md) |
| Something security-relevant | [security.md](./security.md) |
| What the flow checks cover | [testing.md](./testing.md) |
| A design decision you would have to explain again | [decisions.md](./decisions.md) |
| Anything user-visible | [changelog.md](./changelog.md) |

Conventions used in these documents: file names are lowercase with dashes; commands are run from the folder named
in the heading unless a path says otherwise; paths such as `src/…` and `supabase/…` are relative to the repository root;
money is Philippine pesos; days are Manila days (see [how-it-works.md](./how-it-works.md#sales-report)).
