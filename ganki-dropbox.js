/* GANKI rental prototype — 書類（Dropbox） (added 2026-10-19, user decision: connect the company's Dropbox automatically).
   Production: the company's Dropbox is connected with the Dropbox API once the company has approved it (an administrator signs in
   and allows read access). The app keeps only where a document is (its path / file id) and which property or room it belongs to —
   never the document itself. 開く opens the document in Dropbox.
   Prototype (no network): 「Dropboxとつなぐ」 is simulated. The folder tree is fictitious, made from the ledger (a folder per property,
   folders per room, a few loose and unmatched files) and every screen says 「デモ版のため、Dropboxの中身は見本です」. 開く shows a
   card with the document's details instead of the document.
   Matching (settings in 機能の設定 → Dropbox): a folder whose name contains a 物件名 belongs to that property; inside it, a folder
   whose name contains a room number belongs to that room. A link made by hand (この部屋につなぐ／外す, or a folder linked in the
   settings) always wins: file > the deepest folder > the automatic rule.
   GK.db.dropbox = {connected, account, at, by, base, rule:{prop, room}, links:{<full path>:{unit}|{prop}|{off:true}}}
     (no key in an older db: the demo starts connected, 社内検証用のデータ starts not connected; nothing is saved until a change)
   Feature switches (ganki-data.js): doc.dbx (the list), doc.dbxopen (開く; personal information: 閲覧 OFF), doc.dbxlink (つなぐ／外す;
   a change: 閲覧 OFF). Connecting and the rules are in 機能の設定 (people who can open it).
   GK.dbx.files() / index() / forUnit(id) / forProp(id) / unmatched() / unmatchedFolders()
   GK.dbx.sectionHtml({unit|prop, key, canOpen, canLink})  the 「書類（Dropbox）」 block (pages pass the switches they checked)
   GK.dbx.settingsHtml()                                    the Dropbox tab of 機能の設定
   GK.dbx.connect() / disconnect() / saveRules(o) / link(path,target) / unlink(path)  -> {ok, undo} | {ok:false, msg} */
