import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
import path from 'node:path';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import {
  canManageCategories,
  canManageUsersAndGitHub,
  canPublishArticles,
  computeGitHubPagesUrl,
  generateAccessKey,
  hashLoginKey,
  isGitHubOwnedDomain,
  isValidCustomDomain,
  normalizeUsername,
  sanitizeCustomDomain,
  type StoredUserRecord,
  validateLoginKey,
  validateUsername,
  verifyLoginKey,
} from './src/lib/auth.ts';
import {
  countLatexEquations,
  estimateReadingTime,
  extractTocHeadings,
  parseArticleMarkdown,
  serializeArticleMarkdown,
  slugify,
} from './src/lib/frontmatter.ts';
import { loadArticlesFromDiskOrSeed } from './src/lib/contentLoader.ts';
import { renderMarkdownLatex } from './src/lib/markdownLatex.ts';
import { SEED_CATEGORIES, SEED_COMMITS } from './src/lib/seedArticles.ts';
import {
  buildGitHubPagesBundle,
  buildStaticSite,
  generateGitHubPagesWorkflowYaml,
  generateNextJsSsgScaffold,
} from './src/lib/ssg.ts';
import type {
  Article,
  ArticleInput,
  AuthSessionState,
  CategoryMeta,
  CommitRecord,
  GitHubConfig,
  PublicUser,
  StaticBuildManifest,
  UserRole,
} from './src/lib/types.ts';

interface GitHubSession {
  id: string;
  token: string;
  username: string;
  avatarUrl?: string;
  createdAt: number;
}

interface AuthSessionRecord {
  id: string;
  userId: string;
  createdAt: number;
}

const PORT = Number(process.env.PORT) || 3000;
const APP_URL = (process.env.APP_URL || `http://localhost:${PORT}`).replace(/\/+$/, '');
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || '';
const ENV_ADMIN_USERNAME = (process.env.ADMIN_USERNAME || 'admin').trim();
const ENV_ADMIN_LOGIN_KEY = process.env.ADMIN_LOGIN_KEY || '';
const AUTH_STORE_PATH = path.resolve(process.cwd(), '.amplitudeland-auth.json');

// In-memory CMS repository store (hydrated from content/posts/*.md + scientific seed fallback)
let articles: Article[] = loadArticlesFromDiskOrSeed(process.cwd(), 'content/posts');
let categories: CategoryMeta[] = SEED_CATEGORIES.map((c) => ({ ...c }));
let commits: CommitRecord[] = SEED_COMMITS.map((c) => ({ ...c }));

let repoConfig: {
  owner: string;
  repo: string;
  branch: string;
  contentDir: string;
  pagesBranch: string;
  customDomain?: string;
  livePagesUrl?: string;
  pagesEnabled?: boolean;
  pagesBuildStatus?: 'built' | 'building' | 'errored' | 'not_enabled' | 'unknown';
  pagesConfiguredBranch?: string;
  isPrivateRepo?: boolean;
  lastSyncedAt?: string;
  lastPagesPublishedAt?: string;
} = {
  owner: 'amplitudeland',
  repo: 'amplitudeland.github.io',
  branch: 'main',
  contentDir: 'content/posts',
  pagesBranch: 'gh-pages',
};

// Server-side OAuth state, GitHub session, and Auth session stores (tokens never leave the server)
const oauthStates = new Map<string, number>();
const githubSessions = new Map<string, GitHubSession>();
const authSessions = new Map<string, AuthSessionRecord>();

function loadStoredUsers(): StoredUserRecord[] {
  try {
    if (!fs.existsSync(AUTH_STORE_PATH)) return [];
    const raw = fs.readFileSync(AUTH_STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as StoredUserRecord[]) : [];
  } catch {
    return [];
  }
}

function persistStoredUsers(list: StoredUserRecord[]) {
  try {
    fs.writeFileSync(AUTH_STORE_PATH, JSON.stringify(list, null, 2), { mode: 0o600 });
  } catch {
    // Non-fatal in read-only containers
  }
}

let users: StoredUserRecord[] = loadStoredUsers();

let staticManifest: StaticBuildManifest;
let staticHtmlBySlug = new Map<string, string>();

function getPagesBaseUrl(): string {
  return computeGitHubPagesUrl(repoConfig.owner, repoConfig.repo, repoConfig.customDomain);
}

function rebuildStaticBundle() {
  const result = buildStaticSite(articles, getPagesBaseUrl());
  staticManifest = result.manifest;
  staticHtmlBySlug = result.htmlBySlug;
}

rebuildStaticBundle();

function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) result[k] = decodeURIComponent(v);
  }
  return result;
}

function toPublicUser(u: StoredUserRecord): PublicUser {
  return {
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function getEnvAdminPublicUser(): PublicUser {
  const now = new Date().toISOString();
  return {
    id: 'env-admin',
    username: ENV_ADMIN_USERNAME,
    displayName: 'Administrator',
    role: 'admin',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
}

function isAdminConfigured(): boolean {
  return Boolean(ENV_ADMIN_LOGIN_KEY) || users.some((u) => u.role === 'admin' && u.active);
}

function resolveAuthUser(req: Request): PublicUser | null {
  let sid: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    sid = authHeader.slice(7).trim();
  }
  if (!sid) {
    const cookies = parseCookies(req.headers.cookie);
    sid = cookies['amplitudeland_sid'] || null;
  }
  if (!sid) return null;
  const sess = authSessions.get(sid);
  if (!sess) return null;

  if (sess.userId === 'env-admin' && ENV_ADMIN_LOGIN_KEY) {
    return getEnvAdminPublicUser();
  }
  const found = users.find((u) => u.id === sess.userId && u.active);
  if (!found) {
    authSessions.delete(sid);
    return null;
  }
  return toPublicUser(found);
}

function buildAuthState(user: PublicUser | null): AuthSessionState {
  return {
    adminConfigured: isAdminConfigured(),
    envManagedAdmin: Boolean(ENV_ADMIN_LOGIN_KEY),
    authenticated: Boolean(user),
    user,
  };
}

function setAuthCookie(res: Response, sid: string) {
  res.append(
    'Set-Cookie',
    `amplitudeland_sid=${encodeURIComponent(sid)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=86400`,
  );
}

function clearAuthCookie(res: Response) {
  res.append(
    'Set-Cookie',
    'amplitudeland_sid=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0',
  );
}

function revokeUserSessions(userId: string) {
  for (const [sid, sess] of authSessions.entries()) {
    if (sess.userId === userId) {
      authSessions.delete(sid);
    }
  }
}

function getSessionFromRequest(req: Request): GitHubSession | null {
  const ghHeader = req.headers['x-github-session'];
  if (typeof ghHeader === 'string' && ghHeader.trim()) {
    const session = githubSessions.get(ghHeader.trim());
    if (session) return session;
  }
  const cookies = parseCookies(req.headers.cookie);
  const cookieSid = cookies['amplitudeland_gh_sid'];
  if (cookieSid) {
    return githubSessions.get(cookieSid) ?? null;
  }
  return null;
}

function setSessionCookie(res: Response, sessionId: string) {
  res.append(
    'Set-Cookie',
    `amplitudeland_gh_sid=${encodeURIComponent(sessionId)}; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=86400`,
  );
}

function clearSessionCookie(res: Response) {
  res.append(
    'Set-Cookie',
    'amplitudeland_gh_sid=; Path=/; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=0',
  );
}

function shortSha(): string {
  return crypto.randomBytes(4).toString('hex').slice(0, 7);
}

function isValidRepoSegment(val: string): boolean {
  return /^[A-Za-z0-9_.-]{1,100}$/.test(val);
}

function sanitizeContentDir(val: string): string {
  const cleaned = val.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!cleaned || cleaned.includes('..') || !/^[A-Za-z0-9_./-]+$/.test(cleaned)) {
    return 'content/posts';
  }
  return cleaned;
}

function verifyMutationCsrf(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const hasBearer = Boolean(req.headers.authorization?.startsWith('Bearer '));
  const customHeader = req.headers['x-requested-with'];
  const hasCustomHeader = customHeader === 'AmplitudeLand-CMS' || customHeader === 'Axiomata-CMS';
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || '';
  const originMatches =
    !origin ||
    origin === APP_URL ||
    (host && origin.endsWith(`://${host}`)) ||
    origin.includes('localhost');

  if (hasBearer || hasCustomHeader || originMatches) {
    return next();
  }
  return res.status(403).json({ error: 'Cross-origin mutation blocked.' });
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = resolveAuthUser(req);
  if (!user) {
    return res.status(401).json({ error: 'Administrator or author sign-in required.' });
  }
  (req as Request & { authUser: PublicUser }).authUser = user;
  return next();
}

function requireRoles(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = resolveAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions for this action.' });
    }
    (req as Request & { authUser: PublicUser }).authUser = user;
    return next();
  };
}

function getAuthUser(req: Request): PublicUser {
  return (req as Request & { authUser: PublicUser }).authUser;
}

async function githubFetch(
  pathname: string,
  token: string,
  init: RequestInit = {},
): Promise<globalThis.Response> {
  const url = new URL(pathname, 'https://api.github.com');
  if (url.hostname !== 'api.github.com') {
    throw new Error('Disallowed GitHub host');
  }
  return fetch(url.toString(), {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'AmplitudeLand-Scientific-CMS',
      ...(init.headers || {}),
    },
  });
}

