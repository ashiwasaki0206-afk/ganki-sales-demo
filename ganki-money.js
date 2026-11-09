/* GANKI 入出金 (money.html + the home block) — logic only, no DOM. Load after ganki-data.js.
   All names, accounts and amounts are fictitious.

   Store: GK.db.money (added 2026-10-19; an older stored db has no such key: GK.money.ensure() adds it in memory
   with the sample months, saved with the first user action like any other change)
   {
     v:1,
     settings:{
       treat:{propId:'受託'|'サブリース'|'自社'}          会計の扱い (missing = 受託)
       map:{'受託'|'サブリース'|'自社':{用途:[勘定科目, 補助科目, 部門]}}   the side that is not the bank account;
            ［オーナー名］［物件名］［口座名］ are filled in per room
       bankAcct:'普通預金', bankName:'楽天銀行 家賃口座'   the bank side (補助科目 = 口座名)
       remitFee:0                                         振込手数料 taken from the owner (0 = 会社負担)
       remitDay:{ownerId:25}                              送金予定日 = 翌月のこの日 (missing = 25)
       itaku:{code,name,bank,bankKana,branch,branchKana,type,acct}   総合振込の委託者 (fictitious)
     },
     months:{'YYYY-MM':{
       bank:[{id,date,amount(+入金/−出金),name,bal|null,key}],
       mf:[{id,no,date,dr:{acct,sub,dept,amt},cr:{acct,sub,dept,amt},memo}],
       links:{rowId:{allocs:[{unit,lease,month,use,amount,charge?,owner?,repair?,adv?}], state:'auto'|'ok'|'none'|'skip',
                     reasons:[], conf:'high'|'mid'|'', by, at, applied:[{charge,amt}], repairs:[id], skipReason, auto:{allocs,reasons,conf}}},
       closed:null|{at,by,settings}, closeLog:[{at,by,act,reason}],
       remit:{ownerId:{state:'draft'|'fixed'|'sent', snap, fixedAt, fixedBy, sentAt, sentBy}},
       imports:[{kind:'bank'|'mf', at, by, file, count, from, to, account, sample}],
       sample:{bank:bool, mf:bool}
     }}
   }
   Every mutation looks records up again by id (GK.db may have been replaced by another tab's save) and returns an undo. */
