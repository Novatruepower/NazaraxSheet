import { MAX_HISTORY_LENGTH } from './constants.js';

export let characters = [];
export function setCharacters(newChars) {
    characters = newChars;
}

export let currentCharacterIndex = 0;
export function setCurrentCharacterIndex(index) {
    currentCharacterIndex = index;
}

export let currentGoogleDriveFileId = null; // To store the ID of the currently loaded Google Drive file
export function setCurrentGoogleDriveFileId(id) {
    currentGoogleDriveFileId = id;
}

export let hasUnsavedChanges = false;
export function setHasUnsavedChanges(val) {
    hasUnsavedChanges = val;
}

// Proxy to access and mutate current active character
export const character = new Proxy({}, {
    get: function (target, prop) {
        if (!characters[currentCharacterIndex]) return undefined;
        return characters[currentCharacterIndex][prop];
    },
    set: function (target, prop, value) {
        if (!characters[currentCharacterIndex]) return false;
        if (characters[currentCharacterIndex][prop] !== value) {
            characters[currentCharacterIndex][prop] = value;
            hasUnsavedChanges = true;
        }
        if (prop === 'name') {
            // Need populateCharacterSelector dispatch or custom event/callback
            if (typeof window.populateCharacterSelector === 'function') {
                window.populateCharacterSelector();
            }
        }

        return true;
    }
});

// Inventory display settings
export let inventoryViewSettings = {
    weapon: 'cards',
    armor: 'cards',
    general: 'cards'
};

// History stack for revert/forward functionality
export let historyStack = [];
export function setHistoryStack(stack) {
    historyStack = stack;
}

export let historyPointer = -1; // Pointer to the current state in the historyStack
export function setHistoryPointer(ptr) {
    historyPointer = ptr;
}