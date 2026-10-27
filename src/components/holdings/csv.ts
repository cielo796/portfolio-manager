export function createHoldingsCsv(headers: string[], rows: string[][]): string {
  const escape = (value: string) => /[",\r\n]/.test(value)
    ? `"${value.replace(/"/g, '""')}"`
    : value;
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(escape).join(',')).join('\r\n') + '\r\n';
}

export function holdingsCsvFilename(date = new Date()): string {
  return `holdings-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}.csv`;
}
