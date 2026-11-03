export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let atFieldStart = true;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        atFieldStart = false;
      } else if (char === ",") {
        row.push(field);
        field = "";
        atFieldStart = true;
      } else if (char === "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        atFieldStart = true;
      } else if (char === "\r") {
        // Ignore CR in CRLF.
      } else {
        field += char;
        atFieldStart = false;
      }
    }
  }

  if (field !== "" || !atFieldStart || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter(function (r) {
    return !(r.length === 1 && r[0] === "");
  });
}

export function rowsToObjects(rows: string[][]): { headers: string[]; records: Record<string, string>[] } {
  if (rows.length === 0) {
    return { headers: [], records: [] };
  }
  const headers = rows[0];
  const records = rows.slice(1).map(function (row) {
    const record: Record<string, string> = {};
    headers.forEach(function (header, index) {
      record[header] = row[index] === undefined ? "" : row[index];
    });
    return record;
  });
  return { headers: headers, records: records };
}
