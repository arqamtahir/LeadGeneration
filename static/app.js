/* ─────────────────────────────────────────────────────────────
   app.js  —  Farance Command Center  (all client-side logic)
───────────────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════════ */
var allLeads      = [];
var filteredLeads = [];
var config        = {};
var activeLead    = null;
var blastPoll     = null;
var sheetColumns  = [];

var DEFAULT_FIELD_KEYS = [
  'FirstName','LastName','EmployeeDesignation','CompanyName','Industry',
  'Email','PersonLinkedIn','CompanyLinkedIn','Website','FirstPhone','Country',
  'Status','Tier','PriorityScore','Owner','SendingInbox',
  'E1_Date','E2_Date','E3_Date','E4_Date','LI_Request','LI_Accepted','LastReply','Notes'
];

var STATUS_PILL = {
  'Not started':    'pill-grey',
  'Researched':     'pill-grey',
  'Connected':      'pill-blue',
  'Sent E1':        'pill-yellow',
  'Sent E2':        'pill-yellow',
  'Sent E3':        'pill-yellow',
  'Sent E4':        'pill-orange',
  'Replied':        'pill-green',
  'Meeting booked': 'pill-blue',
  'Qualified':      'pill-green',
  'Proposal sent':  'pill-purple',
  'Won':            'pill-green',
  'Lost':           'pill-red'
};


/* ════════════════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════════════════ */
function toggleTheme() {
  var next = document.documentElement.classList.contains('dark') ? 'light' : 'dark';
  document.documentElement.className = next;
  localStorage.setItem('fcc-theme', next);
  _setThemeIcon(next);
}

function initTheme() {
  var saved = localStorage.getItem('fcc-theme') || 'dark';
  document.documentElement.className = saved;
  _setThemeIcon(saved);
}

function _setThemeIcon(theme) {
  var el = document.getElementById('theme-icon');
  el.innerHTML = theme === 'dark'
    ? '<i data-lucide="sun"  style="width:14px;height:14px"></i>'
    : '<i data-lucide="moon" style="width:14px;height:14px"></i>';
  if (window.lucide) lucide.createIcons();
}


/* ════════════════════════════════════════════════════════════
   TOAST NOTIFICATION
════════════════════════════════════════════════════════════ */
var _toastTimer = null;
function toast(msg, type) {
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.style.background = type === 'error'   ? '#7f1d1d'
                      : type === 'success' ? '#14532d'
                      : '#1e293b';
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function () { el.classList.remove('show'); }, 3200);
}


/* ════════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════ */
function showTab(name) {
  ['dashboard', 'leads', 'sequences', 'blast', 'pipeline', 'analytics', 'linkedin', 'inbox', 'import', 'tasks', 'settings', 'mapping'].forEach(function (t) {
    var v = document.getElementById('view-' + t);
    var b = document.getElementById('tab-'  + t);
    if (v) v.classList.add('hidden');
    if (b) b.classList.remove('active');
  });
  document.getElementById('view-' + name).classList.remove('hidden');
  document.getElementById('tab-'  + name).classList.add('active');

  if (name === 'dashboard')  loadDashboard();
  if (name === 'sequences')  loadSequences();
  if (name === 'blast')      refreshBlastUI();
  if (name === 'pipeline')   renderPipeline();
  if (name === 'analytics')  loadAnalytics();
  if (name === 'linkedin')   renderLinkedInQueue();
  if (name === 'inbox')      loadInbox();
  if (name === 'import')     initImport();
  if (name === 'tasks')      loadTasks();
  if (name === 'settings')   renderSettingsForm();
  if (name === 'mapping')    renderMappingForm();

  // Re-init Lucide icons for any dynamically shown content
  if (window.lucide) lucide.createIcons();
}


/* ════════════════════════════════════════════════════════════
   LEADS TABLE
════════════════════════════════════════════════════════════ */
async function fetchLeads() {
  document.getElementById('sync-status').textContent = 'Syncing…';
  var res  = await fetch('/api/leads');
  var data = await res.json();
  if (!data.ok) {
    document.getElementById('sync-status').textContent = 'Error';
    toast(data.error, 'error');
    return;
  }
  allLeads = data.leads;
  populateFilterDropdowns(data.meta);
  buildTableHeader();
  applyFilters();
  document.getElementById('sync-status').textContent =
    allLeads.length + ' leads — ' + new Date().toLocaleTimeString();
  toast('Synced ' + allLeads.length + ' leads', 'success');
  updateLiBadge();
}

function populateFilterDropdowns(meta) {
  var statuses = config.pipeline_statuses || [];
  document.getElementById('filter-status').innerHTML =
    '<option value="">All Statuses</option>' +
    statuses.map(function (s) { return '<option>' + s + '</option>'; }).join('');

  ['tier', 'industry', 'country'].forEach(function (key) {
    var el  = document.getElementById('filter-' + key);
    var arr = meta[key + 's'] || [];
    var lbl = key.charAt(0).toUpperCase() + key.slice(1);
    el.innerHTML = '<option value="">All ' + lbl + 's</option>' +
      arr.map(function (v) { return '<option>' + v + '</option>'; }).join('');
  });
}

function buildTableHeader() {
  var fields = config.table_fields || [];
  var html   = '<tr><th><input type="checkbox" id="select-all" onchange="toggleAll(this)"/></th>';
  fields.forEach(function (f) { html += '<th>' + f + '</th>'; });
  html += '<th>Action</th></tr>';
  document.getElementById('lead-thead').innerHTML = html;
}

function applyFilters() {
  var q   = (document.getElementById('search').value || '').toLowerCase();
  var st  = document.getElementById('filter-status').value;
  var tr  = document.getElementById('filter-tier').value;
  var ind = document.getElementById('filter-industry').value;
  var ctr = document.getElementById('filter-country').value;

  filteredLeads = allLeads.filter(function (l) {
    if (st  && l.Status   !== st)  return false;
    if (tr  && l.Tier     !== tr)  return false;
    if (ind && l.Industry !== ind) return false;
    if (ctr && l.Country  !== ctr) return false;
    if (q) {
      var hay = [l.FirstName, l.LastName, l.CompanyName, l.Email, l.Industry, l.Country]
                .join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  });

  renderLeadsTable(filteredLeads);
  document.getElementById('lead-count').textContent =
    'Showing ' + filteredLeads.length + ' of ' + allLeads.length + ' leads';
}

function renderLeadsTable(leads) {
  var fields    = config.table_fields || [];
  var statuses  = config.pipeline_statuses || [];
  var linkFields = { PersonLinkedIn: 1, CompanyLinkedIn: 1, Website: 1 };

  var rows = leads.map(function (l) {
    var idx   = allLeads.indexOf(l);
    var cells = '<td><input type="checkbox" class="lead-cb" data-row="' + l._row +
                '" data-idx="' + idx + '" onchange="updateBlastCount()"/></td>';

    fields.forEach(function (f) {
      var val = l[f] || '';

      if (f === 'Status') {
        var pc   = STATUS_PILL[val] || 'pill-grey';
        var opts = statuses.map(function (s) {
          return '<option' + (s === val ? ' selected' : '') + '>' + s + '</option>';
        }).join('');
        cells += '<td><select class="pill ' + pc + '" style="border:none;outline:none;' +
                 'background:transparent;cursor:pointer;font-size:11px;font-weight:600" ' +
                 'onchange="quickStatusChange(' + l._row + ',this)">' + opts + '</select></td>';

      } else if (linkFields[f]) {
        cells += '<td>' + (val
          ? '<a href="' + esc(val) + '" target="_blank" style="color:var(--accent);font-size:11px">&#8599; Link</a>'
          : '<span style="color:var(--dim)">—</span>') + '</td>';

      } else if (f === 'Tier') {
        var tc = val === 'A' ? 'pill-green' : val === 'B' ? 'pill-blue' : 'pill-grey';
        cells += '<td>' + (val ? '<span class="pill ' + tc + '">' + val + '</span>' : '') + '</td>';

      } else if (f === 'PriorityScore') {
        cells += '<td><strong style="color:var(--accent)">' + esc(val) + '</strong></td>';

      } else if (f === 'FirstName' || f === 'LastName') {
        cells += '<td><button class="lead-name-btn" onclick="openLeadDetail(' + idx + ')" title="View details">' + esc(val) + '</button></td>';
      } else {
        cells += '<td style="max-width:160px;overflow:hidden;text-overflow:ellipsis" title="' +
                 esc(val) + '">' + esc(val) + '</td>';
      }
    });

    cells += '<td><button class="send-btn" onclick="openModal(' + idx + ')">Send</button></td>';
    return '<tr>' + cells + '</tr>';
  }).join('');

  document.getElementById('lead-table').innerHTML = rows ||
    '<tr><td colspan="99" style="text-align:center;padding:36px;color:var(--muted)">No leads match your filters.</td></tr>';
}

function toggleAll(cb) {
  document.querySelectorAll('.lead-cb').forEach(function (c) { c.checked = cb.checked; });
  updateBlastCount();
}

function updateBlastCount() {
  var n  = document.querySelectorAll('.lead-cb:checked').length;
  var el = document.getElementById('blast-selected-count');
  if (el) el.textContent = n > 0
    ? n + ' leads selected for blast'
    : 'No leads selected — check boxes in the Leads tab first.';

  // Bulk action bar
  var bar = document.getElementById('bulk-bar');
  if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
  var bc = document.getElementById('bulk-count');
  if (bc) bc.textContent = n + ' selected';

  // Populate bulk status dropdown once
  var bss = document.getElementById('bulk-status-select');
  if (bss && bss.options.length === 1) {
    (config.pipeline_statuses || []).forEach(function (s) {
      var o = document.createElement('option');
      o.value = o.textContent = s;
      bss.appendChild(o);
    });
  }
}

function clearSelection() {
  document.querySelectorAll('.lead-cb').forEach(function (c) { c.checked = false; });
  var sa = document.getElementById('select-all');
  if (sa) sa.checked = false;
  updateBlastCount();
}

async function applyBulkStatus() {
  var status = document.getElementById('bulk-status-select').value;
  if (!status) { toast('Pick a status first', 'error'); return; }
  var rows = Array.from(document.querySelectorAll('.lead-cb:checked'))
                  .map(function (cb) { return parseInt(cb.dataset.row); });
  if (!rows.length) { toast('No leads selected', 'error'); return; }

  var res  = await fetch('/api/leads/bulk_status', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: rows, status: status })
  });
  var data = await res.json();
  if (data.ok) {
    rows.forEach(function (row) {
      var lead = allLeads.find(function (l) { return l._row === row; });
      if (lead) lead.Status = status;
    });
    clearSelection();
    applyFilters();
    toast('Updated ' + data.updated + ' leads → ' + status, 'success');
  } else {
    toast(data.error, 'error');
  }
}

