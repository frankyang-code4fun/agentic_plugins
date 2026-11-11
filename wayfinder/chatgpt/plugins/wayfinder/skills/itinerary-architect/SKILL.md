---
name: itinerary-architect
description: Plan or revise a walkable city itinerary, day plan, or multi-day neighborhood route, or export an agreed itinerary. Use for indirect requests such as 48 hours in Lisbon with limited hills. Do not run this workflow for a standalone weather or exchange-rate lookup.
---

1. Call `settings.read`. Explicit trip instructions override defaults. Establish
   destination, dates, starting area, interests, arrival/departure constraints,
   accessibility needs and budget. Ask only what is needed; an undated plan can
   be a flexible sequence. Never require home airport for city-only planning.
2. Use `search_neighborhood_pois` for real places and coordinates when needed.
   Reuse supplied verified data instead of forcing duplicate lookups. Group
   morning/afternoon/evening geographically; avoid backtracking and account for
   hills, river crossings, meals, queues and rests. Read
   [transit buffers](references/transit-buffers.md) for timing estimates.
3. Use `get_weather_and_fx` for destination forecasts when appropriate. Match
   returned dates to the trip; the current tool supplies a rolling forecast,
   not arbitrary-date weather. For FX alone use `wayfinder.exchange_rate` (USD
   base) without requesting a full itinerary. Inspect actual returned rates and
   source dates; never present a fallback rate of 1 as a verified conversion.
4. When rain threatens an outdoor block, propose nearby indoor alternatives
   following [rain planning](references/rain-planning.md). Verify opening times,
   accessibility, tickets and dietary suitability with available sources or
   clearly mark them unverified. Do not claim straight-line distances are walking
   routes. Live provider failures must remain visible; do not invent results.
5. Call `render_neighborhood_explorer` with selected real coordinates. Its current
   currency selector supports USD, EUR and JPY only. For CAD/GBP preferences,
   label the widget's USD display and provide the preferred-currency budget in
   text using a verified conversion; do not silently change saved preferences.
6. Present a per-day table: Time | Neighborhood/stop | Travel estimate |
   Rain backup | Estimated cost in preferred currency. State the FX date, key
   timing assumptions and details still to verify. Do not promise deterministic
   routing, availability, guaranteed accessibility, or safe allergen exposure.
7. Save with `wayfinder.save_trip` only when requested. Use stable trip IDs and
   the complete current itinerary when updating; same-ID writes replace it.
   Open the dashboard/tray for that ID when requested. For file exports, read
   [export formats](references/exports.md). A `.trip` workspace file is separate
   from the persistent trip library; editing one does not update the other.

The room picker is an illustrative preference demo. `hold_boutique_stay` is a
simulation, not a confirmed hotel reservation. Never describe either as a real
booking or payment. Do not invoke a hold unless explicitly requested.
