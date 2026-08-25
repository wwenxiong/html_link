require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const AdmZip = require('adm-zip');
const mime = require('mime-types');
const crypto = require('crypto');
const uuidv4 = () => crypto.randomUUID();
const { S3Client, PutObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const { clerkMiddleware, getAuth, clerkClient, verifyToken } = require('@clerk/express');
let zhCN = {};
try {
  const localizations = require('@clerk/localizations');
  zhCN = localizations.zhCN || {};
} catch (e) {
  console.warn('Could not load @clerk/localizations:', e.message);
}

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin888';

// ==================== Data Storage (SQLite / Database-backed) ====================
const db = require('./lib/db');
const LOCAL_SITES_DIR = path.join(__dirname, 'public', '_sites');

// Ensure storage directories exist
if (!fs.existsSync(LOCAL_SITES_DIR)) fs.mkdirSync(LOCAL_SITES_DIR, { recursive: true });

const ENV_FILE = path.join(__dirname, '.env');

// Synchronize updates to .env file
function updateEnvFile(updates = {}) {
  try {
    let envContent = '';
    if (fs.existsSync(ENV_FILE)) {
      envContent = fs.readFileSync(ENV_FILE, 'utf-8');
    }

    let lines = envContent.split(/\r?\n/);
    const keysHandled = new Set();

    lines = lines.map(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        return line;
      }
      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        if (updates.hasOwnProperty(key)) {
          keysHandled.add(key);
          return `${key}=${updates[key]}`;
        }
      }
      return line;
    });

    for (const [k, v] of Object.entries(updates)) {
      if (!keysHandled.has(k)) {
        lines.push(`${k}=${v}`);
      }
    }

    fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf-8');
  } catch (err) {
    console.error('Error writing .env file:', err.message);
  }
}

// Domain Configuration Helper
const RESERVED_SUBDOMAINS = ['www', 'admin', 'api', 'app', 'static', 'public', 'assets', 'cdn', 'mail', 'blog', 'shop', 'dashboard', 'sites'];

function getDomainConfig() {
  const config = db.config.getAll();
  const primaryDomain = (config.primaryDomain || process.env.PRIMARY_DOMAIN || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const useHttps = config.useHttps !== undefined ? Boolean(config.useHttps) : (process.env.USE_HTTPS !== 'false');
  return { primaryDomain, useHttps };
}

// Clerk Authentication Helper
function getClerkConfig() {
  const config = db.config.getAll();
  const publishableKey = (config.clerkPublishableKey || process.env.CLERK_PUBLISHABLE_KEY || '').trim();
  const secretKey = (config.clerkSecretKey || process.env.CLERK_SECRET_KEY || '').trim();
  if (publishableKey && !process.env.CLERK_PUBLISHABLE_KEY) {
    process.env.CLERK_PUBLISHABLE_KEY = publishableKey;
  }
  if (secretKey && !process.env.CLERK_SECRET_KEY) {
    process.env.CLERK_SECRET_KEY = secretKey;
  }
  return { publishableKey, secretKey };
}

function isClerkConfigured() {
  const { publishableKey, secretKey } = getClerkConfig();
  return Boolean(
    publishableKey &&
    (publishableKey.startsWith('pk_test_') || publishableKey.startsWith('pk_live_')) &&
    secretKey &&
    (secretKey.startsWith('sk_test_') || secretKey.startsWith('sk_live_'))
  );
}

// CDKEY Acquisition / Purchase Channel Helper
function getCdkeyBuyConfig() {
  const config = db.config.getAll();
  const cdkeyBuyUrl = (config.cdkeyBuyUrl !== undefined ? config.cdkeyBuyUrl : (process.env.CDKEY_BUY_URL || '')).trim();
  const cdkeyBuyText = (config.cdkeyBuyText !== undefined ? config.cdkeyBuyText : (process.env.CDKEY_BUY_TEXT || '获取卡密')).trim();
  return { cdkeyBuyUrl, cdkeyBuyText };
}

// Announcements Configuration Helper
function getAnnouncementsConfig() {
  const raw = db.config.get('announcements_config', null);
  if (!raw || typeof raw !== 'object') {
    return {
      enabled: true,
      updatedAt: '2026-01-01T00:00:00.000Z',
      autoPlay: true,
      interval: 6000,
      items: [
        {
          id: 'welcome_notice',
          tag: '平台动态',
          tagColor: 'blue',
          title: '🎉 欢迎使用 HTML 网页秒转在线链接',
          content: '本平台支持将 HTML 文件、ZIP 压缩包或网页源码一键秒转为公网在线访问链接。\n支持二级域名个性化分配、全球 CDN 加速与卡密时长管理！',
          link: '',
          linkText: ''
        }
      ]
    };
  }
  return {
    enabled: raw.enabled !== undefined ? Boolean(raw.enabled) : true,
    updatedAt: raw.updatedAt || new Date().toISOString(),
    autoPlay: raw.autoPlay !== undefined ? Boolean(raw.autoPlay) : true,
    interval: Math.max(parseInt(raw.interval, 10) || 6000, 2000),
    items: Array.isArray(raw.items) ? raw.items : []
  };
}


async function safeGetAuth(req) {
  try {
    if (!isClerkConfigured()) return { userId: null, sessionId: null };
    
    // 1. Try standard Clerk getAuth
    try {
      const auth = getAuth(req);
      if (auth && auth.userId) return auth;
    } catch (gErr) {}

    // 2. Fast JWT decode from Authorization: Bearer <token>
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      const parts = token.split('.');
      if (parts.length === 3) {
        try {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
          if (payload && payload.sub) {
            return { userId: payload.sub, sessionId: payload.sid || null };
          }
        } catch (pErr) {}
      }
    }

    return { userId: null };
  } catch (e) {
    return { userId: null };
  }
}

function buildSiteUrl(subdomainOrPath, siteId) {
  const { primaryDomain, useHttps } = getDomainConfig();
  const protocol = useHttps ? 'https' : 'http';
  const sub = subdomainOrPath || siteId;

  if (primaryDomain) {
    return `${protocol}://${sub}.${primaryDomain}`;
  } else if (isR2Configured()) {
    const cfg = getR2Config();
    const publicDomain = cfg.publicDomain.replace(/\/+$/, '');
    return `${publicDomain}/sites/${siteId}/index.html`;
  } else {
    return `/_sites/sites/${siteId}/index.html`;
  }
}

