// -----------------------------------------------------------------------
// THE TOOL REGISTRY
// -----------------------------------------------------------------------
// This file is the single source of truth for every tool on the site.
// The homepage, the header navigation, the search/command palette, and the
// /tool/:id route all read from the `tools` array below - nothing else
// needs to change when you add a new tool.
//
// See README.md for the step-by-step "how to add a new tool" recipe.
// -----------------------------------------------------------------------

import {
  Binary,
  Blend,
  Braces,
  Calculator,
  Clock,
  Code,
  Coins,
  Crop,
  Dices,
  Disc,
  FileImage,
  FileKey,
  FileText,
  Globe,
  Image,
  Images,
  KeyRound,
  Palette,
  PartyPopper,
  QrCode,
  Receipt,
  Regex,
  Ruler,
  ScanText,
  Shrink,
  Shuffle,
  Smartphone,
  Type,
  Wrench,
} from 'lucide-react';

import Base64Tool from './base64/Base64Tool.jsx';
import ImageConverter from './image-converter/ImageConverter.jsx';
import ImageCompressor from './image-compressor/ImageCompressor.jsx';
import ImageResizer from './image-resizer/ImageResizer.jsx';
import HeicToJpg from './heic-to-jpg/HeicToJpg.jsx';
import FaviconGenerator from './favicon-generator/FaviconGenerator.jsx';
import ImageToText from './image-to-text/ImageToText.jsx';
import ColorConverter from './color-converter/ColorConverter.jsx';
import ImageToBase64 from './image-to-base64/ImageToBase64.jsx';
import JsonFormatter from './json-formatter-validator/JsonFormatter.jsx';
import QrCodeGenerator from './qr-code-generator/QrCodeGenerator.jsx';
import WordCounterTextAnalyzer from './word-counter-text-analyzer/WordCounterTextAnalyzer.jsx';
import RegexTester from './regex-tester/RegexTester.jsx';
import UnitConverter from './unit-converter/UnitConverter.jsx';
import TipCalculator from './tip-calculator/TipCalculator.jsx';
import PasswordGenerator from './password-generator/PasswordGenerator.jsx';
import CurrencyConverter from './currency-converter/CurrencyConverter.jsx';
import WorldClockConverter from './world-clock-time-zone-converter/WorldClockConverter.jsx';
import DiceRoller from './dice-roller/DiceRoller.jsx';
import CoinFlip from './coin-flip/CoinFlip.jsx';
import RandomNumberGenerator from './random-number-generator/RandomNumberGenerator.jsx';
import GradientGenerator from './css-gradient-generator/GradientGenerator.jsx';
import JwtDecoder from './jwt-decoder/JwtDecoder.jsx';

// The fixed categories every tool must belong to. `id` is used in
// URLs and as a React key, `name` is what gets displayed on screen,
// `icon` is a lucide-react component, and `tagline` is the one-line
// summary shown on category pages.
export const CATEGORIES = [
  {
    id: 'graphics-media',
    name: 'Graphics & Media',
    icon: Image,
    tagline: 'Convert, compress, resize, and generate images - all in your browser.',
  },
  {
    id: 'text-data',
    name: 'Text & Data',
    icon: FileText,
    tagline: 'Encode, decode, and extract text without uploading a thing.',
  },
  {
    id: 'business-finance',
    name: 'Business & Finance',
    icon: Calculator,
    tagline: 'Everyday business and money calculations, done privately.',
  },
  {
    id: 'developer',
    name: 'Developer',
    icon: Code,
    tagline: 'Format, validate, and analyze the things you work with daily.',
  },
  {
    id: 'everyday',
    name: 'Everyday',
    icon: Wrench,
    tagline: 'Small utilities for the things that come up all the time.',
  },
  {
    id: 'fun',
    name: 'Fun',
    icon: PartyPopper,
    tagline: 'Dice, coins, and other small randomness tools - just for fun.',
  },
];

