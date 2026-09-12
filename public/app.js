/**
 * app.js — NutriGuide AI Frontend Logic
 *
 * Handles:
 *   - User profile (localStorage read/write)
 *   - Tab navigation
 *   - All API fetch calls to the backend agents
 *   - Food log (localStorage, add/delete/render)
 *   - Chart.js dashboard rendering
 *   - Food name autocomplete via /api/food-lookup
 */

'use strict';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROFILE_KEY  = 'nutriguide_profile';
const LOG_KEY      = 'nutriguide_log';
const LOG_DATE_KEY = 'nutriguide_log_date';

// Calorie targets per goal (matches agents.js heuristic)
const CALORIE_GOALS = {
  'lose weight':     1500,
  'maintain weight': 1900,
  'gain weight':     2350,
  'build muscle':    2350
};

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

function getProfile() {
  try {
    return JSON.parse(localStorage.getItem(PROFILE_KEY));
  } catch {
    return null;
  }
}

function saveProfile(profile) {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function profileSummaryText(p) {
  if (!p) return '';
  const goalCap = p.goal.charAt(0).toUpperCase() + p.goal.slice(1);
  const dietCap = p.diet.charAt(0).toUpperCase() + p.diet.slice(1);
  return `Age ${p.age} · ${p.weight}kg · ${goalCap} · ${dietCap}`;
}

// ---------------------------------------------------------------------------
// Food Log helpers (localStorage, resets daily)
// ---------------------------------------------------------------------------

function getTodayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

function getLog() {
  const today = getTodayKey();
  const storedDate = localStorage.getItem(LOG_DATE_KEY);
  if (storedDate !== today) {
    // New day — clear yesterday's log
    localStorage.setItem(LOG_DATE_KEY, today);
    localStorage.setItem(LOG_KEY, JSON.stringify([]));
  }
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY)) || [];
  } catch {
    return [];
  }
}

function saveLog(entries) {
  localStorage.setItem(LOG_KEY, JSON.stringify(entries));
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function show(el) { el.classList.remove('hidden'); }
function hide(el) { el.classList.add('hidden'); }

function setLoading(el, text = 'Thinking…') {
  show(el);
  el.innerHTML = `<div class="loading-row"><span class="spinner"></span>${text}</div>`;
}

function setResult(el, text) {
  show(el);
  // Convert newlines to <br> and preserve basic formatting
  el.innerHTML = formatResponse(text);
}

/**
 * Very light markdown-ish formatter:
 *   - **bold** → <strong>
 *   - Lines starting with emoji bullets or numbered lists get wrapped
 *   - ⚠️ disclaimer line gets special styling
 */
function formatResponse(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(⚠️[^\n]+)/g, '<span class="disclaimer-line">$1</span>')
    .split('\n')
    .map(line => {
      if (line.trim() === '') return '<br/>';
      return `<p>${line}</p>`;
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Profile Modal
// ---------------------------------------------------------------------------

const profileModal   = document.getElementById('profile-modal');
const profileForm    = document.getElementById('profile-form');
const profileLabel   = document.getElementById('profile-label');
const editProfileBtn = document.getElementById('edit-profile-btn');

function openProfileModal(profile) {
  if (profile) {
    document.getElementById('p-age').value    = profile.age;
    document.getElementById('p-weight').value = profile.weight;
    document.getElementById('p-goal').value   = profile.goal;
    document.getElementById('p-diet').value   = profile.diet;
  }
  show(profileModal);
}

function closeProfileModal() {
  hide(profileModal);
}

function updateProfileLabel() {
  const p = getProfile();
  profileLabel.textContent = p ? profileSummaryText(p) : 'My Profile';
}

profileForm.addEventListener('submit', e => {
  e.preventDefault();
  const profile = {
    age:    parseInt(document.getElementById('p-age').value,    10),
    weight: parseInt(document.getElementById('p-weight').value, 10),
    goal:   document.getElementById('p-goal').value,
    diet:   document.getElementById('p-diet').value
  };
  saveProfile(profile);
  closeProfileModal();
  updateProfileLabel();
  updateProfileChips();
});

editProfileBtn.addEventListener('click', () => openProfileModal(getProfile()));

// ---------------------------------------------------------------------------
// Tab Navigation
// ---------------------------------------------------------------------------

const tabBtns   = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');

    // Refresh dashboard whenever the user switches to it
    if (target === 'dashboard') renderDashboard();
  });
});

