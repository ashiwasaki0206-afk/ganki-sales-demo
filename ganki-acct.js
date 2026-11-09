/* GANKI 経理への引継ぎ (sales.html 「経理へ提出」 + accounting.html 「経理」) — logic only, no DOM.
   Load after ganki-data.js, ganki-money.js and ganki-sales.js. All names and amounts are fictitious.

   Store: GK.db.acct (added 2026-10-19; an older stored db has no such key: GK.acct.ensure() adds it in memory with the
   samples — 9月 submitted and 受領, company cashflows for 経理 — saved with the first user action like any other change)
   {
     v:1,
     subs:[{id, m:'YYYY-MM', ver:1.., state:'submitted'|'received'|'returned', at, by, byId, note (申し送り),
            pkg (the package, frozen at submit time — see build()), act:null|{kind:'receive'|'return', at, by, byId, reason},
            lines:[entry ids added by 受領], taskId (the 差し戻し to-do), sample:true (only the seeded one)}],
     entries:[{id, m, type:'in'|'out', cat (科目), project (案件), partner (取引先), amount, due, paid, recon, memo,
               src:'sample'|'rental', subId}]       経理の入出金一覧 (src 'rental' = 「賃貸管理より自動反映」, one per 区分 per month)
   }
   Flow: 提出 (money 締め + 売上の確定 needed) → 受領 / 差し戻し (reason). After 差し戻し: 締めを解除 (reason) → 直す → 締め直す → 再提出 (版 +1).
   Every mutation looks records up again by id (GK.db may have been replaced by another tab's save) and returns an undo. */