async function quickStatusChange(row, sel) {
  var status = sel.value;
  sel.className = 'pill ' + (STATUS_PILL[status] || 'pill-grey');
  await fetch('/api/update_lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row: row, fields: { Status: status } })
  });
  var lead = allLeads.find(function (l) { return l._row === row; });
  if (lead) lead.Status = status;
}


/* ════════════════════════════════════════════════════════════
   SINGLE-SEND MODAL
════════════════════════════════════════════════════════════ */
function openModal(idx) {
  activeLead = allLeads[idx];
  document.getElementById('modal-title').textContent =
    (activeLead.FirstName || '') + ' ' + (activeLead.LastName || '');
  document.getElementById('modal-subtitle').textContent =
    (activeLead.EmployeeDesignation || '') +
    (activeLead.CompanyName ? '  —  ' + activeLead.CompanyName : '');

  document.getElementById('modal-smtp').innerHTML = (config.smtp_accounts || [])
    .filter(function (a) { return a.email; })
    .map(function (a, i) {
      return '<option value="' + i + '">' + (a.name || a.email) + '</option>';
    }).join('');

  document.getElementById('modal-template').innerHTML = (config.email_templates || [])
    .map(function (t, i) {
      return '<option value="' + i + '">' + t.name + '</option>';
    }).join('');

  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('modal-msg').textContent = '';
  syncModalTemplate();
}

function syncModalTemplate() {
  var seq  = document.getElementById('modal-sequence').value;
  var tpls = config.email_templates || [];
  var idx  = tpls.findIndex(function (t) { return (t.sequence || '') === seq; });
  if (idx >= 0) document.getElementById('modal-template').value = idx;
  modalPreview();
}

function modalPreview() {
  var tplIdx  = parseInt(document.getElementById('modal-template').value) || 0;
  var smtpIdx = parseInt(document.getElementById('modal-smtp').value)     || 0;
  var tpl  = (config.email_templates  || [])[tplIdx]  || {};
  var smtp = (config.smtp_accounts    || [])[smtpIdx] || {};
  if (!activeLead) return;
  var sname = smtp.name || smtp.email || '';
  document.getElementById('modal-subject').value = fillTpl(tpl.subject || '', activeLead, sname);
  document.getElementById('modal-body').value    = fillTpl(tpl.body    || '', activeLead, sname);
}

async function confirmSend() {
  var smtpIdx = parseInt(document.getElementById('modal-smtp').value)     || 0;
  var seq     = document.getElementById('modal-sequence').value;
  var msgEl   = document.getElementById('modal-msg');
  msgEl.textContent  = 'Sending…';
  msgEl.style.color  = 'var(--muted)';

  var res  = await fetch('/api/send_single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      smtp_index: smtpIdx,
      sequence:   seq,
      lead:       activeLead,
      template: {
        subject: document.getElementById('modal-subject').value,
        body:    document.getElementById('modal-body').value
      }
    })
  });
  var data = await res.json();
  if (data.ok) {
    msgEl.textContent = 'Sent! Status updated to "' + data.status + '"';
    msgEl.style.color = '#22c55e';
    if (activeLead) activeLead.Status = data.status;
    toast('Email sent to ' + activeLead.Email, 'success');
    setTimeout(closeModal, 2000);
  } else {
    msgEl.textContent = 'Error: ' + data.error;
    msgEl.style.color = '#f87171';
  }
}

function closeModal() {
  document.getElementById('modal').classList.add('hidden');
}


/* ════════════════════════════════════════════════════════════
   BLAST
════════════════════════════════════════════════════════════ */
function refreshBlastUI() {
  document.getElementById('blast-smtp').innerHTML = (config.smtp_accounts || [])
    .filter(function (a) { return a.email; })
    .map(function (a, i) {
      return '<option value="' + i + '">' + (a.name || a.email) + '</option>';
    }).join('');

  document.getElementById('blast-template').innerHTML = (config.email_templates || [])
    .map(function (t, i) {
      return '<option value="' + i + '">' + t.name + '</option>';
    }).join('');

  // Restore daily limit from config
  if (config.daily_limit) {
    document.getElementById('blast-daily-limit').value = config.daily_limit;
  }

  syncBlastTemplate();
  updateBlastCount();
  updateDelayLabel();
  refreshDailyCount();
}

async function refreshDailyCount() {
  try {
    var res  = await fetch('/api/blast/daily_count');
    var data = await res.json();
    var el   = document.getElementById('blast-daily-status');
    if (el) el.textContent = data.sent_today + ' sent today';
  } catch (e) {}
}

function toggleAiMode() {
  var on      = document.getElementById('blast-ai-mode').checked;
  var preview = document.getElementById('blast-ai-preview-note');
  if (preview) preview.style.display = on ? 'block' : 'none';
}

function updateDelayLabel() {
  var minD = parseInt(document.getElementById('min-delay').value) || 120;
  var maxD = parseInt(document.getElementById('max-delay').value) || 300;
  var el   = document.getElementById('delay-calc');
  if (el) el.textContent = Math.round(minD / 60) + '–' + Math.round(maxD / 60) + ' min';
}

function syncBlastTemplate() {
  var seq  = document.getElementById('blast-sequence').value;
  var tpls = config.email_templates || [];
  var idx  = tpls.findIndex(function (t) { return (t.sequence || '') === seq; });
  if (idx >= 0) document.getElementById('blast-template').value = idx;
  previewBlastTemplate();
}

function previewBlastTemplate() {
  var tplIdx = parseInt(document.getElementById('blast-template').value) || 0;
  var tpl    = (config.email_templates || [])[tplIdx] || {};
  document.getElementById('blast-subject').value = tpl.subject || '';
  document.getElementById('blast-body').value    = tpl.body    || '';
}

var _blastPayload = null;

