import { ExternalDataManager } from '../externalDataManager.js'
import { MIN_STAT_VALUE, MAX_STAT_VALUE, TOTAL_DISTRIBUTION_POINTS } from './constants.js';
import { SECTION_VISIBILITY, HTML_VISIBILITY } from './constants.js';
import { character, setHasUnsavedChanges } from './state.js';
import { getCategoriesTemporaryEffects, getAppliedRacialChange, calculateRollStatTotal, addTemporaryEffect, roll } from './formulas.js';
import { handlePlayerStatInputChange } from './eventHandler.js';
import { renderRacial } from './passivesActives.js';
import { renderWeaponTable, renderArmorTable, renderGeneralTable } from './inventory.js';
import { recalculateSmallUpdateCharacter, recalculateCharacterDerivedProperties, updateHistoryButtonsState, populateCharacterSelector } from './characterState.js';

export let currentStatForTempEffects = null; // To keep track of which stat's temporary effects are being viewed
export let currentStatDisplayNameForTempEffects = null;
export let tempEffectsModalTitleStatTotal = "";

export function showStatusMessage(message, isError = false) {
    const statusMessageElement = document.getElementById('status-message');
    if (!statusMessageElement) return;
    statusMessageElement.textContent = message;
    statusMessageElement.style.color = isError ? '#ef4444' : '#22c55e';
    setTimeout(() => {
        statusMessageElement.textContent = '';
    }, 5000);
}

