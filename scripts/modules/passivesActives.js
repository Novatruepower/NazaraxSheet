import { ExternalDataManager } from '../externalDataManager.js';
import { DEFAULT_RACIAL_POINT_SCALE } from './constants.js';
import { character, hasUnsavedChanges, setHasUnsavedChanges } from './state.js';
import { toggleHtml, updateSpecificHtmlVisibility, showStatusMessage, updateDOM } from './uiUtils.js';
import { addTemporaryEffect, removeTemporaryEffectByCategory, removeTemporaryEffectByIdentifier } from "./formulas.js";
import { recalculateCharacterDerivedProperties } from './characterState.js';

function pushRaceFootNotes(race, dataKey, numbersFootNotes) {
    const raceData = ExternalDataManager.getRaceData(race);

    if (raceData && raceData.foot_notes && raceData.foot_notes[dataKey]) {
        const Keys = Object.keys(raceData.foot_notes[dataKey]);
        Keys.forEach(key => {
            numbersFootNotes[key] = dataKey;
        });
    }
}

function getTitle(title, numbersFootNotes, id) {
    const keys = Object.keys(numbersFootNotes);
    let notes = keys.join('</a> <a>');

    if (notes.length > 0)
        notes = `<a>${notes}</a>`;

    notes = notes.replace(/<a>(\d+)<\/a>/g, (_, value) => {
        return ExternalDataManager.getHrefFootNotes(id, value);
    });

    return `${title}${notes}`;
}

