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

export function updateAllTempEffectsButtons() {
    updateStaticTempEffectsButton('Health', 'Health');
    updateStaticTempEffectsButton('Mana', 'Mana');
    updateStaticTempEffectsButton('RacialPower', 'Racial Power');
    updateStaticTempEffectsButton('totalDefense', 'Total defense');
    updateStaticTempEffectsButton('totalMagicDefense', 'Total Magic Defense');
    if (ExternalDataManager && ExternalDataManager.rollStats) {
        ExternalDataManager.rollStats.forEach(statName => {
            updateStaticTempEffectsButton(statName, statName);
        });
    }
}

/**
 * Highlights Health, Mana, RacialPower, totalDefense, totalMagicDefense, and attribute roll stats input fields on the sheet if they have active effects.
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

    if (ExternalDataManager && ExternalDataManager.rollStats) {
        ExternalDataManager.rollStats.forEach(statName => {
            const totalEl = document.getElementById(`${statName}-total`);
            if (totalEl) {
                const hasEff = getCategoriesTemporaryEffects(character, statName).length > 0;
                if (hasEff) {
                    totalEl.classList.add('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
                } else {
                    totalEl.classList.remove('border-indigo-400', 'dark:border-indigo-500', 'bg-indigo-50/20');
                }
            }
        });
    }
}

function formatStatDisplayName(stat) {
    const map = {
        'Health': 'Health',
        'Mana': 'Mana',
        'RacialPower': 'Racial Power',
        'totalDefense': 'Total Physical Defense',
        'totalMagicDefense': 'Total Magic Defense'
    };
    if (map[stat]) return map[stat];
    return stat.replace(/([A-Z])/g, ' $1').trim();
}

/**
 * Dynamically renders global active temporary effects and active permanent effects summary lists.
 */
