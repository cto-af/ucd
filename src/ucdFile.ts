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
  segment?: string;
  comment?: string;
}

export interface FieldDef {
  word: string;
  definition: string;
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
}
