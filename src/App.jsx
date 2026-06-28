import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmtDate = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const fmtDateShort = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtMonthYear = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { month: "long", year: "numeric" });
const minutesToTime = (mins) => {
  const h2 = Math.floor(mins / 60) % 24; const m = mins % 60; const ampm = h2 >= 12 ? "PM" : "AM"; const h12 = h2 % 12 === 0 ? 12 : h2 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
};
const timeToMinutes = (t) => { const [hh, mm] = t.split(":").map(Number); return hh * 60 + mm; };
const startOfWeek = (dateStr) => addDays(dateStr, -new Date(dateStr + "T00:00:00").getDay());
const startOfMonth = (dateStr) => { const d = new Date(dateStr + "T00:00:00"); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const daysInMonth = (dateStr) => { const d = new Date(dateStr + "T00:00:00"); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };

const DEFAULT_SETTINGS = {
  wakeTime: "06:30", bedTime: "22:30", workStart: "09:00", workEnd: "17:00",
  startDate: todayStr(), fitnessFrequency: 4, fitnessGoal: "general", equipment: "gym", onboarded: false,
};
const PART_OF_DAY_RANGES = { morning: [300, 720], midday: [720, 1020], night: [1020, 1410] };

// ---------- Workout library: structured sets/reps/weight, ~60min w/ warmup+main+cooldown ----------
const EXERCISE_DB = {
  squat: { name: "Barbell Back Squat", sets: 4, reps: "6-8", weightHint: "moderate-heavy" },
  bench: { name: "Barbell Bench Press", sets: 4, reps: "6-8", weightHint: "moderate-heavy" },
  deadlift: { name: "Deadlift", sets: 4, reps: "5-6", weightHint: "heavy" },
  row: { name: "Barbell Row", sets: 3, reps: "8-10", weightHint: "moderate" },
  ohp: { name: "Overhead Press", sets: 3, reps: "8-10", weightHint: "moderate" },
  pullup: { name: "Pull-ups", sets: 3, reps: "6-10", weightHint: "bodyweight" },
  legpress: { name: "Leg Press", sets: 3, reps: "10-12", weightHint: "moderate-heavy" },
  lunge: { name: "Dumbbell Lunge", sets: 3, reps: "10/side", weightHint: "moderate" },
  pushup: { name: "Push-ups", sets: 3, reps: "12-20", weightHint: "bodyweight" },
  bodysquat: { name: "Bodyweight Squat", sets: 3, reps: "15-20", weightHint: "bodyweight" },
  plank: { name: "Plank", sets: 3, reps: "45-60 sec", weightHint: "bodyweight" },
  bandrow: { name: "Band Row", sets: 3, reps: "12-15", weightHint: "light-moderate band" },
  bandpress: { name: "Band Chest Press", sets: 3, reps: "12-15", weightHint: "light-moderate band" },
  jumprope: { name: "Jump Rope", sets: 1, reps: "5 min", weightHint: "n/a" },
  burpee: { name: "Burpees", sets: 3, reps: "10-15", weightHint: "bodyweight" },
  mountainclimber: { name: "Mountain Climbers", sets: 3, reps: "30 sec", weightHint: "bodyweight" },
  run: { name: "Easy Run", sets: 1, reps: "20-30 min", weightHint: "n/a" },
  intervalrun: { name: "Interval Sprints", sets: 8, reps: "30 sec on/90 sec off", weightHint: "n/a" },
  row_machine: { name: "Rowing Machine", sets: 1, reps: "15-20 min", weightHint: "n/a" },
  bike: { name: "Stationary Bike", sets: 1, reps: "20-30 min", weightHint: "n/a" },
};
const WARMUP_OPTIONS = ["5 min brisk walk or light cardio", "Arm circles + leg swings, 1 min each", "Bodyweight squats x10, glute bridges x10", "Dynamic stretching: lunges, high knees, 3 min"];
const COOLDOWN_OPTIONS = ["5 min easy walk to bring heart rate down", "Static stretch: hamstrings, quads, chest, 1 min each", "Foam roll major muscle groups, 5 min", "Deep breathing + full body stretch, 5 min"];

const WORKOUT_TEMPLATES = {
  general: {
    gym: [["squat", "bench", "row", "plank"], ["run", "ohp", "pullup", "plank"], ["legpress", "bandpress", "lunge", "plank"], ["deadlift", "pushup", "row_machine", "plank"]],
    home: [["bodysquat", "pushup", "bandrow", "plank"], ["jumprope", "lunge", "bandpress", "mountainclimber"], ["burpee", "bodysquat", "bandrow", "plank"], ["run", "pushup", "lunge", "plank"]],
    minimal: [["bodysquat", "pushup", "plank", "mountainclimber"], ["run", "lunge", "pushup", "plank"], ["burpee", "bodysquat", "plank", "mountainclimber"], ["run", "pushup", "lunge", "plank"]],
  },
  strength: {
    gym: [["squat", "legpress", "lunge", "plank"], ["bench", "ohp", "pushup", "plank"], ["row", "pullup", "bandrow", "plank"], ["deadlift", "legpress", "lunge", "plank"]],
    home: [["bodysquat", "lunge", "pushup", "plank"], ["pushup", "bandpress", "pushup", "plank"], ["bandrow", "pullup", "bandrow", "plank"], ["bodysquat", "lunge", "plank", "mountainclimber"]],
    minimal: [["bodysquat", "lunge", "pushup", "plank"], ["pushup", "pushup", "plank", "mountainclimber"], ["lunge", "bodysquat", "plank", "pushup"], ["bodysquat", "lunge", "pushup", "plank"]],
  },
  fatloss: {
    gym: [["squat", "row_machine", "burpee", "plank"], ["intervalrun", "bandpress", "lunge", "mountainclimber"], ["legpress", "row", "burpee", "plank"], ["run", "bike", "plank", "mountainclimber"]],
    home: [["burpee", "bodysquat", "jumprope", "plank"], ["jumprope", "lunge", "pushup", "mountainclimber"], ["burpee", "bandrow", "jumprope", "plank"], ["run", "bodysquat", "mountainclimber", "plank"]],
    minimal: [["burpee", "bodysquat", "mountainclimber", "plank"], ["run", "lunge", "pushup", "plank"], ["intervalrun", "bodysquat", "plank", "mountainclimber"], ["run", "burpee", "lunge", "plank"]],
  },
  endurance: {
    gym: [["run", "squat", "plank"], ["intervalrun", "row_machine", "plank"], ["bike", "lunge", "plank"], ["row_machine", "run", "plank"]],
    home: [["run", "bodysquat", "plank"], ["intervalrun", "lunge", "plank"], ["run", "pushup", "plank"], ["jumprope", "run", "plank"]],
    minimal: [["run", "bodysquat", "plank"], ["intervalrun", "lunge", "plank"], ["run", "pushup", "plank"], ["run", "mountainclimber", "plank"]],
  },
};

function buildWorkout(goal, equipment, dayIndex) {
  const templates = (WORKOUT_TEMPLATES[goal] && WORKOUT_TEMPLATES[goal][equipment]) || WORKOUT_TEMPLATES.general.gym;
  const exerciseKeys = templates[dayIndex % templates.length];
  const main = exerciseKeys.map((key, i) => {
    const ex = EXERCISE_DB[key] || EXERCISE_DB.bodysquat;
    return { id: uid(), name: ex.name, sets: ex.sets, reps: ex.reps, weight: ex.weightHint, completed: false };
  });
  return {
    id: uid(),
    warmup: WARMUP_OPTIONS[dayIndex % WARMUP_OPTIONS.length],
    main,
    cooldown: COOLDOWN_OPTIONS[dayIndex % COOLDOWN_OPTIONS.length],
    estimatedMinutes: 60,
  };
}

const MEAL_LIBRARY = {
  general: { breakfast: ["Greek yogurt, berries, granola", "Veggie egg scramble + toast", "Oatmeal with peanut butter and banana"],
    lunch: ["Grilled chicken bowl with rice and veggies", "Turkey and avocado wrap with side salad", "Lentil soup with whole grain bread"],
    dinner: ["Baked salmon, sweet potato, broccoli", "Stir-fry chicken with mixed vegetables and rice", "Lean beef chili with beans"],
    snack: ["Apple with almond butter", "Cottage cheese with pineapple", "Protein shake"] },
  fatloss: { breakfast: ["Egg white scramble with spinach", "Protein smoothie (berries, spinach, protein powder)", "Greek yogurt with chia seeds"],
    lunch: ["Grilled chicken salad, light dressing", "Tuna salad lettuce wraps", "Turkey chili, small portion"],
    dinner: ["Grilled fish, large salad, olive oil", "Chicken stir-fry, extra vegetables, light rice", "Zucchini noodles with lean turkey meatballs"],
    snack: ["Cucumber slices with hummus", "Hard boiled eggs", "Handful of almonds"] },
  strength: { breakfast: ["3-4 whole eggs, oats, fruit", "Protein pancakes with berries", "Cottage cheese, toast, peanut butter"],
    lunch: ["Large chicken and rice bowl", "Steak, sweet potato, vegetables", "Salmon, quinoa, avocado"],
    dinner: ["Ground beef pasta with side salad", "Grilled chicken thighs, rice, broccoli", "Pork tenderloin, potatoes, green beans"],
    snack: ["Protein shake + banana", "Trail mix", "Greek yogurt with granola"] },
  endurance: { breakfast: ["Oatmeal with banana and honey", "Bagel with peanut butter", "Smoothie with oats, fruit, yogurt"],
    lunch: ["Pasta with chicken and vegetables", "Rice bowl with beans and grilled veg", "Turkey sandwich, fruit side"],
    dinner: ["Whole grain pasta, lean protein, vegetables", "Quinoa bowl with chicken and roasted veg", "Stir-fry noodles with shrimp"],
    snack: ["Banana with almond butter", "Energy balls (oats, dates, nut butter)", "Chocolate milk or recovery shake"] },
};
const GROCERY_BY_GOAL = {
  general: ["Chicken breast", "Eggs", "Greek yogurt", "Mixed vegetables", "Brown rice", "Olive oil", "Mixed berries", "Oats", "Whole grain bread", "Almonds"],
  fatloss: ["Egg whites", "Chicken breast", "Leafy greens", "Cucumber", "Cottage cheese", "Tuna", "Berries", "Almonds (small portions)", "Zucchini", "Hummus"],
  strength: ["Eggs", "Chicken thighs", "Ground beef (lean)", "Salmon", "Sweet potatoes", "Rice", "Oats", "Peanut butter", "Greek yogurt", "Whole milk"],
  endurance: ["Oats", "Bananas", "Pasta (whole grain)", "Chicken breast", "Rice", "Honey", "Dates", "Sports drink / electrolytes", "Bread", "Eggs"],
};

function emptyData() {
  return { settings: DEFAULT_SETTINGS, tasks: [], goals: [], habits: [], events: [], blocks: {}, dailyLogs: {}, completedLog: [], workoutLog: [], theme: "light" };
}

function priorityColor(p) { return p === "high" ? "coral" : p === "medium" ? "amber" : "gray"; }
function statusColor(s) { return s === "done" ? "green" : s === "in_progress" ? "indigo" : s === "blocked" ? "coral" : "gray"; }
function categoryColor(c) { return c === "work" ? "indigo" : c === "fitness" ? "teal" : c === "personal" ? "coral" : "gray"; }

// Urgency: how hot a task/block should look today
function urgencyColor(item, dateStr) {
  if (item.status === "done") return "green";
  if (!item.dueDate) return "gray";
  if (item.dueDate < dateStr) return "coral"; // overdue
  if (item.dueDate === dateStr && item.priority === "high") return "coral";
  if (item.dueDate === dateStr) return "amber";
  const daysOut = Math.round((new Date(item.dueDate) - new Date(dateStr)) / 86400000);
  if (daysOut <= 2 && item.priority !== "low") return "amber";
  return "teal";
}

// ---------- Auto-scheduler: guarantees no overlaps ----------
function autoScheduleDay(dateStr, state) {
  const { settings, tasks, events, habits, blocks } = state;
  const dayStart = timeToMinutes(settings.wakeTime), dayEnd = timeToMinutes(settings.bedTime);
  const workStart = timeToMinutes(settings.workStart), workEnd = timeToMinutes(settings.workEnd);
  const fixed = [];
  events.filter(e => e.date === dateStr).forEach(e => fixed.push({ id: e.id, type: "event", title: e.title, start: timeToMinutes(e.start), end: timeToMinutes(e.end), category: e.category || "work", locked: true }));
  const dow = new Date(dateStr + "T00:00:00").getDay();
  habits.filter(h2 => h2.active && (h2.frequency === "daily" || (h2.frequency === "weekly" && h2.days.includes(dow)))).forEach(h2 => {
    fixed.push({ id: "habit-" + h2.id, type: "habit", title: h2.name, duration: h2.duration || 20, category: h2.category || "personal", partOfDay: h2.partOfDay || "morning", habitId: h2.id, locked: false });
  });
  const dueTasks = tasks.filter(t => t.status !== "done" && t.dueDate >= dateStr).sort((a, b) => {
    const prioRank = { high: 0, medium: 1, low: 2 };
    if (a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    return prioRank[a.priority] - prioRank[b.priority];
  });
  const manualBlocksToday = (blocks[dateStr] || []).filter(b => b.manual);
  const occupied = [...fixed.map(f => ({ start: f.start, end: f.end })), ...manualBlocksToday.map(b => ({ start: b.start, end: b.end }))];

  function overlaps(start, end) { return occupied.some(o => start < o.end && end > o.start); }
  function findSlot(duration, rangeStart, rangeEnd) {
    const sorted = [...occupied].sort((a, b) => a.start - b.start);
    let cursor = rangeStart;
    for (const slot of sorted) {
      if (slot.start - cursor >= duration && cursor >= rangeStart && !overlaps(cursor, cursor + duration)) return cursor;
      cursor = Math.max(cursor, slot.end);
    }
    if (rangeEnd - cursor >= duration && !overlaps(cursor, cursor + duration)) return cursor;
    return null;
  }
  const scheduled = [...manualBlocksToday];
  fixed.filter(f => f.type === "event").forEach(f => scheduled.push({ ...f, manual: false }));
  fixed.filter(f => f.type === "habit").forEach(hb => {
    const [rs, re] = PART_OF_DAY_RANGES[hb.partOfDay] || [dayStart, dayEnd];
    const rangeStart = Math.max(rs, dayStart), rangeEnd = Math.min(re, dayEnd);
    const start = findSlot(hb.duration, rangeStart, rangeEnd) ?? findSlot(hb.duration, dayStart, dayEnd);
    if (start !== null) {
      const block = { id: hb.id, type: "habit", title: hb.title, start, end: start + hb.duration, category: hb.category, manual: false, habitId: hb.habitId };
      occupied.push({ start: block.start, end: block.end }); scheduled.push(block);
    }
  });
  const tasksToPlace = dueTasks.filter(t => !manualBlocksToday.some(b => b.taskId === t.id) && !scheduled.some(b => b.taskId === t.id));
  tasksToPlace.forEach(t => {
    const duration = t.estimatedMinutes || 30; const category = t.category;
    let rangeStart, rangeEnd;
    if (category === "work") { rangeStart = workStart; rangeEnd = workEnd; }
    else { const pod = t.partOfDay || "midday"; const [rs, re] = PART_OF_DAY_RANGES[pod]; rangeStart = Math.max(rs, dayStart); rangeEnd = Math.min(re, dayEnd); }
    let start = findSlot(duration, rangeStart, rangeEnd);
    if (start === null && category !== "work") start = findSlot(duration, dayStart, dayEnd);
    if (start !== null) {
      const block = { id: "task-" + t.id, taskId: t.id, type: "task", title: t.title, start, end: start + duration, category, priority: t.priority, dueDate: t.dueDate, status: t.status, manual: false };
      occupied.push({ start: block.start, end: block.end }); scheduled.push(block);
    }
  });
  return scheduled.sort((a, b) => a.start - b.start);
}

function generateCoachInsights(state, dateStr) {
  const insights = []; const { tasks, goals, habits, completedLog } = state;
  const overdue = tasks.filter(t => t.status !== "done" && t.dueDate < dateStr);
  if (overdue.length > 0) insights.push({ type: "warning", text: `You have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}: ${overdue.slice(0, 3).map(t => t.title).join(", ")}${overdue.length > 3 ? "…" : ""}. Either knock these out today or push the due date.` });
  goals.filter(g => g.progress < 100).forEach(g => {
    const linkedHabits = habits.filter(h2 => h2.goalId === g.id && h2.active);
    const linkedTasks = tasks.filter(t => t.goalId === g.id && t.status !== "done");
    if (linkedHabits.length === 0 && linkedTasks.length === 0) insights.push({ type: "warning", text: `"${g.title}" has no active habits or tasks tied to it. A goal without weekly action attached usually stalls.` });
    const daysLeft = Math.round((new Date(g.targetDate) - new Date(dateStr)) / 86400000);
    if (daysLeft > 0 && daysLeft < 30 && g.progress < 70) insights.push({ type: "warning", text: `"${g.title}" is due in ${daysLeft} days but sits at ${g.progress}% progress.` });
  });
  const last7 = []; for (let i = 1; i <= 7; i++) last7.push(addDays(dateStr, -i));
  habits.filter(h2 => h2.active).forEach(h2 => {
    const applicable = last7.filter(d => { const dow = new Date(d + "T00:00:00").getDay(); return h2.frequency === "daily" || (h2.frequency === "weekly" && h2.days.includes(dow)); });
    const completed = applicable.filter(d => completedLog.some(c => c.habitId === h2.id && c.date === d));
    if (applicable.length >= 3 && completed.length / applicable.length < 0.5) insights.push({ type: "warning", text: `"${h2.name}" has only landed ${completed.length}/${applicable.length} days this past week. Try an earlier slot or shorter duration.` });
  });
  if (overdue.length === 0 && insights.length === 0) insights.push({ type: "good", text: "Nothing overdue, and your goals all have active habits or tasks behind them. Solid footing." });
  return insights.slice(0, 6);
}

function Icon({ name }) {
  const map = {
    today: "☀️", calendar: "📅", tasks: "✅", goals: "🎯", habits: "🔁", fitness: "💪", coach: "💡",
    settings: "⚙️", plus: "+", edit: "✎", trash: "🗑", check: "✓", left: "‹", right: "›",
    sun: "☀️", moon: "🌙", warn: "⚠️", good: "✓", logout: "↪", month: "🗓", week: "📆", day: "☀️",
  };
  return <span style={{ fontStyle: "normal" }}>{map[name] || ""}</span>;
}
function Tag({ children, color = "gray" }) { return <span className={`tag tag-${color}`}>{children}</span>; }
function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal" + (wide ? " wide" : "")}>
        <div className="modal-header"><h3>{title}</h3><button className="btn-ghost" onClick={onClose} style={{ fontSize: 18 }}>✕</button></div>
        {children}
      </div>
    </div>
  );
}
function Field({ label, children }) { return <div className="field"><label>{label}</label>{children}</div>; }

