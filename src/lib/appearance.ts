export type ThemeId =
  | 'archival-paper'
  | 'gallery-white'
  | 'sepia-folio'
  | 'obsidian-ink'
  | 'midnight-observatory';

export type FontPairingId =
  | 'classical-editorial'
  | 'academic-monograph'
  | 'archival-broadsheet'
  | 'technical-lab';

export interface ThemeOption {
  id: ThemeId;
  label: string;
  isDark: boolean;
  bg: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
}

export interface FontPairingOption {
  id: FontPairingId;
  label: string;
  subtitle: string;
  displayFont: string;
  bodyFont: string;
  monoFont: string;
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'archival-paper',
    label: 'Archival Paper',
    isDark: false,
    bg: '#FAF9F6',
    surface: '#FFFFFF',
    surfaceMuted: '#F3F1EC',
    border: '#E4E0D8',
    text: '#1C1917',
    textMuted: '#57534E',
    accent: '#1D4ED8',
    accentText: '#FFFFFF',
  },
  {
    id: 'gallery-white',
    label: 'Gallery White',
    isDark: false,
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    surfaceMuted: '#F8FAFC',
    border: '#E2E8F0',
    text: '#0F172A',
    textMuted: '#475569',
    accent: '#2563EB',
    accentText: '#FFFFFF',
  },
  {
    id: 'sepia-folio',
    label: 'Sepia Folio',
    isDark: false,
    bg: '#F4EFE6',
    surface: '#FBF8F1',
    surfaceMuted: '#EAE2D3',
    border: '#DDD3C2',
    text: '#292018',
    textMuted: '#665748',
    accent: '#9A3412',
    accentText: '#FFFFFF',
  },
  {
    id: 'obsidian-ink',
    label: 'Obsidian Ink',
    isDark: true,
    bg: '#0F1115',
    surface: '#161A22',
    surfaceMuted: '#1E232E',
    border: '#272D3A',
    text: '#F1F5F9',
    textMuted: '#94A3B8',
    accent: '#3B82F6',
    accentText: '#FFFFFF',
  },
  {
    id: 'midnight-observatory',
    label: 'Midnight Observatory',
    isDark: true,
    bg: '#080D1A',
    surface: '#0F172A',
    surfaceMuted: '#172036',
    border: '#1E293B',
    text: '#E2E8F0',
    textMuted: '#94A3B8',
    accent: '#0284C7',
    accentText: '#FFFFFF',
  },
];

export const FONT_PAIRING_OPTIONS: FontPairingOption[] = [
  {
    id: 'classical-editorial',
    label: 'Fraunces + Plus Jakarta Sans',
    subtitle: 'Classical Editorial',
    displayFont: '"Fraunces", Georgia, Cambria, serif',
    bodyFont: '"Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    monoFont: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  },
  {
    id: 'academic-monograph',
    label: 'Playfair Display + Source Serif 4',
    subtitle: 'Academic Monograph',
    displayFont: '"Playfair Display", Georgia, serif',
    bodyFont: '"Source Serif 4", Georgia, serif',
    monoFont: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  },
  {
    id: 'archival-broadsheet',
    label: 'Cormorant Garamond + DM Sans',
    subtitle: 'Archival Broadsheet',
    displayFont: '"Cormorant Garamond", Georgia, serif',
    bodyFont: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    monoFont: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  },
  {
    id: 'technical-lab',
    label: 'Outfit + Public Sans',
    subtitle: 'Technical Lab',
    displayFont: '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif',
    bodyFont: '"Public Sans", -apple-system, BlinkMacSystemFont, sans-serif',
    monoFont: '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace',
  },
];

export function getThemeOption(id: string | null | undefined): ThemeOption {
  return THEME_OPTIONS.find((t) => t.id === id) ?? THEME_OPTIONS[0];
}

export function getFontPairingOption(id: string | null | undefined): FontPairingOption {
  return FONT_PAIRING_OPTIONS.find((f) => f.id === id) ?? FONT_PAIRING_OPTIONS[0];
}

export function parseArticleSlugFromPath(pathname: string, search: string): string | null {
  const cleanPath = pathname.replace(/\/+$/, '');
  const pathMatch = cleanPath.match(/^\/posts\/([^/]+)$/);
  if (pathMatch) {
    return decodeURIComponent(pathMatch[1]);
  }
  const params = new URLSearchParams(search);
  const querySlug = params.get('article');
  return querySlug ? querySlug.trim() || null : null;
}

export async function copyTextSafely(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback below for sandboxed iframes without clipboard-write permission
  }
  try {
    if (typeof document !== 'undefined') {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    }
  } catch {
    return false;
  }
  return false;
}
