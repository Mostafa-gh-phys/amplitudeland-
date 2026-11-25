import { KeyRound, Menu, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { isStaticPagesApp } from '../api/client.ts';
import type { AuthSessionState } from '../lib/types.ts';

export type AppSection = 'journal' | 'categories' | 'ssg' | 'cms';

interface TopBarProps {
  activeSection: AppSection;
  authState?: AuthSessionState;
  onNavigate: (section: AppSection) => void;
  onNewDraft: () => void;
  onOpenAuth?: () => void;
  onOpenAccount?: () => void;
}

const NAV_ITEMS: Array<{ id: AppSection; label: string }> = [
  { id: 'journal', label: 'Journal' },
  { id: 'categories', label: 'Topics' },
  { id: 'ssg', label: 'Static Build' },
  { id: 'cms', label: 'CMS Studio' },
];

export function TopBar({
  activeSection,
  authState,
  onNavigate,
  onNewDraft,
  onOpenAuth,
  onOpenAccount,
}: TopBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleNav = (section: AppSection) => {
    setMobileOpen(false);
    onNavigate(section);
  };

  const isSignedIn = Boolean(authState?.authenticated && authState.user);
  const needsAdminClaim = Boolean(!isStaticPagesApp() && authState && !authState.adminConfigured);

  return (
    <header
      style={{ backgroundColor: 'color-mix(in srgb, var(--theme-bg) 94%, transparent)' }}
      className="sticky top-0 z-40 border-b border-stone-200 backdrop-blur-sm dark:border-stone-800"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-4 py-3.5 sm:px-6 lg:px-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleNav('journal')}
          className="font-editorial text-xl font-semibold tracking-tight text-stone-900 transition-colors hover:text-blue-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 whitespace-nowrap shrink-0 dark:text-stone-100 dark:hover:text-blue-400"
        >
          AmplitudeLand
        </button>

        {/* Zone 2: 4 concise single-line nav links */}
        <nav aria-label="Primary" className="hidden items-center gap-7 md:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`relative py-1 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-700 ${
                  isActive
                    ? 'text-stone-900 dark:text-stone-100'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100'
                }`}
              >
                {item.label}
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-0 -bottom-[15px] h-0.5 bg-blue-700 dark:bg-blue-400"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Auth status + primary CTA + mobile menu toggle */}
        <div className="flex items-center gap-2.5 shrink-0">
          {isSignedIn && authState?.user ? (
            <button
              type="button"
              onClick={onOpenAccount}
              title={`Signed in as @${authState.user.username} (${authState.user.role})`}
              className="hidden items-center gap-1.5 rounded-md border border-stone-200 bg-white px-3 py-2 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-100 sm:inline-flex whitespace-nowrap shrink-0 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-hidden="true" />
              <span className="font-mono">@{authState.user.username}</span>
            </button>
          ) : (
            onOpenAuth && (
              <button
                type="button"
                onClick={onOpenAuth}
                className="hidden items-center gap-1.5 rounded-md border border-stone-300 bg-white px-3 py-2 text-xs font-medium text-stone-800 transition-colors hover:bg-stone-100 sm:inline-flex whitespace-nowrap shrink-0 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
              >
                <KeyRound className="h-3.5 w-3.5 text-blue-700 dark:text-blue-400" aria-hidden="true" />
                <span>{needsAdminClaim ? 'Claim Admin' : 'Sign In'}</span>
              </button>
            )
          )}

          <button
            type="button"
            onClick={onNewDraft}
            className="rounded-md bg-blue-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 whitespace-nowrap shrink-0 dark:bg-blue-600 dark:hover:bg-blue-500"
          >
            New Draft
          </button>
          <button
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-stone-200 text-stone-700 hover:bg-stone-100 md:hidden dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          aria-label="Mobile Navigation"
          className="border-t border-stone-200 bg-[#FAF9F6] px-4 py-3 md:hidden dark:border-stone-800 dark:bg-[#0F1115]"
        >
          <div className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNav(item.id)}
                  className={`flex items-center justify-between rounded-md px-3 py-2.5 text-left text-sm font-medium ${
                    isActive
                      ? 'bg-stone-200/70 text-stone-900 dark:bg-stone-800 dark:text-stone-100'
                      : 'text-stone-700 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800/60'
                  }`}
                >
                  <span>{item.label}</span>
                  {isActive && <span className="text-xs text-blue-700 dark:text-blue-400">Active</span>}
                </button>
              );
            })}
            {isSignedIn && authState?.user ? (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenAccount?.();
                }}
                className="mt-1 flex items-center justify-between rounded-md border border-stone-200 px-3 py-2 text-left text-xs font-medium text-stone-700 dark:border-stone-800 dark:text-stone-300"
              >
                <span>Account (@{authState.user.username})</span>
                <span className="uppercase">{authState.user.role}</span>
              </button>
            ) : (
              onOpenAuth && (
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false);
                    onOpenAuth();
                  }}
                  className="mt-1 rounded-md border border-stone-200 px-3 py-2 text-left text-xs font-semibold text-blue-700 dark:border-stone-800 dark:text-blue-400"
                >
                  {needsAdminClaim ? 'Claim Administrator Access' : 'Editorial Sign In'}
                </button>
              )
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
