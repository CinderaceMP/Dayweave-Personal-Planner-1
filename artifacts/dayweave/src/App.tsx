import { createContext, useContext, useEffect, useMemo, useState, type ChangeEvent, type FormEvent, type CSSProperties, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  House, ListChecks, Moon, Plus, Settings2, Sparkles,
  Sun, X, Pencil, Trash2, Repeat2, CalendarPlus, Upload,
} from 'lucide-react';
import { deleteMedia, listSavedMedia, saveMedia, type SavedMedia } from '@/lib/media-storage';

type Category = 'Personal' | 'Work' | 'Wellbeing' | 'Home' | 'Learning';
type Priority = 'Low' | 'Medium' | 'High';
type Repeat = 'Never' | 'Daily' | 'Weekly' | 'Monthly';
type Task = { id: string; title: string; dueDate: string; dueTime: string; category: Category; priority: Priority; repeat: Repeat; completed: boolean; notes?: string; seriesId?: string };
type Event = { id: string; title: string; date: string; startTime: string; endTime: string; category: Category; notes?: string };
type Preferences = { theme: 'light' | 'dark'; accentColor: string; compactMode: boolean };
type Proposal = { id: string; title: string; date: string; startTime: string; endTime: string; category: Category; notes: string };
type Page = 'today' | 'calendar' | 'tasks' | 'settings';
type ModalState = { kind: 'task' | 'event'; value?: Task | Event; defaultDate?: string } | null;

const STORE_KEY = 'dayweave-local-v1';
const BACKGROUND_MEDIA_KEY = 'background';
const BRAND_MEDIA_KEY = 'brand-mark';
const categoryMediaKey = (category: Category) => `category-${category.toLowerCase()}`;
const CategoryMediaContext = createContext<Partial<Record<Category, string>>>({});
const CATEGORIES: Category[] = ['Personal', 'Work', 'Wellbeing', 'Home', 'Learning'];
const CATEGORY_COLORS: Record<Category, string> = {
  Personal: '#d98971', Work: '#718eaf', Wellbeing: '#74a28c', Home: '#c59b58', Learning: '#9b84ad',
};
const ACCENTS = [
  { name: 'Terracotta', value: '14 66% 57%' },
  { name: 'Cornflower', value: '213 42% 53%' },
  { name: 'Olive', value: '93 29% 42%' },
  { name: 'Plum', value: '294 27% 49%' },
  { name: 'Marigold', value: '38 73% 48%' },
];
const NAV: { id: Page; label: string; icon: typeof House }[] = [
  { id: 'today', label: 'Today', icon: House },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'settings', label: 'Settings', icon: Settings2 },
];
const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const todayKey = () => dateKey(new Date());
const addDays = (date: Date, amount: number) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
const dateFromKey = (key: string) => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d); };
const formatDate = (key: string, options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }) => dateFromKey(key).toLocaleDateString('en-US', options);
const id = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const hslToHex = (value: string) => {
  const [hue, saturation, lightness] = value.split(/[ %]+/).filter(Boolean).map(Number);
  const h = hue / 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const channel = (n: number) => {
    const k = (n + h * 12) % 12;
    const color = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(color * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
};
const hexToHsl = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;
  let hue = 0;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue * 60 + 360) % 360;
  }
  return `${Math.round(hue)} ${Math.round(saturation * 100)}% ${Math.round(lightness * 100)}%`;
};
const nextRepeatDate = (key: string, repeat: Repeat) => {
  const date = dateFromKey(key);
  if (repeat === 'Daily') return dateKey(addDays(date, 1));
  if (repeat === 'Weekly') return dateKey(addDays(date, 7));
  if (repeat === 'Monthly') {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const lastDay = new Date(year, month + 1, 0).getDate();
    return dateKey(new Date(year, month, Math.min(day, lastDay)));
  }
  return key;
};
const timeLabel = (time: string) => {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

function seedData() {
  const today = todayKey();
  const tomorrow = dateKey(addDays(new Date(), 1));
  return {
    tasks: [
      { id: 'seed-t1', title: 'Send the project outline', dueDate: today, dueTime: '09:30', category: 'Work' as Category, priority: 'High' as Priority, repeat: 'Never' as Repeat, completed: false, notes: 'Keep it concise and share with Maya.' },
      { id: 'seed-t2', title: 'Take a proper lunch break', dueDate: today, dueTime: '12:30', category: 'Wellbeing' as Category, priority: 'Medium' as Priority, repeat: 'Daily' as Repeat, completed: false },
      { id: 'seed-t3', title: 'Water the balcony plants', dueDate: today, dueTime: '17:00', category: 'Home' as Category, priority: 'Low' as Priority, repeat: 'Weekly' as Repeat, completed: false },
      { id: 'seed-t4', title: 'Read a few pages', dueDate: tomorrow, dueTime: '20:30', category: 'Learning' as Category, priority: 'Low' as Priority, repeat: 'Daily' as Repeat, completed: false },
    ],
    events: [
      { id: 'seed-e1', title: 'Morning pages', date: today, startTime: '08:00', endTime: '08:20', category: 'Wellbeing' as Category, notes: 'A little room to think.' },
      { id: 'seed-e2', title: 'Design check-in', date: today, startTime: '10:30', endTime: '11:15', category: 'Work' as Category, notes: 'Bring the first sketches.' },
      { id: 'seed-e3', title: 'A walk around the neighborhood', date: today, startTime: '15:30', endTime: '16:00', category: 'Wellbeing' as Category },
      { id: 'seed-e4', title: 'Coffee with Lena', date: tomorrow, startTime: '09:00', endTime: '10:00', category: 'Personal' as Category },
    ],
    preferences: { theme: 'light' as const, accentColor: ACCENTS[0].value, compactMode: false },
  };
}

function loadData() {
  try {
    const stored = localStorage.getItem(STORE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.events) && parsed.preferences) return parsed;
    }
  } catch { /* start with the thoughtfully seeded local sample */ }
  return seedData();
}

