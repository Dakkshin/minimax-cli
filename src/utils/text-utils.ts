/**
 * Text manipulation utilities for terminal input handling
 * Inspired by Gemini CLI's text processing capabilities
 */

export interface TextPosition {
  index: number;
  line: number;
  column: number;
}

export interface TextSelection {
  start: number;
  end: number;
}

export interface TruncatedContent {
  content: string;
  isTruncated: boolean;
  originalLength: number;
  linesShown: number;
  totalLines: number;
}

/**
 * Check if a character is a word boundary
 */
export function isWordBoundary(char: string | undefined): boolean {
  if (!char) return true;
  return /\s/.test(char) || /[^\w]/.test(char);
}

/**
 * Find the start of the current word at the given position
 */
export function findWordStart(text: string, position: number): number {
  if (position <= 0) return 0;
  
  let pos = position - 1;
  while (pos > 0 && !isWordBoundary(text[pos])) {
    pos--;
  }
  
  // If we stopped at a word boundary, move forward to the actual word start
  if (pos > 0 && isWordBoundary(text[pos])) {
    pos++;
  }
  
  return pos;
}

/**
 * Find the end of the current word at the given position
 */
export function findWordEnd(text: string, position: number): number {
  if (position >= text.length) return text.length;
  
  let pos = position;
  while (pos < text.length && !isWordBoundary(text[pos])) {
    pos++;
  }
  
  return pos;
}

/**
 * Move cursor to the previous word boundary
 */
export function moveToPreviousWord(text: string, position: number): number {
  if (position <= 0) return 0;
  
  let pos = position - 1;
  
  // Skip whitespace
  while (pos > 0 && isWordBoundary(text[pos])) {
    pos--;
  }
  
  // Find start of the word
  while (pos > 0 && !isWordBoundary(text[pos - 1])) {
    pos--;
  }
  
  return pos;
}

/**
 * Move cursor to the next word boundary
 */
export function moveToNextWord(text: string, position: number): number {
  if (position >= text.length) return text.length;
  
  let pos = position;
  
  // Skip current word
  while (pos < text.length && !isWordBoundary(text[pos])) {
    pos++;
  }
  
  // Skip whitespace
  while (pos < text.length && isWordBoundary(text[pos])) {
    pos++;
  }
  
  return pos;
}

/**
 * Delete the word before the cursor
 */
export function deleteWordBefore(text: string, position: number): { text: string; position: number } {
  const wordStart = moveToPreviousWord(text, position);
  const newText = text.slice(0, wordStart) + text.slice(position);
  
  return {
    text: newText,
    position: wordStart,
  };
}

/**
 * Delete the word after the cursor
 */
export function deleteWordAfter(text: string, position: number): { text: string; position: number } {
  const wordEnd = moveToNextWord(text, position);
  const newText = text.slice(0, position) + text.slice(wordEnd);
  
  return {
    text: newText,
    position,
  };
}

/**
 * Get the current line and column from text position
 */
export function getTextPosition(text: string, index: number): TextPosition {
  const lines = text.slice(0, index).split('\n');
  return {
    index,
    line: lines.length - 1,
    column: lines[lines.length - 1].length,
  };
}

/**
 * Move to the beginning of the current line
 */
export function moveToLineStart(text: string, position: number): number {
  const beforeCursor = text.slice(0, position);
  const lastNewlineIndex = beforeCursor.lastIndexOf('\n');
  return lastNewlineIndex === -1 ? 0 : lastNewlineIndex + 1;
}

/**
 * Move to the end of the current line
 */
export function moveToLineEnd(text: string, position: number): number {
  const afterCursor = text.slice(position);
  const nextNewlineIndex = afterCursor.indexOf('\n');
  return nextNewlineIndex === -1 ? text.length : position + nextNewlineIndex;
}

/**
 * Handle proper Unicode-aware character deletion
 */
export function deleteCharBefore(text: string, position: number): { text: string; position: number } {
  if (position <= 0) {
    return { text, position };
  }
  
  // Handle surrogate pairs and combining characters
  let deleteCount = 1;
  const charBefore = text.charAt(position - 1);
  
  // Check for high surrogate (first part of surrogate pair)
  if (position >= 2) {
    const charBeforeBefore = text.charAt(position - 2);
    if (charBeforeBefore >= '\uD800' && charBeforeBefore <= '\uDBFF' && 
        charBefore >= '\uDC00' && charBefore <= '\uDFFF') {
      deleteCount = 2;
    }
  }
  
  const newText = text.slice(0, position - deleteCount) + text.slice(position);
  return {
    text: newText,
    position: position - deleteCount,
  };
}

/**
 * Handle proper Unicode-aware character deletion forward
 */
