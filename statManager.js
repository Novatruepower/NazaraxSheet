// StatManager.js
// This module encapsulates all stat-related calculations and logic.

import { ExternalDataManager } from './ExternalDataManager.js'; // Assuming ExternalDataManager is already defined and accessible

const defaultStatMaxExperience = 7;
const maxRollStat = 20;
const minRollStat = 6;

/**
 * Calculates the maximum experience required for a given level.
 * @param {number} level The character's current level.
 * @returns {number} The maximum experience for the level.
 */
export function calculateLevelMaxExperience(level) {
    return 100; // Example: simple fixed value, can be made more complex
}

/**
 * Calculates the base maximum health for a character.
 * @param {object} charData The character's data.
 * @returns {number} The base maximum health.
 */
export function calculateBaseMaxHealth(charData) {
    // Ensure charData.BaseHealth and its properties exist before accessing
    if (!charData || !charData.BaseHealth) {
        console.warn("calculateBaseMaxHealth: charData or charData.BaseHealth is undefined.");
        return 0;
    }
    return charData.BaseHealth.value * charData.BaseHealth.racialChange * charData.Health.racialChange;
}

/**
 * Calculates the maximum health based on race, level, and bonus.
 * @param {object} charData The character's data.
 * @param {number} level The character's current level.
 * @param {number} healthBonus Additional health bonus.
 * @returns {number} The calculated maximum health.
 */
export function calculateMaxHealth(charData, level, healthBonus) {
    return Math.floor(calculateBaseMaxHealth(charData) * level) + (healthBonus || 0);
}

/**
 * Calculates the maximum mana based on level.
 * @param {object} charData The character's data.
 * @param {number} level The character's current level.
 * @returns {number} The calculated maximum mana.
 */
export function calculateMaxMana(charData, level) {
    if (!charData || !charData.Mana) {
        console.warn("calculateMaxMana: charData or charData.Mana is undefined.");
        return 0;
    }
    return Math.floor(100 * charData.Mana.racialChange * level);
}

/**
 * Calculates the maximum racial power based on level.
 * @param {number} level The character's current level.
 * @returns {number} The calculated maximum racial power.
 */
export function calculateMaxRacialPower(level) {
    return level * 100;
}

/**
 * Generates a random number between min and max (inclusive).
 * @param {number} min The minimum value.
 * @param {number} max The maximum value.
 * @returns {number} A random number.
 */
export function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Adjusts a value based on old and new maximums.
 * Used to ensure current values don't exceed new maximums when max changes.
 * @param {number} oldMaxValue The previous maximum value.
 * @param {number} value The current value.
 * @param {number} newMaxValue The new maximum value.
 * @returns {number} The adjusted value.
 */
export function adjustValue(oldMaxValue, value, newMaxValue) {
    return value === oldMaxValue ? newMaxValue : Math.min(value, newMaxValue);
}

/**
 * Helper function to get the applied racial change for a stat.
 * This function considers both standard stats and special cases like Health/Mana.
 * @param {object} charData The character data.
 * @param {string} statName The name of the stat.
 * @returns {number} The racial change multiplier/additive value.
 */
export function getAppliedRacialChange(charData, statName) {
    // For standard rollStats, the racialChange is directly stored on the stat object.
    if (ExternalDataManager._data.Stats.includes(statName) && charData[statName]) {
        return charData[statName].racialChange;
    }
    // For Health and Mana, which are also considered 'otherStats' but have racialChange
    if (ExternalDataManager.otherStats.includes(statName) && charData[statName]) {
        return charData[statName].racialChange;
    }

    // If for some reason a statName is passed that isn't handled, return a default.
    console.warn(`getAppliedRacialChange: Unhandled statName '${statName}'. Returning 1 (no change).`);
    return 1; // Default to 1 for no change if stat not found
}


/**
 * Calculates the total for a given stat based on its value, racial change, equipment, and temporary bonuses.
 * @param {object} statData The stat object (e.g., character.Strength).
 * @param {object} charData The full character object (needed for getAppliedRacialChange).
 * @param {string} statName The name of the stat (e.g., 'Strength').
 * @returns {number} The calculated total stat value.
 */
export function calculateTotal(statData, charData, statName) {
    // Ensure values are treated as numbers, defaulting to 0 if NaN
    const value = parseFloat(statData.value) || 0;
    // Use getAppliedRacialChange to get the combined racial modifier (percentage change)
    const racialChange = getAppliedRacialChange(charData, statName);
    const equipment = parseFloat(statData.equipment) || 0;
    const temporary = parseFloat(statData.temporary) || 0;

    return value * racialChange + equipment + temporary;
}

