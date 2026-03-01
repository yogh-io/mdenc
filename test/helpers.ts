export const TEST_PASSWORD = 'correct-horse-battery-staple';
export const WRONG_PASSWORD = 'wrong-password-guess';

// Fast scrypt params for tests (avoid slow KDF in test suite)
export const FAST_SCRYPT = {
  N: 1024,
  r: 1,
  p: 1,
};

export const SIMPLE_MARKDOWN = `# Hello World

This is a simple test document.

It has three paragraphs.`;

export const MULTI_PARAGRAPH_MARKDOWN = `# Project Notes

This is the first paragraph with some introductory text about the project.

## Section One

Here we discuss the first topic. It contains multiple sentences that form a reasonably sized paragraph for testing purposes.

## Section Two

Another section with different content. This paragraph has been modified in the latest version.

## Conclusion

Final thoughts on the project go here.`;

export const SINGLE_PARAGRAPH_MARKDOWN = `This is a single paragraph with no double-newline breaks anywhere in it.`;

export const EMPTY_MARKDOWN = '';

export const WINDOWS_NEWLINE_MARKDOWN = "# Title\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph.";

export function generateLargeMarkdown(paragraphs: number, wordsPerParagraph: number): string {
  const words = [
    'the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog',
    'lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing',
    'elit', 'sed', 'do', 'eiusmod', 'tempor', 'incididunt', 'ut', 'labore',
  ];
  const parts: string[] = [];
  for (let i = 0; i < paragraphs; i++) {
    const para: string[] = [];
    for (let j = 0; j < wordsPerParagraph; j++) {
      para.push(words[(i * wordsPerParagraph + j) % words.length]);
    }
    parts.push(para.join(' '));
  }
  return parts.join('\n\n');
}