export function deleteCharAfter(text: string, position: number): { text: string; position: number } {
  if (position >= text.length) {
    return { text, position };
  }
  
  // Handle surrogate pairs and combining characters
  let deleteCount = 1;
  const charAfter = text.charAt(position);
  
  // Check for high surrogate (first part of surrogate pair)
  if (position + 1 < text.length) {
    const charAfterAfter = text.charAt(position + 1);
    if (charAfter >= '\uD800' && charAfter <= '\uDBFF' && 
        charAfterAfter >= '\uDC00' && charAfterAfter <= '\uDFFF') {
      deleteCount = 2;
    }
  }
  
  const newText = text.slice(0, position) + text.slice(position + deleteCount);
  return {
    text: newText,
    position,
  };
}

/**
 * Insert text at the given position with proper Unicode handling
 */
export function insertText(text: string, position: number, insert: string): { text: string; position: number } {
  const newText = text.slice(0, position) + insert + text.slice(position);
  return {
    text: newText,
    position: position + insert.length,
  };
}

/**
 * Truncate text content for display, showing a summary with option to expand
 */
export function truncateContent(
  content: string,
  options: {
    maxLines?: number;
    maxLength?: number;
    preserveWords?: boolean;
    terminalWidth?: number;
  } = {}
): TruncatedContent {
  const {
    maxLines = 20,
    maxLength = 2000,
    preserveWords = true,
    terminalWidth = 80,
  } = options;

  if (!content) {
    return {
      content: '',
      isTruncated: false,
      originalLength: 0,
      linesShown: 0,
      totalLines: 0,
    };
  }

  const lines = content.split('\n');
  const totalLines = lines.length;
  const originalLength = content.length;

  // If content is short enough, return as-is
  if (totalLines <= maxLines && originalLength <= maxLength) {
    return {
      content,
      isTruncated: false,
      originalLength,
      linesShown: totalLines,
      totalLines,
    };
  }

  let truncatedLines: string[] = [];
  let currentLength = 0;
  let linesShown = 0;

  // Add lines until we hit limits
  for (let i = 0; i < Math.min(maxLines, lines.length); i++) {
    const line = lines[i];

    // Check if adding this line would exceed maxLength
    if (currentLength + line.length > maxLength && truncatedLines.length > 0) {
      break;
    }

    truncatedLines.push(line);
    currentLength += line.length + 1; // +1 for newline
    linesShown++;

    // If we've reached maxLength, stop
    if (currentLength >= maxLength) {
      break;
    }
  }

  // If preserveWords is enabled and we truncated mid-word, adjust
  if (preserveWords && truncatedLines.length > 0) {
    const lastLine = truncatedLines[truncatedLines.length - 1];
    if (currentLength >= maxLength && !isWordBoundary(lastLine[lastLine.length - 1])) {
      // Find the last complete word
      const lastSpaceIndex = lastLine.lastIndexOf(' ');
      if (lastSpaceIndex > 0) {
        truncatedLines[truncatedLines.length - 1] = lastLine.substring(0, lastSpaceIndex);
      }
    }
  }

  let truncatedContent = truncatedLines.join('\n');

  // Add truncation indicator
  if (linesShown < totalLines || currentLength >= maxLength) {
    const remainingLines = totalLines - linesShown;
    const remainingChars = Math.max(0, originalLength - currentLength);

    let indicator = '\n\n';
    if (remainingLines > 0) {
      indicator += `... and ${remainingLines} more line${remainingLines !== 1 ? 's' : ''}`;
    }
    if (remainingChars > 0 && remainingLines === 0) {
      indicator += `... and ${remainingChars} more character${remainingChars !== 1 ? 's' : ''}`;
    }
    indicator += ' (truncated)';

    truncatedContent += indicator;
  }

  return {
    content: truncatedContent,
    isTruncated: linesShown < totalLines || currentLength >= maxLength,
    originalLength,
    linesShown,
    totalLines,
  };
}

/**
 * Create a human-readable summary of content characteristics
 */
export function summarizeContent(content: string): string {
  if (!content) return 'Empty content';

  const lines = content.split('\n');
  const totalLines = lines.length;
  const totalChars = content.length;
  const avgLineLength = totalChars / totalLines;

  let summary = `${totalLines} line${totalLines !== 1 ? 's' : ''}, ${totalChars} character${totalChars !== 1 ? 's' : ''}`;

  if (avgLineLength > 100) {
    summary += ' (long lines)';
  } else if (avgLineLength < 20) {
    summary += ' (short lines)';
  }

  // Check for common content types
  const firstLine = lines[0]?.toLowerCase() || '';
  if (firstLine.includes('error') || firstLine.includes('failed')) {
    summary += ' - appears to contain errors';
  } else if (firstLine.includes('success') || firstLine.includes('completed')) {
    summary += ' - appears to be successful output';
  } else if (content.includes('diff --git') || content.includes('@@ ')) {
    summary += ' - appears to be a diff/patch';
  } else if (content.includes('package.json') || content.includes('node_modules')) {
    summary += ' - appears to be Node.js related';
  }

  return summary;
}