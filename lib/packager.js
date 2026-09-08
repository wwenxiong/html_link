const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const AdmZip = require('adm-zip');
const forge = require('node-forge');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const APK_TEMPLATE_PATH = path.join(TEMPLATES_DIR, 'apk', 'template.apk');
const EXE_TEMPLATE_PATH = path.join(TEMPLATES_DIR, 'exe', 'launcher.exe');
const KEYSTORE_FILE = path.join(__dirname, '..', 'data', 'apk_keystore.json');
const RELEASE_KEY_FILE = path.join(__dirname, '..', 'data', 'release.pk8');
const RELEASE_CERT_FILE = path.join(__dirname, '..', 'data', 'release.x509.pem');

let cachedKeystore = null;

/**
 * Check if a command is executable in the current system environment
 */
function hasTool(toolName) {
  try {
    const res = spawnSync(toolName, ['--version'], { stdio: 'ignore' });
    return res.status === 0 || res.status === 1 || res.status === 2;
  } catch (e) {
    return false;
  }
}

/**
 * Get or generate self-signed Android release key & X.509 certificate
 */
function getKeystore() {
  if (cachedKeystore && fs.existsSync(RELEASE_KEY_FILE) && fs.existsSync(RELEASE_CERT_FILE)) {
    return cachedKeystore;
  }

  const pki = forge.pki;
  const dataDir = path.dirname(KEYSTORE_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  try {
    if (fs.existsSync(KEYSTORE_FILE)) {
      const data = JSON.parse(fs.readFileSync(KEYSTORE_FILE, 'utf8'));
      if (data.privateKeyPem && data.certPem) {
        const privateKey = pki.privateKeyFromPem(data.privateKeyPem);
        const cert = pki.certificateFromPem(data.certPem);
        const certDer = Buffer.from(forge.asn1.toDer(pki.certificateToAsn1(cert)).getBytes(), 'binary');
        const publicKeyDer = Buffer.from(forge.asn1.toDer(pki.publicKeyToAsn1(cert.publicKey)).getBytes(), 'binary');

        if (!fs.existsSync(RELEASE_KEY_FILE) || !fs.existsSync(RELEASE_CERT_FILE)) {
          const privateKeyAsn1 = pki.privateKeyToAsn1(privateKey);
          const pkcs8 = pki.wrapRsaPrivateKey(privateKeyAsn1);
          const pk8Der = Buffer.from(forge.asn1.toDer(pkcs8).getBytes(), 'binary');
          fs.writeFileSync(RELEASE_KEY_FILE, pk8Der);
          fs.writeFileSync(RELEASE_CERT_FILE, data.certPem, 'utf8');
        }

        cachedKeystore = {
          privateKey,
          cert,
          privateKeyPem: data.privateKeyPem,
          certPem: data.certPem,
          certDer,
          publicKeyDer,
          keyPk8Path: RELEASE_KEY_FILE,
          certPemPath: RELEASE_CERT_FILE
        };
        return cachedKeystore;
      }
    }
  } catch (e) {
    console.warn('[Packager] Failed to read cached keystore, generating a new one:', e.message);
  }

  // Generate 2048-bit RSA key and X.509 cert valid 30 years
  const keys = pki.rsa.generateKeyPair(2048);
  const cert = pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + Date.now();
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 30);
  const attrs = [
    { name: 'commonName', value: 'WebToApp Application' },
    { name: 'organizationName', value: 'WebToApp Platform' },
    { name: 'countryName', value: 'CN' }
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const privateKeyPem = pki.privateKeyToPem(keys.privateKey);
  const certPem = pki.certificateToPem(cert);
  const certDer = Buffer.from(forge.asn1.toDer(pki.certificateToAsn1(cert)).getBytes(), 'binary');
  const publicKeyDer = Buffer.from(forge.asn1.toDer(pki.publicKeyToAsn1(cert.publicKey)).getBytes(), 'binary');

  try {
    fs.writeFileSync(KEYSTORE_FILE, JSON.stringify({ privateKeyPem, certPem }, null, 2), 'utf8');
    const privateKeyAsn1 = pki.privateKeyToAsn1(keys.privateKey);
    const pkcs8 = pki.wrapRsaPrivateKey(privateKeyAsn1);
    const pk8Der = Buffer.from(forge.asn1.toDer(pkcs8).getBytes(), 'binary');
    fs.writeFileSync(RELEASE_KEY_FILE, pk8Der);
    fs.writeFileSync(RELEASE_CERT_FILE, certPem, 'utf8');
  } catch (e) {
    console.warn('[Packager] Failed to persist keystore to file:', e.message);
  }

  cachedKeystore = {
    privateKey: keys.privateKey,
    cert,
    privateKeyPem,
    certPem,
    certDer,
    publicKeyDer,
    keyPk8Path: RELEASE_KEY_FILE,
    certPemPath: RELEASE_CERT_FILE
  };
  return cachedKeystore;
}

/**
 * Updates application label string in resources.arsc
 * Dynamically finds the 'My WebView' entry in the global string pool,
 * replaces it with appName, pads to 4-byte boundary, and adjusts offsets.
 * @param {Buffer} buf
 * @param {string} newName
 * @returns {Buffer}
 */
function updateAppNameInArsc(buf, newName) {
  if (!newName || typeof newName !== 'string') return buf;

  const spOffset = 12;
  if (buf.length < spOffset + 28) return buf;
  const spType = buf.readUInt16LE(spOffset);
  if (spType !== 1) return buf; // 0x0001 = RES_STRING_POOL_TYPE

  const spChunkSize = buf.readUInt32LE(spOffset + 4);
  const stringCount = buf.readUInt32LE(spOffset + 8);
  const flags = buf.readUInt32LE(spOffset + 16);
  const isUtf8 = (flags & (1 << 8)) !== 0;
  const stringsStart = buf.readUInt32LE(spOffset + 20);
  if (!isUtf8) return buf;

  let targetIndex = -1;
  let targetOffset = -1;
  let oldEntryLen = 0;

  for (let i = 0; i < stringCount; i++) {
    const off = buf.readUInt32LE(spOffset + 28 + i * 4);
    const strPos = spOffset + stringsStart + off;
    let p = strPos;
    let charLen = buf[p++];
    if (charLen & 0x80) charLen = ((charLen & 0x7f) << 8) | buf[p++];
    let byteLen = buf[p++];
    if (byteLen & 0x80) byteLen = ((byteLen & 0x7f) << 8) | buf[p++];
    const str = buf.toString('utf8', p, p + byteLen);
    if (str === 'My WebView') {
      targetIndex = i;
      targetOffset = off;
      oldEntryLen = (p + byteLen + 1) - strPos;
      break;
    }
  }

  if (targetIndex === -1) return buf;

  const utf8Bytes = Buffer.from(newName, 'utf8');
  const u16Len = newName.length;

  function encodeLength(len) {
    if (len > 0x7f) {
      return Buffer.from([((len >> 8) & 0x7f) | 0x80, len & 0xff]);
    }
    return Buffer.from([len]);
  }

  const charLenBuf = encodeLength(u16Len);
  const byteLenBuf = encodeLength(utf8Bytes.length);
  const rawNewEntry = Buffer.concat([charLenBuf, byteLenBuf, utf8Bytes, Buffer.from([0x00])]);

  // Maintain 4-byte integer boundary alignment for resources.arsc chunks
  const rawDelta = rawNewEntry.length - oldEntryLen;
  const pad = (4 - ((rawDelta % 4) + 4) % 4) % 4;
  const newEntry = pad > 0 ? Buffer.concat([rawNewEntry, Buffer.alloc(pad, 0)]) : rawNewEntry;
  const delta = newEntry.length - oldEntryLen;

  const entryStartPos = spOffset + stringsStart + targetOffset;
  const entryEndPos = entryStartPos + oldEntryLen;

  const beforeEntry = buf.subarray(0, entryStartPos);
  const afterEntry = buf.subarray(entryEndPos);
  const newBuf = Buffer.concat([beforeEntry, newEntry, afterEntry]);

  // Adjust string offsets for subsequent entries
  for (let i = targetIndex + 1; i < stringCount; i++) {
    const curOff = newBuf.readUInt32LE(spOffset + 28 + i * 4);
    newBuf.writeUInt32LE(curOff + delta, spOffset + 28 + i * 4);
  }

  // Adjust string pool chunk size & table total size
  newBuf.writeUInt32LE(spChunkSize + delta, spOffset + 4);
  const totalSize = newBuf.readUInt32LE(4);
  newBuf.writeUInt32LE(totalSize + delta, 4);

  return newBuf;
}

/**
 * Normalizes user web files from upload (single HTML, ZIP, or raw code)
 * @returns {Array<{ path: string, buffer: Buffer }>}
 */
function normalizeWebFiles({ file, htmlCode, siteFiles }) {
  if (Array.isArray(siteFiles) && siteFiles.length > 0) {
    return siteFiles;
  }

  // 1. Raw HTML Code
  if (htmlCode && typeof htmlCode === 'string' && htmlCode.trim()) {
    return [{ path: 'index.html', buffer: Buffer.from(htmlCode, 'utf-8') }];
  }

  // 2. Uploaded File
  if (file && file.buffer) {
    const originalName = (file.originalname || '').toLowerCase();

    // 2a. Single HTML file
    if (originalName.endsWith('.html') || originalName.endsWith('.htm')) {
      return [{ path: 'index.html', buffer: file.buffer }];
    }

    // 2b. ZIP file
    if (originalName.endsWith('.zip') || file.mimetype === 'application/zip') {
      const zip = new AdmZip(file.buffer);
      const entries = zip.getEntries();
      const files = [];

      // Check if all files are inside a common root directory (e.g. dist/ or my-app/)
      let prefixToRemove = '';
      const nonDirEntries = entries.filter(e => !e.isDirectory && !e.entryName.startsWith('__MACOSX') && !e.entryName.endsWith('.DS_Store'));
      
      const hasRootIndex = nonDirEntries.some(e => e.entryName.toLowerCase() === 'index.html');
      if (!hasRootIndex && nonDirEntries.length > 0) {
        for (const entry of nonDirEntries) {
          const parts = entry.entryName.split('/');
          if (parts.length > 1 && parts[parts.length - 1].toLowerCase() === 'index.html') {
            prefixToRemove = parts.slice(0, parts.length - 1).join('/') + '/';
            break;
          }
        }
      }

      for (const entry of entries) {
        if (entry.isDirectory) continue;
        let entryName = entry.entryName.replace(/\\/g, '/');
        if (entryName.startsWith('__MACOSX/') || entryName.endsWith('.DS_Store')) continue;

        if (prefixToRemove && entryName.startsWith(prefixToRemove)) {
          entryName = entryName.substring(prefixToRemove.length);
        }

        if (entryName) {
          files.push({
            path: entryName,
            buffer: entry.getData()
          });
        }
      }

      const hasIndex = files.some(f => f.path.toLowerCase() === 'index.html');
      if (!hasIndex) {
        const htmlFiles = files.filter(f => f.path.toLowerCase().endsWith('.html'));
        if (htmlFiles.length === 1) {
          htmlFiles[0].path = 'index.html';
        } else {
          throw new Error('ZIP 压缩包内未找到主入口 index.html，请确保压缩包根目录下包含 index.html');
        }
      }

      return files;
    }
  }

  throw new Error('请提供有效的 HTML 代码、HTML 文件或包含 index.html 的 ZIP 压缩包');
}

/**
 * Builds and signs an Android APK
 * @param {Object} options
 * @param {Array<{ path: string, buffer: Buffer }>} options.files
 * @param {string} [options.appName]
 * @param {string} [options.appUrl]
 * @returns {Buffer}
 */
function buildApk({ files, appName = '网页应用', appUrl = '' }) {
  if (!fs.existsSync(APK_TEMPLATE_PATH)) {
    throw new Error('APK 模板文件缺失，请检查服务端 templates/apk/template.apk');
  }

  const templateBuffer = fs.readFileSync(APK_TEMPLATE_PATH);
  const zip = new AdmZip(templateBuffer);

  // 1. Remove all existing META-INF files to ensure a clean package
  const entries = zip.getEntries();
  entries.forEach(entry => {
    if (entry.entryName.startsWith('META-INF/')) {
      zip.deleteFile(entry.entryName);
    }
  });

  // 2. Remove default web assets and inject new files
  entries.forEach(entry => {
    if (entry.entryName.startsWith('assets/web/')) {
      zip.deleteFile(entry.entryName);
    }
  });

  for (const f of files) {
    const cleanPath = f.path.replace(/^\/+/, '');
    zip.addFile(`assets/web/${cleanPath}`, f.buffer);
  }

  // 3. Update assets/settings.json
  try {
    const settingsEntry = zip.getEntry('assets/settings.json');
    let settings = {};
    if (settingsEntry) {
      settings = JSON.parse(settingsEntry.getData().toString('utf8'));
    }
    settings.title = appName;
    if (appUrl) {
      settings.sites = [{ url: appUrl, title: appName }];
    }
    settings.timestamp = new Date().toISOString();
    zip.addFile('assets/settings.json', Buffer.from(JSON.stringify(settings, null, 2), 'utf8'));
  } catch (e) {
    console.warn('[Packager] Could not update settings.json:', e.message);
  }

  // 4. Update application name in resources.arsc
  const arscEntry = zip.getEntry('resources.arsc');
  if (arscEntry) {
    try {
      const origArsc = arscEntry.getData();
      const updatedArsc = updateAppNameInArsc(origArsc, appName);
      zip.deleteFile('resources.arsc');
      zip.addFile('resources.arsc', updatedArsc);
    } catch (e) {
      console.warn('[Packager] Could not update appName in resources.arsc:', e.message);
    }
  }

  const keystore = getKeystore();
  const canUseOfficialTools = hasTool('zipalign') && hasTool('apksigner');

  // 5. Official build pipeline (Production / Server environment)
  if (canUseOfficialTools) {
    const tmpPrefix = path.join(os.tmpdir(), `wtapp_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const rawApkPath = `${tmpPrefix}_raw.apk`;
    const alignedApkPath = `${tmpPrefix}_aligned.apk`;

    try {
      fs.writeFileSync(rawApkPath, zip.toBuffer());

      // 5a. 4-byte zipalign
      const alignRes = spawnSync('zipalign', ['-p', '-f', '4', rawApkPath, alignedApkPath], {
        encoding: 'utf8'
      });
      if (alignRes.status !== 0) {
        throw new Error(`zipalign failed: ${alignRes.stderr || alignRes.stdout}`);
      }

      // 5b. apksigner sign (automatically signs v1 + v2 + v3 schemes)
      const signRes = spawnSync('apksigner', [
        'sign',
        '--key', keystore.keyPk8Path,
        '--cert', keystore.certPemPath,
        alignedApkPath
      ], {
        encoding: 'utf8'
      });
      if (signRes.status !== 0) {
        throw new Error(`apksigner sign failed: ${signRes.stderr || signRes.stdout}`);
      }

      return fs.readFileSync(alignedApkPath);
    } finally {
      try { if (fs.existsSync(rawApkPath)) fs.unlinkSync(rawApkPath); } catch (_) {}
      try { if (fs.existsSync(alignedApkPath)) fs.unlinkSync(alignedApkPath); } catch (_) {}
    }
  }

  // 6. Fallback pipeline (Local dev without official Android SDK tools)
  let manifest = 'Manifest-Version: 1.0\r\nCreated-By: 1.0 (WebToApp)\r\n\r\n';
  const manifestEntries = {};

  zip.getEntries().forEach(entry => {
    if (entry.isDirectory || entry.entryName.startsWith('META-INF/')) return;
    const data = entry.getData();
    const sha1 = crypto.createHash('sha1').update(data).digest('base64');
    const entryBlock = `Name: ${entry.entryName}\r\nSHA1-Digest: ${sha1}\r\n\r\n`;
    manifest += entryBlock;
    manifestEntries[entry.entryName] = entryBlock;
  });

  const manifestBuffer = Buffer.from(manifest, 'utf-8');
  zip.addFile('META-INF/MANIFEST.MF', manifestBuffer);

  const manifestSha1 = crypto.createHash('sha1').update(manifestBuffer).digest('base64');
  let signatureFile = `Signature-Version: 1.0\r\nCreated-By: 1.0 (WebToApp)\r\nSHA1-Digest-Manifest: ${manifestSha1}\r\n\r\n`;

  for (const [name, block] of Object.entries(manifestEntries)) {
    const blockSha1 = crypto.createHash('sha1').update(Buffer.from(block, 'utf-8')).digest('base64');
    signatureFile += `Name: ${name}\r\nSHA1-Digest: ${blockSha1}\r\n\r\n`;
  }

  const signatureFileBuffer = Buffer.from(signatureFile, 'utf-8');
  zip.addFile('META-INF/CERT.SF', signatureFileBuffer);

  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(signatureFile, 'utf8');
  p7.addCertificate(keystore.cert);
  p7.addSigner({
    key: keystore.privateKey,
    certificate: keystore.cert,
    digestAlgorithm: forge.pki.oids.sha1,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() }
    ]
  });
  p7.sign({ detached: true });
  const rsaDer = forge.asn1.toDer(p7.toAsn1()).getBytes();
  const rsaBuffer = Buffer.from(rsaDer, 'binary');
  zip.addFile('META-INF/CERT.RSA', rsaBuffer);

  const rawApkBuffer = zip.toBuffer();
  const alignedApkBuffer = zipalign(rawApkBuffer);
  return alignedApkBuffer;
}

function u32le(val) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(val, 0);
  return buf;
}

function u64le(val) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(val), 0);
  return buf;
}

function lenPrefix(buf) {
  return Buffer.concat([u32le(buf.length), buf]);
}

/**
 * 4-byte zipalign implementation for stored (uncompressed) entries
 * @param {Buffer} zipBuffer
 * @param {number} [alignment=4]
 * @returns {Buffer}
 */
function zipalign(zipBuffer, alignment = 4) {
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error('EOCD not found in ZIP buffer');
  }

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdSize = zipBuffer.readUInt32LE(eocdOffset + 12);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  const cdEntries = [];
  let cdPos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (zipBuffer.readUInt32LE(cdPos) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory header signature at ${cdPos}`);
    }
    const method = zipBuffer.readUInt16LE(cdPos + 10);
    const compSize = zipBuffer.readUInt32LE(cdPos + 20);
    const uncompSize = zipBuffer.readUInt32LE(cdPos + 24);
    const fnLen = zipBuffer.readUInt16LE(cdPos + 28);
    const extraLen = zipBuffer.readUInt16LE(cdPos + 30);
    const commentLen = zipBuffer.readUInt16LE(cdPos + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cdPos + 42);
    const fn = zipBuffer.toString('utf8', cdPos + 46, cdPos + 46 + fnLen);

    const fullCdEntryLen = 46 + fnLen + extraLen + commentLen;
    const cdEntryBuffer = zipBuffer.slice(cdPos, cdPos + fullCdEntryLen);

    cdEntries.push({
      fileName: fn,
      method,
      compSize,
      uncompSize,
      fnLen,
      localHeaderOffset,
      cdEntryBuffer
    });

    cdPos += fullCdEntryLen;
  }

  cdEntries.sort((a, b) => a.localHeaderOffset - b.localHeaderOffset);

  const newLocalChunks = [];
  let currentOffset = 0;

  for (const entry of cdEntries) {
    const origLocalOffset = entry.localHeaderOffset;
    if (zipBuffer.readUInt32LE(origLocalOffset) !== 0x04034b50) {
      throw new Error(`Invalid Local File Header signature at ${origLocalOffset}`);
    }

    const origFnLen = zipBuffer.readUInt16LE(origLocalOffset + 26);
    const origExtraLen = zipBuffer.readUInt16LE(origLocalOffset + 28);
    const origDataOffset = origLocalOffset + 30 + origFnLen + origExtraLen;
    const fileData = zipBuffer.slice(origDataOffset, origDataOffset + entry.compSize);

    entry.newLocalHeaderOffset = currentOffset;

    let newExtraBuffer = Buffer.alloc(0);
    if (entry.method === 0) {
      const alignTo = entry.fileName.endsWith('.so') ? 4096 : alignment;
      const expectedDataOffset = currentOffset + 30 + origFnLen;
      const remainder = expectedDataOffset % alignTo;
      if (remainder !== 0) {
        const padding = alignTo - remainder;
        newExtraBuffer = Buffer.alloc(padding, 0);
      }
    }

    const newLocalHeader = Buffer.from(zipBuffer.slice(origLocalOffset, origLocalOffset + 30 + origFnLen));
    newLocalHeader.writeUInt16LE(newExtraBuffer.length, 28);

    newLocalChunks.push(newLocalHeader);
    if (newExtraBuffer.length > 0) {
      newLocalChunks.push(newExtraBuffer);
    }
    newLocalChunks.push(fileData);

    currentOffset += newLocalHeader.length + newExtraBuffer.length + fileData.length;
  }

  const newCdOffset = currentOffset;
  const newCdChunks = [];

  for (const entry of cdEntries) {
    const newCdEntry = Buffer.from(entry.cdEntryBuffer);
    newCdEntry.writeUInt32LE(entry.newLocalHeaderOffset, 42);
    newCdChunks.push(newCdEntry);
    currentOffset += newCdEntry.length;
  }

  const newCdSize = currentOffset - newCdOffset;

  const newEocd = Buffer.from(zipBuffer.slice(eocdOffset, eocdOffset + 22));
  newEocd.writeUInt32LE(newCdSize, 12);
  newEocd.writeUInt32LE(newCdOffset, 16);

  return Buffer.concat([...newLocalChunks, ...newCdChunks, newEocd]);
}

