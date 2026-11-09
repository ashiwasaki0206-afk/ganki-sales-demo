/* GANKI 管理部売上 (sales.html) — logic only. Load after ganki-data.js and ganki-money.js.
   All names and amounts are fictitious.

   Store: GK.db.sales (added 2026-10-19; created in memory when missing, saved with the first user action)
   {
     v:1,
     months:{'YYYY-MM':{manual:[{id,cat,region,prop,t,amount,at,by}], fixed:null|{at,by,snap}}},
     targets:{'YYYY-MM':{sales,units,occ}}   a month without its own targets uses the latest earlier ones
     raises:[{id,type:'更新'|'入れ替え'|'募集',unit,from,to,date,sample:true}]   DEMO examples (real ones are read from the leases)
     region:'関東'                             地域 for company lines with no property (振込手数料 …)
   }
   Formulas
     売上高   = 売上 column total (マスターリース賃料収入 in gross)
     粗利     = 売上高 − 費用 (マスターリース支払・修繕費（自社負担）・振込手数料の無料サービス・空室補填・その他支出)
     管理戸数 = rooms of every property managed at month end (受託・サブリース・自社所有)
     入居率   = rooms with a tenant at month end ÷ 管理戸数 (申込あり・入居予定 = vacant); 空室率 = 100% − 入居率 */
