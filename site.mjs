import {CLINIC_URL,parseClinicSource,countWords,buildPrompt,conditionPresets,suggestedDeduction,contentPenaltyDefaults} from './grading-core.mjs?v=20261127-6';
const el=id=>document.getElementById(id);
const disableBrowserAssistance=node=>{
  for(const [name,value] of Object.entries({"spellcheck":"false","autocorrect":"off","autocomplete":"off","autocapitalize":"none","writingsuggestions":"false","data-gramm":"false","data-gramm_editor":"false","data-enable-grammarly":"false","data-lt-active":"false","data-ms-editor":"false"})) node.setAttribute(name,value);
  return node;
};
const fullwidthDigits=value=>String(value).replace(/[0-9]/g,d=>'０１２３４５６７８９'[Number(d)]);
const selected=name=>document.querySelector(`input[name="${name}"]:checked`)?.value;
let clinic=null;

function showClinicStatus(message,type='loading'){
  el('clinicStatus').classList.toggle('ready',type==='ready');
  el('clinicStatus').classList.toggle('error',type==='error');
  el('clinicStatusText').textContent=message;
  el('retry').hidden=type!=='error';
  el('launch').disabled=type!=='ready';
}
async function loadClinic(){
  showClinicStatus('最新の基準を読み込み中です…');clinic=null;
  try{
    const r=await fetch(CLINIC_URL,{cache:'no-store'});
    if(!r.ok)throw new Error('HTTP '+r.status);
    clinic=parseClinicSource(await r.text());
    const time=new Intl.DateTimeFormat('ja-JP-u-nu-latn',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit'}).format(new Date());
    showClinicStatus('本体の現行mainを取得済み（'+time+'確認）','ready');
  }catch(e){
    showClinicStatus('基準を取得できません：'+e.message+'。接続を確認して再取得してください。','error');
  }
}
el('retry').addEventListener('click',loadClinic);

for (const type of ['problem','answer']){
  document.querySelectorAll(`input[name="${type}Mode"]`).forEach(node=>node.addEventListener('change',()=>{
    const text=selected(type+'Mode')==='text';
    el(type+'TextBox').hidden=!text;
    el(type+'FileNote').hidden=text;
  }));
}
function updateWord(){
  el('approxBox').hidden=selected('wordMode')!=='approx';
  el('rangeBox').hidden=selected('wordMode')!=='range';
}
document.querySelectorAll('input[name="wordMode"]').forEach(n=>n.addEventListener('change',updateWord));
el('gradingForm').addEventListener('input',e=>{if(typeof e.target.setCustomValidity==='function')e.target.setCustomValidity('');});
el('answerText').addEventListener('input',()=>{el('wordPreview').textContent=fullwidthDigits(countWords(el('answerText').value).toLocaleString('ja-JP'));});

function syncInvalidAnswerPenalty(){
  const max=el('maxScore'), penalty=el('invalidAnswerPenalty');
  if(!max.validity.valid)return;
  penalty.max=max.value;
  penalty.value=max.value;
  penalty.setCustomValidity('');
}
function syncContentPenalties(){
  const kind=el('kind').value;
  const chart=kind==='chart';
  const defaults=contentPenaltyDefaults(kind);
  el('contentPenaltyBLabel').textContent=chart?'図表と矛盾する明白な誤認':'事実誤認・不適切な理由や根拠・重大な矛盾';
  el('contentPenaltyDField').hidden=chart;
  el('contentPenaltyD').disabled=chart;
  for(const [key,value] of Object.entries(defaults)){
    const input=el('contentPenalty'+key);
    input.value=String(value);
    input.setCustomValidity('');
  }
}
el('kind').addEventListener('change',syncContentPenalties);
syncContentPenalties();

function syncSuggestedDeduction(){
  const points=suggestedDeduction(el('maxScore').value);
  for(const input of document.querySelectorAll('.condition-points'))input.placeholder=points>0?String(points):'';
  if(el('conditionExamplesDialog').open)renderConditionExamples();
}
el('maxScore').addEventListener('input',()=>{syncInvalidAnswerPenalty();syncSuggestedDeduction();});
syncInvalidAnswerPenalty();
syncSuggestedDeduction();

function addCondition(label='',points=''){
  const group=document.createElement('div');group.className='condition';
  const a=document.createElement('div');
  const la=document.createElement('label');la.textContent='未記載の場合に減点する項目';
  const inp=document.createElement('input');inp.spellcheck=true;inp.setAttribute('autocorrect','on');inp.setAttribute('autocomplete','on');inp.setAttribute('autocapitalize','sentences');inp.setAttribute('writingsuggestions','true');inp.className='condition-label';inp.type='text';inp.value=label;la.appendChild(inp);a.appendChild(la);
  const b=document.createElement('div');
  const lb=document.createElement('label');lb.textContent='減点幅';
  const p=document.createElement('div');p.className='points';
  const point=document.createElement('input');point.className='condition-points';point.type='number';point.min='5';point.max='1000';point.step='5';point.value=points;
  const unit=document.createElement('span');unit.textContent='点';p.append(point,unit);lb.appendChild(p);b.appendChild(lb);
  const remove=document.createElement('button');remove.className='remove';remove.type='button';remove.setAttribute('aria-label','この条件を削除');remove.textContent='×';remove.addEventListener('click',()=>group.remove());
  group.append(a,b,remove);el('conditionList').append(group);syncSuggestedDeduction();
}
el('addCondition').addEventListener('click',()=>addCondition());
function renderConditionExamples(){
  const max=el('maxScore');
  const valid=max.validity.valid;
  el('conditionExamplesScore').textContent=valid?'今回の満点：'+max.value+'点（５点刻みで切り下げ）':'満点を正しく入力してください。';
  const list=el('conditionExamplesList');
  list.replaceChildren();
  for(const preset of conditionPresets(valid?max.value:0)){
    const section=document.createElement('section');section.className='example-preset';
    const title=document.createElement('h3');title.textContent=preset.title;
    const items=document.createElement('ul');
    for(const {label,points} of preset.items){
      const row=document.createElement('li'),name=document.createElement('span'),score=document.createElement('span');
      name.textContent=label;score.textContent=points>0?'−'+points+'点':'個別設定';row.append(name,score);items.appendChild(row);
    }
    const apply=document.createElement('button');apply.type='button';apply.className='secondary';apply.textContent='この設定例を入力';
    apply.disabled=!valid||preset.items.some(item=>item.points<1);
    apply.addEventListener('click',()=>{
      el('conditionExamplesDialog').close();
      for(const {label,points} of preset.items)addCondition(label,points);
    });
    section.append(title,items,apply);list.appendChild(section);
  }
}
el('exampleConditions').addEventListener('click',()=>{
  renderConditionExamples();el('conditionExamplesDialog').showModal();
});
el('closeConditionExamples').addEventListener('click',()=>el('conditionExamplesDialog').close());

function formData(){
  const conditions=[...document.querySelectorAll('.condition')].map(row=>({label:row.querySelector('.condition-label').value,points:row.querySelector('.condition-points').value}));
  const contentPenalties=Object.fromEntries(Object.keys(contentPenaltyDefaults(el('kind').value)).map(key=>[key,el('contentPenalty'+key).value]));
  return {contentPenalties,kind:el('kind').value,maxScore:el('maxScore').value,invalidAnswerPenalty:el('invalidAnswerPenalty').value,problemMode:selected('problemMode'),answerMode:selected('answerMode'),problemText:el('problemText').value,answerText:el('answerText').value,word:{mode:selected('wordMode'),approx:el('approxWords').value,low:el('lowWords').value,high:el('highWords').value},customNotes:el('customNotes').value,conditions,outputMode:selected('outputMode')};
}

async function copyText(s){
  if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(s);return true;}catch{}}
  const ta=disableBrowserAssistance(document.createElement('textarea'));ta.value=s;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.focus();ta.select();let copied=false;
  try{copied=document.execCommand('copy');}catch{}ta.remove();return copied;
}