// ==================== Expiration Helpers ====================
function calculateExpiresAt(duration, startDate = new Date()) {
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  if (isNaN(start.getTime())) return null;

  if (duration === '3d') {
    return new Date(start.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  } else if (duration === '1m' || duration === '30d') {
    return new Date(start.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  } else if (duration === '6m' || duration === '180d') {
    return new Date(start.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString();
  } else if (duration === '1y' || duration === '365d') {
    return new Date(start.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();
  } else if (duration === '1d') {
    return new Date(start.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString();
  } else if (duration === '7d') {
    return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  } else if (duration === '3m' || duration === '90d') {
    return new Date(start.getTime() + 90 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null; // 'forever', 'unlimited' or unspecified
}

function isExpired(expiresAt) {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function getSiteEffectiveExpiration(site) {
  if (!site) return { expiresAt: null, duration: '1m', isExpired: false };
  const expiresAt = site.expiresAt || null;
  const duration = site.duration || '1m';

  return {
    expiresAt,
    duration,
    isExpired: isExpired(expiresAt)
  };
}

function renderExpiredPage(subdomain, primaryDomain, expiresAt) {
  const domainText = subdomain ? (primaryDomain ? `${subdomain}.${primaryDomain}` : subdomain) : '';
  return `
    <!DOCTYPE html>
    <html lang="zh-CN">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>410 - 网页链接已到期失效</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { text-align: center; padding: 40px; background: rgba(30, 41, 59, 0.85); border: 1px solid rgba(244, 63, 94, 0.35); border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); max-width: 440px; width: 90%; }
        h1 { font-size: 48px; margin: 0; color: #f43f5e; line-height: 1.2; }
        h2 { font-size: 20px; margin: 12px 0 16px; font-weight: 600; color: #f8fafc; }
        p { color: #94a3b8; font-size: 14px; margin-bottom: 8px; word-break: break-all; line-height: 1.6; }
        .time { font-size: 13px; color: #f43f5e; background: rgba(244, 63, 94, 0.1); padding: 8px 12px; border-radius: 8px; margin-top: 16px; display: inline-block; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>⚠️ 链接已到期</h1>
        <h2>该网页链接托管有效期限届满</h2>
        ${domainText ? `<p>访问域名: <strong>${domainText}</strong></p>` : ''}
        <p>该网页所绑定的服务卡密有效期已结束，网页访问通道已自动关闭。</p>
        ${expiresAt ? `<div class="time">📅 失效时间: ${new Date(expiresAt).toLocaleString('zh-CN')}</div>` : ''}
      </div>
    </body>
    </html>
  `;
}

// ==================== Middleware ====================
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Cached Clerk Middleware instance to avoid creating new SDK instances on every HTTP request (major CPU & GC killer)
let cachedClerkMiddleware = null;
let lastClerkPubKey = null;
let lastClerkSecKey = null;

function getCachedClerkMiddleware() {
  if (!isClerkConfigured()) return null;
  const { publishableKey, secretKey } = getClerkConfig();
  if (!publishableKey || !secretKey) return null;
  if (!cachedClerkMiddleware || lastClerkPubKey !== publishableKey || lastClerkSecKey !== secretKey) {
    cachedClerkMiddleware = clerkMiddleware({ publishableKey, secretKey });
    lastClerkPubKey = publishableKey;
    lastClerkSecKey = secretKey;
  }
  return cachedClerkMiddleware;
}

// Safe Clerk Middleware: only run on dynamic routes, skip static assets for high throughput
app.use((req, res, next) => {
  const p = req.path;
  if (
    p.startsWith('/css/') ||
    p.startsWith('/js/') ||
    p.startsWith('/_sites/') ||
    p.startsWith('/favicon') ||
    p.endsWith('.css') ||
    p.endsWith('.js') ||
    p.endsWith('.svg') ||
    p.endsWith('.png') ||
    p.endsWith('.ico') ||
    p.endsWith('.jpg') ||
    p.endsWith('.woff2')
  ) {
    return next();
  }

  const mw = getCachedClerkMiddleware();
  if (mw) {
    try {
      return Promise.resolve(mw(req, res, next)).catch(err => {
        console.warn('Clerk auth middleware async warning:', err.message);
        next();
      });
    } catch (err) {
      console.warn('Clerk auth middleware warning:', err.message);
      return next();
    }
  }
  next();
});

// Multer config for file uploads (max 20MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }
});

// ==================== Subdomain Dynamic Router ====================
app.use((req, res, next) => {
  // Fast pass for /api routes and static assets
  if (
    req.path.startsWith('/api') ||
    req.path.startsWith('/css/') ||
    req.path.startsWith('/js/') ||
    req.path.startsWith('/_sites/') ||
    req.path === '/favicon.ico'
  ) {
    return next();
  }

  const hostHeader = (req.headers.host || '').split(':')[0].toLowerCase();
  const { primaryDomain } = getDomainConfig();

  // If no primary domain configured or if host is main domain / reserved API, pass through
  if (!primaryDomain || hostHeader === primaryDomain || hostHeader === `www.${primaryDomain}` || hostHeader.startsWith('admin.') || hostHeader.startsWith('api.')) {
    return next();
  }

  const suffix = `.${primaryDomain}`;
  if (!hostHeader.endsWith(suffix)) {
    return next();
  }

  const subdomain = hostHeader.slice(0, -suffix.length);
  if (!subdomain || RESERVED_SUBDOMAINS.includes(subdomain)) {
    return next();
  }

  // Lookup site in database
  const cleanSub = subdomain.toLowerCase();
  const site = db.sites.findByDomainOrId(cleanSub);

  if (!site) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>404 - 站点不存在</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { text-align: center; padding: 40px; background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.5); max-width: 420px; }
          h1 { font-size: 64px; margin: 0; color: #ef4444; }
          h2 { font-size: 20px; margin: 10px 0 20px; font-weight: 500; }
          p { color: #94a3b8; font-size: 14px; word-break: break-all; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>404</h1>
          <h2>域名未匹配到已部署站点</h2>
          <p>子域名: <strong>${subdomain}.${primaryDomain}</strong></p>
        </div>
      </body>
      </html>
    `);
  }

  // Expiration Check (synchronized with card key validity)
  const siteExp = getSiteEffectiveExpiration(site);
  if (siteExp.isExpired) {
    return res.status(410).send(renderExpiredPage(subdomain, primaryDomain, siteExp.expiresAt));
  }

  let reqPath = req.path;
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const fileRelativePath = reqPath.replace(/^\/+/, '');
  const key = `sites/${site.siteId}/${fileRelativePath}`;

  if (site.storage === 'local' || !isR2Configured()) {
    const localFilePath = path.join(LOCAL_SITES_DIR, key);
    if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
      const contentType = mime.lookup(localFilePath) || 'application/octet-stream';
      res.setHeader('Content-Type', contentType.startsWith('text/html') ? 'text/html; charset=utf-8' : contentType);
      return fs.createReadStream(localFilePath).pipe(res);
    } else if (fileRelativePath !== 'index.html') {
      const indexPath = path.join(LOCAL_SITES_DIR, `sites/${site.siteId}/index.html`);
      if (fs.existsSync(indexPath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return fs.createReadStream(indexPath).pipe(res);
      }
    }
    return res.status(404).send('404 File Not Found');
  } else {
    const r2Cfg = getR2Config();
    const r2PublicDomain = r2Cfg.publicDomain.replace(/\/+$/, '');
    const r2TargetUrl = `${r2PublicDomain}/${key}`;
    return res.redirect(302, r2TargetUrl);
  }
});

// Middleware for local site direct access expiration check
app.use('/_sites/sites/:siteId', (req, res, next) => {
  const { siteId } = req.params;
  const site = db.sites.findByDomainOrId(siteId);
  if (site) {
    const siteExp = getSiteEffectiveExpiration(site);
    if (siteExp.isExpired) {
      const { primaryDomain } = getDomainConfig();
      return res.status(410).send(renderExpiredPage(site.subdomain || site.siteId, primaryDomain, siteExp.expiresAt));
    }
  }
  next();
});

// ==================== Maintenance Mode Middleware ====================
app.use((req, res, next) => {
  const config = db.config.getAll();
  const isMaintenance = process.env.MAINTENANCE_MODE === 'true' || config.maintenanceMode === true;

  if (isMaintenance) {
    const p = req.path.toLowerCase();
    // Allow admin pages, admin APIs, static assets (css/js/favicons), and health endpoint
    const isAllowed = 
      p.startsWith('/admin') ||
      p.startsWith('/api/admin') ||
      p.startsWith('/css/') ||
      p.startsWith('/js/') ||
      p.startsWith('/favicon') ||
      p === '/maintenance.html' ||
      p === '/api/health';

    if (!isAllowed) {
      const maintenancePath = path.join(__dirname, 'public', 'maintenance.html');
      if (fs.existsSync(maintenancePath)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return fs.createReadStream(maintenancePath).pipe(res);
      }
    }
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));


// ==================== R2 / S3 Client ====================
function getR2Config() {
  const config = db.config.getAll();
  return {
    accountId: config.accountId || process.env.R2_ACCOUNT_ID || '',
    accessKeyId: config.accessKeyId || process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: config.secretAccessKey || process.env.R2_SECRET_ACCESS_KEY || '',
    bucketName: config.bucketName || process.env.R2_BUCKET_NAME || '',
    publicDomain: config.publicDomain || process.env.R2_PUBLIC_DOMAIN || ''
  };
}

function isR2Configured() {
  const cfg = getR2Config();
  return !!(cfg.accountId && cfg.accessKeyId && cfg.secretAccessKey && cfg.bucketName && cfg.publicDomain);
}

function createS3Client() {
  const cfg = getR2Config();
  return new S3Client({
    region: 'auto',
    endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey
    }
  });
}

// ==================== Upload to R2 ====================
async function uploadFileToR2(fileBuffer, key, contentType) {
  const cfg = getR2Config();
  const client = createS3Client();

  const command = new PutObjectCommand({
    Bucket: cfg.bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType
  });

  await client.send(command);
  // Build public URL
  const publicDomain = cfg.publicDomain.replace(/\/+$/, '');
  return `${publicDomain}/${key}`;
}

// ==================== Upload to Local Fallback ====================
function uploadFileToLocal(fileBuffer, key) {
  const filePath = path.join(LOCAL_SITES_DIR, key);
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, fileBuffer);
  return `/_sites/${key}`;
}

// ==================== CDKEY Management ====================
function getCDKeys() {
  return db.cdkeys.getAll();
}

function saveCDKeys(keys) {
  db.cdkeys.saveAll(keys);
}

function validateCDKey(cdkey) {
  if (!cdkey) return { valid: false, message: '请输入卡密 (CDKEY)' };
  const cleanKey = cdkey.trim().toUpperCase();
  const keyObj = db.cdkeys.getByKey(cleanKey);
  if (!keyObj) {
    return { valid: false, message: '卡密无效或不存在，请核对后重新输入' };
  }

  // Check if max uses limit reached
  const maxUses = Number(keyObj.maxUses) || 0;
  const usedCount = Number(keyObj.usedCount) || 0;
  if (maxUses > 0 && usedCount >= maxUses) {
    if (keyObj.status !== 'used') {
      keyObj.status = 'used';
      db.cdkeys.save(keyObj);
    }
    return {
      valid: false,
      message: `该卡密已达到最大使用次数上限 (${usedCount}/${maxUses} 次)，无法继续使用`,
      keyObj
    };
  }

  // Check if already expired
  if (keyObj.expiresAt && isExpired(keyObj.expiresAt)) {
    if (keyObj.status !== 'expired') {
      keyObj.status = 'expired';
      db.cdkeys.save(keyObj);
    }
    const expStr = new Date(keyObj.expiresAt).toLocaleString('zh-CN');
    return { valid: false, message: `该卡密已于 ${expStr} 到期失效，无法继续生成链接`, keyObj, expired: true };
  }

  return { valid: true, keyObj };
}

function consumeCDKey(cdkey, siteId) {
  if (!cdkey) return null;
  const cleanKey = cdkey.trim().toUpperCase();
  const keyObj = db.cdkeys.getByKey(cleanKey);
  if (!keyObj) return null;

  const maxUses = Number(keyObj.maxUses) || 0;
  const currentUsedCount = Number(keyObj.usedCount) || 0;
  if (maxUses > 0 && currentUsedCount >= maxUses) {
    keyObj.status = 'used';
    db.cdkeys.save(keyObj);
    return null;
  }

  const duration = keyObj.duration || '1m';
  const effectiveDuration = (duration === 'forever' || duration === 'unlimited') ? '1y' : duration;
  const now = new Date();

  // First time activation
  if (!keyObj.activatedAt && !keyObj.expiresAt) {
    keyObj.activatedAt = now.toISOString();
    keyObj.expiresAt = calculateExpiresAt(effectiveDuration, now);
  }

  // Check if expired
  if (keyObj.expiresAt && isExpired(keyObj.expiresAt)) {
    keyObj.status = 'expired';
    db.cdkeys.save(keyObj);
    return null;
  }

  // Increment usage count
  keyObj.usedCount = currentUsedCount + 1;
  if (maxUses > 0 && keyObj.usedCount >= maxUses) {
    keyObj.status = 'used';
  } else {
    keyObj.status = 'active';
  }
  keyObj.lastUsedAt = now.toISOString();
  keyObj.lastUsedBySiteId = siteId;
  if (!keyObj.usedAt) {
    keyObj.usedAt = now.toISOString();
    keyObj.usedBySiteId = siteId;
  }

  db.cdkeys.save(keyObj);
  return { ...keyObj, duration: effectiveDuration, expiresAt: keyObj.expiresAt };
}

function generateCDKeyString() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const segments = [];
  for (let i = 0; i < 4; i++) {
    let seg = '';
    for (let j = 0; j < 4; j++) {
      seg += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    segments.push(seg);
  }
  return 'HTML-' + segments.join('-');
}

function generateRandomSubdomain() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';

  // Try generating unique 3 to 4 character random string
  for (let attempt = 0; attempt < 500; attempt++) {
    // Attempt 3-char first, shift to 4-char if needed
    const len = (attempt < 80 && Math.random() < 0.6) ? 3 : 4;
    let code = '';
    for (let i = 0; i < len; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!RESERVED_SUBDOMAINS.includes(code) && !db.sites.isDomainTaken(code)) {
      return code;
    }
  }
  // Fallback to 4 chars
  let fallback = '';
  for (let i = 0; i < 4; i++) {
    fallback += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return fallback;
}

// ==================== API Routes ====================

// --- Public Config Endpoint ---
app.get('/api/public-config', (req, res) => {
  const { primaryDomain, useHttps } = getDomainConfig();
  const { publishableKey } = getClerkConfig();
  const { cdkeyBuyUrl, cdkeyBuyText } = getCdkeyBuyConfig();
  const announcements = getAnnouncementsConfig();
  return res.json({
    success: true,
    data: {
      primaryDomain,
      useHttps,
      protocol: useHttps ? 'https://' : 'http://',
      clerkPublishableKey: isClerkConfigured() ? publishableKey : '',
      cdkeyBuyUrl,
      cdkeyBuyText,
      announcements
    }
  });
});

// --- Public Announcements Endpoint ---
app.get('/api/announcements', (req, res) => {
  return res.json({
    success: true,
    data: getAnnouncementsConfig()
  });
});

// --- Clerk Chinese Localization & Site Branding ---
app.get('/api/auth/localization', (req, res) => {
  const customZhCN = {
    ...zhCN,
    signIn: {
      ...(zhCN.signIn || {}),
      start: {
        ...((zhCN.signIn && zhCN.signIn.start) || {}),
        title: '登录 秒转链接',
        subtitle: '登录以管理您的部署网页及自定义域名',
        actionLink__signUp_link: '立即注册'
      },
      password: {
        ...((zhCN.signIn && zhCN.signIn.password) || {}),
        title: '输入您的密码',
        subtitle: '',
        actionLink: '使用其他方法'
      },
      emailCode: {
        ...((zhCN.signIn && zhCN.signIn.emailCode) || {}),
        title: '查看您的电子邮件',
        subtitle: ''
      },
      phoneCode: {
        ...((zhCN.signIn && zhCN.signIn.phoneCode) || {}),
        subtitle: ''
      },
      resetPasswordCode: {
        ...((zhCN.signIn && zhCN.signIn.resetPasswordCode) || {}),
        subtitle: ''
      },
      forgotPassword: {
        ...((zhCN.signIn && zhCN.signIn.forgotPassword) || {}),
        subtitle: ''
      },
      alternativeMethods: {
        ...((zhCN.signIn && zhCN.signIn.alternativeMethods) || {}),
        subtitle: '遇到问题？您可以使用以下任何方法登录。'
      }
    },
    signUp: {
      ...(zhCN.signUp || {}),
      start: {
        ...((zhCN.signUp && zhCN.signUp.start) || {}),
        title: '注册 秒转链接 账号',
        subtitle: '一键部署与托管您的 HTML / 静态网页',
        actionLink__signIn_link: '立即登录'
      },
      emailCode: {
        ...((zhCN.signUp && zhCN.signUp.emailCode) || {}),
        title: '查看您的电子邮件',
        subtitle: ''
      },
      phoneCode: {
        ...((zhCN.signUp && zhCN.signUp.phoneCode) || {}),
        subtitle: ''
      }
    },
    formFieldAction__forgotPassword: '忘记密码？',
    formFieldInputPlaceholder__password: '请输入您的密码',
    formFieldInputPlaceholder__signUpPassword: '请设置您的密码',
    formFieldInputPlaceholder__emailAddress: '请输入电子邮箱地址',
    formFieldInputPlaceholder__emailAddress_username: '请输入邮箱或用户名',
    formFieldInputPlaceholder__username: '请输入用户名',
    formButtonPrimary: '继续',
    dividerText: '或者',
    userButton: {
      ...(zhCN.userButton || {}),
      action__manageAccount: '管理个人账号',
      action__signOut: '退出登录',
      action__signOutAll: '退出所有设备'
    }
  };

  return res.json({
    success: true,
    data: {
      localization: customZhCN,
      appName: '秒转链接',
      logoUrl: '/favicon.svg'
    }
  });
});

// --- Check Path / Subdomain Availability ---
app.get('/api/check-path', (req, res) => {
  const { path: customPath } = req.query;
  if (!customPath) {
    return res.status(400).json({ success: false, message: '请提供名称' });
  }

  const sub = customPath.trim().toLowerCase();

  if (RESERVED_SUBDOMAINS.includes(sub)) {
    return res.json({ available: false, reason: 'reserved' });
  }

  // Validate format
  const pathRegex = /^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$|^[a-z0-9]{3,30}$/;
  if (!pathRegex.test(sub) || sub.length < 3 || sub.length > 30) {
    return res.json({ available: false, reason: 'format' });
  }

  // Check if already used
  const conflict = db.sites.isDomainTaken(sub);
  return res.json({ available: !conflict, reason: conflict ? 'taken' : null });
});

// --- Deploy Endpoint ---
app.post('/api/deploy', upload.single('file'), async (req, res) => {
  try {
    const { cdkey, type, htmlCode, customPath: rawCustomPath } = req.body || {};
    const customPath = rawCustomPath ? rawCustomPath.trim().toLowerCase() : '';

    // 0. Enforce User Authentication (No Guest Mode)
    const auth = await safeGetAuth(req);
    if (!auth || !auth.userId) {
      return res.status(401).json({
        success: false,
        message: '请先注册或登录账号后再生成链接'
      });
    }

    const userId = auth.userId;
    let userEmail = null;
    const { secretKey } = getClerkConfig();
    if (secretKey) {
      try {
        const user = await clerkClient.users.getUser(userId);
        userEmail = user.emailAddresses?.[0]?.emailAddress || user.username || null;
      } catch (ue) {
        console.error('Clerk getUser error during deploy:', ue.message);
      }
    }

    // 1. Validate CDKEY
    if (!cdkey || !cdkey.trim()) {
      return res.status(400).json({ success: false, message: '请输入卡密 (CDKEY)' });
    }

    const keyValidation = validateCDKey(cdkey.trim());
    if (!keyValidation || !keyValidation.valid) {
      return res.status(400).json({
        success: false,
        message: (keyValidation && keyValidation.message) || '卡密无效或已过有效期'
      });
    }

    // 2. Validate and resolve site ID / subdomain
    let siteId;
    if (customPath) {
      if (RESERVED_SUBDOMAINS.includes(customPath)) {
        return res.status(400).json({
          success: false,
          message: `「${customPath}」为系统保留名称，不可用作二级域名`
        });
      }
      // Validate format: 3-30 chars, only lowercase letters, digits, hyphens
      const pathRegex = /^[a-z0-9][a-z0-9\-]{1,28}[a-z0-9]$|^[a-z0-9]{3,30}$/;
      if (!pathRegex.test(customPath) || customPath.length < 3 || customPath.length > 30) {
        return res.status(400).json({
          success: false,
          message: '二级域名格式不正确：只能使用小写字母、数字和连字符(-)，长度 3~30 个字符，且首尾必须为字母或数字'
        });
      }
      // Check for conflicts
      if (db.sites.isDomainTaken(customPath)) {
        return res.status(400).json({
          success: false,
          message: `二级域名「${customPath}」已被占用，请换一个名称`
        });
      }
      siteId = customPath;
    } else {
      siteId = generateRandomSubdomain();
    }


    // 3. Process files based on type
    let filesToUpload = []; // Array of { key, buffer, contentType }

    if (type === 'html') {
      // Single HTML file upload
      if (!req.file) {
        return res.status(400).json({ success: false, message: '请上传 HTML 文件' });
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== '.html' && ext !== '.htm') {
        return res.status(400).json({ success: false, message: '仅支持 .html / .htm 文件' });
      }
      filesToUpload.push({
        key: `sites/${siteId}/index.html`,
        buffer: req.file.buffer,
        contentType: 'text/html; charset=utf-8'
      });

    } else if (type === 'zip') {
      // ZIP file upload
      if (!req.file) {
        return res.status(400).json({ success: false, message: '请上传 ZIP 压缩包' });
      }
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext !== '.zip') {
        return res.status(400).json({ success: false, message: '仅支持 .zip 文件' });
      }

      try {
        const zip = new AdmZip(req.file.buffer);
        const entries = zip.getEntries();

        if (entries.length === 0) {
          return res.status(400).json({ success: false, message: 'ZIP 压缩包为空' });
        }

        // Find the root prefix (in case files are in a subdirectory)
        let rootPrefix = '';
        const htmlEntries = entries.filter(e => !e.isDirectory && e.entryName.toLowerCase().endsWith('index.html'));
        if (htmlEntries.length > 0) {
          // Use the shallowest index.html's directory as root
          htmlEntries.sort((a, b) => a.entryName.split('/').length - b.entryName.split('/').length);
          const parts = htmlEntries[0].entryName.split('/');
          if (parts.length > 1) {
            rootPrefix = parts.slice(0, -1).join('/') + '/';
          }
        } else {
          // No index.html found, check if there's any HTML file
          const anyHtml = entries.find(e => !e.isDirectory && (e.entryName.toLowerCase().endsWith('.html') || e.entryName.toLowerCase().endsWith('.htm')));
          if (!anyHtml) {
            return res.status(400).json({ success: false, message: 'ZIP 中未找到 HTML 文件' });
          }
        }

        for (const entry of entries) {
          if (entry.isDirectory) continue;

          let relativePath = entry.entryName;
          // Remove root prefix if exists
          if (rootPrefix && relativePath.startsWith(rootPrefix)) {
            relativePath = relativePath.substring(rootPrefix.length);
          }
          // Skip macOS metadata files
          if (relativePath.startsWith('__MACOSX') || relativePath.startsWith('.')) continue;
          if (relativePath.length === 0) continue;

          const contentType = mime.lookup(relativePath) || 'application/octet-stream';
          // Ensure HTML files use utf-8
          const finalContentType = contentType.startsWith('text/html')
            ? 'text/html; charset=utf-8'
            : contentType;

          filesToUpload.push({
            key: `sites/${siteId}/${relativePath}`,
            buffer: entry.getData(),
            contentType: finalContentType
          });
        }

        // If no index.html was found, rename the first HTML file
        const hasIndex = filesToUpload.some(f => f.key.endsWith('/index.html'));
        if (!hasIndex) {
          const firstHtml = filesToUpload.find(f => f.key.endsWith('.html') || f.key.endsWith('.htm'));
          if (firstHtml) {
            // Copy as index.html
            filesToUpload.push({
              key: `sites/${siteId}/index.html`,
              buffer: firstHtml.buffer,
              contentType: 'text/html; charset=utf-8'
            });
          }
        }

      } catch (zipErr) {
        console.error('ZIP processing error:', zipErr);
        return res.status(400).json({ success: false, message: 'ZIP 文件解析失败，请确认文件格式正确' });
      }

    } else if (type === 'code') {
      // Pasted HTML code
      if (!htmlCode || !htmlCode.trim()) {
        return res.status(400).json({ success: false, message: '请粘贴 HTML 代码' });
      }
      filesToUpload.push({
        key: `sites/${siteId}/index.html`,
        buffer: Buffer.from(htmlCode, 'utf-8'),
        contentType: 'text/html; charset=utf-8'
      });

    } else {
      return res.status(400).json({ success: false, message: '不支持的上传类型' });
    }

    if (filesToUpload.length === 0) {
      return res.status(400).json({ success: false, message: '没有可部署的文件' });
    }

    // 4. Upload files
    const useR2 = isR2Configured();
    const siteUrl = buildSiteUrl(customPath || siteId, siteId);

    try {
      if (useR2) {
        // Upload to Cloudflare R2
        for (const file of filesToUpload) {
          await uploadFileToR2(file.buffer, file.key, file.contentType);
        }
      } else {
        // Local fallback mode
        for (const file of filesToUpload) {
          uploadFileToLocal(file.buffer, file.key);
        }
      }
    } catch (uploadErr) {
      console.error('Upload error:', uploadErr);
      // IMPORTANT: Do NOT consume CDKEY on upload failure
      return res.status(500).json({
        success: false,
        message: '文件上传失败，卡密未被消耗。请稍后重试。',
        error: uploadErr.message
      });
    }

    // 5. Consume / record CDKEY (activates key on first use, increments usage count)
    const consumedKeyInfo = consumeCDKey(cdkey.trim(), siteId);
    const keyDuration = consumedKeyInfo ? (consumedKeyInfo.duration || '1m') : '1m';

    // Link validity is calculated from this link's generation date for the full duration!
    const siteExpiresAt = calculateExpiresAt(keyDuration, new Date());

    // 6. Record the site
    const siteRecord = {
      siteId,
      subdomain: customPath || siteId,
      url: siteUrl,
      cdkey: cdkey.trim(),
      type,
      fileCount: filesToUpload.length,
      storage: useR2 ? 'r2' : 'local',
      duration: keyDuration,
      expiresAt: siteExpiresAt,
      userId,
      userEmail,
      createdAt: new Date().toISOString()
    };
    if (customPath) siteRecord.customPath = customPath;
    db.sites.save(siteRecord);

    // 7. Return success
    return res.json({
      success: true,
      message: '部署成功！',
      data: {
        siteId,
        subdomain: customPath || siteId,
        url: siteUrl,
        fileCount: filesToUpload.length,
        storage: useR2 ? '云端 CDN 高速存储' : '标准存储'
      }
    });

  } catch (err) {
    console.error('Deploy error:', err);
    return res.status(500).json({ success: false, message: '服务器内部错误', error: err.message });
  }
});

// --- Query Site Expiration Status Endpoint ---
app.get('/api/site-status', (req, res) => {
  try {
    const { subdomain } = req.query;
    if (!subdomain || !subdomain.trim()) {
      return res.status(400).json({ success: false, message: '请提供要查询的域名或站点名称' });
    }

    let cleanSub = subdomain.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');

    const { primaryDomain } = getDomainConfig();
    if (primaryDomain && cleanSub.endsWith(`.${primaryDomain.toLowerCase()}`)) {
      cleanSub = cleanSub.slice(0, -(primaryDomain.length + 1));
    }

    const site = db.sites.findByDomainOrId(cleanSub);

    if (!site) {
      return res.status(404).json({ success: false, message: `未找到域名/名称为「${cleanSub}」的已部署站点` });
    }

    const siteExp = getSiteEffectiveExpiration(site);
    const expired = siteExp.isExpired;
    const effectiveExpiresAt = siteExp.expiresAt;
    let remainingText = '永久有效';
    let remainingMs = null;

    if (effectiveExpiresAt) {
      const expTime = new Date(effectiveExpiresAt).getTime();
      const diffMs = expTime - Date.now();
      remainingMs = diffMs;

      if (diffMs <= 0) {
        remainingText = '已到期失效';
      } else {
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        if (days > 0) {
          remainingText = `${days} 天 ${hours} 小时`;
        } else if (hours > 0) {
          remainingText = `${hours} 小时 ${mins} 分钟`;
        } else {
          remainingText = `${mins} 分钟`;
        }
      }
    }

    return res.json({
      success: true,
      data: {
        siteId: site.siteId,
        subdomain: site.subdomain || site.customPath || site.siteId,
        url: site.url,
        createdAt: site.createdAt,
        expiresAt: effectiveExpiresAt,
        isExpired: expired,
        duration: siteExp.duration,
        remainingText,
        remainingMs
      }
    });

  } catch (err) {
    console.error('Site status query error:', err);
    return res.status(500).json({ success: false, message: '查询服务器出错', error: err.message });
  }
});

// --- Renew Site Endpoint ---
app.post('/api/renew', async (req, res) => {
  try {
    const { subdomain, cdkey } = req.body || {};

    if (!subdomain || !subdomain.trim()) {
      return res.status(400).json({ success: false, message: '请输入域名或站点名称' });
    }

    if (!cdkey || !cdkey.trim()) {
      return res.status(400).json({ success: false, message: '请输入续期卡密 (CDKEY)' });
    }

    let cleanSub = subdomain.trim().toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '');

    const { primaryDomain } = getDomainConfig();
    if (primaryDomain && cleanSub.endsWith(`.${primaryDomain.toLowerCase()}`)) {
      cleanSub = cleanSub.slice(0, -(primaryDomain.length + 1));
    }

    const cleanKey = cdkey.trim();

    // 1. Validate CDKEY
    const keyValidation = validateCDKey(cleanKey);
    if (!keyValidation || !keyValidation.valid) {
      return res.status(400).json({
        success: false,
        message: (keyValidation && keyValidation.message) || '卡密无效或已过有效期'
      });
    }
    const keyObj = keyValidation.keyObj;

    // 2. Find site in database
    const targetSite = db.sites.findByDomainOrId(cleanSub);

    if (!targetSite) {
      return res.status(404).json({ success: false, message: `未找到域名/名称为「${cleanSub}」的已部署站点` });
    }

    // Check user auth to optionally link if unlinked
    try {
      const auth = await safeGetAuth(req);
      if (auth && auth.userId) {
        if (!targetSite.userId) targetSite.userId = auth.userId;
        const { secretKey } = getClerkConfig();
        if (secretKey && !targetSite.userEmail) {
          try {
            const user = await clerkClient.users.getUser(auth.userId);
            targetSite.userEmail = user.emailAddresses?.[0]?.emailAddress || user.username || null;
          } catch (ue) {}
        }
      }
    } catch (ae) {}

    // 3. Consume / Link CDKEY
    const consumedKey = consumeCDKey(cleanKey, targetSite.siteId);
    const keyDuration = consumedKey ? (consumedKey.duration || '1m') : (keyObj.duration || '1m');

    // 4. Calculate new expiresAt for the site (extend by duration from now or from current expiration date)
    let baseTime = new Date();
    if (targetSite.expiresAt) {
      const currentExpMs = new Date(targetSite.expiresAt).getTime();
      if (!isNaN(currentExpMs) && currentExpMs > Date.now()) {
        baseTime = new Date(currentExpMs);
      }
    }
    const newExpiresAt = calculateExpiresAt(keyDuration, baseTime);

    // 5. Update site record
    targetSite.duration = keyDuration;
    targetSite.expiresAt = newExpiresAt;
    targetSite.renewedAt = new Date().toISOString();
    targetSite.lastCdkey = cleanKey;

    db.sites.save(targetSite);

    const siteUrl = targetSite.url || buildSiteUrl(targetSite.subdomain || targetSite.siteId, targetSite.siteId);

    return res.json({
      success: true,
      message: `网页「${cleanSub}」续期成功！`,
      data: {
        siteId: targetSite.siteId,
        subdomain: targetSite.subdomain || targetSite.siteId,
        url: siteUrl,
        duration: keyDuration,
        expiresAt: newExpiresAt
      }
    });

  } catch (err) {
    console.error('Renew error:', err);
    return res.status(500).json({ success: false, message: '服务器内部错误', error: err.message });
  }
});

// --- Admin: Generate CDKEYs (Supports custom max uses & validity period) ---
app.post('/api/admin/generate-keys', (req, res) => {
  const { count, duration, maxUses, password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const validDurations = ['3d', '1m', '6m', '1y'];
  const validDuration = validDurations.includes(duration) ? duration : '1m';
  const num = Math.min(Math.max(parseInt(count) || 1, 1), 100);
  const parsedMaxUses = Math.max(parseInt(maxUses) || 0, 0); // 0 = 不限次数
  const newKeys = [];

  for (let i = 0; i < num; i++) {
    const key = generateCDKeyString();
    const keyObj = {
      key,
      duration: validDuration,
      status: 'unused',
      createdAt: new Date().toISOString(),
      activatedAt: null,
      usedAt: null,
      usedCount: 0,
      maxUses: parsedMaxUses,
      lastUsedAt: null,
      usedBySiteId: null,
      lastUsedBySiteId: null,
      expiresAt: null
    };
    newKeys.push(keyObj);
  }

  db.cdkeys.saveAll(newKeys);

  const usageDesc = parsedMaxUses > 0 ? `每张限用 ${parsedMaxUses} 次` : '有效期内不限次数';
  return res.json({
    success: true,
    message: `成功生成 ${num} 个卡密（${usageDesc}）`,
    data: { keys: newKeys }
  });
});

// --- Admin: Import CDKEYs ---
app.post('/api/admin/import-keys', (req, res) => {
  const { keysText, duration, maxUses, status, overwrite, password } = req.body || {};

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  if (!keysText || !keysText.trim()) {
    return res.status(400).json({ success: false, message: '请输入要导入的卡密内容' });
  }

  const validDurations = ['3d', '1m', '6m', '1y'];
  const defaultDuration = validDurations.includes(duration) ? duration : '1m';
  const defaultStatus = ['unused', 'active', 'used'].includes(status) ? status : 'unused';
  const defaultMaxUses = Math.max(parseInt(maxUses) || 0, 0);
  const shouldOverwrite = Boolean(overwrite);

  // Parse lines of input
  const lines = keysText.split(/\r?\n/);
  const parsedKeys = [];
  const seenKeysInInput = new Set();

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;

    // Support line format: KEY,DURATION,MAX_USES,STATUS or KEY,DURATION or plain KEY
    let lineKey = '';
    let lineDuration = defaultDuration;
    let lineMaxUses = defaultMaxUses;
    let lineStatus = defaultStatus;

    if (line.includes(',') || line.includes('\t') || line.includes('|')) {
      const parts = line.split(/[,|\t]+/).map(p => p.trim()).filter(Boolean);
      lineKey = parts[0];
      if (parts[1]) {
        const d = parts[1].toLowerCase();
        if (validDurations.includes(d)) lineDuration = d;
      }
      if (parts[2]) {
        const mu = parseInt(parts[2]);
        if (!isNaN(mu) && mu >= 0) {
          lineMaxUses = mu;
        } else if (['unused', 'active', 'used', 'expired'].includes(parts[2].toLowerCase())) {
          lineStatus = parts[2].toLowerCase();
        }
      }
      if (parts[3]) {
        const s = parts[3].toLowerCase();
        if (['unused', 'active', 'used', 'expired'].includes(s)) lineStatus = s;
      }
    } else if (line.includes(' ')) {
      const parts = line.split(/\s+/).map(p => p.trim()).filter(Boolean);
      lineKey = parts[0];
      if (parts[1]) {
        const d = parts[1].toLowerCase();
        if (validDurations.includes(d)) lineDuration = d;
      }
      if (parts[2]) {
        const mu = parseInt(parts[2]);
        if (!isNaN(mu) && mu >= 0) lineMaxUses = mu;
      }
    } else {
      lineKey = line;
    }

    lineKey = lineKey.trim().toUpperCase();
    if (lineKey.length < 4) continue;

    if (seenKeysInInput.has(lineKey)) continue;
    seenKeysInInput.add(lineKey);

    parsedKeys.push({
      key: lineKey,
      duration: lineDuration,
      maxUses: lineMaxUses,
      status: lineStatus
    });
  }

  if (parsedKeys.length === 0) {
    return res.status(400).json({ success: false, message: '未在输入内容中识别到有效的卡密格式' });
  }

  let importedCount = 0;
  let skippedCount = 0;
  let updatedCount = 0;
  const newKeyObjects = [];

  for (const item of parsedKeys) {
    const existing = db.cdkeys.getByKey(item.key);
    if (existing) {
      if (shouldOverwrite) {
        existing.duration = item.duration;
        existing.maxUses = item.maxUses;
        existing.status = item.status;
        db.cdkeys.save(existing);
        updatedCount++;
      } else {
        skippedCount++;
      }
    } else {
      const newKeyObj = {
        key: item.key,
        duration: item.duration,
        maxUses: item.maxUses,
        status: item.status,
        createdAt: new Date().toISOString(),
        activatedAt: null,
        usedAt: null,
        usedCount: 0,
        lastUsedAt: null,
        usedBySiteId: null,
        lastUsedBySiteId: null,
        expiresAt: null
      };
      newKeyObjects.push(newKeyObj);
      importedCount++;
    }
  }

  if (newKeyObjects.length > 0) {
    db.cdkeys.saveAll(newKeyObjects);
  }

  let msg = `成功导入 ${importedCount} 个新卡密`;
  if (updatedCount > 0) msg += `，覆盖更新 ${updatedCount} 个卡密`;
  if (skippedCount > 0) msg += `，跳过 ${skippedCount} 个已存在卡密`;

  return res.json({
    success: true,
    message: msg,
    data: {
      importedCount,
      updatedCount,
      skippedCount,
      totalParsed: parsedKeys.length
    }
  });
});

// --- Admin: Get CDKEY list ---
app.get('/api/admin/keys', (req, res) => {
  const { password } = req.query;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const keys = getCDKeys();
  const sites = db.sites.getAll();

  const enrichedKeys = keys.map(k => {
    const maxUses = Number(k.maxUses) || 0;
    const usedCount = Number(k.usedCount) || 0;
    let computedStatus = k.status || 'unused';
    let expiresAt = k.expiresAt || null;

    if (expiresAt && isExpired(expiresAt)) {
      computedStatus = 'expired';
    } else if (maxUses > 0 && usedCount >= maxUses) {
      computedStatus = 'used';
    } else if (k.activatedAt || usedCount > 0 || computedStatus === 'active') {
      computedStatus = 'active';
    } else {
      computedStatus = 'unused';
    }

    const linkedSites = sites.filter(s => s.cdkey && s.cdkey.toUpperCase() === k.key.toUpperCase());
    const lastSiteId = k.lastUsedBySiteId || k.usedBySiteId || (linkedSites.length > 0 ? linkedSites[linkedSites.length - 1].siteId : null);
    const site = sites.find(s => s.siteId === lastSiteId);

    return {
      ...k,
      status: computedStatus,
      duration: k.duration || '1m',
      expiresAt,
      usedCount,
      maxUses,
      siteInfo: site ? {
        siteId: site.siteId,
        subdomain: site.subdomain || site.customPath,
        url: site.url || buildSiteUrl(site.subdomain || site.siteId, site.siteId)
      } : null,
      siteCount: linkedSites.length
    };
  });

  return res.json({ success: true, data: { keys: enrichedKeys } });
});

// --- Admin: Delete CDKEY(s) ---
app.delete('/api/admin/keys', (req, res) => {
  const { password, key, deleteExpired, deleteUsed, deleteActive, deleteUnused, deleteDuration, deleteAll } = req.body || {};

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  let keys = db.cdkeys.getAll();
  const beforeCount = keys.length;

  if (deleteExpired) {
    let removed = 0;
    keys.forEach(k => {
      if ((k.expiresAt && isExpired(k.expiresAt)) || k.status === 'expired') {
        db.cdkeys.delete(k.key);
        removed++;
      }
    });
    return res.json({ success: true, message: `已成功清理 ${removed} 个已到期卡密！` });
  } else if (deleteUsed || deleteActive) {
    let removed = 0;
    keys.forEach(k => {
      const isAct = (k.status === 'active' || k.status === 'used' || (k.usedCount && k.usedCount > 0)) && !(k.expiresAt && isExpired(k.expiresAt));
      if (isAct) {
        db.cdkeys.delete(k.key);
        removed++;
      }
    });
    return res.json({ success: true, message: `已成功清理 ${removed} 个生效中卡密！` });
  } else if (deleteUnused) {
    let removed = 0;
    keys.forEach(k => {
      if (k.status === 'unused' && (!k.usedCount || k.usedCount === 0) && !k.activatedAt) {
        db.cdkeys.delete(k.key);
        removed++;
      }
    });
    return res.json({ success: true, message: `已成功清理 ${removed} 个未激活卡密！` });
  } else if (deleteDuration) {
    let removed = 0;
    keys.forEach(k => {
      if (k.duration === deleteDuration) {
        db.cdkeys.delete(k.key);
        removed++;
      }
    });
    const durName = { '3d': '3天体验卡', '1m': '1个月月卡', '6m': '半年卡(6个月)', '1y': '1年年卡', '3m': '3个月季卡', '7d': '7天周卡', 'forever': '永久有效卡' }[deleteDuration] || deleteDuration;
    return res.json({ success: true, message: `已成功清理 ${removed} 个【${durName}】类型的卡密！` });
  } else if (deleteAll) {
    db.cdkeys.cleanByType('all');
    return res.json({ success: true, message: `已清空全部 ${beforeCount} 个卡密！` });
  } else if (key) {
    const cleanKey = key.trim().toUpperCase();
    db.cdkeys.delete(cleanKey);
    return res.json({ success: true, message: `已成功删除卡密「${key}」` });
  }

  return res.status(400).json({ success: false, message: '请提供操作参数' });
});

// --- Admin: Get Sites list ---
app.get('/api/admin/sites', (req, res) => {
  const { password } = req.query;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const sites = db.sites.getAll();
  const enrichedSites = sites.map(s => {
    const exp = getSiteEffectiveExpiration(s);
    return {
      ...s,
      duration: exp.duration,
      expiresAt: exp.expiresAt,
      url: s.url || buildSiteUrl(s.subdomain || s.siteId, s.siteId),
      isExpired: exp.isExpired
    };
  });

  return res.json({ success: true, data: { sites: enrichedSites } });
});

// --- Admin: Delete Site ---
app.delete('/api/admin/sites', (req, res) => {
  const { password, siteId } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  if (!siteId) {
    return res.status(400).json({ success: false, message: '请提供站点 ID' });
  }

  const targetSite = db.sites.getById(siteId);

  if (!targetSite) {
    return res.status(404).json({ success: false, message: '未找到指定站点' });
  }

  // Remove local directory if stored locally
  if (targetSite.storage === 'local' || !isR2Configured()) {
    const localDir = path.join(LOCAL_SITES_DIR, 'sites', siteId);
    if (fs.existsSync(localDir)) {
      try {
        fs.rmSync(localDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to delete local site dir ${localDir}:`, err);
      }
    }
  }

  db.sites.delete(siteId);

  return res.json({ success: true, message: `已成功删除站点「${siteId}」` });
});

// --- Admin: Get R2 Config ---
app.get('/api/admin/r2-config', (req, res) => {
  const { password } = req.query;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const cfg = getR2Config();
  // Mask the secret key for security
  const masked = {
    ...cfg,
    secretAccessKey: cfg.secretAccessKey ? '****' + cfg.secretAccessKey.slice(-4) : ''
  };

  return res.json({
    success: true,
    data: { config: masked, isConfigured: isR2Configured() }
  });
});

// --- Admin: Save R2 Config ---
app.post('/api/admin/r2-config', (req, res) => {
  const { config, password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  if (!config) {
    return res.status(400).json({ success: false, message: '配置信息不能为空' });
  }

  // Load existing config and merge (don't overwrite secret if masked)
  const existing = db.config.getAll();
  const newConfig = {
    accountId: config.accountId || '',
    accessKeyId: config.accessKeyId || '',
    secretAccessKey: (config.secretAccessKey && !config.secretAccessKey.startsWith('****'))
      ? config.secretAccessKey
      : existing.secretAccessKey || '',
    bucketName: config.bucketName || '',
    publicDomain: config.publicDomain || ''
  };

  // Ensure publicDomain has https://
  if (newConfig.publicDomain && !newConfig.publicDomain.startsWith('http')) {
    newConfig.publicDomain = 'https://' + newConfig.publicDomain;
  }

  db.config.setMultiple(newConfig);

  const envUpdates = {
    R2_ACCOUNT_ID: newConfig.accountId,
    R2_ACCESS_KEY_ID: newConfig.accessKeyId,
    R2_BUCKET_NAME: newConfig.bucketName,
    R2_PUBLIC_DOMAIN: newConfig.publicDomain
  };
  if (newConfig.secretAccessKey && !newConfig.secretAccessKey.startsWith('****')) {
    envUpdates.R2_SECRET_ACCESS_KEY = newConfig.secretAccessKey;
  }
  updateEnvFile(envUpdates);

  return res.json({
    success: true,
    message: 'R2 配置已保存',
    data: { isConfigured: isR2Configured() }
  });
});

// --- Admin: Test R2 Connection ---
app.post('/api/admin/r2-test', async (req, res) => {
  const { password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  if (!isR2Configured()) {
    return res.status(400).json({ success: false, message: '请先配置 R2 参数' });
  }

  try {
    const client = createS3Client();
    const cfg = getR2Config();
    await client.send(new HeadBucketCommand({ Bucket: cfg.bucketName }));
    return res.json({ success: true, message: 'R2 连接测试成功！' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'R2 连接失败: ' + err.message });
  }
});
// --- Admin: Get Domain Config ---
app.get('/api/admin/domain-config', (req, res) => {
  const { password } = req.query;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  return res.json({ success: true, data: getDomainConfig() });
});

// --- Admin: Save Domain Config ---
app.post('/api/admin/domain-config', (req, res) => {
  const { primaryDomain, useHttps, password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const cleanDomain = (primaryDomain || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const configUseHttps = useHttps === true || useHttps === 'true';

  db.config.setMultiple({
    primaryDomain: cleanDomain,
    useHttps: configUseHttps
  });

  updateEnvFile({
    PRIMARY_DOMAIN: cleanDomain,
    USE_HTTPS: configUseHttps ? 'true' : 'false'
  });

  return res.json({
    success: true,
    message: '主域名配置已更新！',
    data: getDomainConfig()
  });
});

// --- Admin: Get CDKEY Purchase Link Config ---
app.get('/api/admin/cdkey-buy-config', (req, res) => {
  const { password } = req.query;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  return res.json({ success: true, data: getCdkeyBuyConfig() });
});

// --- Admin: Save CDKEY Purchase Link Config ---
app.post('/api/admin/cdkey-buy-config', (req, res) => {
  const { cdkeyBuyUrl, cdkeyBuyText, password } = req.body;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const cleanBuyUrl = (cdkeyBuyUrl || '').trim();
  const cleanBuyText = (cdkeyBuyText || '').trim() || '获取卡密';

  db.config.setMultiple({
    cdkeyBuyUrl: cleanBuyUrl,
    cdkeyBuyText: cleanBuyText
  });

  updateEnvFile({
    CDKEY_BUY_URL: cleanBuyUrl,
    CDKEY_BUY_TEXT: cleanBuyText
  });

  return res.json({
    success: true,
    message: '卡密获取渠道配置已更新！',
    data: getCdkeyBuyConfig()
  });
});

// --- Admin: Get Announcements Config ---
app.get('/api/admin/announcements', (req, res) => {
  const { password } = req.query;

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  return res.json({ success: true, data: getAnnouncementsConfig() });
});

// --- Admin: Save Announcements Config ---
app.post('/api/admin/announcements', (req, res) => {
  const { enabled, autoPlay, interval, items, password } = req.body || {};

  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const isEnabled = enabled !== undefined ? Boolean(enabled) : true;
  const isAutoPlay = autoPlay !== undefined ? Boolean(autoPlay) : true;
  const parsedInterval = Math.max(parseInt(interval, 10) || 6000, 2000);

  let cleanItems = [];
  if (Array.isArray(items)) {
    cleanItems = items.map((item, idx) => ({
      id: (item.id && String(item.id).trim()) || `notice_${Date.now()}_${idx}`,
      tag: (item.tag && String(item.tag).trim()) || '公告',
      tagColor: ['blue', 'green', 'orange', 'purple', 'red'].includes(item.tagColor) ? item.tagColor : 'blue',
      title: (item.title && String(item.title).trim()) || '通知',
      content: (item.content && String(item.content).trim()) || '',
      link: (item.link && String(item.link).trim()) || '',
      linkText: (item.linkText && String(item.linkText).trim()) || ''
    })).filter(item => item.title || item.content);
  }

  const newConfig = {
    enabled: isEnabled,
    updatedAt: new Date().toISOString(), // new update timestamp to trigger client popup
    autoPlay: isAutoPlay,
    interval: parsedInterval,
    items: cleanItems
  };

  db.config.set('announcements_config', newConfig);

  return res.json({
    success: true,
    message: `公告配置已保存并发布！共 ${cleanItems.length} 条公告。`,
    data: newConfig
  });
});


// In-memory Clerk user profile cache with max size limit to prevent memory leak
const clerkUserMemoryCache = new Map();
const MAX_CLERK_USER_CACHE_SIZE = 1000;

function setClerkUserCache(userId, data) {
  if (clerkUserMemoryCache.size >= MAX_CLERK_USER_CACHE_SIZE) {
    const firstKey = clerkUserMemoryCache.keys().next().value;
    if (firstKey) clerkUserMemoryCache.delete(firstKey);
  }
  clerkUserMemoryCache.set(userId, data);
}

// --- User Profile & Sites API ---
app.get('/api/user/me', async (req, res) => {
  try {
    const auth = await safeGetAuth(req);
    if (!auth || !auth.userId) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }

    const headerEmail = (req.headers['x-user-email'] || req.query.email || '').trim().toLowerCase();
    let userDetails = { id: auth.userId };
    let userEmail = headerEmail || null;

    // 1. Check in-memory cache first (5-min TTL)
    const cached = clerkUserMemoryCache.get(auth.userId);
    if (cached && (Date.now() - cached.timestamp < 5 * 60 * 1000)) {
      userDetails = cached.details;
      userEmail = cached.email || userEmail;
    } else if (!headerEmail) {
      // 2. Fetch with 800ms quick race timeout if no email provided
      const { secretKey } = getClerkConfig();
      if (secretKey) {
        try {
          const fetchPromise = clerkClient.users.getUser(auth.userId);
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 800));
          const user = await Promise.race([fetchPromise, timeoutPromise]);
          userDetails = {
            id: user.id,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.emailAddresses?.[0]?.emailAddress || '',
            imageUrl: user.imageUrl || '',
            username: user.username || ''
          };
          userEmail = userDetails.email || userEmail;
          setClerkUserCache(auth.userId, {
            details: userDetails,
            email: userEmail,
            timestamp: Date.now()
          });
        } catch (e) {
          // Timeout or network glitch: gracefully fallback to basic details
          if (!userDetails.email && userEmail) userDetails.email = userEmail;
        }
      }
    } else {
      // We already have email from frontend header, cache it immediately!
      userDetails.email = headerEmail;
      clerkUserMemoryCache.set(auth.userId, {
        details: userDetails,
        email: headerEmail,
        timestamp: Date.now()
      });
    }

    const sites = db.sites.findByUserIdOrEmail(auth.userId, userEmail);
    const userSites = sites
      .map(s => {
        const exp = getSiteEffectiveExpiration(s);
        return {
          ...s,
          duration: exp.duration,
          expiresAt: exp.expiresAt,
          url: s.url || buildSiteUrl(s.subdomain || s.siteId, s.siteId),
          isExpired: exp.isExpired
        };
      });

    return res.json({
      success: true,
      data: {
        user: userDetails,
        sites: userSites
      }
    });
  } catch (err) {
    console.error('User info fetch error:', err);
    return res.status(500).json({ success: false, message: '获取用户信息失败', error: err.message });
  }
});

// --- User: Delete own site ---
app.delete('/api/user/sites', async (req, res) => {
  try {
    const auth = await safeGetAuth(req);
    if (!auth || !auth.userId) {
      return res.status(401).json({ success: false, message: '请先登录' });
    }

    const { siteId } = req.body;
    if (!siteId) {
      return res.status(400).json({ success: false, message: '请提供站点 ID' });
    }

    let userEmail = null;
    const { secretKey } = getClerkConfig();
    if (secretKey) {
      try {
        const user = await clerkClient.users.getUser(auth.userId);
        userEmail = user.emailAddresses?.[0]?.emailAddress || null;
      } catch (e) {}
    }

    const userSites = db.sites.findByUserIdOrEmail(auth.userId, userEmail);
    const targetSite = userSites.find(s => s.siteId === siteId);

    if (!targetSite) {
      return res.status(404).json({ success: false, message: '未找到指定站点或无权删除' });
    }

    if (targetSite.storage === 'local' || !isR2Configured()) {
      const localDir = path.join(LOCAL_SITES_DIR, 'sites', siteId);
      if (fs.existsSync(localDir)) {
        try {
          fs.rmSync(localDir, { recursive: true, force: true });
        } catch (err) {
          console.error(`Failed to delete local site dir ${localDir}:`, err);
        }
      }
    }

    db.sites.delete(siteId);

    return res.json({ success: true, message: `已成功删除站点「${siteId}」` });
  } catch (err) {
    console.error('User delete site error:', err);
    return res.status(500).json({ success: false, message: '删除失败', error: err.message });
  }
});

// --- Admin: Get Clerk Config ---
app.get('/api/admin/clerk-config', (req, res) => {
  const { password } = req.query;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const { publishableKey, secretKey } = getClerkConfig();
  const maskedSecret = secretKey ? '****' + secretKey.slice(-4) : '';
  return res.json({
    success: true,
    data: {
      publishableKey,
      secretKey: maskedSecret,
      isConfigured: !!(publishableKey && secretKey)
    }
  });
});

// --- Admin: Save Clerk Config ---
app.post('/api/admin/clerk-config', (req, res) => {
  const { publishableKey, secretKey, password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: '管理员密码错误' });
  }

  const clerkUpdates = {};
  if (publishableKey !== undefined) {
    clerkUpdates.clerkPublishableKey = (publishableKey || '').trim();
    process.env.CLERK_PUBLISHABLE_KEY = clerkUpdates.clerkPublishableKey;
  }
  if (secretKey !== undefined && !secretKey.startsWith('****')) {
    clerkUpdates.clerkSecretKey = (secretKey || '').trim();
    process.env.CLERK_SECRET_KEY = clerkUpdates.clerkSecretKey;
  }

  db.config.setMultiple(clerkUpdates);

  const envUpdates = {};
  if (publishableKey !== undefined) {
    envUpdates.CLERK_PUBLISHABLE_KEY = clerkUpdates.clerkPublishableKey;
  }
  if (secretKey !== undefined && !secretKey.startsWith('****')) {
    envUpdates.CLERK_SECRET_KEY = clerkUpdates.clerkSecretKey;
  }
  updateEnvFile(envUpdates);

  return res.json({
    success: true,
    message: 'Clerk 用户认证配置已保存！',
    data: {
      publishableKey: clerkUpdates.clerkPublishableKey || '',
      isConfigured: !!(clerkUpdates.clerkPublishableKey && clerkUpdates.clerkSecretKey)
    }
  });
});

// --- Health Check ---
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    version: '2.3.0',
    features: ['sqlite', 'batch_import', 'max_uses', 'cached_clerk'],
    storage: isR2Configured() ? 'Cloudflare R2' : '本地存储（演示模式）',
    timestamp: new Date().toISOString()
  });
});

// ==================== Start Server ====================
app.listen(PORT, () => {
  console.log(`\n  ⚡ 秒转链接服务已启动`);
  console.log(`  🌐 地址: http://localhost:${PORT}`);
  console.log(`  💾 存储模式: ${isR2Configured() ? 'Cloudflare R2' : '本地存储（演示模式）'}`);
  console.log(`  🔑 管理密码: ${ADMIN_PASSWORD}\n`);
});