function getAvailablePoints(abilityData, currentLevel) {
    const levels = abilityData.levels; // Access directly, not through .abilities
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

function filterFromArrayStartIndex(arr, startIndex, predicate) {
  const result = [];
  for (let i = startIndex; i < arr.length; i++) {
    if (predicate(arr[i], i, arr)) {
      result.push(arr[i]);
    }
  }
  return result;
}

function renderContainer(passivesContainer, title, id, numbersFootNotes) {
    const race = character.race;
    const listId = `${race}-${id}-list`;
    passivesContainer.classList.remove('hidden');
    passivesContainer.innerHTML = `
    <div class="flex items-center justify-between p-3 bg-gray-100 dark:bg-gray-800 rounded-md shadow-sm mb-4">
        <h4 class="text-lg font-bold text-gray-900 dark:text-white">${race} ${getTitle(title, numbersFootNotes, listId)}</h4>
        <button class="toggle-container-btn p-1 rounded-md text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors duration-200" data-target="${race}-${id}-list">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
        </svg>
        </button>
    </div>
    <div id="${listId}" class="space-y-4 px-2">
    </div>
    `;
}

/**
 * Handles the application or removal of a racial passive choice, including stat effects and flags.
 * @param {string} category The category (e.g., 'Demi-humans', 'Mutant').
 * @param {object} newAbilityData The data for the new choice to be applied (or null/undefined to clear).
 * Expected properties: { type, calc?, value?, statName?, label?, level?, unique? }
 */
function processRacialRegularPassiveChange(newAbilityData) {
    const race = character.race;

    removeTemporaryEffectByIdentifier(newAbilityData, race);

    if (newAbilityData.identifier) {
        character.uniqueIdentifiers[newAbilityData.identifier] = newAbilityData;
    }

    if (newAbilityData.formulas && newAbilityData.formulas.length > 0) {
        for (const formula of newAbilityData.formulas) {
            if (formula.statsAffected) {
                if(newAbilityData.identifier) {
                    formula['identifier'] = newAbilityData.identifier;
                }

                if(!formula['name'] && newAbilityData.name) {
                    formula['name'] = newAbilityData.name;
                }

                if (!formula['conditions'] && Array.isArray(newAbilityData['conditions'])) {
                    formula['conditions'] = newAbilityData['conditions'];
                }

                addTemporaryEffect(character, race, formula, Infinity);
            }
        }
    }

    recalculateCharacterDerivedProperties(character, true);
    setHasUnsavedChanges(true);
}

function renderRegularPassives(regularPassives, regularPassivesList, numbersFootNotes) {
    for (const abilityKey in regularPassives) {
        if (regularPassives.hasOwnProperty(abilityKey)) {
            const abilityData = regularPassives[abilityKey];
            const abilityTarget = abilityData.identifier;

            const abilityWrapper = document.createElement('div');
            abilityWrapper.className = 'group bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md shadow-sm transition hover:shadow-md p-4 space-y-2';

            const abilityHeader = document.createElement('div');
            abilityHeader.className = 'flex items-center justify-between';

            const abilityTitle = document.createElement('h2');
            abilityTitle.className = 'text-base font-semibold text-gray-800 dark:text-gray-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors';
            abilityTitle.textContent = abilityData.name;

            const toggableBtn = document.createElement('button');
            toggableBtn.className = 'toggle-element-btn p-1 rounded-md text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition duration-200';
            toggableBtn.dataset.target = abilityTarget;
            toggableBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
            `;

            abilityHeader.appendChild(abilityTitle);
            abilityHeader.appendChild(toggableBtn);

            const abilityDescription = document.createElement('p');
            abilityDescription.innerHTML = ExternalDataManager.formatHrefFootNotes(abilityData.description, regularPassivesList, abilityData.foot_notes);
            abilityDescription.id = abilityTarget;
            abilityDescription.className = 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors';

            abilityWrapper.appendChild(abilityHeader);
            abilityWrapper.appendChild(abilityDescription);
            regularPassivesList.appendChild(abilityWrapper);

            processRacialRegularPassiveChange(abilityData);

            if (abilityData.foot_notes) {
                abilityData.foot_notes.forEach(key => {
                    if (abilityData.sourceRace) {
                        numbersFootNotes[key] = { race: abilityData.sourceRace, category: 'passives', key };
                    } else if (numbersFootNotes[key] === undefined) {
                        numbersFootNotes[key] = true;
                    }
                });
            }
        }
    }
}

function renderFootNotes(race, numbersFootNotes, container) {
    const dataKeys = Object.keys(numbersFootNotes);
    if (dataKeys.length > 0) {
        const footNotesHTML = document.createElement('ul');
        const footNotesData = ExternalDataManager.getRaceFootNotes(race);
        const dices = ExternalDataManager.getRaceDices(race);

        dataKeys.forEach(key => {
            const footnoteId = `${container.id}-foot_notes-${key}`;
            const footnoteParaId = 'paragraphe-' + footnoteId;
            const toggableBtn = document.createElement('button');
            toggableBtn.className = 'toggle-element-btn p-1 rounded-md text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition duration-200';
            toggableBtn.dataset.target = footnoteParaId;
            toggableBtn.innerHTML = `
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
            `;

            const element = document.createElement('li');
            element.id = footnoteId;
            element.className = 'group bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md shadow-sm transition hover:shadow-md p-4 space-y-2';
            const paragraphe = document.createElement('p');
            let footNoteData = null;
            let currentDices = dices;
            if (typeof numbersFootNotes[key] === 'object' && numbersFootNotes[key] !== null) {
                const sRace = numbersFootNotes[key].race;
                const sCategory = numbersFootNotes[key].category;
                const sFootNotes = ExternalDataManager.getRaceFootNotes(sRace);
                currentDices = ExternalDataManager.getRaceDices(sRace) || dices;
                footNoteData = (sCategory && sFootNotes && sFootNotes[sCategory] && sFootNotes[sCategory][key])
                    ? sFootNotes[sCategory][key]
                    : (sFootNotes && sFootNotes[key] ? sFootNotes[key] : null);
            } else if (isNaN(numbersFootNotes[key])) {
                footNoteData = footNotesData && footNotesData[numbersFootNotes[key]] ? footNotesData[numbersFootNotes[key]][key] : null;
            } else {
                footNoteData = footNotesData ? footNotesData[key] : null;
            }

            if (footNoteData) {
                paragraphe.innerHTML = `${ExternalDataManager.formatString(footNoteData, currentDices, [])}`;
            }
            paragraphe.id = footnoteParaId;
            paragraphe.className = 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors';

            const header = document.createElement('div');
            header.className = 'flex items-center justify-between';
            const title = document.createElement('h2');
            title.className = 'footnotes text-base font-semibold text-gray-800 dark:text-gray-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors';
            title.textContent = `${key}.`;

            header.appendChild(title);
            header.appendChild(toggableBtn);
            element.appendChild(header);
            element.appendChild(paragraphe);
            footNotesHTML.appendChild(element);
        });
        container.appendChild(footNotesHTML);
    }
}

function renderRegularClassesPassives(oldClass, passivesContainer) {
    const race = character.race;
    const id = 'regular-passives';

    if (oldClass) {
        const oldRegularPassives = ExternalDataManager.getClassRegularPassives(oldClass, character.level);
        removeTemporaryEffectByCategory(oldRegularPassives, oldClass);
    }

    const regularPassives = ExternalDataManager.getClassRegularPassives(race, character.level);

    if (regularPassives && Object.keys(regularPassives).length > 0) {
        const numbersFootNotes = {};
        pushRaceFootNotes(race, 'passives', numbersFootNotes);
        renderContainer(passivesContainer, "Regular passives", id, numbersFootNotes);
        const regularPassivesList = document.getElementById(`${race}-${id}-list`);
        renderRegularPassives(regularPassives, regularPassivesList, numbersFootNotes);
        renderFootNotes(race, numbersFootNotes, regularPassivesList);
        updateSpecificHtmlVisibility('element');
    } else {
        passivesContainer.classList.add('hidden');
        passivesContainer.innerHTML = '';
    }
}

function optionChoices(race, category, option, manualPassivesList, slotId, currentUniqueIdentifier, selectedStatName, abilityData, indexLevel) {
    const choiceDiv = document.createElement('div');
    choiceDiv.className = 'flex items-center space-x-2';

    const labelText = option.label + (selectedStatName ? `: ${selectedStatName}` : '');
    let innerHTML = `
        <label for="${slotId}-stat" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-36">${labelText}</label>
        <select id="${slotId}-stat" class="stat-choice-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
            <option value="">-- Select a Stat --</option>`;

    option.applicableStats.forEach(statName => {
        const isDisabled = hasConflict(character, category, option.unique, statName, slotId);
        innerHTML += `<option value="${statName}" ${statName === selectedStatName ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}>${statName}</option>`;
    });

    innerHTML += `</select>`;

    if (selectedStatName) {
        innerHTML += `<button type="button" data-choice-id="${slotId}" data-category="${category}" data-unique-identifier="${currentUniqueIdentifier}" class="clear-${race}-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>`;
    }

    choiceDiv.innerHTML = innerHTML;
    manualPassivesList.appendChild(choiceDiv);

    const statSelect = document.getElementById(`${slotId}-stat`);
    if (statSelect) {
        statSelect.value = selectedStatName || '';
        statSelect.addEventListener('change', (e) => {
            const statToAffect = e.target.value;
            const newChoiceData = statToAffect ? {
                type: option.type,
                level: abilityData.levels ? Object.keys(abilityData.levels).map(Number).sort((a, b) => a - b)[indexLevel] : null,
                calc: option.calc,
                value: option.value,
                label: option.label,
                statName: statToAffect,
                unique: option.unique
            } : null;

            processRacialChoiceChange(category, option.unique, slotId, newChoiceData);
        });
    }
}

// Check all slots within this unique group to see if the stat is already affected by a different slot
function hasConflict(char, category, uniqueGroup, statName, slotId) {
    let conflict = false;
    if (uniqueGroup && statName && char.StatChoices[category] && char.StatChoices[category][uniqueGroup]) {
        for (const existingSlotId in char.StatChoices[category][uniqueGroup]) {
            const existingChoice = char.StatChoices[category][uniqueGroup][existingSlotId];
            if (existingChoice.statName === statName && existingSlotId !== slotId) {
                conflict = true;
                break;
            }
        }
    }

    return conflict;
}

// Check all slots within this category to see if the skill is already chosen by a different slot
function hasSkillConflict(char, category, skillName, slotId) {
    if (!skillName || !char.StatChoices || !char.StatChoices[category]) return false;
    for (const uId in char.StatChoices[category]) {
        for (const existingSlotId in char.StatChoices[category][uId]) {
            if (existingSlotId === slotId) continue;
            const choice = char.StatChoices[category][uId][existingSlotId];
            if (choice && choice.type === 'mutant_skill_choice' && choice.skillName === skillName) {
                return true;
            }
        }
    }
    return false;
}

// Retrieves all skills chosen by the Mutant race
function getMutantChosenSkills(char) {
    const skills = [];
    if (char.StatChoices && char.StatChoices['Mutant']) {
        for (const uId in char.StatChoices['Mutant']) {
            for (const slotId in char.StatChoices['Mutant'][uId]) {
                const choice = char.StatChoices['Mutant'][uId][slotId];
                if (choice && choice.type === 'mutant_skill_choice' && choice.skillName && choice.skillRace) {
                    skills.push(choice);
                }
            }
        }
    }
    return skills;
}

function isUsableApplicableStats(applicableStats, category, unique, slotId) {
    let count = 0;
    for (const statName of applicableStats) {
        if (hasConflict(character, category, unique, statName, slotId))
            ++count;
    }

    return applicableStats.length > count;
}

// Apply stat changes
function applyChoiceRacialChange(char, statName, value, calc) {
    if (ExternalDataManager.stats.includes(statName)) {
        if (calc == "mult")
            char[statName].racialChange *= value;
        else
            char[statName].racialChange += value;
    }
    else if (calc == "count")
        ++char[statName];
}

// Revert stat changes
function revertChoiceRacialChange(char, statName, choice) {
    if (ExternalDataManager.stats.includes(statName)) {
        if (choice.calc == "mult")
            char[statName].racialChange /= choice.value;
        else
            char[statName].racialChange -= choice.value;
    }
    else if (choice.calc == "count")
        --char[statName];
}

/**
 * Reverts the effects of all choices for a given category and unique identifier.
 * @param {object} char The character object.
 * @param {string} category The category (e.g., 'Demi-humans', 'Mutant').
 * @param {string} uniqueIdentifier The 'unique' value of the passive (e.g., 'Stat Adjustments', 'Mutation_Degeneration').
 */
export function handleRevertChoices(char, category, uniqueIdentifier) {
    if (char.StatChoices[category] && char.StatChoices[category][uniqueIdentifier]) {
        for (const slotId in char.StatChoices[category][uniqueIdentifier]) {
            const choice = char.StatChoices[category][uniqueIdentifier][slotId];
            if (choice.statName) {
                revertChoiceRacialChange(char, choice.statName, choice);
                if (char.StatsAffected[category] && char.StatsAffected[category][uniqueIdentifier] && char.StatsAffected[category][uniqueIdentifier][choice.statName]) {
                    char.StatsAffected[category][uniqueIdentifier][choice.statName].delete(slotId);
                    if (char.StatsAffected[category][uniqueIdentifier][choice.statName].size === 0) {
                        delete char.StatsAffected[category][uniqueIdentifier][choice.statName];
                    }
                }
            } else if (choice.type === 'mutant_skill_choice' && choice.skillName && choice.skillType === 'passive') {
                const raceData = ExternalDataManager.getRaceData(choice.skillRace);
                const rawAbility = raceData?.regularPassives?.[choice.skillName];
                if (rawAbility) {
                    removeTemporaryEffectByIdentifier({ identifier: choice.skillName, formulas: rawAbility.formulas }, category);
                }
            }
        }
        delete char.StatChoices[category][uniqueIdentifier];
    }
    if (char.StatsAffected[category]) {
        delete char.StatsAffected[category][uniqueIdentifier];
    }
}

export function removePassivesLevel() {
        const categoriesToProcess = Object.keys(character.StatChoices);
        let passivesReverted = false;

        // Iterate through a copy of categories to avoid issues with modification during iteration
        for (const category of categoriesToProcess) {
            if (!character.StatChoices[category]) continue; // Skip if category was deleted

            const uniqueIdentifiersToProcess = Object.keys(character.StatChoices[category]);
            for (const uniqueIdentifier of uniqueIdentifiersToProcess) {
                if (!character.StatChoices[category][uniqueIdentifier]) continue; // Skip if uniqueIdentifier was deleted

                const slotIdsToProcess = Object.keys(character.StatChoices[category][uniqueIdentifier]);
                for (const slotId of slotIdsToProcess) {
                    const choice = character.StatChoices[category][uniqueIdentifier][slotId];
                    // Check if the choice has a level requirement and if the new level is below it
                    if (choice && typeof choice.level === 'number' && choice.level > character.level) {
                        // Revert the effect of this specific choice directly
                        if (choice.statName) {
                            revertChoiceRacialChange(character, choice.statName, choice);
                            if (character.StatsAffected[category] && character.StatsAffected[category][uniqueIdentifier] && character.StatsAffected[category][uniqueIdentifier][choice.statName]) {
                                character.StatsAffected[category][uniqueIdentifier][choice.statName].delete(slotId);
                                if (character.StatsAffected[category][uniqueIdentifier][choice.statName].size === 0) {
                                    delete character.StatsAffected[category][uniqueIdentifier][choice.statName];
                                }
                            }
                        } else if (choice.type === 'mutant_skill_choice' && choice.skillName && choice.skillType === 'passive') {
                            const raceData = ExternalDataManager.getRaceData(choice.skillRace);
                            const rawAbility = raceData?.regularPassives?.[choice.skillName];
                            if (rawAbility) {
                                removeTemporaryEffectByIdentifier({ identifier: choice.skillName, formulas: rawAbility.formulas }, category);
                            }
                        }

                        // Remove the choice from StatChoices
                        delete character.StatChoices[category][uniqueIdentifier][slotId];
                        passivesReverted = true;
                        console.log(`Reverted passive '${choice.label}' (Level ${choice.level}) due to level decrease to ${character.level}.`);
                    }
                }
                // Clean up empty uniqueIdentifier objects
                if (Object.keys(character.StatChoices[category][uniqueIdentifier]).length === 0) {
                    delete character.StatChoices[category][uniqueIdentifier];
                }
                if (character.StatsAffected[category][uniqueIdentifier] && Object.keys(character.StatsAffected[category][uniqueIdentifier]).length === 0) {
                    delete character.StatsAffected[category][uniqueIdentifier];
                }
            }
            // Clean up empty category objects
            if (Object.keys(character.StatChoices[category]).length === 0) {
                delete character.StatChoices[category];
            }
            if (character.StatsAffected[category] && Object.keys(character.StatsAffected[category]).length === 0) {
                delete character.StatsAffected[category];
            }
        }

        if (passivesReverted) {
            showStatusMessage("Some racial passives were reverted due to level decrease.");
        }
}

/**
 * Handles the application or removal of a racial passive choice, including stat effects and flags.
 * @param {string} category The category (e.g., 'Demi-humans', 'Mutant').
 * @param {string} uniqueIdentifier The 'unique' value of the passive (e.g., 'Stat Adjustments', 'Mutation_Degeneration').
 * @param {string} slotId The unique ID of the choice slot.
 * @param {object} newChoiceData The data for the new choice to be applied (or null/undefined to clear).
 * Expected properties: { type, calc?, value?, statName?, label?, level?, unique? }
 */
function processRacialChoiceChange(category, uniqueIdentifier, slotId, newChoiceData) {
    console.log("--- processRacialChoiceChange called ---");
    console.log("Input parameters:", { category, uniqueIdentifier, slotId, newChoiceData });

    // Find previous choice across any uniqueIdentifier in this category for slotId
    let previousUid = null;
    let previousChoice = null;
    if (character.StatChoices[category]) {
        for (const uId in character.StatChoices[category]) {
            if (character.StatChoices[category][uId] && character.StatChoices[category][uId][slotId]) {
                previousUid = uId;
                previousChoice = character.StatChoices[category][uId][slotId];
                break;
            }
        }
    }

    // 1. Revert previous effect if any
    if (previousChoice && previousUid) {
        if (previousChoice.statName) {
            revertChoiceRacialChange(character, previousChoice.statName, previousChoice);
            if (character.StatsAffected[category] && character.StatsAffected[category][previousUid] && character.StatsAffected[category][previousUid][previousChoice.statName]) {
                character.StatsAffected[category][previousUid][previousChoice.statName].delete(slotId);
                if (character.StatsAffected[category][previousUid][previousChoice.statName].size === 0) {
                    delete character.StatsAffected[category][previousUid][previousChoice.statName];
                }
            }
        } else if (previousChoice.type === 'mutant_skill_choice' && previousChoice.skillName && previousChoice.skillType === 'passive') {
            const raceData = ExternalDataManager.getRaceData(previousChoice.skillRace);
            const rawAbility = raceData?.regularPassives?.[previousChoice.skillName];
            const identifier = `${previousChoice.skillRace}-${previousChoice.skillName}`;
            removeTemporaryEffectByIdentifier({ identifier: identifier, formulas: rawAbility?.formulas }, category);
            removeTemporaryEffectByIdentifier({ identifier: previousChoice.skillName, formulas: rawAbility?.formulas }, category);
        }

        delete character.StatChoices[category][previousUid][slotId];
        if (Object.keys(character.StatChoices[category][previousUid]).length === 0) {
            delete character.StatChoices[category][previousUid];
        }
        console.log(`  Removed previous choice for slot ${slotId} from group ${previousUid}.`);
    }

    // 2. Apply new choice if a valid newChoiceData is provided
    if (newChoiceData && newChoiceData.type) {
        const targetUid = uniqueIdentifier || (newChoiceData.type === 'mutant_skill_choice' ? 'mutant_skill_choice' : 'default');
        character.StatChoices[category] = character.StatChoices[category] || {};
        character.StatChoices[category][targetUid] = character.StatChoices[category][targetUid] || {};
        character.StatsAffected[category] = character.StatsAffected[category] || {};
        character.StatsAffected[category][targetUid] = character.StatsAffected[category][targetUid] || {};

        // Check for conflicts only if a stat is being affected and it's not the same slot re-selecting itself
        if (newChoiceData.statName && newChoiceData.unique && hasConflict(character, category, newChoiceData.unique, newChoiceData.statName, slotId)) {
            showStatusMessage(`'${newChoiceData.statName}' has already been affected by another choice in the '${newChoiceData.unique}' group. Please select a different stat.`, true);
            // Revert the dropdowns to previous state (if possible)
            const typeSelectElement = document.getElementById(slotId + '-type');
            const statSelectElement = document.getElementById(slotId + '-stat');
            if (typeSelectElement) typeSelectElement.value = previousChoice ? previousChoice.type : '';
            if (statSelectElement) statSelectElement.value = previousChoice ? previousChoice.statName : '';
            return; // Stop processing this choice
        }

        if (newChoiceData.type === 'mutant_skill_choice') {
            if (newChoiceData.skillName && hasSkillConflict(character, category, newChoiceData.skillName, slotId)) {
                showStatusMessage(`'${newChoiceData.skillName}' has already been chosen in another slot.`, true);
                const skillSelectElement = document.getElementById(slotId + '-skill');
                if (skillSelectElement) skillSelectElement.value = previousChoice ? `${previousChoice.skillRace}:${previousChoice.skillType}:${previousChoice.skillName}` : '';
                return;
            }
        }

        // Apply stat-modifying changes
        if (newChoiceData.statName) {
            applyChoiceRacialChange(character, newChoiceData.statName, newChoiceData.value, newChoiceData.calc);
            character.StatsAffected[category][targetUid][newChoiceData.statName] = character.StatsAffected[category][targetUid][newChoiceData.statName] || new Set();
            character.StatsAffected[category][targetUid][newChoiceData.statName].add(slotId);
            console.log(`  Added '${newChoiceData.statName}' to StatsAffected for slot ${slotId}.`);
        } else if (newChoiceData.type === 'mutant_skill_choice') {
            // Skill choice is tracked in StatChoices and dynamically rendered into passives or actives
        } else {
            // Handle non-stat affecting choices (e.g., skill_choice)
            if (newChoiceData.type === 'skill_choice') {
                showStatusMessage(`'${newChoiceData.label}' (Skill Choice) is not fully implemented yet.`, false);
            }
        }

        if (!newChoiceData.level) {
            newChoiceData.level = null;
        }

        character.StatChoices[category][targetUid][slotId] = newChoiceData;
    }

    recalculateCharacterDerivedProperties(character); // Recalculate all derived properties
    updateDOM(); // Update the UI to reflect changes
    setHasUnsavedChanges(true);
    console.log("--- processRacialChoiceChange finished ---");
}

/**
 * Initializes a new choice data object for racial passives.
 * @param {string} newType The type of the new choice.
 * @param {object} abilityData The full ability data from ExternalDataManager.
 * @param {number} indexLevel The index representing the level slot for this choice (e.g., 0 for first choice at level 1).
 * @param {object} newSelectedOptionData The data for the newly selected option (from abilityData.options).
 * @param {string|null} statToAffect The name of the stat to affect, if applicable.
 * @param {string|null} newUniqueIdentifier The unique identifier for this choice group.
 * @param {object|null} skillData Optional data for skill choices { skillRace, skillType, skillName }.
 * @returns {object|null} The new choice data object, or null if newType is falsy.
 */
function initEventNewChoiceData(newType, abilityData, indexLevel, newSelectedOptionData, statToAffect, newUniqueIdentifier, skillData) {
    const levelKeys = abilityData.levels ? Object.keys(abilityData.levels).map(Number).sort((a, b) => a - b) : [];
    const actualLevel = levelKeys[indexLevel] !== undefined ? levelKeys[indexLevel] : null;

    const newChoiceData = newType ? {
        type: newType,
        level: actualLevel,
        calc: newSelectedOptionData ? newSelectedOptionData.calc : null,
        value: newSelectedOptionData ? newSelectedOptionData.value : null,
        label: newSelectedOptionData ? newSelectedOptionData.label : '',
        statName: statToAffect,
        unique: newUniqueIdentifier // Pass the unique identifier
    } : null;

    if (newChoiceData && newType === 'mutant_skill_choice') {
        newChoiceData.unique = newUniqueIdentifier || 'mutant_skill_choice';
        newChoiceData.skillRace = skillData ? skillData.skillRace : null;
        newChoiceData.skillType = skillData ? skillData.skillType : null;
        newChoiceData.skillName = skillData ? skillData.skillName : null;
    }

    return newChoiceData;
}

function populateSkillOptions(skillSelect, slotId, indexLevel, abilityData, selectedSkillValue, category) {
    if (!skillSelect) return;
    skillSelect.innerHTML = '<option value="">-- Select a Skill --</option>';

    const levelKeys = abilityData && abilityData.levels ? Object.keys(abilityData.levels).map(Number).sort((a, b) => a - b) : [];
    const unlockLevel = (indexLevel !== undefined && levelKeys[indexLevel] !== undefined) ? levelKeys[indexLevel] : (character.level || 1);

    const races = ExternalDataManager._data ? ExternalDataManager._data.Races : null;
    if (!races) return;

    for (const raceName in races) {
        if (raceName === 'Mutant') continue;
        const rData = ExternalDataManager.getRaceData(raceName) || races[raceName];
        if (!rData) continue;
        const eligibleSkills = [];

        if (rData.regularPassives) {
            for (const passiveName in rData.regularPassives) {
                const passive = rData.regularPassives[passiveName];
                const reqLevel = Number(passive.level !== undefined ? passive.level : 1);
                // Rule: Must meet skill's level requirement at time of unlocking, and all level 100 skills are banned
                if (reqLevel <= unlockLevel && reqLevel < 100) {
                    eligibleSkills.push({
                        race: raceName,
                        type: 'passive',
                        name: passiveName,
                        level: reqLevel
                    });
                }
            }
        }

        if (rData.actives) {
            for (const activeName in rData.actives) {
                const active = rData.actives[activeName];
                const reqLevel = Number(active.level !== undefined ? active.level : 1);
                // Rule: Must meet skill's level requirement at time of unlocking, and all level 100 skills are banned
                if (reqLevel <= unlockLevel && reqLevel < 100) {
                    eligibleSkills.push({
                        race: raceName,
                        type: 'active',
                        name: activeName,
                        level: reqLevel
                    });
                }
            }
        }

        if (eligibleSkills.length > 0) {
            eligibleSkills.sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));

            const optgroup = document.createElement('optgroup');
            optgroup.label = `${raceName}`;

            eligibleSkills.forEach(s => {
                const opt = document.createElement('option');
                const val = `${s.race}:${s.type}:${s.name}`;
                opt.value = val;
                opt.textContent = `${s.name} (${s.type === 'passive' ? 'Passive' : 'Active'} - Lv. ${s.level})`;

                const isConflict = hasSkillConflict(character, category, s.name, slotId);
                opt.disabled = isConflict;
                if (val === selectedSkillValue) {
                    opt.selected = true;
                }
                optgroup.appendChild(opt);
            });

            skillSelect.appendChild(optgroup);
        }
    }

    if (selectedSkillValue) {
        skillSelect.value = selectedSkillValue;
    }
}

