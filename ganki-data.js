/* GANKI rental prototype — shared sample data, demo store and page shell.
   All people, properties, phone numbers and amounts are fictitious.
   The demo store lives in this browser only (localStorage), so changes made on one page show on the others. */
(function(){
var GK=window.GK={};
/* 社内検証用のデータ (local data mode, added 2026-10-19 「2-A」): ganki-local-data.js — only on the PC used for the check,
   never published — may define window.GK_LOCAL={today:'YYYY-MM-DD'|undefined, me:'<staff id>'|undefined, db:{…}} before
   this file runs (format: codex-handoff/local-data/FORMAT-GANKI-LOCAL-DATA.md). Then GK.LOCAL is true, the store key is
   'ganki-local-db-v1' (the demo store is never read or written), seed() returns a checked copy of GK_LOCAL.db
   (see 社内検証用のデータ below), no sample data is added by any page or module, and every page shows the 検証用 banner.
   Without the file (the published version) GK_LOCAL is undefined and everything below is exactly the demo. */
var LOC=null;try{var gl0=window.GK_LOCAL;if(gl0&&typeof gl0==='object'&&!Array.isArray(gl0))LOC=gl0}catch(e){}
GK.LOCAL=!!LOC;
function okDate(s){var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s==null?'':s));if(!m)return false;var d=new Date(+m[1],m[2]-1,+m[3]);return d.getFullYear()===+m[1]&&d.getMonth()===m[2]-1&&d.getDate()===+m[3]}
function realToday(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
GK.TODAY=LOC?(okDate(LOC.today)?LOC.today:realToday()):'2026-10-16';
GK.ME=LOC?'':'佐藤';

/* ---------- helpers ---------- */
GK.esc=function(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})};
GK.yen=function(n){n=Math.round(+n||0);return (n<0?'−':'')+'¥'+Math.abs(n).toLocaleString()};
GK.num=function(v){return +String(v==null?'':v).replace(/[^\d-]/g,'')||0};
function pad(n){return String(n).padStart(2,'0')}
GK.iso=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
GK.parse=function(s){var m=/^(\d{4})-(\d{2})-(\d{2})/.exec(s||'');return m?new Date(+m[1],m[2]-1,+m[3]):null};
GK.addDays=function(s,n){var d=GK.parse(s);if(!d)return '';d.setDate(d.getDate()+n);return GK.iso(d)};
GK.addYears=function(s,n){var d=GK.parse(s);if(!d)return '';var t=new Date(d.getFullYear()+n,d.getMonth(),d.getDate());if(t.getMonth()!==d.getMonth())t=new Date(d.getFullYear()+n,d.getMonth()+1,0);t.setDate(t.getDate()-1);return GK.iso(t)};
GK.days=function(a,b){var x=GK.parse(a),y=GK.parse(b);return x&&y?Math.round((y-x)/864e5):0};
GK.wd=function(s){var d=GK.parse(s);return d?'日月火水木金土'[d.getDay()]:''};
/* short date: 10/20, with the year only when it is not this year */
GK.sd=function(s){if(!s)return '未登録';var d=GK.parse(s);if(!d)return s;return (d.getFullYear()!==+GK.TODAY.slice(0,4)?d.getFullYear()+'/':'')+(d.getMonth()+1)+'/'+d.getDate()};
GK.sdw=function(s){return s?GK.sd(s)+'（'+GK.wd(s)+'）':'未登録'};
GK.jp=function(s){return s?s.replace(/-/g,'/'):''};
GK.norm=function(s){return String(s||'').normalize('NFKC').replace(/[\s　]/g,'').toLowerCase()};
GK.hit=function(q,parts){q=GK.norm(q);return !q||GK.norm(parts.join(' ')).indexOf(q)>=0};
GK.hl=function(s,q){s=GK.esc(s);q=(q||'').trim();if(!q)return s;var e=GK.esc(q),i=s.toLowerCase().indexOf(e.toLowerCase());return i<0?s:s.slice(0,i)+'<mark>'+s.slice(i,i+e.length)+'</mark>'+s.slice(i+e.length)};
/* masked phone: 090-****-7001. The number is put in the usual hyphen form first (GK.formatTel, below), so a number
   stored without hyphens (09000007001) is masked too; 0422-12-3456 -> 0422-**-3456 */
GK.mask=function(tel){
 if(!tel)return '';
 var t=typeof GK.formatTel==='function'?GK.formatTel(tel):String(tel);
 if(/-(\d{4})-/.test(t))return t.replace(/-(\d{4})-/,'-****-');
 var m=/^(.+)-(\d{1,3})-(\d{3,4})$/.exec(t);if(m)return m[1]+'-'+m[2].replace(/\d/g,'*')+'-'+m[3];
 return t.replace(/\d(?=\d{4})/g,'*');
};

/* ---------- 社内検証用のデータ: GK_LOCAL.db -> a checked store (local data mode only) ----------
   GK.localNormalize(src) -> {db, problems}. Every collection the pages read is filled with an empty default; a record that
   is not an object, has no id, repeats an id, lacks a required field, or points at a record that is not there (a room
   without its 物件, a contract without its room or 入居者, a 請求 without its contract …) is not read, and is listed.
   A field in the wrong shape is emptied / set to 0 and listed. The list names the data and the id only (never a name,
   phone or address), so it can be shown on the screen. Live checks of the current data: GK.localCheck(db). */
var L_STAT=['有効','終了','申込中','入居予定'],L_VAC=['','空室','募集中','申込あり','原状回復中'],L_ROLE=['担当者','経理','管理者','閲覧'];
GK.LOCAL_COLS={owners:'オーナー',props:'物件',units:'部屋',tenants:'入居者',leases:'契約',charges:'請求',repairs:'修繕',tasks:'やること',hist:'対応履歴',staff:'職員',money:'入出金',db:'ファイル全体'};
function roomOrder(a,b){var x=String(a),y=String(b),nx=parseInt(x,10),ny=parseInt(y,10);if(isFinite(nx)&&isFinite(ny)&&nx!==ny)return nx-ny;return x<y?-1:x>y?1:0}
GK.localNormalize=function(src){
 var P=[],e=function(kind,col,id,msg){P.push({kind:kind,col:col,id:String(id==null?'':id),msg:msg})};
 if(!src||typeof src!=='object'||Array.isArray(src)){e('drop','db','','GK_LOCAL.db がありません（ファイルの形を確かめてください）');src={}}
 var str=function(v){return v==null?'':String(v)};
 var num=function(v,col,id,f){if(v==null||v==='')return 0;var n=typeof v==='number'?v:+String(v).replace(/[,，¥￥円\s]/g,'');if(!isFinite(n)){e('warn',col,id,f+' が数字ではありません（0 にしました）');return 0}return n};
 var dOpt=function(v,col,id,f){var s=str(v).trim();if(!s)return '';if(okDate(s))return s;e('warn',col,id,f+' の日付の形が違います（YYYY-MM-DD。空にしました）');return ''};
 function list(name,req,fix){
  var a=src[name],seen={},out=[];
  if(a==null)return out;
  if(!Array.isArray(a)){e('drop',name,'',name+' が配列ではありません（読み込みませんでした）');return out}
  a.forEach(function(r,i){
   var at='#'+(i+1);
   if(!r||typeof r!=='object'||Array.isArray(r)){e('drop',name,at,(i+1)+'件目が項目のまとまり（{…}）ではありません');return}
   var id=str(r.id).trim();
   if(!id){e('drop',name,at,(i+1)+'件目に id がありません');return}
   if(seen[id]){e('drop',name,id,'id が重複しています（2件目以降は読み込みませんでした）');return}
   var miss=req.filter(function(k){return r[k]==null||str(r[k]).trim()===''});
   if(miss.length){e('drop',name,id,'必須の項目がありません：'+miss.join('・'));return}
   var c;try{c=JSON.parse(JSON.stringify(r))}catch(x){e('drop',name,id,'読めない値があります');return}
   c.id=id;
   if(fix&&fix(c,id)===false)return;
   seen[id]=1;out.push(c);
  });
  return out;
 }
 var byId=function(a){var m={};a.forEach(function(x){m[x.id]=x});return m};
 var staff=list('staff',['n'],function(s,id){s.n=str(s.n).trim();s.area=str(s.area);if(L_ROLE.indexOf(s.role)<0){if(s.role!=null&&s.role!=='')e('warn','staff',id,'role「'+str(s.role).slice(0,10)+'」は使えないので「閲覧」にしました');s.role='閲覧'}if(s.active!==false)delete s.active});
 if(!staff.length){staff.push({id:'s1',n:'検証用',role:'管理者',area:'検証'});e('warn','staff','s1','職員がいないので「検証用」（管理者）を作りました')}
 var owners=list('owners',['n'],function(o,id){['n','k','tel','mail','addr','bank'].forEach(function(k){o[k]=str(o[k])});if(o.fee!=null&&o.fee!=='')o.fee=num(o.fee,'owners',id,'fee');else delete o.fee});
 var OW=byId(owners);
 var props=list('props',['n'],function(p,id){
  if(/\s/.test(id)||id.split('-').length!==2)e('warn','props',id,'id は「GK-0001」のようにハイフン1つの形にしてください');
  p.n=str(p.n);p.owner=str(p.owner);p.addr=str(p.addr);p.type=str(p.type);
  p.since=dOpt(p.since,'props',id,'since');if(p.ended!=null){p.ended=dOpt(p.ended,'props',id,'ended');if(!p.ended)delete p.ended}
  if(!p.since)delete p.since;
  if(!p.owner)e('warn','props',id,'owner（オーナーの id）がありません');
  p.rooms=[];
 });
 var PR=byId(props);
 var units=list('units',['prop','no'],function(u,id){
  u.prop=str(u.prop);u.no=str(u.no).trim();
  if(!PR[u.prop]){e('drop','units',id,'prop「'+u.prop+'」の物件がありません（この部屋は読み込みませんでした）');return false}
  if(/[\s\-]/.test(u.no)){e('drop','units',id,'no（部屋番号）に空白かハイフンがあります');return false}
  if(id!==u.prop+'-'+u.no){e('drop','units',id,'id が「物件id-部屋番号」（'+u.prop+'-'+u.no+'）になっていません');return false}
  u.lay=str(u.lay);u.area=num(u.area,'units',id,'area');u.rent=num(u.rent,'units',id,'rent');u.fee=num(u.fee,'units',id,'fee');
  u.vacant=str(u.vacant);if(L_VAC.indexOf(u.vacant)<0)e('warn','units',id,'vacant「'+u.vacant.slice(0,10)+'」は決まった値ではありません');
 });
 var UN=byId(units);
 units.slice().sort(function(a,b){return roomOrder(a.no,b.no)}).forEach(function(u){PR[u.prop].rooms.push(u.no)});
 var tenants=list('tenants',['n'],function(t){['n','k','tel','mail','emName','emTel','work'].forEach(function(k){t[k]=str(t[k])});if(t.former)t.former=true;else delete t.former});
 var TE=byId(tenants);
 var leases=list('leases',['unit','tenant','start','status'],function(l,id){
  l.unit=str(l.unit);l.tenant=str(l.tenant);l.status=str(l.status).trim();
  if(!UN[l.unit]){e('drop','leases',id,'unit「'+l.unit+'」の部屋がありません（この契約は読み込みませんでした）');return false}
  if(!TE[l.tenant]){e('drop','leases',id,'tenant「'+l.tenant+'」の入居者がいません（この契約は読み込みませんでした）');return false}
  if(!okDate(l.start)){e('drop','leases',id,'start の日付の形が違います（この契約は読み込みませんでした）');return false}
  if(L_STAT.indexOf(l.status)<0&&l.status.indexOf('取消')!==0)e('warn','leases',id,'status「'+l.status.slice(0,12)+'」は決まった値ではありません');
  l.end=dOpt(l.end,'leases',id,'end');
  ['rent','fee','dep'].forEach(function(k){l[k]=num(l[k],'leases',id,k)});
  var pay=l.pay==null||l.pay===''?27:num(l.pay,'leases',id,'pay');l.pay=pay>=1&&pay<=31?Math.round(pay):27;
  l.gua=str(l.gua);if(l.renewal!=null)l.renewal=str(l.renewal);
  if(l.notice!=null){if(!l.notice||typeof l.notice!=='object'||!okDate(l.notice.date)){e('warn','leases',id,'notice の date がないので退去の連絡を外しました');delete l.notice}else{l.notice={date:l.notice.date,insp:str(l.notice.insp),received:okDate(l.notice.received)?l.notice.received:''}}}
  if(l.moveout!=null&&(typeof l.moveout!=='object'||Array.isArray(l.moveout))){e('warn','leases',id,'moveout の形が違うので外しました');delete l.moveout}
  if(l.renewals!=null&&!Array.isArray(l.renewals)){e('warn','leases',id,'renewals が配列ではないので外しました');delete l.renewals}
  if(l.agreedAt!=null){l.agreedAt=dOpt(l.agreedAt,'leases',id,'agreedAt');if(!l.agreedAt)delete l.agreedAt}
  if(l.startUnknown)l.startUnknown=true;else delete l.startUnknown;if(l.endUnknown)l.endUnknown=true;else delete l.endUnknown;
 });
 var LE=byId(leases);
 var charges=list('charges',['lease','month','due','amount'],function(c,id){
  c.lease=str(c.lease);if(!LE[c.lease]){e('drop','charges',id,'lease「'+c.lease+'」の契約がありません（この請求は読み込みませんでした）');return false}
  c.month=str(c.month);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(c.month)){e('drop','charges',id,'month の形が違います（YYYY-MM）');return false}
  if(!okDate(c.due)){e('drop','charges',id,'due の日付の形が違います');return false}
  c.amount=num(c.amount,'charges',id,'amount');c.paid=num(c.paid,'charges',id,'paid');
  if(c.arrear==null)c.arrear=c.due<GK.TODAY&&c.paid<c.amount;else c.arrear=!!c.arrear;
  if(!c.arrear)delete c.arrear;
 });
 var repairs=list('repairs',['unit','date','t','amount'],function(r,id){
  r.unit=str(r.unit);if(!UN[r.unit]){e('drop','repairs',id,'unit「'+r.unit+'」の部屋がありません');return false}
  if(!okDate(r.date)){e('drop','repairs',id,'date の日付の形が違います');return false}
  r.t=str(r.t);r.amount=num(r.amount,'repairs',id,'amount');r.owner=str(r.owner)||(PR[UN[r.unit].prop].owner||'');
 });
 var tasks=list('tasks',['t','due'],function(k,id){
  k.unit=str(k.unit);if(k.unit&&!UN[k.unit]){e('warn','tasks',id,'unit「'+k.unit+'」の部屋がないので「部屋なし」にしました');k.unit=''}
  if(!okDate(k.due)){e('drop','tasks',id,'due の日付の形が違います');return false}
  k.t=str(k.t);k.who=str(k.who);k.done=!!k.done;if(k.doneAt!=null){k.doneAt=dOpt(k.doneAt,'tasks',id,'doneAt');if(!k.doneAt)delete k.doneAt}
  if(k.private){k.private=true;k.owner=str(k.owner)}else delete k.private;
 });
 var hist=list('hist',['unit','at','t'],function(h,id){
  h.unit=str(h.unit);if(!UN[h.unit]){e('drop','hist',id,'unit「'+h.unit+'」の部屋がありません');return false}
  h.at=str(h.at).replace('T',' ');if(!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(h.at)||!okDate(h.at.slice(0,10))){e('drop','hist',id,'at の形が違います（YYYY-MM-DD HH:MM）');return false}
  h.t=str(h.t);h.who=str(h.who);
 });
 var db={v:1,staffV:2,owners:owners,props:props,units:units,tenants:tenants,leases:leases,charges:charges,csv:[],repairs:repairs,remits:[],tasks:tasks,hist:hist,deals:[],staff:staff,log:[],
  prefs:{notifyDays:src.prefs&&+src.prefs.notifyDays>0?+src.prefs.notifyDays:90,rows:'normal'},takeovers:[],memos:[],moChecks:{}};
 /* 入出金 (optional): settings (科目・手数料・会計の扱い・送金日) and, per month, the rows of the bank 明細 CSV and the MF 仕訳帳 CSV
    as they would be after 「取り込み」 (names already replaced). Nothing else of a month is read: 紐付け・締め・送金 start empty,
    ganki-money.js links the bank rows automatically on first use (localPending). */
 var mo=src.money;
 if(mo!=null&&(typeof mo!=='object'||Array.isArray(mo))){e('drop','money','','money の形が違います（読み込みませんでした）');mo=null}
 if(mo){
  db.money={v:1,settings:mo.settings&&typeof mo.settings==='object'&&!Array.isArray(mo.settings)?JSON.parse(JSON.stringify(mo.settings)):undefined,months:{},demoHist:1,localPending:[]};
  if(db.money.settings===undefined)delete db.money.settings;
  var MS=mo.months;
  if(MS!=null&&(typeof MS!=='object'||Array.isArray(MS))){e('drop','money','months','money.months の形が違います');MS=null}
  Object.keys(MS||{}).sort().forEach(function(m){
   var x=MS[m];
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(m)||!x||typeof x!=='object'){e('drop','money',m,'月のキーか中身の形が違います（YYYY-MM: {bank:[…], mf:[…]}）');return}
   if(m>GK.TODAY.slice(0,7)){e('drop','money',m,'今日より後の月です');return}
   var bank=[],mf=[],ym=m.replace('-','');
   (Array.isArray(x.bank)?x.bank:[]).forEach(function(r,i){
    var at=m+' 口座'+(i+1)+'行目';
    if(!r||typeof r!=='object'||!okDate(r.date)||r.date.slice(0,7)!==m){e('drop','money',at,'date がないか、この月の日付ではありません');return}
    var a=typeof r.amount==='number'?r.amount:+String(r.amount==null?'':r.amount).replace(/[,，\s]/g,'');
    if(!isFinite(a)||!a){e('drop','money',at,'amount（入金は＋・出金は−）が数字ではないか 0 です');return}
    var bal=r.bal==null||r.bal===''?null:+String(r.bal).replace(/[,，\s]/g,'');if(bal!=null&&!isFinite(bal))bal=null;
    bank.push({id:'b'+ym+'-L'+String(i+1).padStart(4,'0'),date:r.date,amount:Math.round(a),name:str(r.name).trim(),bal:bal,key:''});
   });
   (Array.isArray(x.mf)?x.mf:[]).forEach(function(r,i){
    var at=m+' MF'+(i+1)+'行目',side=function(s){s=s&&typeof s==='object'?s:{};var v=+String(s.amt==null?'':s.amt).replace(/[,，\s]/g,'');return {acct:str(s.acct).trim(),sub:str(s.sub).trim(),dept:str(s.dept).trim(),amt:isFinite(v)?Math.round(v):0}};
    if(!r||typeof r!=='object'||!okDate(r.date)||r.date.slice(0,7)!==m){e('drop','money',at,'date がないか、この月の日付ではありません');return}
    var dr=side(r.dr),cr=side(r.cr);if(!dr.acct&&!cr.acct){e('drop','money',at,'借方・貸方の勘定科目がありません');return}
    mf.push({id:'f'+ym+'-L'+String(i+1).padStart(4,'0'),no:str(r.no),date:r.date,dr:dr,cr:cr,memo:str(r.memo)});
   });
   if(['links','closed','closeLog','remit','imports'].some(function(k){return x[k]!=null&&!(Array.isArray(x[k])&&!x[k].length)&&!(typeof x[k]==='object'&&!Array.isArray(x[k])&&x[k]&&!Object.keys(x[k]).length)}))e('warn','money',m,'紐付け・締め・送金の記録は読み込みません（明細だけ読みます）');
   if(!bank.length&&!mf.length)return;
   db.money.months[m]={bank:bank,mf:mf,links:{},closed:null,closeLog:[],remit:{},imports:[],sample:{bank:false,mf:false}};
   db.money.localPending.push(m);
  });
 }
 if(src.flags&&typeof src.flags==='object'&&!Array.isArray(src.flags))db.flags=JSON.parse(JSON.stringify(src.flags));
 ['sales','acct','takeovers','csv','remits','deals','log','memos'].forEach(function(k){if(src[k]!=null&&!(Array.isArray(src[k])&&!src[k].length))e('warn','db',k,k+' は読み込みません（検証用は空で始めます）')});
 return {db:db,problems:P};
};
/* the current data, checked again (ids only): contracts that overlap, a 契約中 contract past its end, … */
GK.localCheck=function(db){
 var out=[],w=function(col,id,msg){out.push({kind:'check',col:col,id:String(id),msg:msg})};db=db||GK.db||{};
 var A=function(k){return Array.isArray(db[k])?db[k]:[]},T=GK.TODAY;
 var PR={},UN={},LE={},SN={};A('props').forEach(function(p){if(p)PR[p.id]=p});A('units').forEach(function(u){if(u)UN[u.id]=u});A('leases').forEach(function(l){if(l)LE[l.id]=l});A('staff').forEach(function(s){if(s)SN[s.n]=1});
 var OW={};A('owners').forEach(function(o){if(o)OW[o.id]=o});
 A('props').forEach(function(p){if(!p)return;if(p.owner&&!OW[p.owner])w('props',p.id,'オーナー（'+p.owner+'）がいません');if(!(p.rooms||[]).length)w('props',p.id,'部屋が1つもありません')});
 A('units').forEach(function(u){if(u&&!PR[u.prop])w('units',u.id,'物件（'+u.prop+'）がありません')});
 var per={};A('leases').forEach(function(l){if(!l)return;if(!UN[l.unit])w('leases',l.id,'部屋（'+l.unit+'）がありません');(per[l.unit]=per[l.unit]||[]).push(l)});
 Object.keys(per).forEach(function(uid){
  var ls=per[uid],act=ls.filter(function(l){return l.status==='有効'});
  if(act.length>1)w('units',uid,'契約中の契約が '+act.length+' 件あります（'+act.map(function(l){return l.id}).join('・')+'）');
  var run=ls.filter(function(l){return (l.status==='有効'||l.status==='終了')&&l.start}).sort(function(a,b){return a.start<b.start?-1:1});
  for(var i=1;i<run.length;i++){var a=run[i-1],b=run[i];if(a.end&&a.end>=b.start)w('leases',b.id,'期間が '+a.id+' と重なっています（'+a.end+' / '+b.start+'）')}
  var u=UN[uid];if(u&&act.length&&u.vacant)w('units',uid,'契約中なのに vacant が「'+u.vacant+'」です');
 });
 A('leases').forEach(function(l){if(!l)return;
  if(l.end&&l.start&&l.end<l.start)w('leases',l.id,'end が start より前です');
  if(l.status==='有効'&&l.end&&l.end<T&&!l.notice&&l.renewal!=='更新済み')w('leases',l.id,'契約中ですが end（'+l.end+'）が過ぎています（自動更新なら end を次の満了日に）');
  if(l.status==='終了'&&!l.end)w('leases',l.id,'終了した契約に end がありません');
 });
 A('charges').forEach(function(c){if(!c)return;if(!LE[c.lease])w('charges',c.id,'契約（'+c.lease+'）がありません');if(+c.paid>+c.amount)w('charges',c.id,'paid が amount より多いです')});
 A('tasks').forEach(function(k){if(k&&k.who&&!SN[k.who])w('tasks',k.id,'担当「'+k.who+'」が職員（staff の n）にいません')});
 return out;
};
var LOCAL_SIG='';
function localSig(){
 if(LOCAL_SIG)return LOCAL_SIG;var s='';try{s=JSON.stringify(LOC.db)||''}catch(e){}
 var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;
 return LOCAL_SIG=s.length+':'+(h>>>0).toString(36)+':'+String(LOC.today||'');
}
function localSeed(){
 var r=GK.localNormalize(LOC.db);
 r.db.localMeta={sig:localSig(),at:GK.TODAY,problems:r.problems,counts:{owners:r.db.owners.length,props:r.db.props.length,units:r.db.units.length,tenants:r.db.tenants.length,leases:r.db.leases.length,charges:r.db.charges.length,tasks:r.db.tasks.length,hist:r.db.hist.length,staff:r.db.staff.length}};
 return r.db;
}
/* problems found when the file was read + the live checks of the current data */
GK.localProblems=function(){
 if(!GK.LOCAL)return [];
 var m=GK.db&&GK.db.localMeta,a=m&&Array.isArray(m.problems)?m.problems:[];
 var b=[];try{b=GK.localCheck(GK.db)}catch(e){}
 return a.concat(b);
};

