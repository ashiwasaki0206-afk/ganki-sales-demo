/* GANKI rental prototype — 書類から読み込む (GK.docs). Additive 2026-10-19; load after ganki-data.js.
   Production reads the uploaded documents with an external AI service. This prototype cannot read files: it shows
   deterministic, fictitious sample values (said once at the top of the dialog). Files stay in memory only — nothing
   from a file is written to localStorage, and an ID document's number / photo is never read or stored.

   GK.docs.open(opts) — dialog 「書類から読み込む」: choose / drop files -> each file's 書類の種類 -> 読み取り中… ->
     review (preview left, read values right) -> 「原本と見比べて確かめました」 -> 「チェックした項目を反映」.
     opts.kinds   ['apply','lease','guar','jusetsu','roster'] the documents this place reads
                  (入居申込書 / 賃貸借契約書 / 保証会社の契約書 / 重要事項説明書 / 入居者名簿)
     opts.ctx     what the page already knows, so the sample values fit it:
                  {person:{n,k,tel,mail,work,emName,emTel,addr,birth}, lease:{start,end,rent,fee,dep,pay,gua},
                   prop:{n,addr,struct,year,no,lay,area,rent,fee}, rooms:[{no,ten,k,tel,rent,start,end,gua}]}
     opts.lead    one line under the title (optional)
     -- fields (one form) --
     opts.fields  [{key, doc, label, cur, sel, type, group, check}]
                    key: the page's own name for the field (what apply() gets back), doc: the read item (see META below),
                    cur: the value in the form now (or function(readValues) -> value), sel: CSS selector of the input
                    (for the 「書類から入れました」 mark), check:true = compare only (no checkbox, ✓一致 / 違い).
     opts.apply(vals,{person}) -> undo function, or {undo, marks:[{sel,val}]}. vals = {key: value} of the ticked rows,
                    already normalised (tel formatted, yen digits, dates ISO, 支払日 a number with 31 = 末日).
                    person = the registered person the user chose in 「同じ人が登録済みです」 (or null).
     opts.dup     false = no duplicate-person check; opts.people [{id,n,k,tel,where}] (default: GK.db.tenants);
                  opts.canUse(id) -> false when the page cannot pick that person (then only the warning shows).
     opts.doneMsg(n) toast text after applying (optional)
     -- rows (a room table, takeover) --
     opts.rows    {cur:[{no,ten,k,tel,rent,start,end,gua}], apply(rows) -> undo or {undo,marks}}
                  rows = [{no, ten, k, tel, rent, start, end, gua}] of the ticked rooms (a key is left out when nothing
                  was read for it; ten '' = 空室; gua = company name or 'なし').
   GK.docs.idCheck(opts) — supplementary 「本人確認書類で確かめる」: reads 氏名・住所・生年月日 (+ 書類の種類) and compares them with
     opts.person {n, addr, birth} (missing 住所 / 生年月日 fall back to the 申込書 read on this page) -> ✓一致 / 違い.
     With 違い the record is allowed after the extra tick 「違いを確かめたうえで記録する」, and the log adds 「（違いあり：住所）」.
     When documents disagree, the 賃貸借契約書's value is preselected (保証会社の欄: then 保証会社の契約書), then 入居申込書.
     「確認済みとして記録」 -> opts.onRecord({type,date,by}) (may return an undo function) + GK.log 「本人確認：<種類>で確認（<名前> 様）」
     (opts.unit = the room for the history, optional).
   GK.docs.idLabel(rec) -> '済み（10/16 佐藤）' / '未確認'.
   After 反映, the page fields get a yellow outline and 「書類から入れました」 until they are edited (they are found again by
   selector after every re-render); the toast's 元に戻す calls the page's undo. */
