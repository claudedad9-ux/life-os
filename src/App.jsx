import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient";

const uid = () => Math.random().toString(36).slice(2, 10);
const todayStr = () => new Date().toISOString().slice(0, 10);
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const fmtDate = (dateStr) => new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const minutesToTime = (mins) => {
  const h2 = Math.floor(mins / 60) % 24; const m = mins % 60; const ampm = h2 >= 12 ? "PM" : "AM"; const h12 = h2 % 12 === 0 ? 12 : h2 % 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
};
const timeToMinutes = (t) => { const [hh, mm] = t.split(":").map(Number); return hh * 60 + mm; };

const DEFAULT_SETTINGS = {
  wakeTime: "06:30", bedTime: "22:30", workStart: "09:00", workEnd: "17:00",
  startDate: todayStr(), fitnessFrequency: 4, fitnessGoal: "general", equipment: "gym", onboarded: false,
};
const PART_OF_DAY_RANGES = { morning: [300, 720], midday: [720, 1020], night: [1020, 1410] };

const WORKOUT_LIBRARY = {
  general: { gym: ["Full body strength (squat, bench, row, overhead press)", "Cardio intervals + core circuit", "Upper body push/pull", "Lower body + mobility"],
    home: ["Bodyweight circuit (push-ups, squats, lunges, plank)", "Resistance band full body", "HIIT cardio (jump rope, burpees)", "Yoga / mobility flow"],
    minimal: ["Bodyweight strength (push-ups, pistol squat progressions)", "Brisk walk/run + core", "Stretch & mobility session", "Bodyweight HIIT"] },
  strength: { gym: ["Lower body: squat, deadlift, leg press", "Upper push: bench, OHP, dips", "Upper pull: rows, pull-ups, curls", "Accessory + core"],
    home: ["Heavy bodyweight + bands lower body", "Push-focused bodyweight + band press", "Pull-focused (rows w/ bands, pull-up bar)", "Core + stability"],
    minimal: ["Weighted bodyweight lower body", "Push progressions (pseudo planche, deep push-ups)", "Pull progressions (towel rows)", "Core circuit"] },
  fatloss: { gym: ["Full body circuit + 15min incline walk", "HIIT on cardio machine + core", "Strength superset (low rest)", "Steady state cardio + mobility"],
    home: ["HIIT bodyweight circuit", "Tabata intervals", "Strength circuit, minimal rest", "Long walk/jog + core"],
    minimal: ["Bodyweight HIIT (no equipment)", "Brisk walk/run intervals", "Bodyweight circuit", "Active recovery walk + stretch"] },
  endurance: { gym: ["Easy run/row + strength maintenance", "Interval cardio session", "Tempo effort cardio", "Long steady cardio session"],
    home: ["Easy run", "Interval hill sprints / stairs", "Tempo run", "Long run"],
    minimal: ["Easy walk/jog", "Interval sprints", "Tempo effort", "Long walk/run"] },
};
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
  return { settings: DEFAULT_SETTINGS, tasks: [], goals: [], habits: [], events: [], blocks: {}, dailyLogs: {}, completedLog: [], theme: "light" };
}

function priorityColor(p) { return p === "high" ? "coral" : p === "medium" ? "amber" : "gray"; }
function statusColor(s) { return s === "done" ? "green" : s === "in_progress" ? "indigo" : s === "blocked" ? "coral" : "gray"; }
function categoryColor(c) { return c === "work" ? "indigo" : c === "fitness" ? "teal" : c === "personal" ? "coral" : "gray"; }

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
  function findSlot(duration, rangeStart, rangeEnd) {
    const sorted = [...occupied].sort((a, b) => a.start - b.start);
    let cursor = rangeStart;
    for (const slot of sorted) { if (slot.start - cursor >= duration && cursor >= rangeStart) return cursor; cursor = Math.max(cursor, slot.end); }
    if (rangeEnd - cursor >= duration) return cursor;
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
      const block = { id: "task-" + t.id, taskId: t.id, type: "task", title: t.title, start, end: start + duration, category, priority: t.priority, manual: false };
      occupied.push({ start: block.start, end: block.end }); scheduled.push(block);
    }
  });
  return scheduled.sort((a, b) => a.start - b.start);
}

