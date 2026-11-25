import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Copy,
  ExternalLink,
  FolderGit2,
  GitBranch,
  Globe,
  Plus,
  RefreshCw,
  Rocket,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cmsApi,
  setGitHubSessionToken,
  type GitHubRepoSummary,
  type GitHubStatusResponse,
} from '../api/client.ts';
import { copyTextSafely } from '../lib/appearance.ts';
import { isGitHubOwnedDomain } from '../lib/auth.ts';
import type { GitHubPagesBundle, StaticBuildManifest, UserRole } from '../lib/types.ts';

interface GitHubSsgSettingsProps {
  githubStatus: GitHubStatusResponse | null;
  manifest: StaticBuildManifest | null;
  userRole?: UserRole;
  onStatusUpdated: (status: GitHubStatusResponse) => void;
  onManifestUpdated: (manifest: StaticBuildManifest) => void;
  onSyncCompleted: () => Promise<void>;
}

function previewPagesUrlForInputs(owner: string, repo: string, customDomain: string): string {
  const cleanedDomain = customDomain
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  if (cleanedDomain && !isGitHubOwnedDomain(cleanedDomain)) {
    return `https://${cleanedDomain}`;
  }
  const cleanOwner = owner.trim() || 'amplitudeland';
  const cleanRepo = repo.trim() || 'amplitudeland.github.io';
  if (cleanRepo.toLowerCase() === `${cleanOwner.toLowerCase()}.github.io`) {
    return `https://${cleanOwner}.github.io`;
  }
  return `https://${cleanOwner}.github.io/${cleanRepo}`;
}

