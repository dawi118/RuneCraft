import { createUploadQueue } from './uploads.js?v=uploads-20260910';
import { BRAND, escape as e, slugify, validateContent, clone, COLLECTIONS, STATUSES, canonicalStatus, sortRecent, placeNameKey, mergePlaces, normalizeContent } from './content.js';
let author = '', base, content, draft, activeTab = 'tickets', requestId = crypto.randomUUID(), localTimer, checking = false;
let ticketDraft = null, ticketEditorOpen = false, dirty = false, staleLive = null, publishing = false;
let uploadedLibrary = [], libraryError = '';
let ticketLimit = 50, placeLimit = 30, updateLimit = 50;
let ticketQuery = '', ticketStatus = '', ticketPlace = '', placeQuery = '', updateQuery = '', updateState = 'published';
const root = document.querySelector('#editor-root'), status = document.querySelector('#editor-status');
const key = () => `gielinor-workspace-${author}`;
const say = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
const img = m => m ? `<img src="${e(m.variants?.[400] || m.src)}" alt="${e(m.alt)}" loading="lazy" width="160" height="100">` : '';
const field = (label, name, value = '', type = 'text', extra = '') => `<label>${e(label)}<input aria-label="${e(label)}" type="${type}" name="${name}" value="${e(value)}" ${extra}></label>`;
const area = (label, name, value = '', cls = '') => `<label>${e(label)}<textarea aria-label="${e(label)}" name="${name}" class="${cls}">${e(value)}</textarea></label>`;
const options = (records, selected, label = 'name') => records.map(r => `<option value="${e(r.id)}" ${selected === r.id ? 'selected' : ''}>${e(r[label])}</option>`).join('');
const media = id => content.media.find(m => m.id === id) || uploadedLibrary.find(m => m.id === id);
const mediaLibrary = () => [...new Map([...uploadedLibrary, ...content.media].map(m=>[m.id,m])).values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
function includeMedia(id) { const m=media(id);if(m&&!content.media.some(v=>v.id===id))content.media.push(clone(m));return media(id); }
async function loadMediaLibrary() {
  try { uploadedLibrary=(await api('media')).filter(Boolean);libraryError=''; }
  catch(error){if(error.status===401)throw error;libraryError='Uploaded files could not be loaded. Use Refresh uploads to retry.';}
}
const uploadOwner = () => activeTab==='tickets'&&ticketDraft ? `ticket:${ticketDraft.id}` : activeTab==='update'&&draft ? `update:${draft.id}` : 'library';
const uploader = createUploadQueue({
  onChange: renderUploadState,
  onUploaded(task) {
    if(!uploadedLibrary.some(m=>m.id===task.media.id))uploadedLibrary.unshift(task.media);
    task.accept(task.media);saveLocal();
  },
  onAuthRequired() { saveLocal();renderLogin(true);say('Your session expired. Sign in to resume the image uploads.',true); },
});
function uploadGuard() { if(uploader.blocked||publishing){say(uploader.busy?'Wait for the image uploads to finish.':'Retry or skip the unfinished uploads before continuing.',true);return false;}return true; }
function renderUploadState() {
  const target=document.querySelector('[data-upload-progress]');
  const tasks=uploader.tasks.filter(t=>t.owner===uploadOwner()&&t.state!=='skipped');
  if(target){target.innerHTML=tasks.map(t=>`<div class="upload-row" data-upload-id="${t.id}" data-upload-state="${t.state}"><strong>${e(t.name)}</strong><progress max="100" value="${t.progress}" aria-label="Upload progress for ${e(t.name)}"></progress><span>${e(t.state==='ready'?(t.owner==='library'?'Saved in the upload library. Attach it to a ticket to publish.':'Ready to publish. Click Save to website.') : t.state==='saved'?'Saved to website.':t.message)}${t.optimized?' · Optimised for upload':''}</span>${['error','waiting'].includes(t.state)?`<div class="actions">${t.state==='error'?`<button type="button" data-upload-retry="${t.id}">Retry upload</button>`:''}<button type="button" data-upload-skip="${t.id}">Skip this file</button></div>`:''}</div>`).join('');
    target.querySelectorAll('[data-upload-retry]').forEach(b=>b.onclick=()=>uploader.retry(b.dataset.uploadRetry));target.querySelectorAll('[data-upload-skip]').forEach(b=>b.onclick=()=>uploader.skip(b.dataset.uploadSkip));
  }
  document.querySelectorAll('#workspace-panel button[type=submit], [data-preview-ticket], [data-preview-update], [data-archive-ticket], [data-tab], [data-back-tickets], [data-back-updates], #sign-out, [data-refresh-media], [data-save-private], [data-new-update], [data-edit-update], [data-private-id], [data-edit-photo]').forEach(button=>button.disabled=uploader.blocked||publishing);
  if(document.querySelector('#workspace-panel'))document.querySelector('#workspace-panel').inert=publishing;
  document.querySelectorAll('#workspace-panel input, #workspace-panel textarea, #workspace-panel select').forEach(input=>input.disabled=publishing);
  const message=publishing?'Saving to website…':uploader.busy?'Uploading images… Save will be available when they finish.':uploader.blocked?'Retry or skip the unfinished uploads before saving.':dirty?'Unsaved changes — click Save to website.':'Published version loaded.';
  document.querySelectorAll('[data-save-state]').forEach(el=>el.textContent=message);
  if(tasks.some(t=>['error','waiting'].includes(t.state))&&!document.querySelector('#login'))say('Some images were not uploaded. Retry or skip them in Photographs before saving.',true);
}
function mediaPicker(selected) {
  return `<details data-media-picker><summary>Choose from the media library</summary><button type="button" data-refresh-media>Refresh uploads</button>${libraryError?`<p class="admin-status error">${e(libraryError)}</p>`:''}<div class="admin-media-grid">${mediaLibrary().filter(m=>m.subject!=='Map').map(m=>`<label><input type="checkbox" data-select-media="${m.id}" ${selected.mediaIds.includes(m.id)?'checked':''}>${img(m)}<span>${e(m.caption||m.alt)}</span></label>`).join('')}</div></details>`;
}
function bindMediaPicker(selected,refreshView) {
  document.querySelectorAll('[data-select-media]').forEach(input=>input.onchange=()=>{if(input.checked)includeMedia(input.dataset.selectMedia);selected.mediaIds=input.checked?[...new Set([...selected.mediaIds,input.dataset.selectMedia])]:selected.mediaIds.filter(id=>id!==input.dataset.selectMedia);renderSelectedMedia();changed();});
  document.querySelector('[data-refresh-media]')?.addEventListener('click',async()=>{if(!uploadGuard())return;try{await loadMediaLibrary();refreshView();document.querySelector('[data-media-picker]').open=true;}catch(error){handleError(error);}});
}
window.addEventListener('beforeunload',event=>{if(uploader.blocked){saveLocal();event.preventDefault();event.returnValue='';}});
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'The request failed.'); error.status = response.status; error.data = result;
    if (response.status === 401) { saveLocal();const dialog=document.querySelector('#stale-dialog');dialog?.close();dialog?.remove();staleLive=null;renderLogin(true); }
    throw error;
  }
  return result;
}
function newDraft(placeId = '') { return { id: crypto.randomUUID(), title: '', body: '', placeId: placeId || content.places[0]?.id || '', mediaIds: [], state: 'draft', stageId: '', stageStatus: '', coverId: '', kind: 'Build update' }; }
function saveLocal() {
  if (!author || !content) return;
  try { localStorage.setItem(key(), JSON.stringify({ base, content, draft, ticketDraft, dirty, requestId, savedAt: new Date().toISOString() })); document.querySelector('[data-autosave]')?.replaceChildren(document.createTextNode(dirty ? 'Saved on this device. Click Save to website to publish.' : 'Published version loaded.')); }
  catch { say('Browser storage is unavailable. Export your work or use Save privately before leaving.', true); }
}
function changed() { dirty = true; clearTimeout(localTimer); localTimer = setTimeout(saveLocal, 300); renderUploadState(); }
function renderLogin(expired = false) {
  root.innerHTML = `<section class="admin-card login-card"><h2>${expired ? 'Sign in again' : 'Project authors'}</h2><p>${expired ? 'Your writing is preserved on this device. Sign in to continue.' : 'Enter your existing access key.'}</p><form id="login" class="admin-form">${field('Access key', 'token', '', 'password', 'required autocomplete="current-password"')}<button type="submit">Sign in</button></form></section>`;
  document.querySelector('#login').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true;
    const token = form.elements.token.value;
    try { const session = await api('session', 'POST', { token }); form.elements.token.value = ''; author = session.author; await loadWorkspace(expired); }
    catch (error) { say(error.message, true); button.disabled = false; }
  });
}
async function loadWorkspace(keepCurrent = false) {
  const data = await api('workspace'); author = data.author;
  let saved; try { saved=JSON.parse(localStorage.getItem(key())||'null'); } catch {}
  if (keepCurrent && base && data.content.revision!==base.revision) { showStale(data.content); return; }
  if (!keepCurrent || !content) { base=clone(data.content); content=clone(data.content); draft=newDraft();ticketDraft=null;dirty=false; }
  await loadMediaLibrary();
  render();
  if(keepCurrent&&activeTab==='update')renderUpdate();
  if(keepCurrent)uploader.resume();
  if (saved?.dirty && !keepCurrent) {
    if(saved.base?.revision!==base.revision) { showStale(data.content,saved); return; }
    const recovery=document.createElement('aside');recovery.className='admin-card recovery-prompt';
    recovery.innerHTML='<h2>Unpublished changes on this device</h2><p>The published website is loaded. Choose whether to recover your local work.</p><div class="actions"><button data-use-live>Use published version</button><button data-recover>Recover local changes</button><button data-export-recovery>Export local changes</button></div>';
    root.prepend(recovery);
    recovery.querySelector('[data-recover]').onclick=()=>{base=normalizeContent(saved.base);content=normalizeContent(saved.content);draft=saved.draft;ticketDraft=saved.ticketDraft;dirty=true;requestId=saved.requestId||crypto.randomUUID();activeTab=ticketDraft?'tickets':'update';ticketEditorOpen=!!ticketDraft;render(); if(!ticketDraft)renderUpdate();say('Local changes recovered. Click Save to website to publish.');};
    recovery.querySelector('[data-use-live]').onclick=()=>{dirty=false;saveLocal();recovery.remove();};
    recovery.querySelector('[data-export-recovery]').onclick=()=>download('gielinor-local-changes.json',saved);
  }
  if(libraryError)say(libraryError,true);else say('Published website loaded. Changes go live when you click Save to website.');
}
function showStale(live,saved) {
  staleLive=live;document.querySelector('#stale-dialog')?.remove();
  const dialog=document.createElement('dialog');dialog.id='stale-dialog';dialog.className='stale-dialog';dialog.setAttribute('aria-labelledby','stale-title');
  dialog.innerHTML='<h2 id="stale-title">The website has a newer version</h2><p>Load the published version before editing or saving. This discards unpublished changes on this device.</p><div class="actions"><button data-load-published>Load published version</button><button data-export-local>Export local changes first</button></div>';
  document.body.append(dialog);dialog.addEventListener('cancel',event=>event.preventDefault());
  dialog.querySelector('[data-export-local]').onclick=()=>download('gielinor-local-changes.json',saved||{base,content,draft,ticketDraft});
  dialog.querySelector('[data-load-published]').onclick=async()=>{
    try { uploader.discard();const data=await api('workspace');base=clone(data.content);content=clone(data.content);draft=newDraft();ticketDraft=null;dirty=false;staleLive=null;requestId=crypto.randomUUID();saveLocal();dialog.close();dialog.remove();render();say('Loaded the latest published version. Local changes discarded.'); }
    catch(error){say(error.message,true);}
  };
  dialog.showModal();
}
async function checkFreshness() {
  if(document.hidden||!author||!base||checking||staleLive||uploader.busy||publishing||document.querySelector('#login'))return;checking=true;
  try{const live=await api('workspace');if(!uploader.busy&&!publishing&&live.content.revision!==base.revision)showStale(live.content);}catch(error){say(error.message,true);}finally{checking=false;}
}
function render() {
  document.querySelector('#session-controls').innerHTML = `<button type="button" id="sign-out">Sign out</button>`;
  document.querySelector('#sign-out').onclick = async () => { if(!uploadGuard())return;saveLocal(); await api('session', 'DELETE'); author = ''; renderLogin(); say('Signed out. Your work stays saved on this device.'); };
  const tabs = [['tickets','Build tickets'], ['places','Places'], ['update','Published updates'], ['settings','Site settings'], ['history','Version history']];
  root.innerHTML = `<nav class="admin-nav" aria-label="Workspace areas">${tabs.map(([id, label]) => `<button type="button" data-tab="${id}" ${activeTab === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav><div id="workspace-panel"></div>`;
  root.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { if(!uploadGuard())return;saveLocal(); activeTab = button.dataset.tab; render(); });
  if (activeTab === 'tickets') renderTickets();
  if (activeTab === 'update') renderUpdates();
  if (activeTab === 'places') renderPlaces();
  if (activeTab === 'settings') renderSettings();
  if (activeTab === 'photos') renderPhotos();
  if (activeTab === 'history') renderHistory();
  renderUploadState();
}
const panel = () => document.querySelector('#workspace-panel');
function renderUpdate() {
  draft ||= newDraft();
  const sortedPlaces = [...content.places].sort((a, b) => {
    const latest = id => content.updates.filter(u => u.placeId === id).map(u => u.updatedAt || u.publishedAt || '').sort().at(-1) || '';
    return latest(b.id).localeCompare(latest(a.id));
  });
  panel().innerHTML = `<button type="button" data-back-updates>← Published updates</button><div class="admin-grid"><section class="admin-card"><h2>${draft.editing ? 'Editing published update' : 'Add new update'}</h2><form id="update-form" class="admin-form"><label>Place<select name="placeId" required>${options(sortedPlaces, draft.placeId)}</select></label>${field('Title', 'title', draft.title, 'text', 'required maxlength="200" placeholder="A small discovery in Draynor…"')}<div><div class="toolbar" aria-label="Note formatting"><button type="button" data-format="**">Bold</button><button type="button" data-format="*">Italic</button></div>${area('What changed?', 'body', draft.body)}</div><div class="file-drop" data-drop><label>Add photographs<input type="file" data-upload multiple accept="image/jpeg,image/png,image/webp"></label><p class="admin-help">Drop JPEG, PNG or WebP files here. Up to 20 MB each; large images are optimised automatically.</p></div><div data-upload-progress></div>${mediaPicker(draft)}<div class="media-selection" data-selected-media></div><details><summary>Stage, cover and publishing details</summary><div class="admin-form"><label>Link a stage<select name="stageId"><option value="">No stage change</option>${options(content.stages.filter(s => s.placeId === draft.placeId), draft.stageId, 'publicTitle')}</select></label><label>Stage status<select name="stageStatus"><option value="">Keep current status</option>${STATUSES.map(s => `<option ${draft.stageStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Place cover<select name="coverId"><option value="">Keep current cover</option>${options(draft.mediaIds.map(media).filter(Boolean), draft.coverId, 'alt')}</select></label>${field('Completion date (only if known)', 'completedAt', draft.completedAt || '', 'date')}<p class="admin-help">The server supplies publication time, author and URL. Completion dates remain separate from publication dates.</p></div></details><p data-autosave class="save-indicator">Local autosave is a backup. Click Save to website to publish.</p><div class="actions"><button type="button" data-preview-update>Preview</button><button type="submit" class="button brass">${draft.editing ? 'Save update to website' : 'Add update to website'}</button><button type="button" data-save-private>Save privately</button></div></form></section><aside><section class="admin-card"><h3>Journal update</h3><p class="admin-help">Save this note to the website’s journal and its place page.</p><button data-new-update>Start another update</button></section><section class="admin-card"><h3>Private drafts</h3><div data-private-drafts>Loading private drafts…</div></section><section class="admin-card"><h3>Recent publications</h3>${[...content.updates].filter(u => u.state === 'published').sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0,8).map(u => `<button class="admin-draft" data-edit-update="${u.id}">${e(u.title)}</button>`).join('')}</section></aside></div>`;
  document.querySelector('[data-back-updates]').onclick=()=>{saveLocal();renderUpdates();};
  const form = document.querySelector('#update-form');
  form.addEventListener('input', event => { if (event.target.name) draft[event.target.name] = event.target.value; changed(); });
  form.elements.placeId.onchange = () => { draft.placeId = form.elements.placeId.value; draft.stageId = ''; draft.stageStatus = ''; renderUpdate(); changed(); };
  form.onsubmit = async event => { event.preventDefault(); try { const proposed = updateContent(); await savePublication(proposed, `/journal/${draft.slug || slugify(draft.title) || draft.id}/`); draft = newDraft(draft.placeId); dirty=false; saveLocal(); renderUpdates(); } catch (error) { handleError(error); } };
  document.querySelector('[data-preview-update]').onclick = async () => { try { await preview(updateContent(), `/journal/${draft.slug || slugify(draft.title) || draft.id}/`); } catch (error) { handleError(error); } };
  document.querySelector('[data-save-private]').onclick = async () => { saveLocal(); try { await api('drafts', 'PUT', { id: draft.id, draft, content, baseRevision: base.revision }); say('Saved privately in your author account. This has not been published.'); renderPrivateDrafts(); } catch (error) { handleError(error); } };
  document.querySelector('[data-new-update]').onclick = async () => { saveLocal(); try { if (draft.title || draft.body) await api('drafts', 'PUT', { id: draft.id, draft, content, baseRevision: base.revision }); draft = newDraft(); renderUpdate(); } catch(error) { handleError(error); } };
  document.querySelectorAll('[data-format]').forEach(button => button.onclick = () => { const textarea = form.elements.body, mark = button.dataset.format, start = textarea.selectionStart, end = textarea.selectionEnd; textarea.setRangeText(`${mark}${textarea.value.slice(start,end)}${mark}`, start, end, 'select'); draft.body = textarea.value; textarea.focus(); changed(); });
  bindMediaPicker(draft,renderUpdate);
  document.querySelectorAll('[data-edit-update]').forEach(button => button.onclick = () => { if(!uploadGuard())return;const update = content.updates.find(u => u.id === button.dataset.editUpdate); draft = { ...clone(update), editing: true }; renderUpdate(); });
  bindUploads(m => { includeMedia(m.id);if (!draft.mediaIds.includes(m.id)) draft.mediaIds.push(m.id); renderSelectedMedia(); changed(); });
  renderSelectedMedia(); renderPrivateDrafts();
}
function updateContent() {
  if (!draft.title.trim() || !draft.body.trim()) throw new Error('Add a title and a short note before previewing or publishing.');
  const proposed = clone(content), now = new Date().toISOString();
  const update = { id: draft.id, slug: draft.slug || slugify(draft.title) || draft.id, title: draft.title.trim(), body: draft.body.trim(), placeId: draft.placeId, stageId: draft.stageId || null, mediaIds: draft.mediaIds, author: draft.author || author, state: 'published', publishedAt: draft.publishedAt || now, updatedAt: now, kind: draft.kind || 'Build update' };
  proposed.updates = [...proposed.updates.filter(u => u.id !== update.id), update];
  const place = proposed.places.find(p => p.id === draft.placeId);
  place.mediaIds = [...new Set([...place.mediaIds, ...draft.mediaIds])];
  if (draft.coverId) place.coverId = draft.coverId;
  if (!place.coverId) place.coverId = draft.mediaIds[0] || null;
  if (draft.stageId && draft.stageStatus) { const stage = proposed.stages.find(s => s.id === draft.stageId); stage.status = draft.stageStatus; if (draft.completedAt) stage.completedAt = draft.completedAt; }
  return proposed;
}
async function renderPrivateDrafts() {
  const el = document.querySelector('[data-private-drafts]'); if (!el) return;
  try { const drafts = await api('drafts'); if (!el.isConnected) return; el.innerHTML = drafts.map(d => `<button class="admin-draft" data-private-id="${e(d.id)}">${e(d.draft.title || 'Untitled update')}</button>`).join('') || '<p class="admin-help">No private drafts yet.</p>'; el.querySelectorAll('button').forEach(button => button.onclick = () => { if(!uploadGuard())return;const saved = drafts.find(d => d.id === button.dataset.privateId); if(saved.baseRevision!==base.revision){showStale(content,saved);return;} dirty=true;draft = saved.draft; for (const m of saved.content?.media || []) if (!content.media.some(v=>v.id===m.id)) content.media.push(m); renderUpdate(); });renderUploadState(); }
  catch (error) { if (el.isConnected) el.textContent = error.message; }
}
function renderSelectedMedia() {
  const selected = activeTab==='tickets' ? ticketDraft : draft;
  selected.mediaIds.forEach(includeMedia);
  const target = document.querySelector('[data-selected-media]'); if (!target) return;
  target.innerHTML = selected.mediaIds.map((id, index) => { const m = media(id); return `<div class="media-edit" draggable="true" data-media-edit="${id}">${img(m)}<div>${activeTab==='tickets'&&index===0?'<p class="admin-help" data-headline-photo>Headline photo · Explore and Atlas</p>':''}${field('Image description (alt text)', `alt-${id}`, m.alt)}${field('Caption', `caption-${id}`, m.caption)}${field('Credit', `credit-${id}`, m.credit)}<div class="field-row">${field('Focal point X (0–100)', `x-${id}`, Math.round((m.focalPoint?.x??.5) * 100), 'number', 'min="0" max="100"')}${field('Focal point Y (0–100)', `y-${id}`, Math.round((m.focalPoint?.y??.5) * 100), 'number', 'min="0" max="100"')}</div><div class="actions">${activeTab==='tickets'&&index>0?`<button type="button" data-make-headline="${id}">Make headline</button>`:''}<button type="button" data-move="${index},-1" ${index === 0 ? 'disabled' : ''}>Move up</button><button type="button" data-move="${index},1" ${index === selected.mediaIds.length - 1 ? 'disabled' : ''}>Move down</button><button type="button" data-remove-media="${id}">Remove</button></div></div></div>`; }).join('');
  target.querySelectorAll('[data-media-edit]').forEach(row => {
    row.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', row.dataset.mediaEdit));
    row.addEventListener('dragover', event => event.preventDefault());
    row.addEventListener('drop', event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'), before = row.dataset.mediaEdit; if (!selected.mediaIds.includes(id) || id === before) return; selected.mediaIds = selected.mediaIds.filter(v => v !== id); selected.mediaIds.splice(selected.mediaIds.indexOf(before), 0, id); renderSelectedMedia(); changed(); });
  });
  target.querySelectorAll('input').forEach(input => input.oninput = () => { const [property, ...rest] = input.name.split('-'), m = media(rest.join('-')); if (property === 'x' || property === 'y') (m.focalPoint||={x:.5,y:.5})[property] = Math.max(0, Math.min(1, Number(input.value) / 100)); else m[property] = input.value; changed(); });
  target.querySelectorAll('[data-move]').forEach(button => button.onclick = () => { const [i,d] = button.dataset.move.split(',').map(Number); [selected.mediaIds[i],selected.mediaIds[i+d]] = [selected.mediaIds[i+d],selected.mediaIds[i]]; renderSelectedMedia(); changed(); });
  target.querySelectorAll('[data-make-headline]').forEach(button => button.onclick = () => { const id = button.dataset.makeHeadline; selected.mediaIds = [id, ...selected.mediaIds.filter(value => value !== id)]; renderSelectedMedia(); changed(); });
  target.querySelectorAll('[data-remove-media]').forEach(button => button.onclick = () => { selected.mediaIds = selected.mediaIds.filter(id => id !== button.dataset.removeMedia); renderSelectedMedia(); changed(); });
}
async function savePublication(proposed, path = '/') {
  if(!uploadGuard())throw new Error('Finish, retry or skip the image uploads before saving.');
  if(staleLive){showStale(staleLive);throw new Error('Load the published version before saving.');}
  const errors = validateContent(proposed); if (errors.length) throw new Error(errors.join(' '));
  say('Publishing and verifying the live revision…'); saveLocal();
  publishing=true;renderUploadState();
  try {
    const result = await api('publish', 'POST', { content: proposed, baseRevision: base.revision, requestId, requireCurrent:true });
    base = clone(result.content); content = clone(result.content); dirty=false; requestId = crypto.randomUUID();
    uploader.saved(task=>task.owner.startsWith('ticket:')?content.stages.find(t=>t.id===task.owner.slice(7))?.mediaIds.includes(task.media.id):task.owner.startsWith('update:')?content.updates.find(u=>u.id===task.owner.slice(7))?.mediaIds.includes(task.media.id):content.settings[0].galleryMediaIds.includes(task.media.id)||content.settings[0].heroId===task.media.id);saveLocal(); say('Saved to website and verified. ');
    const link = document.createElement('a'); link.href = path; link.textContent = 'Open the live page ↗'; link.target = '_blank'; link.rel = 'noopener'; status.append(link);
    if (result.backup?.status === 'failed') {
      status.append(document.createTextNode(' The live page is published, but the optional GitHub backup failed. '));
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry backup'; retry.onclick = async () => { try { const backup = await api('backup', 'POST', {}); say(backup.status === 'saved' ? 'Public backup saved. The live publication is unchanged.' : 'Backup is still unavailable; the live publication remains saved.', backup.status !== 'saved'); } catch(error) { handleError(error); } }; status.append(retry);
    }
    return result;
  } finally { publishing=false;renderUploadState(); }
}
function handleError(error) {
  say(error.message, true); saveLocal();
  if (error.status === 409 && error.data?.staleRevision) { showStale(error.data.live); return; }
  if (error.status === 409 && error.data?.conflicts) renderConflicts(error.data);
}
function renderConflicts(data) {
  let proposed; try { proposed = activeTab === 'update' ? updateContent() : clone(content); } catch { proposed = clone(content); }
  const block = document.createElement('section'); block.className = 'admin-card'; block.innerHTML = `<h2>Choose how to resolve these changes.</h2><p>The live version changed while you were writing. Both versions remain available below.</p>${data.conflicts.map((c,i) => `<div class="conflict-row"><h3>${e(c.id)} · ${e(c.field)}</h3><p>Live value</p><pre>${e(JSON.stringify(c.live,null,2))}</pre><p>Your value</p><pre>${e(JSON.stringify(c.local,null,2))}</pre><label>Keep<select data-conflict="${i}"><option value="live">Live value</option><option value="local">My value</option></select></label></div>`).join('')}<button data-resolve>Resolve and preview</button>`; root.prepend(block); block.scrollIntoView({ behavior: 'instant' });
  block.querySelector('[data-resolve]').onclick = async () => {
    // Rebase every local field on the latest publication; explicit choices replace conflicting fields only.
    const { mergeRecords } = await import('./content.js');
    const merged = mergeRecords(base, proposed, data.live).merged;
    for (const input of block.querySelectorAll('[data-conflict]')) {
      const c = data.conflicts[Number(input.dataset.conflict)], value = input.value === 'local' ? c.local : c.live;
      if (c.field.startsWith('(')) { merged[c.collection] = merged[c.collection].filter(r => r.id !== c.id); if (value) merged[c.collection].push(value); }
      else { const record = merged[c.collection].find(r => r.id === c.id); if (value === undefined) delete record[c.field]; else record[c.field] = value; }
    }
    base = clone(data.live); content = merged; requestId = crypto.randomUUID();
    if (activeTab === 'update') { const u = content.updates.find(u => u.id === draft.id); if (u) draft = { ...u, editing: true }; }
    saveLocal(); render(); say('Conflict choices are saved on this device. Preview, then publish when ready.');
  };
}
async function preview(proposed, path = '/') {
  const response = await fetch('/api/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: proposed, path }) });
  if (!response.ok) { const error = await response.json(); throw new Error(error.error); }
  const dialog = document.querySelector('#preview-dialog'); dialog.querySelector('iframe').srcdoc = await response.text(); dialog.showModal();
}
document.querySelectorAll('[data-preview-size]').forEach(button => button.onclick = () => document.querySelector('#preview-dialog iframe').classList.toggle('phone', button.dataset.previewSize === 'phone'));
document.querySelector('[data-close-preview]').onclick = () => document.querySelector('#preview-dialog').close();
function bindUploads(onSuccess) {
  const input=document.querySelector('[data-upload]'),drop=document.querySelector('[data-drop]');if(!input)return;
  const owner=uploadOwner();
  const enqueue=files=>{if(publishing)return;uploader.add([...files],owner,onSuccess);};
  input.onchange=()=>{enqueue(input.files);input.value='';};
  drop?.addEventListener('dragover',event=>{event.preventDefault();drop.classList.add('dragging');});
  drop?.addEventListener('dragleave',()=>drop.classList.remove('dragging'));
  drop?.addEventListener('drop',event=>{event.preventDefault();drop.classList.remove('dragging');enqueue(event.dataTransfer.files);});
  renderUploadState();
}
function renderPhotos() {
  activeTab='photos';
  panel().innerHTML = `<section class="admin-card"><h2>Add and curate photographs</h2><div class="file-drop" data-drop><label>Choose photographs<input type="file" data-upload multiple accept="image/jpeg,image/png,image/webp"></label></div><div data-upload-progress></div><p class="admin-help">Uploads are stored on the server. Attach them to a build ticket, or edit a photo and save it to the gallery.</p><button type="button" data-refresh-media>Refresh uploads</button>${libraryError?`<p class="admin-status error">${e(libraryError)}</p>`:''}<div class="admin-media-grid">${mediaLibrary().map(m => `<button type="button" data-edit-photo="${m.id}" class="admin-draft">${img(m)}<span>${e(m.caption || m.alt)}</span></button>`).join('')}</div></section><div data-photo-form></div>`;
  bindUploads(() => renderPhotos());
  document.querySelector('[data-refresh-media]').onclick=async()=>{if(!uploadGuard())return;try{await loadMediaLibrary();renderPhotos();}catch(error){handleError(error);}};
  document.querySelectorAll('[data-edit-photo]').forEach(button => button.onclick = () => {
    if(!uploadGuard())return;const m = includeMedia(button.dataset.editPhoto), settings = content.settings[0], target = document.querySelector('[data-photo-form]');
    target.innerHTML = `<section class="admin-card"><h2>Edit photograph</h2>${img(m)}<form class="admin-form" id="photo-form">${field('Image description (alt text)','alt',m.alt,'text','required')}${field('Caption','caption',m.caption)}${field('Credit','credit',m.credit)}<label>Subject<select name="subject">${['Details & interiors','Landscapes & exteriors','Map'].map(s => `<option ${s===m.subject?'selected':''}>${s}</option>`).join('')}</select></label><div class="field-row">${field('Focal point X (0–100)','x',m.focalPoint.x*100,'number','min="0" max="100"')}${field('Focal point Y (0–100)','y',m.focalPoint.y*100,'number','min="0" max="100"')}</div><label class="checkbox"><input type="checkbox" name="gallery" ${settings.galleryMediaIds.includes(m.id)?'checked':''}>Include in gallery</label><label class="checkbox"><input type="checkbox" name="hero" ${settings.heroId===m.id?'checked':''}>Use as homepage hero</label><button type="submit">Save to website</button></form></section>`;
    document.querySelector('#photo-form').oninput = event => { const form=event.currentTarget; for(const name of ['alt','caption','credit','subject']) m[name]=form.elements[name].value; m.focalPoint={x:Number(form.elements.x.value)/100,y:Number(form.elements.y.value)/100}; settings.galleryMediaIds=form.elements.gallery.checked?[...new Set([...settings.galleryMediaIds,m.id])]:settings.galleryMediaIds.filter(id=>id!==m.id); if(form.elements.hero.checked)settings.heroId=m.id; changed(); };
    renderUploadState();
    document.querySelector('#photo-form').onsubmit=async event=>{event.preventDefault();try{await savePublication(content,'/gallery/');renderPhotos();}catch(error){handleError(error);}};
  });
}
function ticketLookup() {
  return `<div class="admin-lookups"><label>Find a ticket<input type="search" data-ticket-query value="${e(ticketQuery)}" placeholder="Title or place"></label><label>Status<select data-ticket-status><option value="">All statuses</option>${STATUSES.map(s=>`<option ${s===ticketStatus?'selected':''}>${e(s)}</option>`).join('')}</select></label><label>Place<select data-ticket-place><option value="">All places</option>${options([...content.places].sort((a,b)=>a.name.localeCompare(b.name)),ticketPlace)}</select></label></div>`;
}
function renderTickets() {
  if(ticketDraft&&ticketEditorOpen){renderTicketForm();return;}
  panel().innerHTML=`<section class="admin-card"><div class="admin-section-heading"><h2>Build tickets</h2><div class="actions"><button data-new-ticket>Add build ticket</button>${ticketDraft&&dirty?'<button data-resume-ticket>Resume local ticket</button>':''}</div></div>${ticketLookup()}<div data-ticket-results></div></section>`;
  const list=()=>{
    const tickets=sortRecent(content.stages.filter(s=>(!ticketQuery||`${s.publicTitle} ${content.places.find(p=>p.id===s.placeId)?.name||''}`.toLowerCase().includes(ticketQuery.toLowerCase()))&&(!ticketStatus||s.status===ticketStatus)&&(!ticketPlace||s.placeId===ticketPlace)));
    document.querySelector('[data-ticket-results]').innerHTML=`<p>${tickets.length} tickets</p><div class="admin-ticket-list">${tickets.slice(0,ticketLimit).map(t=>`<button type="button" class="ticket-lookup-row" data-edit-ticket="${e(t.id)}">${img(media(t.mediaIds[0]))}<span><strong>${e(t.publicTitle)}</strong><small>${e(content.places.find(p=>p.id===t.placeId)?.name||'Project notes')} · ${e(t.state==='archived'?'Archived':t.status)}</small></span><span>Edit →</span></button>`).join('')}</div>${tickets.length>ticketLimit?'<button data-more-tickets>Show more tickets</button>':''}`;
    document.querySelector('[data-more-tickets]')?.addEventListener('click',()=>{ticketLimit+=50;list();});
    document.querySelectorAll('[data-edit-ticket]').forEach(b=>b.onclick=()=>{if(ticketDraft&&dirty&&!confirm('Discard the current ticket draft and open this published ticket?'))return;ticketDraft={...clone(content.stages.find(t=>t.id===b.dataset.editTicket)),editing:true};ticketEditorOpen=true;renderTicketForm();});
  };
  document.querySelector('[data-resume-ticket]')?.addEventListener('click',()=>{ticketEditorOpen=true;renderTicketForm();});
  document.querySelector('[data-new-ticket]').onclick=()=>{if(ticketDraft&&dirty&&!confirm('Discard the current ticket draft and start a new ticket?'))return;ticketEditorOpen=true;ticketDraft={id:crypto.randomUUID(),publicTitle:'',placeId:'',status:'Not Started',completedAt:'',notes:'',scope:'',estimatedHours:null,category:'building',regionId:'general',mediaIds:[],state:'published',editing:false};renderTicketForm();};
  document.querySelector('[data-ticket-query]').oninput=event=>{ticketQuery=event.target.value;ticketLimit=50;list();};
  document.querySelector('[data-ticket-status]').onchange=event=>{ticketStatus=event.target.value;ticketLimit=50;list();};
  document.querySelector('[data-ticket-place]').onchange=event=>{ticketPlace=event.target.value;ticketLimit=50;list();};list();
}
function placeLookupMarkup(id) {
  const selected=content.places.find(p=>p.id===id);
  return `<div class="place-lookup"><label>Find a place<input type="search" data-place-lookup value="${e(selected?.name||'')}" autocomplete="off" aria-controls="place-results" placeholder="Search the place dictionary"></label><input type="hidden" name="placeId" value="${e(id||'')}"><div id="place-results" aria-live="polite"></div><div data-create-place></div></div>`;
}
function bindPlaceLookup(form,record,onSelect) {
  const input=form.querySelector('[data-place-lookup]'),results=form.querySelector('#place-results');
  const choose=p=>{record.placeId=p.id;form.elements.placeId.value=p.id;input.value=p.name;results.innerHTML=`<p class="selected-place">${e(p.name)} · ${e(content.regions.find(r=>r.id===p.regionId)?.name)}</p>`;form.querySelector('[data-create-place]').innerHTML='';onSelect?.(p);changed();};
  const lookup=()=>{
    const query=input.value.trim(),matches=content.places.filter(p=>`${placeNameKey(p.name)} ${(p.aliasSlugs||[]).join(' ').replaceAll('-',' ')}`.includes(placeNameKey(query))).sort((a,b)=>a.name.localeCompare(b.name));
    results.innerHTML=`<div class="place-matches">${matches.slice(0,12).map(p=>`<button type="button" data-choose-place="${e(p.id)}">${e(p.name)} <small>${e(content.regions.find(r=>r.id===p.regionId)?.name)}</small></button>`).join('')}</div>${matches.length>12?`<p>${matches.length} matches. Keep typing to narrow the list.</p>`:''}${query&&!content.places.some(p=>(placeNameKey(p.name)===placeNameKey(query)||(p.aliasSlugs||[]).includes(slugify(query))))?'<button type="button" data-new-place-inline>Create a new place</button>':''}`;
    results.querySelectorAll('[data-choose-place]').forEach(b=>b.onclick=()=>choose(content.places.find(p=>p.id===b.dataset.choosePlace)));
    results.querySelector('[data-new-place-inline]')?.addEventListener('click',()=>{
      const target=form.querySelector('[data-create-place]');target.innerHTML=`<fieldset><legend>New place</legend>${field('Place name','newPlaceName',query)}<label>Region<select name="newPlaceRegion" aria-label="Region">${options(content.regions,'misthalin')}</select></label><p>This place will be published with the ticket.</p><button type="button" data-create-place-confirm>Use new place</button></fieldset>`;
      target.querySelector('button').onclick=()=>{
        const name=form.elements.newPlaceName.value.trim().replace(/\s+/g,' '),existing=content.places.find(p=>(placeNameKey(p.name)===placeNameKey(name)||(p.aliasSlugs||[]).includes(slugify(name))));
        if(existing){choose(existing);return;}
        if(!name){say('Enter a place name.',true);return;}
        let id=slugify(name);if(!id||content.places.some(p=>p.id===id||p.slug===id||(p.aliasSlugs||[]).includes(id)))id=`${id.slice(0,90)||'place'}-${crypto.randomUUID().slice(0,8)}`;
        const p={id,slug:id,name,regionId:form.elements.newPlaceRegion.value,status:'Not Started',summary:'',category:'area',mediaIds:[],stageIds:[],relatedIds:[],coverId:null,pin:null};content.places.push(p);choose(p);
      };
    });
  };
  input.onfocus=lookup;input.oninput=()=>{record.placeId='';form.elements.placeId.value='';lookup();changed();};
}
function pinEditor(p) {
  if(!p)return '<p>Choose a place to position it on the atlas.</p>';
  return `<details><summary>Atlas location · ${e(p.name)}</summary><p>This pin belongs to the place and is shared by its tickets.</p><div class="admin-pin-map" tabindex="0" role="group" aria-label="Pin placement map">${img(media(content.settings[0].mapId))}<span class="admin-pin-marker" ${p.pin?'':'hidden'} style="left:${(p.pin?.x||0)*100}%;top:${(p.pin?.y||0)*100}%">◆</span></div><div class="field-row">${field('Map X (%)','pinX',p.pin?p.pin.x*100:'','number','min="0" max="100" step="0.01"')}${field('Map Y (%)','pinY',p.pin?p.pin.y*100:'','number','min="0" max="100" step="0.01"')}</div><button type="button" data-remove-pin>Remove pin</button></details>`;
}
function bindPin(form,p) {
  const canvas=form.querySelector('.admin-pin-map');if(!canvas||!p)return;
  const set=(x,y)=>{p.pin={x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};form.elements.pinX.value=(p.pin.x*100).toFixed(2);form.elements.pinY.value=(p.pin.y*100).toFixed(2);const marker=canvas.querySelector('span');marker.hidden=false;marker.style.left=`${p.pin.x*100}%`;marker.style.top=`${p.pin.y*100}%`;changed();};
  canvas.onclick=event=>{const rect=canvas.getBoundingClientRect();set((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height);};
  for(const name of ['pinX','pinY'])form.elements[name].oninput=()=>set(Number(form.elements.pinX.value)/100,Number(form.elements.pinY.value)/100);
  form.querySelector('[data-remove-pin]').onclick=()=>{p.pin=null;canvas.querySelector('span').hidden=true;form.elements.pinX.value='';form.elements.pinY.value='';changed();};
}
function ticketContent() {
  const t=ticketDraft;
  if(!t.publicTitle.trim())throw new Error('Enter a ticket title.');
  // Original project-only tickets can still be edited, but new build tickets need a location.
  if(!t.placeId&&(!t.editing||base.stages.find(s=>s.id===t.id)?.placeId))throw new Error('Choose an existing place or create a new one.');
  const proposed=clone(content),p=proposed.places.find(p=>p.id===t.placeId);
  const record={...clone(t),publicTitle:t.publicTitle.trim(),regionId:p?.regionId||'general',completedAt:t.completedAt||null};delete record.editing;delete record.placeCover;
  proposed.stages=[...proposed.stages.filter(s=>s.id!==record.id),record];
  for(const place of proposed.places)place.stageIds=proposed.stages.filter(s=>s.placeId===place.id&&s.state!=='archived').map(s=>s.id);
  if(p){p.mediaIds=[...new Set([...p.mediaIds,...record.mediaIds])];if(t.placeCover&&record.mediaIds[0])p.coverId=record.mediaIds[0];else p.coverId ||= record.mediaIds[0]||null;}
  proposed.settings[0].galleryMediaIds=[...new Set([...proposed.settings[0].galleryMediaIds,...record.mediaIds])];
  return normalizeContent(proposed);
}
function renderTicketForm() {
  const t=ticketDraft,p=content.places.find(p=>p.id===t.placeId);
  panel().innerHTML=`<button type="button" data-back-tickets>← All build tickets</button><section class="admin-card ticket-editor"><h2>${t.editing?'Editing published ticket':'Add new build ticket'}</h2><form id="ticket-form" class="admin-form"><div class="ticket-save-bar"><p data-save-state>${dirty?'Unsaved changes — click Save to website.':'Published version loaded.'}</p><div class="actions"><button type="button" data-preview-ticket>Preview ticket</button><button type="submit" class="button brass">${t.editing?'Save ticket to website':'Add ticket to website'}</button></div></div>${field('Ticket title','publicTitle',t.publicTitle,'text','required maxlength="200"')}${placeLookupMarkup(t.placeId)}<div class="field-row"><label>Status<select name="status" aria-label="Status">${STATUSES.map(v=>`<option ${t.status===v?'selected':''}>${e(v)}</option>`).join('')}</select></label>${field('Completion date','completedAt',t.completedAt||'','date')}</div>${area('Build notes','notes',t.notes)}${area('Scope','scope',t.scope,'short')}<div class="field-row"><label>Type<select name="category">${['building','landscape','monument','infrastructure','other'].map(v=>`<option ${t.category===v?'selected':''}>${v}</option>`).join('')}</select></label>${field('Estimated hours','estimatedHours',t.estimatedHours??'','number','min="0" step="0.25"')}</div><h3>Photographs</h3><div class="file-drop" data-drop><label>Add photographs<input type="file" data-upload multiple accept="image/jpeg,image/png,image/webp"></label><p>JPEG, PNG or WebP · up to 20 MB each. Large images are optimised automatically.</p></div><div data-upload-progress></div>${mediaPicker(t)}<div data-selected-media></div><label class="checkbox"><input type="checkbox" name="placeCover" ${t.placeCover?'checked':''}>Use the first photograph as this place’s cover</label><div data-ticket-pin>${pinEditor(p)}</div><p data-autosave class="save-indicator">Local autosave is a backup. Save to website publishes without a deployment.</p>${t.editing?`<button type="button" data-archive-ticket>${t.state==='archived'?'Restore ticket':'Archive ticket'}</button>`:''}</form></section>`;
  const form=document.querySelector('#ticket-form');
  document.querySelector('[data-back-tickets]').onclick=()=>{if(!uploadGuard())return;if(dirty){saveLocal();say('Local changes retained until you save or load the published version.');}ticketEditorOpen=false;renderTickets();};
  form.oninput=event=>{const f=event.target;if(f.name==='placeCover'){t.placeCover=f.checked;changed();}if(['publicTitle','notes','scope','category','status','completedAt','estimatedHours'].includes(f.name)){t[f.name]=f.type==='number'?(f.value?Number(f.value):null):f.value;changed();}};
  bindPlaceLookup(form,t,p=>{form.querySelector('[data-ticket-pin]').innerHTML=pinEditor(p);bindPin(form,p);});bindPin(form,p);
  bindMediaPicker(t,renderTicketForm);
  bindUploads(m=>{includeMedia(m.id);t.mediaIds=[...new Set([...t.mediaIds,m.id])];renderSelectedMedia();changed();});renderSelectedMedia();
  form.querySelector('[data-preview-ticket]').onclick=()=>{try{preview(ticketContent(),`/builds/${t.id}/`).catch(handleError);}catch(error){handleError(error);}};
  form.onsubmit=async event=>{event.preventDefault();if(!uploadGuard())return;try{await savePublication(ticketContent(),`/builds/${t.id}/`);ticketDraft={...clone(content.stages.find(s=>s.id===t.id)),editing:true};dirty=false;saveLocal();renderTicketForm();}catch(error){handleError(error);}};
  form.querySelector('[data-archive-ticket]')?.addEventListener('click',async()=>{t.state=t.state==='archived'?'published':'archived';changed();try{await savePublication(ticketContent(),'/explore/');ticketDraft=null;dirty=false;saveLocal();renderTickets();}catch(error){handleError(error);}});
}
function renderUpdates() {
  panel().innerHTML=`<section class="admin-card"><div class="admin-section-heading"><h2>Published updates</h2><div class="actions"><button data-add-update>Add journal update</button>${dirty&&(draft?.title||draft?.body)?'<button data-resume-update>Resume local update</button>':''}</div></div><div class="admin-lookups"><label>Find an update<input type="search" data-update-query value="${e(updateQuery)}" placeholder="Title or place"></label><label>Publication<select data-update-state aria-label="Publication"><option value="published" ${updateState==='published'?'selected':''}>Published</option><option value="archived" ${updateState==='archived'?'selected':''}>Archived</option></select></label></div><div data-update-results></div></section>`;
  const list=()=>{const found=sortRecent(content.updates.filter(u=>u.state===updateState&&`${u.title} ${content.places.find(p=>p.id===u.placeId)?.name||''}`.toLowerCase().includes(updateQuery.toLowerCase())));
    document.querySelector('[data-update-results]').innerHTML=`<p>${found.length} updates</p>${found.slice(0,updateLimit).map(u=>`<article class="update-lookup-row"><div><h3>${e(u.title)}</h3><p>${e(content.places.find(p=>p.id===u.placeId)?.name||'')} · ${e(u.publishedAt?.slice(0,10)||'')}</p></div><div class="actions"><button data-edit-note="${u.id}">Edit update</button><button data-archive-note="${u.id}">${u.state==='archived'?'Restore update':'Archive update'}</button></div></article>`).join('')}${found.length>updateLimit?'<button data-more-updates>Show more updates</button>':''}`;
    document.querySelector('[data-more-updates]')?.addEventListener('click',()=>{updateLimit+=50;list();});
    document.querySelectorAll('[data-edit-note]').forEach(b=>b.onclick=()=>{draft={...clone(content.updates.find(u=>u.id===b.dataset.editNote)),editing:true};renderUpdate();});
    document.querySelectorAll('[data-archive-note]').forEach(b=>b.onclick=async()=>{const proposed=clone(content),u=proposed.updates.find(u=>u.id===b.dataset.archiveNote);u.state=u.state==='archived'?'published':'archived';try{await savePublication(proposed,'/journal/');renderUpdates();}catch(error){handleError(error);}});
  };
  document.querySelector('[data-resume-update]')?.addEventListener('click',renderUpdate);
  document.querySelector('[data-add-update]').onclick=()=>{draft=newDraft();renderUpdate();};
  document.querySelector('[data-update-query]').oninput=event=>{updateQuery=event.target.value;updateLimit=50;list();};document.querySelector('[data-update-state]').onchange=event=>{updateState=event.target.value;updateLimit=50;list();};list();
}
function renderPlaces(selected) {
  panel().innerHTML=`<section class="admin-card"><h2>Place dictionary</h2><p>Use one name per location. A place can have several build tickets.</p><label>Find a place<input type="search" data-dictionary-query value="${e(placeQuery)}" placeholder="Search existing places before adding one"></label><button data-add-dictionary-place>Add place</button><div data-dictionary-results></div><div data-dictionary-editor></div></section>`;
  const list=()=>{const places=content.places.filter(p=>placeNameKey(p.name).includes(placeNameKey(placeQuery))).sort((a,b)=>a.name.localeCompare(b.name));document.querySelector('[data-dictionary-results]').innerHTML=`<p>${places.length} places</p><div class="dictionary-list">${places.slice(0,placeLimit).map(p=>`<button data-dictionary-place="${p.id}"><strong>${e(p.name)}</strong><span>${e(content.regions.find(r=>r.id===p.regionId)?.name)} · ${content.stages.filter(s=>s.placeId===p.id).length} tickets</span></button>`).join('')}</div>${places.length>placeLimit?'<button data-more-places>Show more places</button>':''}`;document.querySelector('[data-more-places]')?.addEventListener('click',()=>{placeLimit+=30;list();});document.querySelectorAll('[data-dictionary-place]').forEach(b=>b.onclick=()=>editPlace(b.dataset.dictionaryPlace));};
  document.querySelector('[data-dictionary-query]').oninput=event=>{placeQuery=event.target.value;placeLimit=30;list();};
  document.querySelector('[data-add-dictionary-place]').onclick=()=>editPlace(null);
  function editPlace(id) {
    const p=content.places.find(p=>p.id===id),target=document.querySelector('[data-dictionary-editor]');
    target.innerHTML=`<form id="dictionary-form" class="admin-form"><h3>${p?'Editing place':'Add new place'}</h3>${field('Place name','name',p?.name||placeQuery,'text','required')}<label>Region<select name="regionId" aria-label="Region">${options(content.regions,p?.regionId||'misthalin')}</select></label>${p?pinEditor(p):''}<div class="actions"><button type="submit">${p?'Save place to website':'Add place to website'}</button></div>${p?`<details><summary>Merge duplicate place</summary><p>Move this place’s tickets and images into an existing place. Its old link will redirect.</p><label>Find merge destination<input type="search" data-merge-query></label><div data-merge-matches></div></details>`:''}</form>`;
    const form=target.querySelector('form');if(p)bindPin(form,p);
    form.oninput=event=>{if(p&&['name','regionId'].includes(event.target.name))p[event.target.name]=event.target.value;changed();};
    form.onsubmit=async event=>{event.preventDefault();const name=form.elements.name.value.trim().replace(/\s+/g,' '),existing=content.places.find(other=>other.id!==id&&(placeNameKey(other.name)===placeNameKey(name)||(other.aliasSlugs||[]).includes(slugify(name))));if(existing){say(`“${existing.name}” already exists. Choose it or merge these places.`,true);return;}
      const proposed=clone(content);let record=proposed.places.find(v=>v.id===id);if(!record){let newId=slugify(name);if(proposed.places.some(p=>p.id===newId||p.slug===newId||(p.aliasSlugs||[]).includes(newId)))newId+=`-${crypto.randomUUID().slice(0,8)}`;record={id:newId,slug:newId,status:'Not Started',summary:'',category:'area',mediaIds:[],stageIds:[],relatedIds:[],coverId:null,pin:null};proposed.places.push(record);}record.name=name;record.regionId=form.elements.regionId.value;
      try{await savePublication(normalizeContent(proposed),`/places/${record.slug}/`);renderPlaces(record.id);}catch(error){handleError(error);}};
    if(p){const input=form.querySelector('[data-merge-query]');input.oninput=()=>{const target=form.querySelector('[data-merge-matches]'),matches=content.places.filter(v=>v.id!==id&&placeNameKey(v.name).includes(placeNameKey(input.value))).slice(0,10);target.innerHTML=input.value?matches.map(v=>`<button type="button" data-merge-to="${v.id}">Merge into ${e(v.name)}</button>`).join(''):'';target.querySelectorAll('[data-merge-to]').forEach(b=>b.onclick=async()=>{const proposed=clone(content),to=mergePlaces(proposed,id,b.dataset.mergeTo);try{await savePublication(normalizeContent(proposed),`/places/${to.slug}/`);renderPlaces(to.id);}catch(error){handleError(error);}});};}
  }
  list();if(selected)editPlace(selected);
}
function renderSettings() {
  const s=content.settings[0];
  panel().innerHTML=`<section class="admin-card"><h2>Site settings</h2><div class="settings-tools"><button data-manage-gallery>Gallery photographs</button><button data-content-tools>Import, export &amp; external links</button>${s.ideasEnabled?'<button data-community-queue>Review community suggestions</button>':''}</div><form id="settings-form" class="admin-form">${field('Project name','brand',s.brand,'text','readonly')}${field('Tagline','tagline',s.tagline,'text','readonly')}${area('Home introduction','introduction',s.introduction,'short')}${area('About the project','aboutCopy',s.aboutCopy)}<label>Current focus<select name="focusStageId"><option value="">No current focus</option>${options(content.stages,s.focusStageId,'publicTitle')}</select></label><details open><summary>Homepage selection</summary>${s.featuredPlaceIds.map((id,i)=>`<p>${e(content.places.find(p=>p.id===id)?.name)} <button type="button" data-feature-move="${i},-1" ${i===0?'disabled':''}>Move up</button> <button type="button" data-feature-remove="${id}">Remove</button></p>`).join('')}<label>Add a featured place<select data-feature-add><option value="">Choose a place</option>${options(content.places.filter(p=>!s.featuredPlaceIds.includes(p.id)),null)}</select></label></details><details><summary>Atlas map</summary><label>Map image<select name="mapId">${options(content.media,s.mapId,'alt')}</select></label></details><details><summary>Navigation labels</summary>${['explore','atlas','journal','gallery','about'].map(route=>field(route[0].toUpperCase()+route.slice(1),`nav-${route}`,s.navLabels?.[route]||route[0].toUpperCase()+route.slice(1),'text','maxlength="30"')).join('')}</details><details><summary>Follow and support</summary>${field('Instagram','instagram',s.instagram,'url')}${field('Substack','substack',s.substack,'url')}${field('Fundraiser','fundraiser',s.fundraiser,'url')}${area('Support copy','supportCopy',s.supportCopy,'short')}${field('Current question','activeQuestion',s.activeQuestion)}</details><details><summary>Frequently asked questions</summary>${s.faq.map((f,i)=>`${field('Question',`faq-question-${i}`,f.question)}${area('Answer',`faq-answer-${i}`,f.answer,'short')}`).join('')}<button type="button" data-add-faq>Add question</button></details><details><summary>Credits and privacy</summary>${area('Credits','creditsCopy',s.creditsCopy)}${area('Privacy','privacyCopy',s.privacyCopy)}</details><details><summary>Community submissions</summary><p class="admin-help">Open the form only when a named reviewer can own the private queue. You can pause it at any time.</p>${field('Named reviewer','ideaReviewer',s.ideaReviewer)}${field('Retention in days','retentionDays',s.retentionDays,'number','min="1" max="365"')}<label class="checkbox"><input type="checkbox" name="ideasEnabled" ${s.ideasEnabled?'checked':''}>Accept new ideas</label></details><div class="actions"><button type="button" data-preview-settings>Preview home</button><button type="submit">Save to website</button></div></form></section>`;
  document.querySelector('[data-manage-gallery]').onclick=renderPhotos;
  document.querySelector('[data-content-tools]').onclick=renderContentTools;
  document.querySelector('[data-community-queue]')?.addEventListener('click',renderIdeas);
  const form=document.querySelector('#settings-form');form.oninput=event=>{const input=event.target;if(input.name.startsWith('faq-')){const[,kind,i]=input.name.split('-');s.faq[Number(i)][kind]=input.value;}else if(input.name.startsWith('nav-')){s.navLabels||={};s.navLabels[input.name.slice(4)]=input.value;}else if(input.name)s[input.name]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;changed();};
  document.querySelector('[data-feature-add]').onchange=event=>{if(event.target.value){s.featuredPlaceIds.push(event.target.value);renderSettings();changed();}};
  document.querySelectorAll('[data-feature-move]').forEach(button=>button.onclick=()=>{const[i,d]=button.dataset.featureMove.split(',').map(Number);[s.featuredPlaceIds[i],s.featuredPlaceIds[i+d]]=[s.featuredPlaceIds[i+d],s.featuredPlaceIds[i]];renderSettings();changed();});
  document.querySelectorAll('[data-feature-remove]').forEach(button=>button.onclick=()=>{s.featuredPlaceIds=s.featuredPlaceIds.filter(id=>id!==button.dataset.featureRemove);renderSettings();changed();});
  document.querySelector('[data-add-faq]').onclick=()=>{s.faq.push({question:'',answer:''});renderSettings();};
  document.querySelector('[data-preview-settings]').onclick=()=>preview(content,'/').catch(handleError);
  form.onsubmit=async event=>{event.preventDefault();try{await savePublication(content);renderSettings();}catch(error){handleError(error);}};
}
async function renderHistory() {
  panel().innerHTML='<section class="admin-card"><h2>Version history</h2><p>Loading verified publications…</p></section>';
  try { const history=await api('revisions'); if(activeTab!=='history')return;
    panel().innerHTML=`<section class="admin-card"><h2>Version history</h2><p>Restore creates a new publication. The intervening history stays available.</p>${history.length?`<table class="admin-table"><thead><tr><th>Date</th><th>Revision</th><th>Review</th></tr></thead><tbody>${history.map(r=>`<tr><td>${e(r.timestamp)}</td><td>${e(r.revision.slice(0,12))}</td><td><button data-review-revision="${r.revision}">Review changes</button></td></tr>`).join('')}</tbody></table>`:'<p>No publications yet. The migration snapshot will be retained with the first publish.</p>'}<div data-revision-review></div></section>`;
    document.querySelectorAll('[data-review-revision]').forEach(button=>button.onclick=async()=>{try{const r=await api(`revisions/${button.dataset.reviewRevision}`),target=document.querySelector('[data-revision-review]'),changes=[];for(const type of COLLECTIONS){const old=new Map(r.content[type].map(record=>[record.id,record]));for(const record of content[type])if(JSON.stringify(old.get(record.id))!==JSON.stringify(record))changes.push(`${type}: ${record.name||record.title||record.id}`);for(const record of r.content[type])if(!content[type].some(v=>v.id===record.id))changes.push(`Restore ${type}: ${record.name||record.title||record.id}`);}target.innerHTML=`<h3>Changes from this version</h3><ul>${changes.map(c=>`<li>${e(c)}</li>`).join('')||'<li>No record changes</li>'}</ul><div class="actions"><button data-preview-revision>Preview this version</button><button data-restore-revision>Restore this publication</button></div>`;target.querySelector('[data-preview-revision]').onclick=()=>preview(r.content,'/').catch(handleError);target.querySelector('[data-restore-revision]').onclick=async()=>{try{const result=await api('restore','POST',{revision:r.revision,baseRevision:base.revision,requestId});base=clone(result.content);content=clone(result.content);requestId=crypto.randomUUID();saveLocal();say('Earlier publication restored and verified.');renderHistory();}catch(error){handleError(error);}};}catch(error){handleError(error);}});
  }catch(error){handleError(error);}
}
async function renderIdeas() {
  panel().innerHTML='<section class="admin-card"><h2>Private idea queue</h2><p>Loading…</p></section>';
  try { const ideas=await api('ideas');if(activeTab!=='settings')return;panel().innerHTML=`<section class="admin-card"><h2>Private idea queue</h2><p>${content.settings[0].ideasEnabled?'Submissions are open.':'Submissions are paused.'} Expired ideas are removed according to the configured retention period. Only accepted, consented summaries with outcome links become public.</p>${ideas.map(i=>`<form class="admin-form admin-card" data-idea="${e(i.id)}"><h3>${e(content.places.find(p=>p.id===i.placeId)?.name)}</h3><p>${e(i.text)}</p><p class="admin-help">${e(i.email)} · ${e(i.displayName)} · Expires ${e(i.expiresAt)}</p><p class="admin-help">Summary consent: ${i.summaryConsent?'yes':'no'}. Credit consent: ${i.creditConsent?'yes':'no'}.</p><label>State<select name="state">${['New','Reviewing','Accepted','Not now','Closed'].map(s=>`<option ${s===i.state?'selected':''}>${s}</option>`).join('')}</select></label>${area('Reviewed public summary','summary',i.summary,'short')}${field('Link to the resulting build or update','outcomeUrl',i.outcomeUrl)}<div class="actions"><button type="submit">Save review</button><button type="button" data-delete-idea="${e(i.id)}">Delete idea and contact details</button></div></form>`).join('')||'<p>No ideas to review.</p>'}</section>`;
    document.querySelectorAll('[data-idea]').forEach(form=>form.onsubmit=async event=>{event.preventDefault();try{await api(`ideas/${form.dataset.idea}`,'PATCH',Object.fromEntries(new FormData(form)));say('Review saved.');}catch(error){handleError(error);}});
    document.querySelectorAll('[data-delete-idea]').forEach(button=>button.onclick=async()=>{try{await api(`ideas/${button.dataset.deleteIdea}`,'PATCH',{remove:true});renderIdeas();say('Idea and contact details deleted.');}catch(error){handleError(error);}});
  }catch(error){handleError(error);}
}
function download(filename, data) { const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function renderContentTools() {
  panel().innerHTML=`<section class="admin-card"><h2>Import, export and recovery</h2><div class="actions"><button data-export>Export current content</button><button data-export-work>Export recoverable workspace</button><button data-load-live>Load live content</button></div><label>Import content snapshot<input type="file" data-import accept="application/json,.json"></label><div data-import-summary></div></section><section class="admin-card"><h2>External articles and tours</h2><p>Add curated links and guided visits using existing places and photographs.</p><button data-add-article>Add external article</button> <button data-add-tour>Add guided tour</button><div data-extra-editor></div></section>`;
  document.querySelector('[data-export]').onclick=()=>download('gielinor-publication.json',content);
  document.querySelector('[data-export-work]').onclick=()=>download('gielinor-workspace.json',{content,base,draft});
  document.querySelector('[data-load-live]').onclick=async()=>{saveLocal();download('gielinor-before-reload.json',{content,base,draft});await loadWorkspace();};
  document.querySelector('[data-import]').onchange=async event=>{try{const file=event.target.files[0];if(!file||file.size>2*1024*1024)throw new Error('Choose a JSON content snapshot under 2 MB.');const imported=JSON.parse(await file.text()),errors=validateContent(imported);if(errors.length)throw new Error(errors.join(' '));const target=document.querySelector('[data-import-summary]');target.innerHTML=`<h3>Import summary</h3><p>${imported.places.length} places, ${imported.stages.length} stages, ${imported.updates.length} updates and ${imported.media.length} images. This replaces your working copy. Click Save to website to publish.</p><button data-apply-import>Use imported snapshot</button>`;target.querySelector('button').onclick=()=>{download('gielinor-before-import.json',content);content=normalizeContent(imported);changed();saveLocal();target.innerHTML='<p>Imported into this device’s working copy.</p><button data-publish-import>Save to website</button>';target.querySelector('button').onclick=()=>savePublication(content).catch(handleError);};}catch(error){handleError(error);}};
  document.querySelector('[data-add-article]').onclick=()=>{const target=document.querySelector('[data-extra-editor]');target.innerHTML=`<form id="article-form" class="admin-form">${field('Title','title','','text','required')}${field('Canonical article URL','url','','url','required')}${field('Publication date','date','','date','required')}${area('Excerpt','excerpt','','short')}<button type="submit">Add article and publish</button></form>`;target.querySelector('form').onsubmit=event=>{event.preventDefault();const record={id:crypto.randomUUID(),...Object.fromEntries(new FormData(event.currentTarget)),placeIds:[]};content.articles.push(record);savePublication(content,'/journal/').catch(handleError);};};
  document.querySelector('[data-add-tour]').onclick=()=>{const target=document.querySelector('[data-extra-editor]');target.innerHTML=`<form id="tour-form" class="admin-form">${field('Tour title','title','','text','required')}${area('Introduction','summary','','short')}<p class="admin-help">Choose the places in their visiting order. Each uses its existing cover and introduction.</p>${[1,2,3,4,5].map(n=>`<label>Stop ${n}<select name="stop${n}"><option value="">No stop</option>${options(content.places,null)}</select></label>`).join('')}<button type="submit">Publish guided tour</button></form>`;target.querySelector('form').onsubmit=event=>{event.preventDefault();const f=Object.fromEntries(new FormData(event.currentTarget)),tour={id:crypto.randomUUID(),slug:slugify(f.title),title:f.title,summary:f.summary,state:'published',stops:[1,2,3,4,5].map(n=>f[`stop${n}`]).filter(Boolean).map(id=>({placeId:id,mediaId:content.places.find(p=>p.id===id).coverId}))};if(!tour.stops.length){say('Choose at least one place for the tour.',true);return;}content.tours.push(tour);savePublication(content,`/tours/${tour.slug}/`).catch(handleError);};};
}
document.addEventListener('visibilitychange',checkFreshness);
window.addEventListener('focus',checkFreshness);
setInterval(checkFreshness,30000);
window.addEventListener('pagehide',saveLocal);
try { const session=await api('session'); if(session.author){author=session.author;await loadWorkspace();}else renderLogin(); } catch(error){renderLogin();say(error.message,true);}
