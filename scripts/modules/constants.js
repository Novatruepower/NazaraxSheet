export const DEFAULT_STAT_MAX_EXPERIENCE = 7;
export const DEFAULT_RACIAL_POINT_SCALE = 100;

// Constants for point distribution
export const TOTAL_DISTRIBUTION_POINTS = 97;
export const MIN_STAT_VALUE = 5;
export const MAX_STAT_VALUE = 20;

// History stack limit
export const MAX_HISTORY_LENGTH = 10;

// Key for local storage to persist Google Drive authorization status
export const GOOGLE_DRIVE_AUTH_STATUS_KEY = 'googleDriveAuthorized';

//Visibility
export const SECTION_VISIBILITY = 'section';
export const HTML_VISIBILITY = [SECTION_VISIBILITY, 'container', 'element'];

// Mapping for common terms to character properties for formula evaluation
export const STAT_MAPPING = {
    "Strength": "Strength-total",
    "Agility": "Agility-total",
    "Magic": "Magic-total",
    "Luck": "Luck-total",
    "Crafting": "Crafting-total",
    "Intelligence": "Intelligence-total",
    "Intimidation": "Intimidation-total",
    "Charisma": "Charisma-total",
    "Negotiation": "Negotiation-total",
    "hp": "Health",
    "Health": "Health",
    "MaxHp": "maxHealth",
    "MaxHealth": "maxHealth",
    "MagicPoints": "Mana",
    "maxMana": "maxMana",
    "RacialPower": "RacialPower",
    "MaxRacialPower": "maxRacialPower",
    "AC": "totalDefense",
    "Armor": "totalDefense",
    "Level": "level",
    "level": "level",
    "lvl": "level"
};