function startBlast() {
  var cbs = Array.from(document.querySelectorAll('.lead-cb:checked'));
  if (!cbs.length) { toast('Select leads in the Leads tab first', 'error'); return; }

  var leads   = cbs.map(function (cb) { return allLeads[parseInt(cb.dataset.idx)]; }).filter(Boolean);
  var smtpIdx = parseInt(document.getElementById('blast-smtp').value)     || 0;
  var seq     = document.getElementById('blast-sequence').value;
  var minD    = parseInt(document.getElementById('min-delay').value)       || 120;
  var maxD    = parseInt(document.getElementById('max-delay').value)       || 300;
  var aiMode  = document.getElementById('blast-ai-mode').checked;
  var smtp    = (config.smtp_accounts || [])[smtpIdx] || {};
  var tplIdx  = parseInt(document.getElementById('blast-template').value) || 0;
  var tpl     = (config.email_templates || [])[tplIdx] || {};

  _blastPayload = {
    smtp_index: smtpIdx, sequence: seq, leads: leads,
    min_delay: minD, max_delay: maxD, ai_mode: aiMode,
    template: {
      subject: document.getElementById('blast-subject').value,
      body:    document.getElementById('blast-body').value
    }
  };

  // Show confirmation modal
  var body = document.getElementById('blast-confirm-body');
  body.innerHTML =
    '<div class="confirm-row"><span class="confirm-lbl">Leads</span><span class="confirm-val" style="color:var(--accent);font-weight:700;font-size:20px">' + leads.length + '</span></div>' +
    '<div class="confirm-row"><span class="confirm-lbl">Sequence</span><span class="confirm-val">' + esc(seq) + '</span></div>' +
    '<div class="confirm-row"><span class="confirm-lbl">Template</span><span class="confirm-val">' + esc(tpl.name || '—') + '</span></div>' +
    '<div class="confirm-row"><span class="confirm-lbl">Sending From</span><span class="confirm-val">' + esc(smtp.email || smtp.name || '—') + '</span></div>' +
    '<div class="confirm-row"><span class="confirm-lbl">Delay</span><span class="confirm-val">' + Math.round(minD/60) + '–' + Math.round(maxD/60) + ' min between sends</span></div>' +
    '<div class="confirm-row"><span class="confirm-lbl">AI Mode</span><span class="confirm-val">' + (aiMode ? '✦ On' : 'Off') + '</span></div>';

  document.getElementById('blast-confirm-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeBlastConfirm() {
  document.getElementById('blast-confirm-modal').classList.add('hidden');
}

async function doStartBlast() {
  closeBlastConfirm();
  if (!_blastPayload) return;
  var payload = _blastPayload;
  _blastPayload = null;

  var res  = await fetch('/api/blast/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  var data = await res.json();
  if (!data.ok) { toast(data.error, 'error'); return; }

  document.getElementById('blast-sidebar').classList.remove('hidden');
  toast('Blast started — ' + payload.leads.length + ' leads queued', 'success');
  startBlastPoll();
}

async function stopBlast() {
  await fetch('/api/blast/stop', { method: 'POST' });
  toast('Blast stopped', '');
}

function startBlastPoll() {
  if (blastPoll) clearInterval(blastPoll);
  var lastLogLen = 0;

  blastPoll = setInterval(async function () {
    var res  = await fetch('/api/blast/status');
    var data = await res.json();

    // Only update DOM if log actually changed
    if (data.log.length !== lastLogLen) {
      lastLogLen = data.log.length;
      var log = document.getElementById('blast-log');
      log.textContent = data.log.join('\n');
      log.scrollTop   = log.scrollHeight;
    }

    document.getElementById('sb-progress').textContent = data.sent + ' / ' + data.total;

    if (!data.running) {
      clearInterval(blastPoll);
      blastPoll = null;
      refreshDailyCount();
      toast('Blast complete — ' + data.sent + ' sent', 'success');
    }
  }, 8000);
}


/* ════════════════════════════════════════════════════════════
   SETTINGS FORM
════════════════════════════════════════════════════════════ */
function renderSettingsForm() {
  document.getElementById('cfg-sheet-id').value   = config.sheet_id   || '';
  document.getElementById('cfg-sheet-name').value = config.sheet_name || 'Sheet1';

  // Google OAuth status
  var dot  = document.getElementById('google-status-dot');
  var txt  = document.getElementById('google-status-text');
  var conn = document.getElementById('google-connect-btn');
  var disc = document.getElementById('google-disconnect-btn');
  if (config.google_connected) {
    dot.style.background  = '#22c55e';
    txt.textContent       = 'Google account connected';
    txt.style.color       = '#22c55e';
    conn.style.display    = 'none';
    disc.style.display    = '';
  } else {
    dot.style.background  = 'var(--muted)';
    txt.textContent       = 'Google account not connected — click Connect to authorize access to your sheets.';
    txt.style.color       = 'var(--muted)';
    conn.style.display    = '';
    disc.style.display    = 'none';
  }

  // AI Research settings (no API key — managed server-side)
  var vpEl = document.getElementById('cfg-ai-value-prop');
  if (vpEl) vpEl.value = config.ai_value_proposition || '';
  var spEl = document.getElementById('cfg-ai-system-prompt');
  if (spEl) spEl.value = config.ai_system_prompt || '';

  // Visible column checkboxes
  var allFields = Object.keys(config.field_mapping || {});
  var selected  = config.table_fields || [];
  document.getElementById('table-fields-checkboxes').innerHTML = allFields.map(function (f) {
    var chk = selected.indexOf(f) >= 0 ? 'checked' : '';
    return '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">' +
           '<input type="checkbox" class="tbl-field-cb" value="' + f + '" ' + chk + '/>' +
           f + '</label>';
  }).join('');

  // SMTP slots
  document.getElementById('smtp-slots').innerHTML = (config.smtp_accounts || []).map(function (a, i) {
    var pw = (a.password && a.password !== '***') ? a.password : '';
    return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px">' +
           '<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px">Account ' + (i + 1) + '</div>' +
           '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
           smtpInput('Display Name',     a.name  || '',             i, 'name') +
           smtpInput('email@domain.com', a.email || '',             i, 'email') +
           smtpInputPw('App Password',   pw,                        i) +
           smtpInput('smtp.zoho.eu',     a.host  || 'smtp.zoho.eu', i, 'host') +
           smtpInput('Port',             a.port  || 587,            i, 'port', 'number') +
           '</div>' +
           '<div style="margin-top:8px;display:grid;grid-template-columns:auto 1fr;align-items:center;gap:8px">' +
           '<label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;white-space:nowrap">Chrome Profile</label>' +
           smtpInput('Default / Profile 1 / Profile 2…', a.chrome_profile || 'Default', i, 'chrome_profile') +
           '</div>' +
           '<div style="font-size:10px;color:var(--dim);margin-top:4px">Find it at <code style="background:var(--border);padding:1px 5px;border-radius:4px">chrome://version</code> → Profile Path (last folder name)</div>' +
           '</div>';
  }).join('');

  renderTemplateSlots();
}

function smtpInput(placeholder, val, i, field, type) {
  type = type || 'text';
  return '<input type="' + type + '" placeholder="' + placeholder + '" value="' + escQ(val) + '" ' +
         'data-smtp="' + i + '" data-field="' + field + '" oninput="smtpChange(this)" class="fc fc-sm"/>';
}

function smtpInputPw(placeholder, val, i) {
  return '<input type="password" placeholder="' + placeholder + '" value="' + escQ(val) + '" ' +
         'data-smtp="' + i + '" data-field="password" oninput="smtpChange(this)" class="fc fc-sm"/>';
}

function smtpChange(el) {
  var i = parseInt(el.dataset.smtp);
  config.smtp_accounts[i][el.dataset.field] = el.value;
}

function renderTemplateSlots() {
  var seqs = ['E1', 'E2', 'E3', 'E4', ''];
  document.getElementById('template-slots').innerHTML = (config.email_templates || []).map(function (t, i) {
    var seqOpts = seqs.map(function (s) {
      return '<option value="' + s + '"' + (s === (t.sequence || '') ? ' selected' : '') + '>' +
             (s || 'Custom') + '</option>';
    }).join('');
    return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px">' +
           '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
           '<input value="' + escQ(t.name) + '" oninput="config.email_templates[' + i + '].name=this.value" ' +
           'style="flex:1;background:transparent;border:none;border-bottom:1px solid var(--border);' +
           'color:var(--text);font-size:13px;font-weight:600;outline:none;padding-bottom:4px"/>' +
           '<select onchange="config.email_templates[' + i + '].sequence=this.value" class="fc fc-sm" style="width:auto">' +
           seqOpts + '</select>' +
           '<button onclick="removeTemplate(' + i + ')" ' +
           'style="background:none;border:none;color:#f87171;cursor:pointer;font-size:12px">Remove</button>' +
           '</div>' +
           '<input value="' + escQ(t.subject) + '" oninput="config.email_templates[' + i + '].subject=this.value" ' +
           'placeholder="Subject — {first_name} {company} {industry}" ' +
           'class="fc fc-sm" style="margin-bottom:8px;color:#f59e0b"/>' +
           '<textarea rows="5" oninput="config.email_templates[' + i + '].body=this.value" ' +
           'class="fc fc-sm" style="font-family:monospace;color:#4ade80;resize:vertical">' +
           escBody(t.body || '') + '</textarea>' +
           '</div>';
  }).join('');
}

function addTemplate() {
  config.email_templates.push({ name: 'New Template', sequence: '', subject: '', body: '' });
  renderTemplateSlots();
}

function removeTemplate(i) {
  config.email_templates.splice(i, 1);
  renderTemplateSlots();
}

async function disconnectGoogle() {
  await fetch('/oauth/disconnect', { method: 'POST' });
  await loadConfig();
  renderSettingsForm();
  toast('Google account disconnected', 'success');
}

async function saveSettings() {
  var tableFields = Array.from(document.querySelectorAll('.tbl-field-cb:checked'))
                        .map(function (c) { return c.value; });
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sheet_id:             document.getElementById('cfg-sheet-id').value.trim(),
      sheet_name:           document.getElementById('cfg-sheet-name').value.trim(),
      smtp_accounts:        config.smtp_accounts,
      email_templates:      config.email_templates,
      table_fields:         tableFields,
      min_delay:            parseInt(document.getElementById('min-delay').value) || 120,
      max_delay:            parseInt(document.getElementById('max-delay').value) || 300,
      daily_limit:          parseInt(document.getElementById('blast-daily-limit') && document.getElementById('blast-daily-limit').value) || 30,
      ai_value_proposition: (document.getElementById('cfg-ai-value-prop') || {}).value || '',
      ai_system_prompt:     (document.getElementById('cfg-ai-system-prompt') || {}).value || ''
    })
  });
  await loadConfig();
  buildTableHeader();
  toast('Settings saved', 'success');
  var el = document.getElementById('save-msg');
  el.classList.remove('hidden');
  setTimeout(function () { el.classList.add('hidden'); }, 2500);
}


