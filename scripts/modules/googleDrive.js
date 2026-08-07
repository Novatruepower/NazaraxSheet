import { GOOGLE_DRIVE_AUTH_STATUS_KEY, GOOGLE_DRIVE_TOKEN_KEY } from './constants.js';
import { setCurrentGoogleDriveFileId } from './state.js';
import { showStatusMessage, showConfirmationModal, updateDOM, updateRemainingPointsDisplay, updatePanelPosition } from './uiUtils.js';
import { prepareCharactersForSaving, saveCurrentStateToHistory, populateCharacterSelector, initLoadCharacter } from './characterState.js';
import { character, characters, setCharacters, setCurrentCharacterIndex, setHistoryStack, setHistoryPointer, hasUnsavedChanges, setHasUnsavedChanges, currentGoogleDriveFileId } from './state.js';

/**
 * Caches the Google Drive token response object in localStorage and sets it in gapi.client.
 * @param {Object} tokenResp The token response object returned by GIS or GAPI.
 */
export function setCachedDriveToken(tokenResp) {
    if (!tokenResp || !tokenResp.access_token) return;
    const expiresInSeconds = tokenResp.expires_in ? parseInt(tokenResp.expires_in, 10) : 3600;
    const tokenObj = {
        access_token: tokenResp.access_token,
        token_type: tokenResp.token_type || 'Bearer',
        expires_in: tokenResp.expires_in,
        scope: tokenResp.scope,
        expires_at: Date.now() + (expiresInSeconds * 1000)
    };
    try {
        localStorage.setItem(GOOGLE_DRIVE_TOKEN_KEY, JSON.stringify(tokenObj));
        localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true');
    } catch (e) {
        console.error("Failed to save token to localStorage:", e);
    }
    if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken(tokenObj);
    }
}

/**
 * Retrieves the cached token from localStorage if valid and not expired.
 * @returns {Object|null} The cached token object or null if missing/expired.
 */
export function getCachedDriveToken() {
    try {
        const stored = localStorage.getItem(GOOGLE_DRIVE_TOKEN_KEY);
        if (!stored) return null;
        const tokenObj = JSON.parse(stored);
        if (!tokenObj || !tokenObj.access_token) return null;
        // Check if token has expired (with a 60-second safety margin)
        if (tokenObj.expires_at && Date.now() >= (tokenObj.expires_at - 60000)) {
            console.log("Cached Google Drive token has expired.");
            clearCachedDriveToken();
            return null;
        }
        return tokenObj;
    } catch (e) {
        console.error('Error reading cached Google Drive token:', e);
        clearCachedDriveToken();
        return null;
    }
}

/**
 * Clears cached token and authorization status from localStorage and gapi.client.
 */
export function clearCachedDriveToken() {
    localStorage.removeItem(GOOGLE_DRIVE_TOKEN_KEY);
    localStorage.removeItem(GOOGLE_DRIVE_AUTH_STATUS_KEY);
    if (window.gapi && window.gapi.client) {
        window.gapi.client.setToken(null);
    }
}

/**
* Enables Google Drive buttons if both GAPI and GIS are initialized.
* Also restores cached token and updates the UI based on current authorization status.
*/
export function maybeEnableGoogleDriveButtons() {
    if (window.gapiInited && window.gisInited) {
        const authorizeGoogleDriveButton = document.getElementById('authorize_google_drive_button');
        const signoutGoogleDriveButton = document.getElementById('signout_google_drive_button');
        const googleDriveAuthStatusSpan = document.getElementById('google-drive-auth-status');

        if (authorizeGoogleDriveButton) authorizeGoogleDriveButton.disabled = false;

        let currentToken = window.gapi.client.getToken();
        if (!currentToken || !currentToken.access_token) {
            const cachedToken = getCachedDriveToken();
            if (cachedToken) {
                window.gapi.client.setToken(cachedToken);
                currentToken = cachedToken;
            }
        }

        const wasAuthorizedInLocalStorage = localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true';

        if (currentToken && currentToken.access_token) {
            // User is currently authorized
            if (googleDriveAuthStatusSpan) googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized';
            if (authorizeGoogleDriveButton) authorizeGoogleDriveButton.classList.add('hidden');
            if (signoutGoogleDriveButton) signoutGoogleDriveButton.classList.remove('hidden');
            localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true'); // Ensure local storage is updated
            return true;
        } else if (wasAuthorizedInLocalStorage) {
            // User was authorized previously, but session expired
            if (googleDriveAuthStatusSpan) googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized (Session Expired)';
            if (authorizeGoogleDriveButton) authorizeGoogleDriveButton.classList.remove('hidden'); // Show authorize to re-auth
            if (signoutGoogleDriveButton) signoutGoogleDriveButton.classList.remove('hidden'); // Still allow sign out
            return null;
        } else {
            // User is not authorized and never was (or explicitly signed out)
            if (googleDriveAuthStatusSpan) googleDriveAuthStatusSpan.textContent = 'Google Drive: Not Authorized';
            if (authorizeGoogleDriveButton) authorizeGoogleDriveButton.classList.remove('hidden');
            if (signoutGoogleDriveButton) signoutGoogleDriveButton.classList.add('hidden');
            return false;
        }
    }
}

