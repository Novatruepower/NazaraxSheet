import { ExternalDataManager } from './externalDataManager.js';
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

// Recalculate derived properties
function recalculateUpdate(char) {
    let oldMaxValue = char.maxHealth;
    char.maxHealth = calculateMaxHealth(char, char.level, char.healthBonus);
    char.Health.value = adjustValue(oldMaxValue, char.Health.value, char.maxHealth);
    oldMaxValue = char.maxMana;
    char.maxMana = calculateMaxMana(char, char.level);
    char.Mana.value = adjustValue(oldMaxValue, char.Mana.value, char.maxMana);
    oldMaxValue = char.maxMana;
    char.maxRacialPower = calculateMaxRacialPower(char.level);
    char.racialPower = adjustValue(oldMaxValue, char.racialPower, char.maxRacialPower);

    if (characters.length > 0) {
        document.getElementById('maxHealth').value = character.maxHealth;
        document.getElementById('Health').value = character.Health.value;
        document.getElementById('maxMana').value = character.maxMana;
        document.getElementById('Mana').value = character.Mana.value;
        document.getElementById('maxRacialPower').value = character.maxRacialPower;
        document.getElementById('racialPower').value = character.racialPower;
    }
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
        StatChoices: {}, // Stores chosen passive details: { category: { passiveName: { slotId: { type, value?, statName?, level?, label? } } } }
        StatsAffected: {}, // Stores which stats are affected by which choices: { category: { passiveName: { statName: Set<string> } } }

        // Old properties removed as per refactoring request
        // demiHumanStatChoices: [],
        // demiHumanStatsAffected: new Set(),
        // mutantMutations: [],
        // mutantDegenerations: [],
        // mutantAffectedStats: new Set(),
        // baseMaxHealthDoubled: false,
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
        }
    });

    newCharacter['BaseHealth'].value = 100;
    recalculateUpdate(newCharacter);

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

