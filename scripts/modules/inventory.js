import { ExternalDataManager } from '../externalDataManager.js';
import { character, setHasUnsavedChanges, inventoryViewSettings } from './state.js';
import { calculateFormula, calculateRollStatTotal, calculateTotalMagicDefense, roll } from './formulas.js';
import {recalculateSmallUpdateCharacter } from './characterState.js';
import { showToast } from './eventHandler.js';

export function ensureMagicElements(item, type) {
    if (!item.magicElements) {
        item.magicElements = [];
        if (type === 'weapon') {
            if (item.magicType || item.magicDamage) {
                item.magicElements.push({
                    element: item.magicType || '',
                    damage: item.magicDamage || ''
                });
            }
        } else if (type === 'armor') {
            if (item.magicType || item.magicDefense) {
                item.magicElements.push({
                    element: item.magicType || '',
                    defense: parseFloat(item.magicDefense) || 0
                });
            }
        }
    }
}

export function ensureRequiredStats(item) {
    if (!item) return;
    if (!Array.isArray(item.requiredStats)) {
        item.requiredStats = [];
        if (item.requiredStat || item.requirement) {
            item.requiredStats.push({
                stat: item.requiredStat || '',
                requirement: item.requirement || ''
            });
        }
    }
    if (item.requiredStats.length > 0) {
        item.requiredStat = item.requiredStats.map(rs => rs.stat).filter(Boolean).join(', ');
        item.requirement = item.requiredStats.map(rs => rs.requirement).filter(Boolean).join(', ');
    } else {
        item.requiredStat = '';
        item.requirement = '';
    }
}

function validateItemRequirements(item) {
    ensureRequiredStats(item);
    if (!item.requiredStats || item.requiredStats.length === 0) {
        return { met: true, details: [] };
    }

    let allMet = true;
    const details = [];

    item.requiredStats.forEach(rs => {
        if (!rs.stat || !rs.requirement) return;
        const reqVal = parseFloat(rs.requirement);
        if (isNaN(reqVal)) return;

        const currentVal = calculateRollStatTotal(character, rs.stat);
        const isMet = currentVal >= reqVal;
        if (!isMet) allMet = false;
        details.push({
            stat: rs.stat,
            required: reqVal,
            current: currentVal,
            met: isMet
        });
    });

    return {
        met: allMet,
        details: details
    };
}

