// Names and IDs the connectors use. No secrets here (secrets live in Vercel env vars).
//
// Anything marked "TO CONFIRM" has not been confirmed yet. A connector that needs
// it will STOP and email an alert instead of guessing. Use /api/lookup to see the
// real names and IDs in GHL, Flodesk and WebinarJam, then fill them in here.

export default {
  webinarjam: {
    webinarId: 'TO CONFIRM', // from /api/lookup
    scheduleId: 'TO CONFIRM', // the Thu Nov 12 2026, 7pm EST session, from /api/lookup
  },

  // Attendance is only final after the webinar ends. The full reconcile run
  // refuses to start before this time. 2026-11-13 03:00 UTC = Thu Nov 12, 10pm EST.
  // TO CONFIRM: how long the webinar runs.
  reconcileNotBefore: '2026-11-13T03:00:00Z',

  ghl: {
    joinLinkFieldName: 'TO CONFIRM', // contact custom field that holds the unique join link
    callMissedTag: 'webinar - call missed',
    // Decision pending: (a) create these tags in GHL and put the names here,
    // or (b) leave them as null to skip GHL tags for attendance.
    attendedTag: null,
    noShowTag: null,
  },

  flodesk: {
    segments: {
      registered: 'Webinar - Registered',
      attended: 'Webinar - Attended',
      noShow: 'Webinar - No-show',
      callMissed: 'Webinar - Call missed', // TO CONFIRM that this segment exists
    },
    // Should the registration connector also add the person to Flodesk
    // "Webinar - Registered" (with their join link)? Decision pending.
    addToRegisteredOnSignup: false,
    joinLinkCustomField: 'TO CONFIRM', // Flodesk custom field key for the join link
  },
};

// Throws if a value has not been confirmed yet, so nothing runs on a guess.
export function confirmed(value, label) {
  if (!value || String(value).startsWith('TO CONFIRM')) {
    throw new Error(`Setting not confirmed yet: ${label}. Fill it in config.js.`);
  }
  return value;
}