function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState("");
  const submit = async (e) => {
    e.preventDefault(); setError(""); setConfirmMsg(""); setLoading(true);
    try {
      if (mode === "login") { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (error) throw error; }
      else { const { error } = await supabase.auth.signUp({ email, password }); if (error) throw error; setConfirmMsg("Account created — you're in, or check your email if confirmation is required."); }
    } catch (err) { setError(err.message || "Something went wrong."); } finally { setLoading(false); }
  };
  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">L</div>
        <h1 className="auth-title">Life OS</h1>
        <p className="auth-subtitle">{mode === "login" ? "Log in to pick up right where you left off." : "Create your account to get started."}</p>
        {error && <div className="auth-error">{error}</div>}
        {confirmMsg && <div className="auth-error" style={{ background: "var(--green-soft)", color: "var(--green-text)" }}>{confirmMsg}</div>}
        <form onSubmit={submit}>
          <Field label="Email"><input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" /></Field>
          <Field label="Password"><input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} /></Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>{loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
        </form>
        <div className="auth-toggle">
          {mode === "login" ? <>Don't have an account? <button onClick={() => { setMode("signup"); setError(""); }}>Sign up</button></> : <>Already have an account? <button onClick={() => { setMode("login"); setError(""); }}>Log in</button></>}
        </div>
      </div>
    </div>
  );
}