// ---------------------------------------------------------------------------
// Profile chips (shown on Meal Plan & Recommend tabs)
// ---------------------------------------------------------------------------

function updateProfileChips() {
  const p    = getProfile();
  const text = p ? `👤 ${profileSummaryText(p)}` : '👤 Profile not set';
  ['mealplan-profile-chip', 'recommend-profile-chip'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

// ---------------------------------------------------------------------------
// TAB 1 — Chat
// ---------------------------------------------------------------------------

const chatForm   = document.getElementById('chat-form');
const chatInput  = document.getElementById('chat-input');
const chatWindow = document.getElementById('chat-window');
const chatSendBtn = document.getElementById('chat-send-btn');

function appendChatMessage(role, text) {
  const wrapper = document.createElement('div');
  wrapper.className = `chat-message ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = role === 'assistant' ? formatResponse(text) : escapeHtml(text);
  wrapper.appendChild(bubble);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

chatForm.addEventListener('submit', async e => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  appendChatMessage('user', message);
  chatInput.value = '';
  chatSendBtn.disabled = true;

  // Show typing indicator
  const typingId = 'typing-' + Date.now();
  const typingEl = document.createElement('div');
  typingEl.className = 'chat-message assistant';
  typingEl.id = typingId;
  typingEl.innerHTML = '<div class="bubble"><span class="spinner"></span> Thinking…</div>';
  chatWindow.appendChild(typingEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    const data = await apiPost('/api/chat', { message, profile: getProfile() });
    document.getElementById(typingId)?.remove();
    appendChatMessage('assistant', data.response);
  } catch (err) {
    document.getElementById(typingId)?.remove();
    appendChatMessage('assistant', `❌ Error: ${err.message}`);
  } finally {
    chatSendBtn.disabled = false;
    chatInput.focus();
  }
});

// ---------------------------------------------------------------------------
// TAB 2 — Meal Plan
// ---------------------------------------------------------------------------

const generateMealPlanBtn = document.getElementById('generate-mealplan-btn');
const mealplanResult      = document.getElementById('mealplan-result');

generateMealPlanBtn.addEventListener('click', async () => {
  generateMealPlanBtn.disabled = true;
  setLoading(mealplanResult, 'Generating your meal plan…');
  try {
    const data = await apiPost('/api/meal-plan', { profile: getProfile() });
    setResult(mealplanResult, data.response);
  } catch (err) {
    setResult(mealplanResult, `❌ Error: ${err.message}`);
  } finally {
    generateMealPlanBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// TAB 3 — Recommendations
// ---------------------------------------------------------------------------

const generateRecommendBtn = document.getElementById('generate-recommend-btn');
const recommendResult      = document.getElementById('recommend-result');

generateRecommendBtn.addEventListener('click', async () => {
  generateRecommendBtn.disabled = true;
  setLoading(recommendResult, 'Fetching your food recommendations…');
  try {
    const data = await apiPost('/api/recommend', { profile: getProfile() });
    setResult(recommendResult, data.response);
  } catch (err) {
    setResult(recommendResult, `❌ Error: ${err.message}`);
  } finally {
    generateRecommendBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// TAB 4 — Food Log
// ---------------------------------------------------------------------------

const logFoodNameInput = document.getElementById('log-food-name');
const logGramsInput    = document.getElementById('log-grams');
const logAddBtn        = document.getElementById('log-add-btn');
const logTbody         = document.getElementById('log-tbody');
const logTable         = document.getElementById('log-table');
const logEmpty         = document.getElementById('log-empty');
const logDateEl        = document.getElementById('log-date');
const logLookupInfo    = document.getElementById('log-lookup-info');
const getFeedbackBtn   = document.getElementById('get-feedback-btn');
const feedbackResult   = document.getElementById('feedback-result');

// Populate datalist with food names from dataset
function populateFoodSuggestions() {
  const names = [
    'Brown Rice','White Rice','Oats','Whole Wheat Bread','Quinoa',
    'Lentils','Chickpeas','Black Beans','Tofu','Edamame','Kidney Beans',
    'Chicken Breast','Salmon','Tuna (canned)','Eggs','Greek Yogurt',
    'Milk (whole)','Paneer','Cottage Cheese','Spinach','Broccoli',
    'Carrot','Sweet Potato','Tomato','Cucumber','Bell Pepper','Cauliflower',
    'Kale','Mushrooms','Beetroot','Banana','Apple','Avocado','Blueberries',
    'Orange','Mango','Watermelon','Pomegranate','Almonds','Walnuts',
    'Chia Seeds','Flaxseeds','Peanut Butter','Pumpkin Seeds','Olive Oil',
    'Coconut Oil','Green Tea','Turmeric','Ginger','Garlic'
  ];
  const dl = document.getElementById('food-suggestions');
  names.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n;
    dl.appendChild(opt);
  });
}

// Scale nutrition values by grams
function scaleNutrition(food, grams) {
  const factor = grams / 100;
  return {
    name:     food.name,
    grams:    grams,
    calories: Math.round(food.calories_per_100g * factor),
    protein:  Math.round(food.protein_g * factor * 10) / 10,
    carbs:    Math.round(food.carbs_g   * factor * 10) / 10,
    fat:      Math.round(food.fat_g     * factor * 10) / 10,
    fiber:    Math.round(food.fiber_g   * factor * 10) / 10
  };
}

logAddBtn.addEventListener('click', async () => {
  const name  = logFoodNameInput.value.trim();
  const grams = parseInt(logGramsInput.value, 10);

  if (!name) { alert('Please enter a food name.'); return; }
  if (!grams || grams < 1) { alert('Please enter a valid amount in grams.'); return; }

  logAddBtn.disabled = true;
  hide(logLookupInfo);

  try {
    const res  = await fetch(`/api/food-lookup?name=${encodeURIComponent(name)}`);
    const data = await res.json();

    if (!res.ok) {
      logLookupInfo.textContent = `⚠️ "${name}" not found in our dataset. Entry skipped.`;
      show(logLookupInfo);
      logLookupInfo.className = 'log-lookup-info warn';
      return;
    }

    const entry  = scaleNutrition(data.food, grams);
    const log    = getLog();
    log.push(entry);
    saveLog(log);
    renderLog();

    logFoodNameInput.value = '';
    logGramsInput.value    = '100';

    logLookupInfo.textContent = `✅ Added ${entry.name} (${grams}g) — ${entry.calories} kcal`;
    logLookupInfo.className   = 'log-lookup-info ok';
    show(logLookupInfo);

    // Auto-hide message after 3 seconds
    setTimeout(() => hide(logLookupInfo), 3000);
  } catch (err) {
    alert('Error looking up food: ' + err.message);
  } finally {
    logAddBtn.disabled = false;
  }
});

function renderLog() {
  const log = getLog();
  logDateEl.textContent = `(${getTodayKey()})`;

  if (log.length === 0) {
    show(logEmpty);
    hide(logTable);
    return;
  }

  hide(logEmpty);
  show(logTable);

  logTbody.innerHTML = '';
  let totCal = 0, totPro = 0, totCarb = 0, totFat = 0;

  log.forEach((e, idx) => {
    totCal  += e.calories;
    totPro  += e.protein;
    totCarb += e.carbs;
    totFat  += e.fat;

    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td>${escapeHtml(e.name)}</td>` +
      `<td>${e.grams}g</td>` +
      `<td>${e.calories} kcal</td>` +
      `<td>${e.protein}g</td>` +
      `<td>${e.carbs}g</td>` +
      `<td>${e.fat}g</td>` +
      `<td><button class="btn-icon delete-btn" data-idx="${idx}" title="Remove">✕</button></td>`;
    logTbody.appendChild(tr);
  });

  document.getElementById('total-cal').textContent  = `${Math.round(totCal)} kcal`;
  document.getElementById('total-pro').textContent  = `${Math.round(totPro)}g`;
  document.getElementById('total-carb').textContent = `${Math.round(totCarb)}g`;
  document.getElementById('total-fat').textContent  = `${Math.round(totFat)}g`;

  // Wire delete buttons
  logTbody.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const log = getLog();
      log.splice(parseInt(btn.dataset.idx, 10), 1);
      saveLog(log);
      renderLog();
    });
  });
}

