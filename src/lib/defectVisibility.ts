import type { DefectReport, User, Vehicle } from '../types';
/** For old records only, inherit explicit TEST markers from known parents. Never infer from names. */
export function isTestDefect(record: DefectReport, users: User[], vehicles: Vehicle[]) {
    return record.isTestData === true || (record.isTestData == null &&
        (users.some(u => u.id === record.driverId && u.isTestData === true) || vehicles.some(v => v.id === record.vehicleId && v.isTestData === true)));
}
export function visibleDefects(records: DefectReport[], users: User[], vehicles: Vehicle[], includeTest: boolean, status = 'all', urgency = 'all') {
    return records.filter(d => (includeTest || !isTestDefect(d, users, vehicles))
        && (status === 'all' || d.status === status) && (urgency === 'all' || d.urgency === urgency));
}
