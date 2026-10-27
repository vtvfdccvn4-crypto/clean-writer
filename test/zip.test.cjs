const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createZip;
let readZip;
let crc32;
let safeArchivePath;
let ZipError;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24726 } } });
  ({ createZip, readZip, crc32, safeArchivePath, ZipError } = await server.ssrLoadModule('/src/backup/zip.ts'));
});

after(async () => server?.close());

const bytes = text => new TextEncoder().encode(text);
const FIXED = new Date(2026, 9, 27, 12, 0, 0);

function pythonAvailable() {
  try { execFileSync('python3', ['-c', 'import zipfile']); return true; } catch { return false; }
}

test('the checksum matches the standard CRC-32', () => {
  assert.equal(crc32(bytes('123456789')), 0xcbf43926);
  assert.equal(crc32(new Uint8Array(0)), 0);
});

test('files round-trip with their paths and bytes, including unicode names, empty files and binary data', async () => {
  const binary = Uint8Array.from({ length: 1000 }, (_, index) => (index * 31) % 256);
  const entries = [
    { path: 'sections/Chapter One.md', data: bytes('# Chapter\n\nÇa va – naïve café ✓\n') },
    { path: 'sections/日本語/章.md', data: bytes('こんにちは') },
    { path: 'sections/empty.md', data: new Uint8Array(0) },
    { path: 'images/pic.png', data: binary }
  ];
  const read = await readZip(createZip(entries, FIXED));
  assert.deepEqual(read.map(entry => entry.path), entries.map(entry => entry.path));
  read.forEach((entry, index) => assert.deepEqual(Array.from(entry.data), Array.from(entries[index].data)));
});

