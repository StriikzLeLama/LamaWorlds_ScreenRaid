#!/usr/bin/env node
/**
 * Migrate ScreenRaid Rust SQLite → Cloudflare D1 (accounts + social graph).
 *
 * Usage:
 *   node scripts/migrate-from-sqlite.mjs path/to/screenraid.db [--remote] [--dry-run]
 *
 * Imports: users (with argon2 hashes), user_consent, rooms, room_members,
 * friendships, user_totp (if present), monitor_layouts.
 * Skips refresh_tokens (users re-login). Media blobs are NOT uploaded to R2
 * (metadata-only optional via --media-meta).
 */
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const cloudRoot = join(scriptsDir, '..');

const args = process.argv.slice(2);
const dbPath = args.find((a) => !a.startsWith('--'));
const remote = args.includes('--remote');
const dryRun = args.includes('--dry-run');
const mediaMeta = args.includes('--media-meta');

if (!dbPath) {
  console.error(
    'Usage: node scripts/migrate-from-sqlite.mjs <screenraid.db> [--remote] [--dry-run] [--media-meta]',
  );
  process.exit(1);
}

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
}

function tableExists(db, name) {
  const row = db
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?`)
    .get(name);
  return !!row;
}

const db = new DatabaseSync(dbPath, { readOnly: true });
const statements = [];
// Note: remote D1 via `wrangler d1 execute` rejects BEGIN/COMMIT — send plain statements.

const users = db.prepare(`SELECT * FROM users`).all();
console.log(`users: ${users.length}`);
for (const u of users) {
  statements.push(
    `INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, avatar_url, is_active, created_at, updated_at)
     VALUES (${esc(u.id)}, ${esc(u.username)}, ${esc(u.email)}, ${esc(u.password_hash)}, ${esc(u.display_name)}, ${esc(u.avatar_url)}, ${esc(u.is_active ?? 1)}, ${esc(u.created_at)}, ${esc(u.updated_at)});`,
  );
}

if (tableExists(db, 'user_consent')) {
  const rows = db.prepare(`SELECT * FROM user_consent`).all();
  console.log(`user_consent: ${rows.length}`);
  for (const r of rows) {
    statements.push(
      `INSERT OR IGNORE INTO user_consent (user_id, global_consent, is_paused, room_consents, consented_at, updated_at)
       VALUES (${esc(r.user_id)}, ${esc(r.global_consent ?? 0)}, ${esc(r.is_paused ?? 0)}, ${esc(r.room_consents ?? '{}')}, ${esc(r.consented_at)}, ${esc(r.updated_at)});`,
    );
  }
}

if (tableExists(db, 'rooms')) {
  const rows = db.prepare(`SELECT * FROM rooms`).all();
  console.log(`rooms: ${rows.length}`);
  for (const r of rows) {
    statements.push(
      `INSERT OR IGNORE INTO rooms (id, name, invite_code, owner_id, max_members, is_active, created_at, updated_at)
       VALUES (${esc(r.id)}, ${esc(r.name)}, ${esc(r.invite_code)}, ${esc(r.owner_id)}, ${esc(r.max_members ?? 20)}, ${esc(r.is_active ?? 1)}, ${esc(r.created_at)}, ${esc(r.updated_at)});`,
    );
  }
}

if (tableExists(db, 'room_members')) {
  const rows = db.prepare(`SELECT * FROM room_members`).all();
  console.log(`room_members: ${rows.length}`);
  for (const r of rows) {
    statements.push(
      `INSERT OR IGNORE INTO room_members (room_id, user_id, role, joined_at)
       VALUES (${esc(r.room_id)}, ${esc(r.user_id)}, ${esc(r.role ?? 'member')}, ${esc(r.joined_at)});`,
    );
  }
}

if (tableExists(db, 'friendships')) {
  const rows = db.prepare(`SELECT * FROM friendships`).all();
  console.log(`friendships: ${rows.length}`);
  for (const r of rows) {
    statements.push(
      `INSERT OR IGNORE INTO friendships (id, requester_id, addressee_id, status, created_at, updated_at)
       VALUES (${esc(r.id)}, ${esc(r.requester_id)}, ${esc(r.addressee_id)}, ${esc(r.status)}, ${esc(r.created_at)}, ${esc(r.updated_at)});`,
    );
  }
}

if (tableExists(db, 'user_totp')) {
  const rows = db.prepare(`SELECT * FROM user_totp`).all();
  console.log(`user_totp: ${rows.length}`);
  for (const r of rows) {
    statements.push(
      `INSERT OR IGNORE INTO user_totp (user_id, secret_encrypted, enabled, recovery_hashes, created_at, updated_at)
       VALUES (${esc(r.user_id)}, ${esc(r.secret_encrypted)}, ${esc(r.enabled ?? 0)}, ${esc(r.recovery_hashes ?? '[]')}, ${esc(r.created_at)}, ${esc(r.updated_at)});`,
    );
  }
}

if (tableExists(db, 'monitor_layouts')) {
  // Rust schema may be normalized monitors table; cloud uses JSON blob.
  // Try JSON column first, else skip with note.
  try {
    const rows = db.prepare(`SELECT * FROM monitor_layouts`).all();
    console.log(`monitor_layouts: ${rows.length}`);
    for (const r of rows) {
      if (r.monitors != null) {
        statements.push(
          `INSERT OR IGNORE INTO monitor_layouts (user_id, monitors, updated_at)
           VALUES (${esc(r.user_id)}, ${esc(typeof r.monitors === 'string' ? r.monitors : JSON.stringify(r.monitors))}, ${esc(r.updated_at)});`,
        );
      } else if (r.user_id) {
        console.warn(`  skip layout for ${r.user_id} (no JSON monitors column — migrate monitors separately if needed)`);
      }
    }
  } catch (e) {
    console.warn('monitor_layouts skipped:', e.message);
  }
}

if (mediaMeta && tableExists(db, 'media')) {
  const rows = db.prepare(`SELECT * FROM media`).all();
  console.log(`media metadata: ${rows.length} (blobs NOT uploaded — re-upload or use R2 sync)`);
  for (const r of rows) {
    const key = r.storage_key || r.storage_path || `migrated/${r.id}`;
    statements.push(
      `INSERT OR IGNORE INTO media
       (id, uploader_id, room_id, filename, original_name, mime_type, size_bytes, media_type, storage_key, hash_sha256, duration_ms, width, height, is_approved, created_at)
       VALUES (${esc(r.id)}, ${esc(r.uploader_id)}, ${esc(r.room_id)}, ${esc(r.filename)}, ${esc(r.original_name)}, ${esc(r.mime_type)}, ${esc(r.size_bytes)}, ${esc(r.media_type)}, ${esc(key)}, ${esc(r.hash_sha256)}, ${esc(r.duration_ms)}, ${esc(r.width)}, ${esc(r.height)}, ${esc(r.is_approved ?? 1)}, ${esc(r.created_at)});`,
    );
  }
}

db.close();

const sql = statements.join('\n');
const dir = mkdtempSync(join(tmpdir(), 'screenraid-migrate-'));
const sqlPath = join(dir, 'import.sql');
writeFileSync(sqlPath, sql, 'utf8');
console.log(`\nWrote ${statements.length} statements → ${sqlPath}`);

if (dryRun) {
  console.log('Dry run — not applying to D1.');
  process.exit(0);
}

const wranglerArgs = [
  'd1',
  'execute',
  'screenraid',
  ...(remote ? ['--remote'] : ['--local']),
  '--file',
  sqlPath,
  '--yes',
];
console.log(`Running: npx wrangler ${wranglerArgs.join(' ')}`);
const res = spawnSync('npx', ['wrangler', ...wranglerArgs], {
  stdio: 'inherit',
  shell: true,
  cwd: cloudRoot,
});
process.exit(res.status ?? 1);
