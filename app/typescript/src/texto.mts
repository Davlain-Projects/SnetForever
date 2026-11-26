// Source: app/typescript/src/texto.mts. Run npm run build:app to regenerate the runtime module.
// Count Unicode code points so truncation preserves surrogate pairs.
export function cortar(texto: string, max: number): string {
  const characters = Array.from(texto);
  return characters.length > max ? characters.slice(0, max).join('') : texto;
}
