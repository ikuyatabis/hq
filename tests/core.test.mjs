import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {parseClinicSource,wordRule,parseConditions,buildPrompt,countWords,exampleConditions,suggestedDeduction,conditionPresets,contentPenaltyDefaults,applyContentPenalties} from '../grading-core.mjs';

const data=`const COMMON=["【最終回答の構成：３部構成】","得点：〈最終得点〉","共通の採点指示"].join("\\n");\n`+
`const RUBRIC={opinion:["意見採点"].join("\\n"),chart:["図表採点"].join("\\n"),task:["課題採点"].join("\\n")};\n`+
`const texts=["【ファイル出力：Word経由でPDF生成】同内容のファイルを作る","【Word書式：共通仕様】Wordの規定","【PDF書式：Wordから変換】PDFの規定","【完成英文・書き起こし答案の段落・空白】段落の規定","【保留】保留時はファイルを作らない","【失敗時】ファイル生成に失敗した場合の規定","採点前に設問の語数条件（テスト条件）を確認する","複数空所では，各空所の指示語数を確認する","語数は生徒が実際に書いた英語の解答部分のみを空白区切りで数える"];`;
const clinic=parseClinicSource(data);
const example={kind:'opinion',maxScore:50,problemMode:'file',answerMode:'file',problemText:'',answerText:'',word:{mode:'approx',approx:100},conditions:exampleConditions(),outputMode:'word'};

test('診療所の共通・分類別・出力指示を構造解析し，実行しない',()=>{
  assert.equal(clinic.common.includes('共通の採点指示'),true);
  assert.equal(clinic.rubrics.opinion,'意見採点');
  assert.match(clinic.exportTexts.word,/Wordの規定/);
});
test('形式はWord標準・Word＋PDF・画面のみの3択',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const order=[...html.matchAll(/name="outputMode"[^>]*value="([^"]+)"/g)].map(x=>x[1]);
  assert.deepEqual(order,['word','both','screen']);
  assert.match(html,/name="outputMode"[^>]*value="word" checked/);
  assert.match(html,/name="problemMode"[^>]*value="file" checked/);
  assert.match(html,/name="answerMode"[^>]*value="file" checked/);
});
test('50点・25点ずつの例とWordのみを生成',()=>{
  const p=buildPrompt(example,clinic);
  assert(p.includes('あなたは大学受験英語の指導に精通し，大学入試の自由英作文の採点・添削を専門とする英語講師です。'));
  assert.doesNotMatch(p,/現行main|持ち込み診療所|診療所準拠|秘密基地/);
  assert.match(p,/今回の満点は50点/);
  assert.match(p,/「長所の記述」が実質的に欠けている場合，内容面で－25点/);
  assert.match(p,/「短所の記述」が実質的に欠けている場合，内容面で－25点/);
  assert.match(p,/Word（.docx）のみ/);
  assert.doesNotMatch(p,/【PDF書式：Wordから変換】/);
  assert.match(p,/写真・PDF/);
  assert.match(p,/得点：〈今回の得点〉／50点/);
});
test('Word＋PDFならPDFの追加指示，画面のみならファイル指示なし',()=>{
  assert.match(buildPrompt({...example,outputMode:'both'},clinic),/【PDF書式：Wordから変換】/);
  assert.doesNotMatch(buildPrompt({...example,outputMode:'screen'},clinic),/【ファイル出力：Word経由でPDF生成】/);
});
test('語数規則：100語程度は90～110，80～120は厳密',()=>{
  assert.match(wordRule({mode:'approx',approx:100}),/90～110語/);
  assert.match(wordRule({mode:'range',low:80,high:120}),/80～120語/);
  assert.match(wordRule({mode:'none'}),/語数減点は0点/);
  assert.match(wordRule({mode:'approx',approx:35}),/短答特例/);
});
test('個別ルールの不完全入力，答案の未入力，基準構造破損で停止',()=>{
  assert.throws(()=>parseConditions([{label:'長所がない',points:''}]),/減点/);
  assert.throws(()=>buildPrompt({...example,answerMode:'text'},clinic),/答案を入力/);
  assert.throws(()=>parseClinicSource('古いHTML'),/取得できません/);
});
test('語数は句読点単独を除外',()=>assert.equal(countWords('I like it. . Thanks!'),4));

