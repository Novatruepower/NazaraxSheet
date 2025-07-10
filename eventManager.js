// EventManager.js
// This module handles attaching all event listeners to the DOM.

import {
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
    toggleClassDropdown,
    toggleSpecializationDropdown,
    toggleDropdown,
    togglePersonalNotesPanel,
    makeDraggable,
    toggleSection,
    showConfirmationModal,
    updateDOM,
    populateCharacterSelector,
    showStatusMessage,
    googleDriveModal,
    googleDriveFileList,
    googleDriveModalStatus
} from './UIManager.js';

import {
    saveCurrentStateToHistory,
    revertCurrentCharacter,
    forwardCurrentCharacter,
    updateHistoryButtonsState
} from './HistoryManager.js';

import {
    handleGoogleDriveAuthClick,
    handleGoogleDriveSignoutClick,
    saveCharacterToGoogleDrive,
    loadCharacterFromGoogleDrive,
    loadCharacterFromFile,
    proceedToLoadGoogleDriveFile
} from './GoogleDriveManager.js'; // Import GoogleDriveManager functions


/**
 * Attaches all necessary event listeners to the DOM elements.
 * @param {object} characters The array of all character objects.
 * @param {object} characterProxy The proxy object for the current character.
 * @param {number} currentCharacterIndex The index of the currently active character.
 * @param {function} defaultCharacterData The function to get default character data.
 */
