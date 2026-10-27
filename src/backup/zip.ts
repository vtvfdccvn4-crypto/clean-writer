/**
 * A small ZIP writer and reader with no dependencies. The writer stores entries uncompressed. The reader accepts
 * stored and deflated entries, checks every CRC, and refuses archives it cannot read safely: encrypted or ZIP64
 * archives, unsafe paths, and entries or totals above the limits, so a malicious file cannot exhaust memory.
 */

export interface ZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
  readonly modified?: Date;
}

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export interface ReadZipLimits {
  readonly maxEntries: number;
  readonly maxEntryBytes: number;
  readonly maxTotalBytes: number;
}

export const DEFAULT_ZIP_LIMITS: ReadZipLimits = {
  maxEntries: 50_000,
  maxEntryBytes: 512 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024
};

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const UTF8_FLAG = 0x0800;
const ENCRYPTED_FLAG = 0x0001;
const STORED = 0;
const DEFLATED = 8;
const MAX_UINT32 = 0xffffffff;
const MAX_UINT16 = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) crc = CRC_TABLE[(crc ^ data[index]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A path as stored in an archive, made safe to use: forward slashes only, no leading slash, no drive letter,
 * no empty, `.` or `..` segments, and no NUL. Returns null when the path cannot be used.
 */
export function safeArchivePath(raw: string): string | null {
  const path = raw.replace(/\\/g, '/');
  if (!path || path.startsWith('/') || /^[a-zA-Z]:/.test(path) || path.includes('\0')) return null;
  const segments = path.replace(/\/$/, '').split('/');
  if (segments.some(segment => segment === '' || segment === '.' || segment === '..')) return null;
  return segments.join('/');
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  };
}

/** Builds a ZIP archive with every entry stored uncompressed. */
export function createZip(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
  if (entries.length > MAX_UINT16) throw new ZipError(`A ZIP archive holds at most ${MAX_UINT16} files, and this one has ${entries.length}.`);
  const encoder = new TextEncoder();
  const records = entries.map(entry => {
    const name = encoder.encode(entry.path);
    if (!safeArchivePath(entry.path)) throw new ZipError(`"${entry.path}" is not a valid archive path.`);
    if (entry.data.length > MAX_UINT32) throw new ZipError(`"${entry.path}" is larger than a ZIP archive can hold.`);
    return { entry, name, crc: crc32(entry.data), stamp: dosDateTime(entry.modified ?? now) };
  });

  const localSize = records.reduce((total, record) => total + 30 + record.name.length + record.entry.data.length, 0);
  const centralSize = records.reduce((total, record) => total + 46 + record.name.length, 0);
  if (localSize + centralSize + 22 > MAX_UINT32) throw new ZipError('The archive would be larger than 4 GB, which is not supported.');
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let offset = 0;
  const offsets: number[] = [];

  for (const record of records) {
    offsets.push(offset);
    view.setUint32(offset, LOCAL_HEADER, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, UTF8_FLAG, true);
    view.setUint16(offset + 8, STORED, true);
    view.setUint16(offset + 10, record.stamp.time, true);
    view.setUint16(offset + 12, record.stamp.date, true);
    view.setUint32(offset + 14, record.crc, true);
    view.setUint32(offset + 18, record.entry.data.length, true);
    view.setUint32(offset + 22, record.entry.data.length, true);
    view.setUint16(offset + 26, record.name.length, true);
    view.setUint16(offset + 28, 0, true);
    out.set(record.name, offset + 30);
    out.set(record.entry.data, offset + 30 + record.name.length);
    offset += 30 + record.name.length + record.entry.data.length;
  }

  const centralStart = offset;
  records.forEach((record, index) => {
    view.setUint32(offset, CENTRAL_HEADER, true);
    view.setUint16(offset + 4, 20, true);
    view.setUint16(offset + 6, 20, true);
    view.setUint16(offset + 8, UTF8_FLAG, true);
    view.setUint16(offset + 10, STORED, true);
    view.setUint16(offset + 12, record.stamp.time, true);
    view.setUint16(offset + 14, record.stamp.date, true);
    view.setUint32(offset + 16, record.crc, true);
    view.setUint32(offset + 20, record.entry.data.length, true);
    view.setUint32(offset + 24, record.entry.data.length, true);
    view.setUint16(offset + 28, record.name.length, true);
    view.setUint32(offset + 42, offsets[index]!, true);
    out.set(record.name, offset + 46);
    offset += 46 + record.name.length;
  });

  view.setUint32(offset, END_OF_CENTRAL_DIRECTORY, true);
  view.setUint16(offset + 8, records.length, true);
  view.setUint16(offset + 10, records.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralStart, true);
  return out;
}

async function inflate(data: Uint8Array, declaredSize: number, label: string): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ZipError('This browser cannot read compressed ZIP entries.');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      // The declared size is not trusted: stop as soon as the data runs past it.
      if (total > declaredSize) throw new ZipError(`"${label}" is larger than its archive entry says.`);
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof ZipError) throw error;
    throw new ZipError(`"${label}" could not be decompressed.`);
  }
  const out = new Uint8Array(total);
  let position = 0;
  for (const chunk of chunks) {
    out.set(chunk, position);
    position += chunk.length;
  }
  return out;
}

