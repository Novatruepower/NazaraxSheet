import { DEFAULT_STAT_MAX_EXPERIENCE } from './constants.js';
import { character, historyPointer, historyStack } from './state.js';
import { ExternalDataManager } from '../externalDataManager.js';
import { calculateMaxHealth, calculateMaxMana, calculateMaxRacialPower, calculateTotalDefense, calculateRollStatTotal, calculateLevelMaxExperience } from './formulas.js';

function adjustValue(oldMaxValue, value, newMaxValue) {
    return value == oldMaxValue ? newMaxValue : Math.min(value, newMaxValue);
}

export function levelUp(levelExperience) {
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
export function recalculateSmallUpdateCharacter(char, isDisplay = false) {
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
        const maxHealthEl = document.getElementById('maxHealth');
        const healthInputEl = document.getElementById('Health');
        const maxManaEl = document.getElementById('maxMana');
        const manaInputEl = document.getElementById('Mana');
        const maxRacialPowerEl = document.getElementById('maxRacialPower');
        const racialPowerInputEl = document.getElementById('RacialPower');
        const totalDefenseEl = document.getElementById('total-defense');

        if (maxHealthEl) maxHealthEl.value = character.maxHealth;
        if (healthInputEl) healthInputEl.value = character.Health.value;
        if (maxManaEl) maxManaEl.value = character.maxMana;
        if (manaInputEl) manaInputEl.value = character.Mana.value;
        if (maxRacialPowerEl) maxRacialPowerEl.value = character.maxRacialPower;
        if (racialPowerInputEl) racialPowerInputEl.value = character.RacialPower.value;
        if (totalDefenseEl) totalDefenseEl.value = character.totalDefense.value;
    }
}

/**
 * Recalculates derived properties for a character.
 * This function updates the character's internal data, but does not directly update the DOM.
 * DOM updates should be handled by calling `updateDOM()` separately.
 * @param {object} char The character object to recalculate properties for.
 */
export function recalculateCharacterDerivedProperties(char, isSmallDisplay = false) {
    recalculateSmallUpdateCharacter(char, isSmallDisplay);

    let newMaxExperience = DEFAULT_STAT_MAX_EXPERIENCE;

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

// Function to update the enabled/disabled state of the history buttons
export function updateHistoryButtonsState() {
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