// Function to push the current character's state to the history stack
function saveCurrentStateToHistory() {
    // Deep copy the entire characters array to save its state
    const currentState = JSON.parse(JSON.stringify(characters));

    // Convert Sets to Arrays for saving within the new StatChoices/StatsAffected structure
    currentState.forEach(char => {
        if (char.StatsAffected) {
            for (const category in char.StatsAffected) {
                for (const passiveName in char.StatsAffected[category]) {
                    for (const statName in char.StatsAffected[category][passiveName]) {
                        if (char.StatsAffected[category][passiveName][statName] instanceof Set) {
                            char.StatsAffected[category][passiveName][statName] = Array.from(char.StatsAffected[category][passiveName][statName]);
                        }
                    }
                }
            }
        }
    });

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
function calculateTotal(statName) {
    const stat = character[statName];
    // Ensure values are treated as numbers, defaulting to 0 if NaN
    const value = parseFloat(stat.value) || 0;
    // Use getAppliedRacialChange to get the combined racial modifier (percentage change)
    const racialChange = getAppliedRacialChange(character, statName);
    const equipment = parseFloat(stat.equipment) || 0;
    const temporary = parseFloat(stat.temporary) || 0;

    return value * racialChange + equipment + temporary;
}

// Helper function to get the applied racial change for a stat (for both Demi-humans and Mutants)
function getAppliedRacialChange(charData, statName) {
    // For standard most stats, the racialChange is directly stored on the stat object.
    if (ExternalDataManager._data.Stats.includes(statName)) {
        return charData[statName].racialChange;
    }

    // If for some reason a statName is passed that isn't a rollStat, Health, or Mana,
    // and it's not explicitly handled by the above, return 0 or a default.
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


// Function to save all character data to a JSON file (download)
function saveCharacterToFile() {
    // Create a deep copy of the characters array to modify for saving
    const charactersToSave = JSON.parse(JSON.stringify(characters));

    // Exclude maxExperience and total from each player stat for each character
    charactersToSave.forEach(char => {
        ExternalDataManager.rollStats.forEach(statName => {
            if (char[statName]) {
                const { maxExperience, total, ...rest } = char[statName];
                char[statName] = rest; // Assign the object without maxExperience and total
            }
        });
        // Convert Sets to Arrays for saving within the new StatChoices/StatsAffected structure
        if (char.StatsAffected) {
            for (const category in char.StatsAffected) {
                for (const passiveName in char.StatsAffected[category]) {
                    for (const statName in char.StatsAffected[category][passiveName]) {
                        if (char.StatsAffected[category][passiveName][statName] instanceof Set) {
                            char.StatsAffected[category][passiveName][statName] = Array.from(char.StatsAffected[category][passiveName][statName]);
                        }
                    }
                }
            }
        }
        // Exclude calculated properties (maxHealth, maxMana, maxRacialPower, ac) from the saved data
        delete char.maxHealth;
        delete char.maxMana;
        delete char.maxRacialPower;
        delete char.ac;
    });

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
    newChar.sectionVisibility = { ...defaultCharacterData().sectionVisibility, ...loadedChar.sectionVisibility };

    // Initialize originalDamage/originalMagicDamage for weapons if not present
    newChar.weaponInventory.forEach(weapon => {
        if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
        if (typeof weapon.originalMagicDamage === 'undefined') weapon.originalMagicDamage = weapon.magicDamage;
    });

    newChar.ac = newChar.armorBonus;

    // Recalculate totals for rollStats after loading to ensure consistency
    ExternalDataManager.rollStats.forEach(statName => {
        if (newChar[statName]) {
            newChar[statName].total = calculateTotal(statName);
        }
    });

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

    recalculateUpdate(character);

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
               <input type="number" id="${statName}-total" name="${statName}-total" value="${calculateTotal(statName)}" readonly class="stat-input" />
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
    renderWeaponInventory();
    renderArmorInventory();
    renderGeneralInventory();

    // Update section visibility - NEW
    updateSectionVisibility();

    updateHistoryButtonsState(); // Update history button states after DOM update
}

// Helper function to create table data (<td>) elements
function quickTd(element, type, isClosed, dataInventoryType, dataField, dataIndex, value, cssClass) {
    let string = `<td><${element}`;

    if (type != null)
        string += ` type="${type}"`;

    string += ` data-inventory-type="${dataInventoryType}" data-field="${dataField}" data-index="${dataIndex}"`;

    if (cssClass != null)
        string += ` class="${cssClass}"`;

    if (!isClosed) {
        if (type != 'checkbox')
            string += ` value="${value}">`;
        else
            string += ` ${value}>`;
    } else
        string += `>${value}</${element}>`


    return string + '</td>';
}

// Function to render the Weapon Inventory table
function renderWeaponInventory() {
    const tbody = document.querySelector('#weapon-inventory-table tbody');
    tbody.innerHTML = ''; // Clear existing rows

    character.weaponInventory.forEach((weapon, index) => {
        const row = tbody.insertRow(); // Changed from insertCell() to insertRow()
        // Determine the displayed damage values based on the 'use' checkbox
        const displayDamage = weapon.use ? calculateFormula(weapon.damage) : weapon.damage;
        const displayMagicDamage = weapon.use ? calculateFormula(weapon.magicDamage) : weapon.magicDamage;

        row.innerHTML = `
           ${quickTd('input', 'text', false, 'weapon', 'name', index, weapon.name, 'w-full')}
           ${quickTd('input', 'text', false, 'weapon', 'type', index, weapon.type, 'w-full')}
           ${quickTd('input', 'text', false, 'weapon', 'material', index, weapon.material, 'w-full')}
           ${quickTd('input', 'text', false, 'weapon', 'requirement', index, weapon.requirement, 'w-full')}
           ${quickTd('input', 'text', false, 'weapon', 'requiredStat', index, weapon.requiredStat, 'w-full')}
           ${quickTd('input', 'number', false, 'weapon', 'accuracy', index, weapon.accuracy, 'w-full')}
           ${quickTd('textarea', null, true, 'weapon', 'damage', index, displayDamage, 'w-full inventory-effect-textarea')}
           ${quickTd('textarea', null, true, 'weapon', 'magicDamage', index, displayMagicDamage, 'w-full inventory-effect-textarea')}
           ${quickTd('input', 'text', false, 'weapon', 'magicType', index, weapon.magicType, 'w-full')}
           ${quickTd('textarea', null, true, 'weapon', 'effect', index, weapon.effect, 'w-full inventory-effect-textarea')}
           ${quickTd('input', 'number', false, 'weapon', 'value', index, weapon.value, 'w-full')}
           ${quickTd('input', 'checkbox', false, 'weapon', 'use', index, weapon.use ? 'checked' : '', null)}
           ${quickTd('button', null, true, 'weapon', null, index, 'Remove', 'remove-item-btn bg-red-500 hover:bg-red-600')}
       `;

        // Set textarea values after they are in the DOM
        row.querySelector('textarea[data-field="damage"]').value = displayDamage;
        row.querySelector('textarea[data-field="magicDamage"]').value = displayMagicDamage;
        row.querySelector('textarea[data-field="effect"]').value = weapon.effect;
    });
}

// Function to render the Armor Inventory table
function renderArmorInventory() {
    const tbody = document.querySelector('#armor-inventory-table tbody');
    tbody.innerHTML = ''; // Clear existing rows

    character.armorInventory.forEach((armor, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
           ${quickTd('input', 'text', false, 'armor', 'name', index, armor.name, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'location', index, armor.location, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'material', index, armor.material, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'requirement', index, armor.requirement, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'requiredStat', index, armor.requiredStat, 'w-full')}
           ${quickTd('input', 'number', false, 'armor', 'defense', index, armor.defense, 'w-full')}
           ${quickTd('input', 'number', false, 'armor', 'magicDefense', index, armor.magicDefense, 'w-full')}
           ${quickTd('input', 'text', false, 'armor', 'magicType', index, armor.magicType, 'w-full')}
           ${quickTd('textarea', null, true, 'armor', 'effect', index, armor.effect, 'w-full inventory-effect-textarea')}
           ${quickTd('input', 'number', false, 'armor', 'value', index, armor.value, 'w-full')}
           ${quickTd('input', 'checkbox', false, 'armor', 'equipped', index, armor.equipped ? 'checked' : '', null)}
           ${quickTd('button', null, true, 'armor', null, index, 'Remove', 'remove-item-btn bg-red-500 hover:bg-red-600')}
       `;

        // Set textarea value after it's in the DOM
        row.querySelector('textarea[data-field="effect"]').value = armor.effect;
    });
}

// Function to render the General Inventory table
function renderGeneralInventory() {
    const tbody = document.querySelector('#general-inventory-table tbody');
    tbody.innerHTML = ''; // Clear existing rows

    character.generalInventory.forEach((item, index) => {
        const row = tbody.insertRow();
        row.innerHTML = `
           ${quickTd('input', 'text', false, 'general', 'name', index, item.name, 'w-full')}
           ${quickTd('input', 'text', false, 'general', 'type', index, item.type, 'w-full')}
           ${quickTd('textarea', null, true, 'general', 'effect', index, item.effect, 'w-full inventory-effect-textarea')}
           ${quickTd('input', 'number', false, 'general', 'accuracy', index, item.accuracy, 'w-full')}
           ${quickTd('input', 'number', false, 'general', 'amount', index, item.amount, 'w-full')}
           ${quickTd('input', 'number', false, 'general', 'valuePerUnit', index, item.valuePerUnit, 'w-full')}
           ${quickTd('button', null, true, 'general', null, index, 'Remove', 'remove-item-btn bg-red-500 hover:bg-red-600')}
       `;

        // Set textarea value after it's in the DOM
        row.querySelector('textarea[data-field="effect"]').value = item.effect;
    });
}

// Function to perform a quick roll for all player stats
function quickRollStats() {
    ExternalDataManager.rollStats.forEach(statName => {
        character[statName].value = roll(minRollStat, maxRollStat); // Assign to the 'value' property

        // Recalculate total for the updated stat
        character[statName].total = calculateTotal(statName);

        // Update the DOM for value and total immediately
        document.getElementById(`${statName}-value`).value = character[statName].value;
        document.getElementById(`${statName}-total`).value = character[statName].total;
    });
    // Re-render weapon inventory to update calculated damage values
    renderWeaponInventory();
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

function updateRacialChange(oldRace, statName) {
    character[statName].racialChange -= ExternalDataManager.getRacialChange(oldRace, statName);
    character[statName].racialChange += ExternalDataManager.getRacialChange(character.race, statName);
}

// Revert stat changes
function revertChoiceRacialChange(char, statName, choice) {
    if (ExternalDataManager._data.Stats.includes(statName)) {
        if (choice.calc == "mult")
            char[statName].racialChange /= choice.value;
        else
            char[statName].racialChange -= choice.value;
    }

    // Add other specific reverts here if needed (e.g., for regen, skills)
}

// Revert stat changes
function applyChoiceRacialChange(char, statName, value, calc) {
    if (ExternalDataManager._data.Stats.includes(statName)) {
        if (calc == "mult")
            char[statName].racialChange *= value;
        else
            char[statName].racialChange += value;
    }

    // Add other specific reverts here if needed (e.g., for regen, skills)
}

/**
* Reverts the effects of all choices for a given category and passive name.
* @param {object} char The character object.
* @param {string} category The category (e.g., 'Demi-humans', 'Mutant').
* @param {string} passiveName The name of the passive (e.g., 'Demi-human Stat Adjustments', 'Mutation').
*/
function handleRevertChoices(char, category, passiveName) {
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


// Function to handle race change, updating racial characteristics
function handleChangeRace(oldRace) {
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
        updateRacialChange(oldRace, statName);
        character[statName].total = calculateTotal(statName);
        document.getElementById(`${statName}-racialChange`).value = getAppliedRacialChange(character, statName); // Display raw number
        document.getElementById(`${statName}-total`).value = character[statName].total;
    });

    ExternalDataManager.otherStats.forEach(statName => {
        updateRacialChange(oldRace, statName);
    });

    // Update maxHealth, maxMana and maxRacialPower when race changes
    recalculateUpdate(character);

    // Re-render the racial passives UI
    renderRacialPassives();

    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
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
    const passiveName = 'Stat Adjustments'; // Generic passive name for Demi-humans

    if (character.race === category && demiHumanPassives && demiHumanPassives.choices) {
        demiHumanChoicesContainer.classList.remove('hidden');
        demiHumanChoicesContainer.innerHTML = `
           <h4 class="text-md font-semibold text-gray-800 dark:text-gray-200 mb-2">Demi-human Stat Adjustments</h4>
           <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${demiHumanPassives.description}</p>
           <div id="demi-human-modifiers-list" class="space-y-3">
               <!-- Modifiers will be dynamically added here -->
           </div>
       `;

        const modifiersList = document.getElementById('demi-human-modifiers-list');

        // Ensure the nested structure exists for Demi-humans
        character.StatChoices[category] = character.StatChoices[category] || {};
        character.StatChoices[category][passiveName] = character.StatChoices[category][passiveName] || {};
        character.StatsAffected[category] = character.StatsAffected[category] || {};
        character.StatsAffected[category][passiveName] = character.StatsAffected[category][passiveName] || {};


        demiHumanPassives.choices.forEach((modifier, modIndex) => {
            for (let i = 0; i < modifier.count; i++) {
                const slotId = `demihuman-${modifier.type}-${modIndex}-${i}`; // Unique ID for each choice slot
                const currentChoice = character.StatChoices[category][passiveName][slotId];
                const selectedStatName = currentChoice ? currentChoice.statName : '';

                const choiceDiv = document.createElement('div');
                choiceDiv.className = 'flex items-center space-x-2';
                choiceDiv.innerHTML = `
                   <label for="${slotId}" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-36">${modifier.label}</label>
                   <select id="${slotId}" class="stat-choice-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                       <option value="">-- Select a Stat --</option>
                   </select>
                   ${selectedStatName ? `<button type="button" data-choice-id="${slotId}" class="clear-demi-human-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>` : ''}
               `;
                modifiersList.appendChild(choiceDiv);

                const selectElement = choiceDiv.querySelector(`#${slotId}`);
                modifier.applicableStats.forEach(statName => {
                    const option = document.createElement('option');
                    option.value = statName;
                    option.textContent = statName;
                    // Disable if already chosen by another slot, or if this is not the currently selected stat for this slot
                    const isAlreadyChosen = character.StatsAffected[category][passiveName][statName] && character.StatsAffected[category][passiveName][statName].size > 0 && !character.StatsAffected[category][passiveName][statName].has(slotId);
                    option.disabled = isAlreadyChosen;
                    selectElement.appendChild(option);
                });
                selectElement.value = selectedStatName;

                // Add event listener
                selectElement.addEventListener('change', (e) => {
                    handleDemiHumanStatChoice(category, passiveName, slotId, modifier.type, modifier.calc, modifier.value, e.target.value, modifier.label);
                });
            }
        });
    } else {
        demiHumanChoicesContainer.classList.add('hidden');
        demiHumanChoicesContainer.innerHTML = ''; // Clear content when hidden
    }
    attachClearDemiHumanChoiceListeners(); // Attach listeners for clear buttons
}

