import { DEFAULT_STAT_MAX_EXPERIENCE, DEFAULT_RACIAL_POINT_SCALE, TOTAL_DISTRIBUTION_POINTS, MIN_STAT_VALUE, MAX_STAT_VALUE, MAX_HISTORY_LENGTH, STAT_MAPPING } from './modules/constants.js';
import { showStatusMessage, showConfirmationModal, toggleHtml, toggleSection, updateSpecificHtmlVisibility, updateHtmlVisibility, toggleSidebar, updateRemainingPointsDisplay, getCharacterStatesActive,
    updateStaticTempEffectsButton, highlightStatsWithActiveEffects, renderActiveEffectsSummary, removeSpecializationWarning, addremoveSpecializationWarning, renderSpecializations,
    updateSpecializationDropdownAndData, updateDOM
 } from './modules/uiUtils.js';
import { ExternalDataManager } from './externalDataManager.js';
import { characters, setCharacters, currentCharacterIndex, setCurrentCharacterIndex, currentGoogleDriveFileId, setCurrentGoogleDriveFileId, hasUnsavedChanges, setHasUnsavedChanges, inventoryViewSettings,
    historyStack, setHistoryStack, historyPointer, setHistoryPointer
 } from './modules/state.js';
import { maybeEnableGoogleDriveButtons, handleGoogleDriveAuthClickThenCall, handleGoogleDriveAuthClick, handleGoogleDriveSignoutClick } from './modules/googleDrive.js';
import { getCategoriesTemporaryEffects, calculateFormula, applyTemporaryOperatorEffects, applyTemporaryFilterEffects, applyTemporaryEffects,
    calculateMaxTotal, calculateBaseMaxHealth, calculateBaseMaxValue, calculateMaxHealth, calculateMaxMana, calculateMaxRacialPower, calculateTotalDefense,
    calculateRollStatTotal, getAppliedRacialChange, calculateLevelMaxExperience } from './modules/formulas.js'
import { renderRacial } from './modules/passivesActives.js'
import { levelUp, recalculateSmallUpdateCharacter, recalculateCharacterDerivedProperties, updateHistoryButtonsState } from './modules/characterState.js';
import { ensureMagicElements, renderWeaponCards, renderWeaponTable, renderEquippedSummaries , renderArmorTable, renderGeneralCards, setInventoryView  } from './modules/inventory.js';

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

// Generate a random number between min and max (inclusive)
function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
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

// Getter to easily access the current character
const character = new Proxy({}, {
    get: function (target, prop) {
        return characters[currentCharacterIndex][prop];
    },
    set: function (target, prop, value) {
        // Only set hasUnsavedChanges to true if the value actually changes
        if (characters[currentCharacterIndex][prop] !== value) {
            characters[currentCharacterIndex][prop] = value;
            setHasUnsavedChanges(true); // Mark that there are unsaved changes
        }

        // If the character name changes, update the selector
        if (prop === 'name') {
            populateCharacterSelector();
        }
        return true;
    }
});

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
    setHasUnsavedChanges(false); // Data is now saved
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
                        newChar[key].maxExperience = DEFAULT_STAT_MAX_EXPERIENCE;
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

    setHasUnsavedChanges(true);
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

    setHasUnsavedChanges(true);
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

    setHasUnsavedChanges(true);
    
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

    setHasUnsavedChanges(true);
    recalculateSmallUpdateCharacter(character, true);
    renderArmorTable();

    showToast(`Rolled all <strong>${equippedArmor.length}</strong> equipped armor items! Total defense updated.`, 'roll');
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
        setHasUnsavedChanges(true); // Mark that there are unsaved changes
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
        setHasUnsavedChanges(true);
    });
}

function updateRacialChange(oldRace, statName) {
    character[statName].racialChange -= ExternalDataManager.getRacialChange(oldRace, statName);
    character[statName].racialChange += ExternalDataManager.getRacialChange(character.race, statName);
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
      //  character.BaseRacialPower.value += DEFAULT_RACIAL_POINT_SCALE - character.uniqueIdentifiers['Spatial Reserve'].values[1];
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

    renderActiveEffectsSummary();
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
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
                setHasUnsavedChanges(true);
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
            setHasUnsavedChanges(true);
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
            setHasUnsavedChanges(true);
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
            setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true);
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
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

