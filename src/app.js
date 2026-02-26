const STORAGE_KEY = 'treeflow_projects';

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { projects: [] };
  } catch {
    return { projects: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

let state = loadData();
let activeProjectId = null;

const FONT_SIZE_KEY  = 'treeflow_fontsize';
const FONT_SIZE_MIN  = 11;
const FONT_SIZE_MAX  = 20;
const FONT_SIZE_DEF  = 14;
const FONT_SIZE_STEP = 1;

function initFontSize() {
  const saved = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10) || FONT_SIZE_DEF;
  applyFontSize(saved);
}

function applyFontSize(size) {
  const clamped = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, size));
  document.documentElement.style.fontSize = `${clamped}px`;
  localStorage.setItem(FONT_SIZE_KEY, clamped);
  // Visual feedback: dim buttons at limits
  document.getElementById('font-decrease').style.opacity = clamped <= FONT_SIZE_MIN ? '0.3' : '1';
  document.getElementById('font-increase').style.opacity = clamped >= FONT_SIZE_MAX ? '0.3' : '1';
}

function changeFontSize(delta) {
  const current = parseInt(localStorage.getItem(FONT_SIZE_KEY), 10) || FONT_SIZE_DEF;
  applyFontSize(current + delta);
}



function initTheme() {
  const saved = localStorage.getItem('treeflow_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('treeflow_theme', next);
}

/**
 * Recursively compute the effective status of a node.
 * If a node has children, its status is auto-derived:
 *   - All done            → done
 *   - At least one doing  → doing
 *   - At least one review → review
 *   - Otherwise           → todo
 * Leaf nodes keep their own status.
 */
function computeStatus(node) {
  if (!node.children || node.children.length === 0) {
    return node.status;
  }
  const childStatuses = node.children.map(computeStatus);
  if (childStatuses.every(s => s === 'done'))   return 'done';
  if (childStatuses.some(s => s === 'doing'))   return 'doing';
  if (childStatuses.some(s => s === 'review'))  return 'review';
  return 'todo';
}

/**
 * Returns { done, total } counts for all leaf descendants.
 */
function countLeaves(node) {
  if (!node.children || node.children.length === 0) {
    return { done: node.status === 'done' ? 1 : 0, total: 1 };
  }
  let done = 0, total = 0;
  for (const child of node.children) {
    const c = countLeaves(child);
    done  += c.done;
    total += c.total;
  }
  return { done, total };
}

function findNode(node, id) {
  if (node.id === id) return node;
  for (const child of (node.children || [])) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

function findParentOf(root, childId) {
  for (const child of (root.children || [])) {
    if (child.id === childId) return root;
    const found = findParentOf(child, childId);
    if (found) return found;
  }
  return null;
}

function removeNodeById(parent, id) {
  parent.children = (parent.children || []).filter(c => c.id !== id);
  for (const child of parent.children) {
    removeNodeById(child, id);
  }
}

function getActiveProject() {
  return state.projects.find(p => p.id === activeProjectId) || null;
}

/**
 * After changing any leaf status, propagate upward so that
 * non-leaf nodes update their stored status (for sidebar display).
 */
function syncStatuses(root) {
  if (!root.children || root.children.length === 0) return;
  for (const child of root.children) syncStatuses(child);
  root.status = computeStatus(root);
}

function getProjectDotClass(project) {
  const s = computeStatus(project.root);
  return `dot-${s}`;
}

function renderSidebar() {
  const list = document.getElementById('project-list');
  list.innerHTML = '';

  if (state.projects.length === 0) {
    list.innerHTML = '<p style="padding:8px 8px;font-size:0.79rem;color:var(--text-muted)">No projects yet.</p>';
    return;
  }

  for (const project of state.projects) {
    const status = computeStatus(project.root);
    const item = document.createElement('div');
    item.className = 'project-item' + (project.id === activeProjectId ? ' active' : '');
    item.dataset.id = project.id;

    const dot = document.createElement('span');
    dot.className = `project-item-dot dot-${status}`;

    const name = document.createElement('span');
    name.className = 'project-item-name';
    name.textContent = project.name;
    name.title = project.name;

    const leaves = countLeaves(project.root);
    const statusEl = document.createElement('span');
    statusEl.className = 'project-item-status';
    statusEl.textContent = leaves.total > 0 ? `${leaves.done}/${leaves.total}` : '';

    item.appendChild(dot);
    item.appendChild(name);
    item.appendChild(statusEl);
    item.addEventListener('click', () => selectProject(project.id));
    list.appendChild(item);
  }
}

function renderTree() {
  const project = getActiveProject();
  if (!project) return;

  const emptyState = document.getElementById('empty-state');
  const treeView   = document.getElementById('tree-view');

  emptyState.classList.add('hidden');
  treeView.classList.remove('hidden');

  document.getElementById('project-title-display').textContent = project.name;

  const leaves = countLeaves(project.root);
  const overall = computeStatus(project.root);
  document.getElementById('project-meta').textContent =
    `${leaves.done} of ${leaves.total} tasks done · overall: ${overall}`;

  const container = document.getElementById('tree-container');
  container.innerHTML = '';

  // Render root's children (the root itself is represented by the project header)
  const addRootBtn = document.createElement('button');
  addRootBtn.className = 'add-root-btn';
  addRootBtn.innerHTML = '<span>＋</span> Add top-level node';
  addRootBtn.addEventListener('click', () => openAddNodeModal(null));
  container.appendChild(addRootBtn);

  if (project.root.children && project.root.children.length > 0) {
    const childrenWrapper = document.createElement('div');
    for (const child of project.root.children) {
      childrenWrapper.appendChild(renderNode(child, project.root, 0));
    }
    container.appendChild(childrenWrapper);
  }
}

function renderNode(node, parent, depth) {
  const status = computeStatus(node);
  const hasChildren = node.children && node.children.length > 0;

  const wrapper = document.createElement('div');
  wrapper.className = 'tree-node-wrapper';
  wrapper.dataset.id = node.id;

  // Card
  const card = document.createElement('div');
  card.className = `node-card status-${status}`;

  // Collapse button (only if has children)
  const isCollapsed = node._collapsed || false;

  if (hasChildren) {
    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'collapse-btn' + (isCollapsed ? ' collapsed' : '');
    collapseBtn.innerHTML = '▾';
    collapseBtn.title = isCollapsed ? 'Expand' : 'Collapse';
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      node._collapsed = !node._collapsed;
      saveData(state);
      renderTree();
    });
    card.appendChild(collapseBtn);
  }

  // Status pill
  const pill = document.createElement('span');
  pill.className = `node-status-pill pill-${status}`;
  pill.textContent = statusLabel(status);
  pill.title = 'Click to cycle status';

  // Only allow manual status change on leaf nodes
  if (!hasChildren) {
    pill.style.cursor = 'pointer';
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      cycleStatus(node);
    });
  } else {
    pill.style.cursor = 'default';
    pill.title = 'Auto-computed from children';
  }
  card.appendChild(pill);

  // Body
  const body = document.createElement('div');
  body.className = 'node-body';

  const title = document.createElement('div');
  title.className = 'node-title';
  title.textContent = node.title;
  body.appendChild(title);

  if (node.description) {
    const desc = document.createElement('div');
    desc.className = 'node-desc';
    desc.textContent = node.description;
    body.appendChild(desc);
  }

  // Progress bar if has children
  if (hasChildren) {
    const leaves = countLeaves(node);
    const pct = leaves.total > 0 ? Math.round((leaves.done / leaves.total) * 100) : 0;

    const progress = document.createElement('div');
    progress.className = 'node-progress';

    const bar = document.createElement('div');
    bar.className = 'node-progress-bar';
    const fill = document.createElement('div');
    fill.className = 'node-progress-fill';
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);

    const label = document.createElement('span');
    label.className = 'node-progress-label';
    label.textContent = `${leaves.done}/${leaves.total}`;

    progress.appendChild(bar);
    progress.appendChild(label);
    body.appendChild(progress);
  }

  card.appendChild(body);

  // Actions
  const actions = document.createElement('div');
  actions.className = 'node-actions';

  const addChildBtn = document.createElement('button');
  addChildBtn.className = 'node-btn';
  addChildBtn.textContent = '+ child';
  addChildBtn.title = 'Add child node';
  addChildBtn.addEventListener('click', (e) => { e.stopPropagation(); openAddNodeModal(node); });
  actions.appendChild(addChildBtn);

  const editBtn = document.createElement('button');
  editBtn.className = 'node-btn';
  editBtn.textContent = 'edit';
  editBtn.title = 'Edit this node';
  editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditNodeModal(node); });
  actions.appendChild(editBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'node-btn danger';
  deleteBtn.textContent = 'del';
  deleteBtn.title = 'Delete this node';
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmAction(`Delete "${node.title}" and all its children?`, () => {
      const project = getActiveProject();
      removeNodeById(project.root, node.id);
      syncStatuses(project.root);
      saveData(state);
      renderTree();
      renderSidebar();
    });
  });
  actions.appendChild(deleteBtn);

  card.appendChild(actions);
  wrapper.appendChild(card);

  // Children
  if (hasChildren && !isCollapsed) {
    const childrenEl = document.createElement('div');
    childrenEl.className = 'tree-children';
    for (const child of node.children) {
      childrenEl.appendChild(renderNode(child, node, depth + 1));
    }
    wrapper.appendChild(childrenEl);
  }

  return wrapper;
}