/**
* Handles the selection of a stat for a Demi-human racial modifier.
* @param {string} category The category (e.g., 'Demi-humans').
* @param {string} passiveName The name of the passive (e.g., 'Stat Adjustments').
* @param {string} slotId The unique ID of the choice slot.
* @param {string} choiceType The type of the choice (e.g., 'stat_increase').
* @param {number} modifierValue The numerical value of the modifier (e.g., 0.25).
* @param {string} selectedStatName The name of the stat chosen by the player.
* @param {string} label The display label of the choice.
*/
function handleDemiHumanStatChoice(category, passiveName, slotId, choiceType, calc, modifierValue, selectedStatName, label) {
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

        // Revert the racial change
        if (ExternalDataManager._data.Stats.includes(prevStatName)) {
            character[prevStatName].racialChange -= previousChoice.value;
            console.log(`  Reverted racialChange for ${prevStatName} by ${previousChoice.value}. New value: ${character[prevStatName].racialChange}`);
        }
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

        // Apply the modifier to the chosen stat
        if (ExternalDataManager._data.Stats.includes(selectedStatName)) {
            character[selectedStatName].racialChange += modifierValue;
            console.log(`  Applied racialChange for ${selectedStatName} by ${modifierValue}. New value: ${character[selectedStatName].racialChange}`);
        }
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
    hasUnsavedChanges = true;
    saveCurrentStateToHistory();
    console.log("--- handleDemiHumanStatChoice finished ---");
}