(function(){
var GK=window.GK;if(!GK)return;
var X=GK.money={};
var USES=['家賃','共益費','更新料','敷金','礼金','修繕費','オーナー送金','借上賃料','管理手数料','振込手数料','その他'];
var ROOM_USES={'家賃':1,'共益費':1,'更新料':1,'敷金':1,'礼金':1,'修繕費':1};
var RENT_USES={'家賃':1,'共益費':1};
var TREATS=[['受託','管理受託'],['サブリース','サブリース'],['自社','自社所有']];
var OWN='［オーナー名］',PROP='［物件名］',ACC='［口座名］';
X.USES=USES;X.ROOM_USES=ROOM_USES;X.RENT_USES=RENT_USES;X.TREATS=TREATS;X.TOKENS=[OWN,PROP,ACC];
function clone(o){return o==null?o:JSON.parse(JSON.stringify(o))}
function pad(n){return String(n).padStart(2,'0')}
function nf(s){s=String(s==null?'':s);try{s=s.normalize('NFKC')}catch(e){}return s}
function now(){return GK.TODAY+' '+new Date().toTimeString().slice(0,5)}
X.clone=clone;
/* save, keeping the sidebar count (GK.db.money.badge) for the pages that do not load this file */
function save(){try{var r=GK.db.money;if(r&&typeof r==='object')r.badge=X.badge()}catch(e){}GK.save()}

/* ---------- months ---------- */
X.cur=function(){return GK.TODAY.slice(0,7)};
X.addMonth=function(m,n){var y=+m.slice(0,4),mo=+m.slice(5,7)-1+n;y+=Math.floor(mo/12);mo=((mo%12)+12)%12;return y+'-'+pad(mo+1)};
X.mon=function(m){return (+String(m).slice(5,7))+'月'};
X.monY=function(m){return (String(m).slice(0,4)!==GK.TODAY.slice(0,4)?String(m).slice(0,4)+'年':'')+(+String(m).slice(5,7))+'月'};
X.lastDay=function(m){return GK.iso(new Date(+m.slice(0,4),+m.slice(5,7),0))};

/* ---------- settings ---------- */
function defMap(){
 var u={
  '受託':{'家賃':['預り金',OWN,PROP],'共益費':['預り金',OWN,PROP],'更新料':['預り金',OWN,PROP],'敷金':['預り金','敷金',PROP],'礼金':['預り金',OWN,PROP],
   '修繕費':['預り金',OWN,PROP],'オーナー送金':['預り金',OWN,''],'管理手数料':['売上高','管理手数料',''],'振込手数料':['支払手数料','',''],'その他':['仮受金','','']},
  'サブリース':{'家賃':['売上高','賃貸料収入',PROP],'共益費':['売上高','共益費収入',PROP],'更新料':['売上高','更新料収入',PROP],'敷金':['預り敷金','',PROP],'礼金':['売上高','礼金収入',PROP],
   '修繕費':['修繕費','',PROP],'オーナー送金':['支払家賃',OWN,PROP],'管理手数料':['売上高','管理手数料',''],'振込手数料':['支払手数料','',''],'その他':['仮受金','','']}
 };
 /* 管理受託 with 更新料・礼金 = 会社の収入 (per property, settings.renew) */
 u['受託']['更新料（会社の収入）']=['売上高','更新事務手数料',PROP];u['受託']['礼金（会社の収入）']=['売上高','礼金収入',PROP];
 u['サブリース']['更新料（会社の収入）']=clone(u['サブリース']['更新料']);u['サブリース']['礼金（会社の収入）']=clone(u['サブリース']['礼金']);
 u['自社']=clone(u['サブリース']);
 /* サブリースの借上賃料 (paid to the owner every month) */
 TREATS.forEach(function(t){u[t[0]]['借上賃料']=['支払家賃',OWN,PROP]});
 return u;
}
X.defMap=defMap;
var MAP_KEYS=USES.concat(['更新料（会社の収入）','礼金（会社の収入）']);
X.MAP_KEYS=MAP_KEYS;
function defSettings(){
 /* 社内検証用のデータ (GK.LOCAL): no demo property / owner keys — every property 管理受託, the standard 手数料, 送金日 25;
    the 総合振込 委託者 stays the fictitious example until it is entered on the 設定 tab */
 if(GK.LOCAL)return {treat:{},map:defMap(),bankAcct:'普通預金',bankName:'家賃口座',remitFee:0,remitDay:{},fee:{},feeFree:{},renew:{},sublease:{},
  itaku:{code:'0000000000',name:'ｶ)ｹﾝｼｮｳﾖｳ',bank:'0000',bankKana:'ｹﾝｼｮｳ',branch:'000',branchKana:'ｹﾝｼｮｳ',type:'1',acct:'0000000'}};
 return {treat:{'GK-0123':'受託','GK-0457':'受託','GK-0311':'サブリース','GK-0518':'自社'},map:defMap(),bankAcct:'普通預金',bankName:'楽天銀行 家賃口座',
  remitFee:0,remitDay:{o1:10,o2:10},
  fee:{},                                   /* propId:{method:'room'|'pct', amount, pct, tax:'ex'|'in'} (missing fields: X.feeOf defaults) */
  feeFree:{o3:'2027-03'},                   /* ownerId:'YYYY-MM' 手数料なしの期間（この月まで） */
  renew:{'GK-0123':'owner','GK-0457':'company'},   /* 更新料・礼金: owner = オーナーに送金する / company = 会社の収入にする (管理受託だけ) */
  sublease:{'GK-0311':{amount:300000,owner:'o2'}}, /* サブリース: 毎月の借上賃料と払う相手 */
  itaku:{code:'0000012345',name:'ｶ)ｶﾞﾝｷ',bank:'0036',bankKana:'ﾗｸﾃﾝ',branch:'999',branchKana:'ﾃﾞﾓ',type:'1',acct:'1234567'}};
}
X.defSettings=defSettings;
function fixSettings(s){
 var d=defSettings();
 if(!s||typeof s!=='object')return d;
 if(!s.treat||typeof s.treat!=='object')s.treat=d.treat;
 if(!s.map||typeof s.map!=='object')s.map=d.map;
 TREATS.forEach(function(t){if(!s.map[t[0]])s.map[t[0]]=d.map[t[0]];MAP_KEYS.forEach(function(u){if(!Array.isArray(s.map[t[0]][u]))s.map[t[0]][u]=d.map[t[0]][u]})});
 ['fee','feeFree','renew','sublease'].forEach(function(k){if(!s[k]||typeof s[k]!=='object'||Array.isArray(s[k]))s[k]=s[k]===undefined?clone(d[k]):{}});
 if(!s.bankAcct)s.bankAcct=d.bankAcct;if(s.bankName==null)s.bankName=d.bankName;
 if(typeof s.remitFee!=='number'||s.remitFee<0)s.remitFee=0;
 if(!s.remitDay||typeof s.remitDay!=='object')s.remitDay={};
 if(!s.itaku||typeof s.itaku!=='object')s.itaku=d.itaku;
 Object.keys(d.itaku).forEach(function(k){if(s.itaku[k]==null)s.itaku[k]=d.itaku[k]});
 return s;
}
function blankMonth(){return {bank:[],mf:[],links:{},closed:null,closeLog:[],remit:{},imports:[],sample:{bank:false,mf:false}}}
function fixMonth(o){
 if(!o||typeof o!=='object')o=blankMonth();
 if(!Array.isArray(o.bank))o.bank=[];if(!Array.isArray(o.mf))o.mf=[];
 if(!o.links||typeof o.links!=='object')o.links={};if(o.closed===undefined)o.closed=null;
 if(!Array.isArray(o.closeLog))o.closeLog=[];if(!o.remit||typeof o.remit!=='object')o.remit={};
 if(!Array.isArray(o.imports))o.imports=[];if(!o.sample||typeof o.sample!=='object')o.sample={bank:false,mf:false};
 return o;
}
var busy=false,synced=false,fresh=false;
X.ensure=function(){
 var d=GK.db;
 if(!d.money||typeof d.money!=='object'||Array.isArray(d.money)){d.money={v:1,settings:defSettings(),months:{}};busy=true;fresh=true;try{if(!GK.LOCAL)seedSample(d.money);d.money.badge=X.badge()}catch(e){}finally{busy=false}}
 var r=d.money;r.settings=fixSettings(r.settings);
 if(!r.months||typeof r.months!=='object')r.months={};
 /* 社内検証用のデータ: no sample months and no DEMO history, ever. Months given in GK_LOCAL.db.money (localPending, see
    GK.localNormalize) are treated once like a 「取り込み」: duplicate keys, an import record, the automatic 紐付け */
 if(GK.LOCAL){r.demoHist=1;
  if(Array.isArray(r.localPending)&&r.localPending.length&&!busy){
   var pend=r.localPending;delete r.localPending;busy=true;fresh=true;
   try{pend.forEach(function(m){var M=r.months[m];if(!M)return;M=r.months[m]=fixMonth(M);
    var ks=keyed(M.bank,bankKey);M.bank.forEach(function(b,i){b.key=ks[i]});
    var S=r.settings,ds=function(a){return a.map(function(x){return x.date}).sort()};
    if(M.bank.length){var d1=ds(M.bank);M.imports.push({kind:'bank',at:now(),by:'検証データ',file:'ganki-local-data.js',count:M.bank.length,from:d1[0],to:d1[d1.length-1],account:S.bankName,sample:false})}
    if(M.mf.length){var d2=ds(M.mf);M.imports.push({kind:'mf',at:now(),by:'検証データ',file:'ganki-local-data.js',count:M.mf.length,from:d2[0],to:d2[d2.length-1],account:'',sample:false})}
    autoLink(m);
   })}catch(e){if(window.console)console.error(e)}finally{busy=false}
  }else if(r.localPending&&!busy)delete r.localPending;
 }
 /* DEMO history months (once per store, in memory; see seedHistory) */
 if(!r.demoHist&&!busy){busy=true;try{seedHistory(r)}catch(e){r.demoHist=1;if(window.console)console.error(e)}finally{busy=false}}
 if(!busy){busy=true;try{
  /* once per page load: put 前受け on charges created since (13), then keep the sidebar count saved for pages without this file (5) */
  if(!synced){synced=true;var ch=syncPrepay();var b=X.badge();if(fresh||ch||r.badge!==b){fresh=false;r.badge=b;GK.save()}}
 }finally{busy=false}}
 return r;
};
X.settings=function(){return X.ensure().settings};
/* a month object (created empty in memory when missing) */
X.month=function(m){var r=X.ensure();r.months[m]=fixMonth(r.months[m]);return r.months[m]};
X.hasMonth=function(m){var r=X.ensure();return !!r.months[m]};
/* a month "has data" (2026-10-19): bank / MF rows, links, a close (or its log), or a remittance record.
   A month object created empty in memory (only looked at) does not count. */
X.hasData=function(m){
 var r=X.ensure(),M=r.months[m];
 if(M&&typeof M==='object'){
  if((Array.isArray(M.bank)&&M.bank.length)||(Array.isArray(M.mf)&&M.mf.length))return true;
  if(M.links&&typeof M.links==='object'&&Object.keys(M.links).length)return true;
  if(M.closed||(Array.isArray(M.closeLog)&&M.closeLog.length))return true;
  if(M.remit&&typeof M.remit==='object'&&Object.keys(M.remit).length)return true;
 }
 return (GK.db.remits||[]).some(function(x){return x&&x.month===m});
};
/* the earliest month with data (this month when there is none) */
X.firstMonth=function(){
 var r=X.ensure(),c=X.cur(),best=c;
 Object.keys(r.months).forEach(function(k){if(/^\d{4}-\d{2}$/.test(k)&&k<best&&X.hasData(k))best=k});
 (GK.db.remits||[]).forEach(function(x){if(x&&/^\d{4}-\d{2}$/.test(x.month||'')&&x.month<best)best=x.month});
 return best;
};
/* selectable months (newest first): every month from the earliest one with data to this month */
X.monthList=function(){return GK.monthRange(X.firstMonth(),X.cur()).reverse()};
X.monthHint=function(){var f=X.firstMonth();return '口座・MFの明細、紐付け、締め、送金の記録がある月（'+GK.monthText(f)+'）から今月まで選べます。'};
/* the settings a month is judged by: a closed month keeps the ones it was closed with (a month never stored is not created here) */
function setFor(m){var s=X.settings(),M=X.ensure().months[m];if(M&&M.closed&&M.closed.settings){var c=clone(M.closed.settings);c.itaku=s.itaku;c.remitDay=s.remitDay;return fixSettings(c)}return s}
X.setFor=setFor;
X.treat=function(propId,S){S=S||X.settings();var t=S.treat[propId];return t==='サブリース'||t==='自社'?t:'受託'};
X.treatLabel=function(t){for(var i=0;i<TREATS.length;i++)if(TREATS[i][0]===t)return TREATS[i][1];return '管理受託'};
/* 管理手数料 per property: {method:'room'|'pct', amount (円/入居中の部屋/月), pct, tax:'ex'|'in'} with the defaults filled in */
X.feeOf=function(propId,S){
 S=S||X.settings();var p=GK.prop(propId),o=p?GK.owner(p.owner):null,f=(S.fee||{})[propId]||{};
 var tokyo=/^東京都/.test(nf(p&&p.addr||''));
 return {method:f.method==='pct'?'pct':'room',amount:f.amount>=0&&f.amount!==''&&f.amount!=null?+f.amount:(tokyo?1500:3500),pct:f.pct>=0&&f.pct!==''&&f.pct!=null?+f.pct:(o&&+o.fee>=0?+o.fee:5),tax:f.tax==='in'?'in':'ex'};
};
X.renewOf=function(propId,S){S=S||X.settings();return (S.renew||{})[propId]==='company'?'company':'owner'};
X.subleaseOf=function(propId,S){S=S||X.settings();var p=GK.prop(propId),x=(S.sublease||{})[propId]||{};return {amount:+x.amount>0?Math.round(+x.amount):0,owner:x.owner||(p?p.owner:'')}};
X.freeUntil=function(ownerId,S){S=S||X.settings();var v=(S.feeFree||{})[ownerId];return /^\d{4}-\d{2}$/.test(v||'')?v:''};
/* rooms of a property that had a lease (契約中 or ended later) at some point in month m */
X.occupied=function(propId,m){
 var p=GK.prop(propId);if(!p)return 0;var a=m+'-01',z=X.lastDay(m),n=0;
 (p.rooms||[]).forEach(function(no){var id=p.id+'-'+no;
  if(GK.db.leases.some(function(l){return l.unit===id&&(l.status==='有効'||l.status==='終了'||l.status==='退去予定')&&(!l.start||l.start<=z)&&(!l.end||l.end>=a)}))n++});
 return n;
};
X.remitDay=function(ownerId){var d=+X.settings().remitDay[ownerId];return d>=1&&d<=31?d:25};
X.payDate=function(m,ownerId){var nm=X.addMonth(m,1),d=X.remitDay(ownerId),last=+X.lastDay(nm).slice(8);return nm+'-'+pad(Math.min(d,last))};

/* ---------- names ---------- */
var SMALL={'ァ':'ア','ィ':'イ','ゥ':'ウ','ェ':'エ','ォ':'オ','ャ':'ヤ','ュ':'ユ','ョ':'ヨ','ッ':'ツ','ヮ':'ワ','ヵ':'カ','ヶ':'ケ'};
/* comparison key for a 振込名義 / フリガナ: width, hiragana, small kana, spaces, ー and 「カ）」「（カ」 do not matter */
function kanaKey(s){
 s=nf(s).replace(/[ぁ-ゖ]/g,function(c){return String.fromCharCode(c.charCodeAt(0)+0x60)}).trim();
 s=s.replace(/^(振込|フリコミ|ﾌﾘｺﾐ)[\s*＊]*/,'');
 s=s.replace(/[ァィゥェォャュョッヮヵヶ]/g,function(c){return SMALL[c]});
 s=s.replace(/[\s　・･.,，、。\-‐ー－]/g,'');
 s=s.replace(/^(カ|ユ|ド|シヤ|ザイ|ガク|イ)\)/,'').replace(/\((カ|ユ|ド)\)?$/,'').replace(/\((カ|ユ|ド)\)/g,'');
 return s.toUpperCase();
}
X.kanaKey=kanaKey;
var GUA_KANA={'ガンキ保証':'ガンキホシヨウ','東日本保証':'ヒガシニホンホシヨウ','全国家賃保証':'ゼンコクヤチンホシヨウ'};
function guaOf(key){var g='';Object.keys(GUA_KANA).forEach(function(k){if(key===GUA_KANA[k]||key.indexOf(GUA_KANA[k])===0)g=k});return g}

/* ---------- lookups ---------- */
function bal(c,res){return c.amount-c.paid-((res&&res[c.id])||0)}
function activeLeases(){return GK.db.leases.filter(function(l){return l.status==='有効'})}
function unpaid(leaseId,res){return GK.db.charges.filter(function(c){return c.lease===leaseId&&bal(c,res)>0}).sort(function(a,b){return a.due<b.due?-1:a.due>b.due?1:(a.month<b.month?-1:a.month>b.month?1:0)})}
/* the lease that was in the room in month m (a 前の入居者 after a turnover), else the current one */
function leaseAt(unitId,m){
 var a=m?m+'-01':'',z=m?X.lastDay(m):'';
 var ls=GK.db.leases.filter(function(l){return l.unit===unitId&&(l.status==='有効'||l.status==='終了')&&(!m||((!l.start||l.start<=z)&&(!l.end||l.end>=a)))}).sort(function(x,y){return x.start<y.start?1:-1});
 return ls[0]||GK.activeLease(unitId)||GK.leasesOf(unitId)[0]||null;
}
X.leaseAt=leaseAt;
function unitOf(a){return a&&a.unit?GK.unit(a.unit):null}
function propOf(a){if(a&&a.prop&&!a.unit)return GK.prop(a.prop);var u=unitOf(a);return u?GK.prop(u.prop):null}
/* who the line belongs to: {kind:'room'|'owner'|'company', label} */
X.target=function(a){
 if(a.unit){var t=a.lease&&GK.lease(a.lease),tn=t&&GK.tenant(t.tenant);return {kind:'room',label:GK.roomLabel(a.unit),sub:tn?tn.n:''}}
 if(a.owner){var o=GK.owner(a.owner);return {kind:'owner',label:'オーナー '+(o?o.n:a.owner),sub:''}}
 return {kind:'company',label:'会社',sub:''};
};
X.allocText=function(a){
 var s=a.use;
 if(RENT_USES[a.use]&&a.month)s+=' '+X.monY(a.month)+'分'+(a.adv?'（前受け）':'');
 if(a.repair){var r=GK.by(GK.db.repairs||[],a.repair);if(r)s+='（'+r.t+'）'}
 if(a.use==='借上賃料'&&a.prop){var p=GK.prop(a.prop);if(p)s+='（'+p.n+(a.month?' '+X.monY(a.month)+'分':'')+'）'}
 if((a.use==='更新料'||a.use==='礼金')&&a.unit){var pu=propOf(a);if(pu&&X.treat(pu.id)==='受託')s+=X.renewOf(pu.id)==='company'?'（会社の収入）':'（オーナーへ送金）'}
 return s;
};

/* ---------- 仕訳 (what MoneyForward should have) ---------- */
function fill(v,a,S){
 v=String(v||'');if(v.indexOf('［')<0)return v;
 var p=propOf(a),o=a.owner?GK.owner(a.owner):(p?GK.owner(p.owner):null);
 return v.replace(/［オーナー名］/g,o?o.n:'').replace(/［物件名］/g,p?p.n:'').replace(/［口座名］/g,S.bankName||'');
}
/* the counter side of one line: {acct, sub, dept} */
function other(a,S){
 var p=propOf(a),t=p?X.treat(p.id,S):(a.use==='オーナー送金'?'受託':'自社');
 var key=a.use;if(t==='受託'&&p&&(key==='更新料'||key==='礼金')&&X.renewOf(p.id,S)==='company')key+='（会社の収入）';
 var m=(S.map[t]||{})[key]||['','',''];
 return {acct:fill(m[0],a,S),sub:fill(m[1],a,S),dept:fill(m[2],a,S),treat:t};
}
X.expect=function(a,S,dir){var o=other(a,S||X.settings());return {dir:dir,amount:a.amount,other:o,bank:{acct:(S||X.settings()).bankAcct,sub:(S||X.settings()).bankName}}};
X.acctText=function(x){var p=[x.sub,x.dept].filter(Boolean);return (x.acct||'（なし）')+(p.length?'（'+p.join('・')+'）':'')};
X.entryText=function(e){
 var b=X.acctText(e.bank),o=X.acctText(e.other);
 return e.dir==='in'?'借方 '+b+' ／ 貸方 '+o:'借方 '+o+' ／ 貸方 '+b;
};

/* ---------- automatic linking ---------- */
function subsets(items,target,maxK){
 var out=[],n=items.length;
 function go(i,k,sum,pick){if(out.length>2)return;if(sum===target&&pick.length){out.push(pick.slice());return}if(k===0||i>=n||sum>target)return;
  for(var j=i;j<n;j++){pick.push(items[j]);go(j+1,k-1,sum+items[j].b,pick);pick.pop();if(out.length>2)return}}
 go(0,maxK,0,[]);return out;
}
function rentAlloc(c,amt){var l=GK.lease(c.lease);return {unit:l?l.unit:'',lease:c.lease,month:c.month,use:'家賃',amount:amt,charge:c.id}}
function deposit(row,res,m){
 var key=kanaKey(row.name),amt=row.amount,g=guaOf(key);
 if(g){
  var gl=activeLeases().filter(function(l){return l.gua===g}).map(function(l){return l.id});
  var pool=function(over){var a=[];gl.forEach(function(id){unpaid(id,res).forEach(function(c){if(!over||c.due<=row.date)a.push({c:c,b:bal(c,res)})})});return a};
  var ss=subsets(pool(true).slice(0,14),amt,4),why='滞納分の立替え';
  if(ss.length!==1){ss=subsets(pool(false).slice(0,16),amt,3);why=''}
  if(ss.length===1){var al=ss[0].map(function(x){return rentAlloc(x.c,x.b)});
   return {state:'auto',conf:'mid',reasons:['保証会社（'+g+'）',al.length+'人分'+(why?'・'+why:'')],allocs:al}}
  return {state:'none',conf:'',reasons:['保証会社（'+g+'）',ss.length?'内訳の候補が複数':'内訳が分かりません'],allocs:[]};
 }
 var ls=key?activeLeases().filter(function(l){var t=GK.tenant(l.tenant);return t&&kanaKey(t.k)===key}):[];
 if(ls.length>1)return {state:'none',conf:'',reasons:['同じ名義が'+ls.length+'人'],allocs:[]};
 if(!ls.length)return {state:'none',conf:'',reasons:['名義が見つかりません'],allocs:[]};
 var l=ls[0],ch=unpaid(l.id,res);
 if(!ch.length){var nm=X.addMonth(m,1);return {state:'auto',conf:'mid',reasons:['名義一致','前受け（'+X.mon(nm)+'分）'],allocs:[{unit:l.unit,lease:l.id,month:nm,use:'家賃',amount:amt,adv:true}]}}
 var b0=bal(ch[0],res);
 if(amt===b0)return {state:'auto',conf:'high',reasons:['名義一致','金額一致'],allocs:[rentAlloc(ch[0],amt)]};
 if(amt<b0)return {state:'auto',conf:'mid',reasons:['名義一致','一部入金（残り '+GK.yen(b0-amt)+'）'],allocs:[rentAlloc(ch[0],amt)]};
 var left=amt,al=[],months={};
 ch.forEach(function(c){if(left<=0)return;var b=bal(c,res),a=Math.min(b,left);al.push(rentAlloc(c,a));months[c.month]=1;left-=a});
 var nmo=Object.keys(months).length,lbl=nmo>1?nmo+'か月分':al.length+'件分';
 if(left>0)return {state:'auto',conf:'mid',reasons:['名義一致',(al.length>1?lbl+'・':'')+'多い入金（'+GK.yen(left)+'）'],allocs:al};
 var last=al[al.length-1],lb=bal(GK.by(GK.db.charges,last.charge),res);
 return {state:'auto',conf:'mid',reasons:['名義一致',lbl+(last.amount<lb?'・一部入金':'')],allocs:al};
}
function prevRemitTotal(m,ownerId){var pm=X.addMonth(m,-1);if(!X.hasMonth(pm))return null;var r=X.remitOf(pm,ownerId);if(r.snap)return r.snap.payable;var st=X.statement(pm,ownerId,1);return st?st.payable:null}
function withdrawal(row,res,m){
 var key=kanaKey(row.name),amt=-row.amount,raw=nf(row.name);
 if(key.indexOf('テスウリヨウ')>=0||raw.indexOf('手数料')>=0)return {state:'auto',conf:'high',reasons:['振込手数料'],allocs:[{use:'振込手数料',amount:amt}]};
 var os=key?GK.db.owners.filter(function(o){return kanaKey(o.k)===key}):[];
 if(os.length===1&&X.leaseProps(os[0].id).length){
  /* サブリースの借上賃料: last month's fixed amount */
  var lp=X.leaseProps(os[0].id),pm=X.addMonth(m,-1),lt=lp.reduce(function(s,p){return s+X.subleaseOf(p.id).amount},0);
  var hasK=X.ownersFor(m).some(function(x){return x.id===os[0].id});
  if(amt===lt||!hasK)return {state:'auto',conf:amt===lt?'high':'mid',reasons:['名義一致（オーナー）'].concat(amt===lt?[X.mon(pm)+'分の借上賃料と一致']:['借上賃料（金額が違います）']),
   allocs:amt===lt?lp.map(function(p){return {owner:os[0].id,prop:p.id,month:pm,use:'借上賃料',amount:X.subleaseOf(p.id).amount}}):[{owner:os[0].id,prop:lp[0].id,month:pm,use:'借上賃料',amount:amt}]};
 }
 if(os.length===1){var o=os[0],pt=prevRemitTotal(m,o.id),hit=pt===amt;
  return {state:'auto',conf:hit?'high':'mid',reasons:['名義一致（オーナー）'].concat(hit?[X.mon(X.addMonth(m,-1))+'分の送金額と一致']:[]),allocs:[{owner:o.id,use:'オーナー送金',amount:amt}]}}
 var rs=(GK.db.repairs||[]).filter(function(r){var d=GK.days(r.date,row.date);return +r.amount===amt&&d>=-3&&d<=31&&!r.bank&&!(res&&res['R:'+r.id])});
 if(rs.length===1){var r=rs[0],dd=Math.abs(GK.days(r.date,row.date)),u=GK.unit(r.unit);
  return {state:'auto',conf:'mid',reasons:['修繕の記録（'+GK.sd(r.date)+' '+r.t+'）'].concat(dd&&dd<=3?['日付ずれ'+dd+'日']:[]),allocs:[{unit:r.unit,lease:'',month:m,use:'修繕費',amount:amt,repair:r.id}]}}
 if(rs.length>1)return {state:'none',conf:'',reasons:['修繕の候補が複数'],allocs:[]};
 return {state:'none',conf:'',reasons:['出金先が分かりません'],allocs:[]};
}
/* charges / repairs held by links that are linked but not confirmed yet (confirmed ones are already in c.paid) */
function reserved(M,skipId){
 var res={};
 Object.keys(M.links).forEach(function(id){var L=M.links[id];if(id===skipId||!L||L.state!=='auto')return;
  (L.allocs||[]).forEach(function(a){if(a.charge)res[a.charge]=(res[a.charge]||0)+a.amount;if(a.repair)res['R:'+a.repair]=1})});
 return res;
}
X.suggest=function(m,row,res){res=res||reserved(X.month(m),row.id);return row.amount>=0?deposit(row,res,m):withdrawal(row,res,m)};
function autoLink(m,ids){
 var M=X.month(m),res=reserved(M);
 M.bank.slice().sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:0}).forEach(function(r){
  if(ids&&ids.indexOf(r.id)<0)return;if(M.links[r.id])return;
  var s=X.suggest(m,r,res);
  M.links[r.id]={allocs:s.allocs,state:s.state,reasons:s.reasons,conf:s.conf,by:'',at:'',applied:[],repairs:[],auto:{allocs:clone(s.allocs),reasons:s.reasons.slice(),conf:s.conf}};
  s.allocs.forEach(function(a){if(a.charge)res[a.charge]=(res[a.charge]||0)+a.amount;if(a.repair)res['R:'+a.repair]=1});
 });
}
X.autoLink=autoLink;
/* candidates for the 直す editor: name / amount / guarantor guesses (never decides on its own) */
X.candidates=function(m,row){
 var M=X.month(m),res=reserved(M,row.id),out=[],seen={};
 var s=X.suggest(m,row,res);if(s.allocs.length)out.push({label:s.allocs.map(function(a){return X.target(a).label+' '+X.allocText(a)+' '+GK.yen(a.amount)}).join('、'),allocs:s.allocs,why:s.reasons.join('・')});
 if(row.amount>0){
  var key=kanaKey(row.name);
  GK.db.charges.forEach(function(c){var b=bal(c,res);if(b<=0)return;var l=GK.lease(c.lease);if(!l||l.status!=='有効')return;var t=GK.tenant(l.tenant);
   var sur=t?kanaKey(String(t.k||'').split(/[\s　]+/)[0]):'',nm=sur.length>=2&&key.indexOf(sur)===0,am=b===row.amount;
   if(!(nm||am)||seen[c.id])return;seen[c.id]=1;
   out.push({label:GK.roomLabel(l.unit)+' '+(t?t.n:'')+' '+X.monY(c.month)+'分 残り '+GK.yen(b),allocs:[rentAlloc(c,Math.min(b,row.amount))],why:nm&&am?'名字と金額が一致':nm?'名字が一致':'金額が一致',s:(nm?2:0)+(am?1:0)});
  });
 }
 var first=out.length&&!out[0].s?out.shift():null;
 out.sort(function(a,b){return (b.s||0)-(a.s||0)});
 if(first)out.unshift(first);
 return out.slice(0,5);
};
/* ---------- 「AIに候補を聞く」 (added 2026-10-19) ----------
   For a row the rules could not link (要確認): up to 3 candidates [{label, reasons[], conf:'high'|'mid'|'low', score, allocs}].
   Demo: made here by fuzzy matching (GK.ai.kana / companyKana / sim in ganki-data.js) — 摘要 vs フリガナ・名字・勤務先・
   オーナー（会社名）・保証会社・業者, the amount vs the unpaid 請求 / 修繕 / 先月の送金額 (equal or near), the date vs the due date.
   It never links, confirms or computes anything that is saved: a candidate only fills the 直す editor, where a person decides. */