/* ════════════════════════════════════════════════════════════
   FIELD MAPPING
════════════════════════════════════════════════════════════ */
async function loadSheetColumns() {
  var res  = await fetch('/api/sheet_columns');
  var data = await res.json();
  if (!data.ok) { toast('Could not read sheet: ' + data.error, 'error'); return; }
  sheetColumns = data.columns;
  renderMappingForm();
  toast('Detected ' + sheetColumns.length + ' columns from sheet', 'success');
}

function renderMappingForm() {
  var fm      = config.field_mapping || {};
  var allKeys = DEFAULT_FIELD_KEYS.slice();
  Object.keys(fm).forEach(function (k) { if (allKeys.indexOf(k) < 0) allKeys.push(k); });

  document.getElementById('mapping-table').innerHTML = allKeys.map(function (key) {
    var cur  = fm[key] || '';
    var cols = sheetColumns.length ? sheetColumns : (cur ? [cur] : []);
    var opts = ['(not mapped)'].concat(cols).map(function (c) {
      return '<option value="' + escQ(c) + '"' + (c === cur ? ' selected' : '') + '>' + c + '</option>';
    }).join('');
    return '<div style="display:flex;align-items:center;gap:10px">' +
           '<div style="width:180px;font-size:11px;font-family:monospace;color:var(--accent);flex-shrink:0">' + key + '</div>' +
           '<div style="color:var(--dim);font-size:14px">&#8594;</div>' +
           '<select id="map-' + key + '" class="fc fc-sm" style="flex:1">' + opts + '</select>' +
           '<input placeholder="or type" value="' + escQ(cur) + '" ' +
           'oninput="document.getElementById(\'map-' + key + '\').value=this.value" ' +
           'class="fc fc-sm" style="width:140px"/>' +
           '</div>';
  }).join('');
}

async function saveMapping() {
  var allKeys = DEFAULT_FIELD_KEYS.slice();
  Object.keys(config.field_mapping || {}).forEach(function (k) {
    if (allKeys.indexOf(k) < 0) allKeys.push(k);
  });
  var newMap = {};
  allKeys.forEach(function (key) {
    var el = document.getElementById('map-' + key);
    if (el && el.value && el.value !== '(not mapped)') newMap[key] = el.value;
  });
  config.field_mapping = newMap;
  await fetch('/api/config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field_mapping: newMap })
  });
  toast('Field mapping saved', 'success');
  var el = document.getElementById('mapping-msg');
  el.classList.remove('hidden');
  setTimeout(function () { el.classList.add('hidden'); }, 2500);
}


/* ════════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════ */
function fillTpl(text, lead, senderName) {
  var map = {
    '{first_name}':    lead.FirstName            || '',
    '{last_name}':     lead.LastName             || '',
    '{company}':       lead.CompanyName          || '',
    '{designation}':   lead.EmployeeDesignation  || '',
    '{industry}':      lead.Industry             || '',
    '{email}':         lead.Email                || '',
    '{phone}':         lead.FirstPhone           || '',
    '{country}':       lead.Country              || '',
    '{website}':       lead.Website              || '',
    '{linkedin}':      lead.PersonLinkedIn       || '',
    '{sender_name}':   senderName                || '',
    '{{name}}':        lead.FirstName            || '',
    '{{company}}':     lead.CompanyName          || '',
    '{{sender_name}}': senderName                || ''
  };
  var out = text;
  Object.keys(map).forEach(function (k) { out = out.split(k).join(map[k]); });
  return out;
}