/**
* Attaches event listeners to the dynamically created clear buttons for Demi-human stat choices.
*/
function attachClearDemiHumanChoiceListeners() {
    document.querySelectorAll('.clear-demi-human-choice-btn').forEach(button => {
        button.onclick = (event) => {
            const choiceId = event.target.dataset.choiceId;
            const selectElement = document.getElementById(choiceId);
            if (selectElement) {
                selectElement.value = ''; // Set dropdown to empty
                // Manually trigger the change event to clear the choice
                selectElement.dispatchEvent(new Event('change'));
            }
        };
    });
}

/**
* Renders the UI for Mutant specific stat choices
*/
function renderMutantChoiceUI() {
    const mutantChoicesContainer = document.getElementById('racial-passives-container');
    if (!mutantChoicesContainer) return;

    const mutantPassives = ExternalDataManager.getRaceManualPassives('Mutant');
    const category = 'Mutant';

    if (character.race === category && mutantPassives && mutantPassives.abilities) {
        mutantChoicesContainer.classList.remove('hidden');
        mutantChoicesContainer.innerHTML = `
           <h4 class="text-md font-semibold text-gray-800 dark:text-gray-200 mb-2">Mutant Abilities: Mutation & Degeneration</h4>
           <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">${mutantPassives.description}</p>
           <div id="mutant-abilities-list" class="space-y-4">
               <!-- Mutation and Degeneration choices will be dynamically added here -->
           </div>
       `;

        const abilitiesList = document.getElementById('mutant-abilities-list');
        const currentLevel = character.level;

        // Ensure the nested structure exists for Mutant
        character.StatChoices[category] = character.StatChoices[category] || {};
        character.StatsAffected[category] = character.StatsAffected[category] || {};

        // Helper to get available points for a type at current level
        const getAvailablePoints = (abilityType) => {
            const levels = mutantPassives.abilities[abilityType].levels;
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

        // Iterate over each ability (Mutation, Degeneration)
        for (const abilityKey in mutantPassives.abilities) {
            const abilityData = mutantPassives.abilities[abilityKey];
            const maxChoices = getAvailablePoints(abilityKey);
            const options = abilityData.options;
            const passiveName = abilityKey; // e.g., "Mutation", "Degeneration"

            // Ensure nested structure for this passive name
            character.StatChoices[category][passiveName] = character.StatChoices[category][passiveName] || {};
            character.StatsAffected[category][passiveName] = character.StatsAffected[category][passiveName] || {};

            for (let i = 0; i < maxChoices; i++) {
                const slotId = `mutant-${abilityKey.toLowerCase()}-${i}`;
                const currentChoice = character.StatChoices[category][passiveName][slotId];
                const selectedOptionType = currentChoice ? currentChoice.type : '';
                const selectedStatName = currentChoice && currentChoice.statName ? currentChoice.statName : '';
                // Find the full data for the currently selected option type
                const selectedOptionData = options.find(opt => opt.type === selectedOptionType);
                const applicableStatsLength = selectedOptionData && selectedOptionData.applicableStats ? selectedOptionData.applicableStats.length : 0;
                const needsStatSelection = applicableStatsLength > 0;

                const choiceDiv = document.createElement('div');
                choiceDiv.className = 'flex flex-col space-y-1 p-2 border border-gray-200 dark:border-gray-700 rounded-md';

                let statSelectionHtml = '';

                if (needsStatSelection) {
                    const hide = applicableStatsLength == 1 ? 'hidden' : '';
                    statSelectionHtml = `
                       <div id="${slotId}-stat-selection" class="flex items-center space-x-2 ${hide}">
                           <label for="${slotId}-stat" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">Target Stat:</label>
                           <select id="${slotId}-stat" class="mutant-choice-stat-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                               <option value="">-- Select a Stat --</option>
                           </select>
                       </div>
                   `;
                }

                choiceDiv.innerHTML = `
                   <div class="flex items-center space-x-2">
                       <label for="${slotId}-type" class="text-sm font-medium text-gray-700 dark:text-gray-300 w-32">${abilityKey} ${i + 1}:</label>
                       <select id="${slotId}-type" class="mutant-choice-type-select flex-grow rounded-md shadow-sm border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-indigo-500 focus:border-indigo-500">
                           <option value="">-- Select ${abilityKey} Type --</option>
                           ${options.map(opt => `<option value="${opt.type}" ${opt.type === selectedOptionType ? 'selected' : ''}>${opt.label}</option>`).join('')}
                       </select>
                       <button type="button" data-slot-id="${slotId}" data-category="${category}" data-passive-name="${passiveName}" class="clear-mutant-choice-btn ml-2 px-2 py-1 bg-red-500 text-white text-xs font-medium rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800">Clear</button>
                   </div>
                   ${statSelectionHtml}
               `;
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
                        const isAlreadyChosen = character.StatsAffected[category][passiveName][statName] && character.StatsAffected[category][passiveName][statName].size > 0 && !character.StatsAffected[category][passiveName][statName].has(slotId);
                        option.disabled = isAlreadyChosen;
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

                        if (statSelectionDiv) {
                            if (newNeedsStatSelection) {
                                if (newApplicableStatsLength > 1) {
                                    statSelectionDiv.classList.remove('hidden');
                                }

                                // Repopulate stat dropdown for this specific select
                                statSelect.innerHTML = '<option value="">-- Select a Stat --</option>';
                                newSelectedOptionData.applicableStats.forEach(statName => {
                                    const option = document.createElement('option');
                                    option.value = statName;
                                    option.textContent = statName;
                                    const isAlreadyChosen = character.StatsAffected[category][passiveName][statName] && character.StatsAffected[category][passiveName][statName].size > 0 && !character.StatsAffected[category][passiveName][statName].has(slotId);
                                    option.disabled = isAlreadyChosen;
                                    statSelect.appendChild(option);
                                });
                                
                                console.log('selected ' + newSelectedOptionData);
                                console.log("length " + newApplicableStatsLength);
                                if (newApplicableStatsLength == 1) {
                                    statSelect.value = newSelectedOptionData.applicableStats[0];
                                    console.log(statSelect.value);
                                }
                                else {
                                    // Keep current selection if valid, otherwise clear
                                    statSelect.value = selectedStatName && newSelectedOptionData.applicableStats.includes(selectedStatName) ? selectedStatName : '';
                                }
                            } else {
                                statSelectionDiv.classList.add('hidden');
                                if (statSelect) statSelect.value = ''; // Clear stat selection if type changes away from stat
                            }
                        }

                        handleMutantChoice(
                            category,
                            passiveName,
                            slotId,
                            newType,
                            statSelect ? statSelect.value : null,
                            newSelectedOptionData ? newSelectedOptionData.calc : null,
                            newSelectedOptionData ? newSelectedOptionData.value : null,
                            newSelectedOptionData ? newSelectedOptionData.label : '');
                    });
                }


                // Event listener for stat change
                if (statSelect) {
                    statSelect.addEventListener('change', (e) => {
                        const currentType = typeSelect.value;
                        const currentSelectedOptionData = options.find(opt => opt.type === currentType); // Get the full option data
                        handleMutantChoice(
                            category,
                            passiveName,
                            slotId,
                            currentType,
                            e.target.value,
                            currentSelectedOptionData ? currentSelectedOptionData.calc : null,
                            currentSelectedOptionData ? currentSelectedOptionData.value : null,
                            currentSelectedOptionData ? currentSelectedOptionData.label : ''
                        );
                    });
                }
            }
        }

    } else {
        mutantChoicesContainer.classList.add('hidden');
        mutantChoicesContainer.innerHTML = ''; // Clear content when hidden
    }
    attachClearMutantChoiceListeners(); // Attach listeners for clear buttons
}

