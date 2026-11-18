# Ponder Source acceptance

The first production Playwright scenario signs into a disposable Community Solid Server, creates a task, changes priority and completion, checks anonymous denial, and signs in from a fresh browser context. Stored RDF is interpreted through the existing shared tasks reader at a pinned revision.

The acceptance server currently uses CSS 5 so the initial test reuses a known real login flow; upstream Cypress also exercises the application's CSS 7 setup. Neither personal accounts nor mocked authentication are used.

Runtime still uses Aerogel/Soukai. This is shared-reader interoperability coverage, not a runtime migration. Workspaces, lists, history, schema migration and writes need corresponding shared-module support. No new module scope is introduced.

FOCUS_BASE_URL controls production origin metadata. The eventual deployment target is https://focus.pondersource.com; publication and live-origin verification remain pending.