/**
 * Signs an aligned APK buffer with APK Signature Scheme v2
 * @param {Buffer} zipBuffer - Aligned ZIP buffer with v1 signature already inside
 * @param {Object} keystore - { certDer, privateKeyPem, publicKeyDer }
 * @returns {Buffer}
 */
function signApkV2(zipBuffer, keystore) {
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 65557); i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('EOCD not found');

  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const cdSize = zipBuffer.readUInt32LE(eocdOffset + 12);

  const section1 = zipBuffer.slice(0, cdOffset);
  const section2 = zipBuffer.slice(cdOffset, cdOffset + cdSize);
  const origEocd = zipBuffer.slice(eocdOffset);

  function buildSignerBlock(finalCdOffset) {
    const eocdForDigest = Buffer.from(origEocd);
    eocdForDigest.writeUInt32LE(finalCdOffset, 16);

    const sections = [section1, section2, eocdForDigest];
    const chunkDigests = [];
    const CHUNK_SIZE = 1048576; // 1MB

    for (const sec of sections) {
      for (let offset = 0; offset < sec.length; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, sec.length);
        const chunk = sec.slice(offset, end);
        const h = crypto.createHash('sha256')
          .update(Buffer.from([0x5a]))
          .update(u32le(chunk.length))
          .update(chunk)
          .digest();
        chunkDigests.push(h);
      }
    }

    const totalChunks = chunkDigests.length;
    const topLevelDigest = crypto.createHash('sha256')
      .update(Buffer.from([0x5a]))
      .update(u32le(totalChunks))
      .update(Buffer.concat(chunkDigests))
      .digest();

    const algId = u32le(0x0103); // SIGNATURE_RSA_PKCS1_V1_5_WITH_SHA256
    const digestEntry = lenPrefix(Buffer.concat([algId, lenPrefix(topLevelDigest)]));
    const digestsSeq = lenPrefix(digestEntry);

    const certEntry = lenPrefix(keystore.certDer);
    const certsSeq = lenPrefix(certEntry);

    const additionalAttrs = u32le(0);

    const signedData = Buffer.concat([digestsSeq, certsSeq, additionalAttrs]);

    const signatureBytes = crypto.sign('RSA-SHA256', signedData, keystore.privateKeyPem);
    const signatureEntry = lenPrefix(Buffer.concat([algId, lenPrefix(signatureBytes)]));
    const signaturesSeq = lenPrefix(signatureEntry);

    const publicKeyBytes = lenPrefix(keystore.publicKeyDer);

    const signer = lenPrefix(Buffer.concat([
      lenPrefix(signedData),
      signaturesSeq,
      publicKeyBytes
    ]));

    const signers = lenPrefix(signer);

    const v2PairId = u32le(0x7109871a);
    const pairValue = signers;
    const pairLength = u64le(4 + pairValue.length);
    const pair = Buffer.concat([pairLength, v2PairId, pairValue]);

    return pair;
  }

  const dummyPair = buildSignerBlock(cdOffset + 1000);
  const blockContent = dummyPair;
  const blockSize = 8 + blockContent.length + 8 + 16;
  const finalCdOffset = cdOffset + blockSize;

  const realPair = buildSignerBlock(finalCdOffset);
  const realBlockContent = realPair;
  const realBlockSize = 8 + realBlockContent.length + 8 + 16;

  const magic = Buffer.from('APK Sig Block 42', 'ascii');
  const signingBlock = Buffer.concat([
    u64le(realBlockSize - 8),
    realBlockContent,
    u64le(realBlockSize - 8),
    magic
  ]);

  const newEocd = Buffer.from(origEocd);
  newEocd.writeUInt32LE(finalCdOffset, 16);

  return Buffer.concat([section1, signingBlock, section2, newEocd]);
}