function esc(v)     { return String(v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escQ(v)    { return String(v || '').replace(/"/g, '&quot;'); }
function escBody(v) { return (v || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }


/* ════════════════════════════════════════════════════════════
   CONFIG
════════════════════════════════════════════════════════════ */
async function loadConfig() {
  var res = await fetch('/api/config');
  config  = await res.json();
}


/* ════════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  // Daily quota
  try {
    var qRes  = await fetch('/api/blast/daily_count');
    var qData = await qRes.json();
    var sent  = qData.sent_today  || 0;
    var limit = qData.daily_limit || 30;
    document.getElementById('kpi-today').textContent    = sent;
    document.getElementById('dash-quota-sent').textContent  = sent;
    document.getElementById('dash-quota-limit').textContent = limit;
    document.getElementById('dash-quota-bar').style.width   = Math.min(100, (sent / limit) * 100) + '%';
  } catch (e) {}

  if (!allLeads.length) return;

  // KPIs from leads
  document.getElementById('kpi-total').textContent = allLeads.length;

  var replied  = allLeads.filter(function (l) { return l.Status === 'Replied'; }).length;
  var meetings = allLeads.filter(function (l) { return l.Status === 'Meeting booked'; }).length;
  document.getElementById('kpi-replied').textContent  = replied;
  document.getElementById('kpi-meetings').textContent = meetings;

  // Pipeline breakdown
  var counts = {};
  allLeads.forEach(function (l) {
    var s = l.Status || 'Not started';
    counts[s] = (counts[s] || 0) + 1;
  });
  var total = allLeads.length;
  var sorted = Object.entries(counts).sort(function (a, b) { return b[1] - a[1]; });
  document.getElementById('dash-pipeline').innerHTML = sorted.map(function (entry) {
    var pct = Math.round((entry[1] / total) * 100);
    return '<div class="bar-row">' +
      '<div class="bar-label">' + esc(entry[0]) + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="bar-count">' + entry[1] + ' <span style="color:var(--dim);font-weight:400">(' + pct + '%)</span></div>' +
      '</div>';
  }).join('');

  // Sequence progress
  var seqs = { E1: 0, E2: 0, E3: 0, E4: 0 };
  allLeads.forEach(function (l) {
    ['E1', 'E2', 'E3', 'E4'].forEach(function (e) {
      if (l[e + '_Date']) seqs[e]++;
    });
  });
  document.getElementById('dash-sequence').innerHTML = Object.entries(seqs).map(function (entry) {
    var pct = Math.round((entry[1] / total) * 100);
    return '<div class="bar-row">' +
      '<div class="bar-label" style="width:60px">' + entry[0] + '</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,var(--gold),var(--gold-h))"></div></div>' +
      '<div class="bar-count">' + entry[1] + ' sent</div>' +
      '</div>';
  }).join('');

  if (window.lucide) lucide.createIcons();
}


/* ════════════════════════════════════════════════════════════
   SEQUENCES
════════════════════════════════════════════════════════════ */
var seqDelays = { E1_to_E2: 3, E2_to_E3: 5, E3_to_E4: 7 };

async function loadSequences() {
  var res  = await fetch('/api/sequences/config');
  seqDelays = await res.json();
  document.getElementById('seq-delay-e1e2').value = seqDelays.E1_to_E2 || 3;
  document.getElementById('seq-delay-e2e3').value = seqDelays.E2_to_E3 || 5;
  document.getElementById('seq-delay-e3e4').value = seqDelays.E3_to_E4 || 7;
  renderSequences();
}

async function saveSeqDelays() {
  seqDelays = {
    E1_to_E2: parseInt(document.getElementById('seq-delay-e1e2').value) || 3,
    E2_to_E3: parseInt(document.getElementById('seq-delay-e2e3').value) || 5,
    E3_to_E4: parseInt(document.getElementById('seq-delay-e3e4').value) || 7,
  };
  await fetch('/api/config', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sequence_delays: seqDelays }),
  });
  toast('Delays saved', 'success');
  renderSequences();
}

function daysSince(dateStr) {
  if (!dateStr) return null;
  var d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d)) return null;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function renderSequences() {
  if (!allLeads.length) return;

  var steps = [
    { from: 'E1', to: 'E2', delay: seqDelays.E1_to_E2, dateKey: 'E1_Date', kpiId: 'seq-due-e2' },
    { from: 'E2', to: 'E3', delay: seqDelays.E2_to_E3, dateKey: 'E2_Date', kpiId: 'seq-due-e3' },
    { from: 'E3', to: 'E4', delay: seqDelays.E3_to_E4, dateKey: 'E3_Date', kpiId: 'seq-due-e4' },
  ];

  var container = document.getElementById('seq-steps-container');
  container.innerHTML = '';

  steps.forEach(function (step) {
    var due = allLeads.filter(function (l) {
      if (!l[step.dateKey]) return false;                     // hasn't had this step yet
      if (l[step.to + '_Date']) return false;                 // already got next step
      if (['Replied','Meeting booked','Qualified','Proposal sent','Won','Lost'].includes(l.Status)) return false;
      var age = daysSince(l[step.dateKey]);
      return age !== null && age >= step.delay;
    });

    document.getElementById(step.kpiId).textContent = due.length;

    if (!due.length) return;

    var card = document.createElement('div');
    card.className = 'card';
    card.style.marginBottom = '18px';
    card.innerHTML =
      '<div style="display:flex;align-items:center;margin-bottom:12px">' +
        '<div class="card-title" style="margin:0"><i data-lucide="send" style="width:13px;height:13px;vertical-align:middle;margin-right:5px"></i>' +
          due.length + ' leads due for ' + step.to +
        '</div>' +
        '<div class="spacer"></div>' +
        '<button class="btn btn-ghost btn-sm" onclick="showTab(\'blast\')" style="font-size:11px">' +
          'Go to Blast →' +
        '</button>' +
      '</div>' +
      '<div>' +
        due.map(function (l) {
          var age = daysSince(l[step.dateKey]);
          return '<div class="seq-lead-row">' +
            '<div class="seq-lead-name">' + esc(l.FirstName || '') + ' ' + esc(l.LastName || '') + '</div>' +
            '<div class="seq-lead-meta">' + esc(l.CompanyName || '') + '</div>' +
            '<div class="seq-days-ago">' + age + 'd ago</div>' +
          '</div>';
        }).join('') +
      '</div>';
    container.appendChild(card);
  });

  if (window.lucide) lucide.createIcons();
}


/* ════════════════════════════════════════════════════════════
   PIPELINE / KANBAN
════════════════════════════════════════════════════════════ */
var KANBAN_COLS = [
  { id: 'new',      label: 'New',           statuses: ['Not started', 'Researched'],                color: '#64748b' },
  { id: 'contact',  label: 'Contacted',      statuses: ['Connected', 'Sent E1', 'Sent E2', 'Sent E3', 'Sent E4'], color: '#f59e0b' },
  { id: 'replied',  label: 'Replied',        statuses: ['Replied'],                                 color: '#3b82f6' },
  { id: 'meeting',  label: 'Meeting Booked', statuses: ['Meeting booked'],                          color: '#8b5cf6' },
  { id: 'closing',  label: 'Closing',        statuses: ['Qualified', 'Proposal sent'],              color: '#06b6d4' },
  { id: 'won',      label: 'Won',            statuses: ['Won'],                                     color: '#22c55e' },
  { id: 'lost',     label: 'Lost',           statuses: ['Lost'],                                    color: '#ef4444' },
];

var dragLead = null;

function renderPipeline() {
  if (!allLeads.length) {
    document.getElementById('kanban-board').innerHTML =
      '<div class="text-muted" style="font-size:13px">Load leads first from the Leads tab.</div>';
    return;
  }

  var board = document.getElementById('kanban-board');
  board.innerHTML = KANBAN_COLS.map(function (col) {
    var leads = allLeads.filter(function (l) { return col.statuses.includes(l.Status || 'Not started'); });
    return '<div class="kanban-col" data-col="' + col.id + '" ' +
      'ondragover="event.preventDefault();this.classList.add(\'drag-over\')" ' +
      'ondragleave="this.classList.remove(\'drag-over\')" ' +
      'ondrop="kanbanDrop(event,\'' + col.id + '\')">' +
      '<div class="kanban-col-header">' +
        '<div class="kanban-col-title" style="color:' + col.color + '">' + col.label + '</div>' +
        '<div class="kanban-col-count">' + leads.length + '</div>' +
      '</div>' +
      leads.map(function (l) {
        return '<div class="kanban-card" draggable="true" data-row="' + l._row + '" ' +
          'ondragstart="kanbanDragStart(event,' + l._row + ')" ' +
          'ondragend="this.classList.remove(\'dragging\')">' +
          '<div class="kanban-card-name">' + esc(l.FirstName || '') + ' ' + esc(l.LastName || '') + '</div>' +
          '<div class="kanban-card-meta">' + esc(l.CompanyName || '') + '</div>' +
          (l.Email ? '<div class="kanban-card-meta" style="margin-top:2px;color:var(--dim)">' + esc(l.Email) + '</div>' : '') +
        '</div>';
      }).join('') +
    '</div>';
  }).join('');
}

function kanbanDragStart(e, row) {
  dragLead = allLeads.find(function (l) { return l._row === row; });
  e.target.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

async function kanbanDrop(e, colId) {
  e.preventDefault();
  document.querySelectorAll('.kanban-col').forEach(function (c) { c.classList.remove('drag-over'); });
  if (!dragLead) return;

  var col       = KANBAN_COLS.find(function (c) { return c.id === colId; });
  var newStatus = col.statuses[col.statuses.length - 1];   // drop = highest status in column

  await fetch('/api/update_lead', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row: dragLead._row, fields: { Status: newStatus } }),
  });

  dragLead.Status = newStatus;
  dragLead = null;
  renderPipeline();
  toast('Status updated to ' + newStatus, 'success');
}


/* ════════════════════════════════════════════════════════════
   ANALYTICS
════════════════════════════════════════════════════════════ */
async function loadAnalytics() {
  if (!allLeads.length) return;

  var total      = allLeads.length;
  var contacted  = allLeads.filter(function (l) { return l.E1_Date; }).length;
  var replied    = allLeads.filter(function (l) { return l.Status === 'Replied' || l.Status === 'Meeting booked' || l.Status === 'Qualified' || l.Status === 'Proposal sent' || l.Status === 'Won'; }).length;
  var won        = allLeads.filter(function (l) { return l.Status === 'Won'; }).length;
  var replyRate  = contacted ? Math.round((replied / contacted) * 100) + '%' : '—';

  document.getElementById('an-total').textContent       = total;
  document.getElementById('an-contacted').textContent   = contacted;
  document.getElementById('an-reply-rate').textContent  = replyRate;
  document.getElementById('an-won').textContent         = won;

  // Sends per day chart
  try {
    var sRes  = await fetch('/api/analytics/sends');
    var sends = await sRes.json();
    var dates = Object.keys(sends).sort().slice(-30);
    var max   = Math.max.apply(null, dates.map(function (d) { return sends[d] || 0; })) || 1;
    document.getElementById('an-sends-chart').innerHTML =
      '<div class="sends-chart">' +
      dates.map(function (d) {
        var val = sends[d] || 0;
        var pct = Math.round((val / max) * 100);
        var short = d.slice(5);  // MM-DD
        return '<div class="sends-bar-wrap" title="' + d + ': ' + val + ' sent">' +
          '<div class="sends-bar" style="height:' + pct + '%"></div>' +
          '<div class="sends-label">' + short + '</div>' +
        '</div>';
      }).join('') +
      '</div>' +
      '<div style="font-size:11px;color:var(--muted);margin-top:8px">Last 30 days · max ' + Math.max.apply(null, dates.map(function(d){return sends[d]||0;})) + '/day</div>';
  } catch (e) {}

  // Sequence funnel
  var e1 = allLeads.filter(function (l) { return l.E1_Date; }).length;
  var e2 = allLeads.filter(function (l) { return l.E2_Date; }).length;
  var e3 = allLeads.filter(function (l) { return l.E3_Date; }).length;
  var e4 = allLeads.filter(function (l) { return l.E4_Date; }).length;
  var funnelData = [['E1 Sent', e1, '#0f766e'], ['E2 Sent', e2, '#f59e0b'], ['E3 Sent', e3, '#f97316'], ['E4 Sent', e4, '#ef4444'], ['Replied', replied, '#22c55e'], ['Won', won, '#a855f7']];
  document.getElementById('an-funnel').innerHTML = funnelData.map(function (row) {
    var pct = e1 ? Math.round((row[1] / e1) * 100) : 0;
    return '<div class="an-bar-row">' +
      '<div class="an-bar-label">' + row[0] + '</div>' +
      '<div class="an-bar-track"><div class="an-bar-fill" style="width:' + pct + '%;background:' + row[2] + '"></div></div>' +
      '<div class="an-bar-val">' + row[1] + '</div>' +
    '</div>';
  }).join('');

  // Industries
  var indCounts = {};
  allLeads.forEach(function (l) { if (l.Industry) indCounts[l.Industry] = (indCounts[l.Industry] || 0) + 1; });
  var topInd = Object.entries(indCounts).sort(function (a,b) { return b[1]-a[1]; }).slice(0, 8);
  var maxInd = topInd[0] ? topInd[0][1] : 1;
  document.getElementById('an-industries').innerHTML = topInd.map(function (row) {
    return '<div class="an-bar-row">' +
      '<div class="an-bar-label">' + esc(row[0]) + '</div>' +
      '<div class="an-bar-track"><div class="an-bar-fill" style="width:' + Math.round(row[1]/maxInd*100) + '%;background:var(--accent)"></div></div>' +
      '<div class="an-bar-val">' + row[1] + '</div>' +
    '</div>';
  }).join('') || '<div class="text-muted" style="font-size:12px">No industry data</div>';

  // Tiers
  var tierCounts = {};
  allLeads.forEach(function (l) { if (l.Tier) tierCounts[l.Tier] = (tierCounts[l.Tier] || 0) + 1; });
  var topTier = Object.entries(tierCounts).sort(function (a,b) { return b[1]-a[1]; });
  var maxTier = topTier[0] ? topTier[0][1] : 1;
  document.getElementById('an-tiers').innerHTML = topTier.map(function (row) {
    return '<div class="an-bar-row">' +
      '<div class="an-bar-label">Tier ' + esc(row[0]) + '</div>' +
      '<div class="an-bar-track"><div class="an-bar-fill" style="width:' + Math.round(row[1]/maxTier*100) + '%;background:var(--gold)"></div></div>' +
      '<div class="an-bar-val">' + row[1] + '</div>' +
    '</div>';
  }).join('') || '<div class="text-muted" style="font-size:12px">No tier data</div>';
}


