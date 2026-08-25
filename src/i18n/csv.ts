/** 최소 CSV 파서. 필드 시작 위치의 따옴표만 인용으로 보고, 그 외 따옴표는 문자로 둔다. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let atFieldStart = true;

  const pushField = () => {
    row.push(field);
    field = '';
    quoted = false;
    atFieldStart = true;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (atFieldStart && ch === '"') {
      quoted = true;
      atFieldStart = false;
      continue;
    }

    if (ch === ',') {
      pushField();
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      pushField();
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
      atFieldStart = false;
    }
  }

  if (field !== '' || row.length) {
    pushField();
    rows.push(row);
  }
  return rows;
}
