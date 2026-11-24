/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import 'katex/dist/katex.min.css';
import { useCallback, useEffect, useState } from 'react';
import {
  cmsApi,
  setAuthSessionToken,
  setGitHubSessionToken,
  type CategorySummary,
  type GitHubStatusResponse,
  type TagSummary,
} from './api/client.ts';
import { ArticleReader } from './components/ArticleReader.tsx';
import { AuthGate } from './components/AuthGate.tsx';
import { CategoryManager } from './components/CategoryManager.tsx';
import { CmsDashboard, type CmsTab } from './components/CmsDashboard.tsx';
import { GitHubSsgSettings } from './components/GitHubSsgSettings.tsx';
import { JournalHome } from './components/JournalHome.tsx';
import { TopBar, type AppSection } from './components/TopBar.tsx';
import {
  getFontPairingOption,
  getThemeOption,
  parseArticleSlugFromPath,
  type FontPairingId,
  type ThemeId,
} from './lib/appearance.ts';
import type {
  Article,
  ArticleInput,
  AuthSessionState,
  CommitRecord,
  StaticBuildManifest,
} from './lib/types.ts';

function readStoredPreference(key: string, legacyKey?: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key) ?? (legacyKey ? window.localStorage.getItem(legacyKey) : null);
  } catch {
    return null;
  }
}

function writeStoredPreference(key: string, value: string) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // Ignore storage restrictions in sandboxed frames
  }
}

interface PendingAuthIntent {
  section: AppSection;
  cmsTab?: CmsTab;
  composeNew?: boolean;
  editArticle?: Article | null;
  reason?: string;
}

