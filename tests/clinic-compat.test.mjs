import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CLINIC_URL,parseClinicSource,buildPrompt,exampleConditions,applyContentPenalties,contentPenaltyDefaults} from '../grading-core.mjs';

const source=process.env.CLINIC_HTML
  ? fs.readFileSync(process.env.CLINIC_HTML,'utf8')
  : await (async()=>{const r=await fetch(CLINIC_URL,{cache:'no-store'});if(!r.ok)throw new Error('clinic HTTP '+r.status);return r.text()})();
const clinic=parseClinicSource(source);
const fields={kind:'task',maxScore:50,problemMode:'file',answerMode:'file',problemText:'',answerText:'',
  word:{mode:'approx',approx:100},conditions:exampleConditions()};

for(const outputMode of ['word','both','screen']){
  test('現行診療所との連動 / '+outputMode,()=>{
    const p=buildPrompt({...fields,outputMode},clinic);
    assert(p.includes(clinic.common));
    assert(p.includes('あなたは大学受験英語の指導に精通し，大学入試の自由英作文の採点・添削を専門とする英語講師です。'));
    assert.doesNotMatch(p,/現行main|持ち込み診療所|診療所準拠|秘密基地/);
    assert(p.includes(clinic.rubrics.task));
    assert(p.includes('今回の満点は50点'));
    assert(p.includes('「長所の記述」が実質的に欠けている場合，内容面で－25点'));
    assert(p.includes('「短所の記述」が実質的に欠けている場合，内容面で－25点'));
    assert(p.includes('同じ欠落を後述の通常の内容面の減点で重複して引かない'));
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
test('現行診療所の分類別基準に教員指定の減点幅を反映する',()=>{
  for(const kind of ['opinion','chart','task']){
    const defaults=contentPenaltyDefaults(kind);
    assert.equal(applyContentPenalties(clinic.rubrics[kind],kind,defaults),clinic.rubrics[kind]);
    const overrides=kind==='chart'?{B:15,C:5}:{B:15,C:5,D:0};
    const changed=applyContentPenalties(clinic.rubrics[kind],kind,overrides);
    const prompt=buildPrompt({...fields,kind,outputMode:'screen',contentPenalties:overrides},clinic);
    assert(prompt.includes(kind==='chart'?changed.replace('表・グラフの趣旨を根本的に取り違えた場合は内容面の減点Cを30点とし，最終得点を0点とする。','表・グラフの趣旨を根本的に取り違え，設問への答えとして成立していない場合は，今回の最優先の特別減点（内容面－50点）を適用する。'):changed));
    assert(!prompt.includes(clinic.rubrics[kind]));
  }
});

test('満点60点の連動減点が現行基準に反映される',()=>{
  for(const kind of ['opinion','task','chart']){
    const overrides=contentPenaltyDefaults(kind,60);
    const changed=applyContentPenalties(clinic.rubrics[kind],kind,overrides);
    const prompt=buildPrompt({...fields,maxScore:60,kind,outputMode:'screen',contentPenalties:overrides},clinic);
    assert(prompt.includes('今回の満点は60点'));
    assert.match(changed,kind==='chart'?/趣旨不明確・テーマとの関連不明確は一律－20点/:/^B：[^\n]*一律－30点/m);
    if(kind!=='chart'){
      assert.match(changed,/^C：[^\n]*一律－20点/m);
      assert.match(changed,/^D：[^\n]*一律－20点/m);
      assert(prompt.includes(changed));
    }
  }
});
