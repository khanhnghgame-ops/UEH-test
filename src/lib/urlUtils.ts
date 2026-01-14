// URL utilities for semantic, human-readable URLs
// Format: /p/{name-slug} for projects (clean, no random IDs)
// Format: /p/{project-slug}/t/{task-slug} for tasks

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
 * Check if a string is a semantic slug (name-based, no random prefix)
 */
export function isSlug(id: string): boolean {
  // Slug is any non-UUID, non-shortId string with at least one character
  return !isUUID(id) && !isShortId(id) && id.length > 0;
}

/**
 * Generate project URL using slug
 * Format: /p/{name-slug}
 */
export function getProjectUrl(slug: string): string {
  return `/p/${slug}`;
}

/**
 * Generate task URL with context
 * Format: /p/{project-slug}/t/{task-slug}
 */
export function getTaskUrl(projectSlug: string, taskSlug: string): string {
  return `/p/${projectSlug}/t/${taskSlug}`;
}

/**
 * Generate public project URL with share token
 */
export function getPublicProjectUrl(shareToken: string): string {
  return `${window.location.origin}/s/${shareToken}`;
}

/**
 * Generate file preview URL - semantic format
 * Format: /p/{project-slug}/t/{task-slug}/f/{file-index}
 * Fallback: /f?p={project}&t={task}&i={index}
 */
export function getFilePreviewUrl(
  projectSlug: string,
  taskSlug: string,
  fileIndex: number = 0
): string {
  return `/p/${projectSlug}/t/${taskSlug}/f/${fileIndex}`;
}

/**
 * Legacy file preview URL for backward compatibility
 * Used when only file path is available without context
 */
export function getLegacyFilePreviewUrl(
  filePath: string,
  projectSlug?: string,
  taskSlug?: string
): string {
  const params = new URLSearchParams();
  params.set('file', filePath);
  if (projectSlug) params.set('p', projectSlug);
  if (taskSlug) params.set('t', taskSlug);
  return `/file-preview?${params.toString()}`;
}

/**
 * Generate Vietnamese-safe slug from text
 * This is a client-side helper that mirrors the database function
 */
export function generateSlug(text: string): string {
  if (!text) return '';
  
  let result = text.toLowerCase();
  
  // Vietnamese character mappings
  const vietnameseMap: Record<string, string> = {
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
    'đ': 'd'
  };
  
  result = result.split('').map(char => vietnameseMap[char] || char).join('');
  
  // Replace non-alphanumeric with hyphens
  result = result.replace(/[^a-z0-9]+/g, '-');
  
  // Remove leading/trailing hyphens
  result = result.replace(/^-+|-+$/g, '');
  
  // Limit length
  return result.substring(0, 50);
}

/**
 * Format task code for display: [Stage.Order] or just [Order] if no stage
 */
export function getTaskCode(
  task: { stage_id: string | null; created_at: string },
  stages: { id: string; order_index: number }[],
  allTasksInStage: { id: string; created_at: string }[]
): string {
  const stage = stages.find(s => s.id === task.stage_id);
  const stageNum = stage ? stage.order_index + 1 : 0;
  
  // Calculate task order within stage
  const sortedTasks = [...allTasksInStage].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  const taskOrder = sortedTasks.findIndex(t => t.created_at === task.created_at) + 1;
  
  if (stageNum > 0) {
    return `${stageNum}.${taskOrder}`;
  }
  return `${taskOrder}`;
}
