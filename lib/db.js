const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = path.join(DATA_DIR, 'app.db');

let dbInstance = null;

function initDatabase() {
  if (dbInstance) return dbInstance;

  try {
    const { DatabaseSync } = require('node:sqlite');
    dbInstance = new DatabaseSync(DB_FILE);
  } catch (err) {
    try {
      const Database = require('better-sqlite3');
      dbInstance = new Database(DB_FILE);
    } catch (e2) {
      console.error('Fatal: Failed to load SQLite database engine:', e2.message);
      throw new Error('No SQLite driver available. Please run with Node 22+ or install better-sqlite3.');
    }
  }

  try {
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
  } catch (pragmaErr) {
    console.warn('SQLite PRAGMA setup warning:', pragmaErr.message);
  }

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
      const rows = initDatabase().prepare('SELECT * FROM sites ORDER BY created_at DESC').all();
      return rows.map(rowToSite);
    },

    getById(siteId) {
      if (!siteId) return null;
      const row = initDatabase().prepare('SELECT * FROM sites WHERE site_id = ?').get(siteId);
      return row ? rowToSite(row) : null;
    },

    findByDomainOrId(query) {
      if (!query) return null;
      const clean = query.trim().toLowerCase();
      const row = initDatabase().prepare(`
        SELECT * FROM sites 
        WHERE LOWER(subdomain) = ? 
           OR LOWER(custom_path) = ? 
           OR LOWER(site_id) = ? 
        LIMIT 1
      `).get(clean, clean, clean);
      return row ? rowToSite(row) : null;
    },

    findByUserIdOrEmail(userId, userEmail) {
      if (!userId && !userEmail) return [];
      const cleanEmail = userEmail ? userEmail.trim().toLowerCase() : null;
      let rows = [];
      if (userId && cleanEmail) {
        rows = initDatabase().prepare(`
          SELECT * FROM sites 
          WHERE user_id = ? OR (user_email IS NOT NULL AND LOWER(user_email) = ?)
          ORDER BY created_at DESC
        `).all(userId, cleanEmail);
      } else if (userId) {
        rows = initDatabase().prepare(`
          SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC
        `).all(userId);
      } else {
        rows = initDatabase().prepare(`
          SELECT * FROM sites WHERE user_email IS NOT NULL AND LOWER(user_email) = ? ORDER BY created_at DESC
        `).all(cleanEmail);
      }
      return rows.map(rowToSite);
    },

    isDomainTaken(name) {
      if (!name) return false;
      const clean = name.trim().toLowerCase();
      const row = initDatabase().prepare(`
        SELECT 1 FROM sites 
        WHERE LOWER(subdomain) = ? 
           OR LOWER(custom_path) = ? 
           OR LOWER(site_id) = ? 
        LIMIT 1
      `).get(clean, clean, clean);
      return Boolean(row);
    },

    save(site) {
      const r = siteToRow(site);
      const stmt = initDatabase().prepare(`
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
      return this.getById(r.site_id);
    },

    delete(siteId) {
      if (!siteId) return false;
      const res = initDatabase().prepare('DELETE FROM sites WHERE site_id = ?').run(siteId);
      return res.changes > 0;
    },

    incrementVisits(siteId) {
      if (!siteId) return;
      initDatabase().prepare('UPDATE sites SET visits = visits + 1 WHERE site_id = ?').run(siteId);
    }
  },

  cdkeys: {
    getAll() {
      const rows = initDatabase().prepare('SELECT * FROM cdkeys ORDER BY created_at DESC').all();
      return rows.map(rowToCdkey);
    },

    getByKey(key) {
      if (!key) return null;
      const clean = key.trim().toUpperCase();
      const row = initDatabase().prepare('SELECT * FROM cdkeys WHERE UPPER(key) = ?').get(clean);
      return row ? rowToCdkey(row) : null;
    },

    save(keyObj) {
      const r = cdkeyToRow(keyObj);
      const stmt = initDatabase().prepare(`
        INSERT INTO cdkeys (
          key, duration, status, created_at, used_at, activated_at, 
          expires_at, used_count, last_used_at, last_used_by_site_id, used_by_site_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          duration = excluded.duration,
          status = excluded.status,
          created_at = excluded.created_at,
          used_at = excluded.used_at,
          activated_at = excluded.activated_at,
          expires_at = excluded.expires_at,
          used_count = excluded.used_count,
          last_used_at = excluded.last_used_at,
          last_used_by_site_id = excluded.last_used_by_site_id,
          used_by_site_id = excluded.used_by_site_id
      `);
      stmt.run(
        r.key, r.duration, r.status, r.created_at, r.used_at,
        r.activated_at, r.expires_at, r.used_count, r.last_used_at,
        r.last_used_by_site_id, r.used_by_site_id
      );
      return this.getByKey(r.key);
    },

    saveAll(keyObjects) {
      if (!Array.isArray(keyObjects) || keyObjects.length === 0) return;
      const dbInst = initDatabase();
      const stmt = dbInst.prepare(`
        INSERT INTO cdkeys (
          key, duration, status, created_at, used_at, activated_at, 
          expires_at, used_count, last_used_at, last_used_by_site_id, used_by_site_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          duration = excluded.duration,
          status = excluded.status,
          created_at = excluded.created_at,
          used_at = excluded.used_at,
          activated_at = excluded.activated_at,
          expires_at = excluded.expires_at,
          used_count = excluded.used_count,
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
            r.activated_at, r.expires_at, r.used_count, r.last_used_at,
            r.last_used_by_site_id, r.used_by_site_id
          );
        }
        dbInst.exec('COMMIT;');
      } catch (err) {
        dbInst.exec('ROLLBACK;');
        throw err;
      }
    },

    delete(key) {
      if (!key) return false;
      const clean = key.trim().toUpperCase();
      const res = initDatabase().prepare('DELETE FROM cdkeys WHERE UPPER(key) = ?').run(clean);
      return res.changes > 0;
    },

    cleanByType(type) {
      const dbInst = initDatabase();
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
      return { deletedCount: res.changes || 0 };
    }
  },

  config: {
    get(key, defaultValue = null) {
      const row = initDatabase().prepare('SELECT value FROM system_config WHERE key = ?').get(key);
      if (!row || row.value === undefined || row.value === null) return defaultValue;
      try {
        return JSON.parse(row.value);
      } catch (e) {
        return row.value;
      }
    },

    getAll() {
      const rows = initDatabase().prepare('SELECT key, value FROM system_config').all();
      const result = {};
      for (const row of rows) {
        try {
          result[row.key] = JSON.parse(row.value);
        } catch (e) {
          result[row.key] = row.value;
        }
      }
      return result;
    },

    set(key, value) {
      const strVal = JSON.stringify(value);
      const now = new Date().toISOString();
      initDatabase().prepare(`
        INSERT INTO system_config (key, value, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
      `).run(key, strVal, now);
      return value;
    },

    setMultiple(configObj) {
      if (!configObj || typeof configObj !== 'object') return;
      const dbInst = initDatabase();
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
      } catch (err) {
        dbInst.exec('ROLLBACK;');
        throw err;
      }
    }
  }
};

module.exports = db;
