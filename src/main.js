import { createInitialState, dispatch, advance, getAvailableActions, getObjective, getPlayerBank, getUnlockedRewards, serialize, parseSave, WORLD } from './engine.js';
import { createWorld } from './world.js';
import { createFallbackWorld } from './fallback.js';
import { GardenAudio } from './audio.js';
import { strings, spanish, memories } from './content.js';

const SAVE_KEY = 'littlemoon.adventure.v1';
const PREF_KEY = 'littlemoon.preferences.v1';
const $ = selector => document.querySelector(selector);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let preferences = { language:'en', sound:false, reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches, voice:false };
try { const p=JSON.parse(localStorage.getItem(PREF_KEY)||'null'); if(p&&typeof p==='object'){preferences={language:p.language==='es'?'es':'en',sound:p.sound===true,reducedMotion:typeof p.reducedMotion==='boolean'?p.reducedMotion:preferences.reducedMotion,voice:p.voice===true};} } catch {}
const t = key => strings[preferences.language][key] || strings.en[key] || key;
const localize = text => preferences.language === 'es' ? spanish[text] || text : text;
let state = createInitialState(), hasSave=false, corruptSave=false, recoverySaved=false, blockAutosave=false, storageOK=true, started=false, contextLost=false, world, lastSave=0, lastUi=0, actionSignature='', previousEventId=1, currentLine='', toastTimer, endingTimer, pendingEnding=false, lastFocus=null, finishShown=false, frameTime=0;
const keys = new Set();
const sound = new GardenAudio();
const modal = $('#modal');
try {
  const raw=localStorage.getItem(SAVE_KEY);
  if(raw){const parsed=parseSave(raw);if(parsed.ok){state=parsed.state;hasSave=true;}else{corruptSave=true;try{localStorage.setItem(`${SAVE_KEY}.recovery`,raw);recoverySaved=true;}catch{storageOK=false;blockAutosave=true;}}}
} catch {storageOK=false;}
previousEventId=state.nextEventId;
finishShown=Object.values(state.garden.placements).some(Boolean);