export function GitHubSsgSettings({
  githubStatus,
  manifest,
  userRole = 'admin',
  onStatusUpdated,
  onManifestUpdated,
  onSyncCompleted,
}: GitHubSsgSettingsProps) {
  const canManageGitHub = userRole === 'admin';

  const [owner, setOwner] = useState(githubStatus?.owner || 'amplitudeland');
  const [repo, setRepo] = useState(githubStatus?.repo || 'amplitudeland.github.io');
  const [branch, setBranch] = useState(githubStatus?.branch || 'main');
  const [contentDir, setContentDir] = useState(githubStatus?.contentDir || 'content/posts');
  const [pagesBranch, setPagesBranch] = useState(githubStatus?.pagesBranch || 'gh-pages');
  const [customDomain, setCustomDomain] = useState(githubStatus?.customDomain || '');
  const [patToken, setPatToken] = useState('');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'ok' | 'warn' | 'err';
    text: string;
    actionUrl?: string;
    actionLabel?: string;
  } | null>(null);

  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const [inspectedHtml, setInspectedHtml] = useState<{ slug: string; html: string } | null>(null);
  const [nextjsCode, setNextjsCode] = useState<string | null>(null);
  const [copiedNext, setCopiedNext] = useState(false);
  const [workflowYaml, setWorkflowYaml] = useState<string | null>(null);
  const [copiedWorkflow, setCopiedWorkflow] = useState(false);
  const [copiedPagesUrl, setCopiedPagesUrl] = useState(false);

  const [pagesBundle, setPagesBundle] = useState<GitHubPagesBundle | null>(null);
  const [selectedBundlePath, setSelectedBundlePath] = useState<string>('index.html');
  const [copiedBundleFile, setCopiedBundleFile] = useState(false);

  useEffect(() => {
    if (githubStatus) {
      setOwner(githubStatus.owner);
      setRepo(githubStatus.repo);
      setBranch(githubStatus.branch);
      setContentDir(githubStatus.contentDir);
      setPagesBranch(githubStatus.pagesBranch || 'gh-pages');
      setCustomDomain(githubStatus.customDomain || '');
    }
  }, [githubStatus]);

  const loadRepos = useCallback(async () => {
    if (!canManageGitHub || !githubStatus?.connected) {
      setRepos([]);
      return;
    }
    setLoadingRepos(true);
    try {
      const res = await cmsApi.listGitHubRepos();
      setRepos(res.repos);
    } catch {
      // Non-fatal: manual owner/repo inputs remain usable
    } finally {
      setLoadingRepos(false);
    }
  }, [canManageGitHub, githubStatus?.connected]);

  useEffect(() => {
    loadRepos();
  }, [loadRepos]);

  const computedPagesUrl = useMemo(() => {
    return previewPagesUrlForInputs(owner, repo, customDomain);
  }, [owner, repo, customDomain]);

  // Listen for GitHub OAuth popup completion
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        if (typeof event.data.sessionToken === 'string') {
          setGitHubSessionToken(event.data.sessionToken);
        }
        cmsApi
          .getGitHubStatus()
          .then((status) => {
            onStatusUpdated(status);
            setFeedback({
              type: 'ok',
              text: `Connected to GitHub as @${status.username || 'user'}.`,
            });
          })
          .catch((err) => {
            setFeedback({
              type: 'err',
              text: err instanceof Error ? err.message : 'Unable to verify GitHub session.',
            });
          });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onStatusUpdated]);

  const handleOAuthConnect = async () => {
    setFeedback(null);
    setBusyAction('oauth');
    try {
      const res = await cmsApi.getGitHubOAuthUrl();
      if (!res.configured || !res.url) {
        setFeedback({
          type: 'err',
          text:
            res.message ||
            'GitHub OAuth App credentials are not configured. Paste your Fine-Grained or Classic Personal Access Token below to connect immediately.',
        });
        return;
      }
      const popup = window.open(res.url, 'github_oauth_popup', 'width=620,height=720');
      if (!popup) {
        setFeedback({
          type: 'err',
          text: 'Popup was blocked by your browser. Allow popups or use the Personal Access Token form above.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to start GitHub OAuth.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePatConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!patToken.trim()) {
      setFeedback({ type: 'err', text: 'Paste a GitHub Personal Access Token.' });
      return;
    }
    setBusyAction('pat');
    try {
      const res = await cmsApi.connectGitHubPat({
        token: patToken.trim(),
        owner: owner.trim(),
        repo: repo.trim(),
        branch: branch.trim(),
        contentDir: contentDir.trim(),
        pagesBranch: pagesBranch.trim() || 'gh-pages',
        customDomain: customDomain.trim(),
      });
      setGitHubSessionToken(res.sessionToken);
      setPatToken('');
      onStatusUpdated(res.status);
      setFeedback({
        type: 'ok',
        text: `Connected online to GitHub as @${res.status.username}. Select or create a repository below, then click "Publish Blog to GitHub Pages".`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Token verification failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectRepo = async (fullName: string) => {
    const selected = repos.find((r) => r.fullName === fullName);
    if (!selected) return;
    setOwner(selected.owner);
    setRepo(selected.name);
    setBranch(selected.defaultBranch);
    const nextPagesBranch = pagesBranch || 'gh-pages';
    setPagesBranch(nextPagesBranch);
    setFeedback(null);
    try {
      const res = await cmsApi.updateGitHubConfig({
        owner: selected.owner,
        repo: selected.name,
        branch: selected.defaultBranch,
        contentDir: contentDir.trim(),
        pagesBranch: nextPagesBranch,
        customDomain: customDomain.trim(),
      });
      onStatusUpdated(res.status);
    } catch {
      // Keep local fields updated even if config save fails
    }
  };

  const handleCreateRootRepo = async () => {
    if (!githubStatus?.username) return;
    const repoName = `${githubStatus.username}.github.io`;
    setFeedback(null);
    setBusyAction('create-repo');
    try {
      const res = await cmsApi.createGitHubRepo({
        name: repoName,
        description: 'AmplitudeLand scientific weblog & LaTeX monographs',
        private: false,
      });
      onStatusUpdated(res.status);
      await loadRepos();
      setFeedback({
        type: 'ok',
        text: `Created public repository ${res.repo.fullName}. Click "Publish Blog to GitHub Pages" to deploy to ${res.status.pagesUrl}.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to create GitHub Pages repository.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveRepoConfig = async () => {
    setFeedback(null);
    setBusyAction('config');
    try {
      const res = await cmsApi.updateGitHubConfig({
        owner: owner.trim(),
        repo: repo.trim(),
        branch: branch.trim(),
        contentDir: contentDir.trim(),
        pagesBranch: pagesBranch.trim() || 'gh-pages',
        customDomain: customDomain.trim(),
      });
      onStatusUpdated(res.status);
      setFeedback({
        type: 'ok',
        text: `Saved GitHub target ${res.status.owner}/${res.status.repo} (Pages URL: ${res.status.pagesUrl}).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update repository target.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleSync = async () => {
    setFeedback(null);
    setBusyAction('sync');
    try {
      const res = await cmsApi.syncGitHubRepo();
      onStatusUpdated(res.status);
      onManifestUpdated(res.manifest);
      await onSyncCompleted();
      setFeedback({
        type: 'ok',
        text: res.status.connected
          ? `Pulled ${res.importedCount} Markdown files from GitHub and rebuilt ${res.manifest.publishedCount} pages for GitHub Pages.`
          : `Rebuilt ${res.manifest.publishedCount} GitHub Pages HTML files in ${res.manifest.durationMs} ms.`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Repository sync failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePublishPages = async () => {
    setFeedback(null);
    setBusyAction('publish-pages');
    try {
      const res = await cmsApi.publishGitHubPages({
        owner: owner.trim(),
        repo: repo.trim(),
        branch: branch.trim(),
        contentDir: contentDir.trim(),
        pagesBranch: pagesBranch.trim() || 'gh-pages',
        customDomain: customDomain.trim(),
      });
      onStatusUpdated(res.status);
      if (!res.pagesEnabled) {
        setFeedback({
          type: 'warn',
          text:
            res.pagesNotice ||
            `Static files pushed to "${res.branch}", but GitHub Pages is not enabled yet on this repository (visiting the URL will show 404 until Pages is enabled).`,
          actionUrl: res.settingsUrl,
          actionLabel: 'Open GitHub Settings → Pages',
        });
      } else if (res.pagesNotice) {
        setFeedback({
          type: res.pagesBuildStatus === 'errored' ? 'err' : 'warn',
          text: `Published ${res.fileCount} static files (commit ${res.commitSha}) to "${res.branch}". ${res.pagesNotice}`,
          actionUrl: res.pagesBuildStatus === 'building' ? res.pagesUrl : res.settingsUrl,
          actionLabel:
            res.pagesBuildStatus === 'building' ? 'Check Live URL' : 'Open GitHub Settings → Pages',
        });
      } else {
        setFeedback({
          type: 'ok',
          text: `Published ${res.fileCount} static files (commit ${res.commitSha}) to "${res.branch}". Your weblog is live at ${res.pagesUrl}`,
          actionUrl: res.pagesUrl,
          actionLabel: 'Open Weblog',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'GitHub Pages publish failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleCheckPagesStatus = async () => {
    setFeedback(null);
    setBusyAction('pages-status');
    try {
      const res = await cmsApi.checkGitHubPagesStatus();
      onStatusUpdated(res.status);
      const isOk = res.status.pagesEnabled && res.status.pagesBuildStatus === 'built';
      const isErr = res.status.pagesBuildStatus === 'errored' || res.status.pagesEnabled === false;
      setFeedback({
        type: isOk ? 'ok' : isErr ? 'warn' : 'ok',
        text: res.message,
        actionUrl: isOk ? res.status.pagesUrl : res.settingsUrl,
        actionLabel: isOk ? 'Open Live Weblog' : 'Open GitHub Settings → Pages',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to check GitHub Pages status.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handlePreviewPagesBundle = async () => {
    setFeedback(null);
    setBusyAction('bundle');
    try {
      const res = await cmsApi.getPagesBundle();
      setPagesBundle(res.bundle);
      const preferred =
        res.bundle.files.find((f) => f.path === 'index.html')?.path ||
        res.bundle.files[0]?.path ||
        'index.html';
      setSelectedBundlePath(preferred);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to generate GitHub Pages bundle.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleDisconnect = async () => {
    setBusyAction('disconnect');
    try {
      const res = await cmsApi.disconnectGitHub();
      setGitHubSessionToken(null);
      setRepos([]);
      onStatusUpdated(res.status);
      setFeedback({
        type: 'ok',
        text: 'Disconnected GitHub session.',
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to disconnect GitHub session.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleRebuildSsg = async () => {
    setBusyAction('rebuild');
    setFeedback(null);
    try {
      const res = await cmsApi.rebuildSsg();
      onManifestUpdated(res.manifest);
      setFeedback({
        type: 'ok',
        text: `Static bundle ${res.manifest.buildId} built in ${res.manifest.durationMs} ms (${res.manifest.publishedCount} published pages ready for GitHub Pages, ${res.manifest.draftsExcludedCount} drafts excluded).`,
      });
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Static site rebuild failed.',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const handleInspectStaticHtml = async (slug: string) => {
    try {
      const res = await cmsApi.getStaticPageHtml(slug);
      setInspectedHtml(res);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load static HTML output.',
      });
    }
  };

  const handleShowNextJsScaffold = async () => {
    try {
      const res = await cmsApi.getNextJsScaffold();
      setNextjsCode(res.code);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load Next.js scaffold.',
      });
    }
  };

  const handleShowWorkflowYaml = async () => {
    try {
      const res = await cmsApi.getPagesWorkflow();
      setWorkflowYaml(res.code);
    } catch (err) {
      setFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load GitHub Actions workflow.',
      });
    }
  };

  const handleCopyNextJs = async () => {
    if (!nextjsCode) return;
    const ok = await copyTextSafely(nextjsCode);
    if (ok) {
      setCopiedNext(true);
      window.setTimeout(() => setCopiedNext(false), 2000);
    }
  };

  const handleCopyWorkflow = async () => {
    if (!workflowYaml) return;
    const ok = await copyTextSafely(workflowYaml);
    if (ok) {
      setCopiedWorkflow(true);
      window.setTimeout(() => setCopiedWorkflow(false), 2000);
    }
  };

  const handleCopyPagesUrl = async () => {
    const ok = await copyTextSafely(computedPagesUrl);
    if (ok) {
      setCopiedPagesUrl(true);
      window.setTimeout(() => setCopiedPagesUrl(false), 2000);
    }
  };

  const selectedBundleFile = useMemo(() => {
    if (!pagesBundle) return null;
    return (
      pagesBundle.files.find((f) => f.path === selectedBundlePath) || pagesBundle.files[0] || null
    );
  }, [pagesBundle, selectedBundlePath]);

  const handleCopyBundleFile = async () => {
    if (!selectedBundleFile) return;
    const ok = await copyTextSafely(selectedBundleFile.content);
    if (ok) {
      setCopiedBundleFile(true);
      window.setTimeout(() => setCopiedBundleFile(false), 2000);
    }
  };

  const currentRepoFullName = `${owner.trim()}/${repo.trim()}`;

  const customDomainIsGitHubIo = isGitHubOwnedDomain(customDomain);
  const mismatchedGitHubIoRepo =
    repo.trim().toLowerCase().endsWith('.github.io') &&
    owner.trim().length > 0 &&
    repo.trim().toLowerCase() !== `${owner.trim().toLowerCase()}.github.io`;
  const githubPagesSettingsUrl = `https://github.com/${encodeURIComponent(owner.trim() || 'username')}/${encodeURIComponent(repo.trim() || 'amplitudeland')}/settings/pages`;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
        <div>
          <h2 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100">
            AmplitudeLand · Publish Exclusively to GitHub Pages
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            All published monographs compile into static HTML and deploy straight to your GitHub Pages weblog—zero local setup or external hosting needed.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {canManageGitHub && (
            <button
              type="button"
              onClick={handleSync}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${busyAction === 'sync' ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>Sync from GitHub</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleRebuildSsg}
            disabled={busyAction !== null}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            <Globe className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{busyAction === 'rebuild' ? 'Building...' : 'Rebuild Bundle'}</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`flex flex-wrap items-center justify-between gap-3 rounded-md border px-4 py-3 text-sm ${
            feedback.type === 'ok'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : feedback.type === 'warn'
                ? 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'
                : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
          }`}
        >
          <span>{feedback.text}</span>
          {feedback.actionUrl && (
            <a
              href={feedback.actionUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold underline shrink-0"
            >
              <span>{feedback.actionLabel || 'Open Link'}</span>
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {/* Clean GitHub Pages Public Weblog URL Banner */}
      <section
        aria-label="GitHub Pages Weblog Publishing"
        className="space-y-3 rounded-md border border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/70 dark:bg-blue-950/30"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-blue-800 dark:text-blue-300">
                Your GitHub Weblog Address
              </span>
              {githubStatus?.pagesEnabled === true && (
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                    githubStatus.pagesBuildStatus === 'built'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                      : githubStatus.pagesBuildStatus === 'errored'
                        ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
                  }`}
                >
                  {githubStatus.pagesBuildStatus === 'built'
                    ? 'Live on GitHub Pages'
                    : githubStatus.pagesBuildStatus === 'errored'
                      ? 'Build Error'
                      : 'Building (1–3 min)'}
                </span>
              )}
              {githubStatus?.pagesEnabled === false && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                  Pages Not Enabled Yet (Returns 404)
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <code
                data-testid="github-pages-url"
                className="font-mono text-sm font-semibold text-stone-900 dark:text-stone-100"
              >
                {computedPagesUrl}
              </code>
              <button
                type="button"
                onClick={handleCopyPagesUrl}
                className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2 py-1 text-[11px] font-medium text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-stone-900 dark:text-blue-300"
              >
                <Copy className="h-3 w-3" aria-hidden="true" />
                <span>{copiedPagesUrl ? 'Copied' : 'Copy URL'}</span>
              </button>
              {githubStatus?.lastPagesPublishedAt && githubStatus.pagesEnabled !== false && (
                <a
                  href={computedPagesUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline dark:text-blue-400"
                >
                  <span>Visit Live GitHub Weblog</span>
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-400">
              Auto-deploys on push to <code className="font-mono">{branch || 'main'}</code> via{' '}
              <code className="font-mono">.github/workflows/deploy-pages.yml</code> (or publish directly to branch{' '}
              <code className="font-mono">{pagesBranch || 'gh-pages'}</code>). Root domain{' '}
              <code className="font-mono">https://amplitudeland.github.io</code> requires GitHub owner/org{' '}
              <code className="font-mono">amplitudeland</code> and repo{' '}
              <code className="font-mono">amplitudeland.github.io</code>.
              {githubStatus?.lastPagesPublishedAt && (
                <> Last published {githubStatus.lastPagesPublishedAt.slice(0, 19).replace('T', ' ')} UTC.</>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {canManageGitHub && githubStatus?.connected && (
              <button
                type="button"
                onClick={handleCheckPagesStatus}
                disabled={busyAction !== null}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${busyAction === 'pages-status' ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{busyAction === 'pages-status' ? 'Checking...' : 'Check Live Status'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePreviewPagesBundle}
              disabled={busyAction !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <FolderGit2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{busyAction === 'bundle' ? 'Preparing...' : 'Preview GitHub Pages Files'}</span>
            </button>

            {canManageGitHub && (
              <button
                type="button"
                onClick={handlePublishPages}
                disabled={busyAction !== null || !githubStatus?.connected}
                title={
                  githubStatus?.connected
                    ? `Deploy static site to ${pagesBranch}`
                    : 'Connect a GitHub token below first to deploy directly to GitHub Pages'
                }
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-600 dark:hover:bg-emerald-500"
              >
                <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {busyAction === 'publish-pages'
                    ? 'Deploying...'
                    : 'Publish Blog to GitHub Pages'}
                </span>
              </button>
            )}
          </div>
        </div>

        {(mismatchedGitHubIoRepo || customDomainIsGitHubIo || githubStatus?.pagesEnabled === false) && (
          <div className="flex items-start gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" aria-hidden="true" />
            <div className="space-y-1">
              {mismatchedGitHubIoRepo && (
                <p>
                  <strong>GitHub Pages naming rule:</strong> <code className="font-mono">https://{repo.trim()}</code> only exists if your GitHub username or organization is literally <code className="font-mono">{repo.trim().replace(/\.github\.io$/i, '')}</code>. Under <code className="font-mono">@{owner.trim()}</code>, GitHub serves this repository at <code className="font-mono">https://{owner.trim()}.github.io/{repo.trim()}</code>.
                </p>
              )}
              {customDomainIsGitHubIo && (
                <p>
                  <strong>Clear Custom Domain:</strong> Do not type a <code className="font-mono">*.github.io</code> address in Custom Domain. Leave Custom Domain blank unless you own a custom DNS domain (e.g. <code className="font-mono">blog.yourdomain.org</code>).
                </p>
              )}
              {githubStatus?.pagesEnabled === false && (
                <p>
                  <strong>Why visiting returns 404:</strong> GitHub Pages is not enabled yet on{' '}
                  <code className="font-mono">{owner}/{repo}</code>. Open{' '}
                  <a
                    href={githubPagesSettingsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline"
                  >
                    GitHub Repository Settings → Pages
                  </a>{' '}
                  and set Source to <code className="font-mono">GitHub Actions</code> or Branch <code className="font-mono">{pagesBranch || 'gh-pages'}</code> / <code className="font-mono">(root)</code>.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Online GitHub Repository & Auth Configuration (Admin Only) */}
      {canManageGitHub ? (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-5 rounded-md border border-stone-200 bg-white p-6 lg:col-span-6 dark:border-stone-800 dark:bg-stone-900/60">
            <div className="flex items-center justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
              <div className="flex items-center gap-2.5">
                <GitBranch className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                  GitHub Repository Target
                </h3>
              </div>
              <span
                className={`text-xs font-semibold ${
                  githubStatus?.connected
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-stone-500 dark:text-stone-400'
                }`}
              >
                {githubStatus?.connected
                  ? `Connected (@${githubStatus.username})`
                  : 'Not connected'}
              </span>
            </div>

            {githubStatus?.connected && (
              <div className="space-y-2 rounded-md border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-950/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label
                    htmlFor="gh-repo-picker"
                    className="text-xs font-semibold text-stone-700 dark:text-stone-300"
                  >
                    Quick-Select Your GitHub Repository
                  </label>
                  {githubStatus.username &&
                    !repos.some(
                      (r) =>
                        r.fullName.toLowerCase() ===
                        `${githubStatus.username!.toLowerCase()}/${githubStatus.username!.toLowerCase()}.github.io`,
                    ) && (
                      <button
                        type="button"
                        onClick={handleCreateRootRepo}
                        disabled={busyAction !== null}
                        className="inline-flex items-center gap-1 rounded border border-blue-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:bg-stone-900 dark:text-blue-300"
                      >
                        <Plus className="h-3 w-3" aria-hidden="true" />
                        <span>Create {githubStatus.username}.github.io</span>
                      </button>
                    )}
                </div>
                <select
                  id="gh-repo-picker"
                  value={repos.some((r) => r.fullName === currentRepoFullName) ? currentRepoFullName : ''}
                  onChange={(e) => {
                    if (e.target.value) handleSelectRepo(e.target.value);
                  }}
                  disabled={loadingRepos}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
                >
                  <option value="">
                    {loadingRepos
                      ? 'Loading your GitHub repositories...'
                      : repos.length > 0
                        ? 'Choose a repository with write access...'
                        : 'No repositories returned (enter owner & repo manually below)'}
                  </option>
                  {repos.map((r) => (
                    <option key={r.fullName} value={r.fullName} disabled={!r.canPush}>
                      {r.fullName} {r.isPrivate ? '(private)' : '(public)'}
                      {!r.canPush ? ' — read-only' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="gh-owner"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  GitHub Owner / Username
                </label>
                <input
                  id="gh-owner"
                  type="text"
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label
                  htmlFor="gh-repo"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Repository Name
                </label>
                <input
                  id="gh-repo"
                  type="text"
                  value={repo}
                  onChange={(e) => setRepo(e.target.value)}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label
                  htmlFor="gh-branch"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Markdown Source Branch
                </label>
                <input
                  id="gh-branch"
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label
                  htmlFor="gh-dir"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Markdown Directory
                </label>
                <input
                  id="gh-dir"
                  type="text"
                  value={contentDir}
                  onChange={(e) => setContentDir(e.target.value)}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label
                  htmlFor="gh-pages-branch"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  GitHub Pages Branch
                </label>
                <input
                  id="gh-pages-branch"
                  type="text"
                  value={pagesBranch}
                  onChange={(e) => setPagesBranch(e.target.value)}
                  placeholder="gh-pages"
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label
                  htmlFor="gh-custom-domain"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Custom Domain (CNAME, Optional)
                </label>
                <input
                  id="gh-custom-domain"
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="blog.amplitudeland.org"
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={handleSaveRepoConfig}
                disabled={busyAction !== null}
                className="rounded-md border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                Save Repository Target
              </button>
              {githubStatus?.connected && (
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="text-xs font-medium text-rose-700 hover:underline dark:text-rose-400"
                >
                  Disconnect GitHub Session
                </button>
              )}
            </div>
          </div>

          {/* Online Authentication Panel */}
          <div className="space-y-5 rounded-md border border-stone-200 bg-white p-6 lg:col-span-6 dark:border-stone-800 dark:bg-stone-900/60">
            <div className="flex items-center justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                  Online GitHub Authentication
                </h3>
              </div>
            </div>

            <div className="space-y-1.5 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
              <p>
                Tokens remain strictly in server session memory and are never written to browser storage.
              </p>
              <p>
                Required token permissions: <strong>Fine-Grained PAT</strong> with{' '}
                <code className="font-mono">Contents: Read &amp; Write</code> and{' '}
                <code className="font-mono">Pages: Read &amp; Write</code> (or a{' '}
                <strong>Classic PAT</strong> with <code className="font-mono">repo</code> scope).
              </p>
            </div>

            <form onSubmit={handlePatConnect} className="space-y-3">
              <div>
                <label
                  htmlFor="gh-pat-input"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  GitHub Personal Access Token (Online Session)
                </label>
                <div className="flex gap-2">
                  <input
                    id="gh-pat-input"
                    type="password"
                    value={patToken}
                    onChange={(e) => setPatToken(e.target.value)}
                    placeholder="github_pat_... or ghp_..."
                    autoComplete="off"
                    className="flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                  />
                  <button
                    type="submit"
                    disabled={busyAction !== null}
                    className="rounded-md bg-stone-900 px-4 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50 whitespace-nowrap shrink-0 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
                  >
                    {busyAction === 'pat' ? 'Verifying...' : 'Connect Token'}
                  </button>
                </div>
              </div>
            </form>

            <div className="border-t border-stone-200 pt-4 dark:border-stone-800">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-stone-600 dark:text-stone-400">
                  OAuth Callback:{' '}
                  <code className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] dark:bg-stone-800">
                    {githubStatus?.callbackUrls?.current || `${window.location.origin}/auth/callback`}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={handleOAuthConnect}
                  disabled={busyAction !== null}
                  className="rounded-md border border-stone-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-100 whitespace-nowrap shrink-0 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  Connect with GitHub OAuth
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-stone-200 bg-white px-5 py-4 text-xs text-stone-600 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-400">
          GitHub repository credentials and Pages deployment settings are restricted to Administrator accounts. You can still inspect the GitHub Pages static bundle below.
        </div>
      )}

      {/* Static Site Generation (SSG) & SEO Output targeting GitHub Pages */}
      {manifest && (
        <section aria-labelledby="ssg-inspector-heading" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3
                id="ssg-inspector-heading"
                className="font-editorial text-xl font-semibold text-stone-900 dark:text-stone-100"
              >
                GitHub Pages Build Output
              </h3>
              <p className="mt-0.5 text-xs font-mono tabular-nums text-stone-500 dark:text-stone-400">
                Build {manifest.buildId} · {manifest.publishedCount} pages for {computedPagesUrl} ·{' '}
                {manifest.draftsExcludedCount} drafts excluded ·{' '}
                {(manifest.totalBytes / 1024).toFixed(1)} KB total · {manifest.durationMs} ms
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs">
              <button
                type="button"
                onClick={handleShowWorkflowYaml}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                <span>GitHub Actions Workflow</span>
              </button>
              <button
                type="button"
                onClick={handleShowNextJsScaffold}
                className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-1.5 font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Next.js SSG Code</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-md border border-stone-200 bg-white dark:border-stone-800 dark:bg-stone-900/60">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 font-semibold text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
                  <th className="px-4 py-3">GitHub Pages Path</th>
                  <th className="px-4 py-3">Monograph Title</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Equations</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">HTML Size</th>
                  <th className="px-4 py-3 whitespace-nowrap">SEO &amp; Schema.org Checks</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {manifest.pages.map((page) => (
                  <tr key={page.slug} className="hover:bg-stone-50/70 dark:hover:bg-stone-800/40">
                    <td className="px-4 py-3 font-mono whitespace-nowrap text-stone-700 dark:text-stone-300">
                      {githubStatus?.lastPagesPublishedAt ? (
                        <a
                          href={`${computedPagesUrl}/posts/${encodeURIComponent(page.slug)}/`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 hover:underline dark:text-blue-400"
                        >
                          {page.path}
                        </a>
                      ) : (
                        page.path
                      )}
                    </td>
                    <td className="max-w-xs truncate px-4 py-3 font-medium text-stone-900 dark:text-stone-100">
                      {page.title}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-stone-700 dark:text-stone-300">
                      {page.equationCount}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums whitespace-nowrap text-stone-700 dark:text-stone-300">
                      {(page.bytes / 1024).toFixed(1)} KB
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-emerald-700 dark:text-emerald-400">
                      <span className="inline-flex items-center gap-1 font-medium">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          Title · Meta · OG ·{' '}
                          {page.hasJsonLd ? 'ScholarlyArticle JSON-LD' : 'No JSON-LD'}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => handleInspectStaticHtml(page.slug)}
                        className="font-semibold text-stone-800 hover:text-blue-700 whitespace-nowrap dark:text-stone-200 dark:hover:text-blue-400"
                      >
                        View HTML
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal: Inspect Static HTML */}
      {inspectedHtml && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Static HTML for ${inspectedHtml.slug}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-md border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5 dark:border-stone-800">
              <span className="font-mono text-xs font-semibold text-stone-800 dark:text-stone-200">
                posts/{inspectedHtml.slug}/index.html
              </span>
              <button
                type="button"
                aria-label="Close HTML inspector"
                onClick={() => setInspectedHtml(null)}
                className="rounded p-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <pre className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed text-stone-800 dark:text-stone-200">
              {inspectedHtml.html}
            </pre>
          </div>
        </div>
      )}

      {/* Modal: Preview GitHub Pages Bundle */}
      {pagesBundle && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="GitHub Pages Static Bundle"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-5xl flex-col rounded-md border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-5 py-3.5 dark:border-stone-800">
              <div>
                <div className="font-mono text-xs font-semibold text-stone-900 dark:text-stone-100">
                  GitHub Pages Bundle · {pagesBundle.fileCount} files ·{' '}
                  {(pagesBundle.totalBytes / 1024).toFixed(1)} KB
                </div>
                <div className="font-mono text-[11px] text-stone-500 dark:text-stone-400">
                  Target URL: {pagesBundle.pagesUrl}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedBundleFile && (
                  <button
                    type="button"
                    onClick={handleCopyBundleFile}
                    className="inline-flex items-center gap-1 rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                  >
                    <Copy className="h-3 w-3" />
                    <span>{copiedBundleFile ? 'Copied' : 'Copy File'}</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-label="Close GitHub Pages bundle preview"
                  onClick={() => setPagesBundle(null)}
                  className="rounded p-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid min-h-0 flex-1 md:grid-cols-12">
              <div className="max-h-48 overflow-y-auto border-b border-stone-200 bg-stone-50 p-2 md:col-span-4 md:max-h-none md:border-b-0 md:border-r dark:border-stone-800 dark:bg-stone-950">
                {pagesBundle.files.map((file) => {
                  const active = selectedBundleFile?.path === file.path;
                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedBundlePath(file.path)}
                      className={`mb-1 block w-full rounded px-2.5 py-1.5 text-left font-mono text-xs ${
                        active
                          ? 'bg-blue-700 text-white dark:bg-blue-600'
                          : 'text-stone-700 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800'
                      }`}
                    >
                      {file.path}
                    </button>
                  );
                })}
              </div>
              <pre className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed text-stone-800 md:col-span-8 dark:text-stone-200">
                {selectedBundleFile?.content || ''}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Next.js App Router SSG Export */}
      {nextjsCode && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Next.js SSG Route Code"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-md border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5 dark:border-stone-800">
              <span className="font-mono text-xs font-semibold text-stone-800 dark:text-stone-200">
                app/posts/[slug]/page.tsx (Next.js App Router SSG)
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyNextJs}
                  className="inline-flex items-center gap-1 rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedNext ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  aria-label="Close Next.js export modal"
                  onClick={() => setNextjsCode(null)}
                  className="rounded p-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed text-stone-800 dark:text-stone-200">
              {nextjsCode}
            </pre>
          </div>
        </div>
      )}
      {/* Modal: GitHub Actions Workflow */}
      {workflowYaml && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="GitHub Actions Pages Workflow"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-md border border-stone-200 bg-white shadow-xl dark:border-stone-800 dark:bg-stone-900">
            <div className="flex items-center justify-between border-b border-stone-200 px-5 py-3.5 dark:border-stone-800">
              <span className="font-mono text-xs font-semibold text-stone-800 dark:text-stone-200">
                .github/workflows/deploy-pages.yml
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyWorkflow}
                  className="inline-flex items-center gap-1 rounded border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-200 dark:hover:bg-stone-800"
                >
                  <Copy className="h-3 w-3" />
                  <span>{copiedWorkflow ? 'Copied' : 'Copy'}</span>
                </button>
                <button
                  type="button"
                  aria-label="Close workflow modal"
                  onClick={() => setWorkflowYaml(null)}
                  className="rounded p-1 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <pre className="flex-1 overflow-auto p-5 font-mono text-xs leading-relaxed text-stone-800 dark:text-stone-200">
              {workflowYaml}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
