---
name: packing-weather-audit
description: Audit an existing trip for rain alternatives or suggest packing for its dates and activities. Do not trigger for a standalone weather lookup or create a replacement itinerary without being asked.
---

Read `settings.read` and the supplied or explicitly selected saved itinerary.
Reuse its dates and destination; ask if missing. Use the actual forecast window
from `get_weather_and_fx`. Follow
[weather and indoor swaps](../itinerary-architect/references/rain-planning.md).
For dates outside the window, provide conditional packing advice and suggest
checking closer to departure. Never label seasonal expectations as a forecast.

Show Original block | Weather concern | Nearby indoor alternative | Extra travel
and cost. Preserve the original plan; save only if requested. Tailor a concise
packing list to walking pace, activities and verified weather. Treat dietary
notes as preferences and ask venues about allergens. Do not run visa/legal advice
or ask for sensitive identity details as part of a packing check.
