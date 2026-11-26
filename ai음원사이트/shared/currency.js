const currencies = {
  G: {name: '골드', file: 'gold-coin.svg'},
  S: {name: '실버', file: 'silver-coin.svg'}
};
const digits = new Intl.NumberFormat('ko-KR');

export function currencyIcon(code, size = 20) {
  const currency = currencies[code];
  if (!currency) return '';
  const pixels = Number.isFinite(size) ? Math.min(64, Math.max(12, size)) : 20;
  return '<img class="currency-medal" src="/assets/currency/' + currency.file + '" width="' + pixels + '" height="' + pixels + '" alt="' + currency.name + '">';
}

export function currencyAmount(value, code, {icon = true, size = 17} = {}) {
  const currency = currencies[code];
  if (!currency) return '';
  const amount = Number.isFinite(value) ? digits.format(value) : '—';
  return '<span class="currency-amount shop-currency-amount" role="img" aria-label="' + currency.name + ' ' + amount + '">' +
    (icon ? currencyIcon(code, size) : '') + '<span class="shop-price-value">' + amount + (icon ? '' : ' ' + code.toLowerCase()) + '</span></span>';
}
