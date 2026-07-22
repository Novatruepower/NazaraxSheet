import { MAX_HISTORY_LENGTH } from './constants.js';

export let currentGoogleDriveFileId = null; // To store the ID of the currently loaded Google Drive file
export function setCurrentGoogleDriveFileId(id) {
    currentGoogleDriveFileId = id;
}