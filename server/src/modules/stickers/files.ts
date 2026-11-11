import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rm, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FastifyRequest } from 'fastify';
import { AccountError } from '../accounts/security.js';

export const maxFileSize = 10 * 1024 * 1024;
export const maxTotalSize = 25 * 1024 * 1024;
export const maxFiles = 5;
const images: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
const documents = new Set(['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.pdf', '.txt', '.md', '.csv', '.tsv', '.rtf', '.odt', '.ods', '.odp', '.json', '.xml', '.log', '.zip', '.7z', '.rar']);
export interface SavedFile { id: string; originalName: string; mimeType: string; sizeBytes: number; storageKey: string; contentHash: string }

export function filePath(directory: string, key: string) {
  if (!/^[a-f0-9-]{36}\.bin$/.test(key)) throw new AccountError(404, 'Файл недоступен');
  return resolve(directory, key);
}
export async function removeFiles(directory: string, files: { storageKey: string }[]) {
  await Promise.all(files.map(file => rm(filePath(directory, file.storageKey), { force: true })));
}
export async function hashStoredFile(directory: string, key: string) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath(directory, key))) hash.update(chunk);
  return hash.digest('hex');
}
function imageSignature(mime: string, bytes: Buffer) {
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]));
  if (mime === 'image/png') return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/gif') return ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString('ascii'));
  return bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
}
export async function receiveFiles(request: FastifyRequest, directory: string, saved: SavedFile[], requireFiles = true) {
  let draft: unknown;
  let total = 0;
  await mkdir(directory, { recursive: true, mode: 0o700 });
  for await (const part of request.parts()) {
    if (part.type === 'field') {
      if (part.fieldname !== 'draft' || draft !== undefined || part.valueTruncated || typeof part.value !== 'string') throw new AccountError(400, 'Некорректная записка');
      try { draft = JSON.parse(part.value); } catch { throw new AccountError(400, 'Некорректная записка'); }
      continue;
    }
    if (part.fieldname !== 'files' || saved.length >= maxFiles) throw new AccountError(400, 'Можно прикрепить до 5 файлов');
    const originalName = part.filename.replace(/[\\/\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, '_').trim();
    if (!originalName || originalName.length > 180) throw new AccountError(400, 'Имя файла должно содержать до 180 символов');
    const extension = extname(originalName).toLowerCase();
    const mimeType = images[extension];
    if (!mimeType && !documents.has(extension)) throw new AccountError(400, 'Этот формат файла не поддерживается');
    const id = randomUUID();
    const file: SavedFile = { id, originalName, mimeType: mimeType ?? 'application/octet-stream', sizeBytes: 0, storageKey: id + '.bin', contentHash: '' };
    const hash = createHash('sha256');
    saved.push(file);
    let prefix = Buffer.alloc(0);
    const meter = new Transform({ transform(chunk: Buffer, _encoding, callback) {
      file.sizeBytes += chunk.length; total += chunk.length;
      hash.update(chunk);
      if (prefix.length < 12) prefix = Buffer.concat([prefix, chunk.subarray(0, 12 - prefix.length)]);
      if (total > maxTotalSize || file.sizeBytes > maxFileSize) return callback(new AccountError(413, 'До 10 МБ на файл и до 25 МБ на записку'));
      callback(null, chunk);
    } });
    await pipeline(part.file, meter, createWriteStream(filePath(directory, file.storageKey), { flags: 'wx', mode: 0o600 }));
    if (part.file.truncated) throw new AccountError(413, 'Файл превышает 10 МБ');
    if (mimeType && !imageSignature(mimeType, prefix)) throw new AccountError(400, 'Содержимое изображения не соответствует формату');
    file.contentHash = hash.digest('hex');
    if (saved.some(other => other !== file && other.contentHash === file.contentHash)) throw new AccountError(400, 'Один и тот же файл нельзя прикрепить несколько раз');
  }
  if (draft === undefined || (requireFiles && !saved.length)) throw new AccountError(400, 'Добавьте записку и хотя бы один файл');
  return draft;
}

export async function openFile(directory: string, key: string) {
  const path = filePath(directory, key);
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new AccountError(404, 'Файл недоступен');
    return { stream: createReadStream(path), size: info.size };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') throw new AccountError(404, 'Файл недоступен');
    throw error;
  }
}

export function disposition(name: string, inline: boolean) {
  const encoded = encodeURIComponent(name).replace(/['()*]/g, character => '%' + character.charCodeAt(0).toString(16).toUpperCase());
  return `${inline ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encoded}`;
}