(function(){
var GK=window.GK;
if(!GK||GK.docs)return;
var D=GK.docs={};
var esc=GK.esc;
function str(v){return v==null?'':String(v)}
function nk(s){var t=str(s);try{t=t.normalize('NFKC')}catch(e){}return t}
function ft(s){return typeof GK.formatTel==='function'?GK.formatTel(str(s)):str(s).trim()}
function pad(n){return String(n).padStart(2,'0')}
function q(id){return document.getElementById(id)}
function log(e){if(window.console&&console.error)console.error(e)}

/* ---------- documents ---------- */
var KIND={apply:'入居申込書',lease:'賃貸借契約書',jusetsu:'重要事項説明書',guar:'保証会社の契約書',roster:'入居者名簿'};
var SHORT={apply:'申込書',lease:'契約書',jusetsu:'重要事項説明書',guar:'保証会社の契約書',roster:'名簿'};
/* file name -> kind (order matters: 「保証会社の契約書」 is 保証, 「重要事項説明書」 is not 契約) */
var DETECT=[['jusetsu',/重説|重要事項/],['guar',/保証/],['roster',/名簿|一覧/],['id',/免許|本人|マイナ|パスポート|旅券|在留|保険証/],['apply',/申込|申し込/],['lease',/契約/]];
var IDTYPES=['運転免許証','マイナンバーカード','パスポート','在留カード','健康保険証','その他の本人確認書類'];
function detect(name){var n=nk(name);for(var i=0;i<DETECT.length;i++)if(DETECT[i][1].test(n))return DETECT[i][0];return ''}
function detectId(name){var n=nk(name);if(/免許/.test(n))return '運転免許証';if(/マイナ|個人番号/.test(n))return 'マイナンバーカード';if(/パスポート|旅券|passport/i.test(n))return 'パスポート';if(/在留/.test(n))return '在留カード';if(/保険証/.test(n))return '健康保険証';return ''}

/* read items: [label, group, type] */
var META={
 name:['氏名','入居者','text'],kana:['フリガナ','入居者','text'],birth:['生年月日','入居者','date'],tel:['電話','入居者','tel'],mail:['メール','入居者','email'],
 addr:['現住所','入居者','text'],work:['勤務先','入居者','text'],workTel:['勤務先の電話','入居者','tel'],
 emName:['緊急連絡先の氏名','緊急連絡先','text'],emRel:['緊急連絡先の続柄','緊急連絡先','text'],emTel:['緊急連絡先の電話','緊急連絡先','tel'],emLabel:['緊急連絡先（氏名・続柄）','緊急連絡先','text'],
 wishStart:['希望入居日','契約','date'],start:['契約の始まり','契約','date'],end:['契約の終わり','契約','date'],rent:['家賃','契約','yen'],fee:['共益費','契約','yen'],
 dep:['敷金','契約','yen'],key:['礼金','契約','yen'],pay:['支払日','契約','pay'],renew:['更新料','契約','yen'],
 propName:['物件名','物件・部屋','text'],propAddr:['所在地','物件・部屋','text'],struct:['構造','物件・部屋','text'],year:['築年','物件・部屋','year'],
 roomNo:['部屋番号','物件・部屋','text'],lay:['間取り','物件・部屋','text'],area:['面積','物件・部屋','area'],wishRoom:['希望の部屋','物件・部屋','text'],
 gua:['保証会社名','保証会社','text'],guaTel:['保証会社の電話','保証会社','tel'],guaStart:['保証の始まり','保証会社','date'],guaNo:['保証番号','保証会社','text']
};
var GROUPS=['入居者','契約','物件・部屋','保証会社','緊急連絡先'];
var ALIAS={start:['wishStart']}; /* a page's 入居日 takes the 申込書's 希望入居日 too (書類によって違います when they differ) */
var COLS=[['ten','氏名','text'],['k','フリガナ','text'],['tel','電話','tel'],['rent','家賃','yen'],['start','契約の始まり','date'],['end','契約の終わり','date'],['gua','保証会社','text']];

/* ---------- values: show / compare / normalise ---------- */
function show(type,v){
 if(v==null||str(v)==='')return '';
 if(type==='date')return GK.parse(v)?GK.jp(v):str(v);
 if(type==='yen')return GK.yen(GK.num(v));
 if(type==='pay')return +GK.num(v)===31||str(v)==='末日'?'毎月 末日':'毎月 '+GK.num(v)+'日';
 if(type==='tel')return ft(v);
 if(type==='year')return str(v)+'年';
 if(type==='area')return str(v)+'㎡';
 return str(v);
}
function ckey(type,v){
 var s=nk(v).trim();if(!s)return '';
 if(type==='tel')return s.replace(/\D/g,'');
 if(type==='pay')return s==='末日'?'31':String(GK.num(s));
 if(type==='yen'||type==='year')return String(GK.num(s));
 if(type==='area'){var f=parseFloat(s.replace(/[^\d.]/g,''));return isNaN(f)?s:String(f)}
 return s.replace(/[\s　]/g,'');
}
function same(type,a,b){return ckey(type,a)===ckey(type,b)}
function empty(type,v){return ckey(type,v)===''}
/* value for the dialog's input */
function toIn(type,v){
 if(v==null)return '';
 if(type==='tel')return ft(v);
 if(type==='yen'||type==='year')return empty(type,v)?'':String(GK.num(v));
 if(type==='pay')return empty(type,v)?'':ckey('pay',v);
 return str(v);
}
/* value handed to the page */
function toOut(type,v){
 var s=str(v).trim();
 if(type==='tel')return ft(s);
 if(type==='yen'||type==='year')return s&&/\d/.test(nk(s))?String(GK.num(s)):'';
 if(type==='pay')return s?+ckey('pay',s)||'':'';
 if(type==='area'){var f=parseFloat(nk(s).replace(/[^\d.]/g,''));return isNaN(f)?'':String(f)}
 return s;
}
function normNo(v){return nk(v).trim().replace(/号室?$/,'').trim()}

/* ---------- simulated reading (deterministic, fictitious) ---------- */
var SAMPLE={n:'佐藤 花子',k:'サトウ ハナコ',tel:'090-0000-2468',telAlt:'090-0000-2486',mail:'hanako.sato@example.com',addr:'東京都〇〇区中央1-4-6 中央ハイム302',birth:'1994-06-12',
 work:'株式会社みなと商事（架空）',workTel:'03-0000-2580',emName:'佐藤 誠',emRel:'父',emTel:'03-0000-1357',
 prop:{n:'グリーンコート若葉',addr:'東京都〇〇区若葉2-9-4',struct:'RC造 4階建て',year:'2011',no:'203',lay:'1LDK',area:'42.5'},
 gua:'ガンキ保証',guaTel:'03-0000-5100',guaNo:'第2611-0482号'};
var ROSTER=[['石田 陽向','イシダ ヒナタ'],['岡本 健司','オカモト ケンジ'],['小松 由紀','コマツ ユキ'],['酒井 大地','サカイ ダイチ'],['杉本 彩花','スギモト アヤカ'],
 ['高野 翼','タカノ ツバサ'],['筒井 美穂','ツツイ ミホ'],['長尾 誠一','ナガオ セイイチ'],['成田 結菜','ナリタ ユイナ'],['橋本 隼人','ハシモト ハヤト'],
 ['広瀬 里奈','ヒロセ リナ'],['松尾 浩二','マツオ コウジ'],['宮崎 遥','ミヤザキ ハルカ'],['森下 拓也','モリシタ タクヤ'],['山下 千尋','ヤマシタ チヒロ'],
 ['横田 修','ヨコタ オサム'],['吉村 葵','ヨシムラ アオイ'],['渡辺 圭','ワタナベ ケイ'],['安藤 美紀','アンドウ ミキ'],['今村 亮介','イマムラ リョウスケ']];
function isNum(v){return v!==''&&v!=null&&!isNaN(+v)}
function hash(s){var h=0;s=str(s);for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))%9973;return h}
function startFromEnd(end){var d=GK.parse(end);return d?GK.iso(new Date(d.getFullYear()-2,d.getMonth(),d.getDate()+1)):''}
function roll(st){var e=GK.addYears(st,2),n=0;while(e&&e<GK.TODAY&&n++<40)e=GK.addYears(GK.addDays(e,1),2);return e}
function world(ctx){
 ctx=ctx||{};var P=ctx.person||{},L=ctx.lease||{},R=ctx.prop||{},has=!!str(P.n).trim();
 var n=has?str(P.n).trim():SAMPLE.n,sur=n.split(/[\s　]+/)[0];
 var tel=P.tel?ft(P.tel):has?'090-0000-'+String(1000+hash(n)%9000):SAMPLE.tel;
 var em=/^(.*?)[（(](.+)[）)]\s*$/.exec(str(P.emName).trim());
 var p={n:n,k:has?str(P.k).trim():SAMPLE.k,tel:tel,telAlt:has?tel:SAMPLE.telAlt,
  mail:P.mail||(has?'mail'+tel.replace(/\D/g,'').slice(-4)+'@example.com':SAMPLE.mail),addr:P.addr||SAMPLE.addr,birth:P.birth||SAMPLE.birth,
  work:P.work||SAMPLE.work,workTel:SAMPLE.workTel,
  emName:em?em[1].trim():str(P.emName).trim()||sur+' 誠',emRel:em?em[2].trim():'父',emTel:P.emTel?ft(P.emTel):SAMPLE.emTel};
 var start=GK.parse(L.start)?L.start:GK.parse(L.end)?startFromEnd(L.end):GK.firstOfNextMonth(GK.TODAY);
 var rent=isNum(L.rent)&&+L.rent>0?+L.rent:isNum(R.rent)&&+R.rent>0?+R.rent:68000;
 var l={start:start,end:GK.parse(L.end)?L.end:GK.addYears(start,2),rent:rent,fee:isNum(L.fee)?+L.fee:isNum(R.fee)&&+R.fee>0?+R.fee:3000,
  dep:isNum(L.dep)?+L.dep:rent,key:rent,renew:rent,pay:isNum(L.pay)&&+L.pay>0?+L.pay:27,gua:L.gua!==undefined?(str(L.gua).trim()||'なし'):SAMPLE.gua};
 var pr={n:str(R.n).trim()||SAMPLE.prop.n,addr:str(R.addr).trim()||SAMPLE.prop.addr,struct:str(R.struct).trim()||SAMPLE.prop.struct,year:str(R.year).trim()||SAMPLE.prop.year,
  no:normNo(R.no)||SAMPLE.prop.no,lay:R.lay&&R.lay!=='未登録'?str(R.lay):SAMPLE.prop.lay,area:+R.area>0?String(R.area):SAMPLE.prop.area};
 return {person:p,lease:l,prop:pr,rows:roster(ctx.rooms)};
}
/* 入居者名簿: the page's room numbers (or 10 sample rooms); a room the page already knows keeps its tenant */
function roster(rooms){
 var list=(rooms||[]).map(function(r){return typeof r==='object'&&r?r:{no:r}}).filter(function(r){return normNo(r.no)}).slice(0,20);
 if(!list.length)list=['101','102','103','104','105','201','202','203','204','205'].map(function(n){return {no:n}});
 return list.map(function(r,i){
  var no=normNo(r.no),num=parseInt(no,10),fl=num>=100?Math.floor(num/100):1;
  var has=!!str(r.ten).trim(),entered=has||!!str(r.rent).trim()||!!r.start||!!r.end,vac=has?false:entered?true:i%6===4;
  var P=ROSTER[i%ROSTER.length],st=GK.parse(r.start)?r.start:(2021+i%5)+'-'+pad(1+(i*5)%12)+'-01';
  var g=str(r.gua).trim();
  var gua=g&&g!=='不明'&&g!=='あり'?g:i%3===0?'なし':i%3===1?'ガンキ保証':'東日本保証';
  return {no:no,ten:vac?'':has?str(r.ten).trim():P[0],k:vac?'':has?str(r.k).trim():P[1],tel:vac?'':r.tel?ft(r.tel):'090-0000-'+(4100+i*17),
   rent:String(GK.num(r.rent)||(60000+fl*1000+(i%3)*500)),start:vac?'':st,end:vac?'':(GK.parse(r.end)?r.end:roll(st)),gua:vac?'':gua};
 });
}
function clean(v){var o={};Object.keys(v).forEach(function(k){if(v[k]!=null&&str(v[k])!=='')o[k]=v[k]});return o}
/* one document -> {v:{item:value}, low:{item:reason}} or {rows:[…], lowRows:{i:{col:reason}}} */
function sim(kind,w,j,mode){
 var p=w.person,l=w.lease,r=w.prop;
 if(kind==='apply')return {v:clean({name:p.n,kana:p.k,birth:p.birth,tel:p.tel,mail:p.mail,addr:p.addr,work:p.work,workTel:p.workTel,emName:p.emName,emRel:p.emRel,emTel:p.emTel,
  emLabel:p.emName+(p.emRel?'（'+p.emRel+'）':''),wishStart:l.start,wishRoom:r.n+' '+r.no}),low:{workTel:'かすれて読みにくい'}};
 if(kind==='lease'&&mode==='rows'){
  var occ=w.rows.filter(function(x){return x.ten});if(!occ.length)return {rows:[],lowRows:{}};
  var x=JSON.parse(JSON.stringify(occ[(j||0)%occ.length]));if(!j)x.rent=String(GK.num(x.rent)+1000); /* the 1st contract: the 名簿 is out of date */
  return {rows:[x],lowRows:{}};
 }
 if(kind==='lease')return {v:clean({name:p.n,kana:p.k,tel:p.telAlt,addr:p.addr,propName:r.n,roomNo:r.no,start:l.start,end:l.end,rent:l.rent,fee:l.fee,dep:l.dep,key:l.key,pay:l.pay,renew:l.renew,gua:l.gua}),
  low:{dep:'手書きで直した跡があります'}};
 if(kind==='jusetsu')return {v:clean({propName:r.n,propAddr:r.addr,struct:r.struct,year:r.year,roomNo:r.no,lay:r.lay,area:r.area,rent:l.rent,fee:l.fee,dep:l.dep}),low:{year:'かすれて読みにくい'}};
 if(kind==='guar')return {v:clean({gua:l.gua==='なし'?SAMPLE.gua:l.gua,guaTel:SAMPLE.guaTel,guaStart:l.start,guaNo:SAMPLE.guaNo,name:p.n}),low:{guaStart:'印影と重なって読みにくい'}};
 if(kind==='roster'){var lr={},rows=JSON.parse(JSON.stringify(w.rows));for(var i=2;i<rows.length;i++)if(rows[i].tel){lr[i]={tel:'かすれて読みにくい'};break}return {rows:rows,lowRows:lr}}
 if(kind==='id')return {v:clean({idName:p.n,idAddr:p.addr,idBirth:p.birth}),low:{idAddr:'光が反射して読みにくい'}};
 return {v:{},low:{}};
}
D._sim=function(kind,ctx,j,mode){return sim(kind,world(ctx),j||0,mode)}; /* for tests */
D._detect=detect;
D._recent=null; /* the 申込書 last read on this page (memory only): idCheck compares with it when the page has no 住所 / 生年月日 */

