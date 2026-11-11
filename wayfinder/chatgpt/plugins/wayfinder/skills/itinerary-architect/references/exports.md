# Export formats

Resolve dates and destination time zone before calendar export. Use UTC DTSTART
and DTEND calculated with the correct offset for each date, or valid TZID values
with VTIMEZONE. Every event needs a unique UID, UTC DTSTAMP, SUMMARY and a sensible
end after its start. Escape backslash, newline, comma and semicolon; use CRLF and
fold long lines at 75 UTF-8 octets. Verify ordering and daylight-saving boundaries.

A `.trip` JSON file uses id, title, destination, currency, days and checklist.
Each day has date (YYYY-MM-DD) and stops. Each stop has time (HH:MM), name,
estimatedCostUsd (nonnegative number), and notes. Checklist entries have label
and done. Keep the USD cost basis even when display currency differs. Only
convert a source amount when a valid rate is available.

For GPX, use verified coordinates; retain route order, track segments, XML
namespaces and metadata. Do not invent elevation or a safe walking route from a
few isolated points. Label waypoint-only exports. Offer directions links if
geospatial route data is unavailable. Write files only when authorized and when
a workspace/file tool is available; otherwise provide clearly labeled content.
