/* じょのじょ (added 2026-10-19, user decision: keep the production helper mascot and show it on every new screen).
   A small helper that answers "how do I…" questions from a fixed manual written into this file. Ported from production
   (lib/jonojo-chat.ts: normalize + keyword cues + bigram similarity, small talk only for short non-business text,
   fallback with related sections; lib/jonojo-preference.ts: name / color / size / hidden …).
   - Nothing leaves the browser: no network, the questions are not stored (the conversation lives in memory only).
   - Answers only use the manual below. No business data (names, amounts, counts) is ever put into an answer.
   - Only features the current person can use are explained (GK.can); an OFF feature gets one calm sentence.
   - The prototype uses a simple 2D stand-in (inline SVG). Production keeps the 3D じょのじょ (three.js) — not copied here.
   Feature: 'in.jono' (入力の補助, default ON for every role, independent of the AI group).
   Priority: 管理者が OFF > the person's own 「今は隠す」 > shown. Turning the feature ON again never un-hides it.
   Preferences: GK.db.jono = {people:{<staff id>:{name,color,size,pos,hidden}}} (only what the person changed).
   API: GK.jono.available() / shown() / open(opts) / close() / prefs() / savePrefs(patch) / answer(text) / KNOW /
        prefsHtml(scope) / refresh() / name() */
(function(){
var GK=window.GK;if(!GK||GK.jono)return;
var J=GK.jono={},FEAT='in.jono';
var e=function(s){return GK.esc(s)};
var NOTE_PROTO='試作のため簡単な見た目です（本番は今の3Dのじょのじょです）';
var OFF_MSG='その機能は今は使えない設定になっているじょ。管理者に相談してほしいじょ';
J.NOTE=NOTE_PROTO;J.OFF_MSG=OFF_MSG;

/* ---------- preferences (per person, in the shared store) ---------- */
J.COLORS=[['kaki','柿色','#f0893a','#c4621a'],['milktea','ミルクティー','#d8b48d','#a9825a'],['mint','ミント','#5fc39b','#2f8d68'],['sakura','さくら','#f3a2ba','#cf6f8d'],['sora','そら','#63b3e4','#2f7fb2']];
J.SIZES=[['s','小',48],['m','中',56],['l','大',64]];
J.POS=[['br','右下'],['bl','左下']];
J.DEF={name:'じょのじょ',color:'kaki',size:'m',pos:'br',hidden:false};
function pick(list,v,d){for(var i=0;i<list.length;i++)if(list[i][0]===v)return v;return d}
function cleanName(v){
 var s=String(v==null?'':v).normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g,'').trim();
 s=Array.from(s).slice(0,10).join('');return s||J.DEF.name;
}
function meId(){return GK.MEID||'_'}
function box(){var d=GK.db.jono;return d&&typeof d==='object'&&d.people&&typeof d.people==='object'?d:null}
J.prefs=function(id){
 var b=box(),r=b&&b.people[id===undefined?meId():id];r=r&&typeof r==='object'?r:{};
 return {name:typeof r.name==='string'?cleanName(r.name):J.DEF.name,color:pick(J.COLORS,r.color,J.DEF.color),size:pick(J.SIZES,r.size,J.DEF.size),
  pos:pick(J.POS,r.pos,J.DEF.pos),hidden:r.hidden===true};
};
J.name=function(){return J.prefs().name};
/* patch -> {ok, undo}. Only the person's own record changes; nothing is logged (a personal display setting). */
J.savePrefs=function(patch){
 var id=meId(),before=J.prefs(id),next=Object.assign({},before);
 patch=patch||{};
 if('name' in patch)next.name=cleanName(patch.name);
 if('color' in patch)next.color=pick(J.COLORS,patch.color,before.color);
 if('size' in patch)next.size=pick(J.SIZES,patch.size,before.size);
 if('pos' in patch)next.pos=pick(J.POS,patch.pos,before.pos);
 if('hidden' in patch)next.hidden=!!patch.hidden;
 write(id,next);
 return {ok:true,prefs:next,undo:function(){write(id,before);J.refresh()}};
};
function write(id,p){
 if(!box())GK.db.jono={people:{}};
 var o={};Object.keys(J.DEF).forEach(function(k){if(p[k]!==J.DEF[k])o[k]=p[k]});
 if(Object.keys(o).length)GK.db.jono.people[id]=o;else delete GK.db.jono.people[id];
 GK.save();
}
J.available=function(){try{return GK.can(FEAT)}catch(x){return false}};
J.shown=function(){return J.available()&&!J.prefs().hidden};
function color(){var c=J.prefs().color;return J.COLORS.filter(function(x){return x[0]===c})[0]||J.COLORS[0]}
function reduced(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)}catch(x){return true}}
J.reduced=reduced;

/* the 2D stand-in: a round character with a face, a curl and a tail (aria-hidden) */
J.svg=function(fill,dark,cls){
 return '<svg class="'+(cls||'gk-jono-svg')+'" viewBox="0 0 64 64" aria-hidden="true" focusable="false">'+
  '<path d="M52 44c6 0 9-4 8-8" fill="none" stroke="'+dark+'" stroke-width="4" stroke-linecap="round"/>'+
  '<path d="M30 9c-2-5 3-8 6-5" fill="none" stroke="'+dark+'" stroke-width="3" stroke-linecap="round"/>'+
  '<circle cx="32" cy="35" r="24" fill="'+fill+'" stroke="'+dark+'" stroke-width="2"/>'+
  '<ellipse cx="32" cy="44" rx="13" ry="9" fill="#fff" opacity=".55"/>'+
  '<circle cx="24" cy="32" r="3.2" fill="#1b2535"/><circle cx="40" cy="32" r="3.2" fill="#1b2535"/>'+
  '<circle cx="25" cy="31" r="1" fill="#fff"/><circle cx="41" cy="31" r="1" fill="#fff"/>'+
  '<ellipse cx="18" cy="39" rx="3.5" ry="2.2" fill="#ff7a8a" opacity=".55"/><ellipse cx="46" cy="39" rx="3.5" ry="2.2" fill="#ff7a8a" opacity=".55"/>'+
  '<path d="M28 39q4 4 8 0" fill="none" stroke="#1b2535" stroke-width="2" stroke-linecap="round"/></svg>';
};

/* ---------- the manual ----------
   {id,title,place,steps[],note,done,link,go (link label),need:[keys all needed],any:[one of them],cues:[words]}
   From production knowledge.json (home, setup, contract, finance, csv, remit, revenue, moveout, handover, files, tools),
   rewritten for this prototype's screens, plus a section for every prototype feature. No business data anywhere. */