/** Reads every file in a ZIP archive. Directory entries are skipped. */
export async function readZip(bytes: Uint8Array, limits: ReadZipLimits = DEFAULT_ZIP_LIMITS): Promise<ZipEntry[]> {
  if (bytes.length < 22) throw new ZipError('This is not a ZIP file.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let end = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - MAX_UINT16); offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY) { end = offset; break; }
  }
  if (end < 0) throw new ZipError('This is not a ZIP file, or it is damaged: its directory was not found.');
  const count = view.getUint16(end + 10, true);
  const centralSize = view.getUint32(end + 12, true);
  const centralOffset = view.getUint32(end + 16, true);
  if (count === MAX_UINT16 || centralSize === MAX_UINT32 || centralOffset === MAX_UINT32) throw new ZipError('ZIP64 archives are not supported.');
  if (count > limits.maxEntries) throw new ZipError(`The archive holds ${count} files, more than the ${limits.maxEntries} allowed.`);
  if (centralOffset + centralSize > end) throw new ZipError('The ZIP directory is damaged.');

  const decoder = new TextDecoder('utf-8');
  const entries: ZipEntry[] = [];
  const seen = new Set<string>();
  let total = 0;
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== CENTRAL_HEADER) throw new ZipError('The ZIP directory is damaged.');
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const rawName = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (rawName.endsWith('/')) continue;

    const path = safeArchivePath(rawName);
    if (!path) throw new ZipError(`The archive holds an unsafe path: "${rawName}".`);
    if (seen.has(path)) throw new ZipError(`The archive holds "${path}" more than once.`);
    seen.add(path);
    if (flags & ENCRYPTED_FLAG) throw new ZipError('Encrypted ZIP archives are not supported.');
    if (method !== STORED && method !== DEFLATED) throw new ZipError(`"${path}" uses a compression method that is not supported.`);
    if (size > limits.maxEntryBytes) throw new ZipError(`"${path}" is larger than the ${limits.maxEntryBytes} bytes allowed for one file.`);
    total += size;
    if (total > limits.maxTotalBytes) throw new ZipError('The archive is larger than the total size allowed.');

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_HEADER) throw new ZipError(`"${path}" is damaged: its header is missing.`);
    const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (dataStart + compressedSize > bytes.length) throw new ZipError(`"${path}" is damaged: the archive ends too soon.`);
    const stored = bytes.subarray(dataStart, dataStart + compressedSize);

    const data = method === STORED ? stored.slice() : await inflate(stored, size, path);
    if (data.length !== size) throw new ZipError(`"${path}" is damaged: its size does not match.`);
    if (crc32(data) !== crc) throw new ZipError(`"${path}" is damaged: its checksum does not match.`);
    entries.push({ path, data });
  }
  return entries;
}
