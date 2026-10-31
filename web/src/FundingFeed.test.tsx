import { render,screen,fireEvent,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach,expect,it,vi } from 'vitest';
import FundingFeed from './FundingFeed';
import { api,type FundingState } from './lib/api';

vi.mock('./lib/api',async importOriginal=>({...(await importOriginal<typeof import('./lib/api')>()),api:vi.fn()}));
vi.mock('./lib/database',()=>({hasLocalServer:()=>true}));
const state:FundingState={running:false,schedule:{enabled:1,next_due_at:null},window:{start:'2026-10-25',end:'2026-10-31'},reports:[],report:{id:1,window_start:'2026-10-25',window_end:'2026-10-31',generated_at:'2026-10-31T12:00:00Z',status:'partial',sources:[{name:'Fixture feed',ok:true,covered:false,pages:1,candidates:1,error:null}]},articles:[{id:1,company_name:'FixtureAI',company_key:'fixtureai',source_url:'https://example.com/funding',source_name:'Fixture feed',title:'Fictional AI funding fixture',summary:'A fictional fixture for interface tests.',published_at:'2026-10-30T12:00:00Z',sector:'AI',country_code:'US',round_type:'seed',amount_text:'$10M',announced_on:null,extraction_notes:'需核对',review_status:'pending',company_id:null,funding_round_id:null}]};
beforeEach(()=>{vi.mocked(api).mockReset();vi.mocked(api).mockImplementation(async(_path,method)=>method&&method!=='GET'?{ok:true}:structuredClone(state));});
it('shows evidence and requires explicit announcement date and US confirmation before saving',async()=>{
 render(<MemoryRouter><FundingFeed/></MemoryRouter>);const user=userEvent.setup();
 expect(await screen.findByText('FixtureAI')).toBeVisible();expect(screen.getByText('待核对报道')).toBeVisible();expect(screen.getByRole('link',{name:/打开原文/})).toHaveAttribute('href','https://example.com/funding');
 await user.click(screen.getByRole('button',{name:'核对并保存'}));
 expect(screen.getByLabelText('原文融资公告日期')).toHaveValue('');
 fireEvent.change(screen.getByLabelText('原文融资公告日期'),{target:{value:'2026-10-30'}});
 await user.click(screen.getByRole('checkbox',{name:/我已根据原文确认/}));
 await user.click(screen.getByRole('button',{name:'确认并保存公司 / 融资记录'}));
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/api/funding/articles/1','PUT',expect.objectContaining({country_code:'US',announced_on:'2026-10-30',round_type:'seed'})));
 expect(screen.getByRole('link',{name:/导出 Markdown/})).toHaveAttribute('href','/api/funding/export?report=1');
});
it('starts generation and reports source failure without claiming there was no funding',async()=>{
 const failed={...state,articles:[],report:{...state.report!,status:'failed',sources:[{name:'Fixture feed',ok:false,covered:false,pages:0,candidates:0,error:'HTTP 403'}]}};
 vi.mocked(api).mockImplementation(async(_path,method)=>method==='POST'?{running:true}:structuredClone(failed));
 render(<MemoryRouter><FundingFeed/></MemoryRouter>);const user=userEvent.setup();
 expect(await screen.findByText('来源暂时不可用')).toBeVisible();expect(screen.getByText(/HTTP 403/)).toBeVisible();
 await user.click(screen.getByRole('button',{name:'生成过去 7 天周报'}));
 expect(api).toHaveBeenCalledWith('/api/funding/generate','POST',{});
});