/* ---------- the dialog ---------- */
var X=null;
var CSS='.gkd-root{position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;padding:16px}'+
 '.gkd-scrim{position:absolute;inset:0;background:var(--scrim,rgba(10,14,20,.35))}'+
 '.gkd-dlg{position:relative;background:var(--surface,#fff);color:var(--fg,#1b2535);border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,.25);width:min(1080px,100%);max-height:calc(100vh - 32px);display:flex;flex-direction:column;overflow:hidden}'+
 '.gkd-dlg.is-id{width:min(760px,100%)}'+
 '.gkd-head{padding:14px 20px 10px;border-bottom:1px solid var(--line,#dfe4ec);display:flex;flex-direction:column;gap:6px}'+
 '.gkd-head h2{font-size:17px;outline:none}'+
 '.gkd-demo{font-size:12px;color:var(--warn,#8a5a00);background:var(--warn-soft,#fdf1d8);border-radius:6px;padding:3px 8px;align-self:flex-start}'+
 '.gkd-body{overflow:auto;padding:16px 20px;display:flex;flex-direction:column;gap:14px;flex:1 1 auto;min-height:0}'+
 '.gkd-body h3{font-size:14px;outline:none}'+
 '.gkd-foot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:12px 20px;border-top:1px solid var(--line,#dfe4ec);background:var(--surface,#fff)}'+
 '.gkd-foot .gkd-sp{flex:1 1 auto}.gkd-foot .err{flex:1 0 100%}.gkd-foot .err:empty{display:none}'+
 '.gkd-ask{padding:10px 20px 0}.gkd-ask[hidden]{display:none}'+
 '.gkd-lead{font-size:13px;color:var(--muted,#596579)}'+
 '.gkd-drop{border:2px dashed var(--input,#cbd3df);border-radius:10px;padding:20px 16px;display:flex;flex-direction:column;align-items:center;gap:8px;text-align:center;background:var(--surface-2,#edf0f5)}'+
 '.gkd-drop.is-over{border-color:var(--primary,#3359f2);background:var(--primary-soft,#e9eefb)}'+
 '.gkd-file{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;clip:rect(0 0 0 0);pointer-events:none}'+
 '.gkd-flist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}.gkd-flist:empty{display:none}'+
 '.gkd-f{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) minmax(0,.9fr) auto;gap:8px 12px;align-items:center;border:1px solid var(--line,#dfe4ec);border-radius:8px;padding:10px 12px}'+
 '.gkd-fn{display:flex;flex-direction:column;min-width:0}.gkd-fn b{overflow-wrap:anywhere;font-weight:500}'+
 '.gkd-fk{display:flex;flex-direction:column;gap:2px;min-width:0}.gkd-fk label{font-size:12px;color:var(--muted,#596579)}'+
 '.gkd-root select,.gkd-root input:not([type=checkbox]):not([type=radio]):not([type=file]){border:1px solid var(--input,#cbd3df);border-radius:7px;padding:7px 10px;background:var(--surface,#fff);width:100%;min-width:0;min-height:40px}'+
 '.gkd-rv{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:16px;align-items:start}'+
 '.gkd-rv.is-rows{grid-template-columns:minmax(0,1fr)}'+
 '.gkd-pcol{position:sticky;top:0;min-width:0}.gkd-ptoggle{display:none}'+
 '.gkd-ptabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}'+
 '.gkd-fig{margin:0;display:flex;flex-direction:column;gap:6px}'+
 '.gkd-fig img{display:block;max-width:100%;max-height:62vh;object-fit:contain;border:1px solid var(--line,#dfe4ec);border-radius:8px;background:var(--surface-2,#edf0f5)}'+
 '.gkd-page{aspect-ratio:1/1.414;width:100%;max-width:380px;max-height:62vh;border:1px solid var(--line,#dfe4ec);border-radius:6px;background:#fff;box-shadow:0 1px 6px rgba(27,37,53,.12);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:16px;text-align:center;overflow-wrap:anywhere}'+
 '.gkd-rv.is-rows .gkd-page{aspect-ratio:auto;max-width:none;padding:10px}'+
 '.gkd-fields{display:flex;flex-direction:column;gap:12px;min-width:0}'+
 '.gkd-grp,.gkd-room{border:1px solid var(--line,#dfe4ec);border-radius:8px;padding:4px 12px 8px;margin:0;min-width:0}'+
 '.gkd-grp legend{font-size:12.5px;font-weight:700;padding:0 6px}'+
 '.gkd-row{display:flex;gap:12px;align-items:center;padding:8px 0;border-top:1px solid var(--line,#dfe4ec)}'+
 '.gkd-grp legend+.gkd-row{border-top:0}'+
 '.gkd-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:4px}'+
 '.gkd-rv.is-rows .gkd-pcol{position:static}.gkd-rv.is-rows .gkd-ptoggle{display:inline-flex}.gkd-rv.is-rows .gkd-prev{display:none}.gkd-rv.is-rows .gkd-prev.open{display:block;margin-top:8px}.gkd-rv.is-rows .gkd-fig img{max-height:40vh}'+
 '.gkd-row.is-low,.gkd-cell.is-low{background:#fff4c2;border-radius:6px}.gkd-row.is-low{margin:0 -8px;padding:8px}'+
 '.gkd-rh{display:flex;gap:6px;align-items:center;flex-wrap:wrap}'+
 '.gkd-lab{font-size:13px;font-weight:500}.gkd-why{font-size:12px;color:var(--warn,#8a5a00)}'+
 '.gkd-cur{font-size:12px;color:var(--muted,#596579);overflow-wrap:anywhere}.gkd-row.is-diff .gkd-cur b,.gkd-cell.is-diff .gkd-cur b{color:var(--danger,#b4332b)}'+
 '.gkd-chk{display:inline-flex;gap:6px;align-items:center;min-height:44px;font-size:13px;cursor:pointer;padding:0 4px;white-space:nowrap}'+
 '.gkd-root input[type=checkbox],.gkd-root input[type=radio]{width:20px;height:20px;accent-color:var(--primary,#3359f2);margin:0;flex-shrink:0}'+
 '.gkd-alts{display:flex;flex-direction:column}'+
 '.gkd-alt{display:flex;gap:8px;align-items:center;min-height:44px;font-size:13px;flex-wrap:wrap;cursor:pointer}'+
 '.gkd-row.is-lock{opacity:.6}'+
 '.gkd-dup{padding:10px 12px;border-radius:8px;background:var(--warn-soft,#fdf1d8);color:var(--warn,#8a5a00);font-size:13px;display:flex;flex-direction:column;gap:6px}'+
 '.gkd-acts{display:flex;gap:8px;flex-wrap:wrap}'+
 '.gkd-root .btn[aria-pressed="true"]{border-color:var(--primary,#3359f2);background:var(--primary-soft,#e9eefb);color:var(--primary,#3359f2);font-weight:500}'+
 '.gkd-orig{padding:6px 12px;border-radius:8px;background:var(--surface-2,#edf0f5);display:flex;flex-direction:column;gap:2px}'+
 '.gkd-orig label{display:flex;gap:10px;align-items:center;min-height:44px;font-weight:500;cursor:pointer}'+
 '.gkd-others summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-size:13px;color:var(--muted,#596579)}'+
 '.gkd-others dl,.gkd-idt{display:grid;grid-template-columns:10em minmax(0,1fr);gap:4px 10px;font-size:12.5px;margin:0}'+
 '.gkd-others dd,.gkd-idt dd{margin:0;overflow-wrap:anywhere}.gkd-others dt{color:var(--muted,#596579)}'+
 '.gkd-room legend{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:0 4px;font-size:13px}'+
 '.gkd-cells{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px 10px}'+
 '.gkd-cell{display:flex;flex-direction:column;gap:2px;min-width:0;padding:2px}.gkd-cell label{font-size:12px;color:var(--muted,#596579)}'+
 '.gkd-idrow{display:grid;grid-template-columns:7em minmax(0,1fr) minmax(0,1fr) auto;gap:6px 12px;align-items:center;padding:10px 0;border-top:1px solid var(--line,#dfe4ec)}'+
 '.gkd-idrow:first-child{border-top:0}.gkd-idrow .cap{display:block}'+
 '.gkd-filled{outline:2px solid #d9a600!important;outline-offset:1px;background-color:#fffbe6!important}'+
 '.gkd-note{font-size:11.5px;color:var(--warn,#8a5a00)}'+
 '.gkd-bar{display:flex;gap:6px 12px;align-items:center;flex-wrap:wrap}.gkd-bar .hint,.gkd-bar .cap{font-size:12px;color:var(--muted,#596579)}'+
 'body.gkd-open{overflow:hidden}'+
 '@media (max-width:640px){'+
  '.gkd-root{padding:0}.gkd-dlg,.gkd-dlg.is-id{width:100%;height:100%;max-height:none;border-radius:0}'+
  '.gkd-head{padding:12px 16px 8px;padding-top:calc(12px + env(safe-area-inset-top,0px))}.gkd-body{padding:14px 16px}'+
  '.gkd-foot{padding:10px 16px;padding-bottom:calc(10px + env(safe-area-inset-bottom,0px))}.gkd-ask{padding:10px 16px 0}'+
  '.gkd-rv{grid-template-columns:minmax(0,1fr)}.gkd-pcol{position:static}'+
  '.gkd-ptoggle{display:inline-flex}.gkd-prev{display:none}.gkd-prev.open{display:block;margin-top:8px}'+
  '.gkd-f{grid-template-columns:minmax(0,1fr)}.gkd-cells{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}'+
  '.gkd-idrow{grid-template-columns:minmax(0,1fr) auto}.gkd-idrow>.gkd-idl{grid-column:1 / -1}'+
  '.gkd-others dl,.gkd-idt{grid-template-columns:minmax(0,1fr)}'+
  '.gkd-foot .btn{flex:1 1 auto;justify-content:center}'+
  '.gkd-root .btn,.gkd-root .act{min-height:44px}'+
  '.gkd-root select,.gkd-root input:not([type=checkbox]):not([type=radio]):not([type=file]){min-height:44px;font-size:16px}'+
 '}'+
 '@media (pointer:coarse){.gkd-root .btn,.gkd-root .act{min-height:44px}}';
function css(){if(q('gkd-css'))return;var s=document.createElement('style');s.id='gkd-css';s.textContent=CSS;(document.head||document.body).appendChild(s)}
function say(msg){var s=q('gkd-live');if(!s)return;s.textContent='';setTimeout(function(){if(s)s.textContent=msg},30)}
function size(n){n=+n||0;return n>=1048576?(n/1048576).toFixed(1)+' MB':n>=1024?Math.max(1,Math.round(n/1024))+' KB':n+' バイト'}
function kindLabel(f){return X&&X.mode==='id'?f.kind:KIND[f.kind]||'種類が未選択'}
function kindShort(f){return X&&X.mode==='id'?f.kind:SHORT[f.kind]||''}
function done(){return X?X.files.filter(function(f){return f.status==='done'&&f.kind}):[]}
function byFid(id){return X?X.files.filter(function(f){return f.id===id})[0]||null:null}

function start(opts,mode){
 if(X)close(true);
 css();
 var a=document.activeElement;
 X={mode:mode,opts:opts||{},kinds:mode==='id'?[]:((opts&&opts.kinds)||['apply','lease','guar']).filter(function(k){return KIND[k]}),files:[],screen:'files',dirty:false,seq:0,gen:1,
  ret:a&&a!==document.body?a:null,retId:a&&a.id||'',pv:0,prevOpen:false,orig:false,ed:{},red:{},dupChoice:'',msg:''};
 X.w=world(mode==='id'?{person:idPerson()}:X.opts.ctx);
 var root=document.createElement('div');root.id='gkd';root.className='gkd-root';
 root.innerHTML='<div class="gkd-scrim" data-gkd="scrim"></div><div class="gkd-dlg'+(mode==='id'?' is-id':'')+'" role="dialog" aria-modal="true" aria-labelledby="gkd-title" aria-describedby="gkd-demo">'+
  '<div class="gkd-head"><h2 id="gkd-title" tabindex="-1">'+(mode==='id'?'本人確認書類で確かめる':'書類から読み込む')+'</h2>'+
  '<p class="gkd-demo" id="gkd-demo">デモ版のため、読み取り結果は見本の値です（本番ではアップロードした書類の内容を読み取ります）</p></div>'+
  '<div class="gkd-body" id="gkd-body"></div><div class="gkd-ask" id="gkd-ask" hidden></div><div class="gkd-foot" id="gkd-foot"></div>'+
  '<p class="sr" id="gkd-live" role="status" aria-live="polite"></p></div>';
 document.body.appendChild(root);X.root=root;
 /* the page behind is not reachable while the dialog is open (keyboard and screen reader) */
 X.inert=[];[].slice.call(document.body.children||[]).forEach(function(c){if(c===root||/^(SCRIPT|STYLE|LINK)$/.test(c.tagName)||c.hasAttribute('inert'))return;c.setAttribute('inert','');X.inert.push(c)});
 if(document.body.classList)document.body.classList.add('gkd-open');
 root.addEventListener('click',onClick);root.addEventListener('input',onInput);root.addEventListener('change',onChange);root.addEventListener('keydown',onKey);
 root.addEventListener('dragover',onDrag);root.addEventListener('dragleave',onDrag);root.addEventListener('drop',onDrag);
 root.addEventListener('error',onImgErr,true);
 /* the page's own document listeners (Enter = 次へ, Esc = close the panel, data-* clicks) never see what happens in here */
 ['click','input','change','keydown','keyup','submit','dragover','drop'].forEach(function(t){root.addEventListener(t,function(e){e.stopPropagation()})});
 render();
 var p=root.querySelector('[data-gkd="pick"]');if(p)p.focus();
}
/* 機能の設定 (2026-10-19): an OFF feature never opens, whoever calls it (the pages do not draw the buttons either) */
function off(k){return typeof GK.can==='function'&&!GK.can(k)}
D.open=function(opts){if(off('doc.read'))return;try{start(opts,(opts&&opts.rows)?'rows':'fields')}catch(e){log(e);if(X)close(true)}};
D.idCheck=function(opts){if(off('doc.id'))return;try{start(opts,'id')}catch(e){log(e);if(X)close(true)}};
D.isOpen=function(){return !!X};
D.openKey=function(){return X?(X.mode==='id'?'doc.id':'doc.read'):''};
D.close=function(){close(true)};
D.idLabel=function(rec){return rec&&rec.date?'済み（'+GK.sd(rec.date)+' '+str(rec.by)+'）':'未確認'};