/**
* Handles Google Drive authorization click with callback.
*/
export function handleGoogleDriveAuthClickThenCall(functionToCall) {
    window.tokenClient.callback = async (resp) => {
        if (resp.error) {
            console.error("Google Drive authorization error:", resp);
            showStatusMessage("Google Drive authorization failed.", true);
            clearCachedDriveToken();
            maybeEnableGoogleDriveButtons(); // Update UI
            return;
        }
        // Cache the token for gapi.client and localStorage
        setCachedDriveToken(resp);
        showStatusMessage("Google Drive authorized successfully!");
        // Update UI
        if(maybeEnableGoogleDriveButtons()) {
            functionToCall();
        }
    };
    window.tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
* Handles Google Drive authorization click.
*/
export function handleGoogleDriveAuthClick() {
    window.tokenClient.callback = async (resp) => {
        if (resp.error) {
            console.error("Google Drive authorization error:", resp);
            showStatusMessage("Google Drive authorization failed.", true);
            clearCachedDriveToken();
            maybeEnableGoogleDriveButtons(); // Update UI
            return;
        }
        // Cache the token for gapi.client and localStorage
        setCachedDriveToken(resp);
        showStatusMessage("Google Drive authorized successfully!");
        maybeEnableGoogleDriveButtons(); // Update UI
    };
    window.tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
* Handles Google Drive sign-out.
*/
export function handleGoogleDriveSignoutClick() {
    const token = window.gapi.client.getToken() || getCachedDriveToken();
    if (token && token.access_token) {
        try {
            window.google.accounts.oauth2.revoke(token.access_token);
        } catch (e) {
            console.warn("Error revoking token:", e);
        }
    }
    clearCachedDriveToken();
    setCurrentGoogleDriveFileId(null); // Clear current file ID on sign out
    showStatusMessage("Signed out from Google Drive.");
    maybeEnableGoogleDriveButtons(); // Update UI
}

/**
* Saves character data to Google Drive.
*/
export async function saveCharacterToGoogleDrive() {
    let currentToken = window.gapi.client.getToken();
    if (!currentToken || !currentToken.access_token) {
        const cached = getCachedDriveToken();
        if (cached) {
            window.gapi.client.setToken(cached);
            currentToken = cached;
        }
    }

    if (!currentToken || !currentToken.access_token) {
        handleGoogleDriveAuthClickThenCall(saveCharacterToGoogleDrive);
        return;
    }

    saveCurrentStateToHistory(); // Ensure current state is saved to history before saving to Google Drive
    showStatusMessage("Saving to Google Drive...");

    try {
        const charactersToSave = prepareCharactersForSaving(characters);

        const content = JSON.stringify(charactersToSave, null, 2);
        // Determine the file name based on the first character's name, or a default
        const fileName = (characters[0].name.trim() !== '' ? characters[0].name.trim() + '_sheet' : 'character_sheets') + '.json';
        const mimeType = 'application/json';

        if (currentGoogleDriveFileId) {
            // Update existing file
            await window.gapi.client.request({
                path: `/upload/drive/v3/files/${currentGoogleDriveFileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                headers: { 'Content-Type': mimeType },
                body: content
            });
            showStatusMessage("Character data updated in Google Drive!");
        } else {
            // Create new file
            const metadata = {
                name: fileName,
                mimeType: mimeType,
                parents: ['root']
            };
            const boundary = '-------314159265358979323846';
            const multipartRequestBody =
                `--${boundary}\r\n` +
                `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
                JSON.stringify(metadata) + `\r\n` +
                `--${boundary}\r\n` +
                `Content-Type: ${mimeType}\r\n\r\n` +
                content + `\r\n` +
                `--${boundary}--`;

            const response = await window.gapi.client.request({
                path: '/upload/drive/v3/files?uploadType=multipart',
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: multipartRequestBody
            });
            setCurrentGoogleDriveFileId(response.result.id);
            showStatusMessage("New character data saved to Google Drive!");
        }
        console.log("Character data saved to Google Drive!");
        setHasUnsavedChanges(false); // Data is now saved
    } catch (error) {
        console.error('Error saving to Google Drive:', error);
        if (error.status === 401 || error.result?.error?.code === 401 || (error.message && error.message.includes('401'))) {
            clearCachedDriveToken();
            maybeEnableGoogleDriveButtons();
            showStatusMessage("Google Drive session expired. Please authorize again.", true);
        } else {
            showStatusMessage("Failed to save to Google Drive. Check console for details.", true);
        }
    }
}

async function proceedToLoadGoogleDriveFile() {
    showStatusMessage("Loading files from Google Drive...");
    const googleDriveModal = document.getElementById('google-drive-modal');
    const googleDriveFileList = document.getElementById('google-drive-file-list');
    const googleDriveModalStatus = document.getElementById('google-drive-modal-status');

    if (googleDriveModal) googleDriveModal.classList.remove('hidden');
    if (googleDriveFileList) googleDriveFileList.innerHTML = '';
    if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'Loading...';

    try {
        const res = await window.gapi.client.drive.files.list({
            pageSize: 20, // Fetch up to 20 files
            fields: 'files(id, name, modifiedTime)',
            q: "mimeType='application/json' and fullText contains '_sheet'", // Filter for JSON files named 'character_sheets'
            orderBy: 'modifiedTime desc' // Order by most recently modified
        });

        const files = res.result.files;

        if (!files || files.length === 0) {
            googleDriveModalStatus.textContent = 'No character sheet files found in Google Drive.';
            return;
        }

        googleDriveModalStatus.textContent = ''; // Clear loading message

        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'modal-list-item';
            li.textContent = `${file.name} (Last modified: ${new Date(file.modifiedTime).toLocaleString()})`;
            li.onclick = async () => {
                googleDriveModal.classList.add('hidden');
                await loadGoogleDriveFileContent(file.id);
            };
            googleDriveFileList.appendChild(li);
        });

    } catch (error) {
        console.error('Error listing Google Drive files:', error);
        if (error.status === 401 || error.result?.error?.code === 401 || (error.message && error.message.includes('401'))) {
            clearCachedDriveToken();
            maybeEnableGoogleDriveButtons();
        }
        if (googleDriveModalStatus) googleDriveModalStatus.textContent = "Failed to load files from Google Drive. Check console for details.";
        showStatusMessage("Failed to load files from Google Drive.", true);
    }
}

/**
* Loads character data from Google Drive.
*/
export async function loadCharacterFromGoogleDrive() {
    let currentToken = window.gapi.client.getToken();
    if (!currentToken || !currentToken.access_token) {
        const cached = getCachedDriveToken();
        if (cached) {
            window.gapi.client.setToken(cached);
            currentToken = cached;
        }
    }

    if (!currentToken || !currentToken.access_token) {
        handleGoogleDriveAuthClickThenCall(loadCharacterFromGoogleDrive);
        return;
    }

    // Before loading, check for unsaved changes and prompt if necessary
    if (hasUnsavedChanges) {
        showConfirmationModal("You have unsaved changes. Are you sure you want to load a new file without saving?", async () => {
            await proceedToLoadGoogleDriveFile();
        });
    } else {
        await proceedToLoadGoogleDriveFile();
    }
}

/**
* Fetches and loads content of a specific Google Drive file.
* @param {string} fileId The ID of the Google Drive file to load.
*/
async function loadGoogleDriveFileContent(fileId) {
    showStatusMessage("Loading character data from Google Drive...");
    try {
        const res = await gapi.client.drive.files.get({ fileId, alt: 'media' });
        const loadedData = JSON.parse(res.body);

        if (Array.isArray(loadedData)) {
            setCharacters(loadedData.map(loadedChar => initLoadCharacter(loadedChar)));
        } else {
            setCharacters([initLoadCharacter(loadedData)]);
        }
        setCurrentCharacterIndex(0);
        setCurrentGoogleDriveFileId(fileId); // Set the current file ID
        updateDOM();
        populateCharacterSelector();
        showStatusMessage("Character data loaded from Google Drive!");
        console.log("Character data loaded from Google Drive!");
        setHistoryStack([]); // Clear previous history
        setHistoryPointer(-1); // Reset history pointer
        saveCurrentStateToHistory(); // Save the newly loaded state as the first history entry
        setHasUnsavedChanges(false); // Data is now loaded and considered "saved"
        character.isDistributingStats = false; // Exit distribution mode on load
        updateRemainingPointsDisplay(); // Reset remaining points display
    } catch (error) {
        console.error('Error loading Google Drive file content:', error);
        if (error.status === 401 || error.result?.error?.code === 401 || (error.message && error.message.includes('401'))) {
            clearCachedDriveToken();
            maybeEnableGoogleDriveButtons();
        }
        showStatusMessage("Failed to load character data from Google Drive. Check console for details.", true);
    }
}

