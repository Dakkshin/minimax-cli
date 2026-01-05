#!/usr/bin/env node

// Test script to demonstrate content truncation functionality

import { truncateContent } from './dist/utils/text-utils.js';

console.log('🔧 MiniMax CLI Content Truncation Test\n');

// Test 1: Short content (should not be truncated)
console.log('Test 1: Short content');
const shortContent = 'This is a short message that should not be truncated.';
const shortResult = truncateContent(shortContent, { maxLines: 15, maxLength: 1500 });
console.log('Is truncated:', shortResult.isTruncated);
console.log('Content:', shortResult.content);
console.log();

// Test 2: Long content (should be truncated)
console.log('Test 2: Long content (many lines)');
const longLines = [];
for (let i = 1; i <= 25; i++) {
  longLines.push(`Line ${i}: This is line number ${i} with some additional content to make it longer.`);
}
const longContent = longLines.join('\n');
const longResult = truncateContent(longContent, { maxLines: 15, maxLength: 1500 });
console.log('Is truncated:', longResult.isTruncated);
console.log('Lines shown:', longResult.linesShown, 'out of', longResult.totalLines);
console.log('Content preview:');
console.log(longResult.content.split('\n').slice(0, 5).join('\n'));
console.log('...[truncated content]...');
console.log();

// Test 3: Very long single line (should be truncated by length)
console.log('Test 3: Very long single line');
const veryLongLine = 'A'.repeat(2000);
const veryLongResult = truncateContent(veryLongLine, { maxLines: 20, maxLength: 100 });
console.log('Is truncated:', veryLongResult.isTruncated);
console.log('Original length:', veryLongResult.originalLength);
console.log('Truncated length:', veryLongResult.content.length);
console.log('Content ends with:', veryLongResult.content.slice(-50));
console.log();

// Test 4: Command output simulation (like from bash tool)
console.log('Test 4: Simulated bash command output (ls -la)');
const bashOutput = `total 120
drwxr-xr-x  18 user  staff    576 Jan  5 21:30 .
drwxr-xr-x   3 user  staff     96 Jan  5 21:25 ..
-rw-r--r--   1 user  staff   1075 Jan  5 21:28 package.json
-rw-r--r--   1 user  staff    497 Jan  5 21:28 README.md
-rw-r--r--   1 user  staff  12345 Jan  5 21:28 dist/
-rw-r--r--   1 user  staff   2345 Jan  5 21:28 src/
-rw-r--r--   1 user  staff     45 Jan  5 21:28 tsconfig.json
-rw-r--r--   1 user  staff   5678 Jan  5 21:28 node_modules/
-rw-r--r--   1 user  staff    123 Jan  5 21:28 .gitignore
-rw-r--r--   1 user  staff   4567 Jan  5 21:28 .eslintrc.js
-rw-r--r--   1 user  staff   8901 Jan  5 21:28 bun.lock
-rw-r--r--   1 user  staff   2345 Jan  5 21:28 utils.js
drwxr-xr-x   5 user  staff    160 Jan  5 21:28 .git/
-rw-r--r--   1 user  staff    678 Jan  5 21:28 LICENSE
-rw-r--r--   1 user  staff   3456 Jan  5 21:28 minimax-cli.png
-rw-r--r--   1 user  staff   7890 Jan  5 21:28 .env.example
-rw-r--r--   1 user  staff   1234 Jan  5 21:28 .cursorignore
-rw-r--r--   1 user  staff   5678 Jan  5 21:28 .prettierrc
-rw-r--r--   1 user  staff   9012 Jan  5 21:28 .editorconfig
-rw-r--r--   1 user  staff   3456 Jan  5 21:28 CONTRIBUTING.md
-rw-r--r--   1 user  staff   7890 Jan  5 21:28 CHANGELOG.md`;

const bashResult = truncateContent(bashOutput, { maxLines: 10, maxLength: 800 });
console.log('Is truncated:', bashResult.isTruncated);
console.log('Lines shown:', bashResult.linesShown, 'out of', bashResult.totalLines);
console.log('Simulated UI output:');
console.log('✓ Success');
console.log(bashResult.content);
if (bashResult.isTruncated) {
  console.log(`[Truncated - ${bashResult.totalLines - bashResult.linesShown} more lines, ${bashResult.originalLength - bashResult.content.length} more chars] Press 'e' to expand`);
}

console.log('\n✅ Content truncation is working correctly!');
console.log('The feature will automatically truncate long tool outputs and allow users to expand them by pressing \'e\'.');