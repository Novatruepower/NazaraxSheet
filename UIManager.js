// UIManager.js
// This module handles all DOM manipulation and UI updates.

import { ExternalDataManager } from './ExternalDataManager.js';
import { calculateTotal, calculateFormula, getAppliedRacialChange, handleDemiHumanStatChoice, handleMutantOption, recalculateUpdate } from './StatManager.js';

let statusMessageElement;
let googleDriveAuthStatusSpan;
let authorizeGoogleDriveButton;
let signoutGoogleDriveButton;
let googleDriveModal;
let googleDriveFileList;
let googleDriveModalStatus;
let confirmationModal;
let confirmMessage;
let confirmOkBtn;
let confirmCancelBtn;

/**
 * Initializes DOM element references. Call this once the DOM is fully loaded.
 */
export function initDOMElements() {
    statusMessageElement = document.getElementById('status-message');
    googleDriveAuthStatusSpan = document.getElementById('google-drive-auth-status');
    authorizeGoogleDriveButton = document.getElementById('authorize_google_drive_button');
    signoutGoogleDriveButton = document.getElementById('signout_google_drive_button');
    googleDriveModal = document.getElementById('google-drive-modal');
    googleDriveFileList = document.getElementById('google-drive-file-list');
    googleDriveModalStatus = document.getElementById('google-drive-modal-status');
    confirmationModal = document.getElementById('confirmation-modal');
    confirmMessage = document.getElementById('confirm-message');
    confirmOkBtn = document.getElementById('confirm-ok-btn');
    confirmCancelBtn = document.getElementById('confirm-cancel-btn');
}

/**
 * Shows a status message to the user.
 * @param {string} message The message to display.
 * @param {boolean} isError Whether the message indicates an error.
 */
export function showStatusMessage(message, isError = false) {
    if (!statusMessageElement) {
        console.error("Status message element not initialized.");
        return;
    }
    statusMessageElement.textContent = message;
    statusMessageElement.style.color = isError ? '#ef4444' : '#22c55e'; // red-500 or green-500
    setTimeout(() => {
        statusMessageElement.textContent = '';
    }, 5000); // Clear message after 5 seconds
}

/**
 * Shows a custom confirmation modal.
 * @param {string} message The message to display in the modal.
 * @param {function} onConfirm Callback function to execute if user confirms.
 * @param {function} onCancel Callback function to execute if user cancels (optional).
 */
export function showConfirmationModal(message, onConfirm, onCancel = () => { }) {
    if (!confirmationModal || !confirmMessage || !confirmOkBtn || !confirmCancelBtn) {
        console.error("Confirmation modal elements not found. Cannot show modal.");
        // Fallback to direct confirmation if modal elements are missing
        if (window.confirm(message)) {
            onConfirm();
        } else {
            onCancel();
        }
        return;
    }

    confirmMessage.textContent = message;
    confirmationModal.classList.remove('hidden');

    const handleConfirm = () => {
        confirmationModal.classList.add('hidden');
        confirmOkBtn.removeEventListener('click', handleConfirm);
        confirmCancelBtn.removeEventListener('click', handleCancel);
        onConfirm();
    };

    const handleCancel = () => {
        confirmationModal.classList.add('hidden');
        confirmOkBtn.removeEventListener('click', handleConfirm);
        confirmCancelBtn.removeEventListener('click', handleCancel);
        onCancel();
    };

    confirmOkBtn.addEventListener('click', handleConfirm);
    confirmCancelBtn.addEventListener('click', handleCancel);
}

/**
 * Toggles the visibility of a section and updates the button icon.
 * @param {string} sectionId The ID of the section content div.
 * @param {object} character The current character object.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function toggleSection(sectionId, character, saveCurrentStateToHistory) {
    const sectionContent = document.getElementById(sectionId);
    const toggleButton = document.querySelector(`.toggle-section-btn[data-target="${sectionId}"] svg`);

    if (sectionContent && toggleButton) {
        const isHidden = sectionContent.classList.contains('hidden');
        if (isHidden) {
            sectionContent.classList.remove('hidden');
            toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>'; // Chevron down
            character.sectionVisibility[sectionId] = true;
        } else {
            sectionContent.classList.add('hidden');
            toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'; // Chevron right
            character.sectionVisibility[sectionId] = false;
        }
        character.hasUnsavedChanges = true; // Mark that there are unsaved changes
        saveCurrentStateToHistory(); // Save state after modification
    }
}

/**
 * Updates the visibility of all sections based on the character's sectionVisibility data.
 * @param {object} character The current character object.
 */
export function updateSectionVisibility(character) {
    for (const sectionId in character.sectionVisibility) {
        const sectionContent = document.getElementById(sectionId);
        const toggleButton = document.querySelector(`.toggle-section-btn[data-target="${sectionId}"] svg`);

        if (sectionContent && toggleButton) {
            if (character.sectionVisibility[sectionId]) {
                sectionContent.classList.remove('hidden');
                toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>'; // Chevron down
            } else {
                sectionContent.classList.add('hidden');
                toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'; // Chevron right
            }
        }
    }
}

