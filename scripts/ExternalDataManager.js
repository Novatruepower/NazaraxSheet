/**
 * @fileoverview ExternalDataManager provides a simplified interface for accessing
 * data fetched from external sources (e.g., Google Sheets) and stored internally.
 * It abstracts away the nested bracket notation and provides convenient methods
 * for common data retrieval patterns.
 */

// Assuming googleDriveFileFetcher is imported or globally available
// Example: import { googleDriveFileFetcher } from './fetch.js';
import { googleDriveFileFetcher } from './GoogleSheetFetch.js';

// Function to check if a formula has values
const hasFormulaValues = formula => formula.values && formula.values.length > 0;

    /**
 * Checks if at least one upgrade in the object has a specific property or value.
 * @param {object} upgradesObj The object containing upgrades.
 * @param {function} callback A function that returns a truthy value if the condition is met.
 * @returns {boolean} True if a match is found, otherwise false.
 */
function someInObject(upgradesObj, callback) {
    // Get an array of just the values from the object
    const values = Object.values(upgradesObj);
    
    // Iterate over the values
    for (const value of values) {
        // If the callback function returns true for any value, we have a match
        if (callback(value)) {
            return true; // Stop and return true immediately
        }
    }
    
    // If the loop finishes without a match, return false
    return false;
}

// Function to check if an upgrade has a formula with values
const upgradeHasFormulasWithValues = upgrade => {
    return someInObject(upgrade.formulas, hasFormulaValues);
};

const upgradesHasFormulasWithValues = ability => {
    return someInObject(ability.upgrades, upgradeHasFormulasWithValues);
};

const upgradesHasValues = ability => {
    return someInObject(ability.upgrades, hasFormulaValues);
};