function statusLabel(s) {
  const map = { todo: 'To Do', doing: 'Doing', review: 'Review', done: 'Done' };
  return map[s] || s;
}

function cycleStatus(node) {
  const order = ['todo', 'doing', 'review', 'done'];
  const idx = order.indexOf(node.status);
  node.status = order[(idx + 1) % order.length];

  const project = getActiveProject();
  syncStatuses(project.root);
  saveData(state);
  renderTree();
  renderSidebar();
}

function selectProject(id) {
  activeProjectId = id;
  renderSidebar();
  renderTree();
}

function createProject(name) {
  const project = {
    id: generateId(),
    name: name.trim(),
    createdAt: Date.now(),
    root: {
      id: generateId(),
      title: name.trim(),
      description: '',
      status: 'todo',
      children: []
    }
  };
  state.projects.push(project);
  saveData(state);
  selectProject(project.id);
  renderSidebar();
}

function renameProject(id, newName) {
  const project = state.projects.find(p => p.id === id);
  if (!project) return;
  project.name = newName.trim();
  project.root.title = newName.trim();
  saveData(state);
  renderSidebar();
  if (activeProjectId === id) renderTree();
}

function deleteProject(id) {
  state.projects = state.projects.filter(p => p.id !== id);
  saveData(state);
  if (activeProjectId === id) {
    activeProjectId = state.projects.length > 0 ? state.projects[0].id : null;
  }
  renderSidebar();
  if (activeProjectId) {
    renderTree();
  } else {
    document.getElementById('tree-view').classList.add('hidden');
    document.getElementById('empty-state').classList.remove('hidden');
  }
}