function optionsSelector(race, category, abilityName, abilityData, setsOptions, manualPassivesList, slotId, currentUniqueIdentifier, displayLevel, selectedOptionData, selectedOptionType, selectedStatName, applicableStatsLength, indexLevel, selectedSkillValue) {
    const hasStatOption = setsOptions.some(opt => opt.applicableStats && opt.applicableStats.length > 0);
    const hasSkillOption = setsOptions.some(opt => opt.type === 'mutant_skill_choice');
    const choiceDiv = document.createElement('div');
    choiceDiv.className = 'flex flex-col space-y-1 border border-gray-200 dark:border-gray-700 rounded-md p-2';
    let innerHTML = `
            <div class="flex items-center space-x-2">
                <label for="${slotId}-type" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">${abilityName} ${displayLevel}:</label>
                <select id="${slotId}-type" class="${race}-choice-type-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="">-- Select a ${abilityName} Type --</option>
        `;

    setsOptions.forEach(opt => {
        const isOptionDisabled = opt.applicableStats && !isUsableApplicableStats(opt.applicableStats, category, opt.unique, slotId);
        const cleanLabel = opt.label ? opt.label.replace(/<[^>]*>/g, '').trim() : '';
        innerHTML += `<option value="${opt.type}" ${opt.type === selectedOptionType ? 'selected' : ''} ${isOptionDisabled ? 'disabled' : ''}>${cleanLabel}</option>`;
    });

    innerHTML +=
            `</select>
                <button type="button" data-choice-id="${slotId}-type" data-category="${category}" data-unique-identifier="${currentUniqueIdentifier || ''}" class="clear-${race}-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>
        </div>`;

    if (hasStatOption) {
        const hideStat = (selectedOptionData && selectedOptionData.applicableStats && selectedOptionData.applicableStats.length > 1 && selectedOptionType !== 'mutant_skill_choice') ? '' : 'hidden';
        innerHTML += `
            <div id="${slotId}-stat-selection" class="flex items-center space-x-2 ${hideStat}">
                <label for="${slotId}-stat" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">Target Stat:</label>
                <select id="${slotId}-stat" class="${race}-choice-stat-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="">-- Select a Stat --</option>
                </select>
            </div>`;
    }

    if (hasSkillOption) {
        const hideSkill = selectedOptionType === 'mutant_skill_choice' ? '' : 'hidden';
        innerHTML += `
            <div id="${slotId}-skill-selection" class="flex items-center space-x-2 ${hideSkill}">
                <label for="${slotId}-skill" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">Target Skill:</label>
                <select id="${slotId}-skill" class="${race}-choice-skill-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="">-- Select a Skill --</option>
                </select>
            </div>`;
    }

    choiceDiv.innerHTML = innerHTML;
    manualPassivesList.appendChild(choiceDiv);

    const typeSelect = choiceDiv.querySelector(`#${slotId}-type`);
    const statSelectionDiv = choiceDiv.querySelector(`#${slotId}-stat-selection`);
    const statSelect = choiceDiv.querySelector(`#${slotId}-stat`);
    const skillSelectionDiv = choiceDiv.querySelector(`#${slotId}-skill-selection`);
    const skillSelect = choiceDiv.querySelector(`#${slotId}-skill`);

    // Populate stat dropdown if needed on initial render
    if (statSelect && selectedOptionData && selectedOptionData.applicableStats && selectedOptionData.applicableStats.length > 1 && selectedOptionType !== 'mutant_skill_choice') {
        statSelect.innerHTML = '<option value="">-- Select a Stat --</option>';
        selectedOptionData.applicableStats.forEach(statName => {
            const option = document.createElement('option');
            option.value = statName;
            option.textContent = statName;
            option.disabled = hasConflict(character, category, selectedOptionData.unique, statName, slotId);
            statSelect.appendChild(option);
        });
        statSelect.value = selectedStatName;
    }

    // Populate skill dropdown on initial render
    if (skillSelect && hasSkillOption) {
        populateSkillOptions(skillSelect, slotId, indexLevel, abilityData, selectedSkillValue, category);
    }

    // Event listener for type change
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            const newType = e.target.value;
            const newSelectedOptionData = setsOptions.find(opt => opt.type === newType);
            const newUniqueIdentifier = newSelectedOptionData ? (newSelectedOptionData.unique || (newType === 'mutant_skill_choice' ? 'mutant_skill_choice' : null)) : (newType === 'mutant_skill_choice' ? 'mutant_skill_choice' : null);

            if (!newType) {
                if (statSelectionDiv) statSelectionDiv.classList.add('hidden');
                if (statSelect) statSelect.value = '';
                if (skillSelectionDiv) skillSelectionDiv.classList.add('hidden');
                if (skillSelect) skillSelect.value = '';
                processRacialChoiceChange(category, currentUniqueIdentifier || newUniqueIdentifier, slotId, null);
                return;
            }

            if (newType === 'mutant_skill_choice') {
                if (statSelectionDiv) statSelectionDiv.classList.add('hidden');
                if (statSelect) statSelect.value = '';
                if (skillSelectionDiv) {
                    skillSelectionDiv.classList.remove('hidden');
                    populateSkillOptions(skillSelect, slotId, indexLevel, abilityData, skillSelect ? skillSelect.value : '', category);
                }

                const currentSkillVal = skillSelect ? skillSelect.value : '';
                let skillData = null;
                if (currentSkillVal) {
                    const [sRace, sType, sName] = currentSkillVal.split(':');
                    skillData = {
                        skillRace: sRace,
                        skillType: sType,
                        skillName: sName
                    };
                }
                const choiceData = initEventNewChoiceData(newType, abilityData, indexLevel, newSelectedOptionData, null, newUniqueIdentifier, skillData);
                processRacialChoiceChange(category, newUniqueIdentifier, slotId, choiceData);
            } else {
                if (skillSelectionDiv) {
                    skillSelectionDiv.classList.add('hidden');
                    if (skillSelect) skillSelect.value = '';
                }

                const newApplicableStatsLength = newSelectedOptionData && newSelectedOptionData.applicableStats ? newSelectedOptionData.applicableStats.length : 0;
                const newNeedsStatSelection = newSelectedOptionData && newApplicableStatsLength > 0;

                if (statSelectionDiv) {
                    if (newNeedsStatSelection) {
                        if (newApplicableStatsLength > 1) {
                            statSelectionDiv.classList.remove('hidden');
                        } else {
                            statSelectionDiv.classList.add('hidden'); // Hide if only one applicable stat
                        }

                        // Repopulate stat dropdown for this specific select
                        statSelect.innerHTML = '<option value="">-- Select a Stat --</option>';
                        newSelectedOptionData.applicableStats.forEach(statName => {
                            const opt = document.createElement('option');
                            opt.value = statName;
                            opt.textContent = statName;
                            opt.disabled = hasConflict(character, category, newUniqueIdentifier, statName, slotId);
                            statSelect.appendChild(opt);
                        });

                        // Keep current selection if valid, otherwise clear
                        statSelect.value = selectedStatName && newSelectedOptionData.applicableStats.includes(selectedStatName) ? selectedStatName : '';
                    } else {
                        statSelectionDiv.classList.add('hidden');
                        if (statSelect) statSelect.value = ''; // Clear stat selection if type changes away from stat
                    }
                }

                const statToAffect = newApplicableStatsLength === 1 ? (newSelectedOptionData ? newSelectedOptionData.applicableStats[0] : null) : (statSelect ? statSelect.value : null);
                processRacialChoiceChange(category, newUniqueIdentifier, slotId, initEventNewChoiceData(newType, abilityData, indexLevel, newSelectedOptionData, statToAffect, newUniqueIdentifier));
            }

            // Update the clear button's data-unique-identifier
            const clearButton = e.target.closest('.flex').querySelector(`.clear-${race}-choice-btn`);
            if (clearButton) {
                clearButton.dataset.uniqueIdentifier = newUniqueIdentifier || '';
            }
        });
    }

    // Event listener for stat change
    if (statSelect) {
        statSelect.addEventListener('change', (e) => {
            const currentType = typeSelect.value;
            const currentSelectedOptionData = setsOptions.find(opt => opt.type === currentType); // Get the full option data
            const currentUniqueIdentifierForStat = currentSelectedOptionData ? currentSelectedOptionData.unique : null;

            processRacialChoiceChange(category, currentUniqueIdentifierForStat, slotId, initEventNewChoiceData(currentType, abilityData, indexLevel, currentSelectedOptionData, e.target.value, currentUniqueIdentifierForStat));
        });
    }

    // Event listener for skill change
    if (skillSelect) {
        skillSelect.addEventListener('change', (e) => {
            const currentType = typeSelect.value;
            const currentSelectedOptionData = setsOptions.find(opt => opt.type === currentType);
            const currentUniqueIdentifier = (currentSelectedOptionData && currentSelectedOptionData.unique) ? currentSelectedOptionData.unique : 'mutant_skill_choice';
            const val = e.target.value;

            if (val) {
                const [sRace, sType, sName] = val.split(':');
                const choiceData = initEventNewChoiceData(currentType, abilityData, indexLevel, currentSelectedOptionData, null, currentUniqueIdentifier, {
                    skillRace: sRace,
                    skillType: sType,
                    skillName: sName
                });
                processRacialChoiceChange(category, currentUniqueIdentifier, slotId, choiceData);
            } else {
                const choiceData = initEventNewChoiceData(currentType, abilityData, indexLevel, currentSelectedOptionData, null, currentUniqueIdentifier, null);
                processRacialChoiceChange(category, currentUniqueIdentifier, slotId, choiceData);
            }
        });
    }
}

