import { publicContent } from './content.mjs';
import { storage } from './storage.mjs';
export async function backupPublication(content) {
  const repo = process.env.PUBLIC_BACKUP_REPO, branch = process.env.PUBLIC_BACKUP_BRANCH, token = process.env.PUBLIC_BACKUP_TOKEN;
  if (!repo || !branch || !token) return { status: 'not-configured' };
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) return { status: 'failed', message: 'Public backup repository is invalid.' };
  const snapshot = publicContent(content);
  const api = `https://api.github.com/repos/${repo}/contents/backups/gielinor-publication.json`;
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Gielinor-Reforged' };
  try {
    const existing = await fetch(`${api}?ref=${encodeURIComponent(branch)}`, { headers, signal: AbortSignal.timeout(5000) });
    if (!existing.ok && existing.status !== 404) throw new Error('Backup could not read the configured branch.');
    const previous = existing.ok ? await existing.json() : null;
    const response = await fetch(api, { method: 'PUT', headers, signal: AbortSignal.timeout(7000), body: JSON.stringify({ branch, message: `Back up Gielinor: Reforged publication ${content.revision}`, content: Buffer.from(JSON.stringify(snapshot, null, 2)).toString('base64'), ...(previous?.sha ? { sha: previous.sha } : {}) }) });
    if (!response.ok) throw new Error('The optional public backup failed. The live publication is already verified.');
    return { status: 'saved' };
  } catch (error) {
    // Keep a public-only retry record; secrets and private drafts/ideas never enter it.
    try { await storage().setJSON(`backup-pending/${content.revision}`, snapshot); } catch {}
    return { status: 'failed', message: error.message };
  }
}