function App() {
  const [location, setLocation] = useLocation();
  const currentPage = (['/calendar', '/tasks', '/settings'].includes(location) ? location.slice(1) : 'today') as Page;
  const [initial] = useState(loadData);
  const [tasks, setTasks] = useState<Task[]>(initial.tasks);
  const [events, setEvents] = useState<Event[]>(initial.events);
  const [preferences, setPreferences] = useState<Preferences>(initial.preferences);
  const [mediaAssets, setMediaAssets] = useState<Record<string, SavedMedia>>({});
  const [mediaUrls, setMediaUrls] = useState<Record<string, string>>({});
  const [mediaStorageMessage, setMediaStorageMessage] = useState('');
  const [modal, setModal] = useState<ModalState>(null);
  const [calendarView, setCalendarView] = useState<'Day' | 'Week' | 'Month'>('Week');
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [taskFilter, setTaskFilter] = useState('All');
  const [quickText, setQuickText] = useState('');
  const [plannerText, setPlannerText] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [approved, setApproved] = useState<string[]>([]);
  const [toast, setToast] = useState('');

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify({ tasks, events, preferences }));
  }, [tasks, events, preferences]);
  useEffect(() => {
    let cancelled = false;
    listSavedMedia()
      .then(items => {
        if (!cancelled) setMediaAssets(Object.fromEntries(items.map(item => [item.key, item])));
      })
      .catch(() => {
        if (!cancelled) setMediaStorageMessage('This browser could not open local media storage. Your tasks and events are unaffected.');
      });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    const urls = Object.fromEntries(
      Object.entries(mediaAssets).map(([key, asset]) => [key, URL.createObjectURL(asset.blob)]),
    );
    setMediaUrls(urls);
    return () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  }, [mediaAssets]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', preferences.theme === 'dark');
    document.documentElement.style.setProperty('--primary', preferences.accentColor);
    document.documentElement.style.setProperty('--ring', preferences.accentColor);
    document.documentElement.style.setProperty('--primary-foreground', preferences.theme === 'dark' ? '228 18% 12%' : '40 43% 99%');
  }, [preferences]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 2400);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setModal(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showToast = (message: string) => setToast(message);
  const navigate = (page: Page) => setLocation(page === 'today' ? '/' : `/${page}`);
  const importMedia = async (key: string, file: File) => {
    const imageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    const backgroundTypes = [...imageTypes, 'video/mp4', 'video/webm'];
    const allowedTypes = key === BACKGROUND_MEDIA_KEY ? backgroundTypes : imageTypes;
    const maxBytes = key === BACKGROUND_MEDIA_KEY ? 25 * 1024 * 1024 : 5 * 1024 * 1024;
    if (!allowedTypes.includes(file.type)) {
      showToast(key === BACKGROUND_MEDIA_KEY ? 'Choose an image, GIF, MP4, or WebM file' : 'Choose a PNG, JPEG, WebP, or GIF image');
      return;
    }
    if (file.size > maxBytes) {
      showToast(key === BACKGROUND_MEDIA_KEY ? 'Background files must be 25 MB or smaller' : 'Icon files must be 5 MB or smaller');
      return;
    }
    try {
      await saveMedia(key, file);
      setMediaAssets(previous => ({
        ...previous,
        [key]: { key, blob: file, fileName: file.name, mimeType: file.type },
      }));
      setMediaStorageMessage('');
      showToast('Imported and saved on this device');
    } catch {
      setMediaStorageMessage('This file could not be saved in your browser. Try a smaller file or another browser.');
      showToast('Could not save this media file');
    }
  };
  const removeImportedMedia = async (key: string) => {
    try {
      await deleteMedia(key);
      setMediaAssets(previous => {
        const next = { ...previous };
        delete next[key];
        return next;
      });
      setMediaStorageMessage('');
      showToast('Imported media removed');
    } catch {
      setMediaStorageMessage('This file could not be removed from browser storage.');
      showToast('Could not remove this media file');
    }
  };
  const todayTasks = useMemo(() => tasks.filter(task => task.dueDate === todayKey()), [tasks]);
  const completedToday = todayTasks.filter(task => task.completed).length;
  const upcoming = useMemo(() => [
    ...events.filter(event => event.date === todayKey()).map(event => ({ type: 'event' as const, time: event.startTime, value: event })),
    ...todayTasks.filter(task => !task.completed).map(task => ({ type: 'task' as const, time: task.dueTime || '23:59', value: task })),
  ].sort((a, b) => a.time.localeCompare(b.time)), [events, todayTasks]);

  const saveTask = (task: Task) => {
    setTasks(previous => previous.some(item => item.id === task.id) ? previous.map(item => item.id === task.id ? task : item) : [...previous, task]);
    setModal(null);
    showToast(modal?.value ? 'Task updated' : 'Task added to your day');
  };
  const saveEvent = (event: Event) => {
    setEvents(previous => previous.some(item => item.id === event.id) ? previous.map(item => item.id === event.id ? event : item) : [...previous, event]);
    setModal(null);
    showToast(modal?.value ? 'Event updated' : 'Event added to your calendar');
  };
  const toggleTask = (taskId: string) => setTasks(previous => {
    const task = previous.find(item => item.id === taskId);
    if (!task) return previous;
    const completing = !task.completed;
    const seriesId = task.seriesId ?? task.id;
    let next = previous.map(item => item.id === taskId
      ? { ...item, completed: completing, ...(item.repeat !== 'Never' ? { seriesId } : {}) }
      : item);
    if (completing && task.repeat !== 'Never') {
      let dueDate = nextRepeatDate(task.dueDate, task.repeat);
      while (dueDate <= todayKey()) dueDate = nextRepeatDate(dueDate, task.repeat);
      const alreadyScheduled = next.some(item => item.seriesId === seriesId && item.dueDate === dueDate);
      if (!alreadyScheduled) {
        next = [...next, { ...task, id: id(), seriesId, dueDate, completed: false }];
      }
    }
    return next;
  });
  const deleteTask = (taskId: string) => { setTasks(previous => previous.filter(task => task.id !== taskId)); showToast('Task removed'); };
  const deleteEvent = (eventId: string) => { setEvents(previous => previous.filter(event => event.id !== eventId)); showToast('Event removed'); };
  const quickAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!quickText.trim()) return;
    setTasks(previous => [...previous, { id: id(), title: quickText.trim(), dueDate: todayKey(), dueTime: '', category: 'Personal', priority: 'Medium', repeat: 'Never', completed: false }]);
    setQuickText('');
    showToast('Added to your checklist');
  };

  const generatePlan = () => {
    if (!plannerText.trim()) { showToast('Add a little context first'); return; }
    const snippets = plannerText.split(/[,\n.!?]+/).map(part => part.trim()).filter(Boolean);
    const titles = snippets.length ? snippets.slice(0, 3) : ['Focus time', 'Take a break'];
    const slots = ['11:00', '13:30', '16:00'];
    const next = titles.map((title, index) => ({
      id: `proposal-${id()}-${index}`,
      title: title.length > 48 ? `${title.slice(0, 45)}…` : title.charAt(0).toUpperCase() + title.slice(1),
      date: selectedDate,
      startTime: slots[index] ?? '17:00',
      endTime: `${String(Number(slots[index]?.slice(0, 2) ?? 17) + 1).padStart(2, '0')}:00`,
      category: 'Personal' as Category,
      notes: 'Suggested by the Dayweave demo planner',
    }));
    setProposals(next);
    setApproved(next.map(item => item.id));
    showToast('Sample schedule is ready to review');
  };
  const addApproved = () => {
    const chosen = proposals.filter(item => approved.includes(item.id));
    if (!chosen.length) { showToast('Choose at least one suggestion'); return; }
    setEvents(previous => [...previous, ...chosen.map(({ id: proposalId, ...item }) => ({ ...item, id: id() }))]);
    setProposals([]);
    setPlannerText('');
    showToast(`${chosen.length} ${chosen.length === 1 ? 'event added' : 'events added'}`);
  };
  const categoryArtwork = Object.fromEntries(
    CATEGORIES.map(category => [category, mediaUrls[categoryMediaKey(category)] ?? '']),
  ) as Record<Category, string>;
  const backgroundUrl = mediaUrls[BACKGROUND_MEDIA_KEY];
  const backgroundAsset = mediaAssets[BACKGROUND_MEDIA_KEY];
  const brandMarkUrl = mediaUrls[BRAND_MEDIA_KEY];

  return (
    <div className={`app-shell ${preferences.compactMode ? 'compact' : ''}`} data-testid="app-dayweave">
      {backgroundUrl && backgroundAsset && (
        <div className="background-media" aria-hidden="true" data-testid="background-media">
          {backgroundAsset.mimeType.startsWith('video/')
            ? <video src={backgroundUrl} autoPlay muted loop playsInline />
            : <img src={backgroundUrl} alt="" />}
        </div>
      )}
      <CategoryMediaContext.Provider value={categoryArtwork}>
      <aside className="desktop-rail">
        <div className="brand"><span className="brand-mark">{brandMarkUrl ? <img src={brandMarkUrl} alt="" /> : <CalendarDays size={18} />}</span>dayweave</div>
        <nav className="rail-nav" aria-label="Main navigation">
          {NAV.map(({ id: page, label, icon: Icon }) => <button key={page} className={currentPage === page ? 'active' : ''} onClick={() => navigate(page)} data-testid={`nav-${page}`} aria-current={currentPage === page ? 'page' : undefined}><Icon />{label}</button>)}
        </nav>
        <div className="rail-bottom">A little more room for what matters.</div>
      </aside>
      <main className="main-content">
        {currentPage === 'today' && <TodayPage tasks={todayTasks} upcoming={upcoming} completed={completedToday} onToggle={toggleTask} onQuickAdd={quickAdd} quickText={quickText} setQuickText={setQuickText} onAddTask={() => setModal({ kind: 'task' })} onEditTask={(task) => setModal({ kind: 'task', value: task })} onPlannerChange={setPlannerText} plannerText={plannerText} onGeneratePlan={generatePlan} proposals={proposals} approved={approved} setApproved={setApproved} onAddApproved={addApproved} />}
        {currentPage === 'calendar' && <CalendarPage events={events} tasks={tasks} selectedDate={selectedDate} setSelectedDate={setSelectedDate} calendarView={calendarView} setCalendarView={setCalendarView} calendarMonth={calendarMonth} setCalendarMonth={setCalendarMonth} onAdd={() => setModal({ kind: 'event', defaultDate: selectedDate })} onEdit={(event) => setModal({ kind: 'event', value: event })} onDelete={deleteEvent} onToggleTask={toggleTask} onEditTask={(task) => setModal({ kind: 'task', value: task })} />}
        {currentPage === 'tasks' && <TasksPage tasks={tasks} filter={taskFilter} setFilter={setTaskFilter} onAdd={() => setModal({ kind: 'task' })} onToggle={toggleTask} onEdit={(task) => setModal({ kind: 'task', value: task })} onDelete={deleteTask} />}
        {currentPage === 'settings' && <SettingsPage preferences={preferences} onChange={setPreferences} mediaAssets={mediaAssets} mediaUrls={mediaUrls} mediaStorageMessage={mediaStorageMessage} onImportMedia={importMedia} onRemoveMedia={removeImportedMedia} />}
      </main>
      <nav className="bottom-nav" aria-label="Main navigation">
        {NAV.map(({ id: page, label, icon: Icon }) => <button key={page} className={`nav-item ${currentPage === page ? 'active' : ''}`} onClick={() => navigate(page)} data-testid={`nav-${page}`} aria-current={currentPage === page ? 'page' : undefined}><Icon /><span>{label}</span></button>)}
      </nav>
      {modal && <EntryModal key={`${modal.kind}-${modal.value?.id ?? 'new'}`} modal={modal} onClose={() => setModal(null)} onSaveTask={saveTask} onSaveEvent={saveEvent} onDeleteTask={deleteTask} onDeleteEvent={deleteEvent} />}
      {toast && <div className="toast-note" role="status" data-testid="status-toast">{toast}</div>}
      </CategoryMediaContext.Provider>
    </div>
  );
}

