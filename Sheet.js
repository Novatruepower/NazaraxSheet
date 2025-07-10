// sheet.js
// This is the main application file that orchestrates the character sheet functionality.

import { ExternalDataManager } from './ExternalDataManager.js';
import {
    calculateMaxHealth,
    calculateMaxMana,
    calculateMaxRacialPower,
    defaultCharacterData,
    initLoadCharacter,
    recalculateUpdate,
    quickRollStats,
    handleChangeRace,
    handleStatInputChange,
    handleLevelInputChange,
    handleOtherCharacterInputChange,
    handleInventoryInputChange,
    addWeapon,
    addArmor,
    addGeneralItem,
    removeItem
} from './StatManager.js';
import {
    initDOMElements,
    showStatusMessage,
    showConfirmationModal,
    toggleSection,
    updateSectionVisibility,
    toggleSidebar,
    togglePersonalNotesPanel,
    makeDraggable,
    populateRaceSelector,
    populateCharacterSelector,
    toggleDropdown,
    renderWeaponInventory,
    renderArmorInventory,
    renderGeneralInventory,
    renderDemiHumanStatChoiceUI,
    renderMutantOptionUI,
    renderGenericRacialPassives,
    updateSpecializationDropdownAndData,
    updateDOM,
    maybeEnableGoogleDriveButtons // Rename for clarity
} from './UIManager.js';
import {
    attachEventListeners
} from './EventManager.js';
import {
    saveCurrentStateToHistory as historySaveCurrentStateToHistory, // Rename to avoid conflict with local function
    applyHistoryState,
    revertCurrentCharacter as historyRevertCurrentCharacter, // Rename to avoid conflict with local function
    forwardCurrentCharacter as historyForwardCurrentCharacter, // Rename to avoid conflict with local function
    updateHistoryButtonsState,
    historyStack, // Import the actual historyStack and historyPointer
    historyPointer
} from './HistoryManager.js';
import {
    handleGoogleDriveAuthClick,
    handleGoogleDriveSignoutClick,
    saveCharacterToGoogleDrive,
    loadCharacterFromGoogleDrive,
    saveCharacterToFile,
    loadCharacterFromFile
} from './GoogleDriveManager.js';


// Global state variables
let characters = [];
let currentCharacterIndex = 0;

// Flag to track if there are unsaved changes
let hasUnsavedChanges = false;

// Expose these to the window for global access if needed by UIManager or other modules
window.characters = characters;
window.currentCharacterIndex = currentCharacterIndex;
window.historyStack = historyStack;
window.historyPointer = historyPointer;
window.updateHistoryButtonsState = updateHistoryButtonsState; // Expose for UIManager to call
window.saveCurrentStateToHistory = () => historySaveCurrentStateToHistory(characters); // Wrapper to pass characters


// Proxy for the current character to automatically track changes
const character = new Proxy({}, {
    get: function (target, prop) {
        if (characters.length === 0) {
            // Return a default empty object or throw an error if no character is loaded
            // This prevents errors if character is accessed before initialization
            return {};
        }
        return characters[currentCharacterIndex][prop];
    },
    set: function (target, prop, value) {
        if (characters.length === 0) {
            console.warn("Attempted to set property on character proxy before characters array is initialized.");
            return false;
        }

        // Only set hasUnsavedChanges to true if the value actually changes
        if (characters[currentCharacterIndex][prop] !== value) {
            characters[currentCharacterIndex][prop] = value;
            hasUnsavedChanges = true; // Mark that there are unsaved changes
        }

        // If the character name changes, update the selector
        if (prop === 'name') {
            populateCharacterSelector(characters, currentCharacterIndex);
        }
        return true;
    }
});

// Expose hasUnsavedChanges via the proxy for external checks
Object.defineProperty(character, 'hasUnsavedChanges', {
    get: function () {
        return hasUnsavedChanges;
    },
    set: function (value) {
        hasUnsavedChanges = value;
    }
});


/**
 * Initializes the page elements and application state.
 */
function initPage() {
    // Initialize DOM element references in UIManager
    initDOMElements();

    // Set up initial character data
    characters.push(defaultCharacterData(ExternalDataManager));

    // Initialize derived properties for the first character
    characters[0].maxHealth = calculateMaxHealth(characters[0], characters[0].level, characters[0].healthBonus);
    characters[0].maxMana = calculateMaxMana(characters[0], characters[0].level);
    characters[0].maxRacialPower = calculateMaxRacialPower(characters[0].level);
    characters[0].ac = characters[0].armorBonus;

    // Populate selectors and update UI
    populateRaceSelector(character);
    populateCharacterSelector(characters, currentCharacterIndex);
    updateDOM(character); // Initial UI update

    // Make the personal notes panel draggable
    const personalNotesPanel = document.getElementById('personal-notes-panel');
    const personalNotesHeader = document.querySelector('.personal-notes-header');
    if (personalNotesPanel && personalNotesHeader) {
        makeDraggable(personalNotesPanel, personalNotesHeader);
    }

    // Attach all event listeners
    attachEventListeners(
        characters,
        character,
        currentCharacterIndex,
        defaultCharacterData
    );

    // Initialize Google API libraries and update buttons
    window.gapiLoaded();
    window.gisLoaded();
    maybeEnableGoogleDriveButtons();

    // Save the initial state to history after everything is loaded and rendered
    window.saveCurrentStateToHistory();
}


// Event listeners for Google API readiness
window.addEventListener("gis-ready", () => {
    maybeEnableGoogleDriveButtons();
});

window.addEventListener("gapi-ready", () => {
    maybeEnableGoogleDriveButtons();
});

// Initialize the application when the DOM is fully loaded
window.onload = async function () {
    await ExternalDataManager.init();
    initPage();
};
