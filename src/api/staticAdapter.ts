import {
  countLatexEquations,
  estimateReadingTime,
  extractTocHeadings,
  parseArticleMarkdown,
  serializeArticleMarkdown,
  slugify,
} from '../lib/frontmatter.ts';
import { renderMarkdownLatex } from '../lib/markdownLatex.ts';
import { SEED_ARTICLES } from '../lib/seedArticles.ts';
import {
  buildGitHubPagesBundle,
  buildStaticSite,
  generateGitHubPagesWorkflowYaml,
  generateNextJsSsgScaffold,
  generateStaticArticleHtml,
} from '../lib/ssg.ts';
import type {
  Article,
  ArticleInput,
  ArticleStatus,
  AuthSessionState,
  CommitRecord,
  GitHubPagesBundle,
  PublicUser,
  StaticBuildManifest,
  TocHeading,
  UserRole,
} from '../lib/types.ts';
import type {
  CategorySummary,
  GitHubRepoSummary,
  GitHubStatusResponse,
  TagSummary,
} from './client.ts';

interface StaticStoredUser {
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

interface StaticRepoConfig {
  owner: string;
  repo: string;
  branch: string;
  contentDir: string;
  pagesBranch: string;
  customDomain?: string;
  lastSyncedAt?: string;
  lastPagesPublishedAt?: string;
  pagesEnabled?: boolean;
  pagesBuildStatus?: 'built' | 'building' | 'errored' | 'not_enabled' | 'unknown';
  pagesConfiguredBranch?: string;
  isPrivateRepo?: boolean;
  livePagesUrl?: string;
}

interface StaticCategoryRecord {
  name: string;
  slug: string;
  description: string;
}

interface StaticWorkspaceStore {
  articles: Article[];
  categories: StaticCategoryRecord[];
  commits: CommitRecord[];
  users: StaticStoredUser[];
  activeUserId: string | null;
  repoConfig: StaticRepoConfig;
  githubProfile: { username: string; avatarUrl?: string } | null;
}

const STORE_KEY = 'amplitudeland_static_workspace_v1';
const PAT_KEY = 'amplitudeland_static_gh_pat_v1';

const DEFAULT_CATEGORIES: StaticCategoryRecord[] = [
  {
    name: 'Quantum Physics',
    slug: 'quantum-physics',
    description: 'Fault-tolerant stabilizer codes, topological phases, and quantum measurement theory.',
  },
  {
    name: 'Fluid Dynamics',
    slug: 'fluid-dynamics',
    description: 'Turbulence cascades, partial differential equations, and spectral numerical methods.',
  },
  {
    name: 'Mathematics',
    slug: 'mathematics',
    description: 'Category theory, algebraic geometry, cohomology, and homotopical foundations.',
  },
  {
    name: 'Thermodynamics',
    slug: 'thermodynamics',
    description: 'Stochastic thermodynamics, fluctuation theorems, and non-equilibrium statistical physics.',
  },
  {
    name: 'Computational Biology',
    slug: 'computational-biology',
    description: 'Variational inference, dynamical cellular models, and geometric single-cell manifolds.',
  },
];

const DEFAULT_COMMITS: CommitRecord[] = [
  {
    sha: '9c4e1b8',
    message: 'feat(quantum): derive biased-noise surface code threshold scaling',
    author: 'Dr. Elena Rostova',
    timestamp: '2026-11-18T14:22:00Z',
    filePath: 'content/posts/topological-protection-surface-codes.md',
    action: 'publish',
    syncedToGitHub: true,
  },
  {
    sha: '4a7d02e',
    message: 'docs(fluids): add Kolmogorov 4/5 law derivation and spectral table',
    author: 'Prof. Marcus Vance',
    timestamp: '2026-11-16T09:45:00Z',
    filePath: 'content/posts/navier-stokes-spectral-turbulence.md',
    action: 'update',
    syncedToGitHub: true,
  },
  {
    sha: '71f3c90',
    message: 'wip(topology): draft Chern-Simons level quantization notes',
    author: 'Dr. Elena Rostova',
    timestamp: '2026-11-17T21:10:00Z',
    filePath: 'content/posts/chern-simons-topological-field-notes.md',
    action: 'create',
    syncedToGitHub: false,
  },
];

let cachedStore: StaticWorkspaceStore | null = null;
let hydratePromise: Promise<StaticWorkspaceStore> | null = null;

export function isStaticBuildFlagEnabled(): boolean {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    return env?.VITE_STATIC_PAGES === 'true';
  } catch {
    return false;
  }
}

function getAppBaseUrl(): string {
  try {
    const env = (import.meta as { env?: Record<string, string | undefined> }).env;
    return env?.BASE_URL || '/';
  } catch {
    return '/';
  }
}

