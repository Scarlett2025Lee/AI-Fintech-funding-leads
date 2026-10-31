import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Download, ExternalLink, Radio, RefreshCw, X } from 'lucide-react';
import { api, roundLabels, type FundingArticle, type FundingState } from './lib/api';
import { hasLocalServer } from './lib/database';

function Review({ article, close, saved }: { article: FundingArticle; close: () => void; saved: () => void }) {
  const [name, setName] = useState(article.company_name);
  const [sector, setSector] = useState(article.sector || 'AI');
  const [stage, setStage] = useState(article.round_type || '');
  const [us, setUS] = useState(false);
  const [date, setDate] = useState('');
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api(`/api/funding/articles/${article.id}`, 'PUT', { action: 'approve', company_name: name, sector, round_type: stage, country_code: us ? 'US' : '', announced_on: date }); saved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <form className="review-form" onSubmit={submit}><div className="panel-title"><h3>核对原文后确认</h3><button type="button" className="icon-button" onClick={close} aria-label="关闭核对"><X size={17}/></button></div><p>报道日期不一定是融资公告日期。请先打开来源，确认这是美国公司的新股权融资。</p><div className="form-grid"><label>公司名称<input required maxLength={150} value={name} onChange={e => setName(e.target.value)}/></label><label>行业<select value={sector} onChange={e => setSector(e.target.value)}>{['AI','Fintech','AI + Fintech'].map(x => <option key={x}>{x}</option>)}</select></label><label>融资阶段<select required value={stage} onChange={e => setStage(e.target.value)}><option value="">请选择</option>{Object.entries(roundLabels).map(([key,label]) => <option value={key} key={key}>{label}</option>)}</select></label><label>原文融资公告日期<input type="date" required value={date} onChange={e => setDate(e.target.value)}/></label></div><label className="checkbox-label"><input type="checkbox" required checked={us} onChange={e => setUS(e.target.checked)}/>我已根据原文确认美国总部、融资日期和阶段，且不是债务、并购或 IPO。</label>{error && <p role="alert" className="form-error">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? '保存中…' : '确认并保存公司 / 融资记录'}</button></form>;
}

