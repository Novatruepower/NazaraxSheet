/**
 * @fileoverview ExternalDataManager provides a simplified interface for accessing
 * data fetched from external sources (e.g., Google Sheets) and stored internally.
 * It abstracts away the nested bracket notation and provides convenient methods
 * for common data retrieval patterns.
 */

// Assuming googleDriveFileFetcher is imported or globally available
// Example: import { googleDriveFileFetcher } from './fetch.js';
import { googleDriveFileFetcher } from './fetch.js';

export const ExternalDataManager = {
    // Internal variable to store fetched data, making it part of the object
    _data: { Races:{}, Stats:{}, Roll:{} },


    parsePercent(numberString) {
        return parseFloat(numberString.replace('%', '')) / 100;
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
                this._data['Stats'] = [...arr[0]]; // Copy header for 'Stats'
                delete arr[0]; // Remove the header row from the main array
                delete this._data['Stats'][0]; // Remove the empty string from 'Stats' array
                const health = head[1]; // Get the 'Health' column name
                delete head[1]; // Remove 'Health' from the head array
                this._data['Roll'] = head; // The remaining elements in head are the stat names for 'Roll'

                arr.forEach(value => {
                    let race = value[0]; // The first element is the race name
                    if (race) { // Ensure race name is not empty
                        this._data['Races'][race] = {
                            Stats: {
                                Roll: {}
                            }
                        };

                        this._data['Races'][race]['Stats'][health] = this.parsePercent(value[1]); // Assign health multiplier
                        let index = 2; // Start from the third column for stats

                        head.forEach(statName => {
                            // Assign stat roll value for the current race
                            this._data['Races'][race]['Stats']['Roll'][statName] = this.parsePercent(value[index]);
                            ++index;
                        });
                    }
                });
            });
            console.log("External data loaded successfully into ExternalDataManager.");
            console.log(this._data);
        } catch (error) {
            console.error("Error initializing ExternalDataManager with external data:", error);
            // Optionally, re-throw or handle the error more gracefully
        }
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

        if (raceData) {
            if (statName == 'Health')
                return this.getRaceHealthChange(raceName);

            if (raceData.Stats && raceData.Stats.Roll && raceData.Stats.Roll.hasOwnProperty(statName))
                return raceData.Stats.Roll[statName];

            console.warn(`ExternalDataManager: Stat roll for "${statName}" in race "${raceName}" not found.`);
        }

        return null;
    },

    /**
     * Retrieves the health multiplier for a specific race from the internal data.
     * @param {string} raceName The name of the race.
     * @returns {number|null} The health multiplier for the race, or null if not found.
     */
    getRaceHealthChange(raceName) {
        const raceData = this.getRaceData(raceName);
        // Assuming 'Health' is a fixed key under 'Stats' for the multiplier
        if (raceData && raceData.Stats && raceData.Stats.hasOwnProperty('Health')) {
            return raceData.Stats.Health;
        }
        console.warn(`ExternalDataManager: Health multiplier for race "${raceName}" not found.`);
        return null;
    },

    // You can add more helper methods here as needed, for example:
    // getOtherRaceSpecificProperty(raceName, propertyPath) { ... }
};

// Example of how to initialize and use it:
// In your main application logic (e.g., in window.onload or your app's main async function):
// (async () => {
//     await ExternalDataManager.init();
//     // Now you can safely use ExternalDataManager's getters and methods
//     console.log("Roll Stats:", ExternalDataManager.rollStats);
//     console.log("Human Health Multiplier:", ExternalDataManager.getRaceHealthMultiplier("Human"));
// })();