el('gradingForm').addEventListener('submit',async e=>{
  e.preventDefault();
  el('actionMessage').className='action-message';el('actionMessage').textContent='';el('manualPanel').hidden=true;
  // Native feedback for editable settings and problem text, never the student answer.
  const report=(node,message='')=>{
    node.setCustomValidity(message);
    return node.reportValidity();
  };
  if(selected('problemMode')==='text'){
    const problem=el('problemText');
    if(!report(problem,problem.value.trim()?'':'問題文・資料を入力してください。'))return;
  }
  if(!report(el('maxScore')))return;
  const penalty=el('invalidAnswerPenalty');
  // Five-point spinner; direct entry accepts any integer within the maximum.
  if(!penalty.validity.badInput&&/^\d+$/.test(penalty.value)&&Number(penalty.value)<=Number(el('maxScore').value)){
    penalty.setCustomValidity('');
  }else if(!report(penalty,'減点幅は0～'+el('maxScore').value+'の整数で入力してください。'))return;
  for(const key of Object.keys(contentPenaltyDefaults(el('kind').value))){
    const input=el('contentPenalty'+key);
    if(!input.validity.badInput&&/^\d+$/.test(input.value)&&Number(input.value)<=1000){
      input.setCustomValidity('');
    }else if(!report(input,'減点幅を0～1000の整数で入力してください。'))return;
  }
  if(selected('wordMode')==='approx'){
    const n=el('approxWords');
    // Keep the existing ten-word spinner, but accept all integer values allowed by the grading core.
    const value=Number(n.value);
    if(!n.validity.badInput&&n.value.trim()&&Number.isInteger(value)&&value>=10&&value<=5000){
      n.setCustomValidity('');
    }else if(!report(n,'目安語数には10～5000の整数を入力してください。'))return;
  }
  if(selected('wordMode')==='range'){
    const low=el('lowWords'),high=el('highWords');
    if(!report(low,low.value.trim()?'':'語数の下限を入力してください。'))return;
    if(!report(high,high.value.trim()?'':'語数の上限を入力してください。'))return;
    if(Number(low.value)>Number(high.value)&&!report(high,'語数の上限は下限以上にしてください。'))return;
  }
  for(const row of document.querySelectorAll('.condition')){
    const label=row.querySelector('.condition-label'),points=row.querySelector('.condition-points');
    if(!label.value.trim()&&!points.value.trim()&&!points.validity.badInput)continue;
    if(!report(label,label.value.trim()?'':'特別減点の項目名を入力してください。'))return;
    // Five-point spinner; direct entry still accepts every integer from 1 to 1000.
    if(!points.validity.badInput&&/^\d+$/.test(points.value)&&Number(points.value)>=1&&Number(points.value)<=1000){
      points.setCustomValidity('');
    }else if(!report(points,'減点幅を1～1000の整数で入力してください。'))return;
  }
  let prompt,fields;
  try{fields=formData();prompt=buildPrompt(fields,clinic);}catch(err){el('actionMessage').classList.add('error');el('actionMessage').textContent=err.message;return;}
  // ポップアップブロックを避けるため，実際のクリックイベント中に開く。
  const tab=window.open('https://chatgpt.com/','_blank');if(tab)try{tab.opener=null;}catch{}
  const copied=await copyText(prompt);
  el('manualPrompt').value=prompt;
  if(!copied||!tab) el('manualPanel').hidden=false;
  if(copied){
    let msg='採点用データをコピーしました。ChatGPTの入力欄に貼り付けて送信してください。';
    if(fields.problemMode==='file'||fields.answerMode==='file'){
      const targets=[fields.problemMode==='file'?'問題文・資料':null,fields.answerMode==='file'?'答案':null].filter(Boolean).join('と');
      msg+='\n忘れずに「'+targets+'」の写真・PDFをChatGPTに添付してください。';
    }
    if(!tab)msg+='\n新しいタブが開かなかったため，下のリンクからChatGPTを開いてください。';
    el('actionMessage').textContent=msg;
  }else{
    el('actionMessage').classList.add('error');
    el('actionMessage').textContent='自動コピーできませんでした。下に表示された採点用データを手動でコピーしてください。';
  }
});
loadClinic();