/**
* Handles the selection of a stat for a Mutant mutation or degeneration.
* @param {string} category The category (e.g., 'Mutant').
* @param {string} passiveName The name of the passive (e.g., 'Mutation', 'Degeneration').
* @param {string} slotId The unique ID of the choice slot.
* @param {string} optionType The type from options (e.g., 'stat_multiplier_set_50', 'double_base_health').
* @param {string} selectedStatName The name of the stat chosen by the player (if applicable).
* @param {string} calc The calculation type ("add" or "mult").
* @param {number} optionValue The numerical value associated with the option (e.g., 0.50, -0.50).
* @param {string} label The display label of the choice.
*/
function handleMutantChoice(category, passiveName, slotId, optionType, selectedStatName = null, calc = null, optionValue = null, label = '') {
    console.log("--- handleMutantChoice called ---");
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

        // Determine the stat name to affect based on optionType
        let statToAffect = selectedStatName;
        //if (optionType === 'stat_multiplier_set_50' || optionType === 'stat_multiplier_reduce_50' || optionType === 'double_base_health') {
       //     statToAffect = selectedStatName;
       // } else if (optionType === 'natural_regen_active') {
       //     statToAffect = "naturalHealthRegenActive"; // Placeholder for flags
       // } else if (optionType === 'regen_doubled') {
       //     statToAffect = "healthRegenDoubled"; // Placeholder for flags
       // }
        // For skill_choice, no stat is directly affected in this way.

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
            if ((optionType === 'stat_multiplier_set_50' || optionType === 'stat_multiplier_reduce_50' || optionType === 'double_base_health') && !selectedStatName) {
                // User selected a stat mutation type but no stat, just update DOM and return
                updateDOM();
                hasUnsavedChanges = true;
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
    hasUnsavedChanges = true;
    saveCurrentStateToHistory();
    console.log("--- handleMutantChoice finished ---");
}

/**
* Attaches event listeners to the dynamically created clear buttons for Mutant choices.
*/
function attachClearMutantChoiceListeners() {
    document.querySelectorAll('.clear-mutant-choice-btn').forEach(button => {
        button.onclick = (event) => {
            const slotId = event.target.dataset.slotId;
            const category = event.target.dataset.category;
            const passiveName = event.target.dataset.passiveName;

            // Retrieve the choice before clearing
            const choiceToClear = character.StatChoices[category]?.[passiveName]?.[slotId];

            if (choiceToClear) {
                // Revert stat changes if applicable
                if (choiceToClear.statName) {
                    if (character.StatsAffected[category][passiveName][choiceToClear.statName]) {
                        character.StatsAffected[category][passiveName][choiceToClear.statName].delete(slotId);
                        if (character.StatsAffected[category][passiveName][choiceToClear.statName].size === 0) {
                            delete character.StatsAffected[category][passiveName][choiceToClear.statName];
                        }
                    }
                    if (ExternalDataManager._data.Stats.includes(choiceToClear.statName)) {
                        // Revert by subtracting the value
                        character[choiceToClear.statName].racialChange -= choiceToClear.value;
                    }
                }
                // Remove the choice from StatChoices
                delete character.StatChoices[category][passiveName][slotId];
            }

            // Reset dropdowns in UI
            const typeSelect = document.getElementById(`${slotId}-type`);
            const statSelect = document.getElementById(`${slotId}-stat`);
            if (typeSelect) typeSelect.value = '';
            if (statSelect) statSelect.value = '';

            // Recalculate and update DOM
            recalculateUpdate(character);
            updateDOM();
            hasUnsavedChanges = true;
            saveCurrentStateToHistory();
        };
    });
}


/**
* Renders the generic racial passives for races that don't have manual choices.
*/
function renderGenericRacialPassives() {
    const genericPassivesContainer = document.getElementById('racial-passives-container');
    if (!genericPassivesContainer) return;

    // Clear previous content
    genericPassivesContainer.innerHTML = '';
    genericPassivesContainer.classList.add('hidden'); // Hide by default

    const raceManualPassives = ExternalDataManager.getRaceManualPassives(character.race);

    if (character.race !== 'Demi-humans' && character.race !== 'Mutant' && raceManualPassives && raceManualPassives.choices && raceManualPassives.choices.length === 0) {
        // This condition is for races explicitly defined in manual_passives_data.json but with no manual choices
        genericPassivesContainer.classList.remove('hidden');
        genericPassivesContainer.innerHTML = `<p class="text-sm text-gray-600 dark:text-gray-400">${raceManualPassives.description || 'This race has no specific manually assigned passives.'}</p>`;
    } else if (!raceManualPassives) {
        // This condition is for races not defined in manual_passives_data.json at all
        genericPassivesContainer.classList.remove('hidden');
        genericPassivesContainer.innerHTML = '<p class="text-sm text-gray-600 dark:text-gray-400">This race has no specific manually assigned passives.</p>';
    }
    // If it's Demi-humans or Mutant, or if it has manual choices, this function won't render anything,
    // as their specific render functions will handle it.
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
    } else if (character.race === 'Mutant') {
        renderMutantChoiceUI();
    } else {
        renderGenericRacialPassives();
    }
}