/**
 * Toggles the visibility and width of the left sidebar.
 */
export function toggleSidebar() {
    const sidebar = document.getElementById('left-sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleButton = document.getElementById('sidebar-toggle-btn');
    const toggleIcon = toggleButton.querySelector('svg path');
    const toggleNotesBtn = document.getElementById('toggle-notes-btn');

    if (sidebar.classList.contains('w-64')) {
        // Collapse sidebar
        sidebar.classList.remove('w-64');
        sidebar.classList.add('w-16'); // Collapsed width
        mainContent.classList.remove('ml-64');
        mainContent.classList.add('ml-16'); // Adjust main content margin
        toggleIcon.setAttribute('d', 'M9 5l7 7-7 7'); // Chevron right

        // Hide all children except the sidebar toggle button
        Array.from(sidebar.children).forEach(child => {
            if (child.id !== 'sidebar-toggle-btn') {
                child.classList.add('hidden');
            }
        });
        if (toggleNotesBtn) {
            toggleNotesBtn.classList.add('hidden');
        }

    } else {
        // Expand sidebar
        sidebar.classList.remove('w-16');
        sidebar.classList.add('w-64');
        mainContent.classList.remove('ml-16');
        mainContent.classList.add('ml-64');
        toggleIcon.setAttribute('d', 'M15 19l-7-7 7-7'); // Chevron left

        // Show all content within the sidebar
        Array.from(sidebar.children).forEach(child => {
            child.classList.remove('hidden');
        });
    }
}

/**
 * Toggles the personal notes panel visibility.
 * @param {object} character The current character object.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function togglePersonalNotesPanel(character, saveCurrentStateToHistory) {
    const notesPanel = document.getElementById('personal-notes-panel');
    const personalNotesTextarea = document.getElementById('personalNotes');

    if (notesPanel.classList.contains('hidden')) {
        // Show panel: populate textarea with current notes
        personalNotesTextarea.value = character.personalNotes;
        notesPanel.classList.remove('hidden');
    } else {
        // Hide panel: save textarea content to character data
        character.personalNotes = personalNotesTextarea.value;
        notesPanel.classList.add('hidden');
        character.hasUnsavedChanges = true; // Mark that there are unsaved changes
        saveCurrentStateToHistory(); // Save state after modification
    }
}

/**
 * Makes an HTML element draggable.
 * @param {HTMLElement} element The element to make draggable.
 * @param {HTMLElement} handle The handle element to initiate dragging.
 */
export function makeDraggable(element, handle) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    handle.addEventListener("mousedown", dragStart);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

        if (e.target === handle || handle.contains(e.target)) {
            isDragging = true;
            element.style.cursor = 'grabbing';
            document.addEventListener("mousemove", drag);
            document.addEventListener("mouseup", dragEnd);
        }
    }

    function drag(e) {
        if (isDragging) {
            e.preventDefault(); // Prevent text selection
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            element.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }

    function dragEnd() {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        element.style.cursor = 'grab';
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", dragEnd);
    }
}

/**
 * Populates the race selector dropdown with available races.
 * @param {object} character The current character object.
 */
export function populateRaceSelector(character) {
    const raceSelect = document.getElementById('race');
    raceSelect.innerHTML = `<option value="" disabled selected class="defaultOption">Select a Race</option>`;

    if (character.race === '') {
        raceSelect.classList.add('select-placeholder-text');
    } else {
        raceSelect.classList.remove('select-placeholder-text');
    }

    Object.keys(ExternalDataManager._data.Races).forEach(race => {
        const option = document.createElement('option');
        option.value = race;
        option.textContent = race;
        raceSelect.appendChild(option);
    });

    raceSelect.value = character.race; // Set the selected race
}

/**
 * Populates the character selector dropdown with available characters.
 * @param {Array<object>} characters The array of all character objects.
 * @param {number} currentCharacterIndex The index of the currently active character.
 */
export function populateCharacterSelector(characters, currentCharacterIndex) {
    const selector = document.getElementById('character-selector');
    selector.innerHTML = ''; // Clear existing options

    characters.forEach((charData, index) => {
        const option = document.createElement('option');
        option.value = index;
        option.textContent = charData.name || `Character ${index + 1}`;
        selector.appendChild(option);
    });

    selector.value = currentCharacterIndex; // Select the current character
}

/**
 * Toggles the visibility of a dropdown menu.
 * @param {string} menuId The ID of the dropdown menu element.
 */
export function toggleDropdown(menuId) {
    document.getElementById(menuId).classList.toggle('hidden');
}

/**
 * Toggles the visibility of the class dropdown menu.
 */
export function toggleClassDropdown() {
    toggleDropdown('class-dropdown-options');
}

/**
 * Toggles the visibility of the specialization dropdown menu.
 */
