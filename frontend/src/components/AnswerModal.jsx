import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Activity,
  AlertCircle,
  Bell,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ClipboardList,
  Clock,
  Copy,
  CornerLeftUp,
  ExternalLink,
  File,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  FolderOpen,
  FolderTree,
  HelpCircle,
  Info,
  Loader2,
  LogOut,
  MapPin,
  Play,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Shield,
  ShieldAlert,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
} from "lucide-react";

/**
 * Formats fenced code blocks with language indicators and one-click clipboard copying.
 */
function Code({ inline, className, children }) {
  const [done, setDone] = useState(false);
  const code = String(children).replace(/\n$/, "");

  if (inline || (!/\n/.test(String(children)) && !className)) {
    return <code className="md-inline">{children}</code>;
  }

  const lang = /language-(\w+)/.exec(className || "")?.[1];

  const copy = () => {
    navigator.clipboard?.writeText(code);
    setDone(true);
    setTimeout(() => setDone(false), 1200);
  };

  return (
    <div className="md-code">
      <div className="md-code-bar">
        <span>{lang || "code"}</span>
        <button type="button" onClick={copy} title="Copy code block">
          {done ? "Copied" : "Copy"}
        </button>
      </div>
      <pre>
        <code className={className}>{code}</code>
      </pre>
    </div>
  );
}

const EMOJI_ICON_MAP = {
  "📋": () => <ClipboardList size={15} className="md-inline-icon text-indigo-400" />,
  "✅": () => <CheckCircle2 size={15} className="md-inline-icon text-emerald-400" />,
  "✓": () => <Check size={14} className="md-inline-icon text-emerald-400" />,
  "⏳": () => <Clock size={15} className="md-inline-icon text-amber-400" />,
  "⏰": () => <Clock size={15} className="md-inline-icon text-amber-400" />,
  "⏱️": () => <Clock size={15} className="md-inline-icon text-amber-400" />,
  "⏱": () => <Clock size={15} className="md-inline-icon text-amber-400" />,
  "🏫": () => <Calendar size={15} className="md-inline-icon text-sky-400" />,
  "📅": () => <Calendar size={15} className="md-inline-icon text-sky-400" />,
  "🗓️": () => <Calendar size={15} className="md-inline-icon text-sky-400" />,
  "🗓": () => <Calendar size={15} className="md-inline-icon text-sky-400" />,
  "🎉": () => <Sparkles size={15} className="md-inline-icon text-purple-400" />,
  "⚠️": () => <AlertCircle size={15} className="md-inline-icon text-amber-400" />,
  "❗": () => <AlertCircle size={15} className="md-inline-icon text-rose-400" />,
  "💡": () => <Sparkles size={15} className="md-inline-icon text-yellow-400" />,
  "📌": () => <MapPin size={15} className="md-inline-icon text-rose-400" />,
  "❌": () => <X size={14} className="md-inline-icon text-rose-400" />,
};

function replaceEmojisWithIcons(text) {
  if (typeof text !== "string") return text;
  const emojiRegex = /(📋|✅|✓|⏳|⏰|⏱️|⏱|🏫|📅|🗓️|🗓|🎉|⚠️|❗|💡|📌|❌)/g;
  const parts = text.split(emojiRegex);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    const IconComponent = EMOJI_ICON_MAP[part];
    if (IconComponent) {
      return <React.Fragment key={i}>{IconComponent()}</React.Fragment>;
    }
    return part;
  });
}

function renderWithLucide(children) {
  if (typeof children === "string") {
    return replaceEmojisWithIcons(children);
  }
  if (Array.isArray(children)) {
    return children.map((c, i) => (
      <React.Fragment key={i}>{renderWithLucide(c)}</React.Fragment>
    ));
  }
  if (React.isValidElement(children) && children.props?.children) {
    return React.cloneElement(children, {
      children: renderWithLucide(children.props.children),
    });
  }
  return children;
}

function getHeadingIcon(children) {
  const extractText = (node) => {
    if (!node) return "";
    if (typeof node === "string") return node;
    if (Array.isArray(node)) return node.map(extractText).join(" ");
    if (node.props?.children) return extractText(node.props.children);
    return "";
  };
  const s = extractText(children).toLowerCase();
  if (s.includes("summary") || s.includes("progress")) {
    return <ClipboardList size={17} className="md-heading-icon text-indigo-400" />;
  }
  if (s.includes("completed")) {
    return <CheckCircle2 size={15} className="md-heading-icon text-emerald-400" />;
  }
  if (s.includes("remaining") || s.includes("pending")) {
    return <Clock size={15} className="md-heading-icon text-amber-400" />;
  }
  if (s.includes("schedule") || s.includes("timetable") || s.includes("lecture")) {
    return <Calendar size={15} className="md-heading-icon text-sky-400" />;
  }
  if (s.includes("application") || s.includes("workstation") || s.includes("usage") || s.includes("activity")) {
    return <Activity size={15} className="md-heading-icon text-purple-400" />;
  }
  return null;
}

