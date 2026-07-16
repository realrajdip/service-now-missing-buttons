(function() {
  if (!/(^|\/)incident\.do($|\?)/.test(window.location.pathname)) {
    return;
  }

  console.log('[ServiceNow Incident Helpers] Content script loaded on incident form.');

  const injectScript = () => {
    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('page_inject.js');
      (document.head || document.documentElement).appendChild(script);
      script.onload = () => script.remove();
    } catch (e) {
      console.error('[ServiceNow Incident Helpers] Failed to inject page script:', e);
    }
  };
  injectScript();

  const pendingRequests = new Map();

  function triggerAction(action) {
    const requestId = Math.random().toString(36).substring(2, 11);
    
    const loadingTimeout = setTimeout(() => {
      setButtonsLoading(true, action);
    }, 150);

    window.postMessage({
      source: 'sn-helpers-content',
      action,
      requestId
    }, window.location.origin);

    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, {
        action,
        resolve,
        reject,
        clearLoading: () => {
          clearTimeout(loadingTimeout);
          setButtonsLoading(false);
        }
      });
      
      setTimeout(() => {
        if (pendingRequests.has(requestId)) {
          const req = pendingRequests.get(requestId);
          req.clearLoading();
          req.reject(new Error('Action timed out. ServiceNow page is not responding.'));
          pendingRequests.delete(requestId);
        }
      }, 10000);
    });
  }

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'sn-helpers-page') return;

    const { type, action, requestId, error, details } = event.data;
    const pending = pendingRequests.get(requestId);

    if (pending) {
      pending.clearLoading();
      pendingRequests.delete(requestId);

      if (type === 'SN_ACTION_ERROR') {
        showToast(error, 'error');
        pending.reject(new Error(error));
      } else if (type === 'SN_ACTION_SUCCESS') {
        let successMessage = 'Action completed successfully!';
        if (action === 'assign_to_me') {
          successMessage = 'Assigned to you!';
        }
        showToast(successMessage, 'success');
        pending.resolve();
      } else if (type === 'SN_DETAILS_RESPONSE') {
        handleDetailsResponse(details);
        pending.resolve();
      }
    }
  });

  function formatAssignedTo(assignedToVal) {
    if (!assignedToVal) return '';
    let name = assignedToVal.trim();
    const parenIndex = name.indexOf('(');
    if (parenIndex !== -1) {
      name = name.substring(0, parenIndex).trim();
    }
    return name ? `@${name}` : '';
  }

  function handleDetailsResponse(details) {
    const { number, shortDesc, description, priority, urgency, category, assignmentGroup, assignedTo, sysId, tableName, origin } = details;

    const url = `${origin}/nav_to.do?uri=${tableName}.do?sys_id=${sysId}`;

    const formattedAssignedTo = formatAssignedTo(assignedTo);

    const plainText = [
      `Incident: ${number}`,
      `Short Description: ${shortDesc}`,
      `Priority: ${priority}`,
      `Urgency: ${urgency}`,
      `Category: ${category}`,
      `Assignment Group: ${assignmentGroup || '(Empty)'}`,
      `Assigned To: ${formattedAssignedTo || '(Empty)'}`
    ].join('\n');

    const htmlText = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #2e3d49; max-width: 600px; border-left: 4px solid #1f8476; padding-left: 12px; margin: 8px 0;">
        <div style="margin-bottom: 4px;">
          <strong style="color: #1f8476;">Incident:&nbsp;</strong><a href="${url}" target="_blank" style="color: #0052cc; text-decoration: none; font-weight: 600;">${number}</a>
        </div>
        <div style="margin-bottom: 4px;">
          <strong>Short Description:&nbsp;</strong>${escapeHtml(shortDesc)}
        </div>
        <div style="margin-bottom: 4px;">
          <strong>Priority:&nbsp;</strong>${escapeHtml(priority)}
        </div>
        <div style="margin-bottom: 4px;">
          <strong>Urgency:&nbsp;</strong>${escapeHtml(urgency)}
        </div>
        <div style="margin-bottom: 4px;">
          <strong>Assignment Group:&nbsp;</strong>${escapeHtml(assignmentGroup || 'None')}
        </div>
        <div>
          <strong>Assigned To:&nbsp;</strong>${escapeHtml(formattedAssignedTo || 'None')}
        </div>
      </div>
    `;

    copyToClipboard(plainText, htmlText)
      .then(() => {
        showToast('Incident details copied to clipboard!', 'success');
      })
      .catch((err) => {
        showToast('Failed to copy to clipboard: ' + err.message, 'error');
      });
  }

  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function copyToClipboard(plainText, htmlText) {
    try {
      const textBlob = new Blob([plainText], { type: 'text/plain' });
      const htmlBlob = new Blob([htmlText], { type: 'text/html' });
      const item = new ClipboardItem({
        'text/plain': textBlob,
        'text/html': htmlBlob
      });
      await navigator.clipboard.write([item]);
    } catch (err) {
      console.warn('[ServiceNow Incident Helpers] ClipboardItem failed, falling back to plain text:', err);
      await navigator.clipboard.writeText(plainText);
    }
  }

  function setButtonsLoading(loading, currentAction = '') {
    const buttons = document.querySelectorAll('.sn-helper-btn');
    buttons.forEach(btn => {
      if (loading) {
        btn.disabled = true;
        btn.style.opacity = '0.6';
        btn.style.cursor = 'not-allowed';
        if (btn.classList.contains('sn-helper-assign') && currentAction === 'assign_to_me') {
          btn.textContent = 'Assigning...';
        } else if (btn.classList.contains('sn-helper-copy') && currentAction === 'copy_details') {
          btn.textContent = 'Copying...';
        }
      } else {
        btn.disabled = false;
        btn.style.opacity = '';
        btn.style.cursor = '';
        if (btn.classList.contains('sn-helper-assign')) {
          btn.textContent = 'Assign to me';
        } else if (btn.classList.contains('sn-helper-copy')) {
          btn.textContent = 'Copy Details';
        }
      }
    });
  }

  function showToast(message, type = 'success') {
    let toastContainer = document.getElementById('sn-helper-toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'sn-helper-toast-container';
      toastContainer.style.position = 'fixed';
      toastContainer.style.bottom = '20px';
      toastContainer.style.right = '20px';
      toastContainer.style.zIndex = '999999';
      toastContainer.style.display = 'flex';
      toastContainer.style.flexDirection = 'column';
      toastContainer.style.gap = '10px';
      document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    toast.className = `sn-helper-toast sn-helper-toast-${type}`;
    toast.style.padding = '12px 20px';
    toast.style.borderRadius = '4px';
    toast.style.color = '#fff';
    toast.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    toast.style.fontSize = '14px';
    toast.style.fontWeight = '500';
    toast.style.boxShadow = '0 4px 15px rgba(0,0,0,0.2)';
    toast.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';

    if (type === 'success') {
      toast.style.backgroundColor = '#1f8476';
    } else if (type === 'error') {
      toast.style.backgroundColor = '#d9534f';
    } else {
      toast.style.backgroundColor = '#0052cc';
    }

    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';
    }, 10);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => {
        toast.remove();
        if (toastContainer.children.length === 0) {
          toastContainer.remove();
        }
      }, 300);
    }, 3500);
  }

  function injectButtons() {
    if (document.getElementById('sn-helper-assign-btn') || document.getElementById('sn-helper-copy-btn')) return;

    const titleEl = document.querySelector('.navbar-title-display-value') ||
                    document.querySelector('.navbar-title') ||
                    document.getElementById('section-508-title-display-value') ||
                    document.querySelector('span[id*="section_header"]');

    if (!titleEl) return;

    const wrapper = titleEl.closest('.navbar-title-caption-wrapper') ||
                    titleEl.closest('.navbar-title') ||
                    titleEl;

    const parent = wrapper.parentElement;
    if (!parent) return;

    if (parent.querySelector('#sn-helper-assign-btn')) return;

    const assignBtn = document.createElement('button');
    assignBtn.id = 'sn-helper-assign-btn';
    assignBtn.type = 'button';
    assignBtn.textContent = 'Assign to me';
    assignBtn.className = 'form_action_button btn btn-default sn-helper-btn sn-helper-assign';
    assignBtn.onclick = (e) => {
      e.preventDefault();
      triggerAction('assign_to_me');
    };

    const copyBtn = document.createElement('button');
    copyBtn.id = 'sn-helper-copy-btn';
    copyBtn.type = 'button';
    copyBtn.textContent = 'Copy Details';
    copyBtn.className = 'form_action_button btn btn-default sn-helper-btn sn-helper-copy';
    copyBtn.onclick = (e) => {
      e.preventDefault();
      triggerAction('copy_details');
    };

    parent.insertBefore(copyBtn, wrapper.nextSibling);
    parent.insertBefore(assignBtn, wrapper.nextSibling);
  }

  injectButtons();

  const observer = new MutationObserver(() => injectButtons());
  observer.observe(document.body, { childList: true, subtree: true });

})();
