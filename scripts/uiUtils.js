export function showStatusMessage(message, isError = false) {
    const statusMessageElement = document.getElementById('status-message');
    if (!statusMessageElement) return;
    statusMessageElement.textContent = message;
    statusMessageElement.style.color = isError ? '#ef4444' : '#22c55e';
    setTimeout(() => {
        statusMessageElement.textContent = '';
    }, 5000);
}