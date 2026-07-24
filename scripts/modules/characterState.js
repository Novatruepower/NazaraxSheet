import { DEFAULT_STAT_MAX_EXPERIENCE, MIN_STAT_VALUE, MAX_STAT_VALUE, MAX_HISTORY_LENGTH, DEFAULT_RACIAL_POINT_SCALE } from './constants.js';
import { character, characters, setCharacters, currentCharacterIndex , setCurrentCharacterIndex, historyPointer, setHistoryPointer, historyStack, setHistoryStack, setCurrentGoogleDriveFileId,
    hasUnsavedChanges, setHasUnsavedChanges
 } from './state.js';
import { ExternalDataManager } from '../externalDataManager.js';
import { calculateMaxHealth, calculateMaxMana, calculateMaxRacialPower, calculateTotalDefense, calculateTotalMagicDefense, calculateRollStatTotal, calculateLevelMaxExperience, roll, getAppliedRacialChange } from './formulas.js';
import { ensureMagicElements, ensureRequiredStats, renderTotalMagicDefenseBreakdown } from './inventory.js';
import { updateDOM, showStatusMessage, renderActiveEffectsSummary, updateRemainingPointsDisplay, showConfirmationModal } from './uiUtils.js';
import { renderRacial, handleRevertChoices } from './passivesActives.js';

export const defaultCharacterData = function () {
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
        totalMagicDefense: { value: 0, temporaryEffects: {} }, // Initialize totalMagicDefense with temporaryEffects
        
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
            'active-temp-effects-content': true,
            'active-perm-effects-content': true,
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
            maxExperience: DEFAULT_STAT_MAX_EXPERIENCE
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

    // Recalculate totalDefense and totalMagicDefense
    char.totalDefense.value = calculateTotalDefense(char);
    if (!char.totalMagicDefense) {
        char.totalMagicDefense = { value: 0, temporaryEffects: {} };
    }
    const magicDefResult = calculateTotalMagicDefense(char);
    char.totalMagicDefense.value = magicDefResult.value;

    if (isDisplay) {
        levelUp(character.levelExperience);
        const maxHealthEl = document.getElementById('maxHealth');
        const healthInputEl = document.getElementById('Health');
        const maxManaEl = document.getElementById('maxMana');
        const manaInputEl = document.getElementById('Mana');
        const maxRacialPowerEl = document.getElementById('maxRacialPower');
        const racialPowerInputEl = document.getElementById('RacialPower');
        const totalDefenseEl = document.getElementById('total-defense');
        const totalMagicDefenseEl = document.getElementById('total-magic-defense');

        if (maxHealthEl) maxHealthEl.value = character.maxHealth;
        if (healthInputEl) healthInputEl.value = character.Health.value;
        if (maxManaEl) maxManaEl.value = character.maxMana;
        if (manaInputEl) manaInputEl.value = character.Mana.value;
        if (maxRacialPowerEl) maxRacialPowerEl.value = character.maxRacialPower;
        if (racialPowerInputEl) racialPowerInputEl.value = character.RacialPower.value;
        if (totalDefenseEl) totalDefenseEl.value = character.totalDefense.value;
        if (totalMagicDefenseEl) totalMagicDefenseEl.value = character.totalMagicDefense.value;
        renderTotalMagicDefenseBreakdown(character);
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

    if (isSmallDisplay) {
        renderActiveEffectsSummary();
    }
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

/**
 * Save current state into history.
 */
export function saveCurrentStateToHistory() {
    const currentState = convertSetsToArraysForSave(characters);

    // If not at end, cut off "future" states (redo branch)
    if (historyPointer < historyStack.length - 1) {
        setHistoryStack(historyStack.slice(0, historyPointer + 1));
    }

    // Avoid pushing duplicate states
    const lastState = historyStack[historyPointer];
    if (lastState && JSON.stringify(lastState) === JSON.stringify(currentState) && !hasUnsavedChanges) {
        updateHistoryButtonsState();
        return;
    }

    // Push new state
    historyStack.push(currentState);
    setHistoryPointer(historyPointer + 1);

    // Trim excess
    const excess = historyStack.length - MAX_HISTORY_LENGTH;
    if (excess > 0) {
        historyStack.splice(0, excess);
        setHistoryPointer(Math.max(historyPointer - excess, 0));
    }

    setHasUnsavedChanges(false);
    console.log("Saved state. Length:", historyStack.length, "Pointer:", historyPointer);
    updateHistoryButtonsState();
}

// --- AUTO HISTORY SAVER ---
let historySaveInterval = null;

export function startAutoHistorySaver() {
    if (historySaveInterval) return; // already running

    historySaveInterval = setInterval(() => {
        if (hasUnsavedChanges) {
            saveCurrentStateToHistory();
            console.log(historyPointer);
            console.log(historyStack.length);
        }
    }, 1000); // every 1 second
}

export function stopAutoHistorySaver() {
    if (historySaveInterval) {
        clearInterval(historySaveInterval);
        historySaveInterval = null;
    }
}

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
 * Prepares character data for saving by creating a deep copy and excluding calculated properties.
 * @param {Array<object>} chars The array of character objects to prepare.
 * @returns {Array<object>} A deep copy of the characters with calculated properties removed.
 */
export function prepareCharactersForSaving(chars) {
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
        delete char.totalMagicDefense;
    });

    console.log(charactersToSave);
    return charactersToSave;
}

