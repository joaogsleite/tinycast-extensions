/**
 * Minimal RFC 4180-style CSV parser.
 *
 * Replaces `csv-parse` which requires Node's `Buffer` API
 * (`Buffer.compare`, `Buffer.allocUnsafe`, ...). Tinycast's runtime only
 * provides a partial `Buffer` polyfill, so `csv-parse` crashes there with:
 *
 *   Buffer.compare is not a function.
 *   (In 'Buffer.compare(a.escape,a.quote)', 'Buffer.compare' is undefined)
 *
 * This parser operates on plain strings only, with no `Buffer` dependency.
 * It mirrors the `csv-parse` options previously used by `KeePassLoader`:
 * - `delimiter: ","`
 * - `from_line: 2` (handled by the caller via `skipHeader`)
 * - `relax_column_count: true` (rows may have any length)
 * - `relax_quotes: true` (stray quotes in unquoted fields are literal)
 * - `skip_empty_lines: true`
 * - `trim: true` for unquoted fields; quoted field content is preserved
 *   exactly (so passwords with leading/trailing spaces survive).
 *
 * @param text - Raw CSV text
 * @param skipHeader - Drop the first row (the header line)
 * @returns Parsed rows; each row is an array of field strings
 */
export function parseCsv(text: string, skipHeader = false): string[][] {
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let fieldQuoted = false;
  let justClosedQuote = false;

  const pushField = () => {
    row.push(fieldQuoted ? field : field.trim());
    field = "";
    fieldQuoted = false;
    justClosedQuote = false;
  };

  const pushRow = () => {
    pushField();
    const isEmpty = row.length === 0 || row.every((cell) => cell.trim() === "");
    if (!isEmpty) {
      rows.push(row);
    }
    row = [];
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        const next = text[i + 1];
        if (next === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // Closing quote (lenient: anything else also closes; a stray
        // quote followed by garbage is treated as the end of quoting and
        // subsequent chars are handled literally by the non-quote branch).
        inQuotes = false;
        justClosedQuote = true;
        i += 1;
        continue;
      }
      // Normalize CRLF inside quoted fields to a single LF.
      if (c === "\r" && text[i + 1] === "\n") {
        field += "\n";
        i += 2;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    // Not inside quotes.
    if (justClosedQuote) {
      // Ignore whitespace between the closing quote and the delimiter.
      if (c === " " || c === "\t") {
        i += 1;
        continue;
      }
      justClosedQuote = false;
    }

    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (c === "\r" || c === "\n") {
      pushRow();
      // Treat CRLF as a single row delimiter.
      if (c === "\r" && text[i + 1] === "\n") {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }
    if (c === '"') {
      // Opening quote only at the start of a field (ignoring leading
      // whitespace, which `trim` would remove anyway). A quote anywhere
      // else is a literal (relax_quotes).
      if (field.trim() === "" && !fieldQuoted) {
        field = "";
        fieldQuoted = true;
        inQuotes = true;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }

  // Flush trailing field/row (a file without a trailing newline still
  // yields its last row).
  if (field !== "" || fieldQuoted || row.length > 0) {
    pushRow();
  }

  return skipHeader ? rows.slice(1) : rows;
}
