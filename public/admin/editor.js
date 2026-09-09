import { BRAND, escape as e, slugify, validateContent, clone, COLLECTIONS } from './content.js';
let author = '', base, content, draft, activeTab = 'update', requestId = crypto.randomUUID(), localTimer, checking = false;
const root = document.querySelector('#editor-root'), status = document.querySelector('#editor-status');
const key = () => `gielinor-workspace-${author}`;
const say = (message, error = false) => { status.textContent = message; status.classList.toggle('error', error); };
const img = m => m ? `<img src="${e(m.variants?.[400] || m.src)}" alt="${e(m.alt)}" loading="lazy" width="160" height="100">` : '';
const field = (label, name, value = '', type = 'text', extra = '') => `<label>${e(label)}<input type="${type}" name="${name}" value="${e(value)}" ${extra}></label>`;
const area = (label, name, value = '', cls = '') => `<label>${e(label)}<textarea name="${name}" class="${cls}">${e(value)}</textarea></label>`;
const options = (records, selected, label = 'name') => records.map(r => `<option value="${e(r.id)}" ${selected === r.id ? 'selected' : ''}>${e(r[label])}</option>`).join('');
const media = id => content.media.find(m => m.id === id);
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || 'The request failed.'); error.status = response.status; error.data = result;
    if (response.status === 401) { saveLocal(); renderLogin(true); }
    throw error;
  }
  return result;
}
function newDraft(placeId = '') { return { id: crypto.randomUUID(), title: '', body: '', placeId: placeId || content.places[0]?.id || '', mediaIds: [], state: 'draft', stageId: '', stageStatus: '', coverId: '', kind: 'Build update' }; }
function saveLocal() {
  if (!author || !content) return;
  try { localStorage.setItem(key(), JSON.stringify({ base, content, draft, requestId, savedAt: new Date().toISOString() })); document.querySelector('[data-autosave]')?.replaceChildren(document.createTextNode('Saved on this device.')); }
  catch { say('Browser storage is unavailable. Export your work or use Save privately before leaving.', true); }
}
function changed() { clearTimeout(localTimer); localTimer = setTimeout(saveLocal, 300); }
function renderLogin(expired = false) {
  root.innerHTML = `<section class="admin-card login-card"><h2>${expired ? 'Sign in again' : 'Welcome back.'}</h2><p>${expired ? 'Your writing is preserved on this device. Sign in to continue.' : 'Use your author name and access key. Your key is never stored in this browser.'}</p><form id="login" class="admin-form"><label>Author<select name="name"><option>Marc</option><option>David</option><option>Project authors</option></select></label>${field('Access key', 'token', '', 'password', 'required autocomplete="current-password"')}<button type="submit">Sign in</button></form><p class="admin-help">The shared legacy key uses “Project authors”. Named access identifies Marc and David separately.</p></section>`;
  document.querySelector('#login').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget, button = form.querySelector('button'); button.disabled = true;
    const name = form.elements.name.value, token = form.elements.token.value;
    try { const session = await api('session', 'POST', { name, token }); form.elements.token.value = ''; author = session.author; await loadWorkspace(expired); }
    catch (error) { say(error.message, true); button.disabled = false; }
  });
}
async function loadWorkspace(keepCurrent = false) {
  const data = await api('workspace'); author = data.author;
  if (!keepCurrent || !content) { base = clone(data.content); content = clone(data.content); draft = newDraft(); }
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key()) || 'null'); } catch {}
  render();
  if (saved && !keepCurrent) {
    const recovery = document.createElement('aside'); recovery.className = 'admin-card';
    recovery.innerHTML = `<h2>There’s work saved on this device.</h2><p>Saved ${e(new Date(saved.savedAt).toLocaleString())}. Recover it, or continue with the current publication.</p><div class="actions"><button data-recover>Recover saved work</button><button data-use-live>Use live version</button><button data-export-recovery>Export saved work</button></div>`;
    root.prepend(recovery);
    recovery.querySelector('[data-recover]').onclick = () => { base = saved.base; content = saved.content; draft = saved.draft; requestId = saved.requestId || crypto.randomUUID(); render(); say('Recovered the work saved on this device.'); };
    recovery.querySelector('[data-use-live]').onclick = () => { saveLocal(); recovery.remove(); say('Loaded the live publication.'); };
    recovery.querySelector('[data-export-recovery]').onclick = () => download('gielinor-recovered-work.json', saved);
  }
  say(data.source === 'snapshot' ? 'Loaded the preserved archive. No new publication has been made in this environment.' : `Live publication loaded. Signed in as ${author}.`);
}
function render() {
  document.querySelector('#session-controls').innerHTML = `<span class="meta">${e(author)}</span> <button type="button" id="sign-out">Sign out</button>`;
  document.querySelector('#sign-out').onclick = async () => { saveLocal(); await api('session', 'DELETE'); author = ''; renderLogin(); say('Signed out. Your work stays saved on this device.'); };
  const tabs = [['update', 'Add an update'], ['photos', 'Add photos'], ['places', 'Edit a place'], ['atlas', 'Atlas'], ['settings', 'Site settings'], ['history', 'Version history'], ['ideas', 'Ideas'], ['advanced', 'Advanced']];
  root.innerHTML = `<nav class="admin-nav" aria-label="Workspace areas">${tabs.map(([id, label]) => `<button type="button" data-tab="${id}" ${activeTab === id ? 'aria-current="page"' : ''}>${label}</button>`).join('')}</nav><div id="workspace-panel"></div>`;
  root.querySelectorAll('[data-tab]').forEach(button => button.onclick = () => { saveLocal(); activeTab = button.dataset.tab; render(); });
  if (activeTab === 'update') renderUpdate();
  if (activeTab === 'photos') renderPhotos();
  if (activeTab === 'places') renderPlaces();
  if (activeTab === 'atlas') renderAtlas();
  if (activeTab === 'settings') renderSettings();
  if (activeTab === 'history') renderHistory();
  if (activeTab === 'ideas') renderIdeas();
  if (activeTab === 'advanced') renderAdvanced();
}
const panel = () => document.querySelector('#workspace-panel');
function renderUpdate() {
  draft ||= newDraft();
  const sortedPlaces = [...content.places].sort((a, b) => {
    const latest = id => content.updates.filter(u => u.placeId === id).map(u => u.updatedAt || u.publishedAt || '').sort().at(-1) || '';
    return latest(b.id).localeCompare(latest(a.id));
  });
  panel().innerHTML = `<div class="admin-grid"><section class="admin-card"><h2>${draft.editing ? 'Revise an update' : 'Add an update'}</h2><form id="update-form" class="admin-form"><label>Place<select name="placeId" required>${options(sortedPlaces, draft.placeId)}</select></label>${field('Title', 'title', draft.title, 'text', 'required maxlength="200" placeholder="A small discovery in Draynor…"')}<div><div class="toolbar" aria-label="Note formatting"><button type="button" data-format="**">Bold</button><button type="button" data-format="*">Italic</button><button type="button" data-template="short">Short note</button><button type="button" data-template="long">Longer note</button></div>${area('What changed?', 'body', draft.body)}</div><div class="file-drop" data-drop><label>Add photographs<input type="file" data-upload multiple accept="image/jpeg,image/png,image/webp"></label><p class="admin-help">Drop JPEG, PNG or WebP files here. Up to 4 MB each.</p></div><div data-upload-progress></div><details><summary>Choose from the media library</summary><div class="admin-media-grid">${content.media.filter(m => m.subject !== 'Map').map(m => `<label><input type="checkbox" data-select-media="${m.id}" ${draft.mediaIds.includes(m.id) ? 'checked' : ''}>${img(m)}<span>${e(m.caption || m.alt)}</span></label>`).join('')}</div></details><div class="media-selection" data-selected-media></div><details><summary>Stage, cover and publishing details</summary><div class="admin-form"><label>Link a stage<select name="stageId"><option value="">No stage change</option>${options(content.stages.filter(s => s.placeId === draft.placeId), draft.stageId, 'publicTitle')}</select></label><label>Stage status<select name="stageStatus"><option value="">Keep current status</option>${['Built', 'In progress', 'Planned'].map(s => `<option ${draft.stageStatus === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Place cover<select name="coverId"><option value="">Keep current cover</option>${options(draft.mediaIds.map(media).filter(Boolean), draft.coverId, 'alt')}</select></label>${field('Completion date (only if known)', 'completedAt', draft.completedAt || '', 'date')}<p class="admin-help">The server supplies publication time, author and URL. Completion dates remain separate from publication dates.</p></div></details><p data-autosave class="save-indicator">Your work is saved on this device as you write.</p><div class="actions"><button type="button" data-preview-update>Preview</button><button type="submit" class="button brass">${draft.editing ? 'Publish revision' : 'Publish update'}</button><button type="button" data-save-private>Save privately</button></div></form></section><aside><section class="admin-card"><h3>One update, everywhere it belongs.</h3><p class="admin-help">Publishing adds this note to its place, journal, home and region. Uploaded photographs are available for reuse; uploading alone doesn’t publish an update.</p><button data-new-update>Start another update</button></section><section class="admin-card"><h3>Private drafts</h3><div data-private-drafts>Loading private drafts…</div></section><section class="admin-card"><h3>Recent publications</h3>${[...content.updates].filter(u => u.state === 'published').sort((a,b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0,8).map(u => `<button class="admin-draft" data-edit-update="${u.id}">${e(u.title)}</button>`).join('')}</section></aside></div>`;
  const form = document.querySelector('#update-form');
  form.addEventListener('input', event => { if (event.target.name) draft[event.target.name] = event.target.value; changed(); });
  form.elements.placeId.onchange = () => { draft.placeId = form.elements.placeId.value; draft.stageId = ''; draft.stageStatus = ''; renderUpdate(); changed(); };
  form.onsubmit = async event => { event.preventDefault(); try { const proposed = updateContent(); await savePublication(proposed, `/journal/${draft.slug || slugify(draft.title) || draft.id}/`); draft = newDraft(draft.placeId); saveLocal(); renderUpdate(); } catch (error) { handleError(error); } };
  document.querySelector('[data-preview-update]').onclick = async () => { try { await preview(updateContent(), `/journal/${draft.slug || slugify(draft.title) || draft.id}/`); } catch (error) { handleError(error); } };
  document.querySelector('[data-save-private]').onclick = async () => { saveLocal(); try { await api('drafts', 'PUT', { id: draft.id, draft, content, baseRevision: base.revision }); say('Saved privately in your author account. This has not been published.'); renderPrivateDrafts(); } catch (error) { handleError(error); } };
  document.querySelector('[data-new-update]').onclick = async () => { saveLocal(); try { if (draft.title || draft.body) await api('drafts', 'PUT', { id: draft.id, draft, content, baseRevision: base.revision }); draft = newDraft(); renderUpdate(); } catch(error) { handleError(error); } };
  document.querySelectorAll('[data-format]').forEach(button => button.onclick = () => { const textarea = form.elements.body, mark = button.dataset.format, start = textarea.selectionStart, end = textarea.selectionEnd; textarea.setRangeText(`${mark}${textarea.value.slice(start,end)}${mark}`, start, end, 'select'); draft.body = textarea.value; textarea.focus(); changed(); });
  document.querySelectorAll('[data-template]').forEach(button => button.onclick = () => { const text = button.dataset.template === 'short' ? 'What changed:\n\nA detail to look for:\n\nNext:' : 'Where we started:\n\nWhat we tried:\n\nWhat worked:\n\nWhat we’re still figuring out:\n\nNext:'; form.elements.body.value += `${draft.body ? '\n\n' : ''}${text}`; draft.body = form.elements.body.value; changed(); });
  document.querySelectorAll('[data-select-media]').forEach(input => input.onchange = () => { draft.mediaIds = input.checked ? [...draft.mediaIds, input.dataset.selectMedia] : draft.mediaIds.filter(id => id !== input.dataset.selectMedia); renderSelectedMedia(); changed(); });
  document.querySelectorAll('[data-edit-update]').forEach(button => button.onclick = () => { const update = content.updates.find(u => u.id === button.dataset.editUpdate); draft = { ...clone(update), editing: true }; renderUpdate(); });
  bindUploads(m => { if (!draft.mediaIds.includes(m.id)) draft.mediaIds.push(m.id); renderSelectedMedia(); changed(); });
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
  try { const drafts = await api('drafts'); if (!el.isConnected) return; el.innerHTML = drafts.map(d => `<button class="admin-draft" data-private-id="${e(d.id)}">${e(d.draft.title || 'Untitled update')}</button>`).join('') || '<p class="admin-help">No private drafts yet.</p>'; el.querySelectorAll('button').forEach(button => button.onclick = () => { const saved = drafts.find(d => d.id === button.dataset.privateId); draft = saved.draft; for (const m of saved.content?.media || []) if (!media(m.id)) content.media.push(m); renderUpdate(); }); }
  catch (error) { if (el.isConnected) el.textContent = error.message; }
}
function renderSelectedMedia() {
  const target = document.querySelector('[data-selected-media]'); if (!target) return;
  target.innerHTML = draft.mediaIds.map((id, index) => { const m = media(id); return `<div class="media-edit" draggable="true" data-media-edit="${id}">${img(m)}<div>${field('Image description (alt text)', `alt-${id}`, m.alt)}${field('Caption', `caption-${id}`, m.caption)}${field('Credit', `credit-${id}`, m.credit)}<div class="field-row">${field('Focal point X (0–100)', `x-${id}`, Math.round(m.focalPoint.x * 100), 'number', 'min="0" max="100"')}${field('Focal point Y (0–100)', `y-${id}`, Math.round(m.focalPoint.y * 100), 'number', 'min="0" max="100"')}</div><div class="actions"><button type="button" data-move="${index},-1" ${index === 0 ? 'disabled' : ''}>Move up</button><button type="button" data-move="${index},1" ${index === draft.mediaIds.length - 1 ? 'disabled' : ''}>Move down</button><button type="button" data-remove-media="${id}">Remove</button></div></div></div>`; }).join('');
  target.querySelectorAll('[data-media-edit]').forEach(row => {
    row.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', row.dataset.mediaEdit));
    row.addEventListener('dragover', event => event.preventDefault());
    row.addEventListener('drop', event => { event.preventDefault(); const id = event.dataTransfer.getData('text/plain'), before = row.dataset.mediaEdit; if (!draft.mediaIds.includes(id) || id === before) return; draft.mediaIds = draft.mediaIds.filter(v => v !== id); draft.mediaIds.splice(draft.mediaIds.indexOf(before), 0, id); renderSelectedMedia(); changed(); });
  });
  target.querySelectorAll('input').forEach(input => input.oninput = () => { const [property, ...rest] = input.name.split('-'), m = media(rest.join('-')); if (property === 'x' || property === 'y') m.focalPoint[property] = Math.max(0, Math.min(1, Number(input.value) / 100)); else m[property] = input.value; changed(); });
  target.querySelectorAll('[data-move]').forEach(button => button.onclick = () => { const [i,d] = button.dataset.move.split(',').map(Number); [draft.mediaIds[i],draft.mediaIds[i+d]] = [draft.mediaIds[i+d],draft.mediaIds[i]]; renderSelectedMedia(); changed(); });
  target.querySelectorAll('[data-remove-media]').forEach(button => button.onclick = () => { draft.mediaIds = draft.mediaIds.filter(id => id !== button.dataset.removeMedia); renderSelectedMedia(); changed(); });
}
async function savePublication(proposed, path = '/') {
  const errors = validateContent(proposed); if (errors.length) throw new Error(errors.join(' '));
  say('Publishing and verifying the live revision…'); saveLocal();
  document.querySelectorAll('button[type=submit]').forEach(b => b.disabled = true);
  try {
    const result = await api('publish', 'POST', { content: proposed, baseRevision: base.revision, requestId });
    base = clone(result.content); content = clone(result.content); requestId = crypto.randomUUID();
    saveLocal(); say('Published and verified. ');
    const link = document.createElement('a'); link.href = path; link.textContent = 'Open the live page ↗'; link.target = '_blank'; link.rel = 'noopener'; status.append(link);
    if (result.backup?.status === 'failed') {
      status.append(document.createTextNode(' The live page is published, but the optional GitHub backup failed. '));
      const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry backup'; retry.onclick = async () => { try { const backup = await api('backup', 'POST', {}); say(backup.status === 'saved' ? 'Public backup saved. The live publication is unchanged.' : 'Backup is still unavailable; the live publication remains saved.', backup.status !== 'saved'); } catch(error) { handleError(error); } }; status.append(retry);
    }
    return result;
  } finally { document.querySelectorAll('button[type=submit]').forEach(b => b.disabled = false); }
}
function handleError(error) {
  say(error.message, true); saveLocal();
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
  const input = document.querySelector('[data-upload]'), drop = document.querySelector('[data-drop]'); if (!input) return;
  const queue = async files => { for (const file of files) await uploadFile(file, onSuccess); };
  input.onchange = () => queue([...input.files]);
  drop?.addEventListener('dragover', event => { event.preventDefault(); drop.classList.add('dragging'); });
  drop?.addEventListener('dragleave', () => drop.classList.remove('dragging'));
  drop?.addEventListener('drop', event => { event.preventDefault(); drop.classList.remove('dragging'); queue([...event.dataTransfer.files]); });
}
async function uploadFile(file, onSuccess, row) {
  row ||= document.createElement('div'); row.className = 'upload-row'; row.innerHTML = `<span>${e(file.name)}</span><progress max="100" value="0" aria-label="Upload progress for ${e(file.name)}"></progress><span data-upload-state>Preparing…</span>`;
  document.querySelector('[data-upload-progress]')?.append(row);
  try {
    if (file.size > 4 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Use a JPEG, PNG or WebP under 4 MB.');
    const data = await new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const m = await new Promise((resolve,reject) => {
      const xhr = new XMLHttpRequest(); xhr.open('POST','/api/media'); xhr.setRequestHeader('Content-Type','application/json'); xhr.timeout = 90000;
      xhr.upload.onprogress = event => { if(event.lengthComputable) row.querySelector('progress').value = event.loaded / event.total * 100; row.querySelector('[data-upload-state]').textContent = 'Uploading and preparing image sizes…'; };
      xhr.onload = () => { try { const value = JSON.parse(xhr.responseText); if(xhr.status >= 200 && xhr.status < 300) resolve(value); else reject(new Error(value.error)); } catch { reject(new Error('The upload response was interrupted.')); } };
      xhr.onerror = () => reject(new Error('Connection interrupted.')); xhr.ontimeout = () => reject(new Error('Upload timed out.'));
      xhr.send(JSON.stringify({ fileName: file.name, contentType: file.type, data }));
    });
    if (!media(m.id)) content.media.push(m);
    row.querySelector('progress').value = 100; row.querySelector('[data-upload-state]').textContent = 'Uploaded; not yet published.'; onSuccess(m); saveLocal();
  } catch (error) { row.querySelector('[data-upload-state]').textContent = `${error.message} `; const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = 'Retry this file'; retry.onclick = () => uploadFile(file,onSuccess,row); row.append(retry); }
}
function renderPhotos() {
  panel().innerHTML = `<section class="admin-card"><h2>Add and curate photographs</h2><div class="file-drop" data-drop><label>Choose photographs<input type="file" data-upload multiple accept="image/jpeg,image/png,image/webp"></label></div><div data-upload-progress></div><p class="admin-help">Use the library to edit descriptions, focal points and gallery selection. Uploads are reused throughout the site.</p><div class="admin-media-grid">${content.media.map(m => `<button type="button" data-edit-photo="${m.id}" class="admin-draft">${img(m)}<span>${e(m.caption || m.alt)}</span></button>`).join('')}</div></section><div data-photo-form></div>`;
  bindUploads(() => say('Photograph uploaded. Choose it in the update or place editor.'));
  document.querySelectorAll('[data-edit-photo]').forEach(button => button.onclick = () => {
    const m = media(button.dataset.editPhoto), settings = content.settings[0], target = document.querySelector('[data-photo-form]');
    target.innerHTML = `<section class="admin-card"><h2>Edit photograph</h2>${img(m)}<form class="admin-form" id="photo-form">${field('Image description (alt text)','alt',m.alt,'text','required')}${field('Caption','caption',m.caption)}${field('Credit','credit',m.credit)}<label>Subject<select name="subject">${['Details & interiors','Landscapes & exteriors','Map'].map(s => `<option ${s===m.subject?'selected':''}>${s}</option>`).join('')}</select></label><div class="field-row">${field('Focal point X (0–100)','x',m.focalPoint.x*100,'number','min="0" max="100"')}${field('Focal point Y (0–100)','y',m.focalPoint.y*100,'number','min="0" max="100"')}</div><label class="checkbox"><input type="checkbox" name="gallery" ${settings.galleryMediaIds.includes(m.id)?'checked':''}>Include in gallery</label><label class="checkbox"><input type="checkbox" name="hero" ${settings.heroId===m.id?'checked':''}>Use as homepage hero</label><button type="submit">Save changes</button></form></section>`;
    document.querySelector('#photo-form').oninput = event => { const form=event.currentTarget; for(const name of ['alt','caption','credit','subject']) m[name]=form.elements[name].value; m.focalPoint={x:Number(form.elements.x.value)/100,y:Number(form.elements.y.value)/100}; settings.galleryMediaIds=form.elements.gallery.checked?[...new Set([...settings.galleryMediaIds,m.id])]:settings.galleryMediaIds.filter(id=>id!==m.id); if(form.elements.hero.checked)settings.heroId=m.id; changed(); };
    document.querySelector('#photo-form').onsubmit=async event=>{event.preventDefault();try{await savePublication(content,'/gallery/');}catch(error){handleError(error);}};
  });
}
function renderPlaces(selected = content.places[0]?.id) {
  panel().innerHTML = `<section class="admin-card"><div class="admin-section-heading"><h2>Edit a place</h2><button data-add-place>Add a place</button></div><label>Place<select data-place-select>${options(content.places,selected)}</select></label><div data-place-form></div></section>`;
  document.querySelector('[data-place-select]').onchange = event => renderPlaces(event.target.value);
  document.querySelector('[data-add-place]').onclick = () => { const id=`place-${crypto.randomUUID()}`;content.places.push({id,slug:id,name:'New place',regionId:'misthalin',status:'Planned',summary:'',category:'landmark',mediaIds:[],stageIds:[],pin:null,coverId:null,relatedIds:[],accessStatus:'No public access details have been announced here.'});renderPlaces(id);changed(); };
  const p=content.places.find(p=>p.id===selected); if(!p)return;
  document.querySelector('[data-place-form]').innerHTML=`<form class="admin-form" id="place-form">${field('Place name','name',p.name,'text','required')}${field('URL slug (keep stable after publication)','slug',p.slug,'text','required pattern="[a-z0-9-]+"')}<div class="field-row"><label>Region<select name="regionId">${options(content.regions,p.regionId)}</select></label><label>Status<select name="status">${['Built','In progress','Planned','Terrain only'].map(s=>`<option ${s===p.status?'selected':''}>${s}</option>`).join('')}</select></label></div>${area('Introduction','summary',p.summary,'short')}${field('Public access status','accessStatus',p.accessStatus)}<label>Category<select name="category">${['town','landmark','building','landscape','underground'].map(s=>`<option ${s===p.category?'selected':''}>${s}</option>`).join('')}</select></label><label>Cover photograph<select name="coverId"><option value="">No cover yet</option>${options(content.media,p.coverId,'alt')}</select></label><details><summary>Place photographs and stages</summary><div class="admin-media-grid">${content.media.filter(m=>m.subject!=='Map').map(m=>`<label><input type="checkbox" data-place-media="${m.id}" ${p.mediaIds.includes(m.id)?'checked':''}>${img(m)}${e(m.alt)}</label>`).join('')}</div>${content.stages.map(s=>`<label class="checkbox"><input type="checkbox" data-place-stage="${s.id}" ${p.stageIds.includes(s.id)?'checked':''}>${e(s.publicTitle)}</label>`).join('')}</details><div class="actions"><button type="button" data-preview-place>Preview</button><button type="submit">Save changes</button></div></form>`;
  const form=document.querySelector('#place-form');form.oninput=event=>{if(event.target.name)p[event.target.name]=event.target.value||null;changed();};
  form.querySelectorAll('[data-place-media]').forEach(input=>input.onchange=()=>{p.mediaIds=input.checked?[...p.mediaIds,input.dataset.placeMedia]:p.mediaIds.filter(id=>id!==input.dataset.placeMedia);changed();});
  form.querySelectorAll('[data-place-stage]').forEach(input=>input.onchange=()=>{const id=input.dataset.placeStage,s=content.stages.find(s=>s.id===id);p.stageIds=input.checked?[...new Set([...p.stageIds,id])]:p.stageIds.filter(v=>v!==id);if(input.checked){for(const other of content.places)if(other.id!==p.id)other.stageIds=other.stageIds.filter(v=>v!==id);s.placeId=p.id;}else if(s.placeId===p.id)s.placeId=null;changed();});
  document.querySelector('[data-preview-place]').onclick=()=>preview(content,`/places/${p.slug}/`).catch(handleError);
  form.onsubmit=async event=>{event.preventDefault();try{await savePublication(content,`/places/${p.slug}/`);}catch(error){handleError(error);}};
}
function renderAtlas(selected = content.places[0]?.id) {
  const p=content.places.find(p=>p.id===selected),map=media(content.settings[0].mapId);
  panel().innerHTML=`<section class="admin-card"><h2>Atlas pins and region notes</h2><form id="atlas-form" class="admin-form"><label>Place<select name="place">${options(content.places,selected)}</select></label><p class="admin-help">Click the map to place this pin, then fine-tune the coordinates. Pins use the same place pages as the directory.</p><div class="admin-pin-map" tabindex="0" role="group" aria-label="Pin placement map">${img(map)}<span class="admin-pin-marker" ${p.pin?'':'hidden'} style="left:${(p.pin?.x||0)*100}%;top:${(p.pin?.y||0)*100}%">◆</span></div><div class="pin-coordinates">${field('X percentage','x',p.pin?p.pin.x*100:'','number','min="0" max="100" step="0.01"')}${field('Y percentage','y',p.pin?p.pin.y*100:'','number','min="0" max="100" step="0.01"')}<button type="button" data-remove-pin>Remove pin</button></div><div class="actions"><button type="button" data-pin-nudge="-.001,0">Left</button><button type="button" data-pin-nudge=".001,0">Right</button><button type="button" data-pin-nudge="0,-.001">Up</button><button type="button" data-pin-nudge="0,.001">Down</button></div><label>Map image<select name="mapId">${options(content.media,content.settings[0].mapId,'alt')}</select></label>${content.regions.map(r=>`<details><summary>${e(r.name)}</summary>${area('Region note',`region-${r.id}`,r.note,'short')}</details>`).join('')}<button type="submit">Save atlas changes</button></form></section>`;
  const form=document.querySelector('#atlas-form'),canvas=document.querySelector('.admin-pin-map'),marker=canvas.querySelector('span');
  const setPin=(x,y)=>{p.pin={x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))};form.elements.x.value=(p.pin.x*100).toFixed(2);form.elements.y.value=(p.pin.y*100).toFixed(2);marker.hidden=false;marker.style.left=`${p.pin.x*100}%`;marker.style.top=`${p.pin.y*100}%`;changed();};
  form.elements.place.onchange=()=>renderAtlas(form.elements.place.value);
  canvas.onclick=event=>{const rect=canvas.getBoundingClientRect();setPin((event.clientX-rect.left)/rect.width,(event.clientY-rect.top)/rect.height);};
  for(const key of ['x','y'])form.elements[key].oninput=()=>setPin(Number(form.elements.x.value)/100,Number(form.elements.y.value)/100);
  document.querySelectorAll('[data-pin-nudge]').forEach(button=>button.onclick=()=>{const[x,y]=button.dataset.pinNudge.split(',').map(Number);setPin((p.pin?.x||.5)+x,(p.pin?.y||.5)+y);});
  document.querySelector('[data-remove-pin]').onclick=()=>{p.pin=null;renderAtlas(selected);changed();};
  form.oninput=event=>{if(event.target.name.startsWith('region-'))content.regions.find(r=>r.id===event.target.name.slice(7)).note=event.target.value;if(event.target.name==='mapId')content.settings[0].mapId=event.target.value;changed();};
  form.onsubmit=async event=>{event.preventDefault();try{await savePublication(content,`/explore/?place=${p.id}#atlas`);}catch(error){handleError(error);}};
}
function renderSettings() {
  const s=content.settings[0];
  panel().innerHTML=`<section class="admin-card"><h2>Site settings</h2><form id="settings-form" class="admin-form">${field('Project name','brand',s.brand,'text','readonly')}${field('Tagline','tagline',s.tagline,'text','readonly')}${area('Home introduction','introduction',s.introduction,'short')}${area('About the authors','aboutCopy',s.aboutCopy)}<label>Current focus<select name="focusStageId"><option value="">No current focus</option>${options(content.stages,s.focusStageId,'publicTitle')}</select></label><details open><summary>Homepage selection</summary>${s.featuredPlaceIds.map((id,i)=>`<p>${e(content.places.find(p=>p.id===id)?.name)} <button type="button" data-feature-move="${i},-1" ${i===0?'disabled':''}>Move up</button> <button type="button" data-feature-remove="${id}">Remove</button></p>`).join('')}<label>Add a featured place<select data-feature-add><option value="">Choose a place</option>${options(content.places.filter(p=>!s.featuredPlaceIds.includes(p.id)),null)}</select></label></details><details><summary>Navigation labels</summary>${['explore','journal','gallery','about'].map(route=>field(route[0].toUpperCase()+route.slice(1),`nav-${route}`,s.navLabels?.[route]||route[0].toUpperCase()+route.slice(1),'text','maxlength="30"')).join('')}</details><details><summary>Follow and support</summary>${field('Instagram','instagram',s.instagram,'url')}${field('Substack','substack',s.substack,'url')}${field('Fundraiser','fundraiser',s.fundraiser,'url')}${area('Support copy','supportCopy',s.supportCopy,'short')}${field('Current question','activeQuestion',s.activeQuestion)}</details><details><summary>Frequently asked questions</summary>${s.faq.map((f,i)=>`${field('Question',`faq-question-${i}`,f.question)}${area('Answer',`faq-answer-${i}`,f.answer,'short')}`).join('')}<button type="button" data-add-faq>Add question</button></details><details><summary>Credits and privacy</summary>${area('Credits','creditsCopy',s.creditsCopy)}${area('Privacy','privacyCopy',s.privacyCopy)}</details><details><summary>Community submissions</summary><p class="admin-help">Open the form only when a named reviewer can own the private queue. You can pause it at any time.</p>${field('Named reviewer','ideaReviewer',s.ideaReviewer)}${field('Retention in days','retentionDays',s.retentionDays,'number','min="1" max="365"')}<label class="checkbox"><input type="checkbox" name="ideasEnabled" ${s.ideasEnabled?'checked':''}>Accept new ideas</label></details><div class="actions"><button type="button" data-preview-settings>Preview home</button><button type="submit">Save changes</button></div></form></section>`;
  const form=document.querySelector('#settings-form');form.oninput=event=>{const input=event.target;if(input.name.startsWith('faq-')){const[,kind,i]=input.name.split('-');s.faq[Number(i)][kind]=input.value;}else if(input.name.startsWith('nav-')){s.navLabels||={};s.navLabels[input.name.slice(4)]=input.value;}else if(input.name)s[input.name]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;changed();};
  document.querySelector('[data-feature-add]').onchange=event=>{if(event.target.value){s.featuredPlaceIds.push(event.target.value);renderSettings();changed();}};
  document.querySelectorAll('[data-feature-move]').forEach(button=>button.onclick=()=>{const[i,d]=button.dataset.featureMove.split(',').map(Number);[s.featuredPlaceIds[i],s.featuredPlaceIds[i+d]]=[s.featuredPlaceIds[i+d],s.featuredPlaceIds[i]];renderSettings();changed();});
  document.querySelectorAll('[data-feature-remove]').forEach(button=>button.onclick=()=>{s.featuredPlaceIds=s.featuredPlaceIds.filter(id=>id!==button.dataset.featureRemove);renderSettings();changed();});
  document.querySelector('[data-add-faq]').onclick=()=>{s.faq.push({question:'',answer:''});renderSettings();};
  document.querySelector('[data-preview-settings]').onclick=()=>preview(content,'/').catch(handleError);
  form.onsubmit=async event=>{event.preventDefault();try{await savePublication(content);}catch(error){handleError(error);}};
}
async function renderHistory() {
  panel().innerHTML='<section class="admin-card"><h2>Version history</h2><p>Loading verified publications…</p></section>';
  try { const history=await api('revisions'); if(activeTab!=='history')return;
    panel().innerHTML=`<section class="admin-card"><h2>Version history</h2><p>Restore creates a new publication. The intervening history stays available.</p>${history.length?`<table class="admin-table"><thead><tr><th>Date</th><th>Author</th><th>Revision</th><th>Review</th></tr></thead><tbody>${history.map(r=>`<tr><td>${e(r.timestamp)}</td><td>${e(r.author)}</td><td>${e(r.revision.slice(0,12))}</td><td><button data-review-revision="${r.revision}">Review changes</button></td></tr>`).join('')}</tbody></table>`:'<p>No publications yet. The migration snapshot will be retained with the first publish.</p>'}<div data-revision-review></div></section>`;
    document.querySelectorAll('[data-review-revision]').forEach(button=>button.onclick=async()=>{try{const r=await api(`revisions/${button.dataset.reviewRevision}`),target=document.querySelector('[data-revision-review]'),changes=[];for(const type of COLLECTIONS){const old=new Map(r.content[type].map(record=>[record.id,record]));for(const record of content[type])if(JSON.stringify(old.get(record.id))!==JSON.stringify(record))changes.push(`${type}: ${record.name||record.title||record.id}`);for(const record of r.content[type])if(!content[type].some(v=>v.id===record.id))changes.push(`Restore ${type}: ${record.name||record.title||record.id}`);}target.innerHTML=`<h3>Changes from this version</h3><ul>${changes.map(c=>`<li>${e(c)}</li>`).join('')||'<li>No record changes</li>'}</ul><div class="actions"><button data-preview-revision>Preview this version</button><button data-restore-revision>Restore this publication</button></div>`;target.querySelector('[data-preview-revision]').onclick=()=>preview(r.content,'/').catch(handleError);target.querySelector('[data-restore-revision]').onclick=async()=>{try{const result=await api('restore','POST',{revision:r.revision,baseRevision:base.revision,requestId});base=clone(result.content);content=clone(result.content);requestId=crypto.randomUUID();saveLocal();say('Earlier publication restored and verified.');renderHistory();}catch(error){handleError(error);}};}catch(error){handleError(error);}});
  }catch(error){handleError(error);}
}
async function renderIdeas() {
  panel().innerHTML='<section class="admin-card"><h2>Private idea queue</h2><p>Loading…</p></section>';
  try { const ideas=await api('ideas');if(activeTab!=='ideas')return;panel().innerHTML=`<section class="admin-card"><h2>Private idea queue</h2><p>${content.settings[0].ideasEnabled?'Submissions are open.':'Submissions are paused.'} Expired ideas are removed according to the configured retention period. Only accepted, consented summaries with outcome links become public.</p>${ideas.map(i=>`<form class="admin-form admin-card" data-idea="${e(i.id)}"><h3>${e(content.places.find(p=>p.id===i.placeId)?.name)}</h3><p>${e(i.text)}</p><p class="admin-help">${e(i.email)} · ${e(i.displayName)} · Expires ${e(i.expiresAt)}</p><p class="admin-help">Summary consent: ${i.summaryConsent?'yes':'no'}. Credit consent: ${i.creditConsent?'yes':'no'}.</p><label>State<select name="state">${['New','Reviewing','Accepted','Not now','Closed'].map(s=>`<option ${s===i.state?'selected':''}>${s}</option>`).join('')}</select></label>${area('Reviewed public summary','summary',i.summary,'short')}${field('Link to the resulting build or update','outcomeUrl',i.outcomeUrl)}<div class="actions"><button type="submit">Save review</button><button type="button" data-delete-idea="${e(i.id)}">Delete idea and contact details</button></div></form>`).join('')||'<p>No ideas to review.</p>'}</section>`;
    document.querySelectorAll('[data-idea]').forEach(form=>form.onsubmit=async event=>{event.preventDefault();try{await api(`ideas/${form.dataset.idea}`,'PATCH',Object.fromEntries(new FormData(form)));say('Review saved.');}catch(error){handleError(error);}});
    document.querySelectorAll('[data-delete-idea]').forEach(button=>button.onclick=async()=>{try{await api(`ideas/${button.dataset.deleteIdea}`,'PATCH',{remove:true});renderIdeas();say('Idea and contact details deleted.');}catch(error){handleError(error);}});
  }catch(error){handleError(error);}
}
function download(filename, data) { const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
function renderAdvanced() {
  panel().innerHTML=`<section class="admin-card"><h2>Import, export and recovery</h2><div class="actions"><button data-export>Export current content</button><button data-export-work>Export recoverable workspace</button><button data-load-live>Load live content</button></div><label>Import content snapshot<input type="file" data-import accept="application/json,.json"></label><div data-import-summary></div></section><section class="admin-card"><h2>Original build stages</h2><label>Stage<select data-stage-select>${options(content.stages,content.stages[0]?.id,'publicTitle')}</select></label><div data-stage-form></div></section><section class="admin-card"><h2>Published updates</h2><p>Archive preserves the record in version history and removes it from public pages.</p>${content.updates.map(u=>`<p>${e(u.title)} <button data-archive-update="${u.id}">${u.state==='archived'?'Undo archive':'Archive'}</button></p>`).join('')}</section><section class="admin-card"><h2>External articles and tours</h2><p>Add curated links and guided visits using existing places and photographs.</p><button data-add-article>Add external article</button> <button data-add-tour>Add guided tour</button><div data-extra-editor></div></section>`;
  document.querySelector('[data-export]').onclick=()=>download('gielinor-publication.json',content);
  document.querySelector('[data-export-work]').onclick=()=>download('gielinor-workspace.json',{content,base,draft});
  document.querySelector('[data-load-live]').onclick=async()=>{saveLocal();download('gielinor-before-reload.json',{content,base,draft});await loadWorkspace();};
  document.querySelector('[data-import]').onchange=async event=>{try{const file=event.target.files[0];if(!file||file.size>2*1024*1024)throw new Error('Choose a JSON content snapshot under 2 MB.');const imported=JSON.parse(await file.text()),errors=validateContent(imported);if(errors.length)throw new Error(errors.join(' '));const target=document.querySelector('[data-import-summary]');target.innerHTML=`<h3>Import summary</h3><p>${imported.places.length} places, ${imported.stages.length} stages, ${imported.updates.length} updates and ${imported.media.length} images. This replaces your working copy. Publication still requires Save changes.</p><button data-apply-import>Use imported snapshot</button>`;target.querySelector('button').onclick=()=>{download('gielinor-before-import.json',content);content=imported;saveLocal();target.innerHTML='<p>Imported into this device’s working copy.</p><button data-publish-import>Save changes</button>';target.querySelector('button').onclick=()=>savePublication(content).catch(handleError);};}catch(error){handleError(error);}};
  const stageForm=id=>{const s=content.stages.find(s=>s.id===id);document.querySelector('[data-stage-form]').innerHTML=`<form id="stage-form" class="admin-form">${field('Public stage title','publicTitle',s.publicTitle)}${area('Scope','scope',s.scope,'short')}${area('Build notes','notes',s.notes)}<div class="field-row"><label>Status<select name="status">${['Built','In progress','Planned'].map(v=>`<option ${v===s.status?'selected':''}>${v}</option>`).join('')}</select></label>${field('Completion date (unknown stays blank)','completedAt',s.completedAt||'','date')}</div>${field('Estimated build hours','estimatedHours',s.estimatedHours||'','number','min="0" step="0.25"')}<p class="admin-help">Original ID: ${e(s.id)}. Original date stamp: ${e(s.legacyCompletedAt||'not recorded')}.</p><button type="submit">Save changes</button></form>`;const form=document.querySelector('#stage-form');form.oninput=event=>{const f=event.target;if(f.name)s[f.name]=f.type==='number'?Number(f.value):f.value;changed();};form.onsubmit=event=>{event.preventDefault();savePublication(content,`/builds/${s.id}/`).catch(handleError);};};
  document.querySelector('[data-stage-select]').onchange=event=>stageForm(event.target.value);stageForm(content.stages[0].id);
  document.querySelectorAll('[data-archive-update]').forEach(button=>button.onclick=async()=>{const u=content.updates.find(u=>u.id===button.dataset.archiveUpdate);u.state=u.state==='archived'?'published':'archived';try{await savePublication(content,'/journal/');renderAdvanced();}catch(error){handleError(error);}});
  document.querySelector('[data-add-article]').onclick=()=>{const target=document.querySelector('[data-extra-editor]');target.innerHTML=`<form id="article-form" class="admin-form">${field('Title','title','','text','required')}${field('Canonical article URL','url','','url','required')}${field('Publication date','date','','date','required')}${area('Excerpt','excerpt','','short')}<button type="submit">Add article and publish</button></form>`;target.querySelector('form').onsubmit=event=>{event.preventDefault();const record={id:crypto.randomUUID(),...Object.fromEntries(new FormData(event.currentTarget)),placeIds:[]};content.articles.push(record);savePublication(content,'/journal/').catch(handleError);};};
  document.querySelector('[data-add-tour]').onclick=()=>{const target=document.querySelector('[data-extra-editor]');target.innerHTML=`<form id="tour-form" class="admin-form">${field('Tour title','title','','text','required')}${area('Introduction','summary','','short')}<p class="admin-help">Choose the places in their visiting order. Each uses its existing cover and introduction.</p>${[1,2,3,4,5].map(n=>`<label>Stop ${n}<select name="stop${n}"><option value="">No stop</option>${options(content.places,null)}</select></label>`).join('')}<button type="submit">Publish guided tour</button></form>`;target.querySelector('form').onsubmit=event=>{event.preventDefault();const f=Object.fromEntries(new FormData(event.currentTarget)),tour={id:crypto.randomUUID(),slug:slugify(f.title),title:f.title,summary:f.summary,state:'published',stops:[1,2,3,4,5].map(n=>f[`stop${n}`]).filter(Boolean).map(id=>({placeId:id,mediaId:content.places.find(p=>p.id===id).coverId}))};if(!tour.stops.length){say('Choose at least one place for the tour.',true);return;}content.tours.push(tour);savePublication(content,`/tours/${tour.slug}/`).catch(handleError);};};
}
document.addEventListener('visibilitychange', async () => {
  if(document.hidden||!author||!base||checking)return;checking=true;
  try{const live=await api('workspace');if(live.content.revision!==base.revision)say('The live publication changed in another author session. Your work is preserved; independent changes will merge when you publish.');}catch(error){say(error.message,true);}finally{checking=false;}
});
window.addEventListener('pagehide',saveLocal);
try { const session=await api('session'); if(session.author){author=session.author;await loadWorkspace();}else renderLogin(); } catch(error){renderLogin();say(error.message,true);}