J.KNOW=[
 {id:'today',title:'今日確認すること',place:'ホーム → 今日確認すること',need:['home.today'],link:'index.html',go:'ホームを開く',
  cues:['今日','毎朝','期限','やること','確認すること','延期','明日へ','完了'],
  steps:['ホームの「今日確認すること」で、期限を過ぎたもの → 今日 → 近いものの順に確認します。','行を押すと部屋の情報が開きます。終わったら「完了」、明日に回すなら「明日へ」を押します。','間違えて押したときは、下に出る「元に戻す」で戻せます。'],
  note:'一覧はあなたの作業を自動で判定するものではありません。終わった対応は自分で「完了」にします。',done:'期限を過ぎたやることが残っていない。'},
 {id:'notask',title:'部屋なしのやることを足す',place:'ホーム → 今日確認すること → ＋ やることを追加',need:['home.today','act.addtask'],link:'index.html',go:'ホームを開く',
  cues:['部屋なし','やることを追加','やること追加','タスク','自分だけ'],
  steps:['「今日確認すること」の「＋ やることを追加」を押します。','内容と期限を入れます。部屋を選ばなければ「部屋なし」のやることになります。','「自分だけ」にすると、ほかの人には見えません。担当を選ぶと、その人の一覧に出ます。'],
  note:'',done:'やることが期限つきで一覧に出ている。'},
 {id:'memo',title:'メモを書く・やることにする',place:'ホーム → メモ',need:['home.notes'],link:'index.html',go:'ホームを開く',
  cues:['メモ','メモから','メモをやること','付箋','共有メモ','自分用'],
  steps:['ホームの「メモ」に書いて残します。自分用と共有を選べます。','期限や担当があるものは「やることにする」で、今日確認することに入れます。','いらなくなったメモは消せます。消したあとは「元に戻す」で戻せます。'],
  note:'期限のある対応はメモだけで済ませず、やることや対応の記録に残します。',done:''},
 {id:'record',title:'対応の記録を残す',place:'ホーム → 対応を記録（部屋の画面の「対応」でも）',need:['act.record'],link:'index.html',go:'ホームを開く',
  cues:['対応の記録','対応を記録','対応履歴','記録','訪問','問い合わせ','修繕'],
  steps:['ホームの「対応を記録」か、部屋の画面の「対応」から開きます。','部屋・種類（電話・訪問・メールなど）・内容を入れて保存します。','保存した記録は部屋の対応履歴とホームの「対応履歴」に出ます。'],
  note:'',done:'だれが・いつ・何をしたかが対応履歴に残っている。'},
 {id:'call',title:'電話する（自動で記録）',place:'部屋・入居者・契約の画面 → 電話する',need:['act.call'],link:'tenants.html',go:'入居者を開く',
  cues:['電話する','発信','電話をかけ','自動記録','電話の記録'],
  steps:['入居者や部屋の画面の「電話する」を押します。','発信したことが対応履歴に自動で残ります。','電話のあとに出る欄で、話した内容を書き足して保存できます。'],
  note:'番号を全部表示できるかどうかは「機能の設定」で決まります。',done:''},
 {id:'room',title:'部屋の画面（部屋パネル）の見方',place:'物件・台帳 → 部屋の一覧 → 部屋',need:['page.props'],link:'properties.html',go:'物件・台帳を開く',
  cues:['部屋パネル','部屋の画面','部屋の情報','号室','概要','入居者の移り変わり'],
  steps:['物件・台帳の「部屋の一覧」で部屋を押すと、右に部屋の画面が開きます。','「概要」「入居者の移り変わり」「対応」「退去」「書類」のタブで切り替えます。','閉じるときは「閉じる」か Esc キーです。'],
  note:'',done:''},
 {id:'props',title:'物件・台帳を見る・直す',place:'物件・台帳',need:['page.props'],link:'properties.html',go:'物件・台帳を開く',
  cues:['物件','台帳','管理台帳','オーナー','間取り','募集家賃','管理条件'],
  steps:['「物件」「部屋の一覧」「オーナー」のタブで一覧を切り替え、上の欄で名前や住所で探します。','部屋を開いて「編集」で間取り・広さなどを直し、保存します。','管理委託の条件は契約書を見て入れます。口頭の取り決めは推測せず、担当者に確認します。'],
  note:'全物件に同じ手数料を当てはめないでください。',done:''},
 {id:'tenants',title:'入居者を探す・連絡先を直す',place:'入居者',need:['page.tenants'],link:'tenants.html',go:'入居者を開く',
  cues:['入居者','連絡先','緊急連絡先','勤務先','フリガナ'],
  steps:['「入居者」の上の欄で、名前・フリガナ・部屋で探します。','入居者を開くと、連絡先・契約・対応履歴が見られます。','連絡先を直すときは「直す」を押して保存します。'],
  note:'',done:''},
 {id:'confirm',title:'契約を確定する',place:'契約・更新 → 申込中・入居予定',need:['page.contracts','act.confirm'],link:'contracts.html#filter-apply',go:'契約・更新を開く',
  cues:['契約の確定','契約を確定','申込中','入居予定','入居済み','初回入金'],
  steps:['「契約・更新」で「申込中・入居予定」を選びます。','契約を開いて、期間・家賃・保証会社などを原本と見比べます。','合っていれば「契約を確定」を押します。入居したら「入居済みにする」を押します。'],
  note:'',done:'契約が「契約中」になっている。'},
 {id:'renew',title:'更新の案内を作る',place:'契約・更新 → 更新が近い',need:['page.contracts','act.renew'],link:'contracts.html#filter-near',go:'契約・更新を開く',
  cues:['更新','更新案内','更新の案内','契約更新','更新料','賃料改定'],
  steps:['「契約・更新」で「更新が近い」を選びます。','契約を開いて「更新案内を作成」を押し、更新後の家賃などを確かめます。','送ったら「送付済み」、合意できたら「更新合意」にして進み具合を残します。'],
  note:'作った案内は自動で送られません。送付は別に行います。',done:''},
 {id:'moveout',title:'退去の連絡・退去の段取り',place:'契約・更新／部屋の画面 → 退去',need:['act.notice'],link:'contracts.html#filter-notice',go:'契約・更新を開く',
  cues:['退去','解約','立会い','退去の連絡','退去の段取り','原状回復','精算'],
  steps:['契約か部屋の画面の「退去」で、退去の連絡を登録します。','ホームの「退去の段取り」で、立会い・精算などの項目に印を付けて進めます。','次の人が決まったら「入居者の入れ替え」に進みます。'],
  note:'退去の連絡を入れても、契約は自動では終わりません。',done:''},
 {id:'register',title:'まとめて登録する',place:'物件・台帳 → ＋ 物件をまとめて登録',need:['page.register'],link:'register.html',go:'まとめて登録を開く',
  cues:['まとめて登録','登録','新規登録','物件登録','オーナー登録','最初'],
  steps:['オーナー → 物件・部屋 → 入居者 → 契約の順に入れていきます。','同じ人を二重に登録しないよう、先に名前で探します。','最後に確認画面で組み合わせを確かめてから登録します。'],
  note:'登録しただけでは、入金や送金の記録はできません。',done:'物件・オーナー・入居者・契約が正しくつながっている。'},
 {id:'turnover',title:'入居者の入れ替え',place:'物件・台帳 → 入居者の入れ替え',need:['page.turnover'],link:'turnover.html',go:'入居者の入れ替えを開く',
  cues:['入れ替え','入居者の入れ替え','新しい入居者','次の入居者','新規契約'],
  steps:['退去した（する）部屋を選びます。','新しい入居者と契約の内容を入れます。申込書から読み込むこともできます。','確認して登録すると、部屋の「入居者の移り変わり」に残ります。'],
  note:'',done:''},
 {id:'takeover',title:'管理の引継ぎ',place:'ホーム → 新しい管理引継ぎ',need:['page.takeover'],link:'takeover.html',go:'管理の引継ぎを開く',
  cues:['引継ぎ','引き継ぎ','承継','管理会社変更','通知書','前の管理会社'],
  steps:['手順にそって、物件とオーナー → 部屋と入居者 → 契約の順に入れます。','名簿は貼り付けや書類からの読み込みでもまとめて入れられます。','途中でやめても下書きが残ります。最後に確認して登録します。'],
  note:'入居者への通知の送付は自動では行いません。送付したら対応の記録に残します。',done:''},
 {id:'docread',title:'書類から読み込む',place:'まとめて登録・入居者の入れ替え・入居者などの「書類から読み込む」',need:['doc.read'],link:'register.html',go:'まとめて登録を開く',
  cues:['書類から読み込む','読み込む','申込書','契約書から','写真','pdf','読み取り'],
  steps:['「書類から読み込む」を押し、申込書・契約書の写真やPDFを選びます。','読み取った候補が欄に入ります。印の付いた欄を原本と見比べます。','違うところは直してから保存します。'],
  note:'読み取っただけでは保存されません。必ず原本と照らし合わせます。',done:''},
 {id:'idcheck',title:'本人確認書類で確かめる',place:'まとめて登録・入居者の入れ替え・入居者 → 本人確認',need:['doc.id'],link:'tenants.html',go:'入居者を開く',
  cues:['本人確認','運転免許証','免許証','マイナンバー','身分証'],
  steps:['「本人確認書類で確かめる」を押します。','運転免許証などを読み込み、名前・生年月日などが合っているか確かめます。','確かめた結果が記録に残ります。'],
  note:'',done:''},
 {id:'addr',title:'住所の候補',place:'住所を入れる欄',need:['in.addr'],link:'register.html',go:'まとめて登録を開く',
  cues:['住所','郵便番号','住所の候補','自動入力'],
  steps:['住所の欄で、物件名や郵便番号を入れると候補が出ます。','矢印キーかタップで候補を選びます。','番地や部屋番号は自分で書き足します。'],
  note:'',done:''},
 {id:'tel',title:'電話番号のハイフン',place:'電話番号を入れる欄',need:['in.tel'],link:'tenants.html',go:'入居者を開く',
  cues:['ハイフン','電話番号の入力','番号の形'],
  steps:['電話番号の欄に数字だけを入れます。','欄を離れると、ハイフンが自動で入ります。'],
  note:'',done:''},
 {id:'mimport',title:'入出金：明細の取り込み',place:'入出金 → 取り込み',need:['money.import'],link:'money.html#tab-import',go:'入出金の「取り込み」を開く',
  cues:['取り込み','取込','csv','明細','銀行','楽天','マネーフォワード'],
  steps:['「入出金」の「取り込み」タブを開きます。','銀行やMFのCSVを選びます。同じ口座・同じ期間かを確かめます。','取り込んだ行は「入出金の確認」に並びます。'],
  note:'同じCSVを二回取り込んでも、同じ行は重ならないようにしています。',done:''},
 {id:'mcheck',title:'入出金の確認',place:'入出金 → 入出金の確認',need:['money.check'],link:'money.html#tab-check',go:'入出金の「入出金の確認」を開く',
  cues:['入金','入金を記録','入出金の確認','紐付け','紐づけ','要確認','家賃','未入金','入金の記録'],
  steps:['「入出金の確認」で「要確認」の行から見ていきます。','部屋・用途が合っていれば確認します。違うときは「直す」、関係ない行は「紐付けない」にします。','金額だけで部屋を決めず、名前や契約で確かめます。'],
  note:'',done:'要確認の行が残っていない。'},
 {id:'mmf',title:'MFとの照合',place:'入出金 → MFとの照合',need:['money.mf'],link:'money.html#tab-mf',go:'入出金の「MFとの照合」を開く',
  cues:['mf','照合','元帳','仕訳','マネーフォワード'],
  steps:['「MFとの照合」タブを開きます。','MFの記録と入出金を見比べ、合わない行を確かめます。','期間外や別口座の行を、仕訳漏れと決めつけないようにします。'],
  note:'',done:''},
 {id:'mremit',title:'オーナー送金',place:'入出金 → オーナー送金',need:['money.remit'],link:'money.html#tab-remit',go:'入出金の「オーナー送金」を開く',
  cues:['送金','オーナー送金','送金明細','送金済み','管理料'],
  steps:['「オーナー送金」タブで、オーナーごとの送金明細を確かめます。','管理料や手数料は管理委託契約の条件で確認してから「確定」します。','銀行で振り込んだあとに「送金済み」にします。'],
  note:'この画面から銀行の振込はされません。',done:''},
 {id:'mtransfer',title:'総合振込データ',place:'入出金 → オーナー送金 → 総合振込',need:['money.transfer'],link:'money.html#tab-remit',go:'入出金の「オーナー送金」を開く',
  cues:['総合振込','振込データ','全銀','振込'],
  steps:['送金明細を確定したあと、「総合振込」を開きます。','銀行に渡す内容を表示して確かめ、コピーします。','銀行の画面で取り込んで振込を手配します。'],
  note:'',done:''},
 {id:'mclose',title:'月の締め',place:'入出金 → 締め',need:['money.close'],link:'money.html#tab-close',go:'入出金の「締め」を開く',
  cues:['締め','月の締め','締める','月次','締めの解除'],
  steps:['「締め」タブで、残っている確認がないか見ます。','問題がなければ月を締めます。','締めたあとに直すときは、理由を残して「締めの解除」をします。'],
  note:'',done:''},
 {id:'msettings',title:'入出金の設定',place:'入出金 → 設定',need:['money.settings'],link:'money.html#tab-settings',go:'入出金の「設定」を開く',
  cues:['科目','口座','振込手数料','入出金の設定'],
  steps:['「設定」タブで、科目・口座・送金手数料などを直します。','変えたら保存します。'],
  note:'',done:''},
 {id:'dunning',title:'滞納の段階',place:'入出金・契約・入居者の画面 → 滞納の経過',need:['money.dunning'],link:'money.html#tab-check',go:'入出金を開く',
  cues:['滞納','督促','未収','保証会社へ請求','立て替え','家賃の連絡'],
  steps:['未収の家賃は「入金待ち → 1回目の連絡 → 2回目の連絡 → 保証会社へ請求」の段階で追います。','契約や入居者の画面の「滞納の経過」で、今の段階を確かめます。','連絡したら「済み」にしてメモを残します。'],
  note:'',done:''},
 {id:'sales',title:'管理部売上',place:'管理部売上 → 売上',need:['page.sales'],link:'sales.html#tab-sales',go:'管理部売上を開く',
  cues:['売上','管理部売上','費用','確定','手入力'],
  steps:['「管理部売上」で月を選び、明細と集計を確かめます。','手で足す売上・費用は区分と根拠を書いて保存します。','月の内容が合っていれば「確定」します。'],
  note:'売上の確定は、送金やMFへの仕訳の登録ではありません。',done:''},
 {id:'meeting',title:'月末会議の資料',place:'管理部売上 → 月末会議の資料',need:['sales.meeting'],link:'sales.html#tab-meeting',go:'月末会議の資料を開く',
  cues:['月末会議','会議の資料','資料','目標','印刷'],
  steps:['「管理部売上」の「月末会議の資料」タブを開きます。','月を選ぶと資料ができます。目標は「目標」から直せます。','印刷して会議で使えます。'],
  note:'',done:''},
 {id:'submit',title:'経理へ提出する',place:'管理部売上 → 経理への提出',need:['acct.submit'],link:'sales.html#tab-sales',go:'管理部売上を開く',
  cues:['経理へ提出','提出','再提出','引継ぎを提出','月末の引継ぎ'],
  steps:['月を締めてから、「管理部売上」の「経理への提出」を開きます。','売上・費用・送金などの内容を確かめて提出します。','差し戻されたら、理由を見て直し、再提出します。'],
  note:'',done:''},
 {id:'receive',title:'経理：引継ぎを受け取る',place:'経理 → 賃貸管理部からの引継ぎ',need:['acct.receive'],link:'accounting.html#tab-handover',go:'経理の「引継ぎ」を開く',
  cues:['受領','差し戻し','受け取る','経理','引継ぎの受領'],
  steps:['「経理」の「賃貸管理部からの引継ぎ」タブを開きます。','届いた月の内容を確かめます。','合っていれば「受領」、直してほしいときは理由を書いて「差し戻し」ます。'],
  note:'',done:''},
 {id:'months',title:'ほかの月を見る',place:'入出金・管理部売上・経理の画面の上',any:['page.money','page.sales','page.acct'],link:'money.html',go:'入出金を開く',
  cues:['ほかの月','前の月','先月','次の月','月を選ぶ','月を変え','過去の月'],
  steps:['画面の上の「表示する月」で月を選びます。','「前の月」「次の月」のボタンでも切り替えられます。'],
  note:'',done:''},
 {id:'import',title:'Excelから取り込む',place:'物件・台帳 → Excelから取り込む',need:['act.import'],link:'import.html',go:'Excelから取り込むを開く',
  cues:['excel','エクセル','xlsx','台帳を取り込','名簿','一括'],
  steps:['「物件・台帳」の「Excelから取り込む」を開きます。','Excel・CSVの台帳を選び、列と欄の対応を確かめます。','取り込む前の確認で内容を見てから取り込みます。'],
  note:'CSVの銀行明細は「入出金」の「取り込み」で読み込みます。',done:''},
 {id:'dropbox',title:'書類（Dropbox）',place:'物件・部屋・契約の画面 → 書類',need:['doc.dbx'],link:'properties.html',go:'物件・台帳を開く',
  cues:['dropbox','ドロップボックス','書類','保管','ファイル','契約書','原本'],
  steps:['部屋の画面の「書類」タブに、Dropboxの書類が並びます。','名前で探して、「開く」で中身を見ます。','つながっていない書類は「この部屋につなぐ」でつなげます。'],
  note:'',done:''},
 {id:'ai',title:'AIの提案',place:'入出金の確認・対応の記録・名簿の列合わせ',any:['ai.match','ai.write','ai.columns'],link:'index.html',go:'ホームを開く',
  cues:['aiの','aiが','aiに','aiで','ai提案','提案','下書き','列合わせ'],
  steps:['AIは候補や下書きを出すだけです。決めるのは人です。','出てきた内容を必ず確かめてから使います。','お金の計算・送金・締め・本人確認にはAIを使いません。'],
  note:'',done:''},
 {id:'palette',title:'探す・移動（Ctrl＋K）',place:'ホーム → 探す・移動',need:['in.palette'],link:'index.html',go:'ホームを開く',
  cues:['探す','移動','ctrlk','ショートカット','検索'],
  steps:['ホームの「探す・移動」を押すか、Ctrl＋K を押します。','部屋・操作・欄の名前を入れて、Enter で開きます。'],
  note:'',done:''},
 {id:'msg',title:'文面のひな形',place:'ホーム → 文面のひな形',need:['in.msg'],link:'index.html',go:'ホームを開く',
  cues:['文面','ひな形','テンプレート','督促文','案内文'],
  steps:['督促・更新の案内・オーナーへの報告の文面を選びます。','内容を確かめてコピーし、メールなどに貼り付けます。'],
  note:'',done:''},
 {id:'flags',title:'機能の設定',place:'機能の設定',need:['settings'],link:'settings.html#tab-role',go:'機能の設定を開く',
  cues:['機能の設定','権限','オンオフ','役割','使えない','表示されない'],
  steps:['「役割ごと」で、役割ごとに機能のON/OFFを決めます。','一人だけ違うときは「人ごと」で決めます。','変更はすぐ保存され、「変更の記録」に残ります。'],
  note:'',done:''},
 {id:'myview',title:'自分の表示（じょのじょ）',place:'じょのじょ → 見た目／機能の設定 → 自分の表示',need:[],link:'settings.html#tab-me',go:'自分の表示を開く',
  cues:['じょのじょ','隠す','また出す','名前を変え','色','大きさ','表示'],
  steps:['じょのじょの「見た目」で、名前・色・大きさ・場所を変えられます。','「今は隠す」で右下から消えます。','また出すときは、検索欄の横の「じょのじょに聞く」か、「自分の表示」から出します。'],
  note:'この設定はあなたの画面だけに効きます。',done:''}
];
function canSec(s){
 if(!s)return false;
 try{
  if(s.need&&!s.need.every(function(k){return GK.can(k)}))return false;
  if(s.any&&!s.any.some(function(k){return GK.can(k)}))return false;
  return !s.link||!GK.linkOk||GK.linkOk(s.link);
 }catch(x){return false}
}
J.canSec=canSec;
J.section=function(id){return J.KNOW.filter(function(s){return s.id===id})[0]||null};