function close(force){
 if(!X)return;
 if(!force&&X.dirty){ask();return}
 clearTimeout(X.timer);X.gen++;
 X.files.forEach(function(f){if(f.url)try{URL.revokeObjectURL(f.url)}catch(e){}});
 X.inert.forEach(function(c){try{c.removeAttribute('inert')}catch(e){}});
 if(document.body.classList)document.body.classList.remove('gkd-open');
 try{X.root.remove()}catch(e){}
 var ret=X.ret,rid=X.retId;X=null;refocus(ret,rid);
}
function refocus(ret,rid){
 var el=ret&&document.body.contains(ret)?ret:rid?q(rid):null;
 if(el&&el.focus)try{el.focus()}catch(e){}
}
function ask(){
 var a=q('gkd-ask');if(!a)return;
 a.hidden=false;
 a.innerHTML='<div class="confirmbar" role="alertdialog" aria-labelledby="gkd-ask-m"><span id="gkd-ask-m">'+(X.mode==='id'?'本人確認を記録せずに閉じますか？':'読み取った内容を画面に入れずに閉じますか？')+'</span><span class="cb-acts"><button class="btn danger" type="button" data-gkd="askYes">'+(X.mode==='id'?'記録せずに閉じる':'入れずに閉じる')+'</button><button class="btn" type="button" data-gkd="askNo">続ける</button></span></div>';
 var n=a.querySelector('[data-gkd="askNo"]');if(n)n.focus();
}
function unask(){var a=q('gkd-ask');if(a&&!a.hidden){a.hidden=true;a.innerHTML='';return true}return false}

/* ---------- files ---------- */
var ACCEPT='.pdf,.jpg,.jpeg,.png,.heic,.heif,application/pdf,image/jpeg,image/png,image/heic,image/heif';
function addFiles(list){
 if(!X)return;
 var bad=[],add=0,arr=[].slice.call(list||[]);
 if(X.mode==='id')arr=arr.slice(0,1);
 arr.forEach(function(file){
  var name=str(file&&file.name)||'名前のないファイル',ext=((/\.([a-z0-9]+)$/i.exec(name)||[])[1]||'').toLowerCase(),mime=str(file&&file.type).toLowerCase();
  var pdf=ext==='pdf'||mime==='application/pdf',img=/^(jpe?g|png|heic|heif)$/.test(ext)||/^image\/(jpeg|png|heic|heif)$/.test(mime);
  if(!pdf&&!img){bad.push(name);return}
  if(X.mode==='id')X.files.splice(0).forEach(function(o){if(o.url)try{URL.revokeObjectURL(o.url)}catch(e){}});
  var f={id:++X.seq,name:name,size:+(file&&file.size)||0,pdf:pdf,kind:'',note:'',status:'need',url:''};
  if(X.mode==='id')f.kind=detectId(name);
  else{var k=detect(name);if(k&&X.kinds.indexOf(k)>=0)f.kind=k;else if(k&&k!=='id'&&KIND[k])f.note='ファイル名からは「'+KIND[k]+'」に見えますが、この画面では使えません。';else if(k==='id')f.note='本人確認書類は「本人確認書類で確かめる」から使います。'}
  if(!pdf&&typeof URL!=='undefined'&&URL.createObjectURL)try{f.url=URL.createObjectURL(file)}catch(e){f.url=''}
  if(f.kind)f.status='wait';
  X.files.push(f);add++;
 });
 X.msg=bad.length?bad.join('、')+' は読めない形式です。PDF・JPG・PNG・HEIC のファイルを選んでください。':'';
 render();
 /* focus: the first new file whose 種類 still has to be chosen, otherwise 「ファイルを選ぶ」 again */
 var need=X.files.filter(function(f){return f.status==='need'}).pop(),fe=need?q('gkd-k-'+need.id):q('gkd-pick');if(fe)try{fe.focus()}catch(e){}
 if(add)say(add+'件の書類を追加しました'+(need?'。書類の種類を選んでください':''));
 pump();
}
function pump(){
 if(!X||X.busy)return;
 var f=X.files.filter(function(x){return x.status==='wait'})[0];
 if(!f){refreshFiles();return}
 X.busy=f.id;f.status='reading';refreshFiles();say(f.name+' を読み取り中…');
 var gen=X.gen;
 X.timer=setTimeout(function(){
  if(!X||X.gen!==gen)return;
  X.busy=null;var c=byFid(f.id);
  if(c&&c.status==='reading'){
   var r=X.mode==='id'?sim('id',X.w):sim(c.kind,X.w,0,X.mode);
   c.count=r.rows?r.rows.length:Object.keys(r.v).length;c.unit=r.rows?'部屋':'項目';c.status='done';
   say(c.name+'：読み取りました（'+c.count+c.unit+'）');
  }
  pump();
 },800);
}
function fileLi(f){
 var opts=X.mode==='id'?IDTYPES.map(function(t){return [t,t]}):X.kinds.map(function(k){return [k,KIND[k]]});
 var st=f.status==='need'?'<span class="pill">種類を選ぶと読み取ります</span>':f.status==='wait'?'<span class="pill">読み取りの順番待ち</span>':f.status==='reading'?'<span class="pill info">読み取り中…</span>':
  '<span class="pill ok">読み取りました（'+f.count+(f.unit||'項目')+'）</span>';
 return '<li class="gkd-f" id="gkd-f-'+f.id+'"><div class="gkd-fn"><b>'+esc(f.name)+'</b><span class="cap">'+(f.pdf?'PDF':'写真')+' · '+size(f.size)+' · ページ数 '+(f.pdf?'—':'1')+'</span></div>'+
  '<div class="gkd-fk"><label for="gkd-k-'+f.id+'">書類の種類</label><select id="gkd-k-'+f.id+'" data-gkd-kind="'+f.id+'"><option value="">種類を選んでください</option>'+
  opts.map(function(o){return '<option value="'+esc(o[0])+'"'+(o[0]===f.kind?' selected':'')+'>'+esc(o[1])+'</option>'}).join('')+'</select>'+(f.note?'<span class="cap">'+esc(f.note)+'</span>':'')+'</div>'+
  '<div class="gkd-fs">'+st+'</div><button class="btn ghost" type="button" data-gkd-rm="'+f.id+'" aria-label="'+esc(f.name)+' を外す">外す</button></li>';
}
function filesHtml(){
 var h='<p class="gkd-lead">'+(X.opts.lead?esc(X.opts.lead)+'<br>':'')+(X.mode==='id'?'本人確認書類（運転免許証・マイナンバーカード・パスポートなど）の氏名・住所・生年月日を読み取り、入力した内容と見比べます。補助の確認です。':
  'この画面で読める書類：'+esc(X.kinds.map(function(k){return KIND[k]}).join('・')))+'</p>';
 if(X.mode==='id')h+='<p class="note">番号や顔写真は読み取らず、保存もしません。記録するのは「本人確認：書類の種類で確認（日付・担当）」だけです。</p>';
 h+='<div class="gkd-drop" id="gkd-drop"><p><b>ここに書類のファイルを置く</b>か、ボタンから選びます</p><button class="btn primary" type="button" id="gkd-pick" data-gkd="pick">ファイルを選ぶ</button>'+
  '<input type="file" id="gkd-file" class="gkd-file"'+(X.mode==='id'?'':' multiple')+' accept="'+ACCEPT+'" tabindex="-1" aria-hidden="true">'+
  '<p class="cap">PDF・JPG・PNG・HEIC'+(X.mode==='id'?'（1枚）':'（いくつでも）')+'。スマホで撮った写真もそのまま使えます</p></div>';
 if(X.msg)h+='<p class="err" role="alert">'+esc(X.msg)+'</p>';
 h+='<ul class="gkd-flist" id="gkd-flist" aria-label="選んだ書類">'+X.files.map(fileLi).join('')+'</ul>';
 return h;
}
function filesFoot(){
 var ready=done().length>0,busy=X.files.some(function(f){return f.status==='wait'||f.status==='reading'}),need=X.files.some(function(f){return f.status==='need'});
 return '<button class="btn primary" type="button" data-gkd="review"'+(ready&&!busy?'':' disabled')+'>読み取った内容を確かめる</button><button class="btn" type="button" data-gkd="cancel">やめる</button>'+
  '<span class="cap">'+(busy?'読み取りが終わると押せます':need?'種類を選んでいない書類は読み取りません':!ready?'書類を選ぶと、読み取った内容を確かめられます':'')+'</span>';
}
function refreshFiles(){
 if(!X||X.screen!=='files')return;
 keepFocus(function(){var l=q('gkd-flist');if(l)l.innerHTML=X.files.map(fileLi).join('');var f=q('gkd-foot');if(f)f.innerHTML=filesFoot()});
}
function keepFocus(fn){var a=document.activeElement,id=a&&a.id;fn();if(id){var n=q(id);if(n&&n!==a)try{n.focus()}catch(e){}}}

