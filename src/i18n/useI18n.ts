/**
 * useI18n — Ember's translation hook.
 *
 * English only in lot 1 (Tony's call, 2026-10-07). The structure is the same
 * as MnemoLingua's so French and Spanish arrive as one JSON file each, not a
 * refactor: add the bundle to BUNDLES and the code to LangCode.
 */
import { useEffect, useState } from 'react';
import en from './locales/en.json';

export type LangCode = 'en';

const BUNDLES: Record<LangCode, Record<string, unknown>> = { en };

let _lang: LangCode = 'en';
const _listeners = new Set<() => void>();

function isLang(v: unknown): v is LangCode {
  return typeof v === 'string' && v in BUNDLES;
}

/** Take the shell's language if this cartridge ships it; otherwise stay put. */
export function adoptHostLang(lang: unknown): void {
  if (!isLang(lang) || lang === _lang) return;
  _lang = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  _listeners.forEach((fn) => fn());
}

function lookup(bundle: Record<string, unknown>, path: string): string | null {
  let cur: unknown = bundle;
  for (const part of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : null;
}

/** Missing keys fall back to English, then to the key itself (visibly wrong). */
export function translate(key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(BUNDLES[_lang], key) ?? lookup(BUNDLES.en, key) ?? key;
  if (!vars) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

export function useI18n(): { t: typeof translate; lang: LangCode } {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  }, []);
  return { t: translate, lang: _lang };
}
