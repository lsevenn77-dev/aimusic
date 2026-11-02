import {SEARCH_ALIASES} from '../shared/search.js';
import {producerNameSQL} from './identity.js';
// Shared, parameterized search matching for music and related entities.
// Keep the raw substring match; add spacing/punctuation-insensitive matching without schema changes.
const SQL_SEPARATORS = [' ', '\t', '\n', '\r', '　', '-', '_', '.', '·', 'ㆍ', '/', '\\', '(', ')', '[', ']', "'", '"', '+', '&', '!', '?'];
const FLEX_SEPARATORS = /[\s\u200b-\u200d\p{P}\p{S}]/gu;
const aliasGroups = SEARCH_ALIASES.map(group => [...new Set(group.map(compactSearchText))]);
const quoteSQL = s => "'" + s.replace(/'/g, "''") + "'";
const escapeLike = s => s.replace(/[\\%_]/g, '\\$&');
const likeSQL = field => `${field} LIKE ? ESCAPE '\\'`;

export function searchText(value) {
 return String(value ?? '').normalize('NFKC').trim().slice(0, 100).replace(/\s+/gu, ' ');
}

export function compactSearchText(value) {
 return String(value ?? '').normalize('NFKC').toLowerCase().replace(FLEX_SEPARATORS, '');
}

export function compactSearchSQL(field) {
 return SQL_SEPARATORS.reduce((expr, separator) => `REPLACE(${expr},${quoteSQL(separator)},'')`, `LOWER(COALESCE(${field},''))`);
}

export function flexibleSearchCondition(input, fields, flexibleFields = fields) {
 const q = searchText(input);
 if (!q) return {sql: '0', args: []};
 const conditions = [], args = [];
 const addAny = (columns, pattern) => {
   conditions.push('(' + columns.map(likeSQL).join(' OR ') + ')');
   args.push(...columns.map(() => pattern));
 };
 addAny(fields, '%' + escapeLike(q) + '%');
 const compact = compactSearchText(q);
 if (compact.length >= 2 && flexibleFields.length) {
   const columns = flexibleFields.map(compactSearchSQL);
   for (const term of aliasGroups.find(group => group.includes(compact)) || [compact]) {
     addAny(columns, '%' + escapeLike(term) + '%');
   }
 }
 // Match multiple meaningful words across title + artist + other searchable metadata.
 // Skip single-character word combinations to avoid overly broad result sets.
 const tokens = q.split(' ').map(compactSearchText).filter(Boolean);
 if (tokens.length > 1 && tokens.length <= 8 && compact.length >= 3 && tokens.some(t => compactSearchText(t).length >= 2)) {
   const perToken = [];
   const columns = (flexibleFields.length ? flexibleFields : fields).map(compactSearchSQL);
   for (const token of tokens) {
     perToken.push('(' + columns.map(likeSQL).join(' OR ') + ')');
     args.push(...columns.map(() => '%' + escapeLike(compactSearchText(token)) + '%'));
   }
   conditions.push('(' + perToken.join(' AND ') + ')');
 }
 return {sql: '(' + conditions.join(' OR ') + ')', args};
}

export function songTextMatch(q) {
 const fields = ['t.title','a.name',producerNameSQL(),'t.genre','t.genres_json','t.tags'];
 return flexibleSearchCondition(q, fields);
}
