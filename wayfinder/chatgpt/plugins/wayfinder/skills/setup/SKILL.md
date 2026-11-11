---
name: setup
description: Collect and persist Wayfinder travel defaults during onboarding or when the user asks to change their home airport, currency, walking pace, or dietary preferences.
---

Call `settings.read` first. Ask only for missing or requested preferences, grouping
these into three short questions: home airport; budget currency; walking pace
and optional dietary notes. Reuse explicit answers already in this conversation.
A blank airport is valid. Confirm an ambiguous airport rather than guessing its
IATA code. Supported currencies: USD, CAD, EUR, GBP, JPY. Paces: relaxed,
moderate, brisk. Preserve detailed mobility limits in the trip context; do not
reduce them to a pace label. Dietary notes are preferences, not allergy guarantees.

Accept skips and do not block city planning on setup. Call `settings.update`
with `set` containing only confirmed fields. Normalize airport codes to uppercase.
Explain unsupported values and ask for a supported choice; do not silently replace
them. Describe USD/moderate as defaults, not inferred personal preferences.

After a successful update, summarize saved values and say they are stored on this
computer. If persistence fails, say so and use confirmed preferences only in the
current conversation. A one-trip override does not change saved defaults unless
the user asks. Reset a field by setting it to its documented default; do not reset
unrelated fields. Do not request passport, payment, or account credentials.