function generateCoachInsights(state, dateStr) {
  const insights = []; const { tasks, goals, habits, completedLog } = state;
  const overdue = tasks.filter(t => t.status !== "done" && t.dueDate < dateStr);
  if (overdue.length > 0) insights.push({ type: "warning", text: `You have ${overdue.length} overdue task${overdue.length > 1 ? "s" : ""}: ${overdue.slice(0, 3).map(t => t.title).join(", ")}${overdue.length > 3 ? "…" : ""}. Either knock these out today or push the due date — letting tasks sit overdue quietly erodes trust in your own list.` });
  goals.filter(g => g.progress < 100).forEach(g => {
    const linkedHabits = habits.filter(h2 => h2.goalId === g.id && h2.active);
    const linkedTasks = tasks.filter(t => t.goalId === g.id && t.status !== "done");
    if (linkedHabits.length === 0 && linkedTasks.length === 0) insights.push({ type: "warning", text: `"${g.title}" has no active habits or tasks tied to it. A goal without weekly action attached usually stalls — consider adding a recurring habit.` });
    const daysLeft = Math.round((new Date(g.targetDate) - new Date(dateStr)) / 86400000);
    if (daysLeft > 0 && daysLeft < 30 && g.progress < 70) insights.push({ type: "warning", text: `"${g.title}" is due in ${daysLeft} days but sits at ${g.progress}% progress. Worth a focused push this week or a realistic date reset.` });
  });
  const last7 = []; for (let i = 1; i <= 7; i++) last7.push(addDays(dateStr, -i));
  habits.filter(h2 => h2.active).forEach(h2 => {
    const applicable = last7.filter(d => { const dow = new Date(d + "T00:00:00").getDay(); return h2.frequency === "daily" || (h2.frequency === "weekly" && h2.days.includes(dow)); });
    const completed = applicable.filter(d => completedLog.some(c => c.habitId === h2.id && c.date === d));
    if (applicable.length >= 3 && completed.length / applicable.length < 0.5) insights.push({ type: "warning", text: `"${h2.name}" has only landed ${completed.length}/${applicable.length} days this past week. Try moving it earlier in the day or shrinking the duration so it's easier to start.` });
  });
  if (overdue.length === 0 && insights.length === 0) insights.push({ type: "good", text: "Nothing overdue, and your goals all have active habits or tasks behind them. Solid footing — focus today on doing the work, not just planning it." });
  return insights.slice(0, 6);
}

function Icon({ name }) {
  const map = {
    today: "☀️", calendar: "📅", tasks: "✅", goals: "🎯", habits: "🔁", fitness: "💪", coach: "💡",
    settings: "⚙️", backup: "💾", plus: "+", edit: "✎", trash: "🗑", check: "✓", left: "‹", right: "›",
    sun: "☀️", moon: "🌙", download: "⬇️", upload: "⬆️", warn: "⚠️", good: "✓", logout: "↪",
  };
  return <span style={{ fontStyle: "normal" }}>{map[name] || ""}</span>;
}