function announce(text){$('#announcer').textContent=text;}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;announce(text);toastTimer=setTimeout(()=>{$('#toast').hidden=true;},6500);}
function speak(text=currentLine){
  if(!('speechSynthesis' in window)){toast(t('noVoice'));return;}
  try{speechSynthesis.cancel();const line=new SpeechSynthesisUtterance(text);line.lang=preferences.language==='es'?'es-MX':'en-US';line.rate=.88;line.pitch=1.04;speechSynthesis.speak(line);}catch{toast(t('noVoice'));}
}
function line(text,{read=false}={}){currentLine=localize(text);$('#dialogue').textContent=currentLine;announce(currentLine);if(read&&preferences.voice)speak();}
function save(){
  if(!started)return;
  try{if(blockAutosave)throw new Error('Unreadable save retained');localStorage.setItem(SAVE_KEY,serialize(state));hasSave=true;storageOK=true;lastSave=performance.now();}catch{storageOK=false;}
  $('#save-status').textContent=t(storageOK?'saved':'savingUnavailable');
}
function savePreferences(){try{localStorage.setItem(PREF_KEY,JSON.stringify(preferences));}catch{toast(t('savingUnavailable'));}}
function setPaused(paused){state=dispatch(state,{type:'PAUSE',paused}).state;document.body.classList.toggle('paused-world',paused&&started);keys.clear();}
function gameCommand(command,{quiet=false}={}){
  if(!started||contextLost)return false;
  const result=dispatch(state,command);
  state=result.state;
  if(!result.accepted){if(!quiet){line(result.feedback);toast(localize(result.feedback));}return false;}
  if(result.feedback&&!quiet)line(result.feedback,{read:true});
  if(result.events.length){processEvents();save();}
  updateUI(true);
  return true;
}
function processEvents(){
  const fresh=state.history.filter(event=>event.id>=previousEventId);previousEventId=state.nextEventId;
  for(const event of fresh){
    if(event.type==='moonprint-recorded')sound.play('remember');
    if(event.type==='ferry-grown'){line(preferences.language==='es'?'La hoja está lista para navegar. Visita el embarcadero del oeste.':'The leaf is ready to sail. Find it at the west ferry landing.',{read:true});sound.play('bloom');}
    if(event.type==='canopy-grown'){line(preferences.language==='es'?'La enredadera está lista. Visita su entrada del oeste.':'The vine crossing is ready. Find it at the west canopy landing.',{read:true});sound.play('bloom');}
    if(event.type==='star-delivered')sound.play('star');
    if(event.type==='garden-feature-planted'){sound.play('bloom');if(!finishShown){finishShown=true;pendingEnding=true;clearTimeout(endingTimer);endingTimer=setTimeout(tryEnding,400);}}
  }
}
function navigate(id){
  if(!started||contextLost)return;
  closeModal();
  if(gameCommand({type:'MOVE_TO',targetId:id},{quiet:true})){
    const target=WORLD[state.scene].landmarks[id];
    line(`${t('onItsWay')} ${localize(target.label)}.`);
    if(id==='ferry-pad')line(preferences.language==='es'?'Ese pétalo abre el agua con luz lunar. Podemos dejar un recuerdo allí.':'That petal opens the water gate with moonlight. We can leave a memory there.');
    if(id==='canopy-pad')line(preferences.language==='es'?'Un poco de luz abre la flor lunar. Recordemos esa luz.':'A little light opens the moonflower. Let’s remember that light.');
    if(id.startsWith('plot')&&!getUnlockedRewards(state).length)line(t('atPlot'));
  }else{toast(localize('The river needs a crossing. Find a ferry or canopy landing.'));}
}
function selectWorld(id){
  if(!started||modal.open||contextLost)return;
  const target=WORLD[state.scene].landmarks[id];if(!target)return;
  const local=getAvailableActions(state).find(a=>a.targetId===id&&a.enabled);
  if(local&&Math.hypot(state.player.x-target.x,state.player.z-target.z)<1.15){gameCommand({type:'INTERACT',actionId:local.id});return;}
  navigate(id);
}
function setupWorld(){
  const options={
    reducedMotion:preferences.reducedMotion,
    onSelect:selectWorld,
    onMove:point=>{if(started&&!modal.open&&!contextLost)gameCommand({type:'MOVE_TO',...point},{quiet:true});},
    onContextLost:()=>{contextLost=true;setPaused(true);save();toast(t('contextLost'));if(started)openPause();},
    onContextRestored:()=>{contextLost=false;toast(t('contextRestored'));if(started&&state.paused&&!modal.open)openPause();},
  };
  try{world=createWorld($('#world'),options);}catch(error){
    console.warn('WebGL could not start; using the compatible map.',error?.message);
    world=createFallbackWorld($('#world'),options);
    $('#renderer-status').textContent=t('compatibility');$('#renderer-status').hidden=false;
  }
  world.render(state,0);
}
function translatePage(){
  document.documentElement.lang=preferences.language;
  document.querySelectorAll('[data-i18n]').forEach(el=>{const key=el.dataset.i18n;if(key==='tagline')el.innerHTML=t(key);else el.textContent=t(key);});
  $('#begin-label').textContent=t(hasSave?'continue':'begin');
  document.body.classList.toggle('reduced-motion',preferences.reducedMotion);
  world?.setReducedMotion(preferences.reducedMotion);
  actionSignature='';updateUI(true);
}
function actionLabel(action){return localize(action.label);}
function updateUI(force=false){
  const now=performance.now();if(!force&&now-lastUi<120)return;lastUi=now;
  $('#objective').textContent=localize(getObjective(state));
  $('#location-name').textContent=t(state.scene==='garden'?'garden':'stream');
  const stage={star:state.star!=='basket',crossing:state.ferry.complete||state.canopy.complete,home:state.star==='nest',garden:Object.values(state.garden.placements).some(Boolean)};
  for(const [id,done]of Object.entries(stage)){$(`[data-step="${id}"]`).classList.toggle('done',done);$(`[data-step="${id}"]`).setAttribute('aria-label',`${id}: ${done?'complete':'to discover'}`);}
  const actions=getAvailableActions(state);
  const signature=JSON.stringify(actions)+preferences.language;
  if(signature!==actionSignature){
    actionSignature=signature;
    $('#context-actions').replaceChildren();
    if(actions.length){
      for(const [index,action]of actions.slice(0,3).entries()){
        const button=document.createElement('button');button.className=`action-button ${index?'secondary':''}`;button.dataset.action=action.id;button.disabled=!action.enabled;button.textContent=actionLabel(action);
        if(action.reason){button.title=localize(action.reason);button.setAttribute('aria-description',localize(action.reason));}
        $('#context-actions').append(button);
      }
      if(actions.every(action=>!action.enabled)){
        const reason=actions.find(action=>action.reason)?.reason;
        if(reason){const note=document.createElement('p');note.className='action-note';note.textContent=localize(reason);$('#context-actions').append(note);}
      }
    }else{
      const button=document.createElement('button');button.className='action-button secondary';button.dataset.command='explore';button.textContent=t('places');$('#context-actions').append(button);
    }
  }
  $('[data-command="dismiss"]').hidden=!state.moonprint;
  $('[data-command="remember"]').hidden=state.scene!=='stream';
  $('[data-command="remember"]').disabled=Boolean(state.traversal);
  const travelling=Boolean(state.player.target||state.traversal);
  $('#travel-status').hidden=!travelling||modal.open||!started;
  $('#travel-text').textContent=t(state.traversal?(state.traversal.route==='ferry'?'sailing':'crossing'):'walking');
  $('#save-status').textContent=started?t(storageOK?'saved':'savingUnavailable'):'';
  $('#world').setAttribute('aria-label',`${t(state.scene==='garden'?'garden':'stream')}. ${localize(getObjective(state))}`);
}
function openModal(title,content,eyebrow=t('garden')){
  if(!modal.open)lastFocus=document.activeElement;
  setPaused(true);$('#modal-title').textContent=title;$('#modal-eyebrow').textContent=eyebrow;$('#modal-content').innerHTML=content;
  if(!modal.open)modal.showModal();
  save();updateUI(true);
}
function closeModal(){
  if(contextLost){toast(t('contextLost'));return;}
  if(modal.open)modal.close();
  setPaused(contextLost);updateUI(true);
  if(lastFocus?.isConnected)lastFocus.focus({preventScroll:true});
  if(pendingEnding){clearTimeout(endingTimer);endingTimer=setTimeout(tryEnding,0);}
}
function openPlaces(){
  if(!started)return;
  const landmarks=Object.values(WORLD[state.scene].landmarks);
  const bank=getPlayerBank(state);
  const icon={portal:'⌁',plot:'❋',star:'✦',receiver:'☾',construction:'❦',crossing:'≈',nursery:'✧'};
  openModal(t('choosePlace'),`<p class="modal-description">${esc(t('placesDescription'))}</p><div class="places-grid">${landmarks.map(p=>{
    const other=state.scene==='stream'&&bank&&(p.x<0?'west':'east')!==bank;
    return `<button class="place-option" data-landmark="${p.id}" ${other?'disabled':''}><span class="place-icon" aria-hidden="true">${icon[p.kind]||'✧'}</span><span><strong>${esc(localize(p.label))}</strong><small>${esc(t(state.scene==='garden'?'gardenPlace':other?'otherBank':'nearby'))}</small></span></button>`;
  }).join('')}</div>`);
}
function openJournal(){
  const items=state.history.filter(e=>memories[e.type]);
  openModal(t('journal'),`<p class="modal-description">${esc(t('memoryDescription'))}</p>${items.length?items.slice(-18).map(e=>`<div class="memory-entry"><span aria-hidden="true">${e.type.includes('garden')?'❋':e.type.includes('star')?'✦':'✧'}</span><p>${esc(memories[e.type][preferences.language==='es'?1:0])}</p></div>`).join(''):`<p class="ending-copy">${esc(t('emptyMemory'))}</p>`}`);
}
function openPause(){openModal(t('pauseTitle'),`<p class="ending-copy">${esc(t('pauseDescription'))}</p><button class="primary-button wide" data-command="resume">${esc(t('resume'))}<span aria-hidden="true">↗</span></button>`);}
function openEnding(){openModal(t('endingTitle'),`<div class="ending-flower" aria-hidden="true">❋</div><p class="ending-copy">${esc(t('endingDescription'))}<br><br><em>${esc(t('endingQuote'))}</em><br>${esc(t('endingAnswer'))}</p><button class="primary-button wide" data-command="keep-exploring">${esc(t('keepExploring'))}<span aria-hidden="true">↗</span></button><p class="modal-description">${esc(t('endingNote'))}</p>`);}
function tryEnding(){if(!pendingEnding||!started||contextLost||modal.open)return;if(!Object.values(state.garden.placements).some(Boolean)){pendingEnding=false;return;}pendingEnding=false;openEnding();}
function openSettings(){
  openModal(t('settings'),`<label class="setting-row"><span>${esc(t('language'))}</span><select id="language-setting" aria-label="${esc(t('language'))}"><option value="en" ${preferences.language==='en'?'selected':''}>English</option><option value="es" ${preferences.language==='es'?'selected':''}>Español</option></select></label>
    <label class="setting-row"><span>${esc(t('sound'))}<small>${esc(t('soundNote'))}</small></span><input type="checkbox" data-pref="sound" ${preferences.sound?'checked':''}></label>
    <label class="setting-row"><span>${esc(t('motion'))}<small>${esc(t('motionNote'))}</small></span><input type="checkbox" data-pref="reducedMotion" ${preferences.reducedMotion?'checked':''}></label>
    <label class="setting-row"><span>${esc(t('voice'))}<small>${esc(t('voiceNote'))}</small></span><input type="checkbox" data-pref="voice" ${preferences.voice?'checked':''}></label>
    <div class="settings-buttons"><button data-command="export">${esc(t('export'))}</button><button data-command="import">${esc(t('import'))}</button><button class="danger-button" data-command="restart">${esc(t('restart'))}</button></div>`);
}
function showHint(){
  let key='hintGarden';
  if(state.scene==='garden')key=state.star==='nest'?(Object.values(state.garden.placements).some(Boolean)?'hintDone':'hintPlant'):'hintGarden';
  else if(state.star==='basket')key='hintStar';
  else if(state.star==='nest')key='hintReturn';
  else if(getPlayerBank(state)==='east')key='hintNursery';
  else if(state.ferry.complete||state.canopy.complete)key='hintReady';
  else key=state.moonprint?.receiver==='canopy'?'hintCanopy':'hintFerry';
  line(t(key),{read:true});
}
function exportSave(){
  try{
    const url=URL.createObjectURL(new Blob([serialize(state)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='Little_Moon_Adventure.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast(t('exported'));
  }catch{toast(t('invalidSave'));}
}
function importSave(){
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];if(!file)return;
    if(file.size>200_000){toast(t('invalidSave'));return;}
    try{
      const parsed=parseSave(await file.text());if(!parsed.ok){toast(t('invalidSave'));return;}
      clearTimeout(endingTimer);pendingEnding=false;blockAutosave=false;corruptSave=false;state=parsed.state;previousEventId=state.nextEventId;hasSave=true;finishShown=Object.values(state.garden.placements).some(Boolean);started=true;$('#welcome').hidden=true;$('#play-ui').hidden=false;closeModal();save();translatePage();line(t('readyLine'));toast(t('imported'));
    }catch{toast(t('invalidSave'));}
  });input.click();
}
const commands={
  begin(){started=true;$('#welcome').hidden=true;$('#play-ui').hidden=false;setPaused(false);if(preferences.sound)sound.setEnabled(true).catch(()=>{});line(t(hasSave?'readyLine':'initialLine'),{read:true});save();updateUI(true);if(corruptSave){toast(recoverySaved?t('recoveredSave'):t('recoveryUnavailable'));corruptSave=false;}},
  places:openPlaces,explore:openPlaces,journal:openJournal,settings:openSettings,pause(){if(started)openPause();},resume:closeModal,close:closeModal,'keep-exploring':closeModal,
  remember(){gameCommand({type:'REMEMBER'});},dismiss(){gameCommand({type:'DISMISS'});},hint:showHint,speak(){speak();},export:exportSave,import:importSave,
  restart(){openModal(t('restartTitle'),`<p class="modal-description">${esc(t('restartDescription'))}</p><div class="settings-buttons"><button data-command="export">${esc(t('export'))}</button><button data-command="close">${esc(t('cancel'))}</button><button class="danger-button" data-command="confirm-restart">${esc(t('confirmRestart'))}</button></div>`);},
  'confirm-restart'(){clearTimeout(endingTimer);pendingEnding=false;state=createInitialState();previousEventId=1;finishShown=false;started=true;hasSave=false;blockAutosave=false;$('#welcome').hidden=true;$('#play-ui').hidden=false;closeModal();line(t('initialLine'));save();updateUI(true);},
};
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button||button.disabled)return;
  if(button.dataset.landmark){navigate(button.dataset.landmark);return;}
  if(button.dataset.action){gameCommand({type:'INTERACT',actionId:button.dataset.action});return;}
  if(button.dataset.command)commands[button.dataset.command]?.();
});
$('.brand').addEventListener('click',event=>{event.preventDefault();if(started)openPause();});
modal.addEventListener('cancel',event=>{event.preventDefault();closeModal();});
modal.addEventListener('click',event=>{if(event.target===modal){const r=modal.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)closeModal();}});
document.addEventListener('change',event=>{
  const target=event.target;
  if(target.id==='language-setting'){preferences.language=target.value==='es'?'es':'en';savePreferences();translatePage();line(localize(getObjective(state)));openSettings();}
  if(target.dataset.pref){preferences[target.dataset.pref]=target.checked;savePreferences();translatePage();if(target.dataset.pref==='sound')sound.setEnabled(preferences.sound).then(()=>sound.play('remember')).catch(()=>{});}
});
document.addEventListener('keydown',event=>{
  if(event.target.matches('input,select,textarea')||!started)return;
  if(event.code==='Escape'){if(!modal.open){event.preventDefault();openPause();}return;}
  if(modal.open||contextLost)return;
  if(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();keys.add(event.code);}
  if(event.repeat)return;
  if(event.code==='KeyM'){event.preventDefault();openPlaces();}
  if(event.code==='KeyR'){event.preventDefault();gameCommand({type:'REMEMBER'});}
  if(event.code==='KeyX'){event.preventDefault();gameCommand({type:'DISMISS'});}
  if(event.code==='KeyE'){event.preventDefault();const action=getAvailableActions(state).find(a=>a.enabled);if(action)gameCommand({type:'INTERACT',actionId:action.id});}
  if(event.code==='KeyP'){event.preventDefault();openPause();}
});
document.addEventListener('keyup',event=>keys.delete(event.code));
const directionKeys={up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight'};
document.querySelectorAll('[data-direction]').forEach(button=>{
  button.addEventListener('pointerdown',event=>{if(!started||modal.open)return;event.preventDefault();button.setPointerCapture(event.pointerId);keys.add(directionKeys[button.dataset.direction]);button.classList.add('is-down');});
  const release=()=>{keys.delete(directionKeys[button.dataset.direction]);button.classList.remove('is-down');};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
});
window.addEventListener('blur',()=>{keys.clear();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started){keys.clear();if(!modal.open)openPause();save();}});
window.addEventListener('pagehide',save);
function frame(now){
  const dt=Math.min(.05,Math.max(0,(now-frameTime)/1000));frameTime=now;
  if(started&&!modal.open&&!contextLost){
    const horizontal=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0);
    const vertical=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
    if(horizontal||vertical)state=dispatch(state,{type:'MOVE_DIRECTION',dx:horizontal*.81-vertical*.58,dz:-horizontal*.58-vertical*.81,seconds:dt}).state;
    state=advance(state,dt);processEvents();
    if(now-lastSave>1000)save();
  }
  world?.render(state,dt);updateUI();requestAnimationFrame(frame);
}

setupWorld();translatePage();line(t('initialLine'));requestAnimationFrame(frame);
Object.defineProperty(window,'__littleMoon',{value:Object.freeze({snapshot:()=>JSON.parse(serialize(state)),rendererInfo:()=>({...world.getInfo()}),version:typeof __BUILD_VERSION__==='string'?__BUILD_VERSION__:'dev'}),writable:false,configurable:false});
document.body.dataset.ready='true';
