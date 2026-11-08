---
name: itinerary-architect
description: Plan or revise walkable city itineraries, audit rain alternatives, convert trip costs, and export itinerary calendars or routes.
---

1. Establish the city, trip dates, arrival and departure constraints, starting
   neighborhood, interests, and any mobility or walking limits that affect the plan. Use
   preferences from setup when available. For undated plans, build a flexible sequence
   and ask for exact dates before calendar export.
2. Cluster each day geographically into morning, afternoon, and evening. Order stops by
   a plausible walking route and check for obstacles such as rivers, steep grades, or
   limited crossings. Budget walking time at the user's pace, attraction time, meals,
   queues, and rest. Trim optional stops before overloading the day.
3. Show the estimated distance and travel time for each leg. For transit, separate
   station access, waiting, transfers, and travel where possible. Add an explicit buffer
   based on frequency and the consequences of a delay. Leave extra time before timed
   tickets and departures. Verify opening days and hours, reservations, and transit
   details with available tools and label estimates or details still to confirm.
4. When forecast tools are available and dates are in range, use the latest destination
   forecast. Cite the provider and timestamp and match wet periods to the scheduled
   blocks. Pair outdoor stops with nearby indoor backups and verify their hours where
   possible. For a rain audit, preserve the original itinerary and show proposed swaps
   with travel implications. When forecasts are unavailable or dates are outside the
   forecast range, provide conditional backup options.
5. Show source prices in local currency and convert estimates using a current
   exchange-rate source when available. Include the rate, source date, and rounding. If
   a rate cannot be verified, show local prices or calculate with a user-supplied rate
   and label it.
6. For an .ics export, resolve exact dates, destination time zone, and event start and
   end times. Interpret the itinerary in destination local time and convert to UTC using
   the correct offset on each date. Generate an RFC 5545 calendar with VCALENDAR,
   VERSION, PRODID, and a VEVENT for each scheduled block. Include unique UID, UTC
   DTSTAMP, DTSTART, DTEND, SUMMARY, and LOCATION when known. Escape text fields, fold
   long lines at 75 octets, and use CRLF line endings. Check that times and event order
   match the itinerary. Provide the .ics file when file creation is available.
7. For route export, provide ordered directions links grouped by day and travel mode,
   with addresses and a plain-text stop order for reference. Split links at changes of
   travel mode or when waypoint limits apply. Use verified coordinates if a traveler
   requests a geospatial export. Identify any legs with unverified routing.
