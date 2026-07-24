import { MIN_STAT_VALUE, MAX_STAT_VALUE } from './constants.js';
import { ExternalDataManager } from '../externalDataManager.js';
import { showConfirmationModal, updateRemainingPointsDisplay, renderTemporaryEffects, refreshTemporaryModalTitle, renderSpecializations, updateSpecializationDropdownAndData,
    getCharacterStatesActive, updateDOM, showStatusMessage, quickRollStats, distributeStats, addManualTemporaryEffect, closeTemporaryEffectsModal, endTurn, toggleSidebar,
    updatePanelsPosition, closeDamageModal, takeDamage, setTempEffectsStatContext, openTemporaryEffectsModal, toggleSection,
    openDirectAddEffectModal, closeDirectAddEffectModal, handleDirectAddEffectSubmit
 } from './uiUtils.js';
import {recalculateSmallUpdateCharacter, recalculateCharacterDerivedProperties, defaultCharacterData, populateCharacterSelector, saveCurrentStateToHistory, saveCharacterToFile,
    loadCharacterFromFile, switchCharacter, addNewCharacter, revertCurrentCharacter, forwardCurrentCharacter, populateRaceSelector, handleChangeRace, startAutoHistorySaver, levelUp
  } from './characterState.js';
import { character, characters, setCharacters, currentCharacterIndex, setCurrentCharacterIndex, setHistoryStack, setHistoryPointer, hasUnsavedChanges, setHasUnsavedChanges, setCurrentGoogleDriveFileId } from './state.js';
import { ensureMagicElements, handleRequiredStatClick, renderArmorTable, renderWeaponTable, renderEquippedSummaries, handleInventoryInputChange, rollAllActiveWeapons, rollAllEquippedArmor, renderWeaponCards, renderArmorCards, renderGeneralCards, setInventoryView, rollWeaponAtIndex, rollArmorAtIndex, toggleAllCards, sortInventory, inventorySortSettings } from './inventory.js';
import { calculateRollStatTotal, calculateLevelMaxExperience, roll  } from './formulas.js';
import { renderRacial, removePassivesLevel, renderGenericClassesPassives } from './passivesActives.js';
import { saveCharacterToGoogleDrive, loadCharacterFromGoogleDrive, handleGoogleDriveAuthClick, handleGoogleDriveSignoutClick, maybeEnableGoogleDriveButtons  } from './googleDrive.js';

// --- Dynamic Toast and Dice Rolling Logic ---
export function showToast(message, type = 'info') {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed bottom-5 right-5 z-[9999] flex flex-col gap-2 max-w-sm';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    const bgClass = type === 'success' 
        ? 'bg-emerald-600 dark:bg-emerald-500 text-white' 
        : type === 'error' 
            ? 'bg-rose-600 dark:bg-rose-500 text-white' 
            : 'bg-indigo-600 dark:bg-indigo-500 text-white';
            
    toast.className = `px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold transition-all duration-300 transform translate-y-4 opacity-0 ${bgClass}`;
    
    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'roll') icon = '🎲';
    
    if (type === 'roll') {
        toast.className = `px-4 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm font-semibold transition-all duration-300 transform translate-y-4 opacity-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white border border-indigo-500/20`;
    }

    toast.innerHTML = `
        <span class="text-base">${icon}</span>
        <div class="flex-grow">${message}</div>
    `;

    toastContainer.appendChild(toast);

    // Fade in
    setTimeout(() => {
        toast.classList.remove('translate-y-4', 'opacity-0');
        toast.classList.add('translate-y-0', 'opacity-100');
    }, 10);

    // Fade out and remove
    setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 4000);
}

/**
 * Handles clicks for adding or removing magic elements on weapon and armor cards/tables.
 * @param {Event} event The click event.
 * @returns {boolean} Whether an action was handled.
 */
export function handleMagicElementClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return false;

    const action = target.dataset.action;
    if (action === 'add-magic-element') {
        const inventoryType = target.dataset.inventoryType;
        const itemIndex = parseInt(target.dataset.index);
        const inventory = character[`${inventoryType}Inventory`];
        if (inventory && inventory[itemIndex]) {
            ensureMagicElements(inventory[inventoryType === 'weapon' ? itemIndex : itemIndex], inventoryType);
            inventory[itemIndex].magicElements.push({
                element: '',
                damage: '',
                defense: 0
            });
            setHasUnsavedChanges(true);
            if (inventoryType === 'weapon') {
                renderWeaponTable();
            } else if (inventoryType === 'armor') {
                recalculateSmallUpdateCharacter(character, true);
                renderArmorTable();
            }
        }
        return true;
    }

    if (action === 'remove-magic-element') {
        const inventoryType = target.dataset.inventoryType;
        const itemIndex = parseInt(target.dataset.index);
        const meIndex = parseInt(target.dataset.meIndex);
        const inventory = character[`${inventoryType}Inventory`];
        if (inventory && inventory[itemIndex]) {
            ensureMagicElements(inventory[itemIndex], inventoryType);
            inventory[itemIndex].magicElements.splice(meIndex, 1);
            setHasUnsavedChanges(true);
            if (inventoryType === 'weapon') {
                renderWeaponTable();
            } else if (inventoryType === 'armor') {
                recalculateSmallUpdateCharacter(character, true);
                renderArmorTable();
            }
        }
        return true;
    }
    return false;
}

/**
 * Handles input changes for player stats.
 * @param {Event} event The input event.
 */
