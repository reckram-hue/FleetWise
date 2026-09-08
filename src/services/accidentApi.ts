import { callFunction } from '../lib/firebase';
import { convertTimestamps } from '../lib/convertTimestamps';
import { getDriverSession } from '../store/session';
import { AccidentReport, AccidentFields, AccidentPhoto } from '../types';

const driverCall = async <T,>(name: string, data: object): Promise<T> => {
    const session = getDriverSession();
    if (!session) throw new Error('Your session has expired. Please log in again.');
    return convertTimestamps(await callFunction(name, { ...data, driverId: session.driverId, sessionToken: session.sessionToken }));
};
export const accidentApi = {
    create: (assignmentId: string, requestId: string) => driverCall<AccidentReport>('createAccidentReportDraft', { assignmentId, requestId }),
    list: (assignmentId: string) => driverCall<AccidentReport[]>('getAccidentReportForDriver', { assignmentId }),
    drafts: () => driverCall<AccidentReport[]>('getAccidentReportForDriver', {}),
    get: (reportId: string) => driverCall<AccidentReport>('getAccidentReportForDriver', { reportId }),
    save: (reportId: string, revision: number, mutationId: string, fields: AccidentFields) => driverCall<AccidentReport>('updateAccidentReportDraft', { reportId, revision, mutationId, fields }),
    submit: (reportId: string, revision: number) => driverCall<AccidentReport>('submitAccidentReport', { reportId, revision }),
    upload: (reportId: string, uploadId: string, imageDataUrl: string, caption: string) => driverCall<AccidentPhoto>('uploadAccidentPhoto', { reportId, uploadId, imageDataUrl, caption }),
    photo: (reportId: string, photoId: string) => driverCall<{ imageDataUrl: string }>('getAccidentPhoto', { reportId, photoId }),
    listAdmin: async (includeTest: boolean, cursor?: string) => convertTimestamps(await callFunction('listAccidentReportsAdmin', { includeTest, ...(cursor ? { cursor } : {}) })) as { reports: AccidentReport[]; nextCursor: string | null },
    getAdmin: async (reportId: string) => convertTimestamps(await callFunction('getAccidentReportAdmin', { reportId })) as AccidentReport,
    photoAdmin: (reportId: string, photoId: string) => callFunction<{ imageDataUrl: string }>('getAccidentPhoto', { reportId, photoId }),
};
