import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildPrompt,parseClinicSnapshot,contentPenaltyDefaults} from '../grading-core.mjs';

const clinic=parseClinicSnapshot(JSON.parse(readFileSync(new URL('../clinic-rules.json',import.meta.url),'utf8')));
const base={kind:'opinion',maxScore:40,invalidAnswerPenalty:40,problemMode:'text',answerMode:'text',problemText:'Do you agree?',answerText:'I agree.',word:{mode:'approx',approx:100},conditions:[],contentPenalties:contentPenaltyDefaults('opinion',40),customNotes:'具体的な理由を確認する。',outputMode:'screen'};

test('zero score is unscored feedback, not a score of zero',()=>{
  for(const kind of ['opinion','chart','task'])for(const outputMode of ['screen','word','both'])for(const problemMode of ['text','file'])for(const answerMode of ['text','file'])for(const word of [{mode:'none'},{mode:'approx',approx:100},{mode:'range',low:80,high:120}]){
    const prompt=buildPrompt({...base,kind,outputMode,problemMode,answerMode,word,maxScore:'0',invalidAnswerPenalty:'bad',contentPenalties:{B:'bad'},conditions:[{label:'',points:'bad'}]},clinic);
    assert(prompt.startsWith('【得点なし添削：最優先指示】'));
    assert(prompt.includes('得点・減点幅・得点計算・満点・減点合計・改善例の参考得点は算出も表示もしない'));
    assert(prompt.includes('１．添削結果'));
    assert(prompt.includes('２．答案の改善例'));
    assert(prompt.includes('３．おすすめ解答例'));
    assert(prompt.includes(base.customNotes));
    assert(!prompt.includes('【今回の特別減点：内容面】'));
    assert.equal(prompt.includes(clinic.exportTexts.word),outputMode!=='screen');
    assert.equal(prompt.includes(clinic.exportTexts.pdf),outputMode==='both');
    assert.equal(prompt.includes('未添付なら開始を保留'),problemMode==='file'||answerMode==='file');
  }
});
test('positive score keeps normal grading and invalid maxima are rejected',()=>{
  const prompt=buildPrompt(base,clinic);
  assert(prompt.includes('今回の満点は40点'));
  assert(prompt.includes('【今回の特別減点：内容面】'));
  assert(!prompt.includes('【得点なし添削：最優先指示】'));
  for(const maxScore of ['',-1,1.5,1001,undefined])assert.throws(()=>buildPrompt({...base,maxScore},clinic));
});
test('unscored mode still validates answer and word settings',()=>{
  assert.throws(()=>buildPrompt({...base,maxScore:0,answerText:''},clinic));
  assert.throws(()=>buildPrompt({...base,maxScore:0,word:{mode:'range',low:120,high:80}},clinic));
});
