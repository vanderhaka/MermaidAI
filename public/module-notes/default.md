# Module notes

Add a markdown file next to this one named after the module title (see below). It will load automatically when you open the notes panel from **Flow detail**.

## File naming

- Module **Cart** → `cart.md`
- Module **Shopping Cart** → `shopping-cart.md`
- Module **Inventory** → `inventory.md`

Files live in `public/module-notes/` so they ship with the app and stay easy to edit in git.

## What to put here

- Contracts this module must honor when other parts of the build mention it (APIs, events, IDs).
- Dependencies on other modules (e.g. Cart → Inventory for stock).
- Non-obvious edge cases or failure modes to keep in sync across diagrams and implementation.