(function(){
var GK=window.GK;if(!GK||!GK.money)return;
var X=GK.money,Y=GK.sales={};
function clone(o){return o==null?o:JSON.parse(JSON.stringify(o))}
function nf(s){s=String(s==null?'':s);try{s=s.normalize('NFKC')}catch(e){}return s}
function now(){return GK.TODAY+' '+new Date().toTimeString().slice(0,5)}
function save(){GK.save()}
/* production category names (管理部売上) and the column each one goes to */
var CATS=[['管理委託手数料（通常額）','sales'],['管理委託手数料（初回送金時）','sales'],['更新費用','sales'],['駆け付け料','sales'],
 ['管理手数料の無料サービス','service'],['振込手数料の無料サービス','cost'],['修繕費（自社負担）','cost'],['修繕費（オーナー負担）','ref'],
 ['空室補填','cost'],['逆ザヤ','ref'],['マスターリース賃料収入','sales'],['マスターリース支払','cost'],
 ['自社物件 賃料収入','sales'],   /* new in this app (not a production category): rent of 自社所有 properties */
 ['その他売上','sales'],['その他支出','cost']];
Y.NEW_CATS=['自社物件 賃料収入'];
Y.CATS=CATS;
Y.MANUAL=['駆け付け料','空室補填','その他売上','その他支出'];
Y.colOf=function(cat){for(var i=0;i<CATS.length;i++)if(CATS[i][0]===cat)return CATS[i][1];return 'sales'};
Y.REGIONS=['関東','関西','九州','その他'];
var PREF={'関東':/^(東京都|神奈川県|埼玉県|千葉県|茨城県|栃木県|群馬県)/,'関西':/^(大阪府|京都府|兵庫県|奈良県|滋賀県|和歌山県)/,'九州':/^(福岡県|佐賀県|長崎県|熊本県|大分県|宮崎県|鹿児島県|沖縄県)/};
Y.regionOfAddr=function(addr){var a=nf(addr).trim();for(var k in PREF)if(PREF[k].test(a))return k;return 'その他'};
Y.regionOf=function(propId){var p=propId&&GK.prop(propId);return p?Y.regionOfAddr(p.addr):Y.ensure().region};

/* ---------- store ---------- */
function seedRaises(){
 if(GK.LOCAL)return []; /* 社内検証用のデータ: no 見本 examples (real ones are read from the leases) */
 var c=X.cur(),pm=X.addMonth(c,-1),d=function(m,day){return m+'-'+day};
 /* DEMO: rent-increase examples (this month and last month, each type) */
 return [
  {id:'RS1',type:'更新',unit:'GK-0518-302',from:83000,to:85000,date:d(c,'05'),sample:true},
  {id:'RS2',type:'入れ替え',unit:'GK-0457-203',from:65000,to:68000,date:d(c,'01'),sample:true},
  {id:'RS3',type:'募集',unit:'GK-0123-305',from:72000,to:74000,date:d(c,'08'),sample:true},
  {id:'RS4',type:'更新',unit:'GK-0123-203',from:70000,to:72000,date:d(pm,'20'),sample:true},
  {id:'RS5',type:'入れ替え',unit:'GK-0311-201',from:57000,to:59000,date:d(pm,'01'),sample:true},
  {id:'RS6',type:'募集',unit:'GK-0518-502',from:95000,to:98000,date:d(pm,'12'),sample:true}
 ];
}
Y.ensure=function(){
 var d=GK.db;
 if(!d.sales||typeof d.sales!=='object'||Array.isArray(d.sales))d.sales={v:1,months:{},targets:{},raises:seedRaises(),region:'関東'};
 var s=d.sales;
 if(!s.months||typeof s.months!=='object')s.months={};
 if(!s.targets||typeof s.targets!=='object')s.targets={};
 if(!Array.isArray(s.raises))s.raises=[];
 if(Y.REGIONS.indexOf(s.region)<0)s.region='関東';
 return s;
};
function smonth(m){var s=Y.ensure(),o=s.months[m];if(!o||typeof o!=='object')o=s.months[m]={manual:[],fixed:null};if(!Array.isArray(o.manual))o.manual=[];if(o.fixed===undefined)o.fixed=null;return o}
Y.smonth=smonth;
/* months shown (2026-10-19, newest first): from the earliest management start (property since / lease start) to this month.
   Months before the money / sales history: 管理戸数・入居率・空室率・賃上げ from the ledger, 売上 「記録はありません」 (kind 'none') */
Y.firstMonth=function(){return GK.firstManagedMonth()};
Y.monthList=function(){return GK.monthRange(Y.firstMonth(),X.cur()).reverse()};
Y.monthHint=function(){if(GK.LOCAL)return '管理を始めた月（'+GK.monthText(Y.firstMonth())+'）から今月まで選べます。管理戸数・入居率・賃上げは台帳から、売上は記録がある月（入出金・確定済み）だけ出します。';return '管理を始めた月（'+GK.monthText(Y.firstMonth())+'）から今月まで選べます。管理戸数・入居率・賃上げは台帳から、売上は記録がある月（入出金・確定済み・デモの過去データ）だけ出します。'};
Y.moneyClosed=function(m){return X.hasMonth(m)&&!!X.month(m).closed};
Y.readOnly=function(m){return Y.moneyClosed(m)||!!smonth(m).fixed};

/* ---------- 管理戸数 / 入居率 (from the ledger, any month) ---------- */
function propsAt(m){var z=X.lastDay(m);return GK.db.props.filter(function(p){return (!p.since||p.since<=z)&&!(p.ended&&p.ended<=z)})}
function occupiedAt(unitId,day){
 return GK.db.leases.some(function(l){
  if(l.unit!==unitId||!(l.status==='有効'||l.status==='終了'))return false;
  if(l.start&&l.start>day)return false;
  if(l.end&&l.end<day)return false;
  if(l.notice&&l.notice.date&&l.notice.date<=day&&l.status==='有効')return false;
  return true;
 });
}
Y.units=function(m){
 var S=X.setFor(m),ps=propsAt(m),by={'受託':0,'サブリース':0,'自社':0},total=0,a=m+'-01',z=X.lastDay(m),added=[],removed=[];
 ps.forEach(function(p){var n=(p.rooms||[]).length;total+=n;by[X.treat(p.id,S)]+=n;if(p.since&&p.since>=a&&p.since<=z)added.push({prop:p.id,name:p.n,rooms:n,why:p.takeover?'管理の引継ぎ':'新しく管理'})});
 GK.db.props.forEach(function(p){if(p.ended&&p.ended>=a&&p.ended<=z)removed.push({prop:p.id,name:p.n,rooms:(p.rooms||[]).length,why:'管理の解約'})});
 return {total:total,by:by,added:added,removed:removed,plus:added.reduce(function(s,x){return s+x.rooms},0),minus:removed.reduce(function(s,x){return s+x.rooms},0)};
};
Y.occ=function(m){
 var z=X.lastDay(m),rooms=0,occ=0,vac=[];
 propsAt(m).forEach(function(p){(p.rooms||[]).forEach(function(no){var id=p.id+'-'+no;rooms++;if(occupiedAt(id,z))occ++;else vac.push(id)})});
 var rate=rooms?Math.round(occ/rooms*1000)/10:0;
 return {rooms:rooms,occupied:occ,vacant:rooms-occ,vacantIds:vac,rate:rate,vrate:rooms?Math.round((100-rate)*10)/10:0};
};

/* ---------- 賃上げ成功例 ---------- */
function prevLease(l){return GK.db.leases.filter(function(x){return x.unit===l.unit&&x.id!==l.id&&x.status==='終了'&&x.start&&l.start&&x.start<l.start}).sort(function(a,b){return a.start<b.start?1:-1})[0]||null}
Y.raises=function(m){
 var out=[],a=m+'-01',z=X.lastDay(m),seen={};
 GK.db.leases.forEach(function(l){
  /* 更新のときの値上げ: contracts.html keeps prevRent on each renewal */
  (l.renewals||[]).forEach(function(r,i){var from=r.prevRent!=null?+r.prevRent:(i>0?+l.renewals[i-1].rent:null),to=+r.rent;
   if(from&&to>from&&r.at>=a&&r.at<=z)out.push({id:'R:'+l.id+':'+i,type:'更新',unit:l.unit,from:from,to:to,date:r.at})});
  /* 入れ替えのときの値上げ: a new contract with a higher rent than the tenant before */
  /* the day the contract was agreed (turnover / register / 契約を確定 save agreedAt; older leases: the start date) */
  var ag=l.agreedAt||l.start;
  if((l.status==='有効'||l.status==='入居予定')&&!l.takeover&&ag&&ag>=a&&ag<=z){
   var p=prevLease(l),u=GK.unit(l.unit),since=p?(p.end||''):'';
   /* 募集中の値上げ: the 募集家賃 was raised while the room was empty (properties.html keeps unit.askHist) and the contract is at that rent */
   var hs=((u&&u.askHist)||[]).filter(function(h){return h.date<=ag&&(!since||h.date>=since)});
   var last=hs[hs.length-1],base=p?+p.rent:(hs[0]?+hs[0].from:0);
   if(last&&+l.rent===+last.to&&base&&+l.rent>base){out.push({id:'A:'+l.id,type:'募集',unit:l.unit,from:base,to:+l.rent,date:ag});seen[l.unit+'|募集']=1}
   else if(p&&+l.rent>+p.rent){out.push({id:'T:'+l.id,type:'入れ替え',unit:l.unit,from:+p.rent,to:+l.rent,date:ag});seen[l.unit+'|入れ替え']=1}
  }
 });
 /* DEMO examples (見本) only where the real history has nothing for that room and kind */
 Y.ensure().raises.forEach(function(r){if(r.date>=a&&r.date<=z&&!seen[r.unit+'|'+r.type]&&!out.some(function(x){return x.unit===r.unit&&x.type===r.type}))out.push(clone(r))});
 out.forEach(function(r){r.diff=r.to-r.from;r.pct=r.from?Math.round(r.diff/r.from*1000)/10:0;r.year=r.diff*12;r.label=GK.roomLabel(r.unit);r.typeLabel={'更新':'更新のときの値上げ','入れ替え':'入れ替えのときの値上げ','募集':'募集中の値上げ'}[r.type]||r.type});
 return out.sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:0});
};