export function attachEventListeners(characters, characterProxy, currentCharacterIndex, defaultCharacterData) {
    // Attach listeners for standard inputs and the race selector
    const inputs = document.querySelectorAll(
        '#name, #level, #levelExperience, #race, #Health, #Mana, #racialPower, #skills, #healthBonus, #armorBonus, #personalNotes'
    );
    inputs.forEach(input => {
        if (!input.readOnly) {
            input.addEventListener('input', (event) => {
                const { name, id, value, type } = event.target;
                let newValue = (type === 'number') ? parseFloat(value) || 0 : value;

                if (id === 'race') {
                    let oldRace = characterProxy.race;
                    characterProxy.race = newValue;
                    const raceSelect = document.getElementById('race');
                    if (newValue === '') {
                        raceSelect.classList.add('select-placeholder-text');
                    } else {
                        raceSelect.classList.remove('select-placeholder-text');
                    }
                    handleChangeRace(characterProxy, oldRace, () => updateDOM(characterProxy), saveCurrentStateToHistory);
                } else if (id === 'level' || id === 'levelExperience') {
                    handleLevelInputChange(characterProxy, id, newValue);
                } else {
                    handleOtherCharacterInputChange(characterProxy, id, newValue, () => renderWeaponInventory(characterProxy));
                }
                characterProxy.hasUnsavedChanges = true;
                saveCurrentStateToHistory();
            });
        }
    });

    // Attach listeners for stat table inputs using delegation
    document.getElementById('player-stats-container').addEventListener('input', function (event) {
        if (event.target.classList.contains('stat-input')) {
            const { name, value, type } = event.target;
            let newValue = (type === 'number') ? parseFloat(value) || 0 : value;

            let statName = '';
            let subProperty = '';

            // Find which stat and sub-property was changed
            for (const stat of ExternalDataManager.rollStats) {
                if (name.startsWith(`${stat}-`)) {
                    statName = stat;
                    subProperty = name.substring(stat.length + 1);
                    break;
                }
            }

            if (statName) {
                handleStatInputChange(characterProxy, statName, subProperty, newValue, () => renderWeaponInventory(characterProxy));
                characterProxy.hasUnsavedChanges = true;
                saveCurrentStateToHistory();
                updateDOM(characterProxy); // Update the DOM for all stats after change
            }
        }
    });


    // Attach event listener for the Quick Roll Stats button
    document.getElementById('quick-roll-stats-btn').addEventListener('click', () => {
        quickRollStats(characterProxy, () => renderWeaponInventory(characterProxy), saveCurrentStateToHistory);
        updateDOM(characterProxy); // Update the DOM after quick roll
    });

    // Attach event listeners for Save/Load dropdown buttons and options
    document.getElementById('save-dropdown-btn').addEventListener('click', () => toggleDropdown('save-dropdown-menu'));
    document.getElementById('save-current-system-btn').addEventListener('click', () => {
        saveCharacterToFile(characters, characterProxy, () => showStatusMessage, saveCurrentStateToHistory);
    });
    document.getElementById('save-google-drive-btn').addEventListener('click', () => {
        saveCharacterToGoogleDrive(characters, characterProxy, showStatusMessage);
    });

    document.getElementById('load-dropdown-btn').addEventListener('click', () => toggleDropdown('load-dropdown-menu'));
    document.getElementById('load-current-system-btn').addEventListener('click', () => {
        if (characterProxy.hasUnsavedChanges) {
            showConfirmationModal("You have unsaved changes. Are you sure you want to load a new file without saving?", () => {
                document.getElementById('load-json-input').click();
            });
        } else {
            document.getElementById('load-json-input').click();
        }
    });
    document.getElementById('load-json-input').addEventListener('change', (event) => {
        loadCharacterFromFile(event, characters, characterProxy, () => updateDOM(characterProxy), () => populateCharacterSelector(characters, currentCharacterIndex), showStatusMessage, saveCurrentStateToHistory);
    });
    document.getElementById('load-google-drive-btn').addEventListener('click', async () => {
        await loadCharacterFromGoogleDrive(characters, characterProxy, showConfirmationModal, showStatusMessage, () => updateDOM(characterProxy), () => populateCharacterSelector(characters, currentCharacterIndex), saveCurrentStateToHistory, googleDriveModal, googleDriveFileList, googleDriveModalStatus);
    });

    // Google Drive Auth buttons
    document.getElementById('authorize_google_drive_button').addEventListener('click', handleGoogleDriveAuthClick);
    document.getElementById('signout_google_drive_button').addEventListener('click', handleGoogleDriveSignoutClick);
    document.getElementById('close-google-drive-modal').addEventListener('click', () => googleDriveModal.classList.add('hidden'));


    // Attach event listeners for Personal Notes button and panel close button
    document.getElementById('toggle-notes-btn').addEventListener('click', () => togglePersonalNotesPanel(characterProxy, saveCurrentStateToHistory));
    document.getElementById('close-notes-panel-btn').addEventListener('click', () => togglePersonalNotesPanel(characterProxy, saveCurrentStateToHistory));

    // Attach event listeners for character selector and add button
    document.getElementById('character-selector').addEventListener('change', (event) => {
        if (characterProxy.hasUnsavedChanges) {
            showConfirmationModal("You have unsaved changes. Are you sure you want to switch characters without saving?", () => {
                window.currentCharacterIndex = parseInt(event.target.value);
                updateDOM(characterProxy);
                saveCurrentStateToHistory();
                characterProxy.hasUnsavedChanges = false;
            }, () => {
                event.target.value = window.currentCharacterIndex; // Revert dropdown
            });
        } else {
            window.currentCharacterIndex = parseInt(event.target.value);
            updateDOM(characterProxy);
            saveCurrentStateToHistory();
        }
    });
    document.getElementById('add-character-btn').addEventListener('click', () => {
        if (characterProxy.hasUnsavedChanges) {
            showConfirmationModal("You have unsaved changes. Are you sure you want to add a new character without saving?", () => {
                const newChar = defaultCharacterData(ExternalDataManager);
                newChar.name = `Character ${characters.length + 1}`;
                characters.push(newChar);
                window.currentCharacterIndex = characters.length - 1;
                populateCharacterSelector(characters, window.currentCharacterIndex);
                updateDOM(characterProxy);
                showStatusMessage(`Added new character: ${newChar.name}`);
                saveCurrentStateToHistory();
                characterProxy.hasUnsavedChanges = false;
            });
        } else {
            const newChar = defaultCharacterData(ExternalDataManager);
            newChar.name = `Character ${characters.length + 1}`;
            characters.push(newChar);
            window.currentCharacterIndex = characters.length - 1;
            populateCharacterSelector(characters, window.currentCharacterIndex);
            updateDOM(characterProxy);
            showStatusMessage(`Added new character: ${newChar.name}`);
            saveCurrentStateToHistory();
        }
    });

    // Attach listeners for Add Inventory buttons
    document.getElementById('add-weapon-btn').addEventListener('click', () => {
        addWeapon(characterProxy, () => renderWeaponInventory(characterProxy));
        characterProxy.hasUnsavedChanges = true;
        saveCurrentStateToHistory();
    });
    document.getElementById('add-armor-btn').addEventListener('click', () => {
        addArmor(characterProxy, () => renderArmorInventory(characterProxy));
        characterProxy.hasUnsavedChanges = true;
        saveCurrentStateToHistory();
    });
    document.getElementById('add-general-item-btn').addEventListener('click', () => {
        addGeneralItem(characterProxy, () => renderGeneralInventory(characterProxy));
        characterProxy.hasUnsavedChanges = true;
        saveCurrentStateToHistory();
    });

    // Attach delegated event listeners for inventory table inputs and remove buttons
    document.getElementById('weapon-inventory-table').addEventListener('input', (event) => {
        const { dataset, value, type, checked } = event.target;
        if (dataset.inventoryType) {
            handleInventoryInputChange(characterProxy, dataset.inventoryType, parseInt(dataset.index), dataset.field, value, type, checked, () => renderWeaponInventory(characterProxy), () => renderArmorInventory(characterProxy), () => renderGeneralInventory(characterProxy));
            characterProxy.hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        }
    });
    document.getElementById('armor-inventory-table').addEventListener('input', (event) => {
        const { dataset, value, type, checked } = event.target;
        if (dataset.inventoryType) {
            handleInventoryInputChange(characterProxy, dataset.inventoryType, parseInt(dataset.index), dataset.field, value, type, checked, () => renderWeaponInventory(characterProxy), () => renderArmorInventory(characterProxy), () => renderGeneralInventory(characterProxy));
            characterProxy.hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        }
    });
    document.getElementById('general-inventory-table').addEventListener('input', (event) => {
        const { dataset, value, type, checked } = event.target;
        if (dataset.inventoryType) {
            handleInventoryInputChange(characterProxy, dataset.inventoryType, parseInt(dataset.index), dataset.field, value, type, checked, () => renderWeaponInventory(characterProxy), () => renderArmorInventory(characterProxy), () => renderGeneralInventory(characterProxy));
            characterProxy.hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        }
    });

    document.getElementById('weapon-inventory-table').addEventListener('change', (event) => { // For checkbox 'use'
        const { dataset, value, type, checked } = event.target;
        if (dataset.inventoryType && type === 'checkbox') {
            handleInventoryInputChange(characterProxy, dataset.inventoryType, parseInt(dataset.index), dataset.field, value, type, checked, () => renderWeaponInventory(characterProxy), () => renderArmorInventory(characterProxy), () => renderGeneralInventory(characterProxy));
            characterProxy.hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        }
    });
    document.getElementById('armor-inventory-table').addEventListener('change', (event) => { // For checkbox 'equipped'
        const { dataset, value, type, checked } = event.target;
        if (dataset.inventoryType && type === 'checkbox') {
            handleInventoryInputChange(characterProxy, dataset.inventoryType, parseInt(dataset.index), dataset.field, value, type, checked, () => renderWeaponInventory(characterProxy), () => renderArmorInventory(characterProxy), () => renderGeneralInventory(characterProxy));
            characterProxy.hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        }
    });

    document.getElementById('weapon-inventory-table').addEventListener('click', function (event) {
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(characterProxy, event.target.dataset.inventoryType, parseInt(event.target.dataset.index), () => renderWeaponInventory(characterProxy), () => renderArmorInventory(characterProxy), () => renderGeneralInventory(characterProxy));
            characterProxy.hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        }
    });
    document.getElementById('armor-inventory-table').addEventListener('click', function (event) {
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(characterProxy, event.target.dataset.inventoryType, parseInt(event.target.dataset.index), () => renderWeaponInventory(characterProxy), () => renderArmorInventory(characterProxy), () => renderGeneralInventory(characterProxy));
            characterProxy.hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        }
    });
    document.getElementById('general-inventory-table').addEventListener('click', function (event) {
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(characterProxy, event.target.dataset.inventoryType, parseInt(event.target.dataset.index), () => renderWeaponInventory(characterProxy), () => renderArmorInventory(characterProxy), () => renderGeneralInventory(characterProxy));
            characterProxy.hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        }
    });

    // Attach event listeners for section toggle buttons
    document.querySelectorAll('.toggle-section-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.currentTarget.dataset.target;
            toggleSection(targetId, characterProxy, saveCurrentStateToHistory);
        });
    });

    // Attach event listener for sidebar toggle button
    document.getElementById('sidebar-toggle-btn').addEventListener('click', window.toggleSidebar);

    // Attach event listeners for Reset and Delete buttons
    document.getElementById('reset-character-btn').addEventListener('click', () => {
        showConfirmationModal("Are you sure you want to reset the current character? All data will be lost.", () => {
            characters[window.currentCharacterIndex] = defaultCharacterData(ExternalDataManager);
            characters[window.currentCharacterIndex].name = `Character ${window.currentCharacterIndex + 1}`;
            updateDOM(characterProxy);
            showStatusMessage("Current character reset successfully!");
            window.historyStack = [];
            window.historyPointer = -1;
            saveCurrentStateToHistory();
            characterProxy.hasUnsavedChanges = false;
        });
    });
    document.getElementById('delete-character-btn').addEventListener('click', () => {
        if (characters.length === 1) {
            showConfirmationModal("Cannot delete the last character. It will be reset instead. Are you sure?", () => {
                characters[window.currentCharacterIndex] = defaultCharacterData(ExternalDataManager);
                characters[window.currentCharacterIndex].name = `Character ${window.currentCharacterIndex + 1}`;
                updateDOM(characterProxy);
                showStatusMessage("Cannot delete the last character. Character has been reset instead.", false);
                window.historyStack = [];
                window.historyPointer = -1;
                saveCurrentStateToHistory();
                characterProxy.hasUnsavedChanges = false;
            });
        } else {
            showConfirmationModal(`Are you sure you want to delete "${characterProxy.name || `Character ${window.currentCharacterIndex + 1}`}?" This action cannot be undone.`, () => {
                characters.splice(window.currentCharacterIndex, 1);

                if (window.currentCharacterIndex >= characters.length) {
                    window.currentCharacterIndex = characters.length - 1;
                }

                updateDOM(characterProxy);
                populateCharacterSelector(characters, window.currentCharacterIndex);
                showStatusMessage("Character deleted successfully!");
                window.historyStack = [];
                window.historyPointer = -1;
                saveCurrentStateToHistory();
                characterProxy.hasUnsavedChanges = false;
            });
        }
    });

    // Attach event listener for Revert button
    document.getElementById('revert-character-btn').addEventListener('click', () => {
        revertCurrentCharacter(characters, characterProxy, () => updateDOM(characterProxy), () => populateCharacterSelector(characters, window.currentCharacterIndex), showStatusMessage);
    });
    // Attach event listener for Forward button
    document.getElementById('forward-character-btn').addEventListener('click', () => {
        forwardCurrentCharacter(characters, characterProxy, () => updateDOM(characterProxy), () => populateCharacterSelector(characters, window.currentCharacterIndex), showStatusMessage);
    });

    // Add the beforeunload event listener
    window.addEventListener('beforeunload', (event) => {
        if (characterProxy.hasUnsavedChanges) {
            event.preventDefault();
            event.returnValue = '';
            return "You have unsaved changes. Are you sure you want to exit?";
        }
    });

    // Close dropdowns if clicked outside
    document.addEventListener('click', function (event) {
        const classDisplayInput = document.getElementById('class-display');
        const classDropdownOptions = document.getElementById('class-dropdown-options');
        const specializationDisplayInput = document.getElementById('specialization-display');
        const specializationDropdownOptions = document.getElementById('specialization-dropdown-options');
        const saveDropdownBtn = document.getElementById('save-dropdown-btn');
        const saveDropdownMenu = document.getElementById('save-dropdown-menu');
        const loadDropdownBtn = document.getElementById('load-dropdown-btn');
        const loadDropdownMenu = document.getElementById('load-dropdown-menu');


        if (!classDisplayInput.contains(event.target) && !classDropdownOptions.contains(event.target)) {
            classDropdownOptions.classList.add('hidden');
        }
        if (!specializationDisplayInput.contains(event.target) && !specializationDropdownOptions.contains(event.target)) {
            specializationDropdownOptions.classList.add('hidden');
        }
        // Close save dropdown if clicked outside
        if (!saveDropdownBtn.contains(event.target) && !saveDropdownMenu.contains(event.target)) {
            saveDropdownMenu.classList.add('hidden');
        }
        // Close load dropdown if clicked outside
        if (!loadDropdownBtn.contains(event.target) && !loadDropdownMenu.contains(event.target)) {
            loadDropdownMenu.classList.add('hidden');
        }
    });

    // Attach event listener for the custom class display input to toggle dropdown
    document.getElementById('class-display').addEventListener('click', toggleClassDropdown);

    // Attach event listeners to the dynamically created class checkboxes (delegation)
    document.getElementById('class-dropdown-options').addEventListener('change', function (event) {
        if (event.target.type === 'checkbox' && event.target.name === 'class-option') {
            handleClassCheckboxChange(event, characterProxy, () => updateSpecializationDropdownAndData(characterProxy), saveCurrentStateToHistory);
        }
    });

    // Attach event listener for the custom specialization display input to toggle dropdown
    document.getElementById('specialization-display').addEventListener('click', toggleSpecializationDropdown);

    // Attach event listeners to the dynamically created specialization checkboxes (delegation)
    document.getElementById('specialization-dropdown-options').addEventListener('change', function (event) {
        if (event.target.type === 'checkbox' && event.target.name === 'specialization-option') {
            handleSpecializationCheckboxChange(event, characterProxy, saveCurrentStateToHistory);
        }
    });
}

