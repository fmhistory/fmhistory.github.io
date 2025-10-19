/**
 * DataProcessor.js
 * * Module for data cleaning, transformation, and combination.
 */

import { 
    normalizeAccents, 
    getAuthors, 
    getEntryType, 
    getExplicitAcronym,
    createInitialAcronym, 
    formatDoiUrl, 
    getMonthNumber,
    generateBibtex
} from './Utils.js';


// We assume that bibtexParse is available in the global scope (window)
const bibtexParse = window.bibtexParse;
const TEMP_PATH_DELIMITER = " | ";


class DataProcessor {
    
    /**
     * Parses the BibTeX-formatted text and converts it into a JavaScript object
     * using the 'bibtexParse.toJSON()' library.
     * @param {string} bibText - The contents of the .bib file.
     * @returns {Object} A map of references {citation_key: {properties...}}.
     */
    static parseBibtex(bibText) {
        if (!bibtexParse) {
            console.error("Error: 'bibtexParse' library is not loaded. Please check index.html.");
            return {};
        }
        console.log("Executing BibTeX parsing logic...");
        const rawReferences = bibtexParse.toJSON(bibText);
        const bibMap = new Map();
        rawReferences.forEach(entry => {
            const key = entry.citationKey; 
            if (key) {
                bibMap.set(key, DataProcessor._processBibEntry(entry));
            }
        });
        return bibMap;
    }

    /**
     * Cleaning and standardization logic for a single BibTeX entry.
     * Adaptation of the original 'processBibEntry'.
     * @param {Object} entry - Raw entry from bibtexParse.
     * @returns {Object} The cleaned, usable reference.
     */
    static _processBibEntry(entry) {
        const tags = entry.entryTags;
        const booktitle = normalizeAccents(tags.booktitle || '');
        const year = parseInt(tags.year);
        const isWorkshop = booktitle.toLowerCase().includes('workshop') || booktitle.toLowerCase().includes(' ws ');
        const entryType = entry.entryType.toLowerCase();
        const journal = normalizeAccents(tags.journal || '');
        const publisher = tags.publisher || '';
        const publicationType = getEntryType(entryType, journal, booktitle, false, isWorkshop, publisher);
        const authors = getAuthors(tags.author || '');
        const monthStr = tags.month;
        const month = monthStr ? monthStr.charAt(0).toUpperCase() + monthStr.slice(1) : null;
        const ACRONYM_LENGTH = 25;
        return {
            id: entry.citationKey,
            type: publicationType,
            authors: authors,
            pubtitle: normalizeAccents(tags.title) || '',
            journal: journal,
            booktitle: booktitle,
            acronym: entryType === 'book' ? 'Book' : (entryType === 'phdthesis' ? 'PhD Thesis' : (publicationType === 'dataArtifacts' ? publisher : (getExplicitAcronym(journal || booktitle || '') || createInitialAcronym(journal || booktitle || '', ACRONYM_LENGTH)))),
            doi: formatDoiUrl(tags.doi || tags.url || ''),
            year: year,
            month: month,
            date: tags.month && year ? `${year}-${getMonthNumber(tags.month)}-01` : `${year}-01-01`, 
            publisher: normalizeAccents(publisher) || null,
            abstract: tags.abstract || '',
            keywords: tags.keywords ? tags.keywords.split(',').map(k => k.trim()).join(', ') : '',
            address: tags.address || '',
            volume: tags.volume || '',
            pages: tags.pages || '',
            bibtexContent: generateBibtex(entry), 
        };
    }

    /**
     * Combines the JSON events with the BIB references and performs pre-processing.
     * @param {Array} fmEvents - Data for the Feature Model events.
     * @param {string} bibText - Raw BibTeX text.
     * @returns {Array} The cleaned events, ready for D3.js.
     */
    static processAndCombine(fmEvents, bibText) {
        if (!fmEvents || !fmEvents.nodes) {
            console.error("Error: FM data must contain a 'nodes' array.");
            return fmEvents;
        }
        const bibMap = DataProcessor.parseBibtex(bibText);
        fmEvents.nodes.forEach(node => {
            const details = bibMap.get(node.id); 
            if (details) {
                Object.assign(node, details); 
            } else {
                console.warn(`BibTeX key not found for node ID: ${node.id}`);
            }
            node.citations = node.citations || 0; 
            node.hierarchy = node.hierarchy && node.hierarchy.length > 0 ? node.hierarchy : ["Sin Categoría"];
            node.full_path = node.hierarchy.join(TEMP_PATH_DELIMITER); 
        });
        if (fmEvents.nodes.length > 0) {
            DataProcessor.sortEvents(fmEvents.nodes);
        }
        return fmEvents;
    }

    /**
     * Orders the events: Primarily by year (ascending), secondarily by 'id' for stability.
     * @param {Array} events - The array of event objects (fmData.nodes).
     * @returns {Array} The sorted array of events.
     */
    static sortEvents(events) {
        events.sort((a, b) => {
            // Primary order: Ascending order (older years first)
            if (a.year - b.year !== 0) {
                return a.year - b.year;  
            }
            // Secondary order: Ensure stability if years are identical (e.g., by id or key)
            if (a.id !== undefined && b.id !== undefined) {
                return String(a.id).localeCompare(String(b.id)); 
            }
            
            return 0; 
        });
        
        return events;
    }
}

// Export the class
export { DataProcessor };