/* ---------- 月次売上 (live, from the confirmed 入出金) ---------- */
Y.compute=function(m){
 var S=X.setFor(m),items=[],add=function(cat,amt,o){if(!amt)return;o=o||{};items.push({cat:cat,col:Y.colOf(cat),amount:Math.round(amt),region:o.region||Y.regionOf(o.prop),prop:o.prop||'',unit:o.unit||'',label:o.label||'',src:o.src||'',manual:o.manual||''})};
 var propOfUnit=function(u){var x=GK.unit(u);return x?x.prop:''};
 var mlIn={};
 var rowsOf=function(mm){return X.hasMonth(mm)?X.rows(mm):[]};
 /* cash received / paid in month m (前受け lines count in the month they are for, like the owner statements) */
 var months=Object.keys(X.ensure().months).filter(function(k){return k<=m});
 months.forEach(function(mm){rowsOf(mm).forEach(function(x){
  if(x.state!=='ok')return;
  x.link.allocs.forEach(function(a){
   var p=a.unit?propOfUnit(a.unit):(a.prop||''),t=p?X.treat(p,S):'',src=GK.sd(x.row.date)+' '+x.row.name;
   if(mm!==m&&!(a.adv&&a.month===m))return;
   if(mm===m&&a.adv&&a.month>m)return;
   if(x.dir==='in'){
    if(X.RENT_USES[a.use]&&t==='サブリース'){add('マスターリース賃料収入',a.amount,{prop:p,unit:a.unit,label:GK.roomLabel(a.unit)+' '+X.monY(a.month)+'分 '+a.use,src:src});mlIn[p]=(mlIn[p]||0)+a.amount}
    else if(X.RENT_USES[a.use]&&t==='自社')add('自社物件 賃料収入',a.amount,{prop:p,unit:a.unit,label:GK.roomLabel(a.unit)+' '+X.monY(a.month)+'分 '+a.use,src:src});
    else if((a.use==='更新料'||a.use==='礼金')&&p&&(t!=='受託'||X.renewOf(p,S)==='company'))add(a.use==='更新料'?'更新費用':'その他売上',a.amount,{prop:p,unit:a.unit,label:(a.use==='礼金'?'礼金 ':'更新料 ')+GK.roomLabel(a.unit),src:src});
   }else{
    if(a.use==='修繕費'&&p)add(t==='受託'?'修繕費（オーナー負担）':'修繕費（自社負担）',a.amount,{prop:p,unit:a.unit,label:GK.roomLabel(a.unit)+' '+X.allocText(a),src:src});
    if(a.use==='振込手数料')add('振込手数料の無料サービス',a.amount,{label:'振込手数料（会社負担）',src:src});
   }
  });
 })});
 /* 管理委託手数料 from the owner statements (税抜) */
 X.ownersFor(m).forEach(function(o){
  var st=X.shown(m,o.id);if(!st||!st.fees)return;
  st.fees.forEach(function(f){var p=GK.prop(f.prop),first=p&&p.since&&p.since.slice(0,7)===m;
   if(f.free)add('管理手数料の無料サービス',f.would||0,{prop:f.prop,label:f.name+' '+f.basis+'（本来 '+GK.yen(f.would||0)+'）',src:o.n+' 様の明細'});
   else add(first?'管理委託手数料（初回送金時）':'管理委託手数料（通常額）',f.fee-(f.inTax||0),{prop:f.prop,label:f.name+' '+f.basis+(f.inTax?'（税抜にして）':''),src:o.n+' 様の明細'});
  });
 });
 /* マスターリース支払 = the month's 借上賃料; 逆ザヤ when it is more than the rent received */
 X.leaseOwners(m).forEach(function(o){var st=X.leaseStatement(m,o.id);(st?st.items:[]).forEach(function(x){
  add('マスターリース支払',x.amount,{prop:x.prop,label:x.name+' 借上賃料（'+o.n+' 様）',src:X.monY(m)+'分'});
  var inc=mlIn[x.prop]||0;if(x.amount>inc)add('逆ザヤ',x.amount-inc,{prop:x.prop,label:x.name+'：借上賃料 '+GK.yen(x.amount)+' − 入った家賃 '+GK.yen(inc),src:'参考（確認済みの入金で計算）'});
 })});
 smonth(m).manual.forEach(function(x){add(x.cat,x.amount,{prop:x.prop,region:x.region,label:x.t,src:'手入力（'+x.by+'）',manual:x.id})});
 return Y.sum(items);
};
Y.sum=function(items){
 var cats=CATS.map(function(c){var it=items.filter(function(x){return x.cat===c[0]});return {cat:c[0],col:c[1],amount:it.reduce(function(s,x){return s+x.amount},0),items:it}});
 var reg={};Y.REGIONS.forEach(function(r){reg[r]={sales:0,cost:0,service:0,ref:0}});
 items.forEach(function(x){(reg[x.region]=reg[x.region]||{sales:0,cost:0,service:0,ref:0})[x.col]+=x.amount});
 var t={sales:0,cost:0,service:0,ref:0};items.forEach(function(x){t[x.col]+=x.amount});
 t.gross=t.sales-t.cost;Object.keys(reg).forEach(function(k){reg[k].gross=reg[k].sales-reg[k].cost});
 return {items:items,cats:cats,regions:reg,totals:t};
};