/* ---------- review: fields ---------- */
function results(){var lj=0;return done().map(function(f){var j=f.kind==='lease'?lj++:0;return {f:f,r:sim(f.kind,X.w,j,X.mode)}})}
function buildFields(){
 var R=results(),flds=X.opts.fields||[],used={},first={},rows=[];
 R.forEach(function(x){Object.keys(x.r.v).forEach(function(k){if(!(k in first))first[k]=x.r.v[k]})});
 flds.forEach(function(fd,i){
  var dk=fd.doc,keys=[dk].concat(ALIAS[dk]||[]),m=META[dk]||['','','text'],type=fd.type||m[2],vals=[],low=null;
  keys.forEach(function(k){used[k]=1});if(dk==='emLabel'){used.emName=1;used.emRel=1}
  R.forEach(function(x){
   var v=null,ak='';for(var a=0;a<keys.length;a++){if(keys[a] in x.r.v){v=x.r.v[keys[a]];ak=keys[a];break}}
   if(v==null)return;
   var hit=vals.filter(function(y){return same(type,y.v,v)})[0];
   if(hit)hit.src.push(x.f);else vals.push({v:v,src:[x.f]});
   if(x.r.low[ak]&&!low)low={why:x.r.low[ak],f:x.f};
  });
  if(!vals.length)return;
  var cur;try{cur=typeof fd.cur==='function'?fd.cur(first):fd.cur}catch(e){cur=''}
  rows.push({i:i,fd:fd,type:type,group:fd.group||m[1],label:fd.label||m[0],vals:vals,low:low,cur:str(cur),check:!!fd.check});
 });
 var others=[];
 R.forEach(function(x){Object.keys(x.r.v).forEach(function(k){if(used[k]||k==='emLabel'||!META[k])return;if(others.some(function(o){return o.k===k&&same(META[k][2],o.v,x.r.v[k])}))return;others.push({k:k,v:x.r.v[k],f:x.f})})});
 rows.forEach(function(r){
  var sig=JSON.stringify(r.vals.map(function(x){return ckey(r.type,x.v)})),e=X.ed[r.i];
  if(!e||e.sig!==sig){var k=bestPick(r.vals,r.group==='保証会社'),v=toIn(r.type,r.vals[k].v);X.ed[r.i]={sig:sig,pick:k,v:v,chk:empty(r.type,r.cur)||same(r.type,r.cur,v)}}
 });
 X.model={rows:rows,others:others,first:first,n:R.length};
 /* the same person already registered? (name + フリガナ, or the phone number) */
 X.dup=null;
 if(X.opts.dup!==false&&rows.some(function(r){return r.fd.doc==='name'&&!r.check})){
  var pn=ckey('text',first.name),pk=ckey('text',first.kana),pt=ckey('tel',first.tel);
  var list=X.opts.people||defaultPeople(),self=X.opts.selfId;
  var hit=list.filter(function(p){if(p.id===self)return false;var a=pn&&pk&&ckey('text',p.n)===pn&&ckey('text',p.k)===pk,b=pt.length>=10&&ckey('tel',p.tel)===pt;return a||b})[0];
  if(hit){X.dup=hit;X.dupUsable=typeof X.opts.canUse==='function'?!!X.opts.canUse(hit.id):true}
 }
 if(!X.dup||!X.dupUsable)X.dupChoice=X.dup&&X.dupChoice==='new'?'new':'';
}
/* documents disagree: preselect the binding one — 賃貸借契約書, then (保証会社の欄) 保証会社の契約書, then 入居申込書, then the rest */
function rankOf(kind,gua){return kind==='lease'?0:kind==='guar'?(gua?1:3):kind==='apply'?2:4}
function bestPick(vals,gua){var b=0,br=99;vals.forEach(function(x,k){var r=Math.min.apply(null,x.src.map(function(f){return rankOf(f.kind,gua)}));if(r<br){br=r;b=k}});return b}
function defaultPeople(){
 var db=GK.db;
 return (db.tenants||[]).map(function(t){
  var ls=(db.leases||[]).filter(function(l){return l.tenant===t.id}).sort(function(a,b){return a.start<b.start?1:-1});
  var l=ls.filter(function(a){return a.status==='有効'})[0]||ls.filter(function(a){return a.status==='申込中'||a.status==='入居予定'})[0]||ls[0];
  var st=!l?'':l.status==='有効'?(l.notice?'退去予定':'入居中'):l.status==='終了'?'旧入居者':String(l.status).indexOf('取消')===0?'申込取消':l.status;
  return {id:t.id,n:t.n,k:t.k||'',tel:t.tel||'',where:l?GK.roomLabel(l.unit)+'・'+st:'部屋なし'};
 });
}
function locked(r){return X.dupChoice==='use'&&(r.group==='入居者'||r.group==='緊急連絡先')}
function srcText(r){return r.vals.length>1?'':'<span class="cap"> · '+esc(r.vals[0].src.map(kindShort).join('・'))+'から</span>'}
function inputHtml(id,type,v,attr){
 attr=(attr||'')+' autocomplete="off"';
 if(type==='pay'){var o=[];for(var d=1;d<=28;d++)o.push([String(d),d+'日']);if(v&&+v>28&&+v<31)o.push([v,v+'日']);o.push(['31','末日']);
  return '<select id="'+id+'"'+attr+'><option value="">（なし）</option>'+o.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===str(v)?' selected':'')+'>'+x[1]+'</option>'}).join('')+'</select>'}
 var t=type==='date'?'date':type==='tel'?'tel':type==='email'?'email':'text',im=type==='yen'||type==='year'?' inputmode="numeric"':type==='area'?' inputmode="decimal"':type==='tel'?' inputmode="tel"':'';
 return '<input id="'+id+'" type="'+t+'"'+im+' value="'+esc(v)+'"'+attr+'>';
}
function rowHtml(r){
 if(r.check){
  var ok=r.vals.length===1&&same(r.type,r.cur,r.vals[0].v),none=empty(r.type,r.cur);
  return '<div class="gkd-row" id="gkd-row-'+r.i+'"><div class="gkd-main"><div class="gkd-rh"><span class="gkd-lab">'+esc(r.label)+'</span>'+(none?'<span class="pill">比べるものがありません</span>':ok?'<span class="pill ok">✓ 一致</span>':'<span class="pill danger">違い</span>')+'</div>'+
   '<div>書類：<b>'+r.vals.map(function(x){return esc(show(r.type,x.v))}).join(' / ')+'</b>'+srcText(r)+'</div><div class="gkd-cur">この画面：'+(none?'空欄':'<b>'+esc(show(r.type,r.cur))+'</b>')+'</div></div></div>';
 }
 var e=X.ed[r.i],id='gkd-v-'+r.i,lk=locked(r),diff=!empty(r.type,r.cur)&&!same(r.type,r.cur,e.v),multi=r.vals.length>1;
 var h='<div class="gkd-row'+(r.low?' is-low':'')+(diff?' is-diff':'')+(lk?' is-lock':'')+'" id="gkd-row-'+r.i+'"><div class="gkd-main"><div class="gkd-rh"><label class="gkd-lab" for="'+id+'">'+esc(r.label)+'</label>'+
  (r.low?'<span class="pill warn">要確認</span><span class="gkd-why" id="gkd-why-'+r.i+'">'+esc(r.low.why)+'（'+esc(kindShort(r.low.f))+'）</span>':'')+
  (multi?'<span class="pill info">書類によって違います</span>':'')+'<span id="gkd-d-'+r.i+'">'+(diff?'<span class="pill danger">違い</span>':'')+'</span></div>';
 if(multi)h+='<div class="gkd-alts" role="radiogroup" aria-label="'+esc(r.label)+'：使う値を選ぶ">'+r.vals.map(function(x,k){return '<label class="gkd-alt"><input type="radio" name="gkd-a-'+r.i+'" data-gkd-alt="'+r.i+':'+k+'"'+(e.pick===k?' checked':'')+(lk?' disabled':'')+'><span>'+esc(show(r.type,x.v))+'</span><span class="cap">（'+esc(x.src.map(kindShort).join('・'))+'）</span></label>'}).join('')+'</div>';
 h+=inputHtml(id,r.type,e.v,' data-gkd-v="'+r.i+'"'+(r.low?' aria-describedby="gkd-why-'+r.i+'"':'')+(lk?' disabled':''));
 h+='<div class="gkd-cur" id="gkd-c-'+r.i+'">'+(empty(r.type,r.cur)?'今の入力：空欄':'今の入力：<b>'+esc(show(r.type,r.cur))+'</b>')+srcText(r)+'</div></div>';
 h+=lk?'<p class="cap">登録済みの人を使うので入れません</p>':'<label class="gkd-chk"><input type="checkbox" data-gkd-chk="'+r.i+'"'+(e.chk?' checked':'')+'><span><span class="sr">'+esc(r.label)+'を</span>反映する</span></label>';
 return h+'</div>';
}
function dupHtml(){
 var p=X.dup;if(!p)return '';var c=X.dupChoice;
 return '<div class="gkd-dup" role="group" aria-labelledby="gkd-dup-t"><p id="gkd-dup-t"><b>同じ人が登録済みです：</b>'+esc(p.n)+'（'+esc(p.where||'')+'）</p>'+
  (X.dupUsable?'<div class="gkd-acts"><button class="btn" type="button" data-gkd="dupUse" aria-pressed="'+(c==='use')+'">この人を使う</button><button class="btn" type="button" data-gkd="dupNew" aria-pressed="'+(c==='new')+'">新しく登録する</button></div>'+
   '<p class="cap">'+(c==='use'?'「反映」で登録済みの人を選びます。入居者と緊急連絡先の欄は入れません（二重に登録されません）。':c==='new'?'別の人として新しく登録します。':'名前とフリガナ、または電話番号が同じです。どちらか選んでください（選ばなければ新しく登録します）。')+'</p>':
   '<p class="cap">'+esc(X.opts.cantUseWhy||'この人は今ほかの部屋で契約中のため、ここでは選べません。同じ人なら、先に今の契約を確かめてください。')+'</p>')+'</div>';
}
function previewHtml(rowsMode){
 var fs=done();if(!fs.length)return '';
 if(X.pv>=fs.length)X.pv=0;var cur=fs[X.pv];
 var h='<div class="gkd-pcol"><button class="btn gkd-ptoggle" type="button" data-gkd="ptoggle" aria-expanded="'+X.prevOpen+'" aria-controls="gkd-prev">'+(X.prevOpen?'書類の画像を隠す':'書類の画像を見る（'+fs.length+'件）')+'</button>'+
  '<div class="gkd-prev'+(X.prevOpen?' open':'')+'" id="gkd-prev">';
 if(fs.length>1)h+='<div class="gkd-ptabs" role="group" aria-label="表示する書類">'+fs.map(function(f,k){return '<button type="button" class="act" data-gkd-pv="'+k+'" aria-pressed="'+(k===X.pv)+'">'+(k+1)+'. '+esc(kindShort(f))+'</button>'}).join('')+'</div>';
 h+='<figure class="gkd-fig">'+(cur.url&&!cur.broken?'<img src="'+esc(cur.url)+'" alt="'+esc(kindLabel(cur)+'：'+cur.name)+'" data-gkd-img="'+cur.id+'">':
  '<div class="gkd-page" role="img" aria-label="'+esc(kindLabel(cur)+'：'+cur.name)+'"><b>'+esc(kindLabel(cur))+'</b><span>'+esc(cur.name)+'</span><span class="cap">'+(cur.pdf?'PDFの1ページ目':'この写真は画面に表示できません（HEIC など）。原本で確かめてください')+'</span></div>')+
  '<figcaption class="cap">'+esc(cur.name)+(rowsMode?'':'　左の書類と右の値を見比べてください')+'</figcaption></figure></div></div>';
 return h;
}
function origHtml(){
 return '<div class="gkd-orig"><label><input type="checkbox" id="gkd-orig"'+(X.orig?' checked':'')+' aria-describedby="gkd-orig-e">原本と見比べて確かめました</label><p class="err" id="gkd-orig-e" role="alert"></p></div>';
}
function reviewHtml(){
 var M=X.model,n=M.rows.filter(function(r){return !r.check}).length;
 var h='<h3 id="gkd-rh" tabindex="-1">読み取った内容を確かめる</h3>';
 h+='<div class="gkd-rv">'+previewHtml()+'<div class="gkd-fields">'+dupHtml();
 h+='<p class="gkd-lead">'+M.n+'件の書類から、この画面に入れられる '+n+'項目を読み取りました。チェックした項目だけ入れます。<br>黄色＝要確認（読みにくい所）・「違い」＝今の入力と違う（チェックを外すと今の入力を残します）</p>';
 if(!M.rows.length)h+='<p class="note">この画面に入れられる項目はありませんでした。書類の種類を確かめてください。</p>';
 var gs=GROUPS.slice();M.rows.forEach(function(r){if(gs.indexOf(r.group)<0)gs.push(r.group)});
 gs.forEach(function(g){var rs=M.rows.filter(function(r){return r.group===g});if(!rs.length)return;h+='<fieldset class="gkd-grp"><legend>'+esc(g)+'</legend>'+rs.map(rowHtml).join('')+'</fieldset>'});
 if(M.others.length)h+='<details class="gkd-others"><summary>この画面に入れる欄がない項目（'+M.others.length+'）</summary><dl>'+M.others.map(function(o){return '<dt>'+esc(META[o.k][0])+'</dt><dd>'+esc(show(META[o.k][2],o.v))+' <span class="cap">（'+esc(kindShort(o.f))+'）</span></dd>'}).join('')+'</dl></details>';
 return h+'</div></div>'+origHtml();
}
function updRow(i){
 var r=X.model&&X.model.rows.filter(function(x){return x.i===i})[0];if(!r||r.check)return;
 var e=X.ed[i],diff=!empty(r.type,r.cur)&&!same(r.type,r.cur,e.v),row=q('gkd-row-'+i),d=q('gkd-d-'+i);
 if(row&&row.classList)row.classList[diff?'add':'remove']('is-diff');
 if(d)d.innerHTML=diff?'<span class="pill danger">違い</span>':'';
}

