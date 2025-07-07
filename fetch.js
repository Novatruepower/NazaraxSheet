// fetch.js (or your file containing the googleDriveFileFetcher object)

export const googleDriveFileFetcher = {
    /**
     * Generic function to fetch a file from Google Drive with a public read-only link,
     * with an option to parse content, similar to Google Sheets' IMPORTRANGE for CSV data.
     *
     * @param {string} driveShareLink The public read-only share link from Google Drive (e.g., https://drive.google.com/file/d/FILE_ID/view or https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit).
     * @param {object} [options] Optional configuration object.
     * @param {string} [options.responseType='text'] The desired response type: 'text', 'json', 'blob', or 'csv'.
     * @param {string} [options.csvDelimiter=','] The delimiter to use when parsing CSV data. Defaults to ','.
     * @param {number} [options.sheetId=0] For Google Sheets, the gid of the specific sheet to fetch. Defaults to 0 (first sheet).
     * @param {boolean} [options.useCorsProxy=false] If true, uses a CORS proxy to fetch the data. Useful for bypassing CORS issues.
     * @param {string} [options.range] For Google Sheets, a range string (e.g., "A1:C5", "B:B", "1:5") to extract specific cells from the CSV.
     * @returns {Promise<any>} A Promise that resolves to the parsed content (string, object, Blob, or 2D array for CSV).
     */
    fetchGoogleDriveFile: async function(driveShareLink, options = {}) {
        const { responseType = 'text', csvDelimiter = ',', sheetId = 0, useCorsProxy = false, range } = options;

        try {
            let fileId;
            let directDownloadUrl;

            // Check if it's a Google Sheets link or a generic Google Drive file link
            const sheetIdMatch = driveShareLink.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/edit)?(?:#gid=([0-9]+))?/);
            const driveFileIdMatch = driveShareLink.match(/\/file\/d\/([a-zA-Z0-9_-]+)\//);

            if (sheetIdMatch && sheetIdMatch.length > 1) {
                // It's a Google Sheet
                fileId = sheetIdMatch[1];
                // Prioritize gid from options, then from URL, then default to 0
                const actualSheetId = options.sheetId !== undefined ? options.sheetId : (sheetIdMatch[2] ? parseInt(sheetIdMatch[2], 10) : 0);
                directDownloadUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv&gid=${actualSheetId}`;
                console.log(`Detected Google Sheet. Exporting sheet ID ${actualSheetId} as CSV from: ${directDownloadUrl}`);
            } else if (driveFileIdMatch && driveFileIdMatch.length > 1) {
                // It's a generic Google Drive file
                fileId = driveFileIdMatch[1];
                directDownloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
                console.log(`Detected generic Drive file. Fetching from: ${directDownloadUrl}`);
            } else {
                throw new Error("Invalid Google Drive or Google Sheets share link. Could not extract file ID.");
            }

            // Apply CORS proxy if enabled
            if (useCorsProxy) {
                // Using corsproxy.io as a public proxy. For production, consider your own proxy or official APIs.
                directDownloadUrl = `https://corsproxy.io/?${encodeURIComponent(directDownloadUrl)}`;
                console.log(`Using CORS proxy. Final fetch URL: ${directDownloadUrl}`);
            }

            // Make the fetch request
            const response = await fetch(directDownloadUrl);

            // Check if the request was successful (status code 200-299)
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
            }

            // Process the response based on the desired responseType
            switch (responseType.toLowerCase()) {
                case 'text':
                    return await response.text();
                case 'json':
                    // Note: Google Sheets export as CSV, not JSON directly.
                    // If you expect JSON, ensure your file is a .json file on Drive, not a Sheet.
                    return await response.json();
                case 'blob':
                    return await response.blob();
                case 'csv':
                    const csvText = await response.text();
                    let data = this.parseCsv(csvText, csvDelimiter); // Use 'this' to call internal method

                    // Apply range filtering if specified and it's a Google Sheet
                    if (range && sheetIdMatch) {
                        console.log(`Applying range "${range}" to CSV data.`);
                        data = this.extractRangeFromCsv(data, range);
                    }
                    return data;
                default:
                    throw new Error(`Unsupported responseType: ${responseType}. Choose 'text', 'json', 'blob', or 'csv'.`);
            }

        } catch (error) {
            console.error("Error fetching or processing Google Drive file:", error);
            throw error; // Re-throw the error for the calling function to handle
        }
    },

    /**
     * A simple CSV parser function. Handles basic CSV structures.
     * Does not handle complex cases like escaped delimiters within quotes.
     *
     * @param {string} csvString The raw CSV content as a string.
     * @param {string} delimiter The character used to separate values (e.g., ',', '\t').
     * @returns {Array<Array<string>>} A 2D array representing the CSV data.
     */
    parseCsv: function(csvString, delimiter) {
        if (!csvString) return [];

        const rows = csvString.trim().split('\n');
        return rows.map(row => {
            // Basic split, might need more robust parsing for complex CSVs (e.g., with quoted commas)
            return row.split(delimiter).map(cell => cell.trim());
        });
    },

    /**
     * Extracts a specific range from a 2D array (CSV data).
     * Supports A1:C5, A:C, 1:5 formats.
     *
     * @param {Array<Array<string>>} data The full 2D array representing the CSV data.
     * @param {string} rangeString The range string (e.g., "A1:C5", "B:B", "1:5").
     * @returns {Array<Array<string>>} A new 2D array containing only the data within the specified range.
     */
    extractRangeFromCsv: function(data, rangeString) {
        if (!data || data.length === 0) return [];
        if (!rangeString) return data;

        const parseColumn = (colStr) => {
            let col = 0;
            for (let i = 0; i < colStr.length; i++) {
                col = col * 26 + (colStr.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
            }
            return col - 1; // Convert to 0-based index
        };

        const parseCellReference = (ref) => {
            const match = ref.match(/^([A-Z]+)?([0-9]+)?$/i);
            if (!match) throw new Error(`Invalid range reference: ${ref}`);

            const colStr = match[1] ? match[1].toUpperCase() : null;
            const rowStr = match[2] ? parseInt(match[2], 10) : null;

            return {
                col: colStr !== null ? parseColumn(colStr) : null,
                row: rowStr !== null ? rowStr - 1 : null // Convert to 0-based index
            };
        };

        let startCol = 0, endCol = data[0].length - 1;
        let startRow = 0, endRow = data.length - 1;

        const parts = rangeString.split(':');
        const startRef = parseCellReference(parts[0]);
        const endRef = parts.length > 1 ? parseCellReference(parts[1]) : startRef;

        // Determine start and end columns
        if (startRef.col !== null) {
            startCol = startRef.col;
        }
        if (endRef.col !== null) {
            endCol = endRef.col;
        } else if (startRef.col !== null && parts.length === 1) { // Single column like "A"
             endCol = startCol;
        }

        // Determine start and end rows
        if (startRef.row !== null) {
            startRow = startRef.row;
        }
        if (endRef.row !== null) {
            endRow = endRef.row;
        } else if (startRef.row !== null && parts.length === 1) { // Single row like "1"
            endRow = startRow;
        }

        // Ensure valid ranges
        startCol = Math.max(0, Math.min(startCol, data[0].length - 1));
        endCol = Math.max(0, Math.min(endCol, data[0].length - 1));
        startRow = Math.max(0, Math.min(startRow, data.length - 1));
        endRow = Math.max(0, Math.min(endRow, data.length - 1));

        // Adjust for "A:A" or "1:1" where start and end might be swapped if only one part is given
        if (parts.length === 1) {
             if (startRef.col !== null && startRef.row === null) { // e.g., "A"
                 endCol = startCol;
             } else if (startRef.row !== null && startRef.col === null) { // e.g., "1"
                 endRow = startRow;
             }
        }


        // Extract the sub-array
        const extractedData = [];
        for (let r = startRow; r <= endRow; r++) {
            if (data[r]) { // Ensure row exists
                const newRow = [];
                for (let c = startCol; c <= endCol; c++) {
                    newRow.push(data[r][c] !== undefined ? data[r][c] : ''); // Handle cases where cell might not exist
                }
                extractedData.push(newRow);
            }
        }
        return extractedData;
    },

    // NEW: Google Sheets Link Example - These can be made configurable or passed in externally
    MY_PUBLIC_GOOGLE_SHEET_LINK: "https://docs.google.com/spreadsheets/d/1lNIzvAC3E5dHzYzEaBaiAQLyar-UvA8XMEZpoXu3cMQ/edit", // Replace with your actual Google Sheet link

    My_Sheet: {
        "Races": {gid: 0, range: 'A1:K'},
        "Classes": {gid: 1740043699, range: 'A2:A'},
        "ClassesRelated": {gid: 1187765211, range: 'A2:B'},
    },

    // NEW Example: Fetching a specific tab from a Google Sheet as CSV
    fetchSpecificGoogleSheetTab: async function(gid) {
        console.log("\n--- Fetching Specific Google Sheet Tab ---");
        // You can specify the 'gid' of the tab you want to fetch.
        // The gid is usually found in the URL when you open a specific tab in Google Sheets:
        // e.g., https://docs.google.com/spreadsheets/d/YOUR_ID/edit#gid=123456789
        try {
            const sheetArray = await this.fetchGoogleDriveFile(this.MY_PUBLIC_GOOGLE_SHEET_LINK, { responseType: 'csv', csvDelimiter: ',', sheetId: gid });
            console.log("Specific Google Sheet Tab Data (2D Array):\n", sheetArray);
            return sheetArray;
        } catch (error) {
            console.error("Failed to fetch specific Google Sheet tab data:", error);
            throw error;
        }
    },

    // NEW Example: Fetching a specific range from a Google Sheet tab as CSV
    fetchGoogleSheetRange: async function(gid, range) {
        console.log(`\n--- Fetching Google Sheet Tab with Range: GID ${gid}, Range "${range}" ---`);
        try {
            const sheetArray = await this.fetchGoogleDriveFile(this.MY_PUBLIC_GOOGLE_SHEET_LINK, { responseType: 'csv', csvDelimiter: ',', sheetId: gid, range: range });
            console.log(`Google Sheet Data for Range "${range}" (2D Array):\n`, sheetArray);
            return sheetArray;
        } catch (error) {
            console.error(`Failed to fetch Google Sheet data for range "${range}":`, error);
            throw error;
        }
    }
};

// Example Usage (for demonstration, you would call these from your application)
/*
(async () => {
    // Example 1: Fetching the entire 'Races' tab
    await googleDriveFileFetcher.fetchSpecificGoogleSheetTab(googleDriveFileFetcher.My_Gid.Races);

    // Example 2: Fetching a specific range from the 'Classes' tab (e.g., A1:C5)
    await googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Gid.Classes, "A1:C5");

    // Example 3: Fetching entire columns from 'ClassesRelated' (e.g., B:D)
    await googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Gid.ClassesRelated, "B:D");

    // Example 4: Fetching entire rows from 'Races' (e.g., 2:4)
    await googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Gid.Races, "2:4");

    // Example 5: Fetching a single cell (e.g., C3)
    await googleDriveFileFetcher.fetchGoogleSheetRange(googleDriveFileFetcher.My_Gid.Classes, "C3");
})();
*/
