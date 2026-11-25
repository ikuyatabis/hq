import {CLINIC_URL,parseClinicSource,countWords,buildPrompt,exampleConditions} from './grading-core.mjs';
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
  if(el('previewPrompt'))el('previewPrompt').disabled=type!=='ready';
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

function addCondition(label='',points=''){
  const group=document.createElement('div');group.className='condition';
  const a=document.createElement('div');
  const la=document.createElement('label');la.textContent='未記載の場合に減点する項目';
  const inp=document.createElement('input');inp.spellcheck=true;inp.setAttribute('autocorrect','on');inp.setAttribute('autocomplete','on');inp.setAttribute('autocapitalize','sentences');inp.setAttribute('writingsuggestions','true');inp.className='condition-label';inp.type='text';inp.placeholder='例：長所の記述';inp.value=label;la.appendChild(inp);a.appendChild(la);
  const b=document.createElement('div');
  const lb=document.createElement('label');lb.textContent='減点幅';
  const p=document.createElement('div');p.className='points';
  const point=document.createElement('input');point.className='condition-points';point.type='number';point.min='1';point.max='1000';point.step='1';point.placeholder='２５';point.value=points;
  const unit=document.createElement('span');unit.textContent='点';p.append(point,unit);lb.appendChild(p);b.appendChild(lb);
  const remove=document.createElement('button');remove.className='remove';remove.type='button';remove.setAttribute('aria-label','この条件を削除');remove.textContent='×';remove.addEventListener('click',()=>group.remove());
  group.append(a,b,remove);el('conditionList').append(group);
}
el('addCondition').addEventListener('click',()=>addCondition());
el('exampleConditions').addEventListener('click',()=>{
  el('conditionList').replaceChildren();for(const {label,points} of exampleConditions())addCondition(label,points);
});

function formData(){
  const conditions=[...document.querySelectorAll('.condition')].map(row=>({label:row.querySelector('.condition-label').value,points:row.querySelector('.condition-points').value}));
  return {kind:el('kind').value,maxScore:el('maxScore').value,problemMode:selected('problemMode'),answerMode:selected('answerMode'),problemText:el('problemText').value,answerText:el('answerText').value,word:{mode:selected('wordMode'),approx:el('approxWords').value,low:el('lowWords').value,high:el('highWords').value},customNotes:el('customNotes').value,conditions,outputMode:selected('outputMode')};
}

async function copyText(s){
  if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(s);return true;}catch{}}
  const ta=disableBrowserAssistance(document.createElement('textarea'));ta.value=s;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.focus();ta.select();let copied=false;
  try{copied=document.execCommand('copy');}catch{}ta.remove();return copied;
}

el('gradingForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const preview=e.submitter===el('previewPrompt');
  el('actionMessage').className='action-message';el('actionMessage').textContent='';el('manualPanel').hidden=true;if(el('previewPanel')){el('previewPanel').hidden=true;el('previewText').value='';}
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
    if(!report(points,/^\d+$/.test(points.value)?'':'減点幅を1～1000の整数で入力してください。'))return;
  }
  let prompt,fields;
  try{fields=formData();prompt=buildPrompt(fields,clinic);}catch(err){el('actionMessage').classList.add('error');el('actionMessage').textContent=err.message;return;}
  if(preview){el('previewText').value=prompt;el('previewPanel').hidden=false;el('actionMessage').textContent='指示文を表示しました。';return;}
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
