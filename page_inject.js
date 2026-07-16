(function() {
  if (window.__sn_helpers_injected) return;
  window.__sn_helpers_injected = true;

  console.log('[ServiceNow Incident Helpers] Page script injected successfully.');

  window.addEventListener('message', (event) => {
    if (!event.data || event.data.source !== 'sn-helpers-content') return;

    const { action, requestId } = event.data;

    if (typeof window.g_form === 'undefined') {
      window.postMessage({
        source: 'sn-helpers-page',
        type: 'SN_ACTION_ERROR',
        requestId,
        error: 'g_form is not defined in this frame. Ensure this is an editable ServiceNow form.'
      }, window.location.origin);
      return;
    }

    try {
      if (action === 'assign_to_me') {
        if (typeof window.g_user === 'undefined' || !window.g_user.userID) {
          throw new Error('g_user context is missing or not fully loaded.');
        }
        
        const currentUserId = window.g_user.userID;
        const currentUserFullName = window.g_user.getFullName() || window.g_user.userName || 'Current User';
        
        window.g_form.setValue('assigned_to', currentUserId, currentUserFullName);
        window.postMessage({
          source: 'sn-helpers-page',
          type: 'SN_ACTION_SUCCESS',
          action,
          requestId
        }, window.location.origin);
      } else if (action === 'copy_details') {
        const number = window.g_form.getValue('number') || '';
        const shortDesc = window.g_form.getValue('short_description') || '';
        const description = window.g_form.getValue('description') || '';
        const priority = window.g_form.getDisplayValue('priority') || window.g_form.getValue('priority') || '';
        const urgency = window.g_form.getDisplayValue('urgency') || window.g_form.getValue('urgency') || '';
        const category = window.g_form.getDisplayValue('category') || window.g_form.getValue('category') || '';
        const assignmentGroup = window.g_form.getDisplayValue('assignment_group') || window.g_form.getValue('assignment_group') || '';
        const assignedTo = window.g_form.getDisplayValue('assigned_to') || window.g_form.getValue('assigned_to') || '';
        const sysId = window.g_form.getUniqueValue() || '';
        const tableName = window.g_form.getTableName() || 'incident';
        const origin = window.location.origin;

        const details = {
          number,
          shortDesc,
          description,
          priority,
          urgency,
          category,
          assignmentGroup,
          assignedTo,
          sysId,
          tableName,
          origin
        };

        window.postMessage({
          source: 'sn-helpers-page',
          type: 'SN_DETAILS_RESPONSE',
          requestId,
          details
        }, window.location.origin);
      }
    } catch (err) {
      window.postMessage({
        source: 'sn-helpers-page',
        type: 'SN_ACTION_ERROR',
        requestId,
        error: err.message
      }, window.location.origin);
    }
  });
})();