/* ---------- review: rows (入居者名簿 / 契約書 -> the room table) ---------- */
function curRows(){var m={};((X.opts.rows&&X.opts.rows.cur)||[]).forEach(function(r){var n=normNo(r&&r.no);if(n&&!m[n])m[n]=r});return m}
function buildRows(){
 var R=results(),map={},order=[],cm=curRows();
 R.forEach(function(x){(x.r.rows||[]).forEach(function(row,ri){
  var no=normNo(row.no);if(!no)return;
  var m=map[no];if(!m){m=map[no]={no:no,cells:{}};order.push(no)}
  COLS.forEach(function(c){
   var k=c[0],v=row[k];if(v==null||(str(v)===''&&k!=='ten'))return;
   var cell=m.cells[k]||(m.cells[k]={vals:[],low:null}),hit=cell.vals.filter(function(y){return same(c[2],y.v,v)})[0];
   if(hit)hit.src.push(x.f);else cell.vals.push({v:v,src:[x.f]});
   var lw=x.r.lowRows&&x.r.lowRows[ri]&&x.r.lowRows[ri][k];if(lw&&!cell.low)cell.low={why:lw,f:x.f};
  });
 })});
 var rooms=order.map(function(no){
  var m=map[no],cur=cm[no]||null,sig=JSON.stringify(m.cells),e=X.red[no];
  if(!e||e.sig!==sig){
   e=X.red[no]={sig:sig,cells:{}};
   COLS.forEach(function(c){var cell=m.cells[c[0]];if(cell){var k=bestPick(cell.vals,c[0]==='gua');e.cells[c[0]]={pick:k,v:toIn(c[2],cell.vals[k].v)}}});
   e.chk=!roomDiff(m,cur,e);
  }
  return {no:no,cells:m.cells,cur:cur};
 });
 X.model={rooms:rooms,n:R.length};
}
function cellDiff(c,cur,v){var cv=cur?str(cur[c[0]]):'';return !empty(c[2],cv)&&!same(c[2],cv,v)}
function roomDiff(m,cur,e){if(!cur)return false;return COLS.some(function(c){return e.cells[c[0]]&&cellDiff(c,cur,e.cells[c[0]].v)})}
function cellShow(c,v){return c[0]==='ten'&&!str(v).trim()?'空室':show(c[2],v)}
function roomHtml(rm,j){
 var e=X.red[rm.no],diff=roomDiff(rm,rm.cur,e),allSame=rm.cur&&COLS.every(function(c){return !e.cells[c[0]]||same(c[2],rm.cur[c[0]],e.cells[c[0]].v)});
 var tag=!rm.cur?'<span class="pill info">新しく追加</span>':diff?'<span class="pill danger">今の内容と違う項目あり</span>':allSame?'<span class="pill ok">今と同じ</span>':'<span class="pill">足りない項目を入れる</span>';
 var h='<fieldset class="gkd-room" id="gkd-room-'+j+'"><legend><label class="gkd-chk"><input type="checkbox" data-gkd-rc="'+j+'"'+(e.chk?' checked':'')+'><span>'+esc(rm.no)+' 号室を反映する</span></label><span id="gkd-rt-'+j+'">'+tag+'</span></legend><div class="gkd-cells">';
 COLS.forEach(function(c,ci){
  var cell=rm.cells[c[0]];if(!cell)return;
  var ce=e.cells[c[0]],id='gkd-r-'+j+'-'+ci,d=cellDiff(c,rm.cur,ce.v),multi=cell.vals.length>1,cv=rm.cur?str(rm.cur[c[0]]):'';
  h+='<div class="gkd-cell'+(cell.low?' is-low':'')+(d?' is-diff':'')+'" id="gkd-cl-'+j+'-'+ci+'"><label for="'+id+'">'+esc(c[1])+(cell.low?' <span class="pill warn">要確認</span>':'')+(multi?' <span class="pill info">書類によって違います</span>':'')+'</label>';
  if(multi)h+='<div class="gkd-alts" role="radiogroup" aria-label="'+esc(rm.no+' '+c[1])+'：使う値を選ぶ">'+cell.vals.map(function(x,k){return '<label class="gkd-alt"><input type="radio" name="gkd-ra-'+j+'-'+ci+'" data-gkd-ralt="'+j+':'+ci+':'+k+'"'+(ce.pick===k?' checked':'')+'><span>'+esc(cellShow(c,x.v))+'</span><span class="cap">（'+esc(x.src.map(kindShort).join('・'))+'）</span></label>'}).join('')+'</div>';
  h+=c[0]==='ten'&&!str(ce.v).trim()&&!multi?'<input id="'+id+'" type="text" value="" placeholder="空室" data-gkd-rv="'+j+':'+ci+'" autocomplete="off">':inputHtml(id,c[2],ce.v,' data-gkd-rv="'+j+':'+ci+'"'+(cell.low?' aria-describedby="gkd-rw-'+j+'-'+ci+'"':''));
  if(cell.low)h+='<span class="gkd-why" id="gkd-rw-'+j+'-'+ci+'">'+esc(cell.low.why)+'</span>';
  if(rm.cur)h+='<span class="gkd-cur" id="gkd-rc-'+j+'-'+ci+'">今：'+(empty(c[2],cv)?(c[0]==='ten'?'空室':'空欄'):'<b>'+esc(show(c[2],cv))+'</b>')+(d?' <span class="pill danger">違い</span>':'')+'</span>';
  h+='</div>';
 });
 return h+'</div></fieldset>';
}
function rowsReviewHtml(){
 var M=X.model,nw=M.rooms.filter(function(r){return !r.cur}).length,up=M.rooms.length-nw;
 var h='<h3 id="gkd-rh" tabindex="-1">読み取った内容を確かめる</h3><div class="gkd-rv is-rows">'+previewHtml(true)+'<div class="gkd-fields">';
 h+='<p class="gkd-lead">'+M.n+'件の書類から '+M.rooms.length+'部屋を読み取りました（新しく追加 '+nw+'・今の表にある部屋 '+up+'）。チェックした部屋だけ表に入れます。同じ部屋番号は、読み取った項目で上書きします（読み取れなかった項目は今のまま）。<br>黄色＝要確認・「違い」＝今の表と違う（その部屋はチェックを外してあります）</p>';
 if(!M.rooms.length)h+='<p class="note">部屋を読み取れませんでした。書類の種類を確かめてください。</p>';
 else h+='<div class="gkd-acts"><button class="act" type="button" data-gkd="rall">すべての部屋にチェック</button><button class="act" type="button" data-gkd="rnone">すべて外す</button></div>';
 h+=M.rooms.map(roomHtml).join('');
 return h+'</div></div>'+origHtml();
}
function updRoom(j){
 var rm=X.model.rooms[j];if(!rm)return;var e=X.red[rm.no];
 COLS.forEach(function(c,ci){
  var ce=e.cells[c[0]];if(!ce)return;var d=cellDiff(c,rm.cur,ce.v),el=q('gkd-cl-'+j+'-'+ci),cu=q('gkd-rc-'+j+'-'+ci);
  if(el&&el.classList)el.classList[d?'add':'remove']('is-diff');
  if(cu){var cv=str(rm.cur[c[0]]);cu.innerHTML='今：'+(empty(c[2],cv)?(c[0]==='ten'?'空室':'空欄'):'<b>'+esc(show(c[2],cv))+'</b>')+(d?' <span class="pill danger">違い</span>':'')}
 });
}