/* ---------- DEMO history (months before this one) ----------
   Fictitious, deterministic numbers for the 13 previous months, built around this month's full-month estimate
   (fees at today's occupancy, sublease and own rents at month end, 借上賃料), so they look like the same company.
   管理戸数・入居率 are never demo: they come from the ledger for every month. */
Y.estimate=function(){
 var c=X.cur(),S=X.settings(),z=X.lastDay(c),sales=0,cost=0;
 GK.db.props.forEach(function(p){var t=X.treat(p.id,S);
  if(t==='受託'){var f=X.feeOf(p.id,S);sales+=f.method==='room'?f.amount*X.occupied(p.id,c):0}
  else (p.rooms||[]).forEach(function(no){var id=p.id+'-'+no,l=GK.activeLease(id);if(l&&occupiedAt(id,z))sales+=(+l.rent||0)+(+l.fee||0)});
  if(t==='サブリース')cost+=X.subleaseOf(p.id,S).amount;
 });
 return {sales:sales,cost:cost+15000};
};
Y.history=function(m){
 if(GK.LOCAL)return null; /* 社内検証用のデータ: no DEMO history (a month without records says 「記録はありません」) */
 var k=0,c=X.cur();while(k<=14&&X.addMonth(c,-k)!==m)k++;
 if(k<1||k>13)return null;
 var e=Y.estimate(),w=[0,3,-2,4,-1,2,-3,1,3,-2,0,2,-1,1][k]/100,trend=1-0.004*k;
 var sales=Math.round(e.sales*(trend+w)/1000)*1000,cost=Math.round(e.cost*(1+w/2)/1000)*1000;
 var RC=[0,2,1,3,0,2,1,2,3,1,0,2,1,1][k];
 return {demo:true,totals:{sales:sales,cost:cost,gross:sales-cost,service:k%3===0?3000:0,ref:0},raises:{count:RC,year:RC*30000+(k%4)*6000}};
};