function OnboardingModal({ settings, onSave, onClose }) {
  const [s, setS] = useState(settings);
  return (
    <Modal title="Update your day" onClose={onClose} wide>
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", marginTop: -6, marginBottom: 18, lineHeight: 1.5 }}>
        Change these anytime — these boundaries drive the auto-scheduler, and updating them re-optimizes your whole calendar.
      </p>
      <div className="field-row">
        <Field label="Wake time"><input type="time" value={s.wakeTime} onChange={e => setS({ ...s, wakeTime: e.target.value })} /></Field>
        <Field label="Bed time"><input type="time" value={s.bedTime} onChange={e => setS({ ...s, bedTime: e.target.value })} /></Field>
        <Field label="Work start"><input type="time" value={s.workStart} onChange={e => setS({ ...s, workStart: e.target.value })} /></Field>
        <Field label="Work end"><input type="time" value={s.workEnd} onChange={e => setS({ ...s, workEnd: e.target.value })} /></Field>
      </div>
      <Field label="Fitness goal">
        <select value={s.fitnessGoal} onChange={e => setS({ ...s, fitnessGoal: e.target.value })}>
          <option value="general">General fitness</option><option value="strength">Build strength/muscle</option><option value="fatloss">Fat loss</option><option value="endurance">Endurance</option>
        </select>
      </Field>
      <div className="field-row">
        <Field label="Workouts per week"><input type="number" min="0" max="7" value={s.fitnessFrequency} onChange={e => setS({ ...s, fitnessFrequency: Number(e.target.value) })} /></Field>
        <Field label="Equipment available">
          <select value={s.equipment} onChange={e => setS({ ...s, equipment: e.target.value })}>
            <option value="gym">Full gym</option><option value="home">Home equipment</option><option value="minimal">Minimal / bodyweight</option>
          </select>
        </Field>
      </div>
      <button className="btn btn-primary btn-block" onClick={() => onSave({ ...s, onboarded: true })}>Save changes</button>
    </Modal>
  );
}