export function renderWeaponCards() {
    const container = document.getElementById('weapon-inventory-cards-container');
    if (!container) return;

    container.innerHTML = '';
    
    if (character.weaponInventory.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                <span class="text-3xl mb-2">⚔️</span>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">No weapons in inventory.</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "+ Add Weapon" to begin equipping your hero.</p>
            </div>
        `;
        return;
    }

    character.weaponInventory.forEach((item, index) => {
        ensureMagicElements(item, 'weapon');
        ensureRequiredStats(item);
        const validation = validateItemRequirements(item);
        const card = document.createElement('div');
        
        const activeClass = item.use 
            ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/15 shadow-md bg-indigo-50/5 dark:bg-indigo-950/5' 
            : 'border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800';
            
        card.className = `p-5 rounded-xl border ${activeClass} transition-all duration-200 flex flex-col gap-4 relative hover:shadow-md`;
        
        let valBadge = '';
        if (validation.details && validation.details.length > 0) {
            if (!validation.met) {
                valBadge = `
                    <div class="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 p-2 rounded-md flex flex-col gap-1 mt-1">
                        <span class="flex items-center gap-1">⚠️ Unmet Requirements:</span>
                        <ul class="list-disc list-inside text-[11px] font-normal space-y-0.5">
                            ${validation.details.filter(d => d.required > d.current).map(d => `<li>Req: ${d.required} ${d.stat} (You have: ${d.current})</li>`).join('')}
                        </ul>
                    </div>
                `;
            } else {
                valBadge = `
                    <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-2 rounded-md flex items-center gap-1.5 mt-1">
                        <span>✅ Requirements Met: ${validation.details.map(d => `${d.required} ${d.stat}`).join(', ')}</span>
                    </div>
                `;
            }
        }

        card.innerHTML = `
            <!-- Card Header: Name, Values, Roll & Active Switch -->
            <div class="flex items-center justify-between gap-3 ${item.collapsed ? '' : 'pb-3 border-b border-gray-100 dark:border-gray-700/60'}">
                <div class="flex items-center gap-2 flex-grow min-w-0">
                    <button type="button" data-action="toggle-card-collapse" data-inventory-type="weapon" data-index="${index}" class="p-1 rounded-md text-gray-400 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-all duration-150 flex-shrink-0" title="${item.collapsed ? 'Expand Card' : 'Collapse Card'}">
                        <svg class="w-5 h-5 transition-transform duration-200 ${item.collapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <input type="text" data-inventory-type="weapon" data-field="name" data-index="${index}" value="${item.name || ''}" placeholder="Weapon Name..." class="font-bold text-base text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-indigo-500 focus:outline-none transition-all duration-200 w-full rounded px-1 -ml-1 focus:bg-gray-50 dark:focus:bg-gray-900 truncate" />
                </div>
                
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40" title="Gold Value">
                        🪙 ${item.value || 0}
                    </span>

                    <button type="button" data-action="roll-weapon" data-index="${index}" class="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2 py-1 rounded transition-all duration-150 shadow-sm" title="Roll Weapon Damage">
                        🎲 Roll
                    </button>
                    <label class="relative inline-flex items-center cursor-pointer select-none">
                        <input type="checkbox" data-inventory-type="weapon" data-field="use" data-index="${index}" class="sr-only peer" ${item.use ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        <span class="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 peer-checked:text-indigo-600 dark:peer-checked:text-indigo-400">Active</span>
                    </label>
                </div>
            </div>

            <!-- Card Body (Hidden when collapsed) -->
            <div class="card-body flex flex-col gap-4 ${item.collapsed ? 'hidden' : 'mt-4'}">
                <!-- Attributes grid -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Type</label>
                        <input type="text" data-inventory-type="weapon" data-field="type" data-index="${index}" value="${item.type || ''}" placeholder="e.g. Sword, Bow" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Material</label>
                        <input type="text" data-inventory-type="weapon" data-field="material" data-index="${index}" value="${item.material || ''}" placeholder="e.g. Mithril" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1 col-span-2 sm:col-span-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Gold Value</label>
                        <div class="relative flex items-center">
                            <span class="absolute left-2.5 text-xs">🪙</span>
                            <input type="number" data-inventory-type="weapon" data-field="value" data-index="${index}" value="${item.value || 0}" class="pl-7 pr-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                        </div>
                    </div>
                </div>

                <!-- Stats & Accuracy grid -->
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">🎯 Accuracy %</label>
                        <input type="number" data-inventory-type="weapon" data-field="accuracy" data-index="${index}" value="${item.accuracy || 100}" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <div class="flex items-center justify-between">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Req. Stats</label>
                            <button type="button" data-action="add-required-stat" data-inventory-type="weapon" data-index="${index}" class="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300">
                                + Add Stat
                            </button>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            ${item.requiredStats.map((rs, rsIndex) => `
                                <div class="flex items-center gap-1">
                                    <select data-action="edit-required-stat" data-inventory-type="weapon" data-index="${index}" data-rs-index="${rsIndex}" data-field="stat" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-1/2">
                                        <option value="">Select Stat...</option>
                                        ${ExternalDataManager.rollStats.map(stat => `<option value="${stat}" ${rs.stat === stat ? 'selected' : ''}>${stat}</option>`).join('')}
                                    </select>
                                    <input type="text" data-action="edit-required-stat" data-inventory-type="weapon" data-index="${index}" data-rs-index="${rsIndex}" data-field="requirement" value="${rs.requirement || ''}" placeholder="Val" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-1/2 text-center" />
                                    <button type="button" data-action="remove-required-stat" data-inventory-type="weapon" data-index="${index}" data-rs-index="${rsIndex}" class="text-red-500 hover:text-red-700 dark:text-red-400 p-1 focus:outline-none" title="Remove Requirement">✕</button>
                                </div>
                            `).join('')}
                            ${item.requiredStats.length === 0 ? '<span class="text-[11px] text-gray-400 dark:text-gray-500 italic">None</span>' : ''}
                        </div>
                    </div>
                </div>

                <!-- Damage Formulas -->
                <div class="flex flex-col gap-1">
                    <div class="flex items-center justify-between">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">💥 Physical Damage</label>
                        ${item.rolledDamage !== undefined ? `<span class="text-[11px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/30">Last Roll: ${item.rolledDamage}</span>` : ''}
                    </div>
                    <textarea data-inventory-type="weapon" data-field="damage" data-index="${index}" placeholder="e.g. 2d6 + Strength" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-10 resize-none">${item.damage || ''}</textarea>
                </div>

                <!-- Magic Elements panel -->
                <div class="border-t border-dashed border-gray-200 dark:border-gray-700/60 pt-3 mt-1">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
                            ✨ Magic Elements & Damages
                        </span>
                        <button type="button" data-action="add-magic-element" data-inventory-type="weapon" data-index="${index}" class="text-[11px] font-semibold text-purple-600 hover:text-white dark:text-purple-400 hover:bg-purple-500 dark:hover:bg-purple-600 border border-purple-200 dark:border-purple-900/40 px-2 py-0.5 rounded transition-all duration-200 focus:outline-none">
                            + Add Element
                        </button>
                    </div>
                    <div class="flex flex-col gap-2">
                        ${item.magicElements.map((me, meIndex) => {
                            const isCustom = me.element && !["All", "Chaos", "Dark", "Wind", "Earth", "Fire", "Ice", "Thunder", "Nature", "Light"].includes(me.element);
                            return `
                            <div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-150 dark:border-gray-800">
                                <!-- Dropdown for elements -->
                                <div class="flex flex-col gap-1 w-1/3 min-w-[100px]">
                                    <select data-action="edit-magic-element" data-inventory-type="weapon" data-index="${index}" data-me-index="${meIndex}" data-field="element" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full">
                                        <option value="">Select Element...</option>
                                        ${["All", "Chaos", "Dark", "Wind", "Earth", "Fire", "Ice", "Thunder", "Nature", "Light"].map(el => `<option value="${el}" ${me.element === el ? 'selected' : ''}>${el}</option>`).join('')}
                                        ${isCustom ? `<option value="custom_input" selected>Custom (${me.element})</option>` : '<option value="custom_input">Custom...</option>'}
                                    </select>
                                    ${isCustom ? `
                                        <input type="text" data-action="edit-magic-element" data-inventory-type="weapon" data-index="${index}" data-me-index="${meIndex}" data-field="custom-element-name" value="${me.element === 'Custom' ? '' : me.element}" placeholder="Name..." class="px-2 py-0.5 text-[10px] border border-purple-200 dark:border-purple-800 rounded bg-purple-50/50 dark:bg-purple-950/20 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full" />
                                    ` : ''}
                                </div>
                                <!-- Damage Input -->
                                <div class="flex-grow flex flex-col gap-0.5">
                                    <div class="flex items-center justify-between">
                                        <span class="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Damage Formula</span>
                                        ${me.rolledDamage !== undefined ? `<span class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">Last Roll: ${me.rolledDamage}</span>` : ''}
                                    </div>
                                    <input type="text" data-action="edit-magic-element" data-inventory-type="weapon" data-index="${index}" data-me-index="${meIndex}" data-field="damage" value="${me.damage || ''}" placeholder="e.g. 1d4 + Magic" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full" />
                                </div>
                                <!-- Delete button -->
                                <button type="button" data-action="remove-magic-element" data-inventory-type="weapon" data-index="${index}" data-me-index="${meIndex}" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-350 p-1.5 focus:outline-none" title="Remove Element">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                </button>
                            </div>
                            `;
                        }).join('')}
                        ${item.magicElements.length === 0 ? `
                            <div class="text-center py-2 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                                No magic elements active. Click "+ Add Element" to add one.
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Validation and Effects -->
                <div class="flex flex-col gap-1">
                    ${valBadge}
                    <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">Special Properties / Effects</label>
                    <textarea data-inventory-type="weapon" data-field="effect" data-index="${index}" placeholder="Add passive buffs or special combat details..." class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-12 resize-none">${item.effect || ''}</textarea>
                </div>

                <!-- Card Actions -->
                <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/60 mt-auto">
                    <span class="text-xs text-gray-400 dark:text-gray-500 font-medium">Slot #${index + 1}</span>
                    <button type="button" data-inventory-type="weapon" data-index="${index}" class="remove-item-btn text-xs font-semibold text-red-500 hover:text-white dark:text-red-400 hover:bg-red-500 dark:hover:bg-red-600 border border-red-200 dark:border-red-900/40 px-2.5 py-1 rounded transition-all duration-200">
                        Remove
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

function quickTd(elementTag, type, isClosed, dataInventoryType, dataField, dataIndex, value, cssClass) {
    let string = `<td><${elementTag}`;

    if (type != null)
        string += ` type="${type}"`;

    string += ` data-inventory-type="${dataInventoryType}" data-field="${dataField}" data-index="${dataIndex}"`;

    if (cssClass != null)
        string += ` class="${cssClass}"`;

    if (!isClosed) {
        if (type != 'checkbox')
            string += ` value="${value}">`;
        else
            string += ` ${value}>`; // For checkboxes, value is 'checked' or ''
    } else {
        string += `>${value}`; // For textareas, content is inside
    }

    return string + `</${elementTag}></td>`;
}

function renderInventoryTable(inventoryType, inventoryArray, tbodySelector, columns) {
    const tbody = document.querySelector(tbodySelector);
    if (!tbody) return;
    tbody.innerHTML = '';

    inventoryArray.forEach((item, index) => {
        const row = tbody.insertRow();
        let rowHtml = '';

        columns.forEach(col => {
            let value = item[col.field];
            let checkedAttr = '';

            if (col.getter) {
                value = col.getter(item);
            }
            if (col.checked) {
                checkedAttr = col.checked(item) ? 'checked' : '';
            }

            if (col.type === 'textarea') {
                rowHtml += quickTd('textarea', null, true, inventoryType, col.field, index, value, col.class);
            } else if (col.type === 'checkbox') {
                rowHtml += quickTd('input', 'checkbox', false, inventoryType, col.field, index, checkedAttr, col.class);
            } else if (col.type === 'html') {
                rowHtml += `<td class="${col.class || ''}">${col.html ? col.html(item, index) : value}</td>`;
            } else {
                rowHtml += quickTd('input', col.type, false, inventoryType, col.field, index, value, col.class);
            }
        });

        let actionsHtml = `<td><div class="flex items-center gap-1.5">`;
        if (inventoryType === 'weapon') {
            actionsHtml += `<button type="button" data-action="roll-weapon" data-index="${index}" class="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-colors duration-150">Roll</button>`;
        } else if (inventoryType === 'armor') {
            actionsHtml += `<button type="button" data-action="roll-armor" data-index="${index}" class="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-semibold rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm transition-colors duration-150">Roll</button>`;
        }
        actionsHtml += `<button type="button" data-inventory-type="${inventoryType}" data-index="${index}" class="remove-item-btn bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800 transition-colors duration-150">Remove</button></div></td>`;
        rowHtml += actionsHtml;

        row.innerHTML = rowHtml;

        columns.filter(col => col.type === 'textarea').forEach(col => {
            const textarea = row.querySelector(`textarea[data-field="${col.field}"]`);
            if (textarea) {
                textarea.value = col.getter ? col.getter(item) : item[col.field];
            }
        });
    });
}

export function renderWeaponTable() {
    // 1. Render Table View
    renderInventoryTable('weapon', character.weaponInventory, '#weapon-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'type', type: 'text', class: 'w-full' },
        { field: 'material', type: 'text', class: 'w-full' },
        {
            field: 'requiredStats',
            type: 'html',
            html: (item, index) => {
                ensureRequiredStats(item);
                return `
                <div class="flex flex-col gap-1 text-xs min-w-[140px]">
                    ${item.requiredStats.map((rs, rsIndex) => `
                        <div class="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/60 p-1 rounded border border-gray-200 dark:border-gray-700">
                            <select data-action="edit-required-stat" data-inventory-type="weapon" data-index="${index}" data-rs-index="${rsIndex}" data-field="stat" class="px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none w-1/2">
                                <option value="">Stat...</option>
                                ${ExternalDataManager.rollStats.map(stat => `<option value="${stat}" ${rs.stat === stat ? 'selected' : ''}>${stat}</option>`).join('')}
                            </select>
                            <input type="text" data-action="edit-required-stat" data-inventory-type="weapon" data-index="${index}" data-rs-index="${rsIndex}" data-field="requirement" value="${rs.requirement || ''}" placeholder="Val" class="px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none w-1/2 text-center" />
                            <button type="button" data-action="remove-required-stat" data-inventory-type="weapon" data-index="${index}" data-rs-index="${rsIndex}" class="text-red-500 hover:text-red-700 text-xs px-1 focus:outline-none" title="Remove Requirement">✕</button>
                        </div>
                    `).join('')}
                    <button type="button" data-action="add-required-stat" data-inventory-type="weapon" data-index="${index}" class="text-[10px] text-left text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-semibold mt-0.5">
                        + Add Stat
                    </button>
                </div>
                `;
            }
        },
        { field: 'accuracy', type: 'number', class: 'w-full' },
        {
            field: 'damage',
            type: 'html',
            html: (item, index) => {
                const lastRollBadge = item.rolledDamage !== undefined 
                    ? `<div class="mt-1"><span class="inline-flex items-center text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/20">Last Roll: ${item.rolledDamage}</span></div>` 
                    : '';
                return `
                <div class="flex flex-col gap-1 w-full min-w-[120px]">
                    <textarea data-inventory-type="weapon" data-field="damage" data-index="${index}" placeholder="e.g. 2d6 + Strength" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full h-10 resize-none">${item.damage || ''}</textarea>
                    ${lastRollBadge}
                </div>
                `;
            }
        },
        {
            field: 'magicElements',
            type: 'html',
            html: (item, index) => {
                ensureMagicElements(item, 'weapon');
                return `
                <div class="flex flex-col gap-1 text-xs max-w-xs">
                    ${item.magicElements.map((me, meIndex) => {
                        const lastRollBadge = me.rolledDamage !== undefined 
                            ? `<div class="mt-0.5"><span class="inline-flex items-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">Roll: ${me.rolledDamage}</span></div>`
                            : '';
                        return `
                        <div class="flex flex-col gap-0.5 bg-purple-50/50 dark:bg-purple-950/20 px-1.5 py-1 rounded border border-purple-100 dark:border-purple-900/20">
                            <div class="flex items-center justify-between gap-2">
                                <span class="font-bold text-purple-700 dark:text-purple-300">${me.element || 'Magic'}:</span>
                                <span class="text-gray-750 dark:text-gray-200">${me.damage || '0'}</span>
                            </div>
                            ${lastRollBadge}
                        </div>
                        `;
                    }).join('')}
                    ${item.magicElements.length === 0 ? '<span class="text-gray-400 dark:text-gray-500">None</span>' : ''}
                    <button type="button" data-action="add-magic-element" data-inventory-type="weapon" data-index="${index}" class="text-[10px] text-left text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-semibold mt-1">
                        + Edit in Card View
                    </button>
                </div>
                `;
            }
        },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'value', type: 'number', class: 'w-full' },
        { field: 'use', type: 'checkbox', class: null, checked: (item) => item.use }
    ]);

    // 2. Render Card View
    renderWeaponCards();

    // 3. Render Summaries
    renderEquippedSummaries();

    // 4. Align layout active state classes
    toggleInventoryViewDOM('weapon', inventoryViewSettings.weapon);
}

export function renderArmorCards() {
    const container = document.getElementById('armor-inventory-cards-container');
    if (!container) return;

    container.innerHTML = '';
    
    if (character.armorInventory.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                <span class="text-3xl mb-2">🛡️</span>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">No armor in inventory.</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "+ Add Armor" to begin styling your defense.</p>
            </div>
        `;
        return;
    }

    const armorLocations = ["Head", "Chest", "Hands", "Legs", "Feet", "Shield", "Ring", "Neck", "Accessory", "Back", "Wrist", "Vanity"];

    character.armorInventory.forEach((item, index) => {
        ensureMagicElements(item, 'armor');
        ensureRequiredStats(item);
        const validation = validateItemRequirements(item);
        const card = document.createElement('div');
        
        const activeClass = item.equipped 
            ? 'border-indigo-500 dark:border-indigo-400 ring-2 ring-indigo-500/15 shadow-md bg-indigo-50/5 dark:bg-indigo-950/5' 
            : 'border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800';
            
        card.className = `p-5 rounded-xl border ${activeClass} transition-all duration-200 flex flex-col gap-4 relative hover:shadow-md`;
        
        let valBadge = '';
        if (validation.details && validation.details.length > 0) {
            if (!validation.met) {
                valBadge = `
                    <div class="text-xs font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 p-2 rounded-md flex flex-col gap-1 mt-1">
                        <span class="flex items-center gap-1">⚠️ Unmet Requirements:</span>
                        <ul class="list-disc list-inside text-[11px] font-normal space-y-0.5">
                            ${validation.details.filter(d => d.required > d.current).map(d => `<li>Req: ${d.required} ${d.stat} (You have: ${d.current})</li>`).join('')}
                        </ul>
                    </div>
                `;
            } else {
                valBadge = `
                    <div class="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 p-2 rounded-md flex items-center gap-1.5 mt-1">
                        <span>✅ Requirements Met: ${validation.details.map(d => `${d.required} ${d.stat}`).join(', ')}</span>
                    </div>
                `;
            }
        }

        card.innerHTML = `
            <!-- Card Header: Name, Values, Roll & Equipped Switch -->
            <div class="flex items-center justify-between gap-3 ${item.collapsed ? '' : 'pb-3 border-b border-gray-100 dark:border-gray-700/60'}">
                <div class="flex items-center gap-2 flex-grow min-w-0">
                    <button type="button" data-action="toggle-card-collapse" data-inventory-type="armor" data-index="${index}" class="p-1 rounded-md text-gray-400 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-all duration-150 flex-shrink-0" title="${item.collapsed ? 'Expand Card' : 'Collapse Card'}">
                        <svg class="w-5 h-5 transition-transform duration-200 ${item.collapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <input type="text" data-inventory-type="armor" data-field="name" data-index="${index}" value="${item.name || ''}" placeholder="Armor Name..." class="font-bold text-base text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-indigo-500 focus:outline-none transition-all duration-200 w-full rounded px-1 -ml-1 focus:bg-gray-50 dark:focus:bg-gray-900 truncate" />
                </div>
                
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40" title="Gold Value">
                        🪙 ${item.value || 0}
                    </span>

                    <button type="button" data-action="roll-armor" data-index="${index}" class="flex items-center gap-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 dark:text-indigo-300 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 px-2 py-1 rounded transition-all duration-150 shadow-sm" title="Roll Armor Defense">
                        🎲 Roll
                    </button>
                    <label class="relative inline-flex items-center cursor-pointer select-none">
                        <input type="checkbox" data-inventory-type="armor" data-field="equipped" data-index="${index}" class="sr-only peer" ${item.equipped ? 'checked' : ''}>
                        <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-600"></div>
                        <span class="ml-2 text-[10px] font-bold uppercase tracking-wider text-gray-500 peer-checked:text-indigo-600 dark:peer-checked:text-indigo-400">Equipped</span>
                    </label>
                </div>
            </div>

            <!-- Card Body (Hidden when collapsed) -->
            <div class="card-body flex flex-col gap-4 ${item.collapsed ? 'hidden' : 'mt-4'}">
                <!-- Location, Material, Value Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Location</label>
                        <select data-inventory-type="armor" data-field="location" data-index="${index}" class="px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full">
                            <option value="">Select location...</option>
                            ${armorLocations.map(loc => `<option value="${loc}" ${item.location === loc ? 'selected' : ''}>${loc}</option>`).join('')}
                        </select>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Material</label>
                        <input type="text" data-inventory-type="armor" data-field="material" data-index="${index}" value="${item.material || ''}" placeholder="e.g. Leather" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1 col-span-2 sm:col-span-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Gold Value</label>
                        <div class="relative flex items-center">
                            <span class="absolute left-2.5 text-xs">🪙</span>
                            <input type="number" data-inventory-type="armor" data-field="value" data-index="${index}" value="${item.value || 0}" class="pl-7 pr-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                        </div>
                    </div>
                </div>

                <!-- Defenses & Requirements -->
                <div class="grid grid-cols-2 gap-3">
                    <div class="flex flex-col gap-1">
                        <div class="flex items-center justify-between">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 flex items-center gap-1">🛡️ Physical Defense</label>
                            ${item.rolledDefense !== undefined ? `<span class="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 px-1 rounded border border-emerald-100/20 dark:border-emerald-900/10">Last Roll: ${item.rolledDefense}</span>` : ''}
                        </div>
                        <textarea data-inventory-type="armor" data-field="defense" data-index="${index}" placeholder="e.g. 1d4 + Agility" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-10 resize-none">${item.defense || ''}</textarea>
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <div class="flex items-center justify-between">
                            <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Req. Stats</label>
                            <button type="button" data-action="add-required-stat" data-inventory-type="armor" data-index="${index}" class="text-[10px] font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300">
                                + Add Stat
                            </button>
                        </div>
                        <div class="flex flex-col gap-1.5">
                            ${item.requiredStats.map((rs, rsIndex) => `
                                <div class="flex items-center gap-1">
                                    <select data-action="edit-required-stat" data-inventory-type="armor" data-index="${index}" data-rs-index="${rsIndex}" data-field="stat" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-1/2">
                                        <option value="">Select Stat...</option>
                                        ${ExternalDataManager.rollStats.map(stat => `<option value="${stat}" ${rs.stat === stat ? 'selected' : ''}>${stat}</option>`).join('')}
                                    </select>
                                    <input type="text" data-action="edit-required-stat" data-inventory-type="armor" data-index="${index}" data-rs-index="${rsIndex}" data-field="requirement" value="${rs.requirement || ''}" placeholder="Val" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-1/2 text-center" />
                                    <button type="button" data-action="remove-required-stat" data-inventory-type="armor" data-index="${index}" data-rs-index="${rsIndex}" class="text-red-500 hover:text-red-700 dark:text-red-400 p-1 focus:outline-none" title="Remove Requirement">✕</button>
                                </div>
                            `).join('')}
                            ${item.requiredStats.length === 0 ? '<span class="text-[11px] text-gray-400 dark:text-gray-500 italic">None</span>' : ''}
                        </div>
                    </div>
                </div>

                <!-- Magic Elements panel -->
                <div class="border-t border-dashed border-gray-200 dark:border-gray-700/60 pt-3 mt-1">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-bold text-purple-700 dark:text-purple-400 uppercase tracking-wider flex items-center gap-1">
                            ✨ Magic Elements & Defenses
                        </span>
                        <button type="button" data-action="add-magic-element" data-inventory-type="armor" data-index="${index}" class="text-[11px] font-semibold text-purple-600 hover:text-white dark:text-purple-400 hover:bg-purple-500 dark:hover:bg-purple-600 border border-purple-200 dark:border-purple-900/40 px-2 py-0.5 rounded transition-all duration-200 focus:outline-none">
                            + Add Element
                        </button>
                    </div>
                    <div class="flex flex-col gap-2">
                        ${item.magicElements.map((me, meIndex) => {
                            const isCustom = me.element && !["All", "Chaos", "Dark", "Wind", "Earth", "Fire", "Ice", "Thunder", "Nature", "Light"].includes(me.element);
                            return `
                            <div class="flex items-center gap-2 bg-gray-50 dark:bg-gray-900/50 p-2 rounded-lg border border-gray-150 dark:border-gray-800">
                                <!-- Dropdown for elements -->
                                <div class="flex flex-col gap-1 w-1/3 min-w-[100px]">
                                    <select data-action="edit-magic-element" data-inventory-type="armor" data-index="${index}" data-me-index="${meIndex}" data-field="element" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full">
                                        <option value="">Select Element...</option>
                                        ${["All", "Chaos", "Dark", "Wind", "Earth", "Fire", "Ice", "Thunder", "Nature", "Light"].map(el => `<option value="${el}" ${me.element === el ? 'selected' : ''}>${el}</option>`).join('')}
                                        ${isCustom ? `<option value="custom_input" selected>Custom (${me.element})</option>` : '<option value="custom_input">Custom...</option>'}
                                    </select>
                                    ${isCustom ? `
                                        <input type="text" data-action="edit-magic-element" data-inventory-type="armor" data-index="${index}" data-me-index="${meIndex}" data-field="custom-element-name" value="${me.element === 'Custom' ? '' : me.element}" placeholder="Name..." class="px-2 py-0.5 text-[10px] border border-purple-200 dark:border-purple-800 rounded bg-purple-50/50 dark:bg-purple-950/20 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full" />
                                    ` : ''}
                                </div>
                                <!-- Defense Input -->
                                <div class="flex-grow flex flex-col gap-0.5">
                                    <div class="flex items-center justify-between">
                                        <span class="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">Defense Formula</span>
                                        ${me.rolledDefense !== undefined ? `<span class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">Roll: ${me.rolledDefense}</span>` : ''}
                                    </div>
                                    <input type="text" data-action="edit-magic-element" data-inventory-type="armor" data-index="${index}" data-me-index="${meIndex}" data-field="defense" value="${me.defense || ''}" placeholder="e.g. 1d4" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full" />
                                </div>
                                <!-- Delete button -->
                                <button type="button" data-action="remove-magic-element" data-inventory-type="armor" data-index="${index}" data-me-index="${meIndex}" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-350 p-1.5 focus:outline-none" title="Remove Element">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                    </svg>
                                </button>
                            </div>
                            `;
                        }).join('')}
                        ${item.magicElements.length === 0 ? `
                            <div class="text-center py-2 text-xs text-gray-400 dark:text-gray-500 border border-dashed border-gray-200 dark:border-gray-800 rounded-lg">
                                No magic elements active. Click "+ Add Element" to add one.
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Validation & Special Effects -->
                <div class="flex flex-col gap-1">
                    ${valBadge}
                    <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mt-1">Special Properties / Effects</label>
                    <textarea data-inventory-type="armor" data-field="effect" data-index="${index}" placeholder="Add armor set bonuses or resistances..." class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-12 resize-none">${item.effect || ''}</textarea>
                </div>

                <!-- Card Actions -->
                <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/60 mt-auto">
                    <span class="text-xs text-gray-400 dark:text-gray-500 font-medium">Slot #${index + 1}</span>
                    <button type="button" data-inventory-type="armor" data-index="${index}" class="remove-item-btn text-xs font-semibold text-red-500 hover:text-white dark:text-red-400 hover:bg-red-500 dark:hover:bg-red-600 border border-red-200 dark:border-red-900/40 px-2.5 py-1 rounded transition-all duration-200">
                        Remove
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

export function renderEquippedSummaries() {
    // 1. Weapon Summary
    const weaponSummary = document.getElementById('weapon-equipped-summary');
    if (weaponSummary) {
        const activeWeapons = character.weaponInventory.filter(item => item.use);
        if (activeWeapons.length > 0) {
            weaponSummary.classList.remove('hidden');
            let content = `
                <div class="flex items-center justify-between mb-2 pb-1 border-b border-indigo-100/30 dark:border-indigo-900/20">
                    <span class="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span class="animate-pulse text-indigo-500">⚔️</span> Active Combat Stance (${activeWeapons.length} Active)
                    </span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            `;
            activeWeapons.forEach(w => {
                ensureMagicElements(w, 'weapon');
                if (w.rolledDamage === undefined) {
                    w.rolledDamage = calculateFormula(w.damage || '0');
                }
                
                content += `
                    <div class="bg-indigo-50/50 dark:bg-indigo-950/40 p-2.5 rounded border border-indigo-100/50 dark:border-indigo-900/30 text-xs">
                        <div class="font-bold text-indigo-700 dark:text-indigo-300 truncate">${w.name || 'Unnamed Weapon'}</div>
                        <div class="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">${w.type || 'Weapon'}${w.material ? ` • ${w.material}` : ''}</div>
                        <div class="mt-2 space-y-1.5">
                            <div class="flex flex-col gap-0.5 pb-1 border-b border-gray-100 dark:border-gray-800/40">
                                <div class="flex justify-between items-center">
                                    <span class="text-gray-650 dark:text-gray-400 font-medium">💥 Phys Dmg:</span>
                                    <span class="font-bold text-gray-800 dark:text-gray-250 text-xs bg-white dark:bg-gray-800 px-1 py-0.5 rounded border border-gray-200 dark:border-gray-700">${w.rolledDamage}</span>
                                </div>
                                <div class="text-[9px] text-gray-400 dark:text-gray-500 italic truncate">Formula: ${w.damage || '0'}</div>
                            </div>
                            ${w.magicElements.map(me => {
                                if (me.rolledDamage === undefined) {
                                    me.rolledDamage = calculateFormula(me.damage || '0');
                                }
                                return `
                                <div class="flex flex-col gap-0.5 pb-1 border-b border-gray-100 dark:border-gray-800/40">
                                    <div class="flex justify-between items-center">
                                        <span class="text-gray-650 dark:text-gray-400 font-medium">✨ ${me.element || 'Magic'}:</span>
                                        <span class="font-bold text-purple-600 dark:text-purple-300 text-xs bg-white dark:bg-gray-800 px-1 py-0.5 rounded border border-purple-100 dark:border-purple-900/40">${me.rolledDamage}</span>
                                    </div>
                                    <div class="text-[9px] text-purple-400 dark:text-purple-500/70 italic truncate">Formula: ${me.damage || '0'}</div>
                                </div>
                                `;
                            }).join('')}
                            <div class="flex justify-between pt-0.5 text-[10px]">
                                <span class="text-gray-500">Accuracy:</span>
                                <span class="font-semibold text-gray-700 dark:text-gray-300">${w.accuracy || 100}%</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            content += `</div>`;
            weaponSummary.innerHTML = content;
        } else {
            weaponSummary.classList.add('hidden');
        }
    }

    // 2. Armor Summary
    const armorSummary = document.getElementById('armor-equipped-summary');
    if (armorSummary) {
        const equippedArmor = character.armorInventory.filter(item => item.equipped);
        if (equippedArmor.length > 0) {
            armorSummary.classList.remove('hidden');
            
            let totalPhysDef = 0;
            let totalMagDef = 0;
            const elementalTotals = {};
            equippedArmor.forEach(a => {
                const physDefVal = a.rolledDefense !== undefined
                    ? (parseFloat(a.rolledDefense) || 0)
                    : (parseFloat(calculateFormula(a.defense || '0', false)) || 0);
                totalPhysDef += physDefVal;
                ensureMagicElements(a, 'armor');
                a.magicElements.forEach(me => {
                    const el = me.element || 'Magic';
                    const magDefVal = me.rolledDefense !== undefined
                        ? (parseFloat(me.rolledDefense) || 0)
                        : (parseFloat(calculateFormula(me.defense || '0', false)) || 0);
                    totalMagDef += magDefVal;
                    elementalTotals[el] = (elementalTotals[el] || 0) + magDefVal;
                });
            });

            let content = `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 border-b border-indigo-100/50 dark:border-indigo-900/30 pb-2">
                    <span class="text-xs font-bold text-indigo-800 dark:text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                        <span class="animate-pulse text-indigo-500">🛡️</span> Equipped Armor Loadout
                    </span>
                    <div class="flex gap-3 text-xs font-bold">
                        <span class="text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/30">Total Physical Def: +${totalPhysDef}</span>
                        <span class="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/20 px-2 py-0.5 rounded border border-purple-100 dark:border-purple-900/30">Total Magic Def: +${totalMagDef}</span>
                    </div>
                </div>
            `;

            if (Object.keys(elementalTotals).length > 0) {
                const elementalBadges = Object.entries(elementalTotals)
                    .map(([el, total]) => `
                        <span class="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-50/50 dark:bg-purple-950/10 border border-purple-100 dark:border-purple-900/20 px-2 py-0.5 rounded-md">
                            ${el}: +${total}
                        </span>
                    `).join('');
                content += `
                    <div class="flex flex-wrap items-center gap-1.5 mb-3 p-2 bg-purple-50/10 dark:bg-purple-950/5 rounded-lg border border-purple-100/20 dark:border-purple-900/10">
                        <span class="text-[10px] font-bold uppercase tracking-wider text-purple-500 dark:text-purple-400 mr-1 flex items-center gap-0.5">✨ Magic Def By Element:</span>
                        ${elementalBadges}
                    </div>
                `;
            }

            content += `
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            `;
            equippedArmor.forEach(a => {
                ensureMagicElements(a, 'armor');
                let elementalDefs = a.magicElements.map(me => {
                    const val = me.rolledDefense !== undefined ? me.rolledDefense : calculateFormula(me.defense || '0', false);
                    return `+${val} ${me.element || 'Magic'}`;
                }).join(', ');
                if (!elementalDefs) elementalDefs = 'None';
                const currentDefenseDisplay = a.rolledDefense !== undefined ? a.rolledDefense : calculateFormula(a.defense || '0', false);
                content += `
                    <div class="bg-indigo-50/30 dark:bg-indigo-950/20 p-2.5 rounded border border-indigo-100/40 dark:border-indigo-900/20 text-xs flex flex-col justify-between">
                        <div>
                            <span class="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[10px] rounded font-semibold uppercase tracking-wider">${a.location || 'Gear'}</span>
                            <div class="font-bold text-indigo-700 dark:text-indigo-300 mt-1 truncate">${a.name || 'Unnamed Armor'}</div>
                        </div>
                        <div class="mt-2 space-y-0.5 text-[11px] border-t border-gray-100 dark:border-gray-800/40 pt-1.5">
                            <div class="flex justify-between">
                                <span class="text-gray-500">Defense:</span>
                                <span class="font-bold text-emerald-600 dark:text-emerald-400">+${currentDefenseDisplay}</span>
                            </div>
                            <div class="flex flex-col mt-1">
                                <span class="text-gray-500 text-[10px] uppercase font-semibold">Magic Defs:</span>
                                <span class="font-bold text-purple-600 dark:text-purple-400 text-[11px]">${elementalDefs}</span>
                            </div>
                        </div>
                    </div>
                `;
            });
            content += `</div>`;
            armorSummary.innerHTML = content;
        } else {
            armorSummary.classList.add('hidden');
        }
    }

    renderTotalMagicDefenseBreakdown(character);
}

export function renderTotalMagicDefenseBreakdown(charData) {
    const breakdownEl = document.getElementById('magic-defense-equipped-breakdown');
    if (!breakdownEl) return;

    const magicDefResult = calculateTotalMagicDefense(charData);

    const inputEl = document.getElementById('total-magic-defense');
    if (inputEl) {
        inputEl.value = magicDefResult.value;
    }

    if (!magicDefResult.byElement || Object.keys(magicDefResult.byElement).length === 0) {
        breakdownEl.innerHTML = `
            <div class="text-[11px] text-gray-400 dark:text-gray-500 italic mt-1">
                No magic defense equipped.
            </div>
        `;
        return;
    }

    const elementalBadges = Object.entries(magicDefResult.byElement)
        .map(([el, val]) => `
            <span class="inline-flex items-center gap-1 text-[10px] font-bold text-purple-700 dark:text-purple-300 bg-purple-100/70 dark:bg-purple-950/50 border border-purple-200 dark:border-purple-800/40 px-2 py-0.5 rounded-md">
                ✨ ${el}: +${val}
            </span>
        `).join('');

    breakdownEl.innerHTML = `
        <div class="flex flex-wrap gap-1 mt-1">
            ${elementalBadges}
        </div>
    `;
}

function toggleInventoryViewDOM(type, view) {
    const cardsBtn = document.getElementById(`${type}-view-cards-btn`);
    const tableBtn = document.getElementById(`${type}-view-table-btn`);
    const tableContainer = document.getElementById(`${type}-inventory-table-container`);
    const cardsContainer = document.getElementById(`${type}-inventory-cards-container`);

    if (!cardsBtn || !tableBtn || !tableContainer || !cardsContainer) return;

    if (view === 'cards') {
        cardsBtn.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
        cardsBtn.classList.remove('text-gray-600', 'dark:text-gray-400');
        
        tableBtn.classList.add('text-gray-600', 'dark:text-gray-400');
        tableBtn.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
        
        tableContainer.classList.add('hidden');
        cardsContainer.classList.remove('hidden');
    } else {
        tableBtn.classList.add('bg-white', 'text-indigo-700', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
        tableBtn.classList.remove('text-gray-600', 'dark:text-gray-400');
        
        cardsBtn.classList.add('text-gray-600', 'dark:text-gray-400');
        cardsBtn.classList.remove('bg-white', 'text-indigo-700', 'shadow-sm', 'dark:bg-gray-700', 'dark:text-white');
        
        cardsContainer.classList.add('hidden');
        tableContainer.classList.remove('hidden');
    }
}

export function renderArmorTable() {
    // 1. Render Table View
    renderInventoryTable('armor', character.armorInventory, '#armor-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'location', type: 'text', class: 'w-full' },
        { field: 'material', type: 'text', class: 'w-full' },
        {
            field: 'requiredStats',
            type: 'html',
            html: (item, index) => {
                ensureRequiredStats(item);
                return `
                <div class="flex flex-col gap-1 text-xs min-w-[140px]">
                    ${item.requiredStats.map((rs, rsIndex) => `
                        <div class="flex items-center gap-1 bg-gray-50 dark:bg-gray-900/60 p-1 rounded border border-gray-200 dark:border-gray-700">
                            <select data-action="edit-required-stat" data-inventory-type="armor" data-index="${index}" data-rs-index="${rsIndex}" data-field="stat" class="px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none w-1/2">
                                <option value="">Stat...</option>
                                ${ExternalDataManager.rollStats.map(stat => `<option value="${stat}" ${rs.stat === stat ? 'selected' : ''}>${stat}</option>`).join('')}
                            </select>
                            <input type="text" data-action="edit-required-stat" data-inventory-type="armor" data-index="${index}" data-rs-index="${rsIndex}" data-field="requirement" value="${rs.requirement || ''}" placeholder="Val" class="px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 focus:outline-none w-1/2 text-center" />
                            <button type="button" data-action="remove-required-stat" data-inventory-type="armor" data-index="${index}" data-rs-index="${rsIndex}" class="text-red-500 hover:text-red-700 text-xs px-1 focus:outline-none" title="Remove Requirement">✕</button>
                        </div>
                    `).join('')}
                    <button type="button" data-action="add-required-stat" data-inventory-type="armor" data-index="${index}" class="text-[10px] text-left text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 font-semibold mt-0.5">
                        + Add Stat
                    </button>
                </div>
                `;
            }
        },
        {
            field: 'defense',
            type: 'html',
            html: (item, index) => {
                const lastRollBadge = item.rolledDefense !== undefined 
                    ? `<div class="mt-1"><span class="inline-flex items-center text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/20">Last Roll: ${item.rolledDefense}</span></div>` 
                    : '';
                return `
                <div class="flex flex-col gap-1 w-full min-w-[120px]">
                    <textarea data-inventory-type="armor" data-field="defense" data-index="${index}" placeholder="e.g. 1d4 + Agility" class="px-2 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none w-full h-10 resize-none">${item.defense || ''}</textarea>
                    ${lastRollBadge}
                </div>
                `;
            }
        },
        {
            field: 'magicElements',
            type: 'html',
            html: (item, index) => {
                ensureMagicElements(item, 'armor');
                return `
                <div class="flex flex-col gap-1 text-xs max-w-xs">
                    ${item.magicElements.map((me, meIndex) => {
                        const lastRollBadge = me.rolledDefense !== undefined 
                            ? `<div class="mt-0.5"><span class="inline-flex items-center text-[9px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 px-1 rounded">Roll: ${me.rolledDefense}</span></div>`
                            : '';
                        return `
                        <div class="flex flex-col gap-0.5 bg-purple-50/50 dark:bg-purple-950/20 px-1.5 py-1 rounded border border-purple-100 dark:border-purple-900/20">
                            <div class="flex items-center justify-between gap-2">
                                <span class="font-bold text-purple-700 dark:text-purple-300">${me.element || 'Magic'}:</span>
                                <span class="text-gray-750 dark:text-gray-200">${me.defense || '0'}</span>
                            </div>
                            ${lastRollBadge}
                        </div>
                        `;
                    }).join('')}
                    ${item.magicElements.length === 0 ? '<span class="text-gray-400 dark:text-gray-500">None</span>' : ''}
                    <button type="button" data-action="add-magic-element" data-inventory-type="armor" data-index="${index}" class="text-[10px] text-left text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-semibold mt-1">
                        + Edit in Card View
                    </button>
                </div>
                `;
            }
        },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'value', type: 'number', class: 'w-full' },
        { field: 'equipped', type: 'checkbox', class: null, checked: (item) => item.equipped }
    ]);

    // 2. Render Card View
    renderArmorCards();

    // 3. Render Summaries
    renderEquippedSummaries();

    // 4. Align layout active state classes
    toggleInventoryViewDOM('armor', inventoryViewSettings.armor);
}

export function renderGeneralCards() {
    const container = document.getElementById('general-inventory-cards-container');
    if (!container) return;

    container.innerHTML = '';
    
    if (!character.generalInventory || character.generalInventory.length === 0) {
        container.innerHTML = `
            <div class="col-span-full flex flex-col items-center justify-center p-8 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 text-center">
                <span class="text-3xl mb-2">🎒</span>
                <p class="text-sm font-semibold text-gray-800 dark:text-gray-200">No items in general inventory.</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Click "+ Add Item" to store your loot and consumables.</p>
            </div>
        `;
        return;
    }

    character.generalInventory.forEach((item, index) => {
        const card = document.createElement('div');
        const cardClass = 'border-gray-200 dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800';
            
        card.className = `p-5 rounded-xl border ${cardClass} transition-all duration-200 flex flex-col gap-4 relative hover:shadow-md`;
        
        const totalVal = (parseFloat(item.amount) || 1) * (parseFloat(item.valuePerUnit) || 0);

        card.innerHTML = `
            <!-- Card Header: Name, Quantity, Value & Collapse -->
            <div class="flex items-center justify-between gap-3 ${item.collapsed ? '' : 'pb-3 border-b border-gray-100 dark:border-gray-700/60'}">
                <div class="flex items-center gap-2 flex-grow min-w-0">
                    <button type="button" data-action="toggle-card-collapse" data-inventory-type="general" data-index="${index}" class="p-1 rounded-md text-gray-400 hover:text-indigo-600 dark:text-gray-400 dark:hover:text-indigo-300 hover:bg-gray-100 dark:hover:bg-gray-700/60 transition-all duration-150 flex-shrink-0" title="${item.collapsed ? 'Expand Card' : 'Collapse Card'}">
                        <svg class="w-5 h-5 transition-transform duration-200 ${item.collapsed ? '-rotate-90' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path>
                        </svg>
                    </button>
                    <input type="text" data-inventory-type="general" data-field="name" data-index="${index}" value="${item.name || ''}" placeholder="Item Name..." class="font-bold text-base text-gray-900 dark:text-gray-100 bg-transparent border-b border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-indigo-500 focus:outline-none transition-all duration-200 w-full rounded px-1 -ml-1 focus:bg-gray-50 dark:focus:bg-gray-900 truncate" />
                </div>
                
                <div class="flex items-center gap-2 flex-shrink-0">
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/40 font-mono" title="Quantity">
                        x${item.amount || 1}
                    </span>
                    <span class="text-xs font-semibold px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200/50 dark:border-amber-900/40" title="Value per unit">
                        🪙 ${item.valuePerUnit || 0}
                    </span>
                </div>
            </div>

            <!-- Card Body (Hidden when collapsed) -->
            <div class="card-body flex flex-col gap-4 ${item.collapsed ? 'hidden' : 'mt-4'}">
                <!-- Attributes grid -->
                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div class="flex flex-col gap-1 col-span-2 sm:col-span-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Item Type</label>
                        <input type="text" data-inventory-type="general" data-field="type" data-index="${index}" value="${item.type || ''}" placeholder="e.g. Consumable" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Amount</label>
                        <input type="number" data-inventory-type="general" data-field="amount" data-index="${index}" value="${item.amount || 1}" min="0" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Value (Unit)</label>
                        <div class="relative flex items-center">
                            <span class="absolute left-2.5 text-xs">🪙</span>
                            <input type="number" data-inventory-type="general" data-field="valuePerUnit" data-index="${index}" value="${item.valuePerUnit || 0}" class="pl-7 pr-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                        </div>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Accuracy %</label>
                        <input type="number" data-inventory-type="general" data-field="accuracy" data-index="${index}" value="${item.accuracy || ''}" placeholder="100%" class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all w-full" />
                    </div>
                </div>

                <!-- Effect / Description -->
                <div class="flex flex-col gap-1">
                    <label class="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Effect / Description</label>
                    <textarea data-inventory-type="general" data-field="effect" data-index="${index}" placeholder="Item description or usage effect..." class="px-2.5 py-1.5 text-xs border border-gray-200 dark:border-gray-700 rounded-md bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all h-16 resize-none">${item.effect || ''}</textarea>
                </div>

                <!-- Card Footer Actions -->
                <div class="flex items-center justify-between pt-3 border-t border-gray-100 dark:border-gray-700/60 mt-auto">
                    <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">Total Value: <strong class="text-amber-600 dark:text-amber-400">🪙 ${totalVal}</strong></span>
                    <button type="button" data-inventory-type="general" data-index="${index}" class="remove-item-btn text-xs font-semibold text-red-500 hover:text-white dark:text-red-400 hover:bg-red-500 dark:hover:bg-red-600 border border-red-200 dark:border-red-900/40 px-2.5 py-1 rounded transition-all duration-200">
                        Remove
                    </button>
                </div>
            </div>
        `;
        
        container.appendChild(card);
    });
}

export function renderGeneralTable() {
    // 1. Render Table View
    renderInventoryTable('general', character.generalInventory, '#general-inventory-table tbody', [
        { field: 'name', type: 'text', class: 'w-full' },
        { field: 'type', type: 'text', class: 'w-full' },
        { field: 'effect', type: 'textarea', class: 'w-full inventory-effect-textarea' },
        { field: 'accuracy', type: 'number', class: 'w-full' },
        { field: 'amount', type: 'number', class: 'w-full' },
        { field: 'valuePerUnit', type: 'number', class: 'w-full' }
    ]);

    // 2. Render Card View
    renderGeneralCards();

    // 3. Align layout active state classes
    toggleInventoryViewDOM('general', inventoryViewSettings.general);
}

export function setInventoryView(type, view) {
    inventoryViewSettings[type] = view;
    toggleInventoryViewDOM(type, view);
    if (view === 'table') {
        if (type === 'weapon') renderWeaponTable();
        else if (type === 'armor') renderArmorTable();
        else if (type === 'general') renderGeneralTable();
    }
}

export function toggleAllCards(inventoryType) {
    const inventoryKey = `${inventoryType}Inventory`;
    const inventory = character[inventoryKey];
    if (!inventory || inventory.length === 0) return;

    // If at least one card is expanded (!item.collapsed), collapse all cards.
    // If all cards are collapsed, expand all cards.
    const hasExpanded = inventory.some(item => !item.collapsed);
    const targetState = hasExpanded;

    inventory.forEach(item => {
        item.collapsed = targetState;
    });

    setHasUnsavedChanges(true);

    if (inventoryType === 'weapon') {
        renderWeaponCards();
    } else if (inventoryType === 'armor') {
        renderArmorCards();
    } else if (inventoryType === 'general') {
        renderGeneralCards();
    }
}

export function rollWeaponAtIndex(index) {
    const item = character.weaponInventory[index];
    if (!item) return;

    ensureMagicElements(item, 'weapon');
    item.rolledDamage = calculateFormula(item.damage || '0');
    
    let magicMsgParts = [];
    item.magicElements.forEach(me => {
        me.rolledDamage = calculateFormula(me.damage || '0');
        magicMsgParts.push(`${me.element || 'Magic'}: ${me.rolledDamage}`);
    });

    setHasUnsavedChanges(true);
    renderWeaponTable();

    let rollMsg = `Rolled <strong>${item.name || 'Weapon'}</strong>: 💥 Physical: <strong>${item.rolledDamage}</strong>`;
    if (magicMsgParts.length > 0) {
        rollMsg += `<br><span class="text-xs text-purple-150 font-medium">✨ ${magicMsgParts.join(', ')}</span>`;
    }
    showToast(rollMsg, 'roll');
}

export function rollAllActiveWeapons() {
    const activeWeapons = character.weaponInventory.filter(item => item.use);
    if (activeWeapons.length === 0) {
        showToast('No active weapons equipped to roll!', 'error');
        return;
    }

    activeWeapons.forEach(item => {
        ensureMagicElements(item, 'weapon');
        item.rolledDamage = calculateFormula(item.damage || '0');
        item.magicElements.forEach(me => {
            me.rolledDamage = calculateFormula(me.damage || '0');
        });
    });

    setHasUnsavedChanges(true);
    renderWeaponTable();

    showToast(`Rolled all <strong>${activeWeapons.length}</strong> active weapons! Check the stance summary and cards for results.`, 'roll');
}

export function rollArmorAtIndex(index) {
    const item = character.armorInventory[index];
    if (!item) return;

    ensureMagicElements(item, 'armor');
    item.rolledDefense = calculateFormula(item.defense || '0');
    
    let magicMsgParts = [];
    item.magicElements.forEach(me => {
        me.rolledDefense = calculateFormula(me.defense || '0');
        magicMsgParts.push(`${me.element || 'Magic'}: ${me.rolledDefense}`);
    });

    setHasUnsavedChanges(true);
    
    // Recalculate total defense & update elements
    recalculateSmallUpdateCharacter(character, true);
    renderArmorTable();

    let rollMsg = `Rolled <strong>${item.name || 'Armor'}</strong>: 🛡️ Physical Defense: <strong>${item.rolledDefense}</strong>`;
    if (magicMsgParts.length > 0) {
        rollMsg += `<br><span class="text-xs text-purple-150 font-medium">✨ Magic Def: ${magicMsgParts.join(', ')}</span>`;
    }
    showToast(rollMsg, 'roll');
}

export function rollAllEquippedArmor() {
    const equippedArmor = character.armorInventory.filter(item => item.equipped);
    if (equippedArmor.length === 0) {
        showToast('No equipped armor to roll!', 'error');
        return;
    }

    equippedArmor.forEach(item => {
        ensureMagicElements(item, 'armor');
        item.rolledDefense = calculateFormula(item.defense || '0');
        item.magicElements.forEach(me => {
            me.rolledDefense = calculateFormula(me.defense || '0');
        });
    });

    setHasUnsavedChanges(true);
    recalculateSmallUpdateCharacter(character, true);
    renderArmorTable();

    showToast(`Rolled all <strong>${equippedArmor.length}</strong> equipped armor items! Total defense updated.`, 'roll');
}

export function handleRequiredStatClick(event) {
    const target = event.target.closest('[data-action="add-required-stat"], [data-action="remove-required-stat"]');
    if (!target) return false;

    const action = target.dataset.action;
    const inventoryType = target.dataset.inventoryType;
    const itemIndex = parseInt(target.dataset.index, 10);
    const rsIndex = parseInt(target.dataset.rsIndex, 10);

    const inventory = character[`${inventoryType}Inventory`];
    if (!inventory || !inventory[itemIndex]) return false;

    ensureRequiredStats(inventory[itemIndex]);

    if (action === 'add-required-stat') {
        inventory[itemIndex].requiredStats.push({ stat: '', requirement: '' });
        ensureRequiredStats(inventory[itemIndex]);
        setHasUnsavedChanges(true);
        if (inventoryType === 'weapon') {
            renderWeaponCards();
            renderWeaponTable();
        } else if (inventoryType === 'armor') {
            renderArmorCards();
            renderArmorTable();
        }
        return true;
    }

    if (action === 'remove-required-stat') {
        if (!isNaN(rsIndex)) {
            inventory[itemIndex].requiredStats.splice(rsIndex, 1);
            ensureRequiredStats(inventory[itemIndex]);
            setHasUnsavedChanges(true);
            if (inventoryType === 'weapon') {
                renderWeaponCards();
                renderWeaponTable();
            } else if (inventoryType === 'armor') {
                renderArmorCards();
                renderArmorTable();
            }
        }
        return true;
    }

    return false;
}

/**
 * Handles input changes for inventory items.
 * @param {Event} event The input event.
 */
export function handleInventoryInputChange(event) {
    const { value, type, dataset, checked } = event.target;
    const inventoryType = dataset.inventoryType;
    const itemIndex = parseInt(dataset.index);
    const field = dataset.field;
    const action = dataset.action;

    // Check if we are editing required stat requirements
    if (action === 'edit-required-stat') {
        const rsIndex = parseInt(dataset.rsIndex, 10);
        const rsField = dataset.field;
        let val = event.target.value;

        const inventory = character[`${inventoryType}Inventory`];
        if (inventory && inventory[itemIndex]) {
            ensureRequiredStats(inventory[itemIndex]);
            const rs = inventory[itemIndex].requiredStats[rsIndex];
            if (rs) {
                rs[rsField] = val;
                ensureRequiredStats(inventory[itemIndex]);
                setHasUnsavedChanges(true);
                if (inventoryType === 'armor') {
                    recalculateSmallUpdateCharacter(character, true);
                }
                if (event.type === 'change') {
                    if (inventoryType === 'weapon') {
                        renderWeaponCards();
                        renderWeaponTable();
                    } else if (inventoryType === 'armor') {
                        renderArmorCards();
                        renderArmorTable();
                    }
                }
            }
        }
        return;
    }

    // Check if we are editing a specific magic element attribute
    if (action === 'edit-magic-element') {
        const meIndex = parseInt(dataset.meIndex);
        const meField = dataset.field;
        let val = event.target.value;

        // Dropdown element change should only trigger on 'change' event to avoid duplicate prompts/handlers
        if (meField === 'element' && event.type !== 'change') {
            return;
        }
        // Input fields should only trigger on 'input' event to update memory, change event handles re-rendering
        if (meField !== 'element' && event.type !== 'input') {
            return;
        }

        const inventory = character[`${inventoryType}Inventory`];
        if (inventory && inventory[itemIndex]) {
            ensureMagicElements(inventory[itemIndex], inventoryType);
            const me = inventory[itemIndex].magicElements[meIndex];
            if (me) {
                if (meField === 'element') {
                    if (val === 'custom_input') {
                        me.element = 'Custom';
                    } else {
                        me.element = val;
                    }
                    if (inventoryType === 'armor') {
                        recalculateSmallUpdateCharacter(character, true);
                    }
                } else if (meField === 'custom-element-name') {
                    me.element = val;
                    if (inventoryType === 'armor') {
                        recalculateSmallUpdateCharacter(character, true);
                    }
                } else if (meField === 'defense') {
                    me[meField] = val; // Store formula/string directly
                    recalculateSmallUpdateCharacter(character, true);
                } else {
                    me[meField] = val;
                }
                setHasUnsavedChanges(true);
            }
        }
        return;
    }

    const inventory = character[`${inventoryType}Inventory`];
    if (!inventory || !inventory[itemIndex]) return;

    if (field === 'use' || field === 'equipped') { // Handle checkboxes
        inventory[itemIndex][field] = checked;
        if (inventoryType === 'weapon' && field === 'use') {
            ensureMagicElements(inventory[itemIndex], 'weapon');
            if (checked) {
                rollWeaponAtIndex(itemIndex);
            } else {
                renderWeaponTable();
            }
        } else if (inventoryType === 'armor' && field === 'equipped') {
            ensureMagicElements(inventory[itemIndex], 'armor');
            recalculateSmallUpdateCharacter(character, true);
            renderArmorTable();
        }
    } else if (type === 'number' && field !== 'damage' && field !== 'defense') { // Exclude damage and defense from number parsing
        inventory[itemIndex][field] = parseFloat(value) || 0;
    } else {
        // For text fields (including damage and defense which can be formulas)
        inventory[itemIndex][field] = value;
        if (inventoryType === 'armor' && field === 'defense') {
            delete inventory[itemIndex].rolledDefense;
            recalculateSmallUpdateCharacter(character, true);
        }
    }
}