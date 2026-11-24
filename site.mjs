import {CLINIC_URL,parseClinicSource,countWords,buildPrompt} from './grading-core.mjs';
const el=id=>document.getElementById(id);
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
el('answerText').addEventListener('input',()=>{el('wordPreview').textContent=fullwidthDigits(countWords(el('answerText').value).toLocaleString('ja-JP'));});

function addCondition(label='',points=''){
  const group=document.createElement('div');group.className='condition';
  const a=document.createElement('div');
  const la=document.createElement('label');la.textContent='未記載の場合に減点する項目';
  const inp=document.createElement('input');inp.className='condition-label';inp.type='text';inp.placeholder='例：長所の記述';inp.value=label;la.appendChild(inp);a.appendChild(la);
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
  el('conditionList').replaceChildren();addCondition('長所が記述されていない',25);addCondition('短所が記述されていない',25);
});

function formData(){
  const conditions=[...document.querySelectorAll('.condition')].map(row=>({label:row.querySelector('.condition-label').value,points:row.querySelector('.condition-points').value}));
  return {kind:el('kind').value,maxScore:el('maxScore').value,problemMode:selected('problemMode'),answerMode:selected('answerMode'),problemText:el('problemText').value,answerText:el('answerText').value,word:{mode:selected('wordMode'),approx:el('approxWords').value,low:el('lowWords').value,high:el('highWords').value},customNotes:el('customNotes').value,conditions,outputMode:selected('outputMode')};
}

async function copyText(s){
  if(navigator.clipboard&&window.isSecureContext){try{await navigator.clipboard.writeText(s);return true;}catch{}}
  const ta=document.createElement('textarea');ta.value=s;ta.style.position='fixed';ta.style.left='-9999px';document.body.appendChild(ta);ta.focus();ta.select();let copied=false;
  try{copied=document.execCommand('copy');}catch{}ta.remove();return copied;
}

el('gradingForm').addEventListener('submit',async e=>{
  e.preventDefault();
  el('actionMessage').className='action-message';el('actionMessage').textContent='';el('manualPanel').hidden=true;
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