/**
 * Renders the generic racial options for a specific ability within a race.
 * This function is called for each available choice slot (e.g., for each level-based choice).
 * @param {string} race The name of the race.
 * @param {string} abilityKey The key of the ability (e.g., 'Mutation', 'Degeneration').
 * @param {object} abilityData The data for the specific ability.
 * @param {string} category The category of the racial passive (usually the race name).
 * @param {Array}
 * @param {HTMLElement} manualPassivesList The container element to append the choices to.
 * @param {number} indexLevel
 */
function renderTagManualRacialPassive(race, category, abilityKey, abilityData, availableOptions, manualPassivesList, indexLevel, tag) {
    const isLevelBased = abilityData.levels && Object.keys(abilityData.levels).length > 0;
    const deepCopy = [...availableOptions];
    let newAvailableOptions = deepCopy;

    let count = 0;
    while (newAvailableOptions.length > 0) {
        const displayLevel = isLevelBased ? indexLevel + count + 1 : '';
        const slotId = `${race}-${abilityKey}-${indexLevel}-${tag || 'none'}-${count}`;// Unique ID for each choice slot

        // Retrieve current choice data for this slot
        let currentChoice = null;
        let currentUniqueIdentifier = null;
        if (character.StatChoices[category]) {
            for (const uId in character.StatChoices[category]) {
                if (character.StatChoices[category][uId] && character.StatChoices[category][uId][slotId]) {
                    currentChoice = character.StatChoices[category][uId][slotId];
                    currentUniqueIdentifier = uId;
                    break;
                }
            }
        }

        const selectedOptionType = currentChoice ? currentChoice.type : '';
        const selectedStatName = currentChoice && currentChoice.statName ? currentChoice.statName : '';
        const selectedSkillValue = (currentChoice && currentChoice.type === 'mutant_skill_choice' && currentChoice.skillRace && currentChoice.skillType && currentChoice.skillName)
            ? `${currentChoice.skillRace}:${currentChoice.skillType}:${currentChoice.skillName}`
            : '';
        const selectedOptionData = newAvailableOptions.find(opt => opt.type === selectedOptionType); // Find the full option data
        const applicableStatsLength = selectedOptionData && selectedOptionData.applicableStats ? selectedOptionData.applicableStats.length : 0;

        if (newAvailableOptions[0].setsOption) {
            optionsSelector(race, category, abilityKey, abilityData, newAvailableOptions.filter(opt => opt.setsOption), manualPassivesList, slotId, currentUniqueIdentifier, displayLevel, selectedOptionData, selectedOptionType, selectedStatName, applicableStatsLength, indexLevel, selectedSkillValue);
        } else {
            optionChoices(race, category, newAvailableOptions[0], manualPassivesList, slotId, currentUniqueIdentifier, selectedStatName, abilityData, indexLevel);
        }

        ++count;
        newAvailableOptions = newAvailableOptions.filter(opt => opt.count && opt.count > count);
    }
}

