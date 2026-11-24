import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CLINIC_URL,parseClinicSource,buildPrompt,exampleConditions} from '../grading-core.mjs';

const source=process.env.CLINIC_HTML
  ? fs.readFileSync(process.env.CLINIC_HTML,'utf8')
  : await (async()=>{const r=await fetch(CLINIC_URL,{cache:'no-store'});if(!r.ok)throw new Error('clinic HTTP '+r.status);return r.text()})();
const clinic=parseClinicSource(source);
const fields={kind:'task',maxScore:50,problemMode:'file',answerMode:'file',problemText:'',answerText:'',
  word:{mode:'approx',approx:100},customNotes:'',conditions:exampleConditions()};

for(const outputMode of ['word','both','screen']){
  test('現行診療所との連動 / '+outputMode,()=>{
    const p=buildPrompt({...fields,outputMode},clinic);
    assert(p.includes(clinic.common));
    assert(p.includes(clinic.rubrics.task));
    assert(p.includes('今回の満点は50点'));
    assert(p.includes('「長所の記述」が実質的に欠けている場合，内容面で－25点'));
    assert(p.includes('「短所の記述」が実質的に欠けている場合，内容面で－25点'));
    assert(p.includes('同じ欠落を診療所の通常の内容面の減点で重複して引かない'));
    assert(p.includes('90～110語'));
    for(const instruction of clinic.wordInstructions) assert(p.includes(instruction));
    assert(p.includes('両者が不一致で採点に影響する場合'));
    assert(p.includes('空所ごとの語数減点は合算しない'));
    assert(p.includes('得点：〈今回の得点〉／50点'));
    assert(p.includes('空行１行の後に「１．採点結果・減点内訳」'));
    assert(p.includes('採点を保留する場合は得点を表示しない'));
    if(outputMode==='screen'){
      assert(!p.includes('【ファイル出力：Word経由でPDF生成】'));
      assert(p.includes('Word・PDFファイルは作成しない'));
      return;
    }
    for(const key of ['core','word','prose','hold','failure'])assert(p.includes(clinic.exportTexts[key]));
    assert(p.includes('通常文字の色を黒などに直接固定せず「自動」を使う'));
    assert(p.includes('アポストロフィ自体の欧文フォント（WordのASCII／hAnsi）をCenturyに直接指定'));
    assert(p.includes('保留する場合は確認案内だけを示し，ファイルは作成しない'));
    assert(p.includes('存在しないリンクを作らない'));
    assert.equal(p.includes('【PDF書式：Wordから変換】'),outputMode==='both');
  });
}
test('全分類で本体の現行採点指示が引き継がれる',()=>{
  for(const kind of ['opinion','chart','task']){
    const p=buildPrompt({...fields,kind,outputMode:'word'},clinic);
    assert(p.includes(clinic.rubrics[kind]));
  }
});
test('本体の語数照合または例外処理が欠落したら生成前に停止する',()=>{
  for(const key of ['採点前に設問の語数条件（','複数空所では，各空所の指示語数','【保留】','【失敗時】']){
    const broken=source.replaceAll(key,'削除された指示：');
    assert.throws(()=>parseClinicSource(broken),/取得できません/);
  }
});