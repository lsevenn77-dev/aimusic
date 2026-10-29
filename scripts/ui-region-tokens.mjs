// Compile the existing, cascade-ordered CSS values against inherited region
// tokens. No DOM measurement, zoom, root rem change, or runtime restyling.
// Outside an opted-in region every multiplier is exactly 1.
export function regionTokenCSS(css) {
  return css.replace(/(^|[;{]\s*)(font-size|gap|row-gap|column-gap|padding(?:-inline|-block)?(?:-start|-end)?|padding-(?:top|right|bottom|left)|margin(?:-inline|-block)?(?:-start|-end)?|margin-(?:top|right|bottom|left))\s*:\s*([^;{}]+)/g,
    (declaration, prefix, property, value) => {
      const font = property === 'font-size';
      // Preserve fluid typography, user-selected sizes, custom properties and
      // expressions; only fixed existing values are eligible for compilation.
      if (/var\(|calc\(|clamp\(|min\(|max\(/.test(value)) return declaration;
      const token = font ? '--ui-type-scale' : '--ui-space-scale';
      const next = value.replace(/(-?(?:\d*\.)?\d+)(px|rem)\b/g, (literal, n, unit) => {
        const px = Number(n) * (unit === 'rem' ? 16 : 1);
        if (px === 0 || (font && (px < 9 || px >= 32))) return literal;
        return `calc(${literal} * var(${token}, 1))`;
      });
      return `${prefix}${property}:${next}`;
    });
}