/* ---------- answering (port of lib/jonojo-chat.ts) ---------- */
var BUSINESS=/入金|請求|契約|送金|退去|csv|照合|登録|書類|売上|物件|オーナー|更新|承継|引継|権限|保証|家賃|賃料|顧客|件数|金額|残高|未収|管理料|経理|会計|手数料|費用|修繕|紐づ|紐付|入居|氏名|電話|住所|口座|締め|滞納|設定|台帳|部屋|メモ|記録/i;
function norm(t){return String(t||'').normalize('NFKC').toLowerCase().replace(/[\s、。・「」『』（）()／/：:→？?！!，,．.＋+ー-]/g,'')}
function grams(t){var v=norm(t),s={};for(var i=0;i<v.length-1;i++)s[v.slice(i,i+2)]=1;return s}
function keys(o){return Object.keys(o)}
J.norm=norm;
function greeting(now){
 var h=now.getHours(),d=now.getDay(),n=J.name();
 var g=h>=5&&h<10?'おはよう':h>=10&&h<17?'こんにちは':h>=17&&h<22?'おつかれさま':'夜おそくまでおつかれさま';
 var x=d===5&&h>=15?'もうすぐ週末だじょ。あと少しがんばるじょ！':d===1&&h<12?'月曜日だじょ。今週もよろしくだじょ。':h===12?'お昼休みはちゃんと取るじょ。':h>=21||h<5?'無理しないで、早めに休むじょ。':'';
 return g+'、'+n+'だじょ。賃貸管理の使い方なら聞いてほしいじょ！'+(x?'\n'+x:'');
}
J.greeting=greeting;
function smallTalk(t,rnd){
 if(Array.from(t).length>20||BUSINESS.test(t))return null;
 var n=J.name();
 var C=[[/かわい|可愛|きゃわ/,'てれるじょ…'],[/ありがと|サンキュ/,'どういたしましてだじょ！'],[/疲れ|つかれ|しんど|だる/,'おつかれさまだじょ。いっしょに伸びするじょ〜'],
  [/眠|ねむ/,'ふぁ…'+n+'も眠くなってきたじょ'],[/おなか|お腹|腹減|はらへ|ごはん|ランチ/,n+'は柿が食べたいじょ。'],[/おはよ/,'おはようだじょ！今日もがんばるじょ'],
  [/おつかれ|お疲れ|おやすみ/,'おつかれさま！ゆっくり休むじょ。'],[/名前|だれ|誰/,n+'だじょ。「見た目」で名前を変えられるじょ'],[/踊|ダンス|おどって/,'ノリノリだじょ〜♪'],
  [/すごい|えらい|天才|最高/,'ふふん、もっとほめていいじょ'],[/好き|すき/,n+'も好きだじょ！'],[/こんにち|こんばん|やあ|はじめまして/,'こんにちはだじょ！使い方を聞いてほしいじょ']];
 for(var i=0;i<C.length;i++)if(C[i][0].test(t))return {kind:'smalltalk',text:C[i][1]};
 var r=Math.max(0,Math.min(.999999,isFinite(rnd)?rnd:0)),p=function(v){return v[Math.floor(r*v.length)]};
 if(/じゃんけん|ジャンケン/.test(t))return {kind:'smalltalk',text:'じゃんけんぽん！'+n+'は'+p(['グー','チョキ','パー'])+'だじょ'};
 if(/占い|運勢|おみくじ/.test(t))return {kind:'smalltalk',text:'今日の運勢は'+p(['大吉','中吉','小吉','吉','末吉','ラッキー柿'])+'だじょ。焦らずひとつずつ進めるじょ。'};
 return null;
}
function rank(text){
 var q=grams(text),qk=keys(q),nq=norm(text);
 return J.KNOW.map(function(s){
  var T=grams(s.title),B=grams(s.steps.join('')+s.note),P=grams(s.place);
  var ov=function(G){return qk.filter(function(g){return G[g]}).length};
  var hit=qk.filter(function(g){return T[g]||B[g]||P[g]}).length;
  var cue=(s.cues||[]).reduce(function(a,w){return a+(nq.indexOf(norm(w))>=0?norm(w).length:0)},0);
  return {s:s,score:ov(T)*3+ov(P)*1.5+ov(B)+cue*8,hit:hit,cue:cue};
 }).sort(function(a,b){return b.score-a.score});
}
var CONTEXT={'index.html':['today','record','notask'],'properties.html':['room','props','dropbox'],'tenants.html':['tenants','call','idcheck'],'contracts.html':['confirm','renew','moveout'],
 'register.html':['register','docread','addr'],'turnover.html':['turnover','docread','idcheck'],'takeover.html':['takeover','docread','import'],'money.html':['mimport','mcheck','mclose'],
 'sales.html':['sales','meeting','submit'],'accounting.html':['receive','months'],'settings.html':['flags','myview'],'import.html':['import','register']};