export function handlePlayerStatInputChange(event) {
    const { name, value, type, dataset, checked } = event.target;
    let newValue = (type === 'number') ? (parseFloat(value) || 0) : value;

    let statName = '';
    let subProperty = '';

    // Determine if it's a main stat input or a temporary effect input
    if (dataset.statName && dataset.effectIndex !== undefined) {
        statName = dataset.statName;
        subProperty = dataset.field; // 'value', 'duration', 'type', 'appliesTo', or 'isPercent' for temporary effects
        const effectIndex = parseInt(dataset.effectIndex);
        const category = dataset.category;
        const categoryTemporaryEffects = character[statName].temporaryEffects[category];

        if (categoryTemporaryEffects[effectIndex]) {
            if (subProperty === 'type' || subProperty === 'appliesTo') {
                categoryTemporaryEffects[effectIndex][subProperty] = value;
            } else if (subProperty === 'isPercent') { // Handle the isPercent checkbox
                categoryTemporaryEffects[effectIndex][subProperty] = checked;
            } else if (subProperty === 'isInfinite') { // Handle the infinite duration checkbox
                if (checked) {
                    if (categoryTemporaryEffects[effectIndex].duration !== Infinity) {
                        categoryTemporaryEffects[effectIndex].previousDuration = categoryTemporaryEffects[effectIndex].duration || 1;
                    }
                    categoryTemporaryEffects[effectIndex].duration = Infinity;
                    categoryTemporaryEffects[effectIndex].isInfinite = true;
                } else {
                    const restoredDuration = categoryTemporaryEffects[effectIndex].previousDuration || 1;
                    categoryTemporaryEffects[effectIndex].duration = restoredDuration;
                    categoryTemporaryEffects[effectIndex].isInfinite = false;
                }
            } else if (subProperty === 'duration') {
                const durVal = parseFloat(value) || 1;
                categoryTemporaryEffects[effectIndex].duration = durVal;
                categoryTemporaryEffects[effectIndex].previousDuration = durVal;
                categoryTemporaryEffects[effectIndex].isInfinite = false;
            } else if (subProperty === 'name') {
                categoryTemporaryEffects[effectIndex][subProperty] = value;
            } else if (subProperty === 'values') {
                categoryTemporaryEffects[effectIndex][subProperty] = [newValue];
            } else {
                categoryTemporaryEffects[effectIndex][subProperty] = newValue;
            }
            
            // Re-render the temporary effects list and update the stat total immediately
            renderTemporaryEffects(statName); // This will now preserve focus
            // If the stat is Health, Mana, RacialPower, totalDefense, or totalMagicDefense, recalculate its value
            if (statName === 'Health' || statName === 'Mana' || statName === 'RacialPower' || statName === 'totalDefense' || statName === 'totalMagicDefense') {
                recalculateSmallUpdateCharacter(character, true); // Update max values and their DOM elements
            } else { // For rollStats, update their total
                document.getElementById(`${statName}-total`).value = calculateRollStatTotal(character, statName);
            }
            setHasUnsavedChanges(true);
            refreshTemporaryModalTitle();
        }
        return; // Exit as it's a temporary effect input
    }


    for (const stat of ExternalDataManager.rollStats) {
        if (name.startsWith(`${stat}-`)) {
            statName = stat;
            subProperty = name.substring(stat.length + 1);
            break;
        }
    }

    // Also check for Health, Mana, RacialPower, totalDefense, and totalMagicDefense as they are now handled similarly for temporary effects
    if (!statName && (name.startsWith('Health') || name.startsWith('Mana') || name.startsWith('RacialPower') || name.startsWith('totalDefense') || name.startsWith('totalMagicDefense'))) {
        statName = name.split('-')[0]; // Get 'Health', 'Mana', 'RacialPower', 'totalDefense'
        subProperty = name.substring(statName.length + 1); // Get 'value' if applicable
    }


    if (!statName) return; // Not a player stat input

    if (subProperty === 'experience') {
        character[statName].experience = newValue;

        if(character[statName].experience < 0) {
            if (character[statName].experienceBonus == 0)
                character[statName].experience = 0;

            // Ensure experienceBonus doesn't go below 0
            while (character[statName].experience < 0) {
                character[statName].experienceBonus--;
                character[statName].experience += character[statName].maxExperience;
                character[statName].experienceBonus = Math.max(0, character[statName].experienceBonus);
            }
        }
        else {
            // If experience reaches or exceeds maxExperience, increment experienceBonus
            while (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
                character[statName].experienceBonus++; // Increment experienceBonus instead of value
                character[statName].experience -= character[statName].maxExperience;
            }
        }

        document.getElementById(`${statName}-value`).value = character[statName].baseValue + character[statName].experienceBonus; // Update displayed value
        document.getElementById(`${statName}-experience`).value = character[statName].experience;
    } else if (subProperty === 'maxExperience') {
        character[statName].maxExperience = Math.max(1, newValue);
        document.getElementById(`${statName}-maxExperience`).value = character[statName].maxExperience;
        while (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
            character[statName].experienceBonus++; // Increment experienceBonus instead of value
            character[statName].experience -= character[statName].maxExperience;
        }
        document.getElementById(`${statName}-value`).value = character[statName].baseValue + character[statName].experienceBonus; // Update displayed value
        document.getElementById(`${statName}-experience`).value = character[statName].experience;
    } else if (subProperty === 'value' && character.isDistributingStats) {
        // When in distribution mode, the input affects baseValue, preserving experienceBonus
        const oldBaseValue = character[statName].baseValue;
        const currentExperienceBonus = character[statName].experienceBonus;

        // Calculate the target baseValue based on the new combined value input by the user
        let targetBaseValue = newValue - currentExperienceBonus;

        // Clamp the targetBaseValue to MIN_STAT_VALUE and MAX_STAT_VALUE
        targetBaseValue = Math.max(MIN_STAT_VALUE, Math.min(MAX_STAT_VALUE, targetBaseValue));

        const delta = targetBaseValue - oldBaseValue;

        if (character.remainingDistributionPoints - delta >= 0) {
            character.remainingDistributionPoints -= delta;
            character[statName].baseValue = targetBaseValue;
        } else {
            // If not enough points, set to max possible baseValue
            const maxPossibleIncrease = character.remainingDistributionPoints;
            if (maxPossibleIncrease > 0) {
                character[statName].baseValue = oldBaseValue + maxPossibleIncrease;
                character.remainingDistributionPoints = 0;
            }
            // Update the input field to reflect the actual combined value
            event.target.value = character[statName].baseValue + character[statName].experienceBonus;
        }
        updateRemainingPointsDisplay();
    } else if (subProperty === 'value' && !character.isDistributingStats) {
        // When NOT in distribution mode, direct input to the 'value' field should set the baseValue
        // The experienceBonus remains an additive bonus on top of this manually set baseValue.
        character[statName].baseValue = newValue - character[statName].experienceBonus;
        // Ensure baseValue doesn't go below MIN_STAT_VALUE if user tries to set it too low
        character[statName].baseValue = Math.max(MIN_STAT_VALUE, character[statName].baseValue);
        // Update the input field to reflect the actual combined value
        event.target.value = character[statName].baseValue + character[statName].experienceBonus;
    }
    else { // Handle other direct value changes for rollStats (e.g., equipment)
        character[statName][subProperty] = newValue;
    }

    // Recalculate and update total for rollStats, or max values for Health/Mana/RacialPower/totalDefense
    if (ExternalDataManager.rollStats.includes(statName)) {
        document.getElementById(`${statName}-total`).value = calculateRollStatTotal(character, statName);
    } else if (statName === 'Health' || statName === 'Mana' || statName === 'RacialPower' || statName === 'totalDefense') {
        recalculateSmallUpdateCharacter(character, true);
    }
    
    renderWeaponTable();
    setHasUnsavedChanges(true);
}

