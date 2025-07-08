const Auth_CLIENT_ID = '527331500399-1kmgdnjjlbkv7jtkmrsqh1mlbga6fomf.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyBLG6Y30t5fZ-jWSeRbR0tWKgqCN4cjTGg';

const SCOPES = 'https://www.googleapis.com/auth/drive.file'; // Scope for accessing files created/opened by this app
const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
// IMPORTANT: Replace with the actual origin where your app is hosted (e.g., 'https://your-username.github.io/your-repo-name')
const ORIGIN = window.location.origin;

import { googleDriveFileFetcher } from './fetch.js';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let currentGoogleDriveFileId = null; // To store the ID of the currently loaded Google Drive file

const defaultStatMaxExperience = 7;

// Function to calculate max experience for a given level
function calculateLevelMaxExperience(level) {
    return 100;
}

// List of available classes for the multi-select dropdown
const classOptionsList = ["Archer", "Assassin", "Bard", "Berserker", "Brawler", "Knight", "Mage", "Martial artist", "Oracle", "Paladin", "Priest"];

// Define class specializations
const classSpecializationsMap = {
    "Mage": ["Chaos", "Dark", "Thunder"],
    "Knight": ["Order"],
    "Martial artist": ["Apprentice", "Warrior", "Master", "Grand Master", "Lord", "King"],
};

// Race health multipliers
const raceHealthMultipliers = {
    "Architect": 0.70,
    "Demi-humans": 1.00,
    "Dimensional": 1.50,
    "Dragonkin": 0.75,
    "Dwarf": 1.20,
    "Elf": 0.80,
    "Gnome": 0.80,
    "Human": 1.00,
    "Mutant": 0.75,
    "Noki": 0.90,
    "Succubus": 0.75,
    "": 1.00 // Default for no race selected
};

// List of data for easy iteration
let fetchedData = {};

async function externalData() {
    await googleDriveFileFetcher.fetchGoogleSheetRange(
        googleDriveFileFetcher.My_Sheet.Races.gid,
        googleDriveFileFetcher.My_Sheet.Races.range
    ).then(arr => {
        // Clone the first row to avoid reference issues
        const head = [...arr[0]];                    // shallow copy
        const statsCopy = [...arr[0]];               // another shallow copy

        const health = head[1];
        delete head[1];                              // remove health column from head
        arr.splice(0, 1);                            // remove the header row from array

        fetchedData['Stats'] = statsCopy;
        fetchedData['Roll'] = head;

        arr.forEach(value => {
            const race = value[0];
            fetchedData[race] = {
                Stats: {
                    Roll: {}
                }
            };

            fetchedData[race]['Stats'][health] = value[1];

            let index = 2;
            head.forEach(statName => {
                fetchedData[race]['Stats']['Roll'][statName] = value[index];
                ++index;
            });
        });
    });
}

await externalData();
console.log(fetchedData);

// Function to calculate max health based on race, level, and bonus
function calculateMaxHealth(race, level, healthBonus) {
    const multiplier = raceHealthMultipliers[race] || 1.00; // Default to 1 if race not found
    return Math.floor(100 * multiplier * level) + (healthBonus || 0); // Add healthBonus
}

