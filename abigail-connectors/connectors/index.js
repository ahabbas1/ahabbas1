// Every connector by name (used by the retry function).
import registration from './registration.js';
import attendance from './attendance.js';
import reconcile from './reconcile.js';
import callMissed from './call-missed.js';

export default {
  registration,
  attendance,
  reconcile,
  'call-missed': callMissed,
};
