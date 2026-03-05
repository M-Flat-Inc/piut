const API_BASE = process.env.PIUT_API_BASE || 'https://piut.com'

export interface UploadFilePayload {
  projectName: string
  filePath: string
  content: string
  category: 'global' | 'project'
  deviceId: string
  deviceName: string
}

export interface UploadResult {
  filePath: string
  projectName: string
  version: number
  id: string
  status: string
}

export interface UploadResponse {
  uploaded: number
  errors: number
  files: UploadResult[]
}

export interface SyncedFileInfo {
  id: string
  project_name: string
  file_path: string
  category: string
  current_version: number
  content_hash: string
  size_bytes: number
  summary: string | null
  created_at: string
  updated_at: string
}

export interface FilesResponse {
  files: SyncedFileInfo[]
  storageUsed: number
  storageLimit: number
  fileCount: number
  fileLimit: number
  devices: Array<{ device_id: string; device_name: string | null }>
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }
}

/** Upload files to cloud backup */
export async function uploadFiles(
  apiKey: string,
  files: UploadFilePayload[],
): Promise<UploadResponse> {
  const res = await fetch(`${API_BASE}/api/sync/upload`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ files }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Upload failed (HTTP ${res.status})`)
  }

  return res.json()
}

/** List all synced files */
export async function listFiles(apiKey: string): Promise<FilesResponse> {
  const res = await fetch(`${API_BASE}/api/sync/files`, {
    headers: authHeaders(apiKey),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `List failed (HTTP ${res.status})`)
  }

  return res.json()
}

/** Pull files from cloud */
export async function pullFiles(
  apiKey: string,
  fileIds?: string[],
  deviceId?: string,
): Promise<{
  files: Array<{
    id: string
    project_name: string
    file_path: string
    content: string
    current_version: number
  }>
}> {
  const res = await fetch(`${API_BASE}/api/sync/pull`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ fileIds, deviceId }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Pull failed (HTTP ${res.status})`)
  }

  return res.json()
}

export interface FileVersionInfo {
  id: string
  fileId: string
  version: number
  contentHash: string
  contentSize: number
  changeSummary: string | null
  createdAt: string
}

export interface VersionsResponse {
  fileId: string
  projectName: string
  filePath: string
  currentVersion: number
  versions: FileVersionInfo[]
}

export interface VersionContentResponse {
  id: string
  fileId: string
  version: number
  content: string
  contentHash: string
  contentSize: number
  changeSummary: string | null
  createdAt: string
}

/** List version history for a file */
export async function listFileVersions(
  apiKey: string,
  fileId: string,
): Promise<VersionsResponse> {
  const res = await fetch(`${API_BASE}/api/sync/files/${fileId}/versions`, {
    headers: authHeaders(apiKey),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Version list failed (HTTP ${res.status})`)
  }

  return res.json()
}

/** Get a specific version's content */
export async function getFileVersion(
  apiKey: string,
  fileId: string,
  version: number,
): Promise<VersionContentResponse> {
  const res = await fetch(`${API_BASE}/api/sync/files/${fileId}/versions/${version}`, {
    headers: authHeaders(apiKey),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Version fetch failed (HTTP ${res.status})`)
  }

  return res.json()
}

/** Resolve a sync conflict */
export async function resolveConflict(
  apiKey: string,
  fileId: string,
  resolution: 'keep-local' | 'keep-cloud',
  localContent?: string,
  deviceId?: string,
  deviceName?: string,
): Promise<{ resolution: string; file: Record<string, unknown> }> {
  const res = await fetch(`${API_BASE}/api/sync/resolve`, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({ fileId, resolution, localContent, deviceId, deviceName }),
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(body.error || `Resolve failed (HTTP ${res.status})`)
  }

  return res.json()
}