/* ---------- seed data ---------- */
function seed(){
 if(GK.LOCAL)return localSeed();
 var owners=[
  {id:'o1',n:'山本 一郎',k:'ヤマモト イチロウ',tel:'090-0000-7001',mail:'yamamoto@example.com',addr:'東京都〇〇区南町1-1-1',bank:'架空銀行 南町支店 普通 1234567',fee:5},
  {id:'o2',n:'株式会社サクラ不動産',k:'サクラフドウサン',tel:'03-0000-7002',mail:'info@sakura.example.com',addr:'東京都〇〇区桜台2-2-2',bank:'架空信用金庫 桜台支店 当座 7654321',fee:4},
  {id:'o3',n:'森 恵子',k:'モリ ケイコ',tel:'090-0000-7003',mail:'mori@example.com',addr:'東京都〇〇区東町3-3-3',bank:'架空銀行 東町支店 普通 2468013',fee:5}
 ];
 var props=[
  {id:'GK-0123',n:'ガンキハイツ南',owner:'o1',addr:'東京都〇〇区南町2-3-1',type:'RC造 5階建て · 2009年築',since:'2019-04-01',rooms:['101','102','103','104','201','202','203','204','301','302','305','402']},
  {id:'GK-0457',n:'メゾン東町',owner:'o3',addr:'東京都〇〇区東町4-12-8',type:'木造 2階建て · 2015年築',since:'2021-10-01',rooms:['101','102','103','105','201','202','203','204']},
  {id:'GK-0311',n:'コーポ桜台',owner:'o2',addr:'東京都〇〇区桜台1-5-20',type:'軽量鉄骨 3階建て · 2003年築',since:'2018-01-01',rooms:['101','102','201','202','301','302']},
  {id:'GK-0518',n:'ガンキレジデンス',owner:'o1',addr:'東京都〇〇区本町3-1-9',type:'RC造 7階建て · 2017年築',since:'2022-06-01',rooms:[]}
 ];
 for(var f=1;f<=7;f++)for(var r=1;r<=3;r++)props[3].rooms.push(f+'0'+r);
 var LAY={'GK-0123':['1K',70000,3000,25.1],'GK-0457':['1DK',62000,2000,30.2],'GK-0311':['2DK',59000,2000,38.5],'GK-0518':['1LDK',85000,5000,40.3]};
 var units=[],tenants=[],leases=[];
 var SUR=['青木','石川','上田','大塚','岡田','川口','北村','久保','小島','近藤','坂本','島田','杉山','関','高木','竹内','千葉','中島','永井','西田','野口','長谷川','平野','福田','藤井','堀','前田','松井','三浦','宮本','村上','矢野','横山','渡部','新井'];
 var SURK=['アオキ','イシカワ','ウエダ','オオツカ','オカダ','カワグチ','キタムラ','クボ','コジマ','コンドウ','サカモト','シマダ','スギヤマ','セキ','タカギ','タケウチ','チバ','ナカジマ','ナガイ','ニシダ','ノグチ','ハセガワ','ヒラノ','フクダ','フジイ','ホリ','マエダ','マツイ','ミウラ','ミヤモト','ムラカミ','ヤノ','ヨコヤマ','ワタナベ','アライ'];
 var GIV=['陽菜','蓮','結衣','大輝','美咲','翔太','彩','健','真由','拓海','優花','直樹'],GIVK=['ヒナ','レン','ユイ','ダイキ','ミサキ','ショウタ','アヤ','ケン','マユ','タクミ','ユウカ','ナオキ'];
 var FIXED={
  'GK-0123-104':['井上 健太','イノウエ ケンタ','2023-04-01','ガンキ保証',72000],
  'GK-0123-203':['田中 優子','タナカ ユウコ','2024-12-01','ガンキ保証',72000],
  'GK-0123-305':['松本 大輔','マツモト ダイスケ','2025-01-01','',74000],
  'GK-0457-201':['中村 亮','ナカムラ リョウ','2024-12-16','東日本保証',63000],
  'GK-0457-203':['木村 直美','キムラ ナオミ','2025-06-01','',68000],
  'GK-0311-102':['加藤 誠','カトウ マコト','2025-01-01','',55000],
  'GK-0311-201':['斎藤 由美','サイトウ ユミ','2025-04-01','ガンキ保証',59000],
  'GK-0311-301':['山田 太郎','ヤマダ タロウ','2022-03-01','',61000],
  'GK-0518-302':['森田 翔','モリタ ショウ','2024-10-01','ガンキ保証',85000],
  'GK-0518-502':['小林 恵','コバヤシ メグミ','2024-12-01','ガンキ保証',98000]
 };
 var VACANT={'GK-0123-402':'申込あり','GK-0457-105':'募集中','GK-0518-103':'募集中','GK-0518-603':'原状回復中','GK-0457-102':'募集中'};
 var gi=0,tid=1,lid=1;
 props.forEach(function(p){
  p.rooms.forEach(function(no,i){
   var id=p.id+'-'+no,L=LAY[p.id],big=p.id==='GK-0518'&&+no[0]>=5;
   var u={id:id,prop:p.id,no:no,lay:id==='GK-0518-502'?'2LDK':big?'2LDK':L[0],area:big?55.2:L[3],rent:id in FIXED?FIXED[id][4]:L[1]+(big?13000:0)+(+no[0]-1)*1000,fee:L[2],vacant:VACANT[id]||''};
   units.push(u);
   if(u.vacant)return;
   var fx=FIXED[id],name,kana,start,gua;
   if(fx){name=fx[0];kana=fx[1];start=fx[2];gua=fx[3]}
   else{var s=gi%SUR.length,g=(gi*5)%GIV.length;name=SUR[s]+' '+GIV[g];kana=SURK[s]+' '+GIVK[g];start=(2022+gi%4)+'-'+pad(1+(gi*3)%12)+'-01';gua=gi%3?'ガンキ保証':'';gi++}
   var t={id:'T'+pad(tid++),n:name,k:kana,tel:'090-0000-'+String(1000+tid*7).slice(-4),mail:'',emName:'',emTel:'',work:''};
   tenants.push(t);
   var end=GK.addYears(start,2);while(end<GK.TODAY)end=GK.addYears(GK.addDays(end,1),2);
   if(id==='GK-0518-302')end='2028-09-30'; /* 更新済み: the end of the renewed term */
   leases.push({id:'L'+pad(lid++,3),unit:id,tenant:t.id,start:start,end:end,rent:u.rent,fee:u.fee,dep:u.rent,pay:27,gua:gua,status:'有効',renewal:id==='GK-0518-302'?'更新済み':''});
  });
 });
 /* past tenants (contracts are kept as 終了, never overwritten) */
 var PAST=[
  ['GK-0123-104','佐々木 健','ササキ ケン','2019-04-01','2023-03-20','転勤のため退去','精算済み（返金 ¥38,000）'],
  ['GK-0123-203','吉田 誠','ヨシダ マコト','2020-10-01','2024-10-31','更新せず退去','精算済み（追加請求なし）'],
  ['GK-0123-203','大野 匠','オオノ タクミ','2016-04-01','2020-09-15','購入のため退去','精算済み'],
  ['GK-0123-402','石井 遥','イシイ ハルカ','2022-02-01','2026-09-30','更新せず退去','見積り待ち'],
  ['GK-0457-105','原 和也','ハラ カズヤ','2021-06-01','2026-07-31','転居のため退去','精算済み'],
  ['GK-0311-301','高田 修','タカダ オサム','2017-03-01','2021-02-28','更新せず退去','精算済み']
 ];
 PAST.forEach(function(x){
  var t={id:'T'+pad(tid++),n:x[1],k:x[2],tel:'090-0000-'+String(5000+tid).slice(-4),mail:'',emName:'',emTel:'',work:'',former:true};
  tenants.push(t);
  var u=units.filter(function(u){return u.id===x[0]})[0];
  leases.push({id:'L'+pad(lid++,3),unit:x[0],tenant:t.id,start:x[3],end:x[4],rent:u.rent-2000,fee:u.fee,dep:u.rent-2000,pay:27,gua:'',status:'終了',moveout:{date:x[4],reason:x[5],settle:x[6]}});
 });
 /* applicant for 402 and the 301 move-out notice */
 var ap={id:'T'+pad(tid++),n:'清水 美香',k:'シミズ ミカ',tel:'080-0000-1002',mail:'',emName:'',emTel:'',work:''};tenants.push(ap);
 leases.push({id:'L'+pad(lid++,3),unit:'GK-0123-402',tenant:ap.id,start:'2026-11-01',end:'2028-10-31',rent:76000,fee:3000,dep:76000,pay:27,gua:'ガンキ保証',status:'申込中'});
 leases.forEach(function(l){if(l.unit==='GK-0311-301'&&l.status==='有効')l.notice={date:'2026-10-18',insp:'2026-10-18 10:30',received:'2026-09-15'}});
 /* 勤務先 of one tenant (fictitious): the 入出金 demo row 「カ）ヒカリケンセツ」 is then a case for 「AIに候補を聞く」 (2026-10-19) */
 leases.forEach(function(l){if(l.unit==='GK-0518-701'&&l.status==='有効')tenants.forEach(function(t){if(t.id===l.tenant)t.work='株式会社ヒカリ建設'})});
 /* 連帯保証人 of the 滞納 sample without a 保証会社 (メゾン東町 203, fictitious) — 滞納の段階 「連帯保証人へ連絡」 */
 leases.forEach(function(l){if(l.unit==='GK-0457-203'&&l.status==='有効')tenants.forEach(function(t){if(t.id===l.tenant){t.gName='木村 正';t.gTel='090-0000-4203'}})});
 /* charges and arrears (this month and older unpaid ones) */
 var charges=[];
 leases.filter(function(l){return l.status==='有効'}).forEach(function(l){charges.push({id:'C-'+l.id+'-10',lease:l.id,month:'2026-10',due:'2026-10-27',amount:l.rent+l.fee,paid:0})});
 [['GK-0123-104','2026-08',72000+3000,'2026-08-01'],['GK-0457-203','2026-09',68000+2000,'2026-09-01'],['GK-0311-201','2026-10',59000+2000,'2026-10-01']].forEach(function(a){
  var l=leases.filter(function(l){return l.unit===a[0]&&l.status==='有効'})[0];charges.push({id:'C-'+l.id+'-'+a[1].slice(5)+'-late',lease:l.id,month:a[1],due:a[3],amount:a[2],paid:0,arrear:true});
 });
 /* bank CSV sample (fictitious) */
 var csv=[
  ['2026-10-14','カトウ マコト',57000],['2026-10-14','モリタ シヨウ',90000],['2026-10-15','サイトウ ユミ',30000],['2026-10-15','ナカムラ リヨウ',65000],
  ['2026-10-15','ヤマダ タロウ',63000],['2026-10-16','カ）ヒカリケンセツ',120000],['2026-10-16','コバヤシ メグミ',103000],['2026-10-16','タナカ ユウコ',75000]
 ].map(function(x,i){return {id:'B'+(i+1),date:x[0],name:x[1],amount:x[2],status:'未照合'}});
 var repairs=[
  {id:'R1',unit:'GK-0123-104',date:'2026-10-09',t:'給湯器交換',amount:88000,owner:'o1'},
  {id:'R2',unit:'GK-0457-201',date:'2026-10-13',t:'網戸張り替え',amount:6600,owner:'o3'},
  {id:'R3',unit:'GK-0311-301',date:'2026-10-05',t:'共用灯交換',amount:12100,owner:'o2'}
 ];
 var remits=owners.map(function(o){return {owner:o.id,month:'2026-10',status:o.id==='o2'?'明細確定':'下書き',date:'2026-10-25'}});
 var tasks=[
  {id:'k1',unit:'GK-0123-203',t:'更新書類の回収',due:'2026-10-10',who:'佐藤',done:false},
  {id:'k2',unit:'GK-0457-105',t:'前入居者の鍵の返却確認',due:'2026-10-12',who:'鈴木',done:false},
  {id:'k3',unit:'GK-0123-104',t:'給湯器交換の完了確認',due:'2026-10-14',who:'佐藤',done:false},
  {id:'k4',unit:'GK-0311-301',t:'退去立会い',due:'2026-10-18',who:'高橋',done:false},
  {id:'k5',unit:'GK-0518-502',t:'更新の案内を送る',due:'2026-10-20',who:'佐藤',done:false},
  {id:'k6',unit:'GK-0311-201',t:'口座振替（自動の引き落とし）の申込を入居者へ連絡',due:'2026-10-17',who:'佐藤',done:false}, /* the rent reminders themselves come from 滞納の段階 (2026-10-19) */
  {id:'k7',unit:'GK-0457-201',t:'網戸修理の日程を入居者へ連絡',due:'2026-10-21',who:'鈴木',done:false}
 ];
 var hist=[
  {id:'h1',unit:'GK-0123-104',at:'2026-10-16 09:40',t:'電話（受信）：水漏れの連絡、業者手配済み',who:'佐藤'},
  {id:'h2',unit:'GK-0518-302',at:'2026-10-15 17:05',t:'電話（発信）：更新の意思確認、継続で回答',who:'鈴木'},
  {id:'h3',unit:'GK-0457-201',at:'2026-10-13 11:20',t:'メール：網戸の破れの連絡',who:'佐藤'},
  {id:'h4',unit:'GK-0311-301',at:'2026-10-12 15:00',t:'訪問：退去立会いの日程を確定',who:'高橋'},
  {id:'h5',unit:'GK-0123-203',at:'2024-10-31 10:00',t:'退去立会い：吉田様、原状回復なし',who:'高橋'}
 ];
 var deals=[
  {id:'D1',n:'南町3丁目 土地',kind:'仕入れ',stage:'検討中',price:48000000,who:'高橋',next:'現地確認',due:'2026-10-20',src:'〇〇信託'},
  {id:'D2',n:'東町 区分マンション 405',kind:'仕入れ',stage:'買付提出',price:23800000,who:'鈴木',next:'売主の回答待ち',due:'2026-10-18',src:'架空不動産'},
  {id:'D3',n:'桜台 戸建て',kind:'売却',stage:'契約準備',price:39800000,who:'高橋',next:'重要事項説明書の作成',due:'2026-10-24',src:'自社'},
  {id:'D4',n:'本町 一棟アパート',kind:'仕入れ',stage:'検討中',price:126000000,who:'佐藤',next:'収支の試算',due:'2026-10-28',src:'〇〇銀行紹介'},
  {id:'D5',n:'北口 区分 202',kind:'売却',stage:'決済待ち',price:18500000,who:'鈴木',next:'決済日 11/5 の段取り',due:'2026-11-05',src:'自社'},
  {id:'D6',n:'西町 店舗付き住宅',kind:'仕入れ',stage:'見送り',price:54000000,who:'高橋',next:'',due:'',src:'架空不動産'}
 ];
 var staff=[
  {id:'s1',n:'佐藤',role:'担当者',area:'賃貸管理'},{id:'s2',n:'鈴木',role:'担当者',area:'賃貸管理'},{id:'s3',n:'高橋',role:'管理者',area:'賃貸管理・仕入れ'},{id:'s4',n:'田中',role:'経理',area:'経理'},
  {id:'s5',n:'伊藤',role:'閲覧',area:'本部（見るだけ）'}
 ];
 return {v:1,staffV:2,owners:owners,props:props,units:units,tenants:tenants,leases:leases,charges:charges,csv:csv,repairs:repairs,remits:remits,tasks:tasks,hist:hist,deals:deals,staff:staff,log:[],prefs:{notifyDays:90,rows:'normal'},takeovers:sampleTakeovers()};
}

/* ---------- sample 管理の引継ぎ (in progress; schema: see the 管理の引継ぎ comment below) ----------
   Deterministic (same ids and contents on every load), so #to-TOS1 links work before anything is saved.
   Uses only the helpers defined above (it runs inside the first GK.load()). */
function sampleTakeovers(){
 var t0=GK.parse(GK.TODAY);
 function fom(n){return GK.iso(new Date(t0.getFullYear(),t0.getMonth()+n,1))}
 function roll(start,after){var e=GK.addYears(start,2);while(e<=after)e=GK.addYears(GK.addDays(e,1),2);return e}
 var LBL=['賃貸借契約書（全室分）','重要事項説明書','入居者名簿','鍵（本数を確認）','保証会社の契約書（保証会社に入っている部屋がある場合だけ）','敷金の預かり一覧'];
 function docs(st){return LBL.map(function(l,i){return [l,st[i][0],st[i][1]||'']})}
 var SN=['今井','内田','遠藤','小野','片山','菊地','栗原','桑原','小西','佐野','柴田','菅原','須藤','田村','辻','土屋','富田','中川','西村','野村','服部','浜田','樋口','平田','古川','星野','増田','丸山','水野','森本','安田','山口','吉川','和田','荒木','市川','岩田','江口','大西','神田'];
 var SK=['イマイ','ウチダ','エンドウ','オノ','カタヤマ','キクチ','クリハラ','クワバラ','コニシ','サノ','シバタ','スガワラ','スドウ','タムラ','ツジ','ツチヤ','トミタ','ナカガワ','ニシムラ','ノムラ','ハットリ','ハマダ','ヒグチ','ヒラタ','フルカワ','ホシノ','マスダ','マルヤマ','ミズノ','モリモト','ヤスダ','ヤマグチ','ヨシカワ','ワダ','アラキ','イチカワ','イワタ','エグチ','オオニシ','カンダ'];
 var GN=['葵','悠真','美月','颯太','七海','湊','莉子','樹','楓','大和','花音','陸'],GKN=['アオイ','ユウマ','ミヅキ','ソウタ','ナナミ','ミナト','リコ','イツキ','カエデ','ヤマト','カノン','リク'];
 var ni=0;
 function person(){var s=ni%SN.length,g=(ni*7)%GN.length;ni++;return {ten:SN[s]+' '+GN[g],k:SK[s]+' '+GKN[g],tel:'090-0000-'+(3100+ni*13)}}
 function room(no,o){
  o=o||{};var r={no:no,ten:'',k:'',tel:'',rent:String(o.rent||''),start:o.start||'',end:o.end||'',gua:o.gua||'不明',guaName:o.guaName||''};
  if(o.vacant)return r;
  var p=person();r.ten=p.ten;r.k=o.noKana?'':p.k;r.tel=o.noTel?'':p.tel;return r;
 }
 /* 1. サンハイツ北: 12室, every room entered, now at お知らせ */
 var s1=fom(1),r1=[];
 ['101','102','103','104','201','202','203','204','301','302','303','304'].forEach(function(no,i){
  var st=(2022+i%4)+'-'+pad(1+(i*5)%12)+'-01',yes=i%3!==1;
  r1.push(room(no,{rent:64000+(+no[0]-1)*1500+(i%2)*1000,start:st,end:roll(st,s1),gua:yes?'あり':'なし',guaName:yes?(i%2?'東日本保証':'ガンキ保証'):''}));
 });
 /* 2. 緑ヶ丘コーポ: 8室 from the 入居者名簿, 受け取る書類 still open (契約書が2室分足りない) */
 var s2=fom(3),r2=[];
 ['101','102','103','104','201','202','203','204'].forEach(function(no,i){r2.push(room(no,{rent:no==='203'?'':58000+(+no[0]-1)*1000,vacant:no==='203',noTel:i%3===2}))});
 /* 3. 駅前レジデンス: 20室, some 保証会社 not known yet */
 var s3=fom(2),r3=[],VAC={'105':1,'302':1,'404':1},UNK={'103':1,'204':1,'305':1,'401':1},NOSTART={'202':1,'403':1};
 ['1','2','3','4'].forEach(function(f){for(var n=1;n<=5;n++){var no=f+'0'+n,i=r3.length,st=NOSTART[no]?'':(2021+i%5)+'-'+pad(1+(i*7)%12)+'-01';
  var g=UNK[no]?'不明':i%2?'なし':'あり';
  r3.push(room(no,{rent:82000+(+f-1)*2000+(n===5?6000:0),vacant:VAC[no],start:st,end:st?roll(st,s3):'',gua:g,guaName:g==='あり'?'ガンキ保証':'',noKana:i%6===5}));
 }});
 var L=function(){return {sendOn:'',drafted:false,text:{yes:'',no:''}}};
 return [
  {id:'TOS1',sample:true,name:'サンハイツ北',step:3,start:s1,owner:{mode:'pick',id:'o1',n:'',k:'',tel:''},prop:{addr:'東京都〇〇区北町1-2-3',struct:'RC造 4階建て',year:'2008'},prev:{n:'北町ハウジング（架空）',tel:'03-0000-8101'},
   docs:docs([[1],[1],[1],[1,'各室2本・共用部3本'],[1],[0,'前の管理会社が作成中']]),rooms:r1,letters:L(),updated:GK.addDays(GK.TODAY,-1)+'T17:40',done:false},
  {id:'TOS2',sample:true,name:'緑ヶ丘コーポ',step:1,start:s2,owner:{mode:'pick',id:'o3',n:'',k:'',tel:''},prop:{addr:'東京都〇〇区緑ヶ丘4-8-2',struct:'木造 2階建て',year:'1998'},prev:{n:'みどり不動産管理（架空）',tel:'03-0000-8202'},
   docs:docs([[0,'2室分不足'],[1],[1],[1,'各室1本'],[1],[0]]),rooms:r2,letters:L(),updated:GK.addDays(GK.TODAY,-3)+'T11:15',done:false},
  {id:'TOS3',sample:true,name:'駅前レジデンス',step:2,start:s3,owner:{mode:'pick',id:'o2',n:'',k:'',tel:''},prop:{addr:'東京都〇〇区駅前2-5-11',struct:'RC造 5階建て',year:'2012'},prev:{n:'駅前管理サービス（架空）',tel:'03-0000-8303'},
   docs:docs([[1],[1],[1],[1,'各室2本'],[0,'4室分は前オーナーに確認中'],[1]]),rooms:r3,letters:L(),updated:GK.addDays(GK.TODAY,-2)+'T15:05',done:false}
 ];
}

/* ---------- store ---------- */
/* local data mode: its own key; a stored copy is used only while it was made from the same ganki-local-data.js
   (localMeta.sig) — a new file is read afresh (changes made while checking the old one are dropped) */
var KEY=GK.LOCAL?'ganki-local-db-v1':'ganki-demo-db-v1';
GK.KEY=KEY;
GK.load=function(){
 if(GK.LOCAL){
  try{var lr=localStorage.getItem(KEY);if(lr){var ld=JSON.parse(lr);if(ld&&ld.v===1&&ld.localMeta&&ld.localMeta.sig===localSig())return ld}}catch(e){}
  return seed();
 }
 try{var raw=localStorage.getItem(KEY);if(raw){var d=JSON.parse(raw);if(d&&d.v===1)return migrateStaff(d)}}catch(e){}
 return seed();
};
/* 機能の設定 (2026-10-19): an older stored db gets the new roles in memory (saved with the next user action, like any change).
   編集 -> 担当者, 管理者 -> 管理者, 閲覧 -> 閲覧; a person whose area is 経理 -> 経理; plus the sample 閲覧 person (伊藤). */
function migrateStaff(d){
 try{
  if(d.staffV===2&&Array.isArray(d.staff))return d;
  if(!Array.isArray(d.staff))d.staff=[];
  var R=['担当者','経理','管理者','閲覧'],OLD={'編集':'担当者','管理者':'管理者','閲覧':'閲覧'};
  d.staff.forEach(function(s){
   if(!s||typeof s!=='object')return;
   if(s.area==='経理'&&s.role!=='管理者')s.role='経理';
   else if(OLD[s.role])s.role=OLD[s.role];
   else if(R.indexOf(s.role)<0)s.role='閲覧';
  });
  if(!d.staff.some(function(s){return s&&(s.id==='s5'||s.n==='伊藤')}))d.staff.push({id:'s5',n:'伊藤',role:'閲覧',area:'本部（見るだけ）'});
  d.staffV=2;
 }catch(e){}
 return d;
}
GK.db=GK.load();
GK.save=function(){try{localStorage.setItem(KEY,JSON.stringify(GK.db))}catch(e){}};
GK.reset=function(){try{localStorage.removeItem(KEY)}catch(e){}GK.db=seed()};
/* hist ids: 'h' + time + a per-page counter, so two entries written in the same millisecond never share an id */
var histSeq=0;
GK.log=function(t,unit){GK.db.log.unshift({at:GK.TODAY+' '+new Date().toTimeString().slice(0,5),t:t,unit:unit||'',who:GK.ME});if(unit)GK.db.hist.unshift({id:'h'+Date.now()+'-'+(++histSeq),unit:unit,at:GK.TODAY+' '+new Date().toTimeString().slice(0,5),t:t,who:GK.ME})};

/* ---------- lookups ---------- */
GK.by=function(list,id){for(var i=0;i<list.length;i++)if(list[i].id===id)return list[i];return null};
GK.unit=function(id){return GK.by(GK.db.units,id)};
GK.prop=function(id){return GK.by(GK.db.props,id)};
GK.owner=function(id){return GK.by(GK.db.owners,id)};
GK.tenant=function(id){return GK.by(GK.db.tenants,id)};
GK.lease=function(id){return GK.by(GK.db.leases,id)};
GK.roomLabel=function(id){var u=GK.unit(id),p=u&&GK.prop(u.prop);return u&&p?p.n+' '+u.no:id};
GK.leasesOf=function(unitId){return GK.db.leases.filter(function(l){return l.unit===unitId}).sort(function(a,b){return a.start<b.start?1:-1})};
GK.activeLease=function(unitId){return GK.db.leases.filter(function(l){return l.unit===unitId&&l.status==='有効'})[0]||null};
GK.unitStatus=function(u){var a=GK.activeLease(u.id);if(a){if(a.notice)return '退去予定';return '入居中'}var ap=GK.db.leases.filter(function(l){return l.unit===u.id&&(l.status==='申込中'||l.status==='入居予定')})[0];if(ap)return ap.status==='入居予定'?'入居予定':'申込あり';return u.vacant&&u.vacant!=='申込あり'?u.vacant:'空室'};
GK.statusPill=function(s){var c={'入居中':'ok','退去予定':'warn','空室':'info','募集中':'info','申込あり':'info','入居予定':'info','原状回復中':'warn','有効':'ok','申込中':'info','終了':'','入居予定 ':'info'}[s];return '<span class="pill '+(c||'')+'">'+GK.esc(s)+'</span>'};
GK.arrears=function(leaseId){return GK.db.charges.filter(function(c){return c.lease===leaseId&&c.arrear&&c.paid<c.amount})};
GK.overdueDays=function(due){return Math.max(0,GK.days(due,GK.TODAY))};

/* ---------- shell ---------- */
/* rental management only for now (the user's decision 2026-10-16: 仕入れ・管理者・経理 later) */
var NAV=[['index.html','ホーム'],['properties.html','物件・台帳'],['tenants.html','入居者'],['contracts.html','契約・更新'],['money.html','入出金'],['sales.html','管理部売上'],
 ['accounting.html','経理']]; /* 経理 (added 2026-10-19): the receiving side of the month-end handover (hidden when OFF) */
/* 入出金 badge (added 2026-10-19): this month's rows not confirmed yet. Pages that load ganki-money.js count it;
   the others show the count money.html saved last (GK.db.money.badge) */
function moneyBadge(){try{if(GK.money&&typeof GK.money.badge==='function')return GK.money.badge();var m=GK.db.money;return m&&typeof m.badge==='number'?m.badge:0}catch(e){return 0}}
/* 機能の設定 (2026-10-19): a menu item whose screen is OFF for the current person is not drawn; 「機能の設定」 is added
   for the people who can open it; the footer has the demo 「操作する人」 selector. Called again when the settings change. */
var shellActive=null,shellDocBound=false;
GK.shell=function(active){
 shellActive=active;
 var side=document.getElementById('side');if(!side)return;
 var can=typeof GK.can==='function'?GK.can:function(){return true},pf=GK.PAGE_FEATURE||{};
 /* a badge only for a menu item that is shown (the 入出金 count would otherwise prepare the 入出金 data for nothing) */
 var badge={'contracts.html':can('page.contracts')?GK.renewalsDue().length:0,'money.html':can('page.money')?moneyBadge():0};
 var item=function(n){return '<a href="'+n[0]+'"'+(n[0]===active?' aria-current="page"':'')+'><span>'+n[1]+'</span>'+(badge[n[0]]?'<span class="badge" aria-label="'+(n[0]==='money.html'?'未確認 '+badge[n[0]]+'件（要確認と確認待ち）':'要確認 '+badge[n[0]]+'件')+'">'+badge[n[0]]+'</span>':'')+'</a>'};
 var list=NAV.filter(function(n){return !pf[n[0]]||can(pf[n[0]])});
 side.innerHTML='<a class="logo" href="index.html"><span class="logo-mark">G</span>GANKI</a><nav class="nav" aria-label="メインメニュー"><div class="nav-label">賃貸管理</div>'+
  list.map(item).join('')+
  (can('settings')?'<div class="nav-label">管理</div>'+item(['settings.html','機能の設定']):'')+
  '</nav><div class="side-foot">'+(typeof GK.meSelectHtml==='function'?GK.meSelectHtml():'')+(GK.LOCAL?'社内検証用のデータ · このPCの中だけで使います<br>変更はこのブラウザーだけに保存（本番には反映されません）':'デモ版 · 人名・金額はすべて架空<br>データはこのブラウザーだけに保存')+'</div>';
 var sel=document.getElementById('gkMe');if(sel&&sel.addEventListener)sel.addEventListener('change',function(){if(typeof GK.switchMe==='function')GK.switchMe(this.value)});
 var top=document.getElementById('topbar');
 if(top){top.innerHTML='<button type="button" id="navToggle" aria-expanded="false" aria-controls="side">メニュー</button><b>GANKI</b>';
  document.getElementById('navToggle').addEventListener('click',function(){var o=document.body.classList.toggle('nav-open');this.setAttribute('aria-expanded',o)});
  if(!shellDocBound){shellDocBound=true;document.addEventListener('click',function(e){if(document.body.classList.contains('nav-open')&&!e.target.closest('#side,#navToggle')){document.body.classList.remove('nav-open');var nt=document.getElementById('navToggle');if(nt)nt.setAttribute('aria-expanded','false')}})}
 }
};
GK.shellAgain=function(){if(shellActive!==null)GK.shell(shellActive)};
GK.renewalsDue=function(){var lim=GK.addDays(GK.TODAY,GK.db.prefs.notifyDays||90);return GK.db.leases.filter(function(l){return l.status==='有効'&&!l.notice&&!l.renewal&&l.end<=lim})};

var tt,undoFn=null;
GK.toast=function(msg,undo,label){
 var el=document.getElementById('toast');if(!el){el=document.createElement('div');el.id='toast';document.body.appendChild(el)}
 undoFn=undo||null;
 el.innerHTML='<div class="toast" role="status"><span>'+GK.esc(msg)+'</span>'+(undo?'<button type="button" id="toastUndo">'+(label||'元に戻す')+'</button>':'')+'</div>';
 var b=document.getElementById('toastUndo');if(b)b.onclick=function(){var f=undoFn;undoFn=null;el.innerHTML='';if(f)f()};
 clearTimeout(tt);tt=setTimeout(function(){el.innerHTML='';undoFn=null},undo?8000:3000);
};
/* hash helpers: only plain tokens survive the artifact link (#room-GK-0123-104) */
GK.hash=function(prefix){var h=location.hash.slice(1);return h.indexOf(prefix+'-')===0?h.slice(prefix.length+1):''};

/* ---------- additive helpers (UX pass 2026-10-17; nothing above changes) ---------- */
/* 1st of the month after s (default: today) */
GK.firstOfNextMonth=function(s){var d=GK.parse(s||GK.TODAY);return d?GK.iso(new Date(d.getFullYear(),d.getMonth()+1,1)):''};
/* contract status as staff read it: the stored value stays '有効', the screen says 契約中 */
GK.leaseLabel=function(s){return s==='有効'?'契約中':s};
GK.leasePill=function(s){var c={'有効':'ok','申込中':'info','入居予定':'info','退去予定':'warn'}[s];return '<span class="pill '+(c||'')+'">'+GK.esc(GK.leaseLabel(s))+'</span>'};
/* 保証会社 choices: the demo list as given; 社内検証用のデータ: the names used in the contracts (the given list when there are none) */
GK.guaNames=function(def){
 def=(def||[]).slice();if(!GK.LOCAL)return def;
 var out=[];(GK.db.leases||[]).forEach(function(l){var g=l&&String(l.gua||'').trim();if(g&&g!=='なし'&&out.indexOf(g)<0)out.push(g)});
 return out.length?out.sort():def;
};
/* per-browser drafts; every call survives a blocked or missing localStorage */
/* local data mode: drafts and the 「操作する人」 choice get their own keys ('ganki-local:' + key), never the demo ones */
var SP=GK.LOCAL?'ganki-local:':'';
GK.store={
 get:function(k){try{var r=localStorage.getItem(SP+k);return r?JSON.parse(r):null}catch(e){return null}},
 set:function(k,v){try{localStorage.setItem(SP+k,JSON.stringify(v));return true}catch(e){return false}},
 drop:function(k){try{localStorage.removeItem(SP+k)}catch(e){}}
};
/* a to-do for 今日確認すること (home reads GK.db.tasks) */
GK.addTask=function(unit,t,due,opt){var k={id:'k'+Date.now()+String(Math.floor(Math.random()*1000)),unit:unit||'',t:t,due:due||GK.TODAY,who:GK.ME,done:false};
 /* opt (2026-10-19, ホームの「＋ やることを追加」): {private, who}. unit '' = 部屋なし. owner = the staff id who made it. */
 if(opt){k.private=!!opt.private;k.owner=GK.MEID||'';if(opt.who&&!k.private)k.who=String(opt.who)}
 GK.db.tasks.push(k);return k};
/* a private to-do (private:true) is a personal to-do: only its creator sees and counts it, never anyone else (admins included) */
GK.taskVisible=function(k,id){
 if(!k||typeof k!=='object')return false;if(!k.private)return true;
 id=id===undefined?GK.MEID:id;
 if(k.owner)return !!id&&k.owner===id;
 var s=GK.staffById?GK.staffById(id):null;return !!s&&s.n===k.who; /* an owner-less private to-do: its 担当 */
};
GK.visibleTasks=function(id){return (Array.isArray(GK.db.tasks)?GK.db.tasks:[]).filter(function(k){return GK.taskVisible(k,id)})};
/* the 操作の記録 / 対応履歴 line for a to-do: a private one never shows its text ('完了' -> 「自分だけのやることを完了しました」) */
GK.taskLogText=function(k,verb,text){return k&&k.private?'自分だけのやることを'+verb+'しました':text};
/* in-page yes/no bar (confirm() does not work in the viewer). Returns the bar element. */
GK.confirmBar=function(anchor,msg,yesLabel,onYes,opts){
 opts=opts||{};
 var old=document.getElementById('gkConfirm');if(old)old.remove();
 if(!anchor)return null;
 var el=document.createElement('div');el.id='gkConfirm';el.className='confirmbar';el.setAttribute('role','alertdialog');el.setAttribute('aria-labelledby','gkConfirmMsg');
 el.innerHTML='<span id="gkConfirmMsg">'+GK.esc(msg)+'</span><span class="cb-acts"><button type="button" class="btn danger" data-cb="yes">'+GK.esc(yesLabel||'はい')+'</button><button type="button" class="btn" data-cb="no">'+GK.esc(opts.noLabel||'やめる')+'</button></span>';
 anchor.insertAdjacentElement(opts.where||'afterend',el);
 var ret=document.activeElement;
 function no(){el.remove();if(opts.onNo)opts.onNo();if(ret&&document.body.contains(ret))ret.focus()}
 el.querySelector('[data-cb="yes"]').addEventListener('click',function(e){e.stopPropagation();el.remove();onYes()});
 el.querySelector('[data-cb="no"]').addEventListener('click',function(e){e.stopPropagation();no()});
 el.addEventListener('keydown',function(e){if(e.key==='Escape'){e.stopPropagation();e.preventDefault();no()}});
 el.querySelector('[data-cb="no"]').focus();
 return el;
};
GK.closeConfirm=function(){var el=document.getElementById('gkConfirm');if(el){el.remove();return true}return false};

/* ---------- 機能の設定: feature switches by role and by person (additive 2026-10-19) ----------
   GK.FEATURES   the catalog: {key, n (name), d (one line), g (group), dep:[keys it needs], chg (changes data), admin}
   GK.db.flags   {roles:{<role>:{<key>:true|false}}, people:{<staff id>:{<key>:true|false}}}   only what differs is stored;
                 an older db has no flags key: every feature then follows the defaults below.
   Defaults      担当者・経理・管理者: everything ON (today's behaviour) except 「機能の設定」 (管理者 only);
                 閲覧: screens and lists ON, every feature that changes data (chg) OFF.
   GK.can(key, staffId?)  person ON/OFF > role setting > default; OFF when anything it needs (dep) is OFF.
                 「機能の設定」 is always ON for the 管理者 role, and no change may leave nobody able to open it.
   OFF = not drawn at all. Pages ask GK.can when they draw and again in the action handler. */
