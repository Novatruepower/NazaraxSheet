import { defaultStatMaxExperience, defaultRacialPointScale, TOTAL_DISTRIBUTION_POINTS, MIN_STAT_VALUE, MAX_STAT_VALUE } from './constants.js';
import { showStatusMessage } from './uiUtils.js';
import { ExternalDataManager } from './externalDataManager.js';
import { currentGoogleDriveFileId, setCurrentGoogleDriveFileId } from './state.js';
import { maybeEnableGoogleDriveButtons, handleGoogleDriveAuthClickThenCall, handleGoogleDriveAuthClick, handleGoogleDriveSignoutClick } from './googleDrive.js';

// --- AUTO HISTORY SAVER ---
let historySaveInterval = null;

function startAutoHistorySaver() {
    if (historySaveInterval) return; // already running

    historySaveInterval = setInterval(() => {
        if (hasUnsavedChanges) {
            saveCurrentStateToHistory();
            console.log(historyPointer);
            console.log(historyStack.length);
        }
    }, 1000); // every 1 second
}

function stopAutoHistorySaver() {
    if (historySaveInterval) {
        clearInterval(historySaveInterval);
        historySaveInterval = null;
    }
}

// Function to calculate max experience for a given level
function calculateLevelMaxExperience(char) {
    return char.uniqueIdentifiers['Self reflection'] ? char.uniqueIdentifiers['Self reflection'].values[0] : 100;
}

function applyOperator(v1, type, v2) {
    switch (type) {
        case '*':
            return v1 * v2;
        case '/':
            return v1 / v2;
        case '+':
            return v1 + v2;
        case '-':
            return v1 - v2;
        default:
            return 0;
    }
}

function applyEffectValues(charData, effect) {
    let val = 0;

    if (effect.stats) {
        const length = effect.stats.length;

        for (let index = 0; index < length; ++index) {
            val += applyOperator(charData[effect.stats[index]], effect.types[index], effect.values[index])
        }
    } else {
        for (const value of effect.values) {
            val += value;
        }
    }

    return val;
}

function applyPercent(charData, effect) {
    let value = applyEffectValues(charData, effect);
    
    return effect.isPercent ? value / 100 : value;
}

function applyPercentOnBaseValue(charData, effect, baseValue) {
    if (effect.isPercent)
        return baseValue * applyPercent(charData, effect);
    
    return parseFloat(effect.values[0]) || 0;
}

function applyTemporaryOperatorEffects(charData, temporaryEffects, type, baseValue, currentValue) {
    let tempValue = currentValue;

    if (type === '*') {
        temporaryEffects.forEach(effect => {
            tempValue *= applyPercent(charData, effect);
        });
    }
    else if (type === '+') {
        temporaryEffects.forEach(effect => {
            tempValue += applyPercentOnBaseValue(charData, effect, baseValue);
        });
    }

    return tempValue;
}

function applyTemporaryFilterEffects(charData, temporaryEffects, baseValue, currentValue, isTotal) {
    let tempValue = currentValue;
    const operators = isTotal ? ['*', '+'] : ['+', '*'];
    operators.forEach(type => {
        tempValue = applyTemporaryOperatorEffects(charData, temporaryEffects.filter(effect => effect.type === type), type, baseValue, tempValue);
    });
    
    return tempValue;
}

function safeEvaluate(text, chardata) {
    let string = text.trim().toLowerCase();

    for (const label of Object.keys(statMapping)) {
        const value = getStatValue(label);
        const regex = new RegExp(`\\b${label}\\b`, 'gi');
        parsedFormula = parsedFormula.replace(regex, value);
    }

    ExternalDataManager._data.Roll.forEach(stat => {
       string = string.replaceAll(stat.toLowerCase(), calculateRollStatTotal(chardata, stat));
    });

    let unsafe = string.replace(/[^0-9+*/(). -]/g, ""); //only Keep number and () and math operators and spaces

    if (unsafe != string) {
        alert("Something was wrong in: " + string + " turned into: " + unsafe);
    }

    try {
        return math.evaluate(unsafe);
    }
    catch (error) {
        alert("Invalid math expression: " + error.message + " in " + unsafe);
        return unsafe;
    }
}

/**
 * Applies a list of temporary effects to a given base value.
 * Additive effects are applied first, then multiplicative effects.
 * @param {number} baseValue The initial value to apply effects to.
 * @param {Array<object>} temporaryEffects An array of effect objects, each with 'value', 'type' ('add' or 'multiply').
 * @returns {number} The value after applying all temporary effects.
 */
function applyTemporaryEffects(charData, baseValue, temporaryEffects) {
    let currentValue = parseFloat(baseValue) || 0;
    const baseFloatValue = currentValue;
    const notTotalEffects = temporaryEffects.filter(effect => effect.appliesTo !== 'total');
    const totalEffects = temporaryEffects.filter(effect => effect.appliesTo === 'total');
    const appliesTo = ['initial-value', 'base-value'];
    appliesTo.forEach(applieTo => {
        currentValue = applyTemporaryFilterEffects(charData, notTotalEffects.filter(effect => effect.appliesTo === applieTo), baseFloatValue, currentValue, false);
    });

    currentValue = applyTemporaryFilterEffects(charData, totalEffects, baseFloatValue, currentValue, true);

    return currentValue;
}

function calculateMaxTotal(charData, effects, level, initialValue, intermediateValue) {
    const effectsOnBaseValue = effects.filter(effect => effect.appliesTo === 'base-value');
    let baseValue = applyTemporaryEffects(charData, initialValue, effectsOnBaseValue);

    // Calculate the initial total based on the modified base value and level
    let currentTotal = baseValue * level + intermediateValue;

    // Apply effects on total
    const effectsOnTotal = effects.filter(effect => effect.appliesTo === 'total');
    return applyTemporaryEffects(charData, currentTotal, effectsOnTotal);
}

function calculateBaseMaxValue(charData, effects, valueName) {
    const baseValueName = `Base${valueName}`;
    const effectsOnInitialValue = effects.filter(effect => effect.appliesTo === 'initial-value');
    let base = applyTemporaryEffects(charData, charData[baseValueName].value, effectsOnInitialValue);
    return base * charData[baseValueName].racialChange * charData[valueName].racialChange;
}

function calculateBaseMaxHealth(charData, effects) {
    return calculateBaseMaxValue(charData, effects, 'Health');
}

function getCategoriesTemporaryEffects(charData, statName) {
    let categoriesTemporaryEffects = [];
    const temporaryEffects = charData[statName].temporaryEffects

    for (const category in temporaryEffects) {
        categoriesTemporaryEffects.push(...temporaryEffects[category]);
    }
    
    return categoriesTemporaryEffects;
}

// Function to calculate max health based on race, level, and bonus
function calculateMaxHealth(charData, level) {
    const effects = getCategoriesTemporaryEffects(charData, 'Health');

    return Math.floor(calculateMaxTotal(charData, effects, level, calculateBaseMaxHealth(charData, effects), 0));
}

function calculateBaseMaxMana(charData, effects) {
    return calculateBaseMaxValue(charData, effects, 'Mana');
}

// Function to calculate max magic based on level
function calculateMaxMana(charData, level) {
    const effects = getCategoriesTemporaryEffects(charData, 'Mana');

    return Math.floor(calculateMaxTotal(charData, effects, level, calculateBaseMaxMana(charData, effects), 0));
}

function calculateBaseMaxRacialPower(charData, effects) {
    return calculateBaseMaxValue(charData, effects, 'RacialPower');
}

// Function to calculate max racial power based on level
function calculateMaxRacialPower(charData, level) {
    const effects = getCategoriesTemporaryEffects(charData, 'RacialPower');

    if (charData.uniqueIdentifiers['Savagery'])
        return charData.uniqueIdentifiers['Savagery'].values[2];

    if (charData.uniqueIdentifiers['Spatial Reserve']) {
        return Math.floor(calculateMaxTotal(charData, effects, level, calculateBaseMaxRacialPower(charData, effects), charData.uniqueIdentifiers['Spatial Reserve'].values[0]));
    }

    return Math.floor(calculateMaxTotal(charData, effects, level, calculateBaseMaxRacialPower(charData, effects), 0));
}

/**
 * Calculates the total defense for a character, including equipped armor and temporary effects.
 * @param {object} charData The character object.
 * @returns {number} The calculated total defense.
 */
function calculateTotalDefense(charData) {
    const effects = getCategoriesTemporaryEffects(charData, 'totalDefense');
    const effectsOnInitialValue = effects.filter(effect => effect.appliesTo === 'initial-value');
    let baseDefense = applyTemporaryEffects(charData, 0, effectsOnInitialValue);;
    charData.armorInventory.forEach(armor => {
        if (armor.equipped) {
            if (armor.rolledDefense === undefined) {
                armor.rolledDefense = calculateFormula(armor.defense || '0');
            }
            baseDefense += (parseFloat(armor.rolledDefense) || 0);
        }
    });

    // For totalDefense, we don't have a 'level' multiplier like health/mana.
    // We apply effects directly to the sum of equipped armor defense.
    return Math.floor(applyTemporaryEffects(charData, baseDefense, effects));
}

// Generate a random number between min and max (inclusive)
function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function adjustValue(oldMaxValue, value, newMaxValue) {
    return value == oldMaxValue ? newMaxValue : Math.min(value, newMaxValue);
}

function levelUp(levelExperience) {
    character.levelExperience = levelExperience;
    while (character.levelExperience >= character.levelMaxExperience) {
        character.level++;
        character.levelExperience -= character.levelMaxExperience;
        character.levelMaxExperience = calculateLevelMaxExperience(character);
    }
    document.getElementById('level').value = character.level;
    document.getElementById('levelMaxExperience').value = character.levelMaxExperience;
    document.getElementById('levelExperience').value = character.levelExperience;
}

/**
 * Recalculates fews derived properties for a character.
 * This function updates the character's internal data and can directly update the DOM.
 * DOM updates should be handled by calling `updateDOM()` separately.
 * @param {object} char The character object to recalculate properties for.
 * @param {boolean} char The character object to update the DOM.
 */
function recalculateSmallUpdateCharacter(char, isDisplay = false) {
    let oldMaxValue = char.maxHealth;
    char.maxHealth = calculateMaxHealth(char, char.level); // Removed healthBonus parameter
    char.Health.value = adjustValue(oldMaxValue, char.Health.value, char.maxHealth);

    oldMaxValue = char.maxMana;
    char.maxMana = calculateMaxMana(char, char.level);
    char.Mana.value = adjustValue(oldMaxValue, char.Mana.value, char.maxMana);

    oldMaxValue = char.maxRacialPower;
    char.maxRacialPower = calculateMaxRacialPower(char, char.level);
    char.RacialPower.value = adjustValue(oldMaxValue, char.RacialPower.value, char.maxRacialPower);

    oldMaxValue = char.levelMaxExperience;
    char.levelMaxExperience = calculateLevelMaxExperience(char);

    // Recalculate totalDefense
    char.totalDefense.value = calculateTotalDefense(char);
    // No adjustment needed for totalDefense as it's not a current/max value like health/mana

    if (isDisplay) {
        levelUp(character.levelExperience);
        document.getElementById('maxHealth').value = character.maxHealth;
        healthInput.value = character.Health.value;
        document.getElementById('maxMana').value = character.maxMana;
        manaInput.value = character.Mana.value;
        document.getElementById('maxRacialPower').value = character.maxRacialPower;
        racialPowerInput.value = character.RacialPower.value;
        document.getElementById('total-defense').value = character.totalDefense.value; // Update totalDefense display
    }
}

/**
 * Recalculates derived properties for a character.
 * This function updates the character's internal data, but does not directly update the DOM.
 * DOM updates should be handled by calling `updateDOM()` separately.
 * @param {object} char The character object to recalculate properties for.
 */
function recalculateCharacterDerivedProperties(char, isSmallDisplay = false) {
    recalculateSmallUpdateCharacter(char, isSmallDisplay);

    let newMaxExperience = defaultStatMaxExperience;

    if (char.uniqueIdentifiers['Growth']) {
        newMaxExperience -= char.uniqueIdentifiers['Growth'].values[0];
    }

    // Recalculate totals for rollStats after any changes that might affect them (e.g., racial changes)
    ExternalDataManager.rollStats.forEach(statName => {
        if (char[statName]) {
            const total = document.getElementById(`${statName}-total`);
            if (total)
                total.value = calculateRollStatTotal(char, statName);

            const maxExperience = document.getElementById(`${statName}-maxExperience`);

            if (maxExperience) {
                char[statName].maxExperience = newMaxExperience;
                document.getElementById(`${statName}-maxExperience`).value = char[statName].maxExperience;
            }
        }
    });
}

const defaultCharacterData = function () {
    const firstRace = Object.keys(ExternalDataManager._data.Races)[0];
    const starterItems = ExternalDataManager.getRaceStarterItems(firstRace);

    let newCharacter = ({
        name: '',
        classes: [],
        specializations: {},
        race: firstRace,
        level: 1,
        levelExperience: 0,
        levelMaxExperience: 100, // Will be calculated dynamically
        maxHealth: 0, // Will be calculated dynamically
        maxMana: 0, // Will be calculated dynamically
        maxRacialPower: 0, // Will be calculated dynamically
        totalDefense: { value: 0, temporaryEffects: {} }, // Initialize totalDefense with temporaryEffects
        
        layouts: {
            // Store layout as percentages (0.0 - 1.0) for responsiveness
            personalNotes: { // Default values in percentages
                x: 0.8031800601633003,
                y: 0.025295109612141653,
                width: 0.1826385904598195,
                height: 0.2318718381112985,
                text: ''
            },
            backstory: {
                text: ''
            }
        },
        
        weaponInventory: [],
        armorInventory: [],
        generalInventory: [],
        htmlVisibility: {
            'basic-info-content': true,
            'player-stats-content': true,
            'health-combat-content': true,
            'active-effects-content': true,
            'actives-content': true,
            'weapon-inventory-content': true,
            'armor-inventory-content': true,
            'general-inventory-content': true,
            'racial-passives-content': true, // Make racial passives section visible by default
        },

        //uniqueIdentifier: {...}
        uniqueIdentifiers: {},

        // Refactored properties for stat choices and affected stats
        // StatChoices: { category: { uniqueIdentifier: { slotId: { type, value?, statName?, level?, label?, unique? } } } }
        StatChoices: {},
        // StatsAffected: { category: { uniqueIdentifier: { statName: Set<string> } } }
        StatsAffected: {},
        isDistributingStats: false, // Flag to indicate if in distribution mode
        remainingDistributionPoints: 0,

        states: {
            'In Fight': false,
            'Unconscious': false,
            'Sleeping': false,
            'Taking Damage': false,
            'Bleeding' : false,
            'Active Racial Skill': false,
            'Hands Covered': false,
            'Feets Covered': false,
        },

        permHealthRegenActive: 0, //count
        permManaRegenActive: 0, //count

        purse: starterItems && starterItems["Coins"] ? starterItems["Coins"] : 0,
        bank: 0,
    });

    newCharacter.levelMaxExperience = calculateLevelMaxExperience(newCharacter);

    // Initialize each stat with its rolled value, racial change, and calculated total
    ExternalDataManager.rollStats.forEach(statName => {
        const result = newCharacter.isDistributingStats ? MIN_STAT_VALUE : roll(MIN_STAT_VALUE, MAX_STAT_VALUE); // Initialize with MIN_STAT_VALUE if distributing
        const initialRacialChange = ExternalDataManager.getRacialChange(newCharacter.race, statName);
        newCharacter[statName] = {
            baseValue: result, // Changed 'value' to 'baseValue'
            experienceBonus: 0, // Added new field for experience bonus
            racialChange: initialRacialChange,
            equipment: 0,
            temporaryEffects: {}, // Initialize as an empty object for temporary effects
            experience: 0,
            maxExperience: defaultStatMaxExperience
        };
    });

    ExternalDataManager.otherStats.forEach(statName => {
        const initialRacialChange = ExternalDataManager.getRacialChange(newCharacter.race, statName);

        newCharacter[statName] = {
            value: 0,
            racialChange: initialRacialChange
        }
    });

    // Initialize Health with temporaryEffects array
    newCharacter['BaseHealth'].value = 100;
    newCharacter['BaseMana'].value = 100;
    newCharacter['BaseRacialPower'].value = 100;
    newCharacter['naturalHealthRegen'].value = 0.05; //%
    newCharacter['naturalManaRegen'].value = 0.05; //%
    newCharacter['naturalRacialPowerRegen'].value = 0; //%

    newCharacter['Health'].temporaryEffects = {}; // Ensure Health has a temporaryEffects array
    newCharacter['Mana'].temporaryEffects = {}; // Ensure Mana has a temporaryEffects array
    newCharacter['RacialPower'].temporaryEffects = {}; // Ensure RacialPower has a temporaryEffects array

    //See if usefull
    //newCharacter['naturalHealthRegen'].temporaryEffects = {};
    //newCharacter['naturalManaRegen'].temporaryEffects = {};
    //newCharacter['naturalRacialPowerRegen'].temporaryEffects = {};

    recalculateCharacterDerivedProperties(newCharacter); // Calculate initial derived properties

    return newCharacter;
};

// Array to hold all character sheets
let characters = [];
// Index of the currently active character sheet
let currentCharacterIndex = 0;

// Flag to track if there are unsaved changes
let hasUnsavedChanges = false;

// Inventory display settings
let inventoryViewSettings = {
    weapon: 'cards',
    armor: 'cards',
    general: 'cards'
};

// History stack for revert/forward functionality
let historyStack = [];
let historyPointer = -1; // Pointer to the current state in the historyStack
const MAX_HISTORY_LENGTH = 10; // Store last 10 states

/**
 * Converts Sets within the character object to Arrays for serialization (e.g., for history or saving).
 * This function creates a deep copy and modifies the copy.
 * @param {Array<object>} chars The array of character objects to process.
 * @returns {Array<object>} A deep copy of the characters with Sets converted to Arrays.
 */
function convertSetsToArraysForSave(chars) {
    const charactersCopy = JSON.parse(JSON.stringify(chars));
    charactersCopy.forEach(char => {
        if (char.StatsAffected) {
            for (const category in char.StatsAffected) {
                for (const uniqueIdentifier in char.StatsAffected[category]) { // Changed from passiveName
                    for (const statName in char.StatsAffected[category][uniqueIdentifier]) { // Changed from passiveName
                        if (char.StatsAffected[category][uniqueIdentifier][statName] instanceof Set) { // Changed from passiveName
                            char.StatsAffected[category][uniqueIdentifier][statName] = Array.from(char.StatsAffected[category][uniqueIdentifier][statName]); // Changed from passiveName
                        }
                    }
                }
            }
        }
    });
    return charactersCopy;
}