// Function to save all character data to a JSON file (download)
export function saveCharacterToFile() {
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
    setHasUnsavedChanges(false); // Data is now saved
}

/*
* Initializes a new character object and merges loaded data into it.
* This function also handles recalculating derived stats and converting Sets.
* @param {object} loadedChar The character object loaded from a file or Google Drive.
* @returns {object} The fully initialized and merged character object.
*/
export function initLoadCharacter(loadedChar) {
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
                        newChar[key].maxExperience = DEFAULT_STAT_MAX_EXPERIENCE;
                    }

                    if (ExternalDataManager.rollStats.includes(key) || key === 'Health' || key === 'Mana' || key === 'RacialPower' || key === 'totalDefense' || key === 'totalMagicDefense') {
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

    // Initialize originalDamage/originalMagicDamage and requiredStats for weapons if not present
    newChar.weaponInventory.forEach(weapon => {
        if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
        if (typeof weapon.originalMagicDamage === 'undefined') weapon.originalMagicDamage = weapon.magicDamage;
        ensureMagicElements(weapon, 'weapon');
        ensureRequiredStats(weapon);
    });

    newChar.armorInventory.forEach(armor => {
        ensureMagicElements(armor, 'armor');
        ensureRequiredStats(armor);
    });

    // Convert arrays within StatsAffected back to Sets
    convertArraysToSetsAfterLoad([newChar]);

    recalculateCharacterDerivedProperties(newChar); // Recalculate all derived properties after loading

    return newChar;
}

export function populateCharacterSelector() {
    const selector = document.getElementById('character-selector');
    if (!selector) return;
    selector.innerHTML = '';

    characters.forEach((charData, index) => {
        const option = document.createElement('option');
        option.value = index;
        const displayName = charData.name && charData.name.trim() !== '' ? charData.name : `Character ${index + 1}`;
        option.textContent = displayName;
        selector.appendChild(option);
    });

    selector.value = currentCharacterIndex;
}

// Function to load character data from a JSON file (upload)
export function loadCharacterFromFile(event) {
    const file = event.target.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const loadedData = JSON.parse(e.target.result);

            if (Array.isArray(loadedData)) {
                setCharacters(loadedData.map(loadedChar => initLoadCharacter(loadedChar)));
            } else {
                // If a single character object was loaded (old format), convert it to an array
                setCharacters([initLoadCharacter(loadedData)]);
            }

            setCurrentCharacterIndex(0);
            updateDOM(); // Update the UI with loaded data
            populateCharacterSelector(); // Repopulate the selector
            setCurrentGoogleDriveFileId(null);
            showStatusMessage(`Character data loaded from JSON file!`);
            console.log(`Character data loaded from JSON file!`);
            setHistoryStack([]); // Clear previous history
            setHistoryPointer(-1); // Reset history pointer
            saveCurrentStateToHistory(); // Save the newly loaded state as the first history entry
            setHasUnsavedChanges(false); // Data is now loaded and considered "saved"
        } catch (e) {
            showStatusMessage("Error parsing JSON file.", true);
            console.error("Error parsing JSON file:", e);
        }
    };
    reader.readAsText(file);
}

function updateRacialChange(oldRace, statName) {
    character[statName].racialChange -= ExternalDataManager.getRacialChange(oldRace, statName);
    character[statName].racialChange += ExternalDataManager.getRacialChange(character.race, statName);
}

