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
| Call the API | [api.md](./api.md) |
| Know what a field means, or what values it may hold | [data-dictionary.md](./data-dictionary.md) |
| Review how the system is protected | [security.md](./security.md) |
| Run or write tests | [testing.md](./testing.md) · [testing-manual.md](./testing-manual.md) |
| Put it on a server | [deployment.md](./deployment.md) |
| Keep it running, or fix something that broke | [operations.md](./operations.md) |
| Know *why* it was built this way | [decisions.md](./decisions.md) |
| See what has been built, and when | [changelog.md](./changelog.md) |

## The documents

| Document | What it contains | Who it is for |
| --- | --- | --- |
| [overview.md](./overview.md) | Purpose, users, channels, system diagram, technology, repository layout, current status | Everyone |
| [getting-started.md](./getting-started.md) | Supabase project, database migrations, environment files, seeding, running, optional Google and GCash setup | Developers |
| [user-guide.md](./user-guide.md) | Step-by-step guides per role, with the real button and page names | Staff, owner, testers |
| [test-accounts.md](./test-accounts.md) | Every login (role, email, password, access) and a test walkthrough per role | Testers, developers |
| [how-it-works.md](./how-it-works.md) | The rules behind the screens: branches and who sees what, order and payment lifecycles, scheduled orders, pricing, delivery, kiosk, chat and photos, images, sales, sessions | Developers, owner |
| [architecture.md](./architecture.md) | Backend layering, frontend structure, live updates, auth flow, migrations, "where does my change go?" | Developers |
| [api.md](./api.md) | Every endpoint with real payloads, error format, rate limits, live-update setup | Frontend and integration developers |
| [data-dictionary.md](./data-dictionary.md) | Every table and column, input rules and where each is enforced, JSON shapes, storage, access rules, known gaps | Developers, auditors |
| [security.md](./security.md) | Threat model, controls, rate limits, history of issues found and fixed, go-live security checklist | Owner, developers, auditors |
| [testing.md](./testing.md) | The automated suite: how it runs, what it covers, how to add tests | Developers |
| [testing-manual.md](./testing-manual.md) | Driving the API by hand with `curl` | Developers |
| [deployment.md](./deployment.md) | Every setting, production checklist, third-party setup, go-live checklist | Whoever hosts it |
| [operations.md](./operations.md) | Routine tasks, maintenance, troubleshooting table | Owner, support |
| [decisions.md](./decisions.md) | The significant design decisions and the reasoning behind each | Developers |
| [changelog.md](./changelog.md) | What was built, grouped by feature, with the migrations that go with it | Everyone |

## Keeping the documentation true

Documentation that drifts is worse than none, so the rule is: **change the docs in the same commit as the code.**

| If you change… | Update |
| --- | --- |
| An endpoint, its payload, or who may call it | [api.md](./api.md) |
| A table, column, constraint, bucket or policy (and add a migration) | [data-dictionary.md](./data-dictionary.md) and the migration table in [getting-started.md](./getting-started.md) |
| A field rule (length, format, limit) | `backend/src/validators/fields.js`, `frontend/src/lib/validation.js`, the DB constraint, and the rule table in [data-dictionary.md](./data-dictionary.md) |
| A screen or what a button does | [user-guide.md](./user-guide.md) |
| A login, password or role | [test-accounts.md](./test-accounts.md) |
| An environment variable | [deployment.md](./deployment.md) and the matching `.env.example` |
| A business rule (what counts as a sale, who can cancel…) | [how-it-works.md](./how-it-works.md) |
| Something security-relevant | [security.md](./security.md) |
| Test counts or how tests run | [testing.md](./testing.md) |
| A design decision you would have to explain again | [decisions.md](./decisions.md) |
| Anything user-visible | [changelog.md](./changelog.md) |

Conventions used in these documents: file names are lowercase with dashes; commands are run from the folder named
in the heading unless a path says otherwise; `backend/…` and `frontend/…` paths are relative to the repository root;
money is Philippine pesos; days are Manila days (see [how-it-works.md](./how-it-works.md#sales-report)).
