export function giftStockSQL(alias) {
  const column = alias ? alias + '.' : '';
  return `${column}used_at=0 AND ${column}recalled_at IS NULL
   AND (${column}expires_at IS NULL OR ${column}expires_at>unixepoch())`;
}

export const decorationTimeSQL = alias =>
  `(${alias}.expires_at>unixepoch() OR (${alias}.expires_at=0 AND COALESCE(${alias}.period_code,'')='PERMANENT'))`;

export const stockDeadlineSQL = alias =>
  `(${alias}.redeem_before IS NULL OR ${alias}.redeem_before>unixepoch())
   AND (${alias}.season_ends_at IS NULL OR ${alias}.season_ends_at>unixepoch())`;