let nodeModalMode = null;   // 'add' | 'edit'
let nodeModalParent = null; // parent node (add) or null (root)
let nodeModalTarget = null; // node being edited

function openAddNodeModal(parentNode) {
  nodeModalMode   = 'add';
  nodeModalParent = parentNode;
  nodeModalTarget = null;

  document.getElementById('node-modal-title').textContent = 'Add Node';
  document.getElementById('node-modal-submit').textContent = 'Add';
  document.getElementById('node-title-input').value = '';
  document.getElementById('node-desc-input').value = '';
  document.getElementById('node-status-input').value = 'todo';

  document.getElementById('node-modal-overlay').classList.remove('hidden');
  document.getElementById('node-title-input').focus();
}

function openEditNodeModal(node) {
  nodeModalMode   = 'edit';
  nodeModalParent = null;
  nodeModalTarget = node;

  document.getElementById('node-modal-title').textContent = 'Edit Node';
  document.getElementById('node-modal-submit').textContent = 'Save';
  document.getElementById('node-title-input').value = node.title;
  document.getElementById('node-desc-input').value = node.description || '';
  document.getElementById('node-status-input').value = node.status;

  // Disable status field if node has children (auto-computed)
  const hasChildren = node.children && node.children.length > 0;
  document.getElementById('node-status-input').disabled = hasChildren;

  document.getElementById('node-modal-overlay').classList.remove('hidden');
  document.getElementById('node-title-input').focus();
}

