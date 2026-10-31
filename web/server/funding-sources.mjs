import { XMLParser, XMLValidator } from 'fast-xml-parser';

export const SOURCES = [
  { id: 'finsmes', name: 'FinSMEs', url: 'https://www.finsmes.com/feed', pages: 6, hosts: ['finsmes.com', 'www.finsmes.com'] },
  { id: 'fintechglobal', name: 'FinTech Global', url: 'https://fintech.global/feed/', pages: 4, hosts: ['fintech.global', 'www.fintech.global'], sectorHint: 'Fintech' },
  { id: 'techeu', name: 'Tech.eu', url: 'https://tech.eu/feed/', pages: 3, hosts: ['tech.eu', 'www.tech.eu'] },
];
const array = value => value === undefined ? [] : Array.isArray(value) ? value : [value];
const string = value => typeof value === 'string' ? value : value?.['#text'] ?? '';

export function plainText(value) {
  return string(value).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]*>/g, ' ')
    .replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (whole, decimal, hex, named) => {
      if (decimal || hex) { const n = parseInt(decimal || hex, decimal ? 10 : 16); return n <= 0x10ffff ? String.fromCodePoint(n) : ''; }
      return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' })[named.toLowerCase()] ?? whole;
    }).replace(/\s+/g, ' ').trim();
}

export function canonicalURL(raw, source) {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || !source.hosts.includes(url.hostname) || url.username || url.password || (url.port && url.port !== '443')) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    return url.href;
  } catch { return null; }
}

export function parseFeed(xml, source) {
  if (/<!DOCTYPE/i.test(xml) || XMLValidator.validate(xml) !== true) throw new Error('Invalid or unsupported RSS/Atom response');
  const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xml);
  const entries = parsed.rss?.channel?.item ?? parsed.feed?.entry;
  if (entries === undefined && !parsed.rss?.channel && !parsed.feed) throw new Error('Response is not RSS or Atom');
  return array(entries).flatMap(item => {
    const link = typeof item.link === 'string' ? item.link : array(item.link).find(link => !link['@_rel'] || link['@_rel'] === 'alternate')?.['@_href'];
    const url = canonicalURL(link, source);
    const date = new Date(string(item.pubDate ?? item.published ?? item.updated ?? item['dc:date']));
    if (!url || !Number.isFinite(date.getTime())) return [];
    return [{ source_url: url, source_name: source.name, title: plainText(item.title).slice(0, 500), summary: plainText(item['content:encoded'] ?? item.content ?? item.description ?? item.summary).slice(0, 16000), published_at: date.toISOString() }];
  });
}

async function boundedText(response) {
  if (!response.body) throw new Error('Empty response');
  let total = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    total += chunk.length;
    if (total > 2_000_000) throw new Error('Feed exceeds 2 MB limit');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchFeedPage(source, page, fetcher = fetch, stopSignal) {
  let url = new URL(source.url);
  url.searchParams.set('paged', String(page));
  for (let redirects = 0; redirects < 4; redirects++) {
    const signal = stopSignal ? AbortSignal.any([stopSignal, AbortSignal.timeout(12000)]) : AbortSignal.timeout(12000);
    const response = await fetcher(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'SignalFundingReader/0.2 (personal RSS reader)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = new URL(response.headers.get('location'), url);
      const safe = canonicalURL(target.href, source);
      if (!safe) throw new Error('Feed redirected outside its configured HTTPS host');
      url = new URL(safe); continue;
    }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseFeed(await boundedText(response), source);
  }
  throw new Error('Too many feed redirects');
}

export function easternDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
}

export function reportingWindow(now = new Date()) {
  const end = easternDay(now);
  const start = new Date(end + 'T12:00:00Z'); start.setUTCDate(start.getUTCDate() - 6);
  return { start: start.toISOString().slice(0, 10), end, asOf: now.toISOString() };
}

export function classifyArticle(article, source) {
  const title = article.title;
  const text = title + '. ' + article.summary;
  if (!/\b(rais(?:e[sd]?|ing)|secur(?:e[sd]?|ing)|clos(?:e[sd]?|ing)|lands?|bags?|funding|financing)\b/i.test(title)) return null;
  if (/\b(series\s+[c-z]|ipo|acqui(?:res?|red|sition)|debt[- ]only|debt financ(?:ing|e)|debt funding|credit facility|fund\s+[IVX]+|venture fund)\b/i.test(title)) return null;
  const ai = /\b(AI|artificial intelligence|machine learning|generative AI|agentic)\b/i.test(text);
  const fintech = source.sectorHint === 'Fintech' || /\b(fintech|fin tech|payments?|wealthtech|insurtech|banking|lending|financial infrastructure|financial technology|credit underwriting|ledger|reconciliation)\b/i.test(text);
  if (!ai && !fintech) return null;
  const company = (title.match(/^(.+?)\s+(?:Raises?|Raised|Secures?|Secured|Closes?|Closed|Lands?|Bags?)\b/i)?.[1] ?? '').replace(/\s*[,–—:]\s*$/, '').trim().slice(0, 150);
  const normalized = text.replace(/[-–—]/g, ' ');
  const stage = /\bpre\s*seed\b/i.test(normalized) ? 'pre_seed' : /\bseries\s+a\b/i.test(normalized) ? 'series_a' : /\bseries\s+b\b/i.test(normalized) ? 'series_b' : /\bseed\b/i.test(normalized) ? 'seed' : null;
  // Only the opening company-description sentence is used for location evidence;
  // investor offices and expansion plans do not establish headquarters.
  const opening = article.summary.slice(0, 650).split(/(?<=[.!?])\s+/)[0] ?? '';
  const location = opening.match(/\b(?:a[n]?\s+)?(.{2,100}?)\s*[-,]\s*(?:based|headquartered)\b/i)?.[1] ?? '';
  const us = /\b(?:US|USA|U\.S\.|United States|New York|San Francisco|Boston|Seattle|Austin|Chicago|Los Angeles|San Diego|Palo Alto|Mountain View|San Jose|Cambridge,?\s*(?:MA|Massachusetts)|Miami|Denver|Atlanta|Dallas|Houston|Washington,?\s*D\.?C|California|Massachusetts|Texas|New Jersey|Connecticut)\b/i.test(location);
  const foreign = /\b(?:London|UK|United Kingdom|Germany|France|Paris|Berlin|Canada|Toronto|Vancouver|India|Singapore|Israel|Tel Aviv|Australia|Sydney|Stockholm|Sweden|Denmark|Copenhagen|Netherlands|Amsterdam|Switzerland|Zurich|Spain|Madrid|Italy|Milan|China|Beijing|Brazil)\b/i.test(location);
  if (foreign && !us) return null;
  if (/\bseries\s+[c-z]\b/i.test(opening) || /\b(?:debt financing|debt funding|credit facility)\b/i.test(opening)) return null;
  const notes = ['自动提取，需打开原文核对融资公告日期和字段'];
  if (!company) notes.push('未可靠提取公司名称');
  if (!us || foreign) notes.push('美国总部待核实');
  if (!stage) notes.push('融资阶段待核实');
  const name = company || title;
  return { ...article, company_name: name, company_key: name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''), sector: ai && fintech ? 'AI + Fintech' : ai ? 'AI' : 'Fintech', country_code: us && !foreign ? 'US' : null, round_type: stage, amount_text: text.match(/(?:US\$|USD\s*|\$|€|£|EUR\s*|GBP\s*)\s*[\d,.]+\s*(?:billion|million|[MBK]\b)?/i)?.[0]?.trim() ?? '', extraction_notes: notes.join('；') };
}
