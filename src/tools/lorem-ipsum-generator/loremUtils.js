// -----------------------------------------------------------------------
// LOREM IPSUM GENERATION - no React, no DOM.
//
// The word list is the vocabulary of the standard placeholder text, which
// comes from Cicero's "De finibus bonorum et malorum" (45 BC) with words
// cut and scrambled. Sentences and paragraphs get natural-looking, varied
// lengths so a layout filled with them looks like real copy.
// -----------------------------------------------------------------------

const WORDS = (
  'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore ' +
  'magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo ' +
  'consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint ' +
  'occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum curabitur pretium ' +
  'tincidunt lacus nunc pulvinar sapien ligula malesuada odio vitae mauris facilisis feugiat nibh posuere ' +
  'vestibulum ante primis faucibus orci luctus ultrices cubilia curae donec velit neque auctor sit amet aliquam ' +
  'vel ullamcorper massa purus sagittis morbi tristique senectus netus fames turpis egestas pellentesque ' +
  'habitant integer varius metus leo dictum risus blandit eget mattis quam viverra accumsan pharetra praesent ' +
  'semper feugiat placerat suspendisse potenti nullam porttitor arcu scelerisque fermentum dui faucibus ornare ' +
  'diam maecenas volutpat bibendum gravida cursus euismod lectus hendrerit congue eros sodales nec erat ' +
  'rhoncus urna condimentum mollis augue interdum velit laoreet proin libero nisl tellus iaculis lobortis ' +
  'imperdiet sem fringilla phasellus vulputate dignissim aenean commodo tortor convallis aptent taciti ' +
  'sociosqu litora torquent conubia nostra inceptos himenaeos'
).split(' ');

export const CLASSIC_OPENING = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';

export const UNITS = [
  { id: 'paragraphs', label: 'Paragraphs', max: 50, default: 3 },
  { id: 'sentences', label: 'Sentences', max: 200, default: 5 },
  { id: 'words', label: 'Words', max: 5000, default: 50 },
  { id: 'characters', label: 'Characters', max: 20000, default: 280 },
  { id: 'list', label: 'List items', max: 100, default: 5 },
];

export const OUTPUTS = [
  { id: 'text', label: 'Plain text' },
  { id: 'html', label: 'HTML' },
  { id: 'markdown', label: 'Markdown' },
];

const pick = (random, list) => list[Math.floor(random() * list.length)];
const between = (random, min, max) => min + Math.floor(random() * (max - min + 1));
const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

function words(random, count) {
  const out = [];
  while (out.length < count) {
    const word = pick(random, WORDS);
    // Avoids "dolor dolor" stutters, which look like a typo.
    if (word !== out[out.length - 1]) out.push(word);
  }
  return out;
}

function sentence(random) {
  const list = words(random, between(random, 6, 16));
  // An occasional comma in a longer sentence reads more like prose.
  if (list.length > 9 && random() < 0.6) list[between(random, 3, list.length - 4)] += ',';
  return `${capitalize(list.join(' '))}.`;
}

function paragraph(random) {
  return Array.from({ length: between(random, 4, 7) }, () => sentence(random)).join(' ');
}

/**
 * Returns { blocks, kind }: `kind` is 'paragraphs' (each block a
 * paragraph), 'list' (each block an item) or 'inline' (one block of text).
 * `random` is injectable for tests; the page uses Math.random.
 */
export function generateLorem({ unit, count, classic }, random = Math.random) {
  const n = Math.max(1, Math.floor(count) || 1);
  let kind = 'paragraphs';
  let blocks;

  if (unit === 'paragraphs') {
    blocks = Array.from({ length: n }, () => paragraph(random));
  } else if (unit === 'sentences') {
    blocks = [Array.from({ length: n }, () => sentence(random)).join(' ')];
  } else if (unit === 'list') {
    kind = 'list';
    blocks = Array.from({ length: n }, () => capitalize(words(random, between(random, 3, 8)).join(' ')));
  } else if (unit === 'words') {
    kind = 'inline';
    blocks = [capitalize(words(random, n).join(' '))];
  } else {
    // Exactly n characters: generate a little more than needed, then cut
    // at n and finish with a full stop so it doesn't end mid-word-ish.
    kind = 'inline';
    let text = '';
    while (text.length < n) text += `${text ? ' ' : ''}${sentence(random)}`;
    text = text.slice(0, n);
    if (n > 1) text = `${text.slice(0, -1).trimEnd()}.`.padEnd(n, '.').slice(0, n);
    blocks = [text];
  }

  if (classic && blocks.length) {
    blocks[0] = withClassicOpening(blocks[0], unit, n);
  }
  return { blocks, kind };
}

// Replaces the start of the first block with the famous opening line,
// without changing how many words/characters were asked for.
function withClassicOpening(block, unit, n) {
  if (unit === 'words') {
    const opening = CLASSIC_OPENING.replace(',', '').split(' ');
    const rest = block.split(' ').slice(opening.length);
    return [...opening, ...rest].slice(0, n).join(' ').replace(/^lorem/, 'Lorem');
  }
  if (unit === 'characters') {
    const text = `${CLASSIC_OPENING}. ${block}`;
    return n > 1 ? `${text.slice(0, n - 1).trimEnd()}.`.padEnd(n, '.').slice(0, n) : text.slice(0, n);
  }
  if (unit === 'list') return 'Lorem ipsum dolor sit amet';
  // Paragraphs and sentences: swap out the first sentence.
  return block.replace(/^[^.]*\./, `${CLASSIC_OPENING}.`);
}

/** Renders the blocks as plain text, HTML or Markdown. */
export function formatLorem({ blocks, kind }, output) {
  if (kind === 'list') {
    if (output === 'html') return `<ul>\n${blocks.map((b) => `  <li>${b}</li>`).join('\n')}\n</ul>`;
    return blocks.map((b) => `- ${b}`).join('\n');
  }
  if (output === 'html') return blocks.map((b) => `<p>${b}</p>`).join('\n');
  return blocks.join('\n\n');
}

export function countStats(text) {
  const plain = text.replace(/<[^>]+>/g, ' ');
  return {
    words: plain.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length,
    characters: text.length,
  };
}
