// GoogleDriveManager.js
// This module handles all Google Drive integration.

import { initLoadCharacter, calculateFormula } from './StatManager.js';
import { showStatusMessage, maybeEnableGoogleDriveButtons, googleDriveModal, googleDriveFileList, googleDriveModalStatus } from './UIManager.js';

let currentGoogleDriveFileId = null; // To store the ID of the currently loaded Google Drive file

// Key for local storage to persist Google Drive authorization status
const GOOGLE_DRIVE_AUTH_STATUS_KEY = 'googleDriveAuthorized';

/**
 * Enables Google Drive buttons if both GAPI and GIS are initialized.
 * Also updates the UI based on current authorization status and local storage.
 */
export function maybeEnableGoogleDriveButtonsWrapper() {
    maybeEnableGoogleDriveButtons(window.gapiInited, window.gisInited, window.gapi.client.getToken(), GOOGLE_DRIVE_AUTH_STATUS_KEY);
}

/**
 * Handles Google Drive authorization click.
 */
export function handleGoogleDriveAuthClick() {
    window.tokenClient.callback = async (resp) => {
        if (resp.error) {
            console.error("Google Drive authorization error:", resp);
            showStatusMessage("Google Drive authorization failed.", true);
            localStorage.removeItem(GOOGLE_DRIVE_AUTH_STATUS_KEY); // Clear local storage on error
            window.gapi.client.setToken(''); // Clear token in gapi.client as well
            maybeEnableGoogleDriveButtonsWrapper(); // Update UI
            return;
        }
        // Set the token for gapi.client after successful authorization
        window.gapi.client.setToken(resp);
        localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true'); // Persist authorization status
        showStatusMessage("Google Drive authorized successfully!");
        maybeEnableGoogleDriveButtonsWrapper(); // Update UI
    };
    window.tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
 * Handles Google Drive sign-out.
 */
export function handleGoogleDriveSignoutClick() {
    const token = window.gapi.client.getToken();
    if (token) {
        window.google.accounts.oauth2.revoke(token.access_token);
        window.gapi.client.setToken('');
    }
    localStorage.removeItem(GOOGLE_DRIVE_AUTH_STATUS_KEY); // Clear persisted status
    currentGoogleDriveFileId = null; // Clear current file ID on sign out
    showStatusMessage("Signed out from Google Drive.");
    maybeEnableGoogleDriveButtonsWrapper(); // Update UI
}

/**
 * Saves character data to Google Drive.
 * @param {Array<object>} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} showStatusMessageCallback Callback to display status messages.
 */
export async function saveCharacterToGoogleDrive(characters, characterProxy, showStatusMessageCallback) {
    if (!window.gapi.client.getToken()) {
        showStatusMessageCallback("Please authorize Google Drive to save.", true);
        if (localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true') {
            showStatusMessageCallback("Google Drive session expired. Please re-authorize.", true);
        }
        return;
    }

    showStatusMessageCallback("Saving to Google Drive...");

    try {
        const charactersToSave = JSON.parse(JSON.stringify(characters));
        charactersToSave.forEach(char => {
            ExternalDataManager.rollStats.forEach(statName => {
                if (char[statName]) {
                    const { maxExperience, total, ...rest } = char[statName];
                    char[statName] = rest;
                }
            });
            // Convert Sets to Arrays for saving within the new StatChoices/StatsAffected structure
            if (char.StatsAffected) {
                for (const category in char.StatsAffected) {
                    for (const passiveName in char.StatsAffected[category]) {
                        for (const statName in char.StatsAffected[category][passiveName]) {
                            if (char.StatsAffected[category][passiveName][statName] instanceof Set) {
                                char.StatsAffected[category][passiveName][statName] = Array.from(char.StatsAffected[category][passiveName][statName]);
                            }
                        }
                    }
                }
            }
            delete char.maxHealth;
            delete char.maxMana;
            delete char.maxRacialPower;
            delete char.ac;
        });

        const content = JSON.stringify(charactersToSave, null, 2);
        const fileName = (characterProxy.name.trim() !== '' ? characterProxy.name.trim() + '_sheet' : 'character_sheets') + '.json';
        const mimeType = 'application/json';

        if (currentGoogleDriveFileId) {
            await window.gapi.client.request({
                path: `/upload/drive/v3/files/${currentGoogleDriveFileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                headers: { 'Content-Type': mimeType },
                body: content
            });
            showStatusMessageCallback("Character data updated in Google Drive!");
        } else {
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
            currentGoogleDriveFileId = response.result.id;
            showStatusMessageCallback("New character data saved to Google Drive!");
        }
        console.log("Character data saved to Google Drive!");
        characterProxy.hasUnsavedChanges = false;
    } catch (error) {
        console.error('Error saving to Google Drive:', error);
        showStatusMessageCallback("Failed to save to Google Drive. Check console for details.", true);
    }
}

/**
 * Loads character data from Google Drive.
 * @param {Array<object>} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} showConfirmationModalCallback Callback to show confirmation modal.
 * @param {function} showStatusMessageCallback Callback to display status messages.
 * @param {function} updateDOMCallback Callback to update the DOM.
 * @param {function} populateCharacterSelectorCallback Callback to populate character selector.
 * @param {function} saveCurrentStateToHistoryCallback Callback to save history.
 * @param {HTMLElement} googleDriveModal The Google Drive modal element.
 * @param {HTMLElement} googleDriveFileList The Google Drive file list element.
 * @param {HTMLElement} googleDriveModalStatus The Google Drive modal status element.
 */
export async function loadCharacterFromGoogleDrive(characters, characterProxy, showConfirmationModalCallback, showStatusMessageCallback, updateDOMCallback, populateCharacterSelectorCallback, saveCurrentStateToHistoryCallback, googleDriveModal, googleDriveFileList, googleDriveModalStatus) {
    if (!window.gapi.client.getToken()) {
        showStatusMessageCallback("Please authorize Google Drive to load.", true);
        if (localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true') {
            showStatusMessageCallback("Google Drive session expired. Please re-authorize.", true);
        }
        return;
    }

    if (characterProxy.hasUnsavedChanges) {
        showConfirmationModalCallback("You have unsaved changes. Are you sure you want to load a new file without saving?", async () => {
            await proceedToLoadGoogleDriveFile(characters, characterProxy, showStatusMessageCallback, updateDOMCallback, populateCharacterSelectorCallback, saveCurrentStateToHistoryCallback, googleDriveModal, googleDriveFileList, googleDriveModalStatus);
        });
    } else {
        await proceedToLoadGoogleDriveFile(characters, characterProxy, showStatusMessageCallback, updateDOMCallback, populateCharacterSelectorCallback, saveCurrentStateToHistoryCallback, googleDriveModal, googleDriveFileList, googleDriveModalStatus);
    }
}

/**
 * Proceeds to load Google Drive files after confirmation.
 * @param {Array<object>} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} showStatusMessageCallback Callback to display status messages.
 * @param {function} updateDOMCallback Callback to update the DOM.
 * @param {function} populateCharacterSelectorCallback Callback to populate character selector.
 * @param {function} saveCurrentStateToHistoryCallback Callback to save history.
 * @param {HTMLElement} googleDriveModal The Google Drive modal element.
 * @param {HTMLElement} googleDriveFileList The Google Drive file list element.
 * @param {HTMLElement} googleDriveModalStatus The Google Drive modal status element.
 */
export async function proceedToLoadGoogleDriveFile(characters, characterProxy, showStatusMessageCallback, updateDOMCallback, populateCharacterSelectorCallback, saveCurrentStateToHistoryCallback, googleDriveModal, googleDriveFileList, googleDriveModalStatus) {
    showStatusMessageCallback("Loading files from Google Drive...");
    googleDriveModal.classList.remove('hidden');
    googleDriveFileList.innerHTML = '';
    googleDriveModalStatus.textContent = 'Loading...';

    try {
        const res = await window.gapi.client.drive.files.list({
            pageSize: 20,
            fields: 'files(id, name, modifiedTime)',
            q: "mimeType='application/json' and fullText contains '_sheet'",
            orderBy: 'modifiedTime desc'
        });

        const files = res.result.files;

        if (!files || files.length === 0) {
            googleDriveModalStatus.textContent = 'No character sheet files found in Google Drive.';
            return;
        }

        googleDriveModalStatus.textContent = '';

        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'modal-list-item';
            li.textContent = `${file.name} (Last modified: ${new Date(file.modifiedTime).toLocaleString()})`;
            li.onclick = async () => {
                googleDriveModal.classList.add('hidden');
                await loadGoogleDriveFileContent(file.id, characters, characterProxy, showStatusMessageCallback, updateDOMCallback, populateCharacterSelectorCallback, saveCurrentStateToHistoryCallback);
            };
            googleDriveFileList.appendChild(li);
        });

    } catch (error) {
        console.error('Error listing Google Drive files:', error);
        googleDriveModalStatus.textContent = "Failed to load files from Google Drive. Check console for details.";
        showStatusMessageCallback("Failed to load files from Google Drive.", true);
    }
}

/**
 * Fetches and loads content of a specific Google Drive file.
 * @param {string} fileId The ID of the Google Drive file to load.
 * @param {Array<object>} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} showStatusMessageCallback Callback to display status messages.
 * @param {function} updateDOMCallback Callback to update the DOM.
 * @param {function} populateCharacterSelectorCallback Callback to populate character selector.
 * @param {function} saveCurrentStateToHistoryCallback Callback to save history.
 */
export async function loadGoogleDriveFileContent(fileId, characters, characterProxy, showStatusMessageCallback, updateDOMCallback, populateCharacterSelectorCallback, saveCurrentStateToHistoryCallback) {
    showStatusMessageCallback("Loading character data from Google Drive...");
    try {
        const res = await window.gapi.client.drive.files.get({ fileId, alt: 'media' });
        const loadedData = JSON.parse(res.body);

        if (Array.isArray(loadedData)) {
            characters.length = 0; // Clear existing characters
            loadedData.forEach(loadedChar => characters.push(initLoadCharacter(loadedChar, ExternalDataManager)));
            window.currentCharacterIndex = 0;
        } else {
            characters.length = 0;
            characters.push(initLoadCharacter(loadedData, ExternalDataManager));
            window.currentCharacterIndex = 0;
        }
        currentGoogleDriveFileId = fileId;
        updateDOMCallback(characterProxy);
        populateCharacterSelectorCallback();
        showStatusMessageCallback("Character data loaded from Google Drive!");
        console.log("Character data loaded from Google Drive!");
        window.historyStack = [];
        window.historyPointer = -1;
        saveCurrentStateToHistoryCallback();
        characterProxy.hasUnsavedChanges = false;
    } catch (error) {
        console.error('Error loading Google Drive file content:', error);
        showStatusMessageCallback("Failed to load character data from Google Drive. Check console for details.", true);
    }
}

/**
 * Saves all character data to a JSON file (download).
 * @param {Array<object>} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} showStatusMessageCallback Callback to display status messages.
 * @param {function} saveCurrentStateToHistoryCallback Callback to save history.
 */
export function saveCharacterToFile(characters, characterProxy, showStatusMessageCallback, saveCurrentStateToHistoryCallback) {
    const charactersToSave = JSON.parse(JSON.stringify(characters));

    charactersToSave.forEach(char => {
        ExternalDataManager.rollStats.forEach(statName => {
            if (char[statName]) {
                const { maxExperience, total, ...rest } = char[statName];
                char[statName] = rest;
            }
        });
        if (char.StatsAffected) {
            for (const category in char.StatsAffected) {
                for (const passiveName in char.StatsAffected[category]) {
                    for (const statName in char.StatsAffected[category][passiveName]) {
                        if (char.StatsAffected[category][passiveName][statName] instanceof Set) {
                            char.StatsAffected[category][passiveName][statName] = Array.from(char.StatsAffected[category][passiveName][statName]);
                        }
                    }
                }
            }
        }
        delete char.maxHealth;
        delete char.maxMana;
        delete char.maxRacialPower;
        delete char.ac;
    });

    const fileName = (characterProxy.name.trim() !== '' ? characterProxy.name.trim() + '_sheet' : 'character_sheets') + '.json';
    const dataStr = JSON.stringify(charactersToSave, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatusMessageCallback("Character data saved to JSON file!");
    console.log("All character data downloaded as JSON file!");
    characterProxy.hasUnsavedChanges = false;
    saveCurrentStateToHistoryCallback();
}

/**
 * Loads character data from a JSON file (upload).
 * @param {Event} event The file input change event.
 * @param {Array<object>} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} updateDOMCallback Callback to update the DOM.
 * @param {function} populateCharacterSelectorCallback Callback to populate character selector.
 * @param {function} showStatusMessageCallback Callback to display status messages.
 * @param {function} saveCurrentStateToHistoryCallback Callback to save history.
 */
export function loadCharacterFromFile(event, characters, characterProxy, updateDOMCallback, populateCharacterSelectorCallback, showStatusMessageCallback, saveCurrentStateToHistoryCallback) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedData = JSON.parse(e.target.result);
            if (Array.isArray(loadedData)) {
                characters.length = 0; // Clear existing characters
                loadedData.forEach(loadedChar => characters.push(initLoadCharacter(loadedChar, ExternalDataManager)));
                window.currentCharacterIndex = 0;
            } else {
                characters.length = 0;
                characters.push(initLoadCharacter(loadedData, ExternalDataManager));
                window.currentCharacterIndex = 0;
            }
            currentGoogleDriveFileId = null;
            updateDOMCallback(characterProxy);
            populateCharacterSelectorCallback();
            showStatusMessageCallback(`Character data loaded from JSON file!`);
            console.log(`Character data loaded from JSON file!`);
            window.historyStack = [];
            window.historyPointer = -1;
            saveCurrentStateToHistoryCallback();
            characterProxy.hasUnsavedChanges = false;
        } catch (e) {
            showStatusMessageCallback("Error parsing JSON file.", true);
            console.error("Error parsing JSON file:", e);
        }
    };
    reader.readAsText(file);
}

// Export currentGoogleDriveFileId for external access if needed
export { currentGoogleDriveFileId };