test('サイト名称は秘密基地，ルートで動く相対パスを使用',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<title>秘密基地｜セミオーダー添削<\/title>/);
  assert.match(html,/<h1>秘密基地｜セミオーダー添削<\/h1>/);
  assert.match(html,/<style>/);
  assert.match(html,/src="\.\/site\.mjs(?:\?v=[^"]+)?"/);
  assert.doesNotMatch(html,/先生の採点室/);
});

test('例の入力ボタンはテスト済みの共通データを使用する',()=>{
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="exampleConditions"[^>]*>設定例<\/button>/);
  assert.match(html,/<dialog id="conditionExamplesDialog"/);
  assert.match(site,/conditionPresets\(valid\?max\.value:0\)/);
  assert.match(html,/id="conditionExamplesScore"/);
  assert.doesNotMatch(html,/同じ欠落に対して、特別減点と通常の内容減点を重ねないよう指示します。/);
  assert.match(site,/各項目は５点刻みで切り下げ/);
  assert.match(site,/for\(const \{label,points\} of preset\.items\)\{/);
  assert.match(site,/else addCondition\(label,points\)/);
  assert.match(site,/!name\.value\.trim\(\)&&!score\.value\.trim\(\)&&!score\.validity\.badInput/);
  assert.doesNotMatch(site,/el\('conditionList'\)\.replaceChildren\(/);
  assert.doesNotMatch(site,/inp\.placeholder\s*=/);
  assert.deepEqual(exampleConditions(),[{label:'長所の記述',points:25},{label:'短所の記述',points:25}]);
});
test('目安語数の下限と10語刻みはHTMLと生成側で一致する',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="approxWords" type="number" min="10" max="5000" step="10" value="100" aria-label="目安語数">words程度/);
  assert.match(html,/value="approx" checked>＿＿ words程度/);
  assert.match(html,/value="range">＿＿ ～ ＿＿ words/);
  assert.match(html,/id="lowWords" type="number" min="10" max="5000" step="10" value="80" aria-label="語数の下限">～/);
  assert.match(html,/id="highWords" type="number" min="10" max="5000" step="10" value="120" aria-label="語数の上限">words/);
  assert.match(wordRule({mode:'range',low:75,high:105}),/75～105語/);
  assert.throws(()=>wordRule({mode:'approx',approx:9}),/10～5000/);
  assert.match(wordRule({mode:'approx',approx:10}),/語数減点0点/);
  assert.match(wordRule({mode:'range',low:1,high:10}),/語数減点0点/);
});

test('指示文の個別表示は設けず、出力形式の既定値はWordとする',()=>{
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(html,/previewPrompt|previewPanel|指示文を表示/);
 assert.doesNotMatch(site,/previewPrompt|previewPanel/);
 assert.match(html,/name="outputMode" type="radio" value="word" checked/);
 assert.match(html,/value="screen"><span><strong>画面表示のみ<\/strong>/);
});

test('特別減点の減点幅の例示は半角数字と入力値と同じ色を使用する',()=>{
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');
  assert.match(site,/input\.placeholder=points>0\?String\(points\):''/);
  assert.doesNotMatch(site,/point\.placeholder='[0-9０-９]+'/);
  for(const source of [html,css])assert.match(source,/\.condition-points::placeholder\{color:var\(--ink\);opacity:1\}/);
  assert.match(html,/src="\.\/site\.mjs\?v=20261127-18"/);
});

test('満点の半分を5点刻みで切り下げ、例示にも使用する',()=>{
  for(const [max,expected] of [[100,50],[75,35],[55,25],[50,25],[45,20],[40,20],[35,15],[30,15],[21,10],[19,5],[10,5],[9,0],[1,0]]){
    assert.equal(suggestedDeduction(max),expected);
    assert.equal(suggestedDeduction(String(max)),expected);
    assert.deepEqual(exampleConditions(max).map(item=>item.points),expected?[expected,expected]:[]);
    if(expected)assert.match(buildPrompt({...example,maxScore:max,conditions:exampleConditions(max)},clinic),new RegExp('内容面で－'+expected+'点'));
  }
  for(const invalid of ['',0,1001,NaN,50.5])assert.equal(suggestedDeduction(invalid),0);
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  assert.match(site,/syncInvalidAnswerPenalty\(\);syncSuggestedDeduction\(\)/);
  assert.match(site,/append\(group\);syncSuggestedDeduction\(\)/);
});