// Mapping for common terms to character properties for formula evaluation
const statMapping = {
    "Strength": "strength-total",
    "Agility": "agility-total",
    "Magic": "magic-total",
    "Luck": "luck-total",
    "Crafting": "crafting-total",
    "Intelligence": "intelligence-total",
    "Intimidation": "intimidation-total",
    "Charisma": "charisma-total",
    "Negotiation": "negotiation-total",
    "hp": "Health",
    "Health": "Health",
    "MaxHp": "maxHealth",
    "MaxHealth": "maxHealth",
    "MagicPoints": "Mana",
    "maxMana": "maxMana",
    "RacialPower": "racialPower",
    "MaxRacialPower": "maxRacialPower",
    "AC": "ac",
    "Armor": "ac"
};

/**
 * Retrieves the value of a stat from the DOM based on its label.
 * @param {string} statLabel The label of the stat (e.g., "Strength").
 * @returns {number} The numeric value of the stat from the DOM, or 0 if not found.
 */
function getStatValueFromDOM(statLabel) {
    const elementId = statMapping[statLabel];
    if (!elementId) {
        console.warn(`getStatValueFromDOM: No element ID mapped for stat label '${statLabel}'.`);
        return 0;
    }
    const el = document.getElementById(elementId);
    if (!el) {
        console.warn(`getStatValueFromDOM: Element with ID '${elementId}' not found for stat label '${statLabel}'.`);
        return 0;
    }
    return parseFloat(el.value) || 0;
}

/**
 * Calculates the result of a formula string, replacing stat labels with their current DOM values.
 * @param {string} formulaString The formula string (e.g., "Strength * 2 + 10").
 * @returns {*} The calculated result or the original string if calculation fails.
 */
export function calculateFormula(formulaString) {
    if (typeof formulaString !== 'string') return formulaString != null ? formulaString : '';

    let parsedFormula = formulaString;
    // Replace all mapped keys in the formula with actual values from the DOM
    for (const [label, id] of Object.entries(statMapping)) {
        // Use the getStatValueFromDOM helper to fetch the current value
        const value = getStatValueFromDOM(label);
        const regex = new RegExp(`\\b${label}\\b`, 'gi'); // Use word boundary to avoid partial matches
        parsedFormula = parsedFormula.replace(regex, value);
    }

    try {
        // eslint-disable-next-line no-eval
        return eval(parsedFormula); // Note: `eval` can be dangerous; sanitize input if needed
    } catch (error) {
        console.warn(`Error evaluating formula: ${formulaString}. Parsed as: ${parsedFormula}`, error);
        return parsedFormula; // Return the parsed formula if evaluation fails
    }
}

/**
 * Reverts the racial change applied by a specific choice to a stat.
 * @param {object} char The character object.
 * @param {string} statName The name of the stat to revert.
 * @param {object} choice The choice object that applied the change.
 */
export function revertChoiceRacialChange(char, statName, choice) {
    if (ExternalDataManager._data.Stats.includes(statName) && char[statName]) {
        if (choice.calc === "mult") {
            char[statName].racialChange /= choice.value;
        } else {
            char[statName].racialChange -= choice.value;
        }
    }
    // Add other specific reverts here if needed (e.g., for regen flags)
    if (choice.type === 'natural_regen_active') {
        char.naturalHealthRegenActive = false;
        char.naturalManaRegenActive = false;
    } else if (choice.type === 'regen_doubled') {
        char.healthRegenDoubled = false;
        char.manaRegenDoubled = false;
    }
}

/**
 * Applies a racial change to a specific stat.
 * @param {object} char The character object.
 * @param {string} statName The name of the stat to apply change to.
 * @param {number} value The value of the change.
 * @param {string} calc The calculation type ("add" or "mult").
 */
export function applyChoiceRacialChange(char, statName, value, calc) {
    if (ExternalDataManager._data.Stats.includes(statName) && char[statName]) {
        if (calc === "mult") {
            char[statName].racialChange *= value;
        } else {
            char[statName].racialChange += value;
        }
    }
    // Add other specific applies here if needed (e.g., for regen flags)
    // These are typically handled directly in handleMutantOption, but kept here for consistency if needed elsewhere.
}

