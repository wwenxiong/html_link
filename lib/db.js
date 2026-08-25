const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = process.env.DB_PATH || path.join(DATA_DIR, 'app.db');

let dbInstance = null;
let isSqliteAvailable = null;

function saveJsonBackup(filename, data) {
  try {
    const fullPath = path.join(DATA_DIR, filename);
    const tmpPath = fullPath + '.tmp.' + Date.now();
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmpPath, fullPath);
  } catch (e) {}
}

function readJsonFile(filename, defVal = []) {
  try {
    const fullPath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(fullPath)) return defVal;
    const raw = fs.readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) || defVal;
  } catch (e) {
    return defVal;
  }
}

function initDatabase() {
  if (isSqliteAvailable === false) return null;
  if (dbInstance) return dbInstance;

  try {
    const { DatabaseSync } = require('node:sqlite');
    dbInstance = new DatabaseSync(DB_FILE);
    isSqliteAvailable = true;
  } catch (err) {
    try {
      const Database = require('better-sqlite3');
      dbInstance = new Database(DB_FILE);
      isSqliteAvailable = true;
    } catch (e2) {
      isSqliteAvailable = false;
      return null;
    }
  }

  try {
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
  } catch (pragmaErr) {}

  createSchema(dbInstance);
  migrateLegacyJson(dbInstance);
  return dbInstance;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      site_id TEXT PRIMARY KEY,
      subdomain TEXT,
      custom_path TEXT,
      url TEXT,
      cdkey TEXT,
      type TEXT,
      file_count INTEGER DEFAULT 1,
      storage TEXT DEFAULT 'local',
      duration TEXT,
      expires_at TEXT,
      user_id TEXT,
      user_email TEXT,
      visits INTEGER DEFAULT 0,
      renewed_at TEXT,
      last_cdkey TEXT,
      created_at TEXT NOT NULL,
      extra_meta TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_sites_subdomain ON sites(subdomain);
    CREATE INDEX IF NOT EXISTS idx_sites_custom_path ON sites(custom_path);
    CREATE INDEX IF NOT EXISTS idx_sites_user_id ON sites(user_id);
    CREATE INDEX IF NOT EXISTS idx_sites_user_email ON sites(user_email);
    CREATE INDEX IF NOT EXISTS idx_sites_expires_at ON sites(expires_at);
    CREATE TABLE IF NOT EXISTS cdkeys (
      key TEXT PRIMARY KEY,
      duration TEXT DEFAULT '3d',
      status TEXT DEFAULT 'unused',
      created_at TEXT NOT NULL,
      used_at TEXT,
      activated_at TEXT,
      expires_at TEXT,
      used_count INTEGER DEFAULT 0,
      max_uses INTEGER DEFAULT 0,
      last_used_at TEXT,
      last_used_by_site_id TEXT,
      used_by_site_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_cdkeys_status ON cdkeys(status);
    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT
    );
  `);

  // Schema auto-migration: ensure max_uses column exists
  try {
    const cdkeyCols = db.prepare('PRAGMA table_info(cdkeys)').all();
    if (cdkeyCols && !cdkeyCols.some(c => c.name === 'max_uses')) {
      db.exec('ALTER TABLE cdkeys ADD COLUMN max_uses INTEGER DEFAULT 0');
    }
  } catch (e) {}
}

function rowToSite(row) {
  if (!row) return null;
  const site = {
    siteId: row.site_id,
    subdomain: row.subdomain || row.site_id,
    url: row.url,
    cdkey: row.cdkey,
    type: row.type,
    fileCount: row.file_count !== null ? Number(row.file_count) : 1,
    storage: row.storage || 'local',
    duration: row.duration || '3d',
    expiresAt: row.expires_at || null,
    userId: row.user_id || null,
    userEmail: row.user_email || null,
    visits: row.visits !== null ? Number(row.visits) : 0,
    renewedAt: row.renewed_at || null,
    lastCdkey: row.last_cdkey || null,
    createdAt: row.created_at
  };
  if (row.custom_path) site.customPath = row.custom_path;
  if (row.extra_meta) {
    try {
      const extra = JSON.parse(row.extra_meta);
      Object.assign(site, extra);
    } catch (e) {}
  }
  return site;
}

function siteToRow(site) {
  const siteId = site.siteId || site.id;
  const subdomain = site.subdomain || site.customPath || siteId;
  const customPath = site.customPath || null;
  const url = site.url || '';
  const cdkey = site.cdkey || null;
  const type = site.type || 'html';
  const fileCount = site.fileCount !== undefined ? Number(site.fileCount) : 1;
  const storage = site.storage || 'local';
  const duration = site.duration || '3d';
  const expiresAt = site.expiresAt || null;
  const userId = site.userId || null;
  const userEmail = site.userEmail || null;
  const visits = site.visits !== undefined ? Number(site.visits) : 0;
  const renewedAt = site.renewedAt || null;
  const lastCdkey = site.lastCdkey || null;
  const createdAt = site.createdAt || new Date().toISOString();

  return {
    site_id: siteId,
    subdomain,
    custom_path: customPath,
    url,
    cdkey,
    type,
    file_count: fileCount,
    storage,
    duration,
    expires_at: expiresAt,
    user_id: userId,
    user_email: userEmail,
    visits,
    renewed_at: renewedAt,
    last_cdkey: lastCdkey,
    created_at: createdAt,
    extra_meta: null
  };
}

function rowToCdkey(row) {
  if (!row) return null;
  return {
    key: row.key,
    duration: row.duration || '3d',
    status: row.status || 'unused',
    createdAt: row.created_at,
    usedAt: row.used_at || null,
    activatedAt: row.activated_at || null,
    expiresAt: row.expires_at || null,
    usedCount: row.used_count !== null ? Number(row.used_count) : 0,
    maxUses: row.max_uses !== null && row.max_uses !== undefined ? Number(row.max_uses) : 0,
    lastUsedAt: row.last_used_at || null,
    lastUsedBySiteId: row.last_used_by_site_id || null,
    usedBySiteId: row.used_by_site_id || null
  };
}

function cdkeyToRow(keyObj) {
  return {
    key: keyObj.key,
    duration: keyObj.duration || '3d',
    status: keyObj.status || 'unused',
    created_at: keyObj.createdAt || new Date().toISOString(),
    used_at: keyObj.usedAt || null,
    activated_at: keyObj.activatedAt || null,
    expires_at: keyObj.expiresAt || null,
    used_count: keyObj.usedCount !== undefined && keyObj.usedCount !== null ? Number(keyObj.usedCount) : 0,
    max_uses: keyObj.maxUses !== undefined && keyObj.maxUses !== null ? Number(keyObj.maxUses) : 0,
    last_used_at: keyObj.lastUsedAt || null,
    last_used_by_site_id: keyObj.lastUsedBySiteId || null,
    used_by_site_id: keyObj.usedBySiteId || null
  };
}

function migrateLegacyJson(db) {
  try {
    const configFile = path.join(DATA_DIR, 'config.json');
    const configCount = db.prepare('SELECT COUNT(*) as count FROM system_config').get();
    if (Number(configCount.count) === 0 && fs.existsSync(configFile)) {
      try {
        const raw = fs.readFileSync(configFile, 'utf-8');
        const configData = JSON.parse(raw);
        if (configData && typeof configData === 'object') {
          const insertStmt = db.prepare(`
            INSERT INTO system_config (key, value, updated_at)
            VALUES (?, ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
          `);
          const now = new Date().toISOString();
          for (const [k, v] of Object.entries(configData)) {
            insertStmt.run(k, JSON.stringify(v), now);
          }
          console.log('✅ 已成功从 config.json 迁移配置数据到 SQLite 数据库');
        }
      } catch (e) {
        console.warn('config.json migration warning:', e.message);
      }
    }

    const cdkeysFile = path.join(DATA_DIR, 'cdkeys.json');
    const cdkeyCount = db.prepare('SELECT COUNT(*) as count FROM cdkeys').get();
    if (Number(cdkeyCount.count) === 0 && fs.existsSync(cdkeysFile)) {
      try {
        const raw = fs.readFileSync(cdkeysFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          const insertStmt = db.prepare(`
            INSERT INTO cdkeys (key, duration, status, created_at, used_at, activated_at, expires_at, used_count, last_used_at, last_used_by_site_id, used_by_site_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(key) DO NOTHING
          `);
          db.exec('BEGIN TRANSACTION;');
          for (const item of list) {
            const r = cdkeyToRow(item);
            insertStmt.run(
              r.key, r.duration, r.status, r.created_at, r.used_at,
              r.activated_at, r.expires_at, r.used_count, r.last_used_at,
              r.last_used_by_site_id, r.used_by_site_id
            );
          }
          db.exec('COMMIT;');
          console.log('✅ 已成功从 cdkeys.json 迁移 ' + list.length + ' 条卡密数据到 SQLite 数据库');
        }
      } catch (e) {
        try { db.exec('ROLLBACK;'); } catch (r) {}
        console.warn('cdkeys.json migration warning:', e.message);
      }
    }

    const sitesFile = path.join(DATA_DIR, 'sites.json');
    const siteCount = db.prepare('SELECT COUNT(*) as count FROM sites').get();
    if (Number(siteCount.count) === 0 && fs.existsSync(sitesFile)) {
      try {
        const raw = fs.readFileSync(sitesFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          const insertStmt = db.prepare(`
            INSERT INTO sites (site_id, subdomain, custom_path, url, cdkey, type, file_count, storage, duration, expires_at, user_id, user_email, visits, renewed_at, last_cdkey, created_at, extra_meta)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(site_id) DO NOTHING
          `);
          db.exec('BEGIN TRANSACTION;');
          for (const item of list) {
            const r = siteToRow(item);
            insertStmt.run(
              r.site_id, r.subdomain, r.custom_path, r.url, r.cdkey,
              r.type, r.file_count, r.storage, r.duration, r.expires_at,
              r.user_id, r.user_email, r.visits, r.renewed_at, r.last_cdkey,
              r.created_at, r.extra_meta
            );
          }
          db.exec('COMMIT;');
          console.log('✅ 已成功从 sites.json 迁移 ' + list.length + ' 个站点数据到 SQLite 数据库');
        }
      } catch (e) {
        try { db.exec('ROLLBACK;'); } catch (r) {}
        console.warn('sites.json migration warning:', e.message);
      }
    }
  } catch (err) {
    console.error('Migration error:', err.message);
  }
}

const db = {
  get instance() {
    return initDatabase();
  },

  sites: {
    getAll() {
      const dbInst = initDatabase();
      if (dbInst) {
        const rows = dbInst.prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
        return rows.map(rowToSite);
      }
      const list = readJsonFile('sites.json', []);
      return Array.isArray(list) ? list.map(rowToSite) : [];
    },

    getById(siteId) {
      if (!siteId) return null;
      const dbInst = initDatabase();
      if (dbInst) {
        const row = dbInst.prepare('SELECT * FROM sites WHERE site_id = ?').get(siteId);
        return row ? rowToSite(row) : null;
      }
      return this.getAll().find(s => s.siteId === siteId) || null;
    },

    findByDomainOrId(query) {
      if (!query) return null;
      const clean = query.trim().toLowerCase();
      const dbInst = initDatabase();
      if (dbInst) {
        const row = dbInst.prepare(`
          SELECT * FROM sites 
          WHERE LOWER(subdomain) = ? 
             OR LOWER(custom_path) = ? 
             OR LOWER(site_id) = ? 
          LIMIT 1
        `).get(clean, clean, clean);
        return row ? rowToSite(row) : null;
      }
      return this.getAll().find(s => 
        (s.subdomain && s.subdomain.toLowerCase() === clean) ||
        (s.customPath && s.customPath.toLowerCase() === clean) ||
        (s.siteId && s.siteId.toLowerCase() === clean)
      ) || null;
    },

    findByUserIdOrEmail(userId, userEmail) {
      if (!userId && !userEmail) return [];
      const cleanEmail = userEmail ? userEmail.trim().toLowerCase() : null;
      const dbInst = initDatabase();
      if (dbInst) {
        let rows = [];
        if (userId && cleanEmail) {
          rows = dbInst.prepare(`
            SELECT * FROM sites 
            WHERE user_id = ? OR (user_email IS NOT NULL AND LOWER(user_email) = ?)
            ORDER BY created_at DESC
          `).all(userId, cleanEmail);
        } else if (userId) {
          rows = dbInst.prepare('SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC').all(userId);
        } else {
          rows = dbInst.prepare('SELECT * FROM sites WHERE user_email IS NOT NULL AND LOWER(user_email) = ? ORDER BY created_at DESC').all(cleanEmail);
        }
        return rows.map(rowToSite);
      }
      return this.getAll().filter(s => {
        if (userId && s.userId === userId) return true;
        if (cleanEmail && s.userEmail && s.userEmail.toLowerCase() === cleanEmail) return true;
        return false;
      });
    },

    isDomainTaken(name) {
      if (!name) return false;
      const clean = name.trim().toLowerCase();
      const dbInst = initDatabase();
      if (dbInst) {
        const row = dbInst.prepare(`
          SELECT 1 FROM sites 
          WHERE LOWER(subdomain) = ? 
             OR LOWER(custom_path) = ? 
             OR LOWER(site_id) = ? 
          LIMIT 1
        `).get(clean, clean, clean);
        return Boolean(row);
      }
      return Boolean(this.findByDomainOrId(name));
    },

    save(site) {
      const r = siteToRow(site);
      const dbInst = initDatabase();
      if (dbInst) {
        const stmt = dbInst.prepare(`
          INSERT INTO sites (
            site_id, subdomain, custom_path, url, cdkey, type, file_count, 
            storage, duration, expires_at, user_id, user_email, visits, 
            renewed_at, last_cdkey, created_at, extra_meta
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(site_id) DO UPDATE SET
            subdomain = excluded.subdomain,
            custom_path = excluded.custom_path,
            url = excluded.url,
            cdkey = excluded.cdkey,
            type = excluded.type,
            file_count = excluded.file_count,
            storage = excluded.storage,
            duration = excluded.duration,
            expires_at = excluded.expires_at,
            user_id = excluded.user_id,
            user_email = excluded.user_email,
            visits = excluded.visits,
            renewed_at = excluded.renewed_at,
            last_cdkey = excluded.last_cdkey,
            created_at = excluded.created_at,
            extra_meta = excluded.extra_meta
        `);
        stmt.run(
          r.site_id, r.subdomain, r.custom_path, r.url, r.cdkey,
          r.type, r.file_count, r.storage, r.duration, r.expires_at,
          r.user_id, r.user_email, r.visits, r.renewed_at, r.last_cdkey,
          r.created_at, r.extra_meta
        );
        const saved = this.getById(r.site_id);
        try { saveJsonBackup('sites.json', this.getAll()); } catch (_) {}
        return saved;
      }
      const list = this.getAll();
      const normalized = rowToSite(r);
      const idx = list.findIndex(s => s.siteId === normalized.siteId);
      if (idx >= 0) {
        list[idx] = Object.assign({}, list[idx], normalized);
      } else {
        list.unshift(normalized);
      }
      saveJsonBackup('sites.json', list);
      return normalized;
    },

    delete(siteId) {
      if (!siteId) return false;
      const dbInst = initDatabase();
      if (dbInst) {
        const res = dbInst.prepare('DELETE FROM sites WHERE site_id = ?').run(siteId);
        const success = res.changes > 0;
        if (success) {
          try { saveJsonBackup('sites.json', this.getAll()); } catch (_) {}
        }
        return success;
      }
      const list = this.getAll();
      const filtered = list.filter(s => s.siteId !== siteId);
      if (filtered.length !== list.length) {
        saveJsonBackup('sites.json', filtered);
        return true;
      }
      return false;
    },

    incrementVisits(siteId) {
      if (!siteId) return;
      const dbInst = initDatabase();
      if (dbInst) {
        dbInst.prepare('UPDATE sites SET visits = visits + 1 WHERE site_id = ?').run(siteId);
        return;
      }
      const list = this.getAll();
      const item = list.find(s => s.siteId === siteId);
      if (item) {
        item.visits = (Number(item.visits) || 0) + 1;
        saveJsonBackup('sites.json', list);
      }
    }
  },

  cdkeys: {
    getAll() {
      const dbInst = initDatabase();
      if (dbInst) {
        const rows = dbInst.prepare('SELECT * FROM cdkeys ORDER BY created_at DESC').all();
        return rows.map(rowToCdkey);
      }
      const list = readJsonFile('cdkeys.json', []);
      return Array.isArray(list) ? list.map(rowToCdkey) : [];
    },

    getByKey(key) {
      if (!key) return null;
      const clean = key.trim().toUpperCase();
      const dbInst = initDatabase();
      if (dbInst) {
        const row = dbInst.prepare('SELECT * FROM cdkeys WHERE UPPER(key) = ?').get(clean);
        return row ? rowToCdkey(row) : null;
      }
      return this.getAll().find(k => k.key && k.key.toUpperCase() === clean) || null;
    },

    save(keyObj) {
      const r = cdkeyToRow(keyObj);
      const dbInst = initDatabase();
      if (dbInst) {
        const stmt = dbInst.prepare(`
          INSERT INTO cdkeys (
            key, duration, status, created_at, used_at, activated_at, 
            expires_at, used_count, max_uses, last_used_at, last_used_by_site_id, used_by_site_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            duration = excluded.duration,
            status = excluded.status,
            created_at = excluded.created_at,
            used_at = excluded.used_at,
            activated_at = excluded.activated_at,
            expires_at = excluded.expires_at,
            used_count = excluded.used_count,
            max_uses = excluded.max_uses,
            last_used_at = excluded.last_used_at,
            last_used_by_site_id = excluded.last_used_by_site_id,
            used_by_site_id = excluded.used_by_site_id
        `);
        stmt.run(
          r.key, r.duration, r.status, r.created_at, r.used_at,
          r.activated_at, r.expires_at, r.used_count, r.max_uses, r.last_used_at,
          r.last_used_by_site_id, r.used_by_site_id
        );
        const saved = this.getByKey(r.key);
        try { saveJsonBackup('cdkeys.json', this.getAll()); } catch (_) {}
        return saved;
      }
      const list = this.getAll();
      const normalized = rowToCdkey(r);
      const idx = list.findIndex(k => k.key && k.key.toUpperCase() === normalized.key.toUpperCase());
      if (idx >= 0) {
        list[idx] = Object.assign({}, list[idx], normalized);
      } else {
        list.unshift(normalized);
      }
      saveJsonBackup('cdkeys.json', list);
      return normalized;
    },

    saveAll(keyObjects) {
      if (!Array.isArray(keyObjects) || keyObjects.length === 0) return;
      const dbInst = initDatabase();
      if (dbInst) {
        const stmt = dbInst.prepare(`
          INSERT INTO cdkeys (
            key, duration, status, created_at, used_at, activated_at, 
            expires_at, used_count, max_uses, last_used_at, last_used_by_site_id, used_by_site_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET
            duration = excluded.duration,
            status = excluded.status,
            created_at = excluded.created_at,
            used_at = excluded.used_at,
            activated_at = excluded.activated_at,
            expires_at = excluded.expires_at,
            used_count = excluded.used_count,
            max_uses = excluded.max_uses,
            last_used_at = excluded.last_used_at,
            last_used_by_site_id = excluded.last_used_by_site_id,
            used_by_site_id = excluded.used_by_site_id
        `);

        dbInst.exec('BEGIN TRANSACTION;');
        try {
          for (const k of keyObjects) {
            const r = cdkeyToRow(k);
            stmt.run(
              r.key, r.duration, r.status, r.created_at, r.used_at,
              r.activated_at, r.expires_at, r.used_count, r.max_uses, r.last_used_at,
              r.last_used_by_site_id, r.used_by_site_id
            );
          }
          dbInst.exec('COMMIT;');
          try { saveJsonBackup('cdkeys.json', this.getAll()); } catch (_) {}
        } catch (err) {
          dbInst.exec('ROLLBACK;');
          throw err;
        }
        return;
      }
      const list = this.getAll();
      for (const k of keyObjects) {
        const normalized = rowToCdkey(cdkeyToRow(k));
        const idx = list.findIndex(item => item.key && item.key.toUpperCase() === normalized.key.toUpperCase());
        if (idx >= 0) {
          list[idx] = Object.assign({}, list[idx], normalized);
        } else {
          list.unshift(normalized);
        }
      }
      saveJsonBackup('cdkeys.json', list);
    },

    delete(key) {
      if (!key) return false;
      const clean = key.trim().toUpperCase();
      const dbInst = initDatabase();
      if (dbInst) {
        const res = dbInst.prepare('DELETE FROM cdkeys WHERE UPPER(key) = ?').run(clean);
        const success = res.changes > 0;
        if (success) {
          try { saveJsonBackup('cdkeys.json', this.getAll()); } catch (_) {}
        }
        return success;
      }
      const list = this.getAll();
      const filtered = list.filter(k => !k.key || k.key.toUpperCase() !== clean);
      if (filtered.length !== list.length) {
        saveJsonBackup('cdkeys.json', filtered);
        return true;
      }
      return false;
    },

    cleanByType(type) {
      const dbInst = initDatabase();
      if (dbInst) {
        let res;
        if (type === 'all') {
          res = dbInst.prepare('DELETE FROM cdkeys').run();
        } else if (type === 'used') {
          res = dbInst.prepare(`DELETE FROM cdkeys WHERE status = 'used'`).run();
        } else if (type === 'unused') {
          res = dbInst.prepare(`DELETE FROM cdkeys WHERE status = 'unused'`).run();
        } else if (type === 'expired') {
          res = dbInst.prepare(`DELETE FROM cdkeys WHERE status = 'expired'`).run();
        } else {
          return { deletedCount: 0 };
        }
        try { saveJsonBackup('cdkeys.json', this.getAll()); } catch (_) {}
        return { deletedCount: res.changes || 0 };
      }
      const list = this.getAll();
      let filtered = list;
      if (type === 'all') {
        filtered = [];
      } else if (type === 'used') {
        filtered = list.filter(k => k.status !== 'used');
      } else if (type === 'unused') {
        filtered = list.filter(k => k.status !== 'unused');
      } else if (type === 'expired') {
        filtered = list.filter(k => k.status !== 'expired');
      }
      const deletedCount = list.length - filtered.length;
      saveJsonBackup('cdkeys.json', filtered);
      return { deletedCount };
    }
  },

  config: {
    _cache: null,

    _loadCache() {
      const dbInst = initDatabase();
      if (dbInst) {
        try {
          const rows = dbInst.prepare('SELECT key, value FROM system_config').all();
          const result = {};
          for (const row of rows) {
            try {
              result[row.key] = JSON.parse(row.value);
            } catch (e) {
              result[row.key] = row.value;
            }
          }
          this._cache = result;
        } catch (err) {
          this._cache = {};
        }
        return this._cache;
      }
      if (!this._cache) {
        this._cache = readJsonFile('config.json', {});
      }
      return this._cache;
    },

    get(key, defaultValue = null) {
      if (!this._cache) this._loadCache();
      if (this._cache.hasOwnProperty(key)) {
        return this._cache[key] !== undefined ? this._cache[key] : defaultValue;
      }
      return defaultValue;
    },

    getAll() {
      if (!this._cache) this._loadCache();
      return { ...this._cache };
    },

    set(key, value) {
      const dbInst = initDatabase();
      if (dbInst) {
        const strVal = JSON.stringify(value);
        const now = new Date().toISOString();
        dbInst.prepare(`
          INSERT INTO system_config (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `).run(key, strVal, now);
        if (!this._cache) this._loadCache();
        this._cache[key] = value;
        try { saveJsonBackup('config.json', this._cache); } catch (_) {}
        return value;
      }
      const cfg = this._loadCache();
      cfg[key] = value;
      saveJsonBackup('config.json', cfg);
      return value;
    },

    setMultiple(configObj) {
      if (!configObj || typeof configObj !== 'object') return;
      const dbInst = initDatabase();
      if (dbInst) {
        const stmt = dbInst.prepare(`
          INSERT INTO system_config (key, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
        `);

        const now = new Date().toISOString();
        dbInst.exec('BEGIN TRANSACTION;');
        try {
          for (const [k, v] of Object.entries(configObj)) {
            stmt.run(k, JSON.stringify(v), now);
          }
          dbInst.exec('COMMIT;');
          if (!this._cache) this._loadCache();
          Object.assign(this._cache, configObj);
          try { saveJsonBackup('config.json', this._cache); } catch (_) {}
        } catch (err) {
          dbInst.exec('ROLLBACK;');
          throw err;
        }
        return;
      }
      const cfg = this._loadCache();
      Object.assign(cfg, configObj);
      saveJsonBackup('config.json', cfg);
    }
  }
};

module.exports = db;