test('設定例は3種類、図表は概要と3項目の変化を示す',()=>{
  const presets=conditionPresets(50);
  assert.deepEqual(presets.map(p=>p.title),['長所と短所を述べる問題','理由を２つ述べる問題','図表を説明する問題']);
  assert.deepEqual(presets[0].items,exampleConditions(50));
  assert.deepEqual(presets[1].items.map(x=>x.points),[25,25]);
  assert.deepEqual(presets[2].items,[{label:'図表が表す内容の説明',points:10},...['１','２','３'].map(n=>({label:'項目'+n+'「　　　　　」の変化の説明',points:15}))]);
  assert.deepEqual(conditionPresets(40).map(p=>p.items.map(x=>x.points)),[[20,20],[20,20],[10,10,10,10]]);
  assert.deepEqual(conditionPresets(),conditionPresets(40));
  assert.deepEqual(conditionPresets(30).map(p=>p.items.map(x=>x.points)),[[15,15],[15,15],[5,10,10,10]]);
  assert.deepEqual(conditionPresets(100).map(p=>p.items.map(x=>x.points)),[[50,50],[50,50],[25,30,30,30]]);
  assert(conditionPresets(0).every(p=>p.items.every(x=>x.points===0)));
});

test('分類別の内容面減点は既存の規定の点数だけを置換する',()=>{
  assert.deepEqual(contentPenaltyDefaults('opinion'),{B:20,C:10,D:10});
  assert.deepEqual(contentPenaltyDefaults('task'),{B:20,C:10,D:10});
  assert.deepEqual(contentPenaltyDefaults('chart'),{C:10});
  const original='A：要求漏れは－20点。\nB：重大な矛盾は一律－20点。軽微な不足は不問。\nC：趣旨不明確は一律－10点。\nD：重大な冗長さは一律－10点。';
  const overrides={B:15,C:5,D:0};
  const changed=applyContentPenalties(original,'opinion',overrides);
  assert.equal(changed,'A：要求漏れは－20点。\nB：重大な矛盾は一律－15点。軽微な不足は不問。\nC：趣旨不明確は一律－5点。\nD：重大な冗長さは一律－0点（この項目による減点なし）。');
  const chart='内容上の著しい不整合は一律－5点。\n趣旨不明確・テーマとの関連不明確は一律－10点。図表と矛盾する明白な誤認は－10点。';
  assert.equal(applyContentPenalties(chart,'chart',{C:5}),'内容上の著しい不整合は一律－5点。\n趣旨不明確・テーマとの関連不明確は一律－5点。図表の明白な誤認は該当する個別項目の誤りとして評価し，独立した一律減点は行わない。同一原因の減点は重ねない。');
  assert.throws(()=>applyContentPenalties(original,'opinion',{B:-1,C:5,D:0}),/整数/);
  assert.throws(()=>applyContentPenalties(original,'opinion',{B:15,C:'',D:0}),/整数/);
  assert.throws(()=>applyContentPenalties('基準変更','opinion',overrides),/生成を停止/);
  const p=buildPrompt({...example,contentPenalties:overrides},{...clinic,rubrics:{...clinic.rubrics,opinion:original}});
  assert(p.includes(changed));
  assert(!p.includes(original));
  assert(p.includes('0点指定はその項目による減点なし'));
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const [id,value] of [['B',20],['C',10],['D',10]])assert(html.includes('id="contentPenalty'+id+'" type="number" min="0" max="1000" step="5" value="'+value+'"'));
});

test('画面の初期満点は40点、根本的な読み違いの初期減点も40点',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="maxScore" type="number" min="0" max="1000" step="5" value="40"/);
  assert.match(html,/id="invalidAnswerPenalty" type="number" min="0" max="40" step="5" value="40"/);
  assert.equal(suggestedDeduction(40),20);
});

test('満点は5点刻みのスピナーと任意の整数入力を両立する',()=>{
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  assert.match(site,/function validMaxScore\(input\)/);
  assert(site.includes("input.value===''") );
  assert.match(site,/Number\(input.value\)>=0&&Number\(input.value\)<=1000/);
  assert.match(site,/if\(!validMaxScore\(max\)\|\|Number\(max.value\)===0\)return/);
  assert.match(site,/const valid=validMaxScore\(max\)/);
  assert.doesNotMatch(site,/report\(el\('maxScore'\)\)/);
  assert.match(buildPrompt({...example,maxScore:43},clinic),/今回の満点は43点/);
});