/**
 * Handles the logic for a Demi-human stat choice, applying or reverting modifiers.
 * @param {object} character The current character object.
 * @param {string} category The category (e.g., 'Demi-humans').
 * @param {string} passiveName The name of the passive (e.g., 'Stat Adjustments').
 * @param {string} slotId The unique ID of the choice slot.
 * @param {string} choiceType The type of the choice (e.g., 'stat_increase').
 * @param {string} calc The calculation type ("add" or "mult").
 * @param {number} modifierValue The numerical value of the modifier (e.g., 0.25).
 * @param {string} selectedStatName The name of the stat chosen by the player.
 * @param {string} label The display label of the choice.
 * @param {function} showStatusMessage Callback to display status messages.
 * @param {function} updateDOM Callback to update the DOM.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function handleDemiHumanStatChoice(character, category, passiveName, slotId, choiceType, calc, modifierValue, selectedStatName, label, showStatusMessage, updateDOM, saveCurrentStateToHistory) {
    console.log("--- handleDemiHumanStatChoice called ---");
    console.log("Input parameters:", { category, passiveName, slotId, choiceType, modifierValue, selectedStatName, label });

    // Ensure the nested structures exist
    character.StatChoices[category] = character.StatChoices[category] || {};
    character.StatChoices[category][passiveName] = character.StatChoices[category][passiveName] || {};
    character.StatsAffected[category] = character.StatsAffected[category] || {};
    character.StatsAffected[category][passiveName] = character.StatsAffected[category][passiveName] || {};

    const previousChoice = character.StatChoices[category][passiveName][slotId];

    // If a stat was previously selected for this slot, remove its effect
    if (previousChoice && previousChoice.statName) {
        const prevStatName = previousChoice.statName;
        if (character.StatsAffected[category][passiveName][prevStatName]) {
            character.StatsAffected[category][passiveName][prevStatName].delete(slotId);
            if (character.StatsAffected[category][passiveName][prevStatName].size === 0) {
                delete character.StatsAffected[category][passiveName][prevStatName]; // Clean up empty Set
            }
        }
        console.log(`  Cleared previous stat '${prevStatName}' from StatsAffected.`);
        revertChoiceRacialChange(character, prevStatName, previousChoice);
    }

    // If a new stat is selected (not empty option)
    if (selectedStatName) {
        // Check if the newly selected stat is already affected by another choice in this passive
        if (character.StatsAffected[category][passiveName][selectedStatName] && character.StatsAffected[category][passiveName][selectedStatName].size > 0) {
            showStatusMessage(`'${selectedStatName}' has already been chosen for another racial modifier. Please select a different stat.`, true);
            // Revert the dropdown to its previous selection or empty
            const selectElement = document.getElementById(slotId);
            if (selectElement) {
                selectElement.value = previousChoice ? previousChoice.statName : '';
            }
            console.log(`  Stat '${selectedStatName}' already chosen. Reverting dropdown.`);
            return;
        }

        // Add the new choice to StatChoices
        character.StatChoices[category][passiveName][slotId] = {
            type: choiceType,
            calc: calc,
            value: modifierValue,
            statName: selectedStatName,
            label: label
        };

        // Add to StatsAffected
        character.StatsAffected[category][passiveName][selectedStatName] = character.StatsAffected[category][passiveName][selectedStatName] || new Set();
        character.StatsAffected[category][passiveName][selectedStatName].add(slotId);
        console.log(`  Added '${selectedStatName}' to StatsAffected for slot ${slotId}.`);

        applyChoiceRacialChange(character, selectedStatName, modifierValue, calc);
    } else {
        // If the selected option is empty, remove the choice from StatChoices
        if (character.StatChoices[category][passiveName][slotId]) {
            delete character.StatChoices[category][passiveName][slotId];
            console.log(`  Cleared choice for slot ${slotId}.`);
        }
    }

    // Recalculate derived properties that depend on racial changes
    recalculateUpdate(character);

    console.log("Updated StatChoices (after update):", JSON.parse(JSON.stringify(character.StatChoices)));
    console.log("Updated StatsAffected (after update):", JSON.parse(JSON.stringify(character.StatsAffected), (key, value) => value instanceof Set ? Array.from(value) : value));

    // Update the UI to reflect changes (e.g., disable/enable options)
    updateDOM(); // Re-render the entire DOM to update all stat totals and choice dropdowns
    character.hasUnsavedChanges = true;
    saveCurrentStateToHistory();
    console.log("--- handleDemiHumanStatChoice finished ---");
}

/**
 * Handles the logic for a Mutant ability choice (mutation or degeneration).
 * @param {object} character The current character object.
 * @param {string} category The category (e.g., 'Mutant').
 * @param {string} passiveName The name of the passive (e.g., 'Mutation', 'Degeneration').
 * @param {string} slotId The unique ID of the choice slot.
 * @param {string} optionType The type from options (e.g., 'stat_multiplier_set_50', 'double_base_health').
 * @param {string} selectedStatName The name of the stat chosen by the player (if applicable).
 * @param {string} calc The calculation type ("add" or "mult").
 * @param {number} optionValue The numerical value associated with the option (e.g., 0.50, -0.50).
 * @param {string} label The display label of the choice.
 * @param {function} showStatusMessage Callback to display status messages.
 * @param {function} updateDOM Callback to update the DOM.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function handleMutantOption(character, category, passiveName, slotId, optionType, selectedStatName = null, calc = null, optionValue = null, label = '', showStatusMessage, updateDOM, saveCurrentStateToHistory) {
    console.log("--- handleMutantOption called ---");
    console.log("Input parameters:", { category, passiveName, slotId, optionType, selectedStatName, calc, optionValue, label });

    character.StatChoices[category] = character.StatChoices[category] || {};
    character.StatChoices[category][passiveName] = character.StatChoices[category][passiveName] || {};
    character.StatsAffected[category] = character.StatsAffected[category] || {};
    character.StatsAffected[category][passiveName] = character.StatsAffected[category][passiveName] || {};

    const previousChoice = character.StatChoices[category][passiveName][slotId];

    // Revert previous effect if any
    if (previousChoice) {
        // Revert stat-specific changes
        if (previousChoice.statName) {
            if (character.StatsAffected[category][passiveName][previousChoice.statName]) {
                character.StatsAffected[category][passiveName][previousChoice.statName].delete(slotId);
                if (character.StatsAffected[category][passiveName][previousChoice.statName].size === 0) {
                    delete character.StatsAffected[category][passiveName][previousChoice.statName];
                }
            }
            revertChoiceRacialChange(character, previousChoice.statName, previousChoice);
        }
        // Revert other specific flags if they were set by the previous choice
        if (previousChoice.type === 'natural_regen_active') {
            character.naturalHealthRegenActive = false;
            character.naturalManaRegenActive = false;
        } else if (previousChoice.type === 'regen_doubled') {
            character.healthRegenDoubled = false;
            character.manaRegenDoubled = false;
        }
        delete character.StatChoices[category][passiveName][slotId];
        console.log(`  Removed previous choice for slot ${slotId}.`);
    }

    // Apply new choice if a valid optionType is selected
    if (optionType) {
        let newChoiceData = {
            type: optionType,
            level: character.level,
            calc: calc,
            value: optionValue, // Store the optionValue directly
            label: label
        };

        let statToAffect = selectedStatName;

        if (statToAffect) {
            // Check for conflicts only if a stat is being affected and it's not the same slot re-selecting itself
            if (selectedStatName && character.StatsAffected[category][passiveName][statToAffect] && character.StatsAffected[category][passiveName][statToAffect].size > 0 && !character.StatsAffected[category][passiveName][statToAffect].has(slotId)) {
                showStatusMessage(`'${statToAffect}' has already been affected by another choice in this category. Please select a different stat.`, true);
                // Revert the dropdowns to previous state
                const typeSelectElement = document.getElementById(slotId + '-type');
                const statSelectElement = document.getElementById(slotId + '-stat');
                if (typeSelectElement) typeSelectElement.value = previousChoice ? previousChoice.type : '';
                if (statSelectElement) statSelectElement.value = previousChoice ? previousChoice.statName : '';
                return; // Stop processing this choice
            }

            // If a stat is selected for a stat-affecting type, ensure it's not empty
            if ((optionType.includes('stat_multiplier') || optionType === 'double_base_health') && !selectedStatName) {
                // User selected a stat mutation type but no stat, just update DOM and return
                updateDOM();
                character.hasUnsavedChanges = true;
                saveCurrentStateToHistory();
                return;
            }

            // Add statToAffect to newChoiceData if it's a stat-modifying type
            newChoiceData.statName = statToAffect;

            // Apply the change
            applyChoiceRacialChange(character, statToAffect, optionValue, calc);

            // Add to StatsAffected
            character.StatsAffected[category][passiveName][statToAffect] = character.StatsAffected[category][passiveName][statToAffect] || new Set();
            character.StatsAffected[category][passiveName][statToAffect].add(slotId);
            console.log(`  Added '${statToAffect}' to StatsAffected for slot ${slotId}.`);
        } else {
            // Handle non-stat affecting choices (e.g., skill_choice, natural_regen_active, regen_doubled)
            if (optionType === 'skill_choice') {
                showStatusMessage(`'${label}' (Skill Choice) is not fully implemented yet.`, false);
            } else if (optionType === 'natural_regen_active') {
                character.naturalHealthRegenActive = true;
                character.naturalManaRegenActive = true;
                showStatusMessage(`'${label}' (Natural Regeneration Active) applied.`, false);
            } else if (optionType === 'regen_doubled') {
                character.healthRegenDoubled = true;
                character.manaRegenDoubled = true;
                showStatusMessage(`'${label}' (Regeneration Doubled) applied.`, false);
            }
        }
        character.StatChoices[category][passiveName][slotId] = newChoiceData;
    }

    recalculateUpdate(character);

    console.log("Updated StatChoices (after update):", JSON.parse(JSON.stringify(character.StatChoices)));
    console.log("Updated StatsAffected (after update):", JSON.parse(JSON.stringify(character.StatsAffected), (key, value) => value instanceof Set ? Array.from(value) : value));

    updateDOM();
    character.hasUnsavedChanges = true;
    saveCurrentStateToHistory();
    console.log("--- handleMutantOption finished ---");
}


/**
 * Recalculates derived properties for a character (health, mana, racial power).
 * @param {object} char The character object.
 */