function page(){var p=String((window.location&&location.pathname)||'').split('/').pop();return p||'index.html'}
J.page=page;
function suggest(n,except){
 var ids=(CONTEXT[page()]||[]).concat(['today','record','mcheck','props','myview']),out=[];
 ids.forEach(function(id){var s=J.section(id);if(s&&canSec(s)&&out.indexOf(s)<0&&(!except||except.indexOf(id)<0))out.push(s)});
 return out.slice(0,n||3);
}
J.suggest=suggest;
function manual(s){return {kind:'manual',sec:s.id,title:s.title,place:s.place,steps:s.steps.slice(0,4),note:s.note,link:s.link?{href:s.link,label:s.go||'画面を開く'}:null,
 text:'「'+s.title+'」のやり方だじょ。'}}
function fallback(rel){
 return {kind:'fallback',text:'うまく見つからなかったじょ。'+J.name()+'は使い方の案内だけできるじょ。実際の件数・金額・お客さまの情報には答えられないじょ。言い方を変えるか、近そうなものを選んでほしいじょ。',
  related:(rel&&rel.length?rel:suggest(3)).map(function(s){return {id:s.id,title:s.title}})};
}
/* text -> {kind:'manual'|'smalltalk'|'fallback'|'off', text, …}. Only manual text is returned; the question is not kept. */
J.answer=function(question,opts){
 opts=opts||{};
 var t=String(question==null?'':question).trim().slice(0,200);
 if(!t)return fallback();
 var st=smallTalk(t.normalize('NFKC'),opts.random==null?Math.random():opts.random);if(st)return st;
 if(!keys(grams(t)).length)return fallback();
 var R=rank(t),best=R[0],qn=keys(grams(t)).length;
 if(!best||(!best.cue&&(best.hit<2||best.hit/qn<.6))){
  return fallback(R.filter(function(r){return r.score>0&&canSec(r.s)}).slice(0,3).map(function(r){return r.s}));
 }
 if(!canSec(best.s))return {kind:'off',text:OFF_MSG,related:[]};
 return manual(best.s);
};
J.bySection=function(id){var s=J.section(id);if(!s)return fallback();if(!canSec(s))return {kind:'off',text:OFF_MSG};return manual(s)};