const components = {
  a: ({ href, children }) => (
    <a className="md-link" href={href} target="_blank" rel="noopener noreferrer" title={href}>
      {renderWithLucide(children)}
      <ExternalLink size={11} className="inline ml-1 opacity-70" />
    </a>
  ),
  img: () => null,
  code: Code,
  h1: ({ children, ...props }) => (
    <h1 {...props}>
      {getHeadingIcon(children)}
      {renderWithLucide(children)}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 {...props}>
      {getHeadingIcon(children)}
      {renderWithLucide(children)}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 {...props}>
      {getHeadingIcon(children)}
      {renderWithLucide(children)}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 {...props}>
      {getHeadingIcon(children)}
      {renderWithLucide(children)}
    </h4>
  ),
  p: ({ children, ...props }) => <p {...props}>{renderWithLucide(children)}</p>,
  li: ({ children, checked, className, ...props }) => {
    if (typeof checked === "boolean" || (className && className.includes("task-list-item"))) {
      return (
        <li className="md-task-item" {...props}>
          {checked ? (
            <CheckSquare size={15} className="md-task-icon checked" />
          ) : (
            <Square size={15} className="md-task-icon unchecked" />
          )}
          <span className="md-task-text">{renderWithLucide(children)}</span>
        </li>
      );
    }
    return <li {...props}>{renderWithLucide(children)}</li>;
  },
  input: ({ type, checked, ...props }) => {
    if (type === "checkbox") {
      return checked ? (
        <CheckSquare size={15} className="md-task-icon checked" />
      ) : (
        <Square size={15} className="md-task-icon unchecked" />
      );
    }
    return <input type={type} {...props} />;
  },
  blockquote: ({ children, ...props }) => (
    <blockquote className="md-blockquote" {...props}>
      {renderWithLucide(children)}
    </blockquote>
  ),
  table: ({ children, ...props }) => (
    <div className="md-table-wrap">
      <table className="md-table" {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ children, ...props }) => <th {...props}>{renderWithLucide(children)}</th>,
  td: ({ children, ...props }) => <td {...props}>{renderWithLucide(children)}</td>,
};

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileItemIcon(item) {
  if (item.is_dir) return <Folder size={16} className="file-item-icon folder" />;
  const ext = (item.ext || "").toLowerCase();
  if (["py", "js", "jsx", "ts", "tsx", "html", "css", "json", "sh", "bat", "yml", "yaml"].includes(ext)) {
    return <FileCode size={16} className="file-item-icon code" />;
  }
  if (["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"].includes(ext)) {
    return <FileImage size={16} className="file-item-icon img" />;
  }
  if (["csv", "xlsx", "xls"].includes(ext)) {
    return <FileSpreadsheet size={16} className="file-item-icon sheet" />;
  }
  return <FileText size={16} className="file-item-icon doc" />;
}

/**
 * Top-middle interactive workspace modal providing tabs for:
 * 1. Answer (Company & Space policy responses and guidance)
 * 2. Files (Interactive folder and file browser)
 * 3. Tasks (Interactive to-do checklist with toggle, add, delete)
 * 4. Notes (Interactive markdown scratchpad with view, edit, save, delete)
 * 5. Timers & Reminders (Countdowns, Pomodoro presets, scheduled reminders)
 * 6. Help (Information guide on types of queries supported)
 */
const WEEKDAYS = [
  { id: 0, short: "Mon", full: "Monday" },
  { id: 1, short: "Tue", full: "Tuesday" },
  { id: 2, short: "Wed", full: "Wednesday" },
  { id: 3, short: "Thu", full: "Thursday" },
  { id: 4, short: "Fri", full: "Friday" },
];