GK.ROLES=['担当者','経理','管理者','閲覧'];
GK.ROLE_NOTE={'担当者':'ふだんの管理の仕事をする人','経理':'入出金・送金・締めをする人','管理者':'すべての操作と「機能の設定」ができる人','閲覧':'見るだけの人（変更する操作と、電話番号・口座の表示は最初からOFF）'};
GK.FEATURE_GROUPS=['画面','ホームの欄','操作','お金','個人情報','書類・AI','AI','入力の補助','設定'];
/* def (added 2026-10-19, 経理): {<role>:true|false} a default of its own for some roles (the rules below for the others) */
function feat(k,g,n,d,o){o=o||{};return {key:k,g:g,n:n,d:d,dep:o.dep||[],chg:!!o.chg,admin:!!o.admin,pi:!!o.pi,def:o.def||null}}
var HOME=['page.home'];
GK.FEATURES=[
 feat('page.home','画面','ホーム','今日確認すること・予定・空室などが並ぶ最初の画面'),
 feat('page.props','画面','物件・台帳','物件・部屋・オーナーの一覧と、部屋ごとの詳しい情報'),
 feat('page.tenants','画面','入居者','入居者の一覧と連絡先・契約・対応履歴'),
 feat('page.contracts','画面','契約・更新','契約の一覧、更新の案内、退去の連絡'),
 feat('page.money','画面','入出金','銀行の入出金の確認、オーナー送金、月の締め'),
 feat('page.sales','画面','管理部売上','月ごとの売上と、月末会議の資料'),
 feat('page.register','画面','まとめて登録','オーナー・物件・入居者・契約をまとめて登録する画面',{chg:true}),
 feat('page.turnover','画面','入居者の入れ替え','退去した部屋に新しい入居者と契約を登録する画面',{chg:true}),
 feat('page.takeover','画面','管理の引継ぎ','ほかの管理会社から物件を引き継ぐ手続きの画面',{chg:true}),
 feat('page.acct','画面','経理','会社の入出金・売上と、賃貸管理部からの月末の引継ぎ',{def:{'担当者':false}}),

 feat('home.quick','ホームの欄','よく使う操作','ホームの上の「対応を記録」「入居者の入れ替え」などのボタン',{dep:HOME}),
 feat('home.today','ホームの欄','今日確認すること','期限が近いやること・期限を過ぎたやることの一覧',{dep:HOME}),
 feat('home.week','ホームの欄','今週の予定','1週間分のやることと立会い・内見の予定',{dep:HOME}),
 feat('home.search','ホームの欄','管理台帳を探す','物件名・部屋番号・入居者名で部屋を探す欄',{dep:HOME}),
 feat('home.history','ホームの欄','対応履歴','最近の電話・訪問などの記録',{dep:HOME}),
 feat('home.renewals','ホームの欄','これからの契約更新','更新が近い契約と、更新案内の作成',{dep:HOME}),
 feat('home.vacancy','ホームの欄','空室','いま空いている部屋',{dep:HOME}),
 feat('home.occupancy','ホームの欄','月末の入居率','月末ごとの入居率のグラフ',{dep:HOME}),
 feat('home.notes','ホームの欄','メモ','自分用・共有のメモ',{dep:HOME}),
 feat('home.handover','ホームの欄','管理の引継ぎ（ホーム）','引継ぎ中の物件と次にやること',{dep:['page.home','page.takeover']}),
 feat('home.moveout','ホームの欄','退去の段取り','退去が決まった部屋のチェックリスト',{dep:HOME}),
 feat('home.money','ホームの欄','入出金の確認（ホーム）','入出金の確認・送金・締めの進み具合',{dep:['page.home','page.money']}),

 feat('act.record','操作','対応の記録','電話・訪問・メールなどの内容を対応履歴に残す',{chg:true}),
 feat('act.done','操作','完了','やることを完了にする（完了の取り消しも）',{chg:true}),
 feat('act.later','操作','明日へ・延期','やることの期限を1日延ばす',{chg:true}),
 feat('act.resched','操作','日程を変える','立会い・内見などの日時を変える',{chg:true}),
 feat('act.addtask','操作','やることを追加','部屋の画面やホームの「今日確認すること」からやることを足す（部屋なしも）',{chg:true}),
 feat('act.memo','操作','メモを書く・消す','ホームのメモ欄に書き足す・消す',{chg:true,dep:['home.notes']}),
 feat('act.memotodo','操作','メモからやることにする','ホームのメモを、期限と担当のあるやることにする',{chg:true,dep:['home.notes','act.addtask']}),
 feat('act.mocheck','操作','退去の段取りにチェック','退去の段取りの項目に済みの印を付ける',{chg:true,dep:['home.moveout']}),
 feat('act.call','操作','電話する','「電話する」ボタン。押すと発信を対応履歴に残します（発信の記録）',{chg:true}),
 feat('act.layout','操作','並びを変える（配置）','ホームの欄の並び・幅・表示を自分用に変える',{dep:HOME}),
 feat('act.roomedit','操作','物件・部屋の編集','部屋の間取り・広さなどを直す',{chg:true}),
 feat('act.rent','操作','募集家賃の変更','空室の募集家賃を変える（部屋の編集の中）',{chg:true,dep:['act.roomedit']}),
 feat('act.tenantedit','操作','入居者の連絡先を直す','メール・勤務先・緊急連絡先などを直す',{chg:true}),
 feat('act.notice','操作','退去の連絡','退去の連絡を登録する・取り消す',{chg:true}),
 feat('act.renew','操作','更新案内を作成','更新の案内を作る（更新後の家賃の入力も）',{chg:true}),
 feat('act.renewstep','操作','更新の進み具合を記録','更新案内を「送付済み」「更新合意」にする',{chg:true}),
 feat('act.confirm','操作','契約を確定','申込中の契約を契約中にする',{chg:true}),
 feat('act.movein','操作','入居済みにする','入居予定の契約を契約中にする',{chg:true}),
 /* Excelから取り込む (added 2026-10-19, user decision): import.html, entry on 物件・台帳 (and a link from 管理の引継ぎ) */
 feat('act.import','操作','Excelから取り込む','Excel・CSVの台帳から物件・部屋・入居者・契約をまとめて取り込む',{chg:true}),

 feat('money.import','お金','明細の取り込み','銀行やMFのCSVを取り込む（「取り込み」タブ）',{chg:true,dep:['page.money']}),
 feat('money.check','お金','入出金の確認','入出金を確認する・直す・紐付けない',{chg:true,dep:['page.money']}),
 feat('money.mf','お金','MFとの照合','MFの記録と入出金を見比べる（「MFとの照合」タブ）',{dep:['page.money']}),
 feat('money.remit','お金','オーナー送金','送金の明細を確定する・送金済みにする',{chg:true,dep:['page.money']}),
 feat('money.transfer','お金','総合振込データ','銀行に渡す総合振込の内容を表示・コピーする',{chg:true,dep:['money.remit']}),
 feat('money.close','お金','月の締め','入出金の月を締める',{chg:true,dep:['page.money']}),
 feat('money.unclose','お金','締めの解除','締めた月を理由を残して開け直す',{chg:true,dep:['money.close']}),
 feat('money.settings','お金','入出金の設定','科目・口座・送金手数料などの設定（「設定」タブ）',{chg:true,dep:['page.money']}),
 feat('sales.manual','お金','売上の手入力','売上・費用を手で足す・消す',{chg:true,dep:['page.sales']}),
 feat('sales.fix','お金','売上の確定','月の売上を確定する・確定を取り消す',{chg:true,dep:['page.sales']}),
 feat('sales.target','お金','目標の設定','月末会議の資料の目標を直す',{chg:true,dep:['sales.meeting']}),
 feat('sales.meeting','お金','月末会議の資料','管理部売上の「月末会議の資料」タブ',{dep:['page.sales']}),
 feat('acct.submit','お金','経理へ提出','締めた月の売上・費用・送金などを経理へ提出する（再提出も）',{chg:true,dep:['page.sales']}),
 feat('acct.receive','お金','引継ぎの受領・差し戻し','賃貸管理部から届いた月の引継ぎを受領する・差し戻す',{chg:true,dep:['page.acct'],def:{'担当者':false}}),
 /* 滞納の段階 (added 2026-10-19, user decision): see GK.dun below. Seeing the steps is for everyone; moving them is a change */
 feat('money.dunning','お金','滞納の段階','未収の家賃を、連絡1回目・2回目・保証会社への請求の段階で追う'),
 feat('act.dunning','お金','滞納の段階を進める','滞納の連絡・請求を「済み」にする、メモを残す',{chg:true,dep:['money.dunning']}),

 feat('pi.tel','個人情報','電話番号を表示','入居者の電話番号を「番号を表示」で全部表示する（表示は記録に残ります）',{pi:true}),
 feat('pi.owner','個人情報','オーナーの電話・口座の表示','オーナーの電話番号の表示とコピー、振込口座の表示',{pi:true}),

 feat('doc.read','書類・AI','書類から読み込む','申込書・契約書などの写真やPDFから欄にまとめて入れる（契約書から読み直すも）',{chg:true}),
 feat('doc.id','書類・AI','本人確認書類で確かめる','運転免許証などで本人確認をして記録する',{chg:true}),
 feat('doc.view','書類・AI','書類を開く','部屋・契約の「書類」にある契約書などを開く'),
 /* Dropbox (added 2026-10-19, user decision; ganki-dropbox.js): the list is shown to everyone, opening a document is treated
    like personal information (閲覧: OFF), linking is a change (閲覧: OFF). Connecting is in 機能の設定 (管理者). */
 feat('doc.dbx','書類・AI','書類（Dropbox）','物件・部屋・契約の画面に、Dropboxの書類の一覧を出す'),
 feat('doc.dbxopen','書類・AI','Dropboxの書類を開く','一覧の書類を開いて中身を見る（開いたことは記録に残ります）',{pi:true,dep:['doc.dbx']}),
 feat('doc.dbxlink','書類・AI','Dropboxの書類をつなぐ','つながっていない書類を部屋・物件につなぐ・外す',{chg:true,dep:['doc.dbx']}),

 /* AI (added 2026-10-19, user decision): AI only suggests; a person checks and decides. Never for money calculations, tax,
    送金・総合振込・締め, permissions or 本人確認. OFF = not drawn; everything still works by hand. 閲覧: OFF (chg).
    ai.write has no dependency of its own: each place also needs its own feature (対応の記録 / 電話する / 文面のひな形 / 更新案内を作成). */
 feat('ai.match','AI','入出金の紐付けの候補','要確認の入出金に、部屋・用途の候補をAIが出す（決めるのは人）',{chg:true,dep:['money.check']}),
 feat('ai.write','AI','文章の下書き','対応の記録の文や入居者への文面をAIが下書きする（使う前に人が確かめる）',{chg:true}),
 feat('ai.columns','AI','名簿の列合わせ','貼り付けた名簿の見出しと欄の対応をAIが提案する（取り込むのは人）',{chg:true,dep:['page.takeover']}),

 feat('in.addr','入力の補助','住所の候補','物件名や郵便番号から住所の候補を出す'),
 feat('in.tel','入力の補助','電話番号のハイフン','電話番号を入れるとハイフンを自動で入れる'),
 feat('in.palette','入力の補助','探す・移動（Ctrl＋K）','ホームの「探す・移動」で、部屋・操作・欄を名前で探して開く',{dep:HOME}),
 feat('in.msg','入力の補助','文面のひな形','督促・更新の案内・オーナーへの報告の文面を作ってコピーする（ホーム）',{dep:HOME}),
 /* じょのじょ (added 2026-10-19, user decision; ganki-jonojo.js): the helper mascot on every screen. ON for every role, not part of
    the AI group (works with AI OFF). OFF here wins over the person's own 「今は隠す」; ON never un-hides what a person hid. */
 feat('in.jono','入力の補助','じょのじょ','画面の右下のじょのじょに使い方を聞ける（使い方の案内だけ・業務データは使わない・どこにも送らない）'),

 feat('settings','設定','機能の設定','この画面。役割ごと・人ごとに機能のON/OFFを決める',{admin:true})
];
var FMAP={};GK.FEATURES.forEach(function(f){FMAP[f.key]=f});
GK.feature=function(k){return FMAP[k]||null};
GK.PAGE_FEATURE={'index.html':'page.home','properties.html':'page.props','tenants.html':'page.tenants','contracts.html':'page.contracts','money.html':'page.money','sales.html':'page.sales',
 'register.html':'page.register','turnover.html':'page.turnover','takeover.html':'page.takeover','settings.html':'settings','accounting.html':'page.acct',
 'import.html':'act.import'};
/* money / sales tabs that are features of their own (a link to such a tab is hidden too) */
GK.TAB_FEATURE={'money.html':{'import':'money.import','check':'','mf':'money.mf','remit':'','close':'','settings':'money.settings'},'sales.html':{'sales':'','meeting':'sales.meeting'}};

GK.staffList=function(){return Array.isArray(GK.db.staff)?GK.db.staff.filter(function(s){return s&&s.id}):[]};
GK.staffById=function(id){return GK.by(GK.staffList(),id)};
GK.roleOf=function(id){var s=GK.staffById(id);if(!s)return id?'閲覧':'担当者';return GK.ROLES.indexOf(s.role)>=0?s.role:'閲覧'};
function flagsOf(fl){fl=fl||GK.db.flags;return fl&&typeof fl==='object'?fl:{}}
function defaultOf(f,role){if(f.admin)return role==='管理者';if(f.def&&typeof f.def[role]==='boolean')return f.def[role];return role==='閲覧'?!(f.chg||f.pi):true}
GK.featureDefault=function(k,role){var f=FMAP[k];return f?defaultOf(f,role):true};
GK.isLocked=function(k,role){return k==='settings'&&role==='管理者'};
/* the role's own switch (without dependencies) */
function roleOwn(fl,role,k){
 var f=FMAP[k];if(!f)return true;if(GK.isLocked(k,role))return true;
 var r=fl.roles&&fl.roles[role];return r&&typeof r[k]==='boolean'?r[k]:defaultOf(f,role);
}
function personOwn(fl,id,k){var p=fl.people&&fl.people[id];return p&&typeof p[k]==='boolean'?p[k]:null}
function chain(own,k,seen){
 var f=FMAP[k];if(!f)return true;if(seen[k])return true;seen[k]=1;
 if(!own(k))return false;
 for(var i=0;i<f.dep.length;i++)if(!chain(own,f.dep[i],seen))return false;
 return true;
}
function canWith(fl,k,id){var role=GK.roleOf(id);return chain(function(x){var p=personOwn(fl,id,x);return p===null?roleOwn(fl,role,x):p},k,{})}
GK.can=function(k,id){try{return canWith(flagsOf(),k,id===undefined?GK.MEID:id)}catch(e){return true}};
GK.roleOwn=function(role,k,fl){return roleOwn(flagsOf(fl),role,k)};
GK.roleCan=function(role,k,fl){fl=flagsOf(fl);return chain(function(x){return roleOwn(fl,role,x)},k,{})};
GK.personOwn=function(id,k,fl){return personOwn(flagsOf(fl),id,k)};
GK.canWith=function(fl,k,id){return canWith(flagsOf(fl),k,id)};
/* keys this feature needs (all levels) / keys that need it (all levels) */
GK.needsOf=function(k){var out=[],go=function(x){var f=FMAP[x];if(!f)return;f.dep.forEach(function(d){if(out.indexOf(d)<0){out.push(d);go(d)}})};go(k);return out};
GK.usersOf=function(k){var out=[],go=function(x){GK.FEATURES.forEach(function(f){if(f.dep.indexOf(x)>=0&&out.indexOf(f.key)<0){out.push(f.key);go(f.key)}})};go(k);return out};
/* the people who can open 機能の設定 with these flags (staff with active:false do not count) */
GK.settingsPeople=function(fl){fl=flagsOf(fl);return GK.staffList().filter(function(s){return s.active!==false&&canWith(fl,'settings',s.id)})};
GK.flagSig=function(){try{return JSON.stringify(GK.db.flags||{})+'|'+GK.staffList().map(function(s){return s.id+':'+s.role}).join(',')+'|'+GK.MEID}catch(e){return ''}};
/* changes: [{scope:'role'|'person', who:<role>|<staff id>, key, val:true|false|null (null = 役割どおり / 標準どおり)}]
   -> {ok:true, undo} or {ok:false, msg}. Saved at once and written to the 操作の記録 (GK.log) with the text given. */
function cloneFl(){var f=flagsOf();return {roles:JSON.parse(JSON.stringify(f.roles||{})),people:JSON.parse(JSON.stringify(f.people||{}))}}
function putFlag(fl,c){
 var box=c.scope==='person'?(fl.people[c.who]=fl.people[c.who]||{}):(fl.roles[c.who]=fl.roles[c.who]||{});
 var v=c.val;
 if(c.scope==='role'&&typeof v==='boolean'&&FMAP[c.key]&&v===defaultOf(FMAP[c.key],c.who))v=null; /* the default is not stored */
 if(v===null||v===undefined)delete box[c.key];else box[c.key]=!!v;
}
function getFlag(fl,c){var b=c.scope==='person'?fl.people[c.who]:fl.roles[c.who];return b&&typeof b[c.key]==='boolean'?b[c.key]:null}
GK.LOCK_MSG='この変更をすると「機能の設定」を開ける人がいなくなるため、変更できません。管理者の役割の人を残してください。';
GK.flagSet=function(changes,text){
 changes=(changes||[]).filter(function(c){return c&&FMAP[c.key]&&!(c.scope==='role'&&GK.isLocked(c.key,c.who))});
 if(!changes.length)return {ok:false,msg:''};
 var fl=cloneFl(),before=changes.map(function(c){return {scope:c.scope,who:c.who,key:c.key,val:getFlag(fl,c)}});
 changes.forEach(function(c){putFlag(fl,c)});
 if(!GK.settingsPeople(fl).length)return {ok:false,msg:GK.LOCK_MSG};
 GK.db.flags=fl;GK.log('機能の設定：'+text);GK.save();
 return {ok:true,undo:function(){
  /* by key: only these switches go back, in the current GK.db (another tab may have changed others) */
  var f2=cloneFl();before.forEach(function(b){putFlag(f2,b)});
  if(!GK.settingsPeople(f2).length)return {ok:false,msg:GK.LOCK_MSG};
  GK.db.flags=f2;GK.log('機能の設定：元に戻しました（'+text+'）');GK.save();return {ok:true};
 }};
};

/* ---- the current person (demo): GK.MEID / GK.ME, chosen in the sidebar 「操作する人」, kept per viewer ---- */
var ME_KEY='ganki-demo-me';
(function(){
 var id=GK.store.get(ME_KEY),list=GK.staffList();
 /* local data mode: GK_LOCAL.me (a staff id) first, then the first person on the list */
 if(GK.LOCAL&&(!id||!GK.staffById(id)))id=LOC.me!=null&&GK.staffById(String(LOC.me))?String(LOC.me):(list[0]?list[0].id:'');
 if(!id||!GK.staffById(id))id=GK.staffById('s1')?'s1':(list[0]?list[0].id:'');
 GK.MEID=id;var s=GK.staffById(id);if(s)GK.ME=s.n;
})();
GK.meSelectHtml=function(){
 var list=GK.staffList();if(!list.length)return '';
 return '<div class="gk-me"><label for="gkMe">操作する人（'+(GK.LOCAL?'検証':'デモ')+'）</label><select id="gkMe">'+list.map(function(s){return '<option value="'+GK.esc(s.id)+'"'+(s.id===GK.MEID?' selected':'')+'>'+GK.esc(s.n+'（'+GK.roleOf(s.id)+'）')+'</option>'}).join('')+'</select></div>';
};
/* switching reloads the page, so every screen is drawn for the new person (drafts are kept by the pages as usual) */
GK.switchMe=function(id){
 if(!GK.staffById(id)||id===GK.MEID)return;
 GK.store.set(ME_KEY,id);
 try{location.reload()}catch(e){}
};

/* ---- a screen that is OFF: a calm notice instead of the page (nothing of the page is drawn) ---- */
var pageKey='',pageOff=false;
function firstPage(){var pf=GK.PAGE_FEATURE,n=NAV.filter(function(x){return GK.can(pf[x[0]])})[0];return n||null}
function offHtml(key){
 var f=FMAP[key]||{n:'この画面'},e=GK.esc,home=GK.can('page.home')?['index.html','ホーム']:firstPage();
 var demo='';
 if(key==='settings'){
  var ad=GK.settingsPeople().filter(function(s){return s.id!==GK.MEID});
  var pick=ad.filter(function(s){return GK.roleOf(s.id)==='管理者'})[0]||ad[0];
  if(pick&&document.getElementById('gkMe'))demo='<p class="gk-off-demo">'+e(GK.roleOf(pick.id))+'（'+e(pick.n)+' さん）に切り替えると開けます（'+(GK.LOCAL?'検証':'デモ')+'）。左の「操作する人」で切り替えられます。</p>';
 }
 return '<section class="gk-off" role="status" aria-labelledby="gkOffT"><h1 id="gkOffT">'+e(f.n)+'</h1><p>この画面は使えない設定になっています。管理者にご相談ください。</p>'+demo+
  (home?'<p><a class="gk-off-btn" href="'+home[0]+'">'+e(home[1])+'へ</a></p>':'')+'</section>';
}
function showOff(key){
 var m=document.querySelector('main')||document.getElementById('main');if(!m)return;
 m.innerHTML=offHtml(key);
 try{document.title=((FMAP[key]||{}).n||'')+'（使えない設定）'}catch(e){}
}
/* call right after GK.shell(): true = this screen is OFF for the current person (the page then draws nothing) */
GK.pageGate=function(key){pageKey=key;pageOff=!GK.can(key);if(pageOff)showOff(key);return pageOff};
GK.pageIsOff=function(){return pageOff};
GK.offToast=function(name){GK.toast('「'+name+'」は使えない設定になったため、閉じました')};

/* ---- 経理への引継ぎ: read-only status for pages that do not load ganki-acct.js (home, 入出金) — added 2026-10-19 ----
   GK.acctLatest('YYYY-MM') -> {state:'none'|'submitted'|'received'|'returned', ver, by, at, actBy, reason, label}.
   An older db without GK.db.acct: last month counts as the 受領済み sample that ganki-acct.js seeds (見本). */
GK.ACCT_LABEL={none:'未提出',submitted:'提出済み・確認待ち',received:'受領済み',returned:'差し戻し',withdrawn:'取り下げ'};
GK.acctLatest=function(m){
 var out={state:'none',ver:0,by:'',at:'',actBy:'',reason:'',label:GK.ACCT_LABEL.none};
 try{
  var a=GK.db.acct;
  if(!a||typeof a!=='object'||!Array.isArray(a.subs)){
   var t=GK.parse(GK.TODAY),pm=t?GK.iso(new Date(t.getFullYear(),t.getMonth()-1,1)).slice(0,7):'';
   if(m===pm&&!GK.LOCAL){out.state='received';out.ver=1;out.by='佐藤';out.actBy='田中';out.sample=true;out.label=GK.ACCT_LABEL.received}
   return out;
  }
  var l=a.subs.filter(function(s){return s&&s.m===m}).sort(function(x,y){return (+x.ver||0)-(+y.ver||0)}).pop();
  if(!l)return out;
  out.state=GK.ACCT_LABEL[l.state]?l.state:'none';out.ver=+l.ver||1;out.by=l.by||'';out.at=l.at||'';out.actBy=l.act&&l.act.by||'';out.reason=l.act&&l.act.reason||'';out.label=GK.ACCT_LABEL[out.state];
 }catch(e){}
 return out;
};
/* from resync(): the settings (or the people) changed in another tab. Returns false when the page must not refresh. */
GK.flagsChanged=function(){
 if(pageKey){
  var now=!GK.can(pageKey);
  if(pageOff&&!now){try{location.reload()}catch(e){}return false}
  if(!pageOff&&now){pageOff=true;try{if(GK.docs&&GK.docs.isOpen&&GK.docs.isOpen())GK.docs.close()}catch(e){}GK.shellAgain();showOff(pageKey);return false}
  if(pageOff){GK.shellAgain();showOff(pageKey);return false}
 }
 GK.shellAgain();
 try{if(GK.docs&&GK.docs.isOpen&&GK.docs.isOpen()&&GK.docs.openKey){var dk=GK.docs.openKey();if(dk&&!GK.can(dk)){GK.docs.close();GK.offToast(FMAP[dk].n)}}}catch(e){}
 sweepLinks(document.body);
 return true;
};

/* ---- links to a screen (or a 入出金 / 管理部売上 tab) that is OFF are taken out as soon as they are drawn ---- */
GK.linkOk=function(href){
 var m=/^([a-z]+\.html)(?:#tab-([a-z]+))?/.exec(String(href||''));if(!m)return true;
 if(m[1]==='settings.html'&&m[2]==='me')return true; /* 自分の表示 (じょのじょ): everyone's own display settings */
 var pk=GK.PAGE_FEATURE[m[1]];if(pk&&!GK.can(pk))return false;
 var tk=m[2]&&GK.TAB_FEATURE[m[1]]&&GK.TAB_FEATURE[m[1]][m[2]];return !tk||GK.can(tk);
};
function sweepLinks(root){
 try{
  if(!root||!root.querySelectorAll)return;
  [].forEach.call(root.querySelectorAll('a[href]'),function(a){
   if(a.closest&&a.closest('#side,.gk-off'))return;
   if(!GK.linkOk(a.getAttribute('href')))a.remove();
  });
 }catch(e){}
}
GK.sweepLinks=sweepLinks;
if(document.addEventListener){
 document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a||(a.closest&&a.closest('#side,.gk-off')))return;
  if(!GK.linkOk(a.getAttribute('href'))){e.preventDefault();GK.toast('この画面は使えない設定になっています')}
 },true);
}
try{
 if(typeof MutationObserver==='function'){
  var mo=new MutationObserver(function(list){list.forEach(function(r){[].forEach.call(r.addedNodes||[],function(n){if(n.nodeType!==1)return;if(n.tagName==='A'){if(!(n.closest&&n.closest('#side,.gk-off'))&&!GK.linkOk(n.getAttribute('href')))n.remove()}else sweepLinks(n)})})});
  var startMo=function(){if(document.body){mo.observe(document.body,{childList:true,subtree:true});sweepLinks(document.body)}};
  if(document.body)startMo();else document.addEventListener('DOMContentLoaded',startMo);
 }
}catch(e){}
var FLAG_CSS='.gk-me{display:flex;flex-direction:column;gap:4px;margin-bottom:12px}'+
 '.gk-me label{font-size:11px;color:var(--sidebar-muted,#aeb9cb);letter-spacing:.04em}'+
 '.gk-me select{width:100%;min-height:44px;border:1px solid #39465c;border-radius:7px;padding:6px 8px;background:var(--sidebar-active,#253044);color:var(--sidebar-fg,#f5f7fb);font:inherit;font-size:13px}'+
 '.gk-off{max-width:560px;margin:40px auto;background:var(--surface,#fff);border:1px solid var(--line,#dfe4ec);border-radius:10px;padding:24px 22px;display:flex;flex-direction:column;gap:12px;text-align:left}'+
 '.gk-off h1{font-size:19px;margin:0}.gk-off p{margin:0;font-size:14px;line-height:1.7}'+
 '.gk-off-demo{font-size:13px!important;color:var(--muted,#596579);background:var(--surface-2,#edf0f5);border-radius:8px;padding:8px 10px}'+
 '.gk-off-btn{display:inline-flex;align-items:center;min-height:44px;padding:8px 18px;border-radius:8px;background:var(--primary,#3359f2);color:var(--primary-fg,#fff);text-decoration:none;font-weight:500}';
(function(){try{if(!document.head||!document.createElement)return;var have=document.getElementById&&document.getElementById('gk-flag-style');if(have&&have.tagName==='STYLE')return;var s=document.createElement('style');s.id='gk-flag-style';s.textContent=FLAG_CSS;document.head.appendChild(s)}catch(e){}})();

/* ---------- 退去の連絡 (move-out notice): one form + one save used by properties and contracts ---------- */
GK.noticeForm=function(l,d){
 d=d||{};
 var date=('date' in d)?d.date:l.end,rec=('received' in d)?d.received:GK.TODAY,insp=d.insp||'';
 return '<div class="notice-form"><div class="grid2">'+
  '<div class="field"><label for="nDate">退去日<span class="req">必須</span></label><input id="nDate" type="date" data-draft="date" min="'+GK.TODAY+'" value="'+GK.esc(date)+'"></div>'+
  '<div class="field"><label for="nRec">受付日（連絡を受けた日）</label><input id="nRec" type="date" data-draft="received" max="'+GK.TODAY+'" value="'+GK.esc(rec)+'"></div>'+
  '<div class="field wide"><label for="nInsp">退去立会いの日時（決まっていれば）</label><input id="nInsp" type="datetime-local" data-draft="insp" value="'+GK.esc(insp)+'"></div></div>'+
  '<p class="cap">退去日には契約の終了日（'+GK.jp(l.end)+'）を入れてあります。立会い（退去の日に部屋の状態を一緒に確かめること）を入れると、担当のやることにも追加します。</p>'+
  '<p class="err" id="nErr" role="alert"></p>'+
  '<div class="panel-actions"><button type="button" class="btn primary" data-act="saveNotice" data-id="'+GK.esc(l.id)+'">退去の連絡を登録</button></div></div>';
};
/* returns null when fine, or {id:<input id>, msg} */
GK.noticeCheck=function(l,v){
 if(!v.date)return {id:'nDate',msg:'退去日を入れてください。'};
 if(v.date<GK.TODAY)return {id:'nDate',msg:'退去日が今日より前になっています（'+GK.jp(v.date)+'）。今日以降の日付にしてください。'};
 if(l.start&&v.date<l.start)return {id:'nDate',msg:'退去日が契約の開始日（'+GK.jp(l.start)+'）より前です。'};
 if(v.received&&v.received>GK.TODAY)return {id:'nRec',msg:'受付日が今日より後になっています。連絡を受けた日を入れてください。'};
 if(v.insp){
  if(!/^\d{4}-\d{2}-\d{2}/.test(v.insp))return {id:'nInsp',msg:'立会いの日時を確かめてください。'};
  if(v.insp.slice(0,10)>v.date)return {id:'nInsp',msg:'立会いが退去日（'+GK.jp(v.date)+'）より後になっています。退去日までの日時にしてください。'};
 }
 return null;
};
/* save the notice, add the 立会い task, log it. Returns an undo function. */
GK.saveNotice=function(l,v){
 var db=GK.db,prev=l.notice?JSON.parse(JSON.stringify(l.notice)):null,lc=db.log.length,hc=db.hist.length,task=null;
 l.notice={date:v.date,insp:v.insp?v.insp.replace('T',' ').slice(0,16):'',received:v.received||GK.TODAY};
 if(l.notice.insp)task=GK.addTask(l.unit,'退去立会い（'+GK.sd(l.notice.insp.slice(0,10))+' '+l.notice.insp.slice(11,16)+'）',l.notice.insp.slice(0,10));
 GK.log('退去の連絡を受け付けました（退去日 '+GK.jp(v.date)+(l.notice.insp?'・立会い '+GK.jp(l.notice.insp):'')+'）',l.unit);
 GK.save();
 /* undo looks records up again by id: GK.db may have been reloaded by a save in another tab */
 var lid=l.id,tid=task&&task.id,logAt=db.log[0],histId=db.hist[0]&&db.hist[0].id;
 return function(){
  var d=GK.db,cur=GK.lease(lid);
  if(cur){if(prev)cur.notice=prev;else delete cur.notice}
  if(tid)d.tasks=d.tasks.filter(function(t){return t.id!==tid});
  d.log=d.log.filter(function(x){return !(logAt&&x.at===logAt.at&&x.t===logAt.t)});
  if(histId)d.hist=d.hist.filter(function(x){return x.id!==histId});
  GK.save();
 };
};
/* read #nDate/#nRec/#nInsp inside root, show the error inline (aria-invalid) or save. Returns undo or null. */
GK.noticeSubmit=function(l,root){
 root=root||document;
 var q=function(id){return root.querySelector('#'+id)},val=function(id){var e=q(id);return e?e.value.trim():''};
 var v={date:val('nDate'),received:val('nRec')||GK.TODAY,insp:val('nInsp')};
 ['nDate','nRec','nInsp'].forEach(function(id){var e=q(id);if(e){e.removeAttribute('aria-invalid');e.removeAttribute('aria-describedby')}});
 var er=q('nErr'),bad=GK.noticeCheck(l,v);
 if(bad){if(er)er.textContent=bad.msg;var f=q(bad.id);if(f){f.setAttribute('aria-invalid','true');f.setAttribute('aria-describedby','nErr');f.focus()}return null}
 if(er)er.textContent='';
 return GK.saveNotice(l,v);
};

