# Names used by the connectors

Exact names from GHL and Flodesk. No secrets here. If a name changes in a tool, change it here too.

## Flodesk segments (confirmed: all start with "Webinar - ")
- Webinar - Registered
- Webinar - Attended
- Webinar - No-show
- Webinar - Applied
- Webinar - Call booked
- Webinar - Call missed: NOT CONFIRMED (not on the list yet)

Not used by the connectors: Engaged Profiles

## Flodesk workflows (folder "Abigail Webinar (Nov 4)")
1. Webinar: Registered
2. Webinar: Attended
3. Webinar: No-show
4. Webinar: Applied
5. Webinar: Call booked
6. Webinar: Call missed

What starts each workflow: "added to segment" (confirmed).
Which segment starts each workflow: NOT CONFIRMED (assumed to be the matching "Webinar - ..." segment).
Must test: does adding someone to a segment through the API start the workflow? (Check with the [TEST] contact.)

## GHL tags (lowercase): NOT CHECKED IN GHL YET
- webinar - registered
- webinar - applied
- webinar - call booked
- webinar - call missed
- Attended / no-show tags: NOT DECIDED

## GHL forms and workflows (folder "webinar", unpublished drafts)
- Form "Webinar Opt In": starts the "Webinar Registered" workflow
- Form "Webinar Questions": starts "Tag: Applied" (NOT CONFIRMED, flagged as a guess)
- Other workflows: Tag: Call missed, Tag: Call booked, Call Reminders

## GHL custom field for the join link
NOT CONFIRMED
