/**
 * Download/conversion job store persisted in chrome.storage.local.
 * Writes are serialized (promise chain) to avoid read-modify-write races
 * between concurrent jobs. Also used read-only by the popup via messaging.
 */
import { MSG } from './messages.js';

export const ACTIVE_STATUSES = Object.freeze([
  'queued',
  'preparing',
  'fetching',
  'converting',
  'saving',
  'downloading',
  'action_required',
]);

const STORAGE_KEY = 'dwJobs';
const MAX_JOBS = 60;

let chain = Promise.resolve();

/** Serialize async mutations. */
function withLock(fn) {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
}

function localStorage() {
  return typeof chrome !== 'undefined' && chrome?.storage?.local ? chrome.storage.local : null;
}

export function newJobId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `job-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function listJobs() {
  const s = localStorage();
  if (!s) return [];
  const got = await s.get(STORAGE_KEY);
  return Array.isArray(got[STORAGE_KEY]) ? got[STORAGE_KEY] : [];
}

async function writeJobs(jobs) {
  const s = localStorage();
  if (!s) return;
  await s.set({ [STORAGE_KEY]: jobs.slice(0, MAX_JOBS) });
}

export async function createJob(init = {}) {
  return withLock(async () => {
    const jobs = await listJobs();
    const job = {
      id: newJobId(),
      url: '',
      name: '',
      kind: 'other',        // detected/assumed kind: image|video|audio|document|archive|other
      target: 'original',   // 'original' | output format id (png/jpeg/webp/wav)
      status: 'queued',
      progress: 0,
      size: null,
      mime: null,
      info: null,           // { width, height, durationSec, sampleRate, channels }
      errorCode: null,
      downloadId: null,
      note: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      finishedAt: null,
      ...init,
    };
    jobs.unshift(job);
    await writeJobs(jobs);
    return job;
  });
}

export async function updateJob(id, patch) {
  return withLock(async () => {
    const jobs = await listJobs();
    const i = jobs.findIndex((j) => j.id === id);
    if (i < 0) return null;
    jobs[i] = { ...jobs[i], ...patch, updatedAt: Date.now() };
    if (['completed', 'failed', 'canceled'].includes(jobs[i].status)) {
      jobs[i].finishedAt = jobs[i].finishedAt || Date.now();
    }
    await writeJobs(jobs);
    return jobs[i];
  });
}

export async function getJob(id) {
  const jobs = await listJobs();
  return jobs.find((j) => j.id === id) || null;
}

export async function removeJob(id) {
  return withLock(async () => {
    const jobs = await listJobs();
    await writeJobs(jobs.filter((j) => j.id !== id));
  });
}

/** Remove everything except still-active jobs. Returns how many were removed. */
export async function clearFinishedJobs() {
  return withLock(async () => {
    const jobs = await listJobs();
    const keep = jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
    await writeJobs(keep);
    return jobs.length - keep.length;
  });
}

/** Push the current job list to every open extension page (popup/options). */
export async function broadcastJobs() {
  if (typeof chrome === 'undefined' || !chrome?.runtime?.sendMessage) return;
  try {
    const jobs = await listJobs();
    chrome.runtime.sendMessage({ type: MSG.JOBS_UPDATED, jobs }).catch(() => {});
  } catch {
    /* popup not open — ignore */
  }
}
