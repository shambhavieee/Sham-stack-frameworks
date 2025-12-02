/* app.js
   Sham-Stack Frameworks — Project Management Board
   Full feature front-end JS: localStorage, CRUD, drag/drop, search, export/import
*/

(() => {
  /* ====== Config ====== */
  const STORAGE_KEY = 'shamstack_tasks_v1';
  const COLUMNS = ['backlog', 'todo', 'inprogress', 'review', 'done'];

  /* ====== DOM elements ====== */
  const boardColumns = document.getElementById('boardColumns');
  const modal = document.getElementById('taskModal');
  const modalPanel = modal.querySelector('.modal-panel');
  const modalTitle = document.getElementById('modalTitle');
  const modalClose = document.getElementById('modalClose');
  const taskForm = document.getElementById('taskForm');
  const taskIdInput = document.getElementById('taskId');
  const titleInput = document.getElementById('taskTitle');
  const descInput = document.getElementById('taskDesc');
  const priorityInput = document.getElementById('taskPriority');
  const assigneeInput = document.getElementById('taskAssignee');
  const dueInput = document.getElementById('taskDue');
  const btnCancel = document.getElementById('btnCancel');
  const btnDelete = document.getElementById('btnDelete');
  const btnExport = document.getElementById('btnExport');
  const fileImport = document.getElementById('fileImport');
  const btnNewTask = document.getElementById('btnNewTask');
  const searchInput = document.getElementById('searchInput');
  const filterChips = document.querySelectorAll('.chip[data-filter]');
  const countTotalEl = document.getElementById('countTotal');
  const countActiveEl = document.getElementById('countActive');
  const countDoneEl = document.getElementById('countDone');

  /* ====== In-memory tasks ====== */
  let tasks = []; // array of task objects
  let activeFilter = null; // e.g., "priority-high" or null
  let searchQuery = '';

  /* ====== Utilities ====== */
  const uid = (prefix = 't') => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;

  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  const load = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse tasks from storage', e);
      return null;
    }
  };

  const todayISO = () => {
    const d = new Date();
    return d.toISOString().slice(0,10);
  };

  /* ====== Default sample tasks (used if no localStorage) ====== */
  const defaultTasks = [
    {
      id: 't-sample-1',
      title: 'Product Requirements — Draft initial PRD',
      desc: "Collect stakeholders' needs & define MVP scope.",
      priority: 'medium',
      assignee: '',
      due: '2025-12-20',
      column: 'backlog',
      createdAt: Date.now()
    },
    {
      id: 't-sample-2',
      title: 'Backlog Cleanup — Remove stale items',
      desc: 'Archive unassigned or blocked tasks older than 6 months.',
      priority: 'low',
      assignee: '',
      due: '2026-01-10',
      column: 'backlog',
      createdAt: Date.now()-1000
    },
    {
      id: 't-sample-3',
      title: 'Set up repository — Initialize repo & CI',
      desc: 'Create GitHub repo, add README, enable GitHub Actions build.',
      priority: 'high',
      assignee: 'Sam',
      due: '2025-12-10',
      column: 'todo',
      createdAt: Date.now()-2000
    }
  ];

  /* ====== Render helpers ====== */
  function clearColumnsDOM() {
    COLUMNS.forEach(col => {
      const el = document.querySelector(`#col-${col}`);
      if (el) el.innerHTML = '';
    });
  }

  function createTaskCardDOM(task) {
    const article = document.createElement('article');
    article.className = 'task-card';
    article.setAttribute('draggable', 'true');
    article.dataset.id = task.id;

    // task inner HTML
    article.innerHTML = `
      <div class="task-row">
        <h4 class="task-title">${escapeHtml(task.title)}</h4>
        <div class="task-actions">
          <button class="icon-btn small edit" title="Edit">✎</button>
          <button class="icon-btn small del" title="Delete">🗑</button>
        </div>
      </div>
      <p class="task-desc">${escapeHtml(task.desc || '')}</p>
      <div class="task-meta">
        <span class="badge priority ${task.priority}">${capitalize(task.priority)}</span>
        <span class="assignee">${escapeHtml(task.assignee || '—')}</span>
        <time class="due">${task.due ? ('Due: ' + escapeHtml(task.due)) : ''}</time>
      </div>
    `;

    // Drag handlers
    article.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', task.id);
      // small visual cue
      article.classList.add('dragging');
    });
    article.addEventListener('dragend', () => {
      article.classList.remove('dragging');
    });

    return article;
  }

  function render() {
    // clear visible columns
    clearColumnsDOM();

    // apply filters/search then render
    const filtered = tasks.filter(t => {
      // priority filter
      if (activeFilter && activeFilter !== 'priority-all') {
        const parts = activeFilter.split('-');
        if (parts[0] === 'priority' && t.priority !== parts[1]) return false;
      }
      // search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!(
          (t.title||'').toLowerCase().includes(q) ||
          (t.desc||'').toLowerCase().includes(q) ||
          (t.assignee||'').toLowerCase().includes(q)
        )) return false;
      }
      return true;
    });

    // For each column, append matching tasks
    COLUMNS.forEach(col => {
      const container = document.querySelector(`#col-${col}`);
      if (!container) return;
      const colTasks = filtered.filter(t => t.column === col);
      // sort by priority (high, medium, low) then due date ascending
      colTasks.sort((a,b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        }
        // due date fallback
        if (a.due && b.due) return new Date(a.due) - new Date(b.due);
        if (a.due) return -1;
        if (b.due) return 1;
        return a.createdAt - b.createdAt;
      });

      colTasks.forEach(task => {
        const card = createTaskCardDOM(task);
        container.appendChild(card);
      });
    });

    refreshCounts();
  }

  function refreshCounts() {
    const total = tasks.length;
    const done = tasks.filter(t => t.column === 'done').length;
    const active = total - done;
    countTotalEl.textContent = total;
    countActiveEl.textContent = active;
    countDoneEl.textContent = done;

    // update per-column counts shown in headers (data-key attribute)
    document.querySelectorAll('.col-count[data-key]').forEach(el => {
      const key = el.dataset.key; // e.g., "backlog-count"
      const col = key.replace('-count','');
      const count = tasks.filter(t => t.column === col).length;
      el.textContent = count;
    });
  }

  /* ====== Modal control ====== */
  function openModal(mode='new', opts={}) {
    modal.setAttribute('aria-hidden', 'false');
    modal.style.display = 'flex';
    if (mode === 'new') {
      modalTitle.textContent = 'New Task';
      btnDelete.classList.add('hidden');
      taskIdInput.value = '';
      titleInput.value = opts.title || '';
      descInput.value = opts.desc || '';
      priorityInput.value = opts.priority || 'medium';
      assigneeInput.value = opts.assignee || '';
      dueInput.value = opts.due || '';
      // If opening via add-to column, preselect column on submit via dataset
      modal.dataset.targetColumn = opts.targetColumn || '';
      setTimeout(() => titleInput.focus(), 120);
    } else if (mode === 'edit') {
      modalTitle.textContent = 'Edit Task';
      btnDelete.classList.remove('hidden');
      // Populate
      const task = opts.task;
      if (!task) return;
      taskIdInput.value = task.id;
      titleInput.value = task.title || '';
      descInput.value = task.desc || '';
      priorityInput.value = task.priority || 'medium';
      assigneeInput.value = task.assignee || '';
      dueInput.value = task.due || '';
      modal.dataset.targetColumn = task.column;
      setTimeout(() => titleInput.focus(), 120);
    }
  }

  function closeModal() {
    modal.setAttribute('aria-hidden', 'true');
    modal.style.display = 'none';
    // clear dataset
    delete modal.dataset.targetColumn;
    taskForm.reset();
  }

  /* ====== CRUD operations ====== */
  function createTask(data) {
    const t = {
      id: uid(),
      title: data.title || 'Untitled',
      desc: data.desc || '',
      priority: data.priority || 'medium',
      assignee: data.assignee || '',
      due: data.due || '',
      column: data.column || 'backlog',
      createdAt: Date.now()
    };
    tasks.push(t);
    save();
    render();
    return t;
  }

  function updateTask(id, updates) {
    const i = tasks.findIndex(t => t.id === id);
    if (i === -1) return null;
    tasks[i] = { ...tasks[i], ...updates };
    save();
    render();
    return tasks[i];
  }

  function deleteTask(id) {
    tasks = tasks.filter(t => t.id !== id);
    save();
    render();
  }

  /* ====== Event wiring ====== */

  // On page load: initialize tasks from storage or defaults
  function initTasksOnLoad() {
    const stored = load();
    if (stored && Array.isArray(stored)) {
      tasks = stored;
    } else {
      tasks = defaultTasks.map(t => ({ ...t })); // clone
      save();
    }
  }

  // click handler for New Task button -> event already dispatches 'open-task-modal' in HTML,
  // but we will listen to that event and open modal for new tasks.
  window.addEventListener('open-task-modal', (e) => {
    openModal('new', { targetColumn: (e.detail && e.detail.column) || '' });
  });

  btnNewTask.addEventListener('click', () => {
    // also open via direct click
    openModal('new', {});
  });

  // Listen for clicks in board for edit/delete via event delegation
  boardColumns.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit');
    const delBtn = e.target.closest('.del');
    const taskCard = e.target.closest('.task-card');
    if (editBtn && taskCard) {
      const id = taskCard.dataset.id;
      const task = tasks.find(t => t.id === id);
      if (task) openModal('edit', { task });
    } else if (delBtn && taskCard) {
      const id = taskCard.dataset.id;
      if (confirm('Delete this task?')) deleteTask(id);
    }

    // Add-to buttons in column headers
    const addTo = e.target.closest('[data-add-to]');
    if (addTo) {
      const target = addTo.dataset.addTo || addTo.dataset.addTo;
      openModal('new', { targetColumn: target });
    }
  });

  // Modal close & cancel
  modalClose.addEventListener('click', closeModal);
  btnCancel.addEventListener('click', closeModal);
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Submit form - either create or update
  taskForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const id = taskIdInput.value;
    const payload = {
      title: titleInput.value.trim(),
      desc: descInput.value.trim(),
      priority: priorityInput.value,
      assignee: assigneeInput.value.trim(),
      due: dueInput.value || ''
    };

    // Decide target column: modal.dataset.targetColumn (for add from column) or default to backlog/todo
    const targetColumn = modal.dataset.targetColumn && COLUMNS.includes(modal.dataset.targetColumn)
      ? modal.dataset.targetColumn
      : 'backlog';

    if (id) {
      // update
      updateTask(id, { ...payload });
    } else {
      createTask({ ...payload, column: targetColumn });
    }

    closeModal();
  });

  // Delete from modal
  btnDelete.addEventListener('click', () => {
    const id = taskIdInput.value;
    if (!id) return;
    if (confirm('Permanently delete this task?')) {
      deleteTask(id);
      closeModal();
    }
  });

  /* ====== Drag & Drop for columns ====== */
  // allow dropping on column bodies
  document.querySelectorAll('.column-body').forEach(colEl => {
    colEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      colEl.classList.add('drop-target');
    });
    colEl.addEventListener('dragleave', () => {
      colEl.classList.remove('drop-target');
    });
    colEl.addEventListener('drop', (e) => {
      e.preventDefault();
      colEl.classList.remove('drop-target');
      const id = e.dataTransfer.getData('text/plain');
      const colKey = colEl.dataset.column;
      if (!id || !colKey) return;
      const task = tasks.find(t => t.id === id);
      if (!task) return;
      if (task.column === colKey) return; // no-op
      updateTask(id, { column: colKey });
    });
  });

  /* ====== Search & Filters ====== */
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.trim();
    render();
  });

  filterChips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      const key = chip.dataset.filter;
      // toggle behavior
      if (activeFilter === key) activeFilter = null;
      else activeFilter = key;
      // visual: active chip highlight
      filterChips.forEach(c => c.classList.toggle('active', c.dataset.filter === activeFilter));
      render();
    });
  });

  /* ====== Export / Import ====== */
  btnExport.addEventListener('click', () => {
    const payload = { exportedAt: new Date().toISOString(), tasks };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `shamstack_tasks_${(new Date()).toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  fileImport.addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        // parsed may be { tasks: [...] } or an array directly
        let incoming = [];
        if (Array.isArray(parsed)) incoming = parsed;
        else if (parsed && Array.isArray(parsed.tasks)) incoming = parsed.tasks;
        else if (parsed && Array.isArray(parsed.tasks || parsed.data)) incoming = parsed.tasks || parsed.data;
        else {
          alert('Invalid JSON import format. Expected array of tasks or { tasks: [...] }');
          return;
        }

        // Basic validation and normalization
        const valid = incoming.every(it => it && it.id && it.title && it.column && COLUMNS.includes(it.column));
        if (!valid) {
          if (!confirm('Imported file appears to have non-standard tasks. Continue and attempt to import anyway?')) {
            return;
          }
        }

        // Replace tasks and save
        tasks = incoming.map(it => ({
          id: it.id || uid(),
          title: it.title || 'Untitled',
          desc: it.desc || '',
          priority: it.priority || 'medium',
          assignee: it.assignee || '',
          due: it.due || '',
          column: COLUMNS.includes(it.column) ? it.column : 'backlog',
          createdAt: it.createdAt || Date.now()
        }));
        save();
        render();
        alert('Import successful.');
      } catch (err) {
        console.error(err);
        alert('Failed to parse JSON: ' + err.message);
      } finally {
        fileImport.value = '';
      }
    };
    reader.readAsText(f);
  });

  /* ====== Keyboard shortcuts ====== */
  window.addEventListener('keydown', (e) => {
    // N key opens new task modal (when not focusing input)
    if (e.key.toLowerCase() === 'n' && !isInputFocused()) {
      e.preventDefault();
      openModal('new', {});
    }
    // Ctrl+F or / could focus search - skip interfering with browser ctrl-f
    if (e.key === '/' && !isInputFocused()) {
      e.preventDefault();
      searchInput.focus();
    }
  });

  function isInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || el.isContentEditable;
  }

  /* ====== Utility helpers ====== */
  function capitalize(s='') {
    if (!s) return '';
    return s[0].toUpperCase() + s.slice(1);
  }

  // basic html escape for safety in text nodes inserted via innerHTML
  function escapeHtml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ====== Event: open modal from column add buttons (header data-add-to) ====== */
  document.querySelectorAll('[data-add-to]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const col = btn.dataset.addTo || btn.dataset.addTo;
      openModal('new', { targetColumn: col });
    });
  });

  /* ====== Global click to support editing when clicking directly on card body (delegation) ====== */
  // also support double click to quick edit
  boardColumns.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.task-card');
    if (!card) return;
    const id = card.dataset.id;
    const task = tasks.find(t => t.id === id);
    if (task) openModal('edit', { task });
  });

  /* ====== Initialize app ====== */
  function init() {
    initTasksOnLoad();

    // Remove sample DOM cards inside HTML (we will fully render from data)
    clearColumnsDOM();

    render();

    // Wire up global custom event listener: open-task-modal (already created in HTML's New Task button)
    window.addEventListener('open-task-modal', (e) => {
      openModal('new', { targetColumn: (e.detail && e.detail.column) || '' });
    });

    // Close modal when clicking outside panel
    modal.addEventListener('click', (e) => {
      if (!modalPanel.contains(e.target)) closeModal();
    });

    // make column bodies accept keyboard focus for accessibility (optional)
    document.querySelectorAll('.column-body').forEach(el => el.setAttribute('tabindex', '0'));

    // Provide a gentle hint in console for resume reviewers
    console.log('Sham-Stack Board initialized — tasks loaded:', tasks.length);
  }

  // run
  init();

  /* ====== Expose a small API for debugging (optional) ====== */
  window.ShamStack = {
    getTasks: () => tasks,
    saveTasks: () => save(),
    clearAll: () => { if (confirm('Clear all tasks?')) { tasks = []; save(); render(); } },
    createTask
  };
})();