export function toggleSpecializationDropdown() {
    toggleDropdown('specialization-dropdown-options');
}

/**
 * Helper function to create table data (<td>) elements for inventory tables.
 * @param {string} element The HTML element tag (e.g., 'input', 'textarea', 'button').
 * @param {string|null} type The input type (e.g., 'text', 'number', 'checkbox').
 * @param {boolean} isClosed If the element is self-closing (e.g., <input>).
 * @param {string} dataInventoryType The inventory type ('weapon', 'armor', 'general').
 * @param {string|null} dataField The data field name (e.g., 'name', 'damage').
 * @param {number} dataIndex The index of the item in the inventory array.
 * @param {*} value The value to set for the input/textarea or inner HTML for button.
 * @param {string|null} cssClass Optional CSS class string.
 * @returns {string} The HTML string for the table data element.
 */
function quickTd(element, type, isClosed, dataInventoryType, dataField, dataIndex, value, cssClass) {
    let string = `<td><${element}`;

    if (type != null) {
        string += ` type="${type}"`;
    }

    string += ` data-inventory-type="${dataInventoryType}" data-field="${dataField}" data-index="${dataIndex}"`;

    if (cssClass != null) {
        string += ` class="${cssClass}"`;
    }

    if (!isClosed) {
        if (type !== 'checkbox') {
            string += ` value="${value}">`;
        } else {
            string += ` ${value}>`; // For checkboxes, value is 'checked' or ''
        }
    } else {
        string += `>${value}</${element}>`;
    }
    return string + '</td>';
}

/**
 * Renders the Weapon Inventory table.
 * @param {object} character The current character object.
 */
export function renderWeaponInventory(character) {
    const tbody = document.querySelector('#weapon-inventory-table tbody');
    if (!tbody) return;
    tbody.innerHTML = ''; // Clear existing rows

    character.weaponInventory.forEach((weapon, index) => {
        const row = tbody.insertRow();
        // Determine the displayed damage values based on the 'use' checkbox
        const displayDamage = weapon.use ? calculateFormula(weapon.originalDamage || weapon.damage) : weapon.damage;
        const displayMagicDamage = weapon.use ? calculateFormula(weapon.originalMagicDamage || weapon.magicDamage) : weapon.magicDamage;

        row.innerHTML = `
           ${quickTd('input', 'text', false, 'weapon', 'name', index, weapon.name, 'w-full')}
           ${quickTd('input', 'text', false, 'weapon', 'type', index, weapon.type, 'w-full')}
           ${quickTd('input', 'text', false, 'weapon', 'material', index, weapon.material, 'w-full')}
           ${quickTd('input', 'text', false, 'weapon', 'requirement', index, weapon.requirement, 'w-full')}
           ${quickTd('input', 'text', false, 'weapon', 'requiredStat', index, weapon.requiredStat, 'w-full')}
           ${quickTd('input', 'number', false, 'weapon', 'accuracy', index, weapon.accuracy, 'w-full')}
           ${quickTd('textarea', null, true, 'weapon', 'damage', index, displayDamage, 'w-full inventory-effect-textarea')}
           ${quickTd('textarea', null, true, 'weapon', 'magicDamage', index, displayMagicDamage, 'w-full inventory-effect-textarea')}
           ${quickTd('input', 'text', false, 'weapon', 'magicType', index, weapon.magicType, 'w-full')}
           ${quickTd('textarea', null, true, 'weapon', 'effect', index, weapon.effect, 'w-full inventory-effect-textarea')}
           ${quickTd('input', 'number', false, 'weapon', 'value', index, weapon.value, 'w-full')}
           ${quickTd('input', 'checkbox', false, 'weapon', 'use', index, weapon.use ? 'checked' : '', null)}
           ${quickTd('button', null, true, 'weapon', null, index, 'Remove', 'remove-item-btn bg-red-500 hover:bg-red-600')}
       `;

        // Set textarea values after they are in the DOM
        row.querySelector('textarea[data-field="damage"]').value = displayDamage;
        row.querySelector('textarea[data-field="magicDamage"]').value = displayMagicDamage;
        row.querySelector('textarea[data-field="effect"]').value = weapon.effect;
    });
}

/**
 * Renders the Armor Inventory table.
 * @param {object} character The current character object.
 */
