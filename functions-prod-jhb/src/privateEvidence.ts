import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { createHash } from 'crypto';

const MAX_BYTES = 5 * 1024 * 1024;
export function imageResponse(bytes: Buffer, mime: string, expectedHash?: string) {
  const valid = mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/webp' && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
  if (!bytes.length || bytes.length > MAX_BYTES || !valid || (expectedHash && createHash('sha256').update(bytes).digest('hex') !== expectedHash)) {
    throw new functions.https.HttpsError('failed-precondition', 'Evidence is invalid or has changed. Contact support.');
  }
  return { imageDataUrl: `data:${mime};base64,${bytes.toString('base64')}` };
}

/** Caller must authorize the record and choose its attached path, never a client path.
 * Uses Storage object reads only: no signBlob permission, public URL or download token.
 * The inclusive range bounds memory even if object metadata is incorrect.
 */
export async function readPrivateEvidence(bucket: ReturnType<ReturnType<typeof admin.storage>['bucket']>, path: string, expectedHash?: string) {
  try {
    const file = bucket.file(path);
    const [metadata] = await file.getMetadata();
    if (Number(metadata.size) > MAX_BYTES) throw new functions.https.HttpsError('failed-precondition', 'Evidence exceeds the size limit.');
    const version = metadata.generation ? bucket.file(path, { generation: metadata.generation }) : file;
    const chunks: Buffer[] = [];
    for await (const chunk of version.createReadStream({ start: 0, end: MAX_BYTES })) chunks.push(Buffer.from(chunk));
    return imageResponse(Buffer.concat(chunks), String(metadata.contentType || ''), expectedHash);
  } catch (e: any) {
    if (e instanceof functions.https.HttpsError) throw e;
    if (Number(e?.code) === 404) throw new functions.https.HttpsError('not-found', 'Evidence photo is missing. Contact support.');
    // Deliberately omit object paths, credential details and image data from diagnostics.
    console.error('private-evidence-read-failed', { code: String(e?.code || 'unknown').slice(0, 40) });
    throw new functions.https.HttpsError('unavailable', 'Evidence could not be retrieved. Retry or contact support.');
  }
}
