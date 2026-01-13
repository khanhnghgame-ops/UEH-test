// URL utilities for short ID handling

/**
 * Check if a string looks like a UUID (36 chars with dashes)
 */
export function isUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Check if a string looks like a short ID (8 alphanumeric chars)
 */
export function isShortId(id: string): boolean {
  return /^[a-z0-9]{8}$/i.test(id);
}

/**
 * Generate project URL using short_id
 */
export function getProjectUrl(shortId: string): string {
  return `/p/${shortId}`;
}

/**
 * Generate public project URL
 */
export function getPublicProjectUrl(shareToken: string): string {
  return `${window.location.origin}/s/${shareToken}`;
}

/**
 * Generate file preview URL with minimal params
 */
export function getFilePreviewUrl(filePath: string, projectShortId?: string, taskShortId?: string): string {
  const params = new URLSearchParams();
  params.set('file', filePath);
  if (projectShortId) params.set('p', projectShortId);
  if (taskShortId) params.set('t', taskShortId);
  return `/file-preview?${params.toString()}`;
}

/**
 * Parse file preview URL params
 */
export function parseFilePreviewParams(searchParams: URLSearchParams): {
  filePath: string | null;
  projectId: string | null;
  taskId: string | null;
} {
  return {
    filePath: searchParams.get('file'),
    projectId: searchParams.get('p') || searchParams.get('group'), // backward compat
    taskId: searchParams.get('t') || searchParams.get('task'), // backward compat
  };
}