export function renderActiveEffectsSummary() {
    updateAllTempEffectsButtons();
    highlightStatsWithActiveEffects();

    const tempContainer = document.getElementById('active-temp-effects-summary-list') || document.getElementById('active-effects-summary-list');
    const permContainer = document.getElementById('active-perm-effects-summary-list');

    const statsWithEffects = [...ExternalDataManager.rollStats, 'Health', 'Mana', 'RacialPower', 'totalDefense', 'totalMagicDefense'];
    const tempEffects = [];
    const permEffects = [];

    statsWithEffects.forEach(statName => {
        if (character[statName] && character[statName].temporaryEffects) {
            const categories = character[statName].temporaryEffects;
            for (const category in categories) {
                const categoryEffects = categories[category];
                if (Array.isArray(categoryEffects)) {
                    categoryEffects.forEach(effect => {
                        const item = {
                            statName: statName,
                            category: category,
                            effect: effect
                        };
                        const isPerm = (effect.duration === Infinity || effect.duration === 'Infinity' || effect.isInfinite === true);
                        if (isPerm) {
                            permEffects.push(item);
                        } else {
                            tempEffects.push(item);
                        }
                    });
                }
            }
        }
    });

    // Update Badges
    const tempBadge = document.getElementById('global-active-temp-effects-count-badge') || document.getElementById('global-active-effects-count-badge');
    if (tempBadge) {
        if (tempEffects.length > 0) {
            tempBadge.textContent = tempEffects.length;
            tempBadge.classList.remove('hidden');
        } else {
            tempBadge.classList.add('hidden');
        }
    }

    const permBadge = document.getElementById('global-active-perm-effects-count-badge');
    if (permBadge) {
        if (permEffects.length > 0) {
            permBadge.textContent = permEffects.length;
            permBadge.classList.remove('hidden');
        } else {
            permBadge.classList.add('hidden');
        }
    }

    // Helper to render an effects list
    const renderList = (container, effectsList, isPermList) => {
        if (!container) return;
        container.innerHTML = '';

        if (effectsList.length === 0) {
            container.innerHTML = `<p class="text-gray-500 dark:text-gray-400 text-sm">No active ${isPermList ? 'permanent' : 'temporary'} effects.</p>`;
            return;
        }

        effectsList.forEach(item => {
            const effect = item.effect;
            const statName = item.statName;
            const val = effect.values ? effect.values[0] : 0;
            const isPercent = effect.isPercent ? '%' : '';
            const operator = effect.type || '+';
            const name = effect.name || 'Unnamed Effect';
            const appliesTo = effect.appliesTo || 'total';
            const durationText = isPermList ? 'Permanent' : `${effect.duration} turns left`;

            const card = document.createElement('div');
            card.className = 'flex items-center justify-between p-3 border border-gray-100 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150';

            const nameColorClass = isPermList ? 'text-purple-600 dark:text-purple-400' : 'text-indigo-600 dark:text-indigo-400';
            const badgeColorClass = isPermList ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';

            const formattedStat = formatStatDisplayName(statName);

            card.innerHTML = `
                <div class="flex-grow text-sm text-gray-700 dark:text-gray-300">
                    <div class="flex flex-col sm:flex-row sm:items-center gap-x-2">
                        <span class="font-bold ${nameColorClass}">${name}</span> 
                        <span class="text-xs text-gray-500 dark:text-gray-400">(${formattedStat})</span>
                    </div>
                    <div class="text-xs text-gray-600 dark:text-gray-300 mt-1">
                        ${operator}${val}${isPercent} (applies to ${appliesTo})
                    </div>
                </div>
                <div class="flex items-center gap-3">
                    <span class="px-2 py-0.5 rounded text-xs font-semibold ${badgeColorClass}">
                        ${durationText}
                    </span>`;

            if (!isPermList || item.category != character.race) {
                const statName = item.statName;
                const category = item.category;
                const effectIndex = character[statName].temporaryEffects[category].indexOf(effect);

                card.innerHTML += 
                    `<button type="button" data-stat-name="${statName}" data-category="${category}" data-effect-index="${effectIndex}" class="edit-summary-effect-btn text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/20 px-2 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-950/40 transition-colors duration-150 cursor-pointer">
                        Edit
                    </button>
                    <button type="button" data-stat-name="${statName}" data-category="${category}" data-effect-index="${effectIndex}" class="remove-summary-effect-btn text-xs font-bold text-red-500 hover:text-red-700 dark:hover:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors duration-150 cursor-pointer">
                        Remove
                    </button>`;
            }

            card.innerHTML += `</div>`;
            container.appendChild(card);
        });

        container.querySelectorAll('.edit-summary-effect-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const statName = event.currentTarget.dataset.statName;
                const category = event.currentTarget.dataset.category;
                const effectIndex = parseInt(event.currentTarget.dataset.effectIndex);

                if (statName && character[statName] && character[statName].temporaryEffects?.[category]?.[effectIndex] !== undefined) {
                    openDirectEditEffectModal(statName, category, effectIndex, isPermList);
                }
            });
        });

        container.querySelectorAll('.remove-summary-effect-btn').forEach(btn => {
            btn.addEventListener('click', (event) => {
                const statName = event.currentTarget.dataset.statName;
                const category = event.currentTarget.dataset.category;
                const effectIndex = parseInt(event.currentTarget.dataset.effectIndex);

                if (statName && character[statName] && character[statName].temporaryEffects?.[category]?.[effectIndex] !== undefined) {
                    character[statName].temporaryEffects[category].splice(effectIndex, 1);
                    if (['Health', 'Mana', 'RacialPower', 'totalDefense', 'totalMagicDefense'].includes(statName)) {
                        recalculateSmallUpdateCharacter(character, true);
                    } else {
                        recalculateCharacterDerivedProperties(character, true);
                    }
                    updateDOM();
                    setHasUnsavedChanges(true);
                    if (typeof showStatusMessage === 'function') {
                        showStatusMessage(`Removed ${isPermList ? 'permanent' : 'temporary'} effect.`);
                    }
                }
            });
        });
    };

    renderList(tempContainer, tempEffects, false);
    renderList(permContainer, permEffects, true);
}

