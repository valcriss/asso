import { describe, expect, it } from 'vitest';

import en from '../en.json';
import fr from '../fr.json';

type Messages = Record<string, unknown>;

type FlatMessages = Record<string, string>;

function flattenMessages(messages: Messages, prefix = ''): FlatMessages {
  return Object.entries(messages).reduce<FlatMessages>((acc, [key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(acc, flattenMessages(value as Messages, nextKey));
    } else if (typeof value === 'string') {
      acc[nextKey] = value;
    }
    return acc;
  }, {});
}

describe('i18n messages', () => {
  it('share the same structure between locales', () => {
    const enFlat = flattenMessages(en);
    const frFlat = flattenMessages(fr);

    expect(Object.keys(frFlat).sort()).toEqual(Object.keys(enFlat).sort());
  });

  it('matches the snapshot for English translations', () => {
    const enFlat = flattenMessages(en);
    expect(enFlat).toMatchSnapshot();
  });

  it('matches the snapshot for French translations', () => {
    const frFlat = flattenMessages(fr);
    expect(frFlat).toMatchSnapshot();
  });
});