// Function to handle race change, updating racial characteristics
export function handleChangeRace(oldRace) {
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

    renderActiveEffectsSummary();
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

export function populateRaceSelector() {
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

// Function to switch to a different character
export function switchCharacter(event) {
    // Before switching, check for unsaved changes and prompt if necessary
    if (hasUnsavedChanges) {
        // Using a custom modal instead of confirm()
        showConfirmationModal("You have unsaved changes. Are you sure you want to switch characters without saving?", () => {
            setCurrentCharacterIndex(parseInt(event.target.value));
            updateDOM(); // Update the UI with the new character's data
            setHistoryStack([]); // Clear previous history
            setHistoryPointer(-1); // Reset history pointer
            saveCurrentStateToHistory(); // Save the new character's state as the first history entry
            setHasUnsavedChanges(false); // Reset unsaved changes flag after switching
            updateRemainingPointsDisplay(); // Reset remaining points display
        }, () => {
            // If user cancels, revert the dropdown selection
            event.target.value = currentCharacterIndex;
        });
    } else {
        setCurrentCharacterIndex(parseInt(event.target.value));
        updateDOM(); // Update the UI with the new character's data
        setHistoryStack([]); // Clear previous history
        setHistoryPointer(-1); // Reset history pointer
        saveCurrentStateToHistory(); // Save the new character's state as the first history entry
        updateRemainingPointsDisplay(); // Reset remaining points display
    }
}

// Function to add a new character sheet
export function addNewCharacter() {
    // Before adding, check for unsaved changes and prompt if necessary
    if (hasUnsavedChanges) {
        showConfirmationModal("You have unsaved changes. Are you sure you want to add a new character without saving?", () => {
            const newChar = defaultCharacterData();
            // Give a unique name to the new character
            newChar.name = `Character ${characters.length + 1}`;
            characters.push(newChar);
            setCurrentCharacterIndex(characters.length - 1); // Switch to the new character
            populateCharacterSelector(); // Update the dropdown
            updateDOM(); // Update the UI
            showStatusMessage(`Added new character: ${newChar.name}`);
            console.log(`Added new character: ${newChar.name}`);
            setHistoryStack([]); // Clear previous history
            setHistoryPointer(-1); // Reset history pointer
            saveCurrentStateToHistory(); // Save the new character's state as the first history entry
            setHasUnsavedChanges(false); // Reset unsaved changes flag after adding
            character.isDistributingStats = false; // Exit distribution mode when adding new character
            updateRemainingPointsDisplay(); // Reset remaining points display
        });
    } else {
        const newChar = defaultCharacterData();
        // Give a unique name to the new character
        newChar.name = `Character ${characters.length + 1}`;
        characters.push(newChar);
        setCurrentCharacterIndex(characters.length - 1); // Switch to the new character
        populateCharacterSelector(); // Update the dropdown
        updateDOM(); // Update the UI
        showStatusMessage(`Added new character: ${newChar.name}`);
        console.log(`Added new character: ${newChar.name}`);
        setHistoryStack([]); // Clear previous history
        setHistoryPointer(-1); // Reset history pointer
        saveCurrentStateToHistory(); // Save the new character's state as the first history entry
        character.isDistributingStats = false; // Exit distribution mode when adding new character
        updateRemainingPointsDisplay(); // Reset remaining points display
    }
}

/**
 * Apply a state from history.
 */
export function applyHistoryState(state) {
    setCharacters(JSON.parse(JSON.stringify(state)));
    convertArraysToSetsAfterLoad(characters);

    if (characters.length === 0) {
        characters.push(defaultCharacterData());
        setCurrentCharacterIndex(0);
    } else if (currentCharacterIndex >= characters.length) {
        setCurrentCharacterIndex(characters.length - 1)
    } else if (currentCharacterIndex < 0) {
        setCurrentCharacterIndex(0);
    }

    updateDOM();
    populateCharacterSelector();
    updateRemainingPointsDisplay();
    updateHistoryButtonsState();
}

/**
 * Undo (revert).
 */
export function revertCurrentCharacter() {
    if (historyPointer > 0) {
        setHistoryPointer(historyPointer - 1);
        const hasUnsavedChangesBeforeRevert = hasUnsavedChanges;
        setHasUnsavedChanges(false); // Temporarily disable unsaved changes flag to avoid prompt
        applyHistoryState(historyStack[historyPointer]);
        setHasUnsavedChanges(hasUnsavedChangesBeforeRevert); // Restore the unsaved changes flag
        showStatusMessage("Reverted to previous state.");
        console.log("Undo → Pointer:", historyPointer);
    } else {
        showStatusMessage("No previous state.", true);
    }
}

/**
 * Redo (forward).
 */
export function forwardCurrentCharacter() {
    if (historyPointer < historyStack.length - 1) {
        setHistoryPointer(historyPointer + 1);
        const hasUnsavedChangesBeforeRevert = hasUnsavedChanges;
        setHasUnsavedChanges(false); // Temporarily disable unsaved changes flag to avoid prompt
        applyHistoryState(historyStack[historyPointer]);
        setHasUnsavedChanges(hasUnsavedChangesBeforeRevert); // Restore the unsaved changes flag
        showStatusMessage("Moved forward to next state.");
        console.log("Redo → Pointer:", historyPointer);
    } else {
        showStatusMessage("No forward state.", true);
    }
}