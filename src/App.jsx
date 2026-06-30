import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmtDate = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtDateShort = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtMonthYear = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
const fmtDateTime = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const minutesToTime = (mins) => { const h2 = Math.floor(mins / 60) % 24; const m = mins % 60; const ampm = h2 >= 12 ? "PM" : "AM"; const h12 = h2 % 12 === 0 ? 12 : h2 % 12; return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`; };
const timeToMinutes = (t) => { const [hh, mm] = (t || "00:00").split(":").map(Number); return hh * 60 + mm; };
const startOfWeek = (dateStr) => addDays(dateStr, -new Date(dateStr + "T00:00:00").getDay());
const startOfMonth = (dateStr) => { const d = new Date(dateStr + "T00:00:00"); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const daysInMonth = (dateStr) => { const d = new Date(dateStr + "T00:00:00"); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
const dateRangeDays = (startStr, endStr) => { const out = []; let d = startStr; while (d <= endStr && out.length < 120) { out.push(d); d = addDays(d, 1); } return out; };
const dowOf = (dateStr) => new Date(dateStr + "T00:00:00").getDay();

const DEFAULT_PERSONAL_WINDOWS = [
  { id: "pw1", label: "Weekday mornings", days: [1, 2, 3, 4, 5], start: "06:30", end: "09:00" },
  { id: "pw2", label: "Weekday evenings", days: [1, 2, 3, 4, 5], start: "17:30", end: "21:30" },
  { id: "pw3", label: "Weekends", days: [0, 6], start: "07:00", end: "21:30" },
];

const DEFAULT_SETTINGS = {
  wakeTime: "06:30", bedTime: "22:30",
  workStart: "09:00", workEnd: "17:00", workDays: [1, 2, 3, 4, 5],
  personalWindows: DEFAULT_PERSONAL_WINDOWS,
  lowEnergyWindows: [],
  startDate: todayStr(), fitnessFrequency: 4, equipment: "gym",
  fitnessPrimaryGoal: "general",
  onboarded: false, scheduleMigrationDone: false,
};
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MILESTONE_THRESHOLDS = [7, 30, 100, 365];

const EXERCISE_DB = {
  squat: { name: "Barbell Back Squat", sets: 4, reps: "6-8", type: "barbell_major", startWeight: 95 },
  bench: { name: "Barbell Bench Press", sets: 4, reps: "6-8", type: "barbell_major", startWeight: 65 },
  deadlift: { name: "Deadlift", sets: 4, reps: "5-6", type: "barbell_major", startWeight: 115 },
  row: { name: "Barbell Row", sets: 3, reps: "8-10", type: "barbell_accessory", startWeight: 65 },
  ohp: { name: "Overhead Press", sets: 3, reps: "8-10", type: "barbell_accessory", startWeight: 45 },
  pullup: { name: "Pull-ups", sets: 3, reps: "6-10", type: "bodyweight", startWeight: 0 },
  legpress: { name: "Leg Press", sets: 3, reps: "10-12", type: "machine", startWeight: 135 },
  lunge: { name: "Dumbbell Lunge", sets: 3, reps: "10/side", type: "dumbbell", startWeight: 20 },
  pushup: { name: "Push-ups", sets: 3, reps: "12-20", type: "bodyweight", startWeight: 0 },
  bodysquat: { name: "Bodyweight Squat", sets: 3, reps: "15-20", type: "bodyweight", startWeight: 0 },
  plank: { name: "Plank", sets: 3, reps: "45-60 sec", type: "bodyweight", startWeight: 0 },
  bandrow: { name: "Band Row", sets: 3, reps: "12-15", type: "band", startWeight: 0 },
  bandpress: { name: "Band Chest Press", sets: 3, reps: "12-15", type: "band", startWeight: 0 },
  jumprope: { name: "Jump Rope", sets: 1, reps: "5 min", type: "cardio", startWeight: 0 },
  burpee: { name: "Burpees", sets: 3, reps: "10-15", type: "bodyweight", startWeight: 0 },
  mountainclimber: { name: "Mountain Climbers", sets: 3, reps: "30 sec", type: "bodyweight", startWeight: 0 },
  run: { name: "Easy Run", sets: 1, reps: "20-30 min", type: "cardio", startWeight: 0 },
  intervalrun: { name: "Interval Sprints", sets: 8, reps: "30 sec on/90 sec off", type: "cardio", startWeight: 0 },
  row_machine: { name: "Rowing Machine", sets: 1, reps: "15-20 min", type: "cardio", startWeight: 0 },
  bike: { name: "Stationary Bike", sets: 1, reps: "20-30 min", type: "cardio", startWeight: 0 },
};
const PROGRESSION_INCREMENT = { barbell_major: 5, barbell_accessory: 2.5, dumbbell: 2.5, machine: 5, bodyweight: 0, band: 0, cardio: 0 };
const WARMUP_OPTIONS = ["5 min brisk walk or light cardio", "Arm circles + leg swings, 1 min each", "Bodyweight squats x10, glute bridges x10", "Dynamic stretching: lunges, high knees, 3 min"];
const COOLDOWN_OPTIONS = ["5 min easy walk to bring heart rate down", "Static stretch: hamstrings, quads, chest, 1 min each", "Foam roll major muscle groups, 5 min", "Deep breathing + full body stretch, 5 min"];
const WORKOUT_TEMPLATES = {
  gain_muscle: { gym: [["squat", "bench", "row", "plank"], ["deadlift", "ohp", "pullup", "plank"], ["legpress", "bandpress", "lunge", "plank"], ["bench", "row", "legpress", "plank"]], home: [["bodysquat", "pushup", "bandrow", "plank"], ["lunge", "bandpress", "pullup", "plank"], ["bodysquat", "pushup", "bandrow", "plank"], ["lunge", "pushup", "plank", "mountainclimber"]], minimal: [["bodysquat", "pushup", "plank"], ["lunge", "pushup", "plank"], ["bodysquat", "pushup", "plank"], ["lunge", "pushup", "plank"]] },
  lose_weight: { gym: [["squat", "row_machine", "burpee", "plank"], ["intervalrun", "bandpress", "lunge", "mountainclimber"], ["legpress", "row", "burpee", "plank"], ["run", "bike", "plank", "mountainclimber"]], home: [["burpee", "bodysquat", "jumprope", "plank"], ["jumprope", "lunge", "pushup", "mountainclimber"], ["burpee", "bandrow", "jumprope", "plank"], ["run", "bodysquat", "mountainclimber", "plank"]], minimal: [["burpee", "bodysquat", "mountainclimber", "plank"], ["run", "lunge", "pushup", "plank"], ["intervalrun", "bodysquat", "plank", "mountainclimber"], ["run", "burpee", "lunge", "plank"]] },
  gain_muscle_lose_weight: { gym: [["squat", "bench", "burpee", "plank"], ["deadlift", "row", "intervalrun", "plank"], ["legpress", "ohp", "mountainclimber", "plank"], ["bench", "row_machine", "lunge", "plank"]], home: [["bodysquat", "pushup", "jumprope", "plank"], ["lunge", "bandpress", "burpee", "plank"], ["bodysquat", "bandrow", "mountainclimber", "plank"], ["pushup", "lunge", "jumprope", "plank"]], minimal: [["bodysquat", "pushup", "burpee", "plank"], ["lunge", "pushup", "mountainclimber", "plank"], ["bodysquat", "burpee", "plank", "mountainclimber"], ["lunge", "pushup", "plank"]] },
  endurance: { gym: [["run", "squat", "plank"], ["intervalrun", "row_machine", "plank"], ["bike", "lunge", "plank"], ["row_machine", "run", "plank"]], home: [["run", "bodysquat", "plank"], ["intervalrun", "lunge", "plank"], ["run", "pushup", "plank"], ["jumprope", "run", "plank"]], minimal: [["run", "bodysquat", "plank"], ["intervalrun", "lunge", "plank"], ["run", "pushup", "plank"], ["run", "mountainclimber", "plank"]] },
  general: { gym: [["squat", "bench", "row", "plank"], ["run", "ohp", "pullup", "plank"], ["legpress", "bandpress", "lunge", "plank"], ["deadlift", "pushup", "row_machine", "plank"]], home: [["bodysquat", "pushup", "bandrow", "plank"], ["jumprope", "lunge", "bandpress", "mountainclimber"], ["burpee", "bodysquat", "bandrow", "plank"], ["run", "pushup", "lunge", "plank"]], minimal: [["bodysquat", "pushup", "plank", "mountainclimber"], ["run", "lunge", "pushup", "plank"], ["burpee", "bodysquat", "plank", "mountainclimber"], ["run", "pushup", "lunge", "plank"]] },
};
const GOAL_LABELS = { general: "General fitness", gain_muscle: "Gain muscle", lose_weight: "Lose weight", gain_muscle_lose_weight: "Gain muscle & lose weight", endurance: "Endurance" };

const GOAL_TEMPLATE_TASKS = {
  fitness: ["Buy/check needed equipment", "Schedule first week of workouts", "Take starting photo/measurements", "Plan grocery list for the week"],
  work: ["Break this into 3 milestones", "Block focus time on calendar", "Identify first blocker to resolve"],
  personal: ["Define what 'done' looks like", "List first 3 concrete actions", "Set a check-in reminder in 2 weeks"],
};

function suggestedWeight(exerciseKey, exerciseHistory) {
  const base = EXERCISE_DB[exerciseKey];
  if (!base || base.startWeight === 0) return base ? base.startWeight : 0;
  const history = exerciseHistory.filter(h => h.exerciseKey === exerciseKey).sort((a, b) => a.date.localeCompare(b.date));
  if (history.length === 0) return base.startWeight;
  const last = history[history.length - 1];
  return last.weight ? Number(last.weight) + (PROGRESSION_INCREMENT[base.type] || 0) : base.startWeight;
}
function buildWorkout(primaryGoal, equipment, dayIndex, exerciseHistory) {
  const goalKey = WORKOUT_TEMPLATES[primaryGoal] ? primaryGoal : "general";
  const templates = (WORKOUT_TEMPLATES[goalKey] && WORKOUT_TEMPLATES[goalKey][equipment]) || WORKOUT_TEMPLATES.general.gym;
  const exerciseKeys = templates[dayIndex % templates.length];
  const main = exerciseKeys.map((key) => { const ex = EXERCISE_DB[key] || EXERCISE_DB.bodysquat; return { id: uid(), exerciseKey: key, name: ex.name, sets: ex.sets, reps: ex.reps, weight: suggestedWeight(key, exerciseHistory), completed: false }; });
  return { id: uid(), warmup: WARMUP_OPTIONS[dayIndex % WARMUP_OPTIONS.length], main, cooldown: COOLDOWN_OPTIONS[dayIndex % COOLDOWN_OPTIONS.length], estimatedMinutes: 60 };
}

const MEAL_LIBRARY = {
  general: { breakfast: ["Greek yogurt, berries, granola", "Veggie egg scramble + toast", "Oatmeal with peanut butter and banana"], lunch: ["Grilled chicken bowl with rice and veggies", "Turkey and avocado wrap with side salad", "Lentil soup with whole grain bread"], dinner: ["Baked salmon, sweet potato, broccoli", "Stir-fry chicken with mixed vegetables and rice", "Lean beef chili with beans"], snack: ["Apple with almond butter", "Cottage cheese with pineapple", "Protein shake"] },
  lose_weight: { breakfast: ["Egg white scramble with spinach", "Protein smoothie (berries, spinach, protein powder)", "Greek yogurt with chia seeds"], lunch: ["Grilled chicken salad, light dressing", "Tuna salad lettuce wraps", "Turkey chili, small portion"], dinner: ["Grilled fish, large salad, olive oil", "Chicken stir-fry, extra vegetables, light rice", "Zucchini noodles with lean turkey meatballs"], snack: ["Cucumber slices with hummus", "Hard boiled eggs", "Handful of almonds"] },
  gain_muscle: { breakfast: ["3-4 whole eggs, oats, fruit", "Protein pancakes with berries", "Cottage cheese, toast, peanut butter"], lunch: ["Large chicken and rice bowl", "Steak, sweet potato, vegetables", "Salmon, quinoa, avocado"], dinner: ["Ground beef pasta with side salad", "Grilled chicken thighs, rice, broccoli", "Pork tenderloin, potatoes, green beans"], snack: ["Protein shake + banana", "Trail mix", "Greek yogurt with granola"] },
  gain_muscle_lose_weight: { breakfast: ["Egg white + 1 whole egg scramble, oats", "Protein smoothie with berries", "Cottage cheese with fruit"], lunch: ["Grilled chicken, rice (moderate), big salad", "Turkey, quinoa, roasted vegetables", "Salmon, small sweet potato, greens"], dinner: ["Lean beef, vegetables, small portion rice", "Grilled chicken thighs, broccoli, light starch", "White fish, vegetables, olive oil"], snack: ["Protein shake", "Greek yogurt", "Almonds, small handful"] },
  endurance: { breakfast: ["Oatmeal with banana and honey", "Bagel with peanut butter", "Smoothie with oats, fruit, yogurt"], lunch: ["Pasta with chicken and vegetables", "Rice bowl with beans and grilled veg", "Turkey sandwich, fruit side"], dinner: ["Whole grain pasta, lean protein, vegetables", "Quinoa bowl with chicken and roasted veg", "Stir-fry noodles with shrimp"], snack: ["Banana with almond butter", "Energy balls (oats, dates, nut butter)", "Chocolate milk or recovery shake"] },
};
const GROCERY_BY_GOAL = {
  general: ["Chicken breast", "Eggs", "Greek yogurt", "Mixed vegetables", "Brown rice", "Olive oil", "Mixed berries", "Oats", "Whole grain bread", "Almonds"],
  lose_weight: ["Egg whites", "Chicken breast", "Leafy greens", "Cucumber", "Cottage cheese", "Tuna", "Berries", "Almonds (small portions)", "Zucchini", "Hummus"],
  gain_muscle: ["Eggs", "Chicken thighs", "Ground beef (lean)", "Salmon", "Sweet potatoes", "Rice", "Oats", "Peanut butter", "Greek yogurt", "Whole milk"],
  gain_muscle_lose_weight: ["Egg whites", "Chicken breast", "Salmon", "Greek yogurt", "Quinoa", "Mixed vegetables", "Cottage cheese", "Berries", "Almonds", "Sweet potato"],
  endurance: ["Oats", "Bananas", "Pasta (whole grain)", "Chicken breast", "Rice", "Honey", "Dates", "Sports drink / electrolytes", "Bread", "Eggs"],
};

function emptyData() {
  return { settings: DEFAULT_SETTINGS, tasks: [], goals: [], habits: [], events: [], dailyLogs: {}, completedLog: [], workoutLog: [], bodyStats: [], exerciseHistory: [], currentPlan: null, theme: "dark", inbox: [], scheduleTemplates: [], weeklyReviews: [] };
}

function priorityColor(p) { return p === "high" ? "coral" : p === "medium" ? "amber" : "slate"; }
function statusColor(s) { return s === "done" ? "green" : s === "in_progress" ? "indigo" : s === "blocked" ? "coral" : "slate"; }
function categoryColor(c) { return c === "work" ? "indigo" : c === "fitness" ? "teal" : c === "personal" ? "coral" : "slate"; }
function urgencyColor(item, dateStr) {
  if (item.status === "done") return "green";
  if (!item.dueDate) return "slate";
  if (item.dueDate < dateStr) return "coral";
  if (item.dueDate === dateStr && item.priority === "high") return "coral";
  if (item.dueDate === dateStr) return "amber";
  const daysOut = Math.round((new Date(item.dueDate) - new Date(dateStr)) / 86400000);
  if (daysOut <= 2 && item.priority !== "low") return "amber";
  return "teal";
}

function personalWindowsForDay(settings, dateStr) {
  const dow = dowOf(dateStr);
  return (settings.personalWindows || DEFAULT_PERSONAL_WINDOWS).filter(w => w.days.includes(dow));
}
function lowEnergyRangesForDay(settings, dateStr) {
  const dow = dowOf(dateStr);
  return (settings.lowEnergyWindows || []).filter(w => w.days.includes(dow)).map(w => ({ start: timeToMinutes(w.start), end: timeToMinutes(w.end) }));
}
function recurringTaskAppliesOn(task, dateStr) {
  if (task.taskType !== "recurring") return false;
  const dow = dowOf(dateStr);
  if (task.recurFrequency === "daily") return true;
  if (task.recurFrequency === "weekly") return (task.recurDays || []).includes(dow);
  return false;
}
function eventOccursOn(event, dateStr) {
  if (event.date === dateStr) return true;
  if (!event.recurring) return false;
  if (dateStr < event.date) return false;
  if (event.recurEnd && dateStr > event.recurEnd) return false;
  const dow = dowOf(dateStr), startDow = dowOf(event.date);
  if (event.recurFrequency === "weekly") return dow === startDow;
  if (event.recurFrequency === "daily") return true;
  return false;
}
function overlapsAny(start, end, list) { return list.some(o => start < o.end && end > o.start); }

function findOpenSlot(duration, rangeStart, rangeEnd, occupied, avoid) {
  const blockers = avoid ? [...occupied, ...avoid] : occupied;
  const sorted = [...blockers].sort((a, b) => a.start - b.start);
  let cursor = rangeStart;
  for (const slot of sorted) { if (slot.start - cursor >= duration && cursor >= rangeStart && !overlapsAny(cursor, cursor + duration, blockers)) return cursor; cursor = Math.max(cursor, slot.end); }
  if (rangeEnd - cursor >= duration && !overlapsAny(cursor, cursor + duration, blockers)) return cursor;
  return null;
}

function getFixedOccupiedForDay(dateStr, allData) {
  const { events, habits } = allData;
  const dow = dowOf(dateStr);
  const occ = [];
  events.filter(e => eventOccursOn(e, dateStr)).forEach(e => occ.push({ start: timeToMinutes(e.start), end: timeToMinutes(e.end) }));
  habits.filter(h => h.active && (h.frequency === "daily" || (h.frequency === "weekly" && h.days.includes(dow)))).forEach(h => { if (h.time) { const s = timeToMinutes(h.time); occ.push({ start: s, end: s + (h.duration || 20) }); } });
  return occ;
}

// Suggest occurrences for a task; guarantees the sum of durations equals estimatedMinutes exactly (last day absorbs remainder).
function suggestOccurrencesForTask(task, allData) {
  const { settings } = allData;
  const totalMinutes = task.estimatedMinutes || 30;
  const today = todayStr();
  const endDate = task.targetDate || task.dueDate || addDays(today, 7);
  const fromDate = today;
  const days = dateRangeDays(fromDate < endDate ? fromDate : endDate, fromDate < endDate ? endDate : fromDate);
  const prioRank = { high: 0, medium: 1, low: 2 };
  const rank = prioRank[task.priority] ?? 1;
  const spreadCount = rank === 0 ? days.length : rank === 1 ? Math.ceil(days.length * 0.6) : Math.max(1, Math.ceil(days.length * 0.3));
  const chosenDays = (rank === 2 ? days.slice(-spreadCount) : days.slice(0, spreadCount)).slice(0, 14);
  if (chosenDays.length === 0) chosenDays.push(today);

  const baseChunk = Math.max(15, Math.floor(totalMinutes / chosenDays.length));
  let remaining = totalMinutes;
  const occurrences = [];
  chosenDays.forEach((d, idx) => {
    const isLast = idx === chosenDays.length - 1;
    const thisChunk = isLast ? remaining : Math.min(baseChunk, remaining);
    if (thisChunk <= 0) return;
    const dow = dowOf(d);
    const occupied = getFixedOccupiedForDay(d, allData);
    const avoidLowEnergy = task.avoidLowEnergy !== false ? lowEnergyRangesForDay(settings, d) : [];
    let rangeStart, rangeEnd;
    if (task.category === "work") {
      if (!(settings.workDays || [1, 2, 3, 4, 5]).includes(dow)) { remaining -= 0; return; }
      rangeStart = timeToMinutes(settings.workStart); rangeEnd = timeToMinutes(settings.workEnd);
    } else {
      const windows = personalWindowsForDay(settings, d);
      if (windows.length === 0) { rangeStart = timeToMinutes(settings.wakeTime); rangeEnd = timeToMinutes(settings.bedTime); }
      else { const w = windows[0]; rangeStart = timeToMinutes(w.start); rangeEnd = timeToMinutes(w.end); }
    }
    let start = findOpenSlot(thisChunk, rangeStart, rangeEnd, occupied, avoidLowEnergy);
    if (start === null) start = findOpenSlot(thisChunk, timeToMinutes(settings.wakeTime), timeToMinutes(settings.bedTime), occupied, avoidLowEnergy);
    if (start === null) start = findOpenSlot(thisChunk, timeToMinutes(settings.wakeTime), timeToMinutes(settings.bedTime), occupied, []);
    if (start !== null) { occurrences.push({ id: uid(), date: d, start, end: start + thisChunk }); remaining -= thisChunk; }
  });
  return occurrences;
}

function autoScheduleDay(dateStr, allData) {
  const { settings, tasks, events, habits } = allData;
  const dow = dowOf(dateStr);
  const dayStart = timeToMinutes(settings.wakeTime), dayEnd = timeToMinutes(settings.bedTime);
  const scheduled = []; const occupied = [];
  events.filter(e => eventOccursOn(e, dateStr)).forEach(e => { const block = { id: e.id + "-" + dateStr, eventId: e.id, type: "event", title: e.title, start: timeToMinutes(e.start), end: timeToMinutes(e.end), category: e.category || "work", locked: true }; occupied.push({ start: block.start, end: block.end }); scheduled.push(block); });
  habits.filter(h => h.active && (h.frequency === "daily" || (h.frequency === "weekly" && h.days.includes(dow)))).forEach(h => {
    const duration = h.duration || 20; let start = h.time ? timeToMinutes(h.time) : null;
    if (start === null || overlapsAny(start, start + duration, occupied)) start = findOpenSlot(duration, dayStart, dayEnd, occupied);
    if (start !== null) { const block = { id: "habit-" + h.id, type: "habit", title: h.name, start, end: start + duration, category: h.category, habitId: h.id, locked: false }; occupied.push({ start: block.start, end: block.end }); scheduled.push(block); }
  });
  tasks.filter(t => t.taskType === "recurring" && recurringTaskAppliesOn(t, dateStr)).forEach(t => {
    const duration = t.estimatedMinutes || 15; let rangeStart = dayStart, rangeEnd = dayEnd;
    if (t.category === "work") { rangeStart = timeToMinutes(settings.workStart); rangeEnd = timeToMinutes(settings.workEnd); }
    else { const windows = personalWindowsForDay(settings, dateStr); if (windows.length) { rangeStart = timeToMinutes(windows[0].start); rangeEnd = timeToMinutes(windows[0].end); } }
    let start = findOpenSlot(duration, rangeStart, rangeEnd, occupied); if (start === null) start = findOpenSlot(duration, dayStart, dayEnd, occupied);
    if (start !== null) { const block = { id: "rtask-" + t.id + "-" + dateStr, taskId: t.id, type: "task", title: t.title, start, end: start + duration, category: t.category, priority: t.priority, status: t.status, recurring: true }; occupied.push({ start: block.start, end: block.end }); scheduled.push(block); }
  });
  tasks.filter(t => t.taskType !== "recurring" && t.status !== "done" && t.occurrences).forEach(t => {
    (t.occurrences || []).filter(o => o.date === dateStr).forEach(o => {
      let start = o.start, end = o.end, duration = o.end - o.start;
      if (overlapsAny(start, end, occupied)) { const bumped = findOpenSlot(duration, dayStart, dayEnd, occupied); if (bumped !== null) { start = bumped; end = bumped + duration; } }
      const block = { id: "task-" + t.id + "-" + o.id, taskId: t.id, occurrenceId: o.id, type: "task", title: t.title, start, end, category: t.category, priority: t.priority, dueDate: t.dueDate, status: t.status };
      occupied.push({ start: block.start, end: block.end }); scheduled.push(block);
    });
  });
  return scheduled.sort((a, b) => a.start - b.start);
}

function generateCoachInsights(state, dateStr) {
  const insights = []; const { tasks, goals, habits, completedLog } = state;
  const overdue = tasks.filter(t => t.taskType !== "recurring" && t.status !== "done" && t.dueDate && t.dueDate < dateStr);
  if (overdue.length > 0) insights.push({ type: "warning", text: `${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}: ${overdue.slice(0, 3).map(t => t.title).join(", ")}${overdue.length > 3 ? "…" : ""}. Knock these out or push the due date.` });
  goals.filter(g => g.progress < 100).forEach(g => {
    const linkedHabits = habits.filter(h2 => h2.goalId === g.id && h2.active);
    const linkedTasks = tasks.filter(t => t.goalId === g.id && t.status !== "done");
    if (linkedHabits.length === 0 && linkedTasks.length === 0) insights.push({ type: "warning", text: `"${g.title}" has no active habits or tasks tied to it.` });
    const daysLeft = Math.round((new Date(g.targetDate) - new Date(dateStr)) / 86400000);
    if (daysLeft > 0 && daysLeft < 30 && g.progress < 70) insights.push({ type: "warning", text: `"${g.title}" is due in ${daysLeft} days but sits at ${g.progress}%.` });
  });
  const last7 = []; for (let i = 1; i <= 7; i++) last7.push(addDays(dateStr, -i));
  habits.filter(h2 => h2.active).forEach(h2 => {
    const applicable = last7.filter(d => { const dow = dowOf(d); return h2.frequency === "daily" || (h2.frequency === "weekly" && h2.days.includes(dow)); });
    const completed = applicable.filter(d => completedLog.some(c => c.habitId === h2.id && c.date === d));
    if (applicable.length >= 3 && completed.length / applicable.length < 0.5) insights.push({ type: "warning", text: `"${h2.name}" landed only ${completed.length}/${applicable.length} days this past week.` });
  });
  if (overdue.length === 0 && insights.length === 0) insights.push({ type: "good", text: "Nothing overdue, and your goals all have active habits or tasks behind them." });
  return insights.slice(0, 6);
}

function computeHabitStreak(habit, completedLog, today) {
  let streak = 0; let d = today;
  while (true) {
    const dow = dowOf(d);
    const applicable = habit.frequency === "daily" || (habit.frequency === "weekly" && habit.days.includes(dow));
    if (applicable) { const done = completedLog.some(c => c.habitId === habit.id && c.date === d); if (!done) { if (d === today) { d = addDays(d, -1); continue; } break; } streak++; }
    d = addDays(d, -1);
    if (streak > 400) break;
  }
  return streak;
}

function generateWeeklyReview(data, weekEndDate) {
  const weekStart = addDays(weekEndDate, -6);
  const days = dateRangeDays(weekStart, weekEndDate);
  const { tasks, habits, completedLog, workoutLog, goals } = data;
  const tasksCompleted = completedLog.filter(c => c.type === "task" && days.includes(c.date)).length;
  const habitRates = habits.filter(h => h.active).map(h => {
    const applicable = days.filter(d => { const dow = dowOf(d); return h.frequency === "daily" || (h.frequency === "weekly" && h.days.includes(dow)); });
    const completed = applicable.filter(d => completedLog.some(c => c.habitId === h.id && c.date === d));
    return { name: h.name, rate: applicable.length ? Math.round((completed.length / applicable.length) * 100) : 0 };
  });
  const workouts = workoutLog.filter(w => days.includes(w.date)).length;
  const overdue = tasks.filter(t => t.taskType !== "recurring" && t.status !== "done" && t.dueDate && t.dueDate < addDays(weekEndDate, 1)).length;
  const weakHabits = habitRates.filter(h => h.rate < 50).map(h => h.name);
  const strongHabits = habitRates.filter(h => h.rate >= 80).map(h => h.name);
  const focusAreas = [];
  if (overdue > 0) focusAreas.push(`Clear ${overdue} overdue task${overdue > 1 ? "s" : ""} before adding new ones.`);
  if (weakHabits.length > 0) focusAreas.push(`Habits slipping: ${weakHabits.slice(0, 3).join(", ")} — consider an earlier time slot or shorter duration.`);
  const lowProgressGoals = goals.filter(g => g.progress < 50);
  if (lowProgressGoals.length > 0) focusAreas.push(`${lowProgressGoals.length} goal${lowProgressGoals.length > 1 ? "s" : ""} under 50% — pick one to push hard on this week.`);
  if (focusAreas.length === 0) focusAreas.push("No major gaps last week — keep the same rhythm going.");
  return { id: uid(), weekStart, weekEnd: weekEndDate, generatedAt: new Date().toISOString(), tasksCompleted, workouts, strongHabits, weakHabits, focusAreas };
}

function Icon({ name, size = 16 }) {
  const s = { width: size, height: size, display: "inline-block", verticalAlign: "middle", flexShrink: 0 };
  const k = "currentColor";
  switch (name) {
    case "today": return <svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={k} strokeWidth="1.6" /><path d="M12 7v5l3 2" stroke={k} strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "calendar": return <svg style={s} viewBox="0 0 24 24" fill="none"><rect x="3.5" y="5" width="17" height="16" rx="2" stroke={k} strokeWidth="1.6" /><path d="M3.5 9.5h17M8 3v4M16 3v4" stroke={k} strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "tasks": return <svg style={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2.5" stroke={k} strokeWidth="1.6" /><path d="M8 12.5l2.2 2.2L16 9" stroke={k} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "goals": return <svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke={k} strokeWidth="1.6" /><circle cx="12" cy="12" r="4.5" stroke={k} strokeWidth="1.6" /><circle cx="12" cy="12" r="1" fill={k} /></svg>;
    case "habits": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M4 12a8 8 0 0114-5.3M20 12a8 8 0 01-14 5.3" stroke={k} strokeWidth="1.6" strokeLinecap="round" /><path d="M18 4v3.2H14.8M6 20v-3.2h3.2" stroke={k} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "fitness": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M6.5 9v6M17.5 9v6M3 10.5v3M21 10.5v3M6.5 12h11" stroke={k} strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "coach": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M12 3a6 6 0 016 6c0 2.4-1.2 3.8-2 5-0.6 0.9-1 1.5-1 2.5H9c0-1-0.4-1.6-1-2.5-0.8-1.2-2-2.6-2-5a6 6 0 016-6z" stroke={k} strokeWidth="1.6" /><path d="M9.5 19.5h5M10.2 21.5h3.6" stroke={k} strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "summary": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M4 19V10M11 19V5M18 19v-7" stroke={k} strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "settings": return <svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="3" stroke={k} strokeWidth="1.6" /><path d="M19.4 13.5a1.7 1.7 0 000-3l1-1.7-1.7-1.7-1.7 1a1.7 1.7 0 00-3 0l-1-1.7-1.7 1.7 1 1.7a1.7 1.7 0 00-3 0l-1.7-1-1.7 1.7 1.7 1a1.7 1.7 0 000 3l-1.7 1 1.7 1.7 1.7-1a1.7 1.7 0 003 0l1 1.7 1.7-1.7-1-1.7a1.7 1.7 0 003 0l1.7 1 1.7-1.7z" stroke={k} strokeWidth="1.1" strokeLinejoin="round" /></svg>;
    case "plus": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke={k} strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "edit": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M4 20l1-4.2L15.8 5l4 4L9 19.8 4 20z" stroke={k} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case "trash": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" stroke={k} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "check": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7" stroke={k} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "left": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M15 5l-7 7 7 7" stroke={k} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "right": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke={k} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "sun": return <svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="4.2" stroke={k} strokeWidth="1.6" /><path d="M12 2.5v2.3M12 19.2v2.3M4.2 4.2l1.6 1.6M18.2 18.2l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.2 19.8l1.6-1.6M18.2 5.8l1.6-1.6" stroke={k} strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "moon": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M20 14.5A8.5 8.5 0 119.5 4a7 7 0 1010.5 10.5z" stroke={k} strokeWidth="1.6" strokeLinejoin="round" /></svg>;
    case "logout": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M9 4H5a1 1 0 00-1 1v14a1 1 0 001 1h4M16 16l4-4-4-4M20 12H9" stroke={k} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "expand": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M9 4H4v5M15 20h5v-5M4 9V4h5M20 15v5h-5" stroke={k} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "close": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke={k} strokeWidth="1.8" strokeLinecap="round" /></svg>;
    case "warn": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M12 4l9 16H3z" stroke={k} strokeWidth="1.5" strokeLinejoin="round" /><path d="M12 10v4M12 17v.1" stroke={k} strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "good": return <svg style={s} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke={k} strokeWidth="1.6" /><path d="M8 12.5l2.5 2.5L16 9.5" stroke={k} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "scale": return <svg style={s} viewBox="0 0 24 24" fill="none"><rect x="4" y="4" width="16" height="16" rx="2" stroke={k} strokeWidth="1.6" /><path d="M12 8v4l3 2" stroke={k} strokeWidth="1.6" strokeLinecap="round" /></svg>;
    case "repeat": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M17 2l4 4-4 4M7 22l-4-4 4-4M3 6h12a4 4 0 014 4M21 18H9a4 4 0 01-4-4" stroke={k} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "wand": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M4 20L18 6M14 4l1 2 2 1-2 1-1 2-1-2-2-1 2-1z M19 13l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7 1.4-.7z" stroke={k} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round" /></svg>;
    case "inbox": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M3 12h4.5l1.5 3h6l1.5-3H21" stroke={k} strokeWidth="1.6" strokeLinejoin="round" /><path d="M5 5h14l2 7v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6l2-7z" stroke={k} strokeWidth="1.6" strokeLinejoin="round" /></svg>;
    case "flame": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M12 2c1 4-4 5-4 9a4 4 0 008 0c0-1.5-1-2-1-3.5 2 1 3 3 3 5.5a6 6 0 01-12 0c0-5 3-7 6-11z" stroke={k} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case "trophy": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M7 4h10v4a5 5 0 01-10 0V4z" stroke={k} strokeWidth="1.5" /><path d="M7 6H5a2 2 0 002 4M17 6h2a2 2 0 01-2 4M10 16v2M14 16v2M8 21h8" stroke={k} strokeWidth="1.5" strokeLinecap="round" /></svg>;
    case "print": return <svg style={s} viewBox="0 0 24 24" fill="none"><path d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-5a1 1 0 011-1h16a1 1 0 011 1v5a1 1 0 01-1 1h-2M6 14h12v7H6v-7z" stroke={k} strokeWidth="1.5" strokeLinejoin="round" /></svg>;
    case "template": return <svg style={s} viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="17" height="17" rx="2" stroke={k} strokeWidth="1.5" /><path d="M3.5 9h17M9 9v11.5" stroke={k} strokeWidth="1.5" /></svg>;
    case "battery-low": return <svg style={s} viewBox="0 0 24 24" fill="none"><rect x="2.5" y="8" width="16" height="8" rx="1.5" stroke={k} strokeWidth="1.5" /><path d="M21 10.5v3" stroke={k} strokeWidth="1.5" strokeLinecap="round" /><rect x="5" y="10.5" width="3" height="3" fill={k} /></svg>;
    default: return null;
  }
}
function Tag({ children, color = "slate" }) { return <span className={`tag tag-${color}`}>{children}</span>; }
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal" + (wide ? " wide" : "")}>
        <div className="modal-header"><h3>{title}</h3><button className="btn-ghost" onClick={onClose}><Icon name="close" size={18} /></button></div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }
function ConfirmModal({ title, message, confirmLabel, onConfirm, onCancel }) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 18 }}>{message}</p>
      <div style={{ display: "flex", gap: 8 }}>
        <button className="btn btn-primary" style={{ flex: 1, justifyContent: "center" }} onClick={onConfirm}>{confirmLabel}</button>
        <button className="btn" style={{ flex: 1, justifyContent: "center" }} onClick={onCancel}>Cancel</button>
      </div>
    </Modal>
  );
}

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(false); const [confirmMsg, setConfirmMsg] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setError(""); setConfirmMsg(""); setLoading(true);
    try {
      if (mode === "login") { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; }
      else { const { error } = await supabase.auth.signUp({ email, password }); if (error) throw error; setConfirmMsg("Account created — you're in, or check your email if confirmation is required."); }
    } catch (err) { setError(err.message || "Something went wrong."); } finally { setLoading(false); }
  };
  return (
    <div className="auth-screen"><div className="auth-card">
      <div className="auth-logo">L</div><h1 className="auth-title">Life OS</h1>
      <p className="auth-subtitle">{mode === "login" ? "Log in to pick up right where you left off." : "Create your account to get started."}</p>
      {error && <div className="auth-error">{error}</div>}
      {confirmMsg && <div className="auth-error auth-success">{confirmMsg}</div>}
      <form onSubmit={submit}>
        <Field label="Email"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></Field>
        <Field label="Password"><input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
      </form>
      <div className="auth-toggle">{mode === "login" ? <>Don't have an account? <button onClick={() => { setMode("signup"); setError(""); }}>Sign up</button></> : <>Already have an account? <button onClick={() => { setMode("login"); setError(""); }}>Log in</button></>}</div>
    </div></div>
  );
}

function PersonalWindowRow({ w, onChange, onDelete }) {
  const toggleDay = (d) => onChange({ ...w, days: w.days.includes(d) ? w.days.filter(x => x !== d) : [...w.days, d].sort() });
  return (
    <div className="pw-row">
      <input className="pw-label-input" value={w.label} onChange={e => onChange({ ...w, label: e.target.value })} placeholder="Label" />
      <div className="pw-times"><input type="time" value={w.start} onChange={e => onChange({ ...w, start: e.target.value })} /><span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>to</span><input type="time" value={w.end} onChange={e => onChange({ ...w, end: e.target.value })} /></div>
      <div className="day-pill-row">{DAY_NAMES.map((d, i) => <button key={i} className={"day-pill day-pill-xs" + (w.days.includes(i) ? " active" : "")} onClick={() => toggleDay(i)}>{d[0]}</button>)}</div>
      <button className="btn-ghost" onClick={onDelete}><Icon name="trash" size={15} /></button>
    </div>
  );
}

function OnboardingModal({ settings, onSave, onClose }) {
  const [s, setS] = useState({ ...DEFAULT_SETTINGS, ...settings, personalWindows: settings.personalWindows && settings.personalWindows.length ? settings.personalWindows : DEFAULT_PERSONAL_WINDOWS, lowEnergyWindows: settings.lowEnergyWindows || [] });
  const toggleWorkDay = (d) => setS({ ...s, workDays: s.workDays.includes(d) ? s.workDays.filter(x => x !== d) : [...s.workDays, d].sort() });
  const updateWindow = (id, w) => setS({ ...s, personalWindows: s.personalWindows.map(x => x.id === id ? w : x) });
  const deleteWindow = (id) => setS({ ...s, personalWindows: s.personalWindows.filter(x => x.id !== id) });
  const addWindow = () => setS({ ...s, personalWindows: [...s.personalWindows, { id: uid(), label: "New personal time", days: [1, 2, 3, 4, 5], start: "18:00", end: "20:00" }] });
  const updateLE = (id, w) => setS({ ...s, lowEnergyWindows: s.lowEnergyWindows.map(x => x.id === id ? w : x) });
  const deleteLE = (id) => setS({ ...s, lowEnergyWindows: s.lowEnergyWindows.filter(x => x.id !== id) });
  const addLE = () => setS({ ...s, lowEnergyWindows: [...s.lowEnergyWindows, { id: uid(), label: "Post-lunch slump", days: [1, 2, 3, 4, 5], start: "13:00", end: "14:00" }] });
  return (
    <Modal title="Schedule settings" onClose={onClose} wide>
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: -6, marginBottom: 18, lineHeight: 1.5 }}>Update these anytime — they're the boundaries the scheduler always respects.</p>
      <Field label="Sleep"><div className="field-row"><div><label className="sublabel">Wake time</label><input type="time" value={s.wakeTime} onChange={e => setS({ ...s, wakeTime: e.target.value })} /></div><div><label className="sublabel">Bed time</label><input type="time" value={s.bedTime} onChange={e => setS({ ...s, bedTime: e.target.value })} /></div></div></Field>
      <Field label="Work hours"><div className="field-row"><div><label className="sublabel">Start</label><input type="time" value={s.workStart} onChange={e => setS({ ...s, workStart: e.target.value })} /></div><div><label className="sublabel">End</label><input type="time" value={s.workEnd} onChange={e => setS({ ...s, workEnd: e.target.value })} /></div></div></Field>
      <Field label="Work days"><div className="day-pill-row">{DAY_NAMES.map((d, i) => <button key={i} className={"day-pill" + (s.workDays.includes(i) ? " active" : "")} onClick={() => toggleWorkDay(i)}>{d}</button>)}</div></Field>
      <Field label="Personal time windows">
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 8px" }}>Add as many separate blocks as you need.</p>
        {s.personalWindows.map(w => <PersonalWindowRow key={w.id} w={w} onChange={(nw) => updateWindow(w.id, nw)} onDelete={() => deleteWindow(w.id)} />)}
        <button className="btn btn-sm" onClick={addWindow} style={{ marginTop: 6 }}><Icon name="plus" size={13} /> Add personal time window</button>
      </Field>
      <Field label="Low-energy windows (optional)">
        <p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 8px" }}>Deep-focus, high-priority tasks will try to avoid these hours when possible.</p>
        {s.lowEnergyWindows.map(w => <PersonalWindowRow key={w.id} w={w} onChange={(nw) => updateLE(w.id, nw)} onDelete={() => deleteLE(w.id)} />)}
        <button className="btn btn-sm" onClick={addLE} style={{ marginTop: 6 }}><Icon name="battery-low" size={13} /> Add low-energy window</button>
      </Field>
      <Field label="Primary fitness goal"><select value={s.fitnessPrimaryGoal} onChange={e => setS({ ...s, fitnessPrimaryGoal: e.target.value })}>{Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <div className="field-row">
        <Field label="Workouts per week"><input type="number" min="0" max="7" value={s.fitnessFrequency} onChange={e => setS({ ...s, fitnessFrequency: Number(e.target.value) })} /></Field>
        <Field label="Equipment available"><select value={s.equipment} onChange={e => setS({ ...s, equipment: e.target.value })}><option value="gym">Full gym</option><option value="home">Home equipment</option><option value="minimal">Minimal / bodyweight</option></select></Field>
      </div>
      <button className="btn btn-primary btn-block" onClick={() => onSave({ ...s, onboarded: true })}>Save changes</button>
    </Modal>
  );
}

function EventModal({ event, onSave, onClose, defaultDate }) {
  const [e, setE] = useState(event || { id: uid(), title: "", date: defaultDate || todayStr(), start: "09:00", end: "10:00", category: "work", recurring: false, recurFrequency: "weekly", recurEnd: "" });
  return (
    <Modal title={event ? "Edit event" : "New meeting / appointment"} onClose={onClose}>
      <Field label="Title"><input value={e.title} onChange={ev => setE({ ...e, title: ev.target.value })} placeholder="e.g. Team standup" /></Field>
      <Field label="Date"><input type="date" value={e.date} onChange={ev => setE({ ...e, date: ev.target.value })} /></Field>
      <div className="field-row"><Field label="Start"><input type="time" value={e.start} onChange={ev => setE({ ...e, start: ev.target.value })} /></Field><Field label="End"><input type="time" value={e.end} onChange={ev => setE({ ...e, end: ev.target.value })} /></Field></div>
      <Field label="Category"><select value={e.category} onChange={ev => setE({ ...e, category: ev.target.value })}><option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option></select></Field>
      <Field label="Recurrence">
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, fontWeight: 600, marginBottom: e.recurring ? 10 : 0 }}><input type="checkbox" checked={e.recurring} onChange={ev => setE({ ...e, recurring: ev.target.checked })} style={{ width: 17, height: 17 }} /> This repeats weekly</label>
        {e.recurring && <div className="field-row" style={{ marginTop: 8 }}><div><label className="sublabel">Ends on (optional)</label><input type="date" value={e.recurEnd} onChange={ev => setE({ ...e, recurEnd: ev.target.value })} /></div><div style={{ display: "flex", alignItems: "flex-end" }}><p style={{ fontSize: 12, color: "var(--text-tertiary)", margin: "0 0 9px" }}>Leave blank for open-ended.</p></div></div>}
      </Field>
      <button className="btn btn-primary btn-block" onClick={() => { if (e.title.trim()) onSave(e); }}>Save event</button>
    </Modal>
  );
}

function HabitModal({ habit, onSave, onClose, goals }) {
  const [hb, setHb] = useState(habit || { id: uid(), name: "", category: "personal", frequency: "daily", days: [1, 2, 3, 4, 5], duration: 20, time: "07:00", active: true, goalId: "" });
  const toggleDay = (d) => setHb({ ...hb, days: hb.days.includes(d) ? hb.days.filter(x => x !== d) : [...hb.days, d].sort() });
  return (
    <Modal title={habit ? "Edit habit" : "New habit"} onClose={onClose}>
      <Field label="Habit name"><input value={hb.name} onChange={e => setHb({ ...hb, name: e.target.value })} placeholder="e.g. Morning meditation" /></Field>
      <div className="field-row"><Field label="Category"><select value={hb.category} onChange={e => setHb({ ...hb, category: e.target.value })}><option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option></select></Field><Field label="Duration (min)"><input type="number" min="5" step="5" value={hb.duration} onChange={e => setHb({ ...hb, duration: Number(e.target.value) })} /></Field></div>
      <Field label="Frequency"><select value={hb.frequency} onChange={e => setHb({ ...hb, frequency: e.target.value })}><option value="daily">Every day</option><option value="weekly">Specific days</option></select></Field>
      {hb.frequency === "weekly" && <Field label="Days"><div className="day-pill-row">{DAY_NAMES.map((d, i) => <button key={i} className={"day-pill" + (hb.days.includes(i) ? " active" : "")} onClick={() => toggleDay(i)}>{d}</button>)}</div></Field>}
      <Field label="Preferred time"><input type="time" value={hb.time} onChange={e => setHb({ ...hb, time: e.target.value })} /></Field>
      {goals && goals.length > 0 && <Field label="Linked goal (optional)"><select value={hb.goalId || ""} onChange={e => setHb({ ...hb, goalId: e.target.value })}><option value="">None</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></Field>}
      <button className="btn btn-primary btn-block" onClick={() => { if (hb.name.trim()) onSave(hb); }}>Save habit</button>
    </Modal>
  );
}

function TaskModal({ task, onSave, onClose, defaultCategory, goals, allData, jumpToScheduler }) {
  const [t, setT] = useState(task || { id: uid(), title: "", category: defaultCategory || "personal", taskType: "one_time", dueDate: todayStr(), targetDate: "", estimatedMinutes: 30, priority: "medium", status: "not_started", notes: "", goalId: "", recurFrequency: "daily", recurDays: [1, 2, 3, 4, 5], occurrences: [], avoidLowEnergy: true });
  const [suggested, setSuggested] = useState(null);
  const toggleDay = (d) => setT({ ...t, recurDays: (t.recurDays || []).includes(d) ? t.recurDays.filter(x => x !== d) : [...(t.recurDays || []), d].sort() });
  const runSuggestion = () => setSuggested(suggestOccurrencesForTask(t, allData));
  const approveSuggestion = () => { setT({ ...t, occurrences: suggested }); setSuggested(null); };
  const denySuggestion = () => setSuggested(null);
  const updateOcc = (occId, patch) => setT({ ...t, occurrences: (t.occurrences || []).map(o => o.id === occId ? { ...o, ...patch } : o) });
  const deleteOcc = (occId) => setT({ ...t, occurrences: (t.occurrences || []).filter(o => o.id !== occId) });
  const addOccManually = () => setT({ ...t, occurrences: [...(t.occurrences || []), { id: uid(), date: t.dueDate || todayStr(), start: 540, end: 540 + (t.estimatedMinutes || 30) }] });
  const totalScheduled = (t.occurrences || []).reduce((sum, o) => sum + (o.end - o.start), 0);

  useEffect(() => { if (jumpToScheduler) runSuggestion(); }, []);

  return (
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose} wide>
      <Field label="Title"><input value={t.title} onChange={e => setT({ ...t, title: e.target.value })} placeholder="e.g. Finish quarterly report" /></Field>
      <Field label="Type"><div className="day-pill-row"><button className={"day-pill" + (t.taskType === "one_time" ? " active" : "")} onClick={() => setT({ ...t, taskType: "one_time" })}>One-time (has a due date)</button><button className={"day-pill" + (t.taskType === "recurring" ? " active" : "")} onClick={() => setT({ ...t, taskType: "recurring" })}>Recurring (e.g. email, lunch)</button></div></Field>
      <div className="field-row"><Field label="Category"><select value={t.category} onChange={e => setT({ ...t, category: e.target.value })}><option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option></select></Field><Field label="Priority"><select value={t.priority} onChange={e => setT({ ...t, priority: e.target.value })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></Field></div>
      {t.taskType === "one_time" ? (
        <div className="field-row"><Field label="Due date"><input type="date" value={t.dueDate} onChange={e => setT({ ...t, dueDate: e.target.value })} /></Field><Field label="Target completion (optional)"><input type="date" value={t.targetDate} onChange={e => setT({ ...t, targetDate: e.target.value })} /></Field></div>
      ) : (
        <div><Field label="Repeats"><select value={t.recurFrequency} onChange={e => setT({ ...t, recurFrequency: e.target.value })}><option value="daily">Every day</option><option value="weekly">Specific days</option></select></Field>{t.recurFrequency === "weekly" && <Field label="Days"><div className="day-pill-row">{DAY_NAMES.map((d, i) => <button key={i} className={"day-pill" + ((t.recurDays || []).includes(i) ? " active" : "")} onClick={() => toggleDay(i)}>{d}</button>)}</div></Field>}</div>
      )}
      <div className="field-row"><Field label="Est. time (min)"><input type="number" min="5" step="5" value={t.estimatedMinutes} onChange={e => setT({ ...t, estimatedMinutes: Number(e.target.value) })} /></Field><Field label="Status"><select value={t.status} onChange={e => setT({ ...t, status: e.target.value })}><option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option></select></Field></div>
      {goals && goals.length > 0 && <Field label="Linked goal"><select value={t.goalId || ""} onChange={e => setT({ ...t, goalId: e.target.value })}><option value="">None</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></Field>}
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 14 }}><input type="checkbox" checked={t.avoidLowEnergy !== false} onChange={e => setT({ ...t, avoidLowEnergy: e.target.checked })} style={{ width: 16, height: 16 }} /> Avoid my low-energy windows when scheduling this</label>

      {t.taskType === "one_time" && (
        <div className="occ-section">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.3 }}>Scheduled days & times {(t.occurrences || []).length > 0 && <span style={{ color: totalScheduled === t.estimatedMinutes ? "var(--green-text)" : "var(--amber-text)" }}>({totalScheduled}/{t.estimatedMinutes} min allocated)</span>}</label>
            <button className="btn btn-sm" onClick={runSuggestion}><Icon name="wand" size={13} /> Suggest schedule</button>
          </div>
          {suggested && (
            <div className="suggestion-box">
              <p style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 6 }}>Suggested time blocks (sum to {suggested.reduce((s, o) => s + (o.end - o.start), 0)} of {t.estimatedMinutes} min):</p>
              {suggested.length === 0 ? <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No open slots found — try a longer target date or shorter estimate.</p> : suggested.map(o => <div key={o.id} className="occ-row"><span>{fmtDateShort(o.date)}</span><span>{minutesToTime(o.start)} – {minutesToTime(o.end)}</span></div>)}
              {suggested.length > 0 && <div style={{ display: "flex", gap: 8, marginTop: 8 }}><button className="btn btn-primary btn-sm" onClick={approveSuggestion}><Icon name="check" size={13} /> Approve</button><button className="btn btn-sm" onClick={denySuggestion}>Deny</button></div>}
            </div>
          )}
          {(t.occurrences || []).length > 0 ? (
            <div>{t.occurrences.map(o => (
              <div key={o.id} className="occ-row occ-editable">
                <input type="date" value={o.date} onChange={e => updateOcc(o.id, { date: e.target.value })} className="occ-input" />
                <input type="time" value={`${String(Math.floor(o.start / 60)).padStart(2, "0")}:${String(o.start % 60).padStart(2, "0")}`} onChange={e => updateOcc(o.id, { start: timeToMinutes(e.target.value) })} className="occ-input" />
                <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>to</span>
                <input type="time" value={`${String(Math.floor(o.end / 60)).padStart(2, "0")}:${String(o.end % 60).padStart(2, "0")}`} onChange={e => updateOcc(o.id, { end: timeToMinutes(e.target.value) })} className="occ-input" />
                <button className="btn-ghost" onClick={() => deleteOcc(o.id)}><Icon name="trash" size={14} /></button>
              </div>
            ))}</div>
          ) : !suggested && <p style={{ fontSize: 12.5, color: "var(--text-tertiary)" }}>No scheduled blocks yet — use "Suggest schedule" or add one manually.</p>}
          <button className="btn btn-sm" onClick={addOccManually} style={{ marginTop: 6 }}><Icon name="plus" size={13} /> Add a day/time manually</button>
        </div>
      )}
      <button className="btn btn-primary btn-block" onClick={() => { if (t.title.trim()) onSave(t); }} style={{ marginTop: 14 }}>Save task</button>
    </Modal>
  );
}

function GoalQuickAddModal({ onSave, onClose, defaultCategory }) {
  const [g, setG] = useState({ id: uid(), title: "", category: defaultCategory || "fitness", targetDate: addDays(todayStr(), 90), description: "", progress: 0, history: [] });
  const [addStarterTasks, setAddStarterTasks] = useState(true);
  return (
    <Modal title="New goal" onClose={onClose}>
      <Field label="Goal title"><input value={g.title} onChange={e => setG({ ...g, title: e.target.value })} placeholder="e.g. Lose 15 lbs by summer" /></Field>
      <div className="field-row"><Field label="Category"><select value={g.category} onChange={e => setG({ ...g, category: e.target.value })}><option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option></select></Field><Field label="Target date"><input type="date" value={g.targetDate} onChange={e => setG({ ...g, targetDate: e.target.value })} /></Field></div>
      <Field label="Why this matters"><textarea style={{ minHeight: 60 }} value={g.description} onChange={e => setG({ ...g, description: e.target.value })} /></Field>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, marginBottom: 14 }}><input type="checkbox" checked={addStarterTasks} onChange={e => setAddStarterTasks(e.target.checked)} style={{ width: 16, height: 16 }} /> Add a few starter tasks to get this moving</label>
      <button className="btn btn-primary btn-block" onClick={() => { if (g.title.trim()) onSave(g, addStarterTasks); }}>Save goal</button>
    </Modal>
  );
}

function BodyStatModal({ onSave, onClose }) {
  const [s, setS] = useState({ id: uid(), date: todayStr(), weight: "", bodyFat: "", note: "" });
  return (
    <Modal title="Log body stats" onClose={onClose}>
      <Field label="Date"><input type="date" value={s.date} onChange={e => setS({ ...s, date: e.target.value })} /></Field>
      <div className="field-row"><Field label="Weight (lb)"><input type="number" step="0.1" value={s.weight} onChange={e => setS({ ...s, weight: e.target.value })} placeholder="e.g. 178.5" /></Field><Field label="Body fat % (optional)"><input type="number" step="0.1" value={s.bodyFat} onChange={e => setS({ ...s, bodyFat: e.target.value })} placeholder="e.g. 18.2" /></Field></div>
      <Field label="Progress note"><textarea style={{ minHeight: 60 }} value={s.note} onChange={e => setS({ ...s, note: e.target.value })} placeholder="How's progress feeling?" /></Field>
      <button className="btn btn-primary btn-block" onClick={() => { if (s.weight) onSave(s); }}>Save entry</button>
    </Modal>
  );
}

function AddExerciseModal({ onSave, onClose }) {
  const [ex, setEx] = useState({ name: "", sets: 3, reps: "10", weight: 0 });
  return (
    <Modal title="Add exercise" onClose={onClose}>
      <Field label="Exercise name"><input value={ex.name} onChange={e => setEx({ ...ex, name: e.target.value })} placeholder="e.g. Cable Lateral Raise" /></Field>
      <div className="field-row"><Field label="Sets"><input type="number" min="1" value={ex.sets} onChange={e => setEx({ ...ex, sets: Number(e.target.value) })} /></Field><Field label="Reps"><input value={ex.reps} onChange={e => setEx({ ...ex, reps: e.target.value })} placeholder="e.g. 10-12" /></Field></div>
      <Field label="Weight / resistance"><input value={ex.weight} onChange={e => setEx({ ...ex, weight: e.target.value })} placeholder="e.g. 25 or bodyweight" /></Field>
      <button className="btn btn-primary btn-block" onClick={() => { if (ex.name.trim()) onSave({ id: uid(), exerciseKey: null, ...ex, completed: false }); }}>Add to workout</button>
    </Modal>
  );
}

function TemplateSaveModal({ onSave, onClose }) {
  const [name, setName] = useState("");
  return (
    <Modal title="Save today as a template" onClose={onClose}>
      <Field label="Template name"><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Typical Tuesday" /></Field>
      <p style={{ fontSize: 12.5, color: "var(--text-tertiary)", marginBottom: 14 }}>This saves today's manual events as a reusable layout. Recurring tasks and habits already repeat automatically and don't need a template.</p>
      <button className="btn btn-primary btn-block" onClick={() => { if (name.trim()) onSave(name); }}>Save template</button>
    </Modal>
  );
}

function StatCard({ label, value, color }) { return <div className={`stat-card stat-${color}`}><p className="stat-label">{label}</p><p className="stat-value">{value}</p></div>; }

function ScheduleBlock({ block, dateStr, onEdit, onStatusChange, onDelete }) {
  const c = block.type === "task" ? urgencyColor(block, dateStr) : categoryColor(block.category);
  return (
    <div className="block-row">
      <div className={`block-stripe stripe-${c}`} />
      <div className="block-time">{minutesToTime(block.start)} – {minutesToTime(block.end)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="block-title">{block.title}</p>
        <div className="block-tags"><Tag color={categoryColor(block.category)}>{block.category}</Tag>{block.type === "task" && !block.recurring && <Tag color={c}>{c === "coral" ? "urgent" : c === "amber" ? "soon" : "on track"}</Tag>}{block.recurring && <Tag color="indigo">recurring</Tag>}{block.locked && <Tag>fixed</Tag>}</div>
      </div>
      <div className="row-actions">
        {block.taskId && <button className="btn-ghost" title="Mark done" onClick={() => onStatusChange(block.taskId)}><Icon name="check" /></button>}
        <button className="btn-ghost" title="Edit" onClick={() => onEdit(block)}><Icon name="edit" /></button>
        <button className="btn-ghost" title="Remove" onClick={() => onDelete(block)}><Icon name="trash" /></button>
      </div>
    </div>
  );
}

function DayTimeline({ blocks, dateStr, settings, onEdit, onStatusChange, onDelete }) {
  const startHour = Math.floor(timeToMinutes(settings.wakeTime) / 60);
  const endHour = Math.ceil(timeToMinutes(settings.bedTime) / 60);
  const pxPerMin = 1.05;
  const hours = []; for (let h = startHour; h <= endHour; h++) hours.push(h);
  const workStart = timeToMinutes(settings.workStart), workEnd = timeToMinutes(settings.workEnd);
  const dow = dowOf(dateStr);
  const isWorkDay = (settings.workDays || [1, 2, 3, 4, 5]).includes(dow);
  const personalWins = personalWindowsForDay(settings, dateStr);
  const lowEnergyWins = (settings.lowEnergyWindows || []).filter(w => w.days.includes(dow));
  return (
    <div className="timeline-wrap">
      <div className="timeline-hours">{hours.map(h => <div key={h} className="timeline-hour-label">{minutesToTime(h * 60)}</div>)}</div>
      <div className="timeline-grid">
        {hours.map(h => <div key={h} className="timeline-hour-row" />)}
        {isWorkDay && <div className="timeline-band band-work" style={{ top: (workStart - startHour * 60) * pxPerMin, height: (workEnd - workStart) * pxPerMin }}><span>WORK</span></div>}
        {personalWins.map(w => { const ws = timeToMinutes(w.start), we = timeToMinutes(w.end); return <div key={w.id} className="timeline-band band-personal" style={{ top: (ws - startHour * 60) * pxPerMin, height: (we - ws) * pxPerMin }}><span>PERSONAL</span></div>; })}
        {lowEnergyWins.map(w => { const ws = timeToMinutes(w.start), we = timeToMinutes(w.end); return <div key={w.id} className="timeline-band band-lowenergy" style={{ top: (ws - startHour * 60) * pxPerMin, height: (we - ws) * pxPerMin }}><span>LOW ENERGY</span></div>; })}
        {blocks.map((b, i) => { const top = (b.start - startHour * 60) * pxPerMin; const height = Math.max((b.end - b.start) * pxPerMin, 24); const c = b.type === "task" ? urgencyColor(b, dateStr) : categoryColor(b.category); return <div key={b.id + i} onClick={() => onEdit(b)} className={`timeline-block block-${c}`} style={{ top, height }}><div className="timeline-block-title">{b.title}</div>{height > 30 && <div className="timeline-block-time">{minutesToTime(b.start)}–{minutesToTime(b.end)}</div>}</div>; })}
      </div>
    </div>
  );
}

function WeekView({ weekStart, data, onSelectDay, selectedDate }) {
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  return (
    <div className="week-grid">
      {days.map(d => {
        const dayBlocks = autoScheduleDay(d, data);
        const isToday = d === todayStr(); const isSelected = d === selectedDate;
        return (
          <div key={d} onClick={() => onSelectDay(d)} className={"week-day-cell" + (isToday ? " is-today" : "") + (isSelected ? " is-selected" : "")}>
            <p className="week-day-cell-label">{fmtDateShort(d)}</p>
            {dayBlocks.slice(0, 4).map((b, i) => { const c = b.type === "task" ? urgencyColor(b, d) : categoryColor(b.category); return <div key={i} className={`week-mini-chip chip-${c}`}>{b.title}</div>; })}
            {dayBlocks.length > 4 && <p className="week-more-label">+{dayBlocks.length - 4} more</p>}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ monthAnchor, data, onSelectDay, selectedDate }) {
  const first = startOfMonth(monthAnchor); const numDays = daysInMonth(monthAnchor); const firstDow = dowOf(first);
  const cells = []; for (let i = 0; i < firstDow; i++) cells.push(null); for (let d = 1; d <= numDays; d++) cells.push(addDays(first, d - 1));
  return (
    <div>
      <div className="month-grid month-grid-header">{DAY_NAMES.map(d => <div key={d} className="month-day-name">{d}</div>)}</div>
      <div className="month-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dayBlocks = autoScheduleDay(d, data);
          const urgent = dayBlocks.filter(b => b.type === "task" && urgencyColor(b, d) === "coral").length;
          const soon = dayBlocks.filter(b => b.type === "task" && urgencyColor(b, d) === "amber").length;
          const isToday = d === todayStr(); const isSelected = d === selectedDate;
          return (
            <div key={d} onClick={() => onSelectDay(d)} className={"month-cell" + (isToday ? " is-today" : "") + (isSelected ? " is-selected" : "")}>
              <p className="month-cell-num">{Number(d.slice(-2))}</p>
              <div className="month-cell-dots">{urgent > 0 && <span className="dot-coral" />}{soon > 0 && <span className="dot-amber" />}{dayBlocks.length > 0 && <span className="month-cell-count">{dayBlocks.length}</span>}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HabitCalendar({ habit, completedLog, onToggle, monthAnchor }) {
  const first = startOfMonth(monthAnchor); const numDays = daysInMonth(monthAnchor); const firstDow = dowOf(first);
  const cells = []; for (let i = 0; i < firstDow; i++) cells.push(null); for (let d = 1; d <= numDays; d++) cells.push(addDays(first, d - 1));
  const applicableDates = cells.filter(Boolean).filter(d => { const dow = dowOf(d); return habit.frequency === "daily" || (habit.frequency === "weekly" && habit.days.includes(dow)); });
  const completedCount = applicableDates.filter(d => completedLog.some(c => c.habitId === habit.id && c.date === d)).length;
  const streak = computeHabitStreak(habit, completedLog, todayStr());
  const milestone = MILESTONE_THRESHOLDS.filter(m => streak >= m).pop();
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <p style={{ fontWeight: 700, fontSize: 15, margin: 0 }}>{habit.name}</p>
        <div style={{ display: "flex", gap: 6 }}>
          {streak > 0 && <Tag color="amber"><Icon name="flame" size={11} /> {streak} day{streak > 1 ? "s" : ""}</Tag>}
          {milestone && <Tag color="green"><Icon name="trophy" size={11} /> {milestone}-day milestone</Tag>}
          <Tag color="teal">{completedCount}/{applicableDates.length} this month</Tag>
        </div>
      </div>
      <div className="month-grid month-grid-header">{DAY_NAMES.map(d => <div key={d} className="month-day-name">{d}</div>)}</div>
      <div className="month-grid">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dow = dowOf(d);
          const applicable = habit.frequency === "daily" || (habit.frequency === "weekly" && habit.days.includes(dow));
          const done = completedLog.some(c => c.habitId === habit.id && c.date === d);
          if (!applicable) return <div key={d} className="month-cell habit-cell-inactive" />;
          return <button key={d} onClick={() => onToggle(habit.id, d)} className={"month-cell habit-cell" + (done ? " habit-done" : "")}><span className="month-cell-num">{Number(d.slice(-2))}</span></button>;
        })}
      </div>
    </div>
  );
}

function EditableCell({ value, type, options, onChange, valueColorVar }) {
  const [editing, setEditing] = useState(false);
  if (type === "select") return <select value={value} onChange={e => onChange(e.target.value)} className="cell-select">{options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
  if (type === "date") return <input type="date" value={value || ""} onChange={e => onChange(e.target.value)} className="cell-input" style={{ color: valueColorVar }} />;
  if (type === "number") return <input type="number" min="5" step="5" value={value} onChange={e => onChange(Number(e.target.value))} className="cell-input cell-input-narrow" />;
  if (editing) return <input autoFocus defaultValue={value} onBlur={e => { onChange(e.target.value); setEditing(false); }} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} className="cell-input cell-input-editing" />;
  return <div onClick={() => setEditing(true)} className="cell-text">{value}</div>;
}

function TaskOccurrenceStrip({ task, onUpdate, onOpenScheduler }) {
  const occs = task.occurrences || [];
  if (task.taskType === "recurring") return <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>repeats {task.recurFrequency}</span>;
  if (occs.length === 0) return <button className="btn-ghost not-scheduled-btn" onClick={() => onOpenScheduler(task)}>not scheduled — click to schedule</button>;
  const updateOcc = (occId, patch) => onUpdate({ ...task, occurrences: occs.map(o => o.id === occId ? { ...o, ...patch } : o) });
  return (
    <div className="occ-strip">
      {occs.map(o => (
        <div key={o.id} className="occ-chip">
          <button className="occ-link" onClick={() => onOpenScheduler(task)} title="Open scheduler">{fmtDateShort(o.date)}</button>
          <input type="time" value={`${String(Math.floor(o.start / 60)).padStart(2, "0")}:${String(o.start % 60).padStart(2, "0")}`} onChange={e => updateOcc(o.id, { start: timeToMinutes(e.target.value) })} className="occ-chip-input" />
        </div>
      ))}
    </div>
  );
}

function TaskTable({ tasks, goals, onUpdate, onDelete, onEditFull, onOpenScheduler }) {
  const statusOptions = [{ value: "not_started", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "blocked", label: "Blocked" }, { value: "done", label: "Done" }];
  const priorityOptions = [{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }];
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="monday-table">
        <thead><tr><th style={{ minWidth: 180 }}>Task</th><th>Status</th><th>Priority</th><th>Due date</th><th style={{ minWidth: 170 }}>Scheduled</th><th>Est. min</th><th>Goal</th><th></th></tr></thead>
        <tbody>
          {tasks.map(t => {
            const c = t.dueDate ? urgencyColor(t, todayStr()) : "slate";
            return (
              <tr key={t.id}>
                <td><EditableCell value={t.title} type="text" onChange={v => onUpdate({ ...t, title: v })} />{t.taskType === "recurring" && <Tag color="indigo">recurring</Tag>}</td>
                <td><span className={`status-pill status-${statusColor(t.status)}`}><EditableCell value={t.status} type="select" options={statusOptions} onChange={v => onUpdate({ ...t, status: v }, true)} /></span></td>
                <td><span className={`status-pill status-${priorityColor(t.priority)}`}><EditableCell value={t.priority} type="select" options={priorityOptions} onChange={v => onUpdate({ ...t, priority: v })} /></span></td>
                <td>{t.taskType === "recurring" ? <span style={{ color: "var(--text-tertiary)", fontSize: 12.5 }}>—</span> : <EditableCell value={t.dueDate} type="date" onChange={v => onUpdate({ ...t, dueDate: v })} valueColorVar={`var(--${c}-text)`} />}</td>
                <td><TaskOccurrenceStrip task={t} onUpdate={onUpdate} onOpenScheduler={onOpenScheduler} /></td>
                <td><EditableCell value={t.estimatedMinutes} type="number" onChange={v => onUpdate({ ...t, estimatedMinutes: v })} /></td>
                <td><select value={t.goalId || ""} onChange={e => onUpdate({ ...t, goalId: e.target.value })} className="cell-select"><option value="">—</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></td>
                <td style={{ display: "flex", gap: 2 }}><button className="btn-ghost" onClick={() => onEditFull(t)}><Icon name="edit" /></button><button className="btn-ghost" onClick={() => onDelete(t.id)}><Icon name="trash" /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompletedTaskRow({ t, onRestore, onDeletePermanently }) {
  const c = categoryColor(t.category);
  return (
    <div className="block-row">
      <div className={`block-stripe stripe-${c}`} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="block-title" style={{ textDecoration: "line-through", opacity: 0.75 }}>{t.title}</p>
        <div className="block-tags"><Tag color={c}>{t.category}</Tag>{t.completedAt && <Tag>completed {fmtDateShort(t.completedAt.slice(0, 10))}</Tag>}</div>
      </div>
      <div className="row-actions">
        <button className="btn btn-sm" onClick={() => onRestore(t.id)}>Move back to active</button>
        <button className="btn-ghost" onClick={() => onDeletePermanently(t.id)}><Icon name="trash" /></button>
      </div>
    </div>
  );
}

function GoalCard({ g, tasks, habits, onUpdate, onDelete }) {
  const [note, setNote] = useState("");
  const linkedTasks = tasks.filter(t => t.goalId === g.id);
  const doneLinked = linkedTasks.filter(t => t.status === "done").length;
  const linkedHabits = habits.filter(h => h.goalId === g.id && h.active);
  const history = g.history || [];
  const commitNote = () => { if (!note.trim()) return; onUpdate({ ...g, history: [...history, { id: uid(), note, progress: g.progress, timestamp: new Date().toISOString() }] }); setNote(""); };
  return (
    <div className="card">
      <div className="goal-card-progress">
        <div style={{ flex: 1 }}><EditableCell value={g.title} type="text" onChange={v => onUpdate({ ...g, title: v })} /><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}><span className="goal-target">Target:</span><input type="date" value={g.targetDate} onChange={e => onUpdate({ ...g, targetDate: e.target.value })} className="cell-input" style={{ width: "auto" }} /></div></div>
        <button className="btn-ghost" onClick={() => onDelete(g.id)}><Icon name="trash" /></button>
      </div>
      {g.description && <p className="goal-desc">{g.description}</p>}
      <div className="progress-track"><div className="progress-fill" style={{ width: `${g.progress}%` }} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}><input type="range" min="0" max="100" step="5" value={g.progress} onChange={e => onUpdate({ ...g, progress: Number(e.target.value) })} style={{ flex: 1 }} /><span className="goal-progress-pct">{g.progress}%</span></div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}><Tag color="indigo">{doneLinked}/{linkedTasks.length} tasks done</Tag><Tag color="teal">{linkedHabits.length} active habits</Tag></div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}><input placeholder="Quick daily update — how's this going?" value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => { if (e.key === "Enter") commitNote(); }} style={{ flex: 1 }} /><button className="btn btn-sm" onClick={commitNote}>Log</button></div>
      {history.length > 0 && <div className="goal-history">{history.slice().reverse().slice(0, 4).map(h => (<div key={h.id} className="goal-history-row"><span className="goal-history-time">{fmtDateTime(h.timestamp)}</span><span className="goal-history-note">{h.note}</span><span className="goal-history-pct">{h.progress}%</span></div>))}</div>}
    </div>
  );
}

function WorkoutCard({ workout, dayLabel, onUpdateExercise, onAddExercise, onComplete, onExpand }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}><Tag color="teal">{dayLabel}</Tag><div style={{ display: "flex", gap: 6, alignItems: "center" }}><Tag>~{workout.estimatedMinutes} min</Tag><button className="btn-ghost" onClick={onExpand} title="Open full screen"><Icon name="expand" /></button></div></div>
      <p className="workout-section-label label-amber">WARM-UP</p><p className="workout-section-text">{workout.warmup}</p>
      <p className="workout-section-label label-indigo">MAIN</p>
      <table className="workout-table"><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th></th></tr></thead><tbody>{workout.main.map(ex => (<tr key={ex.id} className={ex.completed ? "row-done" : ""}><td><EditableCell value={ex.name} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, name: v })} /></td><td><EditableCell value={ex.sets} type="number" onChange={v => onUpdateExercise(ex.id, { ...ex, sets: v })} /></td><td><EditableCell value={ex.reps} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, reps: v })} /></td><td><EditableCell value={ex.weight} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, weight: v })} /></td><td><input type="checkbox" checked={ex.completed} onChange={() => onUpdateExercise(ex.id, { ...ex, completed: !ex.completed })} className="checkbox-lg" /></td></tr>))}</tbody></table>
      <button className="btn btn-sm" onClick={onAddExercise} style={{ marginTop: 6 }}><Icon name="plus" size={14} /> Add exercise</button>
      <p className="workout-section-label label-green" style={{ marginTop: 14 }}>COOL-DOWN</p><p className="workout-section-text">{workout.cooldown}</p>
      <button className="btn btn-primary btn-sm" onClick={onComplete} style={{ marginTop: 8 }}><Icon name="check" size={14} /> Log as completed</button>
    </div>
  );
}

function WorkoutFullscreen({ workout, dayLabel, onUpdateExercise, onAddExercise, onComplete, onClose }) {
  return (
    <div className="modal-overlay"><div className="modal wide workout-fullscreen">
      <div className="modal-header"><h3>{dayLabel} — Full workout</h3><button className="btn-ghost" onClick={onClose}><Icon name="close" size={20} /></button></div>
      <p className="workout-section-label label-amber">WARM-UP</p><p className="workout-section-text" style={{ fontSize: 15 }}>{workout.warmup}</p>
      <p className="workout-section-label label-indigo">MAIN</p>
      <table className="workout-table workout-table-lg"><thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th>Done</th></tr></thead><tbody>{workout.main.map(ex => (<tr key={ex.id} className={ex.completed ? "row-done" : ""}><td><EditableCell value={ex.name} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, name: v })} /></td><td><EditableCell value={ex.sets} type="number" onChange={v => onUpdateExercise(ex.id, { ...ex, sets: v })} /></td><td><EditableCell value={ex.reps} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, reps: v })} /></td><td><EditableCell value={ex.weight} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, weight: v })} /></td><td><input type="checkbox" checked={ex.completed} onChange={() => onUpdateExercise(ex.id, { ...ex, completed: !ex.completed })} className="checkbox-lg" /></td></tr>))}</tbody></table>
      <button className="btn btn-sm" onClick={onAddExercise} style={{ margin: "8px 0" }}><Icon name="plus" size={14} /> Add exercise</button>
      <p className="workout-section-label label-green" style={{ marginTop: 14 }}>COOL-DOWN</p><p className="workout-section-text" style={{ fontSize: 15 }}>{workout.cooldown}</p>
      <button className="btn btn-primary btn-block" onClick={onComplete} style={{ marginTop: 12 }}><Icon name="check" /> Log as completed & close</button>
    </div></div>
  );
}

function PRTable({ exerciseHistory }) {
  const majorKeys = ["squat", "bench", "deadlift", "ohp", "row", "legpress", "lunge"];
  const rows = majorKeys.map(key => { const entries = exerciseHistory.filter(h => h.exerciseKey === key); if (entries.length === 0) return null; const best = entries.reduce((max, e) => Number(e.weight) > Number(max.weight) ? e : max, entries[0]); const last = entries.slice().sort((a, b) => a.date.localeCompare(b.date))[entries.length - 1]; return { key, name: EXERCISE_DB[key].name, pr: best.weight, prDate: best.date, last: last.weight, lastDate: last.date }; }).filter(Boolean);
  if (rows.length === 0) return <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>Log some workouts with weights to start tracking your PRs here.</p>;
  return (<table className="monday-table"><thead><tr><th>Movement</th><th>Personal record</th><th>PR date</th><th>Most recent</th></tr></thead><tbody>{rows.map(r => (<tr key={r.key}><td style={{ fontWeight: 700 }}>{r.name}</td><td><Tag color="amber">{r.pr} lb</Tag></td><td>{fmtDateShort(r.prDate)}</td><td>{r.last} lb <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>({fmtDateShort(r.lastDate)})</span></td></tr>))}</tbody></table>);
}

function FitnessTab({ state, onUpdate, onOpenGoalModal }) {
  const { settings, workoutLog, bodyStats, exerciseHistory } = state;
  const goalLabel = GOAL_LABELS[settings.fitnessPrimaryGoal] || GOAL_LABELS.general;
  const meals = MEAL_LIBRARY[settings.fitnessPrimaryGoal] || MEAL_LIBRARY.general;
  const groceries = GROCERY_BY_GOAL[settings.fitnessPrimaryGoal] || GROCERY_BY_GOAL.general;
  const [plan, setPlan] = useState(() => state.currentPlan && state.currentPlan.goal === settings.fitnessPrimaryGoal && state.currentPlan.equipment === settings.equipment ? state.currentPlan.workouts : Array.from({ length: settings.fitnessFrequency }).map((_, i) => buildWorkout(settings.fitnessPrimaryGoal, settings.equipment, i, exerciseHistory)));
  const [expandedIdx, setExpandedIdx] = useState(null);
  const [showBodyStat, setShowBodyStat] = useState(false);
  const [showAddExercise, setShowAddExercise] = useState(null);
  const [fitTab, setFitTab] = useState("plan");
  useEffect(() => { onUpdate({ currentPlan: { goal: settings.fitnessPrimaryGoal, equipment: settings.equipment, workouts: plan } }); }, [plan]);
  useEffect(() => { if (!(state.currentPlan && state.currentPlan.goal === settings.fitnessPrimaryGoal && state.currentPlan.equipment === settings.equipment && state.currentPlan.workouts.length === settings.fitnessFrequency)) setPlan(Array.from({ length: settings.fitnessFrequency }).map((_, i) => buildWorkout(settings.fitnessPrimaryGoal, settings.equipment, i, exerciseHistory))); }, [settings.fitnessPrimaryGoal, settings.equipment, settings.fitnessFrequency]);
  const updateExercise = (workoutIdx, exId, updated) => setPlan(plan.map((w, i) => i === workoutIdx ? { ...w, main: w.main.map(ex => ex.id === exId ? updated : ex) } : w));
  const addExercise = (workoutIdx, newEx) => setPlan(plan.map((w, i) => i === workoutIdx ? { ...w, main: [...w.main, newEx] } : w));
  const completeWorkout = (workoutIdx) => { const w = plan[workoutIdx]; const newHistory = w.main.filter(ex => ex.exerciseKey).map(ex => ({ exerciseKey: ex.exerciseKey, weight: ex.weight, date: todayStr() })); onUpdate({ workoutLog: [...workoutLog, { id: uid(), date: todayStr(), dayLabel: `Day ${workoutIdx + 1}`, exercises: w.main, completedAt: new Date().toISOString() }], exerciseHistory: [...exerciseHistory, ...newHistory] }); setExpandedIdx(null); };
  const sortedStats = bodyStats.slice().sort((a, b) => a.date.localeCompare(b.date));
  const latestStat = sortedStats[sortedStats.length - 1]; const firstStat = sortedStats[0];
  const weightChange = latestStat && firstStat ? (Number(latestStat.weight) - Number(firstStat.weight)).toFixed(1) : null;
  return (
    <div>
      <div className="tabs"><button className={"tab-btn" + (fitTab === "plan" ? " active" : "")} onClick={() => setFitTab("plan")}>Training plan</button><button className={"tab-btn" + (fitTab === "calendar" ? " active" : "")} onClick={() => setFitTab("calendar")}>Calendar</button><button className={"tab-btn" + (fitTab === "progress" ? " active" : "")} onClick={() => setFitTab("progress")}>Progress & PRs</button><button className={"tab-btn" + (fitTab === "nutrition" ? " active" : "")} onClick={() => setFitTab("nutrition")}>Nutrition</button></div>
      <div className="stat-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}><StatCard label="Weekly target" value={`${settings.fitnessFrequency}x / week`} color="teal" /><StatCard label="Primary goal" value={goalLabel} color="coral" /><StatCard label="Latest weight" value={latestStat ? `${latestStat.weight} lb` : "—"} color="indigo" /></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}><button className="btn btn-sm" onClick={() => setShowBodyStat(true)}><Icon name="scale" size={14} /> Log weight / body fat</button><button className="btn btn-sm" onClick={() => onOpenGoalModal("fitness")}><Icon name="plus" size={14} /> New fitness goal</button></div>
      {fitTab === "plan" && (<div><p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 14 }}>Each session targets ~60 minutes: warm-up, main work, cool-down — adapted to your "{goalLabel.toLowerCase()}" goal.</p><div className="workout-card-grid">{plan.map((w, i) => <WorkoutCard key={w.id} workout={w} dayLabel={`Day ${i + 1}`} onUpdateExercise={(exId, updated) => updateExercise(i, exId, updated)} onAddExercise={() => setShowAddExercise(i)} onComplete={() => completeWorkout(i)} onExpand={() => setExpandedIdx(i)} />)}</div><p className="disclaimer">General guidelines, not personalized coaching — check with a doctor or certified trainer before starting a new program, especially with injuries or medical conditions.</p></div>)}
      {fitTab === "calendar" && (<div><h3 className="section-heading">Upcoming & completed workouts</h3><div className="week-grid">{Array.from({ length: 7 }).map((_, i) => { const d = addDays(todayStr(), i); const completedThatDay = workoutLog.filter(w => w.date === d); const isWorkoutDay = i < settings.fitnessFrequency; return (<div key={d} className={"week-day-cell" + (i === 0 ? " is-today" : "")}><p className="week-day-cell-label">{fmtDateShort(d)}</p>{completedThatDay.map(w => <div key={w.id} className="week-mini-chip chip-green">{w.dayLabel} done</div>)}{completedThatDay.length === 0 && isWorkoutDay && <div className="week-mini-chip chip-teal">Planned: Day {i + 1}</div>}</div>); })}</div>{workoutLog.length > 0 && <div style={{ marginTop: 20 }}><h3 className="section-heading">Completed history</h3>{workoutLog.slice().reverse().slice(0, 10).map(w => (<div key={w.id} className="block-row"><div className="block-stripe stripe-teal" /><div style={{ flex: 1 }}><p className="block-title">{w.dayLabel} — {fmtDate(w.date)}</p><p className="block-subtext">{w.exercises.length} exercises logged</p></div></div>))}</div>}</div>)}
      {fitTab === "progress" && (<div><h3 className="section-heading">Body stats over time</h3>{sortedStats.length === 0 ? <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>No entries yet.</p> : (<div>{weightChange !== null && <p style={{ fontSize: 13.5, marginBottom: 10 }}>Change since first entry: <strong style={{ color: weightChange < 0 ? "var(--green-text)" : weightChange > 0 ? "var(--amber-text)" : "var(--text)" }}>{weightChange > 0 ? "+" : ""}{weightChange} lb</strong></p>}{sortedStats.slice().reverse().slice(0, 8).map(s => (<div key={s.id} className="block-row"><div className="block-stripe stripe-indigo" /><div style={{ flex: 1 }}><p className="block-title">{s.weight} lb{s.bodyFat ? ` · ${s.bodyFat}% body fat` : ""}</p><p className="block-subtext">{fmtDate(s.date)}{s.note ? ` — ${s.note}` : ""}</p></div></div>))}</div>)}<h3 className="section-heading" style={{ marginTop: 24 }}>Personal records</h3><PRTable exerciseHistory={exerciseHistory} /></div>)}
      {fitTab === "nutrition" && (<div><h3 className="section-heading">Sample daily meals</h3><div className="meal-grid">{Object.entries(meals).map(([slot, options]) => <div className="meal-card" key={slot}><p className="meal-slot">{slot}</p><ul>{options.map((o, i) => <li key={i}>{o}</li>)}</ul></div>)}</div><p className="disclaimer">General meal ideas, not individualized nutrition advice.</p><h3 className="section-heading">Grocery list suggestion</h3><div>{groceries.map((g, i) => <span className="grocery-chip" key={i}>{g}</span>)}</div></div>)}
      {expandedIdx !== null && <WorkoutFullscreen workout={plan[expandedIdx]} dayLabel={`Day ${expandedIdx + 1}`} onUpdateExercise={(exId, updated) => updateExercise(expandedIdx, exId, updated)} onAddExercise={() => setShowAddExercise(expandedIdx)} onComplete={() => completeWorkout(expandedIdx)} onClose={() => setExpandedIdx(null)} />}
      {showBodyStat && <BodyStatModal onSave={(s) => { onUpdate({ bodyStats: [...bodyStats, s] }); setShowBodyStat(false); }} onClose={() => setShowBodyStat(false)} />}
      {showAddExercise !== null && <AddExerciseModal onSave={(ex) => { addExercise(showAddExercise, ex); setShowAddExercise(null); }} onClose={() => setShowAddExercise(null)} />}
    </div>
  );
}

function SummaryTab({ data }) {
  const { tasks, habits, workoutLog, completedLog, goals } = data;
  const today = todayStr(); const last30 = []; for (let i = 0; i < 30; i++) last30.push(addDays(today, -i));
  const tasksCompleted30 = completedLog.filter(c => c.type === "task" && last30.includes(c.date)).length;
  const tasksOverdueNow = tasks.filter(t => t.taskType !== "recurring" && t.status !== "done" && t.dueDate && t.dueDate < today).length;
  const habitStats = habits.filter(h => h.active).map(h => { const applicable = last30.filter(d => { const dow = dowOf(d); return h.frequency === "daily" || (h.frequency === "weekly" && h.days.includes(dow)); }); const completed = applicable.filter(d => completedLog.some(c => c.habitId === h.id && c.date === d)); return { name: h.name, rate: applicable.length ? Math.round((completed.length / applicable.length) * 100) : 0, completed: completed.length, applicable: applicable.length, streak: computeHabitStreak(h, completedLog, today) }; });
  const avgHabitRate = habitStats.length ? Math.round(habitStats.reduce((s, h) => s + h.rate, 0) / habitStats.length) : 0;
  const workouts30 = workoutLog.filter(w => last30.includes(w.date)).length;
  const goalAvgProgress = goals.length ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : 0;
  return (
    <div>
      <div className="hero-banner"><h2>Your consistency, at a glance</h2><p>A rolling 30-day view across tasks, habits, and workouts.</p></div>
      <div className="stat-grid"><StatCard label="Tasks completed (30d)" value={tasksCompleted30} color="indigo" /><StatCard label="Avg. habit consistency" value={`${avgHabitRate}%`} color="teal" /><StatCard label="Workouts logged (30d)" value={workouts30} color="coral" /><StatCard label="Avg. goal progress" value={`${goalAvgProgress}%`} color="amber" /></div>
      {tasksOverdueNow > 0 && <div className="insight-row insight-warn"><Icon name="warn" /><p>{tasksOverdueNow} task{tasksOverdueNow > 1 ? "s" : ""} currently overdue.</p></div>}
      <h3 className="section-heading">Habit consistency & streaks</h3>
      {habitStats.length === 0 ? <p style={{ fontSize: 13.5, color: "var(--text-secondary)" }}>No active habits yet.</p> : habitStats.map((h, i) => (<div key={i} className="block-row"><div className={"block-stripe " + (h.rate >= 70 ? "stripe-green" : h.rate >= 40 ? "stripe-amber" : "stripe-coral")} /><div style={{ flex: 1 }}><p className="block-title">{h.name} {h.streak > 0 && <span style={{ fontSize: 12, color: "var(--amber-text)" }}><Icon name="flame" size={12} /> {h.streak}d</span>}</p><div className="progress-track" style={{ marginTop: 4 }}><div className="progress-fill" style={{ width: `${h.rate}%` }} /></div></div><span style={{ fontSize: 13, fontWeight: 800, minWidth: 70, textAlign: "right" }}>{h.completed}/{h.applicable}</span></div>))}
    </div>
  );
}

function InboxTab({ inbox, onAdd, onTriage, onDelete }) {
  const [text, setText] = useState("");
  const add = () => { if (!text.trim()) return; onAdd({ id: uid(), text, createdAt: new Date().toISOString() }); setText(""); };
  return (
    <div>
      <div className="hero-banner"><h2>Quick capture</h2><p>Dump anything here the moment it crosses your mind — sort it into a real task, habit, or goal later, whenever you have a minute.</p></div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === "Enter") add(); }} placeholder="Type a thought, idea, or to-do and hit Enter…" autoFocus />
        <button className="btn btn-primary" onClick={add}><Icon name="plus" size={14} /> Add</button>
      </div>
      {inbox.length === 0 ? <div className="empty-state"><p>Nothing captured yet — your inbox is clear.</p></div> : inbox.slice().reverse().map(item => (
        <div key={item.id} className="block-row">
          <div className="block-stripe stripe-slate" />
          <div style={{ flex: 1 }}><p className="block-title" style={{ fontWeight: 600 }}>{item.text}</p><p className="block-subtext">{fmtDateTime(item.createdAt)}</p></div>
          <div className="row-actions">
            <button className="btn btn-sm" onClick={() => onTriage(item, "personal")}>→ Personal task</button>
            <button className="btn btn-sm" onClick={() => onTriage(item, "work")}>→ Work task</button>
            <button className="btn-ghost" onClick={() => onDelete(item.id)}><Icon name="trash" /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

const navItems = [
  { id: "summary", label: "Summary", icon: "summary" }, { id: "today", label: "Today", icon: "today" }, { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "inbox", label: "Inbox", icon: "inbox" }, { id: "tasks", label: "Tasks", icon: "tasks" }, { id: "completed", label: "Completed", icon: "check" },
  { id: "goals", label: "Goals", icon: "goals" }, { id: "habits", label: "Habits", icon: "habits" }, { id: "fitness", label: "Fitness", icon: "fitness" }, { id: "coach", label: "Coach", icon: "coach" },
];

function MainApp({ session }) {
  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [activeTab, setActiveTab] = useState("today");
  const [taskFilter, setTaskFilter] = useState("personal");
  const [calView, setCalView] = useState("day");
  const [habitCalMonth, setHabitCalMonth] = useState(todayStr());
  const [showOnboard, setShowOnboard] = useState(false);
  const [eventModal, setEventModal] = useState(null);
  const [habitModal, setHabitModal] = useState(null);
  const [goalModal, setGoalModal] = useState(null);
  const [taskModal, setTaskModal] = useState(null);
  const [jumpToScheduler, setJumpToScheduler] = useState(false);
  const [completeConfirm, setCompleteConfirm] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [viewDate, setViewDate] = useState(todayStr());
  const [noteText, setNoteText] = useState("");
  const [navOpen, setNavOpen] = useState(false);
  const saveTimer = useRef(null);
  const userId = session.user.id;

  useEffect(() => {
    (async () => {
      const { data: row, error } = await supabase.from("life_os_data").select("data").eq("user_id", userId).maybeSingle();
      let loadedData = emptyData();
      if (!error && row && row.data) loadedData = { ...emptyData(), ...row.data, settings: { ...DEFAULT_SETTINGS, ...(row.data.settings || {}) } };
      if (!loadedData.settings.scheduleMigrationDone) {
        loadedData = { ...loadedData, tasks: loadedData.tasks.map(t => { if (t.taskType === "recurring" || t.status === "done" || (t.occurrences && t.occurrences.length)) return t; return { ...t, pendingSuggestion: true }; }), settings: { ...loadedData.settings, scheduleMigrationDone: true } };
        await supabase.from("life_os_data").upsert({ user_id: userId, data: loadedData, updated_at: new Date().toISOString() });
      } else if (error || !row) {
        await supabase.from("life_os_data").upsert({ user_id: userId, data: loadedData });
      }
      // Auto-generate a weekly review if it's been 7+ days since the last one and today is Monday-ish trigger (or no reviews exist yet)
      const lastReview = loadedData.weeklyReviews[loadedData.weeklyReviews.length - 1];
      const today = todayStr();
      if (!lastReview || addDays(lastReview.weekEnd, 7) <= today) {
        const review = generateWeeklyReview(loadedData, addDays(today, -1));
        loadedData = { ...loadedData, weeklyReviews: [...loadedData.weeklyReviews, review] };
      }
      setData(loadedData);
      setLoaded(true);
    })();
  }, [userId]);

  useEffect(() => { if (loaded) document.documentElement.setAttribute("data-theme", data.theme || "dark"); }, [loaded, data.theme]);
  useEffect(() => { if (loaded && !data.settings.onboarded) setShowOnboard(true); }, [loaded, data.settings.onboarded]);
  useEffect(() => { setNoteText((data.dailyLogs[viewDate] && data.dailyLogs[viewDate].note) || ""); }, [viewDate, data.dailyLogs]);

  const persist = useCallback((next) => {
    setSaveStatus("saving"); clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => { const { error } = await supabase.from("life_os_data").upsert({ user_id: userId, data: next, updated_at: new Date().toISOString() }); setSaveStatus(error ? "error" : "saved"); }, 500);
  }, [userId]);

  const update = (patch) => { const next = { ...data, ...patch }; setData(next); persist(next); };
  const blocks = useMemo(() => loaded ? autoScheduleDay(viewDate, data) : [], [viewDate, data, loaded]);
  const pendingSuggestionTasks = useMemo(() => data.tasks.filter(t => t.pendingSuggestion && t.status !== "done"), [data.tasks]);
  const activeTasks = useMemo(() => data.tasks.filter(t => t.status !== "done"), [data.tasks]);
  const completedTasks = useMemo(() => data.tasks.filter(t => t.status === "done"), [data.tasks]);

  if (!loaded) return <div className="loading-screen">Loading your Life OS…</div>;

  const toggleTheme = () => update({ theme: data.theme === "dark" ? "light" : "dark" });
  const logout = async () => { await supabase.auth.signOut(); };

  const updateTask = (task, isStatusChange) => {
    if (isStatusChange && task.status === "done") { setCompleteConfirm(task); return; }
    update({ tasks: data.tasks.map(t => t.id === task.id ? task : t) });
  };
  const confirmCompleteMove = () => { if (!completeConfirm) return; update({ tasks: data.tasks.map(t => t.id === completeConfirm.id ? { ...t, status: "done", completedAt: new Date().toISOString() } : t), completedLog: [...data.completedLog, { taskId: completeConfirm.id, date: todayStr(), type: "task" }] }); setCompleteConfirm(null); };
  const cancelCompleteMove = () => { if (!completeConfirm) return; update({ tasks: data.tasks.map(t => t.id === completeConfirm.id ? { ...t, status: "in_progress" } : t) }); setCompleteConfirm(null); };
  const restoreTask = (id) => update({ tasks: data.tasks.map(t => t.id === id ? { ...t, status: "in_progress", completedAt: null } : t) });
  const deleteTaskPermanently = (id) => update({ tasks: data.tasks.filter(t => t.id !== id) });
  const deleteTask = (id) => update({ tasks: data.tasks.filter(t => t.id !== id) });
  const markTaskDone = (id) => { const t = data.tasks.find(t => t.id === id); if (t) setCompleteConfirm(t); };
  const saveTaskFromModal = (task) => { const exists = data.tasks.some(t => t.id === task.id); const cleaned = { ...task, pendingSuggestion: false }; if (cleaned.status === "done" && (!task.completedAt)) cleaned.completedAt = new Date().toISOString(); update({ tasks: exists ? data.tasks.map(t => t.id === task.id ? cleaned : t) : [...data.tasks, cleaned] }); setTaskModal(null); setJumpToScheduler(false); };
  const addTaskQuick = () => { setJumpToScheduler(false); setTaskModal({ id: uid(), title: "", category: taskFilter, taskType: "one_time", dueDate: todayStr(), targetDate: "", estimatedMinutes: 30, priority: "medium", status: "not_started", notes: "", goalId: "", occurrences: [], avoidLowEnergy: true }); };
  const openScheduler = (task) => { setJumpToScheduler(true); setTaskModal(task); };

  const saveEvent = (event) => { const exists = data.events.some(e => e.id === event.id); update({ events: exists ? data.events.map(e => e.id === event.id ? event : e) : [...data.events, event] }); setEventModal(null); };
  const deleteEvent = (id) => update({ events: data.events.filter(e => e.id !== id) });

  const updateGoal = (goal) => update({ goals: data.goals.map(g => g.id === goal.id ? goal : g) });
  const deleteGoal = (id) => update({ goals: data.goals.filter(g => g.id !== id) });
  const addGoalFromModal = (goal, addStarterTasks) => {
    const newTasks = addStarterTasks ? (GOAL_TEMPLATE_TASKS[goal.category] || GOAL_TEMPLATE_TASKS.personal).map(title => ({ id: uid(), title, category: goal.category, taskType: "one_time", dueDate: addDays(todayStr(), 7), targetDate: "", estimatedMinutes: 20, priority: "medium", status: "not_started", notes: "", goalId: goal.id, occurrences: [], avoidLowEnergy: true })) : [];
    update({ goals: [...data.goals, goal], tasks: [...data.tasks, ...newTasks] });
    setGoalModal(null);
  };

  const saveHabit = (habit) => { const exists = data.habits.some(hh => hh.id === habit.id); update({ habits: exists ? data.habits.map(hh => hh.id === habit.id ? habit : hh) : [...data.habits, habit] }); setHabitModal(null); };
  const deleteHabit = (id) => update({ habits: data.habits.filter(hh => hh.id !== id) });
  const toggleHabitDone = (habitId, date) => { const d = date || viewDate; const already = data.completedLog.some(c => c.habitId === habitId && c.date === d); update({ completedLog: already ? data.completedLog.filter(c => !(c.habitId === habitId && c.date === d)) : [...data.completedLog, { habitId, date: d, type: "habit" }] }); };

  const handleBlockDelete = (block) => {
    if (block.taskId) { const t = data.tasks.find(t => t.id === block.taskId); if (t && block.occurrenceId) updateTask({ ...t, occurrences: (t.occurrences || []).filter(o => o.id !== block.occurrenceId) }); }
    else if (block.type === "event") deleteEvent(block.eventId || block.id);
  };
  const handleBlockEdit = (block) => {
    if (block.type === "event") { const ev = data.events.find(e => e.id === block.eventId); if (ev) setEventModal(ev); }
    else if (block.taskId) { const t = data.tasks.find(t => t.id === block.taskId); if (t) { setJumpToScheduler(false); setTaskModal(t); } }
    else if (block.habitId) { const hh = data.habits.find(hh => hh.id === block.habitId); if (hh) setHabitModal(hh); }
  };
  const saveNote = () => update({ dailyLogs: { ...data.dailyLogs, [viewDate]: { ...(data.dailyLogs[viewDate] || {}), note: noteText } } });

  const addInboxItem = (item) => update({ inbox: [...data.inbox, item] });
  const deleteInboxItem = (id) => update({ inbox: data.inbox.filter(i => i.id !== id) });
  const triageInboxItem = (item, category) => {
    const newTask = { id: uid(), title: item.text, category, taskType: "one_time", dueDate: addDays(todayStr(), 3), targetDate: "", estimatedMinutes: 30, priority: "medium", status: "not_started", notes: "", goalId: "", occurrences: [], avoidLowEnergy: true };
    update({ tasks: [...data.tasks, newTask], inbox: data.inbox.filter(i => i.id !== item.id) });
  };

  const saveAsTemplate = (name) => {
    const todaysEvents = data.events.filter(e => e.date === viewDate);
    update({ scheduleTemplates: [...data.scheduleTemplates, { id: uid(), name, events: todaysEvents.map(e => ({ title: e.title, start: e.start, end: e.end, category: e.category })) }] });
    setShowTemplateModal(false);
  };
  const applyTemplate = (template, targetDate) => {
    const newEvents = template.events.map(e => ({ id: uid(), title: e.title, date: targetDate, start: e.start, end: e.end, category: e.category, recurring: false }));
    update({ events: [...data.events, ...newEvents] });
  };
  const deleteTemplate = (id) => update({ scheduleTemplates: data.scheduleTemplates.filter(t => t.id !== id) });

  const printAgenda = () => {
    const w = window.open("", "_blank");
    const rows = blocks.map(b => `<tr><td style="padding:6px 10px;font-family:monospace;font-size:12px;">${minutesToTime(b.start)} – ${minutesToTime(b.end)}</td><td style="padding:6px 10px;">${b.title}</td><td style="padding:6px 10px;text-transform:capitalize;">${b.category}</td></tr>`).join("");
    w.document.write(`<html><head><title>Agenda — ${fmtDate(viewDate)}</title></head><body style="font-family:sans-serif;padding:24px;"><h2>${fmtDate(viewDate)}</h2><table style="border-collapse:collapse;width:100%;">${rows}</table></body></html>`);
    w.document.close(); w.print();
  };

  const tasksForFilter = activeTasks.filter(t => t.category === taskFilter).sort((a, b) => (a.dueDate || "9999").localeCompare(b.dueDate || "9999"));
  const insights = generateCoachInsights(data, viewDate);
  const habitsToday = data.habits.filter(hh => { if (!hh.active) return false; const dow = dowOf(viewDate); return hh.frequency === "daily" || (hh.frequency === "weekly" && hh.days.includes(dow)); });
  const latestReview = data.weeklyReviews[data.weeklyReviews.length - 1];

  return (
    <div className="app">
      <div className={"sidebar" + (navOpen ? " nav-open" : "")}>
        <div className="brand"><div className="brand-mark">L</div><div className="brand-name">Life OS</div></div>
        {navItems.map(n => <button key={n.id} className={"nav-item" + (activeTab === n.id ? " active" : "")} onClick={() => { setActiveTab(n.id); setNavOpen(false); }}><span className="nav-icon"><Icon name={n.icon} /></span>{n.label}{n.id === "inbox" && data.inbox.length > 0 && <span className="nav-badge">{data.inbox.length}</span>}</button>)}
        <div className="sidebar-footer">
          <div className="save-status"><span className={"dot" + (saveStatus === "saving" ? " syncing" : saveStatus === "error" ? " error" : "")} />{saveStatus === "saving" ? "Syncing…" : saveStatus === "saved" ? "Synced" : saveStatus === "error" ? "Sync error" : ""}</div>
          <div className="sidebar-email">{session.user.email}</div>
          <button className="nav-item" onClick={() => setShowOnboard(true)}><span className="nav-icon"><Icon name="settings" /></span>Settings</button>
          <button className="nav-item" onClick={logout}><span className="nav-icon"><Icon name="logout" /></span>Log out</button>
        </div>
      </div>

      <div className="main">
        <div className="page-header">
          <button className="mobile-menu-btn" onClick={() => setNavOpen(!navOpen)}>☰</button>
          <div>
            <h1 className="page-title">{navItems.find(n => n.id === activeTab)?.label || "Life OS"}</h1>
            <p className="page-subtitle">{activeTab === "today" ? "Your day, mapped out by time and priority." : activeTab === "calendar" ? "Month, week, or day — with work, personal, low-energy, and sleep hours shown." : activeTab === "tasks" ? "Click any cell to edit it directly." : activeTab === "completed" ? "Everything you've finished, color-coded by category." : activeTab === "goals" ? "Update progress daily — every change is time-stamped." : activeTab === "habits" ? "Exact times, calendar history, streaks, and milestones." : activeTab === "fitness" ? "Adaptive training, progress tracking, and nutrition." : activeTab === "summary" ? "How consistent you've actually been, across everything." : activeTab === "inbox" ? "Capture first, organize later." : "Data-driven observations on how things are going."}</p>
          </div>
          <div className="header-actions">
            {activeTab === "today" && <button className="btn btn-sm" onClick={() => setShowTemplateModal(true)}><Icon name="template" size={14} /> Save as template</button>}
            {activeTab === "today" && <button className="btn btn-sm" onClick={printAgenda}><Icon name="print" size={14} /> Print agenda</button>}
            <button className="icon-toggle" onClick={toggleTheme} title="Toggle theme"><Icon name={data.theme === "dark" ? "sun" : "moon"} /></button>
          </div>
        </div>

        {pendingSuggestionTasks.length > 0 && activeTab !== "tasks" && (
          <div className="insight-row insight-warn" style={{ marginBottom: 18 }}><Icon name="warn" /><p>{pendingSuggestionTasks.length} existing task{pendingSuggestionTasks.length > 1 ? "s" : ""} need a schedule approved. <button className="btn-ghost" style={{ textDecoration: "underline", padding: 0, fontWeight: 700, color: "var(--amber-text)" }} onClick={() => setActiveTab("tasks")}>Go to Tasks</button></p></div>
        )}

        {activeTab === "today" && (
          <div>
            {latestReview && (
              <div className="hero-banner" style={{ marginBottom: 18 }}>
                <h2>Weekly review — week of {fmtDateShort(latestReview.weekStart)}</h2>
                <p style={{ marginBottom: 8 }}>{latestReview.tasksCompleted} task{latestReview.tasksCompleted !== 1 ? "s" : ""} completed · {latestReview.workouts} workout{latestReview.workouts !== 1 ? "s" : ""} logged{latestReview.strongHabits.length > 0 ? ` · strong on: ${latestReview.strongHabits.slice(0, 2).join(", ")}` : ""}</p>
                {latestReview.focusAreas.map((f, i) => <p key={i} style={{ margin: "4px 0", fontSize: 13 }}>• {f}</p>)}
              </div>
            )}
            <div className="date-nav"><button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, -1))}><Icon name="left" /></button><div className="date-label">{fmtDate(viewDate)}</div><button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, 1))}><Icon name="right" /></button><button className="btn btn-sm" onClick={() => setViewDate(todayStr())}>Today</button><div style={{ flex: 1 }} /><button className="btn btn-sm" onClick={() => setEventModal({})}><Icon name="plus" size={14} /> Event</button></div>
            <div className="stat-grid"><StatCard label="Blocks today" value={blocks.length} color="indigo" /><StatCard label="Tasks due" value={data.tasks.filter(t => t.dueDate === viewDate && t.status !== "done").length} color="teal" /><StatCard label="Habits today" value={habitsToday.length} color="coral" /><StatCard label="Overdue" value={data.tasks.filter(t => t.taskType !== "recurring" && t.status !== "done" && t.dueDate && t.dueDate < viewDate).length} color="amber" /></div>
            {insights.length > 0 && <div style={{ marginBottom: 20 }}>{insights.slice(0, 2).map((ins, i) => <div key={i} className={"insight-row " + (ins.type === "warning" ? "insight-warn" : "insight-good")}><Icon name={ins.type === "warning" ? "warn" : "good"} /><p>{ins.text}</p></div>)}</div>}
            <h3 className="section-heading">Mapped out by time</h3>
            {blocks.length === 0 ? <div className="empty-state"><p>Nothing scheduled yet.</p></div> : <DayTimeline blocks={blocks} dateStr={viewDate} settings={data.settings} onEdit={handleBlockEdit} onStatusChange={markTaskDone} onDelete={handleBlockDelete} />}
            <h3 className="section-heading">List view</h3>
            {blocks.map((b, i) => <ScheduleBlock key={b.id + i} block={b} dateStr={viewDate} onEdit={handleBlockEdit} onStatusChange={markTaskDone} onDelete={handleBlockDelete} />)}
            {habitsToday.length > 0 && <div style={{ marginTop: 24 }}><h3 className="section-heading">Habit checklist</h3>{habitsToday.map(hh => { const done = data.completedLog.some(c => c.habitId === hh.id && c.date === viewDate); return (<label key={hh.id} className="habit-check"><input type="checkbox" checked={done} onChange={() => toggleHabitDone(hh.id)} /><span className={done ? "habit-done-text" : ""}>{hh.name} <span className="habit-time-tag">{hh.time}</span></span></label>); })}</div>}
            <div style={{ marginTop: 24 }}><h3 className="section-heading">Daily note</h3><textarea style={{ minHeight: 80 }} placeholder="How did today go?" value={noteText} onChange={e => setNoteText(e.target.value)} onBlur={saveNote} /></div>
          </div>
        )}

        {activeTab === "calendar" && (
          <div>
            <div className="tabs"><button className={"tab-btn" + (calView === "month" ? " active" : "")} onClick={() => setCalView("month")}>Month</button><button className={"tab-btn" + (calView === "week" ? " active" : "")} onClick={() => setCalView("week")}>Week</button><button className={"tab-btn" + (calView === "day" ? " active" : "")} onClick={() => setCalView("day")}>Day</button></div>
            <div className="date-nav"><button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, calView === "month" ? -30 : calView === "week" ? -7 : -1))}><Icon name="left" /></button><div className="date-label">{calView === "month" ? fmtMonthYear(viewDate) : calView === "week" ? `Week of ${fmtDateShort(startOfWeek(viewDate))}` : fmtDate(viewDate)}</div><button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, calView === "month" ? 30 : calView === "week" ? 7 : 1))}><Icon name="right" /></button><button className="btn btn-sm" onClick={() => setViewDate(todayStr())}>Today</button><div style={{ flex: 1 }} /><button className="btn btn-sm" onClick={() => setEventModal({})}><Icon name="plus" size={14} /> Event</button></div>
            <div className="legend-row"><span className="legend-chip"><span className="legend-dot dot-indigo-bg" /> Work hours</span><span className="legend-chip"><span className="legend-dot dot-coral-bg" /> Personal hours</span><span className="legend-chip"><span className="legend-dot dot-amber-bg" /> Low energy</span><span className="legend-chip"><span className="legend-dot dot-slate-bg" /> Sleep</span></div>
            {data.scheduleTemplates.length > 0 && calView === "day" && (
              <div style={{ marginBottom: 14, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "var(--text-tertiary)", fontWeight: 700 }}>Apply template:</span>
                {data.scheduleTemplates.map(t => <button key={t.id} className="btn btn-sm" onClick={() => applyTemplate(t, viewDate)}><Icon name="template" size={12} /> {t.name}</button>)}
              </div>
            )}
            {calView === "month" && <MonthView monthAnchor={viewDate} data={data} onSelectDay={(d) => { setViewDate(d); setCalView("day"); }} selectedDate={viewDate} />}
            {calView === "week" && <WeekView weekStart={startOfWeek(viewDate)} data={data} onSelectDay={(d) => { setViewDate(d); setCalView("day"); }} selectedDate={viewDate} />}
            {calView === "day" && <DayTimeline blocks={blocks} dateStr={viewDate} settings={data.settings} onEdit={handleBlockEdit} onStatusChange={markTaskDone} onDelete={handleBlockDelete} />}
          </div>
        )}

        {activeTab === "inbox" && <InboxTab inbox={data.inbox} onAdd={addInboxItem} onTriage={triageInboxItem} onDelete={deleteInboxItem} />}

        {activeTab === "tasks" && (
          <div>
            <div className="tabs">{["personal", "work", "fitness"].map(cat => <button key={cat} className={"tab-btn" + (taskFilter === cat ? " active" : "")} onClick={() => setTaskFilter(cat)}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</button>)}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginBottom: 14 }}><button className="btn btn-primary btn-sm" onClick={addTaskQuick}><Icon name="plus" size={14} /> New task</button></div>
            {tasksForFilter.length === 0 ? <div className="empty-state"><p>No {taskFilter} tasks yet.</p></div> : <TaskTable tasks={tasksForFilter} goals={data.goals} onUpdate={updateTask} onDelete={deleteTask} onEditFull={(t) => { setJumpToScheduler(false); setTaskModal(t); }} onOpenScheduler={openScheduler} />}
          </div>
        )}

        {activeTab === "completed" && (
          <div>
            {completedTasks.length === 0 ? <div className="empty-state"><p>Nothing completed yet — finished tasks will show up here, color-coded by category.</p></div> :
              ["personal", "work", "fitness"].map(cat => {
                const items = completedTasks.filter(t => t.category === cat);
                if (items.length === 0) return null;
                return (
                  <div key={cat} style={{ marginBottom: 22 }}>
                    <h3 className="section-heading" style={{ textTransform: "capitalize" }}>{cat}</h3>
                    {items.map(t => <CompletedTaskRow key={t.id} t={t} onRestore={restoreTask} onDeletePermanently={deleteTaskPermanently} />)}
                  </div>
                );
              })}
          </div>
        )}

        {activeTab === "goals" && (<div><div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}><button className="btn btn-primary btn-sm" onClick={() => setGoalModal("personal")}><Icon name="plus" size={14} /> New goal</button></div>{data.goals.length === 0 ? <div className="empty-state"><p>No goals yet.</p></div> : data.goals.map(g => <GoalCard key={g.id} g={g} tasks={data.tasks} habits={data.habits} onUpdate={updateGoal} onDelete={deleteGoal} />)}</div>)}

        {activeTab === "habits" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}><button className="btn btn-primary btn-sm" onClick={() => setHabitModal({})}><Icon name="plus" size={14} /> New habit</button></div>
            {data.habits.length === 0 ? <div className="empty-state"><p>No habits yet.</p></div> : (
              <div>
                {data.habits.map(hh => { const streak = computeHabitStreak(hh, data.completedLog, todayStr()); return (<div key={hh.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}><div style={{ flex: 1 }}><p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{hh.name}</p><div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}><Tag>{hh.frequency === "daily" ? "Every day" : "Weekly"}</Tag><Tag>{hh.duration}m</Tag><Tag color="indigo">{hh.time}</Tag>{streak > 0 && <Tag color="amber"><Icon name="flame" size={11} /> {streak}d</Tag>}{!hh.active && <Tag color="coral">paused</Tag>}</div></div><button className="btn btn-sm" onClick={() => saveHabit({ ...hh, active: !hh.active })}>{hh.active ? "Pause" : "Resume"}</button><div className="row-actions"><button className="btn-ghost" onClick={() => setHabitModal(hh)}><Icon name="edit" /></button><button className="btn-ghost" onClick={() => deleteHabit(hh.id)}><Icon name="trash" /></button></div></div>); })}
                <h3 className="section-heading" style={{ marginTop: 24 }}>Habit calendars</h3>
                <div className="date-nav"><button className="btn btn-sm" onClick={() => setHabitCalMonth(addDays(startOfMonth(habitCalMonth), -1))}><Icon name="left" /></button><div className="date-label">{fmtMonthYear(habitCalMonth)}</div><button className="btn btn-sm" onClick={() => setHabitCalMonth(addDays(startOfMonth(habitCalMonth), daysInMonth(habitCalMonth) + 1))}><Icon name="right" /></button></div>
                <div className="habit-cal-grid">{data.habits.filter(h => h.active).map(h => <HabitCalendar key={h.id} habit={h} completedLog={data.completedLog} onToggle={toggleHabitDone} monthAnchor={habitCalMonth} />)}</div>
              </div>
            )}
          </div>
        )}

        {activeTab === "fitness" && <FitnessTab state={data} onUpdate={update} onOpenGoalModal={setGoalModal} />}
        {activeTab === "summary" && <SummaryTab data={data} />}
        {activeTab === "coach" && (<div><div className="hero-banner"><h2>Your year of transformation</h2><p>Honest, data-driven observations from your tasks, goals, and habit history.</p></div>{insights.map((ins, i) => <div key={i} className={"insight-row " + (ins.type === "warning" ? "insight-warn" : "insight-good")}><Icon name={ins.type === "warning" ? "warn" : "good"} /><p>{ins.text}</p></div>)}</div>)}

        {showOnboard && <OnboardingModal settings={data.settings} onSave={(s) => { update({ settings: s }); setShowOnboard(false); }} onClose={() => setShowOnboard(false)} />}
        {eventModal !== null && <EventModal event={eventModal.id ? eventModal : null} defaultDate={viewDate} onSave={saveEvent} onClose={() => setEventModal(null)} />}
        {habitModal !== null && <HabitModal habit={habitModal.id ? habitModal : null} goals={data.goals} onSave={saveHabit} onClose={() => setHabitModal(null)} />}
        {goalModal !== null && <GoalQuickAddModal defaultCategory={goalModal} onSave={addGoalFromModal} onClose={() => setGoalModal(null)} />}
        {taskModal !== null && <TaskModal task={taskModal.id ? taskModal : null} defaultCategory={taskFilter} goals={data.goals} allData={data} jumpToScheduler={jumpToScheduler} onSave={saveTaskFromModal} onClose={() => { setTaskModal(null); setJumpToScheduler(false); }} />}
        {completeConfirm && <ConfirmModal title="Mark as completed?" message={`Move "${completeConfirm.title}" to your Completed list? You can always move it back later.`} confirmLabel="Yes, mark complete" onConfirm={confirmCompleteMove} onCancel={cancelCompleteMove} />}
        {showTemplateModal && <TemplateSaveModal onSave={saveAsTemplate} onClose={() => setShowTemplateModal(false)} />}
      </div>

      <div className="mobile-nav">{navItems.map(n => <button key={n.id} className={activeTab === n.id ? "active" : ""} onClick={() => setActiveTab(n.id)}><Icon name={n.icon} size={18} /><span>{n.label}</span></button>)}</div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => listener.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="loading-screen">Loading…</div>;
  if (!session) return <AuthScreen />;
  return <MainApp key={session.user.id} session={session} />;
}