/* ---------- review: 本人確認 ---------- */
function idBase(){
 var o=(X&&X.opts)||{},P=o.person||{},r=D._recent||{},n=str(P.n).trim(),same_=!n||!r.name||ckey('text',r.name)===ckey('text',n);
 return {n:n,addr:str(P.addr).trim()||(same_?str(r.addr):''),birth:str(P.birth).trim()||(same_?str(r.birth):''),
  addrSrc:str(P.addr).trim()?'この画面':'申込書（読み取り）',birthSrc:str(P.birth).trim()?'この画面':'申込書（読み取り）'};
}
/* the simulated ID shows the person's details as the 申込書 read on this page gives them (else as entered), so an
   address typed differently from the application shows 違い */
function idPerson(){
 var b=idBase(),r=D._recent||{},sp=!b.n||!r.name||ckey('text',r.name)===ckey('text',b.n);
 return {n:b.n,addr:sp&&r.addr?r.addr:b.addr,birth:sp&&r.birth?r.birth:b.birth};
}
function idReviewHtml(){
 var f=done()[0],r=sim('id',X.w),b=idBase(),v=r.v;
 var items=[['氏名',v.idName,b.n,'この画面','text'],['住所',v.idAddr,b.addr,b.addrSrc,'text'],['生年月日',v.idBirth,b.birth,b.birthSrc,'date']];
 X.idDiff=false;X.idDiffItems=[];
 var h='<h3 id="gkd-rh" tabindex="-1">本人確認書類と見比べる</h3><div class="gkd-rv">'+previewHtml()+'<div class="gkd-fields">';
 h+='<dl class="gkd-idt"><dt>書類の種類</dt><dd>'+esc(f.kind)+'</dd></dl><div>';
 items.forEach(function(it){
  var none=empty(it[4],it[2]),ok=!none&&same(it[4],it[1],it[2]);if(!none&&!ok){X.idDiff=true;X.idDiffItems.push(it[0])}
  var low=r.low[{'氏名':'idName','住所':'idAddr','生年月日':'idBirth'}[it[0]]];
  h+='<div class="gkd-idrow'+(low?' is-low':'')+'"><span class="gkd-idl gkd-lab">'+it[0]+(low?' <span class="pill warn">要確認</span> <span class="gkd-why">'+esc(low)+'</span>':'')+'</span>'+
   '<span><span class="cap">本人確認書類</span>'+esc(show(it[4],it[1]))+'</span><span><span class="cap">'+(none?'比べる相手':esc(it[3]))+'</span>'+(none?'入力なし':esc(show(it[4],it[2])))+'</span>'+
   (none?'<span class="pill">比べるものがありません</span>':ok?'<span class="pill ok">✓ 一致</span>':'<span class="pill danger">違い</span>')+'</div>';
 });
 h+='</div>'+(X.idDiff?'<p class="warnbox">違う項目があります（'+esc(X.idDiffItems.join('・'))+'）。原本と入力を見直してください（引っ越しなどで住所が変わっていることもあります）。</p>':'')+
  '<p class="note">番号や顔写真は読み取らず、保存もしません。記録するのは「本人確認：'+esc(f.kind)+'で確認（日付・担当）」だけです。</p></div></div>'+origHtml();
 /* with 違い the record is still allowed, after one more tick; the log says what differed */
 if(X.idDiff)h+='<div class="gkd-orig"><label><input type="checkbox" id="gkd-diffok"'+(X.idDiffOk?' checked':'')+' aria-describedby="gkd-diffok-e">違いを確かめたうえで記録する</label><p class="err" id="gkd-diffok-e" role="alert"></p></div>';
 return h;
}

/* ---------- render / events ---------- */
function render(){
 if(!X)return;
 var b=q('gkd-body'),f=q('gkd-foot');
 if(X.screen==='files'){b.innerHTML=filesHtml();f.innerHTML=filesFoot();return}
 b.innerHTML=X.mode==='id'?idReviewHtml():X.mode==='rows'?rowsReviewHtml():reviewHtml();
 f.innerHTML='<button class="btn" type="button" data-gkd="back">‹ 書類を足す・変える</button><span class="gkd-sp"></span>'+
  (X.mode==='id'?'<button class="btn primary" type="button" data-gkd="record">確認済みとして記録</button>':'<button class="btn primary" type="button" data-gkd="apply">チェックした項目を反映</button>')+
  '<button class="btn" type="button" data-gkd="cancel">やめる</button><p class="err" id="gkd-apply-e" role="alert"></p>';
}
function toReview(){
 if(!done().length)return;
 X.screen='review';X.idDiffOk=false;
 if(X.mode==='fields')buildFields();else if(X.mode==='rows')buildRows();
 render();var h=q('gkd-rh');if(h)h.focus();
}
function err(id,msg){var e=q(id);if(e)e.textContent=msg}
function onClick(e){
 if(!X)return;
 var t=e.target&&e.target.closest?e.target.closest('[data-gkd],[data-gkd-rm],[data-gkd-pv]'):null;if(!t)return;
 var a=t.getAttribute('data-gkd');
 if(t.hasAttribute('data-gkd-rm')){
  var id=+t.getAttribute('data-gkd-rm'),f=byFid(id);if(!f)return;
  if(f.url)try{URL.revokeObjectURL(f.url)}catch(x){}
  X.files=X.files.filter(function(x){return x.id!==id});render();say(f.name+' を外しました');
  var p=X.root.querySelector('[data-gkd="pick"]');if(p)p.focus();pump();return;
 }
 if(t.hasAttribute('data-gkd-pv')){X.pv=+t.getAttribute('data-gkd-pv');var pc=X.root.querySelector('.gkd-pcol');if(pc){pc.outerHTML=previewHtml(X.mode==='rows');var nb=X.root.querySelector('[data-gkd-pv="'+X.pv+'"]');if(nb)nb.focus()}return}
 if(a==='pick'){var fi=q('gkd-file');if(fi)fi.click();return}
 if(a==='scrim'||a==='cancel'){close();return}
 if(a==='askYes'){close(true);return}
 if(a==='askNo'){unask();var c=X.root.querySelector('[data-gkd="cancel"]');if(c)c.focus();return}
 if(a==='review'){if(!t.disabled)toReview();return}
 if(a==='back'){X.screen='files';render();var pk=X.root.querySelector('[data-gkd="pick"]');if(pk)pk.focus();return}
 if(a==='ptoggle'){X.prevOpen=!X.prevOpen;var pv=q('gkd-prev');if(pv&&pv.classList)pv.classList[X.prevOpen?'add':'remove']('open');t.setAttribute('aria-expanded',String(X.prevOpen));t.textContent=X.prevOpen?'書類の画像を隠す':'書類の画像を見る（'+done().length+'件）';return}
 if(a==='dupUse'||a==='dupNew'){
  X.dupChoice=a==='dupUse'?'use':'new';X.dirty=true;
  var bd=q('gkd-body'),sc=bd?bd.scrollTop:0;render();bd=q('gkd-body');if(bd)bd.scrollTop=sc;
  var nb2=X.root.querySelector('[data-gkd="'+a+'"]');if(nb2)nb2.focus();return;
 }
 if(a==='rall'||a==='rnone'){X.model.rooms.forEach(function(rm,j){X.red[rm.no].chk=a==='rall';var cb=X.root.querySelector('[data-gkd-rc="'+j+'"]');if(cb)cb.checked=a==='rall'});X.dirty=true;return}
 if(a==='apply'){X.mode==='rows'?applyRows():applyFields();return}
 if(a==='record'){record();return}
}
function onInput(e){
 if(!X)return;var t=e.target;if(!t||!t.getAttribute)return;
 var v=t.getAttribute('data-gkd-v');
 if(v!=null){var ed=X.ed[+v];if(ed){ed.v=t.value;X.dirty=true;updRow(+v)}return}
 var rv=t.getAttribute('data-gkd-rv');
 if(rv!=null){var p=rv.split(':'),rm=X.model.rooms[+p[0]],c=COLS[+p[1]];if(rm&&c){X.red[rm.no].cells[c[0]].v=t.value;X.dirty=true;updRoom(+p[0])}return}
}
function onChange(e){
 if(!X)return;var t=e.target;if(!t||!t.getAttribute)return;
 if(t.id==='gkd-file'){addFiles(t.files);try{t.value=''}catch(x){}return}
 if(t.id==='gkd-orig'){X.orig=!!t.checked;if(X.orig)err('gkd-orig-e','');return}
 if(t.id==='gkd-diffok'){X.idDiffOk=!!t.checked;X.dirty=true;if(X.idDiffOk)err('gkd-diffok-e','');return}
 var k=t.getAttribute('data-gkd-kind');
 if(k!=null){var f=byFid(+k);if(f){f.kind=t.value;f.note='';f.status=f.kind?'wait':'need';refreshFiles();pump()}return}
 var c=t.getAttribute('data-gkd-chk');if(c!=null){var ed=X.ed[+c];if(ed){ed.chk=!!t.checked;X.dirty=true;err('gkd-apply-e','')}return}
 var al=t.getAttribute('data-gkd-alt');
 if(al!=null){var p=al.split(':'),i=+p[0],r=X.model.rows.filter(function(x){return x.i===i})[0];if(!r)return;var e2=X.ed[i];e2.pick=+p[1];e2.v=toIn(r.type,r.vals[e2.pick].v);var inp=q('gkd-v-'+i);if(inp)inp.value=e2.v;X.dirty=true;updRow(i);return}
 var rc=t.getAttribute('data-gkd-rc');if(rc!=null){var rm=X.model.rooms[+rc];if(rm){X.red[rm.no].chk=!!t.checked;X.dirty=true;err('gkd-apply-e','')}return}
 var ra=t.getAttribute('data-gkd-ralt');
 if(ra!=null){var s=ra.split(':'),j=+s[0],ci=+s[1],rm2=X.model.rooms[j],col=COLS[ci];if(!rm2||!col)return;var ce=X.red[rm2.no].cells[col[0]];ce.pick=+s[2];ce.v=toIn(col[2],rm2.cells[col[0]].vals[ce.pick].v);var ri=q('gkd-r-'+j+'-'+ci);if(ri)ri.value=ce.v;X.dirty=true;updRoom(j);return}
 if(t.getAttribute('data-gkd-v')!=null)onInput(e); /* the 支払日 select */
}
function focusables(){
 if(!X)return [];
 return [].slice.call(X.root.querySelectorAll('button,input,select,textarea,summary,a[href],[tabindex]')).filter(function(el){
  return !el.disabled&&el.getAttribute('tabindex')!=='-1'&&!(el.closest&&el.closest('[hidden]'))&&(el.offsetParent!==null||el===document.activeElement);
 });
}
function onKey(e){
 if(!X)return;
 if(e.key==='Escape'||e.key==='Esc'){if(e.isComposing)return;e.preventDefault();if(unask()){var c=X.root.querySelector('[data-gkd="cancel"]');if(c)c.focus();return}close();return}
 if(e.key==='Tab'){
  var f=focusables();if(!f.length){e.preventDefault();return}
  var i=f.indexOf(document.activeElement);
  if(e.shiftKey&&i<=0){e.preventDefault();f[f.length-1].focus()}
  else if(!e.shiftKey&&(i<0||i===f.length-1)){e.preventDefault();f[0].focus()}
 }
}
function onDrag(e){
 if(!X)return;e.preventDefault();
 var z=q('gkd-drop');if(!z||X.screen!=='files')return;
 var inZone=e.target&&z.contains&&z.contains(e.target);
 if(e.type==='dragover'){if(z.classList)z.classList[inZone?'add':'remove']('is-over');if(e.dataTransfer)try{e.dataTransfer.dropEffect=inZone?'copy':'none'}catch(x){}}
 else if(e.type==='dragleave'){if(z.classList&&!inZone)z.classList.remove('is-over')}
 else{if(z.classList)z.classList.remove('is-over');if(inZone&&e.dataTransfer)addFiles(e.dataTransfer.files)}
}
function onImgErr(e){
 var t=e.target;if(!X||!t||t.tagName!=='IMG')return;
 var f=byFid(+t.getAttribute('data-gkd-img'));if(!f||f.broken)return;f.broken=true;
 var pc=X.root.querySelector('.gkd-pcol');if(pc)pc.outerHTML=previewHtml(X.mode==='rows');
}