/* ---------- CSS (injected once) ---------- */
function css(){
 if(document.getElementById('gkJonoCss'))return;
 var st=document.createElement('style');st.id='gkJonoCss';
 st.textContent=
 '.gk-jono-fab{position:fixed;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:35;width:56px;height:56px;min-width:44px;min-height:44px;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;filter:drop-shadow(0 2px 4px rgba(27,37,53,.25))}'+
 '.gk-jono-fab[data-pos="bl"]{right:auto;left:calc(16px + env(safe-area-inset-left,0px))}'+
 '.gk-jono-fab[data-size="s"]{width:48px;height:48px}.gk-jono-fab[data-size="l"]{width:64px;height:64px}'+
 '.gk-jono-fab .gk-jono-svg{width:100%;height:100%;display:block}'+
 '.gk-jono-fab:focus-visible{outline:3px solid var(--primary);outline-offset:3px}'+
 '.gk-jono-fab[hidden],.gk-jono[hidden],.gk-jono-ask[hidden]{display:none!important}'+
 /* not over toasts or sticky action bars: move up while they are on screen */
 'body:has(#toast .toast) .gk-jono-fab{bottom:calc(76px + env(safe-area-inset-bottom,0px))}'+
 'body:has(.mz-sticky) .gk-jono-fab{bottom:calc(84px + env(safe-area-inset-bottom,0px))}'+
 '@media (prefers-reduced-motion:no-preference){.gk-jono-fab.is-hop{animation:gkJonoHop .6s ease-out 1}.gk-jono-fab:hover .gk-jono-svg{transform:translateY(-2px);transition:transform .15s}}'+
 '@keyframes gkJonoHop{0%,100%{transform:translateY(0)}35%{transform:translateY(-10px)}65%{transform:translateY(-3px)}}'+
 '.gk-jono{position:fixed;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:55;width:360px;max-width:calc(100vw - 32px);max-height:min(560px,calc(100vh - 110px));display:flex;flex-direction:column;background:var(--surface,#fff);color:var(--fg,#1b2535);border:1px solid var(--line,#dfe4ec);border-radius:14px;box-shadow:0 8px 28px rgba(27,37,53,.2);font-size:13.5px;overflow:hidden}'+
 '.gk-jono[data-pos="bl"]{right:auto;left:calc(16px + env(safe-area-inset-left,0px))}'+
 '.gk-jono-head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 12px;border-bottom:1px solid var(--line,#dfe4ec)}'+
 '.gk-jono-head .gk-jono-mini{width:32px;height:32px;flex:0 0 auto}'+
 '.gk-jono-head h2{font-size:15px;flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'+
 '.gk-jono-hb{min-width:44px;min-height:44px;border:1px solid var(--line,#dfe4ec);background:var(--surface,#fff);border-radius:8px;font-size:12.5px;padding:0 8px;color:var(--fg,#1b2535)}'+
 '.gk-jono-hb[aria-pressed="true"]{background:var(--primary-soft,#e9eefb);border-color:var(--primary,#3359f2)}'+
 '.gk-jono-body{flex:1 1 auto;overflow-y:auto;overflow-x:hidden;padding:10px 12px;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain}'+
 '.gk-jono-note{font-size:11.5px;color:var(--muted,#596579);line-height:1.5}'+
 '.gk-jono-log{display:flex;flex-direction:column;gap:8px}'+
 '.gk-jono-msg{border-radius:12px;padding:8px 10px;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;line-height:1.6}'+
 '.gk-jono-msg.bot{border:1px solid var(--line,#dfe4ec);margin-right:12px;background:var(--surface,#fff)}'+
 '.gk-jono-msg.mine{background:var(--surface-2,#edf0f5);margin-left:32px}'+
 '.gk-jono-msg ol{margin:6px 0 0;padding-left:1.4em;white-space:normal}.gk-jono-msg li+li{margin-top:3px}'+
 '.gk-jono-msg .pl{display:block;font-size:12px;color:var(--muted,#596579);white-space:normal}'+
 '.gk-jono-msg .nt{display:block;margin-top:6px;font-size:12px;color:var(--muted,#596579);white-space:normal}'+
 '.gk-jono-link{display:inline-flex;align-items:center;min-height:44px;margin-top:6px;padding:0 12px;border-radius:8px;background:var(--primary,#3359f2);color:var(--primary-fg,#fff);text-decoration:none;font-weight:500;white-space:normal}'+
 '.gk-jono-chips{display:flex;flex-wrap:wrap;gap:6px}'+
 '.gk-jono-chip{min-height:44px;border:1px solid var(--input,#cbd3df);background:var(--surface,#fff);border-radius:999px;padding:0 12px;font-size:12.5px;color:var(--fg,#1b2535);max-width:100%;text-align:left}'+
 '.gk-jono-chip:hover{background:var(--primary-soft,#e9eefb)}'+
 '.gk-jono-form{display:flex;gap:6px;padding:8px 12px calc(10px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line,#dfe4ec)}'+
 '.gk-jono-form input{flex:1 1 auto;min-width:0;min-height:44px;border:1px solid var(--input,#cbd3df);border-radius:8px;padding:0 10px;font-size:16px;background:var(--surface,#fff)}'+
 '.gk-jono-form button{min-height:44px;min-width:56px;border:0;border-radius:8px;background:var(--primary,#3359f2);color:var(--primary-fg,#fff);font-weight:500}'+
 '.gk-jono-form button:disabled{opacity:.5}'+
 '.gk-jono-set{display:flex;flex-direction:column;gap:10px}'+
 '.gk-jono-set fieldset{border:0;margin:0;padding:0;min-width:0}.gk-jono-set legend,.gk-jono-set .lb{font-weight:500;font-size:13px;margin-bottom:4px;padding:0}'+
 '.gk-jono-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}'+
 '.gk-jono-row input{flex:1 1 140px;min-width:0;min-height:44px;border:1px solid var(--input,#cbd3df);border-radius:8px;padding:0 10px;font-size:16px;background:var(--surface,#fff)}'+
 '.gk-jono-opt{min-height:44px;min-width:44px;border:1px solid var(--input,#cbd3df);background:var(--surface,#fff);border-radius:8px;padding:0 10px;font-size:12.5px;display:inline-flex;align-items:center;gap:6px;color:var(--fg,#1b2535)}'+
 '.gk-jono-opt[aria-pressed="true"],.gk-jono-opt[aria-checked="true"]{border-color:var(--primary,#3359f2);background:var(--primary-soft,#e9eefb);font-weight:700}'+
 '.gk-jono-sw{width:14px;height:14px;border-radius:50%;display:inline-block;border:1px solid rgba(0,0,0,.2)}'+
 '.gk-jono-st{font-size:12px;color:var(--ok,#1d7148);min-height:1em}'+
 '.gk-jono-ask{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 8px;border:0;background:none;color:var(--primary,#3359f2);font-size:12.5px;text-decoration:underline;text-underline-offset:2px;white-space:nowrap;cursor:pointer}'+
 '.gk-jono-ask .gk-jono-svg{width:20px;height:20px}'+
 '.gk-jono-page .gk-jono-set{max-width:560px}'+
 '@media (max-width:640px){'+
  '.gk-jono,.gk-jono[data-pos="bl"]{left:0;right:0;bottom:0;width:100%;max-width:100%;max-height:70vh;border-radius:16px 16px 0 0;border-bottom:0}'+
  'body.gk-jono-open .gk-jono-fab{display:none}'+
  '.gk-jono-msg.mine{margin-left:20px}.gk-jono-msg.bot{margin-right:0}'+
 '}';
 (document.head||document.body).appendChild(st);
}