/* ---------- one month as shown ---------- */
Y.month=function(m){
 var o0=Y.ensure().months[m],sm=o0&&typeof o0==='object'?smonth(m):{manual:[],fixed:null},c=X.cur(),r; /* only looking does not add the month */
 if(sm.fixed&&sm.fixed.snap){r=clone(sm.fixed.snap);r.kind='fixed'}
 else if(m===c||m>c){r=Y.compute(m);r.kind='live'}
 else{var h=Y.history(m);if(h){r={kind:'demo',totals:h.totals,cats:null,regions:null,items:[],raisesDemo:h.raises}}
  else if((X.hasData&&X.hasData(m))||sm.manual.length){r=Y.compute(m);r.kind='live'}
  /* 2026-10-19: an older month with no money / sales record: no 売上 (not zeros on the page) */
  else r={kind:'none',totals:{sales:0,cost:0,gross:0,service:0,ref:0},cats:null,regions:null,items:[]}}
 return r;
};
/* a month whose 売上 we can show: this month, a confirmed month, one of the demo history months, or a month with 入出金 data */
Y.hasData=function(m){var sm=Y.ensure().months[m]||{};return m===X.cur()||!!sm.fixed||!!Y.history(m)||!!(X.hasData&&X.hasData(m))||(Array.isArray(sm.manual)&&sm.manual.length>0)};
Y.raiseSum=function(m){
 var M=Y.month(m);
 if(M.kind==='demo'){var dl=Y.raises(m);if(dl.length)return {count:dl.length,year:dl.reduce(function(s,x){return s+x.year},0),list:dl,demo:false};return {count:M.raisesDemo.count,year:M.raisesDemo.year,list:[],demo:true}}
 var l=M.kind==='fixed'&&M.raiseList?M.raiseList:Y.raises(m);
 return {count:l.length,year:l.reduce(function(s,x){return s+x.year},0),list:l,demo:false};
};
Y.target=function(m){var t=Y.ensure().targets,ks=Object.keys(t).filter(function(k){return k<=m}).sort();if(t[m])return t[m];if(ks.length)return t[ks[ks.length-1]];var e=Y.estimate();return {sales:Math.round(e.sales*1.02/10000)*10000,units:50,occ:95,auto:true}};
function cmp(cur,prev,mode){if(prev==null||cur==null)return null;var d=cur-prev;return mode==='pt'?{diff:Math.round(d*10)/10,pt:true}:{diff:d,pct:prev?Math.round(d/prev*1000)/10:null}}
/* everything the meeting needs for month m */
Y.kpi=function(m){
 var pm=X.addMonth(m,-1),ym=X.addMonth(m,-12),t=Y.target(m),f=Y.firstMonth();
 /* 2026-10-19: a comparison month before the earliest management start (or with no rooms) cannot be compared → null (shown 「—」) */
 var inP=pm>=f,inY=ym>=f;
 var mm=function(x){return Y.hasData(x)?Y.month(x).totals:null};
 var M0=Y.month(m),none=M0.kind==='none',cur=M0.totals,prv=none?null:mm(pm),yoy=none?null:mm(ym);
 var u=Y.units(m),up=inP?Y.units(pm):null,uy=inY?Y.units(ym):null,o=Y.occ(m),op=inP?Y.occ(pm):null,oy=inY?Y.occ(ym):null,rs=Y.raiseSum(m),rp=inP?Y.raiseSum(pm):null,ry=inY?Y.raiseSum(ym):null;
 if(op&&!op.rooms)op=null;if(oy&&!oy.rooms)oy=null;if(up&&!up.total)up=null;if(uy&&!uy.total)uy=null;
 var hasRooms=o.rooms>0;
 return {m:m,target:t,first:f,
  sales:{v:none?null:cur.sales,gross:none?null:cur.gross,cost:none?null:cur.cost,none:none,prev:none?null:cmp(cur.sales,prv&&prv.sales),yoy:none?null:cmp(cur.sales,yoy&&yoy.sales),grossPrev:none?null:cmp(cur.gross,prv&&prv.gross),ach:!none&&t.sales?Math.round(cur.sales/t.sales*1000)/10:null,kind:M0.kind},
  units:{v:u.total,by:u.by,added:u.added,removed:u.removed,plus:u.plus,minus:u.minus,prev:up?cmp(u.total,up.total):null,yoy:uy?cmp(u.total,uy.total):null,ach:t.units?Math.round(u.total/t.units*1000)/10:null},
  occ:{v:o.rate,rooms:o.rooms,occupied:o.occupied,prev:op&&hasRooms?cmp(o.rate,op.rate,'pt'):null,yoy:oy&&hasRooms?cmp(o.rate,oy.rate,'pt'):null,ach:t.occ&&hasRooms?Math.round(o.rate/t.occ*1000)/10:null,gap:t.occ&&hasRooms?Math.round((o.rate-t.occ)*10)/10:null},
  vac:{v:o.vrate,n:o.vacant,ids:o.vacantIds,prev:op&&hasRooms?cmp(o.vrate,op.vrate,'pt'):null,yoy:oy&&hasRooms?cmp(o.vrate,oy.vrate,'pt'):null,target:t.occ?Math.round((100-t.occ)*10)/10:null},
  raises:{count:rs.count,year:rs.year,list:rs.list,prev:rp?cmp(rs.count,rp.count):null,yoy:ry?cmp(rs.count,ry.count):null}};
};
function sign(n,unit){return (n>0?'+':n<0?'−':'±')+Math.abs(n).toLocaleString()+(unit||'')}
/* a comparison that cannot be computed (no data that month / before the management start) → 「—」 (2026-10-19; was 「データなし」) */
Y.cmpText=function(c,kind){if(!c)return '—';if(c.pt)return sign(c.diff,'ポイント');return (kind==='yen'?(c.diff>=0?'+':'−')+GK.yen(Math.abs(c.diff)).replace('−',''):sign(c.diff,kind||''))+(c.pct!=null?'（'+(c.pct>0?'+':'')+c.pct+'%）':'')};
/* 読み上げる文章 */
Y.speech=function(m){
 var K=Y.kpi(m),L=[],mo=X.monY(m),ct=function(c,k){return c?Y.cmpText(c,k):'データなし'};
 L.push(mo+'の管理部の報告です。');
 if(K.sales.none)L.push('この月の売上の記録はありません。');
 else L.push('売上高は'+GK.yen(K.sales.v)+'、うち粗利は'+GK.yen(K.sales.gross)+'です。前月比は'+ct(K.sales.prev,'yen')+'、前年同月比は'+ct(K.sales.yoy,'yen')+(K.sales.ach!=null?'、目標'+GK.yen(K.target.sales)+'に対して達成率'+K.sales.ach+'%':'')+'でした。');
 L.push('管理戸数は'+K.units.v+'戸（管理受託'+K.units.by['受託']+'戸・サブリース'+K.units.by['サブリース']+'戸・自社所有'+K.units.by['自社']+'戸）で、'+(K.units.prev?'前月から'+sign(K.units.prev.diff,'戸')+'です':'前月との比較はできません')+(K.units.plus?'（引継ぎなどで +'+K.units.plus+'戸）':'')+(K.units.minus?'（解約で −'+K.units.minus+'戸）':'')+'。');
 L.push('月末の入居率は'+K.occ.v+'%（前月比'+ct(K.occ.prev)+'）、空室率は'+K.vac.v+'%で、空室は'+K.vac.n+'室です'+(K.occ.gap!=null?'。目標の入居率'+K.target.occ+'%まで'+(K.occ.gap>=0?'達成しています':'あと'+Math.abs(K.occ.gap)+'ポイントです'):'')+'。');
 if(K.raises.count){var top=K.raises.list.slice().sort(function(a,b){return b.year-a.year}).slice(0,3);
  L.push('賃上げは'+K.raises.count+'件で、年間の増収は'+GK.yen(K.raises.year)+'です。'+(top.length?'主な例は、'+top.map(function(r){return r.label+'（'+r.typeLabel+'、'+GK.yen(r.from)+'から'+GK.yen(r.to)+'）'}).join('、')+'です。':''));}
 else L.push('賃上げの成功例は、今月はありませんでした。');
 L.push('以上です。');
 return L.join('\n');
};

