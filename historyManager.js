// HistoryManager.js
// This module manages the history stack for revert/forward functionality.

import { initLoadCharacter, recalculateUpdate } from './StatManager.js';
import { updateDOM, populateCharacterSelector, showStatusMessage } from './UIManager.js';
import { ExternalDataManager } from './externalDataManager.js'; // Assuming ExternalDataManager is already defined

let historyStack = [];
let historyPointer = -1;
const MAX_HISTORY_LENGTH = 10; // Store last 10 states

/**
 * Pushes the current characters array state to the history stack.
 * @param {Array<object>} characters The array of all character objects.
 */
export function saveCurrentStateToHistory(characters) {
    // Deep copy the entire characters array to save its state
    const currentState = JSON.parse(JSON.stringify(characters));

    // Convert Sets to Arrays for saving within the new StatChoices/StatsAffected structure
    currentState.forEach(char => {
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
    });

    // If the history pointer is not at the end, it means we reverted and are now making a new change.
    // In this case, discard all "future" states from the current pointer onwards.
    if (historyPointer < historyStack.length - 1) {
        historyStack.splice(historyPointer + 1);
    }

    // Only push if the current state is different from the last saved state
    if (historyStack.length === 0 || JSON.stringify(currentState) !== JSON.stringify(historyStack[historyStack.length - 1])) {
        historyStack.push(currentState);
        if (historyStack.length > MAX_HISTORY_LENGTH) {
            historyStack.shift(); // Remove the oldest state
        }
        historyPointer = historyStack.length - 1; // Update pointer to the new end
        console.log("State saved to history. History length:", historyStack.length, "Pointer:", historyPointer);
    }
    updateHistoryButtonsState(); // Update button states after saving
}

/**
 * Applies a historical state to the current character and updates the DOM.
 * @param {Array<object>} state The character array state to apply.
 * @param {Array<object>} characters The main characters array (will be modified).
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} updateDOMCallback Callback to update the DOM.
 * @param {function} populateCharacterSelectorCallback Callback to populate the character selector.
 */
export function applyHistoryState(state, characters, characterProxy, updateDOMCallback, populateCharacterSelectorCallback) {
    // Clear the existing characters array and populate it with the deep-copied state
    characters.length = 0; // Clear array while maintaining reference
    state.forEach(charData => {
        // Use initLoadCharacter to ensure Sets are correctly converted back and derived stats recalculated
        characters.push(initLoadCharacter(charData, ExternalDataManager));
    });

    // Ensure currentCharacterIndex is valid after applying history, especially if characters were added/deleted
    if (window.currentCharacterIndex >= characters.length) {
        window.currentCharacterIndex = characters.length - 1;
    } else if (window.currentCharacterIndex < 0 && characters.length > 0) {
        window.currentCharacterIndex = 0; // Default to the first character if somehow invalid
    } else if (characters.length === 0) {
        // If no characters left (shouldn't happen with current logic, but as a safeguard)
        characters.push(defaultCharacterData(ExternalDataManager));
        window.currentCharacterIndex = 0;
    }

    // Update the proxy to point to the correct character in the modified array
    // This is implicitly handled by the proxy's getter/setter if `characters` array reference remains the same.
    // However, if `characters` was reassigned (e.g., `characters = newState`), the proxy needs to be re-bound or the new array needs to be wrapped.
    // Given `characters.length = 0; characters.push(...)`, the reference is maintained.

    updateDOMCallback(characterProxy);
    populateCharacterSelectorCallback();
    characterProxy.hasUnsavedChanges = false; // Reverted/Forwarded state is now considered "saved" locally
    updateHistoryButtonsState(); // Update button states after applying history
}

/**
 * Reverts the current character to the previous state in history.
 * @param {Array<object>} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} updateDOMCallback Callback to update the DOM.
 * @param {function} populateCharacterSelectorCallback Callback to populate the character selector.
 * @param {function} showStatusMessageCallback Callback to display status messages.
 */
export function revertCurrentCharacter(characters, characterProxy, updateDOMCallback, populateCharacterSelectorCallback, showStatusMessageCallback) {
    if (historyPointer > 0) {
        historyPointer--;
        applyHistoryState(historyStack[historyPointer], characters, characterProxy, updateDOMCallback, populateCharacterSelectorCallback);
        showStatusMessageCallback("Reverted to previous state.");
        console.log("Reverted to previous state. History length:", historyStack.length, "Pointer:", historyPointer);
    } else {
        showStatusMessageCallback("No previous state to revert to.", true);
        console.log("No previous state to revert to.");
    }
}

/**
 * Moves the current character to the next state in history (undo a revert).
 * @param {Array<object>} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {function} updateDOMCallback Callback to update the DOM.
 * @param {function} populateCharacterSelectorCallback Callback to populate the character selector.
 * @param {function} showStatusMessageCallback Callback to display status messages.
 */
export function forwardCurrentCharacter(characters, characterProxy, updateDOMCallback, populateCharacterSelectorCallback, showStatusMessageCallback) {
    if (historyPointer < historyStack.length - 1) {
        historyPointer++;
        applyHistoryState(historyStack[historyPointer], characters, characterProxy, updateDOMCallback, populateCharacterSelectorCallback);
        showStatusMessageCallback("Moved forward to next state.");
        console.log("Moved forward to next state. History length:", historyStack.length, "Pointer:", historyPointer);
    } else {
        showStatusMessageCallback("No future state to move to.", true);
        console.log("No future state to move to.");
    }
}

/**
 * Updates the enabled/disabled state of the history buttons.
 */
export function updateHistoryButtonsState() {
    const revertButton = document.getElementById('revert-character-btn');
    const forwardButton = document.getElementById('forward-character-btn');

    if (revertButton) {
        revertButton.disabled = (historyPointer <= 0);
        revertButton.classList.toggle('opacity-50', revertButton.disabled);
        revertButton.classList.toggle('cursor-not-allowed', revertButton.disabled);
    }
    if (forwardButton) {
        forwardButton.disabled = (historyPointer >= historyStack.length - 1);
        forwardButton.classList.toggle('opacity-50', forwardButton.disabled);
        forwardButton.classList.toggle('cursor-not-allowed', forwardButton.disabled);
    }
}

// Export historyStack and historyPointer for initial setup in sheet.js
export { historyStack, historyPointer };