export function openDirectAddEffectModal(isPermanent = false, defaultStat = null) {
    const modal = document.getElementById('direct-add-effect-modal');
    if (!modal) return;

    const titleEl = document.getElementById('direct-add-effect-modal-title');
    const isPermHiddenInput = document.getElementById('direct-effect-is-permanent-type');
    const isEditModeInput = document.getElementById('direct-effect-is-edit-mode');
    const editStatInput = document.getElementById('direct-effect-edit-stat-name');
    const editCategoryInput = document.getElementById('direct-effect-edit-category');
    const editIndexInput = document.getElementById('direct-effect-edit-index');

    const statSelect = document.getElementById('direct-effect-stat-select');
    const durationTypeSelect = document.getElementById('direct-effect-duration-type');
    const durationContainer = document.getElementById('direct-effect-duration-container');
    const submitBtn = document.getElementById('submit-direct-add-effect-btn');

    if (isPermHiddenInput) isPermHiddenInput.value = isPermanent ? 'true' : 'false';
    if (isEditModeInput) isEditModeInput.value = 'false';
    if (editStatInput) editStatInput.value = '';
    if (editCategoryInput) editCategoryInput.value = '';
    if (editIndexInput) editIndexInput.value = '';

    if (durationTypeSelect) durationTypeSelect.value = isPermanent ? 'permanent' : 'temporary';

    if (titleEl) {
        titleEl.textContent = isPermanent ? 'Add Active Permanent Effect' : 'Add Active Temporary Effect';
        titleEl.className = isPermanent ? 'text-2xl font-semibold mb-4 text-purple-600 dark:text-purple-300' : 'text-2xl font-semibold mb-4 text-indigo-600 dark:text-indigo-300';
    }

    if (submitBtn) {
        submitBtn.textContent = 'Add Effect';
        submitBtn.className = isPermanent ? 'px-4 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 text-sm shadow cursor-pointer' : 'px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 text-sm shadow cursor-pointer';
    }

    if (durationContainer) {
        if (isPermanent) {
            durationContainer.classList.add('hidden');
        } else {
            durationContainer.classList.remove('hidden');
        }
    }

    // Populate stat options
    if (statSelect) {
        statSelect.innerHTML = '';
        const allStats = [...ExternalDataManager.rollStats, 'Health', 'Mana', 'RacialPower', 'totalDefense', 'totalMagicDefense'];
        allStats.forEach(stat => {
            const option = document.createElement('option');
            option.value = stat;
            option.textContent = formatStatDisplayName(stat);
            if (defaultStat && stat === defaultStat) option.selected = true;
            statSelect.appendChild(option);
        });
        if (defaultStat) statSelect.value = defaultStat;
    }

    // Reset inputs
    const nameInput = document.getElementById('direct-effect-name');
    const valInput = document.getElementById('direct-effect-value');
    const isPercentCheckbox = document.getElementById('direct-effect-is-percent');
    const typeSelect = document.getElementById('direct-effect-type');
    const appliesToSelect = document.getElementById('direct-effect-applies-to');
    const durationInput = document.getElementById('direct-effect-duration');

    if (nameInput) nameInput.value = '';
    if (valInput) valInput.value = 1;
    if (isPercentCheckbox) isPercentCheckbox.checked = false;
    if (typeSelect) typeSelect.value = '+';
    if (appliesToSelect) appliesToSelect.value = 'total';
    if (durationInput) durationInput.value = 1;

    modal.classList.remove('hidden');
}