export const ExternalDataManager = {
    // Internal variable to store fetched data, making it part of the object
    initFileName: "init_client",
    _data: { Races:{}, Stats:{}, Roll:{}, Other: {}, Classes:{} },

    /**
     * Replaces placeholders like {0}, {1} in a string with provided arguments.
     *
     * @param {string} str The string containing placeholders.
     * @param {Array<string>} dices The dices to insert into the string.
     * @param {...*} values The values to insert into the string.
     * @returns {string} The formatted string.
     */
    formatString(str, dices, ...values) {
        if (Array.isArray(values[0])) {
            values = values[0];
        }

        let chaine = str;

        if (dices && Object.keys(dices).length > 0) {
            //value of dices exemple: 1{d} {d}4
            chaine = chaine.replace(/(\d+)?\{d\}(\d+)?/g, (_, minIndex, maxIndex) => {
                let minValue = '';
                if (minIndex !== undefined) {
                    minValue = dices[minIndex].min;
                }

                let maxValue = '';

                if (maxIndex !== undefined) {
                    maxValue = dices[maxIndex].max;
                }

                return `${minValue || maxValue}`;
            });

            //dices exemple: {1d4} {1d} {d4}
            chaine = chaine.replace(/\{(\d*)d(\d*)\}/g, (_, minIndex, maxIndex) => {
                let minValue = '';
                if (minIndex !== '') {
                    minValue = dices[minIndex].min;
                }

                let maxValue = '';

                if (maxIndex !== '') {
                    maxValue = dices[maxIndex].max;
                }

                return `<code class="hljs">${minValue}d${maxValue}</code>`;
            });
        }
        
        //values in % exemple: {0}%
        return chaine.replace(/{(\d+)}(%?)/g, (_, index, percent) => {
            let value = values[index];
            if (value == null) return 'null';

            if (percent === '%') {
                value = `${Number(value) * 100}%`;
            }

            return value;
        });
    },

    convertNumberToSuperscript(number) {
        return `<sup class="footnote-reference">${number}</sup>`;
    },

    getHrefFootNotes(id, value) {
        return `<a href="#${id}-foot_notes-${value}" rel="nofollow" class="footnotes">${this.convertNumberToSuperscript(value)}</a>`;
    },

    formatHrefFootNotes(str, container, ...args) {
        if (!args)
            return str;

        if (Array.isArray(args[0])) {
            args = args[0];
        }

        return str.replace(/<a>(\d+)<\/a>/g, (_, index) => {
            let value = args[index];
            if (value == null) return 'null';

            return this.getHrefFootNotes(container.id, value);
        });
    },

    parsePercent(numberString) {
        return parseFloat(numberString.replace('%', '')) / 100;
    },

    replaceDataStat(statName) {
        switch (statName) {
            case 'Roll':
                return this.rollStats;
            case 'Other':
                return this.otherStats;
            case 'Stats':
                return this.stats;
            default:
                return [statName];
        }
    },

    replaceDataStats(statNames) {
        return statNames.flatMap(name => this.replaceDataStat(name));
    },

    sortByLevel(object) {
        return Object.fromEntries(
            Object.entries(object).sort(([, a], [, b]) => a.level - b.level)
        );
    },

    initJsonData(data) {
        for (const [characterKey, characterData] of Object.entries(data)) {
            const characterTarget = this._data[characterKey] ||= {};
            for (const [categoryKey, categoryData] of Object.entries(characterData)) {
                const dataKeys = Object.keys(categoryData);
                dataKeys.forEach(key => {
                    characterTarget[categoryKey][key] = categoryData[key];
                });

                if (categoryData.hasOwnProperty('manualPassives')) {
                    const abilityValues = Object.values(categoryData.manualPassives || {}); 
                    for (const abilityData of abilityValues) {
                        const options = abilityData.options || {};
                        for (const optionData of Object.values(options)) {
                            if (optionData.applicableStats) {
                                optionData.applicableStats = this.replaceDataStats(optionData.applicableStats);
                            }
                        }
                    }
                }
                if (categoryData.hasOwnProperty('regularPassives')) {
                    const abilityValues = Object.values(categoryData.regularPassives || {});
                    for (const abilityData of abilityValues) {
                        const formulas = abilityData.formulas || {};
                        for (const formulaData of Object.values(formulas)) {
                            if (formulaData.statsAffected) {
                                formulaData.statsAffected = this.replaceDataStats(formulaData.statsAffected);
                            }
                        }
                    }
                }
            }
        }

        Object.keys(this._data.Races).forEach(raceName => {
            if (this._data.Races[raceName].hasOwnProperty('actives')) {
                this._data.Races[raceName].actives = this.sortByLevel(this._data.Races[raceName].actives);
            }
        });
    },

    /**
     * Fetches external data from Google Sheets and populates the internal `_data` object.
     * This method is asynchronous and should be awaited before using other methods
     * that depend on the data.
     */
    async init() {
        try {
            // Fetch all data sources concurrently for maximum efficiency
            const [
                racesArr,
                classesArr,
                classesRelatedArr,
            ] = await Promise.all([
                googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Sheet.Races.gid, googleDriveFileFetcher.My_Sheet.Races.range),
                googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Sheet.Classes.gid, googleDriveFileFetcher.My_Sheet.Classes.range),
                googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Sheet.ClassesRelated.gid, googleDriveFileFetcher.My_Sheet.ClassesRelated.range),
            ]);

            // === Process Races Data ===
            delete racesArr[0][0];
            const raceHeader = racesArr[0].filter(e => e != undefined); 
            this._data['Stats'] = [...racesArr[0].filter(e => e != undefined),
                'BaseHealth', 'Mana', 'BaseMana', 'RacialPower', 'BaseRacialPower', 'naturalHealthRegen', 'naturalManaRegen', 'naturalRacialPowerRegen'];
            delete racesArr[0];
            const health = raceHeader[0];
            this._data['Other'] = [health, 'BaseHealth', 'Mana', 'BaseMana', 'RacialPower', 'BaseRacialPower', 'naturalHealthRegen', 'naturalManaRegen', 'naturalRacialPowerRegen'];
            delete raceHeader[0];
            this._data['Roll'] = raceHeader.filter(e => e != undefined);

            racesArr.forEach(value => {
                const race = value[0];
                if (race) {
                    this._data['Races'][race] = { Stats: { Other: {}, Roll: {} } };
                    this._data['Races'][race]['Stats']['Other'][health] = this.parsePercent(value[1]);
                    this._data['Races'][race]['Stats']['Other']['BaseHealth'] = 1;
                    this._data['Races'][race]['Stats']['Other']['Mana'] = 1;
                    this._data['Races'][race]['Stats']['Other']['BaseMana'] = 1;
                    this._data['Races'][race]['Stats']['Other']['RacialPower'] = 1;
                    this._data['Races'][race]['Stats']['Other']['BaseRacialPower'] = 1;
                    this._data['Races'][race]['Stats']['Other']['naturalHealthRegen'] = 1;
                    this._data['Races'][race]['Stats']['Other']['naturalManaRegen'] = 1;
                    this._data['Races'][race]['Stats']['Other']['naturalRacialPowerRegen'] = 1;

                    let index = 2;
                    raceHeader.forEach(statName => {
                        this._data['Races'][race]['Stats']['Roll'][statName] = this.parsePercent(value[index]);
                        ++index;
                    });
                }
            });

                        // === Process Classes Data ===
            classesArr.forEach(value => {
                const charClass = value[0];
                if (charClass) {
                    this._data['Classes'][charClass] = { Specs: [] };
                }
            });

            // === Process ClassesRelated Data ===
            classesRelatedArr.forEach(value => {
                const charClass = value[0];
                if (charClass && this._data['Classes'][charClass]) {
                    this._data['Classes'][charClass]['Specs'].push(value[1]);
                }
            });

        } catch (error) {
            console.error("Error initializing ExternalDataManager with external data:", error);
        }
    },

    // This is the new function for client-side loading
    async initClient() {
        try {
        const response = await fetch("./" + this.initFileName + ".json");

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();

        // Now, set the entire _data object with the fetched data
        // This assumes your JSON file contains the complete data structure
        this._data = data;
        
        console.log("External data loaded successfully on the client side.");
        console.log(this._data);
        return true;
        } catch (error) {
        console.error("Error loading external data from local file:", error);
        return false;
        }
    },

    /**
     * Provides direct access to the 'Roll' array from the internal data,
     * which typically contains the names of the stats
     * @returns {Array<string>} An array of stat names.
     */
    get stats() {
        return this._data.Stats;
    },

    /**
     * Provides direct access to the 'Roll' array from the internal data,
     * which typically contains the names of the stats that can be rolled.
     * @returns {Array<string>} An array of stat names.
     */
    get rollStats() {
        return this._data.Roll;
    },

    /**
     * Provides direct access to the 'otherStats' array from the internal data,
     * which typically contains some names
     * @returns {Array<string>} An array of stat names.
     */
    get otherStats() {
        return this._data.Other;
    },

    /**
     * Retrieves all data associated with a specific class from the internal data.
     * @param {string} className The name of the class (e.g., "Brawler").
     * @returns {Object|null} An object containing all data for the specified class,
     * or null if the class is not found.
     */
    getClassData(className) {
        if (typeof this._data === 'undefined' || !this._data.Classes.hasOwnProperty(className)) {
            console.warn(`ExternalDataManager: Class data for "${className}" not found. Call init() first or check class name.`);
            return null;
        }
        return this._data.Classes[className];
    },

    /**
     * Retrieves the specializations for a specific class from the internal data.
     * @param {string} className The name of the class.
     * @returns {Array<string>|null} An array of specializations names, or null if not found.
     */
    getClassSpecs(className) {
        const classData = this.getClassData(className);
        if (classData && classData.Specs) {
            return classData.Specs;
        }
        console.warn(`ExternalDataManager: Specializations for class "${className}" not found.`);
        return null;
    },

    /**
     * Retrieves all data associated with a specific race from the internal data.
     * @param {string} raceName The name of the race (e.g., "Human", "Elf").
     * @returns {Object|null} An object containing all data for the specified race,
     * or null if the race is not found.
     */
    getRaceData(raceName) {
        if (typeof this._data === 'undefined' || !this._data.Races.hasOwnProperty(raceName)) {
            console.warn(`ExternalDataManager: Race data for "${raceName}" not found. Call init() first or check race name.`);
            return null;
        }
        return this._data.Races[raceName];
    },

    getRaceDices(className) {
        const raceData = this.getRaceData(className);

        if (raceData && raceData.dices) {
            return raceData.dices;
        }
        
        return [];
    },

    getRaceFootNotes(raceName) {
        const raceData = this.getRaceData(raceName);

        if (!raceData)
            return {};

        return raceData.foot_notes;
    },

    /**
     * Retrieves all data associated with a specific race from the internal data.
     * @param {string} raceName The name of the race (e.g., "Human", "Elf").
     * @returns {Object|null} An object containing all data for the specified race,
     * or null if the race is not found.
     */
    getRaceStarterItems(raceName) {
        const raceData = this.getRaceData(raceName);

        if (!raceData)
            return {};

        return raceData["Starting items"];
    },

    /**
     * Retrieves the racial multiplier for a specific stat of a given race from the internal data.
     * @param {string} raceName The name of the race.
     * @param {string} statName The name of the stat (e.g., "Strength", "Agility").
     * @returns {number|null} The roll value for the stat, or null if not found.
     */
    getRacialChange(raceName, statName) {
        const raceData = this.getRaceData(raceName);
        let statValue = null;

        if (raceData && raceData.Stats) {
            const stats = raceData.Stats;
            const categories = Object.keys(raceData.Stats);

            for (const category of categories) {
                if (stats[category].hasOwnProperty(statName)) {
                    statValue = stats[category][statName];
                    break;
                }
            }
        }

        return statValue;
    },

    processedOptions(array) {
        // Deep copy the passive to avoid modifying the original data.
        const copy = JSON.parse(JSON.stringify(array));
        const expandedOptions = [];

        // Check if there are options to process.
        if (copy.options) {
            // Iterate over each choice within the passive's options array.
            for (const option of copy.options) {
                const template = { ...option };
                // Check if this option needs to be expanded (like the Demi-human case).
                // This is identified by the presence of a nested 'options' object with 'values'.
                if (option.options && option.options.values) {
                    // Remove the nested 'options' as it's a template for generation.
                    delete template.options; 

                    // Generate a concrete option for each value.
                    const length = option.options.values.length;
                    for (let i = 0; i < length; ++i) {
                        const newOption = { ...template };
                        newOption.value = option.options.values[i];
                        newOption.label = this.formatString(option.label, copy.dices, Math.abs(newOption.value));
                        newOption.count = option.options.counts[i];
                        expandedOptions.push(newOption);
                    }
                } else {
                    // This is a standard option
                    template.label = this.formatString(option.label, copy.dices, Math.abs(template.value));
                    expandedOptions.push(template);
                }
            }
            // Replace the original options with the new, fully expanded list.
            copy.options = expandedOptions;
        }
        
        return copy;
    },

    /**
     * Retrieves the manual passive choices for a specific race.
     * @param {string} raceName The name of the race.
     * @returns {Object|null} The manual passive choices object for the race, or null if not found.
     */
    getRaceManualPassives(raceName) {
        const raceData = this.getRaceData(raceName);
        if (raceData && raceData.manualPassives) {
            const processedPassives = {};
            const dices = raceData.dices;

            // Iterate over each manual passive's key (e.g., "Stat Adjustments", "Mutation").
            for (const passiveName in raceData.manualPassives) {
                const ability = raceData.manualPassives[passiveName];
                ability['dices'] = dices;
                processedPassives[passiveName] = this.processedOptions(ability);
            }

            return processedPassives;
        }
        return null;
    },

    /**
     * Retrieves the manual passive choices for a specific class.
     * @param {string} className The name of the class.
     * @returns {Object|null} The manual passive choices object for the class, or null if not found.
     */
    getClassManualPassives(className) {
        const classData = this.getClassData(className);
        if (classData && classData.manualPassives) {
            const processedPassives = {};

            for (const passiveName in classData.manualPassives) {
                const ability = classData.manualPassives[passiveName];
                ability['dices'] = dices;
                processedPassives[passiveName] = this.processedOptions(ability);
            }

            return processedPassives;
        }
        return null;
    },

    processedFormulaValues(ability) {
        const values = [];

        if (ability.formulas) {
            for (const formula of ability.formulas) {
                for (const value of formula.values) {
                    values.push(Math.abs(value));
                }
            }
        }
        else if (ability.values) {
            for (const value of ability.values) {
                values.push(Math.abs(value));
            }
        }

        return values;
    },

    findLastUpgrade(ability, currentLevel) {
        let lastMatch = ability;
        let lastLevelFound = ability.level;

        // Iterate over each key (level) and value (data) in the Map

        for (const dataName in ability.upgrades) {
            const data = ability.upgrades[dataName];
            const level = data["level"];
            if (level <= currentLevel && level > lastLevelFound) {
                lastLevelFound = level;
                data['name'] = dataName;
                lastMatch = data;
            }
        }

        return lastMatch;
    },

    processedUpgrades(name, ability, level) {
        // Deep copy the passive to avoid modifying the original data.
        const copy = JSON.parse(JSON.stringify(ability));
        const template = { ...copy };
        template['identifier'] = name;
        template['name'] = name;
        
        // Check if there are options to process.
        if (copy.upgrades) {
            const data = this.findLastUpgrade(template, level);
            delete template.upgrades; 

            if (data) {
                template['name'] = data.name;
                template.level = data.level

                if (data.description) {
                    template.description = data.description;
                }

                if (upgradesHasFormulasWithValues(copy)) {
                    const length = data.formulas.length;

                    for(let index = 0; index < length; ++index) {
                        const valuesLength = data.formulas[index]['values'].length;
                        for(let index2 = 0; index2 < valuesLength; ++index2) {
                            const value = data.formulas[index]['values'][index2];
                            template.formulas[index]['values'][index2] = value;
                        }
                    }
                } else if (upgradesHasValues(copy)) {
                    const length = data.values.length;
                    for(let index = 0; index < length; ++index) {
                        template.values[index] = data.values[index];
                    }
                }
            }
        }

        template.description = this.formatString(template.description, copy.dices, this.processedFormulaValues(template));
        
        return template;
    },

    /**
     * Retrieves the fuall auto passive choices for a specific class.
     * @param {string} className The name of the class.
     * @returns {Object|null} The full auto passive choices object for the class, or null if not found.
     */
    getRaceRegularPassives(raceName, level) {
        const raceData = this.getRaceData(raceName);
        if (raceData && raceData.regularPassives) {
            const processedPassives = {};
            for (const passiveName in raceData.regularPassives) {
                const ability = raceData.regularPassives[passiveName];

                if (ability.level <= level) {
                    ability['dices'] = raceData.dices;
                    processedPassives[passiveName] = this.processedUpgrades(passiveName, ability, level);
                }
            }

            return processedPassives;
        }
        return null;
    },

    /**
     * Retrieves the actives for a specific race.
     * @param {string} raceName The name of the race.
     * @returns {Object|null} actives object for the race, or null if not found.
     */
    getRaceActives(raceName, level) {
        const raceData = this.getRaceData(raceName);
        if (raceData && raceData.actives) {
            const processedActives = {};
            for (const activeName in raceData.actives) {
                const ability = raceData.actives[activeName];
                if (ability.level <= level) {
                    ability['dices'] = raceData.dices;
                    processedActives[activeName] = this.processedUpgrades(activeName, ability, level);
                }
            }

            return processedActives;
        }
        return null;
    },

    getClassRegularPassives(className, specializations, level) {
        const raceData = this.getClassData(className);
        if (raceData && raceData.regularPassives) {
            const processedPassives = {};
            const copy = JSON.parse(JSON.stringify(raceData.regularPassives));
            const regularPassives = {...copy};

            if (specializations[className]) {
                    specializations[className].forEach(spec => {
                    if (raceData[spec] && raceData[spec].regularPassives) {
                        const newData = raceData[spec].regularPassives;
                        for (const name in newData) {
                            regularPassives[name] = newData[name];
                        }
                    }
                });
            }

            for (const passiveName in regularPassives) {
                const ability = regularPassives[passiveName];
                if (ability.level <= level) {
                    ability['dices'] = raceData.dices;
                    processedPassives[passiveName] = this.processedUpgrades(passiveName, ability, level);
                }
            }

            return processedPassives;
        }
        return null;
    },
};