export function renderArmorInventory(character) {
    const tbody = document.querySelector('#armor-inventory-table tbody');
    if (!tbody) return;
    tbody.innerHTML = ''; // Clear existing rows

    character.armorInventory.forEach((armor, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
           ${quickTd('input', 'text', false, 'armor', 'name', index, armor.name, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'location', index, armor.location, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'material', index, armor.material, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'requirement', index, armor.requirement, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'requiredStat', index, armor.requiredStat, 'w-full')}
           ${quickTd('input', 'number', false, 'armor', 'defense', index, armor.defense, 'w-full')}
           ${quickTd('input', 'number', false, 'armor', 'magicDefense', index, armor.magicDefense, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'magicType', index, armor.magicType, 'w-full')}
           ${quickTd('textarea', null, true, 'armor', 'effect', index, armor.effect, 'w-full inventory-effect-textarea')}
           ${quickTd('input', 'number', false, 'armor', 'value', index, armor.value, 'w-full')}
           ${quickTd('input', 'checkbox', false, 'armor', 'equipped', index, armor.equipped ? 'checked' : '', null)}
           ${quickTd('button', null, true, 'armor', null, index, 'Remove', 'remove-item-btn bg-red-500 hover:bg-red-600')}
       `;

        // Set textarea value after it's in the DOM
        row.querySelector('textarea[data-field="effect"]').value = armor.effect;
    });
}

/**
 * Renders the General Inventory table.
 * @param {object} character The current character object.
 */
export function renderGeneralInventory(character) {
    const tbody = document.querySelector('#general-inventory-table tbody');
    if (!tbody) return;
    tbody.innerHTML = ''; // Clear existing rows

    character.generalInventory.forEach((item, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
           ${quickTd('input', 'text', false, 'general', 'name', index, item.name, 'w-full')}
           ${quickTd('input', 'text', false, 'general', 'type', index, item.type, 'w-full')}
           ${quickTd('textarea', null, true, 'general', 'effect', index, item.effect, 'w-full inventory-effect-textarea')}
           ${quickTd('input', 'number', false, 'general', 'accuracy', index, item.accuracy, 'w-full')}
           ${quickTd('input', 'number', false, 'general', 'amount', index, item.amount, 'w-full')}
           ${quickTd('input', 'number', false, 'general', 'valuePerUnit', index, item.valuePerUnit, 'w-full')}
           ${quickTd('button', null, true, 'general', null, index, 'Remove', 'remove-item-btn bg-red-500 hover:bg-red-600')}
       `;

        // Set textarea value after it's in the DOM
        row.querySelector('textarea[data-field="effect"]').value = item.effect;
    });
}

/**
 * Attaches event listeners to the dynamically created clear buttons for stat choices.
 * @param {string} query The CSS selector for the clear buttons.
 */
function attachClearChoiceListeners(query) {
    document.querySelectorAll(query).forEach(button => {
        button.onclick = (event) => {
            const choiceId = event.target.dataset.choiceId;
            const selectElement = document.getElementById(choiceId);
            if (selectElement) {
                selectElement.value = ''; // Set dropdown to empty
                // Manually trigger the change event to clear the choice
                selectElement.dispatchEvent(new Event('change'));
            }
        };
    });
}