var AI_VENDORS=[['ミズテック設備','ミズテツクセツビ'],['カギの森','カギノモリ'],['東和防災','トウワボウサイ'],['ひがし内装','ヒガシナイソウ'],['さくら水道','サクラスイドウ'],['グリーン桜台','グリーンサクラダイ'],['中央昇降機','チユウオウシヨウコウキ']];
X.aiCandidates=function(m,row){
 var AI=GK.ai;if(!AI||!row)return [];
 var M=X.month(m),res=reserved(M,row.id),key=AI.kana(row.name),amt=Math.abs(row.amount),yen=GK.yen,out=[];
 var memo='摘要『'+row.name+'』',short=GK.roomLabel;
 var nameSim=function(k){return k&&key?AI.sim(key,k):0};
 var conf=function(s){return s>=0.95?'high':s>=0.55?'mid':'low'};
 if(row.amount>0){
  var GUA_HIT=Object.keys(GUA_KANA).filter(function(g){return nameSim(GUA_KANA[g])>=0.7});
  activeLeases().forEach(function(l){
   var t=GK.tenant(l.tenant);if(!t)return;
   var ch=unpaid(l.id,res),rs=[],ns=0,as=0,allocs=null;
   var tk=AI.kana(t.k),sur=AI.kana(String(t.k||'').split(/[\s　]+/)[0]),s1=nameSim(tk);
   if(s1>=0.75){ns=s1;rs.push(memo+'は、入居者 '+t.n+' 様のフリガナと似ています')}
   else if(sur.length>=2&&key.indexOf(sur)===0){ns=0.6;rs.push(memo+'は、入居者 '+t.n+' 様の名字と同じ読みで始まります')}
   if(t.work){var wk=AI.companyKana(t.work),s2=nameSim(wk);if(s2>=0.7&&s2*0.9>ns){ns=s2*0.9;rs.push(memo+'は、入居者 '+t.n+' 様の勤務先『'+t.work+'』と似ています（会社が払う家賃かもしれません）')}}
   if(GUA_HIT.indexOf(l.gua)>=0){ns=Math.max(ns,0.5);rs.push(memo+'は、この部屋の保証会社『'+l.gua+'』と似ています（立替えかもしれません）')}
   var b0=ch[0]?bal(ch[0],res):0,tot=ch.reduce(function(s,c){return s+bal(c,res)},0),eq=ch.filter(function(c){return bal(c,res)===amt})[0];
   if(eq){as=1;rs.push('金額'+yen(amt)+'は'+short(l.unit)+'の'+X.monY(eq.month)+'分の'+(amt<eq.amount?'残り（家賃＋共益費 '+yen(eq.amount)+' のうち）':'家賃＋共益費')+'と同じ');allocs=[rentAlloc(eq,amt)]}
   else if(ch.length>1&&tot===amt){as=0.9;rs.push('金額'+yen(amt)+'は'+short(l.unit)+'の未収'+ch.length+'件分の合計と同じ');allocs=ch.map(function(c){return rentAlloc(c,bal(c,res))})}
   else if(ch[0]&&Math.abs(b0-amt)<=b0*0.12){as=0.35;rs.push('金額'+yen(amt)+'は'+short(l.unit)+'の'+X.monY(ch[0].month)+'分の請求'+yen(b0)+'より'+yen(Math.abs(amt-b0))+(amt>b0?'多い':'少ない'))}
   if(!ns&&!as)return;
   if(!ns&&as<1)return; /* a near amount alone is not a candidate */
   var dc=eq||ch[0];
   if(dc){var dd=GK.days(dc.due,row.date);if(dd>20)rs.push('支払期限（'+GK.sd(dc.due)+'）を'+dd+'日過ぎた入金です');else if(dd>=-40)rs.push('入金日'+GK.sd(row.date)+'は支払期限'+GK.sd(dc.due)+'の前後です')}
   if(!allocs){
    if(ch[0]){var a1=Math.min(b0,amt);allocs=[rentAlloc(ch[0],a1)];if(amt>a1)allocs.push({unit:l.unit,lease:l.id,month:m,use:'その他',amount:amt-a1})}
    else{var nm=X.addMonth(m,1);allocs=[{unit:l.unit,lease:l.id,month:nm,use:'家賃',amount:amt,adv:true}];rs.push('未収がないので、'+X.mon(nm)+'分の前受けとして入れます')}
   }
   var sc=ns?ns*0.6+as*0.5:0.55; /* the amount alone (equal): 中, unless several rooms have it (below) */
   out.push({label:GK.roomLabel(l.unit)+' · '+t.n+' 様 · '+allocs.map(function(a){return X.allocText(a)}).join('、'),reasons:rs,score:sc,allocs:allocs,amountOnly:!ns});
  });
  /* the same amount on several rooms and nothing else: none of them is likely */
  var only=out.filter(function(c){return c.amountOnly});
  if(only.length>1)only.forEach(function(c){c.score=Math.min(c.score,0.3);c.reasons.push('同じ金額の部屋がほかに '+(only.length-1)+' 件あります')});
 }else{
  GK.db.owners.forEach(function(o){
   var ok=AI.kana(o.k),sur=AI.kana(String(o.k||'').split(/[\s　]+/)[0]),ck=AI.companyKana(o.n),rs=[],ns=0;
   var s1=Math.max(nameSim(ok),nameSim(ck));
   if(s1>=0.75){ns=s1;rs.push(memo+'は、オーナー '+o.n+' 様の'+(ck&&nameSim(ck)>=nameSim(ok)?'会社名':'フリガナ')+'と似ています')}
   else if(sur.length>=2&&key.indexOf(sur)===0&&key.length>sur.length){ns=0.6;rs.push(memo+'は、オーナー '+o.n+' 様の会社名と似ています')}
   var pt=prevRemitTotal(m,o.id),as=pt!=null&&pt===amt?1:0;
   if(as)rs.push('金額'+yen(amt)+'は'+o.n+' 様の'+X.mon(X.addMonth(m,-1))+'分の送金額と同じ');
   if(!ns&&!as)return;
   var lp=X.leaseProps(o.id),use=lp.length?'借上賃料':'オーナー送金';
   var al=[{owner:o.id,use:use,amount:amt}];if(use==='借上賃料'){al[0].prop=lp[0].id;al[0].month=X.addMonth(m,-1)}
   out.push({label:'オーナー '+o.n+' 様 · '+use,reasons:rs,score:ns*0.6+as*0.5,allocs:al});
  });
  var vend=GK.LOCAL?[]:AI_VENDORS.filter(function(v){return nameSim(v[1])>=0.7});
  (GK.db.repairs||[]).forEach(function(r){
   var d=GK.days(r.date,row.date),rs=[],as=0;if(r.bank||(res&&res['R:'+r.id]))return;
   if(+r.amount===amt)as=1;else if(Math.abs(+r.amount-amt)<=amt*0.1)as=0.35;else return;
   if(d<-7||d>45)return;
   rs.push('金額'+yen(amt)+(as===1?'は':'は近い金額です：')+'修繕の記録「'+r.t+'」（'+GK.roomLabel(r.unit)+'・'+GK.sd(r.date)+'・'+yen(r.amount)+'）'+(as===1?'と同じ':''));
   rs.push('出金日は修繕の日の'+(d>=0?d+'日後':(-d)+'日前')+'です');
   var vs=vend.length?0.3:0;if(vs)rs.unshift(memo+'は、業者『'+vend[0][0]+'』と似ています');
   out.push({label:GK.roomLabel(r.unit)+' · 修繕費（'+r.t+'）',reasons:rs,score:as*0.5+vs+(d>=0&&d<=31?0.1:0),allocs:[{unit:r.unit,lease:'',month:m,use:'修繕費',amount:amt,repair:r.id}]});
  });
  if(vend.length&&!out.some(function(c){return c.allocs[0].repair}))out.push({label:'会社 · 修繕費（'+vend[0][0]+'）',reasons:[memo+'は、業者『'+vend[0][0]+'』と似ています','合う修繕の記録はありません。部屋を選んでください'],score:0.45,allocs:[{use:'修繕費',amount:amt}]});
  if(GK.ai.sim(key,AI.kana('テスウリヨウ'))>=0.6)out.push({label:'会社 · 振込手数料',reasons:[memo+'は「手数料」と似ています'],score:0.6,allocs:[{use:'振込手数料',amount:amt}]});
 }
 out.forEach(function(c){c.conf=conf(c.score)});
 out.sort(function(a,b){return b.score-a.score});
 return out.slice(0,3).filter(function(c){return c.score>=0.25});
};

/* ---------- views ---------- */
X.rows=function(m){
 var M=X.month(m);
 return M.bank.slice().sort(function(a,b){return a.date<b.date?-1:a.date>b.date?1:(a.id<b.id?-1:1)}).map(function(r){
  var L=M.links[r.id]||{allocs:[],state:'none',reasons:['未判定'],conf:''};
  var sum=(L.allocs||[]).reduce(function(s,a){return s+(+a.amount||0)},0);
  return {row:r,link:L,state:L.state,sum:sum,rest:Math.abs(r.amount)-sum,dir:r.amount>=0?'in':'out'};
 });
};
X.stateLabel={auto:'自動で紐付け（確認待ち）',ok:'確認済み',none:'要確認',skip:'紐付けない'};
X.summary=function(m){
 var M=X.month(m),R=X.rows(m),c={rows:R.length,ok:0,auto:0,none:0,skip:0,high:0,rooms:0};
 R.forEach(function(x){c[x.state]=(c[x.state]||0)+1;if(x.state==='auto'&&x.link.conf==='high'&&x.rest===0)c.high++;if(x.state==='ok'&&(x.link.allocs||[]).some(function(a){return a.unit}))c.rooms++});
 var mf=X.mfCompare(m);c.mf=mf.bad;c.bankSub=mf.bankSub||'';c.mfLoaded=mf.loaded;c.closed=M.closed;c.sample=!!(M.sample&&(M.sample.bank||M.sample.mf));
 c.unsent=X.unsentOwners(m).length;
 return c;
};
/* sidebar badge: rows of this month not confirmed yet (要確認 + 確認待ち) */
X.badge=function(){try{var s=X.summary(X.cur());return s.none+s.auto}catch(e){return 0}};

