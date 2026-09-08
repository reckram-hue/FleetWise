import { AccidentFields } from '../types';
export type AccidentFieldSpec = { key: keyof AccidentFields; label: string; type?: 'datetime' | 'long' | 'tri' | 'motion' };
export const accidentSteps: { title: string; fields: AccidentFieldSpec[] }[] = [
    { title: 'What happened?', fields: [
        { key: 'accidentAt', label: 'Accident date/time', type: 'datetime' },
        { key: 'locationDescription', label: 'Location description', type: 'long' },
        { key: 'injuries', label: 'Injuries known or reported?', type: 'tri' },
        { key: 'emergencyAttended', label: 'Emergency services attended?', type: 'tri' },
        { key: 'policeAttended', label: 'Police attended?', type: 'tri' },
        { key: 'policeAgency', label: 'Police station / agency' }, { key: 'policeReference', label: 'Police reference / case number' },
        { key: 'vehicleMotion', label: 'FleetWise vehicle moving or parked?', type: 'motion' },
        { key: 'narrative', label: 'What happened?', type: 'long' },
    ] },
    { title: 'Other driver & vehicle', fields: [
        { key: 'otherDriverName', label: 'Other driver name' }, { key: 'otherDriverSurname', label: 'Other driver surname' },
        { key: 'otherDriverPhone', label: 'Other driver phone' }, { key: 'otherDriverEmail', label: 'Other driver email' },
        { key: 'otherDriverLicence', label: 'Licence number' }, { key: 'otherDriverLicenceExpiry', label: 'Licence expiry (if known)' },
        { key: 'otherDriverJurisdiction', label: 'Licence jurisdiction' },
        { key: 'otherVehicleRegistration', label: 'Other vehicle registration' }, { key: 'otherVehicleMake', label: 'Make' },
        { key: 'otherVehicleModel', label: 'Model' }, { key: 'otherVehicleColour', label: 'Colour' }, { key: 'otherVehicleType', label: 'Vehicle type' },
        { key: 'ownerName', label: 'Owner name' }, { key: 'ownerContact', label: 'Owner contact details' }, { key: 'ownerRelationship', label: 'Owner relationship to driver' },
    ] },
    { title: 'Insurance & witnesses', fields: [ { key: 'insurer', label: 'Insurer' }, { key: 'policyNumber', label: 'Policy number' },
        { key: 'claimReference', label: 'Claim / reference number' }, { key: 'insuredParty', label: 'Insured party' } ] },
    { title: 'Damage & vehicle condition', fields: [
        { key: 'fleetDamage', label: 'FleetWise vehicle damage', type: 'long' }, { key: 'otherVehicleDamage', label: 'Other vehicle damage', type: 'long' },
        { key: 'propertyDamage', label: 'Property / third-party damage', type: 'long' },
        { key: 'vehicleDriveable', label: 'Vehicle appears driveable?', type: 'tri' }, { key: 'towingRequired', label: 'Towing / recovery required?', type: 'tri' },
    ] }, { title: 'Photos / evidence', fields: [] }, { title: 'Review & submit', fields: [] },
];
export const accidentMinimumMissing = (fields: AccidentFields) => [
    !fields.accidentAt && 'Accident date/time', !fields.locationDescription?.trim() && 'Location description',
    !fields.narrative?.trim() && 'What happened', !fields.injuries && 'Injury indication',
    !fields.incompleteDetailsAcknowledged && 'Incomplete-details acknowledgement',
].filter(Boolean) as string[];