getFeedbackBtn.addEventListener('click', async () => {
  const log = getLog();
  getFeedbackBtn.disabled = true;
  setLoading(feedbackResult, 'Analysing your food log…');
  try {
    const data = await apiPost('/api/log-feedback', {
      logEntries: log,
      profile:    getProfile()
    });
    setResult(feedbackResult, data.response);
  } catch (err) {
    setResult(feedbackResult, `❌ Error: ${err.message}`);
  } finally {
    getFeedbackBtn.disabled = false;
  }
});

// ---------------------------------------------------------------------------
// TAB 5 — Health Guidance
// ---------------------------------------------------------------------------

const healthTopicInput = document.getElementById('health-topic-input');
const healthAskBtn     = document.getElementById('health-ask-btn');
const healthResult     = document.getElementById('health-result');

async function askHealthAdvice(topic) {
  if (!topic.trim()) return;
  healthAskBtn.disabled = true;
  setLoading(healthResult, 'Getting health guidance…');
  try {
    const data = await apiPost('/api/health-advice', {
      topic,
      profile: getProfile()
    });
    setResult(healthResult, data.response);
  } catch (err) {
    setResult(healthResult, `❌ Error: ${err.message}`);
  } finally {
    healthAskBtn.disabled = false;
  }
}

healthAskBtn.addEventListener('click', () => askHealthAdvice(healthTopicInput.value));
healthTopicInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') askHealthAdvice(healthTopicInput.value);
});

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const topic = chip.dataset.topic;
    healthTopicInput.value = topic;
    askHealthAdvice(topic);
  });
});