/* ---------- confirm / fix / skip (undo by id) ---------- */
function findCharge(a,res){
 if(a.charge){var c=GK.by(GK.db.charges,a.charge);if(c)return c}
 if(!a.lease||!a.month)return null;
 var cs=GK.db.charges.filter(function(c){return c.lease===a.lease&&c.month===a.month}).sort(function(x,y){return x.due<y.due?-1:1});
 return cs.filter(function(c){return bal(c,res)>0})[0]||cs[0]||null;
}
/* checks the lines; returns '' or the message */
function checkAllocs(row,allocs){
 var abs=Math.abs(row.amount),sum=0;
 if(!allocs.length)return '行がありません。';
 for(var i=0;i<allocs.length;i++){var a=allocs[i];
  if(USES.indexOf(a.use)<0)return (i+1)+'行目の用途を選んでください。';
  if(!(a.amount>0)||Math.round(a.amount)!==a.amount)return (i+1)+'行目の金額を1円以上の整数で入れてください。';
  if(ROOM_USES[a.use]&&!a.unit)return (i+1)+'行目の部屋を選んでください（'+a.use+'は部屋に付けます）。';
  if((a.use==='オーナー送金'||a.use==='借上賃料')&&!a.owner)return (i+1)+'行目のオーナーを選んでください（'+a.use+'はオーナーに付けます）。';
  if(a.unit&&!GK.unit(a.unit))return (i+1)+'行目の部屋が見つかりません。';
  sum+=a.amount;
 }
 if(sum!==abs)return sum<abs?'あと '+GK.yen(abs-sum)+' を割り当ててください（合計は入出金の金額と同じにします）。':GK.yen(sum-abs)+' 多すぎます。合計を入出金の金額と同じにしてください。';
 return '';
}
X.checkAllocs=checkAllocs;
/* put a link's money on the charges / repairs; returns '' or the message (nothing is changed then) */
function applyLink(row,L,force){
 var plan=[],res={};
 for(var i=0;i<L.allocs.length;i++){var a=L.allocs[i];
  if(row.amount>=0&&RENT_USES[a.use]&&a.lease&&a.adv){var ca=findCharge(a,res);if(ca){var ba=Math.min(Math.max(0,bal(ca,res)),a.amount);if(ba>0){plan.push({charge:ca.id,amt:ba,adv:true});res[ca.id]=(res[ca.id]||0)+ba;a.charge=ca.id}}continue}
  if(row.amount>=0&&RENT_USES[a.use]&&a.lease&&!a.adv){
   var c=findCharge(a,res);
   if(c){var b=bal(c,res);if(b<a.amount&&!force)return X.target(a).label+' の'+X.monY(c.month)+'分は、残りが '+GK.yen(Math.max(0,b))+' です（ほかで入金済み）。「直す」で選び直してください。';
    var amt=Math.min(Math.max(0,b),a.amount);if(amt>0){plan.push({charge:c.id,amt:amt});res[c.id]=(res[c.id]||0)+amt}a.charge=c.id}
  }
 }
 plan.forEach(function(p){var c=GK.by(GK.db.charges,p.charge);c.paid+=p.amt});
 L.applied=plan;L.repairs=[];
 L.allocs.forEach(function(a){if(a.repair){var r=GK.by(GK.db.repairs||[],a.repair);if(r&&!r.bank){r.bank=row.id;L.repairs.push(r.id)}}});
 return '';
}
/* 前受け lines confirmed before the month's charge existed: put them on the charge now (undo = revertLink, by id) */
function syncPrepay(){
 var r=GK.db.money,n=0;if(!r||!r.months)return 0;
 Object.keys(r.months).forEach(function(mm){var M=r.months[mm];if(!M||!M.links||!Array.isArray(M.bank))return;
  Object.keys(M.links).forEach(function(id){var L=M.links[id];if(!L||L.state!=='ok'||!Array.isArray(L.allocs))return;var row=GK.by(M.bank,id);if(!row||row.amount<0)return;
   L.allocs.forEach(function(a){if(!a.adv||!a.lease||!RENT_USES[a.use])return;
    if((L.applied||[]).some(function(p){return p.adv&&p.charge&&(p.charge===a.charge)}))return;
    var c=findCharge(a,{});if(!c)return;var amt=Math.min(Math.max(0,bal(c)),a.amount);if(amt<=0)return;
    c.paid+=amt;a.charge=c.id;(L.applied=L.applied||[]).push({charge:c.id,amt:amt,adv:true});n++;
   });
  });
 });
 return n;
}
X.syncPrepay=syncPrepay;
function revertLink(row,L){
 (L.applied||[]).forEach(function(p){var c=GK.by(GK.db.charges,p.charge);if(c)c.paid=Math.max(0,c.paid-p.amt)});
 (L.repairs||[]).forEach(function(id){var r=GK.by(GK.db.repairs||[],id);if(r&&r.bank===row.id)delete r.bank});
 L.applied=[];L.repairs=[];
}
function dunSweep(){try{if(GK.dun&&typeof GK.dun.sweep==='function')GK.dun.sweep()}catch(e){if(window.console)console.error(e)}}
function logIt(t){GK.log(t);return GK.db.log[0]}
function unlog(e){if(!e)return;GK.db.log=GK.db.log.filter(function(x){return !(x.at===e.at&&x.t===e.t&&x.who===e.who)})}
function rowOf(m,id){return GK.by(X.month(m).bank,id)}
function closedMsg(m){return X.mon(m)+'は締め済みです。直すときは「締め」で締めを解除してください。'}
/* change a link: fn(L) edits it; when the new state is 'ok' its money is applied. Returns {ok,msg,undo} */
function mutate(m,id,fn,label){
 var M=X.month(m),row=rowOf(m,id);
 if(!row)return {ok:false,msg:'この入出金が見つかりません（ほかの画面で取り込み直されたかもしれません）。'};
 if(M.closed)return {ok:false,msg:closedMsg(m)};
 var L=M.links[id]||{allocs:[],state:'none',reasons:[],conf:'',applied:[],repairs:[]};M.links[id]=L;
 var prev=clone(L);
 if(L.state==='ok')revertLink(row,L);
 var err=fn(L);
 if(!err&&L.state==='ok')err=applyLink(row,L);
 if(err){ /* put everything back as it was */
  M.links[id]=prev;if(prev.state==='ok'){var p2=M.links[id];p2.applied=[];p2.repairs=[];applyLink(row,p2,true)}
  return {ok:false,msg:err};
 }
 if(L.state==='ok'||L.state==='skip'){L.by=GK.ME;L.at=now()}
 dunSweep(); /* 滞納の段階 (2026-10-19): rent now paid in full closes its case (with a log line); see GK.dun in ganki-data.js */
 var le=label?logIt(label):null;
 save();
 return {ok:true,msg:'',undo:function(){
  var M2=X.month(m),r2=rowOf(m,id),cur=M2.links[id];if(!r2||M2.closed)return false;
  if(cur&&cur.state==='ok')revertLink(r2,cur);
  M2.links[id]=clone(prev);
  if(prev.state==='ok'){var p3=M2.links[id];p3.applied=[];p3.repairs=[];applyLink(r2,p3,true)}
  dunSweep();unlog(le);save();return true;
 }};
}
function rowText(row){return GK.sd(row.date)+' '+(row.amount>=0?'入金':'出金')+' '+GK.yen(Math.abs(row.amount))+'（'+row.name+'）'}
/* 確認する: returns {ok,msg,undo} or {ok:false, need:'over', rest} when more came in than was linked */
X.confirm=function(m,id){
 var M=X.month(m),row=rowOf(m,id),L=M.links[id];
 if(!row||!L)return {ok:false,msg:'この入出金が見つかりません。'};
 if(M.closed)return {ok:false,msg:closedMsg(m)};
 if(L.state!=='auto')return {ok:false,msg:'自動の紐付けがない行です。「直す」で部屋と用途を選んでください。'};
 var sum=L.allocs.reduce(function(s,a){return s+a.amount},0),abs=Math.abs(row.amount);
 if(sum<abs&&L.allocs.length)return {ok:false,need:'over',rest:abs-sum,msg:GK.yen(abs-sum)+' 多く入っています。'};
 var e=checkAllocs(row,L.allocs);if(e)return {ok:false,msg:e};
 return mutate(m,id,function(x){x.state='ok';return ''},'入出金を確認：'+rowText(row));
};
/* the extra money of an over-payment becomes 前受け（翌月分） for the same room, then the row is confirmed */
X.confirmAdvance=function(m,id){
 var M=X.month(m),row=rowOf(m,id),L=M.links[id];
 if(!row||!L||L.state!=='auto'||!L.allocs.length)return {ok:false,msg:'この入出金が見つかりません。'};
 var sum=L.allocs.reduce(function(s,a){return s+a.amount},0),rest=Math.abs(row.amount)-sum,a0=L.allocs.filter(function(a){return a.unit})[0];
 if(rest<=0||!a0)return X.confirm(m,id);
 if(X.roomsOf(L.allocs).length>1)return {ok:false,pick:true,msg:'いくつかの部屋の入金です。多い分（'+GK.yen(rest)+'）がどの部屋の前受けか、「直す」で選んでください。'};
 var nm=X.addMonth(m,1);
 return mutate(m,id,function(x){x.allocs=x.allocs.concat([{unit:a0.unit,lease:a0.lease,month:nm,use:'家賃',amount:rest,adv:true}]);x.state='ok';return ''},'入出金を確認（'+GK.yen(rest)+' は前受け '+X.mon(nm)+'分）：'+rowText(row));
};
X.roomsOf=function(allocs){var u=[];(allocs||[]).forEach(function(a){if(a.unit&&u.indexOf(a.unit)<0)u.push(a.unit)});return u};
/* まとめて確認: only 'high' rows whose lines add up. Returns {ok,count,failed,undo} */
X.confirmHigh=function(m){
 var M=X.month(m);if(M.closed)return {ok:false,count:0,msg:closedMsg(m)};
 var ids=X.rows(m).filter(function(x){return x.state==='auto'&&x.link.conf==='high'&&x.rest===0}).map(function(x){return x.row.id});
 var undos=[],failed=[];
 ids.forEach(function(id){var r=X.confirm(m,id);if(r.ok)undos.push(r.undo);else failed.push(id)});
 return {ok:true,count:undos.length,failed:failed,undo:function(){undos.slice().reverse().forEach(function(u){u()});save()}};
};
/* 直す: the lines chosen by hand; the row becomes 確認済み */
X.setAllocs=function(m,id,allocs){
 var row=rowOf(m,id);if(!row)return {ok:false,msg:'この入出金が見つかりません。'};
 var clean=allocs.map(function(a){
  var o={use:a.use,amount:Math.round(+a.amount||0)},u=a.unit?GK.unit(a.unit):null;
  if(a.owner)o.owner=a.owner;
  o.month=RENT_USES[o.use]?(a.month||m):o.use==='借上賃料'?(a.month||X.addMonth(m,-1)):m;
  if(u){o.unit=u.id;var l=leaseAt(u.id,o.month);o.lease=l?l.id:''}
  if(o.use==='借上賃料'&&o.owner){var lp=X.leaseProps(o.owner);o.prop=a.prop&&lp.some(function(p){return p.id===a.prop})?a.prop:(lp[0]?lp[0].id:'')}
  if(RENT_USES[o.use]&&o.month>m)o.adv=true;
  if(o.use==='修繕費'&&a.repair)o.repair=a.repair;
  if(a.charge&&RENT_USES[o.use])o.charge=a.charge;
  return o;
 });
 var e=checkAllocs(row,clean);if(e)return {ok:false,msg:e};
 var M=X.month(m),res=reserved(M,id);
 /* a rent line must fit what is still owed for that month */
 for(var i=0;i<clean.length;i++){var a=clean[i];if(row.amount<0||!RENT_USES[a.use]||!a.lease||a.adv)continue;
  var c=a.charge?GK.by(GK.db.charges,a.charge):null;if(!c||c.lease!==a.lease||c.month!==a.month){delete a.charge;c=findCharge(a,res)}
  var cur=M.links[id],mine=0;if(cur&&cur.state==='ok')(cur.applied||[]).forEach(function(p){if(c&&p.charge===c.id)mine+=p.amt});
  if(c){var b=bal(c,res)+mine;if(a.amount>b){var held=bal(c)+mine>b;
    return {ok:false,msg:(i+1)+'行目：'+X.monY(a.month)+'分の残りは '+GK.yen(Math.max(0,b))+' です'+(held?'（ほかの入金がこの請求に自動で紐付いています。その行を「紐付けない」か「直す」にすると使えます）':'')+'。多い分は別の行（前受け など）に分けてください。',line:i}}a.charge=c.id;res[c.id]=(res[c.id]||0)+a.amount}
 }
 return mutate(m,id,function(x){x.allocs=clean;x.state='ok';x.reasons=['手で選んだ'];x.conf='';delete x.skipReason;return ''},'入出金を直して確認：'+rowText(row));
};
X.skip=function(m,id,reason){
 var row=rowOf(m,id);reason=String(reason||'').trim();
 if(!reason)return {ok:false,msg:'紐付けない理由を選ぶか書いてください。'};
 return mutate(m,id,function(x){x.state='skip';x.skipReason=reason;x.allocs=[];return ''},'入出金を紐付けない（'+reason+'）：'+(row?rowText(row):''));
};
/* 確認を取り消す / 紐付けに戻す: back to the automatic suggestion (recomputed when there was none) */
X.reset=function(m,id){
 var row=rowOf(m,id);
 return mutate(m,id,function(x){
  var a=x.auto;
  if(a&&a.allocs&&a.allocs.length){x.allocs=clone(a.allocs);x.reasons=(a.reasons||[]).slice();x.conf=a.conf||'';x.state='auto'}
  else{var s=X.suggest(m,row);x.allocs=s.allocs;x.reasons=s.reasons;x.conf=s.conf;x.state=s.state}
  x.by='';x.at='';delete x.skipReason;return '';
 },'入出金の確認を取り消し：'+(row?rowText(row):''));
};

