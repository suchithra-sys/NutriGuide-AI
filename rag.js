/**
 * rag.js — RAG (Retrieval-Augmented Generation) Helper
 *
 * Performs keyword-based retrieval over the local foods.json dataset.
 * Retrieved food records are injected into Granite prompts as context,
 * enabling the Nutrition Knowledge Agent to answer with grounded data.
 */

'use strict';

const foods = require('./data/foods.json');

/**
 * Tokenise a text string into lowercase keywords.
 * Strips punctuation and common stop-words.
 */
function tokenise(text) {
  const stopWords = new Set([
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been',
    'have', 'has', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'in', 'on', 'at', 'to', 'for',
    'of', 'and', 'or', 'but', 'not', 'with', 'what', 'which', 'how',
    'tell', 'me', 'about', 'give', 'list', 'show', 'i', 'my', 'much',
    'many', 'some', 'good', 'best', 'food', 'foods', 'eat', 'eating'
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w));
}

/**
 * Score a single food entry against a set of query keywords.
 * Scoring rules:
 *   - name match (exact word): +3 points
 *   - category match:          +2 points
 *   - tag match:               +2 points each
 *   - partial name match:      +1 point
 */
function scoreFood(food, keywords) {
  let score = 0;
  const nameLower = food.name.toLowerCase();
  const categoryLower = food.category.toLowerCase();
  const tagsLower = food.tags.map(t => t.toLowerCase());

  for (const kw of keywords) {
    // Exact word in name
    if (nameLower.split(/\s+/).includes(kw)) {
      score += 3;
    } else if (nameLower.includes(kw)) {
      // Partial name match
      score += 1;
    }

    // Category match
    if (categoryLower.includes(kw)) {
      score += 2;
    }

    // Tag matches
    for (const tag of tagsLower) {
      if (tag === kw || tag.includes(kw)) {
        score += 2;
      }
    }
  }

  return score;
}

/**
 * Format a food entry as a compact context string for prompt injection.
 * Example:
 *   Chicken Breast (Meat): 165 kcal/100g | Protein: 31g | Carbs: 0g | Fat: 3.6g | Fiber: 0g | Tags: high-protein, non-veg, low-fat, weight-loss
 */
function formatFood(food) {
  return (
    `${food.name} (${food.category}): ` +
    `${food.calories_per_100g} kcal/100g | ` +
    `Protein: ${food.protein_g}g | ` +
    `Carbs: ${food.carbs_g}g | ` +
    `Fat: ${food.fat_g}g | ` +
    `Fiber: ${food.fiber_g}g | ` +
    `Tags: ${food.tags.join(', ')}`
  );
}

/**
 * retrieveContext(query, topK)
 *
 * Main export. Given a natural-language query, returns a formatted
 * multi-line string of the top-K most relevant food entries.
 * Returns an empty string if no relevant matches are found (score > 0).
 *
 * @param {string} query  - The user's question or topic
 * @param {number} topK   - Maximum number of results to return (default 5)
 * @returns {string}      - Formatted context block for prompt injection
 */
function retrieveContext(query, topK = 5) {
  const keywords = tokenise(query);

  if (keywords.length === 0) {
    // No meaningful keywords — return a broad sample instead
    return foods
      .slice(0, topK)
      .map(formatFood)
      .join('\n');
  }

  const scored = foods
    .map(food => ({ food, score: scoreFood(food, keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  if (scored.length === 0) {
    // No matches — fall back to a broad sample
    return foods
      .slice(0, topK)
      .map(formatFood)
      .join('\n');
  }

  return scored.map(({ food }) => formatFood(food)).join('\n');
}

/**
 * retrieveByCategory(category, topK)
 *
 * Returns foods filtered by category (case-insensitive).
 * Used by the Diet Recommendation Agent for category-specific queries.
 *
 * @param {string} category
 * @param {number} topK
 * @returns {string}
 */
function retrieveByCategory(category, topK = 5) {
  const catLower = category.toLowerCase();
  const matches = foods
    .filter(f => f.category.toLowerCase().includes(catLower))
    .slice(0, topK);

  return matches.length > 0
    ? matches.map(formatFood).join('\n')
    : '';
}

/**
 * retrieveByDiet(dietPreference, topK)
 *
 * Returns foods appropriate for a diet preference.
 * Maps preferences to relevant tags for filtering.
 *
 * @param {string} dietPreference - 'vegan' | 'vegetarian' | 'non-veg'
 * @param {number} topK
 * @returns {string}
 */
function retrieveByDiet(dietPreference, topK = 10) {
  const prefLower = dietPreference.toLowerCase();

  let filtered;
  if (prefLower === 'vegan') {
    filtered = foods.filter(f => f.tags.includes('vegan'));
  } else if (prefLower === 'vegetarian') {
    filtered = foods.filter(
      f => f.tags.includes('vegan') || f.tags.includes('vegetarian')
    );
  } else {
    // non-veg: all foods are valid
    filtered = foods;
  }

  return filtered
    .slice(0, topK)
    .map(formatFood)
    .join('\n');
}

/**
 * lookupFood(name)
 *
 * Exact or close name lookup for the Food Log & Feedback Agent.
 * Returns the matching food object or null.
 *
 * @param {string} name
 * @returns {object|null}
 */
function lookupFood(name) {
  const nameLower = name.toLowerCase().trim();
  return (
    foods.find(f => f.name.toLowerCase() === nameLower) ||
    foods.find(f => f.name.toLowerCase().includes(nameLower)) ||
    null
  );
}

module.exports = {
  retrieveContext,
  retrieveByCategory,
  retrieveByDiet,
  lookupFood,
  foods // exported for direct access if needed
};
