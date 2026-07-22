import { GOOGLE_DRIVE_AUTH_STATUS_KEY } from './constants.js';
import { setCurrentGoogleDriveFileId } from './state.js';
import { showStatusMessage } from './uiUtils.js';

/**
* Enables Google Drive buttons if both GAPI and GIS are initialized.
* Also updates the UI based on current authorization status and local storage.
*/
export function maybeEnableGoogleDriveButtons() {
    if (window.gapiInited && window.gisInited) {
        const authorizeGoogleDriveButton = document.getElementById('authorize_google_drive_button');
        const signoutGoogleDriveButton = document.getElementById('signout_google_drive_button');
        const googleDriveAuthStatusSpan = document.getElementById('google-drive-auth-status');

        authorizeGoogleDriveButton.disabled = false;
        const currentToken = gapi.client.getToken();
        const wasAuthorizedInLocalStorage = localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true';

        if (currentToken) {
            // User is currently authorized
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized';
            authorizeGoogleDriveButton.classList.add('hidden');
            signoutGoogleDriveButton.classList.remove('hidden');
            localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true'); // Ensure local storage is updated
            return true;
        } else if (wasAuthorizedInLocalStorage) {
            // User was authorized previously, but session might have expired
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized (Session Expired)';
            authorizeGoogleDriveButton.classList.remove('hidden'); // Show authorize to re-auth
            signoutGoogleDriveButton.classList.remove('hidden'); // Still allow sign out
            return null;
        } else {
            // User is not authorized and never was (or explicitly signed out)
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Not Authorized';
            authorizeGoogleDriveButton.classList.remove('hidden');
            signoutGoogleDriveButton.classList.add('hidden');
            return false;
        }
    }
}

/**
* Handles Google Drive authorization click.
*/
export function handleGoogleDriveAuthClickThenCall(functionToCall) {
    window.tokenClient.callback = async (resp) => {
        if (resp.error) {
            console.error("Google Drive authorization error:", resp);
            showStatusMessage("Google Drive authorization failed.", true);
            localStorage.removeItem(GOOGLE_DRIVE_AUTH_STATUS_KEY); // Clear local storage on error
            window.gapi.client.setToken(''); // Clear token in gapi.client as well
            maybeEnableGoogleDriveButtons(); // Update UI
            return;
        }
        // Set the token for gapi.client after successful authorization
        window.gapi.client.setToken(resp);
        localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true'); // Persist authorization status
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
            localStorage.removeItem(GOOGLE_DRIVE_AUTH_STATUS_KEY); // Clear local storage on error
            window.gapi.client.setToken(''); // Clear token in gapi.client as well
            maybeEnableGoogleDriveButtons(); // Update UI
            return;
        }
        // Set the token for gapi.client after successful authorization
        window.gapi.client.setToken(resp);
        localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true'); // Persist authorization status
        showStatusMessage("Google Drive authorized successfully!");
        maybeEnableGoogleDriveButtons(); // Update UI
    };
    window.tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
* Handles Google Drive sign-out.
*/
export function handleGoogleDriveSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        window.google.accounts.oauth2.revoke(token.access_token);
        window.gapi.client.setToken('');
    }
    localStorage.removeItem(GOOGLE_DRIVE_AUTH_STATUS_KEY); // Clear persisted status
    setCurrentGoogleDriveFileId(null); // Clear current file ID on sign out
    showStatusMessage("Signed out from Google Drive.");
    maybeEnableGoogleDriveButtons(); // Update UI */
}