/**
 * Renders the UI for Demi-human specific stat choices.
 * This function creates and updates the dropdowns for applying stat modifiers.
 * @param {object} character The current character object.
 * @param {function} showStatusMessage Callback to display status messages.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function renderDemiHumanStatChoiceUI(character, showStatusMessage, saveCurrentStateToHistory) {
    const demiHumanChoicesContainer = document.getElementById('racial-passives-container');
    if (!demiHumanChoicesContainer) return;

    const demiHumanPassives = ExternalDataManager.getRaceManualPassives('Demi-humans');
    const category = 'Demi-humans';
    const passiveName = 'Stat Adjustments';

    if (character.race === category && demiHumanPassives && demiHumanPassives.choices) {
        demiHumanChoicesContainer.classList.remove('hidden');
        demiHumanChoicesContainer.innerHTML = `
           <h4 class="text-md font-semibold text-gray-800 dark:text-gray-200 mb-2">Demi-human Stat Adjustments</h4>
           <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${demiHumanPassives.description}</p>
           <div id="demi-human-modifiers-list" class="space-y-3">
               <!-- Modifiers will be dynamically added here -->
           </div>
       `;

        const modifiersList = document.getElementById('demi-human-modifiers-list');

        // Ensure the nested structure exists for Demi-humans
        character.StatChoices[category] = character.StatChoices[category] || {};
        character.StatChoices[category][passiveName] = character.StatChoices[category][passiveName] || {};
        character.StatsAffected[category] = character.StatsAffected[category] || {};
        character.StatsAffected[category][passiveName] = character.StatsAffected[category][passiveName] || {};


        demiHumanPassives.choices.forEach((modifier, modIndex) => {
            for (let i = 0; i < modifier.count; i++) {
                const slotId = `demihuman-${modifier.type}-${modIndex}-${i}`; // Unique ID for each choice slot
                const currentChoice = character.StatChoices[category][passiveName][slotId];
                const selectedStatName = currentChoice ? currentChoice.statName : '';

                const choiceDiv = document.createElement('div');
                choiceDiv.className = 'flex items-center space-x-2';
                choiceDiv.innerHTML = `
                   <label for="${slotId}" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-36">${modifier.label}</label>
                   <select id="${slotId}" class="stat-choice-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                       <option value="">-- Select a Stat --</option>
                   </select>
                   ${selectedStatName ? `<button type="button" data-choice-id="${slotId}" class="clear-demi-human-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>` : ''}
               `;
                modifiersList.appendChild(choiceDiv);

                const selectElement = choiceDiv.querySelector(`#${slotId}`);
                modifier.applicableStats.forEach(statName => {
                    const option = document.createElement('option');
                    option.value = statName;
                    option.textContent = statName;
                    // Disable if already chosen by another slot, or if this is not the currently selected stat for this slot
                    const isAlreadyChosen = character.StatsAffected[category][passiveName][statName] && character.StatsAffected[category][passiveName][statName].size > 0 && !character.StatsAffected[category][passiveName][statName].has(slotId);
                    option.disabled = isAlreadyChosen;
                    selectElement.appendChild(option);
                });
                selectElement.value = selectedStatName;

                // Add event listener
                selectElement.addEventListener('change', (e) => {
                    handleDemiHumanStatChoice(character, category, passiveName, slotId, modifier.type, modifier.calc, modifier.value, e.target.value, modifier.label, showStatusMessage, updateDOM, saveCurrentStateToHistory);
                });
            }
        });
    } else {
        demiHumanChoicesContainer.classList.add('hidden');
        demiHumanChoicesContainer.innerHTML = ''; // Clear content when hidden
    }
    attachClearChoiceListeners('.clear-demi-human-choice-btn'); // Attach listeners for clear buttons
}

/**
 * Renders the UI for Mutant specific stat choices (Mutation & Degeneration).
 * @param {object} character The current character object.
 * @param {function} showStatusMessage Callback to display status messages.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function renderMutantOptionUI(character, showStatusMessage, saveCurrentStateToHistory) {
    const MutantOptionsContainer = document.getElementById('racial-passives-container');
    if (!MutantOptionsContainer) return;

    const mutantPassives = ExternalDataManager.getRaceManualPassives('Mutant');
    const category = 'Mutant';

    if (character.race === category && mutantPassives && mutantPassives.abilities) {
        MutantOptionsContainer.classList.remove('hidden');
        MutantOptionsContainer.innerHTML = `
           <h4 class="text-md font-semibold text-gray-800 dark:text-gray-200 mb-2">Mutant Abilities: Mutation & Degeneration</h4>
           <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${mutantPassives.description}</p>
           <div id="mutant-abilities-list" class="space-y-4">
               <!-- Mutation and Degeneration choices will be dynamically added here -->
           </div>
       `;

        const abilitiesList = document.getElementById('mutant-abilities-list');
        const currentLevel = character.level;

        // Ensure the nested structure exists for Mutant
        character.StatChoices[category] = character.StatChoices[category] || {};
        character.StatsAffected[category] = character.StatsAffected[category] || {};

        // Helper to get available points for a type at current level
        const getAvailablePoints = (abilityType) => {
            const levels = mutantPassives.abilities[abilityType].levels;
            const levelKeys = Object.keys(levels).map(Number).sort((a, b) => a - b);
            let points = 0;
            for (const levelThreshold of levelKeys) {
                if (currentLevel >= levelThreshold) {
                    points = levels[levelThreshold];
                } else {
                    break;
                }
            }
            return points;
        };

        // Iterate over each ability (Mutation, Degeneration)
        for (const abilityKey in mutantPassives.abilities) {
            const abilityData = mutantPassives.abilities[abilityKey];
            const maxChoices = getAvailablePoints(abilityKey);
            const options = abilityData.options;
            const passiveName = abilityKey; // e.g., "Mutation", "Degeneration"

            // Ensure nested structure for this passive name
            character.StatChoices[category][passiveName] = character.StatChoices[category][passiveName] || {};
            character.StatsAffected[category][passiveName] = character.StatsAffected[category][passiveName] || {};

            for (let i = 0; i < maxChoices; i++) {
                const slotId = `mutant-${abilityKey.toLowerCase()}-${i}`;
                const currentChoice = character.StatChoices[category][passiveName][slotId];
                const selectedOptionType = currentChoice ? currentChoice.type : '';
                const selectedStatName = currentChoice && currentChoice.statName ? currentChoice.statName : '';
                // Find the full data for the currently selected option type
                const selectedOptionData = options.find(opt => opt.type === selectedOptionType);
                const applicableStatsLength = selectedOptionData && selectedOptionData.applicableStats ? selectedOptionData.applicableStats.length : 0;
                const needsStatSelection = applicableStatsLength > 0;

                const choiceDiv = document.createElement('div');
                choiceDiv.className = 'flex flex-col space-y-1 p-2 border border-gray-200 dark:border-gray-700 rounded-md';

                let statSelectionHtml = '';

                if (needsStatSelection) {
                    const hide = applicableStatsLength === 1 ? 'hidden' : '';
                    statSelectionHtml = `
                       <div id="${slotId}-stat-selection" class="flex items-center space-x-2 ${hide}">
                           <label for="${slotId}-stat" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">Target Stat:</label>
                           <select id="${slotId}-stat" class="mutant-choice-stat-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                               <option value="">-- Select a Stat --</option>
                           </select>
                       </div>
                   `;
                }

                choiceDiv.innerHTML = `
                   <div class="flex items-center space-x-2">
                       <label for="${slotId}-type" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">${abilityKey} ${i + 1}:</label>
                       <select id="${slotId}-type" class="mutant-choice-type-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                           <option value="">-- Select ${abilityKey} Type --</option>
                           ${options.map(opt => `<option value="${opt.type}" ${opt.type === selectedOptionType ? 'selected' : ''}>${opt.label}</option>`).join('')}
                       </select>
                       <button type="button" data-choice-id="${slotId}-type" data-category="${category}" data-passive-name="${passiveName}" class="clear-mutant-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>
                   </div>
                   ${statSelectionHtml}
               `;
                abilitiesList.appendChild(choiceDiv);

                const typeSelect = choiceDiv.querySelector(`#${slotId}-type`);
                const statSelectionDiv = choiceDiv.querySelector(`#${slotId}-stat-selection`);
                const statSelect = choiceDiv.querySelector(`#${slotId}-stat`);

                // Populate stat dropdown if needed on initial render
                if (statSelect && needsStatSelection) {
                    selectedOptionData.applicableStats.forEach(statName => {
                        const option = document.createElement('option');
                        option.value = statName;
                        option.textContent = statName;
                        const isAlreadyChosen = character.StatsAffected[category][passiveName][statName] && character.StatsAffected[category][passiveName][statName].size > 0 && !character.StatsAffected[category][passiveName][statName].has(slotId);
                        option.disabled = isAlreadyChosen;
                        statSelect.appendChild(option);
                    });
                    statSelect.value = selectedStatName;
                }

                // Event listener for type change (to show/hide stat selection)
                if (typeSelect) {
                    typeSelect.addEventListener('change', (e) => {
                        const newType = e.target.value;
                        const newSelectedOptionData = options.find(opt => opt.type === newType);
                        const newApplicableStatsLength = newSelectedOptionData && newSelectedOptionData.applicableStats ? newSelectedOptionData.applicableStats.length : 0;
                        const newNeedsStatSelection = newSelectedOptionData && newApplicableStatsLength > 0;

                        if (statSelectionDiv) {
                            if (newNeedsStatSelection) {
                                if (newApplicableStatsLength > 1) {
                                    statSelectionDiv.classList.remove('hidden');
                                }

                                // Repopulate stat dropdown for this specific select
                                statSelect.innerHTML = '<option value="">-- Select a Stat --</option>';
                                newSelectedOptionData.applicableStats.forEach(statName => {
                                    const option = document.createElement('option');
                                    option.value = statName;
                                    option.textContent = statName;
                                    const isAlreadyChosen = character.StatsAffected[category][passiveName][statName] && character.StatsAffected[category][passiveName][statName].size > 0 && !character.StatsAffected[category][passiveName][statName].has(slotId);
                                    option.disabled = isAlreadyChosen;
                                    statSelect.appendChild(option);
                                });

                                // Keep current selection if valid, otherwise clear
                                statSelect.value = selectedStatName && newSelectedOptionData.applicableStats.includes(selectedStatName) ? selectedStatName : '';
                            } else {
                                statSelectionDiv.classList.add('hidden');
                                if (statSelect) statSelect.value = ''; // Clear stat selection if type changes away from stat
                            }
                        }

                        handleMutantOption(
                            character,
                            category,
                            passiveName,
                            slotId,
                            newType,
                            newApplicableStatsLength === 1 ? newSelectedOptionData.applicableStats[0] : (statSelect ? statSelect.value : null),
                            newSelectedOptionData ? newSelectedOptionData.calc : null,
                            newSelectedOptionData ? newSelectedOptionData.value : null,
                            newSelectedOptionData ? newSelectedOptionData.label : '',
                            showStatusMessage, updateDOM, saveCurrentStateToHistory);
                    });
                }


                // Event listener for stat change
                if (statSelect) {
                    statSelect.addEventListener('change', (e) => {
                        const currentType = typeSelect.value;
                        const currentSelectedOptionData = options.find(opt => opt.type === currentType); // Get the full option data
                        handleMutantOption(
                            character,
                            category,
                            passiveName,
                            slotId,
                            currentType,
                            e.target.value,
                            currentSelectedOptionData ? currentSelectedOptionData.calc : null,
                            currentSelectedOptionData ? currentSelectedOptionData.value : null,
                            currentSelectedOptionData ? currentSelectedOptionData.label : '',
                            showStatusMessage, updateDOM, saveCurrentStateToHistory
                        );
                    });
                }
            }
        }

    } else {
        MutantOptionsContainer.classList.add('hidden');
        MutantOptionsContainer.innerHTML = ''; // Clear content when hidden
    }
    attachClearChoiceListeners('.clear-mutant-choice-btn'); // Attach listeners for clear buttons
}

/**
 * Renders the generic racial passives for races that don't have manual choices.
 * @param {object} character The current character object.
 */