function Tag({ children, color = "gray" }) { return <span className={`tag tag-${color}`}>{children}</span>; }

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={"modal" + (wide ? " wide" : "")}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-ghost" onClick={onClose} style={{ fontSize: 18 }}>✕</button>
        </div>
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
    e.preventDefault();
    setError(""); setConfirmMsg(""); setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setConfirmMsg("Account created. If email confirmation is enabled on your project, check your inbox; otherwise you're now logged in.");
      }
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
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
          <Field label="Email">
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          </Field>
          <Field label="Password">
            <input type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} />
          </Field>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
        <div className="auth-toggle">
          {mode === "login" ? (
            <>Don't have an account? <button onClick={() => { setMode("signup"); setError(""); }}>Sign up</button></>
          ) : (
            <>Already have an account? <button onClick={() => { setMode("login"); setError(""); }}>Log in</button></>
          )}
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
        These hours define the boundaries the auto-scheduler will always respect. Change these anytime — it's never a one-time setup.
      </p>
      <div className="field-row">
        <Field label="Wake time"><input type="time" value={s.wakeTime} onChange={e => setS({ ...s, wakeTime: e.target.value })} /></Field>
        <Field label="Bed time"><input type="time" value={s.bedTime} onChange={e => setS({ ...s, bedTime: e.target.value })} /></Field>
        <Field label="Work start"><input type="time" value={s.workStart} onChange={e => setS({ ...s, workStart: e.target.value })} /></Field>
        <Field label="Work end"><input type="time" value={s.workEnd} onChange={e => setS({ ...s, workEnd: e.target.value })} /></Field>
      </div>
      <Field label="Fitness goal">
        <select value={s.fitnessGoal} onChange={e => setS({ ...s, fitnessGoal: e.target.value })}>
          <option value="general">General fitness</option>
          <option value="strength">Build strength/muscle</option>
          <option value="fatloss">Fat loss</option>
          <option value="endurance">Endurance</option>
        </select>
      </Field>
      <div className="field-row">
        <Field label="Workouts per week"><input type="number" min="0" max="7" value={s.fitnessFrequency} onChange={e => setS({ ...s, fitnessFrequency: Number(e.target.value) })} /></Field>
        <Field label="Equipment available">
          <select value={s.equipment} onChange={e => setS({ ...s, equipment: e.target.value })}>
            <option value="gym">Full gym</option>
            <option value="home">Home equipment</option>
            <option value="minimal">Minimal / bodyweight</option>
          </select>
        </Field>
      </div>
      <button className="btn btn-primary btn-block" onClick={() => onSave({ ...s, onboarded: true })}>Save changes</button>
    </Modal>
  );
}