/* ---------- MoneyForward ---------- */
function mfPseudo(m,S){
 var M=X.month(m),groups={},order=[];
 M.mf.forEach(function(f){var k=f.no?'n'+f.no+'|'+f.date:'i'+f.id;if(!groups[k]){groups[k]=[];order.push(k)}groups[k].push(f)});
 var out=[];
 var isBank=function(x){return x&&x.acct===S.bankAcct&&(x.sub===S.bankName||!x.sub)};
 order.forEach(function(k){
  var g=groups[k],drs=[],crs=[];
  g.forEach(function(f){if(f.dr&&f.dr.acct)drs.push({x:f.dr,f:f});if(f.cr&&f.cr.acct)crs.push({x:f.cr,f:f})});
  var bd=drs.filter(function(d){return isBank(d.x)}),bc=crs.filter(function(c){return isBank(c.x)});
  var mk=function(dir,b,o,f){out.push({id:f.id,date:f.date,dir:dir,bank:{acct:b.acct,sub:b.sub||''},other:{acct:o.acct,sub:o.sub||'',dept:o.dept||''},amount:+o.amt||0,memo:f.memo||'',used:false})};
  if(bd.length===1&&!bc.length){crs.forEach(function(c){mk('in',bd[0].x,c.x,c.f)});return}
  if(bc.length===1&&!bd.length){drs.forEach(function(d){mk('out',bc[0].x,d.x,d.f)});return}
  g.forEach(function(f){if(isBank(f.dr)&&f.cr&&f.cr.acct)mk('in',f.dr,f.cr,f);else if(isBank(f.cr)&&f.dr&&f.dr.acct)mk('out',f.cr,f.dr,f)});
 });
 return out;
}
var MF_ORDER=['acct','sub','dept','amt','missing'];
X.mfLabel={banksub:'口座名が違う',ok:'一致',acct:'勘定科目が違う',sub:'補助科目が違う',dept:'部門が違う',amt:'金額が違う',missing:'MFにない',extra:'口座にない',pending:'入出金の確認が先',nomf:'MF未取り込み'};
function cmpLine(exp,p,sideLbl,bankLbl,any){
 var st='ok',fx=[],f=[];
 if(!any){
  if(p.other.acct!==exp.other.acct){st='acct';f.push('勘定科目を『'+exp.other.acct+'』')}
  if(p.other.sub!==exp.other.sub){if(st==='ok')st='sub';f.push(exp.other.sub?'補助科目を『'+exp.other.sub+'』':'補助科目を空')}
  if(p.other.dept!==exp.other.dept){if(st==='ok')st='dept';f.push(exp.other.dept?'部門を『'+exp.other.dept+'』':'部門を空')}
  if(f.length)fx.push('MFで'+sideLbl+'の'+f.join('、')+'に直してください。');
  if(p.bank.sub!==exp.bank.sub){if(st==='ok')st='sub';fx.push('MFで'+bankLbl+'の補助科目を『'+exp.bank.sub+'』に直してください。')}
 }
 if(p.amount!==exp.amount){if(st==='ok')st='amt';fx.push('MFの金額を '+GK.yen(exp.amount)+' に直してください（いまは '+GK.yen(p.amount)+'）。')}
 return {state:st,fix:fx};
}
/* {loaded, bad, items:[{key, row|null, mf|null, state, lines:[{exp, mf, state, fix}], fix:[]}]} */
X.mfCompare=function(m){
 var M=X.month(m),S=setFor(m),P=mfPseudo(m,S),items=[],loaded=M.mf.length>0||M.imports.some(function(i){return i.kind==='mf'})||!!(M.sample&&M.sample.mf);
 var near=function(a,b){return Math.abs(GK.days(a,b))<=3};
 /* the MF file uses another 補助科目 for this bank account: nothing can be matched until the setting agrees */
 var subs={};M.mf.forEach(function(x){[x.dr,x.cr].forEach(function(y){if(y&&y.acct===S.bankAcct&&y.sub&&y.sub!==S.bankName)subs[y.sub]=(subs[y.sub]||0)+1})});
 var sk=Object.keys(subs).sort(function(a,b){return subs[b]-subs[a]});
 if(loaded&&!P.length&&sk.length){
  return {loaded:true,bad:1,bankSub:sk[0],items:X.rows(m).map(function(x){return {key:x.row.id,row:x.row,x:x,lines:[],state:'banksub',fix:['MFの'+S.bankAcct+'の補助科目が『'+sk[0]+'』です。設定の口座名『'+S.bankName+'』と違うため照合できません。上の「設定を合わせる」を押してください。']}})};
 }
 var rows=X.rows(m).map(function(x){
  var dir=x.dir,lines=[];
  if(x.state==='auto'||x.state==='ok')lines=x.link.allocs.map(function(a){return {exp:X.expect(a,S,dir),mf:null,state:'missing',fix:[]}});
  if(x.state==='skip')lines=[{exp:{dir:dir,amount:Math.abs(x.row.amount),other:{acct:'',sub:'',dept:''},bank:{acct:S.bankAcct,sub:S.bankName}},any:true,mf:null,state:'missing',fix:[]}];
  return {x:x,lines:lines,agg:null};
 });
 var pick=function(list,score){var best=null,bs=-Infinity;list.forEach(function(p){var s=score(p);if(s>bs){bs=s;best=p}});return best};
 var same=function(a,b){return a.acct===b.acct&&a.sub===b.sub&&a.dept===b.dept};
 /* 1. same amount, date ±3 days */
 rows.forEach(function(R){R.lines.forEach(function(L){
  var c=P.filter(function(p){return !p.used&&p.dir===L.exp.dir&&p.amount===L.exp.amount&&near(p.date,R.x.row.date)});
  var p=pick(c,function(p){return (L.any||same(p.other,L.exp.other)?10:p.other.acct===L.exp.other.acct?5:0)-Math.abs(GK.days(p.date,R.x.row.date))});
  if(p){p.used=true;L.mf=p}
 })});
 /* 2. one MF line for the whole row (all lines would go to the same account) */
 rows.forEach(function(R){
  if(!R.lines.length||R.lines.some(function(L){return L.mf}))return;
  var e0=R.lines[0].exp,one=R.lines.every(function(L){return same(L.exp.other,e0.other)});if(!one)return;
  var tot=Math.abs(R.x.row.amount);
  var c=P.filter(function(p){return !p.used&&p.dir===e0.dir&&p.amount===tot&&near(p.date,R.x.row.date)});
  var p=pick(c,function(p){return -Math.abs(GK.days(p.date,R.x.row.date))});
  if(p){p.used=true;R.agg={exp:{dir:e0.dir,amount:tot,other:e0.other,bank:e0.bank},any:R.lines[0].any,mf:p}}
 });
 /* 3. not linked yet: an MF line of the same amount belongs to it (not 口座にない) */
 rows.forEach(function(R){if(R.x.state!=='none')return;
  var c=P.filter(function(p){return !p.used&&p.dir===R.x.dir&&p.amount===Math.abs(R.x.row.amount)&&near(p.date,R.x.row.date)});
  var p=pick(c,function(p){return -Math.abs(GK.days(p.date,R.x.row.date))});if(p){p.used=true;R.pmf=p}});
 /* 4. amount differs: the same accounts, or the payer's name in 摘要 */
 rows.forEach(function(R){
  if(R.agg)return;
  var open=R.lines.filter(function(L){return !L.mf});
  open.forEach(function(L){
   var key=kanaKey(R.x.row.name);
   var c=P.filter(function(p){return !p.used&&p.dir===L.exp.dir&&near(p.date,R.x.row.date)&&((!L.any&&same(p.other,L.exp.other))||(key.length>=3&&kanaKey(p.memo).indexOf(key)>=0))});
   var p=pick(c,function(p){return -Math.abs(GK.days(p.date,R.x.row.date))*1e9-Math.abs(p.amount-L.exp.amount)});
   if(p){p.used=true;L.mf=p}
  });
 });
 var bad=0;
 rows.forEach(function(R){
  var x=R.x,dir=x.dir,side=dir==='in'?'貸方':'借方',bside=dir==='in'?'借方':'貸方',it={key:x.row.id,row:x.row,x:x,lines:[],state:'ok',fix:[]};
  if(x.state==='none'){it.state='pending';it.mf=R.pmf||null;it.fix=['先に「入出金の確認」で、部屋と用途を決めてください。'];items.push(it);return}
  if(!loaded){it.state='nomf';it.fix=['MFのCSVを取り込むと照合します。'];it.lines=R.lines;items.push(it);return}
  var ls=R.agg?[R.agg]:R.lines;
  ls.forEach(function(L){
   var o={exp:L.exp,mf:L.mf,any:L.any,state:'missing',fix:[]};
   if(L.mf){var c=cmpLine(L.exp,L.mf,side,bside,L.any);o.state=c.state;o.fix=c.fix;var dd=Math.abs(GK.days(L.mf.date,x.row.date));if(dd)o.shift=dd}
   else o.fix=[L.any?'MFにこの入出金（'+GK.yen(L.exp.amount)+'）の仕訳を入れてください。':'MFにこの仕訳を入れてください：'+X.entryText(L.exp)+' '+GK.yen(L.exp.amount)];
   it.lines.push(o);
  });
  it.agg=!!R.agg;
  MF_ORDER.forEach(function(s){if(it.state==='ok'&&it.lines.some(function(l){return l.state===s}))it.state=s});
  it.lines.forEach(function(l){it.fix=it.fix.concat(l.fix)});
  if(it.state!=='ok')bad++;
  items.push(it);
 });
 if(loaded)P.forEach(function(p){if(p.used)return;bad++;
  items.push({key:'mf-'+p.id,row:null,mf:p,state:'extra',lines:[],fix:['この口座の入出金にありません。MFの日付と金額を確かめ、間違えて入れた仕訳なら削除してください（別の口座の取引なら、補助科目を確かめてください）。']})});
 items.sort(function(a,b){var da=a.row?a.row.date:a.mf.date,db=b.row?b.row.date:b.mf.date;return da<db?-1:da>db?1:0});
 return {loaded:loaded,bad:loaded?bad:0,items:items};
};

/* ---------- owner statements ----------
   Two kinds, one remit record each in month.remit:
     key 'o1'    管理受託の送金明細 (集めた家賃 − 管理手数料 − 修繕費 …)
     key 'L:o2'  サブリースの借上賃料 (fixed monthly amount per property, no fee) */
X.ownersFor=function(m){var S=setFor(m);return GK.db.owners.filter(function(o){return GK.db.props.some(function(p){return p.owner===o.id&&X.treat(p.id,S)==='受託'})})};
/* サブリース properties whose 借上賃料 goes to this owner */
X.leaseProps=function(ownerId,S){S=S||X.settings();return GK.db.props.filter(function(p){return X.treat(p.id,S)==='サブリース'&&X.subleaseOf(p.id,S).amount>0&&X.subleaseOf(p.id,S).owner===ownerId})};
X.leaseOwners=function(m){var S=setFor(m);return GK.db.owners.filter(function(o){return X.leaseProps(o.id,S).length})};
/* every statement of the month: [{key, kind:'kanri'|'lease', owner}] */
X.remitTargets=function(m){return X.ownersFor(m).map(function(o){return {key:o.id,kind:'kanri',owner:o}}).concat(X.leaseOwners(m).map(function(o){return {key:'L:'+o.id,kind:'lease',owner:o}}))};
function keyOwner(key){return String(key||'').replace(/^L:/,'')}
X.remitOf=function(m,key){var M=X.month(m),r=M.remit[key];return r&&r.state?r:{state:'draft'}};
X.stmt=function(m,key,depth){return /^L:/.test(key)?X.leaseStatement(m,keyOwner(key)):X.statement(m,key,depth)};
X.leaseStatement=function(m,ownerId){
 var o=GK.owner(ownerId);if(!o)return null;
 var S=setFor(m),ps=X.leaseProps(ownerId,S),items=ps.map(function(p){return {prop:p.id,name:p.n,amount:X.subleaseOf(p.id,S).amount}});
 var net=items.reduce(function(s,x){return s+x.amount},0);
 return {kind:'lease',m:m,owner:o.id,key:'L:'+o.id,name:o.n,props:ps.map(function(p){return p.n}),items:items,lines:[],fees:[],repairs:[],collected:0,others:0,fee:0,tax:0,repTotal:0,remitFee:0,carry:0,
  net:net,payable:net>0?net:0,payDate:X.payDate(m,o.id),pending:0,check:0,adv:[]};
};
/* 管理手数料 of one property for month m */
X.feeLine=function(p,m,collP,ownerId,S){
 var f=X.feeOf(p.id,S),free=X.freeUntil(ownerId,S),cnt=0,base=0,basis='';
 if(f.method==='pct'){base=Math.floor(collP*f.pct/100);basis='管理手数料 家賃・共益費 '+GK.yen(collP)+' の '+f.pct+'%'}
 else{cnt=X.occupied(p.id,m);base=f.amount*cnt;basis='管理手数料 '+f.amount.toLocaleString()+'円 × 入居中 '+cnt+'室'}
 if(free&&m<=free)return {prop:p.id,name:p.n,method:f.method,basis:'管理手数料 ¥0（サービス期間 〜'+free.replace('-','/')+'）',fee:0,taxMode:f.tax,free:true,rooms:cnt,inTax:0,would:base};
 var inTax=f.tax==='in'?Math.floor(base*10/110):0;
 return {prop:p.id,name:p.n,method:f.method,basis:basis+(f.tax==='in'?'（税込・うち消費税 '+GK.yen(inTax)+'）':''),fee:base,taxMode:f.tax,free:false,rooms:cnt,inTax:inTax};
};
/* depth: carry-over recursion guard */
X.statement=function(m,ownerId,depth){
 var o=GK.owner(ownerId);if(!o)return null;
 var S=setFor(m),props=GK.db.props.filter(function(p){return p.owner===ownerId&&X.treat(p.id,S)==='受託'});
 var units={},uorder=[],uprop={};props.forEach(function(p){(p.rooms||[]).forEach(function(no){var id=p.id+'-'+no;units[id]=1;uorder.push(id);uprop[id]=p.id})});
 var coll={},reps=[],oth=[],pend=0,check=0;
 var take=function(mm,advOnly){
  if(!X.hasMonth(mm))return;
  X.rows(mm).forEach(function(x){
   var mine=(x.link.allocs||[]).some(function(a){return (a.unit&&units[a.unit])});
   if(mine&&x.state==='auto'&&!advOnly)pend++;
   if(x.state!=='ok')return;
   x.link.allocs.forEach(function(a){
    if(!a.unit||!units[a.unit])return;
    if(RENT_USES[a.use]&&x.dir==='in'){
     if(advOnly?!(a.adv&&a.month===m):a.adv)return;
     (coll[a.unit]=coll[a.unit]||[]).push({month:a.month,amount:a.amount,date:x.row.date,name:x.row.name,row:x.row.id});
    }
    if(!advOnly&&(a.use==='更新料'||a.use==='礼金')&&x.dir==='in'&&X.renewOf(uprop[a.unit],S)==='owner')oth.push({unit:a.unit,use:a.use,amount:a.amount,date:x.row.date,row:x.row.id});
    if(!advOnly&&a.use==='修繕費'&&x.dir==='out'){var r=a.repair?GK.by(GK.db.repairs||[],a.repair):null;reps.push({unit:a.unit,amount:a.amount,label:r?r.t:'修繕費',date:x.row.date,row:x.row.id})}
   });
  });
 };
 take(m,false);Object.keys(X.ensure().months).filter(function(k){return k<m}).forEach(function(k){take(k,true)});
 X.rows(m).forEach(function(x){if(x.state==='none')check++});
 var adv=[];
 Object.keys(X.ensure().months).filter(function(k){return k<=m}).forEach(function(k){X.rows(k).forEach(function(x){if(x.state!=='ok')return;x.link.allocs.forEach(function(a){if(a.adv&&a.unit&&units[a.unit]&&a.month>m)adv.push({unit:a.unit,month:a.month,amount:a.amount,from:k})})})});
 var lines=[],collected=0,collP={};
 uorder.forEach(function(uid){
  var c=coll[uid]||[],l=GK.activeLease(uid),t=l&&GK.tenant(l.tenant),sum=c.reduce(function(s,x){return s+x.amount},0);
  var ls=GK.db.leases.filter(function(x){return x.unit===uid}).map(function(x){return x.id});
  var open=GK.db.charges.filter(function(ch){return ls.indexOf(ch.lease)>=0&&ch.month<=m&&ch.paid<ch.amount}).sort(function(a,b){return a.month<b.month?-1:1});
  if(!c.length&&!open.length)return;
  collected+=sum;collP[uprop[uid]]=(collP[uprop[uid]]||0)+sum;
  lines.push({unit:uid,room:GK.roomLabel(uid),tenant:t?t.n:'',items:c,amount:sum,unpaid:open.map(function(ch){return {month:ch.month,amount:ch.amount-ch.paid}})});
 });
 var fees=props.map(function(p){return X.feeLine(p,m,collP[p.id]||0,o.id,S)});
 /* 消費税: once per statement, on the sum of the 税抜 fees (適格請求書: one rounding per rate) */
 var fee=fees.reduce(function(s,f){return s+f.fee},0),tax=Math.floor(fees.filter(function(f){return f.taxMode!=='in'}).reduce(function(s,f){return s+f.fee},0)*0.1);
 var others=oth.reduce(function(s,x){return s+x.amount},0);
 var repTotal=reps.reduce(function(s,r){return s+r.amount},0);
 var carry=0;
 if((depth||0)<12){var pm=X.addMonth(m,-1);if(X.hasMonth(pm)){var prev=X.statement(pm,ownerId,(depth||0)+1);var pr=X.remitOf(pm,ownerId),pt=pr.snap&&pr.state!=='draft'?pr.snap.net:(prev?prev.net:0);if(pt<0)carry=pt}}
 var pre=collected+others-fee-tax-repTotal+carry,rf=S.remitFee>0&&pre>S.remitFee?S.remitFee:0,net=pre-rf;
 return {kind:'kanri',m:m,owner:o.id,key:o.id,name:o.n,props:props.map(function(p){return p.n}),lines:lines,collected:collected,otherItems:oth,others:others,fees:fees,fee:fee,tax:tax,repairs:reps,repTotal:repTotal,
  remitFee:rf,carry:carry,net:net,payable:net>0?net:0,payDate:X.payDate(m,o.id),pending:pend,check:check,adv:adv};
};
/* the statement as staff see it: a fixed / sent statement shows what was fixed */
X.shown=function(m,key){
 var r=X.remitOf(m,key),live=X.stmt(m,key);
 if(r.state!=='draft'&&r.snap){var s=clone(r.snap);if(!s.kind)s.kind=/^L:/.test(key)?'lease':'kanri';if(!s.fees)s.fees=[];if(!s.otherItems)s.otherItems=[];s.pending=live?live.pending:0;s.check=live?live.check:0;s.changed=!!live&&(live.net!==r.snap.net||live.collected!==r.snap.collected);return s}
 return live;
};
X.statementText=function(st){
 if(!st)return '';
 var L=[];L.push(st.name+' 様');
 if(st.kind==='lease'){
  L.push(X.monY(st.m)+'分 借上賃料のお支払い（GANKI 賃貸管理）');L.push('お支払い予定日：'+GK.jp(st.payDate));L.push('');
  st.items.forEach(function(x){L.push('　'+x.name+'　借上賃料　'+GK.yen(x.amount))});
  L.push('');L.push('お支払い額　'+GK.yen(st.net));return L.join('\n');
 }
 L.push(X.monY(st.m)+'分 送金明細（GANKI 賃貸管理）');L.push('送金予定日：'+GK.jp(st.payDate));L.push('対象の物件：'+st.props.join('、'));L.push('');
 L.push('■ 入金（家賃・共益費）');
 var any=false;
 st.lines.forEach(function(l){l.items.forEach(function(i){any=true;L.push('　'+l.room+'　'+(l.tenant?l.tenant+' 様　':'')+X.monY(i.month)+'分　'+GK.yen(i.amount))})});
 if(!any)L.push('　なし');
 if((st.otherItems||[]).length){L.push('■ 更新料・礼金');st.otherItems.forEach(function(x){L.push('　'+GK.roomLabel(x.unit)+'　'+x.use+'　'+GK.yen(x.amount))})}
 var un=st.lines.filter(function(l){return l.unpaid.length});
 if(un.length){L.push('■ 未入金（今回の送金には入りません）');un.forEach(function(l){L.push('　'+l.room+'　'+(l.tenant?l.tenant+' 様　':'')+l.unpaid.map(function(u){return X.monY(u.month)+'分 '+GK.yen(u.amount)}).join('、'))})}
 L.push('');
 L.push('集めた家賃・共益費　'+GK.yen(st.collected));
 if(st.others)L.push('更新料・礼金　'+GK.yen(st.others));
 (st.fees||[]).forEach(function(f){L.push((st.fees.length>1?f.name+' ':'')+f.basis+'　−'+GK.yen(f.fee))});
 if(st.tax)L.push('消費税（10%）　−'+GK.yen(st.tax));
 st.repairs.forEach(function(r){L.push('修繕費　'+GK.roomLabel(r.unit)+' '+r.label+'　−'+GK.yen(r.amount))});
 if(st.remitFee)L.push('振込手数料　−'+GK.yen(st.remitFee));
 if(st.carry)L.push('前月からの繰り越し　'+GK.yen(st.carry));
 L.push(X.netText(st.net,'送金額　'));
 return L.join('\n');
};
X.netText=function(net,lbl){return net>0?(lbl||'')+GK.yen(net):net<0?'今月は送金なし（次月に繰り越し '+GK.yen(net)+'）':'今月は送金なし'};
/* statements not sent yet that have money to send: [{key, kind, owner}] */
X.unsentOwners=function(m){return X.remitTargets(m).filter(function(t){var r=X.remitOf(m,t.key);if(r.state==='sent')return false;var s=X.shown(m,t.key);return s&&s.net>0})};
/* transfers due this calendar month (last month's statements) and not marked sent */
X.dueUnsent=function(){
 var pm=X.addMonth(X.cur(),-1);if(!X.hasMonth(pm))return [];
 var by={},out=[];
 X.unsentOwners(pm).forEach(function(t){
  var r=X.remitOf(pm,t.key),d=r.state!=='draft'&&r.snap&&r.snap.payDate?r.snap.payDate:X.payDate(pm,t.owner.id),k=t.kind==='lease'?'借上賃料':'オーナー送金';
  var x=by[t.owner.id];if(!x){x=by[t.owner.id]={owner:t.owner,key:t.key,kind:t.kind,kinds:[],m:pm,date:d};out.push(x)}
  if(x.kinds.indexOf(k)<0)x.kinds.push(k);if(d<x.date)x.date=d;
 });
 return out;
};
function kindLabel(key){return /^L:/.test(key)?'借上賃料':'オーナー送金'}
function remitSet(m,key,fn,label){
 var M=X.month(m),o=GK.owner(keyOwner(key));if(!o)return {ok:false,msg:'オーナーが見つかりません。'};
 var prev=clone(M.remit[key]||null),e=fn(M);if(e)return {ok:false,msg:e};
 var le=logIt(label);save();
 return {ok:true,undo:function(){var M2=X.month(m);if(prev)M2.remit[key]=clone(prev);else delete M2.remit[key];unlog(le);save()}};
}
X.remitFix=function(m,key){
 var st=X.stmt(m,key);if(!st)return {ok:false,msg:'オーナーが見つかりません。'};
 if(st.pending)return {ok:false,msg:'この方の部屋に、確認待ちの入出金が '+st.pending+'件あります。先に「入出金の確認」で確認してください。'};
 return remitSet(m,key,function(M){var r=M.remit[key];if(r&&r.state!=='draft')return '明細はもう確定しています。';M.remit[key]={state:'fixed',snap:clone(st),fixedAt:now(),fixedBy:GK.ME};return ''},
  kindLabel(key)+'：'+st.name+' 様 '+X.monY(m)+'分の明細を確定（'+(st.net>0?GK.yen(st.net):'送金なし')+'）');
};
X.remitUnfix=function(m,key){
 var o=GK.owner(keyOwner(key));
 return remitSet(m,key,function(M){var r=M.remit[key];if(!r||r.state!=='fixed')return '確定していない明細です。';M.remit[key]={state:'draft'};return ''},kindLabel(key)+'：'+(o?o.n:'')+' 様 '+X.monY(m)+'分の明細の確定を取り消し');
};
X.remitSent=function(m,key){
 var o=GK.owner(keyOwner(key));
 return remitSet(m,key,function(M){var r=M.remit[key];if(!r||r.state!=='fixed')return '先に明細を確定してください。';if(!r.snap||!(r.snap.net>0))return '今月は送金がありません。';r.state='sent';r.sentAt=now();r.sentBy=GK.ME;return ''},
  kindLabel(key)+'：'+(o?o.n:'')+' 様 '+X.monY(m)+'分を送金済みにしました');
};
X.remitUnsent=function(m,key){
 var o=GK.owner(keyOwner(key));
 return remitSet(m,key,function(M){var r=M.remit[key];if(!r||r.state!=='sent')return '送金済みではありません。';r.state='fixed';delete r.sentAt;delete r.sentBy;return ''},kindLabel(key)+'：'+(o?o.n:'')+' 様 '+X.monY(m)+'分の送金済みを取り消し');
};