export default function AnswerModal({
  conversation = [],
  turn,
  activeTab = "answer",
  onTabChange,
  vault = { tasks: [], notes: [] },
  filesView = null,
  scheduleView = null,
  onFetchSchedule,
  onOpenPath,
  onListFolder,
  onMutateTask,
  onMutateNote,
  onRunCommand,
  onClose,
  onLogout,
  busy,
}) {
  const body = useRef(null);
  const stick = useRef(true);
  const [copied, setCopied] = useState(false);
  const [followUpText, setFollowUpText] = useState("");

  // Files state
  const [fileFilter, setFileFilter] = useState("");
  const [recursiveMode, setRecursiveMode] = useState(false);

  // Tasks state
  const [newTaskText, setNewTaskText] = useState("");
  const [newTaskDue, setNewTaskDue] = useState("");

  // Notes state
  const [selectedNote, setSelectedNote] = useState(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteDirty, setNoteDirty] = useState(false);
  const [isCreatingNewNote, setIsCreatingNewNote] = useState(false);

  // Timers & Reminders state
  const [customTimerDuration, setCustomTimerDuration] = useState("");
  const [customTimerLabel, setCustomTimerLabel] = useState("");
  const [reminderText, setReminderText] = useState("");
  const [reminderWhen, setReminderWhen] = useState("");

  // Schedule state (5 working days only: Monday to Friday)
  const [scheduleDayFilter, setScheduleDayFilter] = useState("today");

  const tab = activeTab || "answer";

  // Schedule calculations (5 working days: Mon - Fri)
  const rawScheduleSlots = scheduleView?.slots || [];
  const allScheduleSlots = useMemo(() => {
    const slotMap = new Map();
    for (const slot of rawScheduleSlots) {
      if (!slot) continue;
      const pad = (t) => {
        if (!t) return "";
        const parts = String(t).split(":");
        return `${String(parts[0]).padStart(2, "0")}:${String(parts[1] || "00").padStart(2, "0")}`;
      };
      const key = `${slot.weekday}_${pad(slot.start)}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, slot);
      } else {
        const existing = slotMap.get(key);
        const isExistingTest = Boolean(existing.is_test || (existing.title || "").includes("[TEST]"));
        const isSlotTest = Boolean(slot.is_test || (slot.title || "").includes("[TEST]"));
        const hasExistingLoc = existing.location && existing.location !== "Home Lab" && existing.location !== "WA";
        const hasSlotLoc = slot.location && slot.location !== "Home Lab" && slot.location !== "WA";

        let preferNew = false;
        if (!isExistingTest && isSlotTest) {
          preferNew = true;
        } else if (isExistingTest === isSlotTest) {
          if (!hasExistingLoc && hasSlotLoc) {
            preferNew = true;
          } else if (hasExistingLoc === hasSlotLoc) {
            preferNew = (slot.title || "").length > (existing.title || "").length;
          }
        }

        if (preferNew) {
          slotMap.set(key, {
            ...existing,
            ...slot,
            location: slot.location || existing.location,
            is_test: isExistingTest || isSlotTest,
          });
        }
      }
    }
    return Array.from(slotMap.values());
  }, [scheduleView?.slots]);
  const todayWeekday =
    typeof scheduleView?.today_weekday === "number"
      ? scheduleView.today_weekday
      : (new Date().getDay() + 6) % 7; // 0=Mon, 4=Fri, 5=Sat, 6=Sun
  const isWeekend = todayWeekday >= 5;

  const effectiveScheduleDay =
    scheduleDayFilter === "today"
      ? isWeekend
        ? 0
        : todayWeekday
      : scheduleDayFilter;

  const todaySlotsCount = allScheduleSlots.filter(
    (s) => s.weekday === (isWeekend ? 0 : todayWeekday)
  ).length;

  // Messages for Answer tab
  const messages = conversation?.length
    ? conversation
    : turn?.answer
    ? [
        ...(turn.query ? [{ id: "q", role: "user", text: turn.query }] : []),
        { id: "a", role: "assistant", text: turn.answer, streaming: turn.streaming },
      ]
    : [];

  const isStreaming = turn?.streaming || messages.some((m) => m.streaming);

  // Auto-scroll for streaming answers
  useEffect(() => {
    if (tab === "answer") {
      const el = body.current;
      if (el && stick.current) el.scrollTop = el.scrollHeight;
    }
  }, [messages, turn?.answer, turn?.streaming, tab]);

  // Auto-fetch schedule when schedule workspace is activated
  useEffect(() => {
    if (tab === "schedule" && (!allScheduleSlots || allScheduleSlots.length === 0)) {
      onFetchSchedule?.();
    }
  }, [tab, allScheduleSlots?.length, onFetchSchedule]);

  const onScroll = () => {
    const el = body.current;
    if (el) {
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    }
  };

  const copy = () => {
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    const text = lastAssistant?.text || turn?.answer || "";
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  // Sync selected note when vault notes arrive (without overriding active new note creation)
  useEffect(() => {
    if (vault.notes?.length > 0 && !selectedNote && !noteDirty && !isCreatingNewNote) {
      const first = vault.notes[0];
      setSelectedNote(first);
      setNoteTitle(first.title || "");
      setNoteContent(first.content || "");
    }
  }, [vault.notes, selectedNote, noteDirty, isCreatingNewNote]);

  // Tasks handlers
  const handleAddTask = (e) => {
    e.preventDefault();
    const t = newTaskText.trim();
    if (!t) return;
    onMutateTask?.({ action: "add", text: t, due: newTaskDue || undefined });
    setNewTaskText("");
    setNewTaskDue("");
  };

  // Notes handlers
  const selectNote = (n) => {
    setIsCreatingNewNote(false);
    setSelectedNote(n);
    setNoteTitle(n.title || "");
    setNoteContent(n.content || "");
    setNoteDirty(false);
  };

  const handleNewNote = () => {
    setIsCreatingNewNote(true);
    setSelectedNote(null);
    setNoteTitle("");
    setNoteContent("");
    setNoteDirty(false);
  };

  const handleSaveNote = () => {
    const title = noteTitle.trim() || "Untitled Note";
    const content = noteContent;
    onMutateNote?.({
      action: "save",
      filename: selectedNote?.filename,
      title,
      content,
    });
    setNoteDirty(false);
    setIsCreatingNewNote(false);
  };

  const handleDeleteNote = () => {
    if (selectedNote?.filename) {
      onMutateNote?.({ action: "delete", filename: selectedNote.filename });
      setSelectedNote(null);
      setNoteTitle("");
      setNoteContent("");
      setNoteDirty(false);
    }
  };

  // Timers handlers
  const handleStartTimer = (e) => {
    e.preventDefault();
    const dur = customTimerDuration.trim();
    if (!dur) return;
    const cmd = customTimerLabel.trim()
      ? `set a timer for ${dur} for ${customTimerLabel.trim()}`
      : `set a timer for ${dur}`;
    onRunCommand?.(cmd);
    setCustomTimerDuration("");
    setCustomTimerLabel("");
  };

  const handleStartReminder = (e) => {
    e.preventDefault();
    const what = reminderText.trim();
    const when = reminderWhen.trim();
    if (!what || !when) return;
    onRunCommand?.(`remind me ${when} to ${what}`);
    setReminderText("");
    setReminderWhen("");
  };

  const tasks = vault.tasks || [];
  const notes = vault.notes || [];
  const pendingTasks = tasks.filter((t) => !t.done).length;
  const yesterdayTasks = tasks.filter(
    (t) => !t.done && (t.is_yesterday || t.is_rolled_over || t.is_overdue)
  );
  const todayTasks = tasks.filter((t) => !t.done && t.is_today);
  const otherOpenTasks = tasks.filter(
    (t) => !t.done && !t.is_yesterday && !t.is_rolled_over && !t.is_overdue && !t.is_today
  );
  const completedTasks = tasks.filter((t) => t.done);

  const rawFiles = filesView?.items || [];
  const recursiveFiles = filesView?.recursive_items || [];

  const isFiltering = Boolean(fileFilter.trim());
  const filterQuery = fileFilter.trim().toLowerCase();
  const useRecursive = (isFiltering || recursiveMode) && recursiveFiles.length > 0;
  const sourceFiles = useRecursive ? recursiveFiles : rawFiles;

  const filteredFiles = isFiltering
    ? sourceFiles.filter((item) => {
        const nameMatch = (item.name || "").toLowerCase().includes(filterQuery);
        const relMatch = (item.rel_path || "").toLowerCase().includes(filterQuery);
        const extMatch = (item.ext || "").toLowerCase().includes(filterQuery);
        return nameMatch || relMatch || extMatch;
      })
    : sourceFiles;

  const parseTimeToMinutes = (tStr) => {
    if (!tStr) return 0;
    const parts = tStr.split(":");
    return parseInt(parts[0] || 0, 10) * 60 + parseInt(parts[1] || 0, 10);
  };

  const currentNowMinutes = (() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  })();

  const isSlotActiveNow = (slot) => {
    if (slot.weekday !== todayWeekday) return false;
    const sMin = parseTimeToMinutes(slot.start);
    const eMin = parseTimeToMinutes(slot.end);
    return currentNowMinutes >= sMin && currentNowMinutes < eMin;
  };

  const displayScheduleSlots = useMemo(() => {
    return (
      effectiveScheduleDay === "all"
        ? allScheduleSlots
        : allScheduleSlots.filter((s) => s.weekday === effectiveScheduleDay)
    )
      .slice()
      .sort((a, b) => {
        if (effectiveScheduleDay === "all" && a.weekday !== b.weekday) {
          return a.weekday - b.weekday;
        }
        return (a.start || "").localeCompare(b.start || "");
      });
  }, [allScheduleSlots, effectiveScheduleDay]);

  const todayIso = new Date().toISOString().split("T")[0];
  const tomorrowIso = new Date(Date.now() + 86400000).toISOString().split("T")[0];

  const handleFollowUp = (e) => {
    e.preventDefault();
    const q = followUpText.trim();
    if (!q) return;
    onRunCommand?.(q);
    setFollowUpText("");
  };

  const renderTaskRow = (task) => {
    const isAssignment = task.is_assignment || (task.text || "").startsWith("[Assignment]");
    const displayTitle = (task.text || "").replace(/^\[Assignment\]\s*/, "");
    return (
      <div
        key={task.id}
        className={`task-row ${task.done ? "is-done" : ""} ${task.is_rolled_over ? "is-rolled-over" : ""}`}
      >
        <label className="task-check-wrap">
          <input
            type="checkbox"
            checked={!!task.done}
            onChange={() => onMutateTask?.({ action: "toggle", index: task.id })}
          />
          <span className="task-custom-box">
            {task.done && <Check size={12} />}
          </span>
        </label>
        <div className="task-content">
          <div className="task-title-line">
            {isAssignment && (
              <span className="task-badge-assignment">Assignment</span>
            )}
            <span className="task-title-text">{displayTitle}</span>
          </div>
          {(task.due || task.is_rolled_over) && (
            <div className="task-tags-row">
              {task.is_rolled_over && !task.done && (
                <span className="task-tag rollover">
                  <AlertCircle size={10} />
                  <span>Rolled Over</span>
                </span>
              )}
              {task.due && (
                <span className={`task-tag ${task.is_overdue && !task.done ? "overdue" : "due"}`}>
                  <Clock size={10} />
                  <span>Due: {task.due}</span>
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="task-delete-btn"
          title="Delete task"
          onClick={() => onMutateTask?.({ action: "delete", index: task.id })}
        >
          <Trash2 size={13} />
        </button>
      </div>
    );
  };

  return (
    <section className="answer" data-hit role="dialog" aria-label="Ignite Buddy Workspace">
      {/* Workspace Header - Displays the active section badge and tools (tabs removed as requested) */}
      <header className="answer-header">
        {(() => {
          const SECTION_CONFIG = {
            answer: { label: "Ignite Buddy Q&A", icon: Sparkles },
            schedule: { label: "Schedule & Timetable", icon: Calendar },
            files: { label: "Files & Documents", icon: Folder },
            tasks: { label: "Tasks & To-Do", icon: CheckSquare },
            notes: { label: "Notes & Scratchpad", icon: FileText },
            timers: { label: "Timers & Reminders", icon: Clock },
            help: { label: "Help Guide & Commands", icon: HelpCircle },
          };
          const currentMeta = SECTION_CONFIG[tab] || SECTION_CONFIG.answer;
          const SectionIcon = currentMeta.icon;
          const badge =
            tab === "tasks" && yesterdayTasks.length > 0
              ? `${yesterdayTasks.length} rolled over`
              : tab === "tasks" && pendingTasks > 0
              ? `${pendingTasks} pending`
              : tab === "schedule" && todaySlotsCount > 0
              ? `${todaySlotsCount} today`
              : tab === "files" && rawFiles.length > 0
              ? `${rawFiles.length} files`
              : tab === "notes" && notes.length > 0
              ? `${notes.length} notes`
              : null;
          const badgeClass =
            tab === "tasks" && yesterdayTasks.length > 0
              ? "tab-badge tab-badge-warning"
              : "tab-badge";
          return (
            <div className="answer-workspace-badge">
              <SectionIcon size={14} className="workspace-badge-icon" />
              <span className="workspace-badge-title">{currentMeta.label}</span>
              {tab === "answer" && isStreaming && <Loader2 size={12} className="spin ml-1" />}
              {badge && <span className={badgeClass}>{badge}</span>}
            </div>
          );
        })()}

        <div className="answer-tools">
          {tab === "answer" && (
            <button
              type="button"
              onClick={copy}
              title="Copy answer"
              aria-label="Copy answer"
            >
              {copied ? <Check size={14} className="copied-icon" /> : <Copy size={14} />}
            </button>
          )}
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              title="Sign out of Ignite Buddy"
              aria-label="Sign out of Ignite Buddy"
              className="btn-tool-logout"
            >
              <LogOut size={14} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      {/* Tab: Answer (Ignite Buddy Q&A & Knowledge Base with Follow-up) */}
      {tab === "answer" && (
        <div className="answer-tab-pane">
          <div className="answer-body md" ref={body} onScroll={onScroll}>
            {messages.length === 0 ? (
              <div className="panel-empty-state">
                <Sparkles size={28} className="empty-state-icon" />
                <h3>Ignite Buddy Q&A</h3>
                <p>Ask anything about Ignite space policies, schedule, assignments, guidelines, or daily workstation commands.</p>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="conv-user">
                    {m.text}
                  </div>
                ) : (
                  <div key={m.id} className="conv-assistant">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components} skipHtml>
                      {m.text || ""}
                    </ReactMarkdown>
                    {m.streaming && <span className="caret" />}
                  </div>
                )
              )
            )}
          </div>
          <form className="answer-followup-form" onSubmit={handleFollowUp}>
            <input
              type="text"
              placeholder="Ask a follow-up question to Ignite Buddy..."
              value={followUpText}
              onChange={(e) => setFollowUpText(e.target.value)}
              disabled={busy}
            />
            <button
              type="submit"
              disabled={!followUpText.trim() || busy}
              title="Send follow-up"
              aria-label="Send follow-up"
              className="btn-send-followup"
            >
              <Send size={13} />
            </button>
          </form>
        </div>
      )}

      {/* Tab: Schedule (Concise Timetable, Venues & Test Alerts) */}
      {tab === "schedule" && (
        <div className="schedule-panel">
          {/* Day selector & quick sync toolbar */}
          <div className="schedule-toolbar">
            <div className="schedule-day-tabs" role="tablist" aria-label="Schedule Days">
              <button
                type="button"
                className={`schedule-day-pill ${scheduleDayFilter === "today" ? "active" : ""}`}
                onClick={() => setScheduleDayFilter("today")}
              >
                <span>Today</span>
                {!isWeekend && WEEKDAYS[todayWeekday] && (
                  <span className="day-sub-label">({WEEKDAYS[todayWeekday].short})</span>
                )}
              </button>

              {WEEKDAYS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`schedule-day-pill ${scheduleDayFilter === d.id ? "active" : ""}`}
                  onClick={() => setScheduleDayFilter(d.id)}
                >
                  <span>{d.short}</span>
                </button>
              ))}

              <button
                type="button"
                className={`schedule-day-pill ${scheduleDayFilter === "all" ? "active" : ""}`}
                onClick={() => setScheduleDayFilter("all")}
              >
                <span>Full Week</span>
              </button>
            </div>

            <div className="schedule-toolbar-actions">
              <button
                type="button"
                className="schedule-tool-btn icon-only"
                onClick={() => onFetchSchedule?.()}
                title="Sync schedule from server"
                aria-label="Sync Schedule"
              >
                <RefreshCw size={13} />
              </button>
            </div>
          </div>

          {/* Trainee Batch & Home Lab Seating Anchor */}
          {(scheduleView?.home_lab || scheduleView?.sub_batch) && (
            <div className="schedule-batch-anchor-banner" style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 12px",
              margin: "6px 12px",
              background: "rgba(100, 181, 246, 0.12)",
              border: "1px solid rgba(100, 181, 246, 0.28)",
              borderRadius: "6px",
              fontSize: "11px",
              color: "var(--color-text-primary, #1e293b)",
              fontWeight: 500,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <MapPin size={13} style={{ color: "#2563eb", flexShrink: 0 }} />
                <span>
                  <strong>Sub-Batch {scheduleView.sub_batch || scheduleView.full_batch}</strong>
                  {scheduleView.home_lab ? ` · Home Lab: ${scheduleView.home_lab}` : ""}
                  {scheduleView.primary_ta ? ` · TA: ${scheduleView.primary_ta}` : ""}
                </span>
              </div>
              {scheduleView.cohort && (
                <span style={{ fontSize: "10px", background: "rgba(37,99,235,0.12)", color: "#1d4ed8", padding: "1px 6px", borderRadius: "4px", fontWeight: 700 }}>
                  Cohort {scheduleView.cohort}
                </span>
              )}
            </div>
          )}

          {/* Weekend contextual notice */}
          {isWeekend && scheduleDayFilter === "today" && (
            <div className="schedule-weekend-banner">
              <Info size={13} className="banner-icon" />
              <span>It's the weekend. Showing upcoming classes for Monday.</span>
            </div>
          )}

          {/* Slots list */}
          <div className="schedule-scroll-list">
            {displayScheduleSlots.length === 0 ? (
              <div className="panel-empty-state">
                <Calendar size={32} className="empty-state-icon" />
                <h3>No Scheduled Lectures</h3>
                <p>
                  {allScheduleSlots.length === 0
                    ? "Your timetable has not been loaded yet. Ask 'show schedule' or click below to sync."
                    : "No classes scheduled for this day."}
                </p>
                {allScheduleSlots.length === 0 && (
                  <button
                    type="button"
                    className="btn-primary-action mt-2"
                    onClick={() => onFetchSchedule?.()}
                  >
                    <RefreshCw size={13} />
                    <span>Sync Timetable</span>
                  </button>
                )}
              </div>
            ) : (
              displayScheduleSlots.map((slot, idx) => {
                const activeNow = isSlotActiveNow(slot);
                const weekdayInfo = WEEKDAYS.find((d) => d.id === slot.weekday);
                return (
                  <div
                    key={`${slot.weekday}-${slot.start}-${slot.end}-${idx}`}
                    className={`schedule-slot-card ${activeNow ? "active-now" : ""} ${
                      slot.is_test ? "test-slot" : ""
                    }`}
                  >
                    <div className="slot-time-col">
                      <span className="slot-time-range">
                        {slot.start} - {slot.end}
                      </span>
                      {effectiveScheduleDay === "all" && weekdayInfo && (
                        <span className="slot-weekday-tag">{weekdayInfo.short}</span>
                      )}
                    </div>

                    <div className="slot-info-col">
                      <div className="slot-header-row">
                        <span className="slot-title">{slot.title}</span>
                        <div className="slot-badges-row">
                          {activeNow && (
                            <span className="slot-badge-active">
                              <span className="pulse-dot" />
                              <span>IN SESSION</span>
                            </span>
                          )}
                          {slot.is_test && (
                            <span className="slot-badge-test">
                              <ShieldAlert size={12} />
                              <span>TEST BLACKOUT</span>
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="slot-meta-row">
                        <div className="slot-location">
                          <MapPin size={12} className="loc-icon" />
                          <span>Venue: <b>{slot.location || "Home Lab"}</b></span>
                        </div>
                        {slot.is_test && (
                          <span className="slot-test-warning">
                            Buddy disabled during test (+/- 15 min blackout)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab: Files (Interactive Folder & File Browser) */}
      {tab === "files" && (
        <div className="files-panel">
          <div className="files-panel-top">
            <div className="files-folder-info">
              <FolderOpen size={18} className="files-current-icon" />
              <div className="files-folder-meta">
                <span className="files-folder-title">{filesView?.folder || "Workspace Files"}</span>
                <span className="files-folder-path" title={filesView?.path}>{filesView?.path || "No folder loaded"}</span>
              </div>
            </div>
            <div className="files-top-actions">
              {filesView?.parent_path && (
                <button
                  type="button"
                  className="btn-folder-up"
                  onClick={() => {
                    if (onListFolder) onListFolder(filesView.parent_path);
                    else onRunCommand?.(`list files in ${filesView.parent_path}`);
                  }}
                  title="Navigate up to parent folder"
                >
                  <CornerLeftUp size={13} />
                  <span>Up</span>
                </button>
              )}
              {filesView?.path && (
                <button
                  type="button"
                  className="btn-explorer-open"
                  onClick={() => {
                    if (onOpenPath) onOpenPath(filesView.path);
                    else onRunCommand?.(`open folder ${filesView.path}`);
                  }}
                  title="Open this folder in Windows File Explorer"
                >
                  <ExternalLink size={12} />
                  <span>Open in Explorer</span>
                </button>
              )}
            </div>
          </div>

          <div className="files-search-bar">
            <Search size={13} className="files-search-icon" />
            <input
              type="text"
              placeholder="Search files & subfolders recursively..."
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
            />
            {fileFilter && (
              <button
                type="button"
                className="btn-filter-clear"
                onClick={() => setFileFilter("")}
                title="Clear filter"
              >
                <X size={12} />
              </button>
            )}
            {recursiveFiles.length > 0 && (
              <button
                type="button"
                className={`btn-mode-toggle ${useRecursive ? "active" : ""}`}
                onClick={() => setRecursiveMode((prev) => !prev)}
                title={useRecursive ? "Recursive search active: searching all subfolders" : "Click to view full directory tree"}
              >
                <FolderTree size={12} />
                <span>{useRecursive ? "All Folders" : "Current Dir"}</span>
              </button>
            )}
          </div>

          <div className="files-scroll-grid">
            {filteredFiles.length === 0 ? (
              <div className="panel-empty-state">
                <Folder size={28} className="empty-state-icon" />
                <h3>No Items Found</h3>
                <p>
                  {fileFilter
                    ? "No files match your recursive search filter."
                    : "No folder loaded yet. Ask 'list files in Documents' or 'list files in Desktop'."}
                </p>
              </div>
            ) : (
              filteredFiles.map((item, idx) => (
                <div
                  key={item.path || idx}
                  className={`file-grid-item ${item.is_dir ? "is-folder" : "is-file"}`}
                  onClick={() => {
                    if (item.is_dir) {
                      if (onListFolder) onListFolder(item.path);
                      else onRunCommand?.(`list files in ${item.path}`);
                    } else {
                      if (onOpenPath) onOpenPath(item.path);
                      else onRunCommand?.(`open file ${item.path}`);
                    }
                  }}
                  title={item.is_dir ? `Browse folder: ${item.name}` : `Open: ${item.name} (${item.rel_path || item.path})`}
                  role="button"
                  tabIndex={0}
                >
                  <div className="file-item-icon-box">
                    {getFileItemIcon(item)}
                  </div>
                  <div className="file-item-info">
                    <span className="file-item-name">{item.name}</span>
                    <div className="file-item-sub-row">
                      <span className="file-item-sub">
                        {item.is_dir ? "Folder" : formatFileSize(item.size)}
                      </span>
                      {(item.parent_dir || item.depth > 0) && (
                        <span className="file-item-rel" title={item.rel_path}>
                          <Folder size={10} className="file-item-rel-icon" />
                          <span>{item.parent_dir || item.rel_path}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <span className={`file-type-pill ${item.is_dir ? "folder-pill" : ""}`}>
                    {item.is_dir ? "DIR" : (item.ext || "FILE").toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>

          {(rawFiles.length > 0 || recursiveFiles.length > 0) && (
            <footer className="files-footer-summary">
              <span>
                Showing {filteredFiles.length} of {sourceFiles.length} items
                {isFiltering ? " (filtered recursively)" : useRecursive ? " (recursive tree)" : ""}
              </span>
            </footer>
          )}
        </div>
      )}

      {/* Tab: Tasks (Interactive Checklist with Due Dates & Rollover) */}
      {tab === "tasks" && (
        <div className="tasks-panel">
          {/* Add Task Form with Due Date and Quick Date Pills */}
          <form className="task-add-bar" onSubmit={handleAddTask}>
            <div className="task-add-main-row">
              <input
                type="text"
                placeholder="Add a new task (e.g. submit project report)..."
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                className="task-input-text"
              />
              <input
                type="date"
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                className="task-input-due"
                title="Optional due date"
              />
              <button type="submit" disabled={!newTaskText.trim()} className="btn-add-task">
                <Plus size={14} />
                <span>Add</span>
              </button>
            </div>
            <div className="task-quick-due-row">
              <span className="task-quick-due-label">Quick Due:</span>
              <button
                type="button"
                className={`quick-due-pill ${newTaskDue === todayIso ? "active" : ""}`}
                onClick={() => setNewTaskDue((prev) => (prev === todayIso ? "" : todayIso))}
              >
                Today
              </button>
              <button
                type="button"
                className={`quick-due-pill ${newTaskDue === tomorrowIso ? "active" : ""}`}
                onClick={() => setNewTaskDue((prev) => (prev === tomorrowIso ? "" : tomorrowIso))}
              >
                Tomorrow
              </button>
              {newTaskDue && (
                <button
                  type="button"
                  className="quick-due-clear"
                  onClick={() => setNewTaskDue("")}
                  title="Clear due date"
                >
                  <X size={11} />
                  <span>Clear date</span>
                </button>
              )}
            </div>
          </form>

          <div className="tasks-scroll-list">
            {tasks.length === 0 ? (
              <div className="panel-empty-state">
                <CheckSquare size={28} className="empty-state-icon" />
                <h3>No Tasks Yet</h3>
                <p>Type above to add a task, say "add task ...", or assignments will sync automatically here.</p>
              </div>
            ) : (
              <>
                {/* 1. Rolled Over from Yesterday / Overdue */}
                {yesterdayTasks.length > 0 && (
                  <div className="tasks-group rollover">
                    <div className="tasks-group-header rollover">
                      <AlertCircle size={14} className="group-icon text-amber" />
                      <span className="group-title">Remaining from Yesterday / Overdue</span>
                      <span className="group-count amber">{yesterdayTasks.length} rolled over</span>
                    </div>
                    {yesterdayTasks.map(renderTaskRow)}
                  </div>
                )}

                {/* 2. Due Today */}
                {todayTasks.length > 0 && (
                  <div className="tasks-group today">
                    <div className="tasks-group-header today">
                      <Calendar size={14} className="group-icon text-blue" />
                      <span className="group-title">Due Today</span>
                      <span className="group-count">{todayTasks.length}</span>
                    </div>
                    {todayTasks.map(renderTaskRow)}
                  </div>
                )}

                {/* 3. Upcoming & Other Open Tasks */}
                {otherOpenTasks.length > 0 && (
                  <div className="tasks-group open">
                    <div className="tasks-group-header">
                      <ClipboardList size={14} className="group-icon" />
                      <span className="group-title">To-Do List</span>
                      <span className="group-count">{otherOpenTasks.length}</span>
                    </div>
                    {otherOpenTasks.map(renderTaskRow)}
                  </div>
                )}

                {/* 4. Completed Tasks */}
                {completedTasks.length > 0 && (
                  <div className="tasks-group completed">
                    <div className="tasks-group-header">
                      <Check size={14} className="group-icon text-muted" />
                      <span className="group-title">Completed</span>
                      <span className="group-count">{completedTasks.length}</span>
                    </div>
                    {completedTasks.map(renderTaskRow)}
                  </div>
                )}
              </>
            )}
          </div>

          {tasks.length > 0 && (
            <footer className="tasks-footer-summary">
              <span>
                {completedTasks.length} of {tasks.length} tasks completed
                {yesterdayTasks.length > 0 && ` · ${yesterdayTasks.length} rolled over from yesterday`}
              </span>
            </footer>
          )}
        </div>
      )}

      {/* Tab: Notes (Interactive Scratchpad) */}
      {tab === "notes" && (
        <div className="notes-panel">
          <aside className="notes-sidebar">
            <div className="notes-sidebar-head">
              <span className="notes-sidebar-title">Notes ({notes.length})</span>
              <button type="button" className="btn-new-note" onClick={handleNewNote}>
                <Plus size={12} />
                <span>New</span>
              </button>
            </div>
            <div className="notes-list-scroll">
              {notes.map((n, idx) => (
                <button
                  key={n.filename || idx}
                  type="button"
                  className={`notes-list-item ${selectedNote?.filename === n.filename ? "active" : ""}`}
                  onClick={() => selectNote(n)}
                >
                  <div className="note-item-title">{n.title || "Untitled Note"}</div>
                  <div className="note-item-sub">
                    {n.mtime ? new Date(n.mtime * 1000).toLocaleDateString() : "Recent"}
                  </div>
                </button>
              ))}
              {notes.length === 0 && (
                <div className="notes-sidebar-empty">No saved notes</div>
              )}
            </div>
          </aside>

          <main className="notes-editor-pane">
            <input
              type="text"
              className="note-title-field"
              placeholder="Note Title..."
              value={noteTitle}
              onChange={(e) => {
                setNoteTitle(e.target.value);
                setNoteDirty(true);
              }}
            />
            <textarea
              className="note-body-field"
              placeholder="Write your note in Markdown..."
              value={noteContent}
              onChange={(e) => {
                setNoteContent(e.target.value);
                setNoteDirty(true);
              }}
            />
            <div className="notes-editor-footer">
              <div className="note-dirty-state">
                {noteDirty ? (
                  <span className="state-dirty">• Unsaved changes</span>
                ) : (
                  <span className="state-saved">Saved</span>
                )}
              </div>
              <div className="notes-editor-actions">
                {selectedNote?.filename && (
                  <button
                    type="button"
                    className="btn-danger-ghost"
                    onClick={handleDeleteNote}
                    title="Delete note"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                )}
                <button
                  type="button"
                  className="btn-primary-action"
                  disabled={!noteDirty && !!selectedNote?.filename}
                  onClick={handleSaveNote}
                >
                  <Save size={13} />
                  <span>Save Note</span>
                </button>
              </div>
            </div>
          </main>
        </div>
      )}

      {/* Tab: Timers & Reminders */}
      {tab === "timers" && (
        <div className="timers-panel">
          <div className="timers-grid">
            {/* Card 1: Countdown Timers */}
            <div className="timer-action-card">
              <div className="card-top-title">
                <Clock size={16} className="card-top-icon" />
                <h4>Countdown Timers</h4>
              </div>

              <div className="timer-presets-label">Quick Presets:</div>
              <div className="timer-preset-chips">
                <button
                  type="button"
                  onClick={() => onRunCommand?.("set a timer for 5 minutes for break")}
                >
                  5m Break
                </button>
                <button
                  type="button"
                  onClick={() => onRunCommand?.("set a timer for 15 minutes for session")}
                >
                  15m Session
                </button>
                <button
                  type="button"
                  onClick={() => onRunCommand?.("set a timer for 25 minutes for pomodoro")}
                >
                  25m Pomodoro
                </button>
                <button
                  type="button"
                  onClick={() => onRunCommand?.("set a timer for 45 minutes for deep work")}
                >
                  45m Focus Block
                </button>
              </div>

              <form className="timer-input-form" onSubmit={handleStartTimer}>
                <div className="timer-form-row">
                  <input
                    type="text"
                    placeholder="Duration (e.g. 10 minutes)"
                    value={customTimerDuration}
                    onChange={(e) => setCustomTimerDuration(e.target.value)}
                  />
                  <input
                    type="text"
                    placeholder="Label (optional)"
                    value={customTimerLabel}
                    onChange={(e) => setCustomTimerLabel(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!customTimerDuration.trim()}
                  className="btn-primary-action full-width"
                >
                  <Play size={13} />
                  <span>Start Countdown</span>
                </button>
              </form>

              <div className="card-quick-actions">
                <button
                  type="button"
                  className="chip-action"
                  onClick={() => onRunCommand?.("show timers")}
                >
                  Check Active Timers
                </button>
                <button
                  type="button"
                  className="chip-action danger"
                  onClick={() => onRunCommand?.("cancel timer")}
                >
                  Cancel Timer
                </button>
              </div>
            </div>

            {/* Card 2: Reminders */}
            <div className="timer-action-card">
              <div className="card-top-title">
                <Bell size={16} className="card-top-icon" />
                <h4>Reminders & Alarms</h4>
              </div>

              <form className="reminder-input-form" onSubmit={handleStartReminder}>
                <input
                  type="text"
                  placeholder="Reminder text (e.g. submit attendance record)..."
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                />
                <input
                  type="text"
                  placeholder="When (e.g. in 30 minutes, tomorrow at 9am)..."
                  value={reminderWhen}
                  onChange={(e) => setReminderWhen(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={!reminderText.trim() || !reminderWhen.trim()}
                  className="btn-primary-action full-width"
                >
                  <Bell size={13} />
                  <span>Set Reminder</span>
                </button>
              </form>

              <div className="card-quick-actions">
                <button
                  type="button"
                  className="chip-action"
                  onClick={() => onRunCommand?.("show reminders")}
                >
                  Show Reminders
                </button>
                <button
                  type="button"
                  className="chip-action danger"
                  onClick={() => onRunCommand?.("cancel reminder")}
                >
                  Cancel Reminder
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab: Help (Query Ideas & Capabilities Guide) */}
      {tab === "help" && (
        <div className="help-panel">
          <div className="help-intro-block">
            <h3>Ignite Buddy Capabilities Guide</h3>
            <p>Overview of the query categories and operational capabilities supported by Ignite Buddy.</p>
          </div>

          <div className="help-categories-scroll">
            <div className="help-category-group">
              <div className="help-category-header">
                <Shield size={14} className="cat-icon" />
                <h5>Company & Space Policies</h5>
              </div>
              <p className="help-category-desc">
                Inquire about internal company policies, code of conduct, working hours, attendance policies, leave rules,
                Accops VDI and remote access guidelines, IT asset security, lab rules, workstation etiquette, cafeteria timings,
                visitor policies, and general Ignite space facilities. The system automatically draws from local SQLite conversation
                memory and indexed policy reference documents.
              </p>
            </div>

            <div className="help-category-group">
              <div className="help-category-header">
                <Folder size={14} className="cat-icon" />
                <h5>File & Folder Navigation</h5>
              </div>
              <p className="help-category-desc">
                Browse directories and list files in your Documents, Desktop, Downloads, or workspace folders.
                If multiple files match when opening an item, an interactive file chooser allows you to select the exact file.
              </p>
            </div>

            <div className="help-category-group">
              <div className="help-category-header">
                <CheckSquare size={14} className="cat-icon" />
                <h5>Task & To-Do Management</h5>
              </div>
              <p className="help-category-desc">
                Manage your daily workflow checklist. Ignite Buddy can record new tasks, mark existing items as completed,
                display your full to-do list, or remove finished tasks from your personal markdown checklist on the workstation.
              </p>
            </div>

            <div className="help-category-group">
              <div className="help-category-header">
                <FileText size={14} className="cat-icon" />
                <h5>Notes & Scratchpad</h5>
              </div>
              <p className="help-category-desc">
                Record and organize local notes. Ignite Buddy can create markdown notes, search notes by keyword, display note contents,
                append information to existing files, or manage personal documentation saved locally on your workstation.
              </p>
            </div>

            <div className="help-category-group">
              <div className="help-category-header">
                <Clock size={14} className="cat-icon" />
                <h5>Countdown Timers & Break Intervals</h5>
              </div>
              <p className="help-category-desc">
                Start countdown timers for custom durations or structured focus blocks such as Pomodoro intervals and breaks.
                Ignite Buddy tracks elapsed time and triggers desktop alerts upon completion.
              </p>
            </div>

            <div className="help-category-group">
              <div className="help-category-header">
                <Bell size={14} className="cat-icon" />
                <h5>Scheduled Reminders & Alarms</h5>
              </div>
              <p className="help-category-desc">
                Schedule time-based reminders for meetings, deadlines, review sessions, or routine reminders using natural time
                phrases like specific times, days of the week, or relative durations.
              </p>
            </div>

            <div className="help-category-group">
              <div className="help-category-header">
                <Terminal size={14} className="cat-icon" />
                <h5>Workstation Controls & Applications</h5>
              </div>
              <p className="help-category-desc">
                Launch approved workstation applications, open project directories in Windows File Explorer, and adjust system audio volume.
              </p>
            </div>

            <div className="help-category-group">
              <div className="help-category-header">
                <Activity size={14} className="cat-icon" />
                <h5>Workspace Activity Summaries</h5>
              </div>
              <p className="help-category-desc">
                Request summaries of your daily active computer usage and review tracked productivity windows.
              </p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Screen capture confirmation preview dialog.
 */
export function CapturePreview({ dialog, answer }) {
  const [file, setFile] = useState(false);
  return (
    <section className="answer capture" data-hit role="dialog" aria-label="Screenshot preview">
      <header className="answer-header">
        <div className="answer-q">Send screenshot for analysis?</div>
      </header>
      <div className="answer-body">
        <p className="muted small">
          Active window: <b>{dialog.app || "unknown"}</b>
          {dialog.title ? ` — ${dialog.title}` : ""}. Sensitive tokens and credentials are masked.
        </p>
        <img className="shot" alt="Screen preview" src={`data:image/jpeg;base64,${dialog.image_b64}`} />
        <label className="check">
          <input type="checkbox" checked={file} onChange={(e) => setFile(e.target.checked)} />
          Also include open source file context
        </label>
        <div className="ask-actions">
          <button className="opt ghost" onClick={() => answer(dialog, { approved: false })}>
            Don't send
          </button>
          <button className="opt primary" onClick={() => answer(dialog, { approved: true, include_file: file })}>
            Send
          </button>
        </div>
      </div>
    </section>
  );
}