export function renderGenericRacialPassives(character) {
    const genericPassivesContainer = document.getElementById('racial-passives-container');
    if (!genericPassivesContainer) return;

    // Clear previous content
    genericPassivesContainer.innerHTML = '';
    genericPassivesContainer.classList.add('hidden'); // Hide by default

    const raceManualPassives = ExternalDataManager.getRaceManualPassives(character.race);

    if (character.race !== 'Demi-humans' && character.race !== 'Mutant' && raceManualPassives && raceManualPassives.choices && raceManualPassives.choices.length === 0) {
        // This condition is for races explicitly defined in manual_passives_data.json but with no manual choices
        genericPassivesContainer.classList.remove('hidden');
        genericPassivesContainer.innerHTML = `<p class="text-sm text-gray-600 dark:text-gray-400">${raceManualPassives.description || 'This race has no specific manually assigned passives.'}</p>`;
    } else if (!raceManualPassives) {
        // This condition is for races not defined in manual_passives_data.json at all
        genericPassivesContainer.classList.remove('hidden');
        genericPassivesContainer.innerHTML = '<p class="text-sm text-gray-600 dark:text-gray-400">This race has no specific manually assigned passives.</p>';
    }
    // If it's Demi-humans or Mutant, or if it has manual choices, this function won't render anything,
    // as their specific render functions will handle it.
}