test('an archive made here is a valid ZIP for Python, with the same contents', { skip: !pythonAvailable() }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-writer-zip-'));
  try {
    const file = path.join(dir, 'made-here.zip');
    fs.writeFileSync(file, createZip([
      { path: 'a/b.md', data: bytes('hello') },
      { path: 'ünï.md', data: bytes('unicode name') }
    ], FIXED));
    const script = 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nprint("|".join(f"{i.filename}={z.read(i).decode()}" for i in z.infolist()))';
    const output = execFileSync('python3', ['-I', '-c', script, file], { encoding: 'utf8' }).trim();
    assert.equal(output, 'a/b.md=hello|ünï.md=unicode name');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('an archive made by Python with compression and directory entries is read', { skip: !pythonAvailable() }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clear-writer-zip-'));
  try {
    const file = path.join(dir, 'made-by-python.zip');
    const script = 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED)\nz.writestr("sections/",b"")\nz.writestr("sections/one.md","# One\\n"*200)\nz.writestr("settings.json","{}")\nz.close()';
    execFileSync('python3', ['-I', '-c', script, file]);
    const entries = await readZip(new Uint8Array(fs.readFileSync(file)));
    assert.deepEqual(entries.map(entry => entry.path), ['sections/one.md', 'settings.json']);
    assert.equal(new TextDecoder().decode(entries[0].data), '# One\n'.repeat(200));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('unsafe paths are refused', async () => {
  for (const bad of ['../evil.md', 'a/../../evil.md', '/abs.md', 'C:\\windows.md', 'a//b.md', './a.md']) {
    assert.equal(safeArchivePath(bad), null, bad);
  }
  assert.equal(safeArchivePath('sections\\a.md'), 'sections/a.md');
  assert.throws(() => createZip([{ path: '../x.md', data: bytes('x') }]), ZipError);
});

/** Rewrites a stored entry's name in an archive made here, to build a hostile archive. */
function withEntryName(archive, from, to) {
  assert.equal(from.length, to.length);
  const copy = Buffer.from(archive);
  let index = copy.indexOf(Buffer.from(from));
  while (index >= 0) { copy.write(to, index); index = copy.indexOf(Buffer.from(from), index + 1); }
  return new Uint8Array(copy);
}

test('an archive with a path that escapes the project is refused', async () => {
  const hostile = withEntryName(createZip([{ path: 'aa/evil.md', data: bytes('x') }], FIXED), 'aa/evil.md', '../evil.md');
  await assert.rejects(() => readZip(hostile), /unsafe path/);
});

test('an archive that lists the same file twice is refused', async () => {
  const hostile = withEntryName(createZip([{ path: 'a.md', data: bytes('1') }, { path: 'b.md', data: bytes('2') }], FIXED), 'b.md', 'a.md');
  await assert.rejects(() => readZip(hostile), /more than once/);
});

test('a damaged file is refused: bad checksum, truncated archive, and something that is not a ZIP', async () => {
  const archive = createZip([{ path: 'a.md', data: bytes('hello world') }], FIXED);
  const flipped = Uint8Array.from(archive);
  flipped[30 + 'a.md'.length] ^= 0xff;
  await assert.rejects(() => readZip(flipped), /checksum/);
  await assert.rejects(() => readZip(archive.slice(0, archive.length - 30)), ZipError);
  await assert.rejects(() => readZip(bytes('this is plainly not a zip file at all')), /not a ZIP/);
  await assert.rejects(() => readZip(new Uint8Array(5)), /not a ZIP/);
});

test('encrypted and ZIP64 archives are refused', async () => {
  const archive = Uint8Array.from(createZip([{ path: 'a.md', data: bytes('x') }], FIXED));
  const view = new DataView(archive.buffer);
  const centralOffset = view.getUint32(archive.length - 22 + 16, true);
  const encrypted = Uint8Array.from(archive);
  new DataView(encrypted.buffer).setUint16(centralOffset + 8, 0x0801, true);
  await assert.rejects(() => readZip(encrypted), /Encrypted/);
  const zip64 = Uint8Array.from(archive);
  new DataView(zip64.buffer).setUint32(zip64.length - 22 + 16, 0xffffffff, true);
  await assert.rejects(() => readZip(zip64), /ZIP64/);
});

test('limits stop an archive with too many files or too much data', async () => {
  const archive = createZip([{ path: 'a.md', data: bytes('x') }, { path: 'b.md', data: bytes('y') }], FIXED);
  await assert.rejects(() => readZip(archive, { maxEntries: 1, maxEntryBytes: 100, maxTotalBytes: 100 }), /more than the 1 a backup can have/);
  await assert.rejects(() => readZip(createZip([{ path: 'big.md', data: new Uint8Array(50) }], FIXED), { maxEntries: 10, maxEntryBytes: 10, maxTotalBytes: 100 }), /larger than the 10 bytes one file/);
  await assert.rejects(() => readZip(createZip([{ path: 'a.md', data: new Uint8Array(40) }, { path: 'b.md', data: new Uint8Array(40) }], FIXED), { maxEntries: 10, maxEntryBytes: 100, maxTotalBytes: 60 }), /add up to more than the 60 bytes/);
});

test('a compressed entry that expands past its declared size is stopped, not inflated into memory', async () => {
  // A deflate stream of 5,000,000 zeros, stored in an entry that claims to be 10 bytes.
  const payload = zlib.deflateRawSync(Buffer.alloc(5_000_000));
  const base = Buffer.from(createZip([{ path: 'bomb.md', data: bytes('0123456789') }], FIXED));
  const name = Buffer.from('bomb.md');
  const localLength = 30 + name.length;
  const centralStart = base.readUInt32LE(base.length - 22 + 16);
  const local = Buffer.from(base.subarray(0, localLength));
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(payload.length, 18);
  const central = Buffer.from(base.subarray(centralStart, base.length));
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(payload.length, 20);
  const hostile = Buffer.concat([local, payload, central]);
  const newCentralStart = local.length + payload.length;
  hostile.writeUInt32LE(newCentralStart, hostile.length - 22 + 16);
  await assert.rejects(() => readZip(new Uint8Array(hostile)), /larger than its archive entry says/);
});
