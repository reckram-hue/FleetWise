import { callFunction } from '../lib/firebase';
import { AdminInspection, InspectionHistoryFilters, InspectionHistoryPage } from '../types';

export const inspectionApi = {
    list: (filters: InspectionHistoryFilters) => callFunction<InspectionHistoryPage>('listVehicleInspectionsAdmin', filters),
    detail: (inspectionId: string) => callFunction<AdminInspection>('getVehicleInspectionAdmin', { inspectionId }),
    photo: (inspectionId: string, photoRole: 'EXTERIOR' | 'INTERIOR') =>
        callFunction<{ imageDataUrl: string }>('getInspectionPhotoAdmin', { inspectionId, photoRole }),
};
