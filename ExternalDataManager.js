/**
 * @fileoverview ExternalDataManager provides a simplified interface for accessing
 * data fetched from external sources (e.g., Google Sheets) and stored internally.
 * It abstracts away the nested bracket notation and provides convenient methods
 * for common data retrieval patterns.
 */

// Assuming googleDriveFileFetcher is imported or globally available
// Example: import { googleDriveFileFetcher } from './fetch.js';
import { googleDriveFileFetcher } from './Fetch.js';

export const ExternalDataManager = {
    // Internal variable to store fetched data, making it part of the object
    _data: { Races:{}, Stats:{}, Roll:{}, Other: {}, Classes:{} },

    /**
     * Replaces placeholders like {0}, {1} in a string with provided arguments.
     *
     * @param {string} str The string containing placeholders.
     * @param {...*} args The values to insert into the string.
     * @returns {string} The formatted string.
     */
    formatString(str, ...args) {
        if (Array.isArray(args[0])) {
            args = args[0];
        }
            
        return str.replace(/{(\d+)}(%?)/g, (_, index, percent) => {
            let value = args[index];
            if (value == null) return 'null';

            if (percent === '%') {
                value = `${Number(value) * 100}%`;
            }

            return value;
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

    /**
     * Fetches external data from Google Sheets and populates the internal `_data` object.
     * This method is asynchronous and should be awaited before using other methods
     * that depend on the data.
     */
    async init() {
        try {
            await googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Sheet.Races.gid, googleDriveFileFetcher.My_Sheet.Races.range).then(arr => {
                // Remove the first element (empty string from the sheet)
                delete arr[0][0];
                const head = arr[0].filter(e => e != undefined); // The header row (e.g., ["", "Health", "Strength", "Agility", ...])
                this._data['Stats'] = [...arr[0].filter(e => e != undefined),
                     'BaseHealth','Mana', 'BaseMana', 'RacialPower', 'BaseRacialPower', 'naturalHealthRegen', 'naturalManaRegen', 'naturalRacialPowerRegen']; // Copy header for 'Stats'
                delete arr[0]; // Remove the header row from the main array
                //delete this._data['Stats'][0]; // Remove the empty string from 'Stats' array
                const health = head[0]; // Get the 'Health' column name
                this._data['Other'] = [health, 'BaseHealth', 'Mana', 'BaseMana', 'RacialPower', 'BaseRacialPower', 'naturalHealthRegen', 'naturalManaRegen', 'naturalRacialPowerRegen']; //By default 
                delete head[0]; // Remove 'Health' from the head array
                this._data['Roll'] = head.filter(e => e != undefined); // The remaining elements in head are the stat names for 'Roll' it will be used with a racial change generated

                arr.forEach(value => {
                    let race = value[0]; // The first element is the race name
                    if (race) { // Ensure race name is not empty
                        this._data['Races'][race] = {
                            Stats: {
                                Other: {},
                                Roll: {}
                            }
                        };

                        this._data['Races'][race]['Stats']['Other'][health] = this.parsePercent(value[1]); // Assign health multiplier
                        this._data['Races'][race]['Stats']['Other']['BaseHealth'] = 1;
                        this._data['Races'][race]['Stats']['Other']['Mana'] = 1;
                        this._data['Races'][race]['Stats']['Other']['BaseMana'] = 1;
                        this._data['Races'][race]['Stats']['Other']['RacialPower'] = 1;
                        this._data['Races'][race]['Stats']['Other']['BaseRacialPower'] = 1;
                        this._data['Races'][race]['Stats']['Other']['naturalHealthRegen'] = 1;
                        this._data['Races'][race]['Stats']['Other']['naturalManaRegen'] = 1;
                        this._data['Races'][race]['Stats']['Other']['naturalRacialPowerRegen'] = 1;
                        let index = 2; // Start from the third column for stats
                        head.forEach(statName => {
                            // Assign stat roll value for the current race
                            this._data['Races'][race]['Stats']['Roll'][statName] = this.parsePercent(value[index]);
                            ++index;
                        });
                    }
                });
            });

            await googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Sheet.Classes.gid, googleDriveFileFetcher.My_Sheet.Classes.range).then(arr => {
                arr.forEach(value => {
                    let charClass = value[0]; // The first element is the class name
                    if (charClass) { // Ensure class name is not empty
                        this._data['Classes'][charClass] = { Specs:[] }
                    }
                });
            });

            await googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Sheet.ClassesRelated.gid, googleDriveFileFetcher.My_Sheet.ClassesRelated.range).then(arr => {
                arr.forEach(value => {
                    let charClass = value[0]; // The first element is the class name
                    if (charClass) { // Ensure class name is not empty
                        this._data['Classes'][charClass]['Specs'].push(value[1]);
                    }
                });
            });

            const racialResponse = await fetch('./racial_data.json');
            const racialData = await racialResponse.json();

            for (const [characterKey, characterData] of Object.entries(racialData)) {
                const characterTarget = this._data[characterKey] ||= {};
                for (const [categoryKey, categoryData] of Object.entries(characterData)) {
                    const dataKeys = Object.keys(categoryData);
                    dataKeys.forEach(key => {
                        characterTarget[categoryKey][key] = categoryData[key];
                    });

                    if (categoryData.hasOwnProperty('manualPassives')) {
                        const abilities = categoryData.manualPassives || {};
                        for (const abilityData of Object.values(abilities)) {
                            const options = abilityData.options || {};
                            for (const optionData of Object.values(options)) {
                                if (optionData.applicableStats) {
                                    optionData.applicableStats = this.replaceDataStats(optionData.applicableStats);
                                }
                            }
                        }
                    }
                    if (categoryData.hasOwnProperty('fullAutoPassives')) {
                        const abilities = categoryData.fullAutoPassives || {};
                        for (const abilityData of Object.values(abilities)) {
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

            console.log("External data loaded successfully into ExternalDataManager.");
            console.log(this._data);
        } catch (error) {
            console.error("Error initializing ExternalDataManager with external data:", error);
            // Optionally, re-throw or handle the error more gracefully
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
     * @returns {Array<string>|null} An array of specialization names, or null if not found.
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
                    for (let i = 0; i < length; i++) {
                        const newOption = { ...template };
                        newOption.value = option.options.values[i];
                        newOption.label = this.formatString(option.label, Math.abs(newOption.value));
                        newOption.count = option.options.counts[i];
                        expandedOptions.push(newOption);
                    }
                } else {
                    // This is a standard option
                    template.label = this.formatString(option.label, Math.abs(template.value));
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

            // Iterate over each manual passive's key (e.g., "Stat Adjustments", "Mutation").
            for (const passiveName in raceData.manualPassives) {
                processedPassives[passiveName] = this.processedOptions(raceData.manualPassives[passiveName]);
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
                processedPassives[passiveName] = this.processedOptions(classData.manualPassives[passiveName]);
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

    processedUpgrades(name, ability, level) {
        // Deep copy the passive to avoid modifying the original data.
        const copy = JSON.parse(JSON.stringify(ability));
        const template = { ...copy };
        template['identifier'] = name;
        template['name'] = name;
        
        // Check if there are options to process.
        if (copy.upgrades) {
            delete template.upgrades; 
            const data = ability.upgrades.findLast(e => e.level <= level);

            if (data) {
                template['name'] = data.name;
                template.level = data.level

                if (copy.upgrades.some(u => u.formulas && u.formulas.some(f => f.values))) {
                    const length = data.formulas.length;

                    for(let index = 0; index < length; ++index) {
                        const valuesLength = data.formulas[index]['values'].length;
                        for(let index2 = 0; index2 < valuesLength; ++index2) {
                            const value = data.formulas[index]['values'][index2];
                            template.formulas[index]['values'][index2] = value;
                        }
                    }
                } else if (copy.upgrades.some(u => u.values)) {
                    const length = data.values.length;
                    for(let index = 0; index < length; ++index) {
                        template.values[index] = data.values[index];
                    }
                }
            }
        }

        template.description = this.formatString(template.description, this.processedFormulaValues(template));
        
        return template;
    },

    /**
     * Retrieves the fuall auto passive choices for a specific class.
     * @param {string} className The name of the class.
     * @returns {Object|null} The full auto passive choices object for the class, or null if not found.
     */
    getRaceFullAutoPassives(raceName, level) {
        const raceData = this.getRaceData(raceName);
        if (raceData && raceData.fullAutoPassives) {
            const processedPassives = {};
            for (const passiveName in raceData.fullAutoPassives) {
                const ability = raceData.fullAutoPassives[passiveName];
                if (ability.level <= level) {
                    processedPassives[passiveName] = this.processedUpgrades(passiveName, raceData.fullAutoPassives[passiveName], level);
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
                    processedActives[activeName] = this.processedUpgrades(activeName, raceData.actives[activeName], level);
                }
            }

            return processedActives;
        }
        return null;
    }
};