/* ════════════════════════════════════════════════════════════
   IMPORT
════════════════════════════════════════════════════════════ */
var csvHeaders = [];
var csvRows    = [];

function initImport() {
  var dz = document.getElementById('import-dropzone');
  if (dz._imported) return;
  dz._imported = true;
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('dragover'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault(); dz.classList.remove('dragover');
    var file = e.dataTransfer.files[0];
    if (file) parseCsvFile(file);
  });
}

function handleCsvUpload(input) {
  if (input.files[0]) parseCsvFile(input.files[0]);
}

function parseCsvFile(file) {
  var reader = new FileReader();
  reader.onload = function (e) {
    var lines = e.target.result.split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) { toast('Empty CSV', 'error'); return; }
    csvHeaders = parseCsvLine(lines[0]);
    csvRows    = lines.slice(1).map(parseCsvLine).filter(function (r) { return r.some(function (c) { return c; }); });
    document.getElementById('import-file-info').textContent = file.name + ' — ' + csvRows.length + ' rows, ' + csvHeaders.length + ' columns';
    renderImportMapping();
    document.getElementById('import-step2').style.display = '';
    if (window.lucide) lucide.createIcons();
  };
  reader.readAsText(file);
}

function parseCsvLine(line) {
  var result = [], cur = '', inQ = false;
  for (var i = 0; i < line.length; i++) {
    var c = line[i];
    if (c === '"') { inQ = !inQ; }
    else if (c === ',' && !inQ) { result.push(cur.trim()); cur = ''; }
    else { cur += c; }
  }
  result.push(cur.trim());
  return result;
}

function renderImportMapping() {
  var fields = Object.keys(config.field_mapping || {});
  document.getElementById('import-mapping-table').innerHTML =
    '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">' +
      '<div>CSV Column</div><div></div><div>App Field</div>' +
    '</div>' +
    csvHeaders.map(function (h, i) {
      var best = fields.find(function (f) { return f.toLowerCase() === h.toLowerCase() || (config.field_mapping[f] || '').toLowerCase() === h.toLowerCase(); }) || '';
      return '<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center">' +
        '<div style="font-size:12px;font-weight:500;padding:6px 10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px">' + esc(h) + '</div>' +
        '<div style="color:var(--muted)">→</div>' +
        '<select class="fc fc-sm import-col-map" data-csv-idx="' + i + '">' +
          '<option value="">— skip —</option>' +
          fields.map(function (f) { return '<option value="' + escQ(f) + '"' + (f === best ? ' selected' : '') + '>' + f + '</option>'; }).join('') +
        '</select>' +
      '</div>';
    }).join('');

  // Show preview
  renderImportPreview();
  document.getElementById('import-step3').style.display = '';
}

function renderImportPreview() {
  var preview = csvRows.slice(0, 5);
  document.getElementById('import-preview').innerHTML =
    '<table class="import-preview-table"><thead><tr>' +
    csvHeaders.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' +
    preview.map(function (row) {
      return '<tr>' + csvHeaders.map(function (_, i) { return '<td>' + esc(row[i] || '') + '</td>'; }).join('') + '</tr>';
    }).join('') +
    '</tbody></table>' +
    (csvRows.length > 5 ? '<div style="font-size:11px;color:var(--muted);margin-top:8px">Showing 5 of ' + csvRows.length + ' rows</div>' : '');
}

async function runImport() {
  var mappings = Array.from(document.querySelectorAll('.import-col-map'));
  var colMap   = {};
  mappings.forEach(function (sel) {
    if (sel.value) colMap[parseInt(sel.dataset.csvIdx)] = sel.value;
  });

  var rows = csvRows.map(function (row) {
    var obj = {};
    Object.entries(colMap).forEach(function (entry) {
      obj[entry[1]] = row[parseInt(entry[0])] || '';
    });
    return obj;
  });

  document.getElementById('import-msg').textContent = 'Importing…';
  var res  = await fetch('/api/import/leads', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows: rows }),
  });
  var data = await res.json();
  if (data.ok) {
    toast('Imported ' + data.imported + ' leads', 'success');
    document.getElementById('import-msg').textContent = '✓ ' + data.imported + ' leads imported to sheet';
    fetchLeads();
  } else {
    toast(data.error, 'error');
    document.getElementById('import-msg').textContent = 'Error: ' + data.error;
  }
}

function resetImport() {
  csvHeaders = []; csvRows = [];
  document.getElementById('import-file-info').textContent = '';
  document.getElementById('csv-file-input').value = '';
  document.getElementById('import-step2').style.display = 'none';
  document.getElementById('import-step3').style.display = 'none';
  document.getElementById('import-msg').textContent = '';
}


/* ════════════════════════════════════════════════════════════
   TASKS
════════════════════════════════════════════════════════════ */
var allTasks   = [];
var taskFilter = 'pending';

function setTaskFilter(f, btn) {
  taskFilter = f;
  document.querySelectorAll('#view-tasks .li-filter-btn').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderTasks();
}

async function loadTasks() {
  var res = await fetch('/api/tasks');
  allTasks = await res.json();
  renderTasks();
}

function renderTasks() {
  var pending = allTasks.filter(function (t) { return !t.done; });
  var done    = allTasks.filter(function (t) { return t.done; });
  document.getElementById('task-count-pending').textContent = pending.length;
  document.getElementById('task-count-done').textContent    = done.length;
  document.getElementById('task-count-all').textContent     = allTasks.length;

  // Update sidebar badge
  var badge = document.getElementById('tasks-pending-badge');
  if (badge) { badge.textContent = pending.length; badge.style.display = pending.length ? '' : 'none'; }

  var list  = taskFilter === 'pending' ? pending : taskFilter === 'done' ? done : allTasks;
  var today = new Date().toISOString().slice(0, 10);

  document.getElementById('tasks-list').innerHTML = list.length
    ? list.map(function (t) {
        var overdue = !t.done && t.due_date && t.due_date < today;
        return '<div class="task-card' + (t.done ? ' done' : '') + '">' +
          '<input type="checkbox"' + (t.done ? ' checked' : '') + ' onchange="toggleTask(\'' + t.id + '\',this.checked)"/>' +
          '<div class="task-body">' +
            '<div class="task-title">' + esc(t.title) + '</div>' +
            '<div class="task-meta">' +
              '<span class="task-priority task-priority-' + (t.priority || 'medium') + '">' + (t.priority || 'medium') + '</span>' +
              (t.due_date ? '<span class="' + (overdue ? 'task-overdue' : '') + '">' + (overdue ? '⚠ ' : '') + 'Due ' + t.due_date + '</span>' : '') +
              (t.lead_name ? '<span>· ' + esc(t.lead_name) + '</span>' : '') +
            '</div>' +
          '</div>' +
          '<button class="btn btn-ghost btn-sm" style="padding:4px 8px" onclick="deleteTask(\'' + t.id + '\')">' +
            '<i data-lucide="trash-2" style="width:13px;height:13px;color:var(--muted)"></i>' +
          '</button>' +
        '</div>';
      }).join('')
    : '<div class="text-muted" style="font-size:13px;padding:20px 0">' +
        (taskFilter === 'pending' ? 'No pending tasks — you\'re all caught up!' : 'No tasks yet.') +
      '</div>';

  if (window.lucide) lucide.createIcons();
}

