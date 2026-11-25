import type {
  Article,
  ArticleInput,
  ArticleStatus,
  AuthSessionState,
  CommitRecord,
  GitHubConfig,
  GitHubPagesBundle,
  PublicUser,
  StaticBuildManifest,
  TocHeading,
  UserRole,
} from '../lib/types.ts';
import { isStaticBuildFlagEnabled, staticCmsApi } from './staticAdapter.ts';

let memoryAuthToken: string | null = null;
let memoryGithubToken: string | null = null;

export function setAuthSessionToken(token: string | null) {
  memoryAuthToken = token;
}

export function getAuthSessionToken(): string | null {
  return memoryAuthToken;
}

export function setGitHubSessionToken(token: string | null) {
  memoryGithubToken = token;
}

export function getGitHubSessionToken(): string | null {
  return memoryGithubToken;
}

async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'X-Requested-With': 'AmplitudeLand-CMS',
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (memoryAuthToken) {
    headers['Authorization'] = `Bearer ${memoryAuthToken}`;
  }
  if (memoryGithubToken) {
    headers['X-GitHub-Session'] = memoryGithubToken;
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: 'include',
  });

  const rawText = await res.text().catch(() => '');
  let data: { error?: string; message?: string } = {};
  if (rawText) {
    try {
      data = JSON.parse(rawText) as { error?: string; message?: string };
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    const serverMsg = data.error || data.message;
    const textHint = !serverMsg && rawText ? `: ${rawText.replace(/<[^>]+>/g, ' ').trim().slice(0, 140)}` : '';
    throw new Error(serverMsg || `Request failed (${res.status})${textHint}`);
  }
  return data as T;
}

export interface CategorySummary {
  name: string;
  slug: string;
  description: string;
  publishedCount: number;
  draftCount: number;
}

export interface TagSummary {
  name: string;
  count: number;
}

export interface GitHubStatusResponse extends GitHubConfig {
  callbackUrls: { current: string };
}

export interface GitHubRepoSummary {
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
  isPrivate: boolean;
  canPush: boolean;
  hasPages: boolean;
  htmlUrl: string;
}

export function isStaticPagesApp(): boolean {
  return isStaticBuildFlagEnabled();
}

