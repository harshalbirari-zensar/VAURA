const chatContainer = document.getElementById('chatContainer');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
const resetBtn = document.getElementById('resetBtn');
const newChatBtn = document.getElementById('newChatBtn');
const tokenUsage = document.getElementById('tokenUsage');
const sessionInfo = document.getElementById('sessionInfo');
const chatHistoryList = document.getElementById('chatHistoryList');
const historySearch = document.getElementById('historySearch');
const toggleSidebar = document.getElementById('toggleSidebar');
const menuToggle = document.getElementById('menuToggle');
const sidebar = document.getElementById('sidebar');
const toggleIcon = document.getElementById('toggleIcon');

// Session management
let currentSessionId = `session-${Date.now()}`;
let currentUserId = 'default-user';
let isFirstMessage = true;

// Initialize
loadChatHistory();

// Event Listeners
sendBtn.addEventListener('click', sendMessage);
resetBtn.addEventListener('click', clearCurrentChat);
newChatBtn.addEventListener('click', startNewChat);
toggleSidebar.addEventListener('click', toggleSidebarVisibility);
menuToggle.addEventListener('click', toggleMobileSidebar);
historySearch.addEventListener('input', filterChatHistory);

// Quick action buttons
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('quick-action-btn')) {
        const query = e.target.getAttribute('data-query');
        userInput.value = query;
        sendMessage();
    }
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// Functions
async function sendMessage() {
    const message = userInput.value.trim();
    
    if (!message) return;

    // Remove welcome message on first interaction
    if (isFirstMessage) {
        chatContainer.innerHTML = '';
        isFirstMessage = false;
    }

    // Add user message to chat
    addMessage(message, 'user');
    
    // Clear input
    userInput.value = '';
    
    // Disable send button while processing
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<span class="btn-text">Sending...</span>';

    // Show loading indicator
    const loadingId = showLoading();

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                message,
                sessionId: currentSessionId,
                userId: currentUserId
            })
        });

        const data = await response.json();

        // Remove loading indicator
        removeLoading(loadingId);

        if (response.ok) {
            // Update session ID if returned
            if (data.sessionId) {
                currentSessionId = data.sessionId;
                updateSessionInfo();
            }

            // Check if response is an UPDATE operation
            if (data.isUpdate) {
                addUpdateResult(data.affectedRows, data.sql);
            }
            // Check if response contains IT Operations data
            else if (data.isITOperation) {
                addITOperationsResults(data);
            }
            // Check if response contains database data
            else if (data.data && Array.isArray(data.data)) {
                addDatabaseResults(data.data, data.count, data.sql);
            } else {
                // Add normal assistant response
                addMessage(data.response, 'assistant');
            }
            
            // Update token usage
            if (data.usage) {
                tokenUsage.textContent = `Tokens: ${data.usage.total_tokens}`;
            } else if (data.result && data.result.count !== undefined) {
                tokenUsage.textContent = `IT Operations: ${data.module} - ${data.result.count} record(s)`;
            } else if (data.count !== undefined) {
                tokenUsage.textContent = `Database: ${data.count} record(s)`;
            } else if (data.isUpdate) {
                tokenUsage.textContent = `Database: ${data.affectedRows} row(s) updated`;
            }

            // Reload chat history
            loadChatHistory();
        } else {
            addMessage(`Error: ${data.error}`, 'error');
        }

    } catch (error) {
        removeLoading(loadingId);
        addMessage(`Connection error: ${error.message}`, 'error');
    }

    // Re-enable send button
    sendBtn.disabled = false;
    sendBtn.innerHTML = '<span class="btn-text">Send</span><span class="btn-icon">📤</span>';
    
    // Focus back on input
    userInput.focus();
}

