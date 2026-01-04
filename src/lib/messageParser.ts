// Message parsing utilities for @mentions and #task references

export interface ParsedMention {
  type: 'user' | 'assignee' | 'task';
  value: string;
  taskId?: string;
  startIndex: number;
  endIndex: number;
}

export interface ParsedContent {
  text: string;
  mentions: ParsedMention[];
}

/**
 * Parse message content to extract @mentions and #task references
 * Supports:
 * - @Name - mention a specific user
 * - @PhụTrách - mention task assignee (requires #task reference)
 * - #12 or #taskId - reference a task
 */
export function parseMessageContent(content: string): ParsedContent {
  const mentions: ParsedMention[] = [];
  
  // Match @Username (Vietnamese names with spaces, connected by non-breaking patterns)
  // Pattern: @followed by Vietnamese word characters until space or punctuation
  const userMentionRegex = /@([A-Za-zÀ-ỹ]+(?:\s[A-Za-zÀ-ỹ]+)*)/g;
  let match;

  while ((match = userMentionRegex.exec(content)) !== null) {
    const value = match[1];
    
    // Check if it's @PhụTrách
    if (value.toLowerCase() === 'phụtrách' || value.toLowerCase() === 'phutrach') {
      mentions.push({
        type: 'assignee',
        value: 'PhụTrách',
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    } else {
      mentions.push({
        type: 'user',
        value,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }
  }

  // Match #taskNumber or #taskId (UUID format or number)
  const taskRefRegex = /#([a-f0-9-]{36}|[0-9]+)/gi;
  
  while ((match = taskRefRegex.exec(content)) !== null) {
    mentions.push({
      type: 'task',
      value: match[1],
      taskId: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length
    });
  }

  // Sort by startIndex
  mentions.sort((a, b) => a.startIndex - b.startIndex);

  return { text: content, mentions };
}

/**
 * Render message content with highlighted mentions
 * Returns an array of text and mention segments
 */
export interface ContentSegment {
  type: 'text' | 'user-mention' | 'assignee-mention' | 'task-ref';
  content: string;
  taskId?: string;
  taskTitle?: string;
}

export function renderMessageContent(
  content: string,
  taskTitleMap?: Map<string, string>
): ContentSegment[] {
  const parsed = parseMessageContent(content);
  const segments: ContentSegment[] = [];
  let lastIndex = 0;

  for (const mention of parsed.mentions) {
    // Add text before this mention
    if (mention.startIndex > lastIndex) {
      segments.push({
        type: 'text',
        content: content.substring(lastIndex, mention.startIndex)
      });
    }

    // Add mention segment
    if (mention.type === 'user') {
      segments.push({
        type: 'user-mention',
        content: `@${mention.value}`
      });
    } else if (mention.type === 'assignee') {
      segments.push({
        type: 'assignee-mention',
        content: '@PhụTrách'
      });
    } else if (mention.type === 'task') {
      const taskTitle = taskTitleMap?.get(mention.taskId || '');
      segments.push({
        type: 'task-ref',
        content: `#${mention.value}${taskTitle ? ` – ${taskTitle}` : ''}`,
        taskId: mention.taskId,
        taskTitle
      });
    }

    lastIndex = mention.endIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    segments.push({
      type: 'text',
      content: content.substring(lastIndex)
    });
  }

  // If no segments, return whole content as text
  if (segments.length === 0) {
    segments.push({ type: 'text', content });
  }

  return segments;
}

/**
 * Extract mentioned user IDs from content based on member list
 */
export function extractMentionedUserIds(
  content: string,
  members: { id: string; name: string }[]
): string[] {
  const parsed = parseMessageContent(content);
  const userIds: string[] = [];

  for (const mention of parsed.mentions) {
    if (mention.type === 'user') {
      const member = members.find(m => 
        m.name.toLowerCase() === mention.value.toLowerCase() ||
        m.name.toLowerCase().includes(mention.value.toLowerCase())
      );
      if (member) {
        userIds.push(member.id);
      }
    }
  }

  return [...new Set(userIds)];
}

/**
 * Extract task IDs from content
 */
export function extractTaskIds(content: string): string[] {
  const parsed = parseMessageContent(content);
  return parsed.mentions
    .filter(m => m.type === 'task' && m.taskId)
    .map(m => m.taskId!);
}