export function handleChange(event) {
    const { name, id, value, type, dataset, checked } = event.target;
    let newValue;

    if (dataset.inventoryType) {
        handleInventoryInputChange(event);
        if (event.type === 'change') {
            if (dataset.inventoryType === 'weapon') {
                renderWeaponTable();
            } else if (dataset.inventoryType === 'armor') {
                renderArmorTable();
            }
        } else {
            renderEquippedSummaries();
        }
    } else if (event.target.classList.contains('stat-input') || event.target.classList.contains('temp-effect-input')) {
        handlePlayerStatInputChange(event);
    } else {
        newValue = (type === 'number') ? (parseFloat(value) || 0) : value;

        if (id === 'levelExperience') {
            levelUp(newValue);
        } else if (id === 'level') {
            const oldLevel = character.level;
            character.level = newValue;
            character.levelMaxExperience = calculateLevelMaxExperience(character);
            const levelMaxExpEl = document.getElementById('levelMaxExperience');
            if (levelMaxExpEl) levelMaxExpEl.value = character.levelMaxExperience;
            if (newValue < oldLevel) removePassivesLevel();
            
            renderRacial();
            recalculateCharacterDerivedProperties(character, true);
        } else if (id === 'race') {
            let oldRace = character.race;
            character.race = newValue;
            const raceSelect = document.getElementById('race');
            if (newValue === '') {
                raceSelect.classList.add('select-placeholder-text');
            } else {
                raceSelect.classList.remove('select-placeholder-text');
            }
            handleChangeRace(oldRace);
        } else if (id === 'Health') {
            character.Health.value = Math.min(newValue, character.maxHealth);
            const el = document.getElementById('Health');
            if (el) el.value = character.Health.value;
        } else if (id === 'Mana') {
            character.Mana.value = Math.min(newValue, character.maxMana);
            const el = document.getElementById('Mana');
            if (el) el.value = character.Mana.value;
        } else if (id === 'RacialPower') {
            character.RacialPower.value = Math.min(newValue, character.maxRacialPower);
            const el = document.getElementById('RacialPower');
            if (el) el.value = character.RacialPower.value;
        } else if (id === 'totalDefense') {
            character.totalDefense.value = newValue;
            const el = document.getElementById('total-defense');
            if (el) el.value = character.totalDefense.value;
        } else if (id === 'personalNotes' || id === 'backstory') {
            if (character.layouts && character.layouts[id]) {
                character.layouts[id].text = newValue;
            }
        } else if (id === 'purse' || id === 'bank') {
            character[id] = newValue;
        } else if (id !== 'classes-display' && id !== 'specializations-display') {
            character[name || id] = newValue;
            if (id === 'name') {
                populateCharacterSelector();
            }
        }
    }
    setHasUnsavedChanges(true);
}

// Function to toggle the visibility of the class dropdown options
export function toggleClassDropdown() {
    const dropdown = document.getElementById('classes-dropdown-options');
    dropdown.classList.toggle('hidden');
}

// Function to toggle the visibility of the class dropdown options
export function toggleStateDropdown() {
    const dropdown = document.getElementById('state-dropdown-options');
    dropdown.classList.toggle('hidden');
}

// Function to toggle the visibility of the specializations dropdown options
export function toggleSpecializationDropdown() {
    const dropdown = document.getElementById('specializations-dropdown-options');
    dropdown.classList.toggle('hidden');
}