/**
 * Orchestrates the rendering of all racial passive sections based on the current race.
 * @param {object} character The current character object.
 * @param {function} showStatusMessage Callback to display status messages.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function renderRacialPassives(character, showStatusMessage, saveCurrentStateToHistory) {
    // Hide all specific containers first
    document.getElementById('racial-passives-container').classList.add('hidden');

    // Then render the appropriate one
    if (character.race === 'Demi-humans') {
        renderDemiHumanStatChoiceUI(character, showStatusMessage, saveCurrentStateToHistory);
    } else if (character.race === 'Mutant') {
        renderMutantOptionUI(character, showStatusMessage, saveCurrentStateToHistory);
    } else {
        renderGenericRacialPassives(character);
    }
}

/**
 * Updates the specialization dropdown options and filters selected specializations.
 * @param {object} character The current character object.
 */
export function updateSpecializationDropdownAndData(character) {
    const specializationDisplayInput = document.getElementById('specialization-display');
    const specializationDropdownOptions = document.getElementById('specialization-dropdown-options');

    // 1. Determine available specializations based on selected classes
    const availableSpecializationsSet = new Set();
    character.class.forEach(selectedClass => {
        const specs = ExternalDataManager.getClassSpecs(selectedClass);
        if (specs) {
            specs.forEach(spec => availableSpecializationsSet.add(selectedClass + "→" + spec));
        }
    });
    const availableSpecializations = Array.from(availableSpecializationsSet).sort();

    // 2. Filter character.specialization to keep only valid ones
    character.specialization = character.specialization.filter(spec => availableSpecializations.includes(spec));

    // 3. Update the displayed value for specializations
    specializationDisplayInput.value = character.specialization.join(', ');

    // 4. Populate and update checkboxes in the dropdown options
    specializationDropdownOptions.innerHTML = ''; // Clear existing options
    if (availableSpecializations.length === 0) {
        specializationDropdownOptions.innerHTML = '<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No specializations available for selected classes.</div>';
    } else {
        availableSpecializations.forEach(specName => {
            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md';
            checkboxDiv.innerHTML = `
               <input
                   type="checkbox"
                   id="specialization-${specName.replace(/\s/g, '-')}"
                   name="specialization-option"
                   value="${specName}"
                   class="form-checkbox h-4 w-4 text-indigo-600 dark:text-indigo-400 rounded border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
                   ${character.specialization.includes(specName) ? 'checked' : ''}
               />
               <label for="specialization-${specName.replace(/\s/g, '-')}" class="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">${specName}</label>
           `;
            specializationDropdownOptions.appendChild(checkboxDiv);
        });
    }
}


/**
 * Updates the DOM elements with the current character data.
 * @param {object} character The current character object.
 */