export default function FundingFeed() {
  const available = hasLocalServer();
  const [data,setData] = useState<FundingState | null>(null);
  const [reportId,setReportId] = useState('');
  const [error,setError] = useState('');
  const [starting,setStarting] = useState(false);
  const [status,setStatus] = useState('all'); const [sector,setSector] = useState('all');
  const [review,setReview] = useState<number | null>(null);
  const load = useCallback(async () => {
    if (!available) return;
    try { setData(await api<FundingState>('/api/funding' + (reportId ? '?report='+reportId : ''))); setError(''); }
    catch(e) { setError((e as Error).message); }
  },[available,reportId]);
  useEffect(() => { void load(); const timer = setInterval(() => { void load(); },3000); return () => clearInterval(timer); },[load]);
  async function generate() {
    setStarting(true);setError('');setReportId('');
    try { await api('/api/funding/generate','POST',{}); await load(); } catch(e) { setError((e as Error).message); } finally { setStarting(false); }
  }
  async function toggle() { try { const state = await api<FundingState>('/api/funding/schedule','PUT',{ enabled: !data?.schedule.enabled });setData(state); } catch(e) {setError((e as Error).message);} }
  async function reject(id:number) { try { await api(`/api/funding/articles/${id}`,'PUT',{action:'reject'});await load(); } catch(e) {setError((e as Error).message);} }
  const report = data?.report;
  const articles = data?.articles ?? [];
  const filtered = articles.filter(a => (status === 'all' ? a.review_status !== 'rejected' : a.review_status === status) && (sector === 'all' || a.sector?.includes(sector)));
  const confirmed = new Set(articles.filter(a => a.review_status === 'approved').map(a => a.funding_round_id)).size;
  return <>
    <div className="page-heading"><div><div className="eyebrow">DISCOVER · WEEKLY FUNDING</div><h1>Funding Feed</h1><p>过去 7 天的美国 AI / Fintech 融资线索 · Pre-seed 至 Series B</p></div><button className="primary-button no-top" disabled={!available || starting || data?.running} onClick={generate}><RefreshCw size={16}/>{starting || data?.running ? '正在抓取公开来源…' : '生成过去 7 天周报'}</button></div>
    <div className="runtime-notice"><Radio size={16}/><span>日期按美国东部时间计算，含今天。按新闻发布时间检索，确认时需核对实际融资公告日期。公开 RSS 覆盖有限，不代表全部市场。</span></div>
    {!available && <div className="notice-error runtime-notice">这是离线界面预览。请启动本机网站后使用融资抓取功能。</div>}
    {error && <div role="alert" className="runtime-notice notice-error">{error}<button onClick={() => void load()}>重试</button></div>}
    <div className="feed-controls panel"><label className="checkbox-label"><input type="checkbox" disabled={!data} checked={!!data?.schedule.enabled} onChange={() => void toggle()}/>每周自动生成</label><span>网站启动时检查，此后每 7 天生成；关闭期间下次启动补跑。失败至少间隔 6 小时重试。</span>{data?.schedule.next_due_at && <small>下次检查：{new Date(data.schedule.next_due_at).toLocaleString()}</small>}</div>
    {available && !data && !error && <p role="status" className="loading-state">正在读取融资周报…</p>}
    {data && <><div className="feed-summary"><div><strong>{new Set(articles.filter(a => a.review_status !== 'rejected').map(a => a.company_key)).size}</strong><span>候选公司</span></div><div><strong>{confirmed}</strong><span>已核对融资轮次</span></div><div><strong>{articles.filter(a => a.review_status === 'pending').length}</strong><span>待核对报道</span></div><div><strong>{report?.status === 'failed' ? '抓取失败' : report?.status === 'partial' ? '覆盖不完整' : report ? '来源已响应' : '尚未生成'}</strong><span>{report ? `${report.window_start} — ${report.window_end}` : `${data.window.start} — ${data.window.end}`}</span></div></div>
    <div className="feed-toolbar"><label>历史周报<select value={reportId} onChange={e => {setReportId(e.target.value);setReview(null);}}><option value="">最新周报</option>{data.reports.map(r => <option key={r.id} value={r.id}>{r.window_start} — {r.window_end}</option>)}</select></label><label>行业<select value={sector} onChange={e => setSector(e.target.value)}><option value="all">AI + Fintech</option><option>AI</option><option>Fintech</option></select></label><label>核查状态<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">全部有效线索</option><option value="pending">待核对</option><option value="approved">已核对</option><option value="rejected">已排除</option></select></label>{report && <a className="secondary-button export-link" href={`/api/funding/export?report=${report.id}`} download><Download size={15}/>导出 Markdown 周报</a>}</div>
    {report && <details className="panel source-panel" open={report.status !== 'complete'}><summary>来源检查 · {report.status === 'failed' ? '所有来源抓取失败，不代表本周没有融资' : '查看抓取与覆盖情况'}</summary>{report.sources.map(s => <div key={s.name}><strong>{s.name}</strong><span>{s.error || (s.covered ? '已翻页至窗口之前' : '未确认完整 7 天覆盖')} · {s.pages} 页 · {s.candidates} 条候选</span></div>)}</details>}
    <div className="funding-list">{filtered.map(a => <article className="panel funding-card" key={a.id}><div className="panel-title"><div><span className={`review-badge ${a.review_status}`}>{a.review_status === 'approved' ? '已根据原文核对' : a.review_status === 'rejected' ? '已排除' : '待核对'}</span><h2>{a.company_name}</h2></div><span className="sector-tag">{a.sector}</span></div><div className="funding-facts"><span>{a.country_code === 'US' ? '美国线索' : '总部待核实'}</span><span>{roundLabels[a.round_type || ''] || '阶段待核实'}</span><strong>{a.amount_text || '金额未提取'}</strong></div><p className="article-title">{a.title}</p><p className="article-summary">{a.summary.slice(0,400)}{a.summary.length > 400 ? '…' : ''}</p><div className="article-meta">报道：{new Date(a.published_at).toLocaleDateString('zh-CN',{timeZone:'America/New_York'})} · 公告：{a.announced_on || '待核实'} · {a.source_name}</div><div className="card-actions"><a className="text-link" href={a.source_url} target="_blank" rel="noreferrer">打开原文 <ExternalLink size={14}/></a>{a.review_status === 'pending' && <><button className="secondary-button" onClick={() => setReview(review === a.id ? null : a.id)}>核对并保存</button><button className="plain-button" onClick={() => void reject(a.id)}>排除</button></>}{a.company_id && <Link className="secondary-button" to={`/companies?company=${a.company_id}`}>查看 / 完善公司资料</Link>}</div>{review === a.id && <Review key={a.id} article={a} close={() => setReview(null)} saved={() => {setReview(null);void load();}}/>}</article>)}</div>
    {!filtered.length && <div className="panel empty-feed"><Radio size={28}/><h2>{report?.status === 'failed' ? '来源暂时不可用' : data.running ? '正在检索融资新闻' : '这里还没有融资记录'}</h2><p>{report?.status === 'failed' ? '查看上方来源错误，确认网络后重新生成。抓取失败不会生成虚假的空周报结论。' : '点击生成周报。抓取到的线索会保留来源，核对后进入正式公司和融资列表。'}</p></div>}
    </>}
  </>;
}
