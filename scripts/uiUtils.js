import { ExternalDataManager } from './externalDataManager.js'
import { SECTION_VISIBILITY, HTML_VISIBILITY } from './constants.js';
import { character, setHasUnsavedChanges } from './state.js';
import { getCategoriesTemporaryEffects } from './formulas.js'

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
}

/**
 * Dynamically renders a global active temporary effects summary list on the main sheet view.
 */
export function renderActiveEffectsSummary() {
    const listContainer = document.getElementById('active-effects-summary-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const statsWithEffects = [...ExternalDataManager.rollStats, 'Health', 'Mana', 'RacialPower', 'totalDefense'];
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
                </span>
                <button type="button" data-stat-name="${statName}" data-category="${item.category}" data-effect-index="${character[statName].temporaryEffects[item.category].indexOf(effect)}" class="remove-summary-effect-btn text-xs font-bold text-red-500 hover:text-red-700 dark:hover:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors duration-150">
                    Remove
                </button>
            </div>
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