// One object per tool. To add a new tool:
//   1. Create src/tools/<your-tool>/<YourTool>.jsx
//   2. Import it below (plus a lucide icon for it)
//   3. Add an entry to this array
// That's it - the tool automatically shows up on the homepage, in search,
// in the command palette, and becomes reachable at /tool/<id>.
//
// Fields:
//   id / name / description - identity, shown everywhere
//   category                - must match a CATEGORIES id
//   icon                    - a lucide-react component (not a string)
//   keywords                - extra search terms; users rarely type the
//                             exact tool name, so this is what makes
//                             search actually find things
//   popular                 - surfaces the tool in "Popular tools"
export const tools = [
  {
    id: 'base64-encoder-decoder',
    name: 'Base64 Encoder / Decoder',
    description: 'Encode plain text into Base64, or decode Base64 back into readable text.',
    category: 'text-data',
    icon: Binary,
    component: Base64Tool,
    keywords: ['base64', 'encode', 'decode', 'btoa', 'atob', 'text'],
  },
  {
    id: 'image-converter',
    name: 'Image Converter',
    description: 'Convert images between PNG, JPG, WebP, and AVIF - right in your browser.',
    category: 'graphics-media',
    icon: Images,
    component: ImageConverter,
    keywords: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'convert', 'format', 'image'],
    popular: true,
  },
  {
    id: 'image-compressor',
    name: 'Image Compressor',
    description: 'Shrink image file size in your browser. Files never leave your device.',
    category: 'graphics-media',
    icon: Shrink,
    component: ImageCompressor,
    keywords: ['compress', 'shrink', 'optimize', 'reduce', 'size', 'image', 'photo'],
    popular: true,
  },
  {
    id: 'image-resizer',
    name: 'Image Resizer & Cropper',
    description: 'Resize or crop images in your browser. Files never leave your device.',
    category: 'graphics-media',
    icon: Crop,
    component: ImageResizer,
    keywords: ['resize', 'crop', 'scale', 'dimensions', 'aspect ratio', 'image'],
  },
  {
    id: 'heic-to-jpg',
    name: 'HEIC to JPG Converter',
    description: 'Convert iPhone HEIC photos to JPG in your browser. Files never leave your device.',
    category: 'graphics-media',
    icon: Smartphone,
    component: HeicToJpg,
    keywords: ['heic', 'heif', 'iphone', 'apple', 'jpg', 'jpeg', 'photo', 'convert'],
    popular: true,
  },
  {
    id: 'favicon-generator',
    name: 'Favicon Generator',
    description: 'Turn any image into a complete favicon package in your browser. Files never leave your device.',
    category: 'graphics-media',
    icon: Globe,
    component: FaviconGenerator,
    keywords: ['favicon', 'ico', 'icon', 'apple touch', 'manifest', 'website'],
  },
  {
    id: 'image-to-text',
    name: 'Image to Text (OCR)',
    description: 'Extract text from images in your browser using OCR. Files never leave your device.',
    category: 'text-data',
    icon: ScanText,
    component: ImageToText,
    keywords: ['ocr', 'extract', 'scan', 'text', 'recognize', 'screenshot', 'georgian'],
    popular: true,
  },
  {
    id: 'color-converter',
    name: 'Color Converter',
    description:
      'Convert colors instantly between HEX, RGB, RGBA, HSL, and HSLA entirely in your browser.',
    category: 'graphics-media',
    icon: Palette,
    component: ColorConverter,
    keywords: ['color', 'hex', 'rgb', 'rgba', 'hsl', 'hsla', 'picker', 'css'],
  },
  {
    id: 'image-to-base64',
    name: 'Image to Base64',
    description: 'Convert images to Base64 or Data URI format entirely in your browser. Files never leave your device.',
    category: 'graphics-media',
    icon: FileImage,
    component: ImageToBase64,
    keywords: ['base64', 'data uri', 'inline', 'embed', 'image', 'css', 'html'],
  },
  {
    id: 'json-formatter-validator',
    name: 'JSON Formatter, Validator & Fixer',
    description:
      'Format, validate, minify, and automatically fix broken JSON instantly in your browser. Your data never leaves your device.',
    category: 'developer',
    icon: Braces,
    component: JsonFormatter,
    keywords: ['json', 'format', 'beautify', 'pretty print', 'minify', 'validate', 'fix', 'repair'],
    popular: true,
  },
  {
    id: 'qr-code-generator',
    name: 'QR Code Generator',
    description:
      'Generate customizable QR codes for URLs, text, WiFi, contacts, email, phone numbers, SMS, and locations entirely in your browser.',
    category: 'graphics-media',
    icon: QrCode,
    component: QrCodeGenerator,
    keywords: ['qr', 'qr code', 'barcode', 'wifi', 'vcard', 'url', 'contact', 'generate'],
    popular: true,
  },
  {
    id: 'word-counter-text-analyzer',
    name: 'Word Counter & Text Analyzer',
    description:
      'Analyze text with live word count, character count, reading time, keyword density, readability metrics, and useful writing tools. Everything runs entirely in your browser.',
    category: 'developer',
    icon: Type,
    component: WordCounterTextAnalyzer,
    keywords: [
      'word count',
      'character count',
      'readability',
      'reading time',
      'keyword density',
      'case converter',
      'text',
    ],
  },
  {
    id: 'regex-tester',
    name: 'Regex Tester',
    description:
      'Test, validate, and debug regular expressions instantly in your browser with live highlighting and match details.',
    category: 'developer',
    icon: Regex,
    component: RegexTester,
    keywords: [
      'regex',
      'regexp',
      'regular expression',
      'pattern',
      'match',
      'test',
      'validate',
      'debug',
      'find and replace',
    ],
  },
  {
    id: 'unit-converter',
    name: 'Unit Converter',
    description:
      'Convert units instantly between length, weight, and temperature directly in your browser.',
    category: 'everyday',
    icon: Ruler,
    component: UnitConverter,
    keywords: [
      'unit',
      'convert',
      'length',
      'weight',
      'mass',
      'temperature',
      'meters',
      'feet',
      'celsius',
      'fahrenheit',
      'kilograms',
      'pounds',
    ],
    popular: true,
  },
  {
    id: 'tip-calculator',
    name: 'Tip Calculator & Bill Splitter',
    description:
      'Calculate tips, split restaurant bills equally or proportionally, and instantly see how much each person should pay.',
    category: 'business-finance',
    icon: Receipt,
    component: TipCalculator,
    keywords: [
      'tip',
      'gratuity',
      'bill split',
      'split the bill',
      'restaurant',
      'receipt',
      'group bill',
      'how much to tip',
    ],
    popular: true,
  },
  {
    id: 'password-generator',
    name: 'Password Generator',
    description: 'Generate secure random passwords instantly in your browser.',
    category: 'developer',
    icon: KeyRound,
    component: PasswordGenerator,
    keywords: [
      'password',
      'generator',
      'random',
      'secure',
      'passphrase',
      'strength',
      'crypto',
    ],
    popular: true,
  },
  {
    id: 'currency-converter',
    name: 'Currency Converter',
    description: 'Convert between world currencies using live exchange rates with a simple historical chart.',
    category: 'business-finance',
    icon: Coins,
    component: CurrencyConverter,
    keywords: [
      'currency',
      'exchange rate',
      'forex',
      'money',
      'usd',
      'eur',
      'gbp',
      'convert',
      'historical rates',
    ],
    popular: true,
  },
  {
    id: 'world-clock-time-zone-converter',
    name: 'World Clock & Time Zone Converter',
    description: 'Compare current times around the world and convert dates and times between different time zones.',
    category: 'everyday',
    icon: Clock,
    component: WorldClockConverter,
    keywords: [
      'time zone',
      'world clock',
      'utc',
      'gmt',
      'dst',
      'daylight saving',
      'convert time',
      'timezone converter',
    ],
    popular: true,
  },
  {
    id: 'dice-roller',
    name: 'Dice Roller',
    description: 'Roll one or multiple virtual dice with smooth animations.',
    category: 'fun',
    icon: Dices,
    component: DiceRoller,
    keywords: ['dice', 'roll', 'd4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100', 'tabletop', 'rpg', 'random'],
    popular: true,
  },
  {
    id: 'coin-flip',
    name: 'Coin Flip',
    description: 'Flip one or multiple virtual coins with realistic animations.',
    category: 'fun',
    icon: Disc,
    component: CoinFlip,
    keywords: ['coin', 'flip', 'heads', 'tails', 'toss', 'random', 'decision'],
    popular: true,
  },
  {
    id: 'random-number-generator',
    name: 'Random Number Generator',
    description: 'Generate random numbers instantly with customizable ranges.',
    category: 'fun',
    icon: Shuffle,
    component: RandomNumberGenerator,
    keywords: ['random number', 'rng', 'generator', 'range', 'lottery', 'raffle', 'pick a number'],
    popular: true,
  },
  {
    id: 'css-gradient-generator',
    name: 'CSS Gradient Generator',
    description: 'Create beautiful CSS gradients visually and copy the generated CSS instantly.',
    category: 'developer',
    icon: Blend,
    component: GradientGenerator,
    keywords: [
      'css',
      'gradient',
      'linear gradient',
      'radial gradient',
      'color stops',
      'background',
      'generator',
    ],
    popular: true,
  },
  {
    id: 'jwt-decoder',
    name: 'JWT Decoder & Inspector',
    description: 'Decode and inspect JSON Web Tokens (JWT) instantly in your browser without sending data to any server.',
    category: 'developer',
    icon: FileKey,
    component: JwtDecoder,
    keywords: ['jwt', 'json web token', 'decode', 'token', 'auth', 'bearer token', 'claims', 'base64url'],
    popular: true,
  },
];