export function openDirectEditEffectModal(statName, category, effectIndex, isPermanentParam = false) {
    const modal = document.getElementById('direct-add-effect-modal');
    if (!modal) return;

    const effect = character[statName]?.temporaryEffects?.[category]?.[effectIndex];
    if (!effect) return;

    const effectIsPermanent = (effect.duration === Infinity || effect.duration === 'Infinity' || effect.isInfinite === true || isPermanentParam);

    const titleEl = document.getElementById('direct-add-effect-modal-title');
    const isPermHiddenInput = document.getElementById('direct-effect-is-permanent-type');
    const isEditModeInput = document.getElementById('direct-effect-is-edit-mode');
    const editStatInput = document.getElementById('direct-effect-edit-stat-name');
    const editCategoryInput = document.getElementById('direct-effect-edit-category');
    const editIndexInput = document.getElementById('direct-effect-edit-index');

    const statSelect = document.getElementById('direct-effect-stat-select');
    const durationTypeSelect = document.getElementById('direct-effect-duration-type');
    const durationContainer = document.getElementById('direct-effect-duration-container');
    const submitBtn = document.getElementById('submit-direct-add-effect-btn');

    if (isEditModeInput) isEditModeInput.value = 'true';
    if (editStatInput) editStatInput.value = statName;
    if (editCategoryInput) editCategoryInput.value = category;
    if (editIndexInput) editIndexInput.value = effectIndex;
    if (isPermHiddenInput) isPermHiddenInput.value = effectIsPermanent ? 'true' : 'false';

    if (durationTypeSelect) durationTypeSelect.value = effectIsPermanent ? 'permanent' : 'temporary';

    if (titleEl) {
        titleEl.textContent = effectIsPermanent ? 'Edit Active Permanent Effect' : 'Edit Active Temporary Effect';
        titleEl.className = effectIsPermanent ? 'text-2xl font-semibold mb-4 text-purple-600 dark:text-purple-300' : 'text-2xl font-semibold mb-4 text-indigo-600 dark:text-indigo-300';
    }

    if (submitBtn) {
        submitBtn.textContent = 'Save Changes';
        submitBtn.className = effectIsPermanent ? 'px-4 py-2 bg-purple-600 text-white font-semibold rounded-md hover:bg-purple-700 text-sm shadow cursor-pointer' : 'px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 text-sm shadow cursor-pointer';
    }

    if (durationContainer) {
        if (effectIsPermanent) {
            durationContainer.classList.add('hidden');
        } else {
            durationContainer.classList.remove('hidden');
        }
    }

    // Populate stat options
    if (statSelect) {
        statSelect.innerHTML = '';
        const allStats = [...ExternalDataManager.rollStats, 'Health', 'Mana', 'RacialPower', 'totalDefense', 'totalMagicDefense'];
        allStats.forEach(s => {
            const option = document.createElement('option');
            option.value = s;
            option.textContent = formatStatDisplayName(s);
            if (s === statName) option.selected = true;
            statSelect.appendChild(option);
        });
    }

    // Pre-fill inputs
    const nameInput = document.getElementById('direct-effect-name');
    const valInput = document.getElementById('direct-effect-value');
    const isPercentCheckbox = document.getElementById('direct-effect-is-percent');
    const typeSelect = document.getElementById('direct-effect-type');
    const appliesToSelect = document.getElementById('direct-effect-applies-to');
    const durationInput = document.getElementById('direct-effect-duration');

    if (nameInput) nameInput.value = effect.name || '';
    if (valInput) valInput.value = (effect.values && effect.values.length > 0) ? effect.values[0] : 0;
    if (isPercentCheckbox) isPercentCheckbox.checked = !!effect.isPercent;
    if (typeSelect) typeSelect.value = effect.type || '+';
    if (appliesToSelect) appliesToSelect.value = effect.appliesTo || 'total';
    if (durationInput) durationInput.value = (effect.duration !== Infinity && effect.duration !== 'Infinity' && effect.duration) ? effect.duration : 1;

    modal.classList.remove('hidden');
}

export function closeDirectAddEffectModal() {
    const modal = document.getElementById('direct-add-effect-modal');
    if (modal) modal.classList.add('hidden');
}