/* ---------- 総合振込 (全銀協フォーマット, 120 characters per record, half-width kana) ---------- */
/* DEMO: the owners' banks are fictitious, so the codes come from this table (production: a bank/branch code service) */
var BANKS={'架空銀行':{code:'9901',kana:'ｶｸｳ',br:{'本店':['001','ﾎﾝﾃﾝ'],'南町支店':['101','ﾐﾅﾐﾏﾁ'],'東町支店':['102','ﾋｶﾞｼﾏﾁ']}},
 '架空信用金庫':{code:'9902',kana:'ｶｸｳｼﾝｷﾝ',br:{'本店':['001','ﾎﾝﾃﾝ'],'桜台支店':['201','ｻｸﾗﾀﾞｲ']}}};
X.BANKS=BANKS;
X.parseBank=function(s){
 var t=nf(s).trim().replace(/\s+/g,' ');if(!t)return {ok:false,msg:'送金先の口座が登録されていません'};
 var m=/^(\S+?)\s+(\S+?)\s+(普通|当座|貯蓄)\s+(\d{1,7})$/.exec(t);
 if(!m)return {ok:false,msg:'送金先の口座の書き方が読めません（例：架空銀行 南町支店 普通 1234567）'};
 var b=BANKS[m[1]];if(!b)return {ok:false,msg:'銀行コードが分かりません（'+m[1]+'）'};
 var br=b.br[m[2]];if(!br)return {ok:false,msg:'支店コードが分かりません（'+m[1]+' '+m[2]+'）'};
 return {ok:true,bank:m[1],branch:m[2],type:m[3],typeCode:m[3]==='普通'?'1':m[3]==='当座'?'2':'4',acct:pad7(m[4]),bankCode:b.code,bankKana:b.kana,branchCode:br[0],branchKana:br[1]};
};
function pad7(s){return ('0000000'+s).slice(-7)}
var FWK='アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンァィゥェォャュョッヮヵヶー',
    HWK='ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝｱｲｳｴｵﾔﾕﾖﾂﾜｶｹ-';
var DAK='ガギグゲゴザジズゼゾダヂヅデドバビブベボ',DAKB='カキクケコサシスセソタチツテトハヒフヘホ',HAN='パピプペポ',HANB='ハヒフヘホ';
/* half-width kana for the bank (small kana become large; 株式会社 → ｶ) ); '' when a character cannot be sent */
X.hankaku=function(s,corpName){
 var t=nf(s).replace(/[ぁ-ゖ]/g,function(c){return String.fromCharCode(c.charCodeAt(0)+0x60)}).toUpperCase(),o='';
 for(var i=0;i<t.length;i++){var c=t.charAt(i),k;
  if((k=DAK.indexOf(c))>=0)o+=HWK.charAt(FWK.indexOf(DAKB.charAt(k)))+'ﾞ';
  else if((k=HAN.indexOf(c))>=0)o+=HWK.charAt(FWK.indexOf(HANB.charAt(k)))+'ﾟ';
  else if(c==='ヴ')o+='ｳﾞ';
  else if((k=FWK.indexOf(c))>=0)o+=HWK.charAt(k);
  else if(/[0-9A-Z ().\-\/,]/.test(c))o+=c;
  else if(/[ｦ-ﾟ]/.test(c))o+=({'ｧ':'ｱ','ｨ':'ｲ','ｩ':'ｳ','ｪ':'ｴ','ｫ':'ｵ','ｬ':'ﾔ','ｭ':'ﾕ','ｮ':'ﾖ','ｯ':'ﾂ'}[c]||c);
  else if(c==='　'||c==='・')o+=' ';
  else return '';
 }
 o=o.replace(/\s+/g,' ').trim();
 var n=nf(corpName||''),has=/^(ｶ|ﾕ|ﾄﾞ|ｼﾔ|ｻﾞｲ|ｶﾞｸ|ｲ)\)/.test(o)||/\((ｶ|ﾕ|ﾄﾞ)$/.test(o);
 if(has)return o;
 if(/^株式会社/.test(n))o='ｶ)'+o;else if(/株式会社$/.test(n))o=o+'(ｶ';else if(/^有限会社/.test(n))o='ﾕ)'+o;else if(/有限会社$/.test(n))o=o+'(ﾕ';
 return o;
};
function fit(s,n){s=String(s||'');return (s+new Array(n+1).join(' ')).slice(0,n)}
function zero(v,n){return (new Array(n+1).join('0')+String(Math.max(0,Math.round(+v||0)))).slice(-n)}
X.zenginOk=function(line){return line.length===120&&/^[0-9A-Z ｦ-ﾟ().\-\/,]*$/.test(line)};
/* {text, lines, included:[{owner,name,amount,date}], excluded:[{owner,name,amount,reason}], total} */
/* opt.all (added 2026-10-19 for 経理への引継ぎ): also the statements already marked 送金済み (the record of what was sent) */
X.zengin=function(m,opt){
 var S=X.settings(),it=S.itaku,inc=[],exc=[],withSent=!!(opt&&opt.all);
 X.remitTargets(m).forEach(function(tg){
  var o=tg.owner,r=X.remitOf(m,tg.key),kind=tg.kind==='lease'?'借上賃料':'オーナー送金';if(!(r.state==='fixed'||(withSent&&r.state==='sent'))||!r.snap||!(r.snap.net>0))return;
  var b=X.parseBank(o.bank),name=X.hankaku(o.k||'',o.n);
  if(!b.ok){exc.push({owner:o.id,key:tg.key,kind:kind,name:o.n,amount:r.snap.net,reason:b.msg});return}
  if(!name){exc.push({owner:o.id,key:tg.key,kind:kind,name:o.n,amount:r.snap.net,reason:'受取人名（フリガナ）が未登録か、銀行に送れない文字があります'});return}
  if(name.length>30)name=name.slice(0,30);
  inc.push({owner:o.id,key:tg.key,kind:kind,name:o.n,amount:r.snap.net,date:r.snap.payDate,b:b,kana:name});
 });
 var errs=[];
 if(!/^\d{10}$/.test(String(it.code||'')))errs.push('委託者コードは10けたの数字にしてください（設定）');
 if(!X.hankaku(it.name||''))errs.push('委託者名を半角カナで入れてください（設定）');
 if(!/^\d{4}$/.test(String(it.bank||''))||!/^\d{3}$/.test(String(it.branch||''))||!/^\d{1,7}$/.test(String(it.acct||'')))errs.push('振込元の口座（銀行コード4けた・支店コード3けた・口座番号7けた）を確かめてください（設定）');
 var files=[],all=[],total=0;
 if(inc.length&&!errs.length){
  var dates={};inc.forEach(function(x){(dates[x.date]=dates[x.date]||[]).push(x)});
  Object.keys(dates).sort().forEach(function(d){
   var list=dates[d],sum=0,lines=[];
   lines.push('1'+'21'+'0'+zero(it.code,10)+fit(X.hankaku(it.name),40)+d.slice(5,7)+d.slice(8,10)+zero(it.bank,4)+fit(X.hankaku(it.bankKana),15)+zero(it.branch,3)+fit(X.hankaku(it.branchKana),15)+(String(it.type)==='2'?'2':'1')+zero(it.acct,7)+fit('',17));
   list.forEach(function(x){sum+=x.amount;
    lines.push('2'+x.b.bankCode+fit(x.b.bankKana,15)+x.b.branchCode+fit(x.b.branchKana,15)+fit('',4)+x.b.typeCode+x.b.acct+fit(x.kana,30)+zero(x.amount,10)+'0'+fit('',10)+fit('',10)+'7'+' '+fit('',7));
   });
   lines.push('8'+zero(list.length,6)+zero(sum,12)+fit('',101));
   lines.push('9'+fit('',119));
   total+=sum;all=all.concat(lines);
   files.push({date:d,count:list.length,total:sum,lines:lines,text:lines.join('\r\n')+'\r\n',names:list.map(function(x){return x.name})});
  });
 }
 /* one file per 送金日 (header … trailer + end record); every record ends with CRLF */
 return {files:files,lines:all,text:files.map(function(x){return x.text}).join(''),included:inc,excluded:exc,errors:errs,total:total};
};