test('分類別減点の初期値は満点の半分・3分の1を5点刻みで切り下げる',()=>{
  for(const [max,half,third] of [[5,0,0],[10,5,0],[15,5,5],[30,15,10],[40,20,10],[43,20,10],[45,20,15],[50,25,15],[60,30,20],[75,35,25],[100,50,30]]){
    for(const kind of ['opinion','task'])assert.deepEqual(contentPenaltyDefaults(kind,max),{B:half,C:third,D:third});
    assert.deepEqual(contentPenaltyDefaults('chart',max),{C:third});
    assert.deepEqual(contentPenaltyDefaults('opinion',String(max)),{B:half,C:third,D:third});
  }
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  assert.match(site,/contentPenaltyDefaults\(kind,validMaxScore\(max\)\?max.value:40\)/);
  assert.match(site,/if\(validMaxScore\(el\('maxScore'\)\)\)syncContentPenalties\(\)/);
});

test('減点条件の3項目は指定の詳細文言を表示する',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  for(const label of ["「事実に反する」「根拠に乏しい」「内容が不適切・稚拙」「具体例・理由が不適切」「矛盾がある」といった不自然・不適切な箇所を含むもの","「趣旨が不明確」「テーマとの関連が不明確」など、不明瞭な箇所を含むもの","※「明らかに英文が成立していない記述」や「語彙や構文などの重大な誤りのために趣旨が不明確な記述」が含まれるものを含む","「自明・不要なことがら」「重複したことがら」など、明らかに冗長な内容を含むもの"])assert(html.includes(label));
  assert.match(site,/el\('contentPenaltyBField'\)\.hidden=chart/);
});

test('追加の減点条件は最初から2行、未使用の空欄は採点対象外',()=>{
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  assert.match(site,/el\('addCondition'\)\.addEventListener\('click',\(\)=>addCondition\(\)\);\s*addCondition\(\);\s*addCondition\(\);/);
  assert.deepEqual(parseConditions([{label:'',points:''},{label:'',points:''}]),[]);
});

test('そのほかの特別な指示は減点条件の下に配置し、入力時だけ採点指示に反映する',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  assert(html.indexOf('id="customNotesField"')>html.indexOf('id="addCondition"'));
  assert.match(html,/ここまでの項目でカバーできなかった内容を入力してください。/);
  assert.match(site,/customNotes:el\('customNotes'\)\.value/);
  for(const customNotes of ['', '   '])assert.doesNotMatch(buildPrompt({...example,customNotes},clinic),/【そのほかの特別な指示】/);
  const note='１段落で記述すること。違反は－５点。';
  const prompt=buildPrompt({...example,customNotes:note},clinic);
  assert(prompt.includes('【そのほかの特別な指示】'));
  assert(prompt.includes(note));
  assert(prompt.includes('同一原因を重複して減点したりせず'));
});

test('課題の遂行の説明はその分類を選んだ場合だけ表示する',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  assert(html.includes("※「課題の遂行」では、個人的な体験の記述、提案・助言、立場の選択、イラスト・写真の描写、会話文・手紙文・電子メール（空所補充を含む）などに対応します。"));
  assert.match(html,/id="taskKindNote" class="micro" hidden/);
  assert.match(site,/el\('taskKindNote'\)\.hidden=el\('kind'\)\.value!=='task'/);
  assert.match(site,/syncContentPenalties\(\);syncTaskKindNote\(\)/);
});

test('追加の減点条件は追加・削除時に全角の連番を振り直す',()=>{
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  assert.match(site,/const number=fullwidthDigits\(index\+1\)/);
  assert.match(site,/textContent='未記載の場合に減点する項目'\+number/);
  assert.match(site,/group\.remove\(\);renumberConditions\(\)/);
  assert.match(site,/append\(group\);syncSuggestedDeduction\(\);renumberConditions\(\)/);
});

test('図表では明白な誤認の一律減点を廃止し、個別項目で評価する',()=>{
  const site=fs.readFileSync(new URL('../site.mjs',import.meta.url),'utf8');
  assert.match(site,/el\('contentPenaltyBField'\)\.hidden=chart/);
  assert.match(site,/el\('contentPenaltyB'\)\.disabled=chart/);
  const rule='図表と矛盾する明白な誤認は－10点。';
  assert.doesNotMatch(applyContentPenalties(rule,'chart'),/－10点/);
  assert.match(applyContentPenalties(rule,'chart'),/独立した一律減点は行わない/);
});