(function(){
var GK=window.GK;if(!GK)return;
var B=GK.dbx={},esc=GK.esc;
B.NOTE=(GK.LOCAL?'検証用のため':'デモ版のため')+'、Dropboxの中身は見本です（本番では会社のDropboxにある書類が出ます）。';
B.ACCOUNT='GANKI 賃貸管理部（架空のアカウント）';
B.DEF_BASE='/GANKI賃貸管理/物件';
function hm(){return new Date().toTimeString().slice(0,5)}
function can(k){return typeof GK.can!=='function'||GK.can(k)}
function nf(s){s=String(s==null?'':s);try{s=s.normalize('NFKC')}catch(e){}return s}
function key(s){return nf(s).replace(/[\s　()（）［］\[\]【】「」・._\-]/g,'').toLowerCase()}
function hash(s){var h=5381;for(var i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)}
B.data=function(){
 var d=GK.db.dropbox;
 if(!d||typeof d!=='object'||Array.isArray(d)){
  d=GK.db.dropbox=d===undefined&&!GK.LOCAL?{connected:true,account:B.ACCOUNT,at:'2026-10-01 09:00',by:'高橋',base:B.DEF_BASE,rule:{prop:true,room:true},links:{}}
   :{connected:false,account:'',at:'',by:'',base:B.DEF_BASE,rule:{prop:true,room:true},links:{}};
 }
 if(!d.rule||typeof d.rule!=='object')d.rule={prop:true,room:true};
 if(!d.links||typeof d.links!=='object'||Array.isArray(d.links))d.links={};
 if(typeof d.base!=='string'||!d.base.trim())d.base=B.DEF_BASE;
 return d;
};
B.connected=function(){return !!B.data().connected};
var TYPES={pdf:'PDF',jpg:'画像',jpeg:'画像',png:'画像',heic:'画像',xlsx:'Excel',xls:'Excel',csv:'CSV',docx:'Word',doc:'Word',txt:'テキスト'};
function typeOf(n){var m=/\.([a-z0-9]+)$/i.exec(n);return m&&TYPES[m[1].toLowerCase()]||'ファイル'}
/* ---- the fictitious tree (deterministic: same paths and ids on every load) ---- */
function tree(base){
 var out=[],T=GK.TODAY,n=0;
 var add=function(dir,name,ago,kb){out.push({id:'id:'+hash(dir+'/'+name),dir:dir,name:name,path:dir+'/'+name,type:typeOf(name),updated:GK.addDays(T,-ago),kb:kb})};
 var props=(GK.db.props||[]).filter(function(p){return p&&p.id&&p.n}),units=GK.db.units||[];
 props.forEach(function(p,pi){
  /* one property folder with a slightly different name (the 物件名 is still in it) */
  var pf=base+'/'+(pi===1?p.n+'（'+p.id+'）':p.n);
  add(pf,'重要事項説明書.pdf',40+pi*9,820);add(pf,'管理委託契約書.pdf',120+pi*13,640);add(pf,'建物の図面.pdf',300+pi*7,2400);
  if(pi===0){add(pf+'/共用部','ゴミ置き場の写真.jpg',12,1800);add(pf+'/共用部','消防設備点検の報告書.pdf',33,950)}
  var us=units.filter(function(u){return u&&u.prop===p.id}).sort(function(a,b){return String(a.no).localeCompare(String(b.no),'ja',{numeric:true})});
  us.forEach(function(u,ui){
   var a=GK.activeLease(u.id);if(!a&&ui%3)return;n++;
   var rf=pf+'/'+(ui%4===3?u.no:u.no+'号室');
   if(a){add(rf,'賃貸借契約書_'+u.no+'.pdf',(n*17)%400+5,560);if(ui%2===0)add(rf,'入居申込書_'+u.no+'.pdf',(n*23)%420+20,310);if(a.gua)add(rf,'保証委託契約書_'+u.no+'.pdf',(n*29)%430+15,280);if(a.notice)add(rf,'退去立会いのチェック表_'+u.no+'.xlsx',3,40)}
   else add(rf,'募集図面_'+u.no+'.pdf',(n*11)%90+2,700);
  });
 });
 /* not matched by the rules: a loose scan folder, a building that is not in the ledger, a file at the top */
 add(base+'/未整理','スキャン_'+GK.addDays(T,-2).replace(/-/g,'')+'.pdf',2,1300);
 add(base+'/未整理','保証会社の契約書（コピー）.pdf',9,420);
 if(!GK.LOCAL)add(base+'/南町アパート（売却済み）','引き渡しの書類.pdf',210,900);
 add(base,'鍵の預かり一覧.xlsx',30,60);
 return out;
}
/* which property / room a folder name means (rules) */
function propOfSeg(seg,props){var k=key(seg),best=null;props.forEach(function(p){var pk=key(p.n);if(pk.length>=2&&k.indexOf(pk)>=0&&(!best||pk.length>key(best.n).length))best=p});return best}
function unitOfSeg(seg,pid){var s=nf(seg),hit=null;(GK.db.units||[]).forEach(function(u){if(!u||u.prop!==pid||hit)return;var no=nf(u.no).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');if(new RegExp('(^|[^0-9A-Za-z])'+no+'(号室|号|[^0-9A-Za-z]|$)').test(s))hit=u});return hit}
function target(t){if(!t)return null;if(t.off)return {off:true};if(t.unit){var u=GK.unit(t.unit);if(u)return {unit:u.id,prop:u.prop,how:'hand'}}if(t.prop&&GK.prop(t.prop))return {prop:t.prop,how:'hand'};return null}
var CACHE={sig:'',idx:null};
B.index=function(){
 var d=B.data(),base=d.base.replace(/\/+$/,'');
 var props=(GK.db.props||[]).filter(function(p){return p&&p.id&&p.n});
 var sig=[d.connected,base,d.rule.prop,d.rule.room,JSON.stringify(d.links),props.map(function(p){return p.id+':'+p.n}).join('|'),(GK.db.units||[]).map(function(u){return u&&u.id}).join('|'),(GK.db.leases||[]).map(function(l){return l?l.id+':'+l.unit+':'+l.status+(l.notice?':n':'')+(l.gua?':g':''):''}).join('|')].join('§');
 if(CACHE.sig===sig&&CACHE.idx)return CACHE.idx;
 var idx={files:[],byUnit:{},byProp:{},none:[]};
 if(d.connected){
  tree(base).forEach(function(f){
   /* by hand: the file itself, then its folders from the deepest */
   var m=target(d.links[f.path]),dir=f.dir;
   while(!m&&dir&&dir.length>=base.length){m=target(d.links[dir]);if(dir===base)break;dir=dir.slice(0,dir.lastIndexOf('/'))}
   if(!m){
    var segs=f.dir.slice(base.length).split('/').filter(Boolean),p=null,u=null;
    if(d.rule.prop!==false)for(var i=0;i<segs.length&&!p;i++){p=propOfSeg(segs[i],props);if(p&&d.rule.room!==false)for(var j=i+1;j<segs.length&&!u;j++)u=unitOfSeg(segs[j],p.id)}
    m=p?{prop:p.id,unit:u?u.id:'',how:'auto'}:null;
   }
   if(m&&m.off)m=null;
   f.m=m;idx.files.push(f);
   if(!m)idx.none.push(f);else if(m.unit)(idx.byUnit[m.unit]=idx.byUnit[m.unit]||[]).push(f);else (idx.byProp[m.prop]=idx.byProp[m.prop]||[]).push(f);
  });
 }
 CACHE={sig:sig,idx:idx};return idx;
};
B.files=function(){return B.index().files};
B.forUnit=function(id){return (B.index().byUnit[id]||[]).slice()};
B.forProp=function(id){return (B.index().byProp[id]||[]).slice()};
B.unmatched=function(){return B.index().none.slice()};
B.unmatchedFolders=function(){var out=[],seen={};B.unmatched().forEach(function(f){if(!seen[f.dir]){seen[f.dir]=1;out.push({dir:f.dir,files:[]})}out.filter(function(x){return x.dir===f.dir})[0].files.push(f)});return out};
B.byPath=function(p){return B.files().filter(function(f){return f.path===p})[0]||null};
function rel(p){var b=B.data().base.replace(/\/+$/,'');return p.indexOf(b)===0?p.slice(b.length).replace(/^\//,'')||'（いちばん上）':p}
B.rel=rel;
function tLabel(t){if(!t)return '';if(t.unit)return GK.roomLabel(t.unit);var p=GK.prop(t.prop);return p?p.n:''}
function save(){GK.save()}
function logged(t,unit){GK.log(t,unit);var lg=GK.db.log[0],h=unit?GK.db.hist[0]:null;return {lg:lg?{at:lg.at,t:lg.t,who:lg.who}:null,hid:h&&h.t===t?h.id:''}}
function unlog(L){var d=GK.db;if(L&&L.lg&&Array.isArray(d.log))for(var i=0;i<d.log.length;i++){var x=d.log[i];if(x&&x.at===L.lg.at&&x.t===L.lg.t&&x.who===L.lg.who){d.log.splice(i,1);break}}if(L&&L.hid&&Array.isArray(d.hist))d.hist=d.hist.filter(function(h){return !(h&&h.id===L.hid)})}
function setLink(path,v){var d=B.data(),had=Object.prototype.hasOwnProperty.call(d.links,path),prev=had?JSON.parse(JSON.stringify(d.links[path])):null;if(v)d.links[path]=v;else delete d.links[path];return function(){var d2=B.data();if(had)d2.links[path]=prev;else delete d2.links[path]}}
/* ---- changes (each returns {ok, undo}) ---- */
B.connect=function(){
 if(!can('settings')||!can('doc.dbx'))return {ok:false,msg:'Dropboxとつなぐのは「機能の設定」を開ける人だけです。'};
 var d=B.data(),prev=JSON.parse(JSON.stringify(d));if(d.connected)return {ok:false,msg:'すでにつながっています。'};
 d.connected=true;d.account=B.ACCOUNT;d.at=GK.TODAY+' '+hm();d.by=GK.ME;
 var L=logged('機能の設定：Dropboxとつなぎました（'+B.ACCOUNT+'）');save();
 return {ok:true,undo:function(){GK.db.dropbox=prev;unlog(L);save()}};
};
B.disconnect=function(){
 if(!can('settings')||!can('doc.dbx'))return {ok:false,msg:'Dropboxの接続を変えるのは「機能の設定」を開ける人だけです。'};
 var d=B.data(),prev=JSON.parse(JSON.stringify(d));if(!d.connected)return {ok:false,msg:'つながっていません。'};
 d.connected=false;d.account='';
 var L=logged('機能の設定：Dropboxとつなぐのをやめました（つないだ書類の場所の記録は残します）');save();
 return {ok:true,undo:function(){GK.db.dropbox=prev;unlog(L);save()}};
};
B.saveRules=function(o){
 if(!can('settings')||!can('doc.dbx'))return {ok:false,msg:'決まりを変えるのは「機能の設定」を開ける人だけです。'};
 o=o||{};var base=nf(o.base).trim().replace(/\\/g,'/').replace(/\/+$/,'');
 if(!base)return {ok:false,msg:'書類を探すフォルダーを入れてください（例：'+B.DEF_BASE+'）。',field:'base'};
 if(base.charAt(0)!=='/')base='/'+base;
 if(/[<>:"|?*]/.test(base))return {ok:false,msg:'フォルダーの名前に使えない文字（< > : " | ? *）があります。',field:'base'};
 var d=B.data(),prev={base:d.base,rule:JSON.parse(JSON.stringify(d.rule))};
 d.base=base;d.rule={prop:o.prop!==false,room:o.room!==false&&o.prop!==false};
 var L=logged('機能の設定：Dropboxの決まりを変えました（フォルダー '+base+'・物件名で'+(d.rule.prop?'つなぐ':'つながない')+'・部屋番号で'+(d.rule.room?'つなぐ':'つながない')+'）');save();
 return {ok:true,undo:function(){var d2=B.data();d2.base=prev.base;d2.rule=prev.rule;unlog(L);save()}};
};
/* path: a file or a folder; to: {unit} or {prop} */
B.link=function(path,to){
 if(!can('doc.dbxlink'))return {ok:false,msg:'「Dropboxの書類をつなぐ」は使えない設定になっています。'};
 var t=target(to);if(!t||t.off)return {ok:false,msg:'つなぐ部屋か物件を選んでください。'};
 var back=setLink(path,t.unit?{unit:t.unit}:{prop:t.prop}),name=path.slice(path.lastIndexOf('/')+1)||path;
 var L=logged('書類（Dropbox）「'+name+'」を '+tLabel(t)+' につなぎました',t.unit||'');save();
 return {ok:true,label:tLabel(t),undo:function(){back();unlog(L);save()}};
};
/* 外す: a link made by hand is removed; a file matched by the rules is marked 「つながない」 */
B.unlink=function(path){
 if(!can('doc.dbxlink'))return {ok:false,msg:'「Dropboxの書類をつなぐ」は使えない設定になっています。'};
 var f=B.byPath(path),m=f&&f.m,d=B.data();
 if(!f&&!d.links[path])return {ok:false,msg:'この書類が見つかりません（Dropboxで動かされたかもしれません）。'};
 var was=f?{unit:m&&m.unit,prop:m&&m.prop}:target(d.links[path]);
 var back=d.links[path]&&!d.links[path].off&&(!f||f.m&&f.m.how==='hand'&&target(d.links[path]))?setLink(path,null):setLink(path,{off:true});
 var name=path.slice(path.lastIndexOf('/')+1)||path;
 var L=logged('書類（Dropbox）「'+name+'」を '+(tLabel(was)||'つながり')+' から外しました',was&&was.unit||'');save();
 return {ok:true,undo:function(){back();unlog(L);save()}};
};
/* ---- the block on the panels ---- */
var Q={};
function fileRow(f,o){
 var hand=f.m&&f.m.how==='hand';
 return '<li><span class="main-t"><span class="gk-dbx-name">'+esc(f.name)+'</span> <span class="pill">'+esc(f.type)+'</span><div class="sub">'+esc(GK.jp(f.updated))+' 更新 · '+esc(rel(f.dir))+(hand?' · 手でつないだ書類':'')+'</div></span><span class="end gk-dbx-acts">'+
  (o.canOpen?'<button type="button" class="act" data-dbx-open="'+esc(f.path)+'" aria-label="'+esc(f.name)+' を開く">開く</button>':'')+
  (o.canLink?'<button type="button" class="act" data-dbx-off="'+esc(f.path)+'" aria-label="'+esc(f.name)+' を'+esc(o.label)+'から外す">外す</button>':'')+'</span></li>';
}
function listHtml(o){
 var all=o.unit?B.forUnit(o.unit):B.forProp(o.prop),q=String(Q[o.key]||'').trim(),list=q?all.filter(function(f){return GK.hit(q,[f.name,f.type,rel(f.dir)])}):all;
 list.sort(function(a,b){return a.updated<b.updated?1:a.updated>b.updated?-1:a.name<b.name?-1:1});
 if(!all.length)return '<p class="cap">この'+(o.unit?'部屋':'物件')+'につながった書類はまだありません。</p>';
 if(!list.length)return '<p class="cap">「'+esc(q)+'」に一致する書類はありません。</p>';
 return '<ul class="rows gk-dbx-list">'+list.map(function(f){return fileRow(f,o)}).join('')+'</ul>'+(q?'<p class="cap">'+all.length+'件のうち '+list.length+'件</p>':'');
}
B.sectionHtml=function(o){
 o=o||{};if(!can('doc.dbx'))return '';
 o.key=String(o.key||(o.unit?'u-'+o.unit:'p-'+o.prop)).replace(/[^\w-]/g,'-');o.label=o.unit?'この部屋':'この物件';
 o.canOpen=o.canOpen!==false&&can('doc.dbxopen');o.canLink=o.canLink!==false&&can('doc.dbxlink');
 var d=B.data(),h='<section class="gk-dbx" aria-labelledby="dbxT-'+o.key+'"><h3 id="dbxT-'+o.key+'">書類（Dropbox）</h3>';
 if(!d.connected)return h+'<p class="cap">Dropboxとつながっていません。'+(can('settings')?'<a href="settings.html#tab-dbx">機能の設定でつなぐ</a>':'管理者がつなぐと、ここに書類が出ます。')+'</p></section>';
 h+='<p class="gk-dbx-demo">'+esc(B.NOTE)+'</p>';
 h+='<input class="search gk-dbx-q" type="search" id="dbxQ-'+o.key+'" data-dbx-q="'+o.key+'" data-dbx-unit="'+esc(o.unit||'')+'" data-dbx-prop="'+esc(o.prop||'')+'" value="'+esc(Q[o.key]||'')+'" placeholder="書類の名前で探す（例：契約書）" aria-label="'+esc(o.label)+'の書類を名前で探す" autocomplete="off">';
 h+='<div id="dbxList-'+o.key+'" aria-live="polite">'+listHtml(o)+'</div>';
 if(!o.canOpen&&can('doc.dbx'))h+='<p class="cap">書類を開くのは、使える設定の人だけです。</p>';
 if(o.canLink){
  var un=B.unmatched();
  h+='<details class="gk-dbx-more"'+(Q[o.key+':open']?' open':'')+' data-dbx-more="'+o.key+'"><summary>つながっていない書類から選ぶ（'+un.length+'件）</summary>'+
   (un.length?'<ul class="rows">'+un.map(function(f){return '<li><span class="main-t"><span class="gk-dbx-name">'+esc(f.name)+'</span><div class="sub">'+esc(rel(f.dir))+' · '+esc(GK.jp(f.updated))+' 更新</div></span><span class="end gk-dbx-acts">'+
    (o.canOpen?'<button type="button" class="act" data-dbx-open="'+esc(f.path)+'" aria-label="'+esc(f.name)+' を開く">開く</button>':'')+
    '<button type="button" class="act ok" data-dbx-link="'+esc(f.path)+'" data-dbx-unit="'+esc(o.unit||'')+'" data-dbx-prop="'+esc(o.prop||'')+'" aria-label="'+esc(f.name)+' を'+esc(o.label)+'につなぐ">'+esc(o.label)+'につなぐ</button></span></li>'}).join('')+'</ul>':'<p class="cap">つながっていない書類はありません。</p>')+'</details>';
 }
 return h+'</section>';
};
/* ---- 開く: a card with the details (production: the document opens in Dropbox) ---- */
var DLG=null;
function closeDlg(){if(!DLG)return;var d=DLG;DLG=null;try{d.el.remove()}catch(e){}if(d.ret&&document.body.contains(d.ret)&&d.ret.focus)try{d.ret.focus()}catch(e){}}
B.open=function(path,ret){
 if(!can('doc.dbx')||!can('doc.dbxopen')){GK.toast('「Dropboxの書類を開く」は使えない設定になっています');return false}
 var f=B.byPath(path);if(!f){GK.toast('この書類が見つかりません（Dropboxで動かされたかもしれません）');return false}
 closeDlg();
 var el=document.createElement('div');el.className='gk-dbx-wrap';el.id='gkDbx';
 el.innerHTML='<div class="gk-dbx-dlg" role="dialog" aria-modal="true" aria-labelledby="gkDbxT"><h2 id="gkDbxT">'+esc(f.name)+'</h2>'+
  '<dl class="kv"><dt>種類</dt><dd>'+esc(f.type)+'</dd><dt>場所</dt><dd>'+esc(f.dir)+'</dd><dt>更新</dt><dd>'+esc(GK.jp(f.updated))+'</dd><dt>大きさ</dt><dd>'+esc(f.kb>=1000?(Math.round(f.kb/100)/10)+' MB':f.kb+' KB')+'</dd>'+
  (f.m?'<dt>つながり</dt><dd>'+esc(tLabel(f.m))+(f.m.how==='hand'?'（手でつないだ）':'（フォルダーの名前から）')+'</dd>':'')+'</dl>'+
  '<div class="gk-dbx-prev" role="note">'+esc(GK.LOCAL?'検証用のため':'デモ版のため')+'、書類の中身はありません。本番では、ここでDropboxの書類が開きます（この画面には中身を保存しません）。</div>'+
  '<div class="gk-dbx-acts2"><button type="button" class="btn primary" data-dbx-close="1">閉じる</button></div></div>';
 document.body.appendChild(el);
 DLG={el:el,ret:ret||document.activeElement};
 el.addEventListener('keydown',function(ev){ev.stopPropagation();if(ev.key==='Escape'){if(ev.preventDefault)ev.preventDefault();closeDlg();return}if(ev.key==='Tab'){var b=el.querySelector('[data-dbx-close]');if(b){if(ev.preventDefault)ev.preventDefault();b.focus()}}});
 el.addEventListener('click',function(ev){ev.stopPropagation();var t=ev.target;if(t===el||(t&&t.closest&&t.closest('[data-dbx-close]')))closeDlg()});
 var b=el.querySelector('[data-dbx-close]');if(b&&b.focus)b.focus();
 GK.log('書類（Dropbox）を開きました：'+f.name,f.m&&f.m.unit||'');save();
 return true;
};
B.isOpen=function(){return !!DLG};
B.close=closeDlg;
/* ---- 機能の設定 → Dropbox ---- */
B.settingsHtml=function(){
 if(!can('doc.dbx'))return '<p class="empty">「書類（Dropbox）」は使えない設定になっています。</p>';
 var d=B.data(),canL=can('doc.dbxlink'),h='<h2>Dropbox</h2>';
 h+='<p class="cap">会社のDropboxにある書類を、物件・部屋・契約の画面に一覧で出します。アプリには書類の中身を保存せず、書類の場所だけを覚えます。本番では、会社のDropboxの管理者が承認してからつなぎます（Dropbox API・読み取りだけ）。</p>';
 h+='<p class="gk-dbx-demo">'+esc(B.NOTE)+'</p>';
 h+='<div class="gk-dbx-box">'+(d.connected?'<p><span class="pill ok">つながっています</span> '+esc(d.account)+'<span class="cap">（'+esc(d.at)+(d.by?' · '+esc(d.by):'')+'）</span></p><div class="panel-actions"><button type="button" class="btn danger" id="dbxOff" data-dbx-disconnect="1">つなぐのをやめる</button></div>'
  :'<p><span class="pill">つながっていません</span></p><div class="panel-actions"><button type="button" class="btn primary" id="dbxOn" data-dbx-connect="1">Dropboxとつなぐ</button></div><p class="cap">押すと見本のフォルダーにつながります（'+(GK.LOCAL?'検証用':'デモ版')+'）。</p>')+'</div>';
 h+='<h3 class="gk-dbx-h">書類を探す場所と、つなぐ決まり</h3><div class="gk-dbx-box"><div class="field"><label for="dbxBase">書類を探すフォルダー</label><input id="dbxBase" type="text" value="'+esc(d.base)+'" autocomplete="off" aria-describedby="dbxBaseC"><span class="cap" id="dbxBaseC">このフォルダーの中だけを見ます（例：'+esc(B.DEF_BASE)+'）。</span></div>'+
  '<label class="gk-dbx-chk"><input type="checkbox" id="dbxRp"'+(d.rule.prop!==false?' checked':'')+'>フォルダーの名前に物件名が入っていたら、その物件につなぐ</label>'+
  '<label class="gk-dbx-chk"><input type="checkbox" id="dbxRr"'+(d.rule.room!==false?' checked':'')+'>物件のフォルダーの中で、フォルダーの名前に部屋番号が入っていたら、その部屋につなぐ（例：101号室）</label>'+
  '<p class="err" id="dbxErr" role="alert"></p><div class="panel-actions"><button type="button" class="btn primary" data-dbx-rules="1">この決まりで保存</button></div></div>';
 if(d.connected){
  var fs=B.unmatchedFolders(),opts='<option value="">つなぐ先を選ぶ</option>'+(GK.db.props||[]).map(function(p){return '<optgroup label="'+esc(p.n)+'"><option value="p:'+esc(p.id)+'">'+esc(p.n)+'（物件）</option>'+(GK.db.units||[]).filter(function(u){return u&&u.prop===p.id}).map(function(u){return '<option value="u:'+esc(u.id)+'">'+esc(p.n+' '+u.no)+'</option>'}).join('')+'</optgroup>'}).join('');
  h+='<h3 class="gk-dbx-h">つながっていないフォルダー（'+fs.length+'件）</h3>'+(fs.length?'<ul class="rows gk-dbx-folders">'+fs.map(function(x,i){return '<li><span class="main-t"><b>'+esc(rel(x.dir))+'</b><div class="sub">'+x.files.length+'件：'+esc(x.files.slice(0,3).map(function(f){return f.name}).join('、'))+(x.files.length>3?' ほか':'')+'</div>'+
    (canL?'<div class="gk-dbx-pick"><label class="sr" for="dbxF'+i+'">「'+esc(rel(x.dir))+'」のつなぐ先</label><select id="dbxF'+i+'" data-dbx-sel="'+esc(x.dir)+'">'+opts+'</select><button type="button" class="btn" data-dbx-linkdir="'+esc(x.dir)+'" data-dbx-i="'+i+'">つなぐ</button></div>':'')+'</span></li>'}).join('')+'</ul>':'<p class="cap">すべてのフォルダーが物件・部屋につながっています。</p>');
  var hand=Object.keys(d.links).filter(function(k){return d.links[k]});
  if(hand.length)h+='<h3 class="gk-dbx-h">手でつないだ・外した書類とフォルダー（'+hand.length+'件）</h3><ul class="rows">'+hand.map(function(k){var t=target(d.links[k]);return '<li><span class="main-t">'+esc(rel(k))+'<div class="sub">'+(d.links[k].off?'つながない':esc(tLabel(t)||'（つなぐ先がありません）'))+'</div></span>'+(canL?'<span class="end"><button type="button" class="act" data-dbx-clear="'+esc(k)+'" aria-label="'+esc(rel(k))+' の手のつなぎを外して、決まりどおりに戻す">決まりどおりに戻す</button></span>':'')+'</li>'}).join('')+'</ul>';
 }
 return h;
};
/* ---- events (every page that loads this file) ---- */
function refresh(){if(typeof window.GKrefresh==='function'){try{window.GKrefresh({type:'gk-dbx'})}catch(e){if(window.console)console.error(e)}}}
function done(r,msg,focusSel){
 if(!r.ok){GK.toast(r.msg);return}
 refresh();GK.toast(msg,function(){r.undo();refresh();GK.toast('元に戻しました')});
 if(focusSel){var f=document.querySelector(focusSel);if(f&&f.focus)f.focus()}
}
function sq(v){return String(v).replace(/["\\]/g,'\\$&')}
if(document.addEventListener){
 document.addEventListener('click',function(ev){
  var b=null;try{b=ev&&ev.target&&ev.target.closest?ev.target.closest('[data-dbx-open],[data-dbx-off],[data-dbx-link],[data-dbx-connect],[data-dbx-disconnect],[data-dbx-rules],[data-dbx-linkdir],[data-dbx-clear]'):null}catch(x){b=null}
  if(!b||!b.getAttribute)return;
  var g=function(k){var v=b.getAttribute(k);return v==null?'':String(v)};
  if(b.hasAttribute('data-dbx-open'))return B.open(g('data-dbx-open'),b);
  if(b.hasAttribute('data-dbx-off')){var sec=b.closest&&b.closest('.gk-dbx'),qi=sec&&sec.querySelector('[data-dbx-q]');return done(B.unlink(g('data-dbx-off')),'書類を外しました（「つながっていない書類」に移りました）',qi?'#'+qi.id:'')}
  if(b.hasAttribute('data-dbx-link')){var u=g('data-dbx-unit'),p=g('data-dbx-prop');return done(B.link(g('data-dbx-link'),u?{unit:u}:{prop:p}),'書類を'+(u?GK.roomLabel(u):(GK.prop(p)||{n:''}).n)+'につなぎました')}
  if(b.hasAttribute('data-dbx-connect'))return done(B.connect(),'Dropboxとつなぎました（'+(GK.LOCAL?'検証用':'デモ版')+'のため、見本のフォルダーです）','#dbxOff');
  if(b.hasAttribute('data-dbx-disconnect')){
   if(!GK.confirmBar)return done(B.disconnect(),'Dropboxとつなぐのをやめました','#dbxOn');
   GK.confirmBar(b.closest('.gk-dbx-box')||b,'Dropboxとつなぐのをやめますか？ 物件・部屋の画面に書類が出なくなります（手でつないだ記録は残ります）。','つなぐのをやめる',function(){done(B.disconnect(),'Dropboxとつなぐのをやめました','#dbxOn')});return;
  }
  if(b.hasAttribute('data-dbx-rules')){
   var bi=document.getElementById('dbxBase'),rp=document.getElementById('dbxRp'),rr=document.getElementById('dbxRr'),er=document.getElementById('dbxErr');
   var r=B.saveRules({base:bi?bi.value:'',prop:rp?!!rp.checked:true,room:rr?!!rr.checked:true});
   if(!r.ok){if(er)er.textContent=r.msg;if(bi&&r.field==='base'){bi.setAttribute('aria-invalid','true');bi.focus()}return}
   return done(r,'Dropboxの決まりを保存しました','[data-dbx-rules]');
  }
  if(b.hasAttribute('data-dbx-linkdir')){
   var dir=g('data-dbx-linkdir'),sel=document.querySelector('[data-dbx-sel="'+sq(dir)+'"]'),v=sel?String(sel.value||''):'';
   if(!v){GK.toast('つなぐ先の物件か部屋を選んでください');if(sel&&sel.focus)sel.focus();return}
   return done(B.link(dir,v.indexOf('u:')===0?{unit:v.slice(2)}:{prop:v.slice(2)}),'フォルダー「'+rel(dir)+'」を'+(v.indexOf('u:')===0?GK.roomLabel(v.slice(2)):(GK.prop(v.slice(2))||{n:''}).n)+'につなぎました');
  }
  if(b.hasAttribute('data-dbx-clear')){
   if(!can('doc.dbxlink'))return;var k=g('data-dbx-clear'),back=setLink(k,null),L=logged('機能の設定：Dropboxの「'+rel(k)+'」を決まりどおりに戻しました');save();
   return done({ok:true,undo:function(){back();unlog(L);save()}},'決まりどおりに戻しました');
  }
 });
 document.addEventListener('input',function(ev){
  var t=ev.target;if(!t||!t.getAttribute||t.getAttribute('data-dbx-q')==null)return;
  var k=t.getAttribute('data-dbx-q');Q[k]=t.value;if(ev.isComposing)return;
  var box=document.getElementById('dbxList-'+k);if(box)box.innerHTML=listHtml({key:k,unit:t.getAttribute('data-dbx-unit'),prop:t.getAttribute('data-dbx-prop'),label:t.getAttribute('data-dbx-unit')?'この部屋':'この物件',canOpen:can('doc.dbxopen'),canLink:can('doc.dbxlink')});
 });
 document.addEventListener('toggle',function(ev){var t=ev.target;if(t&&t.getAttribute&&t.getAttribute('data-dbx-more'))Q[t.getAttribute('data-dbx-more')+':open']=!!t.open},true);
}
})();