// Groups `tools` by category, in the same order as CATEGORIES, so the
// homepage can just loop over the result. Categories with no tools yet
// are still included (with an empty list) so they always appear.
export function getToolsByCategory() {
  return CATEGORIES.map((category) => ({
    ...category,
    tools: tools.filter((tool) => tool.category === category.id),
  }));
}

// Looks up a single tool by its id. Returns undefined if not found, which
// ToolPage.jsx treats as "show a not-found message."
export function getToolById(id) {
  return tools.find((tool) => tool.id === id);
}

export function getCategoryById(id) {
  return CATEGORIES.find((category) => category.id === id);
}

export function getPopularTools() {
  return tools.filter((tool) => tool.popular);
}

// Other tools in the same category - shown at the bottom of every tool
// page so there's always somewhere useful to go next.
export function getRelatedTools(toolId, limit = 3) {
  const tool = getToolById(toolId);
  if (!tool) return [];
  return tools.filter((other) => other.category === tool.category && other.id !== toolId).slice(0, limit);
}

// Powers both the homepage search box and the ⌘K command palette.
// Matches against name, description, category name, and keywords, then
// ranks name matches above everything else so typing "json" puts the JSON
// tool first rather than whichever tool merely mentions JSON.
export function searchTools(query) {
  const q = query.trim().toLowerCase();
  if (!q) return tools;

  return tools
    .map((tool) => {
      const name = tool.name.toLowerCase();
      const categoryName = (getCategoryById(tool.category)?.name ?? '').toLowerCase();

      let score = 0;
      if (name.startsWith(q)) score = 100;
      else if (name.includes(q)) score = 80;
      else if (tool.keywords?.some((keyword) => keyword.toLowerCase().startsWith(q))) score = 60;
      else if (tool.keywords?.some((keyword) => keyword.toLowerCase().includes(q))) score = 40;
      else if (categoryName.includes(q)) score = 20;
      else if (tool.description.toLowerCase().includes(q)) score = 10;

      return { tool, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.tool);
}