/**
* Attaches event listeners to the dynamically created clear buttons for stat choices.
*/
function attachClearChoiceListeners(query) {
    document.querySelectorAll(query).forEach(button => {
        button.onclick = (event) => {
            const choiceId = event.target.dataset.choiceId;
            const category = event.target.dataset.category;
            const uniqueIdentifier = event.target.dataset.uniqueIdentifier;
            processRacialChoiceChange(category, uniqueIdentifier, choiceId.replace('-type', ''), null);
        };
    });
}

function renderManualRacialPassives(passivesContainer) {
    const race = character.race;
    const id = 'manual-passives';
    const numbersFootNotes = {};
    pushRaceFootNotes(race, 'manual_passives', numbersFootNotes);
    renderContainer(passivesContainer, "Manual Passives", id, numbersFootNotes);

    const manualPassivesList = document.getElementById(`${race}-${id}-list`);
    const manualPassives = ExternalDataManager.getRaceManualPassives(race);
    const currentLevel = character.level;

    character.StatChoices[race] = character.StatChoices[race] || {};
    character.StatsAffected[race] = character.StatsAffected[race] || {};

    for (const abilityKey in manualPassives) {
        if (manualPassives.hasOwnProperty(abilityKey) && manualPassives[abilityKey].options) {
            const abilityData = manualPassives[abilityKey];
            abilityData.options.forEach(option => {
                option.label = ExternalDataManager.formatHrefFootNotes(option.label, manualPassivesList, abilityData.foot_notes);
            });

            const abilityDescription = document.createElement('p');
            abilityDescription.innerHTML = ExternalDataManager.formatHrefFootNotes(abilityData.description, manualPassivesList, abilityData.foot_notes);
            abilityDescription.className = 'text-sm text-gray-600 dark:text-gray-400 mb-2';
            manualPassivesList.appendChild(abilityDescription);

            //+1 and 2 because i start at 1
            const maxChoices = abilityData.levels ? getAvailablePoints(abilityData, currentLevel) : 1;
            let countLevel = 0;

            for (let i = 0; i < maxChoices; ++i) {
                const usedNullSetOptions = new Set();
                const usedSetOptions = new Set();
                let availableOptions = [];
                do {
                    const nextOptionIndex = abilityData.options.findIndex(opt => {
                        if (!opt.setsOption) return !usedNullSetOptions.has(opt);
                        return opt.setsOption.some(tag => !usedSetOptions.has(tag));
                    });

                    if (nextOptionIndex < 0) {
                        break;
                    }

                    const nextOption = abilityData.options[nextOptionIndex];
                    
                    availableOptions = nextOption.setsOption ? filterFromArrayStartIndex(abilityData.options, nextOptionIndex, (opt) => {
                        if (!opt.setsOption) 
                            return !usedNullSetOptions.has(opt);
                        return opt.setsOption.some(tag => !usedSetOptions.has(tag));
                    }) : [nextOption];

                    const tagToPass = nextOption.setsOption ? nextOption.setsOption.find(tag => !usedSetOptions.has(tag)) : undefined;

                    renderTagManualRacialPassive(race, race, abilityKey, abilityData, availableOptions, manualPassivesList, countLevel, tagToPass, numbersFootNotes);

                    if (tagToPass)
                        usedSetOptions.add(tagToPass);
                    else
                        usedNullSetOptions.add(nextOption);

                    ++countLevel;
                } while(availableOptions.length > 0);
            }

            if (abilityData.foot_notes) {
                abilityData.foot_notes.forEach(key => {
                    numbersFootNotes[key] = true;
                });
            }
        }
    }

    renderFootNotes(race, numbersFootNotes, manualPassivesList);
    updateSpecificHtmlVisibility('element');
    attachClearChoiceListeners(`.clear-${race}-choice-btn`);
}