(function(){
var GK=window.GK;if(!GK||!GK.money||!GK.sales)return;
var X=GK.money,Y=GK.sales,A=GK.acct={};
function clone(o){return o==null?o:JSON.parse(JSON.stringify(o))}
function now(){return GK.TODAY+' '+new Date().toTimeString().slice(0,5)}
function save(){GK.save()}
function logIt(t){GK.log(t);return GK.db.log[0]}
function unlog(le){if(!le)return;GK.db.log=GK.db.log.filter(function(y){return !(y===le||(y.at===le.at&&y.t===le.t&&y.who===le.who))})}
A.LABEL={none:'未提出',submitted:'提出済み・確認待ち',received:'受領済み',returned:'差し戻し',withdrawn:'取り下げ'};
A.CLS={none:'',submitted:'info',received:'ok',returned:'danger',withdrawn:'warn'};
A.MEMO='賃貸管理より自動反映';
A.PARTNER='賃貸管理部（社内）';

/* ---------- store ---------- */
var busy=false;
A.ensure=function(){
 var d=GK.db;
 if(!d.acct||typeof d.acct!=='object'||Array.isArray(d.acct)){
  X.ensure(); /* its once-per-page save must not happen half-way through the seeding below */
  /* 社内検証用のデータ (GK.LOCAL): empty — no sample cashflows, no sample handovers, no DEMO history */
  if(GK.LOCAL)d.acct={v:1,subs:[],entries:[],demoHist:1};
  else d.acct={v:1,subs:[],entries:sampleEntries()};
  if(!busy&&!GK.LOCAL){busy=true;try{seedSample(d.acct)}catch(e){if(window.console)console.error(e)}finally{busy=false}}
 }
 var a=d.acct;
 if(!Array.isArray(a.subs))a.subs=[];
 if(!Array.isArray(a.entries))a.entries=[];
 a.subs=a.subs.filter(function(s){return s&&typeof s==='object'&&s.id&&s.m});
 if(GK.LOCAL)a.demoHist=1;
 /* DEMO history handovers for an older stored db (in memory; see seedHistory) */
 if(!a.demoHist&&!busy){busy=true;try{seedHistory(a)}catch(e){a.demoHist=1;if(window.console)console.error(e)}finally{busy=false}}
 return a;
};
A.sub=function(id){return GK.by(A.ensure().subs,id)};
A.versions=function(m){return A.ensure().subs.filter(function(s){return s.m===m}).sort(function(a,b){return a.ver-b.ver})};
A.latest=function(m){var v=A.versions(m);return v.length?v[v.length-1]:null};
A.status=function(m){var l=A.latest(m),st=l?l.state:'none';return {state:st,label:A.LABEL[st]||st,cls:A.CLS[st]||'',sub:l,ver:l?l.ver:0}};
/* months shown on 経理 (2026-10-19, newest first): from the earliest month with cashflows (入出金一覧) or a rental handover to this month */
A.firstMonth=function(){
 var a=A.ensure(),c=X.cur(),best=c,ok=function(m){return /^\d{4}-\d{2}$/.test(String(m||''))};
 a.entries.forEach(function(x){if(x&&ok(x.m)&&x.m<best)best=x.m});
 a.subs.forEach(function(s){if(ok(s.m)&&s.m<best)best=s.m});
 return best;
};
A.monthList=function(){return GK.monthRange(A.firstMonth(),X.cur()).reverse()};
A.monthHint=function(){return '入出金管理の記録か賃貸管理部からの引継ぎがある月（'+GK.monthText(A.firstMonth())+'）から今月まで選べます。'};
/* months with a handover (newest first) */
A.subMonths=function(){var out=[];A.ensure().subs.forEach(function(s){if(out.indexOf(s.m)<0)out.push(s.m)});return out.sort().reverse()};
A.waiting=function(){return A.ensure().subs.filter(function(s){return s.state==='submitted'})};

/* ---------- may this month be submitted? ---------- */
/* {ok, why:[{t, href?, k}], ver (next version), resubmit} */
A.ready=function(m){
 var why=[],st=A.status(m),c=X.cur();
 if(m>c)why.push({k:'future',t:'まだ来ていない月です。'});
 else if(!X.hasMonth(m))why.push({k:'nomoney',t:X.monY(m)+'は「入出金」のデータがありません。'});
 else{
  if(!X.month(m).closed)why.push({k:'close',t:'「入出金」で'+X.mon(m)+'を締めてください。',href:'money.html#tab-close'+(m!==c?'-'+m:'')});
  var M=Y.month(m);
  if(M.kind==='live')why.push({k:'fix',t:'「管理部売上」で'+X.mon(m)+'の売上を確定してください（入出金を締めたあとでできます）。'});
  else if(M.kind==='fixed'&&X.month(m).closed){var live=Y.compute(m).totals,t=M.totals;
   if(live.sales!==t.sales||live.cost!==t.cost)why.push({k:'stale',t:'売上を確定したあとで数字が変わっています（確定 '+GK.yen(t.sales)+' → いま '+GK.yen(live.sales)+'）。「確定を取り消す」で確定し直してください。'})}
 }
 if(st.state==='submitted')why.push({k:'sent',t:'第'+st.ver+'版を提出済みです（経理の確認待ち）。'});
 if(st.state==='received')why.push({k:'done',t:'第'+st.ver+'版を経理が受領済みです。'});
 /* every owner statement (incl. 借上賃料) 確定 or 送金済み, so 総合振込 in the package covers all of them (user decision 2026-10-19) */
 if(m<=c&&X.hasMonth(m)){var dr=A.drafts(m);if(dr.length)why.push({k:'remit',t:'送金の明細がまだ下書きです：'+dr.map(function(x){return x.owner+' 様（'+x.kind+'）'}).join('、')+'。「入出金」の「オーナー送金」で確定してください。',href:'money.html#tab-remit'+(m!==c?'-'+m:''),owners:dr})}
 /* after 差し戻し / 取り下げ: re-submit as a new version. Only the 申し送り changed → straight away (numbers re-snapshotted from the
    still-closed month); numbers to fix → 締めを解除 first (the checks above then wait for 締め・確定 again) */
 return {ok:!why.length,why:why,ver:st.ver+1,resubmit:st.state==='returned'||st.state==='withdrawn'};
};
A.drafts=function(m){return X.remitTargets(m).filter(function(t){var s=X.remitOf(m,t.key).state;return s!=='fixed'&&s!=='sent'}).map(function(t){return {key:t.key,owner:t.owner.n,kind:t.kind==='lease'?'借上賃料':'オーナー送金'}})};
/* after the latest 差し戻し: the month was reopened and closed again (information only; not required since 2026-10-19) */
A.redone=function(m){
 var l=A.latest(m);if(!l||l.state!=='returned'||!l.act)return true;
 var at=l.act.at||'',lg=X.hasMonth(m)?X.month(m).closeLog:[],re=-1;
 lg.forEach(function(x,i){if(x.act==='reopen'&&String(x.at)>=at)re=i});
 if(re<0)return false;
 for(var i=re+1;i<lg.length;i++)if(lg[i].act==='close')return !!X.month(m).closed;
 return false;
};

/* ---------- the package (frozen copy) ---------- */
function occAt(unitId,day){return GK.db.leases.filter(function(l){
 if(l.unit!==unitId||!(l.status==='有効'||l.status==='終了'))return false;if(l.start&&l.start>day)return false;if(l.end&&l.end<day)return false;
 if(l.notice&&l.notice.date&&l.notice.date<=day&&l.status==='有効')return false;return true})[0]||null}
/* DEMO: a month whose 管理部売上 is the demo history (no breakdown) gets a fictitious breakdown from the ledger,
   adjusted to the demo totals so 経理 sees the same 売上高・費用 as 管理部売上 */
function demoSales(m){
 var S=X.setFor(m),z=X.lastDay(m),items=[];
 var add=function(cat,amt,o){amt=Math.round(amt||0);if(!amt)return;o=o||{};items.push({cat:cat,col:Y.colOf(cat),amount:amt,region:o.region||Y.regionOf(o.prop),prop:o.prop||'',unit:o.unit||'',label:o.label||'',src:'見本',manual:''})};
 GK.db.props.forEach(function(p){
  var t=X.treat(p.id,S);
  if(t==='受託'){var f=X.feeLine(p,m,0,p.owner,S);if(!f.free&&f.fee)add('管理委託手数料（通常額）',f.fee-(f.inTax||0),{prop:p.id,label:p.n+' '+f.basis})}
  else (p.rooms||[]).forEach(function(no){var id=p.id+'-'+no,l=occAt(id,z);if(l)add(t==='サブリース'?'マスターリース賃料収入':'自社物件 賃料収入',(+l.rent||0)+(+l.fee||0),{prop:p.id,unit:id,label:GK.roomLabel(id)+' '+X.monY(m)+'分 家賃・共益費'})});
  if(t==='サブリース'){var sl=X.subleaseOf(p.id,S);if(sl.amount)add('マスターリース支払',sl.amount,{prop:p.id,label:p.n+' 借上賃料'})}
 });
 add('振込手数料の無料サービス',330,{label:'振込手数料（会社負担・2件）'});
 var h=Y.history(m),s=Y.sum(items).totals;
 if(h){add('その他売上',h.totals.sales-s.sales,{label:'見本の調整（デモの過去データの合計に合わせる）'});add('その他支出',h.totals.cost-s.cost,{label:'見本の調整（デモの過去データの合計に合わせる）'})}
 var r=Y.sum(items);r.kind='demo';return r;
}
var REMIT_STATE={draft:'未確定',fixed:'確定済み（未送金）',sent:'送金済み'};
A.REMIT_STATE=REMIT_STATE;
/* everything 経理 needs for month m, as plain data (no references into GK.db) */
A.build=function(m,note){
 var M=Y.month(m),sal=M.kind==='demo'?demoSales(m):M;
 var sales={kind:M.kind,totals:clone(sal.totals),regions:clone(sal.regions),
  cats:sal.cats.map(function(c){return {cat:c.cat,col:c.col,amount:c.amount,n:c.items.length}})};
 var rooms=sal.items.map(function(x){var p=x.prop&&GK.prop(x.prop);return {unit:x.unit||'',prop:x.prop||'',propName:p?p.n:'',label:x.label||'',cat:x.cat,col:x.col,amount:x.amount,region:x.region||''}});
 var remit=X.remitTargets(m).map(function(t){var r=X.remitOf(m,t.key),st=X.shown(m,t.key);
  return {key:t.key,kind:t.kind==='lease'?'借上賃料':'オーナー送金',owner:t.owner.n,state:r.state,stateLabel:REMIT_STATE[r.state]||r.state,net:st?st.net:0,payDate:st?st.payDate:'',sentAt:r.sentAt||'',text:st?X.statementText(st):''}});
 var z=X.zengin(m,{all:true});
 var transfer={files:z.files.map(function(f){return {date:f.date,count:f.count,total:f.total,text:f.text,names:f.names.slice()}}),
  excluded:z.excluded.map(function(x){return {name:x.name,kind:x.kind,amount:x.amount,reason:x.reason}}),errors:z.errors.slice(),total:z.total};
 var c=X.mfCompare(m),counts={};
 var list=c.items.map(function(it){counts[it.state]=(counts[it.state]||0)+1;
  var amt=it.row?it.row.amount:(it.mf?(it.mf.dir==='out'?-1:1)*(+it.mf.amount||0):0);
  return {date:it.row?it.row.date:(it.mf&&it.mf.date)||'',name:it.row?it.row.name:(it.mf&&it.mf.memo)||'',amount:amt,state:it.state,label:X.mfLabel[it.state]||it.state,fix:(it.fix||[])[0]||''}});
 var mf={loaded:!!c.loaded,bad:c.bad||0,counts:counts,list:list};
 return {m:m,sales:sales,rooms:rooms,remit:remit,transfer:transfer,mf:mf,note:String(note||''),
  closedAt:X.hasMonth(m)&&X.month(m).closed?X.month(m).closed.at:'',fixedAt:Y.smonth(m).fixed?Y.smonth(m).fixed.at:'',demo:M.kind==='demo'};
};
/* hist: every action on a version, for the history (who / when / reason) */
function ev(s,kind,reason){(s.hist=s.hist||[]).push({kind:kind,at:now(),by:GK.ME,byId:GK.MEID||'',reason:reason||''})}
function popEv(s,kind){var h=s.hist||[];if(h.length&&h[h.length-1].kind===kind)h.pop()}
A.EV={submit:'提出',receive:'受領',return:'差し戻し',withdraw:'提出を取り下げ',unreceive:'受領を取り消し'};
function cleanReason(r){return String(r==null?'':r).replace(/\s+/g,' ').trim().slice(0,200)}
function sig(l){return JSON.stringify([l.id,l.m,l.type,l.cat,l.amount,!!l.neg,l.due,!!l.paid,!!l.recon,l.project,l.partner,l.used||''])}
function cleanNote(s){return String(s==null?'':s).replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').trim().slice(0,1000)}

/* ---------- 提出 (管理部) ---------- */
A.submit=function(m,note){
 if(!GK.can('acct.submit'))return {ok:false,msg:'「経理へ提出」は使えない設定になっています。'};
 var r=A.ready(m);if(!r.ok)return {ok:false,msg:'まだ提出できません：'+r.why.map(function(x){return x.t}).join(' '),why:r.why};
 var a=A.ensure(),prev=A.latest(m),n=cleanNote(note),id='AC'+Date.now().toString(36)+Math.floor(Math.random()*1000);
 var pkg=A.build(m,n);
 var sub={id:id,m:m,ver:r.ver,state:'submitted',at:now(),by:GK.ME,byId:GK.MEID||'',note:n,pkg:pkg,act:null,lines:[],taskId:'',hist:[]};
 ev(sub,'submit');a.subs.push(sub);
 /* the 差し戻し to-do of the version before is done now */
 var tdone=null;if(prev&&prev.taskId){var tk=GK.by(GK.db.tasks||[],prev.taskId);if(tk&&!tk.done){tk.done=true;tk.doneAt=GK.TODAY;tdone=tk.id}}
 var le=logIt('経理へ提出：'+X.monY(m)+'分 第'+sub.ver+'版（売上高 '+GK.yen(pkg.sales.totals.sales)+'・費用 '+GK.yen(pkg.sales.totals.cost)+'）');save();
 return {ok:true,sub:sub,undo:function(){
  var s=A.sub(id);if(!s)return {ok:true};
  if(s.state!=='submitted')return {ok:false,msg:'経理がもう'+(s.state==='received'?'受領':'差し戻し')+'したため、元に戻せません。'};
  var a2=A.ensure();a2.subs=a2.subs.filter(function(x){return x.id!==id});
  if(tdone){var t2=GK.by(GK.db.tasks||[],tdone);if(t2){t2.done=false;delete t2.doneAt}}
  unlog(le);save();return {ok:true};
 }};
};

/* ---------- 受領 / 差し戻し (経理) ---------- */
/* {ok, why} — may the current person 受領 this version? */
A.canReceive=function(s){
 if(!s)return {ok:false,why:'見つかりません。'};
 if(!GK.can('acct.receive'))return {ok:false,why:'「引継ぎの受領・差し戻し」は使えない設定になっています。'};
 if(s.state!=='submitted')return {ok:false,why:'この版は'+(A.LABEL[s.state]||s.state)+'です。'};
 var l=A.latest(s.m);if(l&&l.id!==s.id)return {ok:false,why:'新しい版があります。'};
 if(s.byId&&s.byId===GK.MEID||(!s.byId&&s.by===GK.ME))return {ok:false,self:true,why:'第'+s.ver+'版は'+GK.ME+' さん自身が提出したため、受領できません（提出した人とは別の人が受領します）。'};
 return {ok:true,why:''};
};
A.canReturn=function(s){
 if(!s)return {ok:false,why:'見つかりません。'};
 if(!GK.can('acct.receive'))return {ok:false,why:'「引継ぎの受領・差し戻し」は使えない設定になっています。'};
 if(s.state!=='submitted')return {ok:false,why:'この版は'+(A.LABEL[s.state]||s.state)+'です。'};
 var l=A.latest(s.m);if(l&&l.id!==s.id)return {ok:false,why:'新しい版があります。'};
 return {ok:true,why:''};
};
/* the 自動反映 lines of a package: one per 区分 with money (売上 → 入金, 費用 → 支払; サービス額・参考 are not cash) */
A.linesOf=function(s){
 var p=s.pkg,due=X.lastDay(s.m),recon=!!(p.mf&&p.mf.loaded&&!p.mf.bad);
 return p.sales.cats.filter(function(c){return c.amount&&(c.col==='sales'||c.col==='cost')}).map(function(c,i){
  return {id:'AR-'+s.id+'-'+(i+1),m:s.m,type:c.col==='sales'?'in':'out',cat:c.cat,project:'賃貸管理部 '+X.monY(s.m)+'分（第'+s.ver+'版）',partner:A.PARTNER,
   amount:Math.abs(c.amount),neg:c.amount<0,due:due,paid:true,recon:recon,memo:A.MEMO,src:'rental',subId:s.id}});
};
A.receive=function(id){
 var s=A.sub(id),c=A.canReceive(s);if(!c.ok)return {ok:false,msg:c.why,self:!!c.self};
 var a=A.ensure(),lines=A.linesOf(s);
 lines.forEach(function(l){a.entries.push(l)});
 s.state='received';s.act={kind:'receive',at:now(),by:GK.ME,byId:GK.MEID||''};s.lines=lines.map(function(l){return l.id});s.lineSig=lines.map(sig);ev(s,'receive');
 var le=logIt('経理：'+X.monY(s.m)+'分の引継ぎ（第'+s.ver+'版）を受領（売上高 '+GK.yen(s.pkg.sales.totals.sales)+'・費用 '+GK.yen(s.pkg.sales.totals.cost)+'）');save();
 var ids=s.lines.slice();
 return {ok:true,sub:s,lines:lines,undo:function(){
  var s2=A.sub(id);if(!s2||s2.state!=='received')return {ok:false,msg:'受領した状態ではなくなっています。'};
  var a2=A.ensure();a2.entries=a2.entries.filter(function(e){return ids.indexOf(e.id)<0});
  s2.state='submitted';s2.act=null;s2.lines=[];delete s2.lineSig;popEv(s2,'receive');unlog(le);save();return {ok:true};
 }};
};
A.giveBack=function(id,reason){
 var s=A.sub(id),c=A.canReturn(s);if(!c.ok)return {ok:false,msg:c.why};
 var why=cleanReason(reason);
 if(!why)return {ok:false,msg:'差し戻す理由を書いてください（例：森 様の送金額を確認してください）。',field:'reason'};
 s.state='returned';s.act={kind:'return',at:now(),by:GK.ME,byId:GK.MEID||'',reason:why};ev(s,'return',why);
 var tk=GK.addTask('','経理から差し戻し：'+X.mon(s.m)+'（'+why+'）',GK.TODAY,{who:s.by||''});s.taskId=tk.id;
 var le=logIt('経理：'+X.monY(s.m)+'分の引継ぎ（第'+s.ver+'版）を差し戻し（理由：'+why.slice(0,60)+'）');save();
 var tid=tk.id;
 return {ok:true,sub:s,task:tk,undo:function(){
  var s2=A.sub(id);if(!s2||s2.state!=='returned')return {ok:false,msg:'差し戻した状態ではなくなっています。'};
  var l=A.latest(s2.m);if(l&&l.id!==id)return {ok:false,msg:'管理部がもう再提出したため、元に戻せません。'};
  GK.db.tasks=(GK.db.tasks||[]).filter(function(t){return t.id!==tid});
  s2.state='submitted';s2.act=null;s2.taskId='';popEv(s2,'return');unlog(le);save();return {ok:true};
 }};
};
/* ---------- lasting cancel actions (reason required; added 2026-10-19) ---------- */
/* 提出を取り下げる (管理部, 経理へ提出 permission): only while 確認待ち */
A.canWithdraw=function(s){
 if(!s)return {ok:false,why:'見つかりません。'};
 if(!GK.can('acct.submit'))return {ok:false,why:'「経理へ提出」は使えない設定になっています。'};
 if(s.state!=='submitted')return {ok:false,why:'この版は'+(A.LABEL[s.state]||s.state)+'のため、取り下げられません（取り下げは経理の確認待ちのあいだだけです）。'};
 var l=A.latest(s.m);if(l&&l.id!==s.id)return {ok:false,why:'新しい版があります。'};
 return {ok:true,why:''};
};
A.withdraw=function(id,reason){
 var s=A.sub(id),c=A.canWithdraw(s);if(!c.ok)return {ok:false,msg:c.why};
 var why=cleanReason(reason);if(!why)return {ok:false,msg:'取り下げる理由を書いてください（例：申し送りを書き直すため）。',field:'reason'};
 s.state='withdrawn';s.act={kind:'withdraw',at:now(),by:GK.ME,byId:GK.MEID||'',reason:why};ev(s,'withdraw',why);
 var le=logIt('経理への提出を取り下げ：'+X.monY(s.m)+'分 第'+s.ver+'版（理由：'+why.slice(0,60)+'）');save();
 return {ok:true,sub:s,undo:function(){
  var s2=A.sub(id);if(!s2||s2.state!=='withdrawn')return {ok:false,msg:'取り下げた状態ではなくなっています。'};
  var l=A.latest(s2.m);if(l&&l.id!==id)return {ok:false,msg:'もう再提出したため、元に戻せません。'};
  s2.state='submitted';s2.act=null;popEv(s2,'withdraw');unlog(le);save();return {ok:true};
 }};
};
/* 受領を取り消す (経理, 受領 permission): removes exactly that version's 自動反映 lines by id; refused when one of them
   is missing, was changed after 受領 (signature), or is marked used (e.used = what used it) */
A.canUnreceive=function(s){
 if(!s)return {ok:false,why:'見つかりません。'};
 if(!GK.can('acct.receive'))return {ok:false,why:'「引継ぎの受領・差し戻し」は使えない設定になっています。'};
 if(s.state!=='received')return {ok:false,why:'受領していない版です。'};
 var E=A.ensure().entries,bad=[];
 (s.lines||[]).forEach(function(id,i){var e=GK.by(E,id);
  if(!e)bad.push('行「'+id+'」がありません');
  else if(e.used)bad.push(e.cat+' が「'+e.used+'」で使われています');
  else if(s.lineSig&&s.lineSig[i]!==sig(e))bad.push(e.cat+' の行が受領のあとで変更されています');});
 if(bad.length)return {ok:false,why:'「'+A.MEMO+'」の行が受領のあとで変わったため、取り消せません：'+bad.join('、')+'。'};
 return {ok:true,why:''};
};
A.unreceive=function(id,reason){
 var s=A.sub(id),c=A.canUnreceive(s);if(!c.ok)return {ok:false,msg:c.why};
 var why=cleanReason(reason);if(!why)return {ok:false,msg:'受領を取り消す理由を書いてください（例：区分を確認し直すため）。',field:'reason'};
 var a=A.ensure(),ids=(s.lines||[]).slice(),kept=clone(a.entries.filter(function(e){return ids.indexOf(e.id)>=0})),prevAct=clone(s.act),prevSig=clone(s.lineSig);
 a.entries=a.entries.filter(function(e){return ids.indexOf(e.id)<0});
 s.state='submitted';s.act=null;s.lines=[];delete s.lineSig;ev(s,'unreceive',why);
 var le=logIt('経理：'+X.monY(s.m)+'分の引継ぎ（第'+s.ver+'版）の受領を取り消し（理由：'+why.slice(0,60)+'）');save();
 return {ok:true,sub:s,removed:ids,undo:function(){
  var s2=A.sub(id);if(!s2||s2.state!=='submitted')return {ok:false,msg:'確認待ちの状態ではなくなっています。'};
  var a2=A.ensure();kept.forEach(function(e){if(!GK.by(a2.entries,e.id))a2.entries.push(clone(e))});
  s2.state='received';s2.act=prevAct;s2.lines=ids;s2.lineSig=prevSig;popEv(s2,'unreceive');unlog(le);save();return {ok:true};
 }};
};
/* the events of a version for the history: [{kind,label,at,by,reason}] (a record without hist: from at / act) */
A.events=function(s){
 var h=s.hist&&s.hist.length?s.hist:[{kind:'submit',at:s.at,by:s.by}].concat(s.act?[{kind:s.act.kind,at:s.act.at,by:s.act.by,reason:s.act.reason||''}]:[]);
 return h.map(function(x){return {kind:x.kind,label:A.EV[x.kind]||x.kind,at:x.at,by:x.by,reason:x.reason||''}});
};
/* open 差し戻し to-dos of the current person (or everyone) for sales.html */
A.returnedOpen=function(){return A.ensure().subs.filter(function(s){var l=A.latest(s.m);return s.state==='returned'&&l&&l.id===s.id})};

/* ---------- 経理: one month ---------- */
A.entries=function(m){return A.ensure().entries.filter(function(e){return e.m===m}).sort(function(a,b){return a.due<b.due?-1:a.due>b.due?1:(a.id<b.id?-1:1)})};
A.received=function(m){return A.ensure().subs.filter(function(s){return s.m===m&&s.state==='received'})[0]||null};
A.summary=function(m){
 var E=A.entries(m),inc=0,exp=0,unrec=0,unpaid=0;
 E.forEach(function(e){var v=e.neg?-e.amount:e.amount;if(e.type==='in')inc+=v;else exp+=v;if(!e.recon)unrec++;if(!e.paid)unpaid++});
 var r=A.received(m);
 return {inc:inc,exp:exp,diff:inc-exp,unrec:unrec,unpaid:unpaid,rental:r?{sub:r,totals:r.pkg.sales.totals}:null,waiting:A.waiting().length,status:A.status(m)};
};

/* ---------- samples (fictitious) ---------- */
/* company cashflows that are not rental (経理's own list): this month and last month */
function sampleEntries(){
 var c=X.cur(),pm=X.addMonth(c,-1),out=[],T=GK.TODAY;
 var rows=[['in','仲介手数料','東町 戸建の売買仲介（架空）','架空ホーム（株）',330000,'20'],['out','給与','全社','従業員（まとめて）',1200000,'25'],
  ['out','広告費','仕入れ部','架空ポータル（株）',55000,'25'],['out','事務所家賃','本社','架空ビル管理（株）',180000,'27'],['in','物件売却','南町 区分マンション（架空）','個人のお客様（架空）',18500000,'28']];
 [pm,c].forEach(function(m,k){rows.forEach(function(r,i){var due=m+'-'+r[5],done=due<=T;
  out.push({id:'AS-'+m.replace('-','')+'-'+(i+1),m:m,type:r[0],cat:r[1],project:r[2],partner:r[3],amount:k===1&&i===4?0:r[4],due:due,paid:done,recon:done&&k===0,memo:'',src:'sample'})})});
 return out.filter(function(e){return e.amount>0});
}
/* 9月 (last month): submitted by 佐藤 and 受領 by 田中, so 経理 already shows the rental lines */
function seedSample(a){
 var c=X.cur(),pm=X.addMonth(c,-1);if(!X.hasMonth(pm))return;
 seedOne(a,pm,false);
 seedHistory(a);
}
/* one received handover for month m (submitted by 佐藤 on the 5th of the next month, 受領 by 田中 on the 6th) */
function seedOne(a,m,demo){
 var nx=X.addMonth(m,1);
 var pkg=A.build(m,'');
 var un=pkg.remit.filter(function(r){return r.state==='fixed'&&r.net>0});
 pkg.note=X.mon(m)+'分です。'+(un.length?un.map(function(r){return r.owner+' 様の'+r.kind+'（'+GK.yen(r.net)+'）は明細を確定済みで、送金は'+GK.sd(r.payDate)+'の予定です'}).join('。')+'。':'送金はすべて済んでいます。')+(pkg.mf.bad?'':'MFとの食い違いはありません。')+(pkg.demo?'（見本：'+X.mon(m)+'の売上はデモの過去データのため、部屋ごとの明細は台帳から作った見本です）':'');
 var s={id:'ACS-'+m.replace('-',''),m:m,ver:1,state:'received',at:GK.addDays(nx+'-01',4)+' 17:40',by:'佐藤',byId:'s1',note:pkg.note,pkg:pkg,
  act:{kind:'receive',at:GK.addDays(nx+'-01',5)+' 10:05',by:'田中',byId:'s4'},lines:[],taskId:'',sample:true,
  hist:[{kind:'submit',at:GK.addDays(nx+'-01',4)+' 17:40',by:'佐藤',byId:'s1',reason:''},{kind:'receive',at:GK.addDays(nx+'-01',5)+' 10:05',by:'田中',byId:'s4',reason:''}]};
 if(demo)s.demoHist=true;
 var lines=A.linesOf(s);s.lines=lines.map(function(l){return l.id});s.lineSig=lines.map(sig);
 a.subs.push(s);lines.forEach(function(l){a.entries.push(l)});
}
/* DEMO history (added 2026-10-19): every DEMO 入出金 month (ganki-money.js seedHistory, closed, 送金済み) gets a received handover
   with its 自動反映 lines, so 経理 can be browsed back too. Only months with no handover yet; once per store (a.demoHist);
   an older stored db gets it in memory (saved with the next user action). The totals are the 管理部売上 demo history. */
function seedHistory(a){
 var c=X.cur();
 for(var k=X.DEMO_HIST||13;k>=2;k--){
  var m=X.addMonth(c,-k);
  if(!X.isDemoMonth||!X.isDemoMonth(m)||!X.month(m).closed)continue;
  if(a.subs.some(function(s){return s&&s.m===m}))continue;
  try{seedOne(a,m,true)}catch(e){if(window.console)console.error(e)}
 }
 a.demoHist=1;
}
})();