function openNewTaskModal() {
  // Populate lead dropdown
  var sel = document.getElementById('task-lead');
  sel.innerHTML = '<option value="">— none —</option>' +
    allLeads.map(function (l) {
      return '<option value="' + l._row + '" data-name="' + escQ((l.FirstName || '') + ' ' + (l.LastName || '') + ' · ' + (l.CompanyName || '')) + '">' +
        esc((l.FirstName || '') + ' ' + (l.LastName || '') + ' — ' + (l.CompanyName || '')) +
      '</option>';
    }).join('');
  document.getElementById('task-title').value = '';
  document.getElementById('task-due').value   = '';
  document.getElementById('task-priority').value = 'medium';
  document.getElementById('task-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeTaskModal() {
  document.getElementById('task-modal').classList.add('hidden');
}

async function saveNewTask() {
  var title    = document.getElementById('task-title').value.trim();
  if (!title) { toast('Enter a task title', 'error'); return; }
  var due      = document.getElementById('task-due').value;
  var priority = document.getElementById('task-priority').value;
  var leadSel  = document.getElementById('task-lead');
  var leadRow  = leadSel.value ? parseInt(leadSel.value) : null;
  var leadName = leadSel.value ? leadSel.options[leadSel.selectedIndex].dataset.name : '';

  var res  = await fetch('/api/tasks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title, due_date: due, priority: priority, lead_row: leadRow, lead_name: leadName }),
  });
  var data = await res.json();
  if (data.ok) {
    allTasks.push(data.task);
    closeTaskModal();
    renderTasks();
    toast('Task created', 'success');
  }
}

async function toggleTask(id, done) {
  await fetch('/api/tasks/' + id, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ done: done }),
  });
  var t = allTasks.find(function (t) { return t.id === id; });
  if (t) t.done = done;
  renderTasks();
}

async function deleteTask(id) {
  await fetch('/api/tasks/' + id, { method: 'DELETE' });
  allTasks = allTasks.filter(function (t) { return t.id !== id; });
  renderTasks();
}


/* ════════════════════════════════════════════════════════════
   LINKEDIN QUEUE
════════════════════════════════════════════════════════════ */
var liFilter = 'pending';

function updateLiBadge() {
  var pending = allLeads.filter(function (l) {
    return (l.E1_Date || l.E2_Date || l.E3_Date || l.E4_Date) && l.PersonLinkedIn && !l.LI_Request;
  }).length;
  var badge = document.getElementById('li-pending-badge');
  if (badge) { badge.textContent = pending; badge.style.display = pending ? '' : 'none'; }
}

function setLiFilter(f, btn) {
  liFilter = f;
  document.querySelectorAll('.li-filter-btn').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderLinkedInQueue();
}

function renderLinkedInQueue() {
  if (!allLeads.length) return;

  // A lead belongs in the queue if it has been emailed (any E_Date set) and has a LinkedIn URL
  var queued = allLeads.filter(function (l) {
    var emailed = l.E1_Date || l.E2_Date || l.E3_Date || l.E4_Date;
    return emailed && l.PersonLinkedIn;
  });

  var pending  = queued.filter(function (l) { return !l.LI_Request || l.LI_Request === ''; });
  var done     = queued.filter(function (l) { return l.LI_Request && l.LI_Request !== ''; });

  document.getElementById('li-count-pending').textContent = pending.length;
  document.getElementById('li-count-done').textContent    = done.length;
  document.getElementById('li-count-all').textContent     = queued.length;

  // Update sidebar badge
  var badge = document.getElementById('li-pending-badge');
  if (badge) {
    badge.textContent    = pending.length;
    badge.style.display  = pending.length ? '' : 'none';
  }

  var list = liFilter === 'pending' ? pending
           : liFilter === 'done'    ? done
           : queued;

  if (!list.length) {
    document.getElementById('li-queue-list').innerHTML =
      '<div class="text-muted" style="font-size:13px;padding:20px 0">' +
      (liFilter === 'pending' ? 'No pending connections — great work!' :
       liFilter === 'done'    ? 'No completed connections yet.' :
       'No leads with LinkedIn URLs found after emailing.') + '</div>';
    if (window.lucide) lucide.createIcons();
    return;
  }

  document.getElementById('li-queue-list').innerHTML =
    '<div class="li-queue-grid">' +
    list.map(function (l) {
      var isDone      = l.LI_Request && l.LI_Request !== '';
      var chromePro   = chromeProfileForLead(l);
      var lastSeq     = l.E4_Date ? 'E4' : l.E3_Date ? 'E3' : l.E2_Date ? 'E2' : 'E1';
      var emailedDate = l.E4_Date || l.E3_Date || l.E2_Date || l.E1_Date || '';

      return '<div class="li-card' + (isDone ? ' li-card-done' : '') + '">' +

        '<div class="li-card-left">' +
          '<div class="li-avatar">' + (l.FirstName || '?').charAt(0).toUpperCase() + '</div>' +
          '<div>' +
            '<div class="li-name">' + esc(l.FirstName || '') + ' ' + esc(l.LastName || '') + '</div>' +
            '<div class="li-meta">' + esc(l.EmployeeDesignation || '') + (l.CompanyName ? ' · ' + esc(l.CompanyName) : '') + '</div>' +
            '<div class="li-meta" style="margin-top:2px;color:var(--dim)">' +
              'Emailed ' + lastSeq + (emailedDate ? ' on ' + emailedDate.split(' ')[0] : '') +
              (chromePro ? ' · <span style="color:var(--accent)">' + esc(chromePro) + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div class="li-card-right">' +
          (isDone
            ? '<span class="li-done-label"><i data-lucide="check-circle-2" style="width:13px;height:13px"></i> ' + esc(l.LI_Request) + '</span>'
            : '<button class="btn btn-primary btn-sm li-open-btn"' +
                ' data-url="' + escQ(l.PersonLinkedIn) + '"' +
                ' data-profile="' + escQ(chromePro) + '"' +
                ' data-row="' + l._row + '">' +
                '<i data-lucide="linkedin" style="width:13px;height:13px"></i> Open Profile' +
              '</button>') +
          (!isDone
            ? '<button class="btn btn-ghost btn-sm li-done-btn" style="margin-left:6px"' +
                ' data-row="' + l._row + '">' +
                '<i data-lucide="check" style="width:13px;height:13px"></i> Mark Done' +
              '</button>'
            : '') +
        '</div>' +

      '</div>';
    }).join('') +
    '</div>';

  if (window.lucide) lucide.createIcons();

}

// Single delegated listener on the view — survives re-renders
document.addEventListener('click', function (e) {
  var openBtn = e.target.closest('.li-open-btn');
  var doneBtn = e.target.closest('.li-done-btn');
  if (openBtn) liOpen(openBtn.dataset.url, openBtn.dataset.profile, parseInt(openBtn.dataset.row));
  if (doneBtn) liMarkDone(parseInt(doneBtn.dataset.row), 'Sent');
});

function chromeProfileForLead(lead) {
  // Match lead's SendingInbox email to an SMTP account to get its chrome_profile
  var inbox   = (lead.SendingInbox || '').toLowerCase().trim();
  var accounts = config.smtp_accounts || [];
  var match   = accounts.find(function (a) { return (a.email || '').toLowerCase().trim() === inbox; });
  return (match && match.chrome_profile) ? match.chrome_profile : (accounts[0] && accounts[0].chrome_profile) || 'Default';
}

async function liOpen(url, chromeProfile, row) {
  var res  = await fetch('/api/linkedin/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: url, chrome_profile: chromeProfile }),
  });
  var data = await res.json();
  if (!data.ok) { toast(data.error, 'error'); return; }
  // Auto-mark as sent after opening
  await liMarkDone(row, 'Sent');
}

async function liMarkDone(row, status) {
  var res  = await fetch('/api/linkedin/done', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row: row, status: status }),
  });
  var data = await res.json();
  if (!data.ok) { toast(data.error, 'error'); return; }

  // Update local lead data so re-render is instant
  var lead = allLeads.find(function (l) { return l._row === row; });
  if (lead) lead.LI_Request = status;
  renderLinkedInQueue();
  toast('Marked as ' + status, 'success');
}


/* ════════════════════════════════════════════════════════════
   INBOX
════════════════════════════════════════════════════════════ */
var _allEmails    = [];
var _inboxFilter  = '';   // '' = all accounts
var _inboxLoaded  = false;

