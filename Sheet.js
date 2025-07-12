import { ExternalDataManager } from './ExternalDataManager.js';
let currentGoogleDriveFileId = null; // To store the ID of the currently loaded Google Drive file

const defaultStatMaxExperience = 7;

// Function to calculate max experience for a given level
function calculateLevelMaxExperience(level) {
    return 100;
}

function calculateBaseMaxHealth(charData) {
    return charData.BaseHealth.value * charData.BaseHealth.racialChange * charData.Health.racialChange;
}

// Function to calculate max health based on race, level, and bonus
function calculateMaxHealth(charData, level, healthBonus) {
    return Math.floor(calculateBaseMaxHealth(charData) * level) + (healthBonus || 0);
}

// Function to calculate max magic based on level
function calculateMaxMana(charData, level) {
    return Math.floor(100 * charData.Mana.racialChange * level);
}

// Function to calculate max racial power based on level
function calculateMaxRacialPower(level) {
    return level * 100;
}

// Generate a random number between min and max (inclusive)
function roll(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Default character data for creating new characters
const maxRollStat = 20;
const minRollStat = 6;

function adjustValue(oldMaxValue, value, newMaxValue) {
    return value == oldMaxValue ? newMaxValue : Math.min(value, newMaxValue);
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
    char.maxHealth = calculateMaxHealth(char, char.level, char.healthBonus);
    char.Health.value = adjustValue(oldMaxValue, char.Health.value, char.maxHealth);

    oldMaxValue = char.maxMana;
    char.maxMana = calculateMaxMana(char, char.level);
    char.Mana.value = adjustValue(oldMaxValue, char.Mana.value, char.maxMana);

    oldMaxValue = char.maxRacialPower;
    char.maxRacialPower = calculateMaxRacialPower(char.level);
    char.racialPower = adjustValue(oldMaxValue, char.racialPower, char.maxRacialPower);

    if (isDisplay) {
        document.getElementById('maxHealth').value = character.maxHealth;
        document.getElementById('Health').value = character.Health.value;
        document.getElementById('maxMana').value = character.maxMana;
        document.getElementById('Mana').value = character.Mana.value;
        document.getElementById('maxRacialPower').value = character.maxRacialPower;
        document.getElementById('racialPower').value = character.racialPower;
    }
}

/**
 * Recalculates derived properties for a character.
 * This function updates the character's internal data, but does not directly update the DOM.
 * DOM updates should be handled by calling `updateDOM()` separately.
 * @param {object} char The character object to recalculate properties for.
 */
function recalculateCharacterDerivedProperties(char) {
    recalculateSmallUpdateCharacter(char, false);

    // Recalculate totals for rollStats after any changes that might affect them (e.g., racial changes)
    ExternalDataManager.rollStats.forEach(statName => {
        if (char[statName]) {
            char[statName].total = calculateTotal(char, statName);
        }
    });
}

const defaultCharacterData = function () {
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
        // StatChoices: { category: { uniqueIdentifier: { slotId: { type, value?, statName?, level?, label?, unique? } } } }
        StatChoices: {},
        // StatsAffected: { category: { uniqueIdentifier: { statName: Set<string> } } }
        StatsAffected: {},

        naturalHealthRegenActive: false,
        naturalManaRegenActive: false,
        healthRegenDoubled: false,
        manaRegenDoubled: false,
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
        }
    });

    newCharacter['BaseHealth'].value = 100;
    recalculateCharacterDerivedProperties(newCharacter); // Calculate initial derived properties

    return newCharacter;
};

// Array to hold all character sheets
let characters = [];
// Index of the currently active character sheet
let currentCharacterIndex = 0;

// Flag to track if there are unsaved changes
let hasUnsavedChanges = false;

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
                for (const uniqueIdentifier in char.StatsAffected[category]) { // Changed from passiveName
                    for (const statName in char.StatsAffected[category][uniqueIdentifier]) { // Changed from passiveName
                        if (Array.isArray(char.StatsAffected[category][uniqueIdentifier][statName])) { // Changed from passiveName
                            char.StatsAffected[category][uniqueIdentifier][statName] = new Set(char.StatsAffected[category][uniqueIdentifier][statName]); // Changed from passiveName
                        }
                    }
                }
            }
        }
    });
}

// Function to push the current character's state to the history stack
function saveCurrentStateToHistory() {
    // Deep copy the entire characters array and convert Sets to Arrays for saving its state
    const currentState = convertSetsToArraysForSave(characters);

    // If the history pointer is not at the end, it means we reverted and are now making a new change.
    // In this case, discard all "future" states from the current pointer onwards.
    if (historyPointer < historyStack.length - 1) {
        historyStack.splice(historyPointer + 1);
    }

    // Only push if the current state is different from the last saved state
    if (historyStack.length === 0 || JSON.stringify(currentState) !== JSON.stringify(historyStack[historyStack.length - 1])) {
        historyStack.push(currentState);
        if (historyStack.length > MAX_HISTORY_LENGTH) {
            historyStack.shift(); // Remove the oldest state
        }
        historyPointer = historyStack.length - 1; // Update pointer to the new end
        console.log("State saved to history. History length:", historyStack.length, "Pointer:", historyPointer);
    }
    updateHistoryButtonsState(); // Update button states after saving
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


// Function to calculate the total for a given stat
function calculateTotal(char, statName) {
    const stat = char[statName];
    // Ensure values are treated as numbers, defaulting to 0 if NaN
    const value = parseFloat(stat.value) || 0;
    // Use getAppliedRacialChange to get the combined racial modifier (percentage change)
    const racialChange = getAppliedRacialChange(char, statName);
    const equipment = parseFloat(stat.equipment) || 0;
    const temporary = parseFloat(stat.temporary) || 0;

    return value * racialChange + equipment + temporary;
}

function getAppliedRacialChange(charData, statName) {
    if (ExternalDataManager._data.Stats.includes(statName)) {
        return charData[statName].racialChange;
    }

    console.warn(`getAppliedRacialChange: Unhandled statName '${statName}'. Returning 0.`);
    return 0;
}


// Then use a function like this to fetch the actual value from the document
function getStatValue(statLabel) {
    const elementId = statMapping[statLabel];
    if (!elementId) return '';
    const el = document.getElementById(elementId);
    if (!el) return '';
    return parseFloat(el.value) || 0;
}

// Updated calculateFormula to perform regex replace using statMapping
function calculateFormula(formulaString) {
    if (typeof formulaString !== 'string') return formulaString != null ? formulaString : '';

    // Replace all mapped keys in the formula with actual values from the DOM
    let parsedFormula = formulaString;
    for (const [label, id] of Object.entries(statMapping)) {
        const value = getStatValue(label);
        const regex = new RegExp(`\\b${label}\\b`, 'gi');
        parsedFormula = parsedFormula.replace(regex, value);
    }

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
        // Exclude calculated properties (maxHealth, maxMana, maxRacialPower, ac) from the saved data
        delete char.maxHealth;
        delete char.maxMana;
        delete char.maxRacialPower;
        delete char.ac;
    });
    return charactersToSave;
}