const serverCmsApi = {
  getAuthSession() {
    return apiFetch<AuthSessionState>('/api/auth/session');
  },

  setupAdmin(payload: { username: string; displayName?: string; loginKey: string }) {
    return apiFetch<{ sessionToken: string; auth: AuthSessionState }>('/api/auth/setup-admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  login(payload: { username: string; loginKey: string }) {
    return apiFetch<{ sessionToken: string; auth: AuthSessionState }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  logout() {
    return apiFetch<{ auth: AuthSessionState }>('/api/auth/logout', { method: 'POST' });
  },

  updateMyCredentials(payload: {
    currentLoginKey: string;
    username?: string;
    displayName?: string;
    newLoginKey?: string;
  }) {
    return apiFetch<{ auth: AuthSessionState }>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  listUsers() {
    return apiFetch<{ users: PublicUser[] }>('/api/auth/users');
  },

  createUser(payload: {
    username: string;
    displayName?: string;
    role: UserRole;
    loginKey?: string;
  }) {
    return apiFetch<{ user: PublicUser; issuedLoginKey: string }>('/api/auth/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateUser(
    id: string,
    payload: {
      role?: UserRole;
      active?: boolean;
      displayName?: string;
      rotateKey?: boolean;
      newLoginKey?: string;
    },
  ) {
    return apiFetch<{ user: PublicUser; issuedLoginKey?: string }>(
      `/api/auth/users/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      },
    );
  },

  deleteUser(id: string) {
    return apiFetch<{ ok: boolean }>(`/api/auth/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  listArticles(params?: { status?: string; category?: string; q?: string }) {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.category) qs.set('category', params.category);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiFetch<{ articles: Article[] }>(`/api/articles${suffix}`);
  },

  getArticle(slug: string) {
    return apiFetch<{
      article: Article;
      html: string;
      toc: TocHeading[];
      markdownSource: string;
    }>(`/api/articles/${encodeURIComponent(slug)}`);
  },

  createArticle(input: ArticleInput) {
    return apiFetch<{
      article: Article;
      manifest: StaticBuildManifest;
      syncedToGitHub: boolean;
      githubWarning?: string;
    }>('/api/articles', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateArticle(id: string, input: Partial<ArticleInput>) {
    return apiFetch<{
      article: Article;
      manifest: StaticBuildManifest;
      syncedToGitHub: boolean;
      githubWarning?: string;
    }>(`/api/articles/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  toggleStatus(id: string, status: ArticleStatus) {
    return apiFetch<{
      article: Article;
      manifest: StaticBuildManifest;
      syncedToGitHub: boolean;
      githubWarning?: string;
    }>(`/api/articles/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  deleteArticle(id: string) {
    return apiFetch<{ ok: boolean; manifest: StaticBuildManifest }>(
      `/api/articles/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },

  listCategories() {
    return apiFetch<{ categories: CategorySummary[]; tags: TagSummary[] }>('/api/categories');
  },

  createCategory(name: string, description: string) {
    return apiFetch<{ categories: CategorySummary[]; tags: TagSummary[] }>('/api/categories', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  },

  updateCategory(slug: string, name: string, description: string) {
    return apiFetch<{ categories: CategorySummary[]; tags: TagSummary[] }>(
      `/api/categories/${encodeURIComponent(slug)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ name, description }),
      },
    );
  },

  deleteCategory(slug: string) {
    return apiFetch<{ categories: CategorySummary[]; tags: TagSummary[] }>(
      `/api/categories/${encodeURIComponent(slug)}`,
      { method: 'DELETE' },
    );
  },

  listCommits() {
    return apiFetch<{ commits: CommitRecord[] }>('/api/commits');
  },

  getGitHubStatus() {
    return apiFetch<GitHubStatusResponse>('/api/github/status');
  },

  getGitHubOAuthUrl() {
    return apiFetch<{ configured: boolean; url?: string; message?: string }>(
      '/api/auth/github/url',
    );
  },

  connectGitHubPat(payload: {
    token: string;
    owner: string;
    repo: string;
    branch: string;
    contentDir: string;
    pagesBranch?: string;
    customDomain?: string;
  }) {
    return apiFetch<{ sessionToken: string; status: GitHubStatusResponse }>(
      '/api/github/connect-pat',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  updateGitHubConfig(payload: {
    owner: string;
    repo: string;
    branch: string;
    contentDir: string;
    pagesBranch?: string;
    customDomain?: string;
  }) {
    return apiFetch<{ status: GitHubStatusResponse }>('/api/github/config', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  syncGitHubRepo() {
    return apiFetch<{
      importedCount: number;
      status: GitHubStatusResponse;
      manifest: StaticBuildManifest;
    }>('/api/github/sync', { method: 'POST' });
  },

  listGitHubRepos() {
    return apiFetch<{ repos: GitHubRepoSummary[] }>('/api/github/repos');
  },

  createGitHubRepo(payload: { name: string; description?: string; private?: boolean }) {
    return apiFetch<{ repo: GitHubRepoSummary; status: GitHubStatusResponse }>(
      '/api/github/create-repo',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  publishGitHubPages(payload?: {
    owner?: string;
    repo?: string;
    branch?: string;
    contentDir?: string;
    pagesBranch?: string;
    customDomain?: string;
  }) {
    return apiFetch<{
      commitSha: string;
      branch: string;
      pagesUrl: string;
      fileCount: number;
      pagesEnabled: boolean;
      pagesBuildStatus?: 'built' | 'building' | 'errored' | 'not_enabled' | 'unknown';
      settingsUrl: string;
      pagesNotice?: string;
      status: GitHubStatusResponse;
    }>('/api/github/publish-pages', {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  checkGitHubPagesStatus() {
    return apiFetch<{
      status: GitHubStatusResponse;
      message: string;
      settingsUrl: string;
    }>('/api/github/pages-status');
  },

  disconnectGitHub() {
    return apiFetch<{ status: GitHubStatusResponse }>('/api/github/disconnect', {
      method: 'POST',
    });
  },

  getSsgManifest() {
    return apiFetch<{ manifest: StaticBuildManifest }>('/api/ssg/manifest');
  },

  rebuildSsg() {
    return apiFetch<{ manifest: StaticBuildManifest }>('/api/ssg/rebuild', {
      method: 'POST',
    });
  },

  getPagesBundle() {
    return apiFetch<{ bundle: GitHubPagesBundle }>('/api/ssg/pages-bundle');
  },

  getStaticPageHtml(slug: string) {
    return apiFetch<{ slug: string; html: string }>(
      `/api/ssg/page/${encodeURIComponent(slug)}`,
    );
  },

  getNextJsScaffold() {
    return apiFetch<{ filename: string; code: string }>('/api/ssg/nextjs-scaffold');
  },

  getPagesWorkflow() {
    return apiFetch<{ filename: string; code: string }>('/api/ssg/workflow');
  },
};

export const cmsApi: typeof serverCmsApi = isStaticPagesApp()
  ? (staticCmsApi as typeof serverCmsApi)
  : serverCmsApi;