/* ---------- the floating button and the panel ---------- */
var S={open:false,view:'chat',msgs:[],ret:null,said:false};
function fab(){return document.getElementById('gkJonoFab')}
function panel(){return document.getElementById('gkJonoPanel')}
function mount(){
 if(!document.body)return;
 css();
 var b=fab();
 if(!b){b=document.createElement('button');b.type='button';b.id='gkJonoFab';b.className='gk-jono-fab';b.setAttribute('aria-controls','gkJonoPanel');b.setAttribute('aria-expanded','false');document.body.appendChild(b)}
 paintFab();
}
function paintFab(){
 var b=fab();if(!b)return;var p=J.prefs(),c=color();
 b.innerHTML=J.svg(c[2],c[3]);
 b.setAttribute('aria-label',p.name+'に聞く（使い方の案内）');b.setAttribute('title',p.name+'に聞く');
 b.setAttribute('data-size',p.size);b.setAttribute('data-pos',p.pos);
 b.hidden=!J.shown();
 b.setAttribute('aria-expanded',S.open?'true':'false');
}
function hop(){var b=fab();if(!b||reduced())return;b.classList.remove('is-hop');setTimeout(function(){var x=fab();if(x)x.classList.add('is-hop')},0);setTimeout(function(){var x=fab();if(x)x.classList.remove('is-hop')},700)}
/* opts: {ret: element to focus on close, q: a question to ask at once, unhide: true from a search link} */
J.open=function(opts){
 opts=opts||{};
 if(!J.available()){if(GK.toast)GK.toast('じょのじょは今は使えない設定になっています。管理者にご相談ください。');return false}
 if(J.prefs().hidden){
  if(!opts.unhide)return false;
  J.savePrefs({hidden:false});if(GK.toast)GK.toast(J.name()+'をまた出したじょ');
 }
 S.ret=opts.ret||document.activeElement;S.open=true;
 if(opts.view)S.view=opts.view;
 if(!S.msgs.length)S.msgs.push({mine:false,r:{kind:'hello',text:greeting(new Date())}});
 renderPanel();
 if(opts.q)ask(opts.q);
 focusIn();
 return true;
};
J.close=function(noReturn){
 if(!S.open)return;S.open=false;S.view='chat';
 var p=panel();if(p)p.remove();
 try{document.body.classList.remove('gk-jono-open')}catch(x){}
 paintFab();
 var r=S.ret;S.ret=null;
 if(!noReturn){var f=fab();var t=r&&document.body.contains(r)&&r.offsetParent!==null?r:(f&&!f.hidden?f:null);if(t&&t.focus)try{t.focus()}catch(x){}}
};
J.isOpen=function(){return S.open};
function focusIn(){var p=panel();if(!p)return;var t=S.view==='set'?p.querySelector('#gkJonoP-name'):p.querySelector('#gkJonoQ');if(!t)t=p.querySelector('button');if(t)try{t.focus()}catch(x){}}
function msgHtml(m){
 if(m.mine)return '<div class="gk-jono-msg mine"><span class="sr">あなた：</span>'+e(m.text)+'</div>';
 var r=m.r,h='<div class="gk-jono-msg bot"><span class="sr">'+e(J.name())+'：</span>'+e(r.text);
 if(r.kind==='manual'){
  h+='<span class="pl">開く場所：'+e(r.place)+'</span><ol>'+r.steps.map(function(s){return '<li>'+e(s)+'</li>'}).join('')+'</ol>';
  if(r.note)h+='<span class="nt">'+e(r.note)+'</span>';
  if(r.link&&(!GK.linkOk||GK.linkOk(r.link.href)))h+='<a class="gk-jono-link" href="'+e(r.link.href)+'" data-jono-go="1">'+e(r.link.label)+'</a>';
 }
 if(r.related&&r.related.length)h+='<div class="gk-jono-chips" role="group" aria-label="近そうなもの">'+r.related.map(function(x){return '<button type="button" class="gk-jono-chip" data-jono-sec="'+e(x.id)+'">'+e(x.title)+'</button>'}).join('')+'</div>';
 return h+'</div>';
}
function chatHtml(){
 var chips=suggest(3);
 return '<p class="gk-jono-note">使い方の案内だけ答えるじょ。質問はどこにも送らず、保存もしないじょ。</p>'+
  '<div class="gk-jono-log" id="gkJonoLog" aria-live="polite">'+S.msgs.map(msgHtml).join('')+'</div>'+
  (chips.length?'<div class="gk-jono-chips" role="group" aria-label="よくある質問">'+chips.map(function(s){return '<button type="button" class="gk-jono-chip" data-jono-sec="'+e(s.id)+'">'+e(s.title)+'</button>'}).join('')+'</div>':'');
}
/* the preferences form: scope 'P' (in the panel) or 'S' (機能の設定 → 自分の表示) */
J.prefsHtml=function(scope){
 scope=scope==='page'||scope==='S'?'S':'P';
 var x='gkJono'+scope+'-',p=J.prefs(),av=J.available();
 if(scope==='S'&&!av)return '<div class="gk-jono-page"><h2>じょのじょ</h2><p class="fl-note">じょのじょは今は使えない設定になっています。管理者にご相談ください。</p></div>';
 var opt=function(k,v,label,on,extra){return '<button type="button" class="gk-jono-opt" data-jono-set="'+k+'" data-v="'+e(v)+'" aria-pressed="'+(on?'true':'false')+'">'+(extra||'')+e(label)+'</button>'};
 var h='<div class="gk-jono-set" data-jono-form="'+scope+'">';
 if(scope==='S'){
  h+='<div><h2>じょのじょ</h2><p class="fl-note">画面の右下に出る、使い方の案内役です。この設定はあなたの画面だけに効きます。'+e(NOTE_PROTO)+'</p></div>'+
   '<div class="gk-jono-row"><span class="lb" id="'+x+'shownL">表示する</span><button type="button" class="gk-jono-opt" role="switch" id="'+x+'shown" data-jono-set="shown" aria-labelledby="'+x+'shownL" aria-checked="'+(!p.hidden)+'">'+(p.hidden?'OFF（今は隠しています）':'ON')+'</button></div>';
 }
 h+='<div><label class="lb" for="'+x+'name">名前（10文字まで）</label><div class="gk-jono-row"><input id="'+x+'name" maxlength="20" autocomplete="off" value="'+e(p.name)+'"><button type="button" class="gk-jono-opt" data-jono-set="name">名前を保存</button></div></div>'+
  '<fieldset><legend>色</legend><div class="gk-jono-row">'+J.COLORS.map(function(c){return opt('color',c[0],c[1],p.color===c[0],'<span class="gk-jono-sw" style="background:'+c[2]+'" aria-hidden="true"></span>')}).join('')+'</div></fieldset>'+
  '<fieldset><legend>大きさ</legend><div class="gk-jono-row">'+J.SIZES.map(function(s){return opt('size',s[0],s[1],p.size===s[0])}).join('')+'</div></fieldset>'+
  '<fieldset><legend>出す場所</legend><div class="gk-jono-row">'+J.POS.map(function(s){return opt('pos',s[0],s[1],p.pos===s[0])}).join('')+'</div></fieldset>'+
  '<div class="gk-jono-row">'+(scope==='P'?'<button type="button" class="gk-jono-opt" data-jono-set="hide">今は隠す</button>':'')+'<button type="button" class="gk-jono-opt" data-jono-set="reset">最初の見た目に戻す</button></div>'+
  (scope==='P'?'<p class="gk-jono-note">隠したあとは、検索欄の横の「'+e(p.name)+'に聞く」か、「自分の表示」からまた出せるじょ。</p>':'')+
  '<p class="gk-jono-st" id="'+x+'st" role="status"></p></div>';
 return h;
};
function renderPanel(){
 var p=panel();
 if(!S.open){if(p)p.remove();return}
 var pr=J.prefs(),c=color();
 if(!p){p=document.createElement('section');p.id='gkJonoPanel';p.className='gk-jono';p.setAttribute('role','dialog');p.setAttribute('aria-modal','false');p.setAttribute('aria-labelledby','gkJonoT');document.body.appendChild(p);
  p.addEventListener('keydown',function(ev){if(ev.key==='Escape'){ev.preventDefault();ev.stopPropagation();J.close()}})}
 p.setAttribute('data-pos',pr.pos);
 var set=S.view==='set';
 p.innerHTML='<div class="gk-jono-head">'+J.svg(c[2],c[3],'gk-jono-svg gk-jono-mini')+'<h2 id="gkJonoT">'+e(set?pr.name+'の見た目':pr.name+'に聞く')+'</h2>'+
  '<button type="button" class="gk-jono-hb" data-jono-view="'+(set?'chat':'set')+'" aria-pressed="'+set+'">見た目</button>'+
  '<button type="button" class="gk-jono-hb" data-jono-close="1" aria-label="閉じる">×</button></div>'+
  '<div class="gk-jono-body" id="gkJonoBody"><p class="gk-jono-note">'+e(NOTE_PROTO)+'</p>'+(set?J.prefsHtml('P'):chatHtml())+'</div>'+
  (set?'':'<form class="gk-jono-form" id="gkJonoForm" autocomplete="off"><label class="sr" for="gkJonoQ">'+e(pr.name)+'への質問</label><input id="gkJonoQ" maxlength="200" placeholder="使い方を聞く（例：送金のやり方）" enterkeyhint="send"><button type="submit" id="gkJonoSend">聞く</button></form>');
 try{document.body.classList.add('gk-jono-open')}catch(x){}
 paintFab();
 var body=document.getElementById('gkJonoBody');if(body&&!set)body.scrollTop=1e6;
}
function ask(text,secId){
 var t=String(text||'').trim().slice(0,200);
 var r=secId?J.bySection(secId):J.answer(t);if(!secId&&!t)return;
 S.msgs.push({mine:true,text:secId?(J.section(secId)||{}).title||t:t});S.msgs.push({mine:false,r:r});
 if(S.msgs.length>40)S.msgs=S.msgs.slice(-40);
 S.view='chat';renderPanel();
 if(r.kind==='smalltalk'||r.kind==='manual')hop();
 var q=document.getElementById('gkJonoQ');if(q)try{q.focus()}catch(x){}
}
J.ask=function(t){if(!S.open&&!J.open())return null;ask(t);return S.msgs[S.msgs.length-1].r};
J.messages=function(){return S.msgs.slice()};