function TaskModal({ task, onSave, onClose, defaultCategory, goals }) {
  const [t, setT] = useState(task || { id: uid(), title: "", category: defaultCategory || "personal", dueDate: todayStr(), estimatedMinutes: 30, priority: "medium", partOfDay: "midday", status: "not_started", notes: "", goalId: "" });
  return (
    <Modal title={task ? "Edit task" : "New task"} onClose={onClose}>
      <Field label="Title"><input value={t.title} onChange={e => setT({ ...t, title: e.target.value })} placeholder="e.g. Finish quarterly report" /></Field>
      <div className="field-row">
        <Field label="Category">
          <select value={t.category} onChange={e => setT({ ...t, category: e.target.value })}>
            <option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option>
          </select>
        </Field>
        <Field label="Priority">
          <select value={t.priority} onChange={e => setT({ ...t, priority: e.target.value })}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </Field>
      </div>
      <div className="field-row">
        <Field label="Due date"><input type="date" value={t.dueDate} onChange={e => setT({ ...t, dueDate: e.target.value })} /></Field>
        <Field label="Est. time (min)"><input type="number" min="5" step="5" value={t.estimatedMinutes} onChange={e => setT({ ...t, estimatedMinutes: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Preferred part of day">
        <select value={t.partOfDay} onChange={e => setT({ ...t, partOfDay: e.target.value })}>
          <option value="morning">Morning</option><option value="midday">Midday</option><option value="night">Night</option>
        </select>
      </Field>
      <Field label="Status">
        <select value={t.status} onChange={e => setT({ ...t, status: e.target.value })}>
          <option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="blocked">Blocked</option><option value="done">Done</option>
        </select>
      </Field>
      {goals && goals.length > 0 && (
        <Field label="Linked goal">
          <select value={t.goalId || ""} onChange={e => setT({ ...t, goalId: e.target.value })}>
            <option value="">None</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
      )}
      <Field label="Notes"><textarea style={{ minHeight: 60 }} value={t.notes} onChange={e => setT({ ...t, notes: e.target.value })} /></Field>
      <button className="btn btn-primary btn-block" onClick={() => { if (t.title.trim()) onSave(t); }}>Save task</button>
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
        <select value={e.category} onChange={ev => setE({ ...e, category: ev.target.value })}>
          <option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option>
        </select>
      </Field>
      <button className="btn btn-primary btn-block" onClick={() => { if (e.title.trim()) onSave(e); }}>Save event</button>
    </Modal>
  );
}

function GoalModal({ goal, onSave, onClose }) {
  const [g, setG] = useState(goal || { id: uid(), title: "", category: "personal", targetDate: addDays(todayStr(), 90), description: "", progress: 0 });
  return (
    <Modal title={goal ? "Edit goal" : "New goal"} onClose={onClose}>
      <Field label="Goal title"><input value={g.title} onChange={e => setG({ ...g, title: e.target.value })} placeholder="e.g. Run a half marathon" /></Field>
      <div className="field-row">
        <Field label="Category">
          <select value={g.category} onChange={e => setG({ ...g, category: e.target.value })}>
            <option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option>
          </select>
        </Field>
        <Field label="Target date"><input type="date" value={g.targetDate} onChange={e => setG({ ...g, targetDate: e.target.value })} /></Field>
      </div>
      <Field label="Why this matters"><textarea style={{ minHeight: 60 }} value={g.description} onChange={e => setG({ ...g, description: e.target.value })} /></Field>
      <Field label={`Progress: ${g.progress}%`}><input type="range" min="0" max="100" step="5" value={g.progress} onChange={e => setG({ ...g, progress: Number(e.target.value) })} /></Field>
      <button className="btn btn-primary btn-block" onClick={() => { if (g.title.trim()) onSave(g); }}>Save goal</button>
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
        <Field label="Category">
          <select value={hb.category} onChange={e => setHb({ ...hb, category: e.target.value })}>
            <option value="work">Work</option><option value="personal">Personal</option><option value="fitness">Fitness</option>
          </select>
        </Field>
        <Field label="Duration (min)"><input type="number" min="5" step="5" value={hb.duration} onChange={e => setHb({ ...hb, duration: Number(e.target.value) })} /></Field>
      </div>
      <Field label="Frequency">
        <select value={hb.frequency} onChange={e => setHb({ ...hb, frequency: e.target.value })}>
          <option value="daily">Every day</option><option value="weekly">Specific days</option>
        </select>
      </Field>
      {hb.frequency === "weekly" && (
        <Field label="Days">
          <div className="day-pill-row">
            {dayNames.map((d, i) => <button key={i} className={"day-pill" + (hb.days.includes(i) ? " active" : "")} onClick={() => toggleDay(i)}>{d}</button>)}
          </div>
        </Field>
      )}
      <Field label="Preferred part of day">
        <select value={hb.partOfDay} onChange={e => setHb({ ...hb, partOfDay: e.target.value })}>
          <option value="morning">Morning</option><option value="midday">Midday</option><option value="night">Night</option>
        </select>
      </Field>
      {goals && goals.length > 0 && (
        <Field label="Linked goal (optional)">
          <select value={hb.goalId || ""} onChange={e => setHb({ ...hb, goalId: e.target.value })}>
            <option value="">None</option>
            {goals.map(g => <option key={g.id} value={g.id}>{g.title}</option>)}
          </select>
        </Field>
      )}
      <button className="btn btn-primary btn-block" onClick={() => { if (hb.name.trim()) onSave(hb); }}>Save habit</button>
    </Modal>
  );
}

function StatCard({ label, value, color }) {
  const bg = { indigo: "var(--indigo-soft)", teal: "var(--teal-soft)", coral: "var(--coral-soft)", amber: "var(--amber-soft)", green: "var(--green-soft)" }[color] || "var(--bg-soft)";
  const tx = { indigo: "var(--indigo-text)", teal: "var(--teal-text)", coral: "var(--coral-text)", amber: "var(--amber-text)", green: "var(--green-text)" }[color] || "var(--text)";
  return <div className="stat-card" style={{ background: bg, color: tx }}><p className="stat-label">{label}</p><p className="stat-value">{value}</p></div>;
}

function ScheduleBlock({ block, onEdit, onStatusChange, onDelete }) {
  const c = categoryColor(block.category);
  const stripeColor = { indigo: "var(--indigo)", teal: "var(--teal)", coral: "var(--coral)", gray: "var(--border-strong)" }[c];
  return (
    <div className="block-row">
      <div className="block-stripe" style={{ background: stripeColor }} />
      <div className="block-time">{minutesToTime(block.start)} – {minutesToTime(block.end)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="block-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{block.title}</p>
        <div className="block-tags">
          <Tag color={c}>{block.category}</Tag>
          {block.type === "task" && <Tag color={priorityColor(block.priority)}>{block.priority}</Tag>}
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

function FitnessTab({ state }) {
  const { settings } = state;
  const workouts = (WORKOUT_LIBRARY[settings.fitnessGoal] && WORKOUT_LIBRARY[settings.fitnessGoal][settings.equipment]) || WORKOUT_LIBRARY.general.gym;
  const meals = MEAL_LIBRARY[settings.fitnessGoal] || MEAL_LIBRARY.general;
  const groceries = GROCERY_BY_GOAL[settings.fitnessGoal] || GROCERY_BY_GOAL.general;
  const goalLabel = settings.fitnessGoal === "fatloss" ? "Fat loss" : settings.fitnessGoal === "strength" ? "Strength" : settings.fitnessGoal === "endurance" ? "Endurance" : "General fitness";
  return (
    <div>
      <div className="stat-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <StatCard label="Weekly workout target" value={`${settings.fitnessFrequency}x / week`} color="teal" />
        <StatCard label="Goal" value={goalLabel} color="coral" />
      </div>
      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>This week's workout plan</h3>
      <p style={{ fontSize: 13.5, color: "var(--text-secondary)", lineHeight: 1.5, marginBottom: 14 }}>
        Based on {settings.fitnessFrequency}x/week, {settings.equipment === "gym" ? "full gym access" : settings.equipment === "home" ? "home equipment" : "minimal/bodyweight equipment"}, geared toward your {goalLabel.toLowerCase()} goal.
      </p>
      <div>
        {Array.from({ length: settings.fitnessFrequency }).map((_, i) => (
          <div className="workout-row" key={i}><div className="workout-day-badge">{`D${i + 1}`}</div><span style={{ fontSize: 14, fontWeight: 600 }}>{workouts[i % workouts.length]}</span></div>
        ))}
      </div>
      <p className="disclaimer" style={{ marginTop: 14 }}>General guidelines, not personalized coaching — check with a doctor or certified trainer before starting a new program, especially with injuries or medical conditions.</p>
      <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, marginTop: 10 }}>Sample daily meals</h3>
      <div className="meal-grid">
        {Object.entries(meals).map(([slot, options]) => (
          <div className="meal-card" key={slot}><p className="meal-slot">{slot}</p><ul>{options.map((o, i) => <li key={i}>{o}</li>)}</ul></div>
        ))}
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
  const [showOnboard, setShowOnboard] = useState(false);
  const [taskModal, setTaskModal] = useState(null);
  const [eventModal, setEventModal] = useState(null);
  const [goalModal, setGoalModal] = useState(null);
  const [habitModal, setHabitModal] = useState(null);
  const [viewDate, setViewDate] = useState(todayStr());
  const [noteText, setNoteText] = useState("");
  const saveTimer = useRef(null);

  const userId = session.user.id;

  useEffect(() => {
    (async () => {
      const { data: row, error } = await supabase.from("life_os_data").select("data").eq("user_id", userId).maybeSingle();
      if (!error && row && row.data) {
        setData({ ...emptyData(), ...row.data });
      } else {
        await supabase.from("life_os_data").upsert({ user_id: userId, data: emptyData() });
      }
      setLoaded(true);
    })();
  }, [userId]);

  useEffect(() => { if (loaded) document.documentElement.setAttribute("data-theme", data.theme || "light"); }, [loaded, data.theme]);
  useEffect(() => { if (loaded && !data.settings.onboarded) setShowOnboard(true); }, [loaded, data.settings.onboarded]);
  useEffect(() => { setNoteText((data.dailyLogs[viewDate] && data.dailyLogs[viewDate].note) || ""); }, [viewDate, data.dailyLogs]);

  const persist = useCallback((next) => {
    setSaveStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const { error } = await supabase.from("life_os_data").upsert({ user_id: userId, data: next, updated_at: new Date().toISOString() });
      setSaveStatus(error ? "error" : "saved");
    }, 500);
  }, [userId]);

  const update = (patch) => {
    const next = { ...data, ...patch };
    setData(next);
    persist(next);
  };

  const blocks = useMemo(() => loaded ? autoScheduleDay(viewDate, data) : [], [viewDate, data, loaded]);

  if (!loaded) return <div style={{ padding: 60, textAlign: "center", color: "var(--text-secondary)" }}>Loading your Life OS…</div>;

  const toggleTheme = () => update({ theme: data.theme === "dark" ? "light" : "dark" });
  const logout = async () => { await supabase.auth.signOut(); };

  const saveTask = (task) => { const exists = data.tasks.some(t => t.id === task.id); update({ tasks: exists ? data.tasks.map(t => t.id === task.id ? task : t) : [...data.tasks, task] }); setTaskModal(null); };
  const deleteTask = (id) => update({ tasks: data.tasks.filter(t => t.id !== id) });
  const markTaskDone = (id) => update({ tasks: data.tasks.map(t => t.id === id ? { ...t, status: "done" } : t), completedLog: [...data.completedLog, { taskId: id, date: viewDate, type: "task" }] });

  const saveEvent = (event) => { const exists = data.events.some(e => e.id === event.id); update({ events: exists ? data.events.map(e => e.id === event.id ? event : e) : [...data.events, event] }); setEventModal(null); };
  const deleteEvent = (id) => update({ events: data.events.filter(e => e.id !== id) });

  const saveGoal = (goal) => { const exists = data.goals.some(g => g.id === goal.id); update({ goals: exists ? data.goals.map(g => g.id === goal.id ? goal : g) : [...data.goals, goal] }); setGoalModal(null); };
  const deleteGoal = (id) => update({ goals: data.goals.filter(g => g.id !== id) });

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
    else if (block.taskId) { const t = data.tasks.find(t => t.id === block.taskId); if (t) setTaskModal(t); }
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
        {navItems.map(n => (
          <button key={n.id} className={"nav-item" + (activeTab === n.id ? " active" : "")} onClick={() => setActiveTab(n.id)}>
            <span className="nav-icon"><Icon name={n.icon} /></span>{n.label}
          </button>
        ))}
        <div className="sidebar-footer">
          <div className="save-status">
            <span className={"dot" + (saveStatus === "saving" ? " syncing" : saveStatus === "error" ? " error" : "")} />
            {saveStatus === "saving" ? "Syncing…" : saveStatus === "saved" ? "Synced" : saveStatus === "error" ? "Sync error" : ""}
          </div>
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
               activeTab === "calendar" ? "A week-at-a-glance view of everything on your plate." :
               activeTab === "tasks" ? "Everything you need to get done, sorted by what's next." :
               activeTab === "goals" ? "The big things you're building toward this year." :
               activeTab === "habits" ? "Small, repeatable actions that compound." :
               activeTab === "fitness" ? "Workouts and meals tailored to your goal and equipment." :
               "Honest, data-driven nudges based on how things are actually going."}
            </p>
          </div>
          <div className="header-actions">
            <button className="icon-toggle" onClick={toggleTheme} title="Toggle theme"><Icon name={data.theme === "dark" ? "sun" : "moon"} /></button>
          </div>
        </div>

        {(activeTab === "today" || activeTab === "calendar") && (
          <div className="date-nav">
            <button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, -1))}><Icon name="left" /></button>
            <div className="date-label">{fmtDate(viewDate)}</div>
            <button className="btn btn-sm" onClick={() => setViewDate(addDays(viewDate, 1))}><Icon name="right" /></button>
            <button className="btn btn-sm" onClick={() => setViewDate(todayStr())}>Today</button>
            <div style={{ flex: 1 }} />
            <button className="btn btn-sm" onClick={() => setEventModal({})}><Icon name="plus" /> Meeting/event</button>
          </div>
        )}

        {activeTab === "today" && (
          <div>
            <div className="stat-grid">
              <StatCard label="Blocks today" value={blocks.length} color="indigo" />
              <StatCard label="Tasks due" value={data.tasks.filter(t => t.dueDate === viewDate && t.status !== "done").length} color="teal" />
              <StatCard label="Habits today" value={habitsToday.length} color="coral" />
              <StatCard label="Overdue" value={data.tasks.filter(t => t.status !== "done" && t.dueDate < viewDate).length} color="amber" />
            </div>
            {insights.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                {insights.slice(0, 2).map((ins, i) => (
                  <div key={i} className={"insight-row " + (ins.type === "warning" ? "insight-warn" : "insight-good")}>
                    <span>{ins.type === "warning" ? "⚠️" : "✅"}</span><p>{ins.text}</p>
                  </div>
                ))}
              </div>
            )}
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Your schedule</h3>
            {blocks.length === 0 ? (
              <div className="empty-state"><div className="emoji">🗓️</div><p>Nothing scheduled yet. Add tasks, habits, or events and they'll auto-fill your day.</p></div>
            ) : blocks.map((b, i) => <ScheduleBlock key={b.id + i} block={b} onEdit={handleBlockEdit} onStatusChange={markTaskDone} onDelete={handleBlockDelete} />)}
            {habitsToday.length > 0 && (
              <div style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Habit checklist</h3>
                {habitsToday.map(hh => {
                  const done = data.completedLog.some(c => c.habitId === hh.id && c.date === viewDate);
                  return (
                    <label key={hh.id} className="habit-check">
                      <input type="checkbox" checked={done} onChange={() => toggleHabitDone(hh.id)} />
                      <span style={{ textDecoration: done ? "line-through" : "none", color: done ? "var(--text-tertiary)" : "var(--text)" }}>{hh.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Daily note</h3>
              <textarea style={{ minHeight: 80 }} placeholder="How did today go? Anything worth remembering for tomorrow?" value={noteText} onChange={e => setNoteText(e.target.value)} onBlur={saveNote} />
            </div>
          </div>
        )}

        {activeTab === "calendar" && (
          <div>
            {Array.from({ length: 7 }).map((_, i) => {
              const d = addDays(viewDate, i - new Date(viewDate + "T00:00:00").getDay());
              const dayBlocks = autoScheduleDay(d, data);
              return (
                <div key={d} className="week-day-block">
                  <p className="week-day-label" style={{ color: d === viewDate ? "var(--indigo)" : "var(--text-secondary)" }}>{fmtDate(d)}</p>
                  {dayBlocks.length === 0 ? <p style={{ fontSize: 12, color: "var(--text-tertiary)", marginLeft: 4 }}>Nothing scheduled</p> :
                    dayBlocks.map((b, idx) => <div key={b.id + idx} className="week-event-line"><span style={{ fontFamily: "monospace" }}>{minutesToTime(b.start)}</span><span>{b.title}</span></div>)}
                </div>
              );
            })}
          </div>
        )}

        {activeTab === "tasks" && (
          <div>
            <div className="tabs">
              {["personal", "work", "fitness"].map(cat => (
                <button key={cat} className={"tab-btn" + (taskFilter === cat ? " active" : "")} onClick={() => setTaskFilter(cat)}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setTaskModal({})}><Icon name="plus" /> New task</button>
            </div>
            {tasksForFilter.length === 0 ? (
              <div className="empty-state"><div className="emoji">📝</div><p>No {taskFilter} tasks yet.</p></div>
            ) : tasksForFilter.map(t => (
              <div key={t.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700, textDecoration: t.status === "done" ? "line-through" : "none" }}>{t.title}</p>
                  <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                    <Tag color={priorityColor(t.priority)}>{t.priority}</Tag><Tag color={statusColor(t.status)}>{t.status.replace("_", " ")}</Tag>
                    <Tag>due {fmtDate(t.dueDate)}</Tag><Tag>{t.estimatedMinutes}m</Tag>
                  </div>
                </div>
                <div className="row-actions">
                  <button className="btn-ghost" onClick={() => setTaskModal(t)}><Icon name="edit" /></button>
                  <button className="btn-ghost" onClick={() => deleteTask(t.id)}><Icon name="trash" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "goals" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setGoalModal({})}><Icon name="plus" /> New goal</button>
            </div>
            {data.goals.length === 0 ? (
              <div className="empty-state"><div className="emoji">🎯</div><p>No goals yet. Tell the tool what you want your year of transformation to include.</p></div>
            ) : data.goals.map(g => (
              <div key={g.id} className="card">
                <div className="goal-card-progress">
                  <div><p className="goal-title">{g.title}</p><p className="goal-target">Target: {fmtDate(g.targetDate)}</p></div>
                  <div className="row-actions">
                    <button className="btn-ghost" onClick={() => setGoalModal(g)}><Icon name="edit" /></button>
                    <button className="btn-ghost" onClick={() => deleteGoal(g.id)}><Icon name="trash" /></button>
                  </div>
                </div>
                {g.description && <p className="goal-desc">{g.description}</p>}
                <div className="progress-track"><div className="progress-fill" style={{ width: `${g.progress}%`, background: "linear-gradient(90deg, var(--indigo), var(--teal))" }} /></div>
                <p className="goal-progress-label">{g.progress}% complete</p>
              </div>
            ))}
          </div>
        )}

        {activeTab === "habits" && (
          <div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setHabitModal({})}><Icon name="plus" /> New habit</button>
            </div>
            {data.habits.length === 0 ? (
              <div className="empty-state"><div className="emoji">🔁</div><p>No habits yet. Add recurring habits to build momentum daily.</p></div>
            ) : data.habits.map(hh => (
              <div key={hh.id} className="card" style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px" }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{hh.name}</p>
                  <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                    <Tag>{hh.frequency === "daily" ? "Every day" : "Weekly"}</Tag><Tag>{hh.duration}m</Tag><Tag>{hh.partOfDay}</Tag>
                    {!hh.active && <Tag color="coral">paused</Tag>}
                  </div>
                </div>
                <button className="btn btn-sm" onClick={() => saveHabit({ ...hh, active: !hh.active })}>{hh.active ? "Pause" : "Resume"}</button>
                <div className="row-actions">
                  <button className="btn-ghost" onClick={() => setHabitModal(hh)}><Icon name="edit" /></button>
                  <button className="btn-ghost" onClick={() => deleteHabit(hh.id)}><Icon name="trash" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === "fitness" && <FitnessTab state={data} />}

        {activeTab === "coach" && (
          <div>
            <div className="hero-banner">
              <h2>Your year of transformation</h2>
              <p>Honest, data-driven observations from your tasks, goals, and habit history — not a substitute for professional advice on health, finances, or wellbeing, just pattern-spotting on what you've entered.</p>
            </div>
            {insights.map((ins, i) => (
              <div key={i} className={"insight-row " + (ins.type === "warning" ? "insight-warn" : "insight-good")}>
                <span style={{ fontSize: 16 }}>{ins.type === "warning" ? "⚠️" : "✅"}</span><p>{ins.text}</p>
              </div>
            ))}
          </div>
        )}

        {showOnboard && <OnboardingModal settings={data.settings} onSave={(s) => { update({ settings: s }); setShowOnboard(false); }} onClose={() => setShowOnboard(false)} />}
        {taskModal !== null && <TaskModal task={taskModal.id ? taskModal : null} defaultCategory={taskFilter} goals={data.goals} onSave={saveTask} onClose={() => setTaskModal(null)} />}
        {eventModal !== null && <EventModal event={eventModal.id ? eventModal : null} defaultDate={viewDate} onSave={saveEvent} onClose={() => setEventModal(null)} />}
        {goalModal !== null && <GoalModal goal={goalModal.id ? goalModal : null} onSave={saveGoal} onClose={() => setGoalModal(null)} />}
        {habitModal !== null && <HabitModal habit={habitModal.id ? habitModal : null} goals={data.goals} onSave={saveHabit} onClose={() => setHabitModal(null)} />}
      </div>

      <div className="mobile-nav">
        {navItems.map(n => (
          <button key={n.id} className={activeTab === n.id ? "active" : ""} onClick={() => setActiveTab(n.id)}>
            <span className="nav-icon"><Icon name={n.icon} /></span>{n.label}
          </button>
        ))}
      </div>
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