/* ---------- 管理の引継ぎ (takeover.html; additive 2026-10-17) ----------
   GK.db.takeovers: one record per building taken over from another management company.
   An older stored db has no such key: GK.takeovers() adds [] in memory (nothing is saved until a user action).
   {
     id:'TO'+Date.now(),
     name:'物件名' ('' until entered),
     step:0-4            furthest wizard step reached (0 物件とオーナー, 1 受け取る書類, 2 部屋と入居者, 3 入居者へのお知らせ, 4 確認して登録),
     start:'YYYY-MM-DD'  管理開始日,
     owner:{mode:'pick'|'new', id:'o1' (pick), n,k,tel (new)},
     prop:{addr, struct, year},
     prev:{n,tel}        前の管理会社,
     docs:[[label, done 0|1, note], ...],
     rooms:[{no, ten (''=空室), k (フリガナ), tel, rent (string), start ('' = 不明: 管理開始日 + startUnknown on the lease),
             end ('' = start + 2年, rolled forward), gua:'あり'|'なし'|'不明', guaName}]   (k, tel, start added 2026-10-18; older records lack them),
     letters:{sendOn ('' = automatic, see GK.takeoverSendOn), drafted:bool, text:{yes:'',no:''} ('' = automatic wording)},
     updated:'YYYY-MM-DDTHH:MM', done:bool, sample:true (only the seeded examples),
     propId:'GK-0xxx', doneAt:'YYYY-MM-DD'   (only after 「引継ぎを登録」)
   }
   Stable helpers for the home block:
     GK.takeovers()        -> the array (always an array)
     GK.takeover(id)       -> one record or null
     GK.takeoverSendOn(t)  -> 'YYYY-MM-DD' the day the tenant letters go out (chosen, or 30 days before start, not before today)
     GK.takeoverNext(t)    -> {label, due, step, done}  next thing to do in plain words; due = the send day (everything must be ready by then);
                              for a finished record {label:'引継ぎ完了', due:start, step:5, done:true}
     GK.takeoverRooms(t)   -> {rooms, occupied, vacant, yes, no, unknown}  counts used by the page and the home
     takeover.html#to-<id> opens a record (resume, or the finished summary). */
/* An older stored db (no takeovers key) gets the 3 in-progress samples (sample:true, ids TOS1-TOS3) in memory only;
   they are saved with the first user action, like any other change. A stored empty list stays empty. */
GK.takeovers=function(){if(GK.db.takeovers===undefined)GK.db.takeovers=GK.LOCAL?[]:sampleTakeovers();else if(!Array.isArray(GK.db.takeovers))GK.db.takeovers=[];return GK.db.takeovers};
GK.takeover=function(id){return id?GK.by(GK.takeovers(),id):null};
GK.takeoverSendOn=function(t){
 if(t&&t.letters&&t.letters.sendOn)return t.letters.sendOn;
 var s=t&&t.start&&GK.parse(t.start)?GK.addDays(t.start,-30):'';
 return !s||s<GK.TODAY?GK.TODAY:s;
};
GK.takeoverRooms=function(t){
 var r={rooms:0,occupied:0,vacant:0,yes:0,no:0,unknown:0};
 ((t&&t.rooms)||[]).forEach(function(x){
  if(!String(x.no||'').trim())return;r.rooms++;
  if(!String(x.ten||'').trim()){r.vacant++;return}
  r.occupied++;if(x.gua==='あり')r.yes++;else if(x.gua==='なし')r.no++;else r.unknown++;
 });
 return r;
};
GK.takeoverNext=function(t){
 if(!t)return {label:'',due:'',step:0,done:false};
 if(t.done)return {label:'引継ぎ完了',due:t.start||'',step:5,done:true};
 var due=GK.takeoverSendOn(t),st=+t.step||0,label;
 if(st<=0)label='物件とオーナーを入れる';
 else if(st===1)label='受け取る書類を確認する';
 else if(st===2){
  var rs=(t.rooms||[]).filter(function(x){return String(x.no||'').trim()});
  var left=rs.filter(function(x){return String(x.ten||'').trim()&&!String(x.rent||'').replace(/\D/g,'')}).length;
  label=!rs.length?'部屋と入居者を入れる':left?'部屋と入居者を入れる（あと '+left+'室）':'部屋と入居者を確かめる';
 }
 else if(st===3)label='入居者へのお知らせを作る';
 else label='確認して登録する';
 return {label:label,due:due,step:st,done:false};
};

/* ---------- additive 2026-10-18 ---------- */
/* a to-do that is an appointment at a set time (立会い・内見, or a time like 10:30 in the text, or task.at) */
GK.fixedTime=function(task){
 if(!task)return false;
 var t=String(task.t||'').normalize('NFKC').trim();
 return !!task.at||/(^|[^\d])([01]?\d|2[0-3]):[0-5]\d/.test(t)||/^(退去立会い|内見|立会い)/.test(t);
};
/* cross-page sync: another tab saved the store (or this page came back from the back/forward cache)
   -> reload GK.db, update the sidebar 契約・更新 badge, and call window.GKrefresh() when the page defines one */
function syncBadge(){
 var a=document.querySelector('#side a[href="contracts.html"]');if(!a)return;
 var n=GK.renewalsDue().length,b=a.querySelector('.badge');
 if(!n){if(b)b.remove();return}
 if(!b){b=document.createElement('span');b.className='badge';a.appendChild(b)}
 b.textContent=String(n);b.setAttribute('aria-label','要確認 '+n+'件');
}
function moneySync(){
 var a=document.querySelector('#side a[href="money.html"]');if(!a)return;
 var n=moneyBadge(),b=a.querySelector('.badge');
 if(!n){if(b)b.remove();return}
 if(!b){b=document.createElement('span');b.className='badge';a.appendChild(b)}
 b.textContent=String(n);b.setAttribute('aria-label','未確認 '+n+'件（要確認と確認待ち）');
}
function resync(ev){
 var before=typeof GK.flagSig==='function'?GK.flagSig():'';
 try{GK.db=GK.load()}catch(e){return}
 /* 機能の設定 changed in another tab: menu, page notice, open dialogs (see GK.flagsChanged) */
 if(typeof GK.flagSig==='function'&&GK.flagSig()!==before){try{if(GK.flagsChanged()===false)return}catch(e){if(window.console)console.error(e)}}
 try{syncBadge()}catch(e){}
 try{moneySync()}catch(e){}
 try{if(GK.LOCAL&&GK.localUi)GK.localUi.count()}catch(e){}
 if(typeof window.GKrefresh==='function'){try{window.GKrefresh(ev)}catch(e){if(window.console)console.error(e)}}
}
if(window.addEventListener){
 window.addEventListener('storage',function(e){if(e.key===KEY||e.key===null)resync(e)});
 window.addEventListener('pageshow',function(e){if(e&&e.persisted)resync(e)});
}

/* ---------- 電話する: automatic call history (additive 2026-10-18) ----------
   GK.callLink(tel,{name,role,unit,task}) -> '<a class="act call" href="tel:…" data-call="1" …>電話する</a>' ('' when there is no number).
     name: as it should read (「田中 優子 様」「ミズテック設備」), role: 入居者 / オーナー / 保証会社 / 業者 / 前の管理会社 …,
     unit: the room the call is about (optional; the entry then also goes into that room's 対応履歴), task: a GK.db.tasks id (optional).
   One delegated click handler (on document) records the call at once — GK.db.log (+ GK.db.hist with a unit):
   「電話（発信）：<name>（<role>）」 — without preventDefault, so the tel: link still opens the phone app where it can.
   Then the call sheet opens: result / topic / one line / 次の対応. 「記録する」 rewrites the SAME entry (found again by id:
   GK.db may have been reloaded by another tab), 「あとで書く」 keeps it as it is, 「記録しない」 removes it.
   A call whose sheet was not answered survives a reload of the tab (sessionStorage) and the sheet comes back.
   Logic helpers (no DOM): GK.callStart(info) -> call, GK.callText(call,v), GK.callFinish(call,v) -> {text,task,undo},
   GK.callDiscard(call) -> undo, GK.callLater(); GK.isCall(t) / GK.callPill(t) mark 発信 entries in history lists. */
var CALL_KEY='ganki-call-pending',callSeq=0;
var CALL_RES=['つながった','留守電に残した','出なかった'],CALL_TOPIC=['家賃','修理・設備','更新','退去','入居の手続き','その他'];
function hmNow(){return new Date().toTimeString().slice(0,5)}
function telDigits(tel){var s=String(tel==null?'':tel);try{s=s.normalize('NFKC')}catch(e){}return s.replace(/[^\d+]/g,'')}
/* opt.ref ('tenant:<id>' / 'owner:<id>' / 'em:<tenant id>'): for a number that is shown masked. The full number is then
   not written into the page; it is looked up when the link is pressed (href is filled in just before the browser follows it). */
GK.callLink=function(tel,opt){
 tel=String(tel==null?'':tel).trim();opt=opt||{};
 if(typeof GK.can==='function'&&!GK.can('act.call'))return ''; /* 機能の設定: 電話する OFF */
 var dg=telDigits(tel);if(!tel||!dg)return '';
 var e=GK.esc,name=String(opt.name||'').trim(),ref=opt.ref?String(opt.ref):'';
 return '<a class="act call" href="tel:'+(ref?'':e(dg))+'" data-call="1"'+(ref?' data-ref="'+e(ref)+'"':' data-tel="'+e(tel)+'"')+' data-name="'+e(name)+'" data-role="'+e(opt.role||'')+'"'+
  (opt.unit?' data-unit="'+e(opt.unit)+'"':'')+(opt.task?' data-task="'+e(opt.task)+'"':'')+' aria-label="'+e((name||GK.mask(tel))+' に電話する')+'">電話する</a>';
};
GK.callResolve=function(ref){
 var m=/^(tenant|owner|em|gu):(.+)$/.exec(String(ref||''));if(!m)return '';
 var r=m[1]==='owner'?GK.owner(m[2]):GK.tenant(m[2]);if(!r)return '';
 return String((m[1]==='em'?r.emTel:m[1]==='gu'?r.gTel:r.tel)||'').trim(); /* gu: the tenant's 連帯保証人 (2026-10-19) */
};
GK.callBase=function(name,role,tel){return '電話（発信）：'+(String(name||'').trim()||String(tel||''))+(role?'（'+role+'）':'')};
GK.isCall=function(t){return String(t||'').indexOf('電話（発信）')===0};
GK.callPill=function(t){return GK.isCall(t)?'<span class="pill info gk-callpill">発信</span>':''};
/* 「電話（発信）：田中 優子 様（入居者）— つながった・修理・設備：網戸の日程を 10/20 午前で調整」 */
GK.callText=function(c,v){
 v=v||{};var parts=[v.res,v.topic].filter(Boolean),memo=String(v.memo||'').replace(/\s+/g,' ').trim();
 var tail=parts.join('・')+(memo?(parts.length?'：':'')+memo:'');
 return (c&&c.base||'')+(tail?'— '+tail:'');
};
function byId(list,id){if(!id||!Array.isArray(list))return null;for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===id)return list[i];return null}
function cutId(list,id){if(!id||!Array.isArray(list))return null;for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===id)return list.splice(i,1)[0];return null}
function callRefresh(){if(typeof window.GKrefresh==='function'){try{window.GKrefresh({type:'gk-call'})}catch(e){if(window.console)console.error(e)}}}
function pendSet(c){try{window.sessionStorage.setItem(CALL_KEY,JSON.stringify(c))}catch(e){}}
function pendGet(){try{var r=window.sessionStorage.getItem(CALL_KEY);return r?JSON.parse(r):null}catch(e){return null}}
function pendDrop(){try{window.sessionStorage.removeItem(CALL_KEY)}catch(e){}}
/* write the 「電話（発信）」 entry now and remember the call for the sheet (and for a reload) */
GK.callStart=function(info){
 info=info||{};var db=GK.db,at=GK.TODAY+' '+hmNow(),now=Date.now();
 var c={lid:'c'+now+'-'+(++callSeq),hid:'',tel:String(info.tel||'').trim(),name:String(info.name||'').trim(),role:String(info.role||'').trim(),unit:String(info.unit||'').trim(),task:String(info.task||'').trim(),at:at,ms:now};
 c.base=GK.callBase(c.name,c.role,c.tel);
 if(!Array.isArray(db.log))db.log=[];
 db.log.unshift({id:c.lid,at:at,t:c.base,unit:c.unit,who:GK.ME});
 if(c.unit){c.hid='h'+now+'-'+(++histSeq);if(!Array.isArray(db.hist))db.hist=[];db.hist.unshift({id:c.hid,unit:c.unit,at:at,t:c.base,who:GK.ME})}
 GK.save();pendSet(c);
 return c;
};
/* the call's entries in the current GK.db (put back when another tab's save dropped them) */
function callEntries(c){
 var db=GK.db,l=byId(db.log,c.lid),h=c.hid?byId(db.hist,c.hid):null;
 if(!l){if(!Array.isArray(db.log))db.log=[];l={id:c.lid,at:c.at,t:c.base,unit:c.unit,who:GK.ME};db.log.unshift(l)}
 if(c.hid&&!h){if(!Array.isArray(db.hist))db.hist=[];h={id:c.hid,unit:c.unit,at:c.at,t:c.base,who:GK.ME};db.hist.unshift(h)}
 return {l:l,h:h};
}
/* v: {res, topic, memo, next, due, doneTask}. Rewrites the same entry; returns {text, task, undo} */
GK.callFinish=function(c,v){
 v=v||{};var text=GK.callText(c,v),en=callEntries(c),prevL=en.l.t,prevH=en.h?en.h.t:'';
 en.l.t=text;if(en.h)en.h.t=text;
 var next=String(v.next||'').replace(/\s+/g,' ').trim(),due=/^\d{4}-\d{2}-\d{2}$/.test(v.due||'')&&v.due>=GK.TODAY?v.due:GK.addDays(GK.TODAY,1);
 var task=next?GK.addTask(c.unit,next,due):null,tid=task&&task.id,src=null,dun=null;
 /* a call from a 滞納 row (task 'dun:<lease id>'): 「…を済みにする」 marks that step (GK.dun) with the call's text as its note */
 if(v.doneTask&&/^dun:/.test(c.task||'')&&GK.dun&&GK.can('act.dunning')){var tail=text.slice(String(c.base||'').length).replace(/^—\s*/,''),dr=GK.dun.done(c.task.slice(4),{note:'電話'+(tail?'：'+tail:'')});if(dr.ok)dun=dr}
 else if(v.doneTask&&c.task){var k=byId(GK.db.tasks,c.task);if(k&&!k.done){src={id:k.id,had:Object.prototype.hasOwnProperty.call(k,'doneAt'),at:k.doneAt};k.done=true;k.doneAt=GK.TODAY}}
 GK.save();pendDrop();
 return {text:text,task:task,dun:dun,undo:function(){
  if(dun)dun.undo();
  var d=GK.db,l=byId(d.log,c.lid),h=c.hid?byId(d.hist,c.hid):null;
  if(l&&l.t===text)l.t=prevL;if(h&&h.t===text)h.t=prevH||c.base;
  if(tid&&Array.isArray(d.tasks))d.tasks=d.tasks.filter(function(x){return x.id!==tid});
  if(src){var k2=byId(d.tasks,src.id);if(k2){k2.done=false;if(src.had)k2.doneAt=src.at;else delete k2.doneAt}}
  GK.save();
 }};
};
/* 「記録しない（間違えて押した）」: removes this call's own entries only; returns undo */
GK.callDiscard=function(c){
 var d=GK.db,l=cutId(d.log,c.lid),h=c.hid?cutId(d.hist,c.hid):null;GK.save();pendDrop();
 return function(){var d2=GK.db;if(l&&!byId(d2.log,l.id))d2.log.unshift(l);if(h&&!byId(d2.hist,h.id))d2.hist.unshift(h);GK.save()};
};
GK.callLater=function(){pendDrop()};

/* ---- the call sheet (bottom sheet on a phone, small dialog on a PC) ---- */
var CALL_CSS='.act.call{display:inline-flex;align-items:center;gap:4px;text-decoration:none;color:var(--primary,#3359f2);border-color:var(--line,#dfe4ec);background:var(--surface,#fff);cursor:pointer;white-space:nowrap;vertical-align:middle;line-height:1.6}'+
 '.act.call:hover{background:var(--primary-soft,#e9eefb);color:var(--primary,#3359f2)}'+
 '.gk-callpill{margin-right:6px;vertical-align:1px}'+
 'html.gkc-open{overflow:hidden}'+
 '.gkc-wrap{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:16px}'+
 '.gkc-wrap[hidden]{display:none}'+
 '.gkc-scrim{position:absolute;inset:0;background:var(--scrim,rgba(10,14,20,.35))}'+
 '.gkc{position:relative;width:100%;max-width:440px;max-height:calc(100vh - 32px);overflow:auto;background:var(--surface,#fff);color:var(--fg,#1b2535);border:1px solid var(--line,#dfe4ec);border-radius:12px;box-shadow:0 12px 40px rgba(27,37,53,.2);padding:16px 18px 18px;display:flex;flex-direction:column;gap:10px;font-family:var(--font,system-ui,sans-serif);font-size:14px;line-height:1.6;text-align:left}'+
 '.gkc h2{font-size:16px;font-weight:700;margin:0}'+
 '.gkc p{margin:0}'+
 '.gkc-sub{font-size:12px;color:var(--muted,#596579)}'+
 '.gkc-lead{font-size:13px;color:var(--fg,#1b2535);background:var(--surface-2,#edf0f5);border-radius:8px;padding:8px 10px}'+
 '.gkc-num{display:flex;align-items:center;gap:10px;flex-wrap:wrap}'+
 '.gkc-tel{font-size:20px;font-weight:700;letter-spacing:.03em;user-select:all;-webkit-user-select:all;font-variant-numeric:tabular-nums}'+
 '.gkc-cap{font-size:12px;color:var(--muted,#596579)}'+
 '.gkc-lab{display:block;font-size:12px;color:var(--muted,#596579);font-weight:500;margin-bottom:4px}'+
 '.gkc-chips{display:flex;flex-wrap:wrap;gap:6px}'+
 '.gkc-chip{border:1px solid var(--input,#cbd3df);background:var(--surface,#fff);color:var(--fg,#1b2535);border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;min-height:40px;cursor:pointer}'+
 '.gkc-chip:hover{border-color:var(--primary,#3359f2)}'+
 '.gkc-chip[aria-pressed="true"]{background:var(--primary-soft,#e9eefb);border-color:var(--primary,#3359f2);color:var(--primary,#3359f2);font-weight:700}'+
 '.gkc input[type="text"],.gkc input[type="date"]{width:100%;min-width:0;border:1px solid var(--input,#cbd3df);border-radius:8px;padding:8px 10px;min-height:40px;background:var(--surface,#fff);color:var(--fg,#1b2535);font:inherit;font-size:14px}'+
 '.gkc input[aria-invalid="true"]{border-color:var(--danger,#b4332b)}'+
 '.gkc-row{display:flex;gap:8px;flex-wrap:wrap}.gkc-row input[type="text"]{flex:1 1 180px}.gkc-row input[type="date"]{flex:0 1 160px}'+
 '.gkc-chk{display:flex;gap:8px;align-items:center;font-size:13px;min-height:40px;cursor:pointer}.gkc-chk input{width:18px;height:18px;margin:0;accent-color:var(--primary,#3359f2)}'+
 '.gkc-err{font-size:12px;color:var(--danger,#b4332b)}.gkc-err:empty{display:none}'+
 '.gkc-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}'+
 '.gkc-btn{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--input,#cbd3df);background:var(--surface,#fff);color:var(--fg,#1b2535);border-radius:8px;padding:7px 14px;font:inherit;font-size:13.5px;min-height:40px;cursor:pointer;white-space:nowrap}'+
 '.gkc-btn:hover{background:var(--surface-2,#edf0f5)}'+
 '.gkc-btn.primary{background:var(--primary,#3359f2);border-color:var(--primary,#3359f2);color:var(--primary-fg,#fff);font-weight:700}'+
 '.gkc-btn.primary:hover{filter:brightness(1.05)}'+
 '.gkc-btn.quiet{border-color:transparent;background:transparent;color:var(--muted,#596579);text-decoration:underline;text-underline-offset:2px;padding-inline:6px}'+
 '.gkc-btn.quiet:hover{color:var(--danger,#b4332b);background:transparent}'+
 '.gkc :focus-visible{outline:2px solid var(--primary,#3359f2);outline-offset:2px}'+
 '.gkc-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}'+
 '@media (max-width:640px){.gkc-wrap{align-items:flex-end;padding:0}.gkc{max-width:none;max-height:92vh;border-radius:16px 16px 0 0;border-bottom:0;padding:16px 16px calc(18px + env(safe-area-inset-bottom,0px))}.gkc-acts .gkc-btn{flex:1 1 auto}.gkc-acts .gkc-btn.quiet{flex-basis:100%}}'+
 '@media (prefers-reduced-motion:no-preference){.gkc{animation:gkcIn .16s ease-out}@keyframes gkcIn{from{transform:translateY(12px);opacity:.6}to{transform:none;opacity:1}}}';