function utf8ToBase64(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToUtf8(b64: string): string {
  const binary = atob(b64.replace(/\s+/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function randomHex(byteLen = 12): string {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function hashBrowserKey(loginKey: string, existingSalt?: string): Promise<{ salt: string; keyHash: string }> {
  const salt = existingSalt || randomHex(16);
  const input = new TextEncoder().encode(`${salt}:${loginKey}`);
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', input);
    const keyHash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    return { salt, keyHash };
  }
  // Minimal deterministic fallback for non-secure contexts
  let acc = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    acc ^= input[i];
    acc = Math.imul(acc, 16777619);
  }
  return { salt, keyHash: (acc >>> 0).toString(16).padStart(8, '0') };
}

function sanitizeDomainClient(raw: string): string {
  const cleaned = raw.trim().replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
  if (!cleaned) return '';
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(cleaned) ? cleaned : '';
}

function isGitHubDomainClient(raw: string): boolean {
  const cleaned = sanitizeDomainClient(raw);
  return cleaned.endsWith('.github.io') || cleaned === 'github.io';
}

function computePagesUrlClient(owner: string, repo: string, customDomain?: string): string {
  const cleanDomain = customDomain ? sanitizeDomainClient(customDomain) : '';
  if (cleanDomain && !isGitHubDomainClient(cleanDomain)) {
    return `https://${cleanDomain}`;
  }
  const cleanOwner = owner.trim() || 'amplitudeland';
  const cleanRepo = repo.trim() || 'amplitudeland.github.io';
  if (cleanRepo.toLowerCase() === `${cleanOwner.toLowerCase()}.github.io`) {
    return `https://${cleanOwner}.github.io`;
  }
  return `https://${cleanOwner}.github.io/${cleanRepo}`;
}

function getPatToken(): string | null {
  try {
    return window.sessionStorage.getItem(PAT_KEY);
  } catch {
    return null;
  }
}

function setPatToken(token: string | null) {
  try {
    if (token) {
      window.sessionStorage.setItem(PAT_KEY, token);
    } else {
      window.sessionStorage.removeItem(PAT_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function saveStore(store: StaticWorkspaceStore) {
  cachedStore = store;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

async function getStore(): Promise<StaticWorkspaceStore> {
  if (cachedStore) return cachedStore;
  if (hydratePromise) return hydratePromise;

  hydratePromise = (async () => {
    try {
      const savedRaw = window.localStorage.getItem(STORE_KEY);
      if (savedRaw) {
        const parsed = JSON.parse(savedRaw) as Partial<StaticWorkspaceStore>;
        if (Array.isArray(parsed.articles) && parsed.articles.length > 0 && parsed.repoConfig) {
          cachedStore = {
            articles: parsed.articles,
            categories: Array.isArray(parsed.categories) ? parsed.categories : DEFAULT_CATEGORIES,
            commits: Array.isArray(parsed.commits) ? parsed.commits : DEFAULT_COMMITS,
            users: Array.isArray(parsed.users) ? parsed.users : [],
            activeUserId: typeof parsed.activeUserId === 'string' ? parsed.activeUserId : null,
            repoConfig: {
              owner: parsed.repoConfig.owner || 'amplitudeland',
              repo: parsed.repoConfig.repo || 'amplitudeland.github.io',
              branch: parsed.repoConfig.branch || 'main',
              contentDir: parsed.repoConfig.contentDir || 'content/posts',
              pagesBranch: parsed.repoConfig.pagesBranch || 'gh-pages',
              customDomain: parsed.repoConfig.customDomain,
              lastSyncedAt: parsed.repoConfig.lastSyncedAt,
              lastPagesPublishedAt: parsed.repoConfig.lastPagesPublishedAt,
              pagesEnabled: parsed.repoConfig.pagesEnabled,
              pagesBuildStatus: parsed.repoConfig.pagesBuildStatus,
              pagesConfiguredBranch: parsed.repoConfig.pagesConfiguredBranch,
              isPrivateRepo: parsed.repoConfig.isPrivateRepo,
              livePagesUrl: parsed.repoConfig.livePagesUrl,
            },
            githubProfile: parsed.githubProfile ?? null,
          };
          return cachedStore;
        }
      }
    } catch {
      // fall through to static site-bundle hydration
    }

    let seedArticles = SEED_ARTICLES.map((a) => ({ ...a, tags: [...a.tags] }));
    let seedRepo: StaticRepoConfig = {
      owner: 'amplitudeland',
      repo: 'amplitudeland.github.io',
      branch: 'main',
      contentDir: 'content/posts',
      pagesBranch: 'gh-pages',
    };

    try {
      const base = getAppBaseUrl();
      const res = await fetch(`${base}data/site-bundle.json`, { cache: 'no-store' });
      if (res.ok) {
        const bundle = (await res.json()) as {
          articles?: Article[];
          repoConfig?: Partial<StaticRepoConfig>;
        };
        if (Array.isArray(bundle.articles) && bundle.articles.length > 0) {
          seedArticles = bundle.articles;
        }
        if (bundle.repoConfig) {
          seedRepo = {
            ...seedRepo,
            ...bundle.repoConfig,
          };
        }
      }
    } catch {
      // fall back to bundled SEED_ARTICLES
    }

    const fresh: StaticWorkspaceStore = {
      articles: seedArticles,
      categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
      commits: DEFAULT_COMMITS.map((c) => ({ ...c })),
      users: [],
      activeUserId: null,
      repoConfig: seedRepo,
      githubProfile: null,
    };
    saveStore(fresh);
    return fresh;
  })();

  try {
    return await hydratePromise;
  } finally {
    hydratePromise = null;
  }
}

function toPublicUser(u: StaticStoredUser): PublicUser {
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

function buildAuthState(store: StaticWorkspaceStore): AuthSessionState {
  const adminConfigured = store.users.some((u) => u.role === 'admin' && u.active);
  const current = store.activeUserId
    ? store.users.find((u) => u.id === store.activeUserId && u.active) || null
    : null;
  return {
    adminConfigured,
    envManagedAdmin: false,
    authenticated: Boolean(current),
    user: current ? toPublicUser(current) : null,
  };
}

function requireStaticAuth(store: StaticWorkspaceStore): StaticStoredUser {
  const current = store.activeUserId
    ? store.users.find((u) => u.id === store.activeUserId && u.active) || null
    : null;
  if (!current) {
    throw new Error('Authentication required. Please sign in first.');
  }
  return current;
}

function buildManifestForStore(store: StaticWorkspaceStore): StaticBuildManifest {
  const pagesUrl = computePagesUrlClient(
    store.repoConfig.owner,
    store.repoConfig.repo,
    store.repoConfig.customDomain,
  );
  return buildStaticSite(store.articles, pagesUrl).manifest;
}

function buildCategoriesPayload(store: StaticWorkspaceStore): {
  categories: CategorySummary[];
  tags: TagSummary[];
} {
  const map = new Map<string, CategorySummary>();
  for (const cat of store.categories) {
    map.set(cat.name, { ...cat, publishedCount: 0, draftCount: 0 });
  }
  for (const art of store.articles) {
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
  for (const art of store.articles) {
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

function buildGitHubStatusPayload(store: StaticWorkspaceStore): GitHubStatusResponse {
  const token = getPatToken();
  const connected = Boolean(token && store.githubProfile);
  return {
    mode: connected ? 'github' : 'demo',
    connected,
    username: connected ? store.githubProfile?.username : undefined,
    avatarUrl: connected ? store.githubProfile?.avatarUrl : undefined,
    owner: store.repoConfig.owner,
    repo: store.repoConfig.repo,
    branch: store.repoConfig.branch,
    contentDir: store.repoConfig.contentDir,
    pagesBranch: store.repoConfig.pagesBranch,
    customDomain: store.repoConfig.customDomain,
    pagesUrl:
      store.repoConfig.livePagesUrl ||
      computePagesUrlClient(
        store.repoConfig.owner,
        store.repoConfig.repo,
        store.repoConfig.customDomain,
      ),
    pagesEnabled: store.repoConfig.pagesEnabled,
    pagesBuildStatus: store.repoConfig.pagesBuildStatus,
    pagesConfiguredBranch: store.repoConfig.pagesConfiguredBranch,
    isPrivateRepo: store.repoConfig.isPrivateRepo,
    lastSyncedAt: store.repoConfig.lastSyncedAt,
    lastPagesPublishedAt: store.repoConfig.lastPagesPublishedAt,
    oauthConfigured: false,
    callbackUrls: {
      current: typeof window !== 'undefined' ? window.location.origin : 'https://amplitudeland.github.io',
    },
  };
}

async function ghFetch(path: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      ...(init.body && !((init.headers as Record<string, string> | undefined)?.['Content-Type'])
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init.headers || {}),
    },
  });
}

async function commitArticleToGitHubDirect(
  store: StaticWorkspaceStore,
  token: string,
  article: Article,
  message: string,
): Promise<string | null> {
  const repoPath = `/repos/${encodeURIComponent(store.repoConfig.owner)}/${encodeURIComponent(store.repoConfig.repo)}/contents/${article.filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/')}`;
  let existingSha = article.githubSha;
  if (!existingSha) {
    const lookup = await ghFetch(`${repoPath}?ref=${encodeURIComponent(store.repoConfig.branch)}`, token);
    if (lookup.ok) {
      const json = (await lookup.json()) as { sha?: string };
      existingSha = json.sha;
    }
  }
  const putRes = await ghFetch(repoPath, token, {
    method: 'PUT',
    body: JSON.stringify({
      message,
      content: utf8ToBase64(serializeArticleMarkdown(article)),
      branch: store.repoConfig.branch,
      ...(existingSha ? { sha: existingSha } : {}),
    }),
  });
  if (!putRes.ok) {
    const msg = await putRes.text();
    throw new Error(`GitHub commit failed (${putRes.status}): ${msg.slice(0, 160)}`);
  }
  const data = (await putRes.json()) as { content?: { sha?: string }; commit?: { sha?: string } };
  if (data.content?.sha) article.githubSha = data.content.sha;
  return data.commit?.sha?.slice(0, 7) || null;
}

export const staticCmsApi = {
  async getAuthSession(): Promise<AuthSessionState> {
    const store = await getStore();
    return buildAuthState(store);
  },

  async setupAdmin(payload: { username: string; displayName?: string; loginKey: string }) {
    const store = await getStore();
    if (store.users.some((u) => u.role === 'admin' && u.active)) {
      throw new Error('An administrator account is already configured in this browser.');
    }
    const username = payload.username.trim().toLowerCase();
    if (username.length < 3 || username.length > 32) {
      throw new Error('Username must be between 3 and 32 characters.');
    }
    if (payload.loginKey.length < 8) {
      throw new Error('Login key must be at least 8 characters long.');
    }
    const { salt, keyHash } = await hashBrowserKey(payload.loginKey);
    const now = new Date().toISOString();
    const admin: StaticStoredUser = {
      id: `usr-${randomHex(6)}`,
      username,
      displayName: payload.displayName?.trim() || username,
      role: 'admin',
      salt,
      keyHash,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    store.users = [admin, ...store.users.filter((u) => u.username !== username)];
    store.activeUserId = admin.id;
    saveStore(store);
    return { sessionToken: `static-${admin.id}`, auth: buildAuthState(store) };
  },

  async login(payload: { username: string; loginKey: string }) {
    const store = await getStore();
    const username = payload.username.trim().toLowerCase();
    const candidate = store.users.find((u) => u.username === username && u.active);
    if (!candidate) {
      throw new Error('Invalid username or login key.');
    }
    const { keyHash } = await hashBrowserKey(payload.loginKey, candidate.salt);
    if (keyHash !== candidate.keyHash) {
      throw new Error('Invalid username or login key.');
    }
    store.activeUserId = candidate.id;
    saveStore(store);
    return { sessionToken: `static-${candidate.id}`, auth: buildAuthState(store) };
  },

  async logout() {
    const store = await getStore();
    store.activeUserId = null;
    saveStore(store);
    return { auth: buildAuthState(store) };
  },

  async updateMyCredentials(payload: {
    currentLoginKey: string;
    username?: string;
    displayName?: string;
    newLoginKey?: string;
  }) {
    const store = await getStore();
    const current = requireStaticAuth(store);
    const check = await hashBrowserKey(payload.currentLoginKey, current.salt);
    if (check.keyHash !== current.keyHash) {
      throw new Error('Current login key is incorrect.');
    }
    if (payload.username?.trim()) {
      const nextU = payload.username.trim().toLowerCase();
      if (store.users.some((u) => u.id !== current.id && u.username === nextU)) {
        throw new Error('That username is already taken.');
      }
      current.username = nextU;
    }
    if (payload.displayName?.trim()) {
      current.displayName = payload.displayName.trim().slice(0, 64);
    }
    if (payload.newLoginKey) {
      if (payload.newLoginKey.length < 8) {
        throw new Error('Login key must be at least 8 characters long.');
      }
      const next = await hashBrowserKey(payload.newLoginKey);
      current.salt = next.salt;
      current.keyHash = next.keyHash;
    }
    current.updatedAt = new Date().toISOString();
    saveStore(store);
    return { auth: buildAuthState(store) };
  },

  async listUsers() {
    const store = await getStore();
    const current = requireStaticAuth(store);
    if (current.role !== 'admin') throw new Error('Administrator permission required.');
    return { users: store.users.map(toPublicUser) };
  },

  async createUser(payload: {
    username: string;
    displayName?: string;
    role: UserRole;
    loginKey?: string;
  }) {
    const store = await getStore();
    const current = requireStaticAuth(store);
    if (current.role !== 'admin') throw new Error('Administrator permission required.');
    const username = payload.username.trim().toLowerCase();
    if (store.users.some((u) => u.username === username)) {
      throw new Error('Username already exists.');
    }
    const issuedLoginKey = payload.loginKey || `amp_${randomHex(12)}`;
    const { salt, keyHash } = await hashBrowserKey(issuedLoginKey);
    const now = new Date().toISOString();
    const created: StaticStoredUser = {
      id: `usr-${randomHex(6)}`,
      username,
      displayName: payload.displayName?.trim() || username,
      role: payload.role,
      salt,
      keyHash,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    store.users.push(created);
    saveStore(store);
    return { user: toPublicUser(created), issuedLoginKey };
  },

  async updateUser(
    id: string,
    payload: {
      role?: UserRole;
      active?: boolean;
      displayName?: string;
      rotateKey?: boolean;
      newLoginKey?: string;
    },
  ) {
    const store = await getStore();
    const current = requireStaticAuth(store);
    if (current.role !== 'admin') throw new Error('Administrator permission required.');
    const target = store.users.find((u) => u.id === id);
    if (!target) throw new Error('User account not found.');
    if (payload.role) target.role = payload.role;
    if (typeof payload.active === 'boolean') target.active = payload.active;
    if (payload.displayName?.trim()) target.displayName = payload.displayName.trim();
    let issuedLoginKey: string | undefined;
    if (payload.rotateKey || payload.newLoginKey) {
      issuedLoginKey = payload.newLoginKey || `amp_${randomHex(12)}`;
      const next = await hashBrowserKey(issuedLoginKey);
      target.salt = next.salt;
      target.keyHash = next.keyHash;
    }
    target.updatedAt = new Date().toISOString();
    saveStore(store);
    return { user: toPublicUser(target), issuedLoginKey };
  },

  async deleteUser(id: string) {
    const store = await getStore();
    const current = requireStaticAuth(store);
    if (current.role !== 'admin') throw new Error('Administrator permission required.');
    if (current.id === id) throw new Error('You cannot delete your active session.');
    store.users = store.users.filter((u) => u.id !== id);
    saveStore(store);
    return { ok: true };
  },

  async listArticles(params?: { status?: string; category?: string; q?: string }) {
    const store = await getStore();
    let list = [...store.articles];
    if (params?.status === 'published' || params?.status === 'draft') {
      list = list.filter((a) => a.status === params.status);
    }
    if (params?.category && params.category !== 'All') {
      list = list.filter((a) => a.category.toLowerCase() === params.category!.toLowerCase());
    }
    if (params?.q?.trim()) {
      const q = params.q.trim().toLowerCase();
      list = list.filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          a.abstract.toLowerCase().includes(q) ||
          a.author.toLowerCase().includes(q) ||
          a.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    return { articles: list };
  },

  async getArticle(slug: string): Promise<{
    article: Article;
    html: string;
    toc: TocHeading[];
    markdownSource: string;
  }> {
    const store = await getStore();
    const article = store.articles.find((a) => a.slug === slug);
    if (!article) throw new Error('Article not found.');
    return {
      article,
      html: renderMarkdownLatex(article.body),
      toc: extractTocHeadings(article.body),
      markdownSource: serializeArticleMarkdown(article),
    };
  },

  async createArticle(input: ArticleInput) {
    const store = await getStore();
    const actor = requireStaticAuth(store);
    const today = new Date().toISOString().slice(0, 10);
    const slug = slugify(input.slug || input.title);
    const targetStatus: ArticleStatus =
      actor.role === 'author' ? 'draft' : input.status || 'draft';

    const article: Article = {
      id: `art-${randomHex(4)}`,
      slug,
      title: input.title.trim(),
      abstract: input.abstract.trim(),
      category: input.category.trim() || 'Mathematics',
      tags: Array.isArray(input.tags) ? input.tags : [],
      status: targetStatus,
      author: input.author.trim() || actor.displayName,
      authorAffiliation: (input.authorAffiliation || '').trim() || 'Independent Researcher',
      publishedAt: today,
      updatedAt: today,
      doi: input.doi,
      coverImage: input.coverImage,
      coverCaption: input.coverCaption,
      body: input.body,
      commitSha: randomHex(4).slice(0, 7),
      commitMessage: input.commitMessage || `content(post): add ${slug}`,
      filePath: `${store.repoConfig.contentDir}/${slug}.md`,
      readingTimeMinutes: estimateReadingTime(input.body),
      equationCount: countLatexEquations(input.body),
    };

    let syncedToGitHub = false;
    let githubWarning: string | undefined;
    const token = getPatToken();
    if (token) {
      try {
        const sha = await commitArticleToGitHubDirect(store, token, article, article.commitMessage);
        if (sha) article.commitSha = sha;
        syncedToGitHub = true;
      } catch (err) {
        githubWarning = err instanceof Error ? err.message : 'GitHub commit skipped.';
      }
    }

    store.articles.unshift(article);
    store.commits.unshift({
      sha: article.commitSha,
      message: article.commitMessage,
      author: article.author,
      timestamp: new Date().toISOString(),
      filePath: article.filePath,
      action: targetStatus === 'published' ? 'publish' : 'create',
      syncedToGitHub,
    });
    saveStore(store);

    return {
      article,
      manifest: buildManifestForStore(store),
      syncedToGitHub,
      githubWarning,
    };
  },

  async updateArticle(id: string, input: Partial<ArticleInput>) {
    const store = await getStore();
    const actor = requireStaticAuth(store);
    const idx = store.articles.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error('Article not found.');
    const prev = store.articles[idx];
    const today = new Date().toISOString().slice(0, 10);
    const nextBody = typeof input.body === 'string' ? input.body : prev.body;
    const nextStatus =
      actor.role === 'author' ? prev.status : input.status ?? prev.status;

    const updated: Article = {
      ...prev,
      title: input.title?.trim() || prev.title,
      slug: input.slug ? slugify(input.slug) : prev.slug,
      abstract: input.abstract ?? prev.abstract,
      category: input.category ?? prev.category,
      tags: Array.isArray(input.tags) ? input.tags : prev.tags,
      status: nextStatus,
      author: input.author ?? prev.author,
      authorAffiliation: input.authorAffiliation ?? prev.authorAffiliation,
      doi: input.doi !== undefined ? input.doi : prev.doi,
      coverImage: input.coverImage !== undefined ? input.coverImage : prev.coverImage,
      coverCaption: input.coverCaption !== undefined ? input.coverCaption : prev.coverCaption,
      body: nextBody,
      updatedAt: today,
      commitSha: randomHex(4).slice(0, 7),
      commitMessage: input.commitMessage || `content(post): update ${prev.slug}`,
      readingTimeMinutes: estimateReadingTime(nextBody),
      equationCount: countLatexEquations(nextBody),
    };

    let syncedToGitHub = false;
    let githubWarning: string | undefined;
    const token = getPatToken();
    if (token) {
      try {
        const sha = await commitArticleToGitHubDirect(store, token, updated, updated.commitMessage);
        if (sha) updated.commitSha = sha;
        syncedToGitHub = true;
      } catch (err) {
        githubWarning = err instanceof Error ? err.message : 'GitHub commit skipped.';
      }
    }

    store.articles[idx] = updated;
    store.commits.unshift({
      sha: updated.commitSha,
      message: updated.commitMessage,
      author: updated.author,
      timestamp: new Date().toISOString(),
      filePath: updated.filePath,
      action: 'update',
      syncedToGitHub,
    });
    saveStore(store);

    return {
      article: updated,
      manifest: buildManifestForStore(store),
      syncedToGitHub,
      githubWarning,
    };
  },

  async toggleStatus(id: string, status: ArticleStatus) {
    const store = await getStore();
    const actor = requireStaticAuth(store);
    if (actor.role === 'author') throw new Error('Editor or administrator role required to publish.');
    const idx = store.articles.findIndex((a) => a.id === id);
    if (idx < 0) throw new Error('Article not found.');
    const art = {
      ...store.articles[idx],
      status,
      updatedAt: new Date().toISOString().slice(0, 10),
      commitSha: randomHex(4).slice(0, 7),
      commitMessage: `cms(${status}): set ${store.articles[idx].slug} to ${status}`,
    };
    let syncedToGitHub = false;
    let githubWarning: string | undefined;
    const token = getPatToken();
    if (token) {
      try {
        const sha = await commitArticleToGitHubDirect(store, token, art, art.commitMessage);
        if (sha) art.commitSha = sha;
        syncedToGitHub = true;
      } catch (err) {
        githubWarning = err instanceof Error ? err.message : 'GitHub commit skipped.';
      }
    }
    store.articles[idx] = art;
    store.commits.unshift({
      sha: art.commitSha,
      message: art.commitMessage,
      author: actor.displayName,
      timestamp: new Date().toISOString(),
      filePath: art.filePath,
      action: status === 'published' ? 'publish' : 'unpublish',
      syncedToGitHub,
    });
    saveStore(store);
    return {
      article: art,
      manifest: buildManifestForStore(store),
      syncedToGitHub,
      githubWarning,
    };
  },

  async deleteArticle(id: string) {
    const store = await getStore();
    requireStaticAuth(store);
    store.articles = store.articles.filter((a) => a.id !== id);
    saveStore(store);
    return { ok: true, manifest: buildManifestForStore(store) };
  },

  async listCategories() {
    const store = await getStore();
    return buildCategoriesPayload(store);
  },

  async createCategory(name: string, description: string) {
    const store = await getStore();
    requireStaticAuth(store);
    store.categories.push({
      name: name.trim(),
      slug: slugify(name),
      description: description.trim(),
    });
    saveStore(store);
    return buildCategoriesPayload(store);
  },

  async updateCategory(slug: string, name: string, description: string) {
    const store = await getStore();
    requireStaticAuth(store);
    const cat = store.categories.find((c) => c.slug === slug);
    if (cat) {
      const oldName = cat.name;
      cat.name = name.trim();
      cat.slug = slugify(name);
      cat.description = description.trim();
      for (const a of store.articles) {
        if (a.category === oldName) a.category = cat.name;
      }
      saveStore(store);
    }
    return buildCategoriesPayload(store);
  },

  async deleteCategory(slug: string) {
    const store = await getStore();
    requireStaticAuth(store);
    store.categories = store.categories.filter((c) => c.slug !== slug);
    saveStore(store);
    return buildCategoriesPayload(store);
  },

  async listCommits() {
    const store = await getStore();
    return { commits: store.commits };
  },

  async getGitHubStatus() {
    const store = await getStore();
    return buildGitHubStatusPayload(store);
  },

  async getGitHubOAuthUrl() {
    return {
      configured: false,
      message:
        'Static GitHub Pages hosting connects directly via your Personal Access Token below without requiring a server OAuth secret.',
    };
  },

  async connectGitHubPat(payload: {
    token: string;
    owner: string;
    repo: string;
    branch: string;
    contentDir: string;
    pagesBranch?: string;
    customDomain?: string;
  }) {
    const store = await getStore();
    requireStaticAuth(store);
    const cleanToken = payload.token.trim();
    const userRes = await ghFetch('/user', cleanToken);
    if (!userRes.ok) {
      throw new Error(`GitHub rejected token (${userRes.status}). Check token scopes.`);
    }
    const user = (await userRes.json()) as { login: string; avatar_url?: string };
    setPatToken(cleanToken);
    store.githubProfile = { username: user.login, avatarUrl: user.avatar_url };
    if (payload.owner.trim()) store.repoConfig.owner = payload.owner.trim();
    if (payload.repo.trim()) store.repoConfig.repo = payload.repo.trim();
    if (payload.branch.trim()) store.repoConfig.branch = payload.branch.trim();
    if (payload.contentDir.trim()) store.repoConfig.contentDir = payload.contentDir.trim();
    if (payload.pagesBranch?.trim()) store.repoConfig.pagesBranch = payload.pagesBranch.trim();
    if (payload.customDomain !== undefined) {
      store.repoConfig.customDomain = payload.customDomain.trim()
        ? sanitizeDomainClient(payload.customDomain)
        : undefined;
    }
    saveStore(store);
    return { sessionToken: 'static-pat', status: buildGitHubStatusPayload(store) };
  },

  async updateGitHubConfig(payload: {
    owner: string;
    repo: string;
    branch: string;
    contentDir: string;
    pagesBranch?: string;
    customDomain?: string;
  }) {
    const store = await getStore();
    requireStaticAuth(store);
    if (payload.owner.trim()) store.repoConfig.owner = payload.owner.trim();
    if (payload.repo.trim()) store.repoConfig.repo = payload.repo.trim();
    if (payload.branch.trim()) store.repoConfig.branch = payload.branch.trim();
    if (payload.contentDir.trim()) store.repoConfig.contentDir = payload.contentDir.trim();
    if (payload.pagesBranch?.trim()) store.repoConfig.pagesBranch = payload.pagesBranch.trim();
    if (payload.customDomain !== undefined) {
      store.repoConfig.customDomain = payload.customDomain.trim()
        ? sanitizeDomainClient(payload.customDomain)
        : undefined;
    }
    saveStore(store);
    return { status: buildGitHubStatusPayload(store) };
  },

  async listGitHubRepos(): Promise<{ repos: GitHubRepoSummary[] }> {
    const token = getPatToken();
    if (!token) return { repos: [] };
    const res = await ghFetch('/user/repos?sort=updated&per_page=50&affiliation=owner,collaborator', token);
    if (!res.ok) return { repos: [] };
    const data = (await res.json()) as Array<{
      name: string;
      full_name: string;
      owner?: { login?: string };
      default_branch?: string;
      private?: boolean;
      has_pages?: boolean;
      html_url?: string;
      permissions?: { push?: boolean };
    }>;
    return {
      repos: data.map((r) => ({
        name: r.name,
        fullName: r.full_name,
        owner: r.owner?.login || '',
        defaultBranch: r.default_branch || 'main',
        isPrivate: Boolean(r.private),
        canPush: r.permissions?.push ?? true,
        hasPages: Boolean(r.has_pages),
        htmlUrl: r.html_url || `https://github.com/${r.full_name}`,
      })),
    };
  },

  async createGitHubRepo(payload: { name: string; description?: string; private?: boolean }) {
    const store = await getStore();
    requireStaticAuth(store);
    const token = getPatToken();
    if (!token) throw new Error('Connect GitHub first.');
    const res = await ghFetch('/user/repos', token, {
      method: 'POST',
      body: JSON.stringify({
        name: payload.name,
        description: payload.description || 'AmplitudeLand scientific weblog',
        private: Boolean(payload.private),
        auto_init: true,
      }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(`Create repo failed (${res.status}): ${msg.slice(0, 140)}`);
    }
    const r = (await res.json()) as {
      name: string;
      full_name: string;
      owner?: { login?: string };
      default_branch?: string;
      private?: boolean;
      has_pages?: boolean;
      html_url?: string;
    };
    store.repoConfig.owner = r.owner?.login || store.repoConfig.owner;
    store.repoConfig.repo = r.name;
    store.repoConfig.branch = r.default_branch || 'main';
    saveStore(store);
    return {
      repo: {
        name: r.name,
        fullName: r.full_name,
        owner: store.repoConfig.owner,
        defaultBranch: store.repoConfig.branch,
        isPrivate: Boolean(r.private),
        canPush: true,
        hasPages: Boolean(r.has_pages),
        htmlUrl: r.html_url || `https://github.com/${r.full_name}`,
      },
      status: buildGitHubStatusPayload(store),
    };
  },

  async syncGitHubRepo() {
    const store = await getStore();
    requireStaticAuth(store);
    const token = getPatToken();
    let importedCount = 0;
    if (token) {
      const dirPath = store.repoConfig.contentDir.split('/').map(encodeURIComponent).join('/');
      const listRes = await ghFetch(
        `/repos/${encodeURIComponent(store.repoConfig.owner)}/${encodeURIComponent(store.repoConfig.repo)}/contents/${dirPath}?ref=${encodeURIComponent(store.repoConfig.branch)}`,
        token,
      );
      if (listRes.ok) {
        const items = (await listRes.json()) as Array<{ name: string; path: string; sha: string; type: string }>;
        for (const item of items.filter((f) => f.type === 'file' && /\.(md|mdx)$/i.test(f.name)).slice(0, 30)) {
          const fileRes = await ghFetch(
            `/repos/${encodeURIComponent(store.repoConfig.owner)}/${encodeURIComponent(store.repoConfig.repo)}/contents/${item.path
              .split('/')
              .map(encodeURIComponent)
              .join('/')}?ref=${encodeURIComponent(store.repoConfig.branch)}`,
            token,
          );
          if (!fileRes.ok) continue;
          const fd = (await fileRes.json()) as { content?: string; sha?: string };
          if (!fd.content) continue;
          const parsed = parseArticleMarkdown(base64ToUtf8(fd.content), item.name.replace(/\.(md|mdx)$/i, ''));
          const idx = store.articles.findIndex((a) => a.slug === parsed.frontmatter.slug);
          const hydrated: Article = {
            id: idx >= 0 ? store.articles[idx].id : `art-${randomHex(4)}`,
            slug: parsed.frontmatter.slug,
            title: parsed.frontmatter.title,
            abstract: parsed.frontmatter.abstract,
            category: parsed.frontmatter.category,
            tags: parsed.frontmatter.tags,
            status: parsed.frontmatter.status,
            author: parsed.frontmatter.author,
            authorAffiliation: parsed.frontmatter.authorAffiliation,
            authorAvatar: parsed.frontmatter.authorAvatar,
            publishedAt: parsed.frontmatter.publishedAt,
            updatedAt: parsed.frontmatter.updatedAt,
            doi: parsed.frontmatter.doi,
            coverImage: parsed.frontmatter.coverImage,
            coverCaption: parsed.frontmatter.coverCaption,
            body: parsed.body,
            commitSha: (fd.sha || randomHex(4)).slice(0, 7),
            commitMessage: `github(sync): pulled ${item.name}`,
            filePath: item.path,
            githubSha: fd.sha,
            readingTimeMinutes: estimateReadingTime(parsed.body),
            equationCount: countLatexEquations(parsed.body),
          };
          if (idx >= 0) store.articles[idx] = hydrated;
          else store.articles.unshift(hydrated);
          importedCount += 1;
        }
      }
    }
    store.repoConfig.lastSyncedAt = new Date().toISOString();
    saveStore(store);
    return {
      importedCount,
      status: buildGitHubStatusPayload(store),
      manifest: buildManifestForStore(store),
    };
  },

  async publishGitHubPages(payload?: {
    owner?: string;
    repo?: string;
    branch?: string;
    contentDir?: string;
    pagesBranch?: string;
    customDomain?: string;
  }) {
    const store = await getStore();
    requireStaticAuth(store);
    const token = getPatToken();
    if (!token) {
      throw new Error('Connect your GitHub Personal Access Token before publishing.');
    }
    if (payload?.owner?.trim()) store.repoConfig.owner = payload.owner.trim();
    if (payload?.repo?.trim()) store.repoConfig.repo = payload.repo.trim();
    if (payload?.branch?.trim()) store.repoConfig.branch = payload.branch.trim();
    if (payload?.contentDir?.trim()) store.repoConfig.contentDir = payload.contentDir.trim();
    if (payload?.pagesBranch?.trim()) store.repoConfig.pagesBranch = payload.pagesBranch.trim();

    const repoBase = `/repos/${encodeURIComponent(store.repoConfig.owner)}/${encodeURIComponent(store.repoConfig.repo)}`;
    const pagesCheck = await ghFetch(`${repoBase}/pages`, token);
    let buildType = '';
    if (pagesCheck.ok) {
      const pJson = (await pagesCheck.json()) as { build_type?: string; html_url?: string };
      buildType = pJson.build_type || '';
      if (pJson.html_url) store.repoConfig.livePagesUrl = pJson.html_url.replace(/\/+$/, '');
      store.repoConfig.pagesEnabled = true;
    }

    // Trigger GitHub Actions deploy-pages.yml directly when workflow Pages is enabled
    if (buildType === 'workflow') {
      const dispatchRes = await ghFetch(
        `${repoBase}/actions/workflows/deploy-pages.yml/dispatches`,
        token,
        {
          method: 'POST',
          body: JSON.stringify({ ref: store.repoConfig.branch }),
        },
      );
      if (dispatchRes.ok || dispatchRes.status === 204) {
        store.repoConfig.lastPagesPublishedAt = new Date().toISOString();
        store.repoConfig.pagesBuildStatus = 'building';
        saveStore(store);
        return {
          commitSha: randomHex(4).slice(0, 7),
          branch: store.repoConfig.branch,
          pagesUrl: computePagesUrlClient(
            store.repoConfig.owner,
            store.repoConfig.repo,
            store.repoConfig.customDomain,
          ),
          fileCount: buildManifestForStore(store).publishedCount,
          pagesEnabled: true,
          pagesBuildStatus: 'building' as const,
          settingsUrl: `https://github.com/${store.repoConfig.owner}/${store.repoConfig.repo}/settings/pages`,
          pagesNotice:
            'GitHub Actions workflow deploy-pages.yml dispatched cleanly. Live site updates in ~1 minute.',
          status: buildGitHubStatusPayload(store),
        };
      }
    }

    throw new Error(
      'Direct browser publishing triggers .github/workflows/deploy-pages.yml on GitHub Actions. Commit your post to main (or enable GitHub Actions in Settings -> Pages) to trigger an automatic rebuild.',
    );
  },

  async checkGitHubPagesStatus() {
    const store = await getStore();
    requireStaticAuth(store);
    const token = getPatToken();
    const settingsUrl = `https://github.com/${store.repoConfig.owner}/${store.repoConfig.repo}/settings/pages`;
    if (token) {
      const res = await ghFetch(
        `/repos/${encodeURIComponent(store.repoConfig.owner)}/${encodeURIComponent(store.repoConfig.repo)}/pages`,
        token,
      );
      if (res.ok) {
        const d = (await res.json()) as { status?: string; html_url?: string };
        store.repoConfig.pagesEnabled = true;
        store.repoConfig.pagesBuildStatus =
          d.status === 'built' ? 'built' : d.status === 'errored' ? 'errored' : 'building';
        if (d.html_url) store.repoConfig.livePagesUrl = d.html_url.replace(/\/+$/, '');
        saveStore(store);
        return {
          status: buildGitHubStatusPayload(store),
          message: `GitHub Pages status: ${d.status || 'active'} (${store.repoConfig.livePagesUrl || computePagesUrlClient(store.repoConfig.owner, store.repoConfig.repo, store.repoConfig.customDomain)}).`,
          settingsUrl,
        };
      }
      store.repoConfig.pagesEnabled = false;
      store.repoConfig.pagesBuildStatus = 'not_enabled';
      saveStore(store);
    }
    return {
      status: buildGitHubStatusPayload(store),
      message: 'GitHub Pages status checked.',
      settingsUrl,
    };
  },

  async disconnectGitHub() {
    const store = await getStore();
    setPatToken(null);
    store.githubProfile = null;
    saveStore(store);
    return { status: buildGitHubStatusPayload(store) };
  },

  async getSsgManifest() {
    const store = await getStore();
    return { manifest: buildManifestForStore(store) };
  },

  async rebuildSsg() {
    const store = await getStore();
    requireStaticAuth(store);
    return { manifest: buildManifestForStore(store) };
  },

  async getPagesBundle(): Promise<{ bundle: GitHubPagesBundle }> {
    const store = await getStore();
    requireStaticAuth(store);
    return {
      bundle: buildGitHubPagesBundle(store.articles, {
        owner: store.repoConfig.owner,
        repo: store.repoConfig.repo,
        customDomain: store.repoConfig.customDomain,
        localAssets: true,
      }),
    };
  },

  async getStaticPageHtml(slug: string) {
    const store = await getStore();
    requireStaticAuth(store);
    const article = store.articles.find((a) => a.slug === slug);
    if (!article) throw new Error('Published article not found.');
    const pagesUrl = computePagesUrlClient(
      store.repoConfig.owner,
      store.repoConfig.repo,
      store.repoConfig.customDomain,
    );
    return {
      slug,
      html: generateStaticArticleHtml(article, pagesUrl, { isGitHubPages: true, localAssets: true }),
    };
  },

  async getNextJsScaffold() {
    const store = await getStore();
    requireStaticAuth(store);
    return {
      filename: 'app/posts/[slug]/page.tsx',
      code: generateNextJsSsgScaffold(
        store.repoConfig.owner,
        store.repoConfig.repo,
        store.repoConfig.branch,
        store.repoConfig.contentDir,
      ),
    };
  },

  async getPagesWorkflow() {
    const store = await getStore();
    requireStaticAuth(store);
    return {
      filename: '.github/workflows/deploy-pages.yml',
      code: generateGitHubPagesWorkflowYaml(store.repoConfig.branch || 'main'),
    };
  },
};