export function recalculateUpdate(char) {
    let oldMaxValue = char.maxHealth;
    char.maxHealth = calculateMaxHealth(char, char.level, char.healthBonus);
    char.Health.value = adjustValue(oldMaxValue, char.Health.value, char.maxHealth);

    oldMaxValue = char.maxMana;
    char.maxMana = calculateMaxMana(char, char.level);
    char.Mana.value = adjustValue(oldMaxValue, char.Mana.value, char.maxMana);

    oldMaxValue = char.maxRacialPower; // This should be char.maxRacialPower, not char.maxMana again
    char.maxRacialPower = calculateMaxRacialPower(char.level);
    char.racialPower = adjustValue(oldMaxValue, char.racialPower, char.maxRacialPower);

    // Update DOM elements if they exist (moved from here to UIManager.updateDOM)
    // This function focuses purely on data recalculation.
}

/**
 * Provides default character data for creating new characters.
 * @param {object} ExternalDataManager The ExternalDataManager instance.
 * @returns {object} A new character object with default values.
 */
export function defaultCharacterData(ExternalDataManager) {
    const firstRace = Object.keys(ExternalDataManager._data.Races)[0];

    let newCharacter = ({
        name: '',
        class: [],
        specialization: [],
        race: firstRace,
        level: 1,
        levelExperience: 0,
        levelMaxExperience: calculateLevelMaxExperience(1),
        maxHealth: 0, // Will be calculated dynamically
        healthBonus: 0,
        maxMana: 0, // Will be calculated dynamically
        racialPower: 100,
        maxRacialPower: 100,
        ac: 0,
        armorBonus: 0,
        skills: '',
        personalNotes: '',
        weaponInventory: [],
        armorInventory: [],
        generalInventory: [],
        sectionVisibility: {
            'basic-info-content': true,
            'player-stats-content': true,
            'health-combat-content': true,
            'skills-content': true,
            'weapon-inventory-content': true,
            'armor-inventory-content': true,
            'general-inventory-content': true,
            'racial-passives-content': true, // Make racial passives section visible by default
        },

        // Refactored properties for stat choices and affected stats
        StatChoices: {}, // Stores chosen passive details: { category: { passiveName: { slotId: { type, value?, statName?, level?, label? } } } }
        StatsAffected: {}, // Stores which stats are affected by which choices: { category: { passiveName: { statName: Set<string> } } }

        naturalHealthRegenActive: false, // Placeholder for Mutant regen
        naturalManaRegenActive: false, // Placeholder for Mutant regen
        healthRegenDoubled: false, // Placeholder for Mutant regen
        manaRegenDoubled: false, // Placeholder for Mutant regen
    });

    // Initialize each stat with its rolled value, racial change, and calculated total
    ExternalDataManager.rollStats.forEach(statName => {
        const result = roll(minRollStat, maxRollStat);
        const initialRacialChange = ExternalDataManager.getRacialChange(newCharacter.race, statName);
        newCharacter[statName] = {
            value: result,
            racialChange: initialRacialChange,
            equipment: 0,
            temporary: 0,
            experience: 0,
            maxExperience: defaultStatMaxExperience,
            total: result * initialRacialChange
        };
    });

    ExternalDataManager.otherStats.forEach(statName => {
        const initialRacialChange = ExternalDataManager.getRacialChange(newCharacter.race, statName);
        newCharacter[statName] = {
            value: 0,
            racialChange: initialRacialChange
        };
    });

    newCharacter['BaseHealth'].value = 100;
    recalculateUpdate(newCharacter);

    return newCharacter;
}

