{{
import {UCDFile} from '../lib/ucdFile.js';

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
    results.fields[num - 1] = description;
  }

description
  = description:to_end {
    const words = description.split(/\b/);
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
  = "#" _ @to_end

to_end
  = $(!CRLF .)*

entries
  = entry+

entry
  = entry_derived
  / entry_missing
  / entry_segment
  / entry_fields
  / CEOL
  / comment // Some files end with comment but no newline

entry_derived
  = "#" _ derived:("Derived" _)? "Property:"i _ property:word _ comment:to_end {
    const res = {
      fields: [],
      property,
      derived: Boolean(derived)
    };
    if (comment) {
      res.comment = comment;
    }
    results.entries.push(res);
  }

entry_missing
  = "#" _ "@missing:" _ fields:fields comment:CEOL {
    const res = {fields, missing: true};
    if (comment) {
      res.comment = comment;
    }
    if (segment) {
      res.segment = segment;
    }
    results.entries.push(res);
  }

entry_segment
  = "@" word:word CEOL {
    segment = word;
  }

entry_fields
  = fields:fields comment:CEOL {
    const res = {fields};
    if (comment) {
      res.comment = comment;
    }
    if (segment) {
      res.segment = segment;
    }
    results.entries.push(res);
  }

fields
  = (_ @field)|2.., SEMI _|

field
  = field_range
  / field_points
  / field_value

field_range
  = first:point ".." last:point _ &SEMI { return {range: [first, last]} }

field_points
  = prefix:("<" @word ">" _)? points:point|1.., _| _ &SEMI {
      const res = {points};
      if (prefix) {
        res.prefix = prefix;
      }
      return res;
    }

field_value
  = _ val:$[^\r\n#;]* { return val.trimEnd() || null; }

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