function EventModal({ event, onSave, onClose, defaultDate }) {
  const [e, setE] = useState(event || { id: uid(), title: "", date: defaultDate || todayStr(), start: "09:00", end: "10:00", category: "work" });
  return (
    <Modal title={event ? "Edit event" : "New meeting / appointment"} onClose={onClose}>
      <Field label="Title"><input value={e.title} onChange={ev => setE({ ...e, title: ev.target.value })} placeholder="e.g. Team standup" /></Field>
      <Field label="Date"><input type="date" value={e.date} onChange={ev => setE({ ...e, date: ev.target.value })} /></Field>
      <div className="field-row">
        <Field label="Start"><input type="time" value={e.start} onChange={ev => setE({ ...e, start: ev.target.value })} /></Field>
        <Field label="End"><input type="time" value={e.end} onChange={ev => setE({ ...e, end: ev.target.value })} /></Field>
      </div>
      <Field label="Category">
        <select value={e.category} onChange={ev => setE({ ...e, category: ev.target.value })}><option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option></select>
      </Field>
      <button className="btn btn-primary btn-block" onClick={() => { if (e.title.trim()) onSave(e); }}>Save event</button>
    </Modal>
  );
}

function HabitModal({ habit, onSave, onClose, goals }) {
  const [hb, setHb] = useState(habit || { id: uid(), name: "", category: "personal", frequency: "daily", days: [1, 2, 3, 4, 5], duration: 20, partOfDay: "morning", active: true, goalId: "" });
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const toggleDay = (d) => setHb({ ...hb, days: hb.days.includes(d) ? hb.days.filter(x => x !== d) : [...hb.days, d].sort() });
  return (
    <Modal title={habit ? "Edit habit" : "New habit"} onClose={onClose}>
      <Field label="Habit name"><input value={hb.name} onChange={e => setHb({ ...hb, name: e.target.value })} placeholder="e.g. Morning meditation" /></Field>
      <div className="field-row">
        <Field label="Category"><select value={hb.category} onChange={e => setHb({ ...hb, category: e.target.value })}><option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option></select></Field>
        <Field label="Duration (min)"><input type="number" min="5" step="5" value={hb.duration} onChange={e => setHb({ ...hb, duration: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Frequency"><select value={hb.frequency} onChange={e => setHb({ ...hb, frequency: e.target.value })}><option value="daily">Every day</option><option value="weekly">Specific days</option></select></Field>
      {hb.frequency === "weekly" && <Field label="Days"><div className="day-pill-row">{dayNames.map((d, i) => <button key={i} className={"day-pill" + (hb.days.includes(i) ? " active" : "")} onClick={() => toggleDay(i)}>{d}</button>)}</div></Field>}
      <Field label="Preferred part of day"><select value={hb.partOfDay} onChange={e => setHb({ ...hb, partOfDay: e.target.value })}><option value="morning">Morning</option><option value="midday">Midday</option><option value="night">Night</option></select></Field>
      {goals && goals.length > 0 && <Field label="Linked goal (optional)"><select value={hb.goalId || ""} onChange={e => setHb({ ...hb, goalId: e.target.value })}><option value="">None</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}</select></Field>}
      <button className="btn btn-primary btn-block" onClick={() => { if (hb.name.trim()) onSave(hb); }}>Save habit</button>
    </Modal>
  );
}

function StatCard({ label, value, color }) {
  const bg = { indigo: "var(--indigo-soft)", teal: "var(--teal-soft)", coral: "var(--coral-soft)", amber: "var(--amber-soft)", green: "var(--green-soft)" }[color] || "var(--bg-soft)";
  const tx = { indigo: "var(--indigo-text)", teal: "var(--teal-text)", coral: "var(--coral-text)", amber: "var(--amber-text)", green: "var(--green-text)" }[color] || "var(--text)";
  return <div className="stat-card" style={{ background: bg, color: tx }}><p className="stat-label">{label}</p><p className="stat-value">{value}</p></div>;
}

function ScheduleBlock({ block, dateStr, onEdit, onStatusChange, onDelete }) {
  const c = block.type === "task" ? urgencyColor(block, dateStr) : categoryColor(block.category);
  const stripeColor = { indigo: "var(--indigo)", teal: "var(--teal)", coral: "var(--coral)", amber: "var(--amber)", green: "var(--green)", gray: "var(--border-strong)" }[c];
  return (
    <div className="block-row">
      <div className="block-stripe" style={{ background: stripeColor }} />
      <div className="block-time">{minutesToTime(block.start)} – {minutesToTime(block.end)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="block-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.title}</p>
        <div className="block-tags">
          <Tag color={categoryColor(block.category)}>{block.category}</Tag>
          {block.type === "task" && <Tag color={c}>{c === "coral" ? "urgent" : c === "amber" ? "soon" : "on track"}</Tag>}
          {block.locked && <Tag>fixed</Tag>}
        </div>
      </div>
      <div className="row-actions">
        {block.taskId && <button className="btn-ghost" title="Mark done" onClick={() => onStatusChange(block.taskId)}><Icon name="check" /></button>}
        <button className="btn-ghost" title="Edit" onClick={() => onEdit(block)}><Icon name="edit" /></button>
        <button className="btn-ghost" title="Remove" onClick={() => onDelete(block)}><Icon name="trash" /></button>
      </div>
    </div>
  );
}

// ---------- Day timeline (hour-by-hour) ----------
function DayTimeline({ blocks, dateStr, settings, onEdit, onStatusChange, onDelete }) {
  const startHour = Math.floor(timeToMinutes(settings.wakeTime) / 60);
  const endHour = Math.ceil(timeToMinutes(settings.bedTime) / 60);
  const pxPerMin = 1.1;
  const hours = []; for (let h = startHour; h <= endHour; h++) hours.push(h);
  const totalHeight = (endHour - startHour) * 60 * pxPerMin;
  return (
    <div style={{ display: "flex", gap: 0, position: "relative", marginBottom: 24 }}>
      <div style={{ width: 56, flexShrink: 0 }}>
        {hours.map(h => (
          <div key={h} style={{ height: 60 * pxPerMin, fontSize: 11.5, color: "var(--text-tertiary)", borderTop: "1px solid var(--border)", paddingTop: 2 }}>
            {minutesToTime(h * 60)}
          </div>
        ))}
      </div>
      <div style={{ flex: 1, position: "relative", borderLeft: "1px solid var(--border)" }}>
        {hours.map(h => <div key={h} style={{ height: 60 * pxPerMin, borderTop: "1px solid var(--border)" }} />)}
        {blocks.map((b, i) => {
          const top = (b.start - startHour * 60) * pxPerMin;
          const height = Math.max((b.end - b.start) * pxPerMin, 26);
          const c = b.type === "task" ? urgencyColor(b, dateStr) : categoryColor(b.category);
          const bg = { indigo: "var(--indigo-soft)", teal: "var(--teal-soft)", coral: "var(--coral-soft)", amber: "var(--amber-soft)", green: "var(--green-soft)", gray: "var(--bg-soft)" }[c];
          const tx = { indigo: "var(--indigo-text)", teal: "var(--teal-text)", coral: "var(--coral-text)", amber: "var(--amber-text)", green: "var(--green-text)", gray: "var(--text-secondary)" }[c];
          const border = { indigo: "var(--indigo)", teal: "var(--teal)", coral: "var(--coral)", amber: "var(--amber)", green: "var(--green)", gray: "var(--border-strong)" }[c];
          return (
            <div key={b.id + i} onClick={() => onEdit(b)} style={{
              position: "absolute", top, height, left: 6, right: 6, background: bg, color: tx,
              borderLeft: `3px solid ${border}`, borderRadius: 6, padding: "4px 8px", overflow: "hidden", cursor: "pointer", fontSize: 12.5,
            }}>
              <div style={{ fontWeight: 700, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{b.title}</div>
              {height > 32 && <div style={{ fontSize: 11, opacity: 0.85 }}>{minutesToTime(b.start)}–{minutesToTime(b.end)}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({ weekStart, data, onSelectDay, selectedDate }) {
  const days = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
      {days.map(d => {
        const dayBlocks = autoScheduleDay(d, data);
        const isToday = d === todayStr();
        const isSelected = d === selectedDate;
        return (
          <div key={d} onClick={() => onSelectDay(d)} style={{
            border: isSelected ? "2px solid var(--indigo)" : "1px solid var(--border)", borderRadius: "var(--radius-md)",
            padding: "10px 8px", cursor: "pointer", minHeight: 140, background: isToday ? "var(--indigo-soft)" : "var(--bg-card)",
          }}>
            <p style={{ fontSize: 11.5, fontWeight: 800, margin: "0 0 6px", color: isToday ? "var(--indigo-text)" : "var(--text-secondary)" }}>{fmtDateShort(d)}</p>
            {dayBlocks.slice(0, 4).map((b, i) => {
              const c = b.type === "task" ? urgencyColor(b, d) : categoryColor(b.category);
              return <div key={i} style={{ fontSize: 10.5, padding: "2px 5px", marginBottom: 3, borderRadius: 4, background: `var(--${c}-soft)`, color: `var(--${c}-text)`, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.title}</div>;
            })}
            {dayBlocks.length > 4 && <p style={{ fontSize: 10, color: "var(--text-tertiary)", margin: 0 }}>+{dayBlocks.length - 4} more</p>}
          </div>
        );
      })}
    </div>
  );
}

function MonthView({ monthAnchor, data, onSelectDay, selectedDate }) {
  const first = startOfMonth(monthAnchor);
  const numDays = daysInMonth(monthAnchor);
  const firstDow = new Date(first + "T00:00:00").getDay();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= numDays; d++) cells.push(addDays(first, d - 1));
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 6 }}>
        {dayNames.map(d => <div key={d} style={{ fontSize: 11.5, fontWeight: 800, color: "var(--text-tertiary)", textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dayBlocks = autoScheduleDay(d, data);
          const urgent = dayBlocks.filter(b => b.type === "task" && urgencyColor(b, d) === "coral").length;
          const soon = dayBlocks.filter(b => b.type === "task" && urgencyColor(b, d) === "amber").length;
          const isToday = d === todayStr();
          const isSelected = d === selectedDate;
          return (
            <div key={d} onClick={() => onSelectDay(d)} style={{
              border: isSelected ? "2px solid var(--indigo)" : "1px solid var(--border)", borderRadius: "var(--radius-sm)",
              padding: "6px 6px", minHeight: 64, cursor: "pointer", background: isToday ? "var(--indigo-soft)" : "var(--bg-card)",
            }}>
              <p style={{ fontSize: 12, fontWeight: 800, margin: "0 0 4px", color: isToday ? "var(--indigo-text)" : "var(--text)" }}>{Number(d.slice(-2))}</p>
              <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                {urgent > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--coral)" }} />}
                {soon > 0 && <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--amber)" }} />}
                {dayBlocks.length > 0 && <span style={{ fontSize: 9.5, color: "var(--text-tertiary)" }}>{dayBlocks.length}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Monday.com-style inline-editable task table ----------
function EditableCell({ value, type, options, onChange, dueDateColor }) {
  const [editing, setEditing] = useState(false);
  if (type === "select") {
    return (
      <select value={value} onChange={e => onChange(e.target.value)} style={{ border: "none", background: "transparent", padding: "4px 6px", fontWeight: 700, fontSize: 12.5, cursor: "pointer" }} className={`cell-select cell-${value}`}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  if (type === "date") {
    return <input type="date" value={value} onChange={e => onChange(e.target.value)} style={{ border: "none", background: "transparent", padding: "4px 6px", fontSize: 12.5, fontWeight: 600, color: dueDateColor }} />;
  }
  if (type === "number") {
    return <input type="number" min="5" step="5" value={value} onChange={e => onChange(Number(e.target.value))} style={{ border: "none", background: "transparent", padding: "4px 6px", fontSize: 12.5, width: 60 }} />;
  }
  // text
  if (editing) {
    return <input autoFocus defaultValue={value} onBlur={e => { onChange(e.target.value); setEditing(false); }} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={{ border: "1.5px solid var(--indigo)", padding: "4px 6px", fontSize: 13.5, fontWeight: 600, width: "100%" }} />;
  }
  return <div onClick={() => setEditing(true)} style={{ padding: "4px 6px", fontSize: 13.5, fontWeight: 600, cursor: "text", minHeight: 22 }}>{value}</div>;
}

function TaskTable({ tasks, goals, onUpdate, onDelete, dateStr }) {
  const statusOptions = [{ value: "not_started", label: "Not started" }, { value: "in_progress", label: "In progress" }, { value: "blocked", label: "Blocked" }, { value: "done", label: "Done" }];
  const priorityOptions = [{ value: "high", label: "High" }, { value: "medium", label: "Medium" }, { value: "low", label: "Low" }];
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="monday-table">
        <thead>
          <tr>
            <th style={{ minWidth: 220 }}>Task</th><th>Status</th><th>Priority</th><th>Due date</th><th>Est. min</th><th>Goal</th><th></th>
          </tr>
        </thead>
        <tbody>
          {tasks.map(t => {
            const dueColor = urgencyColor(t, dateStr);
            const dueColorVar = { coral: "var(--coral-text)", amber: "var(--amber-text)", teal: "var(--teal-text)", green: "var(--green-text)", gray: "var(--text)" }[dueColor];
            return (
              <tr key={t.id}>
                <td><EditableCell value={t.title} type="text" onChange={v => onUpdate({ ...t, title: v })} /></td>
                <td><span className={`status-pill status-${statusColor(t.status)}`}><EditableCell value={t.status} type="select" options={statusOptions} onChange={v => onUpdate({ ...t, status: v })} /></span></td>
                <td><span className={`status-pill status-${priorityColor(t.priority)}`}><EditableCell value={t.priority} type="select" options={priorityOptions} onChange={v => onUpdate({ ...t, priority: v })} /></span></td>
                <td><EditableCell value={t.dueDate} type="date" onChange={v => onUpdate({ ...t, dueDate: v })} dueDateColor={dueColorVar} /></td>
                <td><EditableCell value={t.estimatedMinutes} type="number" onChange={v => onUpdate({ ...t, estimatedMinutes: v })} /></td>
                <td>
                  <select value={t.goalId || ""} onChange={e => onUpdate({ ...t, goalId: e.target.value })} style={{ border: "none", background: "transparent", fontSize: 12.5, padding: "4px 6px" }}>
                    <option value="">—</option>{goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
                  </select>
                </td>
                <td><button className="btn-ghost" onClick={() => onDelete(t.id)}><Icon name="trash" /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GoalCard({ g, tasks, habits, onUpdate, onDelete }) {
  const [note, setNote] = useState(g.lastNote || "");
  const linkedTasks = tasks.filter(t => t.goalId === g.id);
  const doneLinked = linkedTasks.filter(t => t.status === "done").length;
  const linkedHabits = habits.filter(h => h.goalId === g.id && h.active);
  return (
    <div className="card">
      <div className="goal-card-progress">
        <div style={{ flex: 1 }}>
          <EditableCell value={g.title} type="text" onChange={v => onUpdate({ ...g, title: v })} />
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
            <span className="goal-target">Target:</span>
            <input type="date" value={g.targetDate} onChange={e => onUpdate({ ...g, targetDate: e.target.value })} style={{ border: "none", background: "transparent", fontSize: 12.5, fontWeight: 600, color: "var(--text-secondary)", padding: 0, width: "auto" }} />
          </div>
        </div>
        <button className="btn-ghost" onClick={() => onDelete(g.id)}><Icon name="trash" /></button>
      </div>
      {g.description && <p className="goal-desc">{g.description}</p>}
      <div className="progress-track"><div className="progress-fill" style={{ width: `${g.progress}%`, background: "linear-gradient(90deg, var(--indigo), var(--teal))" }} /></div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <input type="range" min="0" max="100" step="5" value={g.progress} onChange={e => onUpdate({ ...g, progress: Number(e.target.value) })} style={{ flex: 1 }} />
        <span style={{ fontSize: 13, fontWeight: 800, minWidth: 40, color: "var(--indigo-text)" }}>{g.progress}%</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
        <Tag color="indigo">{doneLinked}/{linkedTasks.length} tasks done</Tag>
        <Tag color="teal">{linkedHabits.length} active habits</Tag>
      </div>
      <textarea
        placeholder="Quick daily update — how's this going?"
        value={note}
        onChange={e => setNote(e.target.value)}
        onBlur={() => onUpdate({ ...g, lastNote: note, noteUpdatedAt: todayStr() })}
        style={{ marginTop: 10, minHeight: 50, fontSize: 13 }}
      />
    </div>
  );
}

function WorkoutCard({ workout, onUpdateExercise, onComplete, dayLabel }) {
  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <Tag color="teal">{dayLabel}</Tag>
        <Tag>~{workout.estimatedMinutes} min</Tag>
      </div>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--amber-text)", margin: "4px 0" }}>WARM-UP</p>
      <p style={{ fontSize: 13.5, margin: "0 0 12px" }}>{workout.warmup}</p>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--indigo-text)", margin: "4px 0" }}>MAIN</p>
      <table className="workout-table">
        <thead><tr><th>Exercise</th><th>Sets</th><th>Reps</th><th>Weight</th><th></th></tr></thead>
        <tbody>
          {workout.main.map(ex => (
            <tr key={ex.id} style={{ opacity: ex.completed ? 0.55 : 1 }}>
              <td><EditableCell value={ex.name} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, name: v })} /></td>
              <td><EditableCell value={ex.sets} type="number" onChange={v => onUpdateExercise(ex.id, { ...ex, sets: v })} /></td>
              <td><EditableCell value={ex.reps} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, reps: v })} /></td>
              <td><EditableCell value={ex.weight} type="text" onChange={v => onUpdateExercise(ex.id, { ...ex, weight: v })} /></td>
              <td><input type="checkbox" checked={ex.completed} onChange={() => onUpdateExercise(ex.id, { ...ex, completed: !ex.completed })} style={{ width: 18, height: 18, accentColor: "var(--teal)" }} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12.5, fontWeight: 800, color: "var(--green-text)", margin: "12px 0 4px" }}>COOL-DOWN</p>
      <p style={{ fontSize: 13.5, margin: "0 0 14px" }}>{workout.cooldown}</p>
      <button className="btn btn-primary btn-sm" onClick={onComplete}><Icon name="check" /> Log as completed</button>
    </div>
  );
}

function FitnessTab({ state, onUpdate }) {
  const { settings, workoutLog } = state;
  const goalLabel = settings.fitnessGoal === "fatloss" ? "Fat loss" : settings.fitnessGoal === "strength" ? "Strength" : settings.fitnessGoal === "endurance" ? "Endurance" : "General fitness";
  const meals = MEAL_LIBRARY[settings.fitnessGoal] || MEAL_LIBRARY.general;
  const groceries = GROCERY_BY_GOAL[settings.fitnessGoal] || GROCERY_BY_GOAL.general;
  const [plan, setPlan] = useState(() => Array.from({ length: settings.fitnessFrequency }).map((_, i) => buildWorkout(settings.fitnessGoal, settings.equipment, i)));
  useEffect(() => { setPlan(Array.from({ length: settings.fitnessFrequency }).map((_, i) => buildWorkout(settings.fitnessGoal, settings.equipment, i))); }, [settings.fitnessGoal, settings.equipment, settings.fitnessFrequency]);

  const updateExercise = (workoutIdx, exId, updated) => {
    setPlan(plan.map((w, i) => i === workoutIdx ? { ...w, main: w.main.map(ex => ex.id === exId ? updated : ex) } : w));
  };
  const completeWorkout = (workoutIdx) => {
    const w = plan[workoutIdx];
    onUpdate({ workoutLog: [...workoutLog, { id: uid(), date: todayStr(), dayLabel: `Day ${workoutIdx + 1}`, exercises: w.main, completedAt: new Date().toISOString() }] });
  };

  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <StatCard label="Weekly workout target" value={`${settings.fitnessFrequency}x / week`} color="teal" />
        <StatCard label="Goal" value={goalLabel} color="coral" />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>This week's training plan</h3>
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 14 }}>
        Each session targets ~60 minutes: warm-up, main work, cool-down. Every field is editable — adjust sets, reps, or weight to match how you're actually feeling.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14, marginBottom: 10 }}>
        {plan.map((w, i) => (
          <WorkoutCard key={w.id} workout={w} dayLabel={`Day ${i + 1}`} onUpdateExercise={(exId, updated) => updateExercise(i, exId, updated)} onComplete={() => completeWorkout(i)} />
        ))}
      </div>
      <p className="disclaimer">General guidelines, not personalized coaching — check with a doctor or certified trainer before starting a new program, especially with injuries or medical conditions.</p>

      {workoutLog.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Completed workout history</h3>
          {workoutLog.slice().reverse().slice(0, 10).map(w => (
            <div key={w.id} className="block-row">
              <div className="block-stripe" style={{ background: "var(--teal)" }} />
              <div style={{ flex: 1 }}>
                <p className="block-title">{w.dayLabel} — {fmtDate(w.date)}</p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)", margin: 0 }}>{w.exercises.length} exercises logged</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Sample daily meals</h3>
      <div className="meal-grid">
        {Object.entries(meals).map(([slot, options]) => <div className="meal-card" key={slot}><p className="meal-slot">{slot}</p><ul>{options.map((o, i) => <li key={i}>{o}</li>)}</ul></div>)}
      </div>
      <p className="disclaimer">General meal ideas, not individualized nutrition advice — consult a registered dietitian for specific dietary or medical concerns.</p>
      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Grocery list suggestion</h3>
      <div>{groceries.map((g, i) => <span className="grocery-chip" key={i}>{g}</span>)}</div>
    </div>
  );
}

const navItems = [
  { id: "today", label: "Today", icon: "today" }, { id: "calendar", label: "Calendar", icon: "calendar" },
  { id: "tasks", label: "Tasks", icon: "tasks" }, { id: "goals", label: "Goals", icon: "goals" },
  { id: "habits", label: "Habits", icon: "habits" }, { id: "fitness", label: "Fitness", icon: "fitness" }, { id: "coach", label: "Coach", icon: "coach" },
];

function MainApp({ session }) {
  const [data, setData] = useState(emptyData());
  const [loaded, setLoaded] = useState(false);
  const [saveStatus, setSaveStatus] = useState("idle");
  const [activeTab, setActiveTab] = useState("today");
  const [taskFilter, setTaskFilter] = useState("personal");
  const [calView, setCalView] = useState("day");
  const [showOnboard, setShowOnboard] = useState(false);
  const [eventModal, setEventModal] = useState(null);
  const [habitModal, setHabitModal] = useState(null);
  const [viewDate, setViewDate] = useState(todayStr());
  const [noteText, setNoteText] = useState("");
  const saveTimer = useRef(null);
  const userId = session.user.id;

  useEffect(() => {
    (async () => {
      const { data: row, error } = await supabase.from("life_os_data").select("data").eq("user_id", userId).maybeSingle();
      if (!error && row && row.data) setData({ ...emptyData(), ...row.data });
      else await supabase.from("life_os_data").upsert({ user_id: userId, data: emptyData() });
      setLoaded(true);
    })();
  }, [userId]);

  useEffect(() => { if (loaded) document.documentElement.setAttribute("data-theme", data.theme || "light"); }, [loaded, data.theme]);
  useEffect(() => { if (loaded && !data.settings.onboarded) setShowOnboard(true); }, [loaded, data.settings.onboarded]);
  useEffect(() => { setNoteText((data.dailyLogs[viewDate] && data.dailyLogs[viewDate].note) || ""); }, [viewDate, data.dailyLogs]);

  const persist = useCallback((next) => {
    setSaveStatus("saving"); clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from("life_os_data").upsert({ user_id: userId, data: next, updated_at: new Date().toISOString() });
      setSaveStatus(error ? "error" : "saved");
    }, 500);
  }, [userId]);

  const update = (patch) => { const next = { ...data, ...patch }; setData(next); persist(next); };
  const blocks = useMemo(() => loaded ? autoScheduleDay(viewDate, data) : [], [viewDate, data, loaded]);

  if (!loaded) return <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>Loading your Life OS…</div>;

  const toggleTheme = () => update({ theme: data.theme === "dark" ? "light" : "dark" });
  const logout = async () => { await supabase.auth.signOut(); };

  const updateTask = (task) => { const exists = data.tasks.some(t => t.id === task.id); update({ tasks: exists ? data.tasks.map(t => t.id === task.id ? task : t) : [...data.tasks, task] }); };
  const deleteTask = (id) => update({ tasks: data.tasks.filter(t => t.id !== id) });
  const markTaskDone = (id) => update({ tasks: data.tasks.map(t => t.id === id ? { ...t, status: "done" } : t), completedLog: [...data.completedLog, { taskId: id, date: viewDate, type: "task" }] });
  const addTask = () => update({ tasks: [...data.tasks, { id: uid(), title: "New task", category: taskFilter, dueDate: todayStr(), estimatedMinutes: 30, priority: "medium", partOfDay: "midday", status: "not_started", notes: "", goalId: "" }] });

  const saveEvent = (event) => { const exists = data.events.some(e => e.id === event.id); update({ events: exists ? data.events.map(e => e.id === event.id ? event : e) : [...data.events, event] }); setEventModal(null); };
  const deleteEvent = (id) => update({ events: data.events.filter(e => e.id !== id) });

  const updateGoal = (goal) => update({ goals: data.goals.map(g => g.id === goal.id ? goal : g) });
  const deleteGoal = (id) => update({ goals: data.goals.filter(g => g.id !== id) });
  const addGoal = () => update({ goals: [...data.goals, { id: uid(), title: "New goal", category: "personal", targetDate: addDays(todayStr(), 90), description: "", progress: 0, lastNote: "" }] });

  const saveHabit = (habit) => { const exists = data.habits.some(hh => hh.id === habit.id); update({ habits: exists ? data.habits.map(hh => hh.id === habit.id ? habit : hh) : [...data.habits, habit] }); setHabitModal(null); };
  const deleteHabit = (id) => update({ habits: data.habits.filter(hh => hh.id !== id) });
  const toggleHabitDone = (habitId) => {
    const already = data.completedLog.some(c => c.habitId === habitId && c.date === viewDate);
    update({ completedLog: already ? data.completedLog.filter(c => !(c.habitId === habitId && c.date === viewDate)) : [...data.completedLog, { habitId, date: viewDate, type: "habit" }] });
  };

  const handleBlockDelete = (block) => {
    if (block.taskId) update({ blocks: { ...data.blocks, [viewDate]: (data.blocks[viewDate] || []).filter(b => b.taskId !== block.taskId) } });
    else if (block.type === "event") deleteEvent(block.id);
  };
  const handleBlockEdit = (block) => {
    if (block.type === "event") { const ev = data.events.find(e => e.id === block.id); if (ev) setEventModal(ev); }
    else if (block.taskId) { setActiveTab("tasks"); const t = data.tasks.find(t => t.id === block.taskId); if (t) setTaskFilter(t.category); }
    else if (block.habitId) { const hh = data.habits.find(hh => hh.id === block.habitId); if (hh) setHabitModal(hh); }
  };
  const saveNote = () => update({ dailyLogs: { ...data.dailyLogs, [viewDate]: { ...(data.dailyLogs[viewDate] || {}), note: noteText } } });

  const tasksForFilter = data.tasks.filter(t => t.category === taskFilter).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const insights = generateCoachInsights(data, viewDate);
  const habitsToday = data.habits.filter(hh => { if (!hh.active) return false; const dow = new Date(viewDate + "T00:00:00").getDay(); return hh.frequency === "daily" || (hh.frequency === "weekly" && hh.days.includes(dow)); });

  return (
    <div className="app">
      <div className="sidebar">
        <div className="brand"><div className="brand-mark">L</div><div className="brand-name">Life OS</div></div>
        {navItems.map(n => <button key={n.id} className={"nav-item" + (activeTab === n.id ? " active" : "")} onClick={() => setActiveTab(n.id)}><span className="nav-icon"><Icon name={n.icon} /></span>{n.label}</button>)}
        <div className="sidebar-footer">
          <div className="save-status"><span className={"dot" + (saveStatus === "saving" ? " syncing" : saveStatus === "error" ? " error" : "")} />{saveStatus === "saving" ? "Syncing…" : saveStatus === "saved" ? "Synced" : saveStatus === "error" ? "Sync error" : ""}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-tertiary)", padding: "0 12px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user.email}</div>
          <button className="nav-item" onClick={() => setShowOnboard(true)}><span className="nav-icon"><Icon name="settings" /></span>Settings</button>
          <button className="nav-item" onClick={logout}><span className="nav-icon"><Icon name="logout" /></span>Log out</button>
        </div>
      </div>

      <div className="main">
        <div className="page-header">
          <div>
            <h1 className="page-title">{navItems.find(n => n.id === activeTab)?.label || "Life OS"}</h1>
            <p className="page-subtitle">
              {activeTab === "today" ? "Your day, automatically organized around what matters." :
               activeTab === "calendar" ? "Month, week, or day — zoom to whatever view helps." :
               activeTab === "tasks" ? "Click any cell to edit it directly, no extra clicks." :
               activeTab === "goals" ? "The big things you're building toward — update progress daily." :
               activeTab === "habits" ? "Small, repeatable actions that compound." :
               activeTab === "fitness" ? "Your training plan and meals, built for your goal and equipment." :
               "Honest, data-driven nudges based on how things are actually going."}
            </p>
          </div>
          <div className="header-actions"><button className="icon-toggle" onClick={toggleTheme} title="Toggle theme"><Icon name={data.theme === "dark" ? "sun" : "moon"} /></button></div>
        </div>

        {activeTab === "today" && (
          <div>
            <div className="date-nav">
              <button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, -1))}><Icon name="left" /></button>
              <div className="date-label">{fmtDate(viewDate)}</div>
              <button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, 1))}><Icon name="right" /></button>
              <button className="btn btn-sm" onClick={() => setViewDate(todayStr())}>Today</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm" onClick={() => setEventModal({})}><Icon name="plus" /> Meeting/event</button>
            </div>
            <div className="stat-grid">
              <StatCard label="Blocks today" value={blocks.length} color="indigo" />
              <StatCard label="Tasks due" value={data.tasks.filter(t => t.dueDate === viewDate && t.status !== "done").length} color="teal" />
              <StatCard label="Habits today" value={habitsToday.length} color="coral" />
              <StatCard label="Overdue" value={data.tasks.filter(t => t.status !== "done" && t.dueDate < viewDate).length} color="amber" />
            </div>
            {insights.length > 0 && <div style={{ marginBottom: 20 }}>{insights.slice(0, 2).map((ins, i) => <div key={i} className={"insight-row " + (ins.type === "warning" ? "insight-warn" : "insight-good")}><span>{ins.type === "warning" ? "⚠️" : "✅"}</span><p>{ins.text}</p></div>)}</div>}
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Mapped out by time</h3>
            {blocks.length === 0 ? <div className="empty-state"><div className="emoji">🗓️</div><p>Nothing scheduled yet. Add tasks, habits, or events and they'll auto-fill your day without overlapping.</p></div> :
              <DayTimeline blocks={blocks} dateStr={viewDate} settings={data.settings} onEdit={handleBlockEdit} onStatusChange={markTaskDone} onDelete={handleBlockDelete} />}
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>List view</h3>
            {blocks.map((b, i) => <ScheduleBlock key={b.id + i} block={b} dateStr={viewDate} onEdit={handleBlockEdit} onStatusChange={markTaskDone} onDelete={handleBlockDelete} />)}
            {habitsToday.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Habit checklist</h3>
                {habitsToday.map(hh => { const done = data.completedLog.some(c => c.habitId === hh.id && c.date === viewDate); return (
                  <label key={hh.id} className="habit-check"><input type="checkbox" checked={done} onChange={() => toggleHabitDone(hh.id)} /><span style={{ textDecoration: done ? "line-through" : "none", color: done ? "var(--text-tertiary)" : "var(--text)" }}>{hh.name}</span></label>
                ); })}
              </div>
            )}
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Daily note</h3>
              <textarea style={{ minHeight: 80 }} placeholder="How did today go?" value={noteText} onChange={e => setNoteText(e.target.value)} onBlur={saveNote} />
            </div>
          </div>
        )}

        {activeTab === "calendar" && (
          <div>
            <div className="tabs">
              <button className={"tab-btn" + (calView === "month" ? " active" : "")} onClick={() => setCalView("month")}><Icon name="month" /> Month</button>
              <button className={"tab-btn" + (calView === "week" ? " active" : "")} onClick={() => setCalView("week")}><Icon name="week" /> Week</button>
              <button className={"tab-btn" + (calView === "day" ? " active" : "")} onClick={() => setCalView("day")}><Icon name="day" /> Day</button>
            </div>
            <div className="date-nav">
              <button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, calView === "month" ? -30 : calView === "week" ? -7 : -1))}><Icon name="left" /></button>
              <div className="date-label">{calView === "month" ? fmtMonthYear(viewDate) : calView === "week" ? `Week of ${fmtDateShort(startOfWeek(viewDate))}` : fmtDate(viewDate)}</div>
              <button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, calView === "month" ? 30 : calView === "week" ? 7 : 1))}><Icon name="right" /></button>
              <button className="btn btn-sm" onClick={() => setViewDate(todayStr())}>Today</button>
              <div style={{ flex: 1 }} />
              <button className="btn btn-sm" onClick={() => setEventModal({})}><Icon name="plus" /> Meeting/event</button>
            </div>
            {calView === "month" && <MonthView monthAnchor={viewDate} data={data} onSelectDay={(d) => { setViewDate(d); setCalView("day"); }} selectedDate={viewDate} />}
            {calView === "week" && <WeekView weekStart={startOfWeek(viewDate)} data={data} onSelectDay={(d) => { setViewDate(d); setCalView("day"); }} selectedDate={viewDate} />}
            {calView === "day" && <DayTimeline blocks={blocks} dateStr={viewDate} settings={data.settings} onEdit={handleBlockEdit} onStatusChange={markTaskDone} onDelete={handleBlockDelete} />}
          </div>
        )}

        {activeTab === "tasks" && (
          <div>
            <div className="tabs">{["personal", "work", "fitness"].map(cat => <button key={cat} className={"tab-btn" + (taskFilter === cat ? " active" : "")} onClick={() => setTaskFilter(cat)}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</button>)}</div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}><button className="btn btn-primary btn-sm" onClick={addTask}><Icon name="plus" /> New task</button></div>
            {tasksForFilter.length === 0 ? <div className="empty-state"><div className="emoji">📝</div><p>No {taskFilter} tasks yet.</p></div> :
              <TaskTable tasks={tasksForFilter} goals={data.goals} onUpdate={updateTask} onDelete={deleteTask} dateStr={viewDate} />}
          </div>
        )}

        {activeTab === "goals" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}><button className="btn btn-primary btn-sm" onClick={addGoal}><Icon name="plus" /> New goal</button></div>
            {data.goals.length === 0 ? <div className="empty-state"><div className="emoji">🎯</div><p>No goals yet. Tell the tool what you want your year of transformation to include.</p></div> :
              data.goals.map(g => <GoalCard key={g.id} g={g} tasks={data.tasks} habits={data.habits} onUpdate={updateGoal} onDelete={deleteGoal} />)}
          </div>
        )}

        {activeTab === "habits" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}><button className="btn btn-primary btn-sm" onClick={() => setHabitModal({})}><Icon name="plus" /> New habit</button></div>
            {data.habits.length === 0 ? <div className="empty-state"><div className="emoji">🔁</div><p>No habits yet.</p></div> :
              data.habits.map(hh => (
                <div key={hh.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{hh.name}</p>
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}><Tag>{hh.frequency === "daily" ? "Every day" : "Weekly"}</Tag><Tag>{hh.duration}m</Tag><Tag>{hh.partOfDay}</Tag>{!hh.active && <Tag color="coral">paused</Tag>}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => saveHabit({ ...hh, active: !hh.active })}>{hh.active ? "Pause" : "Resume"}</button>
                  <div className="row-actions"><button className="btn-ghost" onClick={() => setHabitModal(hh)}><Icon name="edit" /></button><button className="btn-ghost" onClick={() => deleteHabit(hh.id)}><Icon name="trash" /></button></div>
                </div>
              ))}
          </div>
        )}

        {activeTab === "fitness" && <FitnessTab state={data} onUpdate={update} />}

        {activeTab === "coach" && (
          <div>
            <div className="hero-banner"><h2>Your year of transformation</h2><p>Honest, data-driven observations from your tasks, goals, and habit history.</p></div>
            {insights.map((ins, i) => <div key={i} className={"insight-row " + (ins.type === "warning" ? "insight-warn" : "insight-good")}><span style={{ fontSize: 16 }}>{ins.type === "warning" ? "⚠️" : "✅"}</span><p>{ins.text}</p></div>)}
          </div>
        )}

        {showOnboard && <OnboardingModal settings={data.settings} onSave={(s) => { update({ settings: s }); setShowOnboard(false); }} onClose={() => setShowOnboard(false)} />}
        {eventModal !== null && <EventModal event={eventModal.id ? eventModal : null} defaultDate={viewDate} onSave={saveEvent} onClose={() => setEventModal(null)} />}
        {habitModal !== null && <HabitModal habit={habitModal.id ? habitModal : null} goals={data.goals} onSave={saveHabit} onClose={() => setHabitModal(null)} />}
      </div>

      <div className="mobile-nav">{navItems.map(n => <button key={n.id} className={activeTab === n.id ? "active" : ""} onClick={() => setActiveTab(n.id)}><span className="nav-icon"><Icon name={n.icon} /></span>{n.label}</button>)}</div>
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
  if (session === undefined) return <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>Loading…</div>;
  if (!session) return <AuthScreen />;
  return <MainApp key={session.user.id} session={session} />;
}