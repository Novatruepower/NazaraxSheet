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
    const authorizeGoogleDriveButton = document.getElementById('authorize_google_drive_button');
    const signoutGoogleDriveButton = document.getElementById('signout_google_drive_button');
    const googleDriveAuthStatusSpan = document.getElementById('google-drive-auth-status');

    const cachedToken = getCachedDriveToken();

    if (window.gapiInited && window.gisInited) {
        if (authorizeGoogleDriveButton) authorizeGoogleDriveButton.disabled = false;

        let currentToken = (window.gapi && window.gapi.client) ? window.gapi.client.getToken() : null;
        if (!currentToken || !currentToken.access_token) {
            if (cachedToken) {
                if (window.gapi && window.gapi.client) {
                    window.gapi.client.setToken(cachedToken);
                }
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
    } else {
        // GAPI / GIS not fully ready yet, but update UI immediately if cached token exists
        if (cachedToken && cachedToken.access_token) {
            if (googleDriveAuthStatusSpan) googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized';
            if (authorizeGoogleDriveButton) authorizeGoogleDriveButton.classList.add('hidden');
            if (signoutGoogleDriveButton) signoutGoogleDriveButton.classList.remove('hidden');
            return true;
        } else if (localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true') {
            if (googleDriveAuthStatusSpan) googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized (Session Expired)';
            if (authorizeGoogleDriveButton) authorizeGoogleDriveButton.classList.remove('hidden');
            if (signoutGoogleDriveButton) signoutGoogleDriveButton.classList.remove('hidden');
            return null;
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

let selectedSaveFileId = null;

/**
* Saves character data to Google Drive by opening a file selection/confirmation modal.
*/
export async function saveCharacterToGoogleDrive() {
    let currentToken = (window.gapi && window.gapi.client) ? window.gapi.client.getToken() : null;
    if (!currentToken || !currentToken.access_token) {
        const cached = getCachedDriveToken();
        if (cached) {
            if (window.gapi && window.gapi.client) {
                window.gapi.client.setToken(cached);
            }
            currentToken = cached;
        }
    }

    if (!currentToken || !currentToken.access_token) {
        handleGoogleDriveAuthClickThenCall(saveCharacterToGoogleDrive);
        return;
    }

    saveCurrentStateToHistory(); // Ensure current state is saved to history before saving to Google Drive
    await openGoogleDriveSaveModal();
}

/**
* Opens the Google Drive save modal, listing files and pre-selecting the last loaded/saved file.
*/
async function openGoogleDriveSaveModal() {
    const googleDriveModal = document.getElementById('google-drive-modal');
    const googleDriveModalTitle = document.getElementById('google-drive-modal-title');
    const googleDriveSaveOptions = document.getElementById('google-drive-save-options');
    const googleDriveSaveActions = document.getElementById('google-drive-save-actions');
    const googleDriveFileList = document.getElementById('google-drive-file-list');
    const googleDriveFileListContainer = document.getElementById('google-drive-file-list-container');
    const googleDriveModalStatus = document.getElementById('google-drive-modal-status');
    const driveNewFilenameInput = document.getElementById('drive-new-filename');
    const driveSaveModeExisting = document.getElementById('drive-save-mode-existing');
    const driveSaveModeNew = document.getElementById('drive-save-mode-new');
    const driveNewFileContainer = document.getElementById('drive-new-file-container');
    const confirmSaveBtn = document.getElementById('confirm-google-drive-save-btn');
    const cancelSaveBtn = document.getElementById('cancel-google-drive-save-btn');

    if (!googleDriveModal) return;

    // Reset and show save-specific UI
    googleDriveModal.classList.remove('hidden');
    if (googleDriveModalTitle) googleDriveModalTitle.textContent = 'Save to Google Drive';
    if (googleDriveSaveOptions) googleDriveSaveOptions.classList.remove('hidden');
    if (googleDriveSaveActions) googleDriveSaveActions.classList.remove('hidden');
    if (googleDriveFileListContainer) googleDriveFileListContainer.classList.remove('hidden');
    if (googleDriveFileList) googleDriveFileList.innerHTML = '';
    if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'Loading files from Google Drive...';
    if (confirmSaveBtn) confirmSaveBtn.disabled = false;

    // Default new filename
    const defaultFileName = ((characters[0] && characters[0].name && characters[0].name.trim() !== '') ? characters[0].name.trim() + '_sheet' : 'character_sheets') + '.json';
    if (driveNewFilenameInput) driveNewFilenameInput.value = defaultFileName;

    // Radio button UI toggle
    const updateModeUI = () => {
        if (driveSaveModeNew && driveSaveModeNew.checked) {
            if (driveNewFileContainer) driveNewFileContainer.classList.remove('hidden');
            if (googleDriveFileListContainer) googleDriveFileListContainer.classList.add('hidden');
            if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'Enter a name for the new file and click Confirm Save.';
        } else {
            if (driveNewFileContainer) driveNewFileContainer.classList.add('hidden');
            if (googleDriveFileListContainer) googleDriveFileListContainer.classList.remove('hidden');
            if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'Select an existing file to overwrite or choose "Create as new file".';
        }
    };

    if (driveSaveModeExisting) driveSaveModeExisting.onclick = updateModeUI;
    if (driveSaveModeNew) driveSaveModeNew.onclick = updateModeUI;

    if (cancelSaveBtn) {
        cancelSaveBtn.onclick = () => {
            googleDriveModal.classList.add('hidden');
        };
    }

    selectedSaveFileId = currentGoogleDriveFileId || localStorage.getItem('lastGoogleDriveFileId') || null;

    try {
        const res = await window.gapi.client.drive.files.list({
            pageSize: 30,
            fields: 'files(id, name, modifiedTime)',
            q: "mimeType='application/json' and trashed = false",
            orderBy: 'modifiedTime desc'
        });

        const files = res.result.files || [];
        if (googleDriveFileList) googleDriveFileList.innerHTML = '';

        if (files.length === 0) {
            if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'No existing sheet files found. Choose "Create as new file" below.';
            if (driveSaveModeNew) {
                driveSaveModeNew.checked = true;
                updateModeUI();
            }
        } else {
            let preselectedFound = false;

            files.forEach(file => {
                const li = document.createElement('li');
                li.className = 'p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center justify-between transition-colors rounded-md my-1 border border-transparent';

                const isPreselected = (selectedSaveFileId && selectedSaveFileId === file.id);
                if (isPreselected) {
                    preselectedFound = true;
                    li.classList.add('bg-indigo-50', 'dark:bg-indigo-950/60', 'border-indigo-500', 'font-semibold');
                }

                const fileInfoDiv = document.createElement('div');
                fileInfoDiv.className = 'flex items-center space-x-2';

                const radio = document.createElement('input');
                radio.type = 'radio';
                radio.name = 'selected-drive-file';
                radio.value = file.id;
                radio.checked = isPreselected;
                radio.className = 'text-indigo-600 focus:ring-indigo-500';

                const textSpan = document.createElement('span');
                textSpan.className = 'text-sm text-gray-900 dark:text-gray-100';
                textSpan.textContent = file.name;

                fileInfoDiv.appendChild(radio);
                fileInfoDiv.appendChild(textSpan);

                if (isPreselected) {
                    const badge = document.createElement('span');
                    badge.className = 'px-2 py-0.5 text-xs font-semibold bg-indigo-600 text-white rounded-full shadow-sm ml-2';
                    badge.textContent = 'Last Saved / Loaded';
                    fileInfoDiv.appendChild(badge);
                }

                const dateSpan = document.createElement('span');
                dateSpan.className = 'text-xs text-gray-500 dark:text-gray-400 ml-2';
                dateSpan.textContent = new Date(file.modifiedTime).toLocaleString();

                li.appendChild(fileInfoDiv);
                li.appendChild(dateSpan);

                li.onclick = () => {
                    const allItems = googleDriveFileList.querySelectorAll('li');
                    allItems.forEach(item => {
                        item.classList.remove('bg-indigo-50', 'dark:bg-indigo-950/60', 'border-indigo-500', 'font-semibold');
                    });
                    const allRadios = googleDriveFileList.querySelectorAll('input[name="selected-drive-file"]');
                    allRadios.forEach(r => { r.checked = false; });

                    li.classList.add('bg-indigo-50', 'dark:bg-indigo-950/60', 'border-indigo-500', 'font-semibold');
                    radio.checked = true;
                    selectedSaveFileId = file.id;

                    if (driveSaveModeExisting) {
                        driveSaveModeExisting.checked = true;
                        updateModeUI();
                    }
                };

                googleDriveFileList.appendChild(li);
            });

            if (preselectedFound) {
                if (driveSaveModeExisting) driveSaveModeExisting.checked = true;
            } else {
                if (files.length > 0) {
                    selectedSaveFileId = files[0].id;
                    const firstRadio = googleDriveFileList.querySelector('input[name="selected-drive-file"]');
                    if (firstRadio) firstRadio.checked = true;
                    const firstLi = googleDriveFileList.querySelector('li');
                    if (firstLi) firstLi.classList.add('bg-indigo-50', 'dark:bg-indigo-950/60', 'border-indigo-500', 'font-semibold');
                    if (driveSaveModeExisting) driveSaveModeExisting.checked = true;
                }
            }
            updateModeUI();
        }

    } catch (error) {
        console.error('Error fetching Google Drive files for save:', error);
        if (error.status === 401 || error.result?.error?.code === 401 || (error.message && error.message.includes('401'))) {
            clearCachedDriveToken();
            maybeEnableGoogleDriveButtons();
        }
        if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'Failed to load file list. You can still save as a new file.';
        if (driveSaveModeNew) {
            driveSaveModeNew.checked = true;
            updateModeUI();
        }
    }

    if (confirmSaveBtn) {
        confirmSaveBtn.onclick = async () => {
            const isNewMode = driveSaveModeNew && driveSaveModeNew.checked;

            if (!isNewMode && !selectedSaveFileId) {
                if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'Please select a file to overwrite, or choose "Create as new file".';
                return;
            }

            confirmSaveBtn.disabled = true;
            if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'Saving to Google Drive...';

            if (isNewMode) {
                let filename = driveNewFilenameInput ? driveNewFilenameInput.value.trim() : '';
                if (!filename) filename = defaultFileName;
                if (!filename.toLowerCase().endsWith('.json')) filename += '.json';
                await executeGoogleDriveSavePost(filename);
            } else {
                await executeGoogleDriveSavePatch(selectedSaveFileId);
            }
        };
    }
}

async function executeGoogleDriveSavePatch(fileId) {
    const googleDriveModal = document.getElementById('google-drive-modal');
    const googleDriveModalStatus = document.getElementById('google-drive-modal-status');
    const confirmSaveBtn = document.getElementById('confirm-google-drive-save-btn');

    try {
        const charactersToSave = prepareCharactersForSaving(characters);
        const content = JSON.stringify(charactersToSave, null, 2);
        const mimeType = 'application/json';

        await window.gapi.client.request({
            path: `/upload/drive/v3/files/${fileId}`,
            method: 'PATCH',
            params: { uploadType: 'media' },
            headers: { 'Content-Type': mimeType },
            body: content
        });

        setCurrentGoogleDriveFileId(fileId);
        if (googleDriveModal) googleDriveModal.classList.add('hidden');
        showStatusMessage("Character data updated in Google Drive!");
        console.log("Character data saved to Google Drive!");
        setHasUnsavedChanges(false);
    } catch (error) {
        console.error('Error updating Google Drive file:', error);
        if (confirmSaveBtn) confirmSaveBtn.disabled = false;
        if (error.status === 401 || error.result?.error?.code === 401 || (error.message && error.message.includes('401'))) {
            clearCachedDriveToken();
            maybeEnableGoogleDriveButtons();
            showStatusMessage("Google Drive session expired. Please authorize again.", true);
        } else {
            if (googleDriveModalStatus) googleDriveModalStatus.textContent = "Failed to update Google Drive file.";
            showStatusMessage("Failed to save to Google Drive. Check console for details.", true);
        }
    }
}

async function executeGoogleDriveSavePost(fileName) {
    const googleDriveModal = document.getElementById('google-drive-modal');
    const googleDriveModalStatus = document.getElementById('google-drive-modal-status');
    const confirmSaveBtn = document.getElementById('confirm-google-drive-save-btn');

    try {
        const charactersToSave = prepareCharactersForSaving(characters);
        const content = JSON.stringify(charactersToSave, null, 2);
        const mimeType = 'application/json';

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
        if (googleDriveModal) googleDriveModal.classList.add('hidden');
        showStatusMessage("New character data saved to Google Drive!");
        console.log("Character data saved to Google Drive!");
        setHasUnsavedChanges(false);
    } catch (error) {
        console.error('Error creating Google Drive file:', error);
        if (confirmSaveBtn) confirmSaveBtn.disabled = false;
        if (error.status === 401 || error.result?.error?.code === 401 || (error.message && error.message.includes('401'))) {
            clearCachedDriveToken();
            maybeEnableGoogleDriveButtons();
            showStatusMessage("Google Drive session expired. Please authorize again.", true);
        } else {
            if (googleDriveModalStatus) googleDriveModalStatus.textContent = "Failed to create Google Drive file.";
            showStatusMessage("Failed to save to Google Drive. Check console for details.", true);
        }
    }
}

async function proceedToLoadGoogleDriveFile() {
    showStatusMessage("Loading files from Google Drive...");
    const googleDriveModal = document.getElementById('google-drive-modal');
    const googleDriveModalTitle = document.getElementById('google-drive-modal-title');
    const googleDriveSaveOptions = document.getElementById('google-drive-save-options');
    const googleDriveSaveActions = document.getElementById('google-drive-save-actions');
    const googleDriveFileList = document.getElementById('google-drive-file-list');
    const googleDriveFileListContainer = document.getElementById('google-drive-file-list-container');
    const googleDriveModalStatus = document.getElementById('google-drive-modal-status');

    if (googleDriveModal) googleDriveModal.classList.remove('hidden');
    if (googleDriveModalTitle) googleDriveModalTitle.textContent = 'Load from Google Drive';
    if (googleDriveSaveOptions) googleDriveSaveOptions.classList.add('hidden');
    if (googleDriveSaveActions) googleDriveSaveActions.classList.add('hidden');
    if (googleDriveFileListContainer) googleDriveFileListContainer.classList.remove('hidden');
    if (googleDriveFileList) googleDriveFileList.innerHTML = '';
    if (googleDriveModalStatus) googleDriveModalStatus.textContent = 'Loading...';

    const activeFileId = currentGoogleDriveFileId || localStorage.getItem('lastGoogleDriveFileId');

    try {
        const res = await window.gapi.client.drive.files.list({
            pageSize: 30, // Fetch up to 30 files
            fields: 'files(id, name, modifiedTime)',
            q: "mimeType='application/json' and trashed = false", // Filter for non-trashed JSON files
            orderBy: 'modifiedTime desc'
        });

        const files = res.result.files;

        if (!files || files.length === 0) {
            googleDriveModalStatus.textContent = 'No character sheet files found in Google Drive.';
            return;
        }

        googleDriveModalStatus.textContent = ''; // Clear loading message

        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'p-3 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center justify-between transition-colors rounded-md my-1 border border-transparent';

            const isCurrent = (activeFileId && activeFileId === file.id);
            if (isCurrent) {
                li.classList.add('bg-indigo-50', 'dark:bg-indigo-950/60', 'border-indigo-500', 'font-semibold');
            }

            const nameDiv = document.createElement('div');
            nameDiv.className = 'flex items-center space-x-2';

            const nameSpan = document.createElement('span');
            nameSpan.className = 'text-sm text-gray-900 dark:text-gray-100';
            nameSpan.textContent = file.name;
            nameDiv.appendChild(nameSpan);

            if (isCurrent) {
                const badge = document.createElement('span');
                badge.className = 'px-2 py-0.5 text-xs font-semibold bg-indigo-600 text-white rounded-full shadow-sm ml-2';
                badge.textContent = 'Last Saved / Loaded';
                nameDiv.appendChild(badge);
            }

            const dateSpan = document.createElement('span');
            dateSpan.className = 'text-xs text-gray-500 dark:text-gray-400 ml-2';
            dateSpan.textContent = new Date(file.modifiedTime).toLocaleString();

            li.appendChild(nameDiv);
            li.appendChild(dateSpan);

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

