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

    parsePercent(numberString) {
        return parseFloat(numberString.replace('%', '')) / 100;
    },

    replaceDataStat(statName) {
        switch (key) {
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
        const names = [];
        statNames.forEach(name => {
            names.push(this.readDataStat(name));
        });

        return names;
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
                const head = arr[0]; // The header row (e.g., ["", "Health", "Strength", "Agility", ...])
                this._data['Stats'] = [...arr[0], 'Mana', 'BaseHealth']; // Copy header for 'Stats'
                delete arr[0]; // Remove the header row from the main array
                delete this._data['Stats'][0]; // Remove the empty string from 'Stats' array
                const health = head[1]; // Get the 'Health' column name
                this._data['Other'] = [head[1], 'Mana', 'BaseHealth']; //By default 
                delete head[1]; // Remove 'Health' from the head array
                this._data['Roll'] = head; // The remaining elements in head are the stat names for 'Roll' it will be used with a racial change generated

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
                        this._data['Races'][race]['Stats']['Other']['Mana'] = 1;
                        this._data['Races'][race]['Stats']['Other']['BaseHealth'] = 1;
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

            // Fetch and load manual_passives_data.json
            const manualPassivesResponse = await fetch('./manual_passives_data.json');
            const manualPassivesData = await manualPassivesResponse.json();

            // Iterate through each character and their data
            for (const [characterKey, characterData] of Object.entries(manualPassivesData)) {
                // Iterate through each category for the character (e.g., 'passives', 'skills')
                for (const [categoryKey, categoryData] of Object.entries(characterData)) {
                    // Get the array of abilities, which is a collection of values
                    const abilities = Object.values(categoryData.manualPassives);

                    // Safely update the main data sheet with the processed abilities
                    if (this._data[characterKey] && this._data[characterKey][categoryKey]) {
                        this._data[characterKey][categoryKey].manualPassives = abilities;
                    } else {
                        // Create a new entry if one doesn't exist
                        if (!this._data[characterKey]) {
                            this._data[characterKey] = {};
                        }
                        this._data[characterKey][categoryKey] = { manualPassives: abilities };
                    }

                    for (const [optionKey, optionData] of Object.entries(this._data[characterKey][categoryKey].manualPassives)) {
                        if (optionData.applicableStats)
                            this._data[characterKey][categoryKey].manualPassives[optionKey] = this.replaceDataStats(optionData.applicableStats);
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
        // Ensure _data and _data.Roll exist before accessing
        if (typeof this._data === 'undefined' || !this._data.hasOwnProperty('Stats')) {
            console.warn("ExternalDataManager: Data or 'Stats' property not yet available. Call init() first.");
            return [];
        }
        return this._data['Stats'];
    },

    /**
     * Provides direct access to the 'Roll' array from the internal data,
     * which typically contains the names of the stats that can be rolled.
     * @returns {Array<string>} An array of stat names.
     */
    get rollStats() {
        // Ensure _data and _data.Roll exist before accessing
        if (typeof this._data === 'undefined' || !this._data.hasOwnProperty('Roll')) {
            console.warn("ExternalDataManager: Data or 'Roll' property not yet available. Call init() first.");
            return [];
        }
        return this._data['Roll'];
    },

    /**
     * Provides direct access to the 'otherStats' array from the internal data,
     * which typically contains some names
     * @returns {Array<string>} An array of stat names.
     */
    get otherStats() {
        // Ensure _data and _data.Other exist before accessing
        if (typeof this._data === 'undefined' || !this._data.hasOwnProperty('Other')) {
            console.warn("ExternalDataManager: Data or 'Other' property not yet available. Call init() first.");
            return [];
        }
        return this._data['Other'];
    },

    /**
     * Retrieves all data associated with a specific class from the internal data.
     * @param {string} className The name of the class (e.g., "Brawler").
     * @returns {Object|null} An object containing all data for the specified class,
     * or null if the class is not found.
     */
    getClassData(className) {
        if (typeof this._data === 'undefined' || !this._data['Classes'].hasOwnProperty(className)) {
            console.warn(`ExternalDataManager: Class data for "${className}" not found. Call init() first or check class name.`);
            return null;
        }
        return this._data['Classes'][className];
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
        if (typeof this._data === 'undefined' || !this._data['Races'].hasOwnProperty(raceName)) {
            console.warn(`ExternalDataManager: Race data for "${raceName}" not found. Call init() first or check race name.`);
            return null;
        }
        return this._data['Races'][raceName];
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

    /**
     * Retrieves the manual passive choices for a specific race.
     * @param {string} raceName The name of the race.
     * @returns {Object|null} The manual passive choices object for the race, or null if not found.
     */
    getRaceManualPassives(raceName) {
        const raceData = this.getRaceData(raceName);
        if (raceData && raceData.manualPassives) {
            return raceData.manualPassives;
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
            return classData.manualPassives;
        }
        return null;
    }
};