export function showConfirmationModal(message, onConfirm, onCancel = () => { }) {
    const confirmationModal = document.getElementById('confirmation-modal');
    const confirmMessage = document.getElementById('confirm-message');
    const confirmOkBtn = document.getElementById('confirm-ok-btn');
    const confirmCancelBtn = document.getElementById('confirm-cancel-btn');

    // Ensure elements are available before trying to access them
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

export function toggleHtml(id, toggleClass) {
    const content = document.getElementById(id);
    const toggleButton = document.querySelector(`.toggle-${toggleClass}-btn[data-target="${id}"] svg`);

    if (content && toggleButton) {
        const isHidden = content.classList.contains('hidden');
        if (isHidden) {
            content.classList.remove('hidden');
            toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>'; // Chevron down
            character.htmlVisibility[id] = true;
        } else {
            content.classList.add('hidden');
            toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'; // Chevron right
            character.htmlVisibility[id] = false;
        }
        setHasUnsavedChanges(true); // Mark that there are unsaved changes
    }
}

export function toggleSection(sectionId) {
    toggleHtml(sectionId, SECTION_VISIBILITY);
}

export function updateSpecificHtmlVisibility(toggleClass) {
    for (const htmlId in character.htmlVisibility) {
        const htmlContent = document.getElementById(htmlId);
        const toggleButton = document.querySelector(`.toggle-${toggleClass}-btn[data-target="${htmlId}"] svg`);

        if (htmlContent && toggleButton) {
            if (character.htmlVisibility[htmlId]) {
                htmlContent.classList.remove('hidden');
                toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>'; // Chevron down
            } else {
                htmlContent.classList.add('hidden');
                toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'; // Chevron right
            }
        }
    }
}

export function updateHtmlVisibility() {
    HTML_VISIBILITY.forEach(visibility => {
        updateSpecificHtmlVisibility(visibility);
    });
}

export function toggleSidebar() {
    const sidebar = document.getElementById('left-sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleButton = document.getElementById('sidebar-toggle-btn');
    const toggleIcon = toggleButton.querySelector('svg path');
    const endTurnBtn = document.getElementById('end-turn-btn'); // Get the new end turn button

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
        
        if (endTurnBtn) {
            endTurnBtn.classList.add('hidden');
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

export function updateRemainingPointsDisplay() {
    const remainingPointsElement = document.getElementById('remaining-points');
    if (remainingPointsElement) {
        if (character.isDistributingStats) {
            remainingPointsElement.textContent = `Points Left: ${character.remainingDistributionPoints}`;
            if (character.remainingDistributionPoints < 0) {
                remainingPointsElement.classList.add('text-red-500');
                remainingPointsElement.classList.remove('text-gray-700', 'dark:text-gray-300');
            } else if (character.remainingDistributionPoints === 0) {
                remainingPointsElement.classList.add('text-green-500');
                remainingPointsElement.classList.remove('text-red-500', 'text-gray-700', 'dark:text-gray-300');
            } else {
                remainingPointsElement.classList.add('text-gray-700', 'dark:text-gray-300');
                remainingPointsElement.classList.remove('text-red-500', 'text-green-500');
            }
        } else {
            remainingPointsElement.textContent = `Points Left: 0`; // Or hide it, depending on desired UI
            remainingPointsElement.classList.add('text-gray-700', 'dark:text-gray-300');
            remainingPointsElement.classList.remove('text-red-500', 'text-green-500');
        }
    }
}

export function getCharacterStatesActive() {
    const states = Object.keys(character.states);
    let statesActive = [];

    states.forEach(state => {
        if(character.states[state])
            statesActive.push(state);
    });

    return statesActive;
}

export function updateStaticTempEffectsButton(statName, displayName) {
    const btn = document.querySelector(`.temp-effects-btn[data-stat-name="${statName}"]`);
    if (!btn) return;

    const activeEffects = getCategoriesTemporaryEffects(character, statName);
    let badgeHtml = '';
    if (activeEffects.length > 0) {
        badgeHtml = `<span class="inline-flex items-center ml-1 px-1.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200 animate-pulse">✨ ${activeEffects.length}</span>`;
    }

    btn.innerHTML = `
        ${displayName}
        ${badgeHtml}
        <svg class="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 9l-7 7-7-7"></path>
        </svg>
    `;
}

/**
 * Highlights Health, Mana, RacialPower, and totalDefense input fields on the sheet if they have active effects.
 */
export function highlightStatsWithActiveEffects() {
    const healthInputEl = document.getElementById('Health');
    if (healthInputEl) {
        const hasHealthEff = getCategoriesTemporaryEffects(character, 'Health').length > 0;
        if (hasHealthEff) {
            healthInputEl.classList.add('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20', 'dark:bg-indigo-950/20');
        } else {
            healthInputEl.classList.remove('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20', 'dark:bg-indigo-950/20');
        }
    }
    const maxHealthEl = document.getElementById('maxHealth');
    if (maxHealthEl) {
        const hasEff = getCategoriesTemporaryEffects(character, 'Health').length > 0;
        if (hasEff) {
            maxHealthEl.classList.add('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
        } else {
            maxHealthEl.classList.remove('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
        }
    }
    const maxManaEl = document.getElementById('maxMana');
    if (maxManaEl) {
        const hasEff = getCategoriesTemporaryEffects(character, 'Mana').length > 0;
        if (hasEff) {
            maxManaEl.classList.add('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
        } else {
            maxManaEl.classList.remove('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
        }
    }
    const maxRacialPowerEl = document.getElementById('maxRacialPower');
    if (maxRacialPowerEl) {
        const hasEff = getCategoriesTemporaryEffects(character, 'RacialPower').length > 0;
        if (hasEff) {
            maxRacialPowerEl.classList.add('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
        } else {
            maxRacialPowerEl.classList.remove('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
        }
    }
    const totalDefenseEl = document.getElementById('total-defense');
    if (totalDefenseEl) {
        const hasEff = getCategoriesTemporaryEffects(character, 'totalDefense').length > 0;
        if (hasEff) {
            totalDefenseEl.classList.add('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
        } else {
            totalDefenseEl.classList.remove('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
        }
    }
    const totalMagicDefenseEl = document.getElementById('total-magic-defense');
    if (totalMagicDefenseEl) {
        const hasEff = getCategoriesTemporaryEffects(character, 'totalMagicDefense').length > 0;
        if (hasEff) {
            totalMagicDefenseEl.classList.add('border-purple-400', 'dark:border-purple-500', 'bg-purple-50/20');
        } else {
            totalMagicDefenseEl.classList.remove('border-purple-400', 'dark:border-purple-500', 'bg-purple-50/20');
        }
    }
}

/**
 * Dynamically renders a global active temporary effects summary list on the main sheet view.
 */
export function renderActiveEffectsSummary() {
    updateStaticTempEffectsButton('Health', 'Health');
    updateStaticTempEffectsButton('Mana', 'Mana');
    updateStaticTempEffectsButton('RacialPower', 'Racial Power');
    updateStaticTempEffectsButton('totalDefense', 'Total defense');
    updateStaticTempEffectsButton('totalMagicDefense', 'Total Magic Defense');
    highlightStatsWithActiveEffects();

    const listContainer = document.getElementById('active-effects-summary-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const statsWithEffects = [...ExternalDataManager.rollStats, 'Health', 'Mana', 'RacialPower', 'totalDefense', 'totalMagicDefense'];
    const allEffects = [];

    statsWithEffects.forEach(statName => {
        if (character[statName] && character[statName].temporaryEffects) {
            const tempEffects = character[statName].temporaryEffects;
            for (const category in tempEffects) {
                const categoryEffects = tempEffects[category];
                if (Array.isArray(categoryEffects)) {
                    categoryEffects.forEach(effect => {
                        allEffects.push({
                            statName: statName,
                            category: category,
                            effect: effect
                        });
                    });
                }
            }
        }
    });

    const countBadge = document.getElementById('global-active-effects-count-badge');
    if (countBadge) {
        if (allEffects.length > 0) {
            countBadge.textContent = allEffects.length;
            countBadge.classList.remove('hidden');
        } else {
            countBadge.classList.add('hidden');
        }
    }

    if (allEffects.length === 0) {
        listContainer.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-sm">No active temporary effects.</p>';
        return;
    }

    allEffects.forEach(item => {
        const effect = item.effect;
        const statName = item.statName;
        const val = effect.values ? effect.values[0] : 0;
        const isPercent = effect.isPercent ? '%' : '';
        const operator = effect.type || '+';
        const name = effect.name || 'Unnamed Effect';
        const appliesTo = effect.appliesTo || 'total';
        const durationText = (effect.duration === Infinity || effect.duration === null || effect.duration === undefined) 
            ? 'Permanent' 
            : `${effect.duration} turns left`;

        const card = document.createElement('div');
        card.className = 'flex items-center justify-between p-3 border border-gray-100 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150';
        
        let displayLabel = `
            <div class="flex flex-col sm:flex-row sm:items-center gap-x-2">
                <span class="font-bold text-indigo-600 dark:text-indigo-400">${name}</span> 
                <span class="text-xs text-gray-500 dark:text-gray-400">(${statName})</span>
            </div>
            <div class="text-xs text-gray-600 dark:text-gray-300 mt-1">
                ${operator}${val}${isPercent} (applies to ${appliesTo})
            </div>
        `;

        card.innerHTML = `
            <div class="flex-grow text-sm text-gray-700 dark:text-gray-300">
                ${displayLabel}
            </div>
            <div class="flex items-center gap-3">
                <span class="px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
                    ${durationText}
                </span>`;
        if (durationText != 'Permanent')
            card.innerHTML +=     `<button type="button" data-stat-name="${statName}" data-category="${item.category}" data-effect-index="${character[statName].temporaryEffects[item.category].indexOf(effect)}" class="remove-summary-effect-btn text-xs font-bold text-red-500 hover:text-red-700 dark:hover:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors duration-150">
                    Remove
                </button>`;

        card.innerHTML +=    `</div>
        `;
        listContainer.appendChild(card);
    });

    listContainer.querySelectorAll('.remove-summary-effect-btn').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const statName = event.currentTarget.dataset.statName;
            const category = event.currentTarget.dataset.category;
            const effectIndex = parseInt(event.currentTarget.dataset.effectIndex);

            if (statName && character[statName] && character[statName].temporaryEffects[category][effectIndex] !== undefined) {
                character[statName].temporaryEffects[category].splice(effectIndex, 1);
                recalculateCharacterDerivedProperties(character, true);
                updateDOM();
                setHasUnsavedChanges(true);
                if (typeof showStatusMessage === 'function') {
                    showStatusMessage("Removed temporary effect.");
                } else {
                    console.log("Removed temporary effect.");
                }
            }
        });
    });
}

export function removeSpecializationWarning() {
    const specializationDisplayInput = document.getElementById('specializations-display');
    specializationDisplayInput.classList.remove('white-placeholder');
    specializationDisplayInput.classList.remove('bg-yellow-500');
    specializationDisplayInput.classList.remove('hover:bg-yellow-600');
}

export function addremoveSpecializationWarning() {
    const specializationDisplayInput = document.getElementById('specializations-display');
    specializationDisplayInput.classList.add('white-placeholder');
    specializationDisplayInput.classList.add('bg-yellow-500');
    specializationDisplayInput.classList.add('hover:bg-yellow-600'); 
}

export function renderSpecializations(specializations, availableSpecializationsKeys) {
    const displayValues = [];
    const specializationsKeys = Object.keys(specializations);
    let countSelectedClass = 0;

    specializationsKeys.forEach(classe => {
        if (specializations[classe].length > 0) {
            displayValues.push(`${classe}→${specializations[classe].join(', ')}`);
            ++countSelectedClass;
        }
    });

    document.getElementById('specializations-display').value = displayValues.join(', ');

    console.log("Count selected class");
    console.log(countSelectedClass);
    console.log(availableSpecializationsKeys.length);

    if (countSelectedClass > 0 && availableSpecializationsKeys.length == countSelectedClass)
        removeSpecializationWarning();
    else if (availableSpecializationsKeys.length > 0)
        addremoveSpecializationWarning();
    else 
        removeSpecializationWarning();
}

// Function to update the specializations dropdown options and filter selected specializations
export function updateSpecializationDropdownAndData() {
    const specializationDisplayInput = document.getElementById('specializations-display');
    const specializationDropdownOptions = document.getElementById('specializations-dropdown-options');


    const availableSpecializations = ExternalDataManager.getAvailableSpecializations(character);

    const specializationsClasses = Object.keys(character.specializations);
    specializationsClasses.forEach(classe => {
        if (!availableSpecializations[classe]) {
            delete character.specializations[classe];
        } else {
            // 2. Filter character.specializations to keep only valid ones
            character.specializations[classe] = character.specializations[classe].filter(spec => availableSpecializations[classe].includes(spec));
        }
    });

    const availableSpecializationsKeys = Object.keys(availableSpecializations);
    renderSpecializations(character.specializations, availableSpecializationsKeys);

    // 4. Populate and update checkboxes in the dropdown options
    specializationDropdownOptions.innerHTML = ''; // Clear existing options

    if (availableSpecializationsKeys.length === 0) {
        specializationDropdownOptions.innerHTML = '<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No specializations available for selected classes.</div>';
        specializationDisplayInput.placeholder = 'No specializations available';
    } else {
        specializationDisplayInput.placeholder = 'Select specializations...';
        availableSpecializationsKeys.forEach(classe => {
            availableSpecializations[classe].forEach(specName => {
            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md';
            checkboxDiv.innerHTML = `
               <input
                   type="checkbox"
                   id="specializations-${classe}-${specName}"
                   name="specializations-option"
                   value="${specName}"
                    data-classe="${classe}"
                   class="form-checkbox h-4 w-4 text-indigo-600 dark:text-indigo-400 rounded border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
                   ${character.specializations[classe] && character.specializations[classe].includes(specName) ? 'checked' : ''}
               />
               <label for="specializations-${classe}-${specName}" class="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">${classe}→${specName}</label>
           `;
            specializationDropdownOptions.appendChild(checkboxDiv);
            });
        });
    }
}

// Function to update the DOM elements with the current character data
export function updateDOM() {
    populateCharacterSelector();
    // Basic Info
    document.getElementById('name').value = character.name;
    document.getElementById('level').value = character.level;
    document.getElementById('levelExperience').value = character.levelExperience;
    document.getElementById('levelMaxExperience').value = character.levelMaxExperience; // This is readonly
    document.getElementById('purse').value = character.purse;
    document.getElementById('bank').value = character.bank;

    // Handle race selector placeholder color and update max Health
    const raceSelect = document.getElementById('race');
    raceSelect.value = character.race; // Set the selected race
    if (character.race === '') {
        raceSelect.classList.add('select-placeholder-text');
    } else {
        raceSelect.classList.remove('select-placeholder-text');
    }

    // Update derived properties and then update their DOM elements
    recalculateCharacterDerivedProperties(character, true);

    // Handle custom multi-select for class
    const classDisplayInput = document.getElementById('classes-display');
    const classDropdownOptions = document.getElementById('classes-dropdown-options');

    // Set the displayed value for classes
    classDisplayInput.value = character.classes.join(', ');

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
               ${character.classes.includes(className) ? 'checked' : ''}
           />
           <label for="class-${className.replace(/\s/g, '-')}" class="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">${className}</label>
       `;
        classDropdownOptions.appendChild(checkboxDiv);
    });

    // Update specializations dropdown
    updateSpecializationDropdownAndData();

    const stateDisplayInput = document.getElementById('state-display');
    const stateDropdownOptions = document.getElementById('state-dropdown-options');
    const states = Object.keys(character.states);
    const statesActive = getCharacterStatesActive();

    stateDisplayInput.value = statesActive.join(', ');

    stateDropdownOptions.innerHTML = '';

    states.forEach(state => {
        const checkboxDiv = document.createElement('div');
        checkboxDiv.className = 'flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md';
        checkboxDiv.innerHTML = `
           <input
               type="checkbox"
               id="state-${state.replace(/\s/g, '-')}"
               name="state-option"
               value="${state}"
               class="form-checkbox h-4 w-4 text-indigo-600 dark:text-indigo-400 rounded border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
               ${statesActive.includes(state) ? 'checked' : ''}
           />
           <label for="state-${state.replace(/\s/g, '-')}" class="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">${state}</label>
       `;
        stateDropdownOptions.appendChild(checkboxDiv);
    });

    // Render racial passives based on selected race
    renderRacial();


    // Player Stats
    const playerStatsContainer = document.getElementById('player-stats-container').querySelector('tbody');
    playerStatsContainer.innerHTML = ''; // Clear existing rows

    ExternalDataManager.rollStats.forEach(statName => {
        const statData = character[statName];
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700'; // Add hover effect to rows
        row.innerHTML = `
            <td class="px-2 py-1 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">
                <button type="button"
                    class="temp-effects-btn ml-1 p-0.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 flex items-center gap-1"
                    data-stat-name="${statName}" data-stat-display-name="${statName}" data-stat-display-total="${statName}-total">
                    ${statName}
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                            d="M19 9l-7 7-7-7"></path>
                    </svg>
                </button>
            </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-value" name="${statName}-value" min="${MIN_STAT_VALUE}" value="${statData.baseValue + statData.experienceBonus}" class="stat-input" />
            </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-racialChange" name="${statName}-racialChange" value="${getAppliedRacialChange(character, statName)}" readonly class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-equipment" name="${statName}-equipment" value="${statData.equipment}" class="stat-input" />
           </td>
       `;

        const expContainer = document.createElement('td');
        expContainer.classList = 'px-2 py-1 whitespace-nowrap';
        expContainer.innerHTML = 
            `<div class="flex items-center justify-center exp-inputs-wrapper">
                <input type="number" id="${statName}-experience" name="${statName}-experience" value="${statData.experience}" class="stat-input rounded-r-none" />
                <span class="px-1 py-1 border-y border-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">/</span>
                <input type="number" id="${statName}-maxExperience" name="${statName}-maxExperience" min="1" value="${statData.maxExperience}" readonly class="stat-input rounded-l-none" />
                <input type="text" id="${statName}-experienceBonus" name="${statName}-experienceBonus" value="" readonly class="stat-input rounded-l-none hidden" />
            </div>`;
        row.appendChild(expContainer);

        const totalContainer = document.createElement('td');
        totalContainer.classList = 'px-2 py-1 whitespace-nowrap';
        totalContainer.innerHTML =  `<input type="number" id="${statName}-total" name="${statName}-total" value="${calculateRollStatTotal(character, statName)}" readonly class="stat-input" />`;
        row.appendChild(totalContainer);

        playerStatsContainer.appendChild(row);
        
        const maxExpElement = document.getElementById(`${statName}-maxExperience`);
        const experienceBonusElement = document.getElementById(`${statName}-experienceBonus`); 

        maxExpElement.addEventListener('mouseenter', () => {
            experienceBonusElement.value = `${maxExpElement.value} (give + ${character[statName].experienceBonus})`;
            maxExpElement.classList.add('hidden');
            experienceBonusElement.classList.remove('hidden');
        });

        experienceBonusElement.addEventListener('mouseleave', () => {
            experienceBonusElement.classList.add('hidden');
            maxExpElement.classList.remove('hidden');
        });
    });

    // Update remaining points display
    updateRemainingPointsDisplay();

    // Health & Combat
    // document.getElementById('healthBonus').value = character.healthBonus; // Removed this line
    // totalDefense and totalMagicDefense are updated via recalculateSmallUpdateCharacter
    if (document.getElementById('total-defense')) document.getElementById('total-defense').value = character.totalDefense.value;
    if (document.getElementById('total-magic-defense') && character.totalMagicDefense) {
        document.getElementById('total-magic-defense').value = character.totalMagicDefense.value;
    }

    // Render new inventory tables
    renderWeaponTable();
    renderArmorTable();
    renderGeneralTable();

    // Backstory
    let layout = character.layouts.backstory;
    const backstory = document.getElementById('backstory');
    if (backstory) {
        backstory.value = layout.text;
        backstory.style.height = `${layout.height * 100}vh`;
    }

    // Personal Notes
    layout = character.layouts.personalNotes;
    document.getElementById('personalNotes').value = layout.text;
    const personalNotesPanel = document.getElementById('personal-notes-panel');
    if (personalNotesPanel) {
        // Apply position and size using viewport units (vw/vh)
        personalNotesPanel.style.left = `${layout.x * 100}vw`;
        personalNotesPanel.style.top = `${layout.y * 100}vh`;
        personalNotesPanel.style.width = `${layout.width * 100}vw`;
        personalNotesPanel.style.height = `${layout.height * 100}vh`;
    }

    // Update section visibility - New
    updateHtmlVisibility();

    // Update static temporary effects buttons with active badges
    updateStaticTempEffectsButton('Health', 'Health');
    updateStaticTempEffectsButton('Mana', 'Mana');
    updateStaticTempEffectsButton('RacialPower', 'Racial Power');
    updateStaticTempEffectsButton('totalDefense', 'Total defense');
    updateStaticTempEffectsButton('totalMagicDefense', 'Total Magic Defense');

    // Highlight Health/Mana/RacialPower/totalDefense inputs if they have active temporary effects
    highlightStatsWithActiveEffects();

    // Render global active effects summary
    renderActiveEffectsSummary();

    updateHistoryButtonsState(); // Update history button states after DOM update
}

// Function to perform a quick roll for all player stats
export function quickRollStats() {
        showConfirmationModal("Are you sure you want to roll stats? This will roll all initial stat values to at least 5 and it will reset stats exp.", () => {
        character.isDistributingStats = false; // Exit distribution mode
        ExternalDataManager.rollStats.forEach(statName => {
            character[statName].baseValue = roll(MIN_STAT_VALUE, MAX_STAT_VALUE); // Assign to the 'baseValue' property
            character[statName].experienceBonus = 0;
            character[statName].experience = 0;

            document.getElementById(`${statName}-experience`).value = 0;
            document.getElementById(`${statName}-value`).value = character[statName].baseValue;
            document.getElementById(`${statName}-total`).value = calculateRollStatTotal(character, statName);
        });
        // Re-render weapon inventory to update calculated damage values
        renderWeaponTable();
        updateRemainingPointsDisplay(); // Reset remaining points display
        setHasUnsavedChanges(true); // Mark that there are unsaved changes
    });
}

/**
 * Initializes stats for point distribution.
 */
export function distributeStats() {
    showConfirmationModal("Are you sure you want to distribute 97 points? This will reset all initial stat values to 5 and it will reset stats exp.", () => {
        character.isDistributingStats = true; // Enter distribution mode
        character.remainingDistributionPoints = TOTAL_DISTRIBUTION_POINTS;

        ExternalDataManager.rollStats.forEach(statName => {
            character[statName].baseValue = MIN_STAT_VALUE; // Set all stats to minimum baseValue
            character[statName].experienceBonus = 0;
            character[statName].experience = 0;

            document.getElementById(`${statName}-experience`).value = 0;
            document.getElementById(`${statName}-value`).value = character[statName].baseValue; // Update displayed value
            document.getElementById(`${statName}-total`).value = calculateRollStatTotal(character, statName);
        });

        updateRemainingPointsDisplay();
        renderWeaponTable();
        setHasUnsavedChanges(true);
    });
}

/**
 * Renders the list of temporary effects for the current stat in the modal.
 * @param {string} statName The name of the stat.
 */
export function renderTemporaryEffects(statName) {
    const tempEffectsList = document.getElementById('temp-effects-list');
    if (!tempEffectsList) return;

    const category = 'manual';
    const manualEffects = character[statName].temporaryEffects[category] || [];

    // Store the currently focused element's ID if it's within the temp effects list
    const focusedElement = document.activeElement;
    let focusedElementDataset = null;
    if (focusedElement && tempEffectsList.contains(focusedElement) && focusedElement.classList.contains('temp-effect-input')) {
        focusedElementDataset = {
            statName: focusedElement.dataset.statName,
            effectIndex: parseInt(focusedElement.dataset.effectIndex),
            category: focusedElement.dataset.category,
            field: focusedElement.dataset.field
        };
    }

    // Clear existing children that are not part of the current effects array
    // This handles removals and ensures correct order
    const existingEffectDivs = Array.from(tempEffectsList.children);
    existingEffectDivs.forEach((div, index) => {
        // If an element exists at this index and it's not a temporary effect div (e.g., the "No effects" message), remove it.
        // Or if it's an excess div beyond the current number of effects, remove it.
        if (index >= manualEffects.length || !div.classList.contains('flex')) {
            tempEffectsList.removeChild(div);
        }
    });

    if (manualEffects.length === 0) {
        tempEffectsList.innerHTML = '<p class="text-gray-500 dark:text-gray-400">No temporary effects added yet.</p>';
        return;
    }

    manualEffects.forEach((effect, index) => {
        let effectDiv = tempEffectsList.children[index];
        let nameInput, valueInput, isPercentCheckbox, durationInput, typeSelect, appliesToSelect, removeButton;
        const manualIndex = index;

        // If the div doesn't exist or isn't the correct type, create it
        if (!effectDiv || !effectDiv.classList.contains('flex')) {
            effectDiv = document.createElement('div');
            effectDiv.className = `flex flex-wrap items-end gap-4 p-4 border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800 ${
                index > 0 ? 'mt-4' : ''
            }`;
            // Insert at the correct position or append
            if (tempEffectsList.children[index]) {
                tempEffectsList.insertBefore(effectDiv, tempEffectsList.children[index]);
            } else {
                tempEffectsList.appendChild(effectDiv);
            }

            // Reusable classes
            const inputBase = 'temp-effect-input px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100';
            const labelBase = 'text-sm font-semibold text-gray-700 dark:text-gray-300 w-full';

            // Populate innerHTML
            effectDiv.innerHTML = `
                <div class="flex flex-col min-w-[9rem] gap-y-1">
                    <label class="${labelBase}">Effect Name</label>
                    <input type="text" data-stat-name="${statName}" data-effect-index="${manualIndex}" data-category="${category}" data-field="name" class="${inputBase} w-full" placeholder="e.g. Bless, Poison" />
                </div>

                <div class="flex flex-col min-w-[7rem] gap-y-1">
                    <label class="${labelBase}">Value</label>
                    <div class="flex items-center gap-x-2"> <!-- Added a flex container for input and checkbox -->
                        <input type="number" step="0.01" data-stat-name="${statName}" data-effect-index="${manualIndex}" data-category="${category}" data-field="values" class="${inputBase} flex-grow min-w-[4rem]" />
                        <label class="flex items-center gap-x-1 cursor-pointer">
                            <input type="checkbox" data-stat-name="${statName}" data-effect-index="${manualIndex}" data-category="${category}" data-field="isPercent" class="form-checkbox h-4 w-4 text-indigo-600 rounded focus:ring-indigo-500 dark:focus:ring-indigo-600 dark:bg-gray-700 dark:border-gray-600" ${effect.isPercent ? 'checked' : ''} />
                            <span class="text-sm font-semibold text-gray-700 dark:text-gray-300">%</span>
                        </label>
                    </div>
                </div>

                <div class="flex flex-col min-w-[5rem] gap-y-1">
                    <label class="${labelBase}">Type</label>
                    <select data-stat-name="${statName}" data-effect-index="${manualIndex}" data-category="${category}" data-field="type" class="${inputBase}">
                        <option value="+">+</option>
                        <option value="*">*</option>
                    </select>
                </div>

                <div class="flex flex-col min-w-[8rem] gap-y-1">
                    <label class="${labelBase}">Applies To</label>
                    <select data-stat-name="${statName}" data-effect-index="${manualIndex}" data-category="${category}" data-field="appliesTo" class="${inputBase}">
                        <option value="initial-value">initial value</option>
                        <option value="base-value">base value</option>
                        <option value="total">Total</option>
                    </select>
                </div>

                <div class="flex flex-col min-w-[6rem] gap-y-1">
                    <label class="${labelBase}">Duration</label>
                    <input type="number" data-stat-name="${statName}" data-effect-index="${manualIndex}" data-category="${category}" data-field="duration" class="${inputBase}" />
                </div>

                <div class="flex items-end">
                    <button type="button" data-stat-name="${statName}" data-effect-index="${manualIndex}" data-category="${category}" class="remove-temp-effect-btn px-3 py-2 bg-red-500 text-white text-sm font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors duration-200">
                        Remove
                    </button>
                </div>
            `;
            // Get references to the newly created inputs and button
            nameInput = effectDiv.querySelector(`input[data-field="name"]`);
            valueInput = effectDiv.querySelector(`input[data-field="values"]`);
            isPercentCheckbox = effectDiv.querySelector(`input[data-field="isPercent"]`);
            durationInput = effectDiv.querySelector(`input[data-field="duration"]`);
            typeSelect = effectDiv.querySelector(`select[data-field="type"]`);
            appliesToSelect = effectDiv.querySelector(`select[data-field="appliesTo"]`);
            removeButton = effectDiv.querySelector('.remove-temp-effect-btn');
        } else {
            // If the div already exists and is correct, just update its children's values and data attributes
            nameInput = effectDiv.querySelector(`input[data-field="name"]`);
            valueInput = effectDiv.querySelector(`input[data-field="values"]`);
            isPercentCheckbox = effectDiv.querySelector(`input[data-field="isPercent"]`);
            durationInput = effectDiv.querySelector(`input[data-field="duration"]`);
            typeSelect = effectDiv.querySelector(`select[data-field="type"]`);
            appliesToSelect = effectDiv.querySelector(`select[data-field="appliesTo"]`);
            removeButton = effectDiv.querySelector('.remove-temp-effect-btn');

            // Update data-effect-index for consistency if order changes (though it shouldn't often here)
            nameInput.dataset.effectIndex = manualIndex;
            valueInput.dataset.effectIndex = manualIndex;
            isPercentCheckbox.dataset.effectIndex = manualIndex;
            durationInput.dataset.effectIndex = manualIndex;
            typeSelect.dataset.effectIndex = manualIndex;
            appliesToSelect.dataset.effectIndex = manualIndex;
            removeButton.dataset.effectIndex = manualIndex;
        }

        // Always update the input values directly to reflect the current data
        nameInput.value = effect.name || '';
        valueInput.value = effect.values[0] || 0;
        isPercentCheckbox.checked = effect.isPercent; // Set checked state for the checkbox
        durationInput.value = effect.duration;
        typeSelect.value = effect.type || '+'; // Default to 'add'
        appliesToSelect.value = effect.appliesTo || 'total'; // Default to 'total'

        // Re-attach event listeners to ensure they are always active for current elements
        nameInput.removeEventListener('input', handlePlayerStatInputChange);
        nameInput.addEventListener('input', handlePlayerStatInputChange);

        valueInput.removeEventListener('input', handlePlayerStatInputChange);
        valueInput.addEventListener('input', handlePlayerStatInputChange);

        isPercentCheckbox.removeEventListener('change', handlePlayerStatInputChange); // Use 'change' for checkbox
        isPercentCheckbox.addEventListener('change', handlePlayerStatInputChange); // Use 'change' for checkbox

        durationInput.removeEventListener('input', handlePlayerStatInputChange);
        durationInput.addEventListener('input', handlePlayerStatInputChange);

        typeSelect.removeEventListener('change', handlePlayerStatInputChange);
        typeSelect.addEventListener('change', handlePlayerStatInputChange);

        appliesToSelect.removeEventListener('change', handlePlayerStatInputChange);
        appliesToSelect.addEventListener('change', handlePlayerStatInputChange);

        removeButton.removeEventListener('click', removeTemporaryEffect);
        removeButton.addEventListener('click', removeTemporaryEffect);
    });

    // Remove any excess divs if the number of effects has decreased
    while (tempEffectsList.children.length > manualEffects.length) {
        tempEffectsList.removeChild(tempEffectsList.lastChild);
    }

    // Restore focus
    if (focusedElementDataset) {
        const inputToRefocus = tempEffectsList.querySelector(
            `[data-stat-name="${focusedElementDataset.statName}"][data-effect-index="${focusedElementDataset.effectIndex}"][data-category="${focusedElementDataset.category}"][data-field="${focusedElementDataset.field}"]`
        );
        if (inputToRefocus) {
            inputToRefocus.focus();
            // Only attempt to setSelectionRange if the input type supports it
            if (inputToRefocus.type !== 'number' && inputToRefocus.tagName !== 'SELECT' && inputToRefocus.type !== 'checkbox') {
                inputToRefocus.setSelectionRange(focusedElement.selectionStart, focusedElement.selectionEnd);
            }
        }
    }
}

export function openTemporaryEffectsModal() {
    refreshTemporaryModalTitle();
    renderTemporaryEffects(currentStatForTempEffects);
    const tempEffectsModal = document.getElementById('temp-effects-modal');
    if (tempEffectsModal) tempEffectsModal.classList.remove('hidden');
}

export function refreshTemporaryModalTitle() {
    console.log("refresh");
    const tempEffectsModalTitle = document.getElementById('temp-effects-modal-title');
    if (tempEffectsModalTitle && tempEffectsModalTitleStatTotal != "") {
        const statTotalEl = document.getElementById(tempEffectsModalTitleStatTotal);
        const totalVal = statTotalEl ? statTotalEl.value : '';
        tempEffectsModalTitle.textContent = `Temporary Effects for ${currentStatDisplayNameForTempEffects} (${totalVal})`;
    }
}

/**
 * Closes the temporary effects modal.
 */
export function closeTemporaryEffectsModal() {
    const tempEffectsModal = document.getElementById('temp-effects-modal');
    if (tempEffectsModal) tempEffectsModal.classList.add('hidden');
    currentStatForTempEffects = null;
    updateDOM(); // Re-render the main stats table to reflect any changes in totals
}

export function setTempEffectsStatContext(statName, displayName, statDisplayTotal) {
    currentStatForTempEffects = statName;
    currentStatDisplayNameForTempEffects = displayName;
    tempEffectsModalTitleStatTotal = statDisplayTotal;
}

/**
 * Adds a new temporary effect to the current stat.
 */
export function addManualTemporaryEffect() {
    if (currentStatForTempEffects) {
        // Initialize new effect with default type and appliesTo
        addTemporaryEffect(character, 'manual', { name: 'New Effect', statsAffected: [currentStatForTempEffects], values: [0], isPercent: false, duration: 1, type: '+', appliesTo: 'total' }, 1);
        renderTemporaryEffects(currentStatForTempEffects);
        // If the stat is Health, Mana, RacialPower, totalDefense, or totalMagicDefense, recalculate its value
        if (currentStatForTempEffects === 'Health' || currentStatForTempEffects === 'Mana' || currentStatForTempEffects === 'RacialPower' || currentStatForTempEffects === 'totalDefense' || currentStatForTempEffects === 'totalMagicDefense') {
            recalculateSmallUpdateCharacter(character, true);
        } else { // For rollStats, update their total
            document.getElementById(`${currentStatForTempEffects}-total`).value = calculateRollStatTotal(character, currentStatForTempEffects);
        }
        setHasUnsavedChanges(true);
    }
}

/**
 * Removes a temporary effect from a stat.
 * @param {Event} event The click event from the remove button.
 */
export function removeTemporaryEffect(event) {
    const statName = event.target.dataset.statName;
    const category =  event.target.dataset.category;
    const effectIndex = parseInt(event.target.dataset.effectIndex);

    if (statName && character[statName] && character[statName].temporaryEffects[category][effectIndex] !== undefined) {
        character[statName].temporaryEffects[category].splice(effectIndex, 1);
        renderTemporaryEffects(statName); // This will now preserve focus
        // If the stat is Health, Mana, RacialPower, totalDefense, or totalMagicDefense, recalculate its value
        if (statName === 'Health' || statName === 'Mana' || statName === 'RacialPower' || statName === 'totalDefense' || statName === 'totalMagicDefense') {
            recalculateSmallUpdateCharacter(character, true);
        } else { // For rollStats, update their total
            document.getElementById(`${statName}-total`).value = calculateRollStatTotal(character, statName);
        }
        setHasUnsavedChanges(true);
    }
}

/**
 * Decrements the duration of all temporary buffs and removes expired ones.
 */
export function endTurn() {
    showConfirmationModal("Are you sure you want to end the turn? This will reduce the duration of all temporary effects.", () => {
        const permHealthRegenActive = character.permHealthRegenActive > 0;
        const permManaRegenActive = character.permManaRegenActive > 0;
        const notFighting = !character.states['In Fight'];

        let naturalHealthRegen = 0;
        let naturalManaRegen = notFighting || permManaRegenActive ? character.naturalManaRegen.value * character.naturalManaRegen.racialChange  * character.maxMana : 0;

        if (notFighting || permHealthRegenActive) {
            if (permHealthRegenActive || !(character.states['Bleeding'] || character.states['Taking Damage'])) {
                naturalHealthRegen = character.naturalHealthRegen.value * character.naturalHealthRegen.racialChange * character.maxHealth;
            }
        }

        if (character.states['Sleeping']) {
            naturalHealthRegen *= 2;
            naturalManaRegen *= 2;
        }

        character.Health.value += naturalHealthRegen;
        character.Mana.value += naturalManaRegen;

        if (character.uniqueIdentifiers['Dragon’s Metabolism'] && !character.states['Active Racial Skill']) {
            character.Health.value += character.uniqueIdentifiers['Dragon’s Metabolism'].values[0] * character.maxHealth;
        }

        const maxRacialPower = document.getElementById('maxRacialPower').value;
        let data = character.uniqueIdentifiers['Spatial Capture'];
        let racialPowerRegen = data ? data.values[0] + character.level : character.naturalRacialPowerRegen.value * character.naturalRacialPowerRegen.racialChange * maxRacialPower;
        character.RacialPower.value += racialPowerRegen;

        if (character.uniqueIdentifiers['Absorption']) {
            data = character.uniqueIdentifiers['Absorption'];
            racialPowerRegen = data.values[0];

            if (character.states['Hands Covered'] || character.states['Feets Covered']) {
                racialPowerRegen = data.values[1];
            }

            character.RacialPower.value += racialPowerRegen * maxRacialPower;
        }
        character.RacialPower.value = Math.min(character.RacialPower.value, maxRacialPower);

        let effectsChanged = false;
        // Iterate over all character properties that might have temporary effects
        // This includes rollStats, Health, Mana, RacialPower, totalDefense, and totalMagicDefense
        const statsWithEffects = [...ExternalDataManager.rollStats, 'Health', 'Mana', 'RacialPower', 'totalDefense', 'totalMagicDefense', 'naturalHealthRegen', 'naturalManaRegen', 'naturalRacialPowerRegen'];

        statsWithEffects.forEach(statName => {
            if (character[statName] && character[statName].temporaryEffects) {

                const temporaryEffects = character[statName].temporaryEffects;
                for (const category in temporaryEffects) {
                    const categoryTemporaryEffects = temporaryEffects[category];
                    if (Array.isArray(categoryTemporaryEffects)) {
                        const initialLength = categoryTemporaryEffects.length;

                        // Decrement duration and filter out expired effects
                        character[statName].temporaryEffects[category] = categoryTemporaryEffects.filter(effect => {
                            if (effect.duration !== undefined && effect.duration !== null) {
                                effect.duration--;
                            }
                            return effect.duration === undefined || effect.duration > 0;
                        });

                        if (character[statName].temporaryEffects[category].length !== initialLength) {
                            effectsChanged = true;
                        }
                    }
                }
            }
        });


        recalculateCharacterDerivedProperties(character); // Recalculate all derived properties
        updateDOM(); // Update the UI to reflect changes
        setHasUnsavedChanges(true);

        if (effectsChanged) {
            showStatusMessage("Turn ended. Temporary effects updated.");
        } else {
            showStatusMessage("No temporary effects to update.", false);
        }
    });
}

export function updatePanelPosition(panel, layout) {
    if (panel) {
        panel.style.left = `${layout.x * 100}vw`;
        panel.style.top = `${layout.y * 100}vh`;
        panel.style.width = `${layout.width * 100}vw`;
        panel.style.height = `${layout.height * 100}vh`;
    }
}

/**
 * Updates the personal notes panel's position and size based on stored percentage values.
 * This function should be called on window resize.
 */
export function updatePanelsPosition() {
    const personalNotesPanel = document.getElementById('personal-notes-panel');
    updatePanelPosition(personalNotesPanel, character.layouts.personalNotes);
    const backstoryPanel = document.getElementById('backstory-content');
    updatePanelPosition(backstoryPanel, character.layouts.backstory);
}
export function closeDamageModal() {
    const modal = document.getElementById("take-damage-modal");
    if (modal) modal.classList.add("hidden");
}

export function takeTrueDamage(value) {
    const setHealthCheckbox = document.getElementById("set-health-checkbox");
    if (setHealthCheckbox && setHealthCheckbox.checked) {
        character.Health.value = Math.min(value, character.maxHealth);
    } else {
        character.Health.value = Math.max(0, character.Health.value - value);
    }
}

export function takeDamage() {
    const damageTakeAmountInput = document.getElementById("take-damage-amount");
    const setTakeTrueDamage = document.getElementById("set-take-true-damage-checkbox");
    const setHealthCheckbox = document.getElementById("set-health-checkbox");

    if (!damageTakeAmountInput) return;
    const value = parseInt(damageTakeAmountInput.value, 10);
    if (isNaN(value)) return alert("Please enter a valid number");

    if (setTakeTrueDamage && setTakeTrueDamage.checked) {
        takeTrueDamage(value);
    } else if (character.uniqueIdentifiers['Clay Skin'] && character.RacialPower.value > 0) {
        let damage = value;

        if (setHealthCheckbox && setHealthCheckbox.checked) {
            damage = character.Health.value - value;
        }

        const calculation = character.RacialPower.value - damage;
        const newRacialPower = Math.max(0, calculation);
        character.RacialPower.value = newRacialPower;

        if (newRacialPower == 0)
            character.Health.value = Math.max(0, character.Health.value + calculation);
    }
    else {
        takeTrueDamage(value);
    }

    const healthInput = document.getElementById('Health');
    const manaInput = document.getElementById('Mana');
    const racialPowerInput = document.getElementById('RacialPower');

    if (healthInput) healthInput.value = character.Health.value;
    if (manaInput) manaInput.value = character.Mana.value;
    if (racialPowerInput) racialPowerInput.value = character.RacialPower.value;
    setHasUnsavedChanges(true);
    closeDamageModal();
}