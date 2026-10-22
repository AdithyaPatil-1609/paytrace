// A small RFC 4180 reader. The fixture ships as CSV so the rows stay readable
// in the repository and a reviewer can diff them without a spreadsheet.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((entry) => entry.some((cell) => cell.trim() !== ""));
  if (!header) return [];

  return body.map((entry) => {
    const record: Record<string, string> = {};
    header.forEach((key, position) => {
      record[key.trim()] = (entry[position] ?? "").trim();
    });
    return record;
  });
}

export function toCsv(headers: string[], rows: (string | number | undefined)[][]) {
  const encode = (value: string | number | undefined) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [headers.map(encode).join(","), ...rows.map((row) => row.map(encode).join(","))].join("\n");
}