/* ---------- close ---------- */
X.blockers=function(m){
 var s=X.summary(m),out=[];
 if(!s.rows)out.push({k:'nobank',t:'口座のCSVがまだありません。「取り込み」から入れてください。',tab:'import'});
 if(s.none)out.push({k:'none',t:'要確認の入出金が '+s.none+'件あります。',tab:'check',f:'none'});
 if(s.auto)out.push({k:'auto',t:'確認待ちの入出金が '+s.auto+'件あります（自動で紐付けた行も、確認が必要です）。',tab:'check',f:'auto'});
 if(!s.mfLoaded)out.push({k:'nomf',t:'マネーフォワードのCSVがまだありません。「取り込み」から入れてください。',tab:'import'});
 else if(s.bankSub)out.push({k:'mf',t:'MFの口座の補助科目（『'+s.bankSub+'』）が、設定の口座名と違います。「MFとの照合」で設定を合わせてください。',tab:'mf'});
 else if(s.mf)out.push({k:'mf',t:'マネーフォワードとの食い違いが '+s.mf+'件あります。',tab:'mf'});
 return out;
};
X.close=function(m){
 var M=X.month(m);if(M.closed)return {ok:false,msg:X.mon(m)+'はもう締めてあります。'};
 var b=X.blockers(m);if(b.length)return {ok:false,msg:'まだ締められません：'+b.map(function(x){return x.t}).join(' ')};
 var S=clone(X.settings());delete S.itaku;delete S.remitDay;
 M.closed={at:GK.TODAY,by:GK.ME,settings:S};M.closeLog.push({at:now(),by:GK.ME,act:'close'});
 var le=logIt(X.monY(m)+'の入出金を締めました');save();
 return {ok:true,undo:function(){var M2=X.month(m);M2.closed=null;M2.closeLog.push({at:now(),by:GK.ME,act:'undo'});unlog(le);save()}};
};
X.reopen=function(m,reason){
 reason=String(reason||'').replace(/\s+/g,' ').trim();
 var M=X.month(m);if(!M.closed)return {ok:false,msg:'締めていない月です。'};
 if(!reason)return {ok:false,msg:'締めを解除する理由を書いてください。'};
 var prev=clone(M.closed);M.closed=null;M.closeLog.push({at:now(),by:GK.ME,act:'reopen',reason:reason});
 var le=logIt(X.monY(m)+'の締めを解除しました（理由：'+reason+'）');save();
 return {ok:true,undo:function(){
  var b=X.blockers(m);if(b.length)return {ok:false,msg:'締めた状態に戻せません：'+b.map(function(x){return x.t}).join(' ')};
  var M2=X.month(m);M2.closed=prev;M2.closeLog.push({at:now(),by:GK.ME,act:'undo'});unlog(le);save();return {ok:true};
 }};
};

/* ---------- CSV ---------- */
X.parseCSV=function(text){
 text=String(text||'').replace(/^﻿/,'');
 var rows=[],row=[],cell='',q=false;
 for(var i=0;i<text.length;i++){var c=text.charAt(i);
  if(q){if(c==='"'){if(text.charAt(i+1)==='"'){cell+='"';i++}else q=false}else cell+=c;continue}
  if(c==='"'){q=true;continue}
  if(c===','){row.push(cell);cell='';continue}
  if(c==='\r')continue;
  if(c==='\n'){row.push(cell);rows.push(row);row=[];cell='';continue}
  cell+=c;
 }
 if(cell!==''||row.length){row.push(cell);rows.push(row)}
 return rows.filter(function(r){return r.some(function(x){return String(x).trim()})});
};
function hd(s){return nf(s).replace(/\s/g,'')}
function toDate(s){
 s=nf(s).trim().replace(/[年月\/.]/g,'-').replace(/日/,'');
 var m=/^(\d{4})-?(\d{1,2})-?(\d{1,2})/.exec(s);if(!m)return '';
 var d=m[1]+'-'+pad(m[2])+'-'+pad(m[3]);return GK.parse(d)?d:'';
}
function toNum(s){s=nf(s).replace(/[,円\s¥]/g,'').replace(/^[△▲]/,'-').replace(/[−－‐ー]/g,'-');if(s===''||s==='-')return null;var n=+s;return isFinite(n)?Math.round(n):null}
X.garbled=function(text){var t=String(text||'');return /\uFFFD/.test(t)||/[\u0080-\u009f]/.test(t)};
/* file bytes → text: UTF-8 first, Shift_JIS (Excel's usual CSV) when UTF-8 comes out garbled. {text, enc} — enc '' when neither works */
X.decodeBytes=function(buf){
 var dec=function(enc){try{return new TextDecoder(enc).decode(buf)}catch(e){return null}};
 var u=dec('utf-8');if(u!=null&&!X.garbled(u))return {text:u,enc:'UTF-8'};
 var s=dec('shift_jis');if(s!=null&&!X.garbled(s))return {text:s,enc:'Shift_JIS'};
 return {text:u==null?'':u,enc:''};
};
/* {kind:'bank'|'mf'|'', rows:[...], bad:n} */
X.readCSV=function(text){
 var R=X.parseCSV(text),hi=-1,kind='',H=null;
 for(var i=0;i<Math.min(R.length,8);i++){
  var h=R[i].map(hd);
  if(h.indexOf('取引日')>=0&&h.indexOf('借方勘定科目')>=0&&h.indexOf('貸方勘定科目')>=0){hi=i;kind='mf';H=h;break}
  if(h.indexOf('取引日')>=0&&(h.indexOf('入出金(円)')>=0||h.indexOf('入出金')>=0||h.indexOf('入金')>=0||h.indexOf('入金金額(円)')>=0||h.indexOf('入金額')>=0)){hi=i;kind='bank';H=h;break}
 }
 if(!kind)return {kind:'',rows:[],bad:0};
 var col=function(names){for(var j=0;j<names.length;j++){var k=H.indexOf(names[j]);if(k>=0)return k}return -1};
 var out=[],bad=0;
 if(kind==='bank'){
  var cd=col(['取引日']),ca=col(['入出金(円)','入出金']),ci=col(['入金','入金金額(円)','入金額','入金金額']),co=col(['出金','出金金額(円)','出金額','出金金額']),cb=col(['取引後残高','取引後残高(円)','残高','残高(円)']),cn=col(['入出金内容','内容','摘要','お取引内容','取引内容']);
  if(ca<0&&ci<0)return {kind:'',rows:[],bad:0};
  R.slice(hi+1).forEach(function(r){
   var d=toDate(r[cd]),amt=null;
   if(ca>=0)amt=toNum(r[ca]);else{var a=toNum(r[ci])||0,b=toNum(r[co])||0;amt=a-b;if(!a&&!b)amt=null}
   if(!d||amt===null||amt===0){bad++;return}
   out.push({date:d,amount:amt,name:cn>=0?String(r[cn]||'').trim():'',bal:cb>=0?toNum(r[cb]):null});
  });
 }else{
  var g=function(n){return col([n])},cols={no:col(['取引No','取引番号','No']),d:g('取引日'),da:g('借方勘定科目'),ds:g('借方補助科目'),dd:g('借方部門'),dm:col(['借方金額(円)','借方金額']),ca2:g('貸方勘定科目'),cs:g('貸方補助科目'),cd2:g('貸方部門'),cm:col(['貸方金額(円)','貸方金額']),memo:g('摘要')};
  var v=function(r,k){return cols[k]>=0?nf(r[cols[k]]||'').trim():''};
  R.slice(hi+1).forEach(function(r){
   var d=toDate(v(r,'d'));if(!d){bad++;return}
   var dr={acct:v(r,'da'),sub:v(r,'ds'),dept:v(r,'dd'),amt:toNum(v(r,'dm'))||0},cr={acct:v(r,'ca2'),sub:v(r,'cs'),dept:v(r,'cd2'),amt:toNum(v(r,'cm'))||0};
   if(!dr.acct&&!cr.acct){bad++;return}
   out.push({no:v(r,'no'),date:d,dr:dr,cr:cr,memo:v(r,'memo')});
  });
 }
 return {kind:kind,rows:out,bad:bad};
};
function bankKey(r){return [r.date,r.amount,nf(r.name).replace(/\s/g,''),r.bal==null?'':r.bal].join('|')}
function mfKey(f){return [f.no,f.date,f.dr.acct,f.dr.sub,f.dr.dept,f.dr.amt,f.cr.acct,f.cr.sub,f.cr.dept,f.cr.amt,f.memo].join('|')}
/* key + occurrence number, so two identical lines in one file both count */
function keyed(list,fn){var seen={};return list.map(function(x){var k=fn(x);seen[k]=(seen[k]||0)+1;return k+'#'+seen[k]})}
function snapMonth(m){var M=X.month(m);return clone(M)}
function restoreMonth(m,snap){
 var r=X.ensure(),M=X.month(m);
 Object.keys(M.links).forEach(function(id){var L=M.links[id],row=GK.by(M.bank,id);if(L&&L.state==='ok'&&row)revertLink(row,L)});
 r.months[m]=fixMonth(clone(snap));var N=r.months[m];
 Object.keys(N.links).forEach(function(id){var L=N.links[id],row=GK.by(N.bank,id);if(L&&L.state==='ok'&&row){L.applied=[];L.repairs=[];applyLink(row,L,true)}});
}
/* import one CSV text into month m. Returns {ok, kind, msg, lines:[...], undo} (msg in plain words) */
X.importText=function(m,text,file){
 file=String(file||'').slice(0,120);
 if(X.garbled(text))return {ok:false,garbled:true,msg:'文字化けしています。CSVをUTF-8で保存し直してください。'};
 var p=X.readCSV(text);
 if(!p.kind)return {ok:false,msg:'列の名前が読み取れませんでした。楽天銀行の「入出金明細」のCSVか、マネーフォワード クラウド会計の「仕訳帳」「総勘定元帳」のCSVを選んでください。'};
 var M=X.month(m);
 if(M.closed)return {ok:false,kind:p.kind,msg:closedMsg(m)};
 var mine=p.rows.filter(function(r){return r.date.slice(0,7)===m}),other=p.rows.length-mine.length;
 var otherMsg=other?'ほかの月の行が '+other+'件あります（その月を選んでから、もう一度取り込んでください）。':'';
 if(!mine.length)return {ok:false,kind:p.kind,msg:(p.rows.length?X.monY(m)+'の行がありません。'+otherMsg:'読み取れる行がありません。')};
 var snap=snapMonth(m),info=[],dates=mine.map(function(r){return r.date}).sort(),S=X.settings();
 if(p.kind==='bank'){
  var wasSample=!!M.sample.bank;
  if(wasSample){restoreMonth(m,blankMonth());M=X.month(m);M.mf=snap.mf;M.sample.mf=snap.sample.mf;M.imports=snap.imports.filter(function(i){return i.kind==='mf'});M.remit=snap.remit;M.closeLog=snap.closeLog}
  var have={};keyed(M.bank,bankKey).forEach(function(k){have[k]=1});
  var keys=keyed(mine,bankKey),add=[],dup=0,seq=M.bank.length;
  mine.forEach(function(r,i){if(have[keys[i]]){dup++;return}seq++;add.push({id:'b'+m.replace('-','')+'-'+Date.now().toString(36)+'-'+seq,date:r.date,amount:r.amount,name:r.name,bal:r.bal,key:keys[i]})});
  if(!add.length){if(wasSample)restoreMonth(m,snap);return {ok:false,kind:'bank',dup:true,msg:'取り込み済みです（同じ '+dup+'行がもう入っています）。'}}
  M.bank=M.bank.concat(add);M.sample.bank=false;
  autoLink(m,add.map(function(r){return r.id}));
  M.imports.push({kind:'bank',at:now(),by:GK.ME,file:file,count:add.length,from:dates[0],to:dates[dates.length-1],account:S.bankName,sample:false});
  info.push('口座の入出金を '+add.length+'件 取り込みました（'+GK.sd(dates[0])+'〜'+GK.sd(dates[dates.length-1])+'・口座：'+S.bankName+'）。');
  if(dup)info.push(dup+'件は取り込み済みなので飛ばしました。');
  if(wasSample)info.push('見本の明細は消して、取り込んだ明細に入れ替えました。');
 }else{
  var nowKeys=keyed(M.mf,mfKey).sort().join('\n'),newKeys=keyed(mine,mfKey).sort().join('\n');
  if(M.mf.length&&nowKeys===newKeys&&!M.sample.mf)return {ok:false,kind:'mf',dup:true,msg:'取り込み済みです（前に取り込んだMFのCSVと同じ内容です）。'};
  var wasS=!!M.sample.mf,n=0;
  M.mf=mine.map(function(f){n++;return {id:'f'+m.replace('-','')+'-'+Date.now().toString(36)+'-'+n,no:f.no,date:f.date,dr:f.dr,cr:f.cr,memo:f.memo}});
  M.sample.mf=false;
  M.imports.push({kind:'mf',at:now(),by:GK.ME,file:file,count:mine.length,from:dates[0],to:dates[dates.length-1],account:'',sample:false});
  info.push('マネーフォワードの仕訳を '+mine.length+'行 取り込みました（'+GK.sd(dates[0])+'〜'+GK.sd(dates[dates.length-1])+'）。'+(wasS?'見本の仕訳と入れ替えました。':snap.mf.length?'前に取り込んだ分と入れ替えました。':''));
 }
 if(p.bad)info.push('読み取れない行が '+p.bad+'行ありました（日付や金額が空の行）。');
 if(otherMsg)info.push(otherMsg);
 var le=logIt((p.kind==='bank'?'口座のCSV':'MFのCSV')+'を取り込み（'+X.monY(m)+'・'+(file||'ファイル名なし')+'）');
 save();
 return {ok:true,kind:p.kind,msg:info.join(''),lines:info,undo:function(){restoreMonth(m,snap);unlog(le);save()}};
};

/* DEMO: an MF 仕訳帳 CSV as the accountant would have it after fixing everything (built from the current links of month m).
   Rows not linked yet go in as 仮受金 / 仮払金, so they still need 「入出金の確認」. */