export function handleDirectAddEffectSubmit(event) {
    if (event) event.preventDefault();

    const isEditModeInput = document.getElementById('direct-effect-is-edit-mode');
    const editStatInput = document.getElementById('direct-effect-edit-stat-name');
    const editCategoryInput = document.getElementById('direct-effect-edit-category');
    const editIndexInput = document.getElementById('direct-effect-edit-index');

    const statSelect = document.getElementById('direct-effect-stat-select');
    const durationTypeSelect = document.getElementById('direct-effect-duration-type');
    const nameInput = document.getElementById('direct-effect-name');
    const valInput = document.getElementById('direct-effect-value');
    const isPercentCheckbox = document.getElementById('direct-effect-is-percent');
    const typeSelect = document.getElementById('direct-effect-type');
    const appliesToSelect = document.getElementById('direct-effect-applies-to');
    const durationInput = document.getElementById('direct-effect-duration');

    const statName = statSelect ? statSelect.value : 'Health';
    const effectName = (nameInput && nameInput.value.trim()) ? nameInput.value.trim() : 'New Effect';
    const val = valInput ? parseFloat(valInput.value) || 0 : 0;
    const isPercent = isPercentCheckbox ? isPercentCheckbox.checked : false;
    const type = typeSelect ? typeSelect.value : '+';
    const appliesTo = appliesToSelect ? appliesToSelect.value : 'total';
    const isPermanent = durationTypeSelect ? (durationTypeSelect.value === 'permanent') : false;
    const duration = isPermanent ? Infinity : (durationInput ? parseInt(durationInput.value) || 1 : 1);

    const isEditMode = isEditModeInput && isEditModeInput.value === 'true';

    const effectObj = {
        name: effectName,
        statsAffected: [statName],
        values: [val],
        isPercent: isPercent,
        type: type,
        appliesTo: appliesTo,
        duration: duration,
        isInfinite: isPermanent
    };

    if (isEditMode) {
        const oldStatName = editStatInput ? editStatInput.value : '';
        const category = editCategoryInput ? editCategoryInput.value : 'manual';
        const effectIndex = editIndexInput ? parseInt(editIndexInput.value) : -1;

        if (oldStatName && character[oldStatName] && character[oldStatName].temporaryEffects?.[category]?.[effectIndex] !== undefined) {
            if (oldStatName === statName) {
                character[statName].temporaryEffects[category][effectIndex] = effectObj;
            } else {
                character[oldStatName].temporaryEffects[category].splice(effectIndex, 1);
                addTemporaryEffect(character, category, effectObj, duration);
            }
        }
    } else {
        addTemporaryEffect(character, 'manual', effectObj, duration);
    }

    recalculateSmallUpdateCharacter(character, true);
    recalculateCharacterDerivedProperties(character, true);

    updateDOM();
    setHasUnsavedChanges(true);

    if (currentStatForTempEffects) {
        renderTemporaryEffects(currentStatForTempEffects);
        refreshTemporaryModalTitle();
    }

    if (typeof showStatusMessage === 'function') {
        showStatusMessage(`${isEditMode ? 'Updated' : 'Added'} ${isPermanent ? 'permanent' : 'temporary'} effect "${effectName}".`);
    }

    closeDirectAddEffectModal();
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
    updateAllTempEffectsButtons();

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
 * Renders the list of temporary/permanent effects for the current stat in the modal.
 * @param {string} statName The name of the stat.
 */
export function renderTemporaryEffects(statName) {
    const tempEffectsList = document.getElementById('temp-effects-list');
    if (!tempEffectsList) return;

    tempEffectsList.innerHTML = '';

    const categories = character[statName]?.temporaryEffects || {};
    const allEffectsForStat = [];

    for (const category in categories) {
        const categoryEffects = categories[category];
        if (Array.isArray(categoryEffects)) {
            categoryEffects.forEach((effect, index) => {
                allEffectsForStat.push({
                    effect,
                    category,
                    effectIndex: index
                });
            });
        }
    }

    if (allEffectsForStat.length === 0) {
        tempEffectsList.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-sm">No effects on this stat yet.</p>';
        return;
    }

    allEffectsForStat.forEach(item => {
        const effect = item.effect;
        const category = item.category;
        const effectIndex = item.effectIndex;

        const isPerm = (effect.duration === Infinity || effect.duration === 'Infinity' || effect.isInfinite === true);
        const durationText = isPerm ? 'Permanent' : `${effect.duration} turns left`;
        const nameColorClass = isPerm ? 'text-purple-600 dark:text-purple-400' : 'text-indigo-600 dark:text-indigo-400';
        const badgeColorClass = isPerm ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300';

        const val = (effect.values && effect.values.length > 0) ? effect.values[0] : 0;
        const isPercent = effect.isPercent ? '%' : '';
        const operator = effect.type || '+';
        const name = effect.name || 'Unnamed Effect';
        const appliesTo = effect.appliesTo || 'total';

        const card = document.createElement('div');
        card.className = 'flex items-center justify-between p-3 border border-gray-100 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-150 mb-2';

        card.innerHTML = `
            <div class="flex-grow text-sm text-gray-700 dark:text-gray-300">
                <div class="flex flex-col sm:flex-row sm:items-center gap-x-2">
                    <span class="font-bold ${nameColorClass}">${name}</span> 
                    <span class="text-xs text-gray-500 dark:text-gray-400">(${formatStatDisplayName(statName)})</span>
                </div>
                <div class="text-xs text-gray-600 dark:text-gray-300 mt-1">
                    ${operator}${val}${isPercent} (applies to ${appliesTo})
                </div>
            </div>
            <div class="flex items-center gap-3">
                <span class="px-2 py-0.5 rounded text-xs font-semibold ${badgeColorClass}">
                    ${durationText}
                </span>`;

        if (!isPerm || category !== character.race) {
            card.innerHTML += `
                <button type="button" data-stat-name="${statName}" data-category="${category}" data-effect-index="${effectIndex}" class="edit-temp-modal-effect-btn text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/20 px-2 py-1 rounded hover:bg-indigo-100 dark:hover:bg-indigo-950/40 transition-colors duration-150 cursor-pointer">
                    Edit
                </button>
                <button type="button" data-stat-name="${statName}" data-category="${category}" data-effect-index="${effectIndex}" class="remove-temp-modal-effect-btn text-xs font-bold text-red-500 hover:text-red-700 dark:hover:text-red-400 bg-red-50 dark:bg-red-950/20 px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors duration-150 cursor-pointer">
                    Remove
                </button>`;
        }

        card.innerHTML += `</div>`;
        tempEffectsList.appendChild(card);
    });

    tempEffectsList.querySelectorAll('.edit-temp-modal-effect-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sName = e.currentTarget.dataset.statName;
            const cat = e.currentTarget.dataset.category;
            const idx = parseInt(e.currentTarget.dataset.effectIndex);
            if (sName && character[sName] && character[sName].temporaryEffects?.[cat]?.[idx] !== undefined) {
                openDirectEditEffectModal(sName, cat, idx);
            }
        });
    });

    tempEffectsList.querySelectorAll('.remove-temp-modal-effect-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const sName = e.currentTarget.dataset.statName;
            const cat = e.currentTarget.dataset.category;
            const idx = parseInt(e.currentTarget.dataset.effectIndex);
            if (sName && character[sName] && character[sName].temporaryEffects?.[cat]?.[idx] !== undefined) {
                character[sName].temporaryEffects[cat].splice(idx, 1);
                if (['Health', 'Mana', 'RacialPower', 'totalDefense', 'totalMagicDefense'].includes(sName)) {
                    recalculateSmallUpdateCharacter(character, true);
                } else {
                    recalculateCharacterDerivedProperties(character, true);
                }
                updateDOM();
                setHasUnsavedChanges(true);
                renderTemporaryEffects(sName);
                refreshTemporaryModalTitle();
            }
        });
    });
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