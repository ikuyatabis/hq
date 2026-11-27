import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {parseClinicSource,wordRule,parseConditions,buildPrompt,countWords,exampleConditions,suggestedDeduction} from '../grading-core.mjs';

const data=`const COMMON=["【最終回答の構成：３部構成】","得点：〈最終得点〉","共通の採点指示"].join("\\n");\n`+
`const RUBRIC={opinion:["意見採点"].join("\\n"),chart:["図表採点"].join("\\n"),task:["課題採点"].join("\\n")};\n`+
`const texts=["【ファイル出力：Word経由でPDF生成】同内容のファイルを作る","【Word書式：共通仕様】Wordの規定","【PDF書式：Wordから変換】PDFの規定","【完成英文・書き起こし答案の段落・空白】段落の規定","【保留】保留時はファイルを作らない","【失敗時】ファイル生成に失敗した場合の規定","採点前に設問の語数条件（テスト条件）を確認する","複数空所では，各空所の指示語数を確認する","語数は生徒が実際に書いた英語の解答部分のみを空白区切りで数える"];`;
const clinic=parseClinicSource(data);
const example={kind:'opinion',maxScore:50,problemMode:'file',answerMode:'file',problemText:'',answerText:'',word:{mode:'approx',approx:100},customNotes:'',conditions:exampleConditions(),outputMode:'word'};

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
  assert.match(site,/const examples=exampleConditions\(el\('maxScore'\)\.value\)/);
  assert.match(site,/for\(const \{label,points\} of examples\)addCondition\(label,points\)/);
  assert.deepEqual(exampleConditions(),[{label:'長所の記述',points:25},{label:'短所の記述',points:25}]);
});
test('目安語数の下限と10語刻みはHTMLと生成側で一致する',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="approxWords" min="10" max="5000" step="10" value="100"/);
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
  assert.match(html,/src="\.\/site\.mjs\?v=20261127-3"/);
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
