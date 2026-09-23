import { describe, expect, it } from 'vitest';
import { REPORT_DICTS, r, senseText } from './reportI18n';
import type { Language } from './engine/types';

const LANGS: Language[] = ['en', 'es', 'fr'];

describe('the printed report in three languages', () => {
  it('translates every heading, column and standing note', () => {
    const keys = Object.keys(REPORT_DICTS.en) as (keyof (typeof REPORT_DICTS)['en'])[];
    for (const lang of LANGS) {
      const d = REPORT_DICTS[lang];
      for (const key of keys) {
        expect(d[key], `${lang}.${String(key)}`).toBeDefined();
        if (typeof REPORT_DICTS.en[key] === 'string') expect(String(d[key]).length).toBeGreaterThan(0);
      }
    }
  });

  it('says the same things differently in each language', () => {
    expect(r('es').attendance).not.toBe(r('en').attendance);
    expect(r('fr').motions).not.toBe(r('en').motions);
    // an unknown language falls back to English rather than breaking the page
    expect(r('de' as Language).attendance).toBe(r('en').attendance);
  });

  it('words the sense of the assembly from the tally, not from English text', () => {
    const leading = { label: 'Support as written', pct: 71.4 };
    expect(senseText({ senseKind: 'unanimity', leading }, r('en'))).toMatch(/substantial unanimity \(71%/);
    expect(senseText({ senseKind: 'unanimity', leading }, r('es'))).toMatch(/unanimidad sustancial/);
    expect(senseText({ senseKind: 'majority', leading }, r('fr'))).toMatch(/majorité simple/);
    expect(senseText({ senseKind: 'tied', leading: null }, r('es'))).toMatch(/empatadas/);
    expect(senseText({ senseKind: null, leading: null }, r('en'))).toBeNull();
  });

  it('covers every motion kind and agenda kind in every language', () => {
    const motionKinds = Object.keys(REPORT_DICTS.en.motionKinds);
    const agendaKinds = Object.keys(REPORT_DICTS.en.agendaKinds);
    for (const lang of LANGS) {
      expect(Object.keys(REPORT_DICTS[lang].motionKinds)).toEqual(motionKinds);
      expect(Object.keys(REPORT_DICTS[lang].agendaKinds)).toEqual(agendaKinds);
    }
  });
});

describe('the projector in three languages', () => {
  it('has every screen label in every language', async () => {
    const { DICTS } = await import('./i18n');
    const keys = Object.keys(DICTS.en.screens) as (keyof (typeof DICTS)['en']['screens'])[];
    for (const lang of LANGS) {
      expect(Object.keys(DICTS[lang].screens).sort()).toEqual([...keys].sort());
      for (const key of keys) expect(DICTS[lang].screens[key], `${lang}.${String(key)}`).toBeTruthy();
    }
  });
});
