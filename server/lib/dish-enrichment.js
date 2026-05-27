/**
 * Derive ingredients + dish tags from menu item name/description (no external API required).
 * Can be upgraded later to call the same LLM stack as menu AI upload.
 */

const PROTEINS = [
  'chicken',
  'beef',
  'goat',
  'lamb',
  'fish',
  'prawn',
  'shrimp',
  'turkey',
  'pork',
  'egg',
  'tofu',
  'beans'
];
const COURSES = ['starter', 'appetizer', 'main', 'side', 'dessert', 'drink', 'soup', 'salad'];
const CUISINES = [
  'nigerian',
  'yoruba',
  'igbo',
  'hausa',
  'continental',
  'chinese',
  'indian',
  'italian',
  'bbq',
  'grill',
  'suya',
  'jollof',
  'pepper soup'
];
const ALLERGENS = ['nuts', 'peanut', 'dairy', 'milk', 'cheese', 'gluten', 'shellfish', 'soy'];

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function extractIngredients(name, description) {
  const blob = `${name} ${description}`.toLowerCase();
  const found = new Set();
  const words = tokenize(blob);

  for (const w of words) {
    if (PROTEINS.includes(w) || CUISINES.includes(w)) found.add(w);
  }

  const pairs = [
    'palm oil',
    'plantain',
    'rice',
    'yam',
    'pepper',
    'tomato',
    'onion',
    'garlic',
    'ginger',
    'coconut',
    'avocado',
    'lettuce',
    'plantain chips'
  ];
  for (const p of pairs) {
    if (blob.includes(p)) found.add(p);
  }

  if (found.size === 0 && words.length) {
    words.slice(0, 5).forEach((w) => found.add(w));
  }

  return [...found].slice(0, 12);
}

function extractTags(name, description) {
  const blob = `${name} ${description}`.toLowerCase();
  const tags = {
    protein: [],
    course: [],
    cuisine: [],
    spice: [],
    allergens: []
  };

  for (const p of PROTEINS) {
    if (blob.includes(p)) tags.protein.push(p);
  }
  for (const c of COURSES) {
    if (blob.includes(c)) tags.course.push(c);
  }
  for (const c of CUISINES) {
    if (blob.includes(c)) tags.cuisine.push(c);
  }
  for (const a of ALLERGENS) {
    if (blob.includes(a)) tags.allergens.push(a);
  }
  if (/\b(spicy|hot|pepper|chilli|chili|ata)\b/.test(blob)) {
    tags.spice.push('spicy');
  }

  return tags;
}

function enrichDishMetadata(name, description) {
  const ingredients = extractIngredients(name, description);
  const dishTags = extractTags(name, description);
  const canonicalDishId = tokenize(name).slice(0, 6).join('-') || null;
  return {
    ingredients,
    dishTags,
    canonicalDishId: canonicalDishId && canonicalDishId.length >= 3 ? canonicalDishId : null
  };
}

module.exports = { enrichDishMetadata, extractIngredients, extractTags };
