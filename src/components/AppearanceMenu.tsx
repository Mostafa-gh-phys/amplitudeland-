import { Palette, Type } from 'lucide-react';
import {
  FONT_PAIRING_OPTIONS,
  THEME_OPTIONS,
  type FontPairingId,
  type ThemeId,
} from '../lib/appearance.ts';

interface AppearanceMenuProps {
  themeId: ThemeId;
  fontId: FontPairingId;
  onChangeTheme: (id: ThemeId) => void;
  onChangeFont: (id: FontPairingId) => void;
}

export function AppearanceMenu({
  themeId,
  fontId,
  onChangeTheme,
  onChangeFont,
}: AppearanceMenuProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <div className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white/90 px-2.5 py-1.5 text-xs dark:border-stone-800 dark:bg-stone-900/90">
        <Palette className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden="true" />
        <label htmlFor="theme-select" className="sr-only">
          Select color theme
        </label>
        <select
          id="theme-select"
          aria-label="Color theme"
          value={themeId}
          onChange={(e) => onChangeTheme(e.target.value as ThemeId)}
          className="bg-transparent pr-1 text-xs font-medium text-stone-800 focus:outline-none dark:text-stone-200"
        >
          {THEME_OPTIONS.map((theme) => (
            <option
              key={theme.id}
              value={theme.id}
              className="bg-white text-stone-900 dark:bg-stone-900 dark:text-stone-100"
            >
              {theme.label}
            </option>
          ))}
        </select>
      </div>

      <div className="inline-flex items-center gap-1.5 rounded-md border border-stone-200 bg-white/90 px-2.5 py-1.5 text-xs dark:border-stone-800 dark:bg-stone-900/90">
        <Type className="h-3.5 w-3.5 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden="true" />
        <label htmlFor="font-select" className="sr-only">
          Select typography pairing
        </label>
        <select
          id="font-select"
          aria-label="Font pairing"
          value={fontId}
          onChange={(e) => onChangeFont(e.target.value as FontPairingId)}
          className="bg-transparent pr-1 text-xs font-medium text-stone-800 focus:outline-none dark:text-stone-200"
        >
          {FONT_PAIRING_OPTIONS.map((font) => (
            <option
              key={font.id}
              value={font.id}
              className="bg-white text-stone-900 dark:bg-stone-900 dark:text-stone-100"
            >
              {font.subtitle} ({font.label})
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