// Function to save all character data to a JSON file (download)
function saveCharacterToFile() {
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
            } else {
                newChar[key] = loadedChar[key];
            }
        }
    }

    // Handle section visibility - ensure all default sections are present
    newChar.sectionVisibility = { ...defaultCharacterData().sectionVisibility, ...loadedChar.sectionVisibility };

    // Initialize originalDamage/originalMagicDamage for weapons if not present
    newChar.weaponInventory.forEach(weapon => {
        if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
        if (typeof weapon.originalMagicDamage === 'undefined') weapon.originalMagicDamage = weapon.magicDamage;
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

// Function to update the DOM elements with the current character data
function updateDOM() {
    // Basic Info
    document.getElementById('name').value = character.name;
    document.getElementById('level').value = character.level;
    document.getElementById('levelExperience').value = character.levelExperience;
    document.getElementById('levelMaxExperience').value = character.levelMaxExperience; // This is readonly

    // Handle race selector placeholder color and update max Health
    const raceSelect = document.getElementById('race');
    raceSelect.value = character.race; // Set the selected race
    if (character.race === '') {
        raceSelect.classList.add('select-placeholder-text');
    } else {
        raceSelect.classList.remove('select-placeholder-text');
    }

    // Update derived properties and then update their DOM elements
    recalculateCharacterDerivedProperties(character);
    document.getElementById('maxHealth').value = character.maxHealth;
    document.getElementById('Health').value = character.Health.value;
    document.getElementById('maxMana').value = character.maxMana;
    document.getElementById('Mana').value = character.Mana.value;
    document.getElementById('maxRacialPower').value = character.maxRacialPower;
    document.getElementById('racialPower').value = character.racialPower;


    // Handle custom multi-select for class
    const classDisplayInput = document.getElementById('class-display');
    const classDropdownOptions = document.getElementById('class-dropdown-options');

    // Set the displayed value for classes
    classDisplayInput.value = character.class.join(', ');

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
               ${character.class.includes(className) ? 'checked' : ''}
           />
           <label for="class-${className.replace(/\s/g, '-')}" class="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">${className}</label>
       `;
        classDropdownOptions.appendChild(checkboxDiv);
    });

    // Update Specialization dropdown
    updateSpecializationDropdownAndData();

    // Render racial passives based on selected race
    renderRacialPassives();


    // Player Stats
    const playerStatsContainer = document.getElementById('player-stats-container').querySelector('tbody');
    playerStatsContainer.innerHTML = ''; // Clear existing rows

    ExternalDataManager.rollStats.forEach(statName => {
        const statData = character[statName];
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700'; // Add hover effect to rows
        row.innerHTML = `
           <td class="px-2 py-1 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">${statName}</td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-value" name="${statName}-value" min="0" value="${statData.value}" class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-racialChange" name="${statName}-racialChange" value="${getAppliedRacialChange(character, statName)}" readonly class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-equipment" name="${statName}-equipment" value="${statData.equipment}" class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-temporary" name="${statName}-temporary" value="${statData.temporary}" class="stat-input" />
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <div class="flex items-center justify-center exp-inputs-wrapper">
                   <input type="number" id="${statName}-experience" name="${statName}-experience" min="0" value="${statData.experience}" class="stat-input rounded-r-none" />
                   <span class="px-1 py-1 border-y border-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">/</span>
                   <input type="number" id="${statName}-maxExperience" name="${statName}-maxExperience" min="1" value="${statData.maxExperience}" readonly class="stat-input rounded-l-none" />
               </div>
           </td>
           <td class="px-2 py-1 whitespace-nowrap">
               <input type="number" id="${statName}-total" name="${statName}-total" value="${calculateTotal(character, statName)}" readonly class="stat-input" />
           </td>
       `;
        playerStatsContainer.appendChild(row);
    });


    // Health & Combat
    document.getElementById('healthBonus').value = character.healthBonus; // Populate the separate healthBonus input
    document.getElementById('ac').value = character.ac; // Populate total armor (readonly)
    document.getElementById('armorBonus').value = character.armorBonus; // Populate armor bonus


    // Skills
    document.getElementById('skills').value = character.skills;

    // Render new inventory tables
    renderInventoryTable('weapon', character.weaponInventory, '#weapon-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'type', type: 'text', class: 'w-full' },
        { field: 'material', type: 'text', class: 'w-full' },
        { field: 'requirement', type: 'text', class: 'w-full' },
        { field: 'requiredStat', type: 'text', class: 'w-full' },
        { field: 'accuracy', type: 'number', class: 'w-full' },
        { field: 'damage', type: 'textarea', class: 'w-full inventory-effect-textarea', getter: (item) => item.use ? calculateFormula(item.damage) : item.damage },
        { field: 'magicDamage', type: 'textarea', class: 'w-full inventory-effect-textarea', getter: (item) => item.use ? calculateFormula(item.magicDamage) : item.magicDamage },
        { field: 'magicType', type: 'text', class: 'w-full' },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'value', type: 'number', class: 'w-full' },
        { field: 'use', type: 'checkbox', class: null, checked: (item) => item.use }
    ]);
    renderInventoryTable('armor', character.armorInventory, '#armor-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'location', type: 'text', class: 'w-full' },
        { field: 'material', type: 'text', class: 'w-full' },
        { field: 'requirement', type: 'text', class: 'w-full' },
        { field: 'requiredStat', type: 'text', class: 'w-full' },
        { field: 'defense', type: 'number', class: 'w-full' },
        { field: 'magicDefense', type: 'number', class: 'w-full' },
        { field: 'magicType', type: 'text', class: 'w-full' },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'value', type: 'number', class: 'w-full' },
        { field: 'equipped', type: 'checkbox', class: null, checked: (item) => item.equipped }
    ]);
    renderInventoryTable('general', character.generalInventory, '#general-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'type', type: 'text', class: 'w-full' },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'accuracy', type: 'number', class: 'w-full' },
        { field: 'amount', type: 'number', class: 'w-full' },
        { field: 'valuePerUnit', type: 'number', class: 'w-full' }
    ]);


    // Update section visibility - NEW
    updateSectionVisibility();

    updateHistoryButtonsState(); // Update history button states after DOM update
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
 * - { field: string, type: string, class: string, getter?: function, checked?: function }
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
            } else {
                rowHtml += quickTd('input', col.type, false, inventoryType, col.field, index, value, col.class);
            }
        });

        // Add the remove button
        rowHtml += `<td><button type="button" data-inventory-type="${inventoryType}" data-index="${index}" class="remove-item-btn bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Remove</button></td>`;

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

// Function to perform a quick roll for all player stats
function quickRollStats() {
    ExternalDataManager.rollStats.forEach(statName => {
        character[statName].value = roll(minRollStat, maxRollStat); // Assign to the 'value' property

        // Recalculate total for the updated stat
        character[statName].total = calculateTotal(character, statName);

        // Update the DOM for value and total immediately
        document.getElementById(`${statName}-value`).value = character[statName].value;
        document.getElementById(`${statName}-total`).value = character[statName].total;
    });
    // Re-render weapon inventory to update calculated damage values
    renderInventoryTable('weapon', character.weaponInventory, '#weapon-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'type', type: 'text', class: 'w-full' },
        { field: 'material', type: 'text', class: 'w-full' },
        { field: 'requirement', type: 'text', class: 'w-full' },
        { field: 'requiredStat', type: 'text', class: 'w-full' },
        { field: 'accuracy', type: 'number', class: 'w-full' },
        { field: 'damage', type: 'textarea', class: 'w-full inventory-effect-textarea', getter: (item) => item.use ? calculateFormula(item.originalDamage) : item.originalDamage },
        { field: 'magicDamage', type: 'textarea', class: 'w-full inventory-effect-textarea', getter: (item) => item.use ? calculateFormula(item.originalMagicDamage) : item.originalMagicDamage },
        { field: 'magicType', type: 'text', class: 'w-full' },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'value', type: 'number', class: 'w-full' },
        { field: 'use', type: 'checkbox', class: null, checked: (item) => item.use }
    ]);
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

function updateRacialChange(oldRace, statName) {
    character[statName].racialChange -= ExternalDataManager.getRacialChange(oldRace, statName);
    character[statName].racialChange += ExternalDataManager.getRacialChange(character.race, statName);
}

// Revert stat changes
function revertChoiceRacialChange(char, statName, choice) {
    if (ExternalDataManager.stats.has(statName)) {
        if (choice.calc == "mult")
            char[statName].racialChange /= choice.value;
        else
            char[statName].racialChange -= choice.value;
    }
}

// Apply stat changes
function applyChoiceRacialChange(char, statName, value, calc) {
    if (ExternalDataManager.stats.has(statName)) {
        if (calc == "mult")
            char[statName].racialChange *= value;
        else
            char[statName].racialChange += value;
    }
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
            // Revert other specific flags if they were set by the previous choice
            if (choice.type === 'natural_regen_active') {
                char.naturalHealthRegenActive = false;
                char.naturalManaRegenActive = false;
            } else if (choice.type === 'regen_doubled') {
                char.healthRegenDoubled = false;
                char.manaRegenDoubled = false;
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
 * This function centralizes the logic for both Demi-human and Mutant choices.
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
            if (character.StatsAffected[category][uniqueIdentifier] && character.StatsAffected[category][uniqueIdentifier][previousChoice.statName]) {
                character.StatsAffected[category][uniqueIdentifier][previousChoice.statName].delete(slotId);
                if (character.StatsAffected[category][uniqueIdentifier][previousChoice.statName].size === 0) {
                    delete character.StatsAffected[category][uniqueIdentifier][previousChoice.statName];
                }
            }
        }
        // Revert other specific flags if they were set by the previous choice
        if (previousChoice.type === 'natural_regen_active') {
            character.naturalHealthRegenActive = false;
            character.naturalManaRegenActive = false;
        } else if (previousChoice.type === 'regen_doubled') {
            character.healthRegenDoubled = false;
            character.manaRegenDoubled = false;
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
            // Handle non-stat affecting choices (e.g., skill_choice, natural_regen_active, regen_doubled)
            if (newChoiceData.type === 'skill_choice') {
                showStatusMessage(`'${newChoiceData.label}' (Skill Choice) is not fully implemented yet.`, false);
            } else if (newChoiceData.type === 'natural_regen_active') {
                character.naturalHealthRegenActive = true;
                character.naturalManaRegenActive = true;
                showStatusMessage(`'${newChoiceData.label}' (Natural Regeneration Active) applied.`, false);
            } else if (newChoiceData.type === 'regen_doubled') {
                character.healthRegenDoubled = true;
                character.manaRegenDoubled = true;
                showStatusMessage(`'${newChoiceData.label}' (Regeneration Doubled) applied.`, false);
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
    saveCurrentStateToHistory();
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

    // Update racialChange for each stat based on the new race
    ExternalDataManager.rollStats.forEach(statName => {
        updateRacialChange(oldRace, statName);
        character[statName].total = calculateTotal(character, statName);
        document.getElementById(`${statName}-racialChange`).value = getAppliedRacialChange(character, statName); // Display raw number
        document.getElementById(`${statName}-total`).value = character[statName].total;
    });
    

    ExternalDataManager.otherStats.forEach(statName => {
        updateRacialChange(oldRace, statName);
    });

    // Update maxHealth, maxMana and maxRacialPower when race changes
    recalculateSmallUpdateCharacter(character, true);

    // Re-render the racial passives UI
    renderRacialPassives();

    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
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

/**
* Renders the UI for Demi-human specific stat choices.
* This function creates and updates the dropdowns for applying stat modifiers.
*/
function renderDemiHumanStatChoiceUI() {
    const demiHumanChoicesContainer = document.getElementById('racial-passives-container');
    if (!demiHumanChoicesContainer) return; // Ensure the container exists

    const demiHumanPassives = ExternalDataManager.getRaceManualPassives('Demi-humans');
    const category = 'Demi-humans';

    if (character.race === category && demiHumanPassives && demiHumanPassives['Stat Adjustments'] && demiHumanPassives['Stat Adjustments'].options) {
        const statAdjustmentsData = demiHumanPassives['Stat Adjustments'];

        demiHumanChoicesContainer.classList.remove('hidden');
        demiHumanChoicesContainer.innerHTML = `
           <h4 class="text-md font-semibold text-gray-800 dark:text-gray-200 mb-2">Demi-human Stat Adjustments</h4>
           <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${statAdjustmentsData.description}</p>
           <div id="demi-human-modifiers-list" class="space-y-3">
               <!-- Modifiers will be dynamically added here -->
           </div>
       `;

        const modifiersList = document.getElementById('demi-human-modifiers-list');

        // Ensure the nested structure exists for Demi-humans
        character.StatChoices[category] = character.StatChoices[category] || {};

        statAdjustmentsData.options.forEach((modifier, modIndex) => {
            const uniqueIdentifier = modifier.unique;
            character.StatChoices[category][uniqueIdentifier] = character.StatChoices[category][uniqueIdentifier] || {};
            character.StatsAffected[category] = character.StatsAffected[category] || {};
            character.StatsAffected[category][uniqueIdentifier] = character.StatsAffected[category][uniqueIdentifier] || {};

            for (let i = 0; i < modifier.count; i++) {
                const slotId = `demihuman-${modifier.type}-${modIndex}-${i}`; // Unique ID for each choice slot
                const currentChoice = character.StatChoices[category][uniqueIdentifier][slotId];
                const selectedStatName = currentChoice ? currentChoice.statName : '';

                const choiceDiv = document.createElement('div');
                choiceDiv.className = 'flex items-center space-x-2';
                choiceDiv.innerHTML = `
                   <label for="${slotId}" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-36">${modifier.label}</label>
                   <select id="${slotId}" class="stat-choice-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                       <option value="">-- Select a Stat --</option>
                   </select>
                   ${selectedStatName ? `<button type="button" data-choice-id="${slotId}" data-category="${category}" data-unique-identifier="${uniqueIdentifier}" class="clear-demi-human-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>` : ''}
               `;
                modifiersList.appendChild(choiceDiv);

                const selectElement = choiceDiv.querySelector(`#${slotId}`);
                modifier.applicableStats.forEach(statName => {
                    const option = document.createElement('option');
                    option.value = statName;
                    option.textContent = statName;
                    // Disable if already chosen by another slot within the same unique group, or if this is not the currently selected stat for this slot
                    //const isAlreadyChosen = character.StatsAffected[category][uniqueIdentifier] && character.StatsAffected[category][uniqueIdentifier][statName] && character.StatsAffected[category][uniqueIdentifier][statName].size > 0 && !character.StatsAffected[category][uniqueIdentifier][statName].has(slotId);
                    option.disabled = hasConflict(character, category, uniqueIdentifier, statName, slotId);
                    selectElement.appendChild(option);
                });
                selectElement.value = selectedStatName;

                // Add event listener
                selectElement.addEventListener('change', (e) => {
                    const newSelectedStatName = e.target.value;
                    const newChoiceData = newSelectedStatName ? {
                        type: modifier.type,
                        calc: modifier.calc,
                        value: modifier.value,
                        statName: newSelectedStatName,
                        label: modifier.label,
                        unique: modifier.unique // Pass the unique identifier
                    } : null;
                    processRacialChoiceChange(category, uniqueIdentifier, slotId, newChoiceData);
                });
            }
        });
    } else {
        demiHumanChoicesContainer.classList.add('hidden');
        demiHumanChoicesContainer.innerHTML = ''; // Clear content when hidden
    }
    attachClearChoiceListeners('.clear-demi-human-choice-btn'); // Attach listeners for clear buttons
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

/**
 * Renders the generic racial options for a specific ability within a race.
 * This function is called for each available choice slot (e.g., for each level-based choice).
 * @param {string} race The name of the race.
 * @param {string} abilityKey The key of the ability (e.g., 'Mutation', 'Degeneration').
 * @param {object} abilityData The data for the specific ability.
 * @param {string} category The category of the racial passive (usually the race name).
 * @param {Array}
 * @param {HTMLElement} abilitiesList The container element to append the choices to.
 * @param {number} indexLevel
 */
function renderGenericTagRacialPassive(race, category, abilityKey, abilityData, availableOptions, abilitiesList, indexLevel, tag) {
    const isLevelBased = abilityData.levels && Object.keys(abilityData.levels).length > 0;

    const newAvailableOptions = [];
    availableOptions.forEach(opt => {
        newAvailableOptions[opt.count || 0] ||= []; 
        newAvailableOptions[opt.count || 0].push(opt);
    });
    
    const indexes = Object.keys(newAvailableOptions);

    indexes.forEach(indexCount => {
        const options = newAvailableOptions[indexCount];
        const displayLevel = isLevelBased ? indexLevel + Number(indexCount) || 1 : '';
        const slotId = `${race}-${abilityKey}-${indexLevel}-${tag || 'none'}-${indexCount}`; // Unique ID for each choice slot

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
        const selectedOptionData = options.find(opt => opt.type === selectedOptionType); // Find the full option data
        const applicableStatsLength = selectedOptionData && selectedOptionData.applicableStats ? selectedOptionData.applicableStats.length : 0;
        const needsStatSelection = applicableStatsLength > 0;

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

        const choiceDiv = document.createElement('div');
        choiceDiv.className = 'flex flex-col space-y-1 p-2 border border-gray-200 dark:border-gray-700 rounded-md';

        let innerHTML = `
            <div class="flex items-center space-x-2">
                <label for="${slotId}-type" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">${abilityKey} ${displayLevel}:</label>
                <select id="${slotId}-type" class="${race}-choice-type-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                    <option value="">-- Select ${abilityKey} Type --</option>
        `;

        options.forEach(opt => {
            const isOptionDisabled = opt.applicableStats && !isUsableApplicableStats(opt.applicableStats, category, opt.unique, slotId);
            innerHTML += `<option value="${opt.type}" ${opt.type === selectedOptionType ? 'selected' : ''} ${isOptionDisabled ? 'disabled' : ''}>${opt.label}</option>`;
        });

        innerHTML +=
                `</select>
                    <button type="button" data-choice-id="${slotId}-type" data-category="${category}" data-unique-identifier="${currentUniqueIdentifier || ''}" class="clear-${race}-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>
            </div>
            ${statSelectionHtml}
        `;

        choiceDiv.innerHTML = innerHTML;
        abilitiesList.appendChild(choiceDiv);

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
                const newSelectedOptionData = options.find(opt => opt.type === newType);
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
                const currentSelectedOptionData = options.find(opt => opt.type === currentType); // Get the full option data
                const currentUniqueIdentifierForStat = currentSelectedOptionData ? currentSelectedOptionData.unique : null;

                processRacialChoiceChange(category, currentUniqueIdentifierForStat, slotId, initEventNewChoiceData(currentType, abilityData, indexLevel, currentSelectedOptionData, e.target.value, currentUniqueIdentifierForStat));
            });
        }
    });
}

/**
 * Renders the generic racial passives for races that don't have manual choices.
 * @param {string} race The name of the race.
 */
function renderGenericRacialPassives(race) {
    const genericPassivesContainer = document.getElementById('racial-passives-container');
    if (!genericPassivesContainer) return;

    const genericPassives = ExternalDataManager.getRaceManualPassives(race);
    const category = race;

    if (character.race === category && genericPassives) {
        genericPassivesContainer.classList.remove('hidden');
        genericPassivesContainer.innerHTML = `
           <h4 class="text-md font-semibold text-gray-800 dark:text-gray-200 mb-2">${race} Abilities</h4>
           <div id="${race}-abilities-list" class="space-y-4">
           </div>
       `;

        const abilitiesList = document.getElementById(`${race}-abilities-list`);
        const currentLevel = character.level;

        character.StatChoices[category] = character.StatChoices[category] || {};
        character.StatsAffected[category] = character.StatsAffected[category] || {};

        for (const abilityKey in genericPassives) {
            if (genericPassives.hasOwnProperty(abilityKey) && genericPassives[abilityKey].options) {
                const abilityData = genericPassives[abilityKey];
                const abilityDescription = document.createElement('p');
                abilityDescription.className = 'text-sm text-gray-600 dark:text-gray-400 mb-2';
                abilityDescription.textContent = abilityData.description;
                abilitiesList.appendChild(abilityDescription);

                //+1 and 2 because i start at 1
                const maxChoices = abilityData.levels ? getAvailablePoints(abilityData, currentLevel) : 1;
                let countLevel = 0;

                for (let i = 0; i < maxChoices; ++i) {
                    const usedNullSetOptions = new Set();
                    const usedSetOptions = new Set();
                    let availableOptions = [];
                    do {
                        availableOptions = abilityData.options.filter(opt => {
                            if (!opt.setsOption) return usedNullSetOptions.has(opt);
                            return opt.setsOption.some(tag => !usedSetOptions.has(tag));
                        });

                        if (availableOptions.length === 0) {
                            break;
                        }

                        const nextOption = availableOptions[0];
                        const tagToPass = nextOption.setsOption ? nextOption.setsOption.find(tag => !usedSetOptions.has(tag)) : undefined;

                        renderGenericTagRacialPassive(race, category, abilityKey, abilityData, availableOptions, abilitiesList, countLevel, tagToPass);

                        if (tagToPass)
                            usedSetOptions.add(tagToPass);
                        else
                            usedNullSetOptions.add(nextOption);

                        ++countLevel;
                    } while(availableOptions.length > 0);
                }
            }
        }

    } else {
        genericPassivesContainer.classList.add('hidden');
        genericPassivesContainer.innerHTML = '';
    }
    attachClearChoiceListeners(`.clear-${race}-choice-btn`);
}

/**
* Orchestrates the rendering of all racial passive sections based on the current race.
*/
function renderRacialPassives() {
    // Hide all specific containers first
    document.getElementById('racial-passives-container').classList.add('hidden');

    // Then render the appropriate one
    if (character.race === 'Demi-humans') {
        renderDemiHumanStatChoiceUI();
   // } else if (character.race === 'Mutant') {
   //     renderMutantOptionUI();
    } else {
        renderGenericRacialPassives(character.race);
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

    const inventory = character[`${inventoryType}Inventory`];
    if (!inventory || !inventory[itemIndex]) return;

    if (field === 'use' || field === 'equipped') { // Handle checkboxes
        inventory[itemIndex][field] = checked;
        if (inventoryType === 'weapon' && field === 'use') {
            if (checked) {
                // Store original values before applying formula
                inventory[itemIndex].originalDamage = inventory[itemIndex].originalDamage || inventory[itemIndex].damage;
                inventory[itemIndex].originalMagicDamage = inventory[itemIndex].originalMagicDamage || inventory[itemIndex].magicDamage;
                // Apply default formulas (can be customized)
                inventory[itemIndex].damage = calculateFormula(inventory[itemIndex].originalDamage);
                inventory[itemIndex].magicDamage = calculateFormula(inventory[itemIndex].originalMagicDamage);
            } else {
                // Restore original values
                inventory[itemIndex].damage = inventory[itemIndex].originalDamage;
                inventory[itemIndex].magicDamage = inventory[itemIndex].originalMagicDamage;
            }
            // Re-render weapon inventory to show calculated/restored values
            renderInventoryTable('weapon', character.weaponInventory, '#weapon-inventory-table tbody', [
                { field: 'name', type: 'text', class: 'w-full' },
                { field: 'type', type: 'text', class: 'w-full' },
                { field: 'material', type: 'text', class: 'w-full' },
                { field: 'requirement', type: 'text', class: 'w-full' },
                { field: 'requiredStat', type: 'text', class: 'w-full' },
                { field: 'accuracy', type: 'number', class: 'w-full' },
                { field: 'damage', type: 'textarea', class: 'w-full inventory-effect-textarea', getter: (item) => item.use ? calculateFormula(item.originalDamage) : item.originalDamage },
                { field: 'magicDamage', type: 'textarea', class: 'w-full inventory-effect-textarea', getter: (item) => item.use ? calculateFormula(item.originalMagicDamage) : item.originalMagicDamage },
                { field: 'magicType', type: 'text', class: 'w-full' },
                { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
                { field: 'value', type: 'number', class: 'w-full' },
                { field: 'use', type: 'checkbox', class: null, checked: (item) => item.use }
            ]);
        }
    } else if (type === 'number' && field !== 'damage' && field !== 'magicDamage') { // Exclude damage/magicDamage from number parsing for weapons
        inventory[itemIndex][field] = parseFloat(value) || 0;
    } else {
        // For text fields (including damage/magicDamage which can be formulas)
        inventory[itemIndex][field] = value;
    }
}

/**
 * Handles input changes for player stats.
 * @param {Event} event The input event.
 */
function handlePlayerStatInputChange(event) {
    const { name, value, type } = event.target;
    let newValue = (type === 'number') ? (parseFloat(value) || 0) : value;

    let statName = '';
    let subProperty = '';

    for (const stat of ExternalDataManager.rollStats) {
        if (name.startsWith(`${stat}-`)) {
            statName = stat;
            subProperty = name.substring(stat.length + 1);
            break;
        }
    }

    if (!statName) return; // Not a player stat input

    if (subProperty === 'experience') {
        character[statName].experience = newValue;
        while (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
            character[statName].value++;
            character[statName].experience -= character[statName].maxExperience;
        }
        document.getElementById(`${statName}-value`).value = character[statName].value;
        document.getElementById(`${statName}-experience`).value = character[statName].experience;
    } else if (subProperty === 'maxExperience') {
        character[statName].maxExperience = Math.max(1, newValue);
        document.getElementById(`${statName}-maxExperience`).value = character[statName].maxExperience;
        while (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
            character[statName].value++;
            character[statName].experience -= character[statName].maxExperience;
        }
        document.getElementById(`${statName}-value`).value = character[statName].value;
        document.getElementById(`${statName}-experience`).value = character[statName].experience;
    } else {
        character[statName][subProperty] = newValue;
    }

    character[statName].total = calculateTotal(character, statName);
    document.getElementById(`${statName}-total`).value = character[statName].total;
    renderInventoryTable('weapon', character.weaponInventory, '#weapon-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'type', type: 'text', class: 'w-full' },
        { field: 'material', type: 'text', class: 'w-full' },
        { field: 'requirement', type: 'text', class: 'w-full' },
        { field: 'requiredStat', type: 'text', class: 'w-full' },
        { field: 'accuracy', type: 'number', class: 'w-full' },
        { field: 'damage', type: 'textarea', class: 'w-full inventory-effect-textarea', getter: (item) => item.use ? calculateFormula(item.originalDamage) : item.originalDamage },
        { field: 'magicDamage', type: 'textarea', class: 'w-full inventory-effect-textarea', getter: (item) => item.use ? calculateFormula(item.originalMagicDamage) : item.originalMagicDamage },
        { field: 'magicType', type: 'text', class: 'w-full' },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'value', type: 'number', class: 'w-full' },
        { field: 'use', type: 'checkbox', class: null, checked: (item) => item.use }
    ]);
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
                        // Revert other specific flags if they were set by the previous choice
                        if (choice.type === 'natural_regen_active') {
                            character.naturalHealthRegenActive = false;
                            character.naturalManaRegenActive = false;
                        } else if (choice.type === 'regen_doubled') {
                            character.healthRegenDoubled = false;
                            character.manaRegenDoubled = false;
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
    } else if (event.target.classList.contains('stat-input')) {
        handlePlayerStatInputChange(event);
    } else {
        newValue = (type === 'number') ? (parseFloat(value) || 0) : value;

        if (id === 'levelExperience') {
            character.levelExperience = newValue;
            while (character.levelExperience >= character.levelMaxExperience) {
                character.level++;
                character.levelExperience -= character.levelMaxExperience;
                character.levelMaxExperience = calculateLevelMaxExperience(character.level);
            }
            document.getElementById('level').value = character.level;
            document.getElementById('levelMaxExperience').value = character.levelMaxExperience;
            document.getElementById('levelExperience').value = character.levelExperience;
        } else if (id === 'level') {
            const oldLevel = character.level;
            character.level = newValue;
            character.levelMaxExperience = calculateLevelMaxExperience(character.level);
            document.getElementById('levelMaxExperience').value = character.levelMaxExperience;
            if (newValue < oldLevel)
                removePassivesLevel();
            recalculateCharacterDerivedProperties(character);
            renderRacialPassives();
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
            document.getElementById('Health').value = character.Health.value;
        } else if (id === 'Mana') {
            character.Mana.value = Math.min(newValue, character.maxMana);
            document.getElementById('Mana').value = character.Mana.value;
        } else if (id === 'racialPower') {
            character.racialPower = Math.min(newValue, character.maxRacialPower);
            document.getElementById('racialPower').value = character.racialPower;
        } else if (id === 'healthBonus') {
            character.healthBonus = newValue;
            recalculateCharacterDerivedProperties(character);
            document.getElementById('maxHealth').value = character.maxHealth;
            document.getElementById('Health').value = character.Health.value;
        } else if (id === 'armorBonus') {
            character.armorBonus = newValue;
            recalculateCharacterDerivedProperties(character);
            document.getElementById('ac').value = character.ac;
        } else if (id === 'personalNotes') {
            character.personalNotes = newValue;
        } else if (id !== 'class-display' && id !== 'specialization-display') {
            character[name || id] = newValue;
        }
    }
    hasUnsavedChanges = true;
    saveCurrentStateToHistory();
}

// Function to toggle the visibility of the class dropdown options
function toggleClassDropdown() {
    const dropdown = document.getElementById('class-dropdown-options');
    dropdown.classList.toggle('hidden');
}

// Function to toggle the visibility of the specialization dropdown options
function toggleSpecializationDropdown() {
    const dropdown = document.getElementById('specialization-dropdown-options');
    dropdown.classList.toggle('hidden');
}

// Function to handle changes in the class checkboxes
function handleClassCheckboxChange(event) {
    const { value, checked } = event.target;

    if (checked) {
        if (!character.class.includes(value)) {
            character.class.push(value);
        }
    } else {
        character.class = character.class.filter(c => c !== value);
    }
    // Update the displayed value in the input field
    document.getElementById('class-display').value = character.class.join(', ');

    // After class changes, update specialization dropdown
    updateSpecializationDropdownAndData();
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

// Function to handle changes in the specialization checkboxes
function handleSpecializationCheckboxChange(event) {
    const { value, checked } = event.target;

    if (checked) {
        if (!character.specialization.includes(value)) {
            character.specialization.push(value);
        }
    } else {
        character.specialization = character.specialization.filter(s => s !== value);
    }
    // Update the displayed value in the input field
    document.getElementById('specialization-display').value = character.specialization.join(', ');
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

// Function to update the specialization dropdown options and filter selected specializations
function updateSpecializationDropdownAndData() {
    const specializationDisplayInput = document.getElementById('specialization-display');
    const specializationDropdownOptions = document.getElementById('specialization-dropdown-options');

    // 1. Determine available specializations based on selected classes
    const availableSpecializationsSet = new Set();
    character.class.forEach(selectedClass => {
        const specs = ExternalDataManager.getClassSpecs(selectedClass);
        if (specs) {
            specs.forEach(spec => availableSpecializationsSet.add(selectedClass + "→" + spec));
        }
    });
    const availableSpecializations = Array.from(availableSpecializationsSet).sort();

    // 2. Filter character.specialization to keep only valid ones
    character.specialization = character.specialization.filter(spec => availableSpecializations.includes(spec));

    // 3. Update the displayed value for specializations
    specializationDisplayInput.value = character.specialization.join(', ');

    // 4. Populate and update checkboxes in the dropdown options
    specializationDropdownOptions.innerHTML = ''; // Clear existing options
    if (availableSpecializations.length === 0) {
        specializationDropdownOptions.innerHTML = '<div class="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">No specializations available for selected classes.</div>';
    } else {
        availableSpecializations.forEach(specName => {
            const checkboxDiv = document.createElement('div');
            checkboxDiv.className = 'flex items-center px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-md';
            checkboxDiv.innerHTML = `
               <input
                   type="checkbox"
                   id="specialization-${specName.replace(/\s/g, '-')}"
                   name="specialization-option"
                   value="${specName}"
                   class="form-checkbox h-4 w-4 text-indigo-600 dark:text-indigo-400 rounded border-gray-300 dark:border-gray-600 focus:ring-indigo-500"
                   ${character.specialization.includes(specName) ? 'checked' : ''}
               />
               <label for="specialization-${specName.replace(/\s/g, '-')}" class="ml-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">${specName}</label>
           `;
            specializationDropdownOptions.appendChild(checkboxDiv);
        });
    }
}

// Function to toggle the personal notes panel visibility
function togglePersonalNotesPanel() {
    const notesPanel = document.getElementById('personal-notes-panel');
    const personalNotesTextarea = document.getElementById('personalNotes');

    if (notesPanel.classList.contains('hidden')) {
        // Show panel: populate textarea with current notes
        personalNotesTextarea.value = character.personalNotes;
        notesPanel.classList.remove('hidden');
    } else {
        // Hide panel: save textarea content to character data
        character.personalNotes = personalNotesTextarea.value;
        notesPanel.classList.add('hidden');
        hasUnsavedChanges = true; // Mark that there are unsaved changes
        saveCurrentStateToHistory(); // Save state after modification
    }
}

// Draggable functionality for the personal notes panel
function makeDraggable(element, handle) {
    let isDragging = false;
    let currentX;
    let currentY;
    let initialX;
    let initialY;
    let xOffset = 0;
    let yOffset = 0;

    handle.addEventListener("mousedown", dragStart);

    function dragStart(e) {
        initialX = e.clientX - xOffset;
        initialY = e.clientY - yOffset;

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
            currentX = e.clientX - initialX;
            currentY = e.clientY - initialY;

            xOffset = currentX;
            yOffset = currentY;

            element.style.transform = `translate3d(${currentX}px, ${currentY}px, 0)`;
        }
    }

    function dragEnd(e) {
        initialX = currentX;
        initialY = currentY;
        isDragging = false;
        element.style.cursor = 'grab';
        document.removeEventListener("mousemove", drag);
        document.removeEventListener("mouseup", dragEnd);
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
    }
}

// Functions to add new items to inventories
function addWeapon() {
    character.weaponInventory.push({ name: '', type: '', material: '', requirement: '', requiredStat: '', accuracy: 100, damage: '', magicDamage: '', magicType: '', effect: '', value: 0, use: false, originalDamage: '', originalMagicDamage: '' }); // 'use' is now boolean
    updateDOM(); // Re-render the inventory table
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

function addArmor() {
    character.armorInventory.push({ name: '', location: '', material: '', requirement: '', requiredStat: '', defense: 0, magicDefense: 0, magicType: '', effect: '', value: 0, equipped: false });
    updateDOM(); // Re-render the inventory table
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

function addGeneralItem() {
    character.generalInventory.push({ name: '', type: '', effect: '', accuracy: 0, amount: 0, valuePerUnit: 0 });
    updateDOM(); // Re-render the inventory table
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

// Function to remove an item from inventory
function removeItem(event) {
    const inventoryType = event.target.dataset.inventoryType;
    const index = parseInt(event.target.dataset.index);

    if (inventoryType === 'weapon') {
        character.weaponInventory.splice(index, 1);
    } else if (inventoryType === 'armor') {
        character.armorInventory.splice(index, 1);
    } else if (inventoryType === 'general') {
        character.generalInventory.splice(index, 1);
    }
    updateDOM(); // Re-render the inventory table
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
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
        });
    }
}

/**
* Applies a historical state to the current character and updates the DOM.
* @param {Array} state The character array state to apply.
*/
function applyHistoryState(state) {
    characters = JSON.parse(JSON.stringify(state)); // Deep copy the state
    // Convert Sets back to Set after loading from history
    convertArraysToSetsAfterLoad(characters);

    // Ensure currentCharacterIndex is valid after applying history, especially if characters were added/deleted
    if (currentCharacterIndex >= characters.length) {
        currentCharacterIndex = characters.length - 1;
    } else if (currentCharacterIndex < 0 && characters.length > 0) {
        currentCharacterIndex = 0; // Default to the first character if somehow invalid
    } else if (characters.length === 0) {
        // If no characters left, create a default one
        characters.push(defaultCharacterData());
        currentCharacterIndex = 0;
    }
    updateDOM();
    populateCharacterSelector(); // Update selector in case character names changed
    hasUnsavedChanges = false; // Reverted/Forwarded state is now considered "saved" locally
    updateHistoryButtonsState(); // Update button states after applying history
}

// Function to revert the current character to the previous state in history
function revertCurrentCharacter() {
    if (historyPointer > 0) {
        historyPointer--;
        applyHistoryState(historyStack[historyPointer]);
        showStatusMessage("Reverted to previous state.");
        console.log("Reverted to previous state. History length:", historyStack.length, "Pointer:", historyPointer);
    } else {
        showStatusMessage("No previous state to revert to.", true);
        console.log("No previous state to revert to.");
    }
}

// Function to move the current character to the next state in history (undo a revert)
function forwardCurrentCharacter() {
    if (historyPointer < historyStack.length - 1) {
        historyPointer++;
        applyHistoryState(historyStack[historyPointer]);
        showStatusMessage("Moved forward to next state.");
        console.log("Moved forward to next state. History length:", historyStack.length, "Pointer:", historyPointer);
    } else {
        showStatusMessage("No future state to move to.", true);
        console.log("No future state to move to.");
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


// Key for local storage to persist Google Drive authorization status
const GOOGLE_DRIVE_AUTH_STATUS_KEY = 'googleDriveAuthorized';


/**
* Shows a status message to the user.
* @param {string} message The message to display.
* @param {boolean} isError Whether the message indicates an error.
*/
function showStatusMessage(message, isError = false) {
    statusMessageElement.textContent = message;
    statusMessageElement.style.color = isError ? '#ef4444' : '#22c55e'; // red-500 or green-500
    setTimeout(() => {
        statusMessageElement.textContent = '';
    }, 5000); // Clear message after 5 seconds
}

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
* Enables Google Drive buttons if both GAPI and GIS are initialized.
* Also updates the UI based on current authorization status and local storage.
*/
function maybeEnableGoogleDriveButtons() {
    if (window.gapiInited && window.gisInited) {
        authorizeGoogleDriveButton.disabled = false;
        const currentToken = gapi.client.getToken();
        const wasAuthorizedInLocalStorage = localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true';

        if (currentToken) {
            // User is currently authorized
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized';
            authorizeGoogleDriveButton.classList.add('hidden');
            signoutGoogleDriveButton.classList.remove('hidden');
            localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true'); // Ensure local storage is updated
        } else if (wasAuthorizedInLocalStorage) {
            // User was authorized previously, but session might have expired
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Authorized (Session Expired)';
            authorizeGoogleDriveButton.classList.remove('hidden'); // Show authorize to re-auth
            signoutGoogleDriveButton.classList.remove('hidden'); // Still allow sign out
        } else {
            // User is not authorized and never was (or explicitly signed out)
            googleDriveAuthStatusSpan.textContent = 'Google Drive: Not Authorized';
            authorizeGoogleDriveButton.classList.remove('hidden');
            signoutGoogleDriveButton.classList.add('hidden');
        }
    }
}

/**
* Handles Google Drive authorization click.
*/
function handleGoogleDriveAuthClick() {
    window.tokenClient.callback = async (resp) => {
        if (resp.error) {
            console.error("Google Drive authorization error:", resp);
            showStatusMessage("Google Drive authorization failed.", true);
            localStorage.removeItem(GOOGLE_DRIVE_AUTH_STATUS_KEY); // Clear local storage on error
            gapi.client.setToken(''); // Clear token in gapi.client as well
            maybeEnableGoogleDriveButtons(); // Update UI
            return;
        }
        // Set the token for gapi.client after successful authorization
        gapi.client.setToken(resp);
        localStorage.setItem(GOOGLE_DRIVE_AUTH_STATUS_KEY, 'true'); // Persist authorization status
        showStatusMessage("Google Drive authorized successfully!");
        maybeEnableGoogleDriveButtons(); // Update UI
    };
    window.tokenClient.requestAccessToken({ prompt: 'consent' });
}

/**
* Handles Google Drive sign-out.
*/
function handleGoogleDriveSignoutClick() {
    const token = gapi.client.getToken();
    if (token) {
        google.accounts.oauth2.revoke(token.access_token);
        gapi.client.setToken('');
    }
    localStorage.removeItem(GOOGLE_DRIVE_AUTH_STATUS_KEY); // Clear persisted status
    currentGoogleDriveFileId = null; // Clear current file ID on sign out
    showStatusMessage("Signed out from Google Drive.");
    maybeEnableGoogleDriveButtons(); // Update UI
}

/**
* Saves character data to Google Drive.
*/
async function saveCharacterToGoogleDrive() {
    if (!gapi.client.getToken()) {
        showStatusMessage("Please authorize Google Drive to save.", true);
        // If local storage says it was authorized, prompt to re-authorize
        if (localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true') {
            showStatusMessage("Google Drive session expired. Please re-authorize.", true);
        }
        return;
    }

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
            currentGoogleDriveFileId = response.result.id;
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
        showStatusMessage("Please authorize Google Drive to load.", true);
        // If local storage says it was authorized, prompt to re-authorize
        if (localStorage.getItem(GOOGLE_DRIVE_AUTH_STATUS_KEY) === 'true') {
            showStatusMessage("Google Drive session expired. Please re-authorize.", true);
        }
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
    } catch (error) {
        console.error('Error loading Google Drive file content:', error);
        showStatusMessage("Failed to load character data from Google Drive. Check console for details.", true);
    }
}

/**
* Toggles the visibility of a section and updates the button icon.
* @param {string} sectionId The ID of the section content div.
*/
function toggleSection(sectionId) {
    const sectionContent = document.getElementById(sectionId);
    const toggleButton = document.querySelector(`.toggle-section-btn[data-target="${sectionId}"] svg`);

    if (sectionContent && toggleButton) {
        const isHidden = sectionContent.classList.contains('hidden');
        if (isHidden) {
            sectionContent.classList.remove('hidden');
            toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>'; // Chevron down
            character.sectionVisibility[sectionId] = true;
        } else {
            sectionContent.classList.add('hidden');
            toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'; // Chevron right
            character.sectionVisibility[sectionId] = false;
        }
        hasUnsavedChanges = true; // Mark that there are unsaved changes
        saveCurrentStateToHistory(); // Save state after modification
    }
}

/**
* Updates the visibility of all sections based on the character's sectionVisibility data.
*/
function updateSectionVisibility() {
    for (const sectionId in character.sectionVisibility) {
        const sectionContent = document.getElementById(sectionId);
        const toggleButton = document.querySelector(`.toggle-section-btn[data-target="${sectionId}"] svg`);

        if (sectionContent && toggleButton) {
            if (character.sectionVisibility[sectionId]) {
                sectionContent.classList.remove('hidden');
                toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>'; // Chevron down
            } else {
                sectionContent.classList.add('hidden');
                toggleButton.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>'; // Chevron right
            }
        }
    }
}

/**
* Toggles the visibility and width of the left sidebar.
*/
function toggleSidebar() {
    const sidebar = document.getElementById('left-sidebar');
    const mainContent = document.getElementById('main-content');
    const toggleButton = document.getElementById('sidebar-toggle-btn');
    const toggleIcon = toggleButton.querySelector('svg path');
    const toggleNotesBtn = document.getElementById('toggle-notes-btn'); // Get the personal notes button

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
        // Explicitly hide the personal notes button if it's not already hidden by the loop (e.g., if it's a direct child of sidebar)
        if (toggleNotesBtn) {
            toggleNotesBtn.classList.add('hidden');
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


// Attach event listeners to all relevant input fields
function attachEventListeners() {
    // Attach listeners for standard inputs and the race selector
    const inputs = document.querySelectorAll(
        '#name, #level, #levelExperience, #race, #Health, #Mana, #racialPower, #skills, #healthBonus, #armorBonus, #personalNotes'
    );
    inputs.forEach(input => {
        if (!input.readOnly) {
            input.addEventListener('input', handleChange);
        }
    });

    // Attach listeners for stat table inputs using delegation
    document.getElementById('player-stats-container').addEventListener('input', function (event) {
        if (event.target.classList.contains('stat-input')) {
            handleChange(event);
        }
    });


    // Attach event listener for the custom class display input to toggle dropdown
    document.getElementById('class-display').addEventListener('click', toggleClassDropdown);

    // Attach event listeners to the dynamically created class checkboxes (delegation)
    document.getElementById('class-dropdown-options').addEventListener('change', function (event) {
        if (event.target.type === 'checkbox' && event.target.name === 'class-option') {
            handleClassCheckboxChange(event);
        }
    });

    // Attach event listener for the custom specialization display input to toggle dropdown
    document.getElementById('specialization-display').addEventListener('click', toggleSpecializationDropdown);

    // Attach event listeners to the dynamically created specialization checkboxes (delegation)
    document.getElementById('specialization-dropdown-options').addEventListener('change', function (event) {
        if (event.target.type === 'checkbox' && event.target.name === 'specialization-option') {
            handleSpecializationCheckboxChange(event);
        }
    });

    // Close dropdowns if clicked outside
    document.addEventListener('click', function (event) {
        const classDisplayInput = document.getElementById('class-display');
        const classDropdownOptions = document.getElementById('class-dropdown-options');
        const specializationDisplayInput = document.getElementById('specialization-display');
        const specializationDropdownOptions = document.getElementById('specialization-dropdown-options');
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
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(event);
        }
    });
    document.getElementById('armor-inventory-table').addEventListener('click', function (event) {
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(event);
        }
    });
    document.getElementById('general-inventory-table').addEventListener('click', function (event) {
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(event);
        }
    });

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


    characters = [defaultCharacterData()];
    // Initialize maxHealth, maxMana and maxRacialPower based on default race, level, and healthBonus for the first character
    recalculateCharacterDerivedProperties(characters[0]);

    populateRaceSelector();
    populateCharacterSelector(); // Populate the selector on load
    updateDOM();
    attachEventListeners(); // Attach event listeners after DOM is updated

    // Make the personal notes panel draggable
    const personalNotesPanel = document.getElementById('personal-notes-panel');
    const personalNotesHeader = document.querySelector('.personal-notes-header');
    makeDraggable(personalNotesPanel, personalNotesHeader);

    // Initialize Google API libraries
    gapiLoaded();
    gisLoaded();
    // Initial UI update for Google Drive buttons based on local storage and current token
    maybeEnableGoogleDriveButtons();

    // Save the initial state to history after everything is loaded and rendered
    saveCurrentStateToHistory();
}


window.addEventListener("gis-ready", () => {
    maybeEnableGoogleDriveButtons();
});

window.addEventListener("gapi-ready", () => {
    maybeEnableGoogleDriveButtons();
});

// Initialize the application when the DOM is fully loaded
window.onload = async function () {
    await ExternalDataManager.init();
    initPage();
}