type UpcomingItem = { type: 'event' | 'task'; time: string; value: Event | Task };

function TodayPage({ tasks, upcoming, completed, onToggle, onQuickAdd, quickText, setQuickText, onAddTask, onEditTask, onPlannerChange, plannerText, onGeneratePlan, proposals, approved, setApproved, onAddApproved }: {
  tasks: Task[]; upcoming: UpcomingItem[]; completed: number; onToggle: (id: string) => void; onQuickAdd: (event: FormEvent) => void; quickText: string; setQuickText: (value: string) => void; onAddTask: () => void; onEditTask: (task: Task) => void; onPlannerChange: (value: string) => void; plannerText: string; onGeneratePlan: () => void; proposals: Proposal[]; approved: string[]; setApproved: (ids: string[]) => void; onAddApproved: () => void;
}) {
  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const progress = tasks.length ? Math.round(completed / tasks.length * 100) : 0;
  return (
    <>
      <header className="page-heading">
        <p className="eyebrow">Your day, gently arranged</p>
        <h1 className="page-title">Today</h1>
      </header>
      <div className="today-layout">
        <div className="today-primary">
          <section className="panel greeting-card" data-testid="card-today-greeting">
            <div className="greeting-date">{formatDate(todayKey())}</div>
            <h2 className="greeting-title">{greeting}, friend.</h2>
            <p className="greeting-copy">A fresh page, at your own pace. Make a little space for the things that matter.</p>
          </section>
          <div className="section-heading"><h2>Your day</h2><span className="eyebrow" style={{ margin: 0 }}>{formatDate(todayKey(), { month: 'short', day: 'numeric' })}</span></div>
          {upcoming.length > 0 ? <div className="item-list">
            {upcoming.map(item => item.type === 'event' ? <ScheduleEvent key={`event-${item.value.id}`} event={item.value as Event} /> : <ScheduleTask key={`task-${item.value.id}`} task={item.value as Task} onToggle={onToggle} onEdit={onEditTask} />)}
          </div> : <EmptyState icon={<CalendarDays size={19} />} title="A little breathing room" description="Nothing on the schedule just yet. Add something when you’re ready." />}
          <form className="quick-add" onSubmit={onQuickAdd}>
            <input aria-label="Add a task to today" data-testid="input-quick-add" placeholder="Add a small thing to your list…" value={quickText} onChange={event => setQuickText(event.target.value)} />
            <button className="primary-button" type="submit" aria-label="Add quick task" data-testid="button-quick-add"><Plus size={18} /><span>Add</span></button>
          </form>
        </div>
        <div className="today-secondary">
          <div className="section-heading"><h2>Checklist</h2><button className="quiet-button" onClick={onAddTask} data-testid="button-add-task">+ New task</button></div>
          <div className="panel progress-card" data-testid="status-completion-progress">
            <div className="progress-ring" style={{ '--progress': `${progress}%` } as CSSProperties}><span>{progress}%</span></div>
            <div className="progress-copy"><strong>{completed} of {tasks.length} done</strong><small>{tasks.length && completed === tasks.length ? 'You made room for it all.' : 'One thing at a time is plenty.'}</small></div>
          </div>
          <div className="item-list" style={{ marginTop: 10 }}>
            {tasks.length ? tasks.map(task => <TaskRow key={task.id} task={task} onToggle={onToggle} onEdit={onEditTask} compact />) : <EmptyState icon={<Check size={19} />} title="Your list is open" description="Add a task whenever something comes to mind." />}
          </div>
          <section className="panel demo-panel" style={{ marginTop: 22 }} data-testid="card-demo-planner">
            <span className="demo-badge">DEMO PLANNER</span>
            <h2>Find a little flow</h2>
            <p>Share what’s on your mind to see a sample schedule. Suggestions are only added when you approve them.</p>
            <textarea className="demo-input" aria-label="Describe what you need to make time for" data-testid="input-demo-planner" placeholder="For example: finish my notes, make lunch, take a walk…" value={plannerText} onChange={event => onPlannerChange(event.target.value)} />
            <button className="secondary-button" onClick={onGeneratePlan} data-testid="button-generate-demo-plan"><Sparkles size={15} style={{ verticalAlign: 'middle', marginRight: 7 }} />Make a sample plan</button>
            {proposals.length > 0 && <div className="proposal" data-testid="list-demo-proposals">
              <div className="eyebrow" style={{ marginBottom: 4 }}>Sample suggestions · review before adding</div>
              {proposals.map(proposal => <label className="proposal-row" key={proposal.id} data-testid={`proposal-${proposal.id}`}><input type="checkbox" checked={approved.includes(proposal.id)} onChange={event => setApproved(event.target.checked ? [...approved, proposal.id] : approved.filter(item => item !== proposal.id))} /><span>{proposal.title}</span><small>{timeLabel(proposal.startTime)}</small></label>)}
              <button className="primary-button" style={{ width: '100%', marginTop: 8 }} onClick={onAddApproved} data-testid="button-approve-proposals"><CalendarPlus size={16} />Add selected to calendar</button>
            </div>}
          </section>
        </div>
      </div>
    </>
  );
}