function renderRegularRacialPassives(oldRace, passivesContainer) {
    const race = character.race;
    const id = 'regular-passives';

    if (oldRace) {
        const oldRegularPassives = ExternalDataManager.getRaceRegularPassives(oldRace, character.level);
        removeTemporaryEffectByCategory(oldRegularPassives, oldRace);
    }

    const regularPassives = ExternalDataManager.getRaceRegularPassives(race, character.level) || {};
    const combinedPassives = { ...regularPassives };

    if (race === 'Mutant') {
        const chosenSkills = getMutantChosenSkills(character);
        chosenSkills.forEach(choice => {
            if (choice.skillType === 'passive') {
                const processed = ExternalDataManager.getRaceRegularPassives(choice.skillRace, character.level);
                const passiveData = processed?.[choice.skillName] || ExternalDataManager.getRaceData(choice.skillRace)?.regularPassives?.[choice.skillName];
                if (passiveData) {
                    combinedPassives[choice.skillName] = {
                        ...passiveData,
                        sourceRace: choice.skillRace,
                        identifier: `${choice.skillRace}-${choice.skillName}`,
                        name: `${passiveData.name || choice.skillName} (${choice.skillRace})`
                    };
                }
            }
        });
    }

    if (combinedPassives && Object.keys(combinedPassives).length > 0) {
        passivesContainer.classList.remove('hidden');
        const numbersFootNotes = {};
        pushRaceFootNotes(race, 'passives', numbersFootNotes);
        renderContainer(passivesContainer, "Regular passives", id, numbersFootNotes);
        const regularPassivesList = document.getElementById(`${race}-${id}-list`);
        renderRegularPassives(combinedPassives, regularPassivesList, numbersFootNotes);
        renderFootNotes(race, numbersFootNotes, regularPassivesList);
        updateSpecificHtmlVisibility('element');
    } else {
        passivesContainer.classList.add('hidden');
        passivesContainer.innerHTML = '';
    }
}