/**
 * Builds a Windows EXE (defaults to standalone single executable, or portable ZIP if requested)
 * @param {Object} options
 * @param {Array<{ path: string, buffer: Buffer }>} options.files
 * @param {string} [options.appName]
 * @param {string} [options.appUrl]
 * @param {'exe'|'zip'} [options.format]
 * @returns {Buffer}
 */
function buildExe({ files, appName = '网页桌面应用', appUrl = '', format = 'exe' }) {
  if (!fs.existsSync(EXE_TEMPLATE_PATH)) {
    throw new Error('EXE 模板启动器缺失，请检查服务端 templates/exe/launcher.exe');
  }

  const launcherBuffer = fs.readFileSync(EXE_TEMPLATE_PATH);
  const safeAppName = (appName || 'WebSiteApp').replace(/[\\/:*?"<>|]/g, '_').trim() || 'WebSiteApp';

  const appConfig = {
    title: appName,
    url: appUrl || null,
    width: 1280,
    height: 800,
    generatedAt: new Date().toISOString()
  };

  // 1. Build payload ZIP containing app config and web assets
  const payloadZip = new AdmZip();
  payloadZip.addFile('app.json', Buffer.from(JSON.stringify(appConfig, null, 2), 'utf8'));
  if (Array.isArray(files)) {
    for (const f of files) {
      const cleanPath = f.path.replace(/^\/+/, '');
      payloadZip.addFile(`web/${cleanPath}`, f.buffer);
    }
  }

  // 2. Standalone Single EXE (Default)
  if (format === 'exe') {
    const zipBuf = payloadZip.toBuffer();

    // Find EOCD (End of Central Directory Record)
    let eocdOffset = -1;
    for (let i = zipBuf.length - 22; i >= Math.max(0, zipBuf.length - 65557); i--) {
      if (zipBuf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      return Buffer.concat([launcherBuffer, zipBuf]);
    }

    const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
    const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
    const exeSize = launcherBuffer.length;

    // Adjust Central Directory entry localHeaderOffsets for SFX compatibility
    const sfxZipBuf = Buffer.from(zipBuf);
    let cdPos = cdOffset;
    for (let i = 0; i < totalEntries; i++) {
      if (cdPos + 46 > sfxZipBuf.length || sfxZipBuf.readUInt32LE(cdPos) !== 0x02014b50) {
        break;
      }
      const origLocalOffset = sfxZipBuf.readUInt32LE(cdPos + 42);
      sfxZipBuf.writeUInt32LE(origLocalOffset + exeSize, cdPos + 42);

      const fnLen = sfxZipBuf.readUInt16LE(cdPos + 28);
      const extraLen = sfxZipBuf.readUInt16LE(cdPos + 30);
      const commentLen = sfxZipBuf.readUInt16LE(cdPos + 32);
      cdPos += 46 + fnLen + extraLen + commentLen;
    }

    // Adjust EOCD cdOffset
    sfxZipBuf.writeUInt32LE(cdOffset + exeSize, eocdOffset + 16);

    return Buffer.concat([launcherBuffer, sfxZipBuf]);
  }

  // 3. Fallback: Portable ZIP archive
  const outZip = new AdmZip();
  outZip.addFile(`${safeAppName}.exe`, launcherBuffer);
  outZip.addFile('app.json', Buffer.from(JSON.stringify(appConfig, null, 2), 'utf8'));
  if (Array.isArray(files)) {
    for (const f of files) {
      const cleanPath = f.path.replace(/^\/+/, '');
      outZip.addFile(`web/${cleanPath}`, f.buffer);
    }
  }
  const readmeContent = `=====================================================
${appName} - Windows 桌面客户端
=====================================================

【使用说明】
1. 解压本压缩包到任意文件夹；
2. 双击运行「${safeAppName}.exe」即可启动桌面应用；
3. 本应用基于系统原生极速渲染引擎（WebView2/Edge），无需额外安装环境，纯净安全。

祝您使用愉快！
=====================================================`;
  outZip.addFile('使用说明.txt', Buffer.from(readmeContent, 'utf-8'));

  return outZip.toBuffer();
}

module.exports = {
  getKeystore,
  normalizeWebFiles,
  zipalign,
  signApkV2,
  buildApk,
  buildExe
};