/**
 * Handles changes in the class checkboxes.
 * @param {Event} event The change event.
 * @param {object} character The current character object.
 * @param {function} updateSpecializationDropdownAndData Callback to update specialization dropdown.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
function handleClassCheckboxChange(event, character, updateSpecializationDropdownAndData, saveCurrentStateToHistory) {
    const { value, checked } = event.target;

    if (checked) {
        if (!character.class.includes(value)) {
            character.class.push(value);
        }
    } else {
        character.class = character.class.filter(c => c !== value);
    }
    document.getElementById('class-display').value = character.class.join(', ');

    updateSpecializationDropdownAndData(character);
    character.hasUnsavedChanges = true;
    saveCurrentStateToHistory();
}

/**
 * Handles changes in the specialization checkboxes.
 * @param {Event} event The change event.
 * @param {object} character The current character object.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
function handleSpecializationCheckboxChange(event, character, saveCurrentStateToHistory) {
    const { value, checked } = event.target;

    if (checked) {
        if (!character.specialization.includes(value)) {
            character.specialization.push(value);
        }
    } else {
        character.specialization = character.specialization.filter(s => s !== value);
    }
    document.getElementById('specialization-display').value = character.specialization.join(', ');
    character.hasUnsavedChanges = true;
    saveCurrentStateToHistory();
}