/**
 * Converts Arrays back to Sets within the character object after loading (e.g., from history or file).
 * This function modifies the provided character object in place.
 * @param {Array<object>} chars The array of character objects to process.
 */
function convertArraysToSetsAfterLoad(chars) {
    chars.forEach(char => {
        if (char.StatsAffected) {
            for (const category in char.StatsAffected) {
                for (const uniqueIdentifier in char.StatChoices[category]) { // Use StatChoices to iterate actual choices
                    for (const statName in char.StatsAffected[category][uniqueIdentifier]) {
                        if (Array.isArray(char.StatsAffected[category][uniqueIdentifier][statName])) {
                            char.StatsAffected[category][uniqueIdentifier][statName] = new Set(char.StatsAffected[category][uniqueIdentifier][statName]);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Save current state into history.
 */
function saveCurrentStateToHistory() {
    const currentState = convertSetsToArraysForSave(characters);

    // If not at end, cut off "future" states (redo branch)
    if (historyPointer < historyStack.length - 1) {
        historyStack = historyStack.slice(0, historyPointer + 1);
    }

    // Avoid pushing duplicate states
    const lastState = historyStack[historyPointer];
    if (lastState && JSON.stringify(lastState) === JSON.stringify(currentState) && !hasUnsavedChanges) {
        updateHistoryButtonsState();
        return;
    }

    // Push new state
    historyStack.push(currentState);
    historyPointer++;

    // Trim excess
    const excess = historyStack.length - MAX_HISTORY_LENGTH;
    if (excess > 0) {
        historyStack.splice(0, excess);
        historyPointer = Math.max(historyPointer - excess, 0);
    }

    hasUnsavedChanges = false;
    console.log("Saved state. Length:", historyStack.length, "Pointer:", historyPointer);
    updateHistoryButtonsState();
}

// Getter to easily access the current character
const character = new Proxy({}, {
    get: function (target, prop) {
        return characters[currentCharacterIndex][prop];
    },
    set: function (target, prop, value) {
        // Only set hasUnsavedChanges to true if the value actually changes
        if (characters[currentCharacterIndex][prop] !== value) {
            characters[currentCharacterIndex][prop] = value;
            hasUnsavedChanges = true; // Mark that there are unsaved changes
        }

        // If the character name changes, update the selector
        if (prop === 'name') {
            populateCharacterSelector();
        }
        return true;
    }
});

// Mapping for common terms to character properties for formula evaluation
const statMapping = {
    "Strength": "Strength-total",
    "Agility": "Agility-total",
    "Magic": "Magic-total",
    "Luck": "Luck-total",
    "Crafting": "Crafting-total",
    "Intelligence": "Intelligence-total",
    "Intimidation": "Intimidation-total",
    "Charisma": "Charisma-total",
    "Negotiation": "Negotiation-total",
    "hp": "Health",
    "Health": "Health",
    "MaxHp": "maxHealth",
    "MaxHealth": "maxHealth",
    "MagicPoints": "Mana",
    "maxMana": "maxMana",
    "RacialPower": "RacialPower",
    "MaxRacialPower": "maxRacialPower",
    "AC": "totalDefense",
    "Armor": "totalDefense",
    "Level": "level",
    "level": "level",
    "lvl": "level"
};


// Function to calculate the total for a given stat
function calculateRollStatTotal(char, statName) {
    const stat = char[statName];
    // Ensure values are treated as numbers, defaulting to 0 if NaN
    let combinedValue = (parseFloat(stat.baseValue) || 0) + (parseFloat(stat.experienceBonus) || 0); // Use baseValue + experienceBonus
    const equipment = parseFloat(stat.equipment) || 0;
    // Use getAppliedRacialChange to get the combined racial modifier (percentage change)
    const racialChange = getAppliedRacialChange(char, statName);

    const effects = getCategoriesTemporaryEffects(char, statName);
    const effectsOnInitialValue = effects.filter(effect => effect.appliesTo === 'initial-value');
    const baseStat = applyTemporaryEffects(char, combinedValue * racialChange, effectsOnInitialValue);;

    return Math.ceil(calculateMaxTotal(char, effects, 1, Math.ceil(baseStat), equipment));
}

function getAppliedRacialChange(charData, statName) {
    if (ExternalDataManager.stats.includes(statName)) {
        return charData[statName].racialChange;
    }

    console.warn(`getAppliedRacialChange: Unhandled statName '${statName}'. Returning 0.`);
    return 0;
}


// Then use a function like this to fetch the actual value from the document
function getStatValue(statLabel) {
    const elementId = statMapping[statLabel];
    if (!elementId) return 0;
    
    let el = document.getElementById(elementId);
    if (!el) {
        // Fallback: try capitalized first letter (e.g. strength-total -> Strength-total)
        const capitalizedId = elementId.charAt(0).toUpperCase() + elementId.slice(1);
        el = document.getElementById(capitalizedId);
    }
    if (!el) {
        // Fallback: try lowercased first letter (e.g. Strength-total -> strength-total)
        const lowercasedId = elementId.charAt(0).toLowerCase() + elementId.slice(1);
        el = document.getElementById(lowercasedId);
    }
    
    if (el) {
        return parseFloat(el.value) || 0;
    }

    // Fallback: Check the global character proxy object directly if DOM isn't updated yet
    if (typeof character !== 'undefined') {
        if (character[statLabel] !== undefined) {
            const val = character[statLabel];
            if (val && typeof val === 'object') {
                return parseFloat(val.value) || parseFloat(val.baseValue) || 0;
            }
            return parseFloat(val) || 0;
        }
        // Case-insensitive character field search
        const lowerLabel = statLabel.toLowerCase();
        for (const key of Object.keys(character)) {
            if (key.toLowerCase() === lowerLabel) {
                const val = character[key];
                if (val && typeof val === 'object') {
                    return parseFloat(val.value) || parseFloat(val.baseValue) || 0;
                }
                return parseFloat(val) || 0;
            }
        }
    }
    
    return 0;
}

// Updated calculateFormula to perform regex replace using statMapping and roll dice notations
function calculateFormula(formulaString) {
    if (typeof formulaString !== 'string') return formulaString != null ? formulaString : '';

    // Replace all mapped keys in the formula with actual values from the DOM
    let parsedFormula = formulaString;
    for (const label of Object.keys(statMapping)) {
        const value = getStatValue(label);
        const regex = new RegExp(`\\b${label}\\b`, 'gi');
        parsedFormula = parsedFormula.replace(regex, value);
    }

    // Replace dice notations (e.g. 2d6, 1d4, d10) with actual random rolls
    const diceRegex = /\b(\d*)d(\d+)\b/gi;
    parsedFormula = parsedFormula.replace(diceRegex, (match, countStr, sidesStr) => {
        const count = countStr ? parseInt(countStr, 10) : 1;
        const sides = parseInt(sidesStr, 10);
        let rollSum = 0;
        for (let i = 0; i < count; i++) {
            rollSum += Math.floor(Math.random() * sides) + 1;
        }
        return rollSum;
    });

    try {
        return eval(parsedFormula); // Note: `eval` can be dangerous; sanitize input if needed
    } catch (error) {
        console.warn(`Error evaluating formula: ${formulaString}`, error);
        return parsedFormula;
    }
}


/**
 * Prepares character data for saving by creating a deep copy and excluding calculated properties.
 * @param {Array<object>} chars The array of character objects to prepare.
 * @returns {Array<object>} A deep copy of the characters with calculated properties removed.
 */
function prepareCharactersForSaving(chars) {
    const charactersToSave = convertSetsToArraysForSave(chars); // Convert Sets to Arrays first
    charactersToSave.forEach(char => {
        ExternalDataManager.rollStats.forEach(statName => {
            if (char[statName]) {
                const { maxExperience, total, ...rest } = char[statName];
                char[statName] = rest; // Assign the object without maxExperience and total
            }
        });
        // Exclude calculated properties (maxHealth, maxMana, maxRacialPower, totalDefense) from the saved data
        delete char.maxHealth;
        delete char.maxMana;
        delete char.maxRacialPower;
        delete char.totalDefense; // Ensure totalDefense is also excluded as it's now derived
    });

    console.log(charactersToSave);
    return charactersToSave;
}

// Function to save all character data to a JSON file (download)
function saveCharacterToFile() {
    saveCurrentStateToHistory(); // Ensure current state is saved to history before saving to file
    const charactersToSave = prepareCharactersForSaving(characters);

    const fileName = (characters[0].name.trim() !== '' ? characters[0].name.trim() + '_sheet' : 'character_sheets') + '.json';
    const dataStr = JSON.stringify(charactersToSave, null, 2); // Pretty print JSON
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName; // Save all characters in one file
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showStatusMessage("Character data saved to JSON file!");
    console.log("All character data downloaded as JSON file!");
    hasUnsavedChanges = false; // Data is now saved
}

/**
* Initializes a new character object and merges loaded data into it.
* This function also handles recalculating derived stats and converting Sets.
* @param {object} loadedChar The character object loaded from a file or Google Drive.
* @returns {object} The fully initialized and merged character object.
*/
function initLoadCharacter(loadedChar) {
    const newChar = defaultCharacterData(); // Start with a fresh default character

    // Deep merge loaded properties into the new character
    for (const key in newChar) {
        if (loadedChar.hasOwnProperty(key)) {
            if (key === 'classes'|| key === 'weaponInventory' || key === 'armorInventory' || key === 'generalInventory') {
                // Ensure these are arrays, even if loaded data has non-array
                newChar[key] = Array.isArray(loadedChar[key]) ? loadedChar[key] : [];
            } else if (key === 'specializations' ) {
                newChar[key] = { ...newChar[key], ...loadedChar[key] };
            } else if (key === 'layouts') {
                newChar[key] = { ...newChar[key], ...loadedChar[key] };
                const layouts = Object.keys(newChar[key]);
                
                for (const layout of layouts) {
                    // If loaded values are likely pixel values (e.g., > 1), convert them to percentages
                    const layoutData = newChar[key][layout];
                    if (layoutData.x > 1 || layoutData.y > 1 || layoutData.width > 1 || layoutData.height > 1) {
                        const currentViewportWidth = window.innerWidth;
                        const currentViewportHeight = window.innerHeight;

                        const loadedData = loadedChar[key][layout];
                        newChar[key][layout].x = (loadedData.x / currentViewportWidth);
                        newChar[key][layout].y = (loadedData.y / currentViewportHeight);
                        newChar[key][layout].width = (loadedData.width / currentViewportWidth);
                        newChar[key][layout].height = (loadedData.height / currentViewportHeight);
                    }
                }
            } else if (typeof newChar[key] === 'object' && newChar[key] !== null && !Array.isArray(newChar[key]) && !(newChar[key] instanceof Set)) {
                // Handle nested objects (like stat objects)
                if (typeof loadedChar[key] === 'object' && loadedChar[key] !== null) {
                    Object.assign(newChar[key], loadedChar[key]);

                    // Handle migration from old 'value' to 'baseValue' + 'experienceBonus'
                    if (ExternalDataManager.rollStats.includes(key)) {
                        if (typeof newChar[key].baseValue === 'undefined' && typeof newChar[key].value !== 'undefined') {
                            // If old 'value' exists but new 'baseValue' doesn't, migrate it
                            newChar[key].baseValue = newChar[key].value;
                            delete newChar[key].value; // Remove old 'value' property
                        } else if (typeof newChar[key].baseValue === 'undefined') {
                            // If neither baseValue nor old value exists, default baseValue
                            newChar[key].baseValue = MIN_STAT_VALUE; // Or some other default
                        }
                        if (typeof newChar[key].experienceBonus === 'undefined') {
                            newChar[key].experienceBonus = 0; // Default experienceBonus
                        }
                    }
                    // Ensure maxExperience is set for stats, if it was excluded during saving or missing
                    if (ExternalDataManager.rollStats.includes(key) && (typeof newChar[key].maxExperience === 'undefined' || newChar[key].maxExperience === null)) {
                        newChar[key].maxExperience = defaultStatMaxExperience;
                    }

                    if (ExternalDataManager.rollStats.includes(key) || key === 'Health' || key === 'Mana' || key === 'RacialPower' || key === 'totalDefense') {
                        if (typeof newChar[key].temporaryEffects === 'undefined' || newChar[key].temporaryEffects === null || Array.isArray(newChar[key].temporaryEffects)) {
                            newChar[key].temporaryEffects = {};
                        }
                    }
                }
            } else {
                newChar[key] = loadedChar[key];
            }
        }
    }

    // Handle section visibility - ensure all default sections are present
    newChar.htmlVisibility = { ...defaultCharacterData().htmlVisibility, ...loadedChar.htmlVisibility };

    // Initialize originalDamage/originalMagicDamage for weapons if not present
    newChar.weaponInventory.forEach(weapon => {
        if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
        if (typeof weapon.originalMagicDamage === 'undefined') weapon.originalMagicDamage = weapon.magicDamage;
        ensureMagicElements(weapon, 'weapon');
    });

    newChar.armorInventory.forEach(armor => {
        ensureMagicElements(armor, 'armor');
    });

    // Convert arrays within StatsAffected back to Sets
    convertArraysToSetsAfterLoad([newChar]);

    recalculateCharacterDerivedProperties(newChar); // Recalculate all derived properties after loading

    return newChar;
}

// Function to load character data from a JSON file (upload)
function loadCharacterFromFile(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedData = JSON.parse(e.target.result);
            if (Array.isArray(loadedData)) {
                characters = loadedData.map(loadedChar => initLoadCharacter(loadedChar));
                currentCharacterIndex = 0; // Select the first loaded character
            } else {
                // If a single character object was loaded (old format), convert it to an array
                characters = [initLoadCharacter(loadedData)];
                currentCharacterIndex = 0;
            }
            updateDOM(); // Update the UI with loaded data
            populateCharacterSelector(); // Repopulate the selector
            currentGoogleDriveFileId = null;
            showStatusMessage(`Character data loaded from JSON file!`);
            console.log(`Character data loaded from JSON file!`);
            historyStack = []; // Clear previous history
            historyPointer = -1; // Reset history pointer
            saveCurrentStateToHistory(); // Save the newly loaded state as the first history entry
            hasUnsavedChanges = false; // Data is now loaded and considered "saved"
        } catch (e) {
            showStatusMessage("Error parsing JSON file.", true);
            console.error("Error parsing JSON file:", e);
        }
    };
    reader.readAsText(file);
}

function getCharacterStatesActive() {
    const states = Object.keys(character.states);
    let statesActive = [];

    states.forEach(state => {
        if(character.states[state])
            statesActive.push(state);
    });

    return statesActive;
}

// Function to update the DOM elements with the current character data
function updateDOM() {
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
    // totalDefense is now updated via recalculateSmallUpdateCharacter
    document.getElementById('total-defense').value = character.totalDefense.value;

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

    // Highlight Health/Mana/RacialPower/totalDefense inputs if they have active temporary effects
    highlightStatsWithActiveEffects();

    // Render global active effects summary
    renderActiveEffectsSummary();

    updateHistoryButtonsState(); // Update history button states after DOM update
}

/**
 * Updates a static temporary effects button to include a badges showing how many temporary effects are active.
 * @param {string} statName The name of the stat (e.g. Health, Mana, totalDefense).
 * @param {string} displayName The display name for the button.
 */
function updateStaticTempEffectsButton(statName, displayName) {
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
function highlightStatsWithActiveEffects() {
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
function renderActiveEffectsSummary() {
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
                hasUnsavedChanges = true;
                if (typeof showStatusMessage === 'function') {
                    showStatusMessage("Removed temporary effect.");
                } else {
                    console.log("Removed temporary effect.");
                }
            }
        });
    });
}

function ensureMagicElements(item, type) {
    if (!item.magicElements) {
        item.magicElements = [];
        if (type === 'weapon') {
            if (item.magicType || item.magicDamage) {
                item.magicElements.push({
                    element: item.magicType || '',
                    damage: item.magicDamage || ''
                });
            }
        } else if (type === 'armor') {
            if (item.magicType || item.magicDefense) {
                item.magicElements.push({
                    element: item.magicType || '',
                    defense: parseFloat(item.magicDefense) || 0
                });
            }
        }
    }
}

/**
 * Helper function to create table data (<td>) elements for inventory tables.
 * @param {string} elementTag The HTML tag name for the input element (e.g., 'input', 'textarea').
 * @param {string|null} type The type attribute for input elements (e.g., 'text', 'number', 'checkbox').
 * @param {boolean} isClosed If true, the element is self-closing (e.g., <input>). If false, it has content (e.g., <textarea>value</textarea>).
 * @param {string} dataInventoryType The type of inventory ('weapon', 'armor', 'general').
 * @param {string} dataField The field name in the item object.
 * @param {number} dataIndex The index of the item in the inventory array.
 * @param {any} value The value to set for the input or content for textarea.
 * @param {string|null} cssClass CSS classes to apply to the element.
 * @returns {string} The HTML string for the table data cell.
 */
function quickTd(elementTag, type, isClosed, dataInventoryType, dataField, dataIndex, value, cssClass) {
    let string = `<td><${elementTag}`;

    if (type != null)
        string += ` type="${type}"`;

    string += ` data-inventory-type="${dataInventoryType}" data-field="${dataField}" data-index="${dataIndex}"`;

    if (cssClass != null)
        string += ` class="${cssClass}"`;

    if (!isClosed) {
        if (type != 'checkbox')
            string += ` value="${value}">`;
        else
            string += ` ${value}>`; // For checkboxes, value is 'checked' or ''
    } else {
        string += `>${value}`; // For textareas, content is inside
    }

    return string + `</${elementTag}></td>`;
}

/**
 * Renders a generic inventory table.
 * @param {string} inventoryType The type of inventory ('weapon', 'armor', 'general').
 * @param {Array<object>} inventoryArray The array of inventory items (e.g., character.weaponInventory).
 * @param {string} tbodySelector The CSS selector for the tbody element of the table.
 * @param {Array<object>} columns An array defining the columns to render:
 * - { field: string, type: string, class: string, getter?: function, checked?: function, html?: function }
 */
function renderInventoryTable(inventoryType, inventoryArray, tbodySelector, columns) {
    const tbody = document.querySelector(tbodySelector);
    tbody.innerHTML = ''; // Clear existing rows

    inventoryArray.forEach((item, index) => {
        const row = tbody.insertRow();
        let rowHtml = '';

        columns.forEach(col => {
            let value = item[col.field];
            let checkedAttr = '';

            if (col.getter) {
                value = col.getter(item);
            }
            if (col.checked) {
                checkedAttr = col.checked(item) ? 'checked' : '';
            }

            if (col.type === 'textarea') {
                rowHtml += quickTd('textarea', null, true, inventoryType, col.field, index, value, col.class);
            } else if (col.type === 'checkbox') {
                rowHtml += quickTd('input', 'checkbox', false, inventoryType, col.field, index, checkedAttr, col.class);
            } else if (col.type === 'html') {
                rowHtml += `<td class="${col.class || ''}">${col.html ? col.html(item, index) : value}</td>`;
            } else {
                rowHtml += quickTd('input', col.type, false, inventoryType, col.field, index, value, col.class);
            }
        });

        // Add the roll/remove buttons
        let actionsHtml = `<td><div class="flex items-center gap-1.5">`;
        if (inventoryType === 'weapon') {
            actionsHtml += `<button type="button" data-action="roll-weapon" data-index="${index}" class="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-colors duration-150">Roll</button>`;
        } else if (inventoryType === 'armor') {
            actionsHtml += `<button type="button" data-action="roll-armor" data-index="${index}" class="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-colors duration-150">Roll</button>`;
        }
        actionsHtml += `<button type="button" data-inventory-type="${inventoryType}" data-index="${index}" class="remove-item-btn bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors duration-150">Remove</button></div></td>`;
        rowHtml += actionsHtml;

        row.innerHTML = rowHtml;

        // Set textarea values after they are in the DOM
        columns.filter(col => col.type === 'textarea').forEach(col => {
            const textarea = row.querySelector(`textarea[data-field="${col.field}"]`);
            if (textarea) {
                textarea.value = col.getter ? col.getter(item) : item[col.field];
            }
        });
    });
}

function validateItemRequirements(item) {
    if (!item.requiredStat || !item.requirement) {
        return { met: true };
    }
    const reqVal = parseFloat(item.requirement);
    if (isNaN(reqVal)) return { met: true }; // Treat as met if not a valid number
    
    // Use the global calculateRollStatTotal helper to get current character stat
    const currentVal = calculateRollStatTotal(character, item.requiredStat);
    return {
        met: currentVal >= reqVal,
        current: currentVal,
        required: reqVal,
        stat: item.requiredStat
    };
}

function renderWeaponCards() {
    const container = document.getElementById('weapon-inventory-cards-container');
    if (!container) return;

    container.innerHTML = '';
    
    if (character.weaponInventory.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                <span class="text-3xl mb-2">⚔️</span>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">No weapons in inventory.</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "+ Add Weapon" to begin equipping your hero.</p>
            </div>
        `;
        return;
    }

    character.weaponInventory.forEach((item, index) => {
        ensureMagicElements(item, 'weapon');
        const validation = validateItemRequirements(item);
        const card = document.createElement('div');
        
        const activeClass = item.use 
            ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/15 shadow-md bg-indigo-50/5 dark:bg-indigo-950/5' 
            : 'border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800';
            
        card.className = `p-5 rounded-xl border ${activeClass} transition-all duration-200 flex flex-col gap-4 relative hover:shadow-md`;
        
        let valBadge = '';
        if (item.requiredStat && item.requirement) {
            if (!validation.met) {
                valBadge = `
                    <div class="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 p-2 rounded-md flex items-center gap-1.5 mt-1">
                        <span>⚠️ Unmet Requirement: Requires ${validation.required} ${validation.stat} (You have: ${validation.current})</span>
                    </div>
                `;
            } else {
                valBadge = `
                    <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-2 rounded-md flex items-center gap-1.5 mt-1">
                        <span>✅ Requirement Met: ${validation.required} ${validation.stat} (Current: ${validation.current})</span>
                    </div>
                `;
            }
        }

        card.innerHTML = `
            <!-- Card Header: Name, Values, Roll & Active Switch -->
            <div class="flex items-center justify-between gap-3 ${item.collapsed ? '' : 'pb-3 border-b border-gray-100 dark:border-gray-700/60'}">
                <div class="flex items-center gap-2 flex-grow min-w-0">
                    <button type="button" data-action="toggle-card-collapse" data-inventory-type="weapon" data-index="${index}" class="p-1 rounded-md text-gray-400 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-all duration-150 flex-shrink-0" title="${item.collapsed ? 'Expand Card' : 'Collapse Card'}">
                        <svg class="w-5 h-5 transition-transform duration-200 ${item.collapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <input type="text" data-inventory-type="weapon" data-field="name" data-index="${index}" value="${item.name || ''}" placeholder="Weapon Name..." class="font-bold text-base text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-indigo-500 focus:outline-none transition-all duration-200 w-full rounded px-1 -ml-1 focus:bg-gray-50 dark:focus:bg-gray-900 truncate" />
                </div>
                
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40 font-mono" title="Weapon Damage">
                        💥 ${item.damage || '0'}
                    </span>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40" title="Gold Value">
                        🪙 ${item.value || 0}
                    </span>

                    <button type="button" data-action="roll-weapon" data-index="${index}" class="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2 py-1 rounded transition-all duration-150 shadow-sm" title="Roll Weapon Damage">
                        🎲 Roll
                    </button>
                    <label class="relative inline-flex items-center cursor-pointer select-none">
                        <input type="checkbox" data-inventory-type="weapon" data-field="use" data-index="${index}" class="sr-only peer" ${item.use ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        <span class="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 peer-checked:text-indigo-600 dark:peer-checked:text-indigo-400">Active</span>
                    </label>
                </div>
            </div>

            <!-- Card Body (Hidden when collapsed) -->
            <div class="card-body flex flex-col gap-4 ${item.collapsed ? 'hidden' : 'mt-4'}">
                <!-- Attributes grid -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Type</label>
                        <input type="text" data-inventory-type="weapon" data-field="type" data-index="${index}" value="${item.type || ''}" placeholder="e.g. Sword, Bow" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Material</label>
                        <input type="text" data-inventory-type="weapon" data-field="material" data-index="${index}" value="${item.material || ''}" placeholder="e.g. Mithril" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1 col-span-2 sm:col-span-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Gold Value</label>
                        <div class="relative flex items-center">
                            <span class="absolute left-2.5 text-xs">🪙</span>
                            <input type="number" data-inventory-type="weapon" data-field="value" data-index="${index}" value="${item.value || 0}" class="pl-7 pr-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                        </div>
                    </div>
                </div>

                <!-- Stats & Accuracy grid -->
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">🎯 Accuracy %</label>
                        <input type="number" data-inventory-type="weapon" data-field="accuracy" data-index="${index}" value="${item.accuracy || 100}" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Req. Stat</label>
                        <div class="flex items-center gap-1">
                            <select data-inventory-type="weapon" data-field="requiredStat" data-index="${index}" class="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-855 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-1/2">
                                <option value="">None</option>
                                ${ExternalDataManager.rollStats.map(stat => `<option value="${stat}" ${item.requiredStat === stat ? 'selected' : ''}>${stat}</option>`).join('')}
                            </select>
                            <input type="text" data-inventory-type="weapon" data-field="requirement" data-index="${index}" value="${item.requirement || ''}" placeholder="Val" class="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-1/2 text-center" />
                        </div>
                    </div>
                </div>

                <!-- Damage Formulas -->
                <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">💥 Physical Damage</label>
                        ${item.rolledDamage !== undefined ? `<span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/30">Last Roll: ${item.rolledDamage}</span>` : ''}
                    </div>
                    <textarea data-inventory-type="weapon" data-field="damage" data-index="${index}" placeholder="e.g. 2d6 + Strength" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-10 resize-none">${item.damage || ''}</textarea>
                </div>

                <!-- Magic Elements panel -->
                <div class="border-t border-dashed border-gray-200 dark:border-gray-700/60 pt-3 mt-1">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
                            ✨ Magic Elements & Damages
                        </span>
                        <button type="button" data-action="add-magic-element" data-inventory-type="weapon" data-index="${index}" class="text-[11px] font-semibold text-purple-600 hover:text-white dark:text-purple-400 hover:bg-purple-500 dark:hover:bg-purple-600 border border-purple-200 dark:border-purple-900/40 px-2 py-0.5 rounded transition-all duration-200 focus:outline-none">
                            + Add Element
                        </button>
                    </div>
                    <div class="flex flex-col gap-2">
                        ${item.magicElements.map((me, meIndex) => {
                            const isCustom = me.element && !["All", "Chaos", "Dark", "Wind", "Earth", "Fire", "Ice", "Thunder", "Nature", "Light"].includes(me.element);
                            return `
                            <div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-150 dark:border-gray-800">
                                <!-- Dropdown for elements -->
                                <div class="flex flex-col gap-1 w-1/3 min-w-[100px]">
                                    <select data-action="edit-magic-element" data-inventory-type="weapon" data-index="${index}" data-me-index="${meIndex}" data-field="element" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full">
                                        <option value="">Select Element...</option>
                                        ${["All", "Chaos", "Dark", "Wind", "Earth", "Fire", "Ice", "Thunder", "Nature", "Light"].map(el => `<option value="${el}" ${me.element === el ? 'selected' : ''}>${el}</option>`).join('')}
                                        ${isCustom ? `<option value="custom_input" selected>Custom (${me.element})</option>` : '<option value="custom_input">Custom...</option>'}
                                    </select>
                                    ${isCustom ? `
                                        <input type="text" data-action="edit-magic-element" data-inventory-type="weapon" data-index="${index}" data-me-index="${meIndex}" data-field="custom-element-name" value="${me.element === 'Custom' ? '' : me.element}" placeholder="Name..." class="px-2 py-0.5 text-[10px] border border-purple-200 dark:border-purple-800 rounded bg-purple-50/50 dark:bg-purple-950/20 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full" />
                                    ` : ''}
                                </div>
                                <!-- Damage Input -->
                                <div class="flex-grow flex flex-col gap-0.5">
                                    <div class="flex items-center justify-between">
                                        <span class="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Damage Formula</span>
                                        ${me.rolledDamage !== undefined ? `<span class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">Last Roll: ${me.rolledDamage}</span>` : ''}
                                    </div>
                                    <input type="text" data-action="edit-magic-element" data-inventory-type="weapon" data-index="${index}" data-me-index="${meIndex}" data-field="damage" value="${me.damage || ''}" placeholder="e.g. 1d4 + Magic" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full" />
                                </div>
                                <!-- Delete button -->
                                <button type="button" data-action="remove-magic-element" data-inventory-type="weapon" data-index="${index}" data-me-index="${meIndex}" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-350 p-1.5 focus:outline-none" title="Remove Element">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                </button>
                            </div>
                            `;
                        }).join('')}
                        ${item.magicElements.length === 0 ? `
                            <div class="text-center py-2 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                                No magic elements active. Click "+ Add Element" to add one.
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Validation and Effects -->
                <div class="flex flex-col gap-1">
                    ${valBadge}
                    <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">Special Properties / Effects</label>
                    <textarea data-inventory-type="weapon" data-field="effect" data-index="${index}" placeholder="Add passive buffs or special combat details..." class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-12 resize-none">${item.effect || ''}</textarea>
                </div>

                <!-- Card Actions -->
                <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/60 mt-auto">
                    <span class="text-xs text-gray-400 dark:text-gray-500 font-medium">Slot #${index + 1}</span>
                    <button type="button" data-inventory-type="weapon" data-index="${index}" class="remove-item-btn text-xs font-semibold text-red-500 hover:text-white dark:text-red-400 hover:bg-red-500 dark:hover:bg-red-600 border border-red-200 dark:border-red-900/40 px-2.5 py-1 rounded transition-all duration-200">
                        Remove
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function renderArmorCards() {
    const container = document.getElementById('armor-inventory-cards-container');
    if (!container) return;

    container.innerHTML = '';
    
    if (character.armorInventory.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                <span class="text-3xl mb-2">🛡️</span>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">No armor in inventory.</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "+ Add Armor" to begin styling your defense.</p>
            </div>
        `;
        return;
    }

    const armorLocations = ["Head", "Chest", "Hands", "Legs", "Feet", "Shield", "Ring", "Neck", "Accessory", "Back", "Wrist", "Vanity"];

    character.armorInventory.forEach((item, index) => {
        ensureMagicElements(item, 'armor');
        const validation = validateItemRequirements(item);
        const card = document.createElement('div');
        
        const activeClass = item.equipped 
            ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/15 shadow-md bg-indigo-50/5 dark:bg-indigo-950/5' 
            : 'border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800';
            
        card.className = `p-5 rounded-xl border ${activeClass} transition-all duration-200 flex flex-col gap-4 relative hover:shadow-md`;
        
        let valBadge = '';
        if (item.requiredStat && item.requirement) {
            if (!validation.met) {
                valBadge = `
                    <div class="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 p-2 rounded-md flex items-center gap-1.5 mt-1">
                        <span>⚠️ Unmet Requirement: Requires ${validation.required} ${validation.stat} (You have: ${validation.current})</span>
                    </div>
                `;
            } else {
                valBadge = `
                    <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-2 rounded-md flex items-center gap-1.5 mt-1">
                        <span>✅ Requirement Met: ${validation.required} ${validation.stat} (Current: ${validation.current})</span>
                    </div>
                `;
            }
        }

        card.innerHTML = `
            <!-- Card Header: Name, Values, Roll & Equipped Switch -->
            <div class="flex items-center justify-between gap-3 ${item.collapsed ? '' : 'pb-3 border-b border-gray-100 dark:border-gray-700/60'}">
                <div class="flex items-center gap-2 flex-grow min-w-0">
                    <button type="button" data-action="toggle-card-collapse" data-inventory-type="armor" data-index="${index}" class="p-1 rounded-md text-gray-400 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-all duration-150 flex-shrink-0" title="${item.collapsed ? 'Expand Card' : 'Collapse Card'}">
                        <svg class="w-5 h-5 transition-transform duration-200 ${item.collapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <input type="text" data-inventory-type="armor" data-field="name" data-index="${index}" value="${item.name || ''}" placeholder="Armor Name..." class="font-bold text-base text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-indigo-500 focus:outline-none transition-all duration-200 w-full rounded px-1 -ml-1 focus:bg-gray-50 dark:focus:bg-gray-900 truncate" />
                </div>
                
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40 font-mono" title="Armor Defense">
                        🛡️ +${item.defense || '0'}
                    </span>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40" title="Gold Value">
                        🪙 ${item.value || 0}
                    </span>

                    <button type="button" data-action="roll-armor" data-index="${index}" class="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2 py-1 rounded transition-all duration-150 shadow-sm" title="Roll Armor Defense">
                        🎲 Roll
                    </button>
                    <label class="relative inline-flex items-center cursor-pointer select-none">
                        <input type="checkbox" data-inventory-type="armor" data-field="equipped" data-index="${index}" class="sr-only peer" ${item.equipped ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        <span class="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 peer-checked:text-indigo-600 dark:peer-checked:text-indigo-400">Equipped</span>
                    </label>
                </div>
            </div>

            <!-- Card Body (Hidden when collapsed) -->
            <div class="card-body flex flex-col gap-4 ${item.collapsed ? 'hidden' : 'mt-4'}">
                <!-- Location, Material, Value Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Location</label>
                        <select data-inventory-type="armor" data-field="location" data-index="${index}" class="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full">
                            <option value="">Select location...</option>
                            ${armorLocations.map(loc => `<option value="${loc}" ${item.location === loc ? 'selected' : ''}>${loc}</option>`).join('')}
                        </select>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Material</label>
                        <input type="text" data-inventory-type="armor" data-field="material" data-index="${index}" value="${item.material || ''}" placeholder="e.g. Leather" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1 col-span-2 sm:col-span-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Gold Value</label>
                        <div class="relative flex items-center">
                            <span class="absolute left-2.5 text-xs">🪙</span>
                            <input type="number" data-inventory-type="armor" data-field="value" data-index="${index}" value="${item.value || 0}" class="pl-7 pr-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                        </div>
                    </div>
                </div>

                <!-- Defenses & Requirements -->
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center justify-between">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">🛡️ Physical Defense</label>
                            ${item.rolledDefense !== undefined ? `<span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded border border-emerald-100/20 dark:border-emerald-900/10">Last Roll: ${item.rolledDefense}</span>` : ''}
                        </div>
                        <textarea data-inventory-type="armor" data-field="defense" data-index="${index}" placeholder="e.g. 1d4 + Agility" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-10 resize-none">${item.defense || ''}</textarea>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Req. Stat</label>
                        <div class="flex items-center gap-1">
                            <select data-inventory-type="armor" data-field="requiredStat" data-index="${index}" class="px-1 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-1/2">
                                <option value="">None</option>
                                ${ExternalDataManager.rollStats.map(stat => `<option value="${stat}" ${item.requiredStat === stat ? 'selected' : ''}>${stat}</option>`).join('')}
                            </select>
                            <input type="text" data-inventory-type="armor" data-field="requirement" data-index="${index}" value="${item.requirement || ''}" placeholder="Val" class="px-1 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-1/2 text-center" />
                        </div>
                    </div>
                </div>

                <!-- Magic Elements panel -->
                <div class="border-t border-dashed border-gray-200 dark:border-gray-700/60 pt-3 mt-1">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
                            ✨ Magic Elements & Defenses
                        </span>
                        <button type="button" data-action="add-magic-element" data-inventory-type="armor" data-index="${index}" class="text-[11px] font-semibold text-purple-600 hover:text-white dark:text-purple-400 hover:bg-purple-500 dark:hover:bg-purple-600 border border-purple-200 dark:border-purple-900/40 px-2 py-0.5 rounded transition-all duration-200 focus:outline-none">
                            + Add Element
                        </button>
                    </div>
                    <div class="flex flex-col gap-2">
                        ${item.magicElements.map((me, meIndex) => {
                            const isCustom = me.element && !["All", "Chaos", "Dark", "Wind", "Earth", "Fire", "Ice", "Thunder", "Nature", "Light"].includes(me.element);
                            return `
                            <div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-150 dark:border-gray-800">
                                <!-- Dropdown for elements -->
                                <div class="flex flex-col gap-1 w-1/3 min-w-[100px]">
                                    <select data-action="edit-magic-element" data-inventory-type="armor" data-index="${index}" data-me-index="${meIndex}" data-field="element" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full">
                                        <option value="">Select Element...</option>
                                        ${["All", "Chaos", "Dark", "Wind", "Earth", "Fire", "Ice", "Thunder", "Nature", "Light"].map(el => `<option value="${el}" ${me.element === el ? 'selected' : ''}>${el}</option>`).join('')}
                                        ${isCustom ? `<option value="custom_input" selected>Custom (${me.element})</option>` : '<option value="custom_input">Custom...</option>'}
                                    </select>
                                    ${isCustom ? `
                                        <input type="text" data-action="edit-magic-element" data-inventory-type="armor" data-index="${index}" data-me-index="${meIndex}" data-field="custom-element-name" value="${me.element === 'Custom' ? '' : me.element}" placeholder="Name..." class="px-2 py-0.5 text-[10px] border border-purple-200 dark:border-purple-800 rounded bg-purple-50/50 dark:bg-purple-950/20 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full" />
                                    ` : ''}
                                </div>
                                <!-- Defense Input -->
                                <div class="flex-grow flex flex-col gap-0.5">
                                    <div class="flex items-center justify-between">
                                        <span class="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Defense Formula</span>
                                        ${me.rolledDefense !== undefined ? `<span class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">Roll: ${me.rolledDefense}</span>` : ''}
                                    </div>
                                    <input type="text" data-action="edit-magic-element" data-inventory-type="armor" data-index="${index}" data-me-index="${meIndex}" data-field="defense" value="${me.defense || ''}" placeholder="e.g. 1d4" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full" />
                                </div>
                                <!-- Delete button -->
                                <button type="button" data-action="remove-magic-element" data-inventory-type="armor" data-index="${index}" data-me-index="${meIndex}" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-350 p-1.5 focus:outline-none" title="Remove Element">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                </button>
                            </div>
                            `;
                        }).join('')}
                        ${item.magicElements.length === 0 ? `
                            <div class="text-center py-2 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                                No magic elements active. Click "+ Add Element" to add one.
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Validation & Special Effects -->
                <div class="flex flex-col gap-1">
                    ${valBadge}
                    <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">Special Properties / Effects</label>
                    <textarea data-inventory-type="armor" data-field="effect" data-index="${index}" placeholder="Add armor set bonuses or resistances..." class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-12 resize-none">${item.effect || ''}</textarea>
                </div>

                <!-- Card Actions -->
                <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/60 mt-auto">
                    <span class="text-xs text-gray-400 dark:text-gray-500 font-medium">Slot #${index + 1}</span>
                    <button type="button" data-inventory-type="armor" data-index="${index}" class="remove-item-btn text-xs font-semibold text-red-500 hover:text-white dark:text-red-400 hover:bg-red-500 dark:hover:bg-red-600 border border-red-200 dark:border-red-900/40 px-2.5 py-1 rounded transition-all duration-200">
                        Remove
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function renderEquippedSummaries() {
    // 1. Weapon Summary
    const weaponSummary = document.getElementById('weapon-equipped-summary');
    if (weaponSummary) {
        const activeWeapons = character.weaponInventory.filter(item => item.use);
        if (activeWeapons.length > 0) {
            weaponSummary.classList.remove('hidden');
            let content = `
                <div class="flex items-center justify-between mb-2 pb-1 border-b border-indigo-100/30 dark:border-indigo-900/20">
                    <span class="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span class="animate-pulse text-indigo-500">⚔️</span> Active Combat Stance (${activeWeapons.length} Active)
                    </span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            `;
            activeWeapons.forEach(w => {
                ensureMagicElements(w, 'weapon');
                if (w.rolledDamage === undefined) {
                    w.rolledDamage = calculateFormula(w.damage || '0');
                }
                
                content += `
                    <div class="bg-indigo-50/50 dark:bg-indigo-950/40 p-2.5 rounded border border-indigo-100/50 dark:border-indigo-900/30 text-xs">
                        <div class="font-bold text-indigo-700 dark:text-indigo-300 truncate">${w.name || 'Unnamed Weapon'}</div>
                        <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">${w.type || 'Weapon'}${w.material ? ` • ${w.material}` : ''}</div>
                        <div class="mt-2 space-y-1.5">
                            <div class="flex flex-col gap-0.5 pb-1 border-b border-gray-100 dark:border-gray-800/40">
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-650 dark:text-gray-400 font-medium">💥 Phys Dmg:</span>
                                    <span class="font-bold text-gray-800 dark:text-gray-250 text-xs bg-white dark:bg-gray-800 px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700">${w.rolledDamage}</span>
                                </div>
                                <div class="text-[9px] text-gray-400 dark:text-gray-500 italic truncate">Formula: ${w.damage || '0'}</div>
                            </div>
                            ${w.magicElements.map(me => {
                                if (me.rolledDamage === undefined) {
                                    me.rolledDamage = calculateFormula(me.damage || '0');
                                }
                                return `
                                <div class="flex flex-col gap-0.5 pb-1 border-b border-gray-100 dark:border-gray-800/40">
                                    <div class="flex justify-between items-center">
                                        <span class="text-gray-650 dark:text-gray-400 font-medium">✨ ${me.element || 'Magic'}:</span>
                                        <span class="font-bold text-purple-600 dark:text-purple-300 text-xs bg-white dark:bg-gray-800 px-1 py-0.5 rounded border border-purple-100 dark:border-purple-900/40">${me.rolledDamage}</span>
                                    </div>
                                    <div class="text-[9px] text-purple-400 dark:text-purple-500/70 italic truncate">Formula: ${me.damage || '0'}</div>
                                </div>
                                `;
                            }).join('')}
                            <div class="flex justify-between pt-0.5 text-[10px]">
                                <span class="text-gray-500">Accuracy:</span>
                                <span class="font-semibold text-gray-700 dark:text-gray-300">${w.accuracy || 100}%</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            content += `</div>`;
            weaponSummary.innerHTML = content;
        } else {
            weaponSummary.classList.add('hidden');
        }
    }

    // 2. Armor Summary
    const armorSummary = document.getElementById('armor-equipped-summary');
    if (armorSummary) {
        const equippedArmor = character.armorInventory.filter(item => item.equipped);
        if (equippedArmor.length > 0) {
            armorSummary.classList.remove('hidden');
            
            let totalPhysDef = 0;
            let totalMagDef = 0;
            const elementalTotals = {};
            equippedArmor.forEach(a => {
                if (a.rolledDefense === undefined) {
                    a.rolledDefense = calculateFormula(a.defense || '0');
                }
                totalPhysDef += (parseFloat(a.rolledDefense) || 0);
                ensureMagicElements(a, 'armor');
                a.magicElements.forEach(me => {
                    const el = me.element || 'Magic';
                    if (me.rolledDefense === undefined) {
                        me.rolledDefense = calculateFormula(me.defense || '0');
                    }
                    const defVal = parseFloat(me.rolledDefense) || 0;
                    totalMagDef += defVal;
                    elementalTotals[el] = (elementalTotals[el] || 0) + defVal;
                });
            });

            let content = `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-indigo-100/50 dark:border-indigo-900/30 pb-2">
                    <span class="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span class="animate-pulse text-indigo-500">🛡️</span> Equipped Armor Loadout
                    </span>
                    <div class="flex gap-3 text-xs font-bold">
                        <span class="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/30">Total Physical Def: +${totalPhysDef}</span>
                        <span class="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 px-2 py-0.5 rounded border border-purple-100 dark:border-purple-900/30">Total Magic Def: +${totalMagDef}</span>
                    </div>
                </div>
            `;

            if (Object.keys(elementalTotals).length > 0) {
                const elementalBadges = Object.entries(elementalTotals)
                    .map(([el, total]) => `
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/10 border border-purple-100 dark:border-purple-900/20 px-2 py-0.5 rounded-md">
                            ${el}: +${total}
                        </span>
                    `).join('');
                content += `
                    <div class="flex flex-wrap items-center gap-1.5 mb-3 p-2 bg-purple-50/10 dark:bg-purple-950/5 rounded-lg border border-purple-100/20 dark:border-purple-900/10">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-purple-500 dark:text-purple-400 mr-1 flex items-center gap-0.5">✨ Magic Def By Element:</span>
                        ${elementalBadges}
                    </div>
                `;
            }

            content += `
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            `;
            equippedArmor.forEach(a => {
                ensureMagicElements(a, 'armor');
                let elementalDefs = a.magicElements.map(me => `+${me.defense || 0} ${me.element || 'Magic'}`).join(', ');
                if (!elementalDefs) elementalDefs = 'None';
                content += `
                    <div class="bg-indigo-50/30 dark:bg-indigo-950/20 p-2.5 rounded border border-indigo-100/40 dark:border-indigo-900/20 text-xs flex flex-col justify-between">
                        <div>
                            <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] rounded font-semibold uppercase tracking-wider">${a.location || 'Gear'}</span>
                            <div class="font-bold text-indigo-700 dark:text-indigo-300 mt-1 truncate">${a.name || 'Unnamed Armor'}</div>
                        </div>
                        <div class="mt-2 space-y-0.5 text-[11px] border-t border-gray-100 dark:border-gray-800/40 pt-1.5">
                            <div class="flex justify-between">
                                <span class="text-gray-500">Defense:</span>
                                <span class="font-bold text-emerald-600 dark:text-emerald-400">+${a.defense || 0}</span>
                            </div>
                            <div class="flex flex-col mt-1">
                                <span class="text-gray-500 text-[10px] uppercase font-semibold">Magic Defs:</span>
                                <span class="font-bold text-purple-600 dark:text-purple-400 text-[11px]">${elementalDefs}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            content += `</div>`;
            armorSummary.innerHTML = content;
        } else {
            armorSummary.classList.add('hidden');
        }
    }
}

function toggleInventoryViewDOM(type, view) {
    const cardsBtn = document.getElementById(`${type}-view-cards-btn`);
    const tableBtn = document.getElementById(`${type}-view-table-btn`);
    const tableContainer = document.getElementById(`${type}-inventory-table-container`);
    const cardsContainer = document.getElementById(`${type}-inventory-cards-container`);

    if (!cardsBtn || !tableBtn || !tableContainer || !cardsContainer) return;

    if (view === 'cards') {
        cardsBtn.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
        cardsBtn.classList.remove('text-gray-600', 'dark:text-gray-400');
        
        tableBtn.classList.add('text-gray-600', 'dark:text-gray-400');
        tableBtn.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
        
        tableContainer.classList.add('hidden');
        cardsContainer.classList.remove('hidden');
    } else {
        tableBtn.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
        tableBtn.classList.remove('text-gray-600', 'dark:text-gray-400');
        
        cardsBtn.classList.add('text-gray-600', 'dark:text-gray-400');
        cardsBtn.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
        
        cardsContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');
    }
}

function setInventoryView(type, view) {
    inventoryViewSettings[type] = view;
    toggleInventoryViewDOM(type, view);
}

function renderWeaponTable() {
    // 1. Render Table View
    renderInventoryTable('weapon', character.weaponInventory, '#weapon-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'type', type: 'text', class: 'w-full' },
        { field: 'material', type: 'text', class: 'w-full' },
        { field: 'requirement', type: 'text', class: 'w-full' },
        { field: 'requiredStat', type: 'text', class: 'w-full' },
        { field: 'accuracy', type: 'number', class: 'w-full' },
        {
            field: 'damage',
            type: 'html',
            html: (item, index) => {
                const lastRollBadge = item.rolledDamage !== undefined 
                    ? `<div class="mt-1"><span class="inline-flex items-center text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/20">Last Roll: ${item.rolledDamage}</span></div>` 
                    : '';
                return `
                <div class="flex flex-col gap-1 w-full min-w-[120px]">
                    <textarea data-inventory-type="weapon" data-field="damage" data-index="${index}" placeholder="e.g. 2d6 + Strength" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full h-10 resize-none">${item.damage || ''}</textarea>
                    ${lastRollBadge}
                </div>
                `;
            }
        },
        {
            field: 'magicElements',
            type: 'html',
            html: (item, index) => {
                ensureMagicElements(item, 'weapon');
                return `
                <div class="flex flex-col gap-1 text-xs max-w-xs">
                    ${item.magicElements.map((me, meIndex) => {
                        const lastRollBadge = me.rolledDamage !== undefined 
                            ? `<div class="mt-0.5"><span class="inline-flex items-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">Roll: ${me.rolledDamage}</span></div>`
                            : '';
                        return `
                        <div class="flex flex-col gap-0.5 bg-purple-50/50 dark:bg-purple-950/20 px-1.5 py-1 rounded border border-purple-100 dark:border-purple-900/20">
                            <div class="flex items-center justify-between gap-2">
                                <span class="font-bold text-purple-700 dark:text-purple-300">${me.element || 'Magic'}:</span>
                                <span class="text-gray-750 dark:text-gray-200">${me.damage || '0'}</span>
                            </div>
                            ${lastRollBadge}
                        </div>
                        `;
                    }).join('')}
                    ${item.magicElements.length === 0 ? '<span class="text-gray-400 dark:text-gray-500">None</span>' : ''}
                    <button type="button" data-action="add-magic-element" data-inventory-type="weapon" data-index="${index}" class="text-[10px] text-left text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-semibold mt-1">
                        + Edit in Card View
                    </button>
                </div>
                `;
            }
        },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'value', type: 'number', class: 'w-full' },
        { field: 'use', type: 'checkbox', class: null, checked: (item) => item.use }
    ]);

    // 2. Render Card View
    renderWeaponCards();

    // 3. Render Summaries
    renderEquippedSummaries();

    // 4. Align layout active state classes
    toggleInventoryViewDOM('weapon', inventoryViewSettings.weapon);
}

// --- Dynamic Toast and Dice Rolling Logic ---
function showToast(message, type = 'info') {
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

function rollWeaponAtIndex(index) {
    const item = character.weaponInventory[index];
    if (!item) return;

    ensureMagicElements(item, 'weapon');
    item.rolledDamage = calculateFormula(item.damage || '0');
    
    let magicMsgParts = [];
    item.magicElements.forEach(me => {
        me.rolledDamage = calculateFormula(me.damage || '0');
        magicMsgParts.push(`${me.element || 'Magic'}: ${me.rolledDamage}`);
    });

    hasUnsavedChanges = true;
    renderWeaponTable();

    let rollMsg = `Rolled <strong>${item.name || 'Weapon'}</strong>: 💥 Physical: <strong>${item.rolledDamage}</strong>`;
    if (magicMsgParts.length > 0) {
        rollMsg += `<br><span class="text-xs text-purple-150 font-medium">✨ ${magicMsgParts.join(', ')}</span>`;
    }
    showToast(rollMsg, 'roll');
}

function rollAllActiveWeapons() {
    const activeWeapons = character.weaponInventory.filter(item => item.use);
    if (activeWeapons.length === 0) {
        showToast('No active weapons equipped to roll!', 'error');
        return;
    }

    activeWeapons.forEach(item => {
        ensureMagicElements(item, 'weapon');
        item.rolledDamage = calculateFormula(item.damage || '0');
        item.magicElements.forEach(me => {
            me.rolledDamage = calculateFormula(me.damage || '0');
        });
    });

    hasUnsavedChanges = true;
    renderWeaponTable();

    showToast(`Rolled all <strong>${activeWeapons.length}</strong> active weapons! Check the stance summary and cards for results.`, 'roll');
}

function rollArmorAtIndex(index) {
    const item = character.armorInventory[index];
    if (!item) return;

    ensureMagicElements(item, 'armor');
    item.rolledDefense = calculateFormula(item.defense || '0');
    
    let magicMsgParts = [];
    item.magicElements.forEach(me => {
        me.rolledDefense = calculateFormula(me.defense || '0');
        magicMsgParts.push(`${me.element || 'Magic'}: ${me.rolledDefense}`);
    });

    hasUnsavedChanges = true;
    
    // Recalculate total defense & update elements
    recalculateSmallUpdateCharacter(character, true);
    renderArmorTable();

    let rollMsg = `Rolled <strong>${item.name || 'Armor'}</strong>: 🛡️ Physical Defense: <strong>${item.rolledDefense}</strong>`;
    if (magicMsgParts.length > 0) {
        rollMsg += `<br><span class="text-xs text-purple-150 font-medium">✨ Magic Def: ${magicMsgParts.join(', ')}</span>`;
    }
    showToast(rollMsg, 'roll');
}

function rollAllEquippedArmor() {
    const equippedArmor = character.armorInventory.filter(item => item.equipped);
    if (equippedArmor.length === 0) {
        showToast('No equipped armor to roll!', 'error');
        return;
    }

    equippedArmor.forEach(item => {
        ensureMagicElements(item, 'armor');
        item.rolledDefense = calculateFormula(item.defense || '0');
        item.magicElements.forEach(me => {
            me.rolledDefense = calculateFormula(me.defense || '0');
        });
    });

    hasUnsavedChanges = true;
    recalculateSmallUpdateCharacter(character, true);
    renderArmorTable();

    showToast(`Rolled all <strong>${equippedArmor.length}</strong> equipped armor items! Total defense updated.`, 'roll');
}

function renderArmorTable() {
    // 1. Render Table View
    renderInventoryTable('armor', character.armorInventory, '#armor-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'location', type: 'text', class: 'w-full' },
        { field: 'material', type: 'text', class: 'w-full' },
        { field: 'requirement', type: 'text', class: 'w-full' },
        { field: 'requiredStat', type: 'text', class: 'w-full' },
        {
            field: 'defense',
            type: 'html',
            html: (item, index) => {
                const lastRollBadge = item.rolledDefense !== undefined 
                    ? `<div class="mt-1"><span class="inline-flex items-center text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/20">Last Roll: ${item.rolledDefense}</span></div>` 
                    : '';
                return `
                <div class="flex flex-col gap-1 w-full min-w-[120px]">
                    <textarea data-inventory-type="armor" data-field="defense" data-index="${index}" placeholder="e.g. 1d4 + Agility" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full h-10 resize-none">${item.defense || ''}</textarea>
                    ${lastRollBadge}
                </div>
                `;
            }
        },
        {
            field: 'magicElements',
            type: 'html',
            html: (item, index) => {
                ensureMagicElements(item, 'armor');
                return `
                <div class="flex flex-col gap-1 text-xs max-w-xs">
                    ${item.magicElements.map((me, meIndex) => {
                        const lastRollBadge = me.rolledDefense !== undefined 
                            ? `<div class="mt-0.5"><span class="inline-flex items-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">Roll: ${me.rolledDefense}</span></div>`
                            : '';
                        return `
                        <div class="flex flex-col gap-0.5 bg-purple-50/50 dark:bg-purple-950/20 px-1.5 py-1 rounded border border-purple-100 dark:border-purple-900/20">
                            <div class="flex items-center justify-between gap-2">
                                <span class="font-bold text-purple-700 dark:text-purple-300">${me.element || 'Magic'}:</span>
                                <span class="text-gray-750 dark:text-gray-200">${me.defense || '0'}</span>
                            </div>
                            ${lastRollBadge}
                        </div>
                        `;
                    }).join('')}
                    ${item.magicElements.length === 0 ? '<span class="text-gray-400 dark:text-gray-500">None</span>' : ''}
                    <button type="button" data-action="add-magic-element" data-inventory-type="armor" data-index="${index}" class="text-[10px] text-left text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-semibold mt-1">
                        + Edit in Card View
                    </button>
                </div>
                `;
            }
        },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'value', type: 'number', class: 'w-full' },
        { field: 'equipped', type: 'checkbox', class: null, checked: (item) => item.equipped }
    ]);

    // 2. Render Card View
    renderArmorCards();

    // 3. Render Summaries
    renderEquippedSummaries();

    // 4. Align layout active state classes
    toggleInventoryViewDOM('armor', inventoryViewSettings.armor);
}

function renderGeneralCards() {
    const container = document.getElementById('general-inventory-cards-container');
    if (!container) return;

    container.innerHTML = '';
    
    if (!character.generalInventory || character.generalInventory.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                <span class="text-3xl mb-2">🎒</span>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">No items in general inventory.</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "+ Add Item" to store your loot and consumables.</p>
            </div>
        `;
        return;
    }

    character.generalInventory.forEach((item, index) => {
        const card = document.createElement('div');
        const cardClass = 'border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800';
            
        card.className = `p-5 rounded-xl border ${cardClass} transition-all duration-200 flex flex-col gap-4 relative hover:shadow-md`;
        
        const totalVal = (parseFloat(item.amount) || 1) * (parseFloat(item.valuePerUnit) || 0);

        card.innerHTML = `
            <!-- Card Header: Name, Quantity, Value & Collapse -->
            <div class="flex items-center justify-between gap-3 ${item.collapsed ? '' : 'pb-3 border-b border-gray-100 dark:border-gray-700/60'}">
                <div class="flex items-center gap-2 flex-grow min-w-0">
                    <button type="button" data-action="toggle-card-collapse" data-inventory-type="general" data-index="${index}" class="p-1 rounded-md text-gray-400 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-all duration-150 flex-shrink-0" title="${item.collapsed ? 'Expand Card' : 'Collapse Card'}">
                        <svg class="w-5 h-5 transition-transform duration-200 ${item.collapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <input type="text" data-inventory-type="general" data-field="name" data-index="${index}" value="${item.name || ''}" placeholder="Item Name..." class="font-bold text-base text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-indigo-500 focus:outline-none transition-all duration-200 w-full rounded px-1 -ml-1 focus:bg-gray-50 dark:focus:bg-gray-900 truncate" />
                </div>
                
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40 font-mono" title="Quantity">
                        x${item.amount || 1}
                    </span>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40" title="Value per unit">
                        🪙 ${item.valuePerUnit || 0}
                    </span>
                </div>
            </div>

            <!-- Card Body (Hidden when collapsed) -->
            <div class="card-body flex flex-col gap-4 ${item.collapsed ? 'hidden' : 'mt-4'}">
                <!-- Attributes grid -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="flex flex-col gap-1 col-span-2 sm:col-span-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Item Type</label>
                        <input type="text" data-inventory-type="general" data-field="type" data-index="${index}" value="${item.type || ''}" placeholder="e.g. Consumable" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Amount</label>
                        <input type="number" data-inventory-type="general" data-field="amount" data-index="${index}" value="${item.amount || 1}" min="0" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Value (Unit)</label>
                        <div class="relative flex items-center">
                            <span class="absolute left-2.5 text-xs">🪙</span>
                            <input type="number" data-inventory-type="general" data-field="valuePerUnit" data-index="${index}" value="${item.valuePerUnit || 0}" class="pl-7 pr-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                        </div>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Accuracy %</label>
                        <input type="number" data-inventory-type="general" data-field="accuracy" data-index="${index}" value="${item.accuracy || ''}" placeholder="100%" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                </div>

                <!-- Effect / Description -->
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Effect / Description</label>
                    <textarea data-inventory-type="general" data-field="effect" data-index="${index}" placeholder="Item description or usage effect..." class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-16 resize-none">${item.effect || ''}</textarea>
                </div>

                <!-- Card Footer Actions -->
                <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/60 mt-auto">
                    <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Value: <strong class="text-amber-600 dark:text-amber-400">🪙 ${totalVal}</strong></span>
                    <button type="button" data-inventory-type="general" data-index="${index}" class="remove-item-btn text-xs font-semibold text-red-500 hover:text-white dark:text-red-400 hover:bg-red-500 dark:hover:bg-red-600 border border-red-200 dark:border-red-900/40 px-2.5 py-1 rounded transition-all duration-200">
                        Remove
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function renderGeneralTable() {
    // 1. Render Table View
    renderInventoryTable('general', character.generalInventory, '#general-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'type', type: 'text', class: 'w-full' },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'accuracy', type: 'number', class: 'w-full' },
        { field: 'amount', type: 'number', class: 'w-full' },
        { field: 'valuePerUnit', type: 'number', class: 'w-full' }
    ]);

    // 2. Render Card View
    renderGeneralCards();

    // 3. Align layout active state classes
    toggleInventoryViewDOM('general', inventoryViewSettings.general);
}

// Function to perform a quick roll for all player stats
function quickRollStats() {
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
        hasUnsavedChanges = true; // Mark that there are unsaved changes
    });
}

/**
 * Initializes stats for point distribution.
 */
function distributeStats() {
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
        hasUnsavedChanges = true;
    });
}

/**
 * Updates the display of remaining distribution points.
 */
function updateRemainingPointsDisplay() {
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


function updateRacialChange(oldRace, statName) {
    character[statName].racialChange -= ExternalDataManager.getRacialChange(oldRace, statName);
    character[statName].racialChange += ExternalDataManager.getRacialChange(character.race, statName);
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

/**
 * Reverts the effects of all choices for a given category and unique identifier.
 * @param {object} char The character object.
 * @param {string} category The category (e.g., 'Demi-humans', 'Mutant').
 * @param {string} uniqueIdentifier The 'unique' value of the passive (e.g., 'Stat Adjustments', 'Mutation_Degeneration').
 */
function handleRevertChoices(char, category, uniqueIdentifier) {
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
            }
        }
        delete char.StatChoices[category][uniqueIdentifier];
    }
    if (char.StatsAffected[category]) {
        delete char.StatsAffected[category][uniqueIdentifier];
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

function isUsableApplicableStats(applicableStats, category, unique, slotId) {
    let count = 0;
    for (const statName of applicableStats) {
        if (hasConflict(character, category, unique, statName, slotId))
            ++count;
    }

    return applicableStats.length > count;
}

/**
 * Handles the application or removal of a racial passive choice, including stat effects and flags.
 * @param {string} category The category (e.g., 'Demi-humans', 'Mutant').
 * @param {object} newAbilityData The data for the new choice to be applied (or null/undefined to clear).
 * Expected properties: { type, calc?, value?, statName?, label?, level?, unique? }
 */
function processRacialRegularPassiveChange(newAbilityData) {
    const race = character.race;
    if (character.uniqueIdentifiers['Spatial Reserve'] && newAbilityData.identifier == 'Spatial Reserve') {
        character.BaseRacialPower.value += defaultRacialPointScale - newAbilityData.values[1];
    }

    removeTemporaryEffectByIdentifier(newAbilityData, race);

    if (newAbilityData.formulas && newAbilityData.formulas.length > 0) {
        for (const formula of newAbilityData.formulas) {
            if (formula.statsAffected) {
                if(newAbilityData.identifier) {
                    formula['identifier'] = newAbilityData.identifier;
                }

                if(newAbilityData.name) {
                    formula['name'] = newAbilityData.name;
                }

                addTemporaryEffect(character, race, formula, Infinity);
            }
        }
    }
    else if (newAbilityData.identifier) {
        character.uniqueIdentifiers[newAbilityData.identifier] = newAbilityData;

        if (newAbilityData.identifier == 'Spatial Reserve') {
            character.BaseRacialPower.value += newAbilityData.values[1] - defaultRacialPointScale;
        }
    }

    recalculateCharacterDerivedProperties(character, true);
    hasUnsavedChanges = true;
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

    character.StatChoices[category] = character.StatChoices[category] || {};
    character.StatChoices[category][uniqueIdentifier] = character.StatChoices[category][uniqueIdentifier] || {};
    character.StatsAffected[category] = character.StatsAffected[category] || {};
    character.StatsAffected[category][uniqueIdentifier] = character.StatsAffected[category][uniqueIdentifier] || {};

    const previousChoice = character.StatChoices[category][uniqueIdentifier][slotId];

    // 1. Revert previous effect if any
    if (previousChoice) {
        if (previousChoice.statName) {
            revertChoiceRacialChange(character, previousChoice.statName, previousChoice);
            if (character.StatsAffected[category] && character.StatsAffected[category][uniqueIdentifier] && character.StatsAffected[category][uniqueIdentifier][previousChoice.statName]) {
                character.StatsAffected[category][uniqueIdentifier][previousChoice.statName].delete(slotId);
                if (character.StatsAffected[category][uniqueIdentifier][previousChoice.statName].size === 0) {
                    delete character.StatsAffected[category][uniqueIdentifier][previousChoice.statName];
                }
            }
        }

        delete character.StatChoices[category][uniqueIdentifier][slotId];
        console.log(`  Removed previous choice for slot ${slotId}.`);
    }

    // 2. Apply new choice if a valid newChoiceData is provided
    if (newChoiceData && newChoiceData.type) {
        // Check for conflicts only if a stat is being affected and it's not the same slot re-selecting itself
        // The conflict check should be based on the 'unique' group, not just the stat name within the category.
        // If a choice has a 'unique' property, it means only one of those choices can affect a given stat.
        if (newChoiceData.statName && newChoiceData.unique && hasConflict(character, category, newChoiceData.unique, newChoiceData.statName, slotId)) {
            showStatusMessage(`'${newChoiceData.statName}' has already been affected by another choice in the '${newChoiceData.unique}' group. Please select a different stat.`, true);
            // Revert the dropdowns to previous state (if possible)
            const typeSelectElement = document.getElementById(slotId + '-type');
            const statSelectElement = document.getElementById(slotId + '-stat');
            if (typeSelectElement) typeSelectElement.value = previousChoice ? previousChoice.type : '';
            if (statSelectElement) statSelectElement.value = previousChoice ? previousChoice.statName : '';
            return; // Stop processing this choice
        }

        // Apply stat-modifying changes
        if (newChoiceData.statName) {
            applyChoiceRacialChange(character, newChoiceData.statName, newChoiceData.value, newChoiceData.calc);
            character.StatsAffected[category][uniqueIdentifier][newChoiceData.statName] = character.StatsAffected[category][uniqueIdentifier][newChoiceData.statName] || new Set();
            character.StatsAffected[category][uniqueIdentifier][newChoiceData.statName].add(slotId);
            console.log(`  Added '${newChoiceData.statName}' to StatsAffected for slot ${slotId}.`);
        } else {
            // Handle non-stat affecting choices (e.g., skill_choice)
            if (newChoiceData.type === 'skill_choice') {
                showStatusMessage(`'${newChoiceData.label}' (Skill Choice) is not fully implemented yet.`, false);
            }
        }

        if (!newChoiceData.level) {
            newChoiceData.level = null;
        }

        character.StatChoices[category][uniqueIdentifier][slotId] = newChoiceData;
    }

    recalculateCharacterDerivedProperties(character); // Recalculate all derived properties
    updateDOM(); // Update the UI to reflect changes
    hasUnsavedChanges = true;
    console.log("--- processRacialChoiceChange finished ---");
}


// Function to handle race change, updating racial characteristics
function handleChangeRace(oldRace) {
    // Revert all previous manual passive choices for the old race
    if (character.StatChoices[oldRace]) {
        for (const uniqueIdentifier in character.StatChoices[oldRace]) { // Changed from passiveName
            handleRevertChoices(character, oldRace, uniqueIdentifier); // Changed from passiveName
        }
        delete character.StatChoices[oldRace];
    }
    if (character.StatsAffected[oldRace]) {
        delete character.StatsAffected[oldRace];
    }

    if (character.uniqueIdentifiers['Spatial Reserve']) {
      //  character.BaseRacialPower.value += defaultRacialPointScale - character.uniqueIdentifiers['Spatial Reserve'].values[1];
        delete character.uniqueIdentifiers['Spatial Reserve'];
    }

    // Update racialChange for each stat based on the new race
    ExternalDataManager.rollStats.forEach(statName => {
        updateRacialChange(oldRace, statName);
        document.getElementById(`${statName}-racialChange`).value = getAppliedRacialChange(character, statName); // Display raw number
        document.getElementById(`${statName}-total`).value = calculateRollStatTotal(character, statName);
    });
    

    ExternalDataManager.otherStats.forEach(statName => {
        updateRacialChange(oldRace, statName);
    });

    // Re-render the racial passives UI
    renderRacial(oldRace);

    // Update maxHealth, maxMana, maxRacialPower, and totalDefense when race changes
    recalculateSmallUpdateCharacter(character, true);

    const starterItems = ExternalDataManager.getRaceStarterItems(character.race);
    
    if (starterItems) {
        if (character.purse == 0) {
            character.purse = starterItems["Coins"] ?? 0;
            document.getElementById('purse').value = character.purse;
        }
    }

    hasUnsavedChanges = true; // Mark that there are unsaved changes
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

/**
 * Initializes a new choice data object for racial passives.
 * @param {string} newType The type of the new choice.
 * @param {object} abilityData The full ability data from ExternalDataManager.
 * @param {number} indexLevel The index representing the level slot for this choice (e.g., 0 for first choice at level 1).
 * @param {object} newSelectedOptionData The data for the newly selected option (from abilityData.options).
 * @param {string|null} statToAffect The name of the stat to affect, if applicable.
 * @param {string|null} newUniqueIdentifier The unique identifier for this choice group.
 * @returns {object|null} The new choice data object, or null if newType is falsy.
 */
function initEventNewChoiceData(newType, abilityData, indexLevel, newSelectedOptionData, statToAffect, newUniqueIdentifier) {
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

    return newChoiceData;
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

function optionsSelector(race, category, abilityName, abilityData, setsOptions, manualPassivesList, slotId, currentUniqueIdentifier, displayLevel, selectedOptionData, selectedOptionType, selectedStatName, applicableStatsLength, indexLevel) {
    const needsStatSelection = applicableStatsLength > 0;
    const choiceDiv = document.createElement('div');
    choiceDiv.className = 'flex flex-col space-y-1 border border-gray-200 dark:border-gray-700 rounded-md';
    let innerHTML = `
            <div class="flex items-center space-x-2">
                <label for="${slotId}-type" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">${abilityName} ${displayLevel}:</label>
                <select id="${slotId}-type" class="${race}-choice-type-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="">-- Select a ${abilityName} Type --</option>
        `;

    setsOptions.forEach(opt => {
        const isOptionDisabled = opt.applicableStats && !isUsableApplicableStats(opt.applicableStats, category, opt.unique, slotId);
        innerHTML += `<option value="${opt.type}" ${opt.type === selectedOptionType ? 'selected' : ''} ${isOptionDisabled ? 'disabled' : ''}>${opt.label}</option>`;
    });

    let statSelectionHtml = '';

    if (needsStatSelection) {
        const hide = applicableStatsLength === 1 ? 'hidden' : ''; // Hide if only one applicable stat
        statSelectionHtml = `
            <div id="${slotId}-stat-selection" class="flex items-center space-x-2 ${hide}">
                <label for="${slotId}-stat" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">Target Stat:</label>
                <select id="${slotId}-stat" class="${race}-choice-stat-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="">-- Select a Stat --</option>
                </select>
            </div>`;
    }

    innerHTML +=
            `</select>
                <button type="button" data-choice-id="${slotId}-type" data-category="${category}" data-unique-identifier="${currentUniqueIdentifier || ''}" class="clear-${race}-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>
        </div>
        ${statSelectionHtml}
    `;

    choiceDiv.innerHTML = innerHTML;
    manualPassivesList.appendChild(choiceDiv);

    const typeSelect = choiceDiv.querySelector(`#${slotId}-type`);
    const statSelectionDiv = choiceDiv.querySelector(`#${slotId}-stat-selection`);
    const statSelect = choiceDiv.querySelector(`#${slotId}-stat`);

    // Populate stat dropdown if needed on initial render
    if (statSelect && needsStatSelection) {
        selectedOptionData.applicableStats.forEach(statName => {
            const option = document.createElement('option');
            option.value = statName;
            option.textContent = statName;
            option.disabled = hasConflict(character, category, selectedOptionData.unique, statName, slotId);
            statSelect.appendChild(option);
        });
        statSelect.value = selectedStatName;
    }

    // Event listener for type change (to show/hide stat selection)
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            const newType = e.target.value;
            const newSelectedOptionData = setsOptions.find(opt => opt.type === newType);
            const newApplicableStatsLength = newSelectedOptionData && newSelectedOptionData.applicableStats ? newSelectedOptionData.applicableStats.length : 0;
            const newNeedsStatSelection = newSelectedOptionData && newApplicableStatsLength > 0;
            const newUniqueIdentifier = newSelectedOptionData ? newSelectedOptionData.unique : null;

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
}

function filterFromArrayStartIndex(arr, startIndex, predicate) {
  const result = [];
  for (let i = startIndex; i < arr.length; i++) {
    if (predicate(arr[i], i, arr)) {
      result.push(arr[i]);
    }
  }
  return result;
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
        const selectedOptionData = newAvailableOptions.find(opt => opt.type === selectedOptionType); // Find the full option data
        const applicableStatsLength = selectedOptionData && selectedOptionData.applicableStats ? selectedOptionData.applicableStats.length : 0;

        if (newAvailableOptions[0].setsOption) {
            optionsSelector(race, category, abilityKey, abilityData, newAvailableOptions.filter(opt => opt.setsOption), manualPassivesList, slotId, currentUniqueIdentifier, displayLevel, selectedOptionData, selectedOptionType, selectedStatName, applicableStatsLength);
        } else {
            optionChoices(race, category, newAvailableOptions[0], manualPassivesList, slotId, currentUniqueIdentifier, selectedStatName, abilityData, indexLevel);
        }

        ++count;
        newAvailableOptions = newAvailableOptions.filter(opt => opt.count && opt.count > count);
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
 * Removes a specific temporary effect from all stats it affects, identified by a unique string.
 * This is optimized by first collecting all unique stats affected to avoid redundant searches.
 *
 * @param {object} abilityData The ability object containing an identifier and formulas.
 * @param {string} category The category of the temporary effect to remove.
 */
function removeTemporaryEffectByIdentifier(abilityData, category) {
    const { identifier, formulas } = abilityData;

    if (!identifier || !character.uniqueIdentifiers[identifier]) {
        return;
    }

    delete character.uniqueIdentifiers[identifier];

    // 1. Collect all unique stats affected by this ability's formulas.
    const uniqueStats = new Set(
        formulas?.flatMap(formula => formula.statsAffected || []) ?? []
    );

    // 2. Iterate over the unique stats and remove the effect.
    for (const statName of uniqueStats) {
        const effectsArray = character[statName]?.temporaryEffects?.[category];
        if (!Array.isArray(effectsArray)) {
            continue;
        }

        const effectIndex = effectsArray.findIndex(e => e.identifier === identifier);

        if (effectIndex > -1) {
            effectsArray.splice(effectIndex, 1);
        }
    }
}

/**
 * Removes all temporary effects of a specific category that are granted by a given set of abilities.
 * This is optimized by collecting all unique stats and identifiers first, then performing deletions.
 *
 * @param {object} abilities An object where keys are ability names and values are ability data objects.
 * @param {string} category The category of temporary effects to remove (e.g., 'race', 'class').
 */
function removeTemporaryEffectByCategory(abilities, category) {
    if (!abilities || typeof abilities !== 'object') {
        return;
    }

    const uniqueStats = new Set();
    const uniqueIdentifiers = new Set();

    // 1. First, iterate through all abilities to collect unique stats and identifiers.
    for (const ability of Object.values(abilities)) {
        if (ability.identifier) {
            uniqueIdentifiers.add(ability.identifier);
        }
        for (const formula of ability.formulas ?? []) {
            for (const statName of formula.statsAffected ?? []) {
                uniqueStats.add(statName);
            }
        }
    }

    // 2. Now, perform the deletions in targeted loops.
    for (const identifier of uniqueIdentifiers) {
        delete character.uniqueIdentifiers[identifier];
    }

    for (const statName of uniqueStats) {
        // Deleting the property is a clean way to remove all effects for that category.
        delete character[statName]?.temporaryEffects?.[category];
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
            const footNoteData = isNaN(numbersFootNotes[key]) ? footNotesData[numbersFootNotes[key]][key] : footNotesData[key];
            paragraphe.innerHTML = `${ExternalDataManager.formatString(footNoteData, dices, [])}`;
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

function pushRaceFootNotes(race, dataKey, numbersFootNotes) {
    const raceData = ExternalDataManager.getRaceData(race);

    if (raceData.foot_notes && raceData.foot_notes[dataKey]) {
        const Keys = Object.keys(raceData.foot_notes[dataKey]);
        Keys.forEach(key => {
            numbersFootNotes[key] = dataKey;
        });
    }
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
                    numbersFootNotes[key] = true;
                });
            }
        }
    }
}

function renderRegularRacialPassives(oldRace, passivesContainer) {
    const race = character.race;
    const id = 'regular-passives';

    if (oldRace) {
        const oldRegularPassives = ExternalDataManager.getRaceRegularPassives(oldRace, character.level);
        removeTemporaryEffectByCategory(oldRegularPassives, oldRace);
    }

    const regularPassives = ExternalDataManager.getRaceRegularPassives(race, character.level);

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

function renderProperties(wrapper, innerHTML, className) {
    const element = document.createElement('p');
    element.innerHTML = innerHTML;
    element.className = className;
    wrapper.appendChild(element);
}

function renderRacialActives(activesContainer) {
    const race = character.race;
    const id = 'racial-actives';
    const racialActives = ExternalDataManager.getRaceActives(race, character.level);

    if (racialActives && Object.keys(racialActives).length > 0) {
        const numbersFootNotes = {};
        pushRaceFootNotes(race, 'actives', numbersFootNotes);
        renderContainer(activesContainer, 'Racial Actives', id, numbersFootNotes);
        const racialActiveList = document.getElementById(`${race}-${id}-list`);

        for (const abilityKey in racialActives) {
            if (racialActives.hasOwnProperty(abilityKey)) {
                const abilityData = racialActives[abilityKey];
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
                    renderProperties(abilityWrapper, `<b>Conditions:</b> ${ExternalDataManager.formatString(abilityData.conditions, abilityData.values)}`, 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors');
                }

                const abilityDescription = document.createElement('p');
                abilityDescription.innerHTML = ExternalDataManager.formatHrefFootNotes(abilityData.description, racialActiveList, abilityData.foot_notes);
                abilityDescription.id = abilityTarget;
                abilityDescription.className = 'text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-100 transition-colors';

                abilityWrapper.appendChild(abilityDescription);
                racialActiveList.appendChild(abilityWrapper);

                if (abilityData.foot_notes) {
                    abilityData.foot_notes.forEach(key => {
                        numbersFootNotes[key] = true;
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

    if (genericActives) {
        renderRacialActives(activesContainer, race);
    } else {
        activesContainer.classList.add('hidden');
        activesContainer.innerHTML = '';
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

function renderGenericClassesPassives() {
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

/**
* Orchestrates the rendering of all racial passive sections based on the current race.
*/
function renderRacial(oldRace) {
    // Hide all specific containers first
    document.getElementById('racial-manual-passives-container').classList.add('hidden');
    renderGenericRacialPassives(oldRace, character.race);
    document.getElementById('racial-actives-container').classList.add('hidden');
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

/**
 * Handles input changes for inventory items.
 * @param {Event} event The input event.
 */
function handleInventoryInputChange(event) {
    const { value, type, dataset, checked } = event.target;
    const inventoryType = dataset.inventoryType;
    const itemIndex = parseInt(dataset.index);
    const field = dataset.field;

    // Check if we are editing a specific magic element attribute
    const action = dataset.action;
    if (action === 'edit-magic-element') {
        const meIndex = parseInt(dataset.meIndex);
        const meField = dataset.field;
        let val = event.target.value;

        // Dropdown element change should only trigger on 'change' event to avoid duplicate prompts/handlers
        if (meField === 'element' && event.type !== 'change') {
            return;
        }
        // Input fields should only trigger on 'input' event to update memory, change event handles re-rendering
        if (meField !== 'element' && event.type !== 'input') {
            return;
        }

        const inventory = character[`${inventoryType}Inventory`];
        if (inventory && inventory[itemIndex]) {
            ensureMagicElements(inventory[itemIndex], inventoryType);
            const me = inventory[itemIndex].magicElements[meIndex];
            if (me) {
                if (meField === 'element') {
                    if (val === 'custom_input') {
                        me.element = 'Custom';
                    } else {
                        me.element = val;
                    }
                    if (inventoryType === 'armor') {
                        recalculateSmallUpdateCharacter(character, true);
                    }
                } else if (meField === 'custom-element-name') {
                    me.element = val;
                    if (inventoryType === 'armor') {
                        recalculateSmallUpdateCharacter(character, true);
                    }
                } else if (meField === 'defense') {
                    me[meField] = val; // Store formula/string directly
                    recalculateSmallUpdateCharacter(character, true);
                } else {
                    me[meField] = val;
                }
                hasUnsavedChanges = true;
            }
        }
        return;
    }

    const inventory = character[`${inventoryType}Inventory`];
    if (!inventory || !inventory[itemIndex]) return;

    if (field === 'use' || field === 'equipped') { // Handle checkboxes
        inventory[itemIndex][field] = checked;
        if (inventoryType === 'weapon' && field === 'use') {
            ensureMagicElements(inventory[itemIndex], 'weapon');
            if (checked) {
                rollWeaponAtIndex(itemIndex);
            } else {
                renderWeaponTable();
            }
        } else if (inventoryType === 'armor' && field === 'equipped') {
            ensureMagicElements(inventory[itemIndex], 'armor');
            if (checked) {
                rollArmorAtIndex(itemIndex);
            } else {
                recalculateSmallUpdateCharacter(character, true);
                renderArmorTable();
            }
        }
    } else if (type === 'number' && field !== 'damage' && field !== 'defense') { // Exclude damage and defense from number parsing
        inventory[itemIndex][field] = parseFloat(value) || 0;
    } else {
        // For text fields (including damage and defense which can be formulas)
        inventory[itemIndex][field] = value;
        if (inventoryType === 'armor' && field === 'defense') {
            recalculateSmallUpdateCharacter(character, true);
        }
    }
}

/**
 * Handles clicks for adding or removing magic elements on weapon and armor cards/tables.
 * @param {Event} event The click event.
 * @returns {boolean} Whether an action was handled.
 */
function handleMagicElementClick(event) {
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
            hasUnsavedChanges = true;
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
            hasUnsavedChanges = true;
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
function handlePlayerStatInputChange(event) {
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
            } else if (subProperty === 'isPercent') { // Handle the new isPercent checkbox
                categoryTemporaryEffects[effectIndex][subProperty] = checked;
            } else if (subProperty === 'duration') {
                categoryTemporaryEffects[effectIndex][subProperty] = parseFloat(value) || 0;
            } else if (subProperty === 'name') {
                categoryTemporaryEffects[effectIndex][subProperty] = value;
            } else if (subProperty === 'values') {
                categoryTemporaryEffects[effectIndex][subProperty] = [newValue];
            } else {
                categoryTemporaryEffects[effectIndex][subProperty] = newValue;
            }
            
            // Re-render the temporary effects list and update the stat total immediately
            renderTemporaryEffects(statName); // This will now preserve focus
            // If the stat is Health, Mana, RacialPower, or totalDefense, recalculate its value
            if (statName === 'Health' || statName === 'Mana' || statName === 'RacialPower' || statName === 'totalDefense') {
                recalculateSmallUpdateCharacter(character, true); // Update max values and their DOM elements
            } else { // For rollStats, update their total
                document.getElementById(`${statName}-total`).value = calculateRollStatTotal(character, statName);
            }
            hasUnsavedChanges = true;
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

    // Also check for Health, Mana, RacialPower, and totalDefense as they are now handled similarly for temporary effects
    if (!statName && (name.startsWith('Health') || name.startsWith('Mana') || name.startsWith('RacialPower') || name.startsWith('totalDefense'))) {
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
    hasUnsavedChanges = true;
}

function removePassivesLevel() {
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

// Event listener for all input changes
function handleChange(event) {
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
            // Update summaries instantly during typing
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
            document.getElementById('levelMaxExperience').value = character.levelMaxExperience;
            if (newValue < oldLevel)
                removePassivesLevel();
            
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
            healthInput.value = character.Health.value;
        } else if (id === 'Mana') {
            character.Mana.value = Math.min(newValue, character.maxMana);
            manaInput.value = character.Mana.value;
        } else if (id === 'RacialPower') {
            character.RacialPower.value = Math.min(newValue, character.maxRacialPower);
            racialPowerInput.value = character.RacialPower.value;
        } else if (id === 'totalDefense') {
            // Allow direct input for totalDefense.value but it will be recalculated
            character.totalDefense.value = newValue;
            document.getElementById('total-defense').value = character.totalDefense.value;
        } else if (id === 'personalNotes' || id === 'backstory') {
            character.layouts[id].text = newValue;
        } else if(id === 'purse' || id === 'bank') {
            character[id] = newValue;
        } else if (id !== 'classes-display' && id !== 'specializations-display') {
            character[name || id] = newValue;
        }
    }
    hasUnsavedChanges = true;
}

// Function to toggle the visibility of the class dropdown options
function toggleClassDropdown() {
    const dropdown = document.getElementById('classes-dropdown-options');
    dropdown.classList.toggle('hidden');
}

// Function to toggle the visibility of the class dropdown options
function toggleStateDropdown() {
    const dropdown = document.getElementById('state-dropdown-options');
    dropdown.classList.toggle('hidden');
}

// Function to toggle the visibility of the specializations dropdown options
function toggleSpecializationDropdown() {
    const dropdown = document.getElementById('specializations-dropdown-options');
    dropdown.classList.toggle('hidden');
}

// Function to handle changes in the class checkboxes
function handleClassCheckboxChange(event) {
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
    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

// Function to handle changes in the state checkboxes
function handleStateCheckboxChange(event) {
    const { value, checked } = event.target;

    character.states[value] = checked;

    // Update the displayed value in the input field
    document.getElementById('state-display').value = getCharacterStatesActive().join(', ');

    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

function removeSpecializationWarning() {
    const specializationDisplayInput = document.getElementById('specializations-display');
    specializationDisplayInput.classList.remove('white-placeholder');
    specializationDisplayInput.classList.remove('bg-yellow-500');
    specializationDisplayInput.classList.remove('hover:bg-yellow-600');
}

function addremoveSpecializationWarning() {
    const specializationDisplayInput = document.getElementById('specializations-display');
    specializationDisplayInput.classList.add('white-placeholder');
    specializationDisplayInput.classList.add('bg-yellow-500');
    specializationDisplayInput.classList.add('hover:bg-yellow-600'); 
}

function renderSpecializations(specializations, availableSpecializationsKeys) {
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

    console.log("test");
    console.log(countSelectedClass);
    console.log(availableSpecializationsKeys.length);
    if (countSelectedClass > 0 && availableSpecializationsKeys.length == countSelectedClass)
        removeSpecializationWarning();
    else if (availableSpecializationsKeys.length > 0)
        addremoveSpecializationWarning();
}

// Function to handle changes in the specializations checkboxes
function handleSpecializationCheckboxChange(event) {
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
    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

// Function to update the specializations dropdown options and filter selected specializations
function updateSpecializationDropdownAndData() {
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

// Function to toggle the personal notes panel visibility
function togglePersonalNotesPanel() {
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
        hasUnsavedChanges = true; // Mark that there are unsaved changes
    }
}
function saveHeightPositionAndSize(container) {
    if (container) {
        // Save position and size as percentages of the viewport
        character.layouts[container.id].height = container.offsetHeight / window.innerHeight;
        hasUnsavedChanges = true; // Mark as unsaved
    }
}

/**
 * Saves the current position and size of the container to the character data.
 */
function savePositionAndSize(container) {
    if (container) {
        // Save position and size as percentages of the viewport
        character.layouts.personalNotes.x = container.offsetLeft / window.innerWidth;
        character.layouts.personalNotes.y = container.offsetTop / window.innerHeight;
        character.layouts.personalNotes.width = container.offsetWidth / window.innerWidth;
        character.layouts.personalNotes.height = container.offsetHeight / window.innerHeight;
        hasUnsavedChanges = true; // Mark as unsaved
    }
}

/**
 * Makes an element vertically resizable by dragging a handle.
 * @param {HTMLElement} element - The element to resize (textarea).
 * @param {HTMLElement} handle - The handle element that user drags.
 */
function makeHeightResizable(element, handle) {
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

function makeResizable(element, handle) {
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
function makeDraggable(element, handle) {
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

function populateRaceSelector() {
    // Handle race selector placeholder color and update max Health
    const raceSelect = document.getElementById('race');
    raceSelect.innerHTML = `<option value="" disabled selected class="defaultOption">Select a Race</option>`;

    if (character.race === '')
        raceSelect.classList.add('select-placeholder-text');
    else
        raceSelect.classList.remove('select-placeholder-text');

    Object.keys(ExternalDataManager._data.Races).forEach(race => {
        const option = document.createElement('option');
        option.value = race;
        option.textContent = race;
        raceSelect.appendChild(option);
    });

    raceSelect.value = character.race; // Set the selected race
}

// Function to populate the character selector dropdown
function populateCharacterSelector() {
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

// Function to switch to a different character
function switchCharacter(event) {
    // Before switching, check for unsaved changes and prompt if necessary
    if (hasUnsavedChanges) {
        // Using a custom modal instead of confirm()
        showConfirmationModal("You have unsaved changes. Are you sure you want to switch characters without saving?", () => {
            currentCharacterIndex = parseInt(event.target.value);
            updateDOM(); // Update the UI with the new character's data
            historyStack = []; // Clear previous history
            historyPointer = -1; // Reset history pointer
            saveCurrentStateToHistory(); // Save the new character's state as the first history entry
            hasUnsavedChanges = false; // Reset unsaved changes flag after switching
            updateRemainingPointsDisplay(); // Reset remaining points display
        }, () => {
            // If user cancels, revert the dropdown selection
            event.target.value = currentCharacterIndex;
        });
    } else {
        currentCharacterIndex = parseInt(event.target.value);
        updateDOM(); // Update the UI with the new character's data
        historyStack = []; // Clear previous history
        historyPointer = -1; // Reset history pointer
        saveCurrentStateToHistory(); // Save the new character's state as the first history entry
        updateRemainingPointsDisplay(); // Reset remaining points display
    }
}

// Function to add a new character sheet
function addNewCharacter() {
    // Before adding, check for unsaved changes and prompt if necessary
    if (hasUnsavedChanges) {
        showConfirmationModal("You have unsaved changes. Are you sure you want to add a new character without saving?", () => {
            const newChar = defaultCharacterData();
            // Give a unique name to the new character
            newChar.name = `Character ${characters.length + 1}`;
            characters.push(newChar);
            currentCharacterIndex = characters.length - 1; // Switch to the new character
            populateCharacterSelector(); // Update the dropdown
            updateDOM(); // Update the UI
            showStatusMessage(`Added new character: ${newChar.name}`);
            console.log(`Added new character: ${newChar.name}`);
            historyStack = []; // Clear previous history
            historyPointer = -1; // Reset history pointer
            saveCurrentStateToHistory(); // Save the new character's state as the first history entry
            hasUnsavedChanges = false; // Reset unsaved changes flag after adding
            character.isDistributingStats = false; // Exit distribution mode when adding new character
            updateRemainingPointsDisplay(); // Reset remaining points display
        });
    } else {
        const newChar = defaultCharacterData();
        // Give a unique name to the new character
        newChar.name = `Character ${characters.length + 1}`;
        characters.push(newChar);
        currentCharacterIndex = characters.length - 1; // Switch to the new character
        populateCharacterSelector(); // Update the dropdown
        updateDOM(); // Update the UI
        showStatusMessage(`Added new character: ${newChar.name}`);
        console.log(`Added new character: ${newChar.name}`);
        historyStack = []; // Clear previous history
        historyPointer = -1; // Reset history pointer
        saveCurrentStateToHistory(); // Save the new character's state as the first history entry
        character.isDistributingStats = false; // Exit distribution mode when adding new character
        updateRemainingPointsDisplay(); // Reset remaining points display
    }
}

// Functions to add new items to inventories
function addWeapon() {
    character.weaponInventory.push({ name: '', type: '', material: '', requirement: '', requiredStat: '', accuracy: 100, damage: '', magicElements: [], effect: '', value: 0, use: false, originalDamage: '' });
    updateDOM(); // Re-render the inventory table
    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

function addArmor() {
    character.armorInventory.push({ name: '', location: '', material: '', requirement: '', requiredStat: '', defense: 0, magicElements: [], effect: '', value: 0, equipped: false });
    updateDOM(); // Re-render the inventory table
    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

function addGeneralItem() {
    character.generalInventory.push({ name: '', type: '', effect: '', accuracy: 0, amount: 0, valuePerUnit: 0 });
    updateDOM(); // Re-render the inventory table
    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

// Function to remove an item from inventory
function removeItem(event) {
    const inventoryType = event.target.dataset.inventoryType;
    const index = parseInt(event.target.dataset.index);

    if (inventoryType === 'weapon') {
        character.weaponInventory.splice(index, 1);
    } else if (inventoryType === 'armor') {
        character.armorInventory.splice(index, 1);
        recalculateSmallUpdateCharacter(character, true); // Recalculate totalDefense after removing armor
    } else if (inventoryType === 'general') {
        character.generalInventory.splice(index, 1);
    }
    updateDOM(); // Re-render the inventory table
    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

// Function to reset the current character to default data
function newFile() {
    showConfirmationModal(`Are you sure you want to make a new file? ${hasUnsavedChanges ? 'All unsaved data will be lost.': ''}`, () => {
        currentGoogleDriveFileId = null;
        characters = [defaultCharacterData()];
        currentCharacterIndex = 0; // Set the active character to the new, single sheet

        updateDOM(); // Update the UI with the new default character
        populateCharacterSelector(); // Re-populate the character selector with the single sheet

        historyStack = []; // Clear history after a full reset
        historyPointer = -1; // Reset history pointer
        hasUnsavedChanges = false; // Reset unsaved changes flag after reset

        showStatusMessage("Sheets reset successfully!");
    });
}

// Function to reset the current character to default data
function resetCurrentCharacter() {
    showConfirmationModal("Are you sure you want to reset the current character? All data will be lost.", () => {
        characters[currentCharacterIndex] = defaultCharacterData();
        characters[currentCharacterIndex].name = `Character ${currentCharacterIndex + 1}`; // Keep current character name convention
        updateDOM();
        showStatusMessage("Current character reset successfully!");
        historyStack = []; // Clear history after a full reset
        historyPointer = -1; // Reset history pointer
        saveCurrentStateToHistory(); // Save the reset state as the first history entry
        hasUnsavedChanges = false; // Reset unsaved changes flag after reset
        character.isDistributingStats = false; // Exit distribution mode on reset
        updateRemainingPointsDisplay(); // Reset remaining points display
    });
}

// Function to delete the current character
function deleteCurrentCharacter() {
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
                currentCharacterIndex = characters.length - 1;
            }

            updateDOM();
            populateCharacterSelector(); // Re-populate selector after deletion
            showStatusMessage("Character deleted successfully!");
            historyStack = []; // Clear history after deletion
            historyPointer = -1; // Reset history pointer
            saveCurrentStateToHistory(); // Save the new state as the first history entry
            hasUnsavedChanges = false; // Reset unsaved changes flag after deletion
            character.isDistributingStats = false; // Exit distribution mode on delete
            updateRemainingPointsDisplay(); // Reset remaining points display
        });
    }
}

/**
 * Apply a state from history.
 */
function applyHistoryState(state) {
    characters = JSON.parse(JSON.stringify(state));
    convertArraysToSetsAfterLoad(characters);

    if (characters.length === 0) {
        characters.push(defaultCharacterData());
        currentCharacterIndex = 0;
    } else if (currentCharacterIndex >= characters.length) {
        currentCharacterIndex = characters.length - 1;
    } else if (currentCharacterIndex < 0) {
        currentCharacterIndex = 0;
    }

    updateDOM();
    populateCharacterSelector();
    updateRemainingPointsDisplay();
    updateHistoryButtonsState();
}

/**
 * Undo (revert).
 */
function revertCurrentCharacter() {
    if (historyPointer > 0) {
        historyPointer--;
        const hasUnsavedChangesBeforeRevert = hasUnsavedChanges;
        hasUnsavedChanges = false; // Temporarily disable unsaved changes flag to avoid prompt
        applyHistoryState(historyStack[historyPointer]);
        hasUnsavedChanges = hasUnsavedChangesBeforeRevert; // Restore the unsaved changes flag
        showStatusMessage("Reverted to previous state.");
        console.log("Undo → Pointer:", historyPointer);
    } else {
        showStatusMessage("No previous state.", true);
    }
}

/**
 * Redo (forward).
 */
function forwardCurrentCharacter() {
    if (historyPointer < historyStack.length - 1) {
        historyPointer++;
        const hasUnsavedChangesBeforeRevert = hasUnsavedChanges;
        hasUnsavedChanges = false; // Temporarily disable unsaved changes flag to avoid prompt
        applyHistoryState(historyStack[historyPointer]);
        hasUnsavedChanges = hasUnsavedChangesBeforeRevert; // Restore the unsaved changes flag
        showStatusMessage("Moved forward to next state.");
        console.log("Redo → Pointer:", historyPointer);
    } else {
        showStatusMessage("No forward state.", true);
    }
}

// Function to update the enabled/disabled state of the history buttons
function updateHistoryButtonsState() {
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


// Function to toggle dropdown visibility
function toggleDropdown(menuId) {
    document.getElementById(menuId).classList.toggle('hidden');
}

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
let tempEffectsModal;
let tempEffectsModalTitle;
let tempEffectsModalTitleStatTotal = "";
let tempEffectsList;
let addTempEffectBtn;
let endTurnBtn; // Declare the new button
let takeDamageBtn;
let takeDamageModal;
let closeTakeDamageModal;
let cancelTakeDamage;
let applyTakeDamage;
let setHealthCheckbox;
let setTakeTrueDamage;
let damageTakeAmountInput;
let currentStatForTempEffects = null; // To keep track of which stat's temporary effects are being viewed
let currentStatDisplayNameForTempEffects = null;
let healthInput;
let manaInput;
let racialPowerInput;

/**
* Shows a custom confirmation modal.
* @param {string} message The message to display in the modal.
* @param {function} onConfirm Callback function to execute if user confirms.
* @param {function} onCancel Callback function to execute if user cancels (optional).
*/
function showConfirmationModal(message, onConfirm, onCancel = () => { }) {
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

/**
* Saves character data to Google Drive.
*/
async function saveCharacterToGoogleDrive() {
    if (!gapi.client.getToken()) {
        handleGoogleDriveAuthClickThenCall(saveCharacterToGoogleDrive);
        return;
    }

    saveCurrentStateToHistory(); // Ensure current state is saved to history before saving to Google Drive
    showStatusMessage("Saving to Google Drive...");

    try {
        const charactersToSave = prepareCharactersForSaving(characters);

        const content = JSON.stringify(charactersToSave, null, 2);
        // Determine the file name based on the first character's name, or a default
        const fileName = (characters[0].name.trim() !== '' ? characters[0].name.trim() + '_sheet' : 'character_sheets') + '.json';
        const mimeType = 'application/json';

        if (currentGoogleDriveFileId) {
            // Update existing file
            await gapi.client.request({
                path: `/upload/drive/v3/files/${currentGoogleDriveFileId}`,
                method: 'PATCH',
                params: { uploadType: 'media' },
                headers: { 'Content-Type': mimeType },
                body: content
            });
            showStatusMessage("Character data updated in Google Drive!");
        } else {
            // Create new file
            const metadata = {
                name: fileName,
                mimeType: mimeType,
                // Specify 'appDataFolder' to save in the hidden application data folder
                // or 'root' to save in the user's main Drive folder.
                // For this app, we'll save it to the root for easier user access.
                parents: ['root']
            };
            const boundary = '-------314159265358979323846';
            const multipartRequestBody =
                `--${boundary}\r\n` +
                `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
                JSON.stringify(metadata) + `\r\n` +
                `--${boundary}\r\n` +
                `Content-Type: ${mimeType}\r\n\r\n` +
                content + `\r\n` +
                `--${boundary}--`;

            const response = await gapi.client.request({
                path: '/upload/drive/v3/files?uploadType=multipart',
                method: 'POST',
                headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
                body: multipartRequestBody
            });
            setCurrentGoogleDriveFileId(response.result.id);
            showStatusMessage("New character data saved to Google Drive!");
        }
        console.log("Character data saved to Google Drive!");
        hasUnsavedChanges = false; // Data is now saved
    } catch (error) {
        console.error('Error saving to Google Drive:', error);
        showStatusMessage("Failed to save to Google Drive. Check console for details.", true);
    }
}

/**
* Loads character data from Google Drive.
*/
async function loadCharacterFromGoogleDrive() {
    if (!gapi.client.getToken()) {
        handleGoogleDriveAuthClickThenCall(loadCharacterFromGoogleDrive);
        return;
    }

    // Before loading, check for unsaved changes and prompt if necessary
    if (hasUnsavedChanges) {
        showConfirmationModal("You have unsaved changes. Are you sure you want to load a new file without saving?", async () => {
            await proceedToLoadGoogleDriveFile();
        });
    } else {
        await proceedToLoadGoogleDriveFile();
    }
}

async function proceedToLoadGoogleDriveFile() {
    showStatusMessage("Loading files from Google Drive...");
    googleDriveModal.classList.remove('hidden');
    googleDriveFileList.innerHTML = '';
    googleDriveModalStatus.textContent = 'Loading...';

    try {
        const res = await gapi.client.drive.files.list({
            pageSize: 20, // Fetch up to 20 files
            fields: 'files(id, name, modifiedTime)',
            q: "mimeType='application/json' and fullText contains '_sheet'", // Filter for JSON files named 'character_sheets'
            orderBy: 'modifiedTime desc' // Order by most recently modified
        });

        const files = res.result.files;

        if (!files || files.length === 0) {
            googleDriveModalStatus.textContent = 'No character sheet files found in Google Drive.';
            return;
        }

        googleDriveModalStatus.textContent = ''; // Clear loading message

        files.forEach(file => {
            const li = document.createElement('li');
            li.className = 'modal-list-item';
            li.textContent = `${file.name} (Last modified: ${new Date(file.modifiedTime).toLocaleString()})`;
            li.onclick = async () => {
                googleDriveModal.classList.add('hidden');
                await loadGoogleDriveFileContent(file.id);
            };
            googleDriveFileList.appendChild(li);
        });

    } catch (error) {
        console.error('Error listing Google Drive files:', error);
        googleDriveModalStatus.textContent = "Failed to load files from Google Drive. Check console for details.";
        showStatusMessage("Failed to load files from Google Drive.", true);
    }
}

/**
* Fetches and loads content of a specific Google Drive file.
* @param {string} fileId The ID of the Google Drive file to load.
*/
async function loadGoogleDriveFileContent(fileId) {
    showStatusMessage("Loading character data from Google Drive...");
    try {
        const res = await gapi.client.drive.files.get({ fileId, alt: 'media' });
        const loadedData = JSON.parse(res.body);

        if (Array.isArray(loadedData)) {
            characters = loadedData.map(loadedChar => initLoadCharacter(loadedChar));
            currentCharacterIndex = 0;
        } else {
            characters = [initLoadCharacter(loadedData)];
            currentCharacterIndex = 0;
        }
        currentGoogleDriveFileId = fileId; // Set the current file ID
        updateDOM();
        populateCharacterSelector();
        showStatusMessage("Character data loaded from Google Drive!");
        console.log("Character data loaded from Google Drive!");
        historyStack = []; // Clear previous history
        historyPointer = -1; // Reset history pointer
        saveCurrentStateToHistory(); // Save the newly loaded state as the first history entry
        hasUnsavedChanges = false; // Data is now loaded and considered "saved"
        character.isDistributingStats = false; // Exit distribution mode on load
        updateRemainingPointsDisplay(); // Reset remaining points display
    } catch (error) {
        console.error('Error loading Google Drive file content:', error);
        showStatusMessage("Failed to load character data from Google Drive. Check console for details.", true);
    }
}

/**
* Toggles the visibility of a section and updates the button icon.
* @param {string} id The ID of the content div.
* @param {string} toggleClass The class of the toggle-{0}-bt
*/
function toggleHtml(id, toggleClass) {
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
        hasUnsavedChanges = true; // Mark that there are unsaved changes
    }
}

/**
* Toggles the visibility of a section and updates the button icon.
* @param {string} sectionId The ID of the section content div.
*/
function toggleSection(sectionId) {
    toggleHtml(sectionId, 'section');
}

/**
* @param {string} toggleClass The class of the toggle-{0}-bt
*/
function updateSpecificHtmlVisibility(toggleClass) {
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

/**
* Updates the visibility of all html based on the character's htmlVisibility data.
*/
function updateHtmlVisibility() {
    const htmlVisibility = ['section', 'container', 'element'];

    htmlVisibility.forEach(visibility => {
        updateSpecificHtmlVisibility(visibility);
    });
}

/**
* Toggles the visibility and width of the left sidebar.
*/
function toggleSidebar() {
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


function openTemporaryEffectsModal() {
    refreshTemporaryModalTitle();
    renderTemporaryEffects(currentStatForTempEffects);
    tempEffectsModal.classList.remove('hidden');
}

function refreshTemporaryModalTitle() {
    console.log("refresh");
    if (tempEffectsModalTitleStatTotal != "") {
        tempEffectsModalTitle.textContent = `Temporary Effects for ${currentStatDisplayNameForTempEffects} (${document.getElementById(tempEffectsModalTitleStatTotal).value})`;
    }
}

/**
 * Closes the temporary effects modal.
 */
function closeTemporaryEffectsModal() {
    tempEffectsModal.classList.add('hidden');
    currentStatForTempEffects = null;
    updateDOM(); // Re-render the main stats table to reflect any changes in totals
}

/**
 * Renders the list of temporary effects for the current stat in the modal.
 * @param {string} statName The name of the stat.
 */
function renderTemporaryEffects(statName) {
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

/**
* Adds a temporary effect to a specified character stat.
* @param {object} char The character object.
* @param {object} effect The effect object to add. Must contain 'value', 'statsAffected', 'type' ('+', '*'), and 'appliesTo' ('initial-value', 'base-value', 'total').
* @param {number} duration The duration of the effect in turns. Use Infinity for a permanent effect.
*/
function addTemporaryEffect(char, category, effect, duration) {
    if (effect.identifier)
        char.uniqueIdentifiers[effect.identifier] = effect;

    for (const statName of effect.statsAffected) {
        const stat = char[statName];
        if (!stat) {
            console.error(`Stat "${statName}" not found on character.`);
            return;
        }

        if (!stat.temporaryEffects) {
            stat.temporaryEffects = {};
        }

        // If the stat doesn't have a temporaryEffects array, initialize it
        if (!stat.temporaryEffects[category])
            stat.temporaryEffects[category] = [];

        // Add the effect with its duration
        stat.temporaryEffects[category].push({ ...effect,
            duration: duration
        });
    }
}

/**
 * Adds a new temporary effect to the current stat.
 */
function addManualTemporaryEffect() {
    if (currentStatForTempEffects) {
        // Initialize new effect with default type and appliesTo
        addTemporaryEffect(character, 'manual', { name: 'New Effect', statsAffected: [currentStatForTempEffects], values: [0], isPercent: false, duration: 1, type: '+', appliesTo: 'total' }, 1);
        renderTemporaryEffects(currentStatForTempEffects);
        // If the stat is Health, Mana, RacialPower, or totalDefense, recalculate its value
        if (currentStatForTempEffects === 'Health' || currentStatForTempEffects === 'Mana' || currentStatForTempEffects === 'RacialPower' || currentStatForTempEffects === 'totalDefense') {
            recalculateSmallUpdateCharacter(character, true);
        } else { // For rollStats, update their total
            document.getElementById(`${currentStatForTempEffects}-total`).value = calculateRollStatTotal(character, currentStatForTempEffects);
        }
        hasUnsavedChanges = true;
    }
}

/**
 * Removes a temporary effect from a stat.
 * @param {Event} event The click event from the remove button.
 */
function removeTemporaryEffect(event) {
    const statName = event.target.dataset.statName;
    const category =  event.target.dataset.category;
    const effectIndex = parseInt(event.target.dataset.effectIndex);

    if (statName && character[statName] && character[statName].temporaryEffects[category][effectIndex] !== undefined) {
        character[statName].temporaryEffects[category].splice(effectIndex, 1);
        renderTemporaryEffects(statName); // This will now preserve focus
        // If the stat is Health, Mana, RacialPower, or totalDefense, recalculate its value
        if (statName === 'Health' || statName === 'Mana' || statName === 'RacialPower' || statName === 'totalDefense') {
            recalculateSmallUpdateCharacter(character, true);
        } else { // For rollStats, update their total
            document.getElementById(`${statName}-total`).value = calculateRollStatTotal(character, statName);
        }
        hasUnsavedChanges = true;
    }
}

/**
 * Decrements the duration of all temporary buffs and removes expired ones.
 */
function endTurn() {
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
        // This includes rollStats, Health, Mana, RacialPower, and totalDefense
        const statsWithEffects = [...ExternalDataManager.rollStats, 'Health', 'Mana', 'RacialPower', 'totalDefense', 'naturalHealthRegen', 'naturalManaRegen', 'naturalRacialPowerRegen'];

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
        hasUnsavedChanges = true;

        if (effectsChanged) {
            showStatusMessage("Turn ended. Temporary effects updated.");
        } else {
            showStatusMessage("No temporary effects to update.", false);
        }
    });
}

function updatePanelPosition(panel, layout) {
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
function updatePanelsPosition() {
    const personalNotesPanel = document.getElementById('personal-notes-panel');
    updatePanelPosition(personalNotesPanel, character.layouts.personalNotes);
    const backstoryPanel = document.getElementById('backstory-content');
    updatePanelPosition(backstoryPanel, character.layouts.backstory);
}

function closeDamageModal() {
    takeDamageModal.classList.add("hidden");
}

function takeTrueDamage(value) {
    if (setHealthCheckbox.checked) {
        character.Health.value = Math.min(value, character.maxHealth);
    } else {
        character.Health.value = Math.max(0, character.Health.value - value);
    }
}

function takeDamage() {
    const value = parseInt(damageTakeAmountInput.value, 10);
    if (isNaN(value)) return alert("Please enter a valid number");

    if (setTakeTrueDamage.checked) {
        takeTrueDamage(value);
    } else if (character.uniqueIdentifiers['Clay Skin'] && character.RacialPower.value > 0) {
        let damage = value;

        if (setHealthCheckbox.checked) {
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

    healthInput.value = character.Health.value;
    manaInput.value = character.Mana.value;
    racialPowerInput.value = character.RacialPower.value;
    hasUnsavedChanges = true;
    closeDamageModal();
}


function isNotLocal() {
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

// Attach event listeners to all relevant input fields
function attachEventListeners() {
    // Attach listeners for standard inputs and the race selector
    const inputs = document.querySelectorAll(
        '#name, #level, #levelExperience, #race, #Health, #Mana, #RacialPower, #personalNotes, #total-defense, #backstory, #purse, #bank'
    ); // Added #total-defense, Removed #healthBonus
    inputs.forEach(input => {
        if (!input.readOnly) {
            input.addEventListener('input', handleChange);
        }
    });

    // Attach listeners for stat table inputs using delegation
    document.getElementById('player-stats-content').addEventListener('input', function (event) { // Changed to player-stats-content
        if (event.target.classList.contains('stat-input')) {
            handleChange(event);
        }
    });

    // Attach listeners for temporary effects buttons using delegation on main-content
    document.getElementById('main-content').addEventListener('click', function (event) {
        if (event.target.closest('.temp-effects-btn')) {
            const button = event.target.closest('.temp-effects-btn');
            const statName = button.dataset.statName;
            currentStatForTempEffects = statName;
            currentStatDisplayNameForTempEffects = button.dataset.statDisplayName;
            tempEffectsModalTitleStatTotal = button.dataset.statDisplayTotal;
            openTemporaryEffectsModal();
        }
    });


    // Attach event listener for the custom class display input to toggle dropdown
    document.getElementById('classes-display').addEventListener('click', toggleClassDropdown);
    document.getElementById('state-display').addEventListener('click', toggleStateDropdown);

    // Attach event listeners to the dynamically created class checkboxes (delegation)
    document.getElementById('classes-dropdown-options').addEventListener('change', function (event) {
        if (event.target.type === 'checkbox' && event.target.name === 'class-option') {
            handleClassCheckboxChange(event);
        }
    });

    document.getElementById('state-dropdown-options').addEventListener('change', function (event) {
        if (event.target.type === 'checkbox' && event.target.name === 'state-option') {
            handleStateCheckboxChange(event);
        }
    });

    // Attach event listener for the custom specializations display input to toggle dropdown
    document.getElementById('specializations-display').addEventListener('click', toggleSpecializationDropdown);

    // Attach event listeners to the dynamically created specializations checkboxes (delegation)
    document.getElementById('specializations-dropdown-options').addEventListener('change', function (event) {
        if (event.target.type === 'checkbox' && event.target.name === 'specializations-option') {
            handleSpecializationCheckboxChange(event);
        }
    });

    // Close dropdowns if clicked outside
    document.addEventListener('click', function (event) {
        const classDisplayInput = document.getElementById('classes-display');
        const classDropdownOptions = document.getElementById('classes-dropdown-options');
        const specializationDisplayInput = document.getElementById('specializations-display');
        const specializationDropdownOptions = document.getElementById('specializations-dropdown-options');
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


    // Attach event listener for the Quick Roll Stats button
    document.getElementById('quick-roll-stats-btn').addEventListener('click', quickRollStats);
    // Attach event listener for the Distribute Stats button
    document.getElementById('distribute-stats-btn').addEventListener('click', distributeStats);


    // Attach event listeners for Save/Load dropdown buttons and options
    document.getElementById('save-dropdown-btn').addEventListener('click', () => toggleDropdown('save-dropdown-menu'));
    document.getElementById('save-current-system-btn').addEventListener('click', saveCharacterToFile);
    document.getElementById('save-google-drive-btn').addEventListener('click', saveCharacterToGoogleDrive);

    document.getElementById('load-dropdown-btn').addEventListener('click', () => toggleDropdown('load-dropdown-menu'));
    document.getElementById('load-current-system-btn').addEventListener('click', () => {
        // Before triggering file input, check for unsaved changes
        if (hasUnsavedChanges) {
            showConfirmationModal("You have unsaved changes. Are you sure you want to load a new file without saving?", () => {
                document.getElementById('load-json-input').click(); // Trigger file input click
            });
        } else {
            document.getElementById('load-json-input').click(); // Trigger file input click
        }
    });
    document.getElementById('load-json-input').addEventListener('change', loadCharacterFromFile);
    document.getElementById('load-google-drive-btn').addEventListener('click', loadCharacterFromGoogleDrive);

    // Google Drive Auth buttons
    authorizeGoogleDriveButton.addEventListener('click', handleGoogleDriveAuthClick);
    signoutGoogleDriveButton.addEventListener('click', handleGoogleDriveSignoutClick);
    document.getElementById('close-google-drive-modal').addEventListener('click', () => googleDriveModal.classList.add('hidden'));

    // Temporary Effects Modal buttons
    addTempEffectBtn.addEventListener('click', addManualTemporaryEffect);
    document.getElementById('close-temp-effects-modal').addEventListener('click', closeTemporaryEffectsModal);

    // Attach event listener for the new End Turn button
    endTurnBtn.addEventListener('click', endTurn);


    // Attach event listeners for Personal Notes button and panel close button
    document.getElementById('toggle-notes-btn').addEventListener('click', togglePersonalNotesPanel);
    document.getElementById('close-notes-panel-btn').addEventListener('click', togglePersonalNotesPanel); // Changed ID

    // Attach event listeners for character selector and add button
    document.getElementById('character-selector').addEventListener('change', switchCharacter);
    document.getElementById('add-character-btn').addEventListener('click', addNewCharacter);

    // Attach listeners for Add Inventory buttons
    document.getElementById('add-weapon-btn').addEventListener('click', addWeapon);
    document.getElementById('add-armor-btn').addEventListener('click', addArmor);
    document.getElementById('add-general-item-btn').addEventListener('click', addGeneralItem);

    // Attach delegated event listeners for inventory table inputs and remove buttons
    // Use 'input' for text/number fields and 'change' for checkboxes
    document.getElementById('weapon-inventory-table').addEventListener('input', handleChange);
    document.getElementById('armor-inventory-table').addEventListener('input', handleChange);
    document.getElementById('general-inventory-table').addEventListener('input', handleChange);

    document.getElementById('weapon-inventory-table').addEventListener('change', handleChange); // For checkbox 'use'
    document.getElementById('armor-inventory-table').addEventListener('change', handleChange); // For checkbox 'equipped'

    document.getElementById('weapon-inventory-table').addEventListener('click', function (event) {
        const rollBtn = event.target.closest('[data-action="roll-weapon"]');
        if (rollBtn) {
            const index = parseInt(rollBtn.dataset.index, 10);
            rollWeaponAtIndex(index);
            return;
        }
        if (handleMagicElementClick(event)) return;
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(event);
        }
    });
    document.getElementById('armor-inventory-table').addEventListener('click', function (event) {
        const rollBtn = event.target.closest('[data-action="roll-armor"]');
        if (rollBtn) {
            const index = parseInt(rollBtn.dataset.index, 10);
            rollArmorAtIndex(index);
            return;
        }
        if (handleMagicElementClick(event)) return;
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(event);
        }
    });
    document.getElementById('general-inventory-table').addEventListener('click', function (event) {
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(event);
        }
    });

    // Cards view delegated event listeners
    const weaponCardsContainer = document.getElementById('weapon-inventory-cards-container');
    const armorCardsContainer = document.getElementById('armor-inventory-cards-container');

    if (weaponCardsContainer) {
        weaponCardsContainer.addEventListener('input', handleChange);
        weaponCardsContainer.addEventListener('change', handleChange);
        weaponCardsContainer.addEventListener('click', function(event) {
            const toggleCollapseBtn = event.target.closest('[data-action="toggle-card-collapse"]');
            if (toggleCollapseBtn) {
                const index = parseInt(toggleCollapseBtn.dataset.index, 10);
                if (character.weaponInventory[index]) {
                    character.weaponInventory[index].collapsed = !character.weaponInventory[index].collapsed;
                    renderWeaponCards();
                    hasUnsavedChanges = true;
                }
                return;
            }
            const rollBtn = event.target.closest('[data-action="roll-weapon"]');
            if (rollBtn) {
                const index = parseInt(rollBtn.dataset.index, 10);
                rollWeaponAtIndex(index);
                return;
            }
            if (handleMagicElementClick(event)) return;
            if (event.target.classList.contains('remove-item-btn')) {
                removeItem(event);
            }
        });
    }

    const rollAllWeaponsBtn = document.getElementById('roll-all-weapons-btn');
    if (rollAllWeaponsBtn) {
        rollAllWeaponsBtn.addEventListener('click', rollAllActiveWeapons);
    }

    const weaponToggleAllCardsBtn = document.getElementById('weapon-toggle-all-cards-btn');
    if (weaponToggleAllCardsBtn) {
        weaponToggleAllCardsBtn.addEventListener('click', () => {
            if (!character.weaponInventory || character.weaponInventory.length === 0) return;
            const allCollapsed = character.weaponInventory.every(item => item.collapsed);
            character.weaponInventory.forEach(item => { item.collapsed = !allCollapsed; });
            renderWeaponCards();
            hasUnsavedChanges = true;
        });
    }

    const rollAllArmorBtn = document.getElementById('roll-all-armor-btn');
    if (rollAllArmorBtn) {
        rollAllArmorBtn.addEventListener('click', rollAllEquippedArmor);
    }

    const armorToggleAllCardsBtn = document.getElementById('armor-toggle-all-cards-btn');
    if (armorToggleAllCardsBtn) {
        armorToggleAllCardsBtn.addEventListener('click', () => {
            if (!character.armorInventory || character.armorInventory.length === 0) return;
            const allCollapsed = character.armorInventory.every(item => item.collapsed);
            character.armorInventory.forEach(item => { item.collapsed = !allCollapsed; });
            renderArmorCards();
            hasUnsavedChanges = true;
        });
    }

    const rollTotalDefenseBtn = document.getElementById('roll-total-defense-btn');
    if (rollTotalDefenseBtn) {
        rollTotalDefenseBtn.addEventListener('click', rollAllEquippedArmor);
    }

    if (armorCardsContainer) {
        armorCardsContainer.addEventListener('input', handleChange);
        armorCardsContainer.addEventListener('change', handleChange);
        armorCardsContainer.addEventListener('click', function(event) {
            const toggleCollapseBtn = event.target.closest('[data-action="toggle-card-collapse"]');
            if (toggleCollapseBtn) {
                const index = parseInt(toggleCollapseBtn.dataset.index, 10);
                if (character.armorInventory[index]) {
                    character.armorInventory[index].collapsed = !character.armorInventory[index].collapsed;
                    renderArmorCards();
                    hasUnsavedChanges = true;
                }
                return;
            }
            const rollBtn = event.target.closest('[data-action="roll-armor"]');
            if (rollBtn) {
                const index = parseInt(rollBtn.dataset.index, 10);
                rollArmorAtIndex(index);
                return;
            }
            if (handleMagicElementClick(event)) return;
            if (event.target.classList.contains('remove-item-btn')) {
                removeItem(event);
            }
        });
    }

    const generalCardsContainer = document.getElementById('general-inventory-cards-container');
    if (generalCardsContainer) {
        generalCardsContainer.addEventListener('input', handleChange);
        generalCardsContainer.addEventListener('change', handleChange);
        generalCardsContainer.addEventListener('click', function(event) {
            const toggleCollapseBtn = event.target.closest('[data-action="toggle-card-collapse"]');
            if (toggleCollapseBtn) {
                const index = parseInt(toggleCollapseBtn.dataset.index, 10);
                if (character.generalInventory[index]) {
                    character.generalInventory[index].collapsed = !character.generalInventory[index].collapsed;
                    renderGeneralCards();
                    hasUnsavedChanges = true;
                }
                return;
            }
            if (event.target.classList.contains('remove-item-btn')) {
                removeItem(event);
            }
        });
    }

    const generalToggleAllCardsBtn = document.getElementById('general-toggle-all-cards-btn');
    if (generalToggleAllCardsBtn) {
        generalToggleAllCardsBtn.addEventListener('click', () => {
            if (!character.generalInventory || character.generalInventory.length === 0) return;
            const allCollapsed = character.generalInventory.every(item => item.collapsed);
            character.generalInventory.forEach(item => { item.collapsed = !allCollapsed; });
            renderGeneralCards();
            hasUnsavedChanges = true;
        });
    }

    // View Toggle button event listeners
    const weaponViewCardsBtn = document.getElementById('weapon-view-cards-btn');
    const weaponViewTableBtn = document.getElementById('weapon-view-table-btn');
    const armorViewCardsBtn = document.getElementById('armor-view-cards-btn');
    const armorViewTableBtn = document.getElementById('armor-view-table-btn');
    const generalViewCardsBtn = document.getElementById('general-view-cards-btn');
    const generalViewTableBtn = document.getElementById('general-view-table-btn');

    if (weaponViewCardsBtn) {
        weaponViewCardsBtn.addEventListener('click', () => setInventoryView('weapon', 'cards'));
    }
    if (weaponViewTableBtn) {
        weaponViewTableBtn.addEventListener('click', () => setInventoryView('weapon', 'table'));
    }
    if (armorViewCardsBtn) {
        armorViewCardsBtn.addEventListener('click', () => setInventoryView('armor', 'cards'));
    }
    if (armorViewTableBtn) {
        armorViewTableBtn.addEventListener('click', () => setInventoryView('armor', 'table'));
    }
    if (generalViewCardsBtn) {
        generalViewCardsBtn.addEventListener('click', () => setInventoryView('general', 'cards'));
    }
    if (generalViewTableBtn) {
        generalViewTableBtn.addEventListener('click', () => setInventoryView('general', 'table'));
    }

    // Attach event listeners for section toggle buttons - NEW
    document.querySelectorAll('.toggle-section-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetId = event.currentTarget.dataset.target;
            toggleSection(targetId);
        });
    });

    // Attach event listener for sidebar toggle button
    document.getElementById('sidebar-toggle-btn').addEventListener('click', toggleSidebar);

    // Attach event listeners for Reset and Delete buttons - NEW
    document.getElementById('reset-character-btn').addEventListener('click', resetCurrentCharacter);
    document.getElementById('new-file-btn').addEventListener('click', newFile);
    document.getElementById('delete-character-btn').addEventListener('click', deleteCurrentCharacter);
    // Attach event listener for Revert button
    document.getElementById('revert-character-btn').addEventListener('click', revertCurrentCharacter);
    // Attach event listener for Forward button
    document.getElementById('forward-character-btn').addEventListener('click', forwardCurrentCharacter);

    // Add the beforeunload event listener
    window.addEventListener('beforeunload', (event) => {
        if (hasUnsavedChanges) {
            // Cancel the event to trigger the browser's confirmation prompt
            event.preventDefault();
            // Chrome requires returnValue to be set
            event.returnValue = '';
            // Most browsers will display a generic message, but some older ones might show this:
            return "You have unsaved changes. Are you sure you want to exit?";
        }
    });

    // Add resize listener for the personal notes panel
    window.addEventListener('resize', updatePanelsPosition);

    takeDamageBtn.addEventListener("click", () => {
        damageTakeAmountInput.max = character.maxHealth;
        damageTakeAmountInput.value = "";
        setHealthCheckbox.checked = false;
        takeDamageModal.classList.remove("hidden");
    });

    closeTakeDamageModal.addEventListener("click", closeDamageModal);
    cancelTakeDamage.addEventListener("click", closeDamageModal);
    applyTakeDamage.addEventListener("click", takeDamage);
}

function initPage() {
    // Assign DOM elements to variables here, after the DOM is loaded
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
    tempEffectsModal = document.getElementById('temp-effects-modal');
    tempEffectsModalTitle = document.getElementById('temp-effects-modal-title');
    tempEffectsList = document.getElementById('temp-effects-list');
    addTempEffectBtn = document.getElementById('add-temp-effect-btn');
    endTurnBtn = document.getElementById('end-turn-btn');
    takeDamageBtn = document.getElementById("take-damage-btn");
    takeDamageModal = document.getElementById("take-damage-modal");
    closeTakeDamageModal = document.getElementById("close-take-damage-modal");
    cancelTakeDamage = document.getElementById("cancel-take-damage");
    applyTakeDamage = document.getElementById("apply-take-damage");
    setHealthCheckbox = document.getElementById("set-health-checkbox");
    setTakeTrueDamage = document.getElementById("set-take-true-damage-checkbox");
    damageTakeAmountInput = document.getElementById("take-damage-amount");
    healthInput = document.getElementById('Health');
    manaInput = document.getElementById('Mana');
    racialPowerInput = document.getElementById('RacialPower');


    characters = [defaultCharacterData()];
    // Initialize maxHealth, maxMana and maxRacialPower based on default race, level, and healthBonus for the first character
    recalculateCharacterDerivedProperties(characters[0]);

    populateRaceSelector();
    populateCharacterSelector(); // Populate the selector on load
    updateDOM();
    attachEventListeners(); // Attach event listeners after DOM is updated

    // Make the personal notes panel draggable and resizable
    const personalNotesPanel = document.getElementById('personal-notes-panel');
    const personalNotesHeader = document.querySelector('.personal-notes-header');
    const personalNotesResizer = document.getElementById("personalNotes-resizer");
    makeDraggable(personalNotesPanel, personalNotesHeader);
    makeResizable(personalNotesPanel, personalNotesResizer);

    const backstory = document.getElementById("backstory");
    const backstoryRezizer = document.getElementById("backstory-resizer");
    makeHeightResizable(backstory, backstoryRezizer);

    // Initialize Google API libraries
    gapiLoaded();
    gisLoaded();
    // Initial UI update for Google Drive buttons based on local storage and current token
    maybeEnableGoogleDriveButtons();

    // Save the initial state to history after everything is loaded and rendered
    saveCurrentStateToHistory();

    // Start automatically when the app loads
    startAutoHistorySaver();
}


window.addEventListener("gis-ready", () => {
    maybeEnableGoogleDriveButtons();
});

window.addEventListener("gapi-ready", () => {
    maybeEnableGoogleDriveButtons();
});

// Initialize the application when the DOM is fully loaded
window.onload = async function () {
    await ExternalDataManager.initClient();
    initPage();

    if (isNotLocal())
        history.pushState("", "NazaraxSheet", "../../Nazarax/Sheet/" + window.location.search);
}
