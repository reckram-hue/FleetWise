type RecordData = Record<string, any>;

/** Null means unknown/invalid, including incomplete intervals; never invent zero. */
export function intervalDistance(record: RecordData): number | null {
  const { startOdometer: start, endOdometer: end } = record;
  return typeof start === 'number' && typeof end === 'number'
    && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end >= start
    ? end - start : null;
}

/** Only shifts with NO assignment records may use the historical shift interval. */
export function driverDistance(shifts: RecordData[], assignments: RecordData[], excludeTestData = false) {
  let totalKmDriven = 0;
  let unknownDistanceIntervals = 0;
  for (const shift of shifts) {
    if (shift.status !== 'Completed' || (excludeTestData && shift.isTestData === true)) continue;
    const intervals = assignments.filter(a => a.shiftId === shift.id);
    for (const interval of intervals.length ? intervals : [shift]) {
      if (excludeTestData && interval.isTestData === true) continue;
      const validOwner = !intervals.length || interval.driverId === shift.driverId;
      const complete = intervals.length ? interval.status === 'COMPLETED' : true;
      const km = validOwner && complete ? intervalDistance(interval) : null;
      if (km === null) unknownDistanceIntervals++;
      else totalKmDriven += km;
    }
  }
  return { totalKmDriven, unknownDistanceIntervals };
}