// Event listener for all input changes (excluding the custom class multi-select)
function handleChange(event) {
    const { name, id, value, type, dataset, checked } = event.target;
    let newValue;

    // Check if the input is part of an inventory table
    if (dataset.inventoryType) {
        const inventoryType = dataset.inventoryType;
        const itemIndex = parseInt(dataset.index);
        const field = dataset.field;

        if (inventoryType === 'weapon') {
            if (field === 'use') { // Handle checkbox for 'use'
                character.weaponInventory[itemIndex][field] = checked;
                if (checked) {
                    // Store original values before applying formula
                    character.weaponInventory[itemIndex].originalDamage = character.weaponInventory[itemIndex].damage;
                    character.weaponInventory[itemIndex].originalMagicDamage = character.weaponInventory[itemIndex].magicDamage;
                    // Apply default formulas (can be customized)
                    character.weaponInventory[itemIndex].damage = calculateFormula(character.weaponInventory[itemIndex].originalDamage); // Use original for calculation
                    character.weaponInventory[itemIndex].magicDamage = calculateFormula(character.weaponInventory[itemIndex].originalMagicDamage); // Use original for calculation
                } else {
                    // Restore original values
                    character.weaponInventory[itemIndex].damage = character.weaponInventory[itemIndex].originalDamage;
                    character.weaponInventory[itemIndex].magicDamage = character.weaponInventory[itemIndex].originalMagicDamage;
                }
                renderWeaponInventory(); // Re-render to show calculated/restored values
            } else if (type === 'number' && field !== 'damage' && field !== 'magicDamage') { // Exclude damage/magicDamage from number parsing
                character.weaponInventory[itemIndex][field] = parseFloat(value) || 0;
            } else {
                // For text fields like damage/magicDamage, store the string directly
                character.weaponInventory[itemIndex][field] = value;
            }
        } else if (inventoryType === 'armor') {
            if (field === 'equipped') { // Handle checkbox for 'equipped'
                character.armorInventory[itemIndex][field] = checked;
            } else if (type === 'number') {
                character.armorInventory[itemIndex][field] = parseFloat(value) || 0;
            } else {
                character.armorInventory[itemIndex][field] = value;
            }
        } else if (inventoryType === 'general') {
            if (type === 'number') {
                character.generalInventory[itemIndex][field] = parseFloat(value) || 0;
            } else {
                character.generalInventory[itemIndex][field] = value;
            }
        }
        hasUnsavedChanges = true; // Mark that there are unsaved changes
        saveCurrentStateToHistory(); // Save state after modification
        return; // Exit as inventory change is handled
    }

    // This handleChange will now only handle non-class inputs and the race selector
    if (type === 'number') {
        newValue = parseFloat(value) || 0;
    } else {
        newValue = value;
    }

    // Check if the changed input belongs to a player stat
    let isPlayerStatInput = false;
    let statName = '';
    let subProperty = '';

    for (const stat of ExternalDataManager.rollStats) {
        if (name.startsWith(`${stat}-`)) {
            isPlayerStatInput = true;
            statName = stat;
            subProperty = name.substring(stat.length + 1); // e.g., 'value', 'racialChange', 'experience', 'maxExperience'
            break;
        }
    }

    if (isPlayerStatInput) {
        if (subProperty === 'experience') {
            // Update the experience value directly first
            character[statName].experience = newValue;

            // Check if experience has reached or exceeded maxExperience
            while (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
                character[statName].value++; // Increment the stat's value
                character[statName].experience -= character[statName].maxExperience; // Reset experience
            }
            // Always update the displayed experience, even if it didn't trigger a level up
            document.getElementById(`${statName}-value`).value = character[statName].value;
            document.getElementById(`${statName}-experience`).value = character[statName].experience;

        } else if (subProperty === 'maxExperience') {
            // Ensure maxExperience is at least 1
            character[statName].maxExperience = Math.max(1, newValue);
            // Update the DOM for maxExperience immediately
            document.getElementById(`${statName}-maxExperience`).value = character[statName].maxExperience;
            // Re-evaluate experience if maxExperience changed and current experience is sufficient
            while (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
                character[statName].value++;
                character[statName].experience -= character[statName].maxExperience;
            }
            document.getElementById(`${statName}-value`).value = character[statName].value;
            document.getElementById(`${statName}-experience`).value = character[statName].experience;

        } else {
            // For other sub-properties (value, racialChange, equipment, temporary)
            character[statName][subProperty] = newValue;
        }

        // Recalculate the total for this stat after any change in its sub-properties
        character[statName].total = calculateTotal(statName);
        // Update the total display in the DOM immediately
        document.getElementById(`${statName}-total`).value = character[statName].total;

        // If a stat changes, re-render weapon inventory to update calculated damage values
        renderWeaponInventory();

    } else {
        // For other non-stat inputs (name, level, Health, ac, skills, inventory, race, healthBonus, Mana, racialPower, personalNotes)
        // The 'class-display' input is read-only and handled by custom logic, so it's excluded here.
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
            character.level = newValue;
            character.levelMaxExperience = calculateLevelMaxExperience(character.level);
            document.getElementById('levelMaxExperience').value = character.levelMaxExperience;
            // Also update maxHealth, maxMana and maxRacialPower when level changes
            recalculateUpdate(character);
        } else if (id === 'race') {
            let oldRace = character.race;
            character.race = newValue;
            const raceSelect = document.getElementById('race');
            if (newValue === '') {
                raceSelect.classList.add('select-placeholder-text');
            } else {
                raceSelect.classList.remove('select-placeholder-text');
            }
            handleChangeRace(oldRace); // Call handleChangeRace to update racial characteristics
        } else if (id === 'Health') { // Handle current Health input
            character.Health.value = Math.min(newValue, character.maxHealth); // Ensure current Health doesn't exceed max Health
            document.getElementById('Health').value = character.Health.value;
        } else if (id === 'Mana') { // Handle current Magic input (renamed)
            character.Mana.value = Math.min(newValue, character.maxMana); // Ensure current Magic doesn't exceed max Magic
            document.getElementById('Mana').value = character.Mana.value;
        } else if (id === 'racialPower') { // Handle current Racial Power input
            character.racialPower = Math.min(newValue, character.maxRacialPower); // Ensure current Racial Power doesn't exceed max Racial Power
            document.getElementById('racialPower').value = character.racialPower;
        } else if (id === 'healthBonus') { // Handle healthBonus input
            character.healthBonus = newValue;
            // Recalculate maxHealth when healthBonus changes
            character.maxHealth = calculateMaxHealth(character, character.level, character.healthBonus);
            character.Health.value = Math.min(character.Health.value, character.maxHealth); // Adjust current Health if it exceeds new max
            document.getElementById('maxHealth').value = character.maxHealth;
            document.getElementById('Health').value = character.Health.value;
        } else if (id === 'armorBonus') { // Handle armorBonus input
            character.armorBonus = newValue;
            character.ac = character.armorBonus; // Update AC based on armorBonus
            document.getElementById('ac').value = character.ac; // Update readonly AC input
        } else if (id === 'personalNotes') { // Handle personalNotes input
            character.personalNotes = newValue;
        } else if (id !== 'class-display' && id !== 'specialization-display') { // Exclude specialization-display
            character[name || id] = newValue;
        }
        // If any of these core stats change, re-render weapon inventory to update calculated damage values
        renderWeaponInventory();
    }
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
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
    character.weaponInventory.push({ name: '', type: '', material: '', requirement: '', requiredStat: '', accuracy: 100, damage: '', magicDamage: '', magicType: '', effect: '', value: 0, use: false }); // 'use' is now boolean
    renderWeaponInventory();
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

