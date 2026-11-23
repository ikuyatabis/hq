import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import {parseClinicSource,wordRule,parseConditions,buildPrompt,countWords} from '../grading-core.mjs';

const data=`const COMMON=["【最終回答の構成：３部構成】","得点：〈最終得点〉","共通の採点指示"].join("\\n");\n`+
`const RUBRIC={opinion:["意見採点"].join("\\n"),chart:["図表採点"].join("\\n"),task:["課題採点"].join("\\n")};\n`+
`const texts=["【ファイル出力：Word経由でPDF生成】同内容のファイルを作る","【Word書式：共通仕様】Wordの規定","【PDF書式：Wordから変換】PDFの規定","【完成英文・書き起こし答案の段落・空白】段落の規定"];`;
const clinic=parseClinicSource(data);
const example={kind:'opinion',maxScore:50,problemMode:'file',answerMode:'file',problemText:'',answerText:'',word:{mode:'approx',approx:100},customNotes:'',conditions:[{label:'長所がない',points:25},{label:'短所がない',points:25}],outputMode:'word'};

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
  assert.match(p,/今回の満点は50点/);
  assert.match(p,/長所がない.*－25点/);
  assert.match(p,/短所がない.*－25点/);
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

test('サイト名称は職員室，ルートで動く相対パスを使用',()=>{
  const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/<title>職員室｜柴田答案ラボ<\/title>/);
  assert.match(html,/<h1>職員室<\/h1>/);
  assert.match(html,/href="\.\/styles\.css"/);
  assert.match(html,/src="\.\/site\.mjs"/);
  assert.doesNotMatch(html,/先生の採点室/);
});
