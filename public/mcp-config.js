// MCP Server configuration panel
(function() {
  const toggleBtn = document.getElementById('toggle-mcp-panel');
  const panel = document.getElementById('mcp-panel');
  const addForm = document.getElementById('add-server-form');
  const serverList = document.getElementById('server-list');
  const httpFields = document.getElementById('http-fields');
  const stdioFields = document.getElementById('stdio-fields');
  const typeOptions = document.querySelectorAll('.type-option');

  // Type toggle
  typeOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      typeOptions.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      const type = opt.dataset.type;
      httpFields.style.display = type === 'http' ? 'flex' : 'none';
      stdioFields.style.display = type === 'stdio' ? 'flex' : 'none';
    });
  });

  function getSelectedType() {
    const checked = document.querySelector('input[name="server-type"]:checked');
    return checked ? checked.value : 'http';
  }

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) {
      loadServers();
    }
  });

  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('server-id').value.trim();
    const type = getSelectedType();

    if (!id) return;

    let body;
    if (type === 'http') {
      const url = document.getElementById('server-url').value.trim();
      if (!url) { alert('URL is required'); return; }
      body = { id, type: 'http', url };
    } else {
      const command = document.getElementById('server-command').value.trim();
      const args = document.getElementById('server-args').value.trim();
      const env = document.getElementById('server-env').value.trim();
      if (!command) { alert('Command is required'); return; }
      body = { id, type: 'stdio', command, args, env };
    }

    const btn = addForm.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Connecting...';

    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        alert(`Failed to connect: ${data.error}`);
      } else {
        addForm.reset();
        // Re-select the type toggle since reset clears radio buttons
        typeOptions.forEach(o => o.classList.remove('selected'));
        typeOptions[0].classList.add('selected');
        httpFields.style.display = 'flex';
        stdioFields.style.display = 'none';
        document.querySelector('input[name="server-type"][value="http"]').checked = true;
        renderServers(data.servers);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }

    btn.disabled = false;
    btn.textContent = 'Connect';
  });

  async function loadServers() {
    try {
      const res = await fetch('/api/mcp/servers');
      const data = await res.json();
      renderServers(data.servers);
    } catch (err) {
      serverList.innerHTML = '<p style="color:var(--error)">Failed to load servers</p>';
    }
  }

  function renderServers(servers) {
    if (!servers.length) {
      serverList.innerHTML = '<p style="color:var(--text-dim);font-size:13px;margin-top:8px">No servers connected</p>';
      return;
    }

    serverList.innerHTML = servers.map(s => {
      const detail = s.type === 'http'
        ? `<div style="font-size:11px;color:var(--text-dim);word-break:break-all">${escapeHtml(s.url || '')}</div>`
        : '';
      return `
        <div class="server-entry">
          <div class="server-header">
            <span class="server-status ${s.status}"></span>
            <span class="server-name">${escapeHtml(s.id)}</span>
            <span style="font-size:10px;color:var(--text-dim);text-transform:uppercase">${s.type || 'stdio'}</span>
            <button class="server-remove" onclick="removeMCPServer('${escapeHtml(s.id)}')" title="Remove">&times;</button>
          </div>
          ${detail}
          <div class="server-tools">
            ${s.tools.length ? s.tools.map(t => `<span>${escapeHtml(t)}</span>`).join('') : '<span style="opacity:0.5">no tools</span>'}
          </div>
        </div>
      `;
    }).join('');
  }

  window.removeMCPServer = async function(id) {
    try {
      const res = await fetch(`/api/mcp/servers/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        renderServers(data.servers);
      } else {
        alert(`Failed: ${data.error}`);
      }
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
})();
