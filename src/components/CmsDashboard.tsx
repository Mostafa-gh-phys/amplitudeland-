import {
  Edit3,
  Eye,
  FileText,
  GitCommit,
  Plus,
  Search,
  Shield,
  Tags,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import type {
  CategorySummary,
  GitHubStatusResponse,
  TagSummary,
} from '../api/client.ts';
import type {
  Article,
  ArticleInput,
  ArticleStatus,
  AuthSessionState,
  CommitRecord,
  StaticBuildManifest,
} from '../lib/types.ts';
import { AccessManager } from './AccessManager.tsx';
import { CategoryManager } from './CategoryManager.tsx';
import { GitHubSsgSettings } from './GitHubSsgSettings.tsx';
import { LatexEditor } from './LatexEditor.tsx';

export type CmsTab = 'articles' | 'categories' | 'github-ssg' | 'commits' | 'account';

interface CmsDashboardProps {
  articles: Article[];
  categories: CategorySummary[];
  tags: TagSummary[];
  commits: CommitRecord[];
  githubStatus: GitHubStatusResponse | null;
  manifest: StaticBuildManifest | null;
  authState: AuthSessionState;
  activeTab: CmsTab;
  editingArticle: Article | null;
  isComposingNew: boolean;
  onChangeTab: (tab: CmsTab) => void;
  onStartNewDraft: () => void;
  onStartEditArticle: (article: Article) => void;
  onCancelEdit: () => void;
  onSaveArticle: (input: ArticleInput, articleId?: string) => Promise<Article>;
  onToggleStatus: (article: Article) => Promise<void>;
  onDeleteArticle: (article: Article) => Promise<void>;
  onOpenReader: (slug: string) => void;
  onCreateCategory: (name: string, description: string) => Promise<void>;
  onUpdateCategory: (slug: string, name: string, description: string) => Promise<void>;
  onDeleteCategory: (slug: string) => Promise<void>;
  onStatusUpdated: (status: GitHubStatusResponse) => void;
  onManifestUpdated: (manifest: StaticBuildManifest) => void;
  onSyncCompleted: () => Promise<void>;
  onAuthUpdated: (next: AuthSessionState) => void;
  onLogout: () => Promise<void>;
}

export function CmsDashboard({
  articles,
  categories,
  tags,
  commits,
  githubStatus,
  manifest,
  authState,
  activeTab,
  editingArticle,
  isComposingNew,
  onChangeTab,
  onStartNewDraft,
  onStartEditArticle,
  onCancelEdit,
  onSaveArticle,
  onToggleStatus,
  onDeleteArticle,
  onOpenReader,
  onCreateCategory,
  onUpdateCategory,
  onDeleteCategory,
  onStatusUpdated,
  onManifestUpdated,
  onSyncCompleted,
  onAuthUpdated,
  onLogout,
}: CmsDashboardProps) {
  const [statusFilter, setStatusFilter] = useState<'all' | ArticleStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [savingEditor, setSavingEditor] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [bannerState, setBannerState] = useState<{ text: string; slug?: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const role = authState.user?.role || 'author';
  const canPublish = role === 'admin' || role === 'editor';
  const canManageCategories = role === 'admin' || role === 'editor';

  const counts = useMemo(() => {
    const published = articles.filter((a) => a.status === 'published').length;
    const drafts = articles.length - published;
    return { total: articles.length, published, drafts };
  }, [articles]);

  const filteredArticles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return articles.filter((a) => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (categoryFilter !== 'All' && a.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        a.title.toLowerCase().includes(q) ||
        a.slug.toLowerCase().includes(q) ||
        a.tags.some((t) => t.toLowerCase().includes(q)) ||
        a.author.toLowerCase().includes(q)
      );
    });
  }, [articles, statusFilter, categoryFilter, searchQuery]);

  const handleSaveFromEditor = async (input: ArticleInput, articleId?: string) => {
    setSavingEditor(true);
    setBannerState(null);
    setActionError(null);
    try {
      const saved = await onSaveArticle(input, articleId);
      setBannerState({
        text:
          input.status === 'published'
            ? `Published "${saved.title}" and rebuilt static HTML output.`
            : `Saved draft "${saved.title}" to repository.`,
        slug: saved.slug,
      });
    } finally {
      setSavingEditor(false);
    }
  };

  const handleToggleArticleStatus = async (article: Article) => {
    setActionError(null);
    try {
      await onToggleStatus(article);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to update monograph status.');
    }
  };

  const handleConfirmDeleteArticle = async (article: Article) => {
    setActionError(null);
    try {
      await onDeleteArticle(article);
      setConfirmDeleteId(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to delete monograph.');
    }
  };

  if (isComposingNew || editingArticle) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <LatexEditor
          key={editingArticle?.id || 'new-draft'}
          initialArticle={editingArticle}
          categories={categories}
          saving={savingEditor}
          canPublish={canPublish}
          onCreateCategory={async (name) => {
            await onCreateCategory(name, `Monographs in ${name}.`);
          }}
          onSave={handleSaveFromEditor}
          onCancel={onCancelEdit}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
      {/* Workspace Header & Tab Strip */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
        <div className="flex flex-wrap items-center gap-1 rounded-md bg-stone-100 p-1 dark:bg-stone-900">
          <button
            type="button"
            onClick={() => onChangeTab('articles')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'articles'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-100'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
            }`}
          >
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Drafts &amp; Published ({counts.total})</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('categories')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'categories'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-100'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
            }`}
          >
            <Tags className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Categories &amp; Tags ({categories.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('github-ssg')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'github-ssg'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-100'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
            }`}
          >
            <span>GitHub Pages &amp; Static Build</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('commits')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'commits'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-100'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
            }`}
          >
            <GitCommit className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Commit History ({commits.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('account')}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'account'
                ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-100'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
            }`}
          >
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Account &amp; Access</span>
          </button>
        </div>

        <button
          type="button"
          onClick={onStartNewDraft}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Compose Monograph</span>
        </button>
      </div>

      {actionError && (
        <div
          role="alert"
          className="mb-6 flex items-center justify-between gap-3 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
        >
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-xs font-semibold underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {bannerState && (
        <div
          role="status"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
        >
          <span>{bannerState.text}</span>
          <div className="flex items-center gap-4">
            {bannerState.slug && (
              <button
                type="button"
                onClick={() => onOpenReader(bannerState.slug!)}
                className="text-xs font-semibold text-blue-700 underline dark:text-blue-300"
              >
                View Post on Website →
              </button>
            )}
            <button
              type="button"
              onClick={() => setBannerState(null)}
              className="text-xs font-semibold underline"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {activeTab === 'articles' && (
        <div className="space-y-6">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-md border border-stone-200 bg-white px-4 py-3.5 dark:border-stone-800 dark:bg-stone-900/60">
              <div className="text-xs text-stone-500 dark:text-stone-400">Total Manuscripts</div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                {counts.total}
              </div>
            </div>
            <div className="rounded-md border border-stone-200 bg-white px-4 py-3.5 dark:border-stone-800 dark:bg-stone-900/60">
              <div className="text-xs text-stone-500 dark:text-stone-400">Published Live</div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {counts.published}
              </div>
            </div>
            <div className="rounded-md border border-stone-200 bg-white px-4 py-3.5 dark:border-stone-800 dark:bg-stone-900/60">
              <div className="text-xs text-stone-500 dark:text-stone-400">Active Drafts</div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-amber-700 dark:text-amber-400">
                {counts.drafts}
              </div>
            </div>
            <div className="rounded-md border border-stone-200 bg-white px-4 py-3.5 dark:border-stone-800 dark:bg-stone-900/60">
              <div className="text-xs text-stone-500 dark:text-stone-400">Static HTML Build</div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
                {manifest ? `${manifest.durationMs} ms` : '—'}
              </div>
            </div>
          </div>

          {/* Filter Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              role="tablist"
              aria-label="Filter manuscripts by status"
              className="flex items-center gap-1 rounded-md border border-stone-200 bg-white p-1 dark:border-stone-800 dark:bg-stone-900"
            >
              {(
                [
                  { id: 'all', label: `All (${counts.total})` },
                  { id: 'published', label: `Published (${counts.published})` },
                  { id: 'draft', label: `Drafts (${counts.drafts})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={statusFilter === tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded px-3 py-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                    statusFilter === tab.id
                      ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900'
                      : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <select
                aria-label="Filter by category"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-800 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200"
              >
                <option value="All">All Categories</option>
                {categories.map((c) => (
                  <option key={c.slug} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>

              <div className="relative w-60">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-stone-400"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  aria-label="Search manuscripts"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter manuscripts..."
                  className="w-full rounded-md border border-stone-200 bg-white py-2 pl-8 pr-3 text-xs text-stone-900 placeholder:text-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100"
                />
              </div>
            </div>
          </div>

          {/* Manuscripts Table */}
          {filteredArticles.length === 0 ? (
            <div className="rounded-md border border-stone-200 bg-white px-6 py-12 text-center dark:border-stone-800 dark:bg-stone-900/60">
              <p className="text-sm font-medium text-stone-800 dark:text-stone-200">
                No manuscripts match the current filter.
              </p>
              <button
                type="button"
                onClick={onStartNewDraft}
                className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800"
              >
                Create New Draft
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/60">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 font-semibold text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
                    <th className="px-4 py-3">Monograph &amp; Path</th>
                    <th className="px-4 py-3">Category &amp; Tags</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Equations</th>
                    <th className="px-4 py-3">Commit</th>
                    <th className="px-4 py-3 text-right">Updated</th>
                    <th className="px-4 py-3 text-right">Workflow Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                  {filteredArticles.map((article) => {
                    const isPublished = article.status === 'published';
                    return (
                      <tr
                        key={article.id}
                        className="hover:bg-stone-50/70 dark:hover:bg-stone-800/40"
                      >
                        <td className="max-w-sm px-4 py-3.5">
                          <div className="font-editorial text-sm font-semibold text-stone-900 dark:text-stone-100">
                            {article.title}
                          </div>
                          <div className="mt-0.5 truncate font-mono text-[11px] text-stone-500 dark:text-stone-400">
                            {article.filePath}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-blue-700 dark:text-blue-400">
                            {article.category}
                          </div>
                          <div className="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">
                            {article.tags.length > 0 ? article.tags.join(', ') : 'No tags'}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          {isPublished ? (
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              ● Published
                            </span>
                          ) : (
                            <span className="font-semibold text-amber-700 dark:text-amber-400">
                              ▲ Draft
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums text-stone-700 dark:text-stone-300">
                          {article.equationCount}
                        </td>
                        <td className="px-4 py-3.5 font-mono tabular-nums text-stone-600 dark:text-stone-400">
                          {article.commitSha}
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono tabular-nums whitespace-nowrap text-stone-600 dark:text-stone-400">
                          {article.updatedAt}
                        </td>
                        <td className="px-4 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            {canPublish && (
                              <button
                                type="button"
                                onClick={() => handleToggleArticleStatus(article)}
                                className={`rounded border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                                  isPublished
                                    ? 'border-stone-300 text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'
                                    : 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800 dark:border-blue-600 dark:bg-blue-600'
                                }`}
                              >
                                {isPublished ? 'Move to Draft' : 'Publish'}
                              </button>
                            )}
                            <button
                              type="button"
                              aria-label={`Preview ${article.title}`}
                              onClick={() => onOpenReader(article.slug)}
                              className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Edit ${article.title}`}
                              onClick={() => onStartEditArticle(article)}
                              className="rounded p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                            {canPublish &&
                              (confirmDeleteId === article.id ? (
                                <button
                                  type="button"
                                  onClick={() => handleConfirmDeleteArticle(article)}
                                  className="rounded bg-rose-700 px-2 py-1 text-[11px] font-semibold text-white hover:bg-rose-800"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  aria-label={`Delete ${article.title}`}
                                  onClick={() => setConfirmDeleteId(article.id)}
                                  className="rounded p-1.5 text-stone-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'categories' && (
        <CategoryManager
          categories={categories}
          tags={tags}
          readOnly={!canManageCategories}
          onCreateCategory={onCreateCategory}
          onUpdateCategory={onUpdateCategory}
          onDeleteCategory={onDeleteCategory}
        />
      )}

      {activeTab === 'github-ssg' && (
        <GitHubSsgSettings
          githubStatus={githubStatus}
          manifest={manifest}
          userRole={role}
          onStatusUpdated={onStatusUpdated}
          onManifestUpdated={onManifestUpdated}
          onSyncCompleted={onSyncCompleted}
        />
      )}

      {activeTab === 'commits' && (
        <section aria-label="Git Commit History" className="space-y-4">
          <h2 className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100">
            Repository Version Control Log
          </h2>
          <div className="overflow-x-auto rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/60">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 font-semibold text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
                  <th className="px-4 py-3">SHA</th>
                  <th className="px-4 py-3">Commit Message</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Author</th>
                  <th className="px-4 py-3">Target</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {commits.map((c, i) => (
                  <tr key={`${c.sha}-${i}`}>
                    <td className="px-4 py-3 font-mono tabular-nums text-blue-700 dark:text-blue-400">
                      {c.sha}
                    </td>
                    <td className="px-4 py-3 font-medium text-stone-900 dark:text-stone-100">
                      {c.message}
                    </td>
                    <td className="px-4 py-3 font-mono text-stone-600 dark:text-stone-400">
                      {c.filePath}
                    </td>
                    <td className="px-4 py-3 text-stone-700 dark:text-stone-300">{c.author}</td>
                    <td className="px-4 py-3 text-stone-600 dark:text-stone-400">
                      {c.syncedToGitHub ? 'GitHub Remote' : 'Repository Store'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'account' && (
        <AccessManager
          authState={authState}
          onAuthUpdated={onAuthUpdated}
          onLogout={onLogout}
        />
      )}
    </main>
  );
}