export default function App() {
  const [section, setSection] = useState<AppSection>('journal');
  const [activeArticleSlug, setActiveArticleSlug] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return parseArticleSlugFromPath(window.location.pathname, window.location.search);
  });

  const [articles, setArticles] = useState<Article[]>([]);
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const [commits, setCommits] = useState<CommitRecord[]>([]);
  const [githubStatus, setGithubStatus] = useState<GitHubStatusResponse | null>(null);
  const [manifest, setManifest] = useState<StaticBuildManifest | null>(null);
  const [authState, setAuthState] = useState<AuthSessionState>({
    adminConfigured: false,
    envManagedAdmin: false,
    authenticated: false,
    user: null,
  });
  const [authPrompt, setAuthPrompt] = useState<PendingAuthIntent | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [cmsTab, setCmsTab] = useState<CmsTab>('articles');
  const [editingArticle, setEditingArticle] = useState<Article | null>(null);
  const [isComposingNew, setIsComposingNew] = useState(false);

  const [themeId, setThemeId] = useState<ThemeId>(() => {
    return getThemeOption(readStoredPreference('amplitudeland_theme', 'axiomata_theme')).id;
  });
  const [fontId, setFontId] = useState<FontPairingId>(() => {
    return getFontPairingOption(readStoredPreference('amplitudeland_font', 'axiomata_font')).id;
  });

  useEffect(() => {
    const theme = getThemeOption(themeId);
    const root = document.documentElement;
    root.classList.toggle('dark', theme.isDark);
    root.dataset.theme = theme.id;
    root.style.setProperty('--theme-bg', theme.bg);
    root.style.setProperty('--theme-surface', theme.surface);
    root.style.setProperty('--theme-surface-muted', theme.surfaceMuted);
    root.style.setProperty('--theme-border', theme.border);
    root.style.setProperty('--theme-text', theme.text);
    root.style.setProperty('--theme-text-muted', theme.textMuted);
    root.style.setProperty('--theme-accent', theme.accent);
    writeStoredPreference('amplitudeland_theme', theme.id);
  }, [themeId]);

  useEffect(() => {
    const pairing = getFontPairingOption(fontId);
    const root = document.documentElement;
    root.dataset.font = pairing.id;
    root.style.setProperty('--font-serif', pairing.displayFont);
    root.style.setProperty('--font-sans', pairing.bodyFont);
    root.style.setProperty('--font-mono', pairing.monoFont);
    writeStoredPreference('amplitudeland_font', pairing.id);
  }, [fontId]);

  useEffect(() => {
    const onPopState = () => {
      const slug = parseArticleSlugFromPath(window.location.pathname, window.location.search);
      setActiveArticleSlug(slug);
      if (slug) {
        setSection('journal');
        setAuthPrompt(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const syncUrlToRoot = () => {
    if (window.location.pathname !== '/' || window.location.search) {
      window.history.pushState(null, '', '/');
    }
  };

  const refreshWorkspace = useCallback(async () => {
    try {
      const session = await cmsApi.getAuthSession();
      setAuthState(session);

      const [artRes, catRes, ssgRes] = await Promise.all([
        cmsApi.listArticles(),
        cmsApi.listCategories(),
        cmsApi.getSsgManifest(),
      ]);
      setArticles(artRes.articles);
      setCategories(catRes.categories);
      setTags(catRes.tags);
      setManifest(ssgRes.manifest);

      if (session.authenticated) {
        const [comRes, ghRes] = await Promise.all([
          cmsApi.listCommits(),
          cmsApi.getGitHubStatus(),
        ]);
        setCommits(comRes.commits);
        setGithubStatus(ghRes);
      } else {
        setCommits([]);
        setGithubStatus(null);
      }
      setErrorBanner(null);
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Unable to load workspace data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspace();
  }, [refreshWorkspace]);

  const applyDestination = (intent: PendingAuthIntent) => {
    setAuthPrompt(null);
    setActiveArticleSlug(null);
    syncUrlToRoot();
    setSection(intent.section);
    if (intent.section === 'cms') {
      setCmsTab(intent.cmsTab || 'articles');
      setIsComposingNew(Boolean(intent.composeNew));
      setEditingArticle(intent.editArticle ?? null);
    } else {
      setIsComposingNew(false);
      setEditingArticle(null);
    }
    window.scrollTo({ top: 0 });
  };

  const navigateWithAuthGuard = (intent: PendingAuthIntent) => {
    if (!authState.authenticated) {
      setActiveArticleSlug(null);
      syncUrlToRoot();
      setAuthPrompt(intent);
      window.scrollTo({ top: 0 });
      return;
    }
    applyDestination(intent);
  };

  const handleNavigate = (nextSection: AppSection) => {
    if (nextSection === 'cms' || nextSection === 'ssg') {
      navigateWithAuthGuard({
        section: nextSection,
        cmsTab: 'articles',
        reason:
          nextSection === 'ssg'
            ? 'Sign in to manage GitHub Pages deployment, repository tokens, and static builds.'
            : 'Sign in to manage drafts, publish monographs, and configure collaborator access.',
      });
      return;
    }
    setAuthPrompt(null);
    setActiveArticleSlug(null);
    setEditingArticle(null);
    setIsComposingNew(false);
    setSection(nextSection);
    syncUrlToRoot();
    window.scrollTo({ top: 0 });
  };

  const handleOpenArticle = (slug: string) => {
    setAuthPrompt(null);
    setActiveArticleSlug(slug);
    setSection('journal');
    const nextUrl = `/posts/${encodeURIComponent(slug)}`;
    if (window.location.pathname !== nextUrl) {
      window.history.pushState(null, '', nextUrl);
    }
    window.scrollTo({ top: 0 });
  };

  const handleStartNewDraft = () => {
    navigateWithAuthGuard({
      section: 'cms',
      cmsTab: 'articles',
      composeNew: true,
      editArticle: null,
      reason: 'Sign in to compose and commit a new LaTeX monograph draft.',
    });
  };

  const handleStartEditArticle = (article: Article) => {
    navigateWithAuthGuard({
      section: 'cms',
      cmsTab: 'articles',
      composeNew: false,
      editArticle: article,
      reason: `Sign in to edit "${article.title}".`,
    });
  };

  const handleOpenAuth = () => {
    navigateWithAuthGuard({
      section: 'cms',
      cmsTab: 'articles',
      reason: 'Sign in with your AmplitudeLand username and login key.',
    });
  };

  const handleOpenAccount = () => {
    navigateWithAuthGuard({
      section: 'cms',
      cmsTab: 'account',
    });
  };

  const handleAuthenticated = async (nextState: AuthSessionState) => {
    const pending = authPrompt || { section: 'cms' as AppSection, cmsTab: 'articles' as CmsTab };
    setAuthState(nextState);
    applyDestination(pending);
    await refreshWorkspace();
  };

  const handleLogout = async () => {
    try {
      const res = await cmsApi.logout();
      setAuthState(res.auth);
    } finally {
      setAuthSessionToken(null);
      setGitHubSessionToken(null);
      setEditingArticle(null);
      setIsComposingNew(false);
      setAuthPrompt(null);
      setSection('journal');
      syncUrlToRoot();
      await refreshWorkspace();
    }
  };

  const handleSaveArticle = async (input: ArticleInput, articleId?: string): Promise<Article> => {
    const res = articleId
      ? await cmsApi.updateArticle(articleId, input)
      : await cmsApi.createArticle(input);
    setEditingArticle(null);
    setIsComposingNew(false);
    await refreshWorkspace();
    return res.article;
  };

  const handleToggleStatus = async (article: Article) => {
    const nextStatus = article.status === 'published' ? 'draft' : 'published';
    await cmsApi.toggleStatus(article.id, nextStatus);
    await refreshWorkspace();
  };

  const handleDeleteArticle = async (article: Article) => {
    await cmsApi.deleteArticle(article.id);
    await refreshWorkspace();
  };

  const handleCreateCategory = async (name: string, description: string) => {
    const res = await cmsApi.createCategory(name, description);
    setCategories(res.categories);
    setTags(res.tags);
  };

  const handleUpdateCategory = async (slug: string, name: string, description: string) => {
    const res = await cmsApi.updateCategory(slug, name, description);
    setCategories(res.categories);
    setTags(res.tags);
    await refreshWorkspace();
  };

  const handleDeleteCategory = async (slug: string) => {
    const res = await cmsApi.deleteCategory(slug);
    setCategories(res.categories);
    setTags(res.tags);
    await refreshWorkspace();
  };

  const canEditCategoriesPublic =
    authState.authenticated &&
    (authState.user?.role === 'admin' || authState.user?.role === 'editor');

  return (
    <div className="theme-canvas min-h-screen transition-colors">
      <TopBar
        activeSection={authPrompt ? authPrompt.section : section}
        authState={authState}
        onNavigate={handleNavigate}
        onNewDraft={handleStartNewDraft}
        onOpenAuth={handleOpenAuth}
        onOpenAccount={handleOpenAccount}
      />

      {errorBanner && (
        <div
          role="alert"
          className="mx-auto mt-4 max-w-7xl px-4 sm:px-6 lg:px-8"
        >
          <div className="rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200">
            {errorBanner}
          </div>
        </div>
      )}

      {authPrompt && !authState.authenticated ? (
        <AuthGate
          authState={authState}
          reason={authPrompt.reason}
          onAuthenticated={handleAuthenticated}
          onBackToJournal={() => {
            setAuthPrompt(null);
            setSection('journal');
          }}
        />
      ) : activeArticleSlug ? (
        <ArticleReader
          slug={activeArticleSlug}
          onBack={() => {
            setActiveArticleSlug(null);
            syncUrlToRoot();
          }}
          onEditInCms={handleStartEditArticle}
        />
      ) : section === 'journal' ? (
        <JournalHome
          articles={articles}
          categories={categories}
          loading={loading}
          themeId={themeId}
          fontId={fontId}
          onChangeTheme={setThemeId}
          onChangeFont={setFontId}
          onOpenArticle={handleOpenArticle}
          onOpenCms={() => handleNavigate('cms')}
        />
      ) : section === 'categories' ? (
        <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
          <CategoryManager
            categories={categories}
            tags={tags}
            readOnly={!canEditCategoriesPublic}
            onCreateCategory={handleCreateCategory}
            onUpdateCategory={handleUpdateCategory}
            onDeleteCategory={handleDeleteCategory}
            onSelectCategoryForJournal={() => {
              setSection('journal');
              syncUrlToRoot();
              window.scrollTo({ top: 0 });
            }}
          />
        </main>
      ) : section === 'ssg' ? (
        <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8">
          <GitHubSsgSettings
            githubStatus={githubStatus}
            manifest={manifest}
            userRole={authState.user?.role}
            onStatusUpdated={setGithubStatus}
            onManifestUpdated={setManifest}
            onSyncCompleted={refreshWorkspace}
          />
        </main>
      ) : (
        <CmsDashboard
          articles={articles}
          categories={categories}
          tags={tags}
          commits={commits}
          githubStatus={githubStatus}
          manifest={manifest}
          authState={authState}
          activeTab={cmsTab}
          editingArticle={editingArticle}
          isComposingNew={isComposingNew}
          onChangeTab={setCmsTab}
          onStartNewDraft={handleStartNewDraft}
          onStartEditArticle={handleStartEditArticle}
          onCancelEdit={() => {
            setEditingArticle(null);
            setIsComposingNew(false);
          }}
          onSaveArticle={handleSaveArticle}
          onToggleStatus={handleToggleStatus}
          onDeleteArticle={handleDeleteArticle}
          onOpenReader={handleOpenArticle}
          onCreateCategory={handleCreateCategory}
          onUpdateCategory={handleUpdateCategory}
          onDeleteCategory={handleDeleteCategory}
          onStatusUpdated={setGithubStatus}
          onManifestUpdated={setManifest}
          onSyncCompleted={refreshWorkspace}
          onAuthUpdated={setAuthState}
          onLogout={handleLogout}
        />
      )}

      <footer className="theme-canvas border-t border-stone-200 py-8 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-editorial font-semibold text-stone-800 dark:text-stone-200">
              AmplitudeLand
            </span>
            <span aria-hidden="true">·</span>
            <span>Scientific Monographs &amp; GitHub Pages LaTeX Weblog</span>
          </div>
          <div className="flex items-center gap-5">
            {githubStatus?.pagesUrl &&
              githubStatus.lastPagesPublishedAt &&
              githubStatus.pagesEnabled !== false && (
              <a
                href={githubStatus.pagesUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-blue-700 hover:underline dark:text-blue-400"
              >
                Live GitHub Weblog
              </a>
            )}
            <button
              type="button"
              onClick={() => handleNavigate('ssg')}
              className="hover:text-stone-900 dark:hover:text-stone-200"
            >
              GitHub Pages
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('cms')}
              className="hover:text-stone-900 dark:hover:text-stone-200"
            >
              CMS Studio
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