/**
 * Initializes a new character object and merges loaded data into it.
 * This function also handles recalculating derived stats and converting Sets.
 * @param {object} loadedChar The character object loaded from a file or Google Drive.
 * @param {object} ExternalDataManager The ExternalDataManager instance.
 * @returns {object} The fully initialized and merged character object.
 */
export function initLoadCharacter(loadedChar, ExternalDataManager) {
    const newChar = defaultCharacterData(ExternalDataManager); // Start with a fresh default character

    // Deep merge loaded properties into the new character
    for (const key in newChar) {
        if (loadedChar.hasOwnProperty(key)) {
            if (key === 'class' || key === 'specialization' || key === 'weaponInventory' || key === 'armorInventory' || key === 'generalInventory') {
                // Ensure these are arrays, even if loaded data has non-array
                newChar[key] = Array.isArray(loadedChar[key]) ? loadedChar[key] : [];
            } else if (typeof newChar[key] === 'object' && newChar[key] !== null && !Array.isArray(newChar[key]) && !(newChar[key] instanceof Set)) {
                // Handle nested objects (like stat objects)
                if (typeof loadedChar[key] === 'object' && loadedChar[key] !== null) {
                    Object.assign(newChar[key], loadedChar[key]);
                }
                // Ensure maxExperience is set for stats, if it was excluded during saving or missing
                if (ExternalDataManager.rollStats.includes(key) && (typeof newChar[key].maxExperience === 'undefined' || newChar[key].maxExperience === null)) {
                    newChar[key].maxExperience = defaultStatMaxExperience;
                }
            } else if (key === 'StatsAffected') {
                // Convert arrays back to Sets for StatsAffected
                newChar[key] = {};
                if (loadedChar[key]) {
                    for (const category in loadedChar[key]) {
                        newChar[key][category] = {};
                        for (const passiveName in loadedChar[key][category]) {
                            newChar[key][category][passiveName] = {};
                            for (const statName in loadedChar[key][category][passiveName]) {
                                newChar[key][category][passiveName][statName] = new Set(Array.isArray(loadedChar[key][category][passiveName][statName]) ? loadedChar[key][category][passiveName][statName] : []);
                            }
                        }
                    }
                }
            } else {
                newChar[key] = loadedChar[key];
            }
        }
    }

    // Handle section visibility - ensure all default sections are present
    newChar.sectionVisibility = { ...defaultCharacterData(ExternalDataManager).sectionVisibility, ...loadedChar.sectionVisibility };

    // Initialize originalDamage/originalMagicDamage for weapons if not present
    newChar.weaponInventory.forEach(weapon => {
        if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
        if (typeof weapon.originalMagicDamage === 'undefined') weapon.originalMagicDamage = weapon.magicDamage;
    });

    newChar.ac = newChar.armorBonus;

    // Recalculate totals for rollStats after loading to ensure consistency
    ExternalDataManager.rollStats.forEach(statName => {
        if (newChar[statName]) {
            newChar[statName].total = calculateTotal(newChar[statName], newChar, statName);
        }
    });

    return newChar;
}

