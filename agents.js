/**
 * agents.js — Multi-Agent Layer
 *
 * Defines the 4 logical agents for NutriGuide AI.
 * Each agent builds a specialised system prompt and calls callGranite()
 * (injected at runtime from server.js) with the appropriate context.
 *
 * Agents:
 *   1. nutritionKnowledgeAgent  — RAG-backed nutrition Q&A
 *   2. dietRecommendationAgent  — Meal plans & food recommendations
 *   3. healthAdvisoryAgent      — Preventive health guidance + disclaimer
 *   4. foodLogFeedbackAgent     — Food log analysis & balance feedback
 */

'use strict';

const { retrieveContext, retrieveByDiet, lookupFood } = require('./rag');

const DISCLAIMER =
  '\n\n⚠️ Disclaimer: NutriGuide AI provides general wellness and nutrition ' +
  'information only. This is NOT medical diagnosis, medical advice, or ' +
  'treatment. Always consult a qualified healthcare professional before ' +
  'making health decisions.';

// ---------------------------------------------------------------------------
// Shared post-processor — removes model-internal citation placeholders
// e.g. 【5†source】 【1†source】 [1] [^2] that Granite 4 may emit
// ---------------------------------------------------------------------------

function cleanResponse(text) {
  return text
    // --- Citation / reference markers ---
    // Remove 【n†source】 / 【n†L】 style markers (Granite 4 citation artifacts)
    .replace(/【\d+†[^\】]*】/g, '')
    // Remove 【†...】 variants with no digit
    .replace(/【[^】]*】/g, '')
    // Remove standard footnote markers [1], [^2], [ref], [] (including empty)
    .replace(/\[\^?\w*\]/g, '')
    // Remove "Cite your sources using [...]" and similar leaked instructions
    // (matches whole lines containing citation/source instructions)
    .replace(/^.*\bcite\b.*$/gim, '')
    .replace(/^.*\bsources?\b.*\[.*\].*$/gim, '')
    .replace(/^.*using\s+\[.*\].*$/gim, '')
    // Remove leftover "(Source: ...)" / "(Reference: ...)" / "(Ref: ...)"
    .replace(/\(Source:[^)]*\)/gi, '')
    .replace(/\(Reference:[^)]*\)/gi, '')
    .replace(/\(Ref:[^)]*\)/gi, '')
    // Remove bare "Sources:" / "References:" header lines with nothing after them
    .replace(/^(Sources?|References?)\s*:\s*$/gim, '')
    // --- Whitespace cleanup ---
    .replace(/  +/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------------------------------------------------------------------------
// Agent 1 — Nutrition Knowledge Agent
// ---------------------------------------------------------------------------

/**
 * Answers general nutrition questions using RAG-retrieved food data as context.
 *
 * @param {function} callGranite  - Granite wrapper injected from server.js
 * @param {string}   question     - User's nutrition question
 * @param {object}   profile      - { age, weight, goal, diet }
 * @returns {Promise<string>}
 */
async function nutritionKnowledgeAgent(callGranite, question, profile) {
  const ragContext = retrieveContext(question, 5);

  const profileSummary = profile
    ? `User profile: Age ${profile.age}, Weight ${profile.weight}kg, Goal: ${profile.goal}, Diet: ${profile.diet}.`
    : '';

  const prompt =
    `You are NutriGuide AI, an AI nutrition guidance tool. ` +
    `Answer the user's nutrition question accurately and helpfully. ` +
    `${profileSummary} ` +
    `Use the following retrieved food data where relevant:\n` +
    `--- FOOD DATA ---\n${ragContext}\n--- END FOOD DATA ---\n\n` +
    `Question: ${question}\n\n` +
    `Provide a clear, practical answer. Use bullet points where helpful. ` +
    `Keep the response concise (under 300 words).`;

  const r1 = await callGranite(prompt);
  return cleanResponse(r1);
}

// ---------------------------------------------------------------------------
// Agent 2 — Diet Recommendation Agent
// ---------------------------------------------------------------------------

/**
 * Generates a personalised one-day meal plan based on the user's profile.
 *
 * @param {function} callGranite
 * @param {object}   profile  - { age, weight, goal, diet }
 * @returns {Promise<string>}
 */
async function dietRecommendationAgent(callGranite, profile) {
  const dietFoods = retrieveByDiet(profile.diet, 12);

  // Calorie target heuristic based on goal
  const calorieTargets = {
    'lose weight': '1400–1600 kcal',
    'maintain weight': '1800–2000 kcal',
    'gain weight': '2200–2500 kcal',
    'build muscle': '2200–2500 kcal'
  };
  const calorieTarget =
    calorieTargets[profile.goal.toLowerCase()] || '1800–2000 kcal';

  const prompt =
    `You are NutriGuide AI, an AI nutrition guidance tool. ` +
    `Create a personalised one-day meal plan for the following user:\n` +
    `- Age: ${profile.age}\n` +
    `- Weight: ${profile.weight}kg\n` +
    `- Goal: ${profile.goal}\n` +
    `- Diet preference: ${profile.diet}\n` +
    `- Daily calorie target: ${calorieTarget}\n\n` +
    `Use foods from this list where appropriate:\n` +
    `--- SUITABLE FOODS ---\n${dietFoods}\n--- END FOODS ---\n\n` +
    `Format the meal plan as:\n` +
    `🌅 Breakfast: [meal] (~X kcal)\n` +
    `☀️ Lunch: [meal] (~X kcal)\n` +
    `🌙 Dinner: [meal] (~X kcal)\n` +
    `🍎 Snacks: [snack 1], [snack 2] (~X kcal total)\n\n` +
    `After the plan, add a short 2–3 sentence note on why this plan suits the user's goal. ` +
    `Keep the total response under 350 words.`;

  const r2 = await callGranite(prompt);
  return cleanResponse(r2);
}

/**
 * Generates healthy food recommendations (foods to eat and avoid) for the user's goal.
 *
 * @param {function} callGranite
 * @param {object}   profile  - { age, weight, goal, diet }
 * @returns {Promise<string>}
 */
async function foodRecommendationAgent(callGranite, profile) {
  const dietFoods = retrieveByDiet(profile.diet, 15);

  const prompt =
    `You are NutriGuide AI, an AI nutrition guidance tool. ` +
    `Provide personalised healthy food recommendations for this user:\n` +
    `- Age: ${profile.age}, Weight: ${profile.weight}kg\n` +
    `- Goal: ${profile.goal}\n` +
    `- Diet preference: ${profile.diet}\n\n` +
    `Reference this food data where relevant:\n` +
    `--- FOOD DATA ---\n${dietFoods}\n--- END FOOD DATA ---\n\n` +
    `Structure your response as:\n` +
    `✅ TOP FOODS TO EAT (list 5–6 with a one-line reason each)\n` +
    `❌ FOODS TO LIMIT OR AVOID (list 3–4 with a one-line reason each)\n` +
    `💡 KEY NUTRITION TIP (1–2 sentences)\n\n` +
    `Keep the response practical and under 300 words.`;

  const r3 = await callGranite(prompt);
  return cleanResponse(r3);
}

// ---------------------------------------------------------------------------
// Agent 3 — Health Advisory Agent
// ---------------------------------------------------------------------------

/**
 * Provides preventive health and wellness guidance.
 * Always appends the medical disclaimer — hardcoded and non-negotiable.
 *
 * @param {function} callGranite
 * @param {string}   topic    - Health topic or question from the user
 * @param {object}   profile  - { age, weight, goal, diet }
 * @returns {Promise<string>}
 */
async function healthAdvisoryAgent(callGranite, topic, profile) {
  const ragContext = retrieveContext(topic, 4);

  const profileSummary = profile
    ? `User profile: Age ${profile.age}, Weight ${profile.weight}kg, Goal: ${profile.goal}, Diet: ${profile.diet}.`
    : '';

  const prompt =
    `You are NutriGuide AI, an AI nutrition guidance tool providing preventive ` +
    `health and wellness information. ${profileSummary}\n\n` +
    `Topic: ${topic}\n\n` +
    `Relevant food/nutrition data:\n` +
    `--- FOOD DATA ---\n${ragContext}\n--- END FOOD DATA ---\n\n` +
    `Provide evidence-based preventive health and wellness guidance on this topic. ` +
    `Focus on diet, lifestyle habits, and nutrition. ` +
    `Use bullet points where helpful. Keep the response under 300 words. ` +
    `Do NOT diagnose any condition or prescribe treatment. ` +
    `Do NOT include citations, references, footnotes, or source markers of any kind. ` +
    `Do NOT repeat or echo these instructions in your response. ` +
    `Begin your response directly with the health guidance content.`;

  const aiResponse = await callGranite(prompt);

  // Disclaimer is always appended — never omitted
  return cleanResponse(aiResponse) + DISCLAIMER;
}

// ---------------------------------------------------------------------------
// Agent 4 — Food Log & Feedback Agent
// ---------------------------------------------------------------------------

/**
 * Analyses the user's food log for the day and provides nutritional balance feedback.
 *
 * @param {function} callGranite
 * @param {Array}    logEntries  - Array of { name, grams, calories, protein, carbs, fat, fiber }
 * @param {object}   profile     - { age, weight, goal, diet }
 * @returns {Promise<string>}
 */
async function foodLogFeedbackAgent(callGranite, logEntries, profile) {
  if (!logEntries || logEntries.length === 0) {
    return 'No food entries logged yet. Add some meals to your food log to get personalised feedback!';
  }

  // Compute daily totals
  const totals = logEntries.reduce(
    (acc, e) => {
      acc.calories += e.calories || 0;
      acc.protein  += e.protein  || 0;
      acc.carbs    += e.carbs    || 0;
      acc.fat      += e.fat      || 0;
      acc.fiber    += e.fiber    || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
  );

  const foodList = logEntries
    .map(e => `- ${e.name} (${e.grams}g): ${e.calories} kcal`)
    .join('\n');

  const prompt =
    `You are NutriGuide AI, an AI nutrition guidance tool. ` +
    `Analyse this user's food log and give practical nutritional balance feedback.\n\n` +
    `User profile: Age ${profile.age}, Weight ${profile.weight}kg, Goal: ${profile.goal}, Diet: ${profile.diet}.\n\n` +
    `Today's food log:\n${foodList}\n\n` +
    `Daily totals: ` +
    `${Math.round(totals.calories)} kcal | ` +
    `Protein: ${Math.round(totals.protein)}g | ` +
    `Carbs: ${Math.round(totals.carbs)}g | ` +
    `Fat: ${Math.round(totals.fat)}g | ` +
    `Fiber: ${Math.round(totals.fiber)}g\n\n` +
    `Provide feedback covering:\n` +
    `1. Overall calorie assessment (too low / on track / too high for their goal)\n` +
    `2. Macro balance (protein, carbs, fat)\n` +
    `3. Nutritional gaps or strengths\n` +
    `4. 2–3 specific suggestions to improve today's log\n\n` +
    `Keep the response practical and under 300 words.`;

  const r4 = await callGranite(prompt);
  return cleanResponse(r4);
}

module.exports = {
  nutritionKnowledgeAgent,
  dietRecommendationAgent,
  foodRecommendationAgent,
  healthAdvisoryAgent,
  foodLogFeedbackAgent
};