function addMessage(content, role) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (role === 'error') {
        contentDiv.style.background = '#fee';
        contentDiv.style.color = '#c33';
        contentDiv.style.border = '1px solid #fcc';
    }
    
    // Format the content (preserve line breaks)
    contentDiv.innerHTML = content.replace(/\n/g, '<br>');
    
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    
    // Scroll to bottom
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addITOperationsResults(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    const result = data.result || {};
    const module = data.module || 'Unknown';
    
    // Module icons
    const moduleIcons = {
        'cmdb': '🔧',
        'eventhub': '📡',
        'incident': '🚨',
        'knowledgehub': '📚',
        'servicecatalog': '📋',
        'businessservice': '🏢',
        'dashboard': '📊'
    };
    
    const icon = moduleIcons[module] || '📦';
    
    let resultHTML = `
        <div style="margin-bottom: 10px;">
            <strong style="color: #2196F3;">${icon} IT Operations - ${module.toUpperCase()}</strong>
        </div>
    `;
    
    // Display message if available
    if (result.message) {
        resultHTML += `
            <div style="padding: 10px; background: #e3f2fd; border-radius: 5px; border-left: 4px solid #2196F3; margin-bottom: 10px;">
                <div style="font-size: 14px; color: #1565c0;">
                    ${result.message}
                </div>
            </div>
        `;
    }
    
    // Format based on data type
    if (result.configurationItems && Array.isArray(result.configurationItems) && result.configurationItems.length > 0) {
        resultHTML += formatTable(result.configurationItems, 'Configuration Items', result.count);
    } else if (result.events && Array.isArray(result.events) && result.events.length > 0) {
        resultHTML += formatTable(result.events, 'Events/Alerts', result.count);
    } else if (result.alerts && Array.isArray(result.alerts) && result.alerts.length > 0) {
        resultHTML += formatTable(result.alerts, 'Alerts', result.count);
    } else if (result.services && Array.isArray(result.services) && result.services.length > 0) {
        resultHTML += formatTable(result.services, 'Business Services', result.count);
    } else if (result.incidents && Array.isArray(result.incidents) && result.incidents.length > 0) {
        resultHTML += formatTable(result.incidents, 'Incidents', result.count);
    } else if (result.serviceRequests && Array.isArray(result.serviceRequests) && result.serviceRequests.length > 0) {
        resultHTML += formatTable(result.serviceRequests, 'Service Requests', result.count);
    } else if (result.knowledgeArticles && Array.isArray(result.knowledgeArticles) && result.knowledgeArticles.length > 0) {
        resultHTML += formatTable(result.knowledgeArticles, 'Knowledge Articles', result.count);
    } else if (result.count === 0) {
        resultHTML += `
            <div style="padding: 15px; background: #fff3e0; border-radius: 5px; border-left: 4px solid #ff9800;">
                <div style="font-size: 14px; color: #e65100;">
                    ⚠️ No data found. Try asking:
                    <ul style="margin-top: 10px; padding-left: 20px;">
                        <li>"Show me IT operations dashboard"</li>
                        <li>"Get all active alerts"</li>
                        <li>"Search CMDB for recent items"</li>
                        <li>"Show business services"</li>
                        <li>"List open incidents"</li>
                    </ul>
                </div>
            </div>
        `;
    } else {
        // Display generic result
        resultHTML += `<pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto;">${JSON.stringify(result, null, 2)}</pre>`;
    }
    
    contentDiv.innerHTML = resultHTML;
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function formatTable(data, title, count) {
    if (!data || data.length === 0) return '';
    
    const keys = Object.keys(data[0]).slice(0, 6); // Show first 6 columns
    
    let tableHTML = `
        <div style="margin-bottom: 10px;">
            <strong>📊 ${title} (${count || data.length} records)</strong>
        </div>
        <div style="overflow-x: auto; max-height: 400px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead style="position: sticky; top: 0; background: #2196F3; color: white; z-index: 1;">
                    <tr>
    `;
    
    keys.forEach(key => {
        tableHTML += `<th style="border: 1px solid #ddd; padding: 10px; text-align: left;">${key}</th>`;
    });
    
    tableHTML += `
                    </tr>
                </thead>
                <tbody>
    `;
    
    data.forEach((row, index) => {
        const bgColor = index % 2 === 0 ? '#fff' : '#f9f9f9';
        tableHTML += `<tr style="background: ${bgColor}; border-bottom: 1px solid #eee;">`;
        keys.forEach(key => {
            let value = row[key];
            if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
                value = new Date(value).toLocaleString();
            }
            if (typeof value === 'object' && value !== null) {
                value = JSON.stringify(value);
            }
            if (typeof value === 'string' && value.length > 50) {
                value = value.substring(0, 50) + '...';
            }
            tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${value !== null && value !== undefined ? value : '<em style="color: #999;">null</em>'}</td>`;
        });
        tableHTML += `</tr>`;
    });
    
    tableHTML += `
                </tbody>
            </table>
        </div>
    `;
    
    return tableHTML;
}

function addDatabaseResults(data, count, sql) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    if (data.length === 0) {
        contentDiv.innerHTML = '<p>No records found.</p>';
    } else {
        const keys = Object.keys(data[0]);
        let tableHTML = `
            <div style="margin-bottom: 10px;">
                <strong>📊 Found ${count} record(s)</strong>
            </div>
        `;
        
        if (sql) {
            tableHTML += `
                <div style="margin-bottom: 10px; padding: 10px; background: #f5f5f5; border-radius: 5px; border-left: 3px solid #4CAF50;">
                    <div style="font-size: 11px; color: #666; margin-bottom: 5px;">🤖 AI Generated SQL:</div>
                    <code style="font-family: 'Courier New', monospace; font-size: 12px; color: #d63384;">${sql}</code>
                </div>
            `;
        }
        
        tableHTML += `
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                    <thead>
                        <tr style="background: #f0f0f0;">
        `;
        
        keys.forEach(key => {
            tableHTML += `<th style="border: 1px solid #ddd; padding: 8px; text-align: left;">${key}</th>`;
        });
        
        tableHTML += `
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        data.forEach((row, index) => {
            const bgColor = index % 2 === 0 ? '#fff' : '#f9f9f9';
            tableHTML += `<tr style="background: ${bgColor};">`;
            keys.forEach(key => {
                let value = row[key];
                if (value instanceof Date || (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/))) {
                    value = new Date(value).toLocaleString();
                }
                if (typeof value === 'string' && value.length > 100) {
                    value = value.substring(0, 100) + '...';
                }
                tableHTML += `<td style="border: 1px solid #ddd; padding: 8px;">${value !== null ? value : '<em>null</em>'}</td>`;
            });
            tableHTML += `</tr>`;
        });
        
        tableHTML += `
                    </tbody>
                </table>
            </div>
        `;
        
        contentDiv.innerHTML = tableHTML;
    }
    
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function addUpdateResult(affectedRows, sql) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message assistant';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    let resultHTML = `
        <div style="margin-bottom: 10px;">
            <strong style="color: #4CAF50;">✅ Update Successful!</strong>
        </div>
        <div style="padding: 10px; background: #e8f5e9; border-radius: 5px; border-left: 4px solid #4CAF50; margin-bottom: 10px;">
            <div style="font-size: 14px; color: #2e7d32;">
                <strong>${affectedRows}</strong> row(s) were updated
            </div>
        </div>
    `;
    
    if (sql) {
        resultHTML += `
            <div style="padding: 10px; background: #f5f5f5; border-radius: 5px; border-left: 3px solid #2196F3;">
                <div style="font-size: 11px; color: #666; margin-bottom: 5px;">🤖 AI Generated SQL:</div>
                <code style="font-family: 'Courier New', monospace; font-size: 12px; color: #d63384;">${sql}</code>
            </div>
        `;
    }
    
    contentDiv.innerHTML = resultHTML;
    messageDiv.appendChild(contentDiv);
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function showLoading() {
    const loadingDiv = document.createElement('div');
    const loadingId = 'loading-' + Date.now();
    loadingDiv.id = loadingId;
    loadingDiv.className = 'message assistant';
    loadingDiv.innerHTML = `
        <div class="message-content">
            <div class="loading">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    chatContainer.appendChild(loadingDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return loadingId;
}

function removeLoading(loadingId) {
    const loadingDiv = document.getElementById(loadingId);
    if (loadingDiv) {
        loadingDiv.remove();
    }
}

async function clearCurrentChat() {
    if (!confirm('Clear current chat? This will start a new conversation.')) {
        return;
    }
    
    startNewChat();
}

async function startNewChat() {
    // Generate new session ID
    currentSessionId = `session-${Date.now()}`;
    
    // Clear chat container
    chatContainer.innerHTML = `
        <div class="welcome-message">
            <h2>👋 Welcome to VINCI IT Operations Chatbot!</h2>
            <p>I'm your AI assistant powered by Azure OpenAI. I can help you with IT operations data.</p>
            <div class="quick-actions">
                <strong style="color: #1565c0;">💡 Try asking:</strong>
                <div class="quick-action-grid">
                    <button class="quick-action-btn" data-query="Show me IT operations dashboard">📊 Dashboard</button>
                    <button class="quick-action-btn" data-query="Get recent CMDB data">🔧 CMDB Data</button>
                    <button class="quick-action-btn" data-query="Show all active alerts">📡 Active Alerts</button>
                    <button class="quick-action-btn" data-query="List business services">🏢 Services</button>
                    <button class="quick-action-btn" data-query="Display open incidents">🚨 Incidents</button>
                    <button class="quick-action-btn" data-query="Search knowledge base">📚 Knowledge Base</button>
                    <button class="quick-action-btn" data-query="Show service requests">📋 Service Requests</button>
                    <button class="quick-action-btn" data-query="Get all users">👥 Users</button>
                </div>
            </div>
        </div>
    `;
    
    isFirstMessage = true;
    tokenUsage.textContent = '';
    userInput.value = '';
    
    // Update session info
    updateSessionInfo();
    
    // Reload history
    loadChatHistory();
    
    // Reset conversation on server
    try {
        await fetch('/api/reset', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            }
        });
    } catch (error) {
        console.error('Error resetting conversation:', error);
    }
}

async function loadChatHistory() {
    try {
        const response = await fetch(`/api/chat/history?userId=${currentUserId}&limit=50`);
        const data = await response.json();
        
        if (data.success && data.sessions) {
            renderChatHistory(data.sessions);
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
        chatHistoryList.innerHTML = '<div class="loading-history">Failed to load history</div>';
    }
}

function renderChatHistory(sessions) {
    if (sessions.length === 0) {
        chatHistoryList.innerHTML = '<div class="loading-history">No chat history yet</div>';
        return;
    }
    
    chatHistoryList.innerHTML = '';
    
    sessions.forEach(session => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item';
        if (session.sessionId === currentSessionId) {
            historyItem.classList.add('active');
        }
        
        const preview = session.firstMessage || 'New conversation';
        const date = new Date(session.timestamp).toLocaleString();
        
        historyItem.innerHTML = `
            <div class="history-item-title">${session.title}</div>
            <div class="history-item-preview">${preview.substring(0, 50)}${preview.length > 50 ? '...' : ''}</div>
            <div class="history-item-meta">
                <span>${date}</span>
                <button class="history-item-delete" onclick="deleteConversation('${session.sessionId}', event)">🗑️</button>
            </div>
        `;
        
        historyItem.addEventListener('click', (e) => {
            if (!e.target.classList.contains('history-item-delete')) {
                loadConversation(session.sessionId);
            }
        });
        
        chatHistoryList.appendChild(historyItem);
    });
}

async function loadConversation(sessionId) {
    try {
        const response = await fetch(`/api/chat/history/${sessionId}?userId=${currentUserId}`);
        const data = await response.json();
        
        if (data.success && data.messages) {
            currentSessionId = sessionId;
            chatContainer.innerHTML = '';
            isFirstMessage = false;
            
            data.messages.forEach(msg => {
                addMessage(msg.content, msg.role);
            });
            
            updateSessionInfo();
            loadChatHistory(); // Refresh history to update active state
        }
    } catch (error) {
        console.error('Error loading conversation:', error);
        alert('Failed to load conversation');
    }
}

async function deleteConversation(sessionId, event) {
    event.stopPropagation();
    
    if (!confirm('Delete this conversation?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/chat/history/${sessionId}?userId=${currentUserId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            // If deleted current conversation, start new one
            if (sessionId === currentSessionId) {
                startNewChat();
            } else {
                loadChatHistory();
            }
        }
    } catch (error) {
        console.error('Error deleting conversation:', error);
        alert('Failed to delete conversation');
    }
}

function filterChatHistory() {
    const searchTerm = historySearch.value.toLowerCase();
    const historyItems = document.querySelectorAll('.history-item');
    
    historyItems.forEach(item => {
        const text = item.textContent.toLowerCase();
        if (text.includes(searchTerm)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

function toggleSidebarVisibility() {
    sidebar.classList.toggle('collapsed');
    if (sidebar.classList.contains('collapsed')) {
        toggleIcon.textContent = '▶';
    } else {
        toggleIcon.textContent = '◀';
    }
}

function toggleMobileSidebar() {
    sidebar.classList.toggle('mobile-open');
}

function updateSessionInfo() {
    const sessionDate = new Date(parseInt(currentSessionId.split('-')[1])).toLocaleString();
    sessionInfo.textContent = `Session: ${sessionDate}`;
}

// Auto-resize textarea
userInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 150) + 'px';
});

// Focus on input when page loads
window.addEventListener('load', () => {
    userInput.focus();
    updateSessionInfo();
});