/**
 * Renders the generic racial passives for races that don't have manual choices.
 * @param {string} race The name of the race.
 */
function renderGenericRacialPassives(oldRace, race) {
    const manualPassivesContainer = document.getElementById('racial-manual-passives-container');

    const genericPassives = ExternalDataManager.getRaceManualPassives(race);

    if (genericPassives) {
        renderManualRacialPassives(manualPassivesContainer, race);
    } else {
        manualPassivesContainer.classList.add('hidden');
        manualPassivesContainer.innerHTML = '';
    }

    const regularPassivesContainer = document.getElementById('racial-regular-passives-container');

    if (regularPassivesContainer) {
        renderRegularRacialPassives(oldRace, regularPassivesContainer, race);
    } else {
        regularPassivesContainer.classList.add('hidden');
        regularPassivesContainer.innerHTML = '';
    }
}

function renderProperties(wrapper, innerHTML, className) {
    const element = document.createElement('p');
    element.innerHTML = innerHTML;
    element.className = className;
    wrapper.appendChild(element);
}

function renderRacialActives(activesContainer) {
    const race = character.race;
    const id = 'racial-actives';
    const racialActives = ExternalDataManager.getRaceActives(race, character.level) || {};
    const combinedActives = { ...racialActives };

    if (race === 'Mutant') {
        const chosenSkills = getMutantChosenSkills(character);
        chosenSkills.forEach(choice => {
            if (choice.skillType === 'active') {
                const processed = ExternalDataManager.getRaceActives(choice.skillRace, character.level);
                const activeData = processed?.[choice.skillName] || ExternalDataManager.getRaceData(choice.skillRace)?.actives?.[choice.skillName];
                if (activeData) {
                    combinedActives[choice.skillName] = {
                        ...activeData,
                        sourceRace: choice.skillRace,
                        identifier: `${choice.skillRace}-${choice.skillName}`,
                        name: `${activeData.name || choice.skillName} (${choice.skillRace})`
                    };
                }
            }
        });
    }

    if (combinedActives && Object.keys(combinedActives).length > 0) {
        activesContainer.classList.remove('hidden');
        const numbersFootNotes = {};
        pushRaceFootNotes(race, 'actives', numbersFootNotes);
        renderContainer(activesContainer, 'Racial Actives', id, numbersFootNotes);
        const racialActiveList = document.getElementById(`${race}-${id}-list`);

        for (const abilityKey in combinedActives) {
            if (combinedActives.hasOwnProperty(abilityKey)) {
                const abilityData = combinedActives[abilityKey];
                const abilityTarget = abilityData.identifier || `${race}-${abilityKey.replace(/\s+/g, '-')}`;

                const abilityWrapper = document.createElement('div');
                abilityWrapper.className = 'group bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-md shadow-sm transition hover:shadow-md p-4 space-y-2';

                const abilityHeader = document.createElement('div');
                abilityHeader.className = 'flex items-center justify-between';

                const abilityTitle = document.createElement('h2');
                abilityTitle.className = 'text-base font-semibold text-gray-800 dark:text-gray-100 group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition-colors';
                abilityTitle.textContent = abilityData.name || abilityKey;

                const toggableBtn = document.createElement('button');
                toggableBtn.className = 'toggle-element-btn p-1 rounded-md text-indigo-600 dark:text-indigo-300 hover:text-indigo-800 dark:hover:text-indigo-100 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition duration-200';
                toggableBtn.dataset.target = abilityTarget;
                toggableBtn.innerHTML = `
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                </svg>
                `;

                abilityHeader.appendChild(abilityTitle);
                abilityHeader.appendChild(toggableBtn);
                abilityWrapper.appendChild(abilityHeader);

                if (abilityData.cast_time) {
                    renderProperties(abilityWrapper, `<b>Cast time:</b> ${abilityData.cast_time}`, 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors');
                }

                if (abilityData.channel_time) {
                    renderProperties(abilityWrapper, `<b>Channel time:</b> ${ExternalDataManager.formatHrefFootNotes(abilityData.channel_time, racialActiveList, abilityData.foot_notes)}`, 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors');
                }

                if (abilityData.cooldown) {
                    const dataKeys = Object.keys(abilityData.cooldown);
                    dataKeys.forEach(key => {
                        const abilityCooldownData = abilityData.cooldown[key];
                        renderProperties(abilityWrapper, `<b>Cooldown:</b> ${abilityCooldownData.value} ${key} ${abilityCooldownData.shared ? `shared with ${abilityCooldownData.shared.join(', ')}` : ''}`, 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors');
                    });
                }

                if (abilityData.conditions) {
                    renderProperties(abilityWrapper, `<b>Conditions:</b> ${ExternalDataManager.formatString(abilityData.conditions, abilityData.dices, abilityData.values)}`, 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors');
                }

                const abilityDescription = document.createElement('p');
                abilityDescription.innerHTML = ExternalDataManager.formatHrefFootNotes(abilityData.description, racialActiveList, abilityData.foot_notes);
                abilityDescription.id = abilityTarget;
                abilityDescription.className = 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors';

                abilityWrapper.appendChild(abilityDescription);
                racialActiveList.appendChild(abilityWrapper);

                if (abilityData.foot_notes) {
                    abilityData.foot_notes.forEach(key => {
                        if (abilityData.sourceRace) {
                            numbersFootNotes[key] = { race: abilityData.sourceRace, category: 'actives', key };
                        } else if (numbersFootNotes[key] === undefined) {
                            numbersFootNotes[key] = true;
                        }
                    });
                }
            }
        }

        renderFootNotes(race, numbersFootNotes, racialActiveList);
        updateSpecificHtmlVisibility('element');
    } else {
        activesContainer.classList.add('hidden');
        activesContainer.innerHTML = '';
    }
}

/**
 * Renders the generic racial passives for races that don't have manual choices.
 * @param {string} race The name of the race.
 */
function renderGenericRacialActives(race) {
    const activesContainer = document.getElementById('racial-actives-container');

    const genericActives = ExternalDataManager.getRaceActives(race, character.level);
    const hasChosenActives = race === 'Mutant' && getMutantChosenSkills(character).some(s => s.skillType === 'active');

    if (genericActives || hasChosenActives) {
        renderRacialActives(activesContainer, race);
    } else {
        activesContainer.classList.add('hidden');
        activesContainer.innerHTML = '';
    }
}

export function renderRacial(oldRace) {
    const manualContainer = document.getElementById('racial-manual-passives-container');
    if (manualContainer) manualContainer.classList.add('hidden');
    renderGenericRacialPassives(oldRace, character.race);
    
    const activesContainer = document.getElementById('racial-actives-container');
    if (activesContainer) activesContainer.classList.add('hidden');
    renderGenericRacialActives(character.race);

    document.querySelectorAll('.toggle-container-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.currentTarget.dataset.target;
            toggleHtml(targetId, 'container');
        });
    });

    document.querySelectorAll('.toggle-element-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.currentTarget.dataset.target;
            toggleHtml(targetId, 'element');
        });
    });
}

export function renderGenericClassesPassives() {
    const manualPassivesContainer = document.getElementById('classes-manual-passives-container');
    let genericPassives = null;
    character.classes.forEach(classe => {
        const result = ExternalDataManager.getClassRegularPassives(classe, character.specializations, character.level);

        if (result) {
            if (genericPassives) {
                const keys = Object.key(result);
                keys.forEach(k => genericPassives[k] = result[k]);
            }
            else
                genericPassives = result;
        }
    });

    if (genericPassives) {
        //renderManualRacialPassives(manualPassivesContainer, race);
        //attachClearChoiceListeners(`.clear-${race}-choice-btn`);
    } else {
        manualPassivesContainer.classList.add('hidden');
        manualPassivesContainer.innerHTML = '';
    }

    const regularPassivesContainer = document.getElementById('classes-regular-passives-container');

    if (regularPassivesContainer) {
        //renderRegularRacialPassives(oldRace, regularPassivesContainer, race);
    } else {
        regularPassivesContainer.classList.add('hidden');
        regularPassivesContainer.innerHTML = '';
    }
}