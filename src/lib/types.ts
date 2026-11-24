export type ArticleStatus = 'published' | 'draft';

export interface TocHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface Article {
  id: string;
  slug: string;
  title: string;
  abstract: string;
  category: string;
  tags: string[];
  status: ArticleStatus;
  author: string;
  authorAffiliation: string;
  authorAvatar?: string;
  publishedAt: string;
  updatedAt: string;
  doi?: string;
  coverImage?: string;
  coverCaption?: string;
  body: string;
  commitSha: string;
  commitMessage: string;
  filePath: string;
  githubSha?: string;
  readingTimeMinutes: number;
  equationCount: number;
}

export interface CategoryMeta {
  name: string;
  slug: string;
  description: string;
}

export interface CommitRecord {
  sha: string;
  message: string;
  author: string;
  timestamp: string;
  filePath: string;
  action: 'create' | 'update' | 'publish' | 'unpublish' | 'delete' | 'sync';
  syncedToGitHub: boolean;
}

export interface GitHubConfig {
  mode: 'demo' | 'github';
  connected: boolean;
  username?: string;
  avatarUrl?: string;
  owner: string;
  repo: string;
  branch: string;
  contentDir: string;
  pagesBranch: string;
  customDomain?: string;
  pagesUrl: string;
  pagesEnabled?: boolean;
  pagesBuildStatus?: 'built' | 'building' | 'errored' | 'not_enabled' | 'unknown';
  pagesConfiguredBranch?: string;
  isPrivateRepo?: boolean;
  lastSyncedAt?: string;
  lastPagesPublishedAt?: string;
  oauthConfigured: boolean;
}

export interface StaticPageArtifact {
  slug: string;
  title: string;
  path: string;
  bytes: number;
  equationCount: number;
  hasTitle: boolean;
  hasDescription: boolean;
  hasOpenGraph: boolean;
  hasJsonLd: boolean;
  hasKatex: boolean;
  generatedAt: string;
}

export interface StaticBuildManifest {
  buildId: string;
  builtAt: string;
  durationMs: number;
  publishedCount: number;
  draftsExcludedCount: number;
  totalBytes: number;
  pages: StaticPageArtifact[];
  sitemapXml: string;
  robotsTxt: string;
  rssXml: string;
}

export interface GitHubPagesFile {
  path: string;
  content: string;
}

export interface GitHubPagesBundle {
  pagesUrl: string;
  fileCount: number;
  totalBytes: number;
  files: GitHubPagesFile[];
}

export type UserRole = 'admin' | 'editor' | 'author';

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionState {
  adminConfigured: boolean;
  envManagedAdmin: boolean;
  authenticated: boolean;
  user: PublicUser | null;
}

export interface ArticleInput {
  title: string;
  slug?: string;
  abstract: string;
  category: string;
  tags: string[];
  status: ArticleStatus;
  author: string;
  authorAffiliation?: string;
  doi?: string;
  coverImage?: string;
  coverCaption?: string;
  body: string;
  commitMessage?: string;
}
