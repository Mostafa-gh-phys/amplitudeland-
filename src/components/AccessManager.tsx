import { Copy, KeyRound, LogOut, RefreshCw, Shield, Trash2, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { cmsApi } from '../api/client.ts';
import { copyTextSafely } from '../lib/appearance.ts';
import type { AuthSessionState, PublicUser, UserRole } from '../lib/types.ts';

interface AccessManagerProps {
  authState: AuthSessionState;
  onAuthUpdated: (next: AuthSessionState) => void;
  onLogout: () => Promise<void>;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrator (Full Access)',
  editor: 'Editor (Publish & Topics)',
  author: 'Author (Drafts Only)',
};

export function AccessManager({ authState, onAuthUpdated, onLogout }: AccessManagerProps) {
  const user = authState.user;
  const isAdmin = user?.role === 'admin';

  // Own credential modification state
  const [myUsername, setMyUsername] = useState(user?.username || '');
  const [myDisplayName, setMyDisplayName] = useState(user?.displayName || '');
  const [currentLoginKey, setCurrentLoginKey] = useState('');
  const [newLoginKey, setNewLoginKey] = useState('');
  const [savingSelf, setSavingSelf] = useState(false);
  const [selfFeedback, setSelfFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );

  // Admin collaborator access management state
  const [teamUsers, setTeamUsers] = useState<PublicUser[]>([]);
  const [loadingTeam, setLoadingTeam] = useState(false);
  const [inviteUsername, setInviteUsername] = useState('');
  const [inviteDisplayName, setInviteDisplayName] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('editor');
  const [inviteCustomKey, setInviteCustomKey] = useState('');
  const [busyInvite, setBusyInvite] = useState(false);
  const [teamFeedback, setTeamFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null,
  );
  const [issuedCreds, setIssuedCreds] = useState<{
    username: string;
    loginKey: string;
    role: UserRole;
  } | null>(null);
  const [copiedIssued, setCopiedIssued] = useState(false);

  useEffect(() => {
    if (user) {
      setMyUsername(user.username);
      setMyDisplayName(user.displayName);
    }
  }, [user]);

  const loadTeamUsers = useCallback(async () => {
    if (!isAdmin) return;
    setLoadingTeam(true);
    try {
      const res = await cmsApi.listUsers();
      setTeamUsers(res.users);
    } catch (err) {
      setTeamFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to load collaborator accounts.',
      });
    } finally {
      setLoadingTeam(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    loadTeamUsers();
  }, [loadTeamUsers]);

  const handleUpdateSelf = async (e: React.FormEvent) => {
    e.preventDefault();
    setSelfFeedback(null);
    if (!currentLoginKey) {
      setSelfFeedback({ type: 'err', text: 'Enter your current login key to save changes.' });
      return;
    }
    setSavingSelf(true);
    try {
      const res = await cmsApi.updateMyCredentials({
        currentLoginKey,
        username: myUsername.trim(),
        displayName: myDisplayName.trim(),
        newLoginKey: newLoginKey || undefined,
      });
      onAuthUpdated(res.auth);
      setCurrentLoginKey('');
      setNewLoginKey('');
      setSelfFeedback({
        type: 'ok',
        text: 'Your username and login key settings have been updated.',
      });
      if (isAdmin) {
        await loadTeamUsers();
      }
    } catch (err) {
      setSelfFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update credentials.',
      });
    } finally {
      setSavingSelf(false);
    }
  };

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeamFeedback(null);
    setIssuedCreds(null);
    if (!inviteUsername.trim()) {
      setTeamFeedback({ type: 'err', text: 'Enter a username for the new collaborator.' });
      return;
    }
    setBusyInvite(true);
    try {
      const res = await cmsApi.createUser({
        username: inviteUsername.trim(),
        displayName: inviteDisplayName.trim() || inviteUsername.trim(),
        role: inviteRole,
        loginKey: inviteCustomKey || undefined,
      });
      setIssuedCreds({
        username: res.user.username,
        loginKey: res.issuedLoginKey,
        role: res.user.role,
      });
      setInviteUsername('');
      setInviteDisplayName('');
      setInviteCustomKey('');
      setTeamFeedback({
        type: 'ok',
        text: `Issued access key for @${res.user.username}. Copy and share it securely below.`,
      });
      await loadTeamUsers();
    } catch (err) {
      setTeamFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to create collaborator account.',
      });
    } finally {
      setBusyInvite(false);
    }
  };

  const handleRotateKey = async (target: PublicUser) => {
    setTeamFeedback(null);
    setIssuedCreds(null);
    try {
      const res = await cmsApi.updateUser(target.id, { rotateKey: true });
      if (res.issuedLoginKey) {
        setIssuedCreds({
          username: res.user.username,
          loginKey: res.issuedLoginKey,
          role: res.user.role,
        });
      }
      setTeamFeedback({
        type: 'ok',
        text: `Rotated login key for @${target.username} and invalidated previous sessions.`,
      });
      await loadTeamUsers();
    } catch (err) {
      setTeamFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to rotate login key.',
      });
    }
  };

  const handleRoleChange = async (target: PublicUser, role: UserRole) => {
    setTeamFeedback(null);
    try {
      await cmsApi.updateUser(target.id, { role });
      await loadTeamUsers();
    } catch (err) {
      setTeamFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to change user role.',
      });
    }
  };

  const handleToggleActive = async (target: PublicUser) => {
    setTeamFeedback(null);
    try {
      await cmsApi.updateUser(target.id, { active: !target.active });
      await loadTeamUsers();
    } catch (err) {
      setTeamFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to update access status.',
      });
    }
  };

  const handleDeleteUser = async (target: PublicUser) => {
    setTeamFeedback(null);
    try {
      await cmsApi.deleteUser(target.id);
      await loadTeamUsers();
    } catch (err) {
      setTeamFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Unable to remove collaborator.',
      });
    }
  };

  const handleCopyIssued = async () => {
    if (!issuedCreds) return;
    const text = `AmplitudeLand Editorial Access\nURL: ${window.location.origin}\nUsername: ${issuedCreds.username}\nLogin Key: ${issuedCreds.loginKey}\nRole: ${issuedCreds.role}`;
    const ok = await copyTextSafely(text);
    if (ok) {
      setCopiedIssued(true);
      window.setTimeout(() => setCopiedIssued(false), 2000);
    }
  };

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-stone-200 pb-4 dark:border-stone-800">
        <div>
          <h2 className="font-editorial text-2xl font-semibold text-stone-900 dark:text-stone-100">
            Account &amp; Access Authenticity
          </h2>
          <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
            Signed in as <span className="font-mono font-semibold">@{user?.username}</span> ·{' '}
            {user ? ROLE_LABELS[user.role] : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Sign Out</span>
        </button>
      </div>

      {/* Section 1: Modify My Username & Login Key */}
      <section className="rounded-md border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900/60">
        <div className="flex items-center gap-2.5 border-b border-stone-200 pb-4 dark:border-stone-800">
          <KeyRound className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
          <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
            Modify Your Username &amp; Login Key
          </h3>
        </div>

        {user?.id === 'env-admin' ? (
          <p className="mt-4 text-xs leading-relaxed text-stone-600 dark:text-stone-400">
            This administrator session is configured via server environment variables (
            <code className="font-mono">ADMIN_USERNAME</code> /{' '}
            <code className="font-mono">ADMIN_LOGIN_KEY</code>). Update those values in your Secrets
            panel to change this account, or create a secondary administrator account below.
          </p>
        ) : (
          <form onSubmit={handleUpdateSelf} className="mt-5 space-y-4">
            {selfFeedback && (
              <div
                role="alert"
                className={`rounded-md border px-4 py-3 text-xs ${
                  selfFeedback.type === 'ok'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
                }`}
              >
                {selfFeedback.text}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label
                  htmlFor="self-username"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Username
                </label>
                <input
                  id="self-username"
                  type="text"
                  value={myUsername}
                  onChange={(e) => setMyUsername(e.target.value)}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label
                  htmlFor="self-display-name"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Display Name
                </label>
                <input
                  id="self-display-name"
                  type="text"
                  value={myDisplayName}
                  onChange={(e) => setMyDisplayName(e.target.value)}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label
                  htmlFor="self-current-key"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  Current Login Key
                </label>
                <input
                  id="self-current-key"
                  type="password"
                  value={currentLoginKey}
                  onChange={(e) => setCurrentLoginKey(e.target.value)}
                  placeholder="Required to verify"
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label
                  htmlFor="self-new-key"
                  className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
                >
                  New Login Key (Optional)
                </label>
                <input
                  id="self-new-key"
                  type="password"
                  value={newLoginKey}
                  onChange={(e) => setNewLoginKey(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingSelf}
              className="rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {savingSelf ? 'Updating...' : 'Save Credential Changes'}
            </button>
          </form>
        )}
      </section>

      {/* Section 2: Grant Access to Others with New Authenticity (Admin Only) */}
      {isAdmin && (
        <section className="space-y-6 rounded-md border border-stone-200 bg-white p-6 dark:border-stone-800 dark:bg-stone-900/60">
          <div className="flex items-center justify-between border-b border-stone-200 pb-4 dark:border-stone-800">
            <div className="flex items-center gap-2.5">
              <Shield className="h-4 w-4 text-blue-700 dark:text-blue-400" aria-hidden="true" />
              <div>
                <h3 className="font-editorial text-lg font-semibold text-stone-900 dark:text-stone-100">
                  Grant Access to Collaborators
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-400">
                  Issue separate usernames and private login keys for co-authors, editors, or co-administrators.
                </p>
              </div>
            </div>
          </div>

          {teamFeedback && (
            <div
              role="status"
              className={`rounded-md border px-4 py-3 text-xs ${
                teamFeedback.type === 'ok'
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
                  : 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200'
              }`}
            >
              {teamFeedback.text}
            </div>
          )}

          {issuedCreds && (
            <div className="rounded-md border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900 dark:bg-blue-950/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                    One-Time Issued Credentials (Save or Share Securely)
                  </div>
                  <div className="mt-1.5 font-mono text-xs text-stone-800 dark:text-stone-200">
                    Username: <strong>{issuedCreds.username}</strong> · Key:{' '}
                    <strong>{issuedCreds.loginKey}</strong> · Role: {issuedCreds.role}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCopyIssued}
                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-100 dark:border-blue-800 dark:bg-stone-900 dark:text-blue-300"
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{copiedIssued ? 'Copied' : 'Copy Access Details'}</span>
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleInviteUser} className="grid gap-4 sm:grid-cols-12 sm:items-end">
            <div className="sm:col-span-3">
              <label
                htmlFor="invite-username"
                className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
              >
                Username
              </label>
              <input
                id="invite-username"
                type="text"
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                placeholder="e.g., elena.rostova"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
            </div>
            <div className="sm:col-span-3">
              <label
                htmlFor="invite-display"
                className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
              >
                Display Name
              </label>
              <input
                id="invite-display"
                type="text"
                value={inviteDisplayName}
                onChange={(e) => setInviteDisplayName(e.target.value)}
                placeholder="Dr. Elena Rostova"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="invite-role"
                className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
              >
                Access Role
              </label>
              <select
                id="invite-role"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="w-full rounded-md border border-stone-300 bg-white px-2.5 py-2 text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              >
                <option value="author">Author (Drafts)</option>
                <option value="editor">Editor (Publish)</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label
                htmlFor="invite-key"
                className="mb-1.5 block text-xs font-semibold text-stone-700 dark:text-stone-300"
              >
                Custom Key (Opt.)
              </label>
              <input
                id="invite-key"
                type="text"
                value={inviteCustomKey}
                onChange={(e) => setInviteCustomKey(e.target.value)}
                placeholder="Auto-generate"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                disabled={busyInvite}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{busyInvite ? 'Issuing...' : 'Grant Access'}</span>
              </button>
            </div>
          </form>

          {/* Authorized Users Table */}
          <div className="overflow-x-auto rounded-md border border-stone-200 dark:border-stone-800">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50 font-semibold text-stone-600 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-400">
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Key &amp; Access Controls</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 dark:divide-stone-800">
                {loadingTeam && teamUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-stone-500">
                      Loading authorized accounts...
                    </td>
                  </tr>
                ) : teamUsers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-stone-500">
                      No stored collaborator accounts yet.
                    </td>
                  </tr>
                ) : (
                  teamUsers.map((member) => {
                    const isSelf = member.id === user?.id;
                    return (
                      <tr key={member.id}>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-stone-900 dark:text-stone-100">
                            {member.displayName} {isSelf && '(You)'}
                          </div>
                          <div className="font-mono text-[11px] text-stone-500">
                            @{member.username}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            aria-label={`Role for ${member.username}`}
                            value={member.role}
                            disabled={isSelf}
                            onChange={(e) => handleRoleChange(member, e.target.value as UserRole)}
                            className="rounded border border-stone-300 bg-white px-2 py-1 text-xs disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950"
                          >
                            <option value="author">Author</option>
                            <option value="editor">Editor</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`font-semibold ${
                              member.active
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-stone-500 dark:text-stone-400'
                            }`}
                          >
                            {member.active ? '● Active' : '○ Suspended'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleRotateKey(member)}
                              className="inline-flex items-center gap-1 rounded border border-stone-300 px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                            >
                              <RefreshCw className="h-3 w-3" aria-hidden="true" />
                              <span>Rotate Key</span>
                            </button>
                            {!isSelf && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleToggleActive(member)}
                                  className="rounded border border-stone-300 px-2.5 py-1 text-[11px] font-medium text-stone-700 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
                                >
                                  {member.active ? 'Suspend' : 'Activate'}
                                </button>
                                <button
                                  type="button"
                                  aria-label={`Remove ${member.username}`}
                                  onClick={() => handleDeleteUser(member)}
                                  className="rounded p-1.5 text-stone-500 hover:bg-rose-50 hover:text-rose-700 dark:hover:bg-rose-950 dark:hover:text-rose-400"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