function callCss(){
 try{
  if(!document.head||!document.createElement)return;
  var have=document.getElementById&&document.getElementById('gk-call-style');
  if(have&&have.tagName==='STYLE')return;
  var s=document.createElement('style');s.id='gk-call-style';s.textContent=CALL_CSS;document.head.appendChild(s);
 }catch(e){}
}
callCss();
var CS=null; /* the open sheet: {c, el, ret, res, topic, touchedDone} */
function chipRow(kind,list,label){
 return '<div><span class="gkc-lab" id="gkc-'+kind+'-l">'+label+'</span><div class="gkc-chips" role="group" aria-labelledby="gkc-'+kind+'-l">'+
  list.map(function(x){return '<button type="button" class="gkc-chip" data-gkc="'+kind+'" data-v="'+GK.esc(x)+'" aria-pressed="false">'+GK.esc(x)+'</button>'}).join('')+'</div></div>';
}
function sheetHtml(c,opt){
 var e=GK.esc,who=c.name||c.tel,room=c.unit?GK.roomLabel(c.unit):'',dun=/^dun:/.test(c.task||'')&&GK.dun&&GK.can('act.dunning')?GK.dun.taskInfo(c.task.slice(4)):null,task=c.task&&!dun?byId(GK.db.tasks,c.task):dun?{t:dun.label,done:false}:null;
 var time=String(c.at||'').slice(11,16),day=String(c.at||'').slice(0,10)===GK.TODAY?'今日 ':GK.sd(String(c.at||'').slice(0,10))+' ';
 var lead=opt.reopen?'さっきの電話の内容を記録しますか？（'+day+time+' に発信）':'発信を対応履歴に残しました（'+day+time+'）。切ったあとに、結果をひとこと記録してください。';
 return '<div class="gkc-scrim" data-gkc="scrim"></div>'+
  '<section class="gkc" role="dialog" aria-modal="true" aria-labelledby="gkc-title" aria-describedby="gkc-lead">'+
  '<div><h2 id="gkc-title">'+e(who)+' への電話</h2>'+((c.role||room)?'<p class="gkc-sub">'+e([c.role,room].filter(Boolean).join(' · '))+'</p>':'')+'</div>'+
  '<p class="gkc-lead" id="gkc-lead">'+e(lead)+'</p>'+
  '<div><div class="gkc-num"><span class="gkc-tel" id="gkc-tel">'+e(typeof GK.formatTel==='function'?GK.formatTel(c.tel):c.tel)+'</span><button type="button" class="gkc-btn" data-gkc="copy" aria-label="'+e(c.tel)+' をコピー">コピー</button></div>'+
  '<p class="gkc-cap">つながらないときは、この番号に電話してください。</p></div>'+
  chipRow('res',CALL_RES,'結果')+chipRow('topic',CALL_TOPIC,'用件')+
  '<div><label class="gkc-lab" for="gkc-memo">内容（ひとことで）</label><input id="gkc-memo" type="text" maxlength="200" autocomplete="off" placeholder="例：網戸の日程を 10/20 午前で調整"></div>'+
  /* AIの提案 (2026-10-19): the memo + 結果/用件 -> a clear sentence, shown with 使う／やめる (nothing is recorded by it) */
  (GK.ai&&GK.can('ai.write')?'<div class="gkc-ai"><button type="button" class="gkc-btn" data-gkc="ai" aria-controls="gkc-ai">AIで文章にする</button><div id="gkc-ai"></div></div>':'')+
  '<div><label class="gkc-lab" for="gkc-next">次の対応（あれば）</label><div class="gkc-row"><input id="gkc-next" type="text" maxlength="120" autocomplete="off" placeholder="例：業者に日程を伝える" aria-describedby="gkc-next-cap"><input id="gkc-due" type="date" min="'+e(GK.TODAY)+'" value="'+e(GK.addDays(GK.TODAY,1))+'" aria-label="次の対応の期限" aria-describedby="gkc-next-cap"></div>'+
  '<p class="gkc-cap" id="gkc-next-cap">入れると「今日確認すること」に追加します（期限は明日にしてあります）。</p></div>'+
  (task&&!task.done?'<label class="gkc-chk"><input type="checkbox" id="gkc-done">「'+e(task.t)+'」を'+(dun?'済みにする（滞納の段階）':'完了にする')+'</label>':'')+
  '<p class="gkc-err" id="gkc-err" role="alert"></p>'+
  '<div class="gkc-acts"><button type="button" class="gkc-btn primary" data-gkc="rec">記録する</button><button type="button" class="gkc-btn" data-gkc="later">あとで書く</button><button type="button" class="gkc-btn quiet" data-gkc="discard">記録しない（間違えて押した）</button></div>'+
  '<p class="gkc-sr" role="status" id="gkc-status"></p>'+
  '</section>';
}
function q(id){return document.getElementById(id)}
function focusables(){return CS?[].slice.call(CS.el.querySelectorAll('button,input,textarea,select,[href],[tabindex]:not([tabindex="-1"])')).filter(function(x){return !x.disabled&&x.offsetParent!==null}):[]}
function focusFirst(){if(!CS)return;var f=CS.el.querySelector('.gkc-chip')||focusables()[0];if(f)try{f.focus()}catch(e){}}
function say(msg){var s=q('gkc-status');if(s){s.textContent='';setTimeout(function(){s.textContent=msg},30)}}
function setPressed(kind,v){
 [].forEach.call(CS.el.querySelectorAll('[data-gkc="'+kind+'"]'),function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-v')===v))});
}
function closeSheet(){
 if(!CS)return;var s=CS;CS=null;
 try{s.el.hidden=true;s.el.innerHTML='';document.documentElement.classList.remove('gkc-open')}catch(e){}
 var r=s.ret;
 if(!r||!document.body.contains(r)){try{r=document.querySelector(s.retSel||'[data-call][data-tel="'+String(s.c.tel).replace(/["\\]/g,'\\$&')+'"]')}catch(e){r=null}}
 if(r&&r.focus)try{r.focus()}catch(e){}
}
function sheetVals(){
 var v=function(id){var x=q(id);return x?String(x.value||'').trim():''},d=q('gkc-done');
 return {res:CS.res,topic:CS.topic,memo:v('gkc-memo'),next:v('gkc-next'),due:v('gkc-due'),doneTask:!!(d&&d.checked)};
}
function sheetDirty(){if(!CS)return false;var v=sheetVals();return !!(v.res||v.topic||v.memo||v.next)}
function doRecord(){
 var v=sheetVals(),er=q('gkc-err'),due=q('gkc-due');
 if(due)due.removeAttribute('aria-invalid');if(er)er.textContent='';
 if(v.next&&v.due&&(!/^\d{4}-\d{2}-\d{2}$/.test(v.due)||v.due<GK.TODAY)){if(er)er.textContent='次の対応の期限は、今日（'+GK.sd(GK.TODAY)+'）以降の日付にしてください。';if(due){due.setAttribute('aria-invalid','true');due.focus()}return}
 var c=CS.c,r=GK.callFinish(c,v);closeSheet();callRefresh();
 var done=v.doneTask&&c.task;
 GK.toast('電話の内容を記録しました'+(r.task?'。次の対応（'+GK.sd(r.task.due)+'）を「今日確認すること」に入れました':r.dun?'。「'+r.dun.label+'」を済みにしました':done?'。やることを完了にしました':''),function(){r.undo();callRefresh();GK.toast('元に戻しました（発信の記録は残っています）')});
}
function doLater(){if(!CS)return;GK.callLater();closeSheet();callRefresh();GK.toast('発信だけ対応履歴に残しました')}
function doDiscard(){
 if(!CS)return;var undo=GK.callDiscard(CS.c);closeSheet();callRefresh();
 GK.toast('この電話の記録を消しました',function(){undo();callRefresh();GK.toast('記録を戻しました')});
}
function sheetClick(e){
 e.stopPropagation();
 var b=e.target&&e.target.closest?e.target.closest('[data-gkc]'):null;if(!b||!CS)return;
 var k=b.getAttribute('data-gkc'),v=b.getAttribute('data-v');
 if(k==='res'||k==='topic'){
  var nv=CS[k]===v?'':v;CS[k]=nv;setPressed(k,nv);
  if(k==='res'&&!CS.touchedDone){var d=q('gkc-done');if(d)d.checked=nv==='つながった'}
  return;
 }
 if(k==='copy'){
  var tel=CS.c.tel,ok=function(){b.textContent='コピーしました';say(tel+' をコピーしました')},ng=function(){try{var sel=window.getSelection(),rg=document.createRange();rg.selectNodeContents(q('gkc-tel'));sel.removeAllRanges();sel.addRange(rg)}catch(x){}say('番号を選びました。Ctrl+C（スマホは長押し）でコピーできます')};
  try{if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(tel).then(ok,ng);else ng()}catch(x){ng()}
  return;
 }
 if(k==='ai'){
  if(!GK.ai||!GK.can('ai.write'))return;
  var mm=q('gkc-memo');GK.ai.mountWrite(q('gkc-ai'),{ctx:'call',res:CS.res,topic:CS.topic,memo:mm?mm.value:'',into:mm,ret:b,btn:'gkc-btn'});
  return;
 }
 if(k==='rec')return doRecord();
 if(k==='later')return doLater();
 if(k==='discard')return doDiscard();
 if(k==='scrim'){if(sheetDirty()){say('入力した内容があります。「記録する」か「あとで書く」を押してください');var p=CS.el.querySelector('[data-gkc="rec"]');if(p)p.focus()}else doLater()}
}
function sheetKey(e){
 e.stopPropagation();if(!CS)return;
 if(e.key==='Escape'){if(e.isComposing)return;e.preventDefault();doLater();return}
 if(e.key==='Enter'&&!e.isComposing&&e.target&&(e.target.id==='gkc-memo'||e.target.id==='gkc-next')){e.preventDefault();doRecord();return}
 if(e.key==='Tab'){
  var f=focusables();if(!f.length)return;var i=f.indexOf(document.activeElement);
  if(e.shiftKey&&(i<=0)){e.preventDefault();f[f.length-1].focus()}
  else if(!e.shiftKey&&(i<0||i===f.length-1)){e.preventDefault();f[0].focus()}
 }
}
function stopOnly(e){e.stopPropagation()}
/* opens the sheet for a call made with GK.callStart (opt.reopen: after a reload) */
GK.callOpen=function(c,opt){
 opt=opt||{};if(!c||!document.body||!document.createElement)return;
 callCss();
 if(CS)closeSheet();
 var el=document.getElementById('gkCall');
 if(!el||el.tagName!=='DIV'||!el.addEventListener||!el.querySelector){
  el=document.createElement('div');el.id='gkCall';el.className='gkc-wrap';document.body.appendChild(el);
  el.addEventListener('click',sheetClick);el.addEventListener('keydown',sheetKey);
  ['input','change','keyup','keypress','submit','mousedown'].forEach(function(t){el.addEventListener(t,stopOnly)});
  el.addEventListener('change',function(e){if(CS&&e.target&&e.target.id==='gkc-done')CS.touchedDone=true});
 }
 el.innerHTML=sheetHtml(c,opt);el.hidden=false;
 try{document.documentElement.classList.add('gkc-open')}catch(e){}
 CS={c:c,el:el,ret:opt.ret||document.activeElement,retSel:opt.retSel||'',res:'',topic:'',touchedDone:false};
 focusFirst();
};
GK.callIsOpen=function(){return !!CS};
if(document.addEventListener){
 /* 「電話する」: record first, then the sheet; the tel: link itself is left to the browser */
 document.addEventListener('click',function(e){
  var a=e.target&&e.target.closest?e.target.closest('[data-call]'):null;
  if(!a||!a.getAttribute||a.getAttribute('data-call')!=='1')return;
  if(CS){e.preventDefault();return}
  if(typeof GK.can==='function'&&!GK.can('act.call')){e.preventDefault();GK.toast('「電話する」は使えない設定になっています');return}
  var g=function(k){return a.getAttribute('data-'+k)||''};
  var tel=g('tel')||GK.callResolve(g('ref')),dg=telDigits(tel);
  if(!dg){e.preventDefault();GK.toast('電話番号が見つかりません。台帳で番号を確かめてください');return}
  /* a masked number: give the link its number now, the browser follows it after this handler */
  if(g('ref')){try{a.setAttribute('href','tel:'+dg)}catch(x){}setTimeout(function(){try{a.setAttribute('href','tel:')}catch(x){}},1500)}
  var c=GK.callStart({tel:tel,name:g('name'),role:g('role'),unit:g('unit'),task:g('task')});
  var sq=function(v){return String(v).replace(/["\\]/g,'\\$&')};
  GK.callOpen(c,{ret:a,retSel:g('ref')?'[data-call][data-ref="'+sq(g('ref'))+'"]':'[data-call][data-tel="'+sq(tel)+'"]'});
 });
 /* the sheet is modal: focus that wanders outside (a re-render behind it) comes back */
 document.addEventListener('focusin',function(e){if(CS&&CS.el&&e.target&&!CS.el.contains(e.target))focusFirst()});
 /* back from the phone app: the sheet is still open, ready to record */
 document.addEventListener('visibilitychange',function(){
  if(!CS||document.visibilityState!=='visible')return;
  var l=q('gkc-lead');if(l&&!sheetDirty())l.textContent='電話が終わったら、結果を選んで「記録する」を押してください。';
  if(!CS.el.contains(document.activeElement))focusFirst();
 });
}
/* the tab was reloaded (or moved to another page) while the sheet was open: ask again */
function callResume(){
 var p=pendGet();if(!p||!p.lid)return;
 if(CS||(p.ms&&Date.now()-p.ms>12*36e5)){if(!CS)pendDrop();return}
 if(!byId(GK.db.log,p.lid)&&!(p.hid&&byId(GK.db.hist,p.hid))){pendDrop();return}
 GK.callOpen(p,{reopen:true});
}
if(window.addEventListener){
 if(document.readyState==='complete')setTimeout(callResume,0);
 else window.addEventListener('load',function(){setTimeout(callResume,0)});
}

/* ---------- 電話番号のハイフン (additive 2026-10-18) ----------
   GK.formatTel(s): full-width digits / hyphens -> half-width, spaces, dashes and ( ) removed, then the Japanese grouping:
     070/080/090/050/020 + 8 digits -> 3-4-4 · 0120 / 0570 / 0990 (10 digits) -> 4-3-3 · 0800 (11 digits) -> 4-3-4 ·
     03 / 06 -> 2-4-4 · 5-digit and 4-digit area codes from the tables below -> 5-1-4 / 4-2-4 · any other 10-digit 0… -> 3-3-4.
     Anything else (too short / too long, not starting with 0, letters) comes back as typed (only the width is normalised);
     a leading + (international) is never touched. Stored data is not rewritten: pages format on display and on save.
   GK.telCheck(s) -> '' (fine, or empty) or the warning text.
   Every <input type="tel"> (and any input with data-tel-input) is handled by the listeners below, on every page:
     while typing, the hyphens appear only once the number is complete (the caret is kept);
     a paste, Enter and leaving the field format at once; leaving the field also shows a warning (never blocks). */
var TEL_SEP=/[\s　\-‐-―−ーｰ─━()]/g;
function telSet(s){var o={};s.split(' ').forEach(function(x){if(x)o[x]=1});return o}
/* 4-digit area codes (with the leading 0). Only codes known to be 4 digits; an unknown code falls back to 3-3-4. */
var AREA4=telSet('0123 0134 0138 0144 0154 0155 0166 0242 0246 0258 0263 0276 0277 0284 0285 0297 '+
 '0422 0428 0436 0438 0439 0460 0463 0465 0466 0467 0470 0475 0476 0478 0479 0480 0493 0494 0495 '+
 '0532 0533 0536 0544 0545 0548 0550 0555 0556 0557 0558 0561 0562 0563 0564 0565 0566 0567 0568 0569 0572 0573 0574 0575 0576 0577 0578 0581 0584 0585 0586 0587 0594 0595 0596 0597 0598 0599 '+
 '0721 0725 0735 0736 0737 0738 0739 0740 0742 0743 0744 0745 0746 0747 0748 0749 0761 0763 0765 0766 0767 0768 0770 0771 0772 0773 0774 0790 0791 0794 0795 0796 0797 0798 0799 '+
 '0820 0823 0824 0826 0827 0829 0833 0834 0835 0836 0837 0838 0845 0846 0847 0848 0852 0853 0854 0855 0856 0857 0858 0859 0863 0865 0866 0867 0868 0869 0875 0877 0879 0880 0883 0884 0885 0887 0889 0892 0893 0894 0895 0896 0897 0898 '+
 '0920 0930 0940 0942 0943 0944 0946 0947 0948 0949 0950 0952 0954 0955 0956 0957 0959 0964 0965 0966 0967 0968 0969 0972 0973 0974 0977 0978 0979 0980 0982 0983 0984 0985 0986 0987 0993 0994 0995 0996 0997');
/* 5-digit area codes (伊豆諸島・小笠原) */
var AREA5=telSet('04992 04994 04996 04998');
function telGrp(d,a,b){return d.slice(0,a)+'-'+d.slice(a,a+b)+'-'+d.slice(a+b)}
/* digits only -> the formatted number, or '' when it is not a complete Japanese number */
function telFmt(d){
 if(!/^0\d{9,10}$/.test(d))return '';
 var p3=d.slice(0,3),p4=d.slice(0,4);
 if(d.length===11){if(p4==='0800')return telGrp(d,4,3);if(/^0[25789]0$/.test(p3))return telGrp(d,3,4);return ''}
 if(p4==='0120'||p4==='0570'||p4==='0990')return telGrp(d,4,3);
 if(/^0[25789]0/.test(d))return ''; /* mobile / IP / 0800: 11 digits */
 if(d.slice(0,2)==='03'||d.slice(0,2)==='06')return telGrp(d,2,4);
 if(AREA5[d.slice(0,5)])return telGrp(d,5,1);
 if(AREA4[p4])return telGrp(d,4,2);
 return telGrp(d,3,3);
}
function telNorm(s){var n=String(s==null?'':s);try{n=n.normalize('NFKC')}catch(e){}return n.trim()}
GK.formatTel=function(s){
 var n=telNorm(s);if(!n||n.charAt(0)==='+')return n;
 var d=n.replace(TEL_SEP,'');
 if(!/^\d+$/.test(d))return n;
 var f=telFmt(d);if(!f)return n.replace(/[‐-―−ーｰ─━]/g,'-');
 /* already split into 3 groups the usual way (080-0000-1002, 0422-12-3456): keep the typed grouping, only the separators
    become "-" — so a number that reads two ways (080-0… mobile / 0800 free dial) stays as the person wrote it */
 var g=n.split(TEL_SEP).filter(Boolean);
 if(g.length===3&&/^0\d{1,4}$/.test(g[0])&&/^\d{1,4}$/.test(g[1])&&/^\d{3,4}$/.test(g[2]))return g.join('-');
 return f;
};
GK.telCheck=function(s){
 var n=telNorm(s);if(!n||n.charAt(0)==='+')return '';
 var d=n.replace(TEL_SEP,'');
 if(/^\d+$/.test(d)&&telFmt(d))return '';
 var c=n.replace(/\D/g,'').length;
 return '電話番号の桁数を確かめてください'+(c?'（いま '+c+' けた）':'');
};
function telIs(t){
 if(typeof GK.can==='function'&&!GK.can('in.tel'))return false; /* 機能の設定: 電話番号のハイフン OFF */
 try{return !!t&&t.tagName==='INPUT'&&(String(t.type||'').toLowerCase()==='tel'||!!(t.hasAttribute&&t.hasAttribute('data-tel-input')))&&!t.readOnly&&!t.disabled}catch(e){return false}
}
var telBusy=false;
function fireInput(t){
 if(!t||!t.dispatchEvent)return;
 telBusy=true;
 try{var ev;try{ev=new Event('input',{bubbles:true})}catch(x){ev=document.createEvent('Event');ev.initEvent('input',true,false)}t.dispatchEvent(ev)}catch(e){}
 telBusy=false;
}
/* mode 'type': only a complete number; 'final': GK.formatTel as it is. Returns true when the value changed. */
function telApply(t,mode){
 var v=String(t.value||''),f;
 if(mode==='type'){var n=telNorm(v);if(n.charAt(0)==='+')return false;var d=n.replace(TEL_SEP,'');if(!/^\d+$/.test(d)||!telFmt(d))return false;f=GK.formatTel(v)}
 else f=GK.formatTel(v);
 if(f===v)return false;
 var pos=null;try{pos=t.selectionStart}catch(e){}
 var focused=document.activeElement===t,atEnd=pos==null||pos>=v.length;
 t.value=f;
 if(focused&&t.setSelectionRange){
  var np=f.length;
  if(!atEnd){var want=telNorm(v.slice(0,pos)).replace(/\D/g,'').length,seen=0;np=0;while(np<f.length&&seen<want){if(/\d/.test(f.charAt(np)))seen++;np++}}
  try{t.setSelectionRange(np,np)}catch(e){}
 }
 return true;
}
function telWarn(t){
 if(!t||!t.id||!t.insertAdjacentElement)return;
 var id=t.id+'-tw',old=document.getElementById(id),msg=GK.telCheck(t.value);
 if(old&&old.tagName!=='SPAN')old=null;
 if(!msg||t.getAttribute('aria-invalid')==='true'){if(old)telWarnOff(t,old);return}
 if(!old){old=document.createElement('span');old.id=id;old.className='err gk-telwarn';t.insertAdjacentElement('afterend',old)}
 old.textContent=msg;
 var db=(t.getAttribute('aria-describedby')||'').split(' ').filter(Boolean);if(db.indexOf(id)<0){db.push(id);t.setAttribute('aria-describedby',db.join(' '))}
}
function telWarnOff(t,el){
 el=el||(t&&t.id?document.getElementById(t.id+'-tw'):null);if(!el||el.tagName!=='SPAN')return;
 try{el.remove()}catch(e){}
 var db=(t.getAttribute('aria-describedby')||'').split(' ').filter(function(x){return x&&x!==el.id});
 if(db.length)t.setAttribute('aria-describedby',db.join(' '));else t.removeAttribute('aria-describedby');
}
/* leaving the field (blur / Enter): format, tell the page (an input event), then the warning */
function telFinal(t){if(telApply(t,'final'))fireInput(t);telWarn(t)}
GK.telFinal=telFinal;

/* ---------- 物件名から住所の候補 (additive 2026-10-18) ----------
   GK.addrSuggest(name) -> up to 5 candidates for a typed 物件名 (2 characters or more; full/half width, katakana/hiragana,
     spaces and 「・」 do not matter; registered properties first):
       {src:'db', id, n, addr, owner}                 a property already in GK.db.props (登録済み: choosing it never fills the address)
       {src:'dir', n, k, addr, zip, struct, year}     the building directory below
   GK.addrPostal(s) -> {zip:'000-0101', addr:'東京都〇〇区北町'} for a 7-digit 郵便番号 that the directory knows, else null.
   Page markup (no page code needed for the list itself):
     物件名  <input id=… data-addr-name="<住所 input id>" [data-addr-struct="<id>"] [data-addr-year="<id>"]
              role="combobox" aria-autocomplete="list" aria-expanded="false">
     住所    <input id=… data-addr-zip="1">    (7 digits typed here -> 「〒xxx-xxxx の住所を入れる」)
   Choosing fills the fields and sends them an input event, so the page stores them as if typed.
   Optional page hook for a 登録済み candidate: window.GKaddrUseRegistered(prop, go) -> button label ('' = none) / go=true: do it.

   DEMO DATA: the directory below is fictitious (names, towns and the 000-xxxx postal codes do not exist). It stands in for
   a real address / place search service, which the production app would call here instead (same result shape). */
var ADDR_AREA={
 kita:['000-0101','東京都〇〇区北町'],higashi:['000-0102','東京都〇〇区東町'],sakura:['000-0103','東京都〇〇区桜台'],
 hon:['000-0104','東京都〇〇区本町'],minami:['000-0105','東京都〇〇区南町'],midori:['000-0106','東京都〇〇区緑ヶ丘'],
 eki:['000-0107','東京都〇〇区駅前'],ohashi:['000-0108','東京都〇〇区大橋'],asahi:['000-0109','東京都〇〇区旭町'],
 wakaba:['000-0110','東京都〇〇区若葉'],nishi:['000-0111','東京都〇〇区西町'],chuo:['000-0112','東京都〇〇区中央'],
 minato:['000-0201','神奈川県〇〇市港町'],aoba:['000-0202','神奈川県〇〇市青葉台'],hama:['000-0203','神奈川県〇〇市浜町'],
 sakae:['000-0301','埼玉県〇〇市栄町'],matsu:['000-0401','千葉県〇〇市松が丘']
};
/* [name, reading, area, 番地, 構造, 築年] ('' = not known) */
var ADDR_DIR=[
 ['サンハイツ北','サンハイツキタ','kita','1-2-3','RC造 4階建て','2008'],
 ['ハイム北町','ハイムキタマチ','kita','2-5-9','木造 2階建て','2003'],
 ['パークサイド北町','パークサイドキタマチ','kita','3-7-4','鉄骨造 3階建て','2009'],
 ['グランメゾン東町','グランメゾンヒガシマチ','higashi','2-8-5','RC造 6階建て','2016'],
 ['サンハイツ東','サンハイツヒガシ','higashi','1-3-12','RC造 4階建て','2006'],
 ['アーバン東町','アーバンヒガシマチ','higashi','3-10-2','RC造 7階建て','2022'],
 ['パークサイド桜台','パークサイドサクラダイ','sakura','3-1-14','鉄骨造 4階建て','2011'],
 ['グランメゾン桜台','グランメゾンサクラダイ','sakura','2-9-1','RC造 5階建て','2018'],
 ['シャトー桜台','シャトーサクラダイ','sakura','4-4-4','RC造 3階建て','1997'],
 ['レジデンス本町','レジデンスホンマチ','hon','1-6-2','RC造 8階建て','2019'],
 ['メゾン本町','メゾンホンマチ','hon','4-3-8','軽量鉄骨 3階建て','2007'],
 ['エクセル本町','エクセルホンマチ','hon','2-12-6','RC造 5階建て','2015'],
 ['サンハイツ南','サンハイツミナミ','minami','4-1-6','RC造 3階建て','2001'],
 ['メゾン・ド・南町','メゾンドミナミマチ','minami','1-11-4','軽量鉄骨 2階建て','2017'],
 ['緑ヶ丘コーポ','ミドリガオカコーポ','midori','4-8-2','木造 2階建て','1998'],
 ['ガーデンコート緑ヶ丘','ガーデンコートミドリガオカ','midori','2-12-5','RC造 4階建て','2014'],
 ['駅前レジデンス','エキマエレジデンス','eki','2-5-11','RC造 5階建て','2012'],
 ['ロイヤルハイツ駅前','ロイヤルハイツエキマエ','eki','1-8-9','RC造 9階建て','2005'],
 ['コーポ大橋','コーポオオハシ','ohashi','2-4-7','木造 2階建て','1995'],
 ['ハイム大橋','ハイムオオハシ','ohashi','1-1-20','木造 2階建て','2015'],
 ['リバーサイド大橋','リバーサイドオオハシ','ohashi','3-9-2','RC造 5階建て','2012'],
 ['メゾン旭','メゾンアサヒ','asahi','1-10-3','軽量鉄骨 2階建て','2004'],
 ['レジデンス旭','レジデンスアサヒ','asahi','2-2-18','RC造 7階建て','2021'],
 ['ハイツ旭','ハイツアサヒ','asahi','3-6-1','軽量鉄骨 2階建て','2000'],
 ['ハイム若葉','ハイムワカバ','wakaba','3-3-9','木造 2階建て','2013'],
 ['コーポ若葉','コーポワカバ','wakaba','1-5-5','木造 2階建て','1992'],
 ['フォレスト若葉','フォレストワカバ','wakaba','2-7-11','木造 3階建て','2020'],
 ['ヴィラ西町','ヴィラニシマチ','nishi','2-6-3','RC造 3階建て','2010'],
 ['コーポ西町','コーポニシマチ','nishi','4-2-15','',''],
 ['プラザ中央','プラザチュウオウ','chuo','1-4-1','SRC造 10階建て','2003'],
 ['シティハイツ中央','シティハイツチュウオウ','chuo','3-2-7','RC造 6階建て',''],
 ['港町ハイツ','ミナトマチハイツ','minato','1-3-5','RC造 4階建て','2002'],
 ['ベイサイド港町','ベイサイドミナトマチ','minato','2-1-9','RC造 8階建て','2016'],
 ['青葉台レジデンス','アオバダイレジデンス','aoba','3-5-2','RC造 6階建て','2013'],
 ['コーポ青葉','コーポアオバ','aoba','1-9-7','木造 2階建て',''],
 ['メゾン浜町','メゾンハママチ','hama','2-4-10','軽量鉄骨 3階建て','2008'],
 ['サニーコート浜町','サニーコートハママチ','hama','4-7-1','RC造 4階建て','2019'],
 ['栄町ハイム','サカエマチハイム','sakae','1-2-8','木造 2階建て','2011'],
 ['グリーンヒル栄町','グリーンヒルサカエマチ','sakae','3-6-3','鉄骨造 3階建て','2006'],
 ['松が丘コーポ','マツガオカコーポ','matsu','2-3-6','',''],
 ['パレス松が丘','パレスマツガオカ','matsu','1-8-12','RC造 5階建て','2009']
];
function addrDir(){return ADDR_DIR.map(function(b){var a=ADDR_AREA[b[2]];return {src:'dir',n:b[0],k:b[1],addr:a[1]+b[3],zip:a[0],struct:b[4],year:b[5]}})}
GK._addrDir=addrDir; /* for tests */
/* matching key: width, case, katakana/hiragana, spaces and 「・」 do not matter; ヶ = が (緑ヶ丘 = 緑が丘) */
function fold1(c){var t=c;try{t=t.normalize('NFKC')}catch(e){}
 return t.toLowerCase().replace(/[\s　・·]/g,'').replace(/[ァ-ヶ]/g,function(x){return String.fromCharCode(x.charCodeAt(0)-0x60)}).replace(/ゖ/g,'が').replace(/ゕ/g,'か');
}
function fold(s){return fold1(String(s==null?'':s)).replace(/([一-鿿])け(?=[一-鿿])/g,'$1が')}
GK.addrFold=fold;
GK.addrSuggest=function(name){
 var q=fold(name);if(q.length<2)return [];
 var out=[];
 var sc=function(keys){var best=-1;keys.forEach(function(k){var i=k?k.indexOf(q):-1;if(i>=0)best=Math.max(best,i===0?2:1)});return best};
 var props=(GK.db&&Array.isArray(GK.db.props))?GK.db.props:[];
 props.forEach(function(p){var s=sc([fold(p.n)]);if(s>=0)out.push({src:'db',id:p.id,n:String(p.n||''),addr:String(p.addr||''),owner:p.owner||'',s:10+s})});
 addrDir().forEach(function(b){
  var s=sc([fold(b.n),fold(b.k)]);if(s<0)return;
  if(props.some(function(p){return fold(p.n)===fold(b.n)&&fold(p.addr)===fold(b.addr)}))return; /* the same building is already registered */
  b.s=s;out.push(b);
 });
 out.sort(function(a,b){return b.s-a.s});
 return out.slice(0,5).map(function(x){var y={};Object.keys(x).forEach(function(k){if(k!=='s')y[k]=x[k]});return y});
};
GK.addrPostal=function(s){
 var t=telNorm(s).replace(/^〒/,'').replace(/[\s\-‐-―−ー]/g,'');
 if(!/^\d{7}$/.test(t))return null;
 var z=t.slice(0,3)+'-'+t.slice(3),k=Object.keys(ADDR_AREA).filter(function(x){return ADDR_AREA[x][0]===z})[0];
 return k?{zip:z,addr:ADDR_AREA[k][1]}:null;
};
/* the match in the name, for <mark> (by the same folding, so ｻﾝﾊｲﾂ or さんはいつ still highlight サンハイツ) */
function addrHl(name,q){
 var e=GK.esc,f='',pos=[],qq=fold1(String(q||''));
 for(var i=0;i<name.length;i++){var c=fold1(name.charAt(i));for(var j=0;j<c.length;j++){f+=c.charAt(j);pos.push(i)}}
 var k=qq?f.indexOf(qq):-1;if(k<0)return e(name);
 var a=pos[k],b=pos[k+qq.length-1]+1;return e(name.slice(0,a))+'<mark>'+e(name.slice(a,b))+'</mark>'+e(name.slice(b));
}

var ADDR_CSS='.gkac-host{position:relative}'+
 '.gkac{position:absolute;left:0;right:0;z-index:40}'+
 '.gkac-list{list-style:none;margin:0;padding:4px;background:var(--surface,#fff);color:var(--fg,#1b2535);border:1px solid var(--line,#dfe4ec);border-radius:8px;box-shadow:0 8px 24px rgba(27,37,53,.16);max-height:min(330px,60vh);overflow-y:auto;overflow-x:hidden;text-align:left}'+
 '.gkac-opt{display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;padding:7px 10px;border-radius:6px;cursor:pointer;min-height:40px;line-height:1.45}'+
 '.gkac-opt:hover{background:var(--surface-2,#edf0f5)}'+
 '.gkac-opt.is-act{background:var(--primary-soft,#e9eefb);box-shadow:inset 0 0 0 2px var(--primary,#3359f2)}'+
 '.gkac-n{font-size:14px;font-weight:500;overflow-wrap:anywhere;min-width:0}'+
 '.gkac-a{flex-basis:100%;font-size:12px;color:var(--muted,#596579);overflow-wrap:anywhere;min-width:0}'+
 '.gkac-tag{font-size:11px;line-height:1.6;padding:0 7px;border-radius:999px;background:var(--surface-2,#edf0f5);color:var(--muted,#596579);white-space:nowrap}'+
 '.gkac-note{font-size:12px;color:var(--muted,#596579)}'+
 '.gkac-note .gkac-undo{font-size:12px;margin-left:6px}'+
 '.gkac-reg{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;padding:7px 10px;border-radius:8px;background:var(--surface-2,#edf0f5);color:var(--fg,#1b2535);font-size:12.5px}'+
 '.gkac-reg .act{font-size:12.5px}'+
 '@media (max-width:640px){.gkac-opt{min-height:44px;padding:9px 12px}.gkac-n{font-size:15px}.gkac-a{font-size:12.5px}}';
function addrCss(){
 try{
  if(!document.head||!document.createElement)return;
  var have=document.getElementById&&document.getElementById('gk-addr-style');
  if(have&&have.tagName==='STYLE')return;
  var s=document.createElement('style');s.id='gk-addr-style';s.textContent=ADDR_CSS;document.head.appendChild(s);
 }catch(e){}
}
addrCss();

var AC=null,acTimer=null,acBusy=false,acUndo={};
function acKind(t){if(typeof GK.can==='function'&&!GK.can('in.addr'))return '';try{if(!t||t.tagName!=='INPUT'||!t.getAttribute)return '';if(t.getAttribute('data-addr-name'))return 'name';if(t.getAttribute('data-addr-zip'))return 'zip'}catch(e){}return ''}
function acRef(t,attr){var id=t.getAttribute(attr);return id?document.getElementById(id):null}
function acItems(t,kind){
 if(kind==='zip'){var z=GK.addrPostal(t.value);return z?[{src:'zip',zip:z.zip,addr:z.addr,n:''}]:[]}
 var addr=acRef(t,'data-addr-name'),v=String(t.value||'').trim();
 /* just chosen (name and address already equal the candidate): nothing to show */
 return GK.addrSuggest(v).filter(function(x){return !(x.src==='dir'&&x.n===v&&addr&&String(addr.value||'').trim()===x.addr)});
}
function acClose(){
 clearTimeout(acTimer);if(!AC)return;var a=AC;AC=null;
 try{a.box.remove()}catch(e){}
 try{a.inp.setAttribute('aria-expanded','false');a.inp.removeAttribute('aria-activedescendant')}catch(e){}
}
function acOpen(t){
 var kind=acKind(t);if(!kind)return;
 if(AC&&(AC.inp!==t||!document.body.contains(AC.box)))acClose();
 if(document.activeElement!==t){acClose();return}
 var items=acItems(t,kind);if(!items.length){acClose();return}
 var lid=(t.id||'gkac')+'-lb',e=GK.esc;
 if(!AC){
  var host=t.parentNode;try{if(host&&host.classList)host.classList.add('gkac-host')}catch(x){}
  var box=document.createElement('div');box.className='gkac';box.id=lid+'-w';
  t.insertAdjacentElement('afterend',box);
  if(box.addEventListener)box.addEventListener('mousedown',function(ev){ev.preventDefault()}); /* a click keeps the focus in the field */
  AC={inp:t,box:box,items:[],act:-1,kind:kind};
 }
 AC.items=items;AC.act=-1;AC.kind=kind;
 try{AC.box.style.top=(t.offsetTop+t.offsetHeight+2)+'px'}catch(x){}
 AC.box.innerHTML='<ul class="gkac-list" id="'+lid+'" role="listbox" aria-label="'+(kind==='zip'?'郵便番号の住所':'住所の候補')+'">'+items.map(function(x,i){
  var top=x.src==='zip'?'〒'+e(x.zip)+' の住所を入れる':addrHl(x.n,t.value);
  return '<li class="gkac-opt" id="'+lid+'-'+i+'" role="option" aria-selected="false" data-gkac-opt="'+i+'"><span class="gkac-n">'+top+'</span>'+(x.src==='db'?'<span class="gkac-tag">登録済み</span>':'')+'<span class="gkac-a">'+e(x.addr||'所在地 未登録')+'</span></li>';
 }).join('')+'</ul><span class="gkc-sr" role="status">'+(kind==='zip'?'郵便番号の住所があります。':'住所の候補が '+items.length+' 件あります。')+'↓で選べます</span>';
 t.setAttribute('aria-controls',lid);t.setAttribute('aria-expanded','true');t.removeAttribute('aria-activedescendant');
}
function acMove(d){
 if(!AC||!AC.items.length)return;var n=AC.items.length;
 AC.act=AC.act<0?(d>0?0:n-1):(AC.act+d+n)%n;
 var lid=AC.inp.id+'-lb';
 for(var i=0;i<n;i++){var o=document.getElementById(lid+'-'+i);if(!o)continue;var on=i===AC.act;o.setAttribute('aria-selected',String(on));if(o.classList)o.classList[on?'add':'remove']('is-act');if(on&&o.scrollIntoView)try{o.scrollIntoView({block:'nearest'})}catch(x){}}
 AC.inp.setAttribute('aria-activedescendant',lid+'-'+AC.act);
}
/* write the values, tell the page, then the note with 「元に戻す」 under noteFor */
function acFill(ch,noteFor,msg){
 var prev=ch.map(function(c){return [c[0].id,c[0].value]}),nid=noteFor.id;
 acBusy=true;
 try{ch.forEach(function(c){c[0].value=c[1];fireInput(c[0])})}finally{acBusy=false}
 var nf=document.getElementById(nid)||noteFor; /* the page may have drawn the field again */
 var old=document.getElementById(nid+'-an');if(old)try{old.remove()}catch(x){}
 if(nf&&nf.insertAdjacentElement){
  var n=document.createElement('span');n.className='hint gkac-note';n.id=nid+'-an';n.setAttribute('role','status');
  n.innerHTML=GK.esc(msg)+'<button type="button" class="link gkac-undo" data-gkac-undo="'+GK.esc(nid)+'">元に戻す</button>';
  var after=document.getElementById(nid+'-tw')||nf;after.insertAdjacentElement('afterend',n);
  acUndo[nid]=prev;
 }
 if(nf&&nf.focus){try{nf.focus();var L=String(nf.value||'').length;if(nf.setSelectionRange)nf.setSelectionRange(L,L)}catch(x){}}
}
function acRegNote(t,x){
 var id=t.id+'-reg',old=document.getElementById(id);if(old)try{old.remove()}catch(e){}
 var e=GK.esc,lab='';
 if(typeof window.GKaddrUseRegistered==='function'){try{lab=window.GKaddrUseRegistered(x,false)||''}catch(err){lab=''}}
 var n=document.createElement('div');n.className='gkac-reg';n.id=id;n.setAttribute('role','status');
 n.innerHTML='<span>この物件は登録済みです（'+e(x.n)+(x.addr?'・'+e(x.addr):'')+'）</span><a class="act" href="properties.html#prop-'+e(x.id)+'">→ 物件・台帳で開く</a>'+(lab?'<button type="button" class="act" data-gkac-use="'+e(x.id)+'">'+e(lab)+'</button>':'');
 t.insertAdjacentElement('afterend',n);
}
function acChoose(i){
 if(!AC)return;var x=AC.items[i],t=AC.inp;acClose();if(!x)return;
 if(x.src==='db'){acRegNote(t,x);return}
 if(x.src==='zip'){acFill([[t,x.addr]],t,'郵便番号から入れました。続けて番地・号を入れてください');return}
 var addr=acRef(t,'data-addr-name'),st=acRef(t,'data-addr-struct'),yr=acRef(t,'data-addr-year'),ch=[];
 if(String(t.value||'').trim()!==x.n)ch.push([t,x.n]);
 if(addr)ch.push([addr,x.addr]);
 if(st&&!String(st.value||'').trim()&&x.struct)ch.push([st,x.struct]);
 if(yr&&!String(yr.value||'').trim()&&x.year)ch.push([yr,x.year]);
 var reg=document.getElementById(t.id+'-reg');if(reg)try{reg.remove()}catch(e){}
 acFill(ch,addr||t,'物件名の候補から入れました。番地・号まで確かめてください');
}
function acUndoRun(nid){
 var prev=acUndo[nid];if(!prev)return;delete acUndo[nid];
 acBusy=true;try{prev.forEach(function(p){var el=document.getElementById(p[0]);if(el){el.value=p[1];fireInput(el)}})}finally{acBusy=false}
 var n=document.getElementById(nid+'-an');if(n)try{n.remove()}catch(e){}
 var f=document.getElementById(nid);if(f&&f.focus)try{f.focus()}catch(e){}
 GK.toast('入れる前の内容に戻しました');
}
GK.addrUi={open:acOpen,close:acClose,move:acMove,choose:acChoose,undo:acUndoRun,state:function(){return AC}}; /* for tests */

if(document.addEventListener){
 document.addEventListener('input',function(e){
  var t=e&&e.target;if(!t)return;
  if(telIs(t)&&!telBusy){
   telWarnOff(t);
   if(!e.isComposing){var it=String(e.inputType||'');if(/^insertFrom(Paste|Drop)/.test(it))telApply(t,'final');else if(/^insert/.test(it))telApply(t,'type')}
  }
  var k=acKind(t);
  if(k&&!acBusy){
   if(k==='name'){var reg=document.getElementById(t.id+'-reg');if(reg)try{reg.remove()}catch(x){}}
   clearTimeout(acTimer);
   if(e.isComposing){acClose();return}
   acTimer=setTimeout(function(){acOpen(t)},200);
  }
 });
 document.addEventListener('compositionend',function(e){
  var t=e&&e.target;if(!t)return;
  if(telIs(t)&&telApply(t,'type'))fireInput(t);
  if(acKind(t)){clearTimeout(acTimer);acTimer=setTimeout(function(){acOpen(t)},200)}
 });
 document.addEventListener('focusout',function(e){
  var t=e&&e.target;if(!t)return;
  if(telIs(t))telFinal(t);
  if(AC&&AC.inp===t)setTimeout(function(){if(AC&&AC.inp===t&&document.activeElement!==t)acClose()},150);
 });
 document.addEventListener('keydown',function(e){
  var t=e&&e.target;if(!t)return;
  var comp=e.isComposing||e.keyCode===229;
  if(AC&&AC.inp===t&&!comp){
   if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();acMove(e.key==='ArrowDown'?1:-1);return}
   if(e.key==='Enter'&&AC.act>=0){e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();acChoose(AC.act);return}
   if(e.key==='Escape'){e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();acClose();return}
   if(e.key==='Enter'||e.key==='Tab')acClose();
  }else if(!AC&&!comp&&e.key==='ArrowDown'&&acKind(t)){acOpen(t);if(AC){e.preventDefault();acMove(1)}return}
  /* Enter on a phone field (the page may go to the next step): format first */
  if(e.key==='Enter'&&!comp&&telIs(t))telFinal(t);
 });
 document.addEventListener('click',function(e){
  var g=null;try{g=e&&e.target&&e.target.closest?e.target.closest('[data-gkac-opt],[data-gkac-undo],[data-gkac-use]'):null}catch(x){g=null}
  if(!g||!g.getAttribute)return;
  var ga=function(k){var v=g.getAttribute(k);return v==null?null:String(v)};
  if(ga('data-gkac-opt')!=null){acChoose(+ga('data-gkac-opt'));return}
  if(ga('data-gkac-undo')!=null){acUndoRun(ga('data-gkac-undo'));return}
  var pid=ga('data-gkac-use'),p=pid&&GK.prop(pid);
  if(p&&typeof window.GKaddrUseRegistered==='function'){var box=g.closest&&g.closest('.gkac-reg');try{window.GKaddrUseRegistered({src:'db',id:p.id,n:p.n,addr:p.addr||'',owner:p.owner||''},true)}catch(err){if(window.console)console.error(err)}if(box&&box.remove)try{box.remove()}catch(x){}}
 });
}

/* ---------- 月の選び方 + 台帳から月ごとの数字 (added 2026-10-19 「ほかの月も見れるようにしてほしい」) ----------
   GK.monthRange(a,b)       'YYYY-MM' months a..b, oldest first ([] when a > b or not a month)
   GK.monthText(m)          '2026年10月'
   GK.firstManagedMonth()   the earliest month a property was managed: property since (a property without since: the earliest
                            lease start of its rooms); never later than this month. Read from GK.db each time (it may be replaced
                            by another tab's save).
   GK.occAt(m)              month-end figures from the ledger: rooms = rooms of every property managed at the month end;
                            occupied = rooms with a lease (有効 / 終了) running on the last day (a 退去 notice on or before that day
                            = vacant, like 管理部売上). {m, rooms, occupied, rate (%, 1 decimal, 0 when no rooms), added:[{name,rooms}], removed:[…]}
   GK.monthPicker(opts)     fills a page's month picker (static markup, see GK.monthPicker.html):
                            opts {id, months:['YYYY-MM'…] (only these can be picked), value, label:function(m) (option text), hint}
                            「‹ 前の月」「次の月 ›」「今月」 set the select and fire its change event, so a page keeps one handler
                            (change on #id). Options are grouped by year, newest first. Nothing is remembered.
   GK.monthPicker.html(opts) the same picker as markup, already filled (for blocks drawn with innerHTML). */
function isYm(m){return /^\d{4}-\d{2}$/.test(String(m==null?'':m))}
function addYm(m,n){var y=+m.slice(0,4),mo=+m.slice(5,7)-1+n;y+=Math.floor(mo/12);mo=((mo%12)+12)%12;return y+'-'+pad(mo+1)}
function lastOf(m){return GK.iso(new Date(+m.slice(0,4),+m.slice(5,7),0))}
GK.monthRange=function(a,b){var out=[];if(!isYm(a)||!isYm(b)||a>b)return out;for(var m=a,k=0;m<=b&&k<2400;k++){out.push(m);m=addYm(m,1)}return out};
GK.monthText=function(m){return isYm(m)?(+m.slice(0,4))+'年'+(+m.slice(5,7))+'月':String(m==null?'':m)};
GK.firstManagedMonth=function(){
 var c=GK.TODAY.slice(0,7),best=c,db=GK.db||{},props=Array.isArray(db.props)?db.props:[],leases=Array.isArray(db.leases)?db.leases:[];
 props.forEach(function(p){
  if(!p||typeof p!=='object')return;var s=p.since?String(p.since):'';
  if(!s)leases.forEach(function(l){var u=l&&GK.unit(l.unit);if(u&&u.prop===p.id&&l.start&&(!s||l.start<s))s=String(l.start)});
  s=s.slice(0,7);if(isYm(s)&&s<best)best=s;
 });
 return best;
};
function leaseOn(unitId,day){
 return (GK.db.leases||[]).some(function(l){
  if(!l||l.unit!==unitId||!(l.status==='有効'||l.status==='終了'))return false;
  if(l.start&&l.start>day)return false;if(l.end&&l.end<day)return false;
  if(l.status==='有効'&&l.notice&&l.notice.date&&l.notice.date<=day)return false;
  return true;
 });
}
GK.occAt=function(m){
 var r={m:m,rooms:0,occupied:0,rate:0,added:[],removed:[]};if(!isYm(m))return r;
 var a=m+'-01',z=lastOf(m),on={},units=Array.isArray(GK.db.units)?GK.db.units:[];
 var cnt=function(pid){return units.filter(function(u){return u&&u.prop===pid}).length};
 (GK.db.props||[]).forEach(function(p){if(!p)return;
  if((!p.since||p.since<=z)&&!(p.ended&&p.ended<=z))on[p.id]=1;
  if(p.since&&p.since>=a&&p.since<=z)r.added.push({name:p.n||p.id,rooms:cnt(p.id)});
  if(p.ended&&p.ended>=a&&p.ended<=z)r.removed.push({name:p.n||p.id,rooms:cnt(p.id)});
 });
 units.forEach(function(u){if(!u||!on[u.prop])return;r.rooms++;if(leaseOn(u.id,z))r.occupied++});
 r.rate=r.rooms?Math.round(r.occupied/r.rooms*1000)/10:0;
 return r;
};
function mpNorm(o){
 o=o||{};var ms=(o.months||[]).filter(isYm).slice().sort(),u=[];ms.forEach(function(m){if(u[u.length-1]!==m)u.push(m)});
 var c=GK.TODAY.slice(0,7),v=u.indexOf(o.value)>=0?o.value:(u.indexOf(c)>=0?c:u[u.length-1]||'');
 var lab=typeof o.label==='function'?o.label:function(m){return GK.monthText(m)+(m===c?'（今月）':'')};
 var i=u.indexOf(v);
 return {id:String(o.id||''),months:u,value:v,label:lab,hint:String(o.hint||''),cur:c,prev:i>0?u[i-1]:'',next:i>=0&&i<u.length-1?u[i+1]:'',now:u.indexOf(c)>=0&&v!==c?c:''};
}
function mpOptions(P){
 var e=GK.esc,by={},ys=[];
 P.months.slice().reverse().forEach(function(m){var y=m.slice(0,4);if(!by[y]){by[y]=[];ys.push(y)}by[y].push(m)});
 var opt=function(m){return '<option value="'+e(m)+'"'+(m===P.value?' selected':'')+'>'+e(P.label(m))+'</option>'};
 if(ys.length<2)return P.months.slice().reverse().map(opt).join('');
 return ys.map(function(y){return '<optgroup label="'+e((+y)+'年')+'">'+by[y].map(opt).join('')+'</optgroup>'}).join('');
}
function mpBtn(P,kind){
 var to=P[kind],t={prev:'前の月',next:'次の月',now:'今月'}[kind];
 return {to:to,label:to?t+'（'+GK.monthText(to)+'）を表示':(kind==='now'?'今月を表示しています':kind==='prev'?'これより前の月はありません':'これより後の月はありません')};
}
GK.monthPicker=function(o){
 var P=mpNorm(o);if(!P.id)return null;
 var sel=document.getElementById(P.id);if(!sel)return null;
 sel.innerHTML=mpOptions(P);try{if(P.value)sel.value=P.value}catch(x){}
 [['prev','Prev'],['next','Next'],['now','Now']].forEach(function(k){
  var b=document.getElementById(P.id+k[1]);if(!b)return;var s=mpBtn(P,k[0]);
  b.disabled=!s.to;b.setAttribute('data-mp-to',s.to);b.setAttribute('aria-label',s.label);b.setAttribute('title',s.label);
 });
 var h=document.getElementById(P.id+'Hint');if(h){h.textContent=P.hint;h.hidden=!P.hint}
 return P;
};
GK.monthPicker.html=function(o){
 var P=mpNorm(o),e=GK.esc,id=e(P.id);
 var b=function(kind,suf,inner){var s=mpBtn(P,kind);return '<button type="button" class="gk-mp-step'+(kind==='now'?' gk-mp-now':'')+'" id="'+id+suf+'" data-mp="'+kind+'" data-mp-for="'+id+'" data-mp-to="'+e(s.to)+'" aria-label="'+e(s.label)+'" title="'+e(s.label)+'"'+(s.to?'':' disabled')+'>'+inner+'</button>'};
 return '<div class="gk-mpw'+(o&&o.cls?' '+e(o.cls):'')+'"><div class="gk-mp" role="group" aria-label="'+e(o&&o.group||'表示する月')+'">'+
  b('prev','Prev','‹<span class="gk-mp-t"> 前の月</span>')+'<label class="sr" for="'+id+'">'+e(o&&o.group||'表示する月')+'</label><select id="'+id+'">'+mpOptions(P)+'</select>'+
  b('next','Next','<span class="gk-mp-t">次の月 </span>›')+b('now','Now','今月')+'</div>'+
  (P.hint?'<p class="gk-mp-hint" id="'+id+'Hint">'+e(P.hint)+'</p>':'')+'</div>';
};
if(document.addEventListener)document.addEventListener('click',function(ev){
 var b=null;try{b=ev&&ev.target&&ev.target.closest?ev.target.closest('[data-mp]'):null}catch(x){b=null}
 if(!b||b.disabled||!b.getAttribute)return;
 var id=b.getAttribute('data-mp-for'),to=b.getAttribute('data-mp-to'),kind=b.getAttribute('data-mp'),sel=id?document.getElementById(id):null;
 if(!sel||!isYm(to)||sel.value===to)return;
 var has=false;try{has=[].some.call(sel.querySelectorAll('option'),function(x){return x.value===to})}catch(x){has=true}
 if(!has)return; /* only months the picker offers */
 sel.value=to;
 var ce;try{ce=new Event('change',{bubbles:true})}catch(x){ce=document.createEvent('Event');ce.initEvent('change',true,false)}
 sel.dispatchEvent(ce);
 var nb=document.getElementById(id+({prev:'Prev',next:'Next',now:'Now'}[kind]||''));
 if(nb&&!nb.disabled&&nb.focus)nb.focus();else{var s2=document.getElementById(id);if(s2&&s2.focus)s2.focus()}
});

/* ---------- 滞納の段階 (added 2026-10-19, user decision) ----------
   Unpaid rent = a charge (GK.db.charges) whose due is before today and paid < amount (a 入出金 confirmation raises paid).
   Each contract with unpaid rent is followed in steps (the days can be changed in 入出金 → 設定):
     1 家賃の連絡（1回目）       due: the oldest unpaid charge's due + d1 days (default 1 = the day after the payment day)
     2 家賃の連絡（2回目）       due: step 1 done (or its due) + d2 days (default 7)
     3 保証会社へ立て替えを請求   only with a 保証会社; due: step 2 done (or its due) + d3 days (default 7), never after that
                                company's deadline (per company: 「支払日の月の翌月N日まで」 or 「滞納が始まってからN日以内」)
     without a 保証会社 (user decision 2026-10-19, follow-up), after step 2, in the order and days set in 入出金 → 設定
     (default 4 → 5 → 6, 7 days each): 4 連帯保証人へ連絡 · 5 オーナーへ報告 · 6 督促状を送る（書面）; each due: the step before done
     (or its due) + its days. 4〜6 can be skipped for one contract (飛ばす, logged); 4 without a registered 連帯保証人 says so.
     after the last step: 保証会社の入金待ち / 「ここから先は担当者が判断します」 (no row in 今日確認すること)
   The tenant's 連帯保証人 (optional): tenant.gName / tenant.gTel (entered in 入居者 → 連絡先を直す; shown masked).
   GK.db.dunning {v:1, set:{d1,d2,d3, gua:{<name>:{rule:'next'|'days', n, tel, who}}},
                  cases:[{id, lease, start, steps:[{n, at, by, note}], notes:[{at, by, t}], closed:{at, by, why, auto, ids, log, hid}}]}
     An older db has no key: the demo gets 3 sample cases in memory (saved with the first change, like the 引継ぎ samples);
     local data mode starts empty. A case record is written only when a person marks a step 済み or leaves a メモ.
   GK.dun.list()                -> every contract with unpaid rent (one state per contract, see stateOf)
   GK.dun.state(leaseId)        -> that contract's state, or null
   GK.dun.done(leaseId,{step,note}) / GK.dun.note(leaseId,text) -> {ok, undo, label} | {ok:false, msg}
   GK.dun.sweep()               ganki-money.js calls it after a confirmation changed a charge's paid (and after its undo): a case whose
                                rent is all paid is closed with a log line; a case it closed is opened again when that payment is undone
   GK.dun.settings() / saveSettings(o) / ruleText(g)
   GK.dun.timelineHtml(leaseId) the 「滞納の経過」 block of the contract and tenant panels (its buttons: data-dun-act, handled below) */
(function(){
var D=GK.dun={},seq=0;
D.STEP=['','家賃の連絡（1回目）','家賃の連絡（2回目）','保証会社へ立て替えを請求','連帯保証人へ連絡','オーナーへ報告','督促状を送る（書面）'];
D.SHORT=['入金待ち','1回目の連絡','2回目の連絡','保証会社へ請求','連帯保証人へ連絡','オーナーへ報告','督促状'];
D.DEF={d1:1,d2:7,d3:7,d4:7,d5:7,d6:7,order:[4,5,6]};
D.MANUAL='ここから先は担当者が判断します';
D.SKIP=[4,5,6]; /* the steps that can be skipped for one contract */
function okOrder(o){return Array.isArray(o)&&o.length===3&&[4,5,6].every(function(n){return o.map(Number).indexOf(n)>=0})}
var DEMO_GUA={'ガンキ保証':{rule:'next',n:10,tel:'03-0000-7001',who:'立替請求の窓口'},'東日本保証':{rule:'days',n:30,tel:'03-0000-7002',who:''},'全国家賃保証':{rule:'next',n:15,tel:'03-0000-7003',who:''}};
function nfs(v){var s=String(v==null?'':v);try{s=s.normalize('NFKC')}catch(e){}return s.trim()}
function clean(v){return String(v==null?'':v).replace(/[\s　]+/g,' ').trim().slice(0,200)} /* a note as typed (no width change) */
function int(v,lo,hi,d){var s=nfs(v);if(!/^\d+$/.test(s))return d;var n=+s;return n>=lo&&n<=hi?n:d}
function cut(list,id){if(!Array.isArray(list))return null;for(var i=0;i<list.length;i++)if(list[i]&&list[i].id===id)return list[i];return null}
function hm(){return new Date().toTimeString().slice(0,5)}
function sample(){
 var cases=[],add=function(unit,start,steps){var l=GK.activeLease(unit);if(l)cases.push({id:'dcS-'+l.id,lease:l.id,start:start,steps:steps,notes:[],sample:true})};
 add('GK-0123-104','2026-08-01',[{n:1,at:'2026-08-02',by:'佐藤',note:'留守番電話にメッセージを残した'},{n:2,at:'2026-08-10',by:'佐藤',note:'つながらないので、お知らせを郵便受けに入れた'},{n:3,at:'2026-08-24',by:'佐藤',note:'ガンキ保証へ立て替えを請求した'}]);
 add('GK-0311-201','2026-10-01',[{n:1,at:'2026-10-02',by:'佐藤',note:'10/15までに払うとのこと'},{n:2,at:'2026-10-09',by:'佐藤',note:'一部（¥30,000）を10/15に振り込むと回答'}]);
 add('GK-0457-203','2026-09-01',[{n:1,at:'2026-10-02',by:'鈴木',note:'口座振替ができていなかったとのこと。10/8までに振り込むと回答'},{n:2,at:'2026-10-09',by:'鈴木',note:'約束の日を過ぎても入金なし。留守番電話にメッセージを残した'}]);
 return {v:1,set:{d1:1,d2:7,d3:7,d4:7,d5:7,d6:7,order:[4,5,6],gua:JSON.parse(JSON.stringify(DEMO_GUA))},cases:cases};
}
D.data=function(){
 var d=GK.db.dunning;
 if(!d||typeof d!=='object'||Array.isArray(d))d=GK.db.dunning=GK.LOCAL||d!==undefined?{v:1,set:null,cases:[]}:sample();
 if(!Array.isArray(d.cases))d.cases=[];
 return d;
};
/* the 保証会社 of the contracts, then any others in the settings */
D.guaNames=function(){
 var out=[],s=D.data().set,g=s&&s.gua&&typeof s.gua==='object'?Object.keys(s.gua):[];
 (GK.db.leases||[]).forEach(function(l){var n=l&&String(l.gua||'').trim();if(n&&n!=='なし'&&!/^取消/.test(String(l.status||''))&&out.indexOf(n)<0)out.push(n)});
 g.forEach(function(n){if(n&&out.indexOf(n)<0)out.push(n)});
 return out.sort();
};
D.guaDefault={rule:'next',n:10,tel:'',who:''};
D.settings=function(){
 var s=D.data().set||{},g=s.gua&&typeof s.gua==='object'?s.gua:{};
 var out={d1:int(s.d1,0,60,D.DEF.d1),d2:int(s.d2,1,60,D.DEF.d2),d3:int(s.d3,1,60,D.DEF.d3),d4:int(s.d4,1,60,D.DEF.d4),d5:int(s.d5,1,60,D.DEF.d5),d6:int(s.d6,1,60,D.DEF.d6),order:okOrder(s.order)?s.order.map(Number):D.DEF.order.slice(),gua:{}};
 D.guaNames().forEach(function(n){var x=g[n]&&typeof g[n]==='object'?g[n]:{},days=x.rule==='days';
  out.gua[n]={rule:days?'days':'next',n:int(x.n,1,days?120:28,days?30:10),tel:String(x.tel||''),who:String(x.who||''),set:!!g[n]}});
 return out;
};
D.ruleText=function(g){g=g||D.guaDefault;return g.rule==='days'?'滞納が始まってから'+g.n+'日以内':'支払日の月の翌月'+g.n+'日まで'};
/* o: {d1,d2,d3, gua:{name:{rule,n,tel,who}}} as typed. Returns {ok, undo} or {ok:false, msg, field} */
D.saveSettings=function(o){
 o=o||{};var bad=function(msg,field){return {ok:false,msg:msg,field:field}};
 var d1=int(o.d1,0,60,-1),d2=int(o.d2,1,60,-1),d3=int(o.d3,1,60,-1);
 if(d1<0)return bad('1回目の連絡は、支払日から0〜60日の数字で入れてください。','d1');
 if(d2<0)return bad('2回目の連絡は、1回目から1〜60日の数字で入れてください。','d2');
 if(d3<0)return bad('保証会社への請求は、2回目から1〜60日の数字で入れてください。','d3');
 var order=okOrder(o.order)?o.order.map(Number):D.DEF.order.slice(),dd={};
 for(var k=0;k<order.length;k++){var sn=order[k],v=int(o['d'+sn]==null?D.DEF['d'+sn]:o['d'+sn],1,60,-1);if(v<0)return bad('「'+D.STEP[sn]+'」は、前の段階から1〜60日の数字で入れてください。','d'+sn);dd['d'+sn]=v}
 var gua={},names=Object.keys(o.gua||{});
 for(var i=0;i<names.length;i++){var nm=names[i],x=o.gua[nm]||{},days=x.rule==='days',n=int(x.n,1,days?120:28,-1);
  if(n<0)return bad(nm+'の請求期限は、'+(days?'1〜120日':'翌月の1〜28日')+'の数字で入れてください。','gua:'+nm);
  var tel=nfs(x.tel);if(tel&&typeof GK.formatTel==='function')tel=GK.formatTel(tel);
  gua[nm]={rule:days?'days':'next',n:n,tel:tel,who:clean(x.who).slice(0,40)};
 }
 var d=D.data(),prev=d.set?JSON.parse(JSON.stringify(d.set)):null;
 d.set={d1:d1,d2:d2,d3:d3,d4:dd.d4,d5:dd.d5,d6:dd.d6,order:order,gua:gua};
 GK.log('滞納の段階の設定を変えました（1回目 支払日の'+d1+'日後・2回目 その'+d2+'日後・保証会社への請求 その'+d3+'日後・保証会社なし：'+order.map(function(n){return D.SHORT[n]+' '+dd['d'+n]+'日後'}).join('→')+'）');
 var lg=GK.db.log[0];GK.save();
 return {ok:true,undo:function(){var d2x=D.data();d2x.set=prev;unlog(lg,'');GK.save()}};
};
function unlog(lg,hid){
 var d=GK.db;
 if(lg&&Array.isArray(d.log))for(var i=0;i<d.log.length;i++){var x=d.log[i];if(x&&x.at===lg.at&&x.t===lg.t&&x.who===lg.who){d.log.splice(i,1);break}}
 if(hid&&Array.isArray(d.hist))d.hist=d.hist.filter(function(h){return !(h&&h.id===hid)});
}
function logged(t,unit){GK.log(t,unit);var lg=GK.db.log[0],h=unit?GK.db.hist[0]:null;return {lg:lg?{at:lg.at,t:lg.t,who:lg.who}:null,hid:h&&h.t===t?h.id:''}}
function deadline(g,base){
 if(!g||!base)return '';if(g.rule==='days')return GK.addDays(base,g.n);
 var d=GK.parse(base);if(!d)return '';var y=d.getFullYear(),m=d.getMonth()+1,last=new Date(y,m+1,0).getDate();
 return GK.iso(new Date(y,m,Math.min(g.n,last)));
}
D.deadline=deadline;
function isUnpaid(c){return c&&c.due&&c.due<GK.TODAY&&(+c.paid||0)<(+c.amount||0)}
function byDue(a,b){return a.due<b.due?-1:a.due>b.due?1:a.month<b.month?-1:a.month>b.month?1:0}
function unpaid(lid,map){if(map)return (map[lid]||[]).slice().sort(byDue);return (GK.db.charges||[]).filter(function(c){return isUnpaid(c)&&c.lease===lid}).sort(byDue)}
function unpaidMap(){var m={};(GK.db.charges||[]).forEach(function(c){if(isUnpaid(c))(m[c.lease]=m[c.lease]||[]).push(c)});return m}
function openCase(lid){var cs=D.data().cases.filter(function(c){return c&&c.lease===lid&&!c.closed});return cs[cs.length-1]||null}
function monJ(m){m=String(m||'');return (m.slice(0,4)!==GK.TODAY.slice(0,4)?(+m.slice(0,4))+'年':'')+(+m.slice(5,7))+'月分'}
/* the state of one contract: null when nothing is unpaid */
function stateOf(l,S,map){
 if(!l||/^取消/.test(String(l.status||'')))return null;
 var ch=unpaid(l.id,map);if(!ch.length)return null;
 S=S||D.settings();
 var rec=openCase(l.id),t=GK.tenant(l.tenant),base=ch[0].due;
 var gua=String(l.gua||'').trim();if(gua==='なし')gua='';
 /* the steps of this contract, in order: with a 保証会社 1 → 2 → 3; without: 1 → 2 → the order in the settings (4・5・6) */
 var seq=gua?[1,2,3]:[1,2].concat(S.order);
 var steps=(rec&&Array.isArray(rec.steps)?rec.steps:[]).filter(function(x){return x&&seq.indexOf(x.n)>=0}).slice().sort(function(a,b){return seq.indexOf(a.n)-seq.indexOf(b.n)});
 var recOf=function(n){return steps.filter(function(x){return x.n===n})[0]||null},at=function(n){var s=recOf(n);return s?s.at:''};
 var step=0;for(var i=0;i<seq.length;i++)if(!recOf(seq[i])){step=seq[i];break}
 var g=gua?(S.gua[gua]||D.guaDefault):null,dl=gua?deadline(g,base):'';
 var dues=['','','','','','',''];
 seq.forEach(function(n,i){var from=i?(at(seq[i-1])||dues[seq[i-1]]):base,d=GK.addDays(from,S['d'+n]);if(n===3&&dl&&d>dl)d=dl;dues[n]=d});
 var amount=ch.reduce(function(s,c){return s+((+c.amount||0)-(+c.paid||0))},0),ms=[];ch.forEach(function(c){var j=monJ(c.month);if(ms.indexOf(j)<0)ms.push(j)});
 var months=ms.join('・'),left=dl?GK.days(GK.TODAY,dl):null,warn=dl&&step>0&&!at(3)?(left<0?'over':left<=3?'soon':''):'';
 var jg=t&&String(t.gName||'').trim()?{n:String(t.gName).trim(),tel:String(t.gTel||'').trim()}:null;
 var u=GK.unit(l.unit),pr=u&&GK.prop(u.prop),ow=pr&&GK.owner(pr.owner);
 var nm=t?t.n+' 様':'（入居者 未登録）',what=months+' '+GK.yen(amount);
 var text=!step?'':step===3?D.STEP[3]+'（期限 '+GK.sd(dl)+'）：'+nm+' '+what+'（'+gua+'）'
  :step===4?D.STEP[4]+(jg?'（'+jg.n+' 様）':'（登録なし）')+'：'+nm+' '+what
  :step===5?D.STEP[5]+(ow?'（'+ow.n+' 様）':'')+'：'+nm+' '+what
  :D.STEP[step]+'：'+nm+' '+what;
 var last=steps[steps.length-1];
 return {lease:l.id,unit:l.unit,tenant:t?t.id:'',name:t?t.n:'',tel:t?String(t.tel||''):'',charges:ch,amount:amount,months:months,base:base,
  rec:rec,steps:steps,seq:seq,step:step,total:seq.length,dues:dues,due:step?dues[step]:'',deadline:dl,gua:gua,guaSet:g,warn:warn,left:left,text:text,
  jg:jg,owner:ow?{id:ow.id,n:ow.n,tel:String(ow.tel||'')}:null,canSkip:D.SKIP.indexOf(step)>=0,
  who:last?String(last.by||''):'',label:step?D.STEP[step]:(gua?'保証会社の入金待ち':D.MANUAL),late:GK.days(base,GK.TODAY)};
}
D.state=function(lid){var l=GK.lease(lid);return l?stateOf(l):null};
D.list=function(){var S=D.settings(),m=unpaidMap();return (GK.db.leases||[]).filter(function(l){return l&&m[l.id]}).map(function(l){return stateOf(l,S,m)}).filter(Boolean).sort(function(a,b){return a.base<b.base?-1:a.base>b.base?1:a.lease<b.lease?-1:1})};
/* the warning shown with a row: '' / 'あと2日' / '期限を過ぎています' */
D.warnText=function(s){if(!s||!s.warn)return '';return s.warn==='over'?'保証会社の請求期限（'+GK.sd(s.deadline)+'）を過ぎています':'保証会社の請求期限まであと'+s.left+'日（'+GK.sd(s.deadline)+'）'};
function ensureCase(s){var d=D.data(),rec=openCase(s.lease),made=false;if(!rec){rec={id:'dc'+Date.now().toString(36)+'-'+(++seq),lease:s.lease,start:s.base,steps:[],notes:[]};d.cases.push(rec);made=true}if(!Array.isArray(rec.steps))rec.steps=[];if(!Array.isArray(rec.notes))rec.notes=[];return {rec:rec,made:made}}
function dropIfEmpty(rid,made){var d=D.data(),r=cut(d.cases,rid);if(r&&made&&!r.steps.length&&!(r.notes||[]).length&&!r.closed)d.cases=d.cases.filter(function(x){return x!==r})}
D.done=function(lid,o){
 o=o||{};var s=D.state(lid);
 if(!s)return {ok:false,msg:'この契約の未収はありません（入金済みか、ほかの画面で変わりました）。'};
 if(!s.step)return {ok:false,msg:'すべての段階が済んでいます（入金待ち）。'};
 if(o.step&&+o.step!==s.step)return {ok:false,msg:'ほかの画面で段階が進んでいます。画面を確かめてください。'};
 if(o.skip&&!s.canSkip)return {ok:false,msg:'この段階は飛ばせません。'};
 var c=ensureCase(s),st={n:s.step,at:GK.TODAY,by:GK.ME,note:clean(o.note)};
 if(o.skip){st.skip=true;if(!st.note&&s.step===4&&!s.jg)st.note='連帯保証人の登録なし'}
 c.rec.steps.push(st);
 var label=D.STEP[s.step],L=logged(o.skip?'「'+label+'」を飛ばしました：'+s.months+' '+GK.yen(s.amount)+(st.note?'（'+st.note+'）':''):label+'を済みにしました：'+s.months+' '+GK.yen(s.amount)+(st.note?'（'+st.note+'）':''),s.unit),rid=c.rec.id;
 GK.save();
 return {ok:true,label:label,step:s.step,skip:!!o.skip,undo:function(){
  var r=cut(D.data().cases,rid);if(r)r.steps=r.steps.filter(function(x){return !(x.n===st.n&&x.at===st.at&&x.by===st.by&&x.note===st.note)});
  dropIfEmpty(rid,c.made);unlog(L.lg,L.hid);GK.save();
 }};
};
D.skip=function(lid,o){o=o||{};return D.done(lid,{step:o.step,note:o.note,skip:true})};
/* the extra line a step shows (the 連帯保証人 not registered, 内容証明 is sent outside the app) */
D.hint=function(s){if(!s)return '';if(s.step===4&&!s.jg)return '連帯保証人の登録なし（入居者の「連絡先を直す」で登録できます。いなければ、この段階を飛ばしてください）';if(s.step===4&&s.jg&&!s.jg.tel)return '連帯保証人の電話番号が登録されていません';if(s.step===6)return '内容証明で送るときは、郵便局の窓口か e内容証明（日本郵便のサービス）で手続きします（このアプリからは送りません）';return ''};
/* 「AIで下書き」 for a step: the reminder (1・2), the owner report (5), the formal letter (6) */
D.aiPurpose=function(n){return n===1||n===2?'督促':n===5?'オーナー報告':n===6?'督促状':''};
D.note=function(lid,text){
 text=clean(text);if(!text)return {ok:false,msg:'メモを書いてください（例：10/20に振り込むと回答）。'};
 var s=D.state(lid);if(!s)return {ok:false,msg:'この契約の未収はありません（入金済みか、ほかの画面で変わりました）。'};
 var c=ensureCase(s),n={at:GK.TODAY+' '+hm(),by:GK.ME,t:text};c.rec.notes.push(n);
 var L=logged('滞納のメモ：'+text,s.unit),rid=c.rec.id;GK.save();
 return {ok:true,undo:function(){var r=cut(D.data().cases,rid);if(r)r.notes=(r.notes||[]).filter(function(x){return x!==n&&!(x.at===n.at&&x.t===n.t&&x.by===n.by)});dropIfEmpty(rid,c.made);unlog(L.lg,L.hid);GK.save()}};
};
/* after 入出金 changed charges (no save here: the caller saves) */
D.sweep=function(){
 var d=D.data(),n=0; /* (an older db gets the demo cases here too, so they close like any other) */
 d.cases.forEach(function(c){
  if(!c||!c.lease)return;var l=GK.lease(c.lease);if(!l)return;
  var un=unpaid(c.lease);
  if(!c.closed&&!un.length){
   var t=GK.tenant(l.tenant),ids=(GK.db.charges||[]).filter(function(x){return x&&x.lease===c.lease&&x.due>=String(c.start||'')&&x.due<GK.TODAY}).map(function(x){return x.id});
   var L=logged('入金を確認したので、滞納の段階を終えました'+(t?'（'+t.n+' 様）':''),l.unit);
   c.closed={at:GK.TODAY,by:GK.ME,why:'入金を確認',auto:true,ids:ids,log:L.lg,hid:L.hid};n++;
  }else if(c.closed&&c.closed.auto&&un.some(function(x){return (c.closed.ids||[]).indexOf(x.id)>=0})&&!openCase(c.lease)){
   unlog(c.closed.log,c.closed.hid);delete c.closed;n++;
  }
 });
 return n;
};
/* the call sheet (電話する from a 滞納 row): {label} of the step a call can mark 済み */
D.taskInfo=function(lid){var s=D.state(lid);return s&&s.step?{label:D.STEP[s.step],step:s.step}:null};
/* ---- 「滞納の経過」 (contract / tenant panels) ---- */
function sdw(s){return s?GK.esc(GK.sdw(s)):''}
D.timelineHtml=function(lid,opt){
 opt=opt||{};if(!GK.can('money.dunning'))return '';
 var e=GK.esc,l=GK.lease(lid);if(!l)return '';
 var s=stateOf(l),past=D.data().cases.filter(function(c){return c&&c.lease===lid&&c.closed}).slice(-3).reverse();
 if(!s&&!past.length)return '';
 var h='<section class="gk-dun" aria-labelledby="dunT-'+e(lid)+'"><h3 id="dunT-'+e(lid)+'">滞納の経過'+(opt.room?'（'+e(GK.roomLabel(l.unit))+'）':'')+'</h3>';
 if(s){
  h+='<p class="gk-dun-sum"><span class="pill danger">未収 '+e(s.months)+' '+e(GK.yen(s.amount))+'</span> <span class="pill '+(s.step?'warn':'info')+'">今：'+e(s.step?D.SHORT[s.step]:s.label)+'</span>'+(s.gua?' <span class="cap">保証会社：'+e(s.gua)+'（請求期限 '+e(GK.sd(s.deadline))+'・'+e(D.ruleText(s.guaSet))+'）</span>':' <span class="cap">保証会社なし</span>')+'</p>';
  if(s.warn)h+='<p class="gk-dun-warn" role="note">'+e(D.warnText(s))+'</p>';
  h+='<ol class="gk-dun-tl">';
  s.seq.forEach(function(n){
   var st=s.steps.filter(function(x){return x.n===n})[0],cur=n===s.step,ov=cur&&s.due<GK.TODAY;
   var who=n===3?s.gua:n===4&&s.jg?s.jg.n+' 様':n===5&&s.owner?s.owner.n+' 様':'';
   h+='<li class="'+(st?'is-done':cur?'is-now':'')+'"><span class="gk-dun-dot" aria-hidden="true"></span><div><div class="gk-dun-t">'+e(D.STEP[n])+(who?'<span class="cap">（'+e(who)+'）</span>':'')+
    (st?' <span class="pill '+(st.skip?'':'ok')+'">'+(st.skip?'飛ばした':'済み')+'</span>':cur?' <span class="pill '+(ov?'danger':'warn')+'">'+(ov?GK.overdueDays(s.due)+'日超過':'今の段階')+'</span>':'')+'</div>'+
    '<div class="gk-dun-s">'+(st?e(GK.sd(st.at))+' · '+e(st.by||'')+(st.note?' · '+e(st.note):''):'予定 '+sdw(s.dues[n])+(n===3&&s.deadline?' · 期限 '+e(GK.sd(s.deadline)):''))+'</div>'+
    (cur&&D.hint(s)?'<div class="gk-dun-s gk-dun-hint">'+e(D.hint(s))+'</div>':'')+'</div></li>';
  });
  if(!s.gua)h+='<li class="'+(s.step?'':'is-now')+'"><span class="gk-dun-dot" aria-hidden="true"></span><div><div class="gk-dun-t">'+e(D.MANUAL)+'</div><div class="gk-dun-s">ここまでの段階が終わったら、自動の段階はありません（入出金で入金を確認すると、この経過は自動で終わります）</div></div></li></ol>';
  else h+='<li class="'+(s.step?'':'is-now')+'"><span class="gk-dun-dot" aria-hidden="true"></span><div><div class="gk-dun-t">入金の確認</div><div class="gk-dun-s">'+(s.step?'入出金で確認すると、この経過は自動で終わります':e(s.label)+'（入出金で確認すると自動で終わります）')+'</div></div></li></ol>';
  var notes=s.rec&&s.rec.notes||[];
  if(notes.length)h+='<ul class="rows gk-dun-notes">'+notes.slice().reverse().map(function(x){return '<li><span class="main-t">'+e(x.t)+'<div class="sub">'+e(String(x.at||'').slice(0,16))+' · '+e(x.by||'')+'</div></span></li>'}).join('')+'</ul>';
  if(GK.can('act.dunning')){
   h+='<div class="gk-dun-form"><label for="dunNote-'+e(lid)+'">メモ（任意）</label><input type="text" id="dunNote-'+e(lid)+'" maxlength="200" autocomplete="off" placeholder="例：10/20に振り込むと回答">'+
    '<p class="err" id="dunErr-'+e(lid)+'" role="alert"></p><div class="panel-actions">'+
    (s.step?'<button type="button" class="btn primary" data-dun-act="done" data-lease="'+e(lid)+'" data-step="'+s.step+'">'+e(D.STEP[s.step])+'を済みにする</button>':'')+
    (s.canSkip?'<button type="button" class="btn" data-dun-act="skip" data-lease="'+e(lid)+'" data-step="'+s.step+'">この段階を飛ばす</button>':'')+
    '<button type="button" class="btn" data-dun-act="note" data-lease="'+e(lid)+'">メモだけ残す</button></div></div>';
  }
  var ap=D.aiPurpose(s.step);
  if(ap&&GK.ai&&GK.can('ai.write'))h+='<div class="ai-row">'+GK.ai.draftBtn({host:'dunAi-'+lid,unit:l.unit,lease:lid,purpose:ap,stage:s.step<3?s.step:0,title:D.STEP[s.step]+'の文面'})+'</div><div id="dunAi-'+e(lid)+'"></div>';
 }
 if(past.length)h+='<p class="cap gk-dun-past">これまでの滞納：'+past.map(function(c){return e(GK.sd(c.start))+' から · '+e(GK.sd(c.closed.at))+' に'+e(c.closed.why||'終了')+'（'+(c.steps||[]).length+'段階 済み）'}).join(' / ')+'</p>';
 return h+'</section>';
};
function refresh(){if(typeof window.GKrefresh==='function'){try{window.GKrefresh({type:'gk-dun'})}catch(e){if(window.console)console.error(e)}}}
if(document.addEventListener)document.addEventListener('click',function(ev){
 var b=null;try{b=ev&&ev.target&&ev.target.closest?ev.target.closest('[data-dun-act]'):null}catch(x){b=null}
 if(!b||!b.getAttribute)return;
 var a=b.getAttribute('data-dun-act'),lid=b.getAttribute('data-lease')||'',er=document.getElementById('dunErr-'+lid),inp=document.getElementById('dunNote-'+lid);
 if(!GK.can('act.dunning')){GK.toast('「滞納の段階を進める」は使えない設定になっています');return}
 var text=inp?inp.value:'',r=a==='done'||a==='skip'?D.done(lid,{step:b.getAttribute('data-step'),note:text,skip:a==='skip'}):D.note(lid,text);
 if(!r.ok){if(er)er.textContent=r.msg;if(inp&&a==='note'){inp.setAttribute('aria-invalid','true');inp.focus()}return}
 refresh();
 GK.toast(a==='skip'?'「'+r.label+'」を飛ばしました':a==='done'?'「'+r.label+'」を済みにしました':'メモを残しました',function(){r.undo();refresh();GK.toast('元に戻しました')});
 var nb=document.querySelector('[data-dun-act="done"][data-lease="'+lid+'"]')||document.querySelector('[data-dun-act="note"][data-lease="'+lid+'"]');if(nb&&nb.focus)nb.focus();
});
})();

/* ---------- 社内検証用のデータ: the banner on every page + 「検証データの問題」 (local data mode only) ----------
   A thin bar fixed at the top: 「社内検証用のデータです（このPCの中だけで使います）」 and a button that opens the list
   (GK.localProblems(): what was not read / was corrected when the file was read, and the live checks). Ids only. */
if(GK.LOCAL)(function(){
 var BAR=30;
 var CSS='html.gk-local body{padding-top:'+BAR+'px}'+
  '.gk-localbar{position:fixed;top:0;left:0;right:0;z-index:39;min-height:'+BAR+'px;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:2px 12px;padding:3px 12px;background:#5b3a00;color:#fff;font-size:12.5px;line-height:1.4;text-align:center}'+
  '.gk-localbar button{min-height:24px;font:inherit;font-size:12px;padding:1px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.75);background:transparent;color:#fff;cursor:pointer}'+
  '.gk-localbar button:focus-visible{outline:2px solid #fff;outline-offset:2px}'+
  'html.gk-local .side{top:'+BAR+'px;height:calc(100vh - '+BAR+'px)}html.gk-local .app{min-height:calc(100vh - '+BAR+'px)}'+
  '@media (max-width:900px){html.gk-local .topbar{top:'+BAR+'px}}'+
  '.gk-lp-wrap{position:fixed;inset:0;z-index:70;background:rgba(10,14,20,.35);display:flex;align-items:flex-start;justify-content:center;padding:48px 16px 16px;overflow:auto}'+
  '.gk-lp-wrap[hidden]{display:none}'+
  '.gk-lp{background:#fff;color:#1b2535;border-radius:10px;max-width:780px;width:100%;padding:18px 20px;display:flex;flex-direction:column;gap:10px;box-shadow:0 8px 24px rgba(27,37,53,.2)}'+
  '.gk-lp h2{font-size:17px;margin:0}.gk-lp p{margin:0;font-size:13px;line-height:1.7}'+
  '.gk-lp-tw{overflow-x:auto}.gk-lp table{width:100%;border-collapse:collapse;font-size:12.5px}'+
  '.gk-lp th,.gk-lp td{border-bottom:1px solid #dfe4ec;padding:6px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}'+
  '.gk-lp th{color:#596579;font-weight:500;background:#edf0f5}.gk-lp td.gk-lp-k{white-space:nowrap}'+
  '.gk-lp-x{align-self:flex-end;min-height:44px;padding:6px 18px;border-radius:8px;border:1px solid #cbd3df;background:#fff;color:#1b2535;cursor:pointer;font:inherit}';
 var KIND={drop:'読み込まず',warn:'直して読み込み',check:'確認が必要'};
 var e=GK.esc,ret=null;
 function q(id){return document.getElementById(id)}
 function label(n){return n?'検証データの問題 '+n+'件':'検証データの問題はありません'}
 function count(){var b=q('gkLocalBtn');if(!b)return;var n=0;try{n=GK.localProblems().length}catch(x){}b.textContent=label(n)}
 function body(){
  var L=[];try{L=GK.localProblems()}catch(x){L=[]}
  var d=GK.db||{},c=function(k){return Array.isArray(d[k])?d[k].length:0};
  var by={drop:0,warn:0,check:0};L.forEach(function(x){by[x.kind]=(by[x.kind]||0)+1});
  var own=okDate(LOC.today)?'ファイルで決めた日付':'このPCの日付';
  var h='<h2 id="gkLpT">検証データの問題</h2>'+
   '<p>このPCの中だけで使う、社内検証用のデータです。ここで変えても本番のデータは変わりません。</p>'+
   '<p>今日の日付：'+e(GK.jp(GK.TODAY))+'（'+own+'）　読み込んだ数：物件 '+c('props')+'・部屋 '+c('units')+'・オーナー '+c('owners')+'・入居者 '+c('tenants')+'・契約 '+c('leases')+'・請求 '+c('charges')+'・やること '+c('tasks')+'・対応履歴 '+c('hist')+'・職員 '+c('staff')+'</p>'+
   '<p>読み込まず '+by.drop+'件・直して読み込み '+by.warn+'件・確認が必要 '+by.check+'件。表には、データの種類と id だけを出します（名前・電話番号・住所は出しません）。</p>';
  if(!L.length)h+='<p><b>問題は見つかりませんでした。</b></p>';
  else{
   var MAX=500,rows=L.slice(0,MAX);
   h+='<div class="gk-lp-tw"><table><thead><tr><th scope="col">区分</th><th scope="col">データ</th><th scope="col">id</th><th scope="col">内容</th></tr></thead><tbody>'+
    rows.map(function(x){return '<tr><td class="gk-lp-k">'+e(KIND[x.kind]||x.kind)+'</td><td class="gk-lp-k">'+e(GK.LOCAL_COLS[x.col]||x.col)+'</td><td>'+e(x.id)+'</td><td>'+e(x.msg)+'</td></tr>'}).join('')+
    '</tbody></table></div>'+(L.length>MAX?'<p>ほか '+(L.length-MAX)+'件あります（先頭の '+MAX+'件を表示）。</p>':'');
  }
  return h+'<button type="button" class="gk-lp-x" id="gkLpClose">閉じる</button>';
 }
 function open(){
  var w=q('gkLp');if(!w)return;
  ret=document.activeElement;
  w.innerHTML='<div class="gk-lp" role="dialog" aria-modal="true" aria-labelledby="gkLpT">'+body()+'</div>';
  w.hidden=false;count();
  var x=q('gkLpClose');if(x&&x.focus)x.focus();
 }
 function close(){
  var w=q('gkLp');if(!w||w.hidden)return false;
  w.hidden=true;w.innerHTML='';
  var b=ret&&document.body.contains(ret)?ret:q('gkLocalBtn');ret=null;if(b&&b.focus)b.focus();
  return true;
 }
 function install(){
  if(!document.body||q('gkLocalBar'))return;
  try{var st=document.createElement('style');st.id='gk-local-style';st.textContent=CSS;(document.head||document.body).appendChild(st)}catch(x){}
  try{document.documentElement.classList.add('gk-local')}catch(x){}
  var bar=document.createElement('div');bar.id='gkLocalBar';bar.className='gk-localbar';bar.setAttribute('role','note');bar.setAttribute('aria-label','社内検証用のデータ');
  bar.innerHTML='<span>社内検証用のデータです（このPCの中だけで使います）</span><button type="button" id="gkLocalBtn" aria-haspopup="dialog" aria-controls="gkLp"></button>';
  document.body.insertAdjacentElement('afterbegin',bar);
  var w=document.createElement('div');w.id='gkLp';w.className='gk-lp-wrap';w.hidden=true;document.body.appendChild(w);
  q('gkLocalBtn').addEventListener('click',function(ev){ev.stopPropagation();open()});
  w.addEventListener('click',function(ev){ev.stopPropagation();var t=ev.target;if(t===w||(t&&t.id==='gkLpClose'))close()});
  w.addEventListener('keydown',function(ev){ev.stopPropagation();if(ev.key==='Escape'){if(ev.preventDefault)ev.preventDefault();close();return}
   if(ev.key==='Tab'){var x=q('gkLpClose');if(x&&x.focus){if(ev.preventDefault)ev.preventDefault();x.focus()}}});
  count();
 }
 GK.localUi={open:open,close:close,count:count,isOpen:function(){var w=q('gkLp');return !!w&&!w.hidden}};
 if(document.body)install();else if(document.addEventListener)document.addEventListener('DOMContentLoaded',install);
})();

/* ---------- AIの提案 (added 2026-10-19, user decision) ----------
   AI only SUGGESTS (候補・下書き); a person checks and decides. Never used for money calculations, tax, 送金・総合振込・締め,
   permissions or 本人確認. Nothing is applied without a click (and what is applied can be undone); with the feature OFF
   (機能の設定 「AI」) nothing is drawn and every screen works by hand as before.
   The prototype cannot call a real AI (no network): every suggestion is made by fixed rules here (deterministic) and every
   panel says so (GK.ai.DEMO), with what a real AI would be sent (GK.ai.SEND, the minimum: no names or phone numbers).
     GK.ai.record(o)            対応の記録: {ctx:'log'|'call', kind, res, topic, memo} -> {ok, text} | {ok:false, msg}
     GK.ai.draft(o)             入居者への文面: {unit, lease, purpose, tone, free} -> {ok, text, facts[], gaps[]} | {ok:false, msg}
     GK.ai.columns(heads, rows, fields)  名簿の列合わせ -> [{i, head, key, score, conf, why, samples[]}]
     GK.ai.kana / companyKana / sim      fuzzy helpers (ganki-money.js 「AIに候補を聞く」 uses them too)
     GK.ai.box / mountWrite / mountDraft the shared panel 「AIの提案」 (labels, Esc, focus, 44px on a phone) */
(function(){
var A=GK.ai={},esc=GK.esc,seq=0;
A.DEMO='デモ版のため、提案は見本の仕組みで作っています（本番ではAIが作ります）。';
A.SEND={
 match:'AIに送る内容：摘要・金額・日付だけ（入居者の名前や電話は送りません。部屋との照らし合わせはこのPCの中で行います）',
 write:'AIに送る内容：メモの文と、選んだ種類・結果・用件だけ（名前・電話・部屋番号は送りません）',
 draft:'AIに送る内容：文面の種類・言い方と、日付・金額だけ（お名前は送らず、戻ってからこのPCで入れます。電話・住所は送りません）',
 columns:'AIに送る内容：1行目の見出しだけ（名前・電話などの中身は送りません）'
};
A.CONF={high:'高',mid:'中',low:'低'};
A.head=function(kind,sub,id){return '<p class="gk-ai-tag"'+(id?' id="'+esc(id)+'"':'')+'><span class="gk-ai-badge">AIの提案</span>'+(sub?' '+esc(sub):'')+'</p><p class="gk-ai-demo">'+esc(A.DEMO)+'</p>'+(A.SEND[kind]?'<p class="gk-ai-send">'+esc(A.SEND[kind])+'</p>':'')};
A.confPill=function(c){var t=A.CONF[c]||c||'';return t?'<span class="gk-ai-conf c-'+esc(c)+'">確からしさ：'+esc(t)+'</span>':''};
function can(k){return typeof GK.can!=='function'||GK.can(k)}

/* ---- fuzzy helpers ---- */
function nf(s){s=String(s==null?'':s);try{s=s.normalize('NFKC')}catch(e){}return s}
var SMALL={'ァ':'ア','ィ':'イ','ゥ':'ウ','ェ':'エ','ォ':'オ','ャ':'ヤ','ュ':'ユ','ョ':'ヨ','ッ':'ツ','ヮ':'ワ','ヵ':'カ','ヶ':'ケ'};
/* comparison key: width, hiragana/katakana, small kana, spaces, ー, 振込, company markers (カ）(カ ㈱ 株式会社 …) do not matter */
A.kana=function(s){
 s=nf(s).replace(/[ぁ-ゖ]/g,function(c){return String.fromCharCode(c.charCodeAt(0)+0x60)}).trim();
 s=s.replace(/^(振込|フリコミ)[\s*＊]*/,'').replace(/株式会社|有限会社|合同会社|\((株|有|同)\)/g,'');
 s=s.replace(/[ァィゥェォャュョッヮヵヶ]/g,function(c){return SMALL[c]});
 s=s.replace(/^(カ|ユ|ド|シヤ|ザイ|ガク|イ)\)/,'').replace(/\((カ|ユ|ド)\)?$/,'').replace(/\((カ|ユ|ド)\)/g,'');
 s=s.replace(/[\s　・･.,，、。\-‐ー－()（）「」]/g,'');
 return s.toUpperCase();
};
/* readings of the words company names are made of (kanji -> kana), for 摘要 written in kana */
var CO=[['株式会社',''],['有限会社',''],['合同会社',''],['不動産','フドウサン'],['建設','ケンセツ'],['商事','シヨウジ'],['設備','セツビ'],['電気','デンキ'],['工業','コウギヨウ'],['産業','サンギヨウ'],
 ['興産','コウサン'],['物産','ブツサン'],['工務店','コウムテン'],['保証','ホシヨウ'],['家賃','ヤチン'],['管理','カンリ'],['水道','スイドウ'],['内装','ナイソウ'],['防災','ボウサイ'],['昇降機','シヨウコウキ'],
 ['技研','ギケン'],['商会','シヨウカイ'],['開発','カイハツ'],['住宅','ジユウタク'],['全国','ゼンコク'],['東日本','ヒガシニホン'],['西日本','ニシニホン'],['中央','チユウオウ'],['日本','ニホン'],['東','ヒガシ'],['桜台','サクラダイ'],['森','モリ']];
A.companyKana=function(s){
 s=nf(s).replace(/\((株|有|同)\)/g,'');
 CO.forEach(function(w){s=s.split(w[0]).join(w[1])});
 if(/[一-龥々]/.test(s))return '';
 return A.kana(s);
};
function lev(a,b){
 if(a===b)return 0;var m=a.length,n=b.length;if(!m)return n;if(!n)return m;
 var p=[],c=[],i,j;for(j=0;j<=n;j++)p[j]=j;
 for(i=1;i<=m;i++){c=[i];for(j=1;j<=n;j++)c[j]=Math.min(p[j]+1,c[j-1]+1,p[j-1]+(a.charAt(i-1)===b.charAt(j-1)?0:1));p=c}
 return p[n];
}
/* 0..1: 1 = the same; one contained in the other (3 letters or more) counts as 0.85 */
A.sim=function(a,b){
 a=String(a||'');b=String(b||'');if(!a||!b)return 0;if(a===b)return 1;
 var s=1-lev(a,b)/Math.max(a.length,b.length);
 if(Math.min(a.length,b.length)>=3&&(a.indexOf(b)>=0||b.indexOf(a)>=0))s=Math.max(s,0.85);
 return Math.max(0,s);
};
A.lev=lev;

/* ---- 対応の記録: short memo -> a clear record sentence (rules; the real AI would write it) ---- */
var ABBR=[[/ＴＥＬ|TEL|Tel|tel/g,'電話'],[/折返し/g,'折り返し'],[/(\d{1,2}\/\d{1,2})\s*(AM|ＡＭ|am)/g,'$1午前'],[/(\d{1,2}\/\d{1,2})\s*(PM|ＰＭ|pm)/g,'$1午後'],[/\bAM\b/gi,'午前'],[/\bPM\b/gi,'午後'],
 [/見積(?!り|書)/g,'見積り'],[/(\d{1,2}\/\d{1,2})\s+(午前|午後|\d{1,2}(時|:\d{2}))/g,'$1$2'],[/→|⇒|->/g,' '],[/済(?!み)/g,'済み'],[/[?？]/g,'（要確認）'],[/ｍｔｇ|mtg/gi,'打ち合わせ']];
function phrase(f){
 var m;
 if(/(です|ます|でした|ました|ません)$/.test(f))return f;
 if((m=/^(.+?)[：:]\s*(.+)$/.exec(f))){var v=m[2];if(/(済み|OK|ok|了承|予定|待ち|なし|あり)$/.test(v))return phrase(m[1]+v);return m[1]+'は'+v+'です'}
 if((m=/^(.*?)(OK|Ok|ok|了承|了解|承諾)$/.exec(f)))return m[1]?m[1].replace(/[はのも]$/,'')+'の了承を得ました':'了承を得ました';
 if((m=/^(.+?)(NG|不可)$/.exec(f)))return m[1]+'は難しいとのことです';
 if((m=/^(.+?)済み$/.exec(f)))return m[1]+'は済んでいます';
 if((m=/^(.+?)の?予定$/.exec(f)))return m[1]+'の予定です';
 if((m=/^(.+?)待ち$/.exec(f)))return m[1]+'を待っています';
 if((m=/^要(.+)$/.exec(f)))return m[1]+'が必要です';
 if((m=/^(.+?)(要|必要)$/.exec(f)))return m[1]+'が必要です';
 if((m=/^(.+?)(なし|無し)$/.exec(f)))return m[1]+'はありません';
 if((m=/^(.+?)(あり|有り)$/.exec(f)))return m[1]+'があります';
 if((m=/^(.+?)の(連絡|相談|苦情|問い合わせ|依頼|申し出)$/.exec(f)))return m[1]+'について'+m[2]+'がありました';
 if(/中$/.test(f))return f+'です';
 if((m=/^(.+?)した$/.exec(f)))return m[1]+'しました';
 if((m=/^(.+?)する$/.exec(f)))return m[1]+'します';
 if((m=/^(.+?)(で)?調整$/.exec(f)))return m[1]+(m[2]?'で':'を')+'調整しました';
 if((m=/^(.+)の(確認|手配|説明|案内|報告|交換|修理|訪問)$/.exec(f)))return m[1]+'の'+m[2]+'をしました';
 if(/(連絡|確認|手配|訪問|依頼|説明|案内|交換|修理|報告|送付|返送|発送)$/.test(f))return f+'しました';
 if(/^\d{1,2}\/\d{1,2}(午前|午後|\d{1,2}時)?$/.test(f))return '日時は'+f+'です';
 return f+'とのことです';
}
var KIND_LEAD={'電話（受信）':'入居者様から電話がありました','電話（発信）':'入居者様に電話しました','来店':'入居者様が来店されました','メール':'入居者様からメールがありました','訪問':'現地を訪問しました'};
A.record=function(o){
 o=o||{};var memo=nf(o.memo).replace(/[ \t　]+/g,' ').trim();
 if(!memo)return {ok:false,msg:'先に内容をひとこと書いてください（例：網戸 10/20午前 業者OK）。'};
 var s=memo;ABBR.forEach(function(r){s=s.replace(r[0],r[1])});
 var frags=s.split(/[。．\n]+|[、，,]\s*|\s+/).map(function(x){return x.trim()}).filter(function(x){return x&&!/^[^：:]+[：:]$/.test(x)});
 if(!frags.length)return {ok:false,msg:'内容が読み取れませんでした。ひとこと書いてください。'};
 /* 留守電: what was left on the answering machine, as written */
 if(o.ctx==='call'&&o.res==='留守電に残した'){
  var msg=frags.join('、');
  return {ok:true,text:(o.topic?o.topic+'の件で':'')+'電話しましたが不在のため、留守番電話にメッセージを残しました。メッセージの内容は「'+msg+'」です。'+(/折り返し/.test(msg)?'':'折り返しの連絡を待ちます。')};
 }
 var topic='',used=false,out=[];
 /* a short plain noun first (水漏れ / 網戸) is what the record is about; with a date right after it, that is its 日程 */
 if(frags.length>1&&frags[0].length<=10&&!/\d|[：:]/.test(frags[0])&&phrase(frags[0])===frags[0]+'とのことです')topic=frags.shift();
 if(topic&&/^\d{1,2}\/\d{1,2}(午前|午後|\d{1,2}時)?$/.test(frags[0]||'')){out.push(topic+'の日程は'+frags.shift()+'です');used=true}
 frags.forEach(function(f){var p=phrase(f);if(out.indexOf(p)<0)out.push(p)});
 var lead='',k=o.ctx==='log'?KIND_LEAD[o.kind]||'':'';
 if(k)lead=(topic&&!used?topic+'の件で':'')+k;else if(topic&&!used)lead=topic+'の件です';
 if(o.ctx==='call'&&o.res==='出なかった'){
  lead=(o.topic?o.topic+'の件で':'')+'電話しましたが、つながりませんでした';
  if(!/電話/.test(out.join('')))out.push('あらためて電話します');
 }
 var text=(lead?lead+'。':'')+out.map(function(x){return x.replace(/[。．]+$/,'')+'。'}).join('');
 return {ok:true,text:text};
};

/* ---- 入居者への文面: purpose + tone -> a draft with the room's own data ---- */
A.PURPOSES=['督促','修理日程','更新案内','点検','自由に入力'];
/* 滞納の段階 (2026-10-19): only from a 滞納 step (not in the 文面の種類 list): the report to the owner, the formal 督促状 */
A.EXTRA=['オーナー報告','督促状'];
A.TONES=['ていねい','ふつう'];
function jp(s){return s?String(s).replace(/-/g,'/'):''}
function md(s){var d=GK.parse(s);return d?(d.getMonth()+1)+'月'+d.getDate()+'日（'+GK.wd(s)+'）':''}
function monJ(m){return m?(+String(m).slice(5,7))+'月分':''}
function dunDraft(pur,u,p,l,t,room,me,tn){
 var facts=[],gaps=[],L,lim;
 var ch=l?GK.db.charges.filter(function(c){return c.lease===l.id&&c.paid<c.amount&&c.due<GK.TODAY}).sort(function(a,b){return a.month<b.month?-1:1}):[];
 var sum=ch.reduce(function(s,c){return s+(c.amount-c.paid)},0),months=ch.map(function(c){return monJ(c.month)}).join('・');
 var what=ch.length?months+'の家賃・共益費 '+GK.yen(sum):'〔何月分〕の家賃 〔金額〕';if(!ch.length)gaps.push('金額');
 var tn2=t?t.n+' 様':'〔入居者のお名前〕 様';if(!t)gaps.push('入居者のお名前');
 if(ch.length)facts.push('未収：'+GK.yen(sum)+'（'+months+'）');
 if(pur==='オーナー報告'){
  var ow=GK.owner(p.owner),on=ow?ow.n:'〔オーナーのお名前〕';if(!ow)gaps.push('オーナーのお名前');
  var ds=l&&GK.dun?GK.dun.state(l.id):null,done=ds?ds.steps.map(function(x){return '　・'+jp(x.at)+' '+(GK.dun.STEP[x.n]||'')+(x.skip?'（飛ばしました）':'')}):[];
  facts.unshift('オーナー：'+on+' 様');facts.push('お部屋：'+room+'（'+tn2+'）');facts.push('これまでの対応：'+(done.length?done.length+'件':'まだありません'));
  L=[on+' 様','','いつもお世話になっております。GANKI 賃貸管理部の'+me+'です。',room+'の家賃について、ご報告いたします。','',
   '入居者の'+tn2+'から、'+what+'のご入金がまだございません。'].concat(done.length?['これまでに、次の対応をいたしました。'].concat(done):[]).concat(['',
   '今後の対応（督促状の送付など）について、ご相談させてください。ご都合のよい日時をお知らせいただけますでしょうか。','','どうぞよろしくお願いいたします。','','GANKI 賃貸管理部 '+me]);
 }else{
  lim=GK.addDays(GK.TODAY,14);var d=GK.parse(GK.TODAY);
  facts.push('お支払いの期限：'+md(lim)+'（今日から14日後）');facts.push('振込先は書き入れてください');gaps.push('振込先の口座');
  L=['督　促　状','',d.getFullYear()+'年'+(d.getMonth()+1)+'月'+d.getDate()+'日','',tn2+'（'+room+'）','','GANKI 賃貸管理部（担当 '+me+'）','',
   '拝啓　時下ますますご清栄のこととお慶び申し上げます。',
   'さて、貴殿がご入居中の上記お部屋の賃料等につきまして、下記のとおり未払いとなっております。',
   'これまでお電話やお知らせでお支払いをお願いしてまいりましたが、本日までにご入金を確認できておりません。',
   'つきましては、下記の期限までに、未払いの金額をお支払いくださいますようお願い申し上げます。',
   'なお、期限までにお支払いいただけない場合は、契約の解除を含め、法的な手続きを検討させていただきます。',
   '行き違いでお支払いいただいている場合は、ご容赦ください。','','敬具','','記','１．未払いの金額：'+(ch.length?GK.yen(sum)+'（'+months+'の家賃・共益費）':'〔金額〕'),'２．お支払いの期限：'+md(lim),'３．お振込み先：〔振込先の口座〕','','以上'];
 }
 return {ok:true,text:L.join('\n'),facts:facts,gaps:gaps,purpose:pur,tone:tn,stage:0};
}
A.draft=function(o){
 o=o||{};var u=GK.unit(o.unit),p=u&&GK.prop(u.prop),l=(o.lease&&GK.lease(o.lease))||(u&&GK.activeLease(u.id)),t=l&&GK.tenant(l.tenant);
 if(!u||!p)return {ok:false,msg:'部屋が見つかりません。'};
 var pur=A.PURPOSES.indexOf(o.purpose)>=0||A.EXTRA.indexOf(o.purpose)>=0?o.purpose:A.PURPOSES[0],tn=o.tone==='ふつう'?'ふつう':'ていねい',pol=tn==='ていねい';
 var name=t?t.n:'〔お名前〕',room=p.n+' '+u.no+'号室',me=GK.ME||'担当',facts=[],gaps=[],L=[];
 if(A.EXTRA.indexOf(pur)>=0)return dunDraft(pur,u,p,l,t,room,me,tn);
 facts.push('お名前：'+(t?t.n+' 様':'（入居者が登録されていません）'));facts.push('お部屋：'+room);
 if(!t)gaps.push('お名前');
 var open=pol?['いつもお世話になっております。GANKI 賃貸管理部の'+me+'です。']:['こんにちは。GANKI 賃貸管理部の'+me+'です。'];
 var close=pol?['ご不明な点がございましたら、お気軽にお問い合わせください。','どうぞよろしくお願いいたします。']:['分からないことがあれば、いつでもご連絡ください。','よろしくお願いします。'];
 if(pur==='督促'){
  var ch=l?GK.db.charges.filter(function(c){return c.lease===l.id&&c.paid<c.amount&&c.due<GK.TODAY}).sort(function(a,b){return a.month<b.month?-1:1}):[];
  var sum=ch.reduce(function(s,c){return s+(c.amount-c.paid)},0),lim=GK.addDays(GK.TODAY,7);
  if(ch.length){facts.push('未収：'+GK.yen(sum)+'（'+ch.map(function(c){return monJ(c.month)}).join('・')+'）');facts.push('お支払いのお願いの期限：'+md(lim)+'（今日から7日後）')}
  else{facts.push('期限を過ぎた未収はありません（送る必要があるか確かめてください）');gaps.push('金額')}
  var what=ch.length?ch.map(function(c){return monJ(c.month)}).join('・')+'の家賃・共益費 '+GK.yen(sum):'〔何月分〕の家賃 〔金額〕';
  /* 滞納の段階 (2026-10-19): stage 2 = the second reminder, firmer (and, with a 保証会社, that it will be contacted next) */
  var gu=l&&String(l.gua||'').trim()&&l.gua!=='なし';
  if(+o.stage===2){
   facts.push('段階：2回目の連絡'+(gu?'（次は保証会社へ連絡します）':''));
   L=L.concat(pol?['先日もご連絡いたしましたが、'+what+'のご入金が、まだ確認できておりません。','恐れ入りますが、'+md(lim)+'までに必ずお振込みいただけますでしょうか。',gu?'期限までにご入金が確認できない場合は、契約にもとづき保証会社へご連絡させていただきます。':'お支払いが難しいご事情がある場合は、お早めにご相談ください。','すでにお振込みいただいている場合は、行き違いですのでご容赦ください。']
    :['先日もお知らせしましたが、'+what+'の入金が、まだ確認できていません。',md(lim)+'までに必ずお振込みをお願いします。',gu?'期限までに入金が確認できないときは、契約のとおり保証会社に連絡します。':'払うのが難しい事情があるときは、早めに相談してください。','もう振り込んでいる場合は、このお知らせは気にしないでください。']);
  }else{
  if(+o.stage===1)facts.push('段階：1回目の連絡');
  L=L.concat(pol?[what+'のご入金が、まだ確認できておりません。','お忙しいところ恐れ入りますが、'+md(lim)+'までにお振込みいただけますでしょうか。','すでにお振込みいただいている場合は、行き違いですのでご容赦ください。']
   :[what+'の入金が、まだ確認できていません。',md(lim)+'までにお振込みをお願いします。','もう振り込んでいる場合は、このお知らせは気にしないでください。']);
  }
 }else if(pur==='修理日程'){
  var tk=GK.db.tasks.filter(function(k){return k.unit===u.id&&!k.done&&!k.private&&/修理|網戸|交換|点検|業者|給湯|水漏れ|工事/.test(k.t)})[0];
  var rp=(GK.db.repairs||[]).filter(function(r){return r.unit===u.id}).sort(function(a,b){return a.date<b.date?1:-1})[0];
  var job=rp?rp.t:tk?tk.t.replace(/の?日程.*$/,'').replace(/^(.+?)(修理|交換).*$/,'$1$2'):'〔修理の内容〕';
  if(!rp&&!tk)gaps.push('修理の内容');
  facts.push('修理の内容：'+job+(rp?'（修繕の記録 '+jp(rp.date)+'）':tk?'（やること「'+tk.t+'」）':''));gaps.push('候補の日時');
  L=L.concat(pol?['お部屋の'+job+'について、作業の日程をご相談させてください。','次の日時のうち、ご都合のよいものをお知らせいただけますでしょうか。','　・〔候補の日時1〕','　・〔候補の日時2〕','作業は1時間ほどの予定です。当日は業者がお部屋に伺います。']
   :['お部屋の'+job+'の日程を決めたいです。','都合のよい日時を教えてください。','　・〔候補の日時1〕','　・〔候補の日時2〕','作業は1時間ほどで、業者がお部屋に行きます。']);
 }else if(pur==='更新案内'){
  if(!l||!l.end){facts.push('契約の終わりが登録されていません');gaps.push('契約の終わり')}
  var Lt=l&&l.letter,ns=Lt&&Lt.start||(l&&l.end?GK.addDays(l.end,1):''),ne=Lt&&Lt.end||(ns?GK.addYears(ns,2):''),rent=Lt&&Lt.rent!=null?Lt.rent:l?l.rent:0,due=Lt&&Lt.due||(l&&l.end?GK.addDays(l.end,-30):'');
  if(l&&l.end){facts.push('今の契約の終わり：'+jp(l.end));facts.push('更新後の期間：'+jp(ns)+'〜'+jp(ne)+'（2年）');facts.push('更新後の家賃：'+GK.yen(rent)+(l&&rent!==l.rent?'（今は '+GK.yen(l.rent)+'）':'（変わりません）'));facts.push('お返事の期限：'+jp(due))}
  L=L.concat(pol?['ご入居中のお部屋の契約期間が'+(l&&l.end?' '+jp(l.end)+' ':'〔契約の終わり〕')+'で終わりますので、更新についてご案内いたします。','更新後の期間は '+(ns?jp(ns)+'〜'+jp(ne):'〔更新後の期間〕')+'、家賃は '+GK.yen(rent)+(l&&rent!==l.rent?'（今は '+GK.yen(l.rent)+'）':'（変わりません）')+' です。','更新される場合も、されない場合も、'+(due?jp(due):'〔期限〕')+' までにお知らせいただけますでしょうか。']
   :['お部屋の契約が'+(l&&l.end?' '+jp(l.end)+' ':'〔契約の終わり〕')+'で終わります。更新のお知らせです。','更新後は '+(ns?jp(ns)+'〜'+jp(ne):'〔更新後の期間〕')+'、家賃 '+GK.yen(rent)+' です。',(due?jp(due):'〔期限〕')+' までに、更新するかどうかを教えてください。']);
 }else if(pur==='点検'){
  facts.push('点検の日時・内容は登録されていません（書き換えてください）');gaps.push('点検の日時');
  L=L.concat(pol?['建物の〔点検の内容〕を行いますので、お知らせいたします。','日時：〔点検の日時〕','当日は作業員がお部屋に伺います。ご不在の場合は、別の日をご相談させてください。']
   :['建物の〔点検の内容〕をします。','日時：〔点検の日時〕','作業員がお部屋に行きます。いない場合は、別の日を相談させてください。']);
 }else{
  var fr=nf(o.free).replace(/\s+/g,' ').trim();
  if(!fr)return {ok:false,msg:'「伝えたいこと」をひとこと書いてください（例：11/3に駐輪場の整理をします）。'};
  var r=A.record({ctx:'free',memo:fr});
  facts.push('伝えたいこと（書いたまま）：'+fr);
  L=L.concat([r.ok?r.text.replace(/とのことです。/g,'。'):fr]);
 }
 var text=[name+' 様（'+room+'）',''].concat(open,[''],L,[''],close,['','GANKI 賃貸管理部 '+me]).join('\n');
 return {ok:true,text:text,facts:facts,gaps:gaps,purpose:pur,tone:tn,stage:pur==='督促'&&(+o.stage===1||+o.stage===2)?+o.stage:0};
};

/* ---- 名簿の列合わせ: header -> field (synonyms + fuzzy + the look of the first rows) ---- */
function headNorm(h){return nf(h).toLowerCase().replace(/[\s　_・:：]/g,'').replace(/[(（\[［【].*?[)）\]］】]/g,'').replace(/[(（\[［【)）\]］】]/g,'')}
var LOOK={
 room:function(v){return /^[a-z]?\d{1,4}[a-z]?(号室?)?$/i.test(v)},
 name:function(v){return /[一-龥ぁ-ん]/.test(v)&&!/\d/.test(v)&&v.length<=20&&!/保証|株式会社/.test(v)},
 kana:function(v){return /^[ァ-ヶーｦ-ﾟ\s　]+$/.test(v)},
 tel:function(v){return /^0\d{1,4}-?\d{1,4}-?\d{3,4}$/.test(v.replace(/\s/g,''))},
 money:function(v){return /^[¥￥]?\d{1,3}(,\d{3})+円?$|^[¥￥]?\d{4,7}円?$|^\d+(\.\d+)?万円?$/.test(v.replace(/\s/g,''))},
 date:function(v){return /\d{4}\s*[\/\-.年]\s*\d{1,2}\s*[\/\-.月]\s*\d{1,2}/.test(v)||/^(令和|R)\s*\d/.test(v)},
 gua:function(v){return /保証|^(なし|無し?|あり|有り?|不明)$/.test(v)}
};
A.columns=function(heads,rows,fields){
 heads=(heads||[]).map(function(h){return String(h==null?'':h).trim()});rows=rows||[];
 var cand=[];
 heads.forEach(function(h,i){
  var hn=headNorm(h),vals=rows.map(function(r){return nf(r[i]==null?'':r[i]).trim()}).filter(Boolean);
  fields.forEach(function(f){
   var best=0,why='';
   if(hn)(f.syn||[]).concat([f.n]).forEach(function(s){var sn=headNorm(s),v=0;if(!sn)return;
    if(hn===sn)v=1;else if(sn.length>=2&&hn.indexOf(sn)>=0)v=0.85;else if(hn.length>=2&&sn.indexOf(hn)>=0)v=0.75;else v=A.sim(hn,sn)*0.8;
    if(v>best){best=v;why=v>=1?'見出し『'+h+'』は「'+f.n+'」と同じ意味です':v>=0.7?'見出し『'+h+'』に「'+s+'」が入っています':'見出し『'+h+'』が「'+s+'」と似ています'}});
   var look=f.look&&LOOK[f.look],ratio=look&&vals.length?vals.filter(look).length/vals.length:null,sc=best;
   if(ratio!=null){
    if(ratio>=0.5&&sc>=0.45)sc=Math.min(1,sc+0.05);
    if(sc<0.5&&ratio>=0.8){sc=0.55;why=(h?'見出し『'+h+'』からは分かりませんが、':'')+'中身が「'+f.n+'」の形です（例：'+vals[0]+'）'}
    else if(ratio===0&&sc>=0.45&&f.strict)sc-=0.25;
   }
   if(sc>0)cand.push({i:i,k:f.k,s:sc,why:why});
  });
 });
 cand.sort(function(a,b){return b.s-a.s||a.i-b.i});
 var got={},used={};
 cand.forEach(function(c){if(c.s<0.45||got[c.i]||used[c.k])return;got[c.i]=c;used[c.k]=1});
 return heads.map(function(h,i){
  var c=got[i],samples=rows.slice(0,2).map(function(r){return r[i]==null?'':String(r[i]).trim()});
  return c?{i:i,head:h,key:c.k,score:c.s,conf:c.s>=0.85?'high':c.s>=0.6?'mid':'low',why:c.why,samples:samples}
   :{i:i,head:h,key:'',score:0,conf:'',why:'合う欄が見つからないので、取り込みません',samples:samples};
 });
};

/* ---- the shared panel ---- */
function fire(el,type){try{var ev;if(typeof Event==='function')ev=new Event(type,{bubbles:true});else{ev=document.createEvent('Event');ev.initEvent(type,true,true)}el.dispatchEvent(ev)}catch(e){}}
function inDoc(el){return !!(el&&document.body&&document.body.contains(el))}
function setErr(st,msg,focusSel){var e=st.host.querySelector('[data-gkai-err]');if(e)e.textContent=msg||'';if(focusSel){var f=st.host.querySelector(focusSel);if(f&&f.focus)f.focus()}}
function clip(text,ok,ng){try{if(typeof navigator!=='undefined'&&navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(ok,ng);return}}catch(e){}ng()}
function boxHtml(st){
 var o=st.o,P=st.id,B=o.btn||'btn',dis=o.check?' aria-disabled="true"':'';
 return '<div class="gk-ai" role="group" aria-labelledby="'+P+'-t">'+A.head(o.kind,o.sub,P+'-t')+
  '<label class="gk-ai-lab" for="'+P+'-x">'+esc(o.label||'提案された文（直してから使えます）')+'</label>'+
  '<textarea class="gk-ai-text" id="'+P+'-x" rows="'+(o.rows||4)+'" data-gkai-text="1">'+esc(o.text)+'</textarea>'+
  (o.facts&&o.facts.length?'<div class="gk-ai-facts"><p class="gk-ai-lab" id="'+P+'-f">下書きに入れた情報（合っているか確かめてください）</p><ul aria-labelledby="'+P+'-f">'+o.facts.map(function(f){return '<li>'+esc(f)+'</li>'}).join('')+'</ul></div>':'')+
  (o.gaps&&o.gaps.length?'<p class="gk-ai-warn">〔 〕の所（'+esc(o.gaps.join('・'))+'）は、送る前に書き換えてください。</p>':'')+
  (o.check?'<label class="gk-ai-chk"><input type="checkbox" id="'+P+'-c" data-gkai-chk="1">名前・日付・金額を確かめました</label>':'')+
  '<p class="gk-ai-err" id="'+P+'-e" role="alert" data-gkai-err="1"></p>'+
  '<div class="gk-ai-acts">'+(o.use?'<button type="button" class="'+B+' primary" data-gkai-act="use"'+dis+'>'+esc(o.use)+'</button>':'')+
  (o.copy?'<button type="button" class="'+B+'" data-gkai-act="copy"'+dis+'>コピー</button>':'')+
  '<button type="button" class="'+B+'" data-gkai-act="cancel">やめる</button></div></div>';
}
function bind(host){
 if(host._gkaiBound)return;host._gkaiBound=true;
 host.addEventListener('click',function(e){
  var b=e.target&&e.target.closest?e.target.closest('[data-gkai-act]'):null,st=host._gkai;if(!b||!st||!host.contains(b))return;
  e.stopPropagation();
  var a=b.getAttribute('data-gkai-act');
  if(a==='cancel')return A.close(host,true);
  if(a==='make')return st.make&&st.make();
  var ta=host.querySelector('[data-gkai-text]'),text=ta?String(ta.value||'').trim():'';
  if(b.getAttribute('aria-disabled')==='true'){setErr(st,'先に「名前・日付・金額を確かめました」にチェックを入れてください。','[data-gkai-chk]');return}
  if(!text){setErr(st,'文が空です。書いてから使ってください。','[data-gkai-text]');return}
  if(a==='copy'){
   if(text.indexOf('〔')>=0){setErr(st,'〔 〕の所が残っています。書き換えるか消してからコピーしてください。','[data-gkai-text]');return}
   clip(text,function(){b.textContent='コピーしました';GK.toast('下書きをコピーしました。送る前にもう一度読み直してください')},function(){try{if(ta.select)ta.select();if(ta.focus)ta.focus()}catch(x){}GK.toast('選びました。Ctrl+C（スマホは長押し）でコピーしてください')});
   return;
  }
  if(a==='use'&&st.o.onUse){var ret=st.o.onUse(text);A.close(host,false);if(ret&&ret.focus)try{ret.focus()}catch(x){}}
 });
 host.addEventListener('keydown',function(e){
  if(e.key!=='Escape'||!host._gkai||e.isComposing)return;
  e.stopPropagation();if(e.preventDefault)e.preventDefault();A.close(host,true);
 });
 host.addEventListener('change',function(e){
  var st=host._gkai,t=e.target;if(!st||!t)return;
  if(t.getAttribute&&t.getAttribute('data-gkai-chk')){[].forEach.call(host.querySelectorAll('[data-gkai-act="use"],[data-gkai-act="copy"]'),function(b){if(t.checked)b.removeAttribute('aria-disabled');else b.setAttribute('aria-disabled','true')});setErr(st,'')}
  if(t.getAttribute&&t.getAttribute('data-gkai-f')==='purpose'){var fw=host.querySelector('[data-gkai-freewrap]');if(fw)fw.hidden=t.value!=='自由に入力'}
 });
}
/* host: an element that holds the panel (its content is replaced). o: {kind, sub, text, facts, gaps, check, use, copy, btn, label, rows, onUse(text) -> element to focus, ret} */
A.box=function(host,o){
 if(!host)return null;var st={host:host,o:o||{},id:'gkai'+(++seq)};
 host._gkai=st;bind(host);host.innerHTML=boxHtml(st);host.hidden=false;
 var ta=host.querySelector('[data-gkai-text]');if(ta&&ta.focus)try{ta.focus()}catch(e){}
 return st;
};
A.close=function(host,back){
 var st=host&&host._gkai;if(!st)return;host._gkai=null;host.innerHTML='';
 if(back){var r=st.o.ret;if(inDoc(r)&&r.focus)try{r.focus()}catch(e){}}
};
A.isOpen=function(host){return !!(host&&host._gkai)};
/* 対応の記録: the suggestion for the memo in `into` (input / textarea) */
A.mountWrite=function(host,o){
 o=o||{};if(!host)return null;
 var r=A.record(o);
 if(!r.ok){host.innerHTML='<p class="gk-ai-err" role="alert">'+esc(r.msg)+'</p>';host._gkai=null;if(inDoc(o.into)&&o.into.focus)o.into.focus();return r}
 A.box(host,{kind:'write',sub:'記録の文',text:r.text,use:'使う',btn:o.btn,rows:3,ret:o.ret,label:'提案された記録の文（直してから使えます）',onUse:function(t){
  var el=o.into;if(!inDoc(el))return null;var prev=el.value;el.value=t;fire(el,'input');
  GK.toast('AIの提案を内容に入れました。確かめてから「記録する」を押してください',function(){if(inDoc(el)){el.value=prev;fire(el,'input');if(el.focus)el.focus()}});
  return el;
 }});
 return r;
};
/* 入居者への文面: the form (種類・言い方) and, after 「下書きを作る」, the draft (must be checked before it is copied or used) */
A.mountDraft=function(host,o){
 o=o||{};if(!host)return null;
 var P='gkaid'+(++seq),ex=A.EXTRA.indexOf(o.purpose)>=0,pur=A.PURPOSES.indexOf(o.purpose)>=0||ex?o.purpose:A.PURPOSES[0],B=o.btn||'btn',PL=ex?[pur]:A.PURPOSES;
 var st={host:host,o:{kind:'draft',ret:o.ret},id:P};
 host.innerHTML='<div class="gk-ai gk-ai-form" role="group" aria-labelledby="'+P+'-t">'+
  '<p class="gk-ai-tag" id="'+P+'-t"><span class="gk-ai-badge">AIで下書き</span> '+esc(o.title||'入居者への文面')+'</p><p class="gk-ai-demo">'+esc(A.DEMO)+'</p><p class="gk-ai-send">'+esc(A.SEND.draft)+'</p>'+
  '<div class="gk-ai-row"><label for="'+P+'-p">文面の種類</label><select id="'+P+'-p" data-gkai-f="purpose">'+PL.map(function(x){return '<option'+(x===pur?' selected':'')+'>'+x+'</option>'}).join('')+'</select></div>'+
  (ex?'':'<fieldset class="gk-ai-tone"><legend>言い方</legend>'+A.TONES.map(function(x,i){return '<label><input type="radio" name="'+P+'-tone" value="'+x+'" data-gkai-f="tone"'+(i===0?' checked':'')+'>'+x+'</label>'}).join('')+'</fieldset>')+
  '<div class="gk-ai-row" data-gkai-freewrap="1"'+(pur==='自由に入力'?'':' hidden')+'><label for="'+P+'-free">伝えたいこと（ひとことで）</label><input type="text" id="'+P+'-free" maxlength="200" autocomplete="off" data-gkai-f="free" placeholder="例：11/3に駐輪場の整理をします"></div>'+
  '<p class="gk-ai-err" role="alert" data-gkai-err="1"></p>'+
  '<div class="gk-ai-acts"><button type="button" class="'+B+' primary" data-gkai-act="make">下書きを作る</button><button type="button" class="'+B+'" data-gkai-act="cancel">やめる</button></div>'+
  '<div class="gk-ai-out" data-gkai-out="1"></div></div>';
 host.hidden=false;host._gkai=st;bind(host);
 st.make=function(){
  var sel=host.querySelector('[data-gkai-f="purpose"]'),tone='ていねい',fr=host.querySelector('[data-gkai-f="free"]');
  [].forEach.call(host.querySelectorAll('[data-gkai-f="tone"]'),function(r){if(r.checked)tone=r.value});
  var r=A.draft({unit:o.unit,lease:o.lease,purpose:sel?sel.value:pur,tone:tone,free:fr?fr.value:'',stage:o.stage});
  if(!r.ok){setErr(st,r.msg,r.msg.indexOf('伝えたいこと')>=0?'[data-gkai-f="free"]':null);return}
  setErr(st,'');
  var out=host.querySelector('[data-gkai-out]'),mk=host.querySelector('[data-gkai-act="make"]');
  A.box(out,{kind:'draft',sub:r.purpose+(r.stage?'・'+r.stage+'回目':'')+'（'+r.tone+'）',text:r.text,facts:r.facts,gaps:r.gaps,check:true,copy:true,use:o.into?'文面の欄に入れる':'',btn:B,rows:10,ret:mk,
   label:'下書き（直してから使えます）',onUse:function(t){
    var el=o.into;if(!inDoc(el))return null;var prev=el.value;el.value=t;fire(el,'input');
    GK.toast('下書きを文面の欄に入れました。送る前にもう一度読み直してください',function(){if(inDoc(el)){el.value=prev;fire(el,'input');if(el.focus)el.focus()}});
    return el;
   }});
 };
 var f=host.querySelector('[data-gkai-f="purpose"]');if(f&&f.focus)try{f.focus()}catch(e){}
 return st;
};
/* buttons for the pages: '' when 「文章の下書き」 is OFF. host / into / kind: element ids */
A.writeBtn=function(o){if(!can('ai.write'))return '';o=o||{};return '<button type="button" class="act gk-ai-btn" data-gkai="write" data-gkai-host="'+esc(o.host)+'" data-gkai-into="'+esc(o.into)+'"'+(o.kind?' data-gkai-kind="'+esc(o.kind)+'"':'')+' aria-controls="'+esc(o.host)+'">AIで文章にする</button>'};
A.draftBtn=function(o){if(!can('ai.write'))return '';o=o||{};return '<button type="button" class="act gk-ai-btn" data-gkai="draft" data-gkai-host="'+esc(o.host)+'" data-gkai-unit="'+esc(o.unit)+'"'+(o.lease?' data-gkai-lease="'+esc(o.lease)+'"':'')+(o.into?' data-gkai-into="'+esc(o.into)+'"':'')+(o.purpose?' data-gkai-purpose="'+esc(o.purpose)+'"':'')+(o.stage?' data-gkai-stage="'+esc(o.stage)+'"':'')+(o.title?' data-gkai-title="'+esc(o.title)+'"':'')+' aria-controls="'+esc(o.host)+'"'+(o.label?' aria-label="'+esc(o.label)+'"':'')+'>AIで下書き</button>'};
if(document.addEventListener)document.addEventListener('click',function(e){
 var b=e.target&&e.target.closest?e.target.closest('[data-gkai]'):null;if(!b)return;
 var k=b.getAttribute('data-gkai'),g=function(n){return b.getAttribute('data-gkai-'+n)||''},host=document.getElementById(g('host'));if(!host)return;
 if(!can('ai.write')){GK.toast('「文章の下書き」は使えない設定になっています');return}
 if(k==='write'){var into=document.getElementById(g('into')),kd=g('kind')?document.getElementById(g('kind')):null;
  A.mountWrite(host,{ctx:'log',kind:kd?kd.value:'',memo:into?into.value:'',into:into,ret:b});return}
 if(k==='draft')A.mountDraft(host,{unit:g('unit'),lease:g('lease'),purpose:g('purpose'),stage:+g('stage')||0,title:g('title'),into:g('into')?document.getElementById(g('into')):null,ret:b});
});
})();
})();