async function pushArticleToGitHub(
  session: GitHubSession,
  article: Article,
  message: string,
): Promise<{ sha: string; htmlUrl?: string } | null> {
  if (!isValidRepoSegment(repoConfig.owner) || !isValidRepoSegment(repoConfig.repo)) {
    return null;
  }
  const content = serializeArticleMarkdown(article);
  const encodedContent = Buffer.from(content, 'utf8').toString('base64');
  const apiPath = `/repos/${encodeURIComponent(repoConfig.owner)}/${encodeURIComponent(repoConfig.repo)}/contents/${article.filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;

  // Look up existing file SHA if not cached
  let fileSha = article.githubSha;
  if (!fileSha) {
    const lookupRes = await githubFetch(
      `${apiPath}?ref=${encodeURIComponent(repoConfig.branch)}`,
      session.token,
    );
    if (lookupRes.ok) {
      const existing = (await lookupRes.json()) as { sha?: string };
      fileSha = existing.sha;
    }
  }

  const putRes = await githubFetch(apiPath, session.token, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      content: encodedContent,
      branch: repoConfig.branch,
      ...(fileSha ? { sha: fileSha } : {}),
    }),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`GitHub commit failed (${putRes.status}): ${errText.slice(0, 180)}`);
  }

  const data = (await putRes.json()) as {
    content?: { sha?: string };
    commit?: { sha?: string; html_url?: string };
  };
  if (data.content?.sha) {
    article.githubSha = data.content.sha;
  }
  return {
    sha: data.commit?.sha?.slice(0, 7) || shortSha(),
    htmlUrl: data.commit?.html_url,
  };
}

function buildGitHubStatus(session: GitHubSession | null): GitHubConfig & {
  callbackUrls: { current: string };
} {
  return {
    mode: session ? 'github' : 'demo',
    connected: Boolean(session),
    username: session?.username,
    avatarUrl: session?.avatarUrl,
    owner: repoConfig.owner,
    repo: repoConfig.repo,
    branch: repoConfig.branch,
    contentDir: repoConfig.contentDir,
    pagesBranch: repoConfig.pagesBranch,
    customDomain: repoConfig.customDomain,
    pagesUrl:
      repoConfig.livePagesUrl ||
      computeGitHubPagesUrl(repoConfig.owner, repoConfig.repo, repoConfig.customDomain),
    pagesEnabled: repoConfig.pagesEnabled,
    pagesBuildStatus: repoConfig.pagesBuildStatus,
    pagesConfiguredBranch: repoConfig.pagesConfiguredBranch,
    isPrivateRepo: repoConfig.isPrivateRepo,
    lastSyncedAt: repoConfig.lastSyncedAt,
    lastPagesPublishedAt: repoConfig.lastPagesPublishedAt,
    oauthConfigured: Boolean(GITHUB_CLIENT_ID && GITHUB_CLIENT_SECRET),
    callbackUrls: {
      current: `${APP_URL}/auth/callback`,
    },
  };
}

function computeCategoriesWithCounts() {
  const map = new Map<
    string,
    { name: string; slug: string; description: string; publishedCount: number; draftCount: number }
  >();

  for (const cat of categories) {
    map.set(cat.name, { ...cat, publishedCount: 0, draftCount: 0 });
  }

  for (const art of articles) {
    const existing = map.get(art.category) || {
      name: art.category,
      slug: slugify(art.category),
      description: 'Research category added from article frontmatter.',
      publishedCount: 0,
      draftCount: 0,
    };
    if (art.status === 'published') existing.publishedCount += 1;
    else existing.draftCount += 1;
    map.set(art.category, existing);
  }

  const tagCounts = new Map<string, number>();
  for (const art of articles) {
    for (const tag of art.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  return {
    categories: Array.from(map.values()),
    tags: Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', verifyMutationCsrf);

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, articles: articles.length, published: staticManifest.publishedCount });
  });

  // Administrator & Multi-User Authentication
  app.get('/api/auth/session', (req, res) => {
    const user = resolveAuthUser(req);
    res.json(buildAuthState(user));
  });

  app.post('/api/auth/setup-admin', (req, res) => {
    if (isAdminConfigured()) {
      return res.status(409).json({
        error: 'An administrator account is already configured. Sign in with your username and login key.',
      });
    }
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const displayName =
      typeof req.body?.displayName === 'string' && req.body.displayName.trim()
        ? req.body.displayName.trim().slice(0, 64)
        : rawUsername.trim();
    const loginKey = typeof req.body?.loginKey === 'string' ? req.body.loginKey : '';

    const userErr = validateUsername(rawUsername);
    if (userErr) return res.status(400).json({ error: userErr });
    const keyErr = validateLoginKey(loginKey);
    if (keyErr) return res.status(400).json({ error: keyErr });

    const normalized = normalizeUsername(rawUsername);
    const { salt, keyHash } = hashLoginKey(loginKey);
    const now = new Date().toISOString();
    const adminRecord: StoredUserRecord = {
      id: `usr-${crypto.randomBytes(6).toString('hex')}`,
      username: normalized,
      displayName: displayName || normalized,
      role: 'admin',
      salt,
      keyHash,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    users = [adminRecord, ...users.filter((u) => normalizeUsername(u.username) !== normalized)];
    persistStoredUsers(users);

    const sid = crypto.randomBytes(32).toString('hex');
    authSessions.set(sid, { id: sid, userId: adminRecord.id, createdAt: Date.now() });
    setAuthCookie(res, sid);
    const publicUser = toPublicUser(adminRecord);
    return res.status(201).json({ sessionToken: sid, auth: buildAuthState(publicUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    if (!isAdminConfigured()) {
      return res.status(400).json({
        error: 'No administrator has been configured yet. Create your administrator account first.',
      });
    }
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const loginKey = typeof req.body?.loginKey === 'string' ? req.body.loginKey : '';
    if (!rawUsername.trim() || !loginKey) {
      return res.status(400).json({ error: 'Username and login key are required.' });
    }

    const normalized = normalizeUsername(rawUsername);
    let authedUser: PublicUser | null = null;

    if (ENV_ADMIN_LOGIN_KEY && normalized === normalizeUsername(ENV_ADMIN_USERNAME)) {
      const a = Buffer.from(loginKey, 'utf8');
      const b = Buffer.from(ENV_ADMIN_LOGIN_KEY, 'utf8');
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        authedUser = getEnvAdminPublicUser();
      }
    }

    if (!authedUser) {
      const candidate = users.find((u) => normalizeUsername(u.username) === normalized);
      if (candidate && candidate.active && verifyLoginKey(loginKey, candidate.salt, candidate.keyHash)) {
        authedUser = toPublicUser(candidate);
      }
    }

    if (!authedUser) {
      return res.status(401).json({ error: 'Invalid username or login key.' });
    }

    const sid = crypto.randomBytes(32).toString('hex');
    authSessions.set(sid, { id: sid, userId: authedUser.id, createdAt: Date.now() });
    setAuthCookie(res, sid);
    return res.json({ sessionToken: sid, auth: buildAuthState(authedUser) });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      authSessions.delete(authHeader.slice(7).trim());
    }
    const cookies = parseCookies(req.headers.cookie);
    if (cookies['amplitudeland_sid']) {
      authSessions.delete(cookies['amplitudeland_sid']);
    }
    clearAuthCookie(res);
    return res.json({ auth: buildAuthState(null) });
  });

  app.patch('/api/auth/me', requireAuth, (req, res) => {
    const current = getAuthUser(req);
    if (current.id === 'env-admin') {
      return res.status(400).json({
        error: 'Environment-managed admin credentials must be updated via ADMIN_USERNAME / ADMIN_LOGIN_KEY secrets.',
      });
    }
    const record = users.find((u) => u.id === current.id);
    if (!record) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const currentLoginKey = typeof req.body?.currentLoginKey === 'string' ? req.body.currentLoginKey : '';
    if (!verifyLoginKey(currentLoginKey, record.salt, record.keyHash)) {
      return res.status(401).json({ error: 'Current login key is incorrect.' });
    }

    const nextUsernameRaw =
      typeof req.body?.username === 'string' && req.body.username.trim()
        ? req.body.username
        : record.username;
    const nextDisplayName =
      typeof req.body?.displayName === 'string' && req.body.displayName.trim()
        ? req.body.displayName.trim().slice(0, 64)
        : record.displayName;
    const nextKey = typeof req.body?.newLoginKey === 'string' ? req.body.newLoginKey : '';

    const userErr = validateUsername(nextUsernameRaw);
    if (userErr) return res.status(400).json({ error: userErr });
    const nextUsername = normalizeUsername(nextUsernameRaw);
    if (
      nextUsername !== record.username &&
      users.some((u) => u.id !== record.id && normalizeUsername(u.username) === nextUsername)
    ) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }

    if (nextKey) {
      const keyErr = validateLoginKey(nextKey);
      if (keyErr) return res.status(400).json({ error: keyErr });
      const hashed = hashLoginKey(nextKey);
      record.salt = hashed.salt;
      record.keyHash = hashed.keyHash;
    }

    record.username = nextUsername;
    record.displayName = nextDisplayName;
    record.updatedAt = new Date().toISOString();
    persistStoredUsers(users);
    return res.json({ auth: buildAuthState(toPublicUser(record)) });
  });

  // Admin-only Multi-User Access Management
  app.get('/api/auth/users', requireRoles(['admin']), (_req, res) => {
    res.json({ users: users.map(toPublicUser) });
  });

  app.post('/api/auth/users', requireRoles(['admin']), (req, res) => {
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username : '';
    const displayName =
      typeof req.body?.displayName === 'string' && req.body.displayName.trim()
        ? req.body.displayName.trim().slice(0, 64)
        : rawUsername.trim();
    const role: UserRole =
      req.body?.role === 'admin' || req.body?.role === 'editor' || req.body?.role === 'author'
        ? req.body.role
        : 'author';
    const customKey = typeof req.body?.loginKey === 'string' ? req.body.loginKey : '';

    const userErr = validateUsername(rawUsername);
    if (userErr) return res.status(400).json({ error: userErr });
    const normalized = normalizeUsername(rawUsername);
    if (
      users.some((u) => normalizeUsername(u.username) === normalized) ||
      (ENV_ADMIN_LOGIN_KEY && normalized === normalizeUsername(ENV_ADMIN_USERNAME))
    ) {
      return res.status(409).json({ error: 'Username already exists.' });
    }

    const issuedKey = customKey || generateAccessKey();
    const keyErr = validateLoginKey(issuedKey);
    if (keyErr) return res.status(400).json({ error: keyErr });

    const { salt, keyHash } = hashLoginKey(issuedKey);
    const now = new Date().toISOString();
    const created: StoredUserRecord = {
      id: `usr-${crypto.randomBytes(6).toString('hex')}`,
      username: normalized,
      displayName: displayName || normalized,
      role,
      salt,
      keyHash,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    users.push(created);
    persistStoredUsers(users);

    return res.status(201).json({
      user: toPublicUser(created),
      issuedLoginKey: issuedKey,
    });
  });

  app.patch('/api/auth/users/:id', requireRoles(['admin']), (req, res) => {
    const actor = getAuthUser(req);
    const target = users.find((u) => u.id === req.params.id);
    if (!target) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    if (typeof req.body?.active === 'boolean') {
      if (target.id === actor.id && !req.body.active) {
        return res.status(400).json({ error: 'You cannot deactivate your own active session.' });
      }
      if (
        !req.body.active &&
        target.role === 'admin' &&
        !ENV_ADMIN_LOGIN_KEY &&
        users.filter((u) => u.role === 'admin' && u.active).length <= 1
      ) {
        return res.status(400).json({ error: 'Cannot deactivate the only active administrator.' });
      }
      target.active = req.body.active;
      if (!target.active) {
        revokeUserSessions(target.id);
      }
    }

    if (req.body?.role === 'admin' || req.body?.role === 'editor' || req.body?.role === 'author') {
      if (
        target.role === 'admin' &&
        req.body.role !== 'admin' &&
        !ENV_ADMIN_LOGIN_KEY &&
        users.filter((u) => u.role === 'admin' && u.active).length <= 1
      ) {
        return res.status(400).json({ error: 'At least one active administrator is required.' });
      }
      target.role = req.body.role;
    }

    if (typeof req.body?.displayName === 'string' && req.body.displayName.trim()) {
      target.displayName = req.body.displayName.trim().slice(0, 64);
    }

    let rotatedKey: string | undefined;
    if (req.body?.rotateKey === true || typeof req.body?.newLoginKey === 'string') {
      const nextKey =
        typeof req.body?.newLoginKey === 'string' && req.body.newLoginKey
          ? req.body.newLoginKey
          : generateAccessKey();
      const keyErr = validateLoginKey(nextKey);
      if (keyErr) return res.status(400).json({ error: keyErr });
      const hashed = hashLoginKey(nextKey);
      target.salt = hashed.salt;
      target.keyHash = hashed.keyHash;
      rotatedKey = nextKey;
      revokeUserSessions(target.id);
    }

    target.updatedAt = new Date().toISOString();
    persistStoredUsers(users);
    return res.json({ user: toPublicUser(target), issuedLoginKey: rotatedKey });
  });

  app.delete('/api/auth/users/:id', requireRoles(['admin']), (req, res) => {
    const actor = getAuthUser(req);
    if (req.params.id === actor.id) {
      return res.status(400).json({ error: 'You cannot delete your own active administrator account.' });
    }
    const idx = users.findIndex((u) => u.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'User account not found.' });
    }
    const target = users[idx];
    if (
      target.role === 'admin' &&
      !ENV_ADMIN_LOGIN_KEY &&
      users.filter((u) => u.role === 'admin' && u.active).length <= 1
    ) {
      return res.status(400).json({ error: 'Cannot remove the last active administrator.' });
    }
    users.splice(idx, 1);
    revokeUserSessions(target.id);
    persistStoredUsers(users);
    return res.json({ ok: true });
  });

  // Articles CRUD (public sees published; authenticated editorial users see all + can author)
  app.get('/api/articles', (req, res) => {
    const authed = resolveAuthUser(req);
    const status = typeof req.query.status === 'string' ? req.query.status : 'all';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    let filtered = authed ? [...articles] : articles.filter((a) => a.status === 'published');
    if (authed && (status === 'published' || status === 'draft')) {
      filtered = filtered.filter((a) => a.status === status);
    }
    if (category && category !== 'All') {
      filtered = filtered.filter((a) => a.category.toLowerCase() === category.toLowerCase());
    }
    if (q) {
      filtered = filtered.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.abstract.toLowerCase().includes(q) ||
          a.category.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)) ||
          a.author.toLowerCase().includes(q),
      );
    }

    filtered.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ articles: filtered });
  });

  app.get('/api/articles/:slug', (req, res) => {
    const authed = resolveAuthUser(req);
    const article = articles.find((a) => a.slug === req.params.slug || a.id === req.params.slug);
    if (!article || (article.status === 'draft' && !authed)) {
      return res.status(404).json({ error: 'Article not found' });
    }
    const html = renderMarkdownLatex(article.body);
    const toc = extractTocHeadings(article.body);
    const markdownSource = serializeArticleMarkdown(article);
    return res.json({ article, html, toc, markdownSource });
  });

  app.post('/api/articles', requireAuth, async (req, res) => {
    const actor = getAuthUser(req);
    const input = req.body as Partial<ArticleInput>;
    const title = typeof input.title === 'string' ? input.title.trim() : '';
    const body = typeof input.body === 'string' ? input.body.trim() : '';
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and LaTeX/Markdown body are required.' });
    }
    if (input.status === 'published' && !canPublishArticles(actor.role)) {
      return res.status(403).json({
        error: 'Author accounts can save drafts. Publishing requires Editor or Administrator access.',
      });
    }

    const baseSlug = slugify(typeof input.slug === 'string' && input.slug.trim() ? input.slug : title);
    let uniqueSlug = baseSlug;
    let counter = 2;
    while (articles.some((a) => a.slug === uniqueSlug)) {
      uniqueSlug = `${baseSlug}-${counter++}`;
    }

    const today = new Date().toISOString().slice(0, 10);
    const status = input.status === 'published' ? 'published' : 'draft';
    const category =
      typeof input.category === 'string' && input.category.trim()
        ? input.category.trim()
        : 'Quantum Physics';
    const tags = Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean)
      : [];

    const commitMsg =
      typeof input.commitMessage === 'string' && input.commitMessage.trim()
        ? input.commitMessage.trim()
        : `cms(${status === 'published' ? 'publish' : 'draft'}): ${title}`;

    const newArticle: Article = {
      id: `art-${crypto.randomBytes(4).toString('hex')}`,
      slug: uniqueSlug,
      title,
      abstract:
        typeof input.abstract === 'string' && input.abstract.trim()
          ? input.abstract.trim()
          : `${title} — technical monograph.`,
      category,
      tags,
      status,
      author:
        typeof input.author === 'string' && input.author.trim()
          ? input.author.trim()
          : 'Dr. Elena Rostova',
      authorAffiliation:
        typeof input.authorAffiliation === 'string' && input.authorAffiliation.trim()
          ? input.authorAffiliation.trim()
          : 'AmplitudeLand Editorial Fellow',
      publishedAt: today,
      updatedAt: today,
      doi: typeof input.doi === 'string' && input.doi.trim() ? input.doi.trim() : undefined,
      coverImage: typeof input.coverImage === 'string' && input.coverImage.trim() ? input.coverImage.trim() : undefined,
      coverCaption:
        typeof input.coverCaption === 'string' && input.coverCaption.trim()
          ? input.coverCaption.trim()
          : undefined,
      body,
      commitSha: shortSha(),
      commitMessage: commitMsg,
      filePath: `${repoConfig.contentDir}/${uniqueSlug}.md`,
      readingTimeMinutes: estimateReadingTime(body),
      equationCount: countLatexEquations(body),
    };

    if (!categories.some((c) => c.name.toLowerCase() === category.toLowerCase())) {
      categories.push({
        name: category,
        slug: slugify(category),
        description: `Monographs tagged under ${category}.`,
      });
    }

    const session = getSessionFromRequest(req);
    let syncedToGitHub = false;
    let githubWarning: string | undefined;
    if (session) {
      try {
        const ghResult = await pushArticleToGitHub(session, newArticle, commitMsg);
        if (ghResult) {
          newArticle.commitSha = ghResult.sha;
          syncedToGitHub = true;
        }
      } catch (err) {
        githubWarning = err instanceof Error ? err.message : 'GitHub push failed';
      }
    }

    articles.unshift(newArticle);
    commits.unshift({
      sha: newArticle.commitSha,
      message: commitMsg,
      author: session?.username || actor.displayName || newArticle.author,
      timestamp: new Date().toISOString(),
      filePath: newArticle.filePath,
      action: status === 'published' ? 'publish' : 'create',
      syncedToGitHub,
    });

    rebuildStaticBundle();
    return res.status(201).json({
      article: newArticle,
      manifest: staticManifest,
      syncedToGitHub,
      githubWarning,
    });
  });

  app.put('/api/articles/:id', requireAuth, async (req, res) => {
    const actor = getAuthUser(req);
    const idx = articles.findIndex((a) => a.id === req.params.id || a.slug === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Article not found' });
    }

    const existing = articles[idx];
    const input = req.body as Partial<ArticleInput>;
    if (input.status === 'published' && existing.status !== 'published' && !canPublishArticles(actor.role)) {
      return res.status(403).json({
        error: 'Author accounts can edit drafts. Publishing requires Editor or Administrator access.',
      });
    }
    const title = typeof input.title === 'string' ? input.title.trim() : existing.title;
    const body = typeof input.body === 'string' ? input.body.trim() : existing.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'Title and body cannot be empty.' });
    }

    const nextSlug =
      typeof input.slug === 'string' && input.slug.trim()
        ? slugify(input.slug)
        : existing.slug;
    if (nextSlug !== existing.slug && articles.some((a) => a.slug === nextSlug && a.id !== existing.id)) {
      return res.status(409).json({ error: `Slug "${nextSlug}" is already in use.` });
    }

    const status =
      input.status === 'published' || input.status === 'draft' ? input.status : existing.status;
    const category =
      typeof input.category === 'string' && input.category.trim()
        ? input.category.trim()
        : existing.category;
    const tags = Array.isArray(input.tags)
      ? input.tags.map((t) => String(t).trim()).filter(Boolean)
      : existing.tags;

    const today = new Date().toISOString().slice(0, 10);
    const commitMsg =
      typeof input.commitMessage === 'string' && input.commitMessage.trim()
        ? input.commitMessage.trim()
        : status !== existing.status
          ? `cms(${status === 'published' ? 'publish' : 'unpublish'}): ${title}`
          : `cms(update): revise ${title}`;

    const updated: Article = {
      ...existing,
      slug: nextSlug,
      title,
      abstract: typeof input.abstract === 'string' ? input.abstract.trim() : existing.abstract,
      category,
      tags,
      status,
      author: typeof input.author === 'string' && input.author.trim() ? input.author.trim() : existing.author,
      authorAffiliation:
        typeof input.authorAffiliation === 'string' && input.authorAffiliation.trim()
          ? input.authorAffiliation.trim()
          : existing.authorAffiliation,
      doi: typeof input.doi === 'string' ? input.doi.trim() || undefined : existing.doi,
      coverImage:
        typeof input.coverImage === 'string' ? input.coverImage.trim() || undefined : existing.coverImage,
      coverCaption:
        typeof input.coverCaption === 'string'
          ? input.coverCaption.trim() || undefined
          : existing.coverCaption,
      body,
      updatedAt: today,
      filePath: `${repoConfig.contentDir}/${nextSlug}.md`,
      commitSha: shortSha(),
      commitMessage: commitMsg,
      readingTimeMinutes: estimateReadingTime(body),
      equationCount: countLatexEquations(body),
    };

    if (!categories.some((c) => c.name.toLowerCase() === category.toLowerCase())) {
      categories.push({
        name: category,
        slug: slugify(category),
        description: `Monographs tagged under ${category}.`,
      });
    }

    const session = getSessionFromRequest(req);
    let syncedToGitHub = false;
    let githubWarning: string | undefined;
    if (session) {
      try {
        const ghResult = await pushArticleToGitHub(session, updated, commitMsg);
        if (ghResult) {
          updated.commitSha = ghResult.sha;
          syncedToGitHub = true;
        }
      } catch (err) {
        githubWarning = err instanceof Error ? err.message : 'GitHub push failed';
      }
    }

    articles[idx] = updated;
    commits.unshift({
      sha: updated.commitSha,
      message: commitMsg,
      author: session?.username || updated.author,
      timestamp: new Date().toISOString(),
      filePath: updated.filePath,
      action:
        status !== existing.status
          ? status === 'published'
            ? 'publish'
            : 'unpublish'
          : 'update',
      syncedToGitHub,
    });

    rebuildStaticBundle();
    return res.json({
      article: updated,
      manifest: staticManifest,
      syncedToGitHub,
      githubWarning,
    });
  });

  app.patch('/api/articles/:id/status', requireRoles(['admin', 'editor']), async (req, res) => {
    const idx = articles.findIndex((a) => a.id === req.params.id || a.slug === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Article not found' });
    }
    const nextStatus = req.body?.status === 'published' ? 'published' : 'draft';
    const existing = articles[idx];
    const today = new Date().toISOString().slice(0, 10);
    const commitMsg = `cms(${nextStatus === 'published' ? 'publish' : 'unpublish'}): ${existing.title}`;

    const updated: Article = {
      ...existing,
      status: nextStatus,
      updatedAt: today,
      commitSha: shortSha(),
      commitMessage: commitMsg,
    };

    const session = getSessionFromRequest(req);
    let syncedToGitHub = false;
    let githubWarning: string | undefined;
    if (session) {
      try {
        const ghResult = await pushArticleToGitHub(session, updated, commitMsg);
        if (ghResult) {
          updated.commitSha = ghResult.sha;
          syncedToGitHub = true;
        }
      } catch (err) {
        githubWarning = err instanceof Error ? err.message : 'GitHub push failed';
      }
    }

    articles[idx] = updated;
    commits.unshift({
      sha: updated.commitSha,
      message: commitMsg,
      author: session?.username || updated.author,
      timestamp: new Date().toISOString(),
      filePath: updated.filePath,
      action: nextStatus === 'published' ? 'publish' : 'unpublish',
      syncedToGitHub,
    });

    rebuildStaticBundle();
    return res.json({
      article: updated,
      manifest: staticManifest,
      syncedToGitHub,
      githubWarning,
    });
  });

  app.delete('/api/articles/:id', requireRoles(['admin', 'editor']), (req, res) => {
    const actor = getAuthUser(req);
    const idx = articles.findIndex((a) => a.id === req.params.id || a.slug === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Article not found' });
    }
    const [removed] = articles.splice(idx, 1);
    commits.unshift({
      sha: shortSha(),
      message: `cms(delete): remove ${removed.title}`,
      author: actor.displayName,
      timestamp: new Date().toISOString(),
      filePath: removed.filePath,
      action: 'delete',
      syncedToGitHub: false,
    });
    rebuildStaticBundle();
    return res.json({ ok: true, manifest: staticManifest });
  });

  // Categories & Tags management
  app.get('/api/categories', (_req, res) => {
    res.json(computeCategoriesWithCounts());
  });

  app.post('/api/categories', requireRoles(['admin', 'editor']), (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.trim() : '';
    if (!name) {
      return res.status(400).json({ error: 'Category name is required.' });
    }
    if (categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      return res.status(409).json({ error: 'Category already exists.' });
    }
    categories.push({
      name,
      slug: slugify(name),
      description: description || `Research monographs in ${name}.`,
    });
    return res.status(201).json(computeCategoriesWithCounts());
  });

  app.patch('/api/categories/:slug', requireRoles(['admin', 'editor']), (req, res) => {
    let target = categories.find((c) => c.slug === req.params.slug);
    if (!target) {
      const fromArticle = articles.find((a) => slugify(a.category) === req.params.slug);
      if (!fromArticle) {
        return res.status(404).json({ error: 'Category not found.' });
      }
      target = {
        name: fromArticle.category,
        slug: slugify(fromArticle.category),
        description: 'Research category added from article frontmatter.',
      };
      categories.push(target);
    }
    const nextName = typeof req.body?.name === 'string' ? req.body.name.trim() : target.name;
    const nextDesc =
      typeof req.body?.description === 'string' ? req.body.description.trim() : target.description;
    if (!nextName) {
      return res.status(400).json({ error: 'Category name cannot be empty.' });
    }
    const oldName = target.name;
    target.name = nextName;
    target.slug = slugify(nextName);
    target.description = nextDesc;

    if (oldName !== nextName) {
      articles = articles.map((a) => (a.category === oldName ? { ...a, category: nextName } : a));
      rebuildStaticBundle();
    }
    return res.json(computeCategoriesWithCounts());
  });

  app.delete('/api/categories/:slug', requireRoles(['admin', 'editor']), (req, res) => {
    const idx = categories.findIndex((c) => c.slug === req.params.slug);
    let removedName: string | null = null;
    if (idx !== -1) {
      const [removed] = categories.splice(idx, 1);
      removedName = removed.name;
    } else {
      const fromArticle = articles.find((a) => slugify(a.category) === req.params.slug);
      if (!fromArticle) {
        return res.status(404).json({ error: 'Category not found.' });
      }
      removedName = fromArticle.category;
    }

    const fallbackName =
      removedName.toLowerCase() === 'general science' ? 'Uncategorized' : 'General Science';
    const hasAffectedArticles = articles.some((a) => a.category === removedName);
    if (hasAffectedArticles) {
      articles = articles.map((a) =>
        a.category === removedName ? { ...a, category: fallbackName } : a,
      );
      if (!categories.some((c) => c.name.toLowerCase() === fallbackName.toLowerCase())) {
        categories.push({
          name: fallbackName,
          slug: slugify(fallbackName),
          description: 'Cross-disciplinary scientific monographs.',
        });
      }
    }
    rebuildStaticBundle();
    return res.json(computeCategoriesWithCounts());
  });

  // Commit history
  app.get('/api/commits', requireAuth, (_req, res) => {
    res.json({ commits: commits.slice(0, 50) });
  });

  // GitHub OAuth + Online PAT configuration
  app.get('/api/github/status', requireAuth, (req, res) => {
    const session = getSessionFromRequest(req);
    res.json(buildGitHubStatus(session));
  });

  app.get('/api/auth/github/url', requireRoles(['admin']), (_req, res) => {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.json({
        configured: false,
        message:
          'GitHub OAuth App credentials (GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET) are not configured on this instance. Paste a Fine-Grained Token in the form above to connect your repository immediately.',
      });
    }
    const state = crypto.randomBytes(16).toString('hex');
    oauthStates.set(state, Date.now());
    const redirectUri = `${APP_URL}/auth/callback`;
    const params = new URLSearchParams({
      client_id: GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'repo read:user',
      state,
    });
    return res.json({
      configured: true,
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
    });
  });

  const handleOAuthCallback = async (req: Request, res: Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';

    if (!code || !state || !oauthStates.has(state)) {
      return res.status(400).send('<html><body><p>Invalid or expired OAuth state.</p></body></html>');
    }
    oauthStates.delete(state);

    try {
      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
          redirect_uri: `${APP_URL}/auth/callback`,
        }),
      });
      const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (!tokenJson.access_token) {
        return res
          .status(400)
          .send(`<html><body><p>OAuth token exchange failed: ${tokenJson.error || 'Unknown error'}</p></body></html>`);
      }

      const userRes = await githubFetch('/user', tokenJson.access_token);
      if (!userRes.ok) {
        return res.status(400).send('<html><body><p>Failed to verify GitHub user profile.</p></body></html>');
      }
      const user = (await userRes.json()) as { login: string; avatar_url?: string };
      const sid = crypto.randomBytes(32).toString('hex');
      githubSessions.set(sid, {
        id: sid,
        token: tokenJson.access_token,
        username: user.login,
        avatarUrl: user.avatar_url,
        createdAt: Date.now(),
      });
      if (!repoConfig.owner || repoConfig.owner === 'your-username') {
        repoConfig.owner = user.login;
        rebuildStaticBundle();
      }
      setSessionCookie(res, sid);

      return res.send(`<!doctype html>
<html>
  <body style="font-family: system-ui, sans-serif; padding: 2rem; background: #FAF9F6; color: #1C1917;">
    <script>
      if (window.opener) {
        window.opener.postMessage({
          type: 'OAUTH_AUTH_SUCCESS',
          sessionToken: ${JSON.stringify(sid)},
          username: ${JSON.stringify(user.login)}
        }, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
    <p>Connected to GitHub as <strong>${user.login}</strong>. You may close this window.</p>
  </body>
</html>`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unexpected OAuth error';
      return res.status(500).send(`<html><body><p>${msg}</p></body></html>`);
    }
  };

  app.get('/auth/callback', handleOAuthCallback);
  app.get('/auth/callback/', handleOAuthCallback);

  app.post('/api/github/connect-pat', requireRoles(['admin']), async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const owner = typeof req.body?.owner === 'string' ? req.body.owner.trim() : '';
    const repo = typeof req.body?.repo === 'string' ? req.body.repo.trim() : '';
    const branch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : 'main';
    const contentDir =
      typeof req.body?.contentDir === 'string' ? req.body.contentDir.trim() : 'content/posts';
    const pagesBranch = typeof req.body?.pagesBranch === 'string' ? req.body.pagesBranch.trim() : '';
    const customDomain = typeof req.body?.customDomain === 'string' ? req.body.customDomain.trim() : '';

    if (!token) {
      return res.status(400).json({ error: 'GitHub Personal Access Token is required.' });
    }
    if (owner && !isValidRepoSegment(owner)) {
      return res.status(400).json({ error: 'Invalid repository owner name.' });
    }
    if (repo && !isValidRepoSegment(repo)) {
      return res.status(400).json({ error: 'Invalid repository name.' });
    }
    if (branch && !isValidRepoSegment(branch)) {
      return res.status(400).json({ error: 'Invalid branch name.' });
    }
    if (pagesBranch && !isValidRepoSegment(pagesBranch)) {
      return res.status(400).json({ error: 'Invalid GitHub Pages branch name.' });
    }
    if (customDomain && (!isValidCustomDomain(customDomain) || isGitHubOwnedDomain(customDomain))) {
      return res.status(400).json({
        error: isGitHubOwnedDomain(customDomain)
          ? 'Do not enter a *.github.io address as Custom Domain. GitHub sets your .github.io URL automatically from your GitHub Owner and Repository Name.'
          : 'Invalid custom domain hostname (e.g. blog.amplitudeland.org).',
      });
    }

    try {
      const userRes = await githubFetch('/user', token);
      if (!userRes.ok) {
        return res
          .status(401)
          .json({ error: 'GitHub rejected the token. Verify scopes (Contents: Read & Write) and expiration.' });
      }
      const user = (await userRes.json()) as { login: string; avatar_url?: string };
      const sid = crypto.randomBytes(32).toString('hex');
      githubSessions.set(sid, {
        id: sid,
        token,
        username: user.login,
        avatarUrl: user.avatar_url,
        createdAt: Date.now(),
      });

      if (owner && owner !== 'your-username') {
        repoConfig.owner = owner;
      } else if (!repoConfig.owner || repoConfig.owner === 'your-username') {
        repoConfig.owner = user.login;
      }
      if (repo) repoConfig.repo = repo;
      if (branch) repoConfig.branch = branch;
      if (contentDir) repoConfig.contentDir = sanitizeContentDir(contentDir);
      if (pagesBranch) repoConfig.pagesBranch = pagesBranch;
      if (typeof req.body?.customDomain === 'string') {
        repoConfig.customDomain = sanitizeCustomDomain(customDomain) || undefined;
      }
      rebuildStaticBundle();

      setSessionCookie(res, sid);
      return res.json({
        sessionToken: sid,
        status: buildGitHubStatus(githubSessions.get(sid) ?? null),
      });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to reach api.github.com.',
      });
    }
  });

  app.get('/api/github/repos', requireRoles(['admin']), async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Connect your GitHub account first.' });
    }
    try {
      const reposRes = await githubFetch(
        '/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member',
        session.token,
      );
      if (!reposRes.ok) {
        const msg = await reposRes.text();
        return res.status(reposRes.status).json({
          error: `Unable to list repositories from GitHub (${reposRes.status}): ${msg.slice(0, 160)}`,
        });
      }
      const list = (await reposRes.json()) as Array<{
        name: string;
        full_name: string;
        owner: { login: string };
        default_branch: string;
        private: boolean;
        permissions?: { push?: boolean };
        has_pages?: boolean;
        html_url: string;
      }>;
      return res.json({
        repos: list.map((r) => ({
          name: r.name,
          fullName: r.full_name,
          owner: r.owner.login,
          defaultBranch: r.default_branch || 'main',
          isPrivate: Boolean(r.private),
          canPush: r.permissions?.push !== false,
          hasPages: Boolean(r.has_pages),
          htmlUrl: r.html_url,
        })),
      });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to list GitHub repositories.',
      });
    }
  });

  app.post('/api/github/create-repo', requireRoles(['admin']), async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Connect your GitHub account first.' });
    }
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const description =
      typeof req.body?.description === 'string' && req.body.description.trim()
        ? req.body.description.trim()
        : 'AmplitudeLand scientific weblog & LaTeX monographs';
    const isPrivate = Boolean(req.body?.private);

    if (!name || !isValidRepoSegment(name)) {
      return res.status(400).json({ error: 'Enter a valid repository name (e.g. username.github.io).' });
    }

    try {
      const createRes = await githubFetch('/user/repos', session.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          private: isPrivate,
          auto_init: true,
        }),
      });
      const bodyText = await createRes.text();
      let parsed: {
        name?: string;
        full_name?: string;
        owner?: { login?: string };
        default_branch?: string;
        private?: boolean;
        has_pages?: boolean;
        html_url?: string;
        message?: string;
      } = {};
      try {
        parsed = JSON.parse(bodyText);
      } catch {
        // fallback below
      }
      if (!createRes.ok) {
        const hint =
          createRes.status === 403
            ? ' Your GitHub token needs "Administration: Read & Write" (Fine-Grained) or "repo" (Classic) scope to create repositories, or you can create the repository directly on github.com and select it here.'
            : '';
        return res.status(createRes.status).json({
          error: `${parsed.message || `GitHub repository creation failed (${createRes.status})`}.${hint}`,
        });
      }

      const createdOwner = parsed.owner?.login || session.username;
      const createdName = parsed.name || name;
      const defaultBranch = parsed.default_branch || 'main';

      repoConfig.owner = createdOwner;
      repoConfig.repo = createdName;
      repoConfig.branch = defaultBranch;
      rebuildStaticBundle();

      return res.status(201).json({
        repo: {
          name: createdName,
          fullName: parsed.full_name || `${createdOwner}/${createdName}`,
          owner: createdOwner,
          defaultBranch,
          isPrivate: Boolean(parsed.private),
          canPush: true,
          hasPages: Boolean(parsed.has_pages),
          htmlUrl: parsed.html_url || `https://github.com/${createdOwner}/${createdName}`,
        },
        status: buildGitHubStatus(session),
      });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to create GitHub repository.',
      });
    }
  });

  app.post('/api/github/config', requireRoles(['admin']), (req, res) => {
    const owner = typeof req.body?.owner === 'string' ? req.body.owner.trim() : '';
    const repo = typeof req.body?.repo === 'string' ? req.body.repo.trim() : '';
    const branch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : '';
    const contentDir = typeof req.body?.contentDir === 'string' ? req.body.contentDir.trim() : '';
    const pagesBranch = typeof req.body?.pagesBranch === 'string' ? req.body.pagesBranch.trim() : '';
    const customDomain = typeof req.body?.customDomain === 'string' ? req.body.customDomain.trim() : undefined;

    if (owner) {
      if (!isValidRepoSegment(owner)) return res.status(400).json({ error: 'Invalid owner name.' });
      repoConfig.owner = owner;
    }
    if (repo) {
      if (!isValidRepoSegment(repo)) return res.status(400).json({ error: 'Invalid repo name.' });
      repoConfig.repo = repo;
    }
    if (branch) {
      if (!isValidRepoSegment(branch)) return res.status(400).json({ error: 'Invalid branch name.' });
      repoConfig.branch = branch;
    }
    if (pagesBranch) {
      if (!isValidRepoSegment(pagesBranch)) {
        return res.status(400).json({ error: 'Invalid GitHub Pages branch name.' });
      }
      repoConfig.pagesBranch = pagesBranch;
    }
    if (contentDir) {
      repoConfig.contentDir = sanitizeContentDir(contentDir);
    }
    if (customDomain !== undefined) {
      if (customDomain && (!isValidCustomDomain(customDomain) || isGitHubOwnedDomain(customDomain))) {
        return res.status(400).json({
          error: isGitHubOwnedDomain(customDomain)
            ? 'Do not enter a *.github.io address as Custom Domain. GitHub assigns your .github.io URL automatically from your GitHub Owner and Repository Name.'
            : 'Invalid custom domain hostname.',
        });
      }
      repoConfig.customDomain = customDomain ? sanitizeCustomDomain(customDomain) : undefined;
    }

    repoConfig.livePagesUrl = undefined;
    repoConfig.pagesEnabled = undefined;
    repoConfig.pagesBuildStatus = undefined;
    repoConfig.pagesConfiguredBranch = undefined;
    repoConfig.isPrivateRepo = undefined;

    rebuildStaticBundle();
    const session = getSessionFromRequest(req);
    return res.json({ status: buildGitHubStatus(session) });
  });

  app.post('/api/github/sync', requireRoles(['admin']), async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      repoConfig.lastSyncedAt = new Date().toISOString();
      rebuildStaticBundle();
      commits.unshift({
        sha: shortSha(),
        message: 'cms(sync): verified repository index and rebuilt static bundle',
        author: 'AmplitudeLand Sync',
        timestamp: new Date().toISOString(),
        filePath: repoConfig.contentDir,
        action: 'sync',
        syncedToGitHub: false,
      });
      return res.json({
        importedCount: 0,
        status: buildGitHubStatus(null),
        manifest: staticManifest,
      });
    }

    try {
      const dirPath = repoConfig.contentDir.split('/').map(encodeURIComponent).join('/');
      const listRes = await githubFetch(
        `/repos/${encodeURIComponent(repoConfig.owner)}/${encodeURIComponent(repoConfig.repo)}/contents/${dirPath}?ref=${encodeURIComponent(repoConfig.branch)}`,
        session.token,
      );
      if (!listRes.ok) {
        const msg = await listRes.text();
        return res.status(listRes.status).json({
          error: `Unable to read ${repoConfig.owner}/${repoConfig.repo}/${repoConfig.contentDir}: ${msg.slice(0, 160)}`,
        });
      }

      const items = (await listRes.json()) as Array<{
        name: string;
        path: string;
        sha: string;
        type: string;
        download_url?: string;
      }>;

      const mdFiles = Array.isArray(items)
        ? items.filter((f) => f.type === 'file' && /\.(md|mdx)$/i.test(f.name))
        : [];

      let importedCount = 0;
      for (const file of mdFiles.slice(0, 30)) {
        const fileRes = await githubFetch(
          `/repos/${encodeURIComponent(repoConfig.owner)}/${encodeURIComponent(repoConfig.repo)}/contents/${file.path
            .split('/')
            .map(encodeURIComponent)
            .join('/')}?ref=${encodeURIComponent(repoConfig.branch)}`,
          session.token,
        );
        if (!fileRes.ok) continue;
        const fileData = (await fileRes.json()) as { content?: string; sha?: string };
        if (!fileData.content) continue;
        const rawText = Buffer.from(fileData.content, 'base64').toString('utf8');
        const fallbackSlug = file.name.replace(/\.(md|mdx)$/i, '');
        const parsed = parseArticleMarkdown(rawText, fallbackSlug);

        const existingIdx = articles.findIndex((a) => a.slug === parsed.frontmatter.slug);
        const hydrated: Article = {
          id: existingIdx >= 0 ? articles[existingIdx].id : `art-${crypto.randomBytes(4).toString('hex')}`,
          slug: parsed.frontmatter.slug,
          title: parsed.frontmatter.title,
          abstract: parsed.frontmatter.abstract,
          category: parsed.frontmatter.category,
          tags: parsed.frontmatter.tags,
          status: parsed.frontmatter.status,
          author: parsed.frontmatter.author,
          authorAffiliation: parsed.frontmatter.authorAffiliation,
          publishedAt: parsed.frontmatter.publishedAt,
          updatedAt: parsed.frontmatter.updatedAt,
          doi: parsed.frontmatter.doi,
          coverImage: parsed.frontmatter.coverImage,
          coverCaption: parsed.frontmatter.coverCaption,
          body: parsed.body,
          commitSha: (fileData.sha || shortSha()).slice(0, 7),
          commitMessage: `github(sync): pulled ${file.name}`,
          filePath: file.path,
          githubSha: fileData.sha,
          readingTimeMinutes: estimateReadingTime(parsed.body),
          equationCount: countLatexEquations(parsed.body),
        };

        if (existingIdx >= 0) {
          articles[existingIdx] = hydrated;
        } else {
          articles.unshift(hydrated);
        }
        importedCount += 1;
      }

      repoConfig.lastSyncedAt = new Date().toISOString();
      rebuildStaticBundle();
      commits.unshift({
        sha: shortSha(),
        message: `github(sync): imported ${importedCount} markdown files from ${repoConfig.owner}/${repoConfig.repo}`,
        author: session.username,
        timestamp: new Date().toISOString(),
        filePath: repoConfig.contentDir,
        action: 'sync',
        syncedToGitHub: true,
      });

      return res.json({
        importedCount,
        status: buildGitHubStatus(session),
        manifest: staticManifest,
      });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'GitHub sync failed.',
      });
    }
  });

  app.post('/api/github/publish-pages', requireRoles(['admin']), async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({
        error: 'Connect your GitHub account (Personal Access Token or OAuth) before publishing to GitHub Pages.',
      });
    }

    // Apply any target updates sent directly with the publish click
    const bodyOwner = typeof req.body?.owner === 'string' ? req.body.owner.trim() : '';
    const bodyRepo = typeof req.body?.repo === 'string' ? req.body.repo.trim() : '';
    const bodyBranch = typeof req.body?.branch === 'string' ? req.body.branch.trim() : '';
    const bodyContentDir = typeof req.body?.contentDir === 'string' ? req.body.contentDir.trim() : '';
    const bodyPagesBranch = typeof req.body?.pagesBranch === 'string' ? req.body.pagesBranch.trim() : '';
    const bodyCustomDomain =
      typeof req.body?.customDomain === 'string' ? req.body.customDomain.trim() : undefined;

    if (bodyOwner) {
      if (!isValidRepoSegment(bodyOwner)) return res.status(400).json({ error: 'Invalid GitHub owner name.' });
      repoConfig.owner = bodyOwner;
    }
    if (bodyRepo) {
      if (!isValidRepoSegment(bodyRepo)) return res.status(400).json({ error: 'Invalid GitHub repository name.' });
      repoConfig.repo = bodyRepo;
    }
    if (bodyBranch) {
      if (!isValidRepoSegment(bodyBranch)) return res.status(400).json({ error: 'Invalid source branch name.' });
      repoConfig.branch = bodyBranch;
    }
    if (bodyContentDir) {
      repoConfig.contentDir = sanitizeContentDir(bodyContentDir);
    }
    if (bodyPagesBranch) {
      if (!isValidRepoSegment(bodyPagesBranch)) {
        return res.status(400).json({ error: 'Invalid GitHub Pages branch name.' });
      }
      repoConfig.pagesBranch = bodyPagesBranch;
    }
    if (bodyCustomDomain !== undefined) {
      if (bodyCustomDomain && (!isValidCustomDomain(bodyCustomDomain) || isGitHubOwnedDomain(bodyCustomDomain))) {
        return res.status(400).json({
          error: isGitHubOwnedDomain(bodyCustomDomain)
            ? 'Do not enter a *.github.io address as Custom Domain. GitHub assigns your .github.io URL automatically from your GitHub Owner and Repository Name.'
            : 'Invalid custom domain hostname.',
        });
      }
      repoConfig.customDomain = bodyCustomDomain ? sanitizeCustomDomain(bodyCustomDomain) : undefined;
    }

    if (!repoConfig.owner || repoConfig.owner === 'your-username') {
      repoConfig.owner = session.username;
    }
    if (!isValidRepoSegment(repoConfig.owner) || !isValidRepoSegment(repoConfig.repo)) {
      return res.status(400).json({ error: 'Invalid repository owner or name.' });
    }
    const targetBranch = repoConfig.pagesBranch || 'gh-pages';
    if (!isValidRepoSegment(targetBranch)) {
      return res.status(400).json({ error: 'Invalid GitHub Pages branch name.' });
    }

    const extractGitHubMsg = async (r: globalThis.Response): Promise<string> => {
      const txt = await r.text().catch(() => '');
      try {
        const parsed = JSON.parse(txt) as { message?: string };
        if (parsed.message) return parsed.message;
      } catch {
        // ignore JSON parse failure
      }
      return txt.slice(0, 180) || `HTTP ${r.status}`;
    };

    try {
      const repoBase = `/repos/${encodeURIComponent(repoConfig.owner)}/${encodeURIComponent(repoConfig.repo)}`;

      // Preflight: verify repository exists and token has write permissions
      const repoRes = await githubFetch(repoBase, session.token);
      if (!repoRes.ok) {
        const ghMsg = await extractGitHubMsg(repoRes);
        if (repoRes.status === 404) {
          return res.status(404).json({
            error: `Repository "${repoConfig.owner}/${repoConfig.repo}" was not found on GitHub (or your Fine-Grained Token does not include this repository). Select an existing repo or create one first.`,
          });
        }
        if (repoRes.status === 403) {
          return res.status(403).json({
            error: `GitHub denied access to "${repoConfig.owner}/${repoConfig.repo}": ${ghMsg}. Ensure your token grants access to this repository with "Contents: Read & Write".`,
          });
        }
        return res.status(repoRes.status).json({
          error: `GitHub repository check failed (${repoRes.status}): ${ghMsg}`,
        });
      }

      const repoMeta = (await repoRes.json()) as {
        default_branch?: string;
        private?: boolean;
        size?: number;
        permissions?: { push?: boolean };
      };
      repoConfig.isPrivateRepo = Boolean(repoMeta.private);
      if (repoMeta.permissions && repoMeta.permissions.push === false) {
        return res.status(403).json({
          error: `Your GitHub token can read "${repoConfig.owner}/${repoConfig.repo}" but lacks write access. Grant "Contents: Read & Write" (Fine-Grained PAT) or "repo" (Classic PAT) and reconnect.`,
        });
      }

      const defaultBranch = repoMeta.default_branch || repoConfig.branch || 'main';
      if (targetBranch === defaultBranch || targetBranch === repoConfig.branch) {
        const pkgCheck = await githubFetch(
          `${repoBase}/contents/package.json?ref=${encodeURIComponent(targetBranch)}`,
          session.token,
        );
        if (pkgCheck.ok) {
          return res.status(400).json({
            error: `Refusing to force-push static HTML onto source branch "${targetBranch}" because it contains application source code (package.json). Keep GitHub Pages Branch set to "gh-pages", or use the included .github/workflows/deploy-pages.yml GitHub Actions workflow.`,
          });
        }
      }

      rebuildStaticBundle();
      const bundle = buildGitHubPagesBundle(articles, {
        owner: repoConfig.owner,
        repo: repoConfig.repo,
        customDomain: repoConfig.customDomain,
      });

      // Resolve existing targetBranch or default branch commit
      let targetBranchExists = false;
      let parentCommitSha: string | null = null;

      const targetRefRes = await githubFetch(
        `${repoBase}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
        session.token,
      );
      if (targetRefRes.ok) {
        const refData = (await targetRefRes.json()) as { object?: { sha?: string } };
        parentCommitSha = refData.object?.sha || null;
        targetBranchExists = Boolean(parentCommitSha);
      } else {
        for (const fallbackBranch of [repoConfig.branch, defaultBranch]) {
          if (!fallbackBranch || fallbackBranch === targetBranch) continue;
          const baseRefRes = await githubFetch(
            `${repoBase}/git/ref/heads/${encodeURIComponent(fallbackBranch)}`,
            session.token,
          );
          if (baseRefRes.ok) {
            const baseRef = (await baseRefRes.json()) as { object?: { sha?: string } };
            if (baseRef.object?.sha) {
              parentCommitSha = baseRef.object.sha;
              break;
            }
          }
        }
      }

      // If repository is completely empty (0 commits), initialize default branch first via Contents API (no branch param!)
      if (!parentCommitSha) {
        const initRes = await githubFetch(`${repoBase}/contents/.nojekyll`, session.token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'chore(pages): initialize AmplitudeLand GitHub Pages repository',
            content: '',
          }),
        });
        if (!initRes.ok) {
          const ghMsg = await extractGitHubMsg(initRes);
          return res.status(initRes.status).json({
            error: `GitHub rejected writing to "${repoConfig.owner}/${repoConfig.repo}" (${initRes.status}): ${ghMsg}. Verify your token has "Contents: Read & Write" permission on this repository.`,
          });
        }
        const initJson = (await initRes.json()) as { commit?: { sha?: string } };
        parentCommitSha = initJson.commit?.sha || null;
        if (targetBranch === defaultBranch) {
          targetBranchExists = Boolean(parentCommitSha);
        }
      }

      // Create blobs for all static site files
      const treeEntries: Array<{ path: string; mode: '100644'; type: 'blob'; sha: string }> = [];
      for (const file of bundle.files) {
        const blobRes = await githubFetch(`${repoBase}/git/blobs`, session.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: Buffer.from(file.content, 'utf8').toString('base64'),
            encoding: 'base64',
          }),
        });
        if (!blobRes.ok) {
          const ghMsg = await extractGitHubMsg(blobRes);
          return res.status(blobRes.status >= 400 && blobRes.status < 500 ? blobRes.status : 502).json({
            error: `Failed uploading ${file.path} to GitHub (${blobRes.status}): ${ghMsg}`,
          });
        }
        const blobData = (await blobRes.json()) as { sha: string };
        treeEntries.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
      }

      // Include editorial plate images & author portraits from src/assets/images/
      const srcImagesDir = path.resolve(process.cwd(), 'src/assets/images');
      if (fs.existsSync(srcImagesDir)) {
        for (const entry of fs.readdirSync(srcImagesDir, { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          const imgPath = path.join(srcImagesDir, entry.name);
          const imgB64 = fs.readFileSync(imgPath).toString('base64');
          const imgBlobRes = await githubFetch(`${repoBase}/git/blobs`, session.token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: imgB64, encoding: 'base64' }),
          });
          if (imgBlobRes.ok) {
            const imgBlobData = (await imgBlobRes.json()) as { sha: string };
            treeEntries.push({
              path: `assets/images/${entry.name}`,
              mode: '100644',
              type: 'blob',
              sha: imgBlobData.sha,
            });
          }
        }
      }

      const treeRes = await githubFetch(`${repoBase}/git/trees`, session.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tree: treeEntries }),
      });
      if (!treeRes.ok) {
        const ghMsg = await extractGitHubMsg(treeRes);
        return res.status(treeRes.status >= 400 && treeRes.status < 500 ? treeRes.status : 502).json({
          error: `Failed creating Git tree (${treeRes.status}): ${ghMsg}`,
        });
      }
      const treeData = (await treeRes.json()) as { sha: string };

      const commitMessage = `pages(deploy): publish AmplitudeLand static weblog (${bundle.fileCount} files)`;
      const commitRes = await githubFetch(`${repoBase}/git/commits`, session.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: commitMessage,
          tree: treeData.sha,
          parents: parentCommitSha ? [parentCommitSha] : [],
        }),
      });
      if (!commitRes.ok) {
        const ghMsg = await extractGitHubMsg(commitRes);
        return res.status(commitRes.status >= 400 && commitRes.status < 500 ? commitRes.status : 502).json({
          error: `Failed creating Git commit (${commitRes.status}): ${ghMsg}`,
        });
      }
      const commitData = (await commitRes.json()) as { sha: string };

      // Update or create targetBranch ref
      if (targetBranchExists) {
        const patchRes = await githubFetch(
          `${repoBase}/git/refs/heads/${encodeURIComponent(targetBranch)}`,
          session.token,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sha: commitData.sha, force: true }),
          },
        );
        if (!patchRes.ok) {
          const ghMsg = await extractGitHubMsg(patchRes);
          return res.status(patchRes.status >= 400 && patchRes.status < 500 ? patchRes.status : 502).json({
            error: `Failed updating branch "${targetBranch}" (${patchRes.status}): ${ghMsg}`,
          });
        }
      } else {
        const createRefRes = await githubFetch(`${repoBase}/git/refs`, session.token, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref: `refs/heads/${targetBranch}`, sha: commitData.sha }),
        });
        if (!createRefRes.ok) {
          const ghMsg = await extractGitHubMsg(createRefRes);
          return res.status(createRefRes.status >= 400 && createRefRes.status < 500 ? createRefRes.status : 502).json({
            error: `Failed creating branch "${targetBranch}" (${createRefRes.status}): ${ghMsg}`,
          });
        }
      }

      // Enable or update GitHub Pages configuration and inspect live /pages status
      const settingsUrl = `https://github.com/${encodeURIComponent(repoConfig.owner)}/${encodeURIComponent(repoConfig.repo)}/settings/pages`;
      let pagesNotice: string | undefined;
      let pagesEnabled = false;
      let pagesBuildStatus: 'built' | 'building' | 'errored' | 'not_enabled' | 'unknown' = 'unknown';
      let authoritativePagesUrl = bundle.pagesUrl;

      const pagesEnableRes = await githubFetch(`${repoBase}/pages`, session.token, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: { branch: targetBranch, path: '/' } }),
      });

      let pagesMutationError: string | null = null;
      if (pagesEnableRes.status === 409) {
        pagesEnabled = true;
        const pagesUpdateRes = await githubFetch(`${repoBase}/pages`, session.token, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            source: { branch: targetBranch, path: '/' },
            ...(repoConfig.customDomain ? { cname: repoConfig.customDomain } : {}),
          }),
        });
        if (!pagesUpdateRes.ok) {
          pagesMutationError = await extractGitHubMsg(pagesUpdateRes);
        }
      } else if (pagesEnableRes.ok) {
        pagesEnabled = true;
        pagesBuildStatus = 'building';
      } else {
        pagesMutationError = await extractGitHubMsg(pagesEnableRes);
      }

      // Inspect current GitHub Pages status directly from GitHub API
      const pagesGetRes = await githubFetch(`${repoBase}/pages`, session.token);
      if (pagesGetRes.ok) {
        const pagesInfo = (await pagesGetRes.json()) as {
          html_url?: string;
          status?: string | null;
          source?: { branch?: string; path?: string };
        };
        pagesEnabled = true;
        if (pagesInfo.html_url) {
          authoritativePagesUrl = pagesInfo.html_url.replace(/\/+$/, '');
        }
        const configuredBranch = pagesInfo.source?.branch;
        repoConfig.pagesConfiguredBranch = configuredBranch;

        if (pagesInfo.status === 'built') pagesBuildStatus = 'built';
        else if (pagesInfo.status === 'errored') pagesBuildStatus = 'errored';
        else pagesBuildStatus = 'building';

        if (configuredBranch && configuredBranch !== targetBranch) {
          pagesNotice = `Files were pushed to branch "${targetBranch}", but GitHub Pages on this repository is currently serving branch "${configuredBranch}".${pagesMutationError ? ` (${pagesMutationError})` : ''} Open GitHub → Repository Settings → Pages and change Source to Branch "${targetBranch}" / (root).`;
        } else if (pagesBuildStatus === 'errored') {
          pagesNotice = `GitHub Pages reported a build error. Check GitHub → Actions or Repository Settings → Pages (${settingsUrl}).`;
        } else if (pagesBuildStatus === 'building') {
          pagesNotice = `Files pushed to "${targetBranch}" and GitHub Pages is currently building your site. First-time GitHub Pages builds typically take 1–3 minutes before going live at ${authoritativePagesUrl}.`;
        }
      } else {
        if (!pagesEnableRes.ok && pagesEnableRes.status !== 409) {
          pagesEnabled = false;
          pagesBuildStatus = 'not_enabled';
          if (repoMeta.private) {
            pagesNotice = `Files were pushed to branch "${targetBranch}", but GitHub Pages could not be enabled (${pagesMutationError || pagesEnableRes.status}). Note: private repositories on GitHub Free cannot publish GitHub Pages (make the repository Public or upgrade to GitHub Pro), and your token needs "Pages: Read & Write".`;
          } else {
            pagesNotice = `Files were pushed to branch "${targetBranch}", but GitHub Pages is NOT enabled yet (${pagesMutationError || pagesEnableRes.status}), which causes a 404 when visiting ${authoritativePagesUrl}. Open GitHub → Settings → Pages (${settingsUrl}), set Source Branch to "${targetBranch}" / (root), click Save, and wait 1–2 minutes.`;
          }
        }
      }

      repoConfig.pagesEnabled = pagesEnabled;
      repoConfig.pagesBuildStatus = pagesBuildStatus;
      repoConfig.livePagesUrl = authoritativePagesUrl;
      repoConfig.lastPagesPublishedAt = new Date().toISOString();

      const short = commitData.sha.slice(0, 7);
      commits.unshift({
        sha: short,
        message: commitMessage,
        author: session.username,
        timestamp: repoConfig.lastPagesPublishedAt,
        filePath: `${targetBranch}/index.html`,
        action: 'publish',
        syncedToGitHub: true,
      });

      return res.json({
        commitSha: short,
        branch: targetBranch,
        pagesUrl: authoritativePagesUrl,
        fileCount: bundle.fileCount,
        pagesEnabled,
        pagesBuildStatus,
        settingsUrl,
        pagesNotice,
        status: buildGitHubStatus(session),
      });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to publish to GitHub Pages.',
      });
    }
  });

  app.get('/api/github/pages-status', requireRoles(['admin']), async (req, res) => {
    const session = getSessionFromRequest(req);
    if (!session) {
      return res.status(401).json({ error: 'Connect your GitHub account first.' });
    }
    const repoBase = `/repos/${encodeURIComponent(repoConfig.owner)}/${encodeURIComponent(repoConfig.repo)}`;
    const settingsUrl = `https://github.com/${encodeURIComponent(repoConfig.owner)}/${encodeURIComponent(repoConfig.repo)}/settings/pages`;

    try {
      const repoRes = await githubFetch(repoBase, session.token);
      if (!repoRes.ok) {
        const msg = await repoRes.text().catch(() => '');
        return res.status(repoRes.status).json({
          error: `Repository "${repoConfig.owner}/${repoConfig.repo}" check failed (${repoRes.status}): ${msg.slice(0, 140)}`,
        });
      }
      const repoMeta = (await repoRes.json()) as { private?: boolean };
      repoConfig.isPrivateRepo = Boolean(repoMeta.private);

      const pagesRes = await githubFetch(`${repoBase}/pages`, session.token);
      if (pagesRes.status === 404) {
        repoConfig.pagesEnabled = false;
        repoConfig.pagesBuildStatus = 'not_enabled';
        repoConfig.pagesConfiguredBranch = undefined;
        repoConfig.livePagesUrl = undefined;
        return res.json({
          status: buildGitHubStatus(session),
          settingsUrl,
          message: `GitHub Pages is not enabled yet on "${repoConfig.owner}/${repoConfig.repo}". That causes GitHub to return 404. Open Settings → Pages and set Source Branch to "${repoConfig.pagesBranch}".`,
        });
      }
      if (!pagesRes.ok) {
        const txt = await pagesRes.text().catch(() => '');
        return res.status(pagesRes.status).json({
          error: `Unable to read GitHub Pages settings (${pagesRes.status}): ${txt.slice(0, 160)}. Grant "Pages: Read" on your token or check ${settingsUrl}.`,
        });
      }

      const pagesInfo = (await pagesRes.json()) as {
        html_url?: string;
        status?: string | null;
        source?: { branch?: string; path?: string };
      };
      repoConfig.pagesEnabled = true;
      repoConfig.pagesConfiguredBranch = pagesInfo.source?.branch;
      if (pagesInfo.html_url) {
        repoConfig.livePagesUrl = pagesInfo.html_url.replace(/\/+$/, '');
      }
      if (pagesInfo.status === 'built') repoConfig.pagesBuildStatus = 'built';
      else if (pagesInfo.status === 'errored') repoConfig.pagesBuildStatus = 'errored';
      else repoConfig.pagesBuildStatus = 'building';

      const expectedBranch = repoConfig.pagesBranch || 'gh-pages';
      let message = '';
      if (pagesInfo.source?.branch && pagesInfo.source.branch !== expectedBranch) {
        message = `GitHub Pages is serving branch "${pagesInfo.source.branch}", while you configured "${expectedBranch}". Update Source in Settings → Pages or set Pages Branch to "${pagesInfo.source.branch}".`;
      } else if (repoConfig.pagesBuildStatus === 'built') {
        message = `GitHub Pages is live and built at ${repoConfig.livePagesUrl || computeGitHubPagesUrl(repoConfig.owner, repoConfig.repo, repoConfig.customDomain)}.`;
      } else if (repoConfig.pagesBuildStatus === 'errored') {
        message = `GitHub Pages build errored on "${repoConfig.owner}/${repoConfig.repo}". Check Settings → Pages or Actions on GitHub.`;
      } else {
        message = `GitHub Pages is currently building "${repoConfig.owner}/${repoConfig.repo}" (typically takes 1–3 minutes).`;
      }

      return res.json({
        status: buildGitHubStatus(session),
        settingsUrl,
        message,
      });
    } catch (err) {
      return res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to check GitHub Pages status.',
      });
    }
  });

  app.post('/api/github/disconnect', requireRoles(['admin']), (req, res) => {
    const session = getSessionFromRequest(req);
    if (session) {
      githubSessions.delete(session.id);
    }
    clearSessionCookie(res);
    res.json({ status: buildGitHubStatus(null) });
  });

  // Static Site Generation (SSG) Inspector endpoints (build target: GitHub Pages)
  app.get('/api/ssg/manifest', (_req, res) => {
    res.json({ manifest: staticManifest });
  });

  app.post('/api/ssg/rebuild', requireRoles(['admin', 'editor']), (_req, res) => {
    rebuildStaticBundle();
    res.json({ manifest: staticManifest });
  });

  app.get('/api/ssg/pages-bundle', requireAuth, (_req, res) => {
    const bundle = buildGitHubPagesBundle(articles, {
      owner: repoConfig.owner,
      repo: repoConfig.repo,
      customDomain: repoConfig.customDomain,
    });
    res.json({ bundle });
  });

  app.get('/api/ssg/page/:slug', (req, res) => {
    const html = staticHtmlBySlug.get(req.params.slug);
    if (!html) {
      return res.status(404).json({ error: 'Static HTML not found (article may be a draft).' });
    }
    return res.json({ slug: req.params.slug, html });
  });

  app.get('/api/ssg/nextjs-scaffold', (_req, res) => {
    const code = generateNextJsSsgScaffold(
      repoConfig.owner,
      repoConfig.repo,
      repoConfig.branch,
      repoConfig.contentDir,
    );
    res.json({ filename: 'app/posts/[slug]/page.tsx', code });
  });

  app.get('/api/ssg/workflow', (_req, res) => {
    const code = generateGitHubPagesWorkflowYaml(repoConfig.branch);
    res.json({ filename: '.github/workflows/deploy-pages.yml', code });
  });

  const httpServer = createHttpServer(app);

  // Mount Vite dev middleware or serve production dist/
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: { server: httpServer },
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Production build not found. Run npm run build.');
      }
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`AmplitudeLand scientific blogging & GitHub CMS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