X.demoMfCsv=function(m){
 var S=setFor(m),out=[],no=0,q=function(v){return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'};
 X.rows(m).forEach(function(x){
  var bk=[S.bankAcct,S.bankName,''],abs=Math.abs(x.row.amount),memo=(x.dir==='in'?'入金 ':'出金 ')+nf(x.row.name);no++;
  var lines=(x.state==='auto'||x.state==='ok')&&x.link.allocs.length?x.link.allocs.map(function(a){var o=X.expect(a,S,x.dir).other;return {o:[o.acct,o.sub,o.dept],amt:a.amount}}):[{o:[x.dir==='in'?'仮受金':'仮払金','',''],amt:abs}];
  var sum=lines.reduce(function(s,l){return s+l.amt},0);if(sum<abs)lines[0].amt+=abs-sum;
  lines.forEach(function(l){var d=l.o.concat([l.amt]),b=bk.concat([l.amt]);out.push([no,x.row.date].concat(x.dir==='in'?b.concat(d):d.concat(b)).concat([memo]))});
 });
 return '取引No,取引日,借方勘定科目,借方補助科目,借方部門,借方金額(円),貸方勘定科目,貸方補助科目,貸方部門,貸方金額(円),摘要\r\n'+out.map(function(r){return r.map(q).join(',')}).join('\r\n');
};
/* ---------- settings save ---------- */
X.saveSettings=function(next){
 var r=X.ensure(),prev=clone(r.settings);r.settings=fixSettings(clone(next));
 var le=logIt('入出金の設定を変更しました');save();
 return {ok:true,undo:function(){X.ensure().settings=fixSettings(clone(prev));unlog(le);save()}};
};

/* ---------- sample months (fictitious; deterministic, generated in memory) ---------- */
function seedSample(root){
 var c=X.cur(),pm=X.addMonth(c,-1),S=root.settings;
 root.months[pm]=blankMonth();root.months[c]=blankMonth();
 var P=root.months[pm],C=root.months[c];
 var leaseOf=function(unit){return GK.activeLease(unit)};
 /* last month: 4 rent deposits, all confirmed, MF matches, closed; 山本 様 sent, 森 様 fixed (to send this month) */
 var bal0=2318000;
 var prow=[['26','ﾀﾅｶ ﾕｳｺ',75000,'GK-0123-203'],['27','ﾏﾂﾓﾄ ﾀﾞｲｽｹ',77000,'GK-0123-305'],['27','ﾅｶﾑﾗ ﾘﾖｳ',65000,'GK-0457-201'],['27','ﾔﾏﾀﾞ ﾀﾛｳ',63000,'GK-0311-301']];
 prow.forEach(function(x,i){
  bal0+=x[2];var id='b'+pm.replace('-','')+'-s'+pad(i+1),l=leaseOf(x[3]);
  P.bank.push({id:id,date:pm+'-'+x[0],amount:x[2],name:x[1],bal:bal0,key:''});
  var al=[{unit:x[3],lease:l?l.id:'',month:pm,use:'家賃',amount:x[2]}];
  P.links[id]={allocs:al,state:'ok',reasons:['名義一致','金額一致'],conf:'high',by:'佐藤',at:GK.addDays(c+'-01',2)+' 10:0'+i,applied:[],repairs:[],auto:{allocs:clone(al),reasons:['名義一致','金額一致'],conf:'high'}};
 });
 P.bank.forEach(function(r,i){var L=P.links[r.id],e=X.expect(L.allocs[0],S,'in');
  P.mf.push({id:'f'+pm.replace('-','')+'-s'+pad(i+1),no:String(i+1),date:r.date,dr:{acct:e.bank.acct,sub:e.bank.sub,dept:'',amt:r.amount},cr:{acct:e.other.acct,sub:e.other.sub,dept:e.other.dept,amt:r.amount},memo:'家賃 '+r.name})});
 P.sample={bank:true,mf:true};
 P.imports.push({kind:'bank',at:GK.addDays(c+'-01',2)+' 09:30',by:'佐藤',file:'見本',count:P.bank.length,from:P.bank[0].date,to:P.bank[P.bank.length-1].date,account:S.bankName,sample:true});
 P.imports.push({kind:'mf',at:GK.addDays(c+'-01',3)+' 16:10',by:'佐藤',file:'見本',count:P.mf.length,from:P.mf[0].date,to:P.mf[P.mf.length-1].date,account:'',sample:true});
 var st1=X.statement(pm,'o1',1),st3=X.statement(pm,'o3',1);
 P.remit.o1={state:'sent',snap:clone(st1),fixedAt:GK.addDays(c+'-01',2)+' 11:00',fixedBy:'佐藤',sentAt:X.payDate(pm,'o1')+' 10:15',sentBy:'佐藤'};
 P.remit.o3={state:'fixed',snap:clone(st3),fixedAt:GK.addDays(c+'-01',2)+' 11:05',fixedBy:'佐藤'};
 var stL=X.leaseStatement(pm,'o2');
 if(stL)P.remit['L:o2']={state:'sent',snap:clone(stL),fixedAt:GK.addDays(c+'-01',2)+' 11:10',fixedBy:'佐藤',sentAt:X.payDate(pm,'o2')+' 10:20',sentBy:'佐藤'};
 var cs=clone(S);delete cs.itaku;delete cs.remitDay;
 P.closed={at:GK.addDays(c+'-01',4),by:'佐藤',settings:cs};P.closeLog.push({at:GK.addDays(c+'-01',4)+' 17:20',by:'佐藤',act:'close'});
 /* this month: every case the screen has to handle */
 var b=2598000,rows=[
  ['10','ﾌﾘｺﾐ ﾔﾏﾓﾄ ｲﾁﾛｳ',-st1.net],          /* オーナー送金（先月分・金額一致） */
  ['10','ﾌﾘｺﾐﾃｽｳﾘｮｳ',-165],                  /* 振込手数料 */
  ['12','ﾌﾘｺﾐ ﾐｽﾞﾃﾂｸｾﾂﾋﾞ',-88000],            /* 修繕費（給湯器交換・日付ずれ3日） */
  ['13','ﾌﾘｺﾐ ｻｸﾗﾃﾞﾝｷ',-12100],               /* 修繕費（サブリースの物件＝会社の費用） */
  ['14','ｶﾞﾝｷﾎｼｮｳ(ｶ',136000],                 /* 保証会社が2人分をまとめて立替え */
  ['14','ｶﾄｳ ﾏｺﾄ',57000],                     /* 半角カナの名義一致 */
  ['14','ﾓﾘﾀ ｼﾖｳ',90000],                     /* 名義・金額一致（MFは金額違い） */
  ['15','ｻｲﾄｳ ﾕﾐ',30000],                     /* 一部入金 */
  ['15','ﾅｶﾑﾗ ﾘﾖｳ',65000],                    /* 一致（MFは補助科目違い） */
  ['15','ﾔﾏﾀﾞ ﾀﾛｳ',63000],                    /* 一致 */
  ['15','ｷﾑﾗ ﾅｵﾐ',140000],                    /* 2か月分 */
  ['16','カ）ヒカリケンセツ',120000],          /* 名義が分からない → 要確認 */
  ['16','ｺﾊﾞﾔｼ ﾒｸﾞﾐ',103000],                 /* 一致（MFは部門違い） */
  ['16','ﾀﾅｶ ﾕｳｺ',75000],                     /* 一致（MFは勘定科目違い） */
  ['16','ﾏﾂﾓﾄ ﾀﾞｲｽｹ',80000],                   /* 多い入金（前受け or 分ける） */
  ['10','ﾌﾘｺﾐ ｻｸﾗﾌﾄﾞｳｻﾝ(ｶ',-(stL?stL.net:300000)] /* サブリースの借上賃料（先月分・金額一致） */
 ];
 rows.forEach(function(x,i){C.bank.push({id:'b'+c.replace('-','')+'-s'+pad(i+1),date:c+'-'+x[0],amount:x[2],name:x[1],bal:null,key:''})});
 C.bank.slice().sort(function(x,y){return x.date<y.date?-1:x.date>y.date?1:(x.id<y.id?-1:1)}).forEach(function(r){b+=r.amount;r.bal=b});
 autoLink(c);
 /* MoneyForward: what the accountant entered, with a few mistakes */
 var n=0,mf=function(date,dr,cr,memo,no){n++;C.mf.push({id:'f'+c.replace('-','')+'-s'+pad(n),no:no||String(100+n),date:date,dr:dr,cr:cr,memo:memo})};
 var bk=function(a){return {acct:S.bankAcct,sub:S.bankName,dept:'',amt:a}};
 var ac=function(o,a){return {acct:o.acct,sub:o.sub,dept:o.dept,amt:a}};
 C.bank.forEach(function(r,i){
  var L=C.links[r.id],k=i+1,abs=Math.abs(r.amount),memo=(r.amount>0?'入金 ':'出金 ')+nf(r.name);
  if(k===2)return;                                        /* 振込手数料: not entered in MF */
  if(k===12){mf(r.date,bk(abs),{acct:'仮受金',sub:'',dept:'',amt:abs},memo);return}
  var es=L.allocs.map(function(a){return X.expect(a,S,r.amount>0?'in':'out')});
  if(k===5){var no='505';mf(r.date,bk(abs),ac(es[0].other,es[0].amount),memo,no);mf(r.date,{acct:'',sub:'',dept:'',amt:0},ac(es[1].other,es[1].amount),memo,no);return}
  if(k===11||k===15){mf(r.date,bk(abs),ac(es[0].other,abs),memo);return}  /* one line for the whole deposit */
  var o=clone(es[0].other),amt=abs,date=r.date;
  if(k===7)amt=9000;                                       /* 金額が違う */
  if(k===9)o.sub='山本 一郎';                               /* 補助科目が違う */
  if(k===13)o.dept='ガンキハイツ南';                         /* 部門が違う */
  if(k===14){o.acct='売上高';o.sub='賃貸料収入'}              /* 勘定科目が違う */
  if(k===4)date=GK.addDays(r.date,1);                      /* 日付ずれ1日（一致） */
  if(r.amount>0)mf(date,bk(amt),ac(o,amt),memo);else mf(date,ac(o,amt),bk(amt),memo);
 });
 mf(c+'-08',bk(50000),{acct:'預り金',sub:'山本 一郎',dept:'ガンキハイツ南',amt:50000},'入金 ヤマモト（口座違い？）');  /* 口座にない */
 C.sample={bank:true,mf:true};
 C.imports.push({kind:'bank',at:GK.TODAY+' 09:05',by:'佐藤',file:'見本',count:C.bank.length,from:C.bank[0].date,to:C.bank[C.bank.length-1].date,account:S.bankName,sample:true});
 C.imports.push({kind:'mf',at:GK.TODAY+' 09:06',by:'佐藤',file:'見本',count:C.mf.length,from:c+'-08',to:C.mf[C.mf.length-1].date,account:'',sample:true});
}
/* ---------- DEMO history (added 2026-10-19 「ほかの月も見れるように」) ----------
   Fictitious, deterministic closed months for the 12 months before last month (2 … 13 months ago = the window of the
   管理部売上 demo history, Y.history), so 入出金 / 経理 can be browsed back like 管理部売上:
   4 rent deposits, all confirmed (名義一致・金額一致), MF rows that match, every owner statement 送金済み,
   closed by 佐藤 on the 5th of the next month. Marked sample:{bank,mf,demo:true} (money.html shows a one-line 見本 note).
   A month that already has anything (user data) is never touched. Runs once per store (r.demoHist); an older stored db
   gets it in memory and saves it with the next user action, like the other seeds. The 売上 of these months stays the
   管理部売上 demo history (Y.month kind 'demo'), so 管理部売上 and the 経理 package show the same totals. */
X.DEMO_HIST=13;
function seedHistory(root){
 var c=X.cur(),S=root.settings,made=[];
 var ROWS=[['26','ﾀﾅｶ ﾕｳｺ','GK-0123-203'],['27','ﾏﾂﾓﾄ ﾀﾞｲｽｹ','GK-0123-305'],['27','ﾅｶﾑﾗ ﾘﾖｳ','GK-0457-201'],['27','ﾔﾏﾀﾞ ﾀﾛｳ','GK-0311-301']];
 for(var k=X.DEMO_HIST;k>=2;k--){
  var m=X.addMonth(c,-k),nx=X.addMonth(m,1),old=root.months[m];
  if(old&&X.hasData(m))continue;          /* never overwrite what is there */
  if(GK.db.remits&&GK.db.remits.some(function(x){return x&&x.month===m}))continue;
  root.months[m]=blankMonth();var M=root.months[m],bal=1800000+(13-k)*21000;
  ROWS.forEach(function(x,i){
   var l=GK.activeLease(x[2]);if(!l||(l.start&&l.start>m+'-'+x[0]))return;
   var amt=(+l.rent||0)+(+l.fee||0);if(!(amt>0))return;
   bal+=amt;var id='b'+m.replace('-','')+'-d'+pad(i+1);
   M.bank.push({id:id,date:m+'-'+x[0],amount:amt,name:x[1],bal:bal,key:''});
   var al=[{unit:x[2],lease:l.id,month:m,use:'家賃',amount:amt}];
   M.links[id]={allocs:al,state:'ok',reasons:['名義一致','金額一致'],conf:'high',by:'佐藤',at:GK.addDays(nx+'-01',2)+' 10:0'+i,applied:[],repairs:[],auto:{allocs:clone(al),reasons:['名義一致','金額一致'],conf:'high'}};
  });
  if(!M.bank.length){delete root.months[m];continue}
  M.bank.forEach(function(r,i){var e=X.expect(M.links[r.id].allocs[0],S,'in');
   M.mf.push({id:'f'+m.replace('-','')+'-d'+pad(i+1),no:String(i+1),date:r.date,dr:{acct:e.bank.acct,sub:e.bank.sub,dept:'',amt:r.amount},cr:{acct:e.other.acct,sub:e.other.sub,dept:e.other.dept,amt:r.amount},memo:'家賃 '+r.name})});
  M.sample={bank:true,mf:true,demo:true};
  M.imports.push({kind:'bank',at:GK.addDays(nx+'-01',2)+' 09:30',by:'佐藤',file:'見本（デモの過去データ）',count:M.bank.length,from:M.bank[0].date,to:M.bank[M.bank.length-1].date,account:S.bankName,sample:true});
  M.imports.push({kind:'mf',at:GK.addDays(nx+'-01',3)+' 16:10',by:'佐藤',file:'見本（デモの過去データ）',count:M.mf.length,from:M.mf[0].date,to:M.mf[M.mf.length-1].date,account:'',sample:true});
  X.remitTargets(m).forEach(function(t){
   var st=t.kind==='lease'?X.leaseStatement(m,t.owner.id):X.statement(m,t.owner.id,1);if(!st)return;
   var R={state:'fixed',snap:clone(st),fixedAt:GK.addDays(nx+'-01',2)+' 11:00',fixedBy:'佐藤'};
   if(st.net>0){R.state='sent';R.sentAt=X.payDate(m,t.owner.id)+' 10:15';R.sentBy='佐藤'}
   M.remit[t.key]=R;
  });
  var cs=clone(S);delete cs.itaku;delete cs.remitDay;
  M.closed={at:GK.addDays(nx+'-01',4),by:'佐藤',settings:cs};M.closeLog.push({at:GK.addDays(nx+'-01',4)+' 17:20',by:'佐藤',act:'close'});
  made.push(m);
 }
 root.demoHist=1;
 return made;
}
X.isDemoMonth=function(m){var M=X.ensure().months[m];return !!(M&&M.sample&&M.sample.demo)};
})();