/* re-draw after a change of preferences / feature flags (this tab or another one) */
J.refresh=function(){
 try{
  if(S.open&&!J.shown()){J.close(true)}
  paintFab();
  if(S.open)renderPanel();
  document.querySelectorAll('[data-jono-form="S"]').forEach(function(f){var a=document.activeElement,k=a&&a.getAttribute&&a.getAttribute('data-jono-set'),v=a&&a.getAttribute&&a.getAttribute('data-v');
   f.outerHTML=J.prefsHtml('S');
   if(k){var n=document.querySelector('[data-jono-form="S"] [data-jono-set="'+k+'"]'+(v?'[data-v="'+v+'"]':''));if(n)try{n.focus()}catch(x){}}});
  links();
 }catch(x){if(window.console)console.error(x)}
};

/* ---------- 「じょのじょに聞く」 next to the search boxes ---------- */
var SEARCH={'index.html':['mock-search'],'properties.html':['pq','rq','oq'],'tenants.html':['q'],'contracts.html':['q'],'accounting.html':['acQ'],'turnover.html':['r-q'],'settings.html':['fq']};
function askBtn(where){return '<button type="button" class="gk-jono-ask" data-jono-ask="'+e(where)+'">'+J.svg(color()[2],color()[3])+e(J.name())+'に聞く</button>'}
J.askBtn=askBtn;
function links(){
 if(!document.body)return;
 var av=J.available(),nm=J.name();
 document.querySelectorAll('[data-jono-ask]').forEach(function(b){
  if(!av){b.remove();return}
  var want=nm+'に聞く';if(b.textContent!==want){var c=color();b.innerHTML=J.svg(c[2],c[3])+e(want)}
 });
 if(!av)return;
 (SEARCH[page()]||[]).forEach(function(id){
  var inp=document.getElementById(id);if(!inp||(inp.closest&&inp.closest('.gk-jono,.pal,[role="dialog"]')))return;
  var host=inp.parentNode&&inp.parentNode.classList&&inp.parentNode.classList.contains('search')&&inp.parentNode.children.length===1?inp.parentNode:inp;
  var par=host.parentNode;if(!par)return;
  var kids=par.children,nx=kids[Array.prototype.indexOf.call(kids,host)+1];
  if(nx&&nx.getAttribute&&nx.getAttribute('data-jono-ask'))return;
  var tmp=document.createElement('div');tmp.innerHTML=askBtn('search');
  if(host.insertAdjacentElement)host.insertAdjacentElement('afterend',tmp.children[0]);
 });
}
J.links=links;