export function updateDOM(character) {
    // Basic Info
    document.getElementById('name').value = character.name;
    document.getElementById('level').value = character.level;
    document.getElementById('levelExperience').value = character.levelExperience;
    document.getElementById('levelMaxExperience').value = character.levelMaxExperience; // This is readonly

    // Handle race selector placeholder color and update max Health
    const raceSelect = document.getElementById('race');
    raceSelect.value = character.race; // Set the selected race
    if (character.race === '') {
        raceSelect.classList.add('select-placeholder-text');
    } else {
        raceSelect.classList.remove('select-placeholder-text');
    }

    recalculateUpdate(character); // Ensure data is up-to-date before rendering

    // Update Health, Mana, Racial Power display after recalculation
    document.getElementById('maxHealth').value = character.maxHealth;
    document.getElementById('Health').value = character.Health.value;
    document.getElementById('maxMana').value = character.maxMana;
    document.getElementById('Mana').value = character.Mana.value;
    document.getElementById('maxRacialPower').value = character.maxRacialPower;
    document.getElementById('racialPower').value = character.racialPower;


    // Handle custom multi-select for class
    const classDisplayInput = document.getElementById('class-display');
    const classDropdownOptions = document.getElementById('class-dropdown-options');

    // Set the displayed value for classes
    classDisplayInput.value = character.class.join(', ');

    // Populate and update checkboxes in the dropdown options
    classDropdownOptions.innerHTML = ''; // Clear existing options
    const classes = Object.keys(ExternalDataManager._data.Classes);
    classes.forEach(className => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md';
        checkboxDiv.innerHTML = `
           <input
               type="checkbox"
               id="class-${className.replace(/\s/g, '-')}"
               name="class-option"
               value="${className}"
               class="form-checkbox h-4 w-4 text-indigo-600 dark:text-indigo-400 rounded border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
               ${character.class.includes(className) ? 'checked' : ''}
           />
           <label for="class-${className.replace(/\s/g, '-')}" class="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">${className}</label>
       `;
        classDropdownOptions.appendChild(checkboxDiv);
    });

    // Update Specialization dropdown
    updateSpecializationDropdownAndData(character);

    // Render racial passives based on selected race
    renderRacialPassives(character, showStatusMessage, window.saveCurrentStateToHistory);


    // Player Stats
    const playerStatsContainer = document.getElementById('player-stats-container').querySelector('tbody');
    playerStatsContainer.innerHTML = ''; // Clear existing rows

    ExternalDataManager.rollStats.forEach(statName => {
        const statData = character[statName];
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700'; // Add hover effect to rows
        row.innerHTML = `
           <td class="px-2 py-1 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">${statName}</td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-value" name="${statName}-value" min="0" value="${statData.value}" class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-racialChange" name="${statName}-racialChange" value="${getAppliedRacialChange(character, statName)}" readonly class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-equipment" name="${statName}-equipment" value="${statData.equipment}" class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-temporary" name="${statName}-temporary" value="${statData.temporary}" class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <div class="flex items-center justify-center exp-inputs-wrapper">
                   <input type="number" id="${statName}-experience" name="${statName}-experience" min="0" value="${statData.experience}" class="stat-input rounded-r-none" />
                   <span class="px-1 py-1 border-y border-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">/</span>
                   <input type="number" id="${statName}-maxExperience" name="${statName}-maxExperience" min="1" value="${statData.maxExperience}" readonly class="stat-input rounded-l-none" />
               </div>
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-total" name="${statName}-total" value="${calculateTotal(statData, character, statName)}" readonly class="stat-input" />
           </td>
       `;
        playerStatsContainer.appendChild(row);
    });


    // Health & Combat
    document.getElementById('healthBonus').value = character.healthBonus; // Populate the separate healthBonus input
    document.getElementById('ac').value = character.ac; // Populate total armor (readonly)
    document.getElementById('armorBonus').value = character.armorBonus; // Populate armor bonus


    // Skills
    document.getElementById('skills').value = character.skills;

    // Render new inventory tables
    renderWeaponInventory(character);
    renderArmorInventory(character);
    renderGeneralInventory(character);

    // Update section visibility
    updateSectionVisibility(character);

    // Update history button states after DOM update
    window.updateHistoryButtonsState();
}

/**
 * Updates the enabled/disabled state of the Google Drive buttons and status text.
 * @param {boolean} gapiInited Flag indicating if GAPI is initialized.
 * @param {boolean} gisInited Flag indicating if GIS is initialized.
 * @param {object} gapiClientToken The current Google API client token.
 * @param {string} GOOGLE_DRIVE_AUTH_STATUS_KEY The key for local storage.
 */
export function maybeEnableGoogleDriveButtons(gapiInited, gisInited, gapiClientToken, GOOGLE_DRIVE_AUTH_STATUS_KEY) {
    if (gapiInited && gisInited) {
        authorizeGoogleDriveButton.disabled = false;
        const currentToken = gapiClientToken;
        const wasAuthorizedInLocalStorage = localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true';

        if (currentToken) {
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized';
            authorizeGoogleDriveButton.classList.add('hidden');
            signoutGoogleDriveButton.classList.remove('hidden');
            localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true');
        } else if (wasAuthorizedInLocalStorage) {
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized (Session Expired)';
            authorizeGoogleDriveButton.classList.remove('hidden');
            signoutGoogleDriveButton.classList.remove('hidden');
        } else {
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Not Authorized';
            authorizeGoogleDriveButton.classList.remove('hidden');
            signoutGoogleDriveButton.classList.add('hidden');
        }
    }
}

export { googleDriveModal, googleDriveFileList, googleDriveModalStatus, showConfirmationModal, authorizeGoogleDriveButton, signoutGoogleDriveButton };