// Function to handle changes in the class checkboxes
export function handleClassCheckboxChange(event) {
    const { value, checked } = event.target;

    if (checked) {
        if (!character.classes.includes(value)) {
            character.classes.push(value);
        }
    } else {
        character.classes = character.classes.filter(c => c !== value);
    }
    // Update the displayed value in the input field
    document.getElementById('classes-display').value = character.classes.join(', ');

    // After class changes, update specializations dropdown
    updateSpecializationDropdownAndData();
    renderGenericClassesPassives();
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

// Function to handle changes in the state checkboxes
export function handleStateCheckboxChange(event) {
    const { value, checked } = event.target;

    character.states[value] = checked;

    // Update the displayed value in the input field
    document.getElementById('state-display').value = getCharacterStatesActive().join(', ');

    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

// Function to handle changes in the specializations checkboxes
export function handleSpecializationCheckboxChange(event) {
    const { value, checked } = event.target;
    const classe = event.target.dataset.classe;

    if (checked) {
        if (!character.specializations[classe]) {
            character.specializations[classe] = [];
        }

        if (!character.specializations[classe].includes(value)) {
            character.specializations[classe].push(value);
        }
    } else {
        character.specializations[classe] = character.specializations[classe].filter(s => s !== value);
    }

    renderSpecializations(character.specializations, Object.keys(ExternalDataManager.getAvailableSpecializations(character)));
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

// Function to toggle the personal notes panel visibility
export function togglePersonalNotesPanel() {
    const notesPanel = document.getElementById('personal-notes-panel');
    const personalNotesTextarea = document.getElementById('personalNotes');

    if (notesPanel.classList.contains('hidden')) {
        // Show panel: populate textarea with current notes
        personalNotesTextarea.value = character.layouts.personalNotes.text;
        notesPanel.classList.remove('hidden');
    } else {
        // Hide panel: save textarea content to character data
        character.layouts.personalNotes.text = personalNotesTextarea.value;
        notesPanel.classList.add('hidden');
        setHasUnsavedChanges(true); // Mark that there are unsaved changes
    }
}

export function saveHeightPositionAndSize(container) {
    if (container) {
        // Save position and size as percentages of the viewport
        character.layouts[container.id].height = container.offsetHeight / window.innerHeight;
        setHasUnsavedChanges(true); // Mark as unsaved
    }
}

/**
 * Saves the current position and size of the container to the character data.
 */
export function savePositionAndSize(container) {
    if (container) {
        // Save position and size as percentages of the viewport
        character.layouts.personalNotes.x = container.offsetLeft / window.innerWidth;
        character.layouts.personalNotes.y = container.offsetTop / window.innerHeight;
        character.layouts.personalNotes.width = container.offsetWidth / window.innerWidth;
        character.layouts.personalNotes.height = container.offsetHeight / window.innerHeight;
        setHasUnsavedChanges(true); // Mark as unsaved
    }
}

/**
 * Makes an element vertically resizable by dragging a handle.
 * @param {HTMLElement} element - The element to resize (textarea).
 * @param {HTMLElement} handle - The handle element that user drags.
 */
export function makeHeightResizable(element, handle) {
    let isResizing = false;
    let startY, startHeight;

    handle.addEventListener("mousedown", function (e) {
        e.preventDefault();
        isResizing = true;
        startY = e.clientY;
        startHeight = parseInt(window.getComputedStyle(element).height, 10);

        document.addEventListener("mousemove", resize);
        document.addEventListener("mouseup", stopResize);
    });

    function resize(e) {
        if (!isResizing) return;
        const newHeight = startHeight + (e.clientY - startY);
        element.style.height = Math.max(newHeight, 100) + "px"; // min height 100px
        element.style.resize = "none"; // prevent native resizer conflict
    }

    function stopResize() {
        isResizing = false;
        document.removeEventListener("mousemove", resize);
        document.removeEventListener("mouseup", stopResize);
        saveHeightPositionAndSize(element);
    }
}

export function makeResizable(element, handle) {
    handle.addEventListener("mousedown", function (e) {
        e.preventDefault();

        const startX = e.clientX;
        const startY = e.clientY;
        const startWidth = element.offsetWidth;
        const startHeight = element.offsetHeight;

        function resize(e) {
            const newWidth = Math.max(250, startWidth + (e.clientX - startX)); // Corrected direction for width
            const newHeight = Math.max(250, startHeight + (e.clientY - startY));

            element.style.width = newWidth + "px";
            element.style.height = newHeight + "px";
        }

        function stopResize() {
            window.removeEventListener("mousemove", resize);
            window.removeEventListener("mouseup", stopResize);
            savePositionAndSize(element);
        }

        window.addEventListener("mousemove", resize);
        window.addEventListener("mouseup", stopResize);
    });
}

// Draggable functionality for the personal notes panel
export function makeDraggable(element, handle) {
    let isDragging = false;
    let initialX;
    let initialY;

    handle.addEventListener("mousedown", dragStart);

    function dragStart(e) {
        // Get the current left and top values from the element's style,
        // or its offsetLeft/offsetTop if not explicitly set.
        // This ensures dragging starts from the current visual position.
        initialX = e.clientX - element.offsetLeft;
        initialY = e.clientY - element.offsetTop;

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
            // Calculate new position relative to the viewport
            const currentX = e.clientX - initialX;
            const currentY = e.clientY - initialY;

            // Apply directly to style.left and style.top
            element.style.left = `${currentX}px`;
            element.style.top = `${currentY}px`;
        }
    }

    function dragEnd(e) {
        isDragging = false;
        element.style.cursor = 'grab';
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", dragEnd);
        savePositionAndSize(element);
    }
}

// Functions to add new items to inventories
export function addWeapon() {
    character.weaponInventory.push({ name: '', type: '', material: '', requirement: '', requiredStat: '', accuracy: 100, damage: '', magicElements: [], effect: '', value: 0, use: false, originalDamage: '' });
    updateDOM(); // Re-render the inventory table
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

export function addArmor() {
    character.armorInventory.push({ name: '', location: '', material: '', requirement: '', requiredStat: '', defense: 0, magicElements: [], effect: '', value: 0, equipped: false });
    updateDOM(); // Re-render the inventory table
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

export function addGeneralItem() {
    character.generalInventory.push({ name: '', type: '', effect: '', accuracy: 0, amount: 0, valuePerUnit: 0 });
    updateDOM(); // Re-render the inventory table
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

// Function to remove an item from inventory
export function removeItem(event, targetBtn) {
    const btn = targetBtn || (event && event.target ? event.target.closest('.remove-item-btn, [data-inventory-type]') : null);
    if (!btn) return;

    const inventoryType = btn.dataset.inventoryType;
    const index = parseInt(btn.dataset.index, 10);

    if (isNaN(index)) return;

    if (inventoryType === 'weapon') {
        character.weaponInventory.splice(index, 1);
    } else if (inventoryType === 'armor') {
        character.armorInventory.splice(index, 1);
        recalculateSmallUpdateCharacter(character, true); // Recalculate totalDefense after removing armor
    } else if (inventoryType === 'general') {
        character.generalInventory.splice(index, 1);
    }
    updateDOM(); // Re-render the inventory table and cards
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

// Function to reset the current character to default data
export function newFile() {
    showConfirmationModal(`Are you sure you want to make a new file? ${hasUnsavedChanges ? 'All unsaved data will be lost.': ''}`, () => {
        setCurrentGoogleDriveFileId(null);
        setCharacters([defaultCharacterData()]);
        setCurrentCharacterIndex(0);

        updateDOM(); // Update the UI with the new default character
        populateCharacterSelector(); // Re-populate the character selector with the single sheet

        setHistoryStack([]); // Clear history after a full reset
        setHistoryPointer(-1); // Reset history pointer
        setHasUnsavedChanges(false); // Reset unsaved changes flag after reset

        showStatusMessage("Sheets reset successfully!");
    });
}

// Function to reset the current character to default data
export function resetCurrentCharacter() {
    showConfirmationModal("Are you sure you want to reset the current character? All data will be lost.", () => {
        characters[currentCharacterIndex] = defaultCharacterData();
        characters[currentCharacterIndex].name = `Character ${currentCharacterIndex + 1}`; // Keep current character name convention
        updateDOM();
        showStatusMessage("Current character reset successfully!");
        setHistoryStack([]); // Clear history after a full reset
        setHistoryPointer(-1); // Reset history pointer
        saveCurrentStateToHistory(); // Save the reset state as the first history entry
        setHasUnsavedChanges(false); // Reset unsaved changes flag after reset
        character.isDistributingStats = false; // Exit distribution mode on reset
        updateRemainingPointsDisplay(); // Reset remaining points display
    });
}

// Function to delete the current character
export function deleteCurrentCharacter() {
    if (characters.length === 1) {
        // If it's the last character, just reset it instead of deleting
        showConfirmationModal("Cannot delete the last character. It will be reset instead. Are you sure?", () => {
            resetCurrentCharacter();
            showStatusMessage("Cannot delete the last character. Character has been reset instead.", false);
        });
    }
    else {
        showConfirmationModal(`Are you sure you want to delete "${character.name || `Character ${currentCharacterIndex + 1}`}?" This action cannot be undone.`, () => {
            characters.splice(currentCharacterIndex, 1); // Remove the current character

            // Adjust currentCharacterIndex if the last character was deleted
            if (currentCharacterIndex >= characters.length) {
                setCurrentCharacterIndex(characters.length - 1)
            }

            updateDOM();
            populateCharacterSelector(); // Re-populate selector after deletion
            showStatusMessage("Character deleted successfully!");
            setHistoryStack([]); // Clear history after deletion
            setHistoryPointer(-1); // Reset history pointer
            saveCurrentStateToHistory(); // Save the new state as the first history entry
            setHasUnsavedChanges(false); //Reset unsaved changes flag after deletion
            character.isDistributingStats = false; // Exit distribution mode on delete
            updateRemainingPointsDisplay(); // Reset remaining points display
        });
    }
}

// Function to toggle dropdown visibility
export function toggleDropdown(menuId) {
    document.getElementById(menuId).classList.toggle('hidden');
}

export function isNotLocal() {
  const hostname = window.location.hostname;
  // Check for common local hostnames and IP addresses
  const localIdentifiers = [
    'localhost',
    '127.0.0.1',
    '[::1]' // IPv6 localhost address
  ];

  // If the hostname is not found in the localIdentifiers array, it's likely not local
  return !localIdentifiers.includes(hostname);
}

export function attachEventListeners() {
    const inputs = document.querySelectorAll(
        '#name, #level, #levelExperience, #race, #Health, #Mana, #RacialPower, #personalNotes, #total-defense, #backstory, #purse, #bank'
    );
    inputs.forEach(input => {
        if (!input.readOnly) {
            input.addEventListener('input', handleChange);
        }
    });

    const playerStatsContent = document.getElementById('player-stats-content');
    if (playerStatsContent) {
        playerStatsContent.addEventListener('input', function (event) {
            if (event.target.classList.contains('stat-input')) {
                handleChange(event);
            }
        });
    }

    const mainContent = document.getElementById('main-content');
    if (mainContent) {
        mainContent.addEventListener('click', function (event) {
            if (event.target.closest('.temp-effects-btn')) {
                const button = event.target.closest('.temp-effects-btn');
                const statName = button.dataset.statName;
                setTempEffectsStatContext(
                    statName,
                    button.dataset.statDisplayName,
                    button.dataset.statDisplayTotal
                );
                openTemporaryEffectsModal();
            }
        });
    }

    const classesDisplay = document.getElementById('classes-display');
    if (classesDisplay) classesDisplay.addEventListener('click', toggleClassDropdown);

    const stateDisplay = document.getElementById('state-display');
    if (stateDisplay) stateDisplay.addEventListener('click', toggleStateDropdown);

    const classesDropdownOptions = document.getElementById('classes-dropdown-options');
    if (classesDropdownOptions) {
        classesDropdownOptions.addEventListener('change', function (event) {
            if (event.target.type === 'checkbox' && event.target.name === 'class-option') {
                handleClassCheckboxChange(event);
            }
        });
    }

    const stateDropdownOptions = document.getElementById('state-dropdown-options');
    if (stateDropdownOptions) {
        stateDropdownOptions.addEventListener('change', function (event) {
            if (event.target.type === 'checkbox' && event.target.name === 'state-option') {
                handleStateCheckboxChange(event);
            }
        });
    }

    const specializationsDisplay = document.getElementById('specializations-display');
    if (specializationsDisplay) specializationsDisplay.addEventListener('click', toggleSpecializationDropdown);

    const specializationsDropdownOptions = document.getElementById('specializations-dropdown-options');
    if (specializationsDropdownOptions) {
        specializationsDropdownOptions.addEventListener('change', function (event) {
            if (event.target.type === 'checkbox' && event.target.name === 'specializations-option') {
                handleSpecializationCheckboxChange(event);
            }
        });
    }

    document.addEventListener('click', function (event) {
        const classDisplayInput = document.getElementById('classes-display');
        const classDropdownOptions = document.getElementById('classes-dropdown-options');
        const specializationDisplayInput = document.getElementById('specializations-display');
        const specializationDropdownOptions = document.getElementById('specializations-dropdown-options');
        const saveDropdownBtn = document.getElementById('save-dropdown-btn');
        const saveDropdownMenu = document.getElementById('save-dropdown-menu');
        const loadDropdownBtn = document.getElementById('load-dropdown-btn');
        const loadDropdownMenu = document.getElementById('load-dropdown-menu');

        if (classDisplayInput && classDropdownOptions && !classDisplayInput.contains(event.target) && !classDropdownOptions.contains(event.target)) {
            classDropdownOptions.classList.add('hidden');
        }
        if (specializationDisplayInput && specializationDropdownOptions && !specializationDisplayInput.contains(event.target) && !specializationDropdownOptions.contains(event.target)) {
            specializationDropdownOptions.classList.add('hidden');
        }
        if (saveDropdownBtn && saveDropdownMenu && !saveDropdownBtn.contains(event.target) && !saveDropdownMenu.contains(event.target)) {
            saveDropdownMenu.classList.add('hidden');
        }
        if (loadDropdownBtn && loadDropdownMenu && !loadDropdownBtn.contains(event.target) && !loadDropdownMenu.contains(event.target)) {
            loadDropdownMenu.classList.add('hidden');
        }
    });

    const quickRollBtn = document.getElementById('quick-roll-stats-btn');
    if (quickRollBtn) quickRollBtn.addEventListener('click', quickRollStats);

    const distributeBtn = document.getElementById('distribute-stats-btn');
    if (distributeBtn) distributeBtn.addEventListener('click', distributeStats);

    const saveDropdownBtn = document.getElementById('save-dropdown-btn');
    if (saveDropdownBtn) saveDropdownBtn.addEventListener('click', () => toggleDropdown('save-dropdown-menu'));

    const saveCurrentSystemBtn = document.getElementById('save-current-system-btn');
    if (saveCurrentSystemBtn) saveCurrentSystemBtn.addEventListener('click', saveCharacterToFile);

    const saveGoogleDriveBtn = document.getElementById('save-google-drive-btn');
    if (saveGoogleDriveBtn) saveGoogleDriveBtn.addEventListener('click', saveCharacterToGoogleDrive);

    const loadDropdownBtn = document.getElementById('load-dropdown-btn');
    if (loadDropdownBtn) loadDropdownBtn.addEventListener('click', () => toggleDropdown('load-dropdown-menu'));

    const loadCurrentSystemBtn = document.getElementById('load-current-system-btn');
    if (loadCurrentSystemBtn) {
        loadCurrentSystemBtn.addEventListener('click', () => {
            if (hasUnsavedChanges) {
                showConfirmationModal("You have unsaved changes. Are you sure you want to load a new file without saving?", () => {
                    const jsonInput = document.getElementById('load-json-input');
                    if (jsonInput) jsonInput.click();
                });
            } else {
                const jsonInput = document.getElementById('load-json-input');
                if (jsonInput) jsonInput.click();
            }
        });
    }

    const loadJsonInput = document.getElementById('load-json-input');
    if (loadJsonInput) loadJsonInput.addEventListener('change', loadCharacterFromFile);

    const loadGoogleDriveBtn = document.getElementById('load-google-drive-btn');
    if (loadGoogleDriveBtn) loadGoogleDriveBtn.addEventListener('click', loadCharacterFromGoogleDrive);

    const authDriveBtn = document.getElementById('authorize_google_drive_button');
    if (authDriveBtn) authDriveBtn.addEventListener('click', handleGoogleDriveAuthClick);

    const signoutDriveBtn = document.getElementById('signout_google_drive_button');
    if (signoutDriveBtn) signoutDriveBtn.addEventListener('click', handleGoogleDriveSignoutClick);

    const closeDriveModalBtn = document.getElementById('close-google-drive-modal');
    if (closeDriveModalBtn) {
        closeDriveModalBtn.addEventListener('click', () => {
            const driveModal = document.getElementById('google-drive-modal');
            if (driveModal) driveModal.classList.add('hidden');
        });
    }

    const addTempEffBtn = document.getElementById('add-temp-effect-btn');
    if (addTempEffBtn) addTempEffBtn.addEventListener('click', addManualTemporaryEffect);

    const closeTempEffModalBtn = document.getElementById('close-temp-effects-modal');
    if (closeTempEffModalBtn) closeTempEffModalBtn.addEventListener('click', closeTemporaryEffectsModal);

    // Direct Add Effect Listeners for Active Temporary and Permanent Effects Sections
    const addTempEffectDirectBtn = document.getElementById('add-temp-effect-direct-btn');
    if (addTempEffectDirectBtn) addTempEffectDirectBtn.addEventListener('click', () => openDirectAddEffectModal(false));

    const addPermEffectDirectBtn = document.getElementById('add-perm-effect-direct-btn');
    if (addPermEffectDirectBtn) addPermEffectDirectBtn.addEventListener('click', () => openDirectAddEffectModal(true));

    const closeDirectAddModalBtn = document.getElementById('close-direct-add-effect-modal');
    if (closeDirectAddModalBtn) closeDirectAddModalBtn.addEventListener('click', closeDirectAddEffectModal);

    const cancelDirectAddModalBtn = document.getElementById('cancel-direct-add-effect-btn');
    if (cancelDirectAddModalBtn) cancelDirectAddModalBtn.addEventListener('click', closeDirectAddEffectModal);

    const directAddEffectForm = document.getElementById('direct-add-effect-form');
    if (directAddEffectForm) directAddEffectForm.addEventListener('submit', handleDirectAddEffectSubmit);

    const endTurnButton = document.getElementById('end-turn-btn');
    if (endTurnButton) endTurnButton.addEventListener('click', endTurn);

    const toggleNotesBtn = document.getElementById('toggle-notes-btn');
    if (toggleNotesBtn) toggleNotesBtn.addEventListener('click', togglePersonalNotesPanel);

    const closeNotesBtn = document.getElementById('close-notes-panel-btn');
    if (closeNotesBtn) closeNotesBtn.addEventListener('click', togglePersonalNotesPanel);

    const charSelector = document.getElementById('character-selector');
    if (charSelector) charSelector.addEventListener('change', switchCharacter);

    const addCharBtn = document.getElementById('add-character-btn');
    if (addCharBtn) addCharBtn.addEventListener('click', addNewCharacter);

    const addWeaponBtn = document.getElementById('add-weapon-btn');
    if (addWeaponBtn) addWeaponBtn.addEventListener('click', addWeapon);

    const addArmorBtn = document.getElementById('add-armor-btn');
    if (addArmorBtn) addArmorBtn.addEventListener('click', addArmor);

    const addGeneralBtn = document.getElementById('add-general-item-btn');
    if (addGeneralBtn) addGeneralBtn.addEventListener('click', addGeneralItem);

    const weaponTable = document.getElementById('weapon-inventory-table');
    if (weaponTable) {
        weaponTable.addEventListener('input', handleChange);
        weaponTable.addEventListener('change', handleChange);
        weaponTable.addEventListener('click', function (event) {
            const rollBtn = event.target.closest('[data-action="roll-weapon"]');
            if (rollBtn) {
                const index = parseInt(rollBtn.dataset.index, 10);
                rollWeaponAtIndex(index);
                return;
            }
            if (handleRequiredStatClick(event)) return;
            if (handleMagicElementClick(event)) return;
            const removeBtn = event.target.closest('.remove-item-btn');
            if (removeBtn) {
                removeItem(event, removeBtn);
                return;
            }
        });
    }

    const armorTable = document.getElementById('armor-inventory-table');
    if (armorTable) {
        armorTable.addEventListener('input', handleChange);
        armorTable.addEventListener('change', handleChange);
        armorTable.addEventListener('click', function (event) {
            const rollBtn = event.target.closest('[data-action="roll-armor"]');
            if (rollBtn) {
                const index = parseInt(rollBtn.dataset.index, 10);
                rollArmorAtIndex(index);
                return;
            }
            if (handleRequiredStatClick(event)) return;
            if (handleMagicElementClick(event)) return;
            const removeBtn = event.target.closest('.remove-item-btn');
            if (removeBtn) {
                removeItem(event, removeBtn);
                return;
            }
        });
    }

    const generalTable = document.getElementById('general-inventory-table');
    if (generalTable) {
        generalTable.addEventListener('input', handleChange);
        generalTable.addEventListener('click', function (event) {
            const removeBtn = event.target.closest('.remove-item-btn');
            if (removeBtn) {
                removeItem(event, removeBtn);
                return;
            }
        });
    }

    const weaponCardsContainer = document.getElementById('weapon-inventory-cards-container');
    if (weaponCardsContainer) {
        weaponCardsContainer.addEventListener('input', handleChange);
        weaponCardsContainer.addEventListener('change', handleChange);
        weaponCardsContainer.addEventListener('click', function(event) {
            const collapseBtn = event.target.closest('[data-action="toggle-card-collapse"]');
            if (collapseBtn) {
                const inventoryType = collapseBtn.dataset.inventoryType;
                const itemIndex = parseInt(collapseBtn.dataset.index, 10);
                const inventory = character[`${inventoryType}Inventory`];
                if (inventory && inventory[itemIndex]) {
                    inventory[itemIndex].collapsed = !inventory[itemIndex].collapsed;
                    setHasUnsavedChanges(true);
                    renderWeaponCards();
                }
                return;
            }
            const rollBtn = event.target.closest('[data-action="roll-weapon"]');
            if (rollBtn) {
                const index = parseInt(rollBtn.dataset.index, 10);
                rollWeaponAtIndex(index);
                return;
            }
            if (handleRequiredStatClick(event)) return;
            if (handleMagicElementClick(event)) return;
            const removeBtn = event.target.closest('.remove-item-btn');
            if (removeBtn) {
                removeItem(event, removeBtn);
                return;
            }
        });
    }

    const rollAllWeaponsBtn = document.getElementById('roll-all-weapons-btn');
    if (rollAllWeaponsBtn) rollAllWeaponsBtn.addEventListener('click', rollAllActiveWeapons);

    const weaponToggleAllBtn = document.getElementById('weapon-toggle-all-cards-btn');
    if (weaponToggleAllBtn) weaponToggleAllBtn.addEventListener('click', () => toggleAllCards('weapon'));

    const rollAllArmorBtn = document.getElementById('roll-all-armor-btn');
    if (rollAllArmorBtn) rollAllArmorBtn.addEventListener('click', rollAllEquippedArmor);

    const armorToggleAllBtn = document.getElementById('armor-toggle-all-cards-btn');
    if (armorToggleAllBtn) armorToggleAllBtn.addEventListener('click', () => toggleAllCards('armor'));

    const generalToggleAllBtn = document.getElementById('general-toggle-all-cards-btn');
    if (generalToggleAllBtn) generalToggleAllBtn.addEventListener('click', () => toggleAllCards('general'));

    const rollTotalDefenseBtn = document.getElementById('roll-total-defense-btn');
    if (rollTotalDefenseBtn) rollTotalDefenseBtn.addEventListener('click', rollAllEquippedArmor);

    const rollTotalMagicDefenseBtn = document.getElementById('roll-total-magic-defense-btn');
    if (rollTotalMagicDefenseBtn) rollTotalMagicDefenseBtn.addEventListener('click', rollAllEquippedArmor);

    const armorCardsContainer = document.getElementById('armor-inventory-cards-container');
    if (armorCardsContainer) {
        armorCardsContainer.addEventListener('input', handleChange);
        armorCardsContainer.addEventListener('change', handleChange);
        armorCardsContainer.addEventListener('click', function(event) {
            const collapseBtn = event.target.closest('[data-action="toggle-card-collapse"]');
            if (collapseBtn) {
                const inventoryType = collapseBtn.dataset.inventoryType;
                const itemIndex = parseInt(collapseBtn.dataset.index, 10);
                const inventory = character[`${inventoryType}Inventory`];
                if (inventory && inventory[itemIndex]) {
                    inventory[itemIndex].collapsed = !inventory[itemIndex].collapsed;
                    setHasUnsavedChanges(true);
                    renderArmorCards();
                }
                return;
            }
            const rollBtn = event.target.closest('[data-action="roll-armor"]');
            if (rollBtn) {
                const index = parseInt(rollBtn.dataset.index, 10);
                rollArmorAtIndex(index);
                return;
            }
            if (handleRequiredStatClick(event)) return;
            if (handleMagicElementClick(event)) return;
            const removeBtn = event.target.closest('.remove-item-btn');
            if (removeBtn) {
                removeItem(event, removeBtn);
                return;
            }
        });
    }

    const generalCardsContainer = document.getElementById('general-inventory-cards-container');
    if (generalCardsContainer) {
        generalCardsContainer.addEventListener('input', handleChange);
        generalCardsContainer.addEventListener('change', handleChange);
        generalCardsContainer.addEventListener('click', function(event) {
            const collapseBtn = event.target.closest('[data-action="toggle-card-collapse"]');
            if (collapseBtn) {
                const inventoryType = collapseBtn.dataset.inventoryType;
                const itemIndex = parseInt(collapseBtn.dataset.index, 10);
                const inventory = character[`${inventoryType}Inventory`];
                if (inventory && inventory[itemIndex]) {
                    inventory[itemIndex].collapsed = !inventory[itemIndex].collapsed;
                    setHasUnsavedChanges(true);
                    renderGeneralCards();
                }
                return;
            }
            const removeBtn = event.target.closest('.remove-item-btn');
            if (removeBtn) {
                removeItem(event, removeBtn);
                return;
            }
        });
    }

    const weaponViewCardsBtn = document.getElementById('weapon-view-cards-btn');
    const weaponViewTableBtn = document.getElementById('weapon-view-table-btn');
    const armorViewCardsBtn = document.getElementById('armor-view-cards-btn');
    const armorViewTableBtn = document.getElementById('armor-view-table-btn');
    const generalViewCardsBtn = document.getElementById('general-view-cards-btn');
    const generalViewTableBtn = document.getElementById('general-view-table-btn');

    if (weaponViewCardsBtn) weaponViewCardsBtn.addEventListener('click', () => setInventoryView('weapon', 'cards'));
    if (weaponViewTableBtn) weaponViewTableBtn.addEventListener('click', () => setInventoryView('weapon', 'table'));
    if (armorViewCardsBtn) armorViewCardsBtn.addEventListener('click', () => setInventoryView('armor', 'cards'));
    if (armorViewTableBtn) armorViewTableBtn.addEventListener('click', () => setInventoryView('armor', 'table'));
    if (generalViewCardsBtn) generalViewCardsBtn.addEventListener('click', () => setInventoryView('general', 'cards'));
    if (generalViewTableBtn) generalViewTableBtn.addEventListener('click', () => setInventoryView('general', 'table'));

    // Inventory Sorting Event Listeners
    ['weapon', 'armor', 'general'].forEach(type => {
        const select = document.getElementById(`${type}-sort-field`);
        if (select) {
            select.addEventListener('change', (e) => {
                sortInventory(type, e.target.value);
            });
        }
        const dirBtn = document.getElementById(`${type}-sort-dir-btn`);
        if (dirBtn) {
            dirBtn.addEventListener('click', () => {
                const currentDir = inventorySortSettings[type].dir;
                const newDir = currentDir === 'asc' ? 'desc' : 'asc';
                sortInventory(type, null, newDir);
            });
        }
    });

    // Delegated Table Header Click Handler for Sorting
    document.addEventListener('click', (event) => {
        const sortHeader = event.target.closest('th[data-sort-field]');
        if (sortHeader) {
            const field = sortHeader.dataset.sortField;
            const inventoryType = sortHeader.dataset.inventoryType;
            if (field && inventoryType) {
                const current = inventorySortSettings[inventoryType];
                const newDir = (current.field === field && current.dir === 'asc') ? 'desc' : 'asc';
                sortInventory(inventoryType, field, newDir);
            }
        }
    });

    document.querySelectorAll('.toggle-section-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.currentTarget.dataset.target;
            toggleSection(targetId);
        });
    });

    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);

    const resetBtn = document.getElementById('reset-character-btn');
    if (resetBtn) resetBtn.addEventListener('click', resetCurrentCharacter);

    const newFileBtn = document.getElementById('new-file-btn');
    if (newFileBtn) newFileBtn.addEventListener('click', newFile);

    const deleteBtn = document.getElementById('delete-character-btn');
    if (deleteBtn) deleteBtn.addEventListener('click', deleteCurrentCharacter);

    const revertBtn = document.getElementById('revert-character-btn');
    if (revertBtn) revertBtn.addEventListener('click', revertCurrentCharacter);

    const forwardBtn = document.getElementById('forward-character-btn');
    if (forwardBtn) forwardBtn.addEventListener('click', forwardCurrentCharacter);

    window.addEventListener('beforeunload', (event) => {
        if (hasUnsavedChanges) {
            event.preventDefault();
            event.returnValue = '';
            return "You have unsaved changes. Are you sure you want to exit?";
        }
    });

    window.addEventListener('resize', updatePanelsPosition);

    const takeDamageBtn = document.getElementById("take-damage-btn");
    const takeDamageModal = document.getElementById("take-damage-modal");
    const damageTakeAmountInput = document.getElementById("take-damage-amount");
    const setHealthCheckbox = document.getElementById("set-health-checkbox");
    const closeTakeDamageModal = document.getElementById("close-take-damage-modal");
    const cancelTakeDamage = document.getElementById("cancel-take-damage");
    const applyTakeDamage = document.getElementById("apply-take-damage");

    if (takeDamageBtn) {
        takeDamageBtn.addEventListener("click", () => {
            if (damageTakeAmountInput) {
                damageTakeAmountInput.max = character.maxHealth;
                damageTakeAmountInput.value = "";
            }
            if (setHealthCheckbox) setHealthCheckbox.checked = false;
            if (takeDamageModal) takeDamageModal.classList.remove("hidden");
        });
    }

    if (closeTakeDamageModal) closeTakeDamageModal.addEventListener("click", closeDamageModal);
    if (cancelTakeDamage) cancelTakeDamage.addEventListener("click", closeDamageModal);
    if (applyTakeDamage) applyTakeDamage.addEventListener("click", takeDamage);
}

export function initPage() {
    setCharacters([defaultCharacterData()]);
    recalculateCharacterDerivedProperties(characters[0]);

    populateRaceSelector();
    populateCharacterSelector();
    updateDOM();
    attachEventListeners();

    const personalNotesPanel = document.getElementById('personal-notes-panel');
    const personalNotesHeader = document.querySelector('.personal-notes-header');
    const personalNotesResizer = document.getElementById("personalNotes-resizer");
    if (personalNotesPanel && personalNotesHeader) makeDraggable(personalNotesPanel, personalNotesHeader);
    if (personalNotesPanel && personalNotesResizer) makeResizable(personalNotesPanel, personalNotesResizer);

    const backstory = document.getElementById("backstory");
    const backstoryRezizer = document.getElementById("backstory-resizer");
    if (backstory && backstoryRezizer) makeHeightResizable(backstory, backstoryRezizer);

    if (window.gapiLoaded) window.gapiLoaded();
    if (window.gisLoaded) window.gisLoaded();
    maybeEnableGoogleDriveButtons();

    saveCurrentStateToHistory();
    startAutoHistorySaver();
}