// Function to calculate max magic based on level
function calculateMaxMagic(level) {
    return level * 100;
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

const defaultCharacterData = function() { 
    const firstRace = Object.keys(fetchedData)[0];

    let newCharacter = ({
        name: '',
        class: [],
        specialization: [],
        race: firstRace,
        level: 1,
        levelExperience: 0,
        levelMaxExperience: calculateLevelMaxExperience(1),
        hp: 100,
        maxHp: 100,
        healthBonus: 0,
        currentMagicPoints: 100,
        maxMagicPoints: 100,
        racialPower: 100,
        maxRacialPower: 100,
        ac: 0,
        armorBonus: 0,
        skills: '',
        personalNotes: '',
        // New inventory sections
        weaponInventory: [],
        armorInventory: [],
        generalInventory: [],
        // Section visibility states - NEW
        sectionVisibility: {
            'basic-info-content': true,
            'player-stats-content': true,
            'health-combat-content': true,
            'skills-content': true,
            'weapon-inventory-content': true,
            'armor-inventory-content': true,
            'general-inventory-content': true,
        }
    })

    fetchedData[firstRace]['Stats']['Roll'].forEach(statName => {
        const result = roll(minRollStat, maxRollStat);
        newCharacter[statName] = { value: result, racialChange: 0, equipment: 0, temporary: 0, experience: 0, maxExperience: defaultStatMaxExperience, total: result };
    });

    return newCharacter;
};

// Array to hold all character sheets
let characters = [];
// Index of the currently active character sheet
let currentCharacterIndex = 0;

// Flag to track if there are unsaved changes
let hasUnsavedChanges = false;

// Getter to easily access the current character
const character = new Proxy({}, {
    get: function(target, prop) {
        return characters[currentCharacterIndex][prop];
    },
    set: function(target, prop, value) {
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
"HP": "hp",
"Health": "hp",
"MaxHP": "maxHp",
"MaxHealth": "maxHp",
"MagicPoints": "currentMagicPoints",
"MaxMagicPoints": "maxMagicPoints",
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
    const racialChange = parseFloat(stat.racialChange) || 0;
    const equipment = parseFloat(stat.equipment) || 0;
    const temporary = parseFloat(stat.temporary) || 0;

    // Calculate total based on the formula: Value + Racial change + Equipment + Temporary
    return value + racialChange + equipment + temporary;
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
        fetchedData[char.race]['Stats']['Roll'].forEach(statName => {
            if (char[statName]) {
                const { maxExperience, total, ...rest } = char[statName];
                char[statName] = rest; // Assign the object without maxExperience and total
            }
        });
        // Exclude calculated properties (maxHp, maxMagicPoints, maxRacialPower, ac) from the saved data
        delete char.maxHp;
        delete char.maxMagicPoints;
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
                characters = loadedData.map(loadedChar => {
                    const newChar = defaultCharacterData(); // Start with a fresh default structure
                    // Deep merge to preserve structure for new/missing sub-properties
                    for (const key in newChar) {
                        if (loadedChar.hasOwnProperty(key)) {
                            if (key === 'class') {
                                newChar.class = Array.isArray(loadedChar.class) ? loadedChar.class : [];
                            } else if (key === 'specialization') {
                                newChar.specialization = Array.isArray(loadedData.specialization) ? loadedData.specialization : [];
                            } else if (typeof newChar[key] === 'object' && newChar[key] !== null) {
                                if (typeof loadedChar[key] === 'object' && loadedData[key] !== null) {
                                    newChar[key] = {
                                        ...newChar[key],
                                        ...loadedChar[key]
                                    };
                                    newChar[key].total = calculateTotal(key); // Recalculate total
                                    if (typeof newChar[key].maxExperience === 'undefined' || newChar[key].maxExperience === null) {
                                        newChar[key].maxExperience = defaultStatMaxExperience;
                                    }
                                } else {
                                    newChar[key] = {
                                        ...newChar[key],
                                        value: parseFloat(loadedChar[key]) || newChar[key].value
                                    };
                                    newChar[key].total = calculateTotal(key);
                                }
                            } else {
                                newChar[key] = loadedData[key];
                            }
                        }
                    }
                    // Handle new inventory arrays, providing defaults if missing
                    newChar.weaponInventory = loadedChar.weaponInventory || [];
                    newChar.armorInventory = loadedChar.armorInventory || [];
                    newChar.generalInventory = loadedChar.generalInventory || [];
                    // Handle section visibility - UPDATED
                    newChar.sectionVisibility = loadedChar.sectionVisibility || defaultCharacterData().sectionVisibility;


                    // Initialize originalDamage/originalMagicDamage if not present in loaded data
                    newChar.weaponInventory.forEach(weapon => {
                        if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
                        if (typeof weapon.originalMagicDamage === 'undefined') weapon.originalMagicDamage = weapon.magicDamage;
                    });

                    // Recalculate derived properties
                    newChar.maxHp = calculateMaxHealth(newChar.race, newChar.level, newChar.healthBonus);
                    newChar.maxMagicPoints = calculateMaxMagic(newChar.level);
                    newChar.maxRacialPower = calculateMaxRacialPower(newChar.level);
                    newChar.ac = newChar.armorBonus;

                    // Ensure current HP, Magic, and Racial Power don't exceed new max values
                    newChar.hp = Math.min(newChar.hp, newChar.maxHp);
                    newChar.currentMagicPoints = Math.min(newChar.currentMagicPoints, newChar.maxMagicPoints);
                    newChar.racialPower = Math.min(newChar.racialPower, newChar.maxRacialPower);

                    return newChar;
                });
                currentCharacterIndex = 0; // Select the first loaded character
            } else {
                // If a single character object was loaded (old format), convert it to an array
                const newChar = defaultCharacterData();
                for (const key in newChar) {
                    if (loadedData.hasOwnProperty(key)) {
                        if (key === 'class') {
                            newChar.class = Array.isArray(loadedData.class) ? loadedData.class : [];
                        } else if (key === 'specialization') {
                            newChar.specialization = Array.isArray(loadedData.specialization) ? loadedData.specialization : [];
                        } else if (typeof newChar[key] === 'object' && newChar[key] !== null) {
                            if (typeof loadedData[key] === 'object' && loadedData[key] !== null) {
                                newChar[key] = {
                                    ...newChar[key],
                                    ...loadedData[key]
                                };
                                newChar[key].total = calculateTotal(key);
                                if (typeof newChar[key].maxExperience === 'undefined' || newChar[key].maxExperience === null) {
                                    newChar[key].maxExperience = defaultStatMaxExperience;
                                }
                            } else {
                                newChar[key] = {
                                    ...newChar[key],
                                    value: parseFloat(loadedData[key]) || newChar[key].value
                                };
                                newChar[key].total = calculateTotal(key);
                            }
                        } else {
                            newChar[key] = loadedData[key];
                        }
                    }
                }
                // If loading an old file, initialize new inventory arrays as empty
                newChar.weaponInventory = loadedData.weaponInventory || [];
                newChar.armorInventory = loadedData.armorInventory || [];
                newChar.generalInventory = loadedData.generalInventory || [];
                // Handle section visibility - UPDATED
                newChar.sectionVisibility = loadedData.sectionVisibility || defaultCharacterData().sectionVisibility;

                // Initialize originalDamage/originalMagicDamage if not present in loaded data
                newChar.weaponInventory.forEach(weapon => {
                    if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
                    if (typeof weapon.originalMagicDamage === 'undefined') weapon.magicDamage = weapon.magicDamage;
                });

                newChar.maxHp = calculateMaxHealth(newChar.race, newChar.level, newChar.healthBonus);
                newChar.maxMagicPoints = calculateMaxMagic(newChar.level);
                newChar.maxRacialPower = calculateMaxRacialPower(newChar.level);
                newChar.ac = newChar.armorBonus;
                newChar.hp = Math.min(newChar.hp, newChar.maxHp);
                newChar.currentMagicPoints = Math.min(newChar.currentMagicPoints, newChar.maxMagicPoints);
                newChar.racialPower = Math.min(newChar.racialPower, newChar.maxRacialPower);

                characters = [newChar];
                currentCharacterIndex = 0;
            }
            updateDOM(); // Update the UI with loaded data
            populateCharacterSelector(); // Repopulate the selector
            currentGoogleDriveFileId = null;
            showStatusMessage(`Character data loaded from JSON file!`);
            console.log(`Character data loaded from JSON file!`);
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

    // Handle race selector placeholder color and update max HP
    const raceSelect = document.getElementById('race');
    raceSelect.value = character.race; // Set the selected race
    if (character.race === '') {
        raceSelect.classList.add('select-placeholder-text');
    } else {
        raceSelect.classList.remove('select-placeholder-text');
    }
    // Recalculate maxHp when race is updated in DOM
    character.maxHp = calculateMaxHealth(character.race, character.level, character.healthBonus);
    // Ensure current HP doesn't exceed new max HP when race changes
    character.hp = Math.min(character.hp, character.maxHp);


    // Handle custom multi-select for class
    const classDisplayInput = document.getElementById('class-display');
    const classDropdownOptions = document.getElementById('class-dropdown-options');

    // Set the displayed value for classes
    classDisplayInput.value = character.class.join(', ');

    // Populate and update checkboxes in the dropdown options
    classDropdownOptions.innerHTML = ''; // Clear existing options
    classOptionsList.forEach(className => {
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


    // Player Stats
    const playerStatsContainer = document.getElementById('player-stats-container').querySelector('tbody');
    playerStatsContainer.innerHTML = ''; // Clear existing rows

    fetchedData['Stats']['Roll'].forEach(statName => {
        const statData = character[statName];
        const row = document.createElement('tr');
        row.className = 'hover:bg-gray-50 dark:hover:bg-gray-700'; // Add hover effect to rows
        row.innerHTML = `
            <td class="px-2 py-1 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 capitalize">${statName}</td>
            <td class="px-2 py-1 whitespace-nowrap">
                <input type="number" id="${statName}-value" name="${statName}-value" min="0" value="${statData.value}" class="stat-input" />
            </td>
            <td class="px-2 py-1 whitespace-nowrap">
                <input type="number" id="${statName}-racialChange" name="${statName}-racialChange" value="${statData.racialChange}" class="stat-input" />
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
                    <span class="px-1 py-1 border-y border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs">/</span>
                    <input type="number" id="${statName}-maxExperience" name="${statName}-maxExperience" min="1" value="${statData.maxExperience}" readonly class="stat-input rounded-l-none" />
                </div>
            </td>
            <td class="px-2 py-1 whitespace-nowrap">
                <input type="number" id="${statName}-total" name="${statName}-total" value="${statData.total}" readonly class="stat-input" />
            </td>
        `;
        playerStatsContainer.appendChild(row);
    });


    // Health & Combat
    document.getElementById('hp').value = character.hp;
    document.getElementById('maxHp').value = character.maxHp; // This now includes healthBonus
    document.getElementById('healthBonus').value = character.healthBonus; // Populate the separate healthBonus input
    document.getElementById('racialPower').value = character.racialPower; // Populate racialPower
    document.getElementById('maxRacialPower').value = character.maxRacialPower; // Populate maxRacialPower
    document.getElementById('currentMagicPoints').value = character.currentMagicPoints; // Populate currentMagicPoints
    document.getElementById('maxMagicPoints').value = character.maxMagicPoints; // Populate maxMagicPoints
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
    }
    else 
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
    fetchedData['stats']['roll'].forEach(statName => {
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

    for (const stat of fetchedData['Stats']['roll']) {
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
            if (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
                character[statName].value++; // Increment the stat's value
                character[statName].experience -= character[statName].maxExperience; // Reset experience
                // Update the DOM for value and experience immediately
                document.getElementById(`${statName}-value`).value = character[statName].value;
                document.getElementById(`${statName}-experience`).value = character[statName].experience;
            }
            // Always update the displayed experience, even if it didn't trigger a level up
            document.getElementById(`${statName}-experience`).value = character[statName].experience;

        } else if (subProperty === 'maxExperience') {
            // Ensure maxExperience is at least 1
            character[statName].maxExperience = Math.max(1, newValue);
            // Update the DOM for maxExperience immediately
            document.getElementById(`${statName}-maxExperience`).value = character[statName].maxExperience;
            // Re-evaluate experience if maxExperience changed and current experience is sufficient
            if (character[statName].experience >= character[statName].maxExperience && character[statName].maxExperience > 0) {
                character[statName].value++;
                character[statName].experience -= character[statName].maxExperience;
                document.getElementById(`${statName}-value`).value = character[statName].value;
                document.getElementById(`${statName}-experience`).value = character[statName].experience;
            }

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
        // For other non-stat inputs (name, level, hp, ac, skills, inventory, race, healthBonus, currentMagicPoints, racialPower, personalNotes)
        // The 'class-display' input is read-only and handled by custom logic, so it's excluded here.
        if (id === 'levelExperience') {
            character.levelExperience = newValue;
            if (character.levelExperience >= character.levelMaxExperience) {
                character.level++;
                character.levelExperience -= character.levelMaxExperience;
                character.levelMaxExperience = calculateLevelMaxExperience(character.level);
                document.getElementById('level').value = character.level;
                document.getElementById('levelMaxExperience').value = character.levelMaxExperience;
            }
            document.getElementById('levelExperience').value = character.levelExperience;
        } else if (id === 'level') {
            character.level = newValue;
            character.levelMaxExperience = calculateLevelMaxExperience(character.level);
            document.getElementById('levelMaxExperience').value = character.levelMaxExperience;
            // Also update maxHp, maxMagicPoints and maxRacialPower when level changes
            character.maxHp = calculateMaxHealth(character.race, character.level, character.healthBonus);
            character.hp = Math.min(character.hp, character.maxHp); // Adjust current HP if it exceeds new max
            document.getElementById('maxHp').value = character.maxHp;
            document.getElementById('hp').value = character.hp;

            character.maxMagicPoints = calculateMaxMagic(character.level);
            character.currentMagicPoints = Math.min(character.currentMagicPoints, character.maxMagicPoints); // Adjust current Magic if it exceeds new max
            document.getElementById('maxMagicPoints').value = character.maxMagicPoints;
            document.getElementById('currentMagicPoints').value = character.currentMagicPoints;

            character.maxRacialPower = calculateMaxRacialPower(character.level);
            character.racialPower = Math.min(character.racialPower, character.maxRacialPower); // Adjust current Racial Power if it exceeds new max
            document.getElementById('maxRacialPower').value = character.maxRacialPower;
            document.getElementById('racialPower').value = character.racialPower;

        } else if (id === 'race') {
            character.race = newValue;
            const raceSelect = document.getElementById('race');
            if (newValue === '') {
                raceSelect.classList.add('select-placeholder-text');
            } else {
                raceSelect.classList.remove('select-placeholder-text');
            }
            // Update maxHp when race changes
            character.maxHp = calculateMaxHealth(character.race, character.level, character.healthBonus);
            character.hp = Math.min(character.hp, character.maxHp); // Adjust current HP if it exceeds new max
            document.getElementById('maxHp').value = character.maxHp;
            document.getElementById('hp').value = character.hp;
        } else if (id === 'hp') { // Handle current HP input
            character.hp = Math.min(newValue, character.maxHp); // Ensure current HP doesn't exceed max HP
            document.getElementById('hp').value = character.hp;
        } else if (id === 'currentMagicPoints') { // Handle current Magic input (renamed)
            character.currentMagicPoints = Math.min(newValue, character.maxMagicPoints); // Ensure current Magic doesn't exceed max Magic
            document.getElementById('currentMagicPoints').value = character.currentMagicPoints;
        } else if (id === 'racialPower') { // Handle current Racial Power input
            character.racialPower = Math.min(newValue, character.maxRacialPower); // Ensure current Racial Power doesn't exceed max Racial Power
            document.getElementById('racialPower').value = character.racialPower;
        } else if (id === 'healthBonus') { // Handle healthBonus input
            character.healthBonus = newValue;
            // Recalculate maxHp when healthBonus changes
            character.maxHp = calculateMaxHealth(character.race, character.level, character.healthBonus);
            character.hp = Math.min(character.hp, character.maxHp); // Adjust current HP if it exceeds new max
            document.getElementById('maxHp').value = character.maxHp;
            document.getElementById('hp').value = character.hp;
        } else if (id === 'armorBonus') { // Handle armorBonus input
            character.armorBonus = newValue;
            character.ac = character.armorBonus; // Update AC based on armorBonus
            document.getElementById('ac').value = character.ac; // Update readonly AC input
        } else if (id === 'personalNotes') { // Handle personalNotes input
            character.personalNotes = newValue;
        }
        else if (id !== 'class-display' && id !== 'specialization-display') { // Exclude specialization-display
            character[name || id] = newValue;
        }
        // If any of these core stats change, re-render weapon inventory to update calculated damage values
        renderWeaponInventory();
    }
    hasUnsavedChanges = true; // Mark that there are unsaved changes
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
}

// Function to update the specialization dropdown options and filter selected specializations
function updateSpecializationDropdownAndData() {
    const specializationDisplayInput = document.getElementById('specialization-display');
    const specializationDropdownOptions = document.getElementById('specialization-dropdown-options');

    // 1. Determine available specializations based on selected classes
    const availableSpecializationsSet = new Set();
    character.class.forEach(selectedClass => {
        if (classSpecializationsMap[selectedClass]) {
            classSpecializationsMap[selectedClass].forEach(spec => availableSpecializationsSet.add(selectedClass + "→" + spec));
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
            hasUnsavedChanges = false; // Reset unsaved changes flag after switching
        }, () => {
            // If user cancels, revert the dropdown selection
            event.target.value = currentCharacterIndex;
        });
    } else {
        currentCharacterIndex = parseInt(event.target.value);
        updateDOM(); // Update the UI with the new character's data
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
    }
}

// Functions to add new items to inventories
function addWeapon() {
    character.weaponInventory.push({ name: '', type: '', material: '', requirement: '', requiredStat: '', accuracy: 100, damage: '', magicDamage: '', magicType: '', effect: '', value: 0, use: false }); // 'use' is now boolean
    renderWeaponInventory();
    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

function addArmor() {
    character.armorInventory.push({ name: '', location: '', material: '', requirement: '', requiredStat: '', defense: 0, magicDefense: 0, magicType: '', effect: '', value: 0, equipped: false });
    renderArmorInventory();
    hasUnsavedChanges = true; // Mark that there are unsaved changes
}

function addGeneralItem() {
    character.generalInventory.push({ name: '', type: '', effect: '', accuracy: 0, amount: 0, valuePerUnit: 0 });
    renderGeneralInventory();
    hasUnsavedChanges = true; // Mark that there are unsaved changes
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
}

// Function to reset the current character to default data
function resetCurrentCharacter() {
    showConfirmationModal("Are you sure you want to reset the current character? All data will be lost.", () => {
        characters[currentCharacterIndex] = defaultCharacterData();
        characters[currentCharacterIndex].name = `Character ${currentCharacterIndex + 1}`; // Keep current character name convention
        updateDOM();
        showStatusMessage("Current character reset successfully!");
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
        return;
    }

    showConfirmationModal(`Are you sure you want to delete "${character.name || `Character ${currentCharacterIndex + 1}`}?" This action cannot be undone.`, () => {
        characters.splice(currentCharacterIndex, 1); // Remove the current character

        // Adjust currentCharacterIndex if the last character was deleted
        if (currentCharacterIndex >= characters.length) {
            currentCharacterIndex = characters.length - 1;
        }
        
        updateDOM();
        populateCharacterSelector(); // Re-populate selector after deletion
        showStatusMessage("Character deleted successfully!");
        hasUnsavedChanges = false; // Reset unsaved changes flag after deletion
    });
}


// Function to toggle dropdown visibility
function toggleDropdown(menuId) {
    document.getElementById(menuId).classList.toggle('hidden');
}

const statusMessageElement = document.getElementById('status-message');
const googleDriveAuthStatusSpan = document.getElementById('google-drive-auth-status');
const authorizeGoogleDriveButton = document.getElementById('authorize_google_drive_button');
const signoutGoogleDriveButton = document.getElementById('signout_google_drive_button');
const googleDriveModal = document.getElementById('google-drive-modal');
const googleDriveFileList = document.getElementById('google-drive-file-list');
const googleDriveModalStatus = document.getElementById('google-drive-modal-status');
const confirmationModal = document.getElementById('confirmation-modal');
const confirmMessage = document.getElementById('confirm-message');
const confirmOkBtn = document.getElementById('confirm-ok-btn');
const confirmCancelBtn = document.getElementById('confirm-cancel-btn');


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
function showConfirmationModal(message, onConfirm, onCancel = () => {}) {
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
 * Initializes Google API client libraries.
 */
function gapiLoaded() {
    gapi.load('client', initializeGapiClient);
}

/**
 * Initializes the Google Drive API client.
 */
async function initializeGapiClient() {
    await gapi.client.init({
        apiKey: GOOGLE_API_KEY,
        discoveryDocs: [DISCOVERY_DOC],
    });
    gapiInited = true;
    maybeEnableGoogleDriveButtons();
}

/**
 * Initializes Google Identity Services (GIS) client for authorization.
 */
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: Auth_CLIENT_ID,
        scope: SCOPES,
        callback: '', // Will be set dynamically before request
        redirect_uri: ORIGIN
    });
    gisInited = true;
    maybeEnableGoogleDriveButtons();
}

/**
 * Enables Google Drive buttons if both GAPI and GIS are initialized.
 * Also updates the UI based on current authorization status and local storage.
 */
function maybeEnableGoogleDriveButtons() {
    if (gapiInited && gisInited) {
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
    tokenClient.callback = async (resp) => {
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
    tokenClient.requestAccessToken({ prompt: 'consent' });
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
            fetchedData['Stats']['Roll'].forEach(statName => {
                if (char[statName]) {
                    const { maxExperience, total, ...rest } = char[statName];
                    char[statName] = rest;
                }
            });
            delete char.maxHp;
            delete char.maxMagicPoints;
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
            characters = loadedData.map(loadedChar => {
                const newChar = defaultCharacterData();
                for (const key in newChar) {
                    if (loadedChar.hasOwnProperty(key)) {
                        if (key === 'class') {
                            newChar.class = Array.isArray(loadedChar.class) ? loadedChar.class : [];
                        } else if (key === 'specialization') {
                            newChar.specialization = Array.isArray(loadedChar.specialization) ? loadedChar.specialization : [];
                        } else if (typeof newChar[key] === 'object' && newChar[key] !== null) {
                            if (typeof loadedChar[key] === 'object' && loadedChar[key] !== null) {
                                newChar[key] = {
                                    ...newChar[key],
                                    ...loadedChar[key]
                                };
                                newChar[key].total = calculateTotal(key);
                                if (typeof newChar[key].maxExperience === 'undefined' || newChar[key].maxExperience === null) {
                                    newChar[key].maxExperience = defaultStatMaxExperience;
                                }
                            } else {
                                newChar[key] = {
                                    ...newChar[key],
                                    value: parseFloat(loadedChar[key]) || newChar[key].value
                                };
                                newChar[key].total = calculateTotal(key);
                            }
                        } else {
                            newChar[key] = loadedChar[key];
                        }
                    }
                }
                newChar.weaponInventory = loadedChar.weaponInventory || [];
                newChar.armorInventory = loadedChar.armorInventory || [];
                newChar.generalInventory = loadedChar.generalInventory || [];
                newChar.sectionVisibility = loadedChar.sectionVisibility || defaultCharacterData().sectionVisibility;


                newChar.weaponInventory.forEach(weapon => {
                    if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
                    if (typeof weapon.originalMagicDamage === 'undefined') weapon.originalMagicDamage = weapon.magicDamage;
                });

                newChar.maxHp = calculateMaxHealth(newChar.race, newChar.level, newChar.healthBonus);
                newChar.maxMagicPoints = calculateMaxMagic(newChar.level);
                newChar.maxRacialPower = calculateMaxRacialPower(newChar.level);
                newChar.ac = newChar.armorBonus;
                newChar.hp = Math.min(newChar.hp, newChar.maxHp);
                newChar.currentMagicPoints = Math.min(newChar.currentMagicPoints, newChar.maxMagicPoints);
                newChar.racialPower = Math.min(newChar.racialPower, newChar.maxRacialPower);

                return newChar;
            });
            currentCharacterIndex = 0;
        } else {
            const newChar = defaultCharacterData();
            for (const key in newChar) {
                if (loadedData.hasOwnProperty(key)) {
                    if (key === 'class') {
                        newChar.class = Array.isArray(loadedData.class) ? loadedData.class : [];
                    } else if (key === 'specialization') {
                        newChar.specialization = Array.isArray(loadedData.specialization) ? loadedData.specialization : [];
                    } else if (typeof newChar[key] === 'object' && newChar[key] !== null) {
                        if (typeof loadedData[key] === 'object' && loadedData[key] !== null) {
                            newChar[key] = {
                                ...newChar[key],
                                ...loadedData[key]
                            };
                            newChar[key].total = calculateTotal(key);
                            if (typeof newChar[key].maxExperience === 'undefined' || newChar[key].maxExperience === null) {
                                newChar[key].maxExperience = defaultStatMaxExperience;
                            }
                        } else {
                            newChar[key] = {
                                ...newChar[key],
                                value: parseFloat(loadedData[key]) || newChar[key].value
                            };
                            newChar[key].total = calculateTotal(key);
                        }
                    } else {
                        newChar[key] = loadedData[key];
                    }
                }
            }
            newChar.weaponInventory = loadedData.weaponInventory || [];
            newChar.armorInventory = loadedData.armorInventory || [];
            newChar.generalInventory = loadedData.generalInventory || [];
            newChar.sectionVisibility = loadedData.sectionVisibility || defaultCharacterData().sectionVisibility;

            newChar.weaponInventory.forEach(weapon => {
                if (typeof weapon.originalDamage === 'undefined') weapon.originalDamage = weapon.damage;
                if (typeof weapon.originalMagicDamage === 'undefined') weapon.originalMagicDamage = weapon.magicDamage;
            });

            newChar.maxHp = calculateMaxHealth(newChar.race, newChar.level, newChar.healthBonus);
            newChar.maxMagicPoints = calculateMaxMagic(newChar.level);
            newChar.maxRacialPower = calculateMaxRacialPower(newChar.level);
            newChar.ac = newChar.armorBonus;
            newChar.hp = Math.min(newChar.hp, newChar.maxHp);
            newChar.currentMagicPoints = Math.min(newChar.currentMagicPoints, newChar.maxMagicPoints);
            newChar.racialPower = Math.min(newChar.racialPower, newChar.maxRacialPower);

            characters = [newChar];
            currentCharacterIndex = 0;
        }
        currentGoogleDriveFileId = fileId; // Set the current file ID
        updateDOM();
        populateCharacterSelector();
        showStatusMessage("Character data loaded from Google Drive!");
        console.log("Character data loaded from Google Drive!");
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
        '#name, #level, #levelExperience, #race, #hp, #currentMagicPoints, #racialPower, #skills, #healthBonus, #armorBonus'
    );
    inputs.forEach(input => {
        if (!input.readOnly) {
            input.addEventListener('input', handleChange);
        }
    });

    // Attach listeners for stat table inputs using delegation
    document.getElementById('player-stats-container').addEventListener('input', function(event) {
        if (event.target.classList.contains('stat-input')) {
            handleChange(event);
        }
    });


    // Attach event listener for the custom class display input to toggle dropdown
    document.getElementById('class-display').addEventListener('click', toggleClassDropdown);

    // Attach event listeners to the dynamically created class checkboxes (delegation)
    document.getElementById('class-dropdown-options').addEventListener('change', function(event) {
        if (event.target.type === 'checkbox' && event.target.name === 'class-option') {
            handleClassCheckboxChange(event);
        }
    });

    // Attach event listener for the custom specialization display input to toggle dropdown
    document.getElementById('specialization-display').addEventListener('click', toggleSpecializationDropdown);

    // Attach event listeners to the dynamically created specialization checkboxes (delegation)
    document.getElementById('specialization-dropdown-options').addEventListener('change', function(event) {
        if (event.target.type === 'checkbox' && event.target.name === 'specialization-option') {
            handleSpecializationCheckboxChange(event);
        }
    });

    // Close dropdowns if clicked outside
    document.addEventListener('click', function(event) {
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

    document.getElementById('weapon-inventory-table').addEventListener('click', function(event) {
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(event);
        }
    });
    document.getElementById('armor-inventory-table').addEventListener('click', function(event) {
        if (event.target.classList.contains('remove-item-btn')) {
            removeItem(event);
        }
    });
    document.getElementById('general-inventory-table').addEventListener('click', function(event) {
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
    characters = [defaultCharacterData()];
    // Initialize maxHp, maxMagicPoints and maxRacialPower based on default race, level, and healthBonus for the first character
    characters[0].maxHp = calculateMaxHealth(characters[0].race, characters[0].level, characters[0].healthBonus);
    characters[0].maxMagicPoints = calculateMaxMagic(characters[0].level);
    characters[0].maxRacialPower = calculateMaxRacialPower(characters[0].level);
    // Initialize AC based on armorBonus for the first character
    characters[0].ac = characters[0].armorBonus;

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
}

// Initialize the application when the DOM is fully loaded
window.onload = async function() {
    initPage();
};