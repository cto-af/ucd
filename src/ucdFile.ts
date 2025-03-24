import type {UnicodeTrieBuilder} from '@cto.af/unicode-trie/builder';

export interface Points {
  points: number[];
}

export interface Range {
  range: [first: number, last: number];
}

export type CodePoints = Points | Range;

export type Field = CodePoints | string | null;

export interface Entry {
  fields: Field[];
  property?: string;
  segment?: string;
  comment?: string;
  missing?: boolean;
}

export interface FieldDef {
  word: string;
  definition: string;
}

export type TrieTransform = (...fields: Field[]) => number | string | null;

function isRange(f: Field): f is Range {
  return (f != null) && (typeof f === 'object') && Object.hasOwn(f, 'range');
}

function isPoints(f: Field): f is Points {
  return (f != null) && (typeof f === 'object') && Object.hasOwn(f, 'points');
}

export class UCDFile {
  public date: Date = new Date();
  public name = '';
  public version: number[] = [];
  public fields: (FieldDef | undefined)[] = [];
  public entries: Entry[] = [];

  public [Symbol.iterator](): ArrayIterator<Entry> {
    return this.entries[Symbol.iterator]();
  }

  public intoTrie(trie: UnicodeTrieBuilder, transform: TrieTransform): void {
    for (const {fields} of this.entries) {
      const [first, ...vals] = fields;
      if (typeof first === 'string') {
        throw new Error('First field not codepoints');
      }
      const t = transform(...vals);
      if (t == null || first == null) {
        continue;
      }
      if (isRange(first)) {
        trie.setRange(first.range[0], first.range[1], t, true);
      } else if (isPoints(first)) {
        for (const p of first.points) {
          trie.set(p, t);
        }
      } else {
        throw new Error(`Invalid codepoints: ${JSON.stringify(first)}`);
      }
    }
  }
}