/**
 * Handles the logic when a character's race changes.
 * Reverts old racial effects and applies new ones.
 * @param {object} character The current character object.
 * @param {string} oldRace The previous race of the character.
 * @param {function} updateDOM Callback to update the DOM.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function handleChangeRace(character, oldRace, updateDOM, saveCurrentStateToHistory) {
    // Revert all previous manual passive choices for the old race
    if (character.StatChoices[oldRace]) {
        for (const passiveName in character.StatChoices[oldRace]) {
            handleRevertChoices(character, oldRace, passiveName);
        }
        delete character.StatChoices[oldRace];
    }
    if (character.StatsAffected[oldRace]) {
        delete character.StatsAffected[oldRace];
    }

    // Update racialChange for each stat based on the new race
    ExternalDataManager.rollStats.forEach(statName => {
        updateRacialChange(character, oldRace, statName);
        character[statName].total = calculateTotal(character[statName], character, statName);
        // Note: DOM update for racialChange and total is handled in updateDOM
    });

    ExternalDataManager.otherStats.forEach(statName => {
        updateRacialChange(character, oldRace, statName);
    });

    // Update maxHealth, maxMana and maxRacialPower when race changes
    recalculateUpdate(character);

    // Re-render the racial passives UI
    updateDOM(); // This will trigger renderRacialPassives
    character.hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

/**
 * Updates the racial change for a specific stat when the race changes.
 * @param {object} char The character object.
 * @param {string} oldRace The previous race.
 * @param {string} statName The name of the stat.
 */
function updateRacialChange(char, oldRace, statName) {
    // Subtract the old racial change and add the new one
    // This assumes racialChange is an additive modifier. If it's multiplicative, logic needs adjustment.
    // Given the current implementation, it looks like it's a multiplier.
    // So, we need to apply the new multiplier directly.
    char[statName].racialChange = ExternalDataManager.getRacialChange(char.race, statName);
}

/**
 * Reverts the effects of all choices for a given category and passive name.
 * @param {object} char The character object.
 * @param {string} category The category (e.g., 'Demi-humans', 'Mutant').
 * @param {string} passiveName The name of the passive (e.g., 'Demi-human Stat Adjustments', 'Mutation').
 */
