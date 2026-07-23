import { ExternalDataManager } from '../externalDataManager.js';
import { character } from './state.js';
import { STAT_MAPPING } from './constants.js';

export function getCategoriesTemporaryEffects(charData, statName) {
    let categoriesTemporaryEffects = [];
    const temporaryEffects = charData[statName].temporaryEffects

    for (const category in temporaryEffects) {
        categoriesTemporaryEffects.push(...temporaryEffects[category]);
    }
    
    return categoriesTemporaryEffects;
}

/**
* Adds a temporary effect to a specified character stat.
* @param {object} char The character object.
* @param {object} effect The effect object to add. Must contain 'value', 'statsAffected', 'type' ('+', '*'), and 'appliesTo' ('initial-value', 'base-value', 'total').
* @param {number} duration The duration of the effect in turns. Use Infinity for a permanent effect.
*/
export function addTemporaryEffect(char, category, effect, duration) {
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
 * Removes all temporary effects of a specific category that are granted by a given set of abilities.
 * This is optimized by collecting all unique stats and identifiers first, then performing deletions.
 *
 * @param {object} abilities An object where keys are ability names and values are ability data objects.
 * @param {string} category The category of temporary effects to remove (e.g., 'race', 'class').
 */
export function removeTemporaryEffectByCategory(abilities, category) {
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

/**
 * Removes a specific temporary effect from all stats it affects, identified by a unique string.
 * This is optimized by first collecting all unique stats affected to avoid redundant searches.
 *
 * @param {object} abilityData The ability object containing an identifier and formulas.
 * @param {string} category The category of the temporary effect to remove.
 */
export function removeTemporaryEffectByIdentifier(abilityData, category) {
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

// Updated calculateFormula to perform regex replace using STAT_MAPPING and roll dice notations
export function calculateFormula(formulaString, rollDice = true) {
    if (typeof formulaString !== 'string') return formulaString != null ? formulaString : '';

    // Replace all mapped keys in the formula with actual values from the DOM
    let parsedFormula = formulaString;
    for (const label of Object.keys(STAT_MAPPING)) {
        const value = getStatValue(label);
        const regex = new RegExp(`\\b${label}\\b`, 'gi');
        parsedFormula = parsedFormula.replace(regex, value);
    }

    // Replace dice notations (e.g. 2d6, 1d4, d10) with actual random rolls or 0 if rollDice is false
    const diceRegex = /\b(\d*)d(\d+)\b/gi;
    parsedFormula = parsedFormula.replace(diceRegex, (match, countStr, sidesStr) => {
        if (!rollDice) return '0';
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

// Generate a random number between min and max (inclusive)
export function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function applyOperator(v1, type, v2) {
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

export function applyEffectValues(charData, effect) {
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


export function applyPercent(charData, effect) {
    let value = applyEffectValues(charData, effect);
    
    return effect.isPercent ? value / 100 : value;
}

export function applyPercentOnBaseValue(charData, effect, baseValue) {
    if (effect.isPercent)
        return baseValue * applyPercent(charData, effect);
    
    return parseFloat(effect.values[0]) || 0;
}

export function applyTemporaryOperatorEffects(charData, temporaryEffects, type, baseValue, currentValue) {
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

export function applyTemporaryFilterEffects(charData, temporaryEffects, baseValue, currentValue, isTotal) {
    let tempValue = currentValue;
    const operators = isTotal ? ['*', '+'] : ['+', '*'];
    operators.forEach(type => {
        tempValue = applyTemporaryOperatorEffects(charData, temporaryEffects.filter(effect => effect.type === type), type, baseValue, tempValue);
    });
    
    return tempValue;
}

/**
 * Applies a list of temporary effects to a given base value.
 * Additive effects are applied first, then multiplicative effects.
 * @param {number} baseValue The initial value to apply effects to.
 * @param {Array<object>} temporaryEffects An array of effect objects, each with 'value', 'type' ('add' or 'multiply').
 * @returns {number} The value after applying all temporary effects.
 */
export function applyTemporaryEffects(charData, baseValue, temporaryEffects) {
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

export function calculateMaxTotal(charData, effects, level, initialValue, intermediateValue) {
    const effectsOnBaseValue = effects.filter(effect => effect.appliesTo === 'base-value');
    let baseValue = applyTemporaryEffects(charData, initialValue, effectsOnBaseValue);

    // Calculate the initial total based on the modified base value and level
    let currentTotal = baseValue * level + intermediateValue;

    // Apply effects on total
    const effectsOnTotal = effects.filter(effect => effect.appliesTo === 'total');
    return applyTemporaryEffects(charData, currentTotal, effectsOnTotal);
}

export function calculateBaseMaxHealth(charData, effects) {
    return calculateBaseMaxValue(charData, effects, 'Health');
}

export function calculateBaseMaxValue(charData, effects, valueName) {
    const baseValueName = `Base${valueName}`;
    const effectsOnInitialValue = effects.filter(effect => effect.appliesTo === 'initial-value');
    let base = applyTemporaryEffects(charData, charData[baseValueName].value, effectsOnInitialValue);
    return base * charData[baseValueName].racialChange * charData[valueName].racialChange;
}

export function calculateMaxHealth(charData, level) {
    const effects = getCategoriesTemporaryEffects(charData, 'Health');
    return Math.floor(calculateMaxTotal(charData, effects, level, calculateBaseMaxHealth(charData, effects), 0));
}

export function calculateBaseMaxMana(charData, effects) {
    return calculateBaseMaxValue(charData, effects, 'Mana');
}

// Function to calculate max magic based on level
export function calculateMaxMana(charData, level) {
    const effects = getCategoriesTemporaryEffects(charData, 'Mana');

    return Math.floor(calculateMaxTotal(charData, effects, level, calculateBaseMaxMana(charData, effects), 0));
}


export function calculateBaseMaxRacialPower(charData, effects) {
    return calculateBaseMaxValue(charData, effects, 'RacialPower');
}

// Function to calculate max racial power based on level
export function calculateMaxRacialPower(charData, level) {
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
export function calculateTotalDefense(charData) {
    const effects = getCategoriesTemporaryEffects(charData, 'totalDefense');
    const effectsOnInitialValue = effects.filter(effect => effect.appliesTo === 'initial-value');
    let baseDefense = applyTemporaryEffects(charData, 0, effectsOnInitialValue);
    charData.armorInventory.forEach(armor => {
        if (armor.equipped) {
            let armorVal = 0;
            if (armor.rolledDefense !== undefined) {
                armorVal = parseFloat(armor.rolledDefense) || 0;
            } else {
                armorVal = parseFloat(calculateFormula(armor.defense || '0', false)) || 0;
            }
            baseDefense += armorVal;
        }
    });

    // For totalDefense, we don't have a 'level' multiplier like health/mana.
    // We apply effects directly to the sum of equipped armor defense.
    return Math.floor(applyTemporaryEffects(charData, baseDefense, effects));
}

export function getAppliedRacialChange(charData, statName) {
    if (ExternalDataManager.stats.includes(statName)) {
        return charData[statName].racialChange;
    }

    console.warn(`getAppliedRacialChange: Unhandled statName '${statName}'. Returning 0.`);
    return 0;
}

// Function to calculate the total for a given stat
export function calculateRollStatTotal(char, statName) {
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

// Function to calculate max experience for a given level
export function calculateLevelMaxExperience(char) {
    return char.uniqueIdentifiers['Self reflection'] ? char.uniqueIdentifiers['Self reflection'].values[0] : 100;
}

// Then use a function like this to fetch the actual value from the document
function getStatValue(statLabel) {
    const elementId = STAT_MAPPING[statLabel];
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

function safeEvaluate(text, chardata) {
    let string = text.trim().toLowerCase();

    for (const label of Object.keys(STAT_MAPPING)) {
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