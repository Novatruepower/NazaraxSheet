import { ExternalDataManager } from '../externalDataManager.js';
import { character } from './state.js';
import { STAT_MAPPING, DEFAULT_STAT_MAX_EXPERIENCE } from './constants.js';

/**
 * Checks if an appliesTo target matches a specific property name.
 * Normalizes case and delimiters (e.g. 'maxExperience' vs 'max-experience', 'baseValue' vs 'base-value').
 */
export function isMatchingProperty(appliesTo, targetProperty) {
    if (!appliesTo || !targetProperty) return false;
    if (appliesTo === targetProperty) return true;

    const normalize = (str) => String(str).replace(/[-_]/g, '').toLowerCase();
    return normalize(appliesTo) === normalize(targetProperty);
}

export function getCategoriesTemporaryEffects(charData, statName) {
    let categoriesTemporaryEffects = [];
    const temporaryEffects = charData[statName].temporaryEffects;

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

    const effectToAdd = { ...effect, duration };
    if (!effectToAdd.type && effectToAdd.types && effectToAdd.types.length > 0) {
        effectToAdd.type = effectToAdd.types[0];
    }
    if (!effectToAdd.types && effectToAdd.type) {
        effectToAdd.types = [effectToAdd.type];
    }

    const statsAffected = effect.statsAffected || (effect.statAffected ? [effect.statAffected] : []);
    for (const statName of statsAffected) {
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
        stat.temporaryEffects[category].push(effectToAdd);
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
    if (!category) return;

    if (abilities && typeof abilities === 'object') {
        for (const ability of Object.values(abilities)) {
            if (ability.identifier) {
                delete character.uniqueIdentifiers[ability.identifier];
            }
        }
    }

    const allStats = [...ExternalDataManager.stats];
    allStats.forEach(statName => {
        if (character[statName]?.temporaryEffects?.[category]) {
            delete character[statName].temporaryEffects[category];
        }
    });
}

/**
 * Removes a specific temporary effect from all stats it affects, identified by a unique string.
 * This is optimized by first collecting all unique stats affected to avoid redundant searches.
 *
 * @param {object} abilityData The ability object containing an identifier and formulas.
 * @param {string} category The category of the temporary effect to remove.
 */
export function removeTemporaryEffectByIdentifier(abilityData, category) {
    const identifier = abilityData?.identifier || abilityData?.name;

    if (!identifier) {
        return;
    }

    if (character.uniqueIdentifiers && character.uniqueIdentifiers[identifier]) {
        delete character.uniqueIdentifiers[identifier];
    }

    const Stats = ExternalDataManager.stats;
    const allPossibleStats = new Set([
        ...Stats,
        ...(abilityData.formulas?.flatMap(f => f.statsAffected || []) ?? [])
    ]);

    for (const statName of allPossibleStats) {
        const effectsArray = character[statName]?.temporaryEffects?.[category];
        if (!Array.isArray(effectsArray)) {
            continue;
        }

        character[statName].temporaryEffects[category] = effectsArray.filter(
            e => e.identifier !== identifier && e.name !== identifier
        );
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

    if (effect.stats && effect.stats.length > 0) {
        const length = effect.stats.length;

        for (let index = 0; index < length; ++index) {
            const rawStat = charData[effect.stats[index]];
            let statVal = 0;
            if (typeof rawStat === 'number') {
                statVal = rawStat;
            } else if (rawStat && typeof rawStat === 'object') {
                statVal = rawStat.value ?? rawStat.total ?? rawStat.baseValue ?? 0;
            } else if (rawStat !== undefined && rawStat !== null) {
                statVal = parseFloat(rawStat) || 0;
            }

            if (effect.values && effect.values[index] !== undefined) {
                val += applyOperator(statVal, effect.types ? effect.types[index] : (effect.type || '+'), Number(effect.values[index]));
            } else {
                val += statVal;
            }
        }
    } else if (effect.values && effect.values.length > 0) {
        for (const value of effect.values) {
            val += parseFloat(value) || 0;
        }
    } else if (effect.value !== undefined && effect.value !== null) {
        val += parseFloat(effect.value) || 0;
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
    
    return applyPercent(charData, effect);
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
    else if (type === '-') {
        temporaryEffects.forEach(effect => {
            tempValue -= applyPercentOnBaseValue(charData, effect, baseValue);
        });
    }
    else if (type === '/') {
        temporaryEffects.forEach(effect => {
            const divisor = applyPercent(charData, effect);
            if (divisor !== 0) {
                tempValue /= divisor;
            }
        });
    }

    return tempValue;
}

export function applyTemporaryFilterEffects(charData, temporaryEffects, baseValue, currentValue, isTotal) {
    let tempValue = currentValue;
    const operators = isTotal ? ['*', '/', '+', '-'] : ['+', '-', '*', '/'];
    operators.forEach(type => {
        tempValue = applyTemporaryOperatorEffects(charData, temporaryEffects.filter(effect => (effect.type || effect.types?.[0]) === type), type, baseValue, tempValue);
    });
    
    return tempValue;
}

/**
 * Applies a list of temporary effects to a given base value.
 * Can target a specific property (e.g., 'maxExperience', 'baseValue', 'equipment') or use the default pipeline ('initial-value', 'base-value', 'total').
 * @param {object} charData The character object.
 * @param {number} baseValue The initial value to apply effects to.
 * @param {Array<object>} temporaryEffects An array of effect objects.
 * @param {string|null} targetProperty Optional specific property name to target (e.g. 'maxExperience', 'equipment', 'total').
 * @returns {number} The value after applying matching temporary effects.
 */
export function applyTemporaryEffects(charData, baseValue, temporaryEffects, targetProperty = null) {
    if (!temporaryEffects || !Array.isArray(temporaryEffects) || temporaryEffects.length === 0) {
        return parseFloat(baseValue) || 0;
    }

    let currentValue = parseFloat(baseValue) || 0;
    const baseFloatValue = currentValue;

    // When targeting a specific property (e.g. 'maxExperience', 'equipment', 'baseValue', 'total')
    if (targetProperty) {
        const matchingEffects = temporaryEffects.filter(effect => isMatchingProperty(effect.appliesTo, targetProperty));
        return applyTemporaryFilterEffects(charData, matchingEffects, baseFloatValue, currentValue, isMatchingProperty(targetProperty, 'total'));
    }

    // Default pipeline for stats when no specific property is targeted:
    // Only apply generic stat calculation stages ('initial-value', 'base-value', 'total')
    // and exclude property-specific effects like 'maxExperience' from polluting total calculation.
    const notTotalEffects = temporaryEffects.filter(effect => !isMatchingProperty(effect.appliesTo, 'total'));
    const totalEffects = temporaryEffects.filter(effect => isMatchingProperty(effect.appliesTo, 'total'));
    const appliesTo = ['initial-value', 'base-value'];
    appliesTo.forEach(applieTo => {
        currentValue = applyTemporaryFilterEffects(charData, notTotalEffects.filter(effect => isMatchingProperty(effect.appliesTo, applieTo)), baseFloatValue, currentValue, false);
    });

    currentValue = applyTemporaryFilterEffects(charData, totalEffects, baseFloatValue, currentValue, true);

    return currentValue;
}

/**
 * Applies temporary effects that target a specific property of a character's stat.
 * @param {object} charData The character object.
 * @param {string} statName The stat name (e.g. 'Strength', 'Health').
 * @param {string} propertyName The property name on the stat (e.g. 'maxExperience', 'equipment').
 * @param {number} baseValue The baseline value of the property.
 * @returns {number} The calculated property value after temporary effects.
 */
export function applyPropertyTemporaryEffects(charData, statName, propertyName, baseValue) {
    const effects = getCategoriesTemporaryEffects(charData, statName);
    return applyTemporaryEffects(charData, baseValue, effects, propertyName);
}

/**
 * Calculates maxExperience for a given stat, taking into account race abilities (like Human Growth)
 * and temporary/permanent effects targeting 'maxExperience'.
 * @param {object} char The character object.
 * @param {string} statName The name of the rollStat (e.g. 'Strength').
 * @param {number|null} baseMaxExperience Optional baseline maxExperience.
 * @returns {number} The final calculated maxExperience (minimum 1).
 */
export function calculateStatMaxExperience(char, statName, baseMaxExperience = null) {
    const effects = getCategoriesTemporaryEffects(char, statName);
    let base = baseMaxExperience;
    if (base === null || base === undefined) {
        base = DEFAULT_STAT_MAX_EXPERIENCE;
    }

    const modified = applyTemporaryEffects(char, base, effects, 'maxExperience');
    return Math.max(1, Math.round(modified));
}

/**
 * Generic calculation helper for any stat property.
 * @param {object} charData The character object.
 * @param {string} statName The name of the stat.
 * @param {string} propertyName The property to calculate (e.g. 'maxExperience', 'equipment', 'baseValue').
 * @param {number|null} baseValue Optional baseline value.
 * @returns {number}
 */
export function calculateStatProperty(charData, statName, propertyName, baseValue = null) {
    if (isMatchingProperty(propertyName, 'maxExperience')) {
        return calculateStatMaxExperience(charData, statName, baseValue);
    }

    let base = baseValue;
    if (base === null || base === undefined) {
        if (charData && charData[statName] && charData[statName][propertyName] !== undefined) {
            base = charData[statName][propertyName];
        } else {
            base = 0;
        }
    }

    return applyPropertyTemporaryEffects(charData, statName, propertyName, base);
}

export function calculateMaxTotal(charData, effects, level, initialValue, intermediateValue) {
    const effectsOnBaseValue = effects.filter(effect => isMatchingProperty(effect.appliesTo, 'base-value'));
    let baseValue = applyTemporaryEffects(charData, initialValue, effectsOnBaseValue);

    // Calculate the initial total based on the modified base value and level
    let currentTotal = baseValue * level + intermediateValue;

    // Apply effects on total
    const effectsOnTotal = effects.filter(effect => isMatchingProperty(effect.appliesTo, 'total'));
    return applyTemporaryEffects(charData, currentTotal, effectsOnTotal);
}

export function calculateBaseMaxHealth(charData, effects) {
    return calculateBaseMaxValue(charData, effects, 'Health');
}

export function calculateBaseMaxValue(charData, effects, valueName) {
    const baseValueName = `Base${valueName}`;
    const effectsOnInitialValue = effects.filter(effect => isMatchingProperty(effect.appliesTo, 'initial-value'));
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

    return Math.floor(calculateMaxTotal(charData, effects, level, calculateBaseMaxRacialPower(charData, effects), 0));
}

/**
 * Calculates the total defense for a character, including equipped armor and temporary effects.
 * @param {object} charData The character object.
 * @returns {number} The calculated total defense.
 */
export function calculateTotalDefense(charData) {
    const effects = getCategoriesTemporaryEffects(charData, 'totalDefense');
    const effectsOnInitialValue = effects.filter(effect => isMatchingProperty(effect.appliesTo, 'initial-value'));
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

/**
 * Calculates the total magic defense for a character and returns breakdown per equipped item and element.
 * @param {object} charData The character object.
 * @returns {object} Object with value, rawEquipmentTotal, byElement, and equippedList.
 */
export function calculateTotalMagicDefense(charData) {
    if (!charData.totalMagicDefense) {
        charData.totalMagicDefense = { value: 0, temporaryEffects: {} };
    }
    const effects = getCategoriesTemporaryEffects(charData, 'totalMagicDefense');
    const effectsOnInitialValue = effects.filter(effect => isMatchingProperty(effect.appliesTo, 'initial-value'));
    let baseMagicDefense = applyTemporaryEffects(charData, 0, effectsOnInitialValue);

    let totalMagDef = 0;
    const elementalTotals = {};
    const equippedMagicList = [];

    if (charData && charData.armorInventory) {
        charData.armorInventory.forEach(armor => {
            if (armor.equipped) {
                if (!armor.magicElements || !Array.isArray(armor.magicElements)) {
                    armor.magicElements = [];
                }
                if (armor.magicElements.length > 0) {
                    const itemElements = [];
                    armor.magicElements.forEach(me => {
                        const el = (me.element === 'Custom' ? me.customElementName : me.element) || 'Magic';
                        const magDefVal = me.rolledDefense !== undefined
                            ? (parseFloat(me.rolledDefense) || 0)
                            : (parseFloat(calculateFormula(me.defense || '0', false)) || 0);
                        totalMagDef += magDefVal;
                        elementalTotals[el] = (elementalTotals[el] || 0) + magDefVal;
                        itemElements.push({ element: el, value: magDefVal });
                    });
                    equippedMagicList.push({
                        armorName: armor.name || 'Unnamed Armor',
                        location: armor.location || 'Gear',
                        elements: itemElements
                    });
                }
            }
        });
    }

    baseMagicDefense += totalMagDef;
    const finalTotal = Math.floor(applyTemporaryEffects(charData, baseMagicDefense, effects));

    return {
        value: finalTotal,
        rawEquipmentTotal: totalMagDef,
        byElement: elementalTotals,
        equippedList: equippedMagicList
    };
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
    if (!stat) return 0;

    const effects = getCategoriesTemporaryEffects(char, statName);

    // Apply any effects targeting equipment directly
    let equipment = parseFloat(stat.equipment) || 0;
    equipment = applyTemporaryEffects(char, equipment, effects, 'equipment');

    // Apply any effects targeting baseValue directly
    let baseValue = parseFloat(stat.baseValue) || 0;
    baseValue = applyTemporaryEffects(char, baseValue, effects, 'baseValue');

    // Apply any effects targeting experienceBonus directly
    let expBonus = parseFloat(stat.experienceBonus) || 0;
    expBonus = applyTemporaryEffects(char, expBonus, effects, 'experienceBonus');

    let combinedValue = baseValue + expBonus;
    // Use getAppliedRacialChange to get the combined racial modifier (percentage change)
    const racialChange = getAppliedRacialChange(char, statName);

    const effectsOnInitialValue = effects.filter(effect => isMatchingProperty(effect.appliesTo, 'initial-value'));
    const baseStat = applyTemporaryEffects(char, combinedValue * racialChange, effectsOnInitialValue);

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