async function loadInbox() {
  var content = document.getElementById('inbox-content');
  content.innerHTML = '<div style="text-align:center;padding:60px 0;color:var(--muted);font-size:13px">' +
    '<div style="display:inline-block;width:20px;height:20px;border:2px solid var(--accent);border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite;margin-bottom:12px"></div>' +
    '<div>Loading emails…</div></div>';

  var res  = await fetch('/api/inbox');
  var data = await res.json();

  if (!data.ok) {
    content.innerHTML = '<div style="padding:24px;background:var(--surface);border:1px solid var(--border);border-radius:14px">' +
      '<div style="font-weight:600;color:#f87171;margin-bottom:6px">Could not load inbox</div>' +
      '<div style="font-size:12px;color:var(--muted);white-space:pre-wrap">' + esc(data.error) + '</div></div>';
    return;
  }

  _allEmails = data.messages || [];
  _inboxLoaded = true;

  // Show account errors if any
  var errDiv = document.getElementById('inbox-errors');
  errDiv.innerHTML = (data.errors || []).map(function (e) {
    return '<div style="padding:10px 14px;background:#450a0a;border:1px solid #7f1d1d;border-radius:10px;margin-bottom:8px;font-size:12px;color:#fca5a5">' +
      '<strong>' + esc(e.account) + '</strong>: ' + esc(e.error) + '</div>';
  }).join('');

  // Account filter chips
  var accounts = [];
  _allEmails.forEach(function (m) {
    if (accounts.indexOf(m.account) < 0) accounts.push(m.account);
  });
  var chips = document.getElementById('inbox-accounts');
  chips.innerHTML = '<button class="inbox-chip ' + (_inboxFilter === '' ? 'active' : '') + '" onclick="setInboxFilter(\'\',this)">All <span class="li-filter-count">' + _allEmails.length + '</span></button>' +
    accounts.map(function (a) {
      var c = _allEmails.filter(function (m) { return m.account === a; }).length;
      return '<button class="inbox-chip ' + (_inboxFilter === a ? 'active' : '') + '" onclick="setInboxFilter(\'' + escQ(a) + '\',this)">' + esc(a.split('@')[0]) + ' <span class="li-filter-count">' + c + '</span></button>';
    }).join('');

  // Badge
  var badge = document.getElementById('inbox-unread-badge');
  if (badge) { badge.textContent = _allEmails.length; badge.style.display = _allEmails.length ? '' : 'none'; }

  renderInbox();
  if (window.lucide) lucide.createIcons();
}

function setInboxFilter(account, btn) {
  _inboxFilter = account;
  document.querySelectorAll('.inbox-chip').forEach(function (b) { b.classList.remove('active'); });
  btn.classList.add('active');
  renderInbox();
}

function renderInbox() {
  var list = _inboxFilter
    ? _allEmails.filter(function (m) { return m.account === _inboxFilter; })
    : _allEmails;

  var content = document.getElementById('inbox-content');
  if (!list.length) {
    content.innerHTML = '<div style="text-align:center;padding:60px 0;color:var(--muted);font-size:13px">No emails in the last 7 days</div>';
    return;
  }

  content.innerHTML = '<div class="inbox-list">' +
    list.map(function (m, i) {
      var globalIdx = _allEmails.indexOf(m);
      var d = m.date ? new Date(m.ts * 1000) : null;
      var dateStr = d ? d.toLocaleDateString(undefined, {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'}) : '';
      return '<div class="inbox-row" onclick="openEmailModal(' + globalIdx + ')">' +
        '<div style="min-width:0">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">' +
            '<div class="inbox-from">' + esc(m.from) + '</div>' +
            '<span style="font-size:10px;color:var(--dim);padding:1px 7px;background:var(--surface2);border:1px solid var(--border);border-radius:999px">' + esc(m.account.split('@')[0]) + '</span>' +
          '</div>' +
          '<div class="inbox-subject">' + esc(m.subject) + '</div>' +
          '<div class="inbox-preview">' + esc(m.preview || '') + '</div>' +
        '</div>' +
        '<div class="inbox-date">' + dateStr + '</div>' +
      '</div>';
    }).join('') +
  '</div>';
}

function openEmailModal(idx) {
  var m = _allEmails[idx];
  if (!m) return;
  document.getElementById('em-subject').textContent = m.subject || '(no subject)';
  document.getElementById('em-from').textContent    = 'From: ' + m.from;
  var d = m.ts ? new Date(m.ts * 1000) : null;
  document.getElementById('em-meta').innerHTML =
    '<span>To: ' + esc(m.to || m.account) + '</span>' +
    (d ? '<span>' + d.toLocaleString() + '</span>' : '');
  document.getElementById('em-body').textContent = m.body || '(empty)';
  document.getElementById('email-modal').classList.remove('hidden');
}

function closeEmailModal() {
  document.getElementById('email-modal').classList.add('hidden');
}


/* ════════════════════════════════════════════════════════════
   LEAD DETAIL MODAL
════════════════════════════════════════════════════════════ */
var _ldmIdx  = null;
var _ldmLead = null;

function openLeadDetail(idx) {
  _ldmIdx  = idx;
  _ldmLead = allLeads[idx];
  if (!_ldmLead) return;

  var l = _ldmLead;
  document.getElementById('ldm-name').textContent = ((l.FirstName || '') + ' ' + (l.LastName || '')).trim() || l.Email || '—';
  document.getElementById('ldm-sub').textContent  =
    (l.EmployeeDesignation ? l.EmployeeDesignation + '  ·  ' : '') + (l.CompanyName || '');

  // All fields in a grid
  var allKeys = Object.keys(l).filter(function (k) { return k !== '_row' && !k.startsWith('_'); });
  document.getElementById('ldm-body').innerHTML = allKeys.map(function (k) {
    var val = l[k];
    if (!val) return '';
    var isLink = (k === 'PersonLinkedIn' || k === 'CompanyLinkedIn' || k === 'Website') && val;
    return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:10px 12px">' +
      '<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:4px">' + esc(k.replace(/_/g,' ')) + '</div>' +
      (isLink
        ? '<a href="' + esc(val) + '" target="_blank" style="font-size:12px;color:var(--accent);word-break:break-all">↗ ' + esc(val) + '</a>'
        : '<div style="font-size:12px;color:var(--text);word-break:break-word">' + esc(val) + '</div>') +
      '</div>';
  }).filter(Boolean).join('');

  document.getElementById('ldm-notes').value = l.Notes || '';

  // Wire buttons
  document.getElementById('ldm-send-btn').onclick = function () {
    closeLeadDetail();
    openModal(idx);
  };
  document.getElementById('ldm-save-notes-btn').onclick = saveLeadNotes;

  document.getElementById('lead-detail-modal').classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeLeadDetail() {
  document.getElementById('lead-detail-modal').classList.add('hidden');
  _ldmLead = null;
  _ldmIdx  = null;
}

async function saveLeadNotes() {
  if (!_ldmLead) return;
  var notes = document.getElementById('ldm-notes').value;
  _ldmLead.Notes = notes;
  await fetch('/api/update_lead', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ row: _ldmLead._row, fields: { Notes: notes } })
  });
  toast('Notes saved', 'success');
}


/* ════════════════════════════════════════════════════════════
   EXPORT CSV
════════════════════════════════════════════════════════════ */
function exportCsv() {
  var leads = filteredLeads.length ? filteredLeads : allLeads;
  if (!leads.length) { toast('No leads to export', 'error'); return; }

  var fields = Object.keys(leads[0]).filter(function (k) { return k !== '_row' && !k.startsWith('_'); });
  var lines  = [fields.join(',')];

  leads.forEach(function (l) {
    lines.push(fields.map(function (f) {
      var v = String(l[f] || '').replace(/"/g, '""');
      return v.indexOf(',') >= 0 || v.indexOf('"') >= 0 || v.indexOf('\n') >= 0 ? '"' + v + '"' : v;
    }).join(','));
  });

  var blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  var a    = document.createElement('a');
  a.href   = URL.createObjectURL(blob);
  a.download = 'farance-leads-' + new Date().toISOString().slice(0,10) + '.csv';
  a.click();
  toast('Exported ' + leads.length + ' leads', 'success');
}


/* ════════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', function (e) {
  // Ignore when typing in an input / textarea
  var tag = (e.target.tagName || '').toLowerCase();
  var isInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

  // Escape — close any open modal
  if (e.key === 'Escape') {
    ['modal', 'task-modal', 'lead-detail-modal', 'email-modal', 'blast-confirm-modal'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el && !el.classList.contains('hidden')) el.classList.add('hidden');
    });
    return;
  }

  if (isInput) return;

  // / — focus search
  if (e.key === '/') {
    e.preventDefault();
    var s = document.getElementById('search');
    if (s) { showTab('leads'); s.focus(); s.select(); }
  }

  // R — refresh leads
  if (e.key === 'r' || e.key === 'R') {
    fetchLeads();
  }

  // D — go to dashboard
  if (e.key === 'd' || e.key === 'D') showTab('dashboard');

  // L — go to leads
  if (e.key === 'l' || e.key === 'L') showTab('leads');

  // B — go to blast
  if (e.key === 'b' || e.key === 'B') showTab('blast');
});


/* ════════════════════════════════════════════════════════════
   INIT
════════════════════════════════════════════════════════════ */
(async function init() {
  initTheme();
  await loadConfig();
  buildTableHeader();
  fetchLeads();

  // Delay label syncs live with inputs
  ['min-delay', 'max-delay'].forEach(function (id) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('input', updateDelayLabel);
  });
})();