function addArmor() {
    character.armorInventory.push({ name: '', location: '', material: '', requirement: '', requiredStat: '', defense: 0, magicDefense: 0, magicType: '', effect: '', value: 0, equipped: false });
    renderArmorInventory();
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

function addGeneralItem() {
    character.generalInventory.push({ name: '', type: '', effect: '', accuracy: 0, amount: 0, valuePerUnit: 0 });
    renderGeneralInventory();
    hasUnsavedChanges = true; // Mark that there are unsaved changes
    saveCurrentStateToHistory(); // Save state after modification
}

// Function to remove an item from inventory
function removeItem(event) {
    const inventoryType = event.target.dataset.inventoryType;
    const index = parseInt(event.target.dataset.index);

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
    characters.forEach(char => {
        if (char.StatsAffected) {
            for (const category in char.StatsAffected) {
                for (const passiveName in char.StatsAffected[category]) {
                    for (const statName in char.StatsAffected[category][passiveName]) {
                        if (Array.isArray(char.StatsAffected[category][passiveName][statName])) {
                            char.StatsAffected[category][passiveName][statName] = new Set(char.StatsAffected[category][passiveName][statName]);
                        }
                    }
                }
            }
        }
    });

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
        const charactersToSave = JSON.parse(JSON.stringify(characters));
        charactersToSave.forEach(char => {
            ExternalDataManager.rollStats.forEach(statName => {
                if (char[statName]) {
                    const { maxExperience, total, ...rest } = char[statName];
                    char[statName] = rest;
                }
            });
            // Convert Sets to Arrays for saving within the new StatChoices/StatsAffected structure
            if (char.StatsAffected) {
                for (const category in char.StatsAffected) {
                    for (const passiveName in char.StatsAffected[category]) {
                        for (const statName in char.StatsAffected[category][passiveName]) {
                            if (char.StatsAffected[category][passiveName][statName] instanceof Set) {
                                char.StatsAffected[category][passiveName][statName] = Array.from(char.StatsAffected[category][passiveName][statName]);
                            }
                        }
                    }
                }
            }
            delete char.maxHealth;
            delete char.maxMana;
            delete char.maxRacialPower;
            delete char.ac;
        });

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
    characters[0].maxHealth = calculateMaxHealth(characters[0], characters[0].level, characters[0].healthBonus);
    characters[0].maxMana = calculateMaxMana(characters[0], characters[0].level);
    characters[0].maxRacialPower = calculateMaxRacialPower(characters[0].level);
    // Initialize AC based on armorBonus for the first character
    characters[0].ac = characters[0].armorBonus;

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