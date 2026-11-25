import { ArrowLeft, Eye, EyeOff, Github, KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { cmsApi, isStaticPagesApp, setAuthSessionToken } from '../api/client.ts';
import type { AuthSessionState } from '../lib/types.ts';

interface AuthGateProps {
  authState: AuthSessionState;
  reason?: string;
  onAuthenticated: (nextState: AuthSessionState) => Promise<void> | void;
  onBackToJournal: () => void;
}

export function AuthGate({
  authState,
  reason,
  onAuthenticated,
  onBackToJournal,
}: AuthGateProps) {
  const staticMode = isStaticPagesApp();
  const isFirstRunSetup = !staticMode && !authState.adminConfigured;
  const requiresOwnerToken = staticMode && !authState.adminConfigured;

  const [authMethod, setAuthMethod] = useState<'key' | 'github'>(
    requiresOwnerToken ? 'github' : 'key',
  );
  const [username, setUsername] = useState(isFirstRunSetup ? 'admin' : '');
  const [displayName, setDisplayName] = useState(isFirstRunSetup ? 'Chief Editor' : '');
  const [loginKey, setLoginKey] = useState('');
  const [confirmKey, setConfirmKey] = useState('');
  const [githubToken, setGithubToken] = useState('');
  const [saveLockToGitHub, setSaveLockToGitHub] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleKeyAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) {
      setError('Please enter a username.');
      return;
    }
    if (!loginKey) {
      setError('Please enter your login key.');
      return;
    }
    if (isFirstRunSetup) {
      if (loginKey.length < 8) {
        setError('Administrator login key must be at least 8 characters.');
        return;
      }
      if (loginKey !== confirmKey) {
        setError('Login keys do not match.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = isFirstRunSetup
        ? await cmsApi.setupAdmin({
            username: username.trim(),
            displayName: displayName.trim() || username.trim(),
            loginKey,
          })
        : await cmsApi.login({
            username: username.trim(),
            loginKey,
          });
      setAuthSessionToken(res.sessionToken);
      await onAuthenticated(res.auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!githubToken.trim()) {
      setError('Enter your GitHub Personal Access Token with push access to this repository.');
      return;
    }
    if (loginKey && loginKey.length < 8) {
      setError('Optional administrator login key must be at least 8 characters.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await cmsApi.verifyGitHubOwner({
        token: githubToken.trim(),
        username: username.trim() || undefined,
        displayName: displayName.trim() || undefined,
        loginKey: loginKey || undefined,
        saveLockToGitHub: Boolean(loginKey && saveLockToGitHub),
      });
      setAuthSessionToken(res.sessionToken);
      await onAuthenticated(res.auth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GitHub repository verification failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeMethod = requiresOwnerToken ? 'github' : staticMode ? authMethod : 'key';

  return (
    <main className="mx-auto max-w-lg px-4 py-14 sm:px-6">
      <button
        type="button"
        onClick={onBackToJournal}
        className="mb-6 inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        <span>Back to AmplitudeLand Journal</span>
      </button>

      <section className="theme-surface rounded-md border border-stone-200 p-6 shadow-xs sm:p-8 dark:border-stone-800">
        <div className="flex items-start gap-3 border-b border-stone-200 pb-5 dark:border-stone-800">
          <div className="mt-0.5 rounded-md bg-blue-50 p-2 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
            {isFirstRunSetup ? (
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            ) : activeMethod === 'github' ? (
              <Github className="h-5 w-5" aria-hidden="true" />
            ) : (
              <KeyRound className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <h1 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100">
              {isFirstRunSetup
                ? 'Claim Administrator Access'
                : activeMethod === 'github'
                  ? 'Repository Owner Verification'
                  : 'Editorial Sign In'}
            </h1>
            <p className="mt-1 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
              {isFirstRunSetup
                ? 'One-time setup: lock administrator ownership with your username and private login key. Once claimed, your session stays remembered and public setup is permanently locked.'
                : activeMethod === 'github'
                  ? 'Sign in by proving write access to this GitHub repository with a Personal Access Token. Public visitors cannot claim admin access.'
                  : reason ||
                    'Sign in with your AmplitudeLand username and login key to compose monographs, manage drafts, and publish to GitHub Pages.'}
            </p>
          </div>
        </div>

        {staticMode && authState.adminConfigured && (
          <div className="mt-5 grid grid-cols-2 gap-2 rounded-md bg-stone-100 p-1 dark:bg-stone-900">
            <button
              type="button"
              onClick={() => {
                setAuthMethod('key');
                setError(null);
              }}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeMethod === 'key'
                  ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-100'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              Username &amp; Key
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMethod('github');
                setError(null);
              }}
              className={`rounded px-3 py-1.5 text-xs font-semibold transition-colors ${
                activeMethod === 'github'
                  ? 'bg-white text-stone-900 shadow-xs dark:bg-stone-800 dark:text-stone-100'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
              }`}
            >
              GitHub Owner Token
            </button>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-md border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
          >
            {error}
          </div>
        )}

        {activeMethod === 'github' ? (
          <form onSubmit={handleOwnerTokenSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="auth-gh-token"
                className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
              >
                GitHub Personal Access Token (with repository write access)
              </label>
              <div className="relative">
                <input
                  id="auth-gh-token"
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={githubToken}
                  onChange={(e) => setGithubToken(e.target.value)}
                  placeholder="github_pat_... or ghp_..."
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 pr-10 font-mono text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
                <button
                  type="button"
                  aria-label={showKey ? 'Hide token' : 'Show token'}
                  onClick={() => setShowKey((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                Checked directly against GitHub API for repository push permission. Stored only in this browser session.
              </p>
            </div>

            {requiresOwnerToken && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="owner-username"
                      className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                    >
                      Admin Username (Optional)
                    </label>
                    <input
                      id="owner-username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Defaults to GitHub user"
                      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="owner-login-key"
                      className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                    >
                      Set Login Key (Optional)
                    </label>
                    <input
                      id="owner-login-key"
                      type={showKey ? 'text' : 'password'}
                      value={loginKey}
                      onChange={(e) => setLoginKey(e.target.value)}
                      placeholder="Min 8 chars for quick sign-in"
                      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                    />
                  </div>
                </div>

                {loginKey.length > 0 && (
                  <label className="flex items-start gap-2 rounded-md border border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-700 dark:border-stone-800 dark:bg-stone-900/60 dark:text-stone-300">
                    <input
                      type="checkbox"
                      checked={saveLockToGitHub}
                      onChange={(e) => setSaveLockToGitHub(e.target.checked)}
                      className="mt-0.5 rounded border-stone-300 text-blue-700"
                    />
                    <span>
                      Commit salted PBKDF2 admin lock (<code className="font-mono">.amplitudeland-admin.json</code>) to GitHub so future Pages builds recognize your username &amp; key without your PAT.
                    </span>
                  </label>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {submitting ? 'Verifying Repository Access...' : 'Verify GitHub Ownership & Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleKeyAuthSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="auth-username"
                className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
              >
                Username
              </label>
              <input
                id="auth-username"
                type="text"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
            </div>

            {isFirstRunSetup && (
              <div>
                <label
                  htmlFor="auth-display-name"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Display Name
                </label>
                <input
                  id="auth-display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Dr. Mostafa Ghorbani"
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
            )}

            <div>
              <label
                htmlFor="auth-login-key"
                className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
              >
                {isFirstRunSetup ? 'Administrator Login Key (min 8 chars)' : 'Login Key'}
              </label>
              <div className="relative">
                <input
                  id="auth-login-key"
                  type={showKey ? 'text' : 'password'}
                  autoComplete={isFirstRunSetup ? 'new-password' : 'current-password'}
                  value={loginKey}
                  onChange={(e) => setLoginKey(e.target.value)}
                  placeholder={isFirstRunSetup ? 'Choose a strong login key' : 'Enter your login key'}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 pr-10 font-mono text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
                <button
                  type="button"
                  aria-label={showKey ? 'Hide login key' : 'Show login key'}
                  onClick={() => setShowKey((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isFirstRunSetup && (
              <div>
                <label
                  htmlFor="auth-confirm-key"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Confirm Login Key
                </label>
                <input
                  id="auth-confirm-key"
                  type={showKey ? 'text' : 'password'}
                  autoComplete="new-password"
                  value={confirmKey}
                  onChange={(e) => setConfirmKey(e.target.value)}
                  placeholder="Re-enter your login key"
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-sm text-stone-900 focus:border-blue-700 focus:outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {submitting
                ? isFirstRunSetup
                  ? 'Creating Administrator...'
                  : 'Verifying...'
                : isFirstRunSetup
                  ? 'Create Administrator & Enter Studio'
                  : 'Sign In to AmplitudeLand'}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
