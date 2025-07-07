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
 * @returns {Promise<any>} A Promise that resolves to the parsed content (string, object, Blob, or 2D array for CSV).
 */
async function fetchGoogleDriveFile(driveShareLink, options = {}) {
    const { responseType = 'text', csvDelimiter = ',', sheetId = 0, useCorsProxy = false } = options;

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

        // 3. Make the fetch request
        const response = await fetch(directDownloadUrl);

        // 4. Check if the request was successful (status code 200-299)
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status} - ${response.statusText}`);
        }

        // 5. Process the response based on the desired responseType
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
                return parseCsv(csvText, csvDelimiter);
            default:
                throw new Error(`Unsupported responseType: ${responseType}. Choose 'text', 'json', 'blob', or 'csv'.`);
        }

    } catch (error) {
        console.error("Error fetching or processing Google Drive file:", error);
        throw error; // Re-throw the error for the calling function to handle
    }
}

/**
 * A simple CSV parser function. Handles basic CSV structures.
 * Does not handle complex cases like escaped delimiters within quotes.
 *
 * @param {string} csvString The raw CSV content as a string.
 * @param {string} delimiter The character used to separate values (e.g., ',', '\t').
 * @returns {Array<Array<string>>} A 2D array representing the CSV data.
 */
function parseCsv(csvString, delimiter) {
    if (!csvString) return [];

    const rows = csvString.trim().split('\n');
    return rows.map(row => {
        // Basic split, might need more robust parsing for complex CSVs (e.g., with quoted commas)
        return row.split(delimiter).map(cell => cell.trim());
    });
}

// NEW: Google Sheets Link Example
const MY_PUBLIC_GOOGLE_SHEET_LINK = "https://docs.google.com/spreadsheets/d/1lNIzvAC3E5dHzYzEaBaiAQLyar-UvA8XMEZpoXu3cMQ/edit"; // Replace with your actual Google Sheet link

const My_Gid = {
    "Races": 0,
    "Classes": 1740043699,
    "ClassesRelated": 1187765211,
};

// NEW Example: Fetching a specific tab from a Google Sheet as CSV
async function fetchSpecificGoogleSheetTab(gid) {
    console.log("\n--- Fetching Specific Google Sheet Tab ---");
    // You can specify the 'gid' of the tab you want to fetch.
    // The gid is usually found in the URL when you open a specific tab in Google Sheets:
    // e.g., https://docs.google.com/spreadsheets/d/YOUR_ID/edit#gid=123456789
    try {
        const sheetArray = await fetchGoogleDriveFile(MY_PUBLIC_GOOGLE_SHEET_LINK, { responseType: 'csv', csvDelimiter: ',', sheetId: gid });
        console.log("Specific Google Sheet Tab Data (2D Array):\n", sheetArray);
    } catch (error) {
        console.error("Failed to fetch specific Google Sheet tab data:", error);
    }
}


// Uncomment the function calls below to test them.
// Remember to replace the placeholder links with your actual Google Drive public read-only links!

window.onload = function() {
    fetchSpecificGoogleSheetTab(My_Gid.Races);
}