// ---------------------------------------------------------------------------
// TAB 6 — Dashboard (Chart.js)
// ---------------------------------------------------------------------------

let macroChart   = null;
let calorieChart = null;

function getCalorieGoal() {
  const p = getProfile();
  if (!p) return 1900;
  return CALORIE_GOALS[p.goal.toLowerCase()] || 1900;
}

function renderDashboard() {
  const log = getLog();
  const dashEmpty  = document.getElementById('dashboard-empty');
  const dashCharts = document.getElementById('dashboard-charts');

  if (log.length === 0) {
    show(dashEmpty);
    hide(dashCharts);
    return;
  }

  hide(dashEmpty);
  show(dashCharts);

  // Compute totals
  const totals = log.reduce(
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

  const calorieGoal = getCalorieGoal();

  // -- Macro doughnut chart --
  const macroCtx = document.getElementById('macro-chart').getContext('2d');
  if (macroChart) macroChart.destroy();
  macroChart = new Chart(macroCtx, {
    type: 'doughnut',
    data: {
      labels: ['Protein (g)', 'Carbs (g)', 'Fat (g)'],
      datasets: [{
        data: [
          Math.round(totals.protein),
          Math.round(totals.carbs),
          Math.round(totals.fat)
        ],
        backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b'],
        borderWidth: 2,
        borderColor: '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, font: { size: 13 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.raw}g`
          }
        }
      }
    }
  });

  // -- Calorie bar chart --
  const calCtx = document.getElementById('calorie-chart').getContext('2d');
  if (calorieChart) calorieChart.destroy();
  const intake = Math.round(totals.calories);
  const remaining = Math.max(calorieGoal - intake, 0);
  const over = Math.max(intake - calorieGoal, 0);

  calorieChart = new Chart(calCtx, {
    type: 'bar',
    data: {
      labels: ['Today'],
      datasets: [
        {
          label: 'Consumed',
          data: [intake],
          backgroundColor: intake > calorieGoal ? '#ef4444' : '#22c55e',
          borderRadius: 6
        },
        {
          label: 'Goal',
          data: [calorieGoal],
          backgroundColor: '#e5e7eb',
          borderRadius: 6
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, font: { size: 13 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.raw} kcal`
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: v => `${v} kcal` }
        }
      }
    }
  });

  // -- Summary stats --
  const statsRow = document.getElementById('dashboard-stats');
  const pct = Math.round((intake / calorieGoal) * 100);
  statsRow.innerHTML = `
    <div class="stat-card">
      <div class="stat-val">${intake}</div>
      <div class="stat-lbl">kcal consumed</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${calorieGoal}</div>
      <div class="stat-lbl">kcal goal</div>
    </div>
    <div class="stat-card">
      <div class="stat-val ${pct > 100 ? 'over' : ''}">${pct}%</div>
      <div class="stat-lbl">of daily goal</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${Math.round(totals.protein)}g</div>
      <div class="stat-lbl">protein</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${Math.round(totals.carbs)}g</div>
      <div class="stat-lbl">carbs</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${Math.round(totals.fat)}g</div>
      <div class="stat-lbl">fat</div>
    </div>
    <div class="stat-card">
      <div class="stat-val">${Math.round(totals.fiber)}g</div>
      <div class="stat-lbl">fiber</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Generic API POST helper
// ---------------------------------------------------------------------------

async function apiPost(url, body) {
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body)
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

function init() {
  const profile = getProfile();
  if (!profile) {
    openProfileModal(null);
  } else {
    updateProfileLabel();
    updateProfileChips();
  }
  renderLog();
  populateFoodSuggestions();
}

init();