function closeNodeModal() {
  document.getElementById('node-modal-overlay').classList.add('hidden');
  document.getElementById('node-status-input').disabled = false;
}

function submitNodeModal() {
  const title  = document.getElementById('node-title-input').value.trim();
  const desc   = document.getElementById('node-desc-input').value.trim();
  const status = document.getElementById('node-status-input').value;

  if (!title) return;

  const project = getActiveProject();

  if (nodeModalMode === 'add') {
    const newNode = {
      id: generateId(),
      title,
      description: desc,
      status,
      children: []
    };

    const parent = nodeModalParent || project.root;
    if (!parent.children) parent.children = [];
    parent.children.push(newNode);

  } else if (nodeModalMode === 'edit' && nodeModalTarget) {
    nodeModalTarget.title       = title;
    nodeModalTarget.description = desc;
    if (!nodeModalTarget.children || nodeModalTarget.children.length === 0) {
      nodeModalTarget.status = status;
    }
  }

  syncStatuses(project.root);
  saveData(state);
  closeNodeModal();
  renderTree();
  renderSidebar();
}

let projectModalMode = null;  // 'create' | 'rename'

function openNewProjectModal() {
  projectModalMode = 'create';
  document.getElementById('modal-title').textContent = 'New Project';
  document.getElementById('modal-submit').textContent = 'Create';
  document.getElementById('modal-project-name').value = '';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-project-name').focus();
}

function openRenameProjectModal() {
  const project = getActiveProject();
  if (!project) return;
  projectModalMode = 'rename';
  document.getElementById('modal-title').textContent = 'Rename Project';
  document.getElementById('modal-submit').textContent = 'Save';
  document.getElementById('modal-project-name').value = project.name;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-project-name').focus();
}

function closeProjectModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function submitProjectModal() {
  const name = document.getElementById('modal-project-name').value.trim();
  if (!name) return;

  if (projectModalMode === 'create') {
    createProject(name);
  } else if (projectModalMode === 'rename') {
    renameProject(activeProjectId, name);
  }

  closeProjectModal();
}

let confirmCallback = null;

function confirmAction(message, callback) {
  confirmCallback = callback;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-overlay').classList.remove('hidden');
}

function closeConfirm() {
  document.getElementById('confirm-overlay').classList.add('hidden');
  confirmCallback = null;
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initFontSize();
  renderSidebar();

  // Auto-select last project if any
  if (state.projects.length > 0) {
    selectProject(state.projects[0].id);
  }

  // Theme toggle
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Font size controls
  document.getElementById('font-increase').addEventListener('click', () => changeFontSize(+FONT_SIZE_STEP));
  document.getElementById('font-decrease').addEventListener('click', () => changeFontSize(-FONT_SIZE_STEP));

  // New project button
  document.getElementById('new-project-btn').addEventListener('click', openNewProjectModal);

  // Project modal
  document.getElementById('modal-cancel').addEventListener('click', closeProjectModal);
  document.getElementById('modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitProjectModal();
  });
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeProjectModal();
  });

  // Tree actions
  document.getElementById('rename-project-btn').addEventListener('click', openRenameProjectModal);
  document.getElementById('delete-project-btn').addEventListener('click', () => {
    const project = getActiveProject();
    if (!project) return;
    confirmAction(`Delete project "${project.name}" and all its nodes?`, () => {
      deleteProject(activeProjectId);
    });
  });

  // Node modal
  document.getElementById('node-modal-cancel').addEventListener('click', closeNodeModal);
  document.getElementById('node-modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitNodeModal();
  });
  document.getElementById('node-modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('node-modal-overlay')) closeNodeModal();
  });

  // Confirm dialog
  document.getElementById('confirm-cancel').addEventListener('click', closeConfirm);
  document.getElementById('confirm-ok').addEventListener('click', () => {
    if (confirmCallback) confirmCallback();
    closeConfirm();
  });
  document.getElementById('confirm-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirm-overlay')) closeConfirm();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProjectModal();
      closeNodeModal();
      closeConfirm();
    }
  });
});