/* ---------- events ---------- */
function onClick(ev){
 var t=ev.target&&ev.target.closest?ev.target:null;if(!t)return;
 var a;
 if((a=t.closest('#gkJonoFab'))){if(S.open)J.close();else J.open({ret:a});return}
 if((a=t.closest('[data-jono-ask]'))){ev.preventDefault();if(S.open){focusIn();return}J.open({ret:a,unhide:true});return}
 if((a=t.closest('[data-jono-close]'))){J.close();return}
 if((a=t.closest('[data-jono-view]'))){S.view=a.getAttribute('data-jono-view');renderPanel();if(S.view==='set'){var n=document.querySelector('#gkJonoPanel [data-jono-view]');if(n)n.focus()}else focusIn();return}
 if((a=t.closest('[data-jono-sec]'))){ask('',a.getAttribute('data-jono-sec'));return}
 if((a=t.closest('[data-jono-go]'))){
  var href=a.getAttribute('href')||'',pg=href.split('#')[0],h=href.indexOf('#')>=0?href.slice(href.indexOf('#')):'';
  if(pg===page()){ev.preventDefault();J.close(true);try{if(h&&location.hash!==h){location.hash=h;if(['money.html','sales.html','accounting.html'].indexOf(pg)<0)location.reload()}}catch(x){}}
  return;
 }
 if((a=t.closest('[data-jono-set]')))setPref(a);
}
function say(scope,msg){var s=document.getElementById('gkJono'+scope+'-st');if(s){s.textContent='';setTimeout(function(){var x=document.getElementById('gkJono'+scope+'-st');if(x)x.textContent=msg},30)}}
function setPref(b){
 var f=b.closest('[data-jono-form]'),scope=f?f.getAttribute('data-jono-form'):'P',k=b.getAttribute('data-jono-set'),v=b.getAttribute('data-v');
 var r,msg='保存しました';
 if(k==='name'){var inp=document.getElementById('gkJono'+scope+'-name');r=J.savePrefs({name:inp?inp.value:''});msg='名前を「'+r.prefs.name+'」にしました'}
 else if(k==='color'||k==='size'||k==='pos'){var o={};o[k]=v;r=J.savePrefs(o)}
 else if(k==='reset'){var hid=J.prefs().hidden;r=J.savePrefs({name:J.DEF.name,color:J.DEF.color,size:J.DEF.size,pos:J.DEF.pos,hidden:hid});msg='最初の見た目に戻しました';
  if(GK.toast)GK.toast('じょのじょを最初の見た目に戻しました',function(){r.undo();GK.toast('元に戻しました')})}
 else if(k==='hide'){r=J.savePrefs({hidden:true});J.close(true);J.refresh();
  if(GK.toast)GK.toast(r.prefs.name+'を隠しました。検索欄の横の「'+r.prefs.name+'に聞く」か「自分の表示」からまた出せます',function(){r.undo();GK.toast(J.name()+'をまた出しました')});
  var nx=document.querySelector('[data-jono-ask]')||document.getElementById('main');if(nx&&nx.focus)try{nx.focus()}catch(x){}
  return}
 else if(k==='shown'){var nowHidden=!J.prefs().hidden;r=J.savePrefs({hidden:nowHidden});msg=nowHidden?r.prefs.name+'を隠しました':r.prefs.name+'を表示しました'}
 else return;
 J.refresh();
 var n=document.querySelector('[data-jono-form="'+scope+'"] [data-jono-set="'+k+'"]'+(v?'[data-v="'+v+'"]':''));if(n)try{n.focus()}catch(x){}
 say(scope,msg);
}
function onSubmit(ev){
 if(!ev.target||ev.target.id!=='gkJonoForm')return;ev.preventDefault();
 var q=document.getElementById('gkJonoQ');if(q&&q.value.trim())ask(q.value);
}
/* production: typing exactly 「じょのじょ」 in a search box calls it (and shows it again when it was hidden) */
function onInput(ev){
 var t=ev.target;if(!t||t.tagName!=='INPUT'||ev.isComposing)return;
 if(t.type!=='search'&&t.id!=='pal-q')return;
 var v=String(t.value||'').normalize('NFKC').trim();
 if((v==='じょのじょ'||v==='ジョノジョ'||v===J.name())&&J.available()&&!S.open)J.open({ret:t,unhide:true});
}
function onKey(ev){
 if(ev.key==='Enter'&&ev.target&&ev.target.id==='gkJonoP-name'){ev.preventDefault();var b=document.querySelector('[data-jono-form="P"] [data-jono-set="name"]');if(b)setPref(b)}
 if(ev.key==='Enter'&&ev.target&&ev.target.id==='gkJonoS-name'){ev.preventDefault();var c=document.querySelector('[data-jono-form="S"] [data-jono-set="name"]');if(c)setPref(c)}
}

/* feature switches changed in this tab (機能の設定): follow them at once */
if(typeof GK.flagSet==='function'){
 var fs0=GK.flagSet;
 GK.flagSet=function(){var r=fs0.apply(this,arguments);if(r&&r.ok){setTimeout(J.refresh,0);var u=r.undo;if(typeof u==='function')r.undo=function(){var x=u.apply(this,arguments);setTimeout(J.refresh,0);return x}}return r};
}
var obsT=null;
function boot(){
 try{
  mount();links();
  document.addEventListener('click',onClick);
  document.addEventListener('submit',onSubmit);
  document.addEventListener('input',onInput);
  document.addEventListener('keydown',onKey);
  if(typeof MutationObserver==='function'){
   var mo=new MutationObserver(function(){if(obsT)return;obsT=setTimeout(function(){obsT=null;try{links();if(!fab())mount()}catch(x){}},0)});
   mo.observe(document.body,{childList:true,subtree:true});
  }
  if(window.addEventListener){
   window.addEventListener('storage',function(ev){if(ev&&(ev.key===GK.KEY||ev.key===null))setTimeout(J.refresh,0)});
   window.addEventListener('pageshow',function(ev){if(ev&&ev.persisted)setTimeout(J.refresh,0)});
  }
 }catch(x){if(window.console)console.error(x)}
}
if(document.body)boot();else if(document.addEventListener)document.addEventListener('DOMContentLoaded',boot);
})();