function ScheduleEvent({ event }: { event: Event }) {
  return <div className="schedule-row" data-testid={`row-schedule-event-${event.id}`}><span className="time-label">{timeLabel(event.startTime)}</span><CategoryMark category={event.category} /><div className="item-main"><strong>{event.title}</strong><small>{event.category} · Event{event.endTime ? ` · until ${timeLabel(event.endTime)}` : ''}</small></div><CalendarDays size={16} color="hsl(var(--muted-foreground))" /></div>;
}

function ScheduleTask({ task, onToggle, onEdit }: { task: Task; onToggle: (id: string) => void; onEdit: (task: Task) => void }) {
  return <div className="schedule-row" data-testid={`row-schedule-task-${task.id}`}><span className="time-label">{timeLabel(task.dueTime) || 'Anytime'}</span><CategoryMark category={task.category} /><div className="item-main"><strong className={task.completed ? 'task-title done' : ''}>{task.title}</strong><small>{task.category} · Task</small></div><button className={`check-button ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task.id)} aria-label={`${task.completed ? 'Mark incomplete' : 'Complete'} ${task.title}`} data-testid={`button-toggle-${task.id}`}>{task.completed && <Check size={15} />}</button><button className="icon-button" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} data-testid={`button-edit-${task.id}`}><Pencil size={15} /></button></div>;
}

function CategoryMark({ category }: { category: Category }) {
  const artwork = useContext(CategoryMediaContext)[category];
  return artwork
    ? <img className="category-custom-icon" src={artwork} alt="" aria-hidden="true" data-testid={`icon-category-${category.toLowerCase()}`} />
    : <span className="category-mark" style={{ background: CATEGORY_COLORS[category] }} aria-hidden="true" />;
}

function TaskRow({ task, onToggle, onEdit, onDelete, compact = false }: { task: Task; onToggle: (id: string) => void; onEdit: (task: Task) => void; onDelete?: (id: string) => void; compact?: boolean }) {
  return <div className="task-row" data-testid={`row-task-${task.id}`}>
    <button className={`check-button ${task.completed ? 'checked' : ''}`} onClick={() => onToggle(task.id)} aria-label={`${task.completed ? 'Mark incomplete' : 'Complete'} ${task.title}`} data-testid={`button-toggle-${task.id}`}>{task.completed && <Check size={15} />}</button>
    <CategoryMark category={task.category} />
    <div className="item-main">
      <strong className={task.completed ? 'task-title done' : ''}>{task.title}</strong>
      {!compact && <div className="task-meta"><span className="tag">{task.category}</span><span className="tag">{task.priority} priority</span>{task.repeat !== 'Never' && <span className="tag"><Repeat2 size={11} />{task.repeat}</span>}<span className="tag"><Clock3 size={11} />{formatDate(task.dueDate, { month: 'short', day: 'numeric' })}{task.dueTime ? ` · ${timeLabel(task.dueTime)}` : ''}</span></div>}
      {compact && <small>{task.category}{task.dueTime ? ` · ${timeLabel(task.dueTime)}` : ''}</small>}
    </div>
    <button className="icon-button" onClick={() => onEdit(task)} aria-label={`Edit ${task.title}`} data-testid={`button-edit-${task.id}`}><Pencil size={15} /></button>
    {!compact && onDelete && <button className="icon-button" onClick={() => onDelete(task.id)} aria-label={`Delete ${task.title}`} data-testid={`button-delete-${task.id}`}><Trash2 size={16} /></button>}
  </div>;
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="panel empty-state" data-testid="status-empty-state"><div className="empty-mark">{icon}</div><strong>{title}</strong><p>{description}</p></div>;
}

function TasksPage({ tasks, filter, setFilter, onAdd, onToggle, onEdit, onDelete }: { tasks: Task[]; filter: string; setFilter: (filter: string) => void; onAdd: () => void; onToggle: (id: string) => void; onEdit: (task: Task) => void; onDelete: (id: string) => void }) {
  const filters = ['All', 'Today', 'Upcoming', 'Completed'];
  const filtered = tasks.filter(task => filter === 'All' || (filter === 'Today' && task.dueDate === todayKey()) || (filter === 'Upcoming' && task.dueDate > todayKey() && !task.completed) || (filter === 'Completed' && task.completed));
  return <>
    <header className="page-heading"><p className="eyebrow">A place for all the little things</p><h1 className="page-title">Tasks</h1><p className="page-subtitle">{tasks.filter(task => !task.completed).length} things still on your mind</p></header>
    <div className="toolbar task-toolbar"><div className="task-filters" role="tablist" aria-label="Filter tasks">{filters.map(value => <button className={`filter-chip ${filter === value ? 'active' : ''}`} key={value} onClick={() => setFilter(value)} role="tab" aria-selected={filter === value} data-testid={`filter-${value.toLowerCase()}`}>{value}</button>)}</div><button className="primary-button" onClick={onAdd} data-testid="button-create-task"><Plus size={17} />New task</button></div>
    <div className="item-list">{filtered.length ? filtered.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.dueTime.localeCompare(b.dueTime)).map(task => <TaskRow key={task.id} task={task} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} />) : <EmptyState icon={<ListChecks size={19} />} title={filter === 'Completed' ? 'Nothing checked off yet' : 'A clear little slate'} description={filter === 'All' ? 'Create a task and keep it somewhere gentle.' : `There are no ${filter.toLowerCase()} tasks right now.`} />}</div>
    <div className="section-heading"><h2>Categories</h2></div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{CATEGORIES.map(category => <span className="tag" key={category} style={{ background: `${CATEGORY_COLORS[category]}20`, color: CATEGORY_COLORS[category] }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: CATEGORY_COLORS[category] }} />{category}</span>)}</div>
  </>;
}

function CalendarPage({ events, tasks, selectedDate, setSelectedDate, calendarView, setCalendarView, calendarMonth, setCalendarMonth, onAdd, onEdit, onDelete, onToggleTask, onEditTask }: { events: Event[]; tasks: Task[]; selectedDate: string; setSelectedDate: (date: string) => void; calendarView: 'Day' | 'Week' | 'Month'; setCalendarView: (view: 'Day' | 'Week' | 'Month') => void; calendarMonth: Date; setCalendarMonth: (date: Date) => void; onAdd: () => void; onEdit: (event: Event) => void; onDelete: (id: string) => void; onToggleTask: (id: string) => void; onEditTask: (task: Task) => void }) {
  const selectedEvents = events.filter(event => event.date === selectedDate).sort((a, b) => a.startTime.localeCompare(b.startTime));
  const selectedTasks = tasks.filter(task => task.dueDate === selectedDate).sort((a, b) => a.dueTime.localeCompare(b.dueTime));
  const monthDays = useMemo(() => {
    const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [calendarMonth]);
  const weekDays = useMemo(() => {
    const day = dateFromKey(selectedDate);
    const start = addDays(day, -day.getDay());
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [selectedDate]);
  const changePeriod = (amount: number) => {
    if (calendarView === 'Day') setSelectedDate(dateKey(addDays(dateFromKey(selectedDate), amount)));
    else if (calendarView === 'Week') setSelectedDate(dateKey(addDays(dateFromKey(selectedDate), amount * 7)));
    else setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + amount, 1));
  };
  const dateTitle = calendarView === 'Month' ? calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : calendarView === 'Week' ? `${formatDate(dateKey(weekDays[0]), { month: 'short', day: 'numeric' })} – ${formatDate(dateKey(weekDays[6]), { month: 'short', day: 'numeric' })}` : formatDate(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' });
  const dotsFor = (date: Date) => {
    const key = dateKey(date);
    const colors = events.filter(item => item.date === key).map(item => CATEGORY_COLORS[item.category]).slice(0, 3);
    tasks.filter(item => item.dueDate === key && !item.completed).slice(0, Math.max(0, 3 - colors.length)).forEach(item => colors.push(CATEGORY_COLORS[item.category]));
    return colors;
  };
  return <>
    <header className="page-heading"><p className="eyebrow">A softer shape to the week</p><h1 className="page-title">Calendar</h1><p className="page-subtitle">See what’s ahead, one day at a time.</p></header>
    <div className="toolbar">
      <div className="segmented" role="tablist" aria-label="Calendar view">{(['Day', 'Week', 'Month'] as const).map(view => <button key={view} className={calendarView === view ? 'selected' : ''} onClick={() => setCalendarView(view)} role="tab" aria-selected={calendarView === view} data-testid={`calendar-view-${view.toLowerCase()}`}>{view}</button>)}</div>
      <button className="primary-button" onClick={onAdd} data-testid="button-create-event"><Plus size={17} />Add event</button>
    </div>
    <section className="panel" style={{ padding: 15 }}>
      <div className="calendar-head"><button className="icon-button" aria-label="Previous period" onClick={() => changePeriod(-1)} data-testid="button-calendar-previous"><ChevronLeft /></button><strong data-testid="text-calendar-period">{dateTitle}</strong><button className="icon-button" aria-label="Next period" onClick={() => changePeriod(1)} data-testid="button-calendar-next"><ChevronRight /></button></div>
      {calendarView === 'Month' && <div className="calendar-grid">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <div className="calendar-weekday" key={`${day}-${index}`}>{day}</div>)}{monthDays.map(day => { const key = dateKey(day); const selected = key === selectedDate; return <button key={key} className={`calendar-day ${day.getMonth() === calendarMonth.getMonth() ? '' : 'outside'} ${key === todayKey() ? 'today' : ''} ${selected ? 'selected' : ''}`} onClick={() => setSelectedDate(key)} aria-label={formatDate(key)} aria-pressed={selected} data-testid={`calendar-day-${key}`}><span className="day-number">{day.getDate()}</span><span className="day-dots">{dotsFor(day).map((color, index) => <i key={`${color}-${index}`} className="day-dot" style={{ background: selected ? 'currentColor' : color }} />)}</span></button>; })}</div>}
      {calendarView === 'Week' && <div className="week-grid">{weekDays.map(day => { const key = dateKey(day); return <button key={key} className={`week-day ${selectedDate === key ? 'selected' : ''}`} onClick={() => setSelectedDate(key)} data-testid={`calendar-week-day-${key}`}><strong>{day.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}</strong><span>{day.getDate()}</span><span className="day-dots">{dotsFor(day).map((color, index) => <i key={`${color}-${index}`} className="day-dot" style={{ background: selectedDate === key ? 'currentColor' : color }} />)}</span></button>; })}</div>}
      {calendarView === 'Day' && <div className="calendar-day-focus"><div className="eyebrow" style={{ margin: '7px 0 4px', textAlign: 'center' }}>{dateFromKey(selectedDate).toLocaleDateString('en-US', { weekday: 'long' })}</div><div style={{ textAlign: 'center', font: '700 36px var(--display-font)' }}>{dateFromKey(selectedDate).getDate()}</div></div>}
    </section>
    <div className="section-heading"><h2>{formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}</h2><button className="quiet-button" onClick={() => setSelectedDate(todayKey())} data-testid="button-calendar-today">Today</button></div>
    {selectedEvents.length || selectedTasks.length ? <div className="item-list">
      {selectedEvents.map(event => <div className="event-card" key={event.id} data-testid={`card-event-${event.id}`}><CategoryMark category={event.category} /><div className="event-time">{timeLabel(event.startTime)}{event.endTime && <><br />{timeLabel(event.endTime)}</>}</div><div className="event-body"><strong>{event.title}</strong><p>{event.category}{event.notes ? ` · ${event.notes}` : ''}</p></div><button className="icon-button" aria-label={`Edit ${event.title}`} onClick={() => onEdit(event)} data-testid={`button-edit-event-${event.id}`}><Pencil size={15} /></button><button className="icon-button" aria-label={`Delete ${event.title}`} onClick={() => onDelete(event.id)} data-testid={`button-delete-event-${event.id}`}><Trash2 size={16} /></button></div>)}
      {selectedTasks.map(task => <ScheduleTask key={task.id} task={task} onToggle={onToggleTask} onEdit={onEditTask} />)}
    </div> : <EmptyState icon={<CalendarDays size={19} />} title="Nothing planned for this day" description="Leave it open, or add an event when you have something in mind." />}
  </>;
}

function SettingsPage({ preferences, onChange, mediaAssets, mediaUrls, mediaStorageMessage, onImportMedia, onRemoveMedia }: {
  preferences: Preferences;
  onChange: (preferences: Preferences) => void;
  mediaAssets: Record<string, SavedMedia>;
  mediaUrls: Record<string, string>;
  mediaStorageMessage: string;
  onImportMedia: (key: string, file: File) => void;
  onRemoveMedia: (key: string) => void;
}) {
  const change = (patch: Partial<Preferences>) => onChange({ ...preferences, ...patch });
  const backgroundAsset = mediaAssets[BACKGROUND_MEDIA_KEY];
  const backgroundUrl = mediaUrls[BACKGROUND_MEDIA_KEY];
  const brandAsset = mediaAssets[BRAND_MEDIA_KEY];
  const brandUrl = mediaUrls[BRAND_MEDIA_KEY];
  return <>
    <header className="page-heading"><p className="eyebrow">Make this space yours</p><h1 className="page-title">Settings</h1><p className="page-subtitle">Small comforts, just the way you like them.</p></header>
    <section className="panel settings-group" data-testid="settings-appearance">
      <h2>Appearance</h2>
      <div className="setting-row"><div><strong>Theme</strong><small>Choose a lighter or quieter evening look</small></div><button className="secondary-button" onClick={() => change({ theme: preferences.theme === 'light' ? 'dark' : 'light' })} aria-label={`Switch to ${preferences.theme === 'light' ? 'dark' : 'light'} theme`} data-testid="button-theme-toggle">{preferences.theme === 'light' ? <><Moon size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Light</> : <><Sun size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Dark</>}</button></div>
      <div className="setting-row accent-setting">
        <div><strong>Accent color</strong><small>A small color note throughout your planner</small></div>
        <div className="accent-picker">
          <div className="accent-options" role="radiogroup" aria-label="Accent color">
            {ACCENTS.map(accent => <button key={accent.name} className={`accent-choice ${preferences.accentColor === accent.value ? 'selected' : ''}`} style={{ background: `hsl(${accent.value})` }} onClick={() => change({ accentColor: accent.value })} aria-label={`${accent.name} accent`} aria-checked={preferences.accentColor === accent.value} role="radio" data-testid={`accent-${accent.name.toLowerCase()}`} />)}
          </div>
          <label className="custom-color-control" aria-label="Choose a custom accent color">
            <input type="color" value={hslToHex(preferences.accentColor)} onChange={event => change({ accentColor: hexToHsl(event.target.value) })} aria-label="Custom accent color" data-testid="input-custom-accent" />
            <span>Custom</span>
          </label>
        </div>
      </div>
    </section>
    <section className="panel settings-group" style={{ marginTop: 12 }} data-testid="settings-layout">
      <h2>Layout</h2>
      <div className="setting-row"><div><strong>Compact lists</strong><small>Bring your daily items a little closer together</small></div><button className={`switch ${preferences.compactMode ? 'on' : ''}`} role="switch" aria-checked={preferences.compactMode} aria-label="Compact lists" onClick={() => change({ compactMode: !preferences.compactMode })} data-testid="switch-compact-mode" /></div>
    </section>
    <section className="panel settings-group media-settings" data-testid="settings-media">
      <h2>Personal imagery</h2>
      <p className="media-intro">Make Dayweave feel like yours with images and motion. Files stay in this browser.</p>
      {mediaStorageMessage && <p className="media-error" role="alert" data-testid="status-media-storage">{mediaStorageMessage}</p>}

      <div className="media-block">
        <div className="media-block-header">
          <div><strong>Planner background</strong><small>Choose a still image, animated GIF, or looping video.</small></div>
          <MediaUploadButton label={backgroundAsset ? 'Replace' : 'Import'} accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm" testId="upload-background-media" onSelect={file => onImportMedia(BACKGROUND_MEDIA_KEY, file)} />
        </div>
        {backgroundAsset && backgroundUrl
          ? <div className="media-preview background-preview" data-testid="preview-background-media">
              {backgroundAsset.mimeType.startsWith('video/')
                ? <video src={backgroundUrl} autoPlay muted loop playsInline />
                : <img src={backgroundUrl} alt="Selected planner background" />}
            </div>
          : <div className="media-placeholder" data-testid="empty-background-media">No custom background yet</div>}
        <p className="media-footnote">PNG, JPEG, WebP, GIF, MP4, or WebM · up to 25 MB</p>
        {backgroundAsset && <button className="media-remove-button" onClick={() => onRemoveMedia(BACKGROUND_MEDIA_KEY)} data-testid="button-remove-background">Remove background</button>}
      </div>

      <div className="media-block">
        <div className="media-block-header">
          <div><strong>Dayweave mark</strong><small>Use your own image in the planner’s desktop mark.</small></div>
          <MediaUploadButton label={brandAsset ? 'Replace' : 'Import'} accept="image/png,image/jpeg,image/webp,image/gif" testId="upload-brand-mark" onSelect={file => onImportMedia(BRAND_MEDIA_KEY, file)} />
        </div>
        <div className="brand-media-row">
          <div className="brand-media-preview" data-testid="preview-brand-mark">
            {brandUrl ? <img src={brandUrl} alt="Custom Dayweave mark" /> : <CalendarDays size={20} />}
          </div>
          <span className="media-footnote">PNG, JPEG, WebP, or GIF · up to 5 MB</span>
          {brandAsset && <button className="media-remove-button" onClick={() => onRemoveMedia(BRAND_MEDIA_KEY)} data-testid="button-remove-brand-mark">Remove</button>}
        </div>
      </div>

      <div className="media-block">
        <div className="media-block-header">
          <div><strong>Category icons</strong><small>Replace the colored marker with your own image or animated GIF.</small></div>
        </div>
        <div className="media-category-list">
          {CATEGORIES.map(category => {
            const key = categoryMediaKey(category);
            const asset = mediaAssets[key];
            const url = mediaUrls[key];
            return <div className="media-category-row" key={category} data-testid={`media-category-${category.toLowerCase()}`}>
              <div className="media-category-identity">
                <span className="media-category-preview">
                  {url ? <img src={url} alt="" /> : <span style={{ background: CATEGORY_COLORS[category] }} />}
                </span>
                <span><strong>{category}</strong><small>{asset?.fileName ?? 'Default color marker'}</small></span>
              </div>
              <div className="media-category-actions">
                <MediaUploadButton label={asset ? 'Replace' : 'Add icon'} accept="image/png,image/jpeg,image/webp,image/gif" testId={`upload-icon-${category.toLowerCase()}`} onSelect={file => onImportMedia(key, file)} />
                {asset && <button className="media-remove-button" onClick={() => onRemoveMedia(key)} data-testid={`button-remove-icon-${category.toLowerCase()}`}>Remove</button>}
              </div>
            </div>;
          })}
        </div>
      </div>
      <p className="media-footnote">Supported icon files: PNG, JPEG, WebP, or GIF · up to 5 MB each.</p>
    </section>
    <section className="panel settings-group" style={{ marginTop: 12 }}>
      <h2>About Dayweave</h2><div style={{ display: 'flex', gap: 11, alignItems: 'flex-start', color: 'hsl(var(--muted-foreground))', fontSize: 12, lineHeight: 1.55 }}><CircleHelp size={17} style={{ flex: '0 0 auto', color: 'hsl(var(--primary))' }} /><span>Your tasks, events, and preferences stay in this browser. The demo planner creates sample suggestions only; nothing is sent to a service.</span></div>
    </section>
  </>;
}

function MediaUploadButton({ label, accept, testId, onSelect }: {
  label: string;
  accept: string;
  testId: string;
  onSelect: (file: File) => void;
}) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file) onSelect(file);
    input.value = '';
  };
  return <label className="media-upload-button">
    <Upload size={14} aria-hidden="true" />
    <span>{label}</span>
    <input type="file" accept={accept} aria-label={label} data-testid={testId} onChange={handleChange} />
  </label>;
}

function EntryModal({ modal, onClose, onSaveTask, onSaveEvent, onDeleteTask, onDeleteEvent }: { modal: Exclude<ModalState, null>; onClose: () => void; onSaveTask: (task: Task) => void; onSaveEvent: (event: Event) => void; onDeleteTask: (id: string) => void; onDeleteEvent: (id: string) => void }) {
  const isTask = modal.kind === 'task';
  const existing = modal.value;
  const [title, setTitle] = useState(existing?.title ?? '');
  const [date, setDate] = useState(isTask ? (existing as Task | undefined)?.dueDate ?? modal.defaultDate ?? todayKey() : (existing as Event | undefined)?.date ?? modal.defaultDate ?? todayKey());
  const [time, setTime] = useState(isTask ? (existing as Task | undefined)?.dueTime ?? '' : (existing as Event | undefined)?.startTime ?? '09:00');
  const [endTime, setEndTime] = useState((existing as Event | undefined)?.endTime ?? '10:00');
  const [category, setCategory] = useState<Category>(existing?.category ?? 'Personal');
  const [priority, setPriority] = useState<Priority>((existing as Task | undefined)?.priority ?? 'Medium');
  const [repeat, setRepeat] = useState<Repeat>((existing as Task | undefined)?.repeat ?? 'Never');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [completed, setCompleted] = useState((existing as Task | undefined)?.completed ?? false);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    if (isTask) onSaveTask({ id: existing?.id ?? id(), title: title.trim(), dueDate: date, dueTime: time, category, priority, repeat, completed, notes: notes.trim() || undefined });
    else onSaveEvent({ id: existing?.id ?? id(), title: title.trim(), date, startTime: time, endTime, category, notes: notes.trim() || undefined });
  };
  const deleteItem = () => {
    if (!existing) return;
    if (isTask) onDeleteTask(existing.id); else onDeleteEvent(existing.id);
    onClose();
  };
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }} data-testid="dialog-backdrop">
    <section className="modal" role="dialog" aria-modal="true" aria-labelledby="entry-modal-title">
      <div className="modal-header"><h2 id="entry-modal-title">{existing ? `Edit ${isTask ? 'task' : 'event'}` : `Add ${isTask ? 'a task' : 'an event'}`}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog" data-testid="button-close-dialog"><X /></button></div>
      <form onSubmit={save}>
        <div className="form-grid">
          <div className="field full"><label htmlFor="entry-title">What would you like to call it?</label><input id="entry-title" autoFocus required value={title} onChange={event => setTitle(event.target.value)} placeholder={isTask ? 'A thing to remember…' : 'A moment on your calendar…'} data-testid="input-entry-title" /></div>
          <div className="field"><label htmlFor="entry-date">Date</label><input id="entry-date" type="date" required value={date} onChange={event => setDate(event.target.value)} data-testid="input-entry-date" /></div>
          <div className="field"><label htmlFor="entry-time">{isTask ? 'Due time' : 'Starts'}</label><input id="entry-time" type="time" value={time} onChange={event => setTime(event.target.value)} data-testid="input-entry-time" /></div>
          {!isTask && <div className="field"><label htmlFor="entry-end-time">Ends</label><input id="entry-end-time" type="time" value={endTime} onChange={event => setEndTime(event.target.value)} data-testid="input-entry-end-time" /></div>}
          <div className="field"><label htmlFor="entry-category">Category</label><select id="entry-category" value={category} onChange={event => setCategory(event.target.value as Category)} data-testid="select-entry-category">{CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></div>
          {isTask && <><div className="field"><label htmlFor="entry-priority">Priority</label><select id="entry-priority" value={priority} onChange={event => setPriority(event.target.value as Priority)} data-testid="select-entry-priority">{(['Low', 'Medium', 'High'] as Priority[]).map(item => <option key={item}>{item}</option>)}</select></div><div className="field"><label htmlFor="entry-repeat">Repeat</label><select id="entry-repeat" value={repeat} onChange={event => setRepeat(event.target.value as Repeat)} data-testid="select-entry-repeat">{(['Never', 'Daily', 'Weekly', 'Monthly'] as Repeat[]).map(item => <option key={item}>{item}</option>)}</select></div><div className="field full"><label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" checked={completed} onChange={event => setCompleted(event.target.checked)} data-testid="checkbox-entry-completed" />Already completed</label></div></>}
          <div className="field full"><label htmlFor="entry-notes">Notes <span style={{ fontWeight: 400 }}>(optional)</span></label><textarea id="entry-notes" value={notes} onChange={event => setNotes(event.target.value)} placeholder="Anything else worth remembering?" data-testid="input-entry-notes" /></div>
        </div>
        <div className="form-actions">{existing && <button type="button" className="secondary-button" style={{ marginRight: 'auto', color: 'hsl(var(--destructive))' }} onClick={deleteItem} data-testid="button-delete-entry"><Trash2 size={15} style={{ verticalAlign: 'middle', marginRight: 6 }} />Delete</button>}<button type="button" className="secondary-button" onClick={onClose} data-testid="button-cancel-entry">Cancel</button><button type="submit" className="primary-button" data-testid="button-save-entry">{existing ? 'Save changes' : `Add ${isTask ? 'task' : 'event'}`}</button></div>
      </form>
    </section>
  </div>;
}

export default App;