/* ---------- apply ---------- */
function needOrig(){
 if(X.orig)return false;
 err('gkd-orig-e','先に「原本と見比べて確かめました」にチェックを入れてください（本番と同じ決まりです）。');
 var o=q('gkd-orig');if(o){if(o.scrollIntoView)try{o.scrollIntoView({block:'center'})}catch(x){}o.focus()}
 return true;
}
function result(res){return {undo:typeof res==='function'?res:res&&typeof res.undo==='function'?res.undo:null,marks:res&&Array.isArray(res.marks)?res.marks:null}}
function applyFields(){
 if(needOrig())return;
 var M=X.model,o=X.opts,vals={},prev={},n=0,ticked=0;
 /* only what changes is handed over (a ticked row that already matches the form needs nothing) */
 M.rows.forEach(function(r){if(r.check||locked(r))return;var e=X.ed[r.i];if(!e.chk)return;ticked++;var v=toOut(r.type,e.v);if(same(r.type,r.cur,v)&&(r.type!=='tel'||ft(r.cur)===v))return;vals[r.fd.key]=v;prev[r.fd.key]=r.cur;n++});
 var person=X.dupChoice==='use'&&X.dupUsable?X.dup:null;
 if(!ticked&&!person){err('gkd-apply-e','入れる項目がありません。「反映する」にチェックを入れてください。');return}
 if(!n&&!person){var r0=X.ret,i0=X.retId;close(true);refocus(r0,i0);GK.toast('チェックした項目は、今の入力と同じでした（変更はありません）');return}
 var f=M.first;if(results().some(function(x){return x.f.kind==='apply'}))D._recent={name:f.name||'',addr:f.addr||'',birth:f.birth||''};
 var flds=o.fields||[],ret=X.ret,rid=X.retId;
 close(true);
 var res=null;
 try{if(person&&typeof o.onPerson==='function')o.onPerson(person);res=o.apply?o.apply(vals,{person:person,read:M.first}):null}catch(e){log(e)}
 refocus(ret,rid);
 if(res===null&&!person){GK.toast('変更はありませんでした（書類の値をこの画面に入れられませんでした）');return}
 var R=result(res),marks=R.marks||flds.filter(function(fd){return fd.sel&&(fd.key in vals)}).map(function(fd){return {sel:fd.sel,val:vals[fd.key]}});
 var b=addMarks(marks.filter(function(m){return m&&str(m.val).trim()}));
 var msg=n?(typeof o.doneMsg==='function'?o.doneMsg(n):'書類から '+n+'項目を入れました。黄色の枠の欄を確かめてください'):'登録済みの人を選びました（二重に登録されません）';
 GK.toast(msg,function(){dropMarks(b);try{if(R.undo)R.undo();else if(res===undefined&&o.apply)o.apply(prev,{person:null,undo:true})}catch(e){log(e)}GK.toast('読み込む前の内容に戻しました')});
}
function applyRows(){
 if(needOrig())return;
 var M=X.model,o=X.opts.rows||{},out=[];
 M.rooms.forEach(function(rm){
  var e=X.red[rm.no];if(!e.chk)return;var r={no:rm.no};
  COLS.forEach(function(c){var ce=e.cells[c[0]];if(ce)r[c[0]]=c[0]==='ten'?str(ce.v).trim():toOut(c[2],ce.v)});
  out.push(r);
 });
 if(!out.length){err('gkd-apply-e','入れる部屋がありません。「号室を反映する」にチェックを入れてください。');return}
 var ret=X.ret,rid=X.retId;close(true);
 var res=null;try{res=o.apply?o.apply(out):null}catch(e){log(e)}
 var R=result(res),b=addMarks(R.marks||[]);
 refocus(ret,rid);
 GK.toast(out.length+'部屋の内容を書類から入れました。黄色の枠の欄を確かめてください',function(){dropMarks(b);try{if(R.undo)R.undo()}catch(e){log(e)}GK.toast('読み込む前の内容に戻しました')});
}
function record(){
 if(needOrig())return;
 if(X.idDiff&&!X.idDiffOk){err('gkd-diffok-e','違いがあります。確かめたら「違いを確かめたうえで記録する」にチェックを入れてください。');var dk=q('gkd-diffok');if(dk)dk.focus();return}
 var f=done()[0];if(!f)return;
 var o=X.opts,rec={type:f.kind,date:GK.TODAY,by:GK.ME},nm=str(o.person&&o.person.n).trim()||str(sim('id',X.w).v.idName),ret=X.ret,rid=X.retId;
 var diffTxt=X.idDiff?'（違いあり：'+X.idDiffItems.join('・')+'）':'';
 close(true);
 var undo=null;try{undo=typeof o.onRecord==='function'?o.onRecord(rec):null}catch(e){log(e)}
 GK.log('本人確認：'+rec.type+'で確認（'+nm+' 様）'+diffTxt,o.unit||'');
 var lg=GK.db.log[0],lk=lg?{at:lg.at,t:lg.t}:null,hk=o.unit&&GK.db.hist[0]?GK.db.hist[0].id:'';
 GK.save();refocus(ret,rid);
 GK.toast('本人確認を記録しました（'+rec.type+'）',function(){
  try{if(typeof undo==='function')undo()}catch(e){log(e)}
  var d=GK.db,gone=false;
  if(lk)d.log=d.log.filter(function(x){if(!gone&&x.at===lk.at&&x.t===lk.t){gone=true;return false}return true});
  if(hk)d.hist=d.hist.filter(function(x){return x.id!==hk});
  GK.save();GK.toast('本人確認の記録を取り消しました');
 });
}

/* ---------- 「書類から入れました」 marks on the page's fields ---------- */
var MK=[],obs=null,seqB=0,deco=false;
function mkey(v){return nk(v).replace(/[\s　,，\-‐−]/g,'')}
function addMarks(list){var b=++seqB;(list||[]).forEach(function(m){if(m&&m.sel)MK.push({sel:m.sel,val:str(m.val),b:b})});watch();decorate();return b}
function dropMarks(b){MK.filter(function(m){return m.b===b}).forEach(function(m){var el=find(m.sel);if(el)unmark(el)});MK=MK.filter(function(m){return m.b!==b});decorate()}
function find(sel){try{return document.querySelector(sel)}catch(e){return null}}
function mark(el){
 if(el.classList&&!el.classList.contains('gkd-filled'))el.classList.add('gkd-filled');
 if(!el.id||!el.insertAdjacentElement)return;
 var nid=el.id+'-gkd';if(q(nid))return;
 var n=document.createElement('span');n.id=nid;n.className='gkd-note';n.textContent='書類から入れました';el.insertAdjacentElement('afterend',n);
 var db=str(el.getAttribute('aria-describedby')).split(' ').filter(Boolean);if(db.indexOf(nid)<0){db.push(nid);el.setAttribute('aria-describedby',db.join(' '))}
}
function unmark(el){
 if(el.classList)el.classList.remove('gkd-filled');
 if(!el.id)return;var nid=el.id+'-gkd',n=q(nid);if(n)try{n.remove()}catch(e){}
 var db=str(el.getAttribute('aria-describedby')).split(' ').filter(function(x){return x&&x!==nid});
 if(db.length)el.setAttribute('aria-describedby',db.join(' '));else el.removeAttribute('aria-describedby');
}
function decorate(){
 if(deco)return;deco=true;
 try{
  MK=MK.filter(function(m){
   var el=find(m.sel);if(!el)return true; /* on another step: kept for when it is drawn again */
   if(mkey(el.value)!==mkey(m.val)){unmark(el);return false} /* edited: the mark goes for good */
   mark(el);return true;
  });
  if(!MK.length&&obs){obs.disconnect();obs=null}
 }finally{deco=false}
}
var tmr=0;
function later(){clearTimeout(tmr);tmr=setTimeout(decorate,0)}
function watch(){if(obs||typeof MutationObserver!=='function'||!document.body)return;obs=new MutationObserver(later);obs.observe(document.body,{childList:true,subtree:true})}
if(document.addEventListener){
 /* while the dialog is open, a key pressed with the focus outside it (e.g. on <body> after a re-render) still belongs to
    the dialog: Esc closes it, Tab goes back in, and the page's own shortcuts do not run */
 document.addEventListener('keydown',function(e){
  if(!X||!X.root||(X.root.contains&&X.root.contains(e.target)))return;
  if(e.key==='Escape'||e.key==='Esc'||e.key==='Tab'||e.key==='Enter'){e.preventDefault();e.stopPropagation();if(e.key==='Tab'){var f=focusables();if(f.length)f[0].focus()}else if(e.key!=='Enter'&&!e.isComposing){if(!unask())close()}}
 },true);
 var onEdit=function(e){var t=e.target;if(MK.length&&t&&t.classList&&t.classList.contains('gkd-filled'))decorate()};
 document.addEventListener('input',onEdit,true);document.addEventListener('change',onEdit,true);
}
D._marks=function(){return MK}; /* for tests */
D._decorate=decorate;
/* the page's 「書類から読み込む」 bar and the yellow outline need the CSS before the first dialog opens */
try{if(document.head||document.body)css()}catch(e){}
})();
