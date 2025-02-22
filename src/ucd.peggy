{{
import {UCDFile} from './ucdFile.ts';

const IGNORED = new Set([
  ' ',
  'a',
  'an',
  'defines',
  'describes',
  'first',
  'field',
  'gives',
  'is',
  'second',
  'short',
  'the',
  'third',
]);
}}

{
  const results = new UCDFile();
  let segment = null;
}

data_file
  = header entries { return results }

header
  = (header_comment EOL)*

header_comment
  = date
  / field_def
  / name
  / comment

name
  = "#" _ name:$[a-z_]i+ "-" version:decimal_int|.., "."| ".txt" {
    results.name = name;
    results.version = version;
  }

date
  = "#" _ "date:"i _ d:$[^\r\n#]+ { results.date = new Date(d); }

field_def
  = "#" _ num:ordinal _ "field"i COLON _ description:description {
    results.fields[num] = description;
  }
  / "#" _ "field"i? _ num:decimal_int COLON _ description:description {
    results.fields[num] = description;
  }
  / "#" _ "Property:"i _ word:word {
    results.fields[0] = {word: 'points'}
    results.fields[1] = {word};
  }

description
  = description:$(!EOL .)* {
    const words = description.split(/\b/);
    if (words.length < 1) {
      return undefined;
    }
    return {
      word: words.find(w => w.includes('_')) || words.find(w => !IGNORED.has(w.toLowerCase())),
      description,
    }
  }

ordinal
  = "first"i { return 0 }
  / "second"i { return 1 }
  / "third"i { return 2 }
  / "fourth"i { return 3 }
  / "fifth"i { return 4 }

word
  = $[^ <>\t\r\n]+

comment
  = "#" _ @$(!EOL .)*

entries
  = entry+

entry
  = "@" word:word CEOL {
    segment = word;
  }
  / fields:fields comment:CEOL {
    const res = {fields};
    if (comment) {
      res.comment = comment;
    }
    if (segment) {
      res.segment = segment;
    }
    results.entries.push(res);
  }
  / CEOL
  / comment // Some files end with comment but no newline


fields
  = (_ @field)|2.., SEMI _|

field
  = first:point ".." last:point _ &SEMI { return {range: [first, last]} }
  / prefix:("<" @word ">" _)? points:point|1.., _| _ &SEMI {
      const res = {points};
      if (prefix) {
        res.prefix = prefix;
        console.error(res)
      }
      return res;
    }
  / _ val:$[^\r\n#;]* { return val.trimEnd() || null; }

point
  = num:$HEX|4..6| { return parseInt(num, 16) }

decimal_int
  = num:$[0-9]+ { return parseInt(num) }

CEOL
  = ";"? _ @comment? CRLF

COLON = ":"
SEMI = ";"
HEX = [0-9a-f]i
_ = [ \t]*
CRLF = [\r\n]+

EOL
  = CRLF
  / !.
