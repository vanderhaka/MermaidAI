# Inventory — cross-cutting notes

Use this checklist when **Cart**, **Checkout**, **Order management**, or **Shipping** reference stock or SKUs.

## Source of truth

- Variant-level stock lives in the inventory service; cart line items reference `sku` / `variant_id` that map here.
- Real-time reads while the cart is open; reservation happens at payment or checkout per your policy.

## Callers must agree on

- **OOS / low stock**: error codes or flags returned to Cart so the flow nodes stay accurate.
- **Merge on login**: if guest cart lines are merged, re-validate quantities against current stock.
- **Admin / catalog**: any change to variant attributes must stay aligned with what Cart sends (size, color, etc.).

## Mentions elsewhere

- **Payment success**: decrement or confirm reservation; on failure, release holds.
- **Notifications**: optional low-stock alerts to ops if you model thresholds in inventory.