export function handleRevertChoices(char, category, passiveName) {
    if (char.StatsAffected[category] && char.StatsAffected[category][passiveName]) {
        for (const statName in char.StatsAffected[category][passiveName]) {
            const slotIds = char.StatsAffected[category][passiveName][statName];
            slotIds.forEach(slotId => {
                if (char.StatChoices[category] && char.StatChoices[category][passiveName] && char.StatChoices[category][passiveName][slotId]) {
                    const choice = char.StatChoices[category][passiveName][slotId];
                    revertChoiceRacialChange(char, statName, choice);
                }
            });
        }
    }
    // Clear the choices and affected stats for this passive
    if (char.StatChoices[category]) {
        delete char.StatChoices[category][passiveName];
    }
    if (char.StatsAffected[category]) {
        delete char.StatsAffected[category][passiveName];
    }
}

/**
 * Performs a quick roll for all player stats and updates the character data.
 * @param {object} character The current character object.
 * @param {function} renderWeaponInventory Callback to re-render weapon inventory.
 * @param {function} saveCurrentStateToHistory Callback to save history.
 */
export function quickRollStats(character, renderWeaponInventory, saveCurrentStateToHistory) {
    ExternalDataManager.rollStats.forEach(statName => {
        character[statName].value = roll(minRollStat, maxRollStat); // Assign to the 'value' property

        // Recalculate total for the updated stat
        character[statName].total = calculateTotal(character[statName], character, statName);

        // DOM update for value and total is handled in UIManager.updateDOM
    });
    // Re-render weapon inventory to update calculated damage values
    renderWeaponInventory();
    character.hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

/**
 * Handles changes to character stats (value, experience, equipment, temporary).
 * @param {object} character The current character object.
 * @param {string} statName The name of the stat (e.g., 'Strength').
 * @param {string} subProperty The sub-property changed (e.g., 'value', 'experience').
 * @param {number} newValue The new value.
 * @param {function} renderWeaponInventory Callback to re-render weapon inventory.
 */
export function handleStatInputChange(character, statName, subProperty, newValue, renderWeaponInventory) {
    if (subProperty === 'experience') {
        character[statName].experience = newValue;
        while (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
            character[statName].value++;
            character[statName].experience -= character[statName].maxExperience;
        }
    } else if (subProperty === 'maxExperience') {
        character[statName].maxExperience = Math.max(1, newValue);
        while (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
            character[statName].value++;
            character[statName].experience -= character[statName].maxExperience;
        }
    } else {
        character[statName][subProperty] = newValue;
    }
    character[statName].total = calculateTotal(character[statName], character, statName);
    renderWeaponInventory();
}

/**
 * Handles changes to character level and level experience.
 * @param {object} character The current character object.
 * @param {string} id The ID of the input element ('level' or 'levelExperience').
 * @param {number} newValue The new value.
 */
export function handleLevelInputChange(character, id, newValue) {
    if (id === 'levelExperience') {
        character.levelExperience = newValue;
        while (character.levelExperience >= character.levelMaxExperience) {
            character.level++;
            character.levelExperience -= character.levelMaxExperience;
            character.levelMaxExperience = calculateLevelMaxExperience(character.level);
        }
    } else if (id === 'level') {
        character.level = newValue;
        character.levelMaxExperience = calculateLevelMaxExperience(character.level);
    }
    recalculateUpdate(character);
}

/**
 * Handles changes to Health, Mana, Racial Power, Health Bonus, Armor Bonus, and Personal Notes.
 * @param {object} character The current character object.
 * @param {string} id The ID of the input element.
 * @param {number|string} newValue The new value.
 * @param {function} renderWeaponInventory Callback to re-render weapon inventory.
 */
export function handleOtherCharacterInputChange(character, id, newValue, renderWeaponInventory) {
    if (id === 'Health') {
        character.Health.value = Math.min(newValue, character.maxHealth);
    } else if (id === 'Mana') {
        character.Mana.value = Math.min(newValue, character.maxMana);
    } else if (id === 'racialPower') {
        character.racialPower = Math.min(newValue, character.maxRacialPower);
    } else if (id === 'healthBonus') {
        character.healthBonus = newValue;
        character.maxHealth = calculateMaxHealth(character, character.level, character.healthBonus);
        character.Health.value = Math.min(character.Health.value, character.maxHealth);
    } else if (id === 'armorBonus') {
        character.armorBonus = newValue;
        character.ac = character.armorBonus;
    } else if (id === 'personalNotes') {
        character.personalNotes = newValue;
    } else {
        character[id] = newValue; // For 'name', 'skills'
    }
    renderWeaponInventory();
}

/**
 * Handles changes to inventory items (weapon, armor, general).
 * @param {object} character The current character object.
 * @param {string} inventoryType The type of inventory ('weapon', 'armor', 'general').
 * @param {number} itemIndex The index of the item in the inventory array.
 * @param {string} field The field of the item being changed.
 * @param {*} value The new value of the field.
 * @param {string} type The HTML input type (e.g., 'number', 'checkbox').
 * @param {boolean} checked For checkbox inputs, whether it's checked.
 * @param {function} renderWeaponInventory Callback to re-render weapon inventory.
 * @param {function} renderArmorInventory Callback to re-render armor inventory.
 * @param {function} renderGeneralInventory Callback to re-render general inventory.
 */
export function handleInventoryInputChange(character, inventoryType, itemIndex, field, value, type, checked, renderWeaponInventory, renderArmorInventory, renderGeneralInventory) {
    let inventoryArray;
    let renderFunction;

    if (inventoryType === 'weapon') {
        inventoryArray = character.weaponInventory;
        renderFunction = renderWeaponInventory;
    } else if (inventoryType === 'armor') {
        inventoryArray = character.armorInventory;
        renderFunction = renderArmorInventory;
    } else if (inventoryType === 'general') {
        inventoryArray = character.generalInventory;
        renderFunction = renderGeneralInventory;
    } else {
        console.warn(`handleInventoryInputChange: Unknown inventory type '${inventoryType}'.`);
        return;
    }

    if (field === 'use' || field === 'equipped') { // Handle checkboxes
        inventoryArray[itemIndex][field] = checked;
        if (inventoryType === 'weapon' && field === 'use') {
            if (checked) {
                inventoryArray[itemIndex].originalDamage = inventoryArray[itemIndex].damage;
                inventoryArray[itemIndex].originalMagicDamage = inventoryArray[itemIndex].magicDamage;
                inventoryArray[itemIndex].damage = calculateFormula(inventoryArray[itemIndex].originalDamage);
                inventoryArray[itemIndex].magicDamage = calculateFormula(inventoryArray[itemIndex].originalMagicDamage);
            } else {
                inventoryArray[itemIndex].damage = inventoryArray[itemIndex].originalDamage;
                inventoryArray[itemIndex].magicDamage = inventoryArray[itemIndex].originalMagicDamage;
            }
        }
    } else if (type === 'number' && !(inventoryType === 'weapon' && (field === 'damage' || field === 'magicDamage'))) {
        inventoryArray[itemIndex][field] = parseFloat(value) || 0;
    } else {
        inventoryArray[itemIndex][field] = value;
    }

    renderFunction(); // Re-render the specific inventory table
}

/**
 * Handles adding a new weapon to the character's inventory.
 * @param {object} character The current character object.
 * @param {function} renderWeaponInventory Callback to re-render the weapon inventory.
 */
export function addWeapon(character, renderWeaponInventory) {
    character.weaponInventory.push({ name: '', type: '', material: '', requirement: '', requiredStat: '', accuracy: 100, damage: '', magicDamage: '', magicType: '', effect: '', value: 0, use: false });
    renderWeaponInventory();
}

/**
 * Handles adding new armor to the character's inventory.
 * @param {object} character The current character object.
 * @param {function} renderArmorInventory Callback to re-render the armor inventory.
 */
export function addArmor(character, renderArmorInventory) {
    character.armorInventory.push({ name: '', location: '', material: '', requirement: '', requiredStat: '', defense: 0, magicDefense: 0, magicType: '', effect: '', value: 0, equipped: false });
    renderArmorInventory();
}

/**
 * Handles adding a new general item to the character's inventory.
 * @param {object} character The current character object.
 * @param {function} renderGeneralInventory Callback to re-render the general inventory.
 */
export function addGeneralItem(character, renderGeneralInventory) {
    character.generalInventory.push({ name: '', type: '', effect: '', accuracy: 0, amount: 0, valuePerUnit: 0 });
    renderGeneralInventory();
}

/**
 * Handles removing an item from an inventory.
 * @param {object} character The current character object.
 * @param {string} inventoryType The type of inventory ('weapon', 'armor', 'general').
 * @param {number} index The index of the item to remove.
 * @param {function} renderWeaponInventory Callback to re-render weapon inventory.
 * @param {function} renderArmorInventory Callback to re-render armor inventory.
 * @param {function} renderGeneralInventory Callback to re-render general inventory.
 */
export function removeItem(character, inventoryType, index, renderWeaponInventory, renderArmorInventory, renderGeneralInventory) {
    if (inventoryType === 'weapon') {
        character.weaponInventory.splice(index, 1);
        renderWeaponInventory();
    } else if (inventoryType === 'armor') {
        character.armorInventory.splice(index, 1);
        renderArmorInventory();
    } else if (inventoryType === 'general') {
        character.generalInventory.splice(index, 1);
        renderGeneralInventory();
    }
}