/* ---------- manual lines / 確定 / targets (undo by id) ---------- */
Y.addManual=function(m,v){
 if(Y.readOnly(m))return {ok:false,msg:X.mon(m)+'は締め済み（または確定済み）なので、足せません。'};
 var cat=v.cat,amt=Math.round(+nf(v.amount).replace(/[^\d]/g,''))||0,t=String(v.t||'').replace(/\s+/g,' ').trim();
 if(Y.MANUAL.indexOf(cat)<0)return {ok:false,msg:'区分を選んでください。',field:'cat'};
 if(!t)return {ok:false,msg:'内容を書いてください（例：駆け付け 10/12 ガンキハイツ南 203）。',field:'t'};
 if(!(amt>0))return {ok:false,msg:'金額を1円以上で入れてください。',field:'amount'};
 var region=Y.REGIONS.indexOf(v.region)>=0?v.region:(v.prop?Y.regionOf(v.prop):Y.ensure().region);
 var x={id:'S'+Date.now().toString(36)+Math.floor(Math.random()*1000),cat:cat,region:region,prop:v.prop&&GK.prop(v.prop)?v.prop:'',t:t.slice(0,80),amount:amt,at:now(),by:GK.ME};
 smonth(m).manual.push(x);GK.log('管理部売上に追加：'+X.monY(m)+' '+cat+' '+GK.yen(amt)+'（'+x.t+'）');var le=GK.db.log[0];save();
 return {ok:true,line:x,undo:function(){var s=smonth(m);s.manual=s.manual.filter(function(y){return y.id!==x.id});GK.db.log=GK.db.log.filter(function(y){return y!==le&&!(y.at===le.at&&y.t===le.t)});save()}};
};
Y.removeManual=function(m,id){
 if(Y.readOnly(m))return {ok:false,msg:X.mon(m)+'は締め済み（または確定済み）なので、消せません。'};
 var s=smonth(m),i=-1;s.manual.forEach(function(y,k){if(y.id===id)i=k});if(i<0)return {ok:false,msg:'その行が見つかりません。'};
 var x=s.manual.splice(i,1)[0];save();
 return {ok:true,undo:function(){var s2=smonth(m);if(!s2.manual.some(function(y){return y.id===x.id})){s2.manual.splice(Math.min(i,s2.manual.length),0,x)}save()}};
};
Y.fix=function(m){
 var s=smonth(m);if(s.fixed)return {ok:false,msg:'もう確定しています。'};
 if(X.hasMonth(m)&&!X.month(m).closed)return {ok:false,msg:'先に「入出金」で'+X.mon(m)+'を締めてください。締めた月の売上だけ確定できます。'};
 if(Y.month(m).kind==='demo')return {ok:false,msg:'デモの過去データは確定できません。'};
 if(Y.month(m).kind==='none')return {ok:false,msg:X.monY(m)+'の売上の記録はありません（確定するものがありません）。'};
 var snap=Y.compute(m);snap.raiseList=Y.raises(m);
 s.fixed={at:GK.TODAY,by:GK.ME,snap:snap};GK.log('管理部売上：'+X.monY(m)+'を確定（売上高 '+GK.yen(snap.totals.sales)+'）');save();
 return {ok:true,undo:function(){smonth(m).fixed=null;save()}};
};
Y.unfix=function(m){var s=smonth(m),prev=clone(s.fixed);if(!prev)return {ok:false,msg:'確定していません。'};s.fixed=null;GK.log('管理部売上：'+X.monY(m)+'の確定を取り消し');save();return {ok:true,undo:function(){smonth(m).fixed=prev;save()}}};
Y.setTarget=function(m,v){
 var sales=+nf(v.sales).replace(/[^\d]/g,''),units=+nf(v.units).replace(/[^\d]/g,''),occ=+nf(v.occ).replace(/[^\d.]/g,'');
 if(!(sales>0))return {ok:false,msg:'売上高の目標を入れてください。',field:'sales'};
 if(!(units>0))return {ok:false,msg:'管理戸数の目標を入れてください。',field:'units'};
 if(!(occ>0&&occ<=100))return {ok:false,msg:'入居率の目標は0〜100%で入れてください。',field:'occ'};
 var s=Y.ensure(),had=Object.prototype.hasOwnProperty.call(s.targets,m),prev=clone(s.targets[m]);
 s.targets[m]={sales:sales,units:units,occ:occ};GK.log('管理部の目標を変更：'+X.monY(m)+'（売上高 '+GK.yen(sales)+'・管理戸数 '+units+'戸・入居率 '+occ+'%）');save();
 return {ok:true,undo:function(){var s2=Y.ensure();if(had)s2.targets[m]=prev;else delete s2.targets[m];save()}};
};
})();