// Function to handle changes in the state checkboxes
function handleStateCheckboxChange(event) {
    const { value, checked } = event.target;

    character.states[value] = checked;

    // Update the displayed value in the input field
    document.getElementById('state-display').value = getCharacterStatesActive().join(', ');

    setHasUnsavedChanges(true); // Mark that there are unsaved changes
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
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
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
        setHasUnsavedChanges(true); // Mark that there are unsaved changes
    }
}
function saveHeightPositionAndSize(container) {
    if (container) {
        // Save position and size as percentages of the viewport
        character.layouts[container.id].height = container.offsetHeight / window.innerHeight;
        setHasUnsavedChanges(true); // Mark as unsaved
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
        setHasUnsavedChanges(true); // Mark as unsaved
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
function addNewCharacter() {
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

// Functions to add new items to inventories
function addWeapon() {
    character.weaponInventory.push({ name: '', type: '', material: '', requirement: '', requiredStat: '', accuracy: 100, damage: '', magicElements: [], effect: '', value: 0, use: false, originalDamage: '' });
    updateDOM(); // Re-render the inventory table
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

function addArmor() {
    character.armorInventory.push({ name: '', location: '', material: '', requirement: '', requiredStat: '', defense: 0, magicElements: [], effect: '', value: 0, equipped: false });
    updateDOM(); // Re-render the inventory table
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

function addGeneralItem() {
    character.generalInventory.push({ name: '', type: '', effect: '', accuracy: 0, amount: 0, valuePerUnit: 0 });
    updateDOM(); // Re-render the inventory table
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
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
    setHasUnsavedChanges(true); // Mark that there are unsaved changes
}

// Function to reset the current character to default data
function newFile() {
    showConfirmationModal(`Are you sure you want to make a new file? ${hasUnsavedChanges ? 'All unsaved data will be lost.': ''}`, () => {
        setCurrentGoogleDriveFileId(null);
        setCharacters([defaultCharacterData()]);
        setCurrentCharacterIndex(0);

        updateDOM(); // Update the UI with the new default character
        populateCharacterSelector(); // Re-populate the character selector with the single sheet

        setHistoryStack([]); // Clear history after a full reset
        setHistoryPointer(-1); // Reset history pointer
        setHasUnsavedChanges(false); // Reset unsaved changes flag after reset

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
        setHistoryStack([]); // Clear history after a full reset
        setHistoryPointer(-1); // Reset history pointer
        saveCurrentStateToHistory(); // Save the reset state as the first history entry
        setHasUnsavedChanges(false); // Reset unsaved changes flag after reset
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
                setCurrentCharacterIndex(characters.length - 1)
            }

            updateDOM();
            populateCharacterSelector(); // Re-populate selector after deletion
            showStatusMessage("Character deleted successfully!");
            setHistoryStack([]); // Clear history after deletion
            setHistoryPointer(-1); // Reset history pointer
            saveCurrentStateToHistory(); // Save the new state as the first history entry
            setHasUnsavedChanges(false); //Reset unsaved changes flag after deletion
            character.isDistributingStats = false; // Exit distribution mode on delete
            updateRemainingPointsDisplay(); // Reset remaining points display
        });
    }
}

/**
 * Apply a state from history.
 */
function applyHistoryState(state) {
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
function revertCurrentCharacter() {
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
function forwardCurrentCharacter() {
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
        setHasUnsavedChanges(false); // Data is now saved
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
            setCharacters(loadedData.map(loadedChar => initLoadCharacter(loadedChar)));
        } else {
            setCharacters([initLoadCharacter(loadedData)]);
        }
        setCurrentCharacterIndex(0);
        setCurrentGoogleDriveFileId(fileId); // Set the current file ID
        updateDOM();
        populateCharacterSelector();
        showStatusMessage("Character data loaded from Google Drive!");
        console.log("Character data loaded from Google Drive!");
        setHistoryStack([]); // Clear previous history
        setHistoryPointer(-1); // Reset history pointer
        saveCurrentStateToHistory(); // Save the newly loaded state as the first history entry
        setHasUnsavedChanges(false); // Data is now loaded and considered "saved"
        character.isDistributingStats = false; // Exit distribution mode on load
        updateRemainingPointsDisplay(); // Reset remaining points display
    } catch (error) {
        console.error('Error loading Google Drive file content:', error);
        showStatusMessage("Failed to load character data from Google Drive. Check console for details.", true);
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
        setHasUnsavedChanges(true);
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
        setHasUnsavedChanges(true);
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
        setHasUnsavedChanges(true);

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
    setHasUnsavedChanges(true);
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
                    setHasUnsavedChanges(true);
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
            setHasUnsavedChanges(true);
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
            setHasUnsavedChanges(true);
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
                    setHasUnsavedChanges(true);
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
                    setHasUnsavedChanges(true);
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
            setHasUnsavedChanges(true);
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


    setCharacters([defaultCharacterData()]);
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