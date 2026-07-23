
import { ExternalDataManager } from './externalDataManager.js';
import { maybeEnableGoogleDriveButtons } from './modules/googleDrive.js';
import { isNotLocal, initPage } from './modules/eventHandler.js';

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