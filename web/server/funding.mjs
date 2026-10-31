import { SOURCES, fetchFeedPage, reportingWindow, easternDay, classifyArticle } from './funding-sources.mjs';

const DAY = 86400000;
const stages = ['pre_seed', 'seed', 'series_a', 'series_b'];
const sectors = ['AI', 'Fintech', 'AI + Fintech'];
export class FundingError extends Error { constructor(message, status = 400) { super(message); this.status = status; } }

export function createFundingService(db, { sources = SOURCES, fetchPage = fetchFeedPage, clock = () => new Date() } = {}) {
  let running = false;
  let timer;
  let active;
  let stopped = false;
  let controller;

  function snapshot(reportId) {
    const schedule = db.prepare('SELECT * FROM funding_schedule WHERE id=1').get();
    const reports = db.prepare('SELECT id,window_start,window_end,generated_at,status FROM funding_reports ORDER BY generated_at DESC LIMIT 26').all();
    const report = reportId ? db.prepare('SELECT * FROM funding_reports WHERE id=?').get(reportId) : db.prepare('SELECT * FROM funding_reports ORDER BY generated_at DESC LIMIT 1').get();
    const articles = report ? db.prepare(`SELECT a.* FROM funding_articles a JOIN report_articles r ON r.article_id=a.id WHERE r.report_id=? ORDER BY a.published_at DESC`).all(report.id) : [];
    return { running, schedule: { ...schedule, next_due_at: schedule.last_success_at ? new Date(Date.parse(schedule.last_success_at) + 7 * DAY).toISOString() : null }, reports, report: report ? { ...report, sources: JSON.parse(report.sources_json), sources_json: undefined } : null, articles, window: reportingWindow(clock()) };
  }

  async function generateReport() {
    const now = clock(); const window = reportingWindow(now);
    db.prepare('UPDATE funding_schedule SET last_attempt_at=? WHERE id=1').run(now.toISOString());
    const results = await Promise.all(sources.map(async source => {
      const found = new Map(); let covered = false; let pages = 0; let ok = false; let error = null;
      try {
        for (let page = 1; page <= source.pages; page++) {
          if (stopped) break;
          const entries = await fetchPage(source, page, undefined, controller.signal); pages++; ok = true;
          let added = 0;
          for (const article of entries) {
            const day = easternDay(article.published_at);
            if (day < window.start) { covered = true; continue; }
            if (day > window.end || Date.parse(article.published_at) > now.getTime()) continue;
            if (!found.has(article.source_url)) { found.set(article.source_url, article); added++; }
          }
          if (covered || entries.length === 0 || (page > 1 && added === 0)) break;
        }
      } catch (exception) { error = exception.name === 'TimeoutError' ? '请求超时' : exception.message === 'fetch failed' ? '无法连接来源，请检查网络、代理或源站访问限制' : exception.message.slice(0, 200); }
      const candidates = [...found.values()].map(article => classifyArticle(article, source)).filter(Boolean);
      return { id: source.id, name: source.name, ok, covered, pages, fetched: found.size, candidates, error };
    }));
    if (stopped) return;
    const metadata = results.map(({ candidates, ...result }) => ({ ...result, candidates: candidates.length }));
    const status = results.every(r => !r.ok) ? 'failed' : results.every(r => r.ok && r.covered && !r.error) ? 'complete' : 'partial';
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare(`INSERT INTO funding_reports(window_start,window_end,generated_at,status,sources_json) VALUES(?,?,?,?,?)
        ON CONFLICT(window_start,window_end) DO UPDATE SET generated_at=excluded.generated_at,status=excluded.status,sources_json=excluded.sources_json`).run(window.start, window.end, now.toISOString(), status, JSON.stringify(metadata));
      const report = db.prepare('SELECT id FROM funding_reports WHERE window_start=? AND window_end=?').get(window.start, window.end);
      // Failed refreshes preserve previously retrieved articles instead of erasing them.
      const insert = db.prepare(`INSERT INTO funding_articles(source_url,source_name,title,summary,published_at,company_name,company_key,sector,country_code,round_type,amount_text,extraction_notes) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(source_url) DO NOTHING`);
      for (const article of results.flatMap(result => result.candidates)) {
        insert.run(article.source_url, article.source_name, article.title, article.summary, article.published_at, article.company_name, article.company_key, article.sector, article.country_code, article.round_type, article.amount_text, article.extraction_notes);
        const { id } = db.prepare('SELECT id FROM funding_articles WHERE source_url=?').get(article.source_url);
        db.prepare('INSERT OR IGNORE INTO report_articles(report_id,article_id) VALUES(?,?)').run(report.id, id);
      }
      if (status !== 'failed') db.prepare('UPDATE funding_schedule SET last_success_at=? WHERE id=1').run(now.toISOString());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    return snapshot();
  }

  function generate() {
    if (stopped) throw new FundingError('网站正在关闭', 503);
    if (running) throw new FundingError('周报正在生成，请等待当前任务完成', 409);
    running = true;
    controller = new AbortController();
    active = generateReport().finally(() => { running = false; });
    return active;
  }

  function review(id, input) {
    const article = db.prepare('SELECT * FROM funding_articles WHERE id=?').get(id);
    if (!article) throw new FundingError('未找到这条融资消息', 404);
    if (article.review_status === 'approved') throw new FundingError('此记录已确认并保存，不能重复修改', 409);
    if (input.action === 'reject') {
      db.prepare("UPDATE funding_articles SET review_status='rejected',reviewed_at=? WHERE id=?").run(clock().toISOString(), id);
      return;
    }
    const name = typeof input.company_name === 'string' ? input.company_name.trim() : '';
    const date = input.announced_on;
    if (input.action !== 'approve' || !name || name.length > 150 || input.country_code !== 'US' || !stages.includes(input.round_type) || !sectors.includes(input.sector)) throw new FundingError('请确认公司名称、美国总部、AI/Fintech 行业和 Pre-seed 至 Series B 阶段');
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) throw new FundingError('请填写原文中的有效融资公告日期');
    const related = db.prepare('SELECT r.* FROM funding_reports r JOIN report_articles a ON a.report_id=r.id WHERE a.article_id=?').all(id);
    if (!related.some(report => date >= report.window_start && date <= report.window_end)) throw new FundingError('融资公告日期不在任何关联周报的 7 天范围内');
    const key = name.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
    db.exec('BEGIN IMMEDIATE');
    try {
      let company = db.prepare(`SELECT c.id FROM companies c WHERE lower(c.name)=lower(?) OR c.id IN (SELECT company_id FROM funding_articles WHERE company_key=? AND company_id IS NOT NULL) LIMIT 1`).get(name, key);
      if (!company) company = { id: Number(db.prepare("INSERT INTO companies(name,sector,country_code,notes) VALUES(?,?,'US',?)").run(name, input.sector, `融资来源：${article.source_url}`).lastInsertRowid) };
      let round = db.prepare('SELECT id FROM funding_rounds WHERE company_id=? AND round_type=? AND announced_on=?').get(company.id, input.round_type, date);
      if (!round) round = { id: Number(db.prepare('INSERT INTO funding_rounds(company_id,round_type,announced_on,source_url,verified_at,notes) VALUES(?,?,?,?,?,?)').run(company.id, input.round_type, date, article.source_url, clock().toISOString(), `用户根据原文核对；原文金额：${article.amount_text || '未提取'}；行业：${input.sector}`).lastInsertRowid) };
      db.prepare("UPDATE funding_articles SET company_name=?,company_key=?,sector=?,country_code='US',round_type=?,announced_on=?,review_status='approved',company_id=?,funding_round_id=?,reviewed_at=? WHERE id=?").run(name, key, input.sector, input.round_type, date, company.id, round.id, clock().toISOString(), id);
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
  }

  function markdown(reportId) {
    const state = snapshot(reportId);
    if (!state.report) throw new FundingError('还没有可导出的周报', 404);
    const clean = value => String(value ?? '').replace(/[|\r\n]/g, ' ');
    const lines = [`# 美国 AI / Fintech 融资周报`, '', `日期：${state.report.window_start} 至 ${state.report.window_end}（美国东部时间，含今天）`, '', '范围：美国；Pre-seed 至 Series B。按报道发布时间检索；确认列表的融资公告日期已由用户根据原文核对。金额按原文保留，不做币种换算。', '', `抓取状态：${state.report.status}。公开 RSS 覆盖有限，不能保证穷尽所有融资消息。`, '', '| 公司 | 行业 | 轮次 | 金额（原文） | 公告日期 | 来源 |', '|---|---|---|---|---|---|'];
    const confirmed = state.articles.filter(a => a.review_status === 'approved' && a.announced_on >= state.report.window_start && a.announced_on <= state.report.window_end);
    const seen = new Set();
    for (const a of confirmed) { const key = `${a.company_id}:${a.funding_round_id}`; if (seen.has(key)) continue; seen.add(key); lines.push(`| ${clean(a.company_name)} | ${clean(a.sector)} | ${a.round_type} | ${clean(a.amount_text || '未披露/未提取')} | ${a.announced_on} | ${a.source_url} |`); }
    if (!seen.size) lines.push('', '暂无已核对的融资记录。没有记录不代表这一周没有融资。');
    lines.push('', '## 待核对的融资线索', '');
    for (const a of state.articles.filter(a => a.review_status === 'pending')) lines.push(`- ${clean(a.company_name)} — ${a.source_url}（报道：${easternDay(a.published_at)}；${clean(a.extraction_notes)}）`);
    lines.push('', '## 来源检查', '');
    for (const source of state.report.sources) lines.push(`- ${source.name}: ${source.error || (source.covered ? '已翻页至时间窗口之前' : '未能确认完整 7 天覆盖')}；读取 ${source.pages} 页。`);
    return lines.join('\n');
  }

  function setSchedule(enabled) {
    if (typeof enabled !== 'boolean') throw new FundingError('enabled 必须是 true 或 false');
    db.prepare('UPDATE funding_schedule SET enabled=? WHERE id=1').run(enabled ? 1 : 0);
  }
  function tick() {
    if (running || stopped) return;
    const row = db.prepare('SELECT * FROM funding_schedule WHERE id=1').get(); const now = clock().getTime();
    if (!row.enabled || (row.last_attempt_at && now - Date.parse(row.last_attempt_at) < 6 * 3600000)) return;
    if (row.last_success_at && now - Date.parse(row.last_success_at) < 7 * DAY) return;
    generate().catch(error => console.error('Funding report failed:', error.message));
  }
  return { snapshot, generate, review, markdown, setSchedule,
    start() { timer = setInterval(tick, 15 * 60000); timer.unref(); tick(); },
    async stop() { stopped = true; controller?.abort(); clearInterval(timer); await active?.catch(() => {}); },
  };
}
