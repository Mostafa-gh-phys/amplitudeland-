import crypto from 'node:crypto';
import type { UserRole } from './types.ts';

export interface StoredUserRecord {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  salt: string;
  keyHash: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateUsername(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    return 'Username must be between 3 and 32 characters.';
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return 'Username may contain only letters, numbers, dots, underscores, and hyphens.';
  }
  return null;
}

export function validateLoginKey(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length < 8) {
    return 'Login key must be at least 8 characters long.';
  }
  if (raw.length > 128) {
    return 'Login key cannot exceed 128 characters.';
  }
  return null;
}

export function hashLoginKey(loginKey: string, existingSalt?: string): { salt: string; keyHash: string } {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const keyHash = crypto.scryptSync(loginKey, salt, 64).toString('hex');
  return { salt, keyHash };
}

export function verifyLoginKey(loginKey: string, salt: string, expectedHexHash: string): boolean {
  if (!loginKey || !salt || !expectedHexHash) return false;
  try {
    const actual = crypto.scryptSync(loginKey, salt, 64);
    const expected = Buffer.from(expectedHexHash, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export const ADMIN_LOCK_ITERATIONS = 100000 as const;

export function hashPortableAdminKey(
  loginKey: string,
  existingSalt?: string,
): {
  algorithm: 'pbkdf2-sha256';
  iterations: typeof ADMIN_LOCK_ITERATIONS;
  salt: string;
  keyHash: string;
} {
  const salt = existingSalt || crypto.randomBytes(16).toString('hex');
  const keyHash = crypto
    .pbkdf2Sync(loginKey, salt, ADMIN_LOCK_ITERATIONS, 32, 'sha256')
    .toString('hex');
  return {
    algorithm: 'pbkdf2-sha256',
    iterations: ADMIN_LOCK_ITERATIONS,
    salt,
    keyHash,
  };
}

export function verifyPortableAdminKey(
  loginKey: string,
  salt: string,
  expectedHexHash: string,
  iterations: number = ADMIN_LOCK_ITERATIONS,
): boolean {
  if (!loginKey || !salt || !expectedHexHash || !Number.isFinite(iterations) || iterations < 10000) {
    return false;
  }
  try {
    const actual = crypto.pbkdf2Sync(loginKey, salt, Math.floor(iterations), 32, 'sha256');
    const expected = Buffer.from(expectedHexHash, 'hex');
    if (actual.length !== expected.length) return false;
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateAccessKey(): string {
  const bytes = crypto.randomBytes(18).toString('base64url');
  return `amp_${bytes}`;
}

export function canPublishArticles(role: UserRole): boolean {
  return role === 'admin' || role === 'editor';
}

export function canManageCategories(role: UserRole): boolean {
  return role === 'admin' || role === 'editor';
}

export function canManageUsersAndGitHub(role: UserRole): boolean {
  return role === 'admin';
}

export function sanitizeCustomDomain(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (!cleaned) return '';
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(cleaned)) {
    return '';
  }
  return cleaned;
}

export function isGitHubOwnedDomain(raw: string): boolean {
  const cleaned = sanitizeCustomDomain(raw);
  return cleaned.endsWith('.github.io') || cleaned === 'github.io';
}

export function isValidCustomDomain(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  return Boolean(sanitizeCustomDomain(trimmed));
}

export function computeGitHubPagesUrl(
  owner: string,
  repo: string,
  customDomain?: string,
): string {
  const domain = customDomain ? sanitizeCustomDomain(customDomain) : '';
  if (domain && !isGitHubOwnedDomain(domain)) {
    return `https://${domain}`;
  }
  const cleanOwner = owner.trim() || 'username';
  const cleanRepo = repo.trim() || 'amplitudeland';
  if (cleanRepo.toLowerCase() === `${cleanOwner.toLowerCase()}.github.io`) {
    return `https://${cleanOwner}.github.io`;
  }
  return `https://${cleanOwner}.github.io/${cleanRepo}`;
}
