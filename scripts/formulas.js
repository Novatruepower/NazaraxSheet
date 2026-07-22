import { ExternalDataManager } from './ExternalDataManager.js';
import { character } from './state.js';

export function getCategoriesTemporaryEffects(charData, statName) {
    let categoriesTemporaryEffects = [];
    const temporaryEffects = charData[statName].temporaryEffects

    for (const category in temporaryEffects) {
        categoriesTemporaryEffects.push(...temporaryEffects[category]);
    }
    
    return categoriesTemporaryEffects;
}