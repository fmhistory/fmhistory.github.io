/**
 * Utils.js
 *
 * Module for auxiliary functions for cleaning, formatting, and classification.
 */


/**
 * Normalizes accents and cleans a BibTeX field string.
 * @param {*} str - The raw string from BibTeX entry.
 * @returns {string} - The cleaned and normalized string.
 */
const normalizeAccents = (str) => {
    if (!str) {
        return '';
    }
    let cleaned = str.trim();
    //cleaned = cleaned.replace(/\\.+?\{/g, ""); 
    cleaned = cleaned.replaceAll('{', '');
    cleaned = cleaned.replaceAll('}', '');
    // Un mapa de caracteres especiales a sus equivalentes normales
    const replacements = {
        "\\'a": 'á',
        "\\'e": 'é',
        "\\'i": 'í',
        "\\'o": 'ó',
        "\\'u": 'ú',
        "\\'A": 'Á',
        "\\'E": 'É',
        "\\'I": 'Í',
        "\\'O": 'Ó',
        "\\'U": 'Ú',
        '\\`a': 'à',
        '\\`e': 'è',
        '\\`i': 'ì',
        '\\`o': 'ò',
        '\\`u': 'ù',
        '\\`A': 'À',
        '\\`E': 'È',
        '\\`I': 'Ì',
        '\\`O': 'Ò',
        '\\`U': 'Ù',
        '\\~a': 'ã',
        '\\~e': 'ẽ',
        '\\~i': 'ĩ',
        '\\~o': 'õ',
        '\\~u': 'ũ',
        '\\~A': 'Ã',
        '\\~E': 'Ẽ',
        '\\~I': 'Ĩ',
        '\\~O': 'Õ',
        '\\~U': 'Ũ',
        '\\~n': 'ñ',
        '\\~N': 'Ñ',
        '\\^a': 'â',
        '\\^e': 'ê',
        '\\^i': 'î',
        '\\^o': 'ô',
        '\\^u': 'û',
        '\\^A': 'Â',
        '\\^E': 'Ê',
        '\\^I': 'Î',
        '\\^O': 'Ô',
        '\\^U': 'Û',
        '\\ss': 'ß',
        '\\ae': 'æ',
        '\\AE': 'Æ',
        '\\oe': 'œ',
        '\\OE': 'Œ',
        '\\l': 'ł',
        '\\L': 'Ł',
        '\\á': 'á',
        '\\é': 'é',
        '\\í': 'í',
        '\\ó': 'ó',
        '\\ú': 'ú',
        '\\Á': 'Á',
        '\\É': 'É',
        '\\Í': 'Í',
        '\\Ó': 'Ó',
        '\\Ú': 'Ú',
        '\\ñ': 'ñ',
        '\\Ñ': 'Ñ',
        '\\ü': 'ü',
        '\\Ü': 'Ü',
        '\\ç': 'ç',
        '\\Ç': 'Ç'
        };

    
    // Iteramos sobre el mapa y reemplazamos cada ocurrencia
    for (const specialChar in replacements) {
        cleaned = cleaned.replaceAll(specialChar, replacements[specialChar]);
    }
    
    // Normalizes multiple spaces to a single space
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
};


/**
 * Eliminate diacritics from a string.
 * @param {*} str - The input string. 
 * @returns {string} - The string without diacritics.
 */
const eliminateDiacritics = (str) => {
    if (!str) 
        return '';
    let cleaned = str.trim().replaceAll('{', '').replaceAll('}', '');
    cleaned = cleaned.normalize("NFD");  // Normalize to Canonical Decomposition Form (e.g., 'ó' -> 'o' + '́')
    cleaned = cleaned.replace(/[\u0300-\u036f]/g, "");  // Remove diacritics (Unicode range \u0300–\u036f)
    cleaned = cleaned.replace(/\s+/g, ' ').trim();  // Collapse multiple spaces
    return cleaned;
};


/**
 * Get formatted authors string from BibTeX author field.
 * @param {*} authorsStr - The raw authors string from BibTeX. 
 * @returns {string} - The formatted authors string.
 */
const getAuthors = (authorsStr) => {
    if (!authorsStr) {
        return '';
    }
    const delimiters = /\s+and\s+|;|,/g;
    return authorsStr.split(delimiters).map(name => normalizeAccents(name)).join(', ');
};


/**
 * Get the entry type based on various fields.
 * @param {*} entryType - The type of the entry (e.g., article, book).
 * @param {*} journal - The journal name (if applicable).
 * @param {*} booktitle - The book title (if applicable).
 * @param {*} isNational - Flag indicating if the entry is national.
 * @param {*} isWorkshop - Flag indicating if the entry is a workshop.
 * @param {*} publisher - The publisher name (if applicable).
 * @returns {string} - The determined entry type.
 */
const getEntryType = (entryType, journal, booktitle, isNational, isWorkshop, publisher) => {   
    if (isNational) 
        return 'national';
    if (entryType === 'proceedings') 
        return 'editorship';
    if (['book', 'phdthesis'].includes(entryType)) 
        return 'book';
    if (entryType === 'article')
        return (journal.toLowerCase() === 'corr') ? 'other' : 'journal';
    if (booktitle)
        return isWorkshop ? 'workshop' : 'conference';
    if (entryType === 'misc' && publisher === 'Zenodo')
        return 'dataArtifacts';
    return 'other';
};


/**
 * Searches and extracts the last explicit acronym (enclosed in parentheses or braces) in a given text.
 * @param {string} text - The source text (e.g., conference title).
 * @returns {string | null} The found acronym or null if none is found.
 */
const getExplicitAcronym = (text) => {
    if (typeof text !== 'string' || !text.trim()) {
        return null;
    }
    const trimmedText = text.trim();
    const acronymRegex = /[({]([0-9a-zA-Z\- @\s]+)[})]/g; 
    let match;
    let lastMatch = null;
    while ((match = acronymRegex.exec(trimmedText)) !== null) {
        lastMatch = match[1].trim();
    }
    return lastMatch || null;
};


/**
 * createInitialAcronym
 * Builds an acronym from the initials of the words in a text.
 * It truncates the result if it exceeds the specified maximum length (default is 8).
 * @param {string} text - The source text.
 * @param {number} maxLength - The maximum length of the generated acronym (default 8).
 * @returns {string} The generated and potentially truncated acronym.
 */
const createInitialAcronym = (text, maxLength = 8) => {
    if (typeof text !== 'string' || !text.trim()) {
        return '';
    }
    const cleanedText = text.replace(/[^a-zA-Z0-9\s]/g, '');
    const initialsAcronym = cleanedText
        .split(/\s+/)
        .filter(word => word.length > 0)
        .map(word => word.charAt(0))
        .join('')
        .toUpperCase();
    if (initialsAcronym.length > maxLength) {
        return initialsAcronym.slice(-maxLength); 
    }
    return initialsAcronym;
};


/**
 * Ensures that a DOI or URL is formatted as a full URL.
 * @param {*} doi - The raw DOI or URL string. 
 * @returns {string} - The formatted DOI URL. 
 */
const formatDoiUrl = (doi) => {
    if (!doi) return '';
    if (doi.startsWith('http')) return doi;
    return `https://doi.org/${doi.replace('doi.org/', '')}`;
};


/**
 * Converts a month string (name, abbreviation, or number) into its two-digit numerical representation.
 * @param {string} monthStr - The month string (e.g., "Jan", "January", "10").
 * @returns {string | null} The two-digit month number (e.g., "01", "12") or null if invalid.
 */
const getMonthNumber = (monthStr) => {
    if (!monthStr) 
        return null;
    const month = String(monthStr).toLowerCase().trim();
    if (!isNaN(month) && month.length <= 2) {
        const monthNum = parseInt(month, 10);
        if (monthNum >= 1 && monthNum <= 12) {
            return monthNum.toString().padStart(2, '0');
        }
    }
    const monthMap = {
        'jan': '01', 'january': '01',
        'feb': '02', 'february': '02',
        'mar': '03', 'march': '03',
        'apr': '04', 'april': '04',
        'may': '05',
        'jun': '06', 'june': '06',
        'jul': '07', 'july': '07',
        'aug': '08', 'august': '08',
        'sep': '09', 'sept': '09', 'september': '09',
        'oct': '10', 'october': '10',
        'nov': '11', 'november': '11',
        'dec': '12', 'december': '12'
    };
    return monthMap[month] || null;
};


/**
 * Convert a BibTeX entry object back to its string representation.
 * @param {*} entry - The BibTeX entry object.
 * @returns {string} - The string representation of the BibTeX entry.
 */
const generateBibtex = (entry) => {
    const type = entry.entryType;
    const key = entry.citationKey;
    const tags = entry.entryTags || {};
    const entries = Object.entries(tags)
        .map(([k, v]) => {
            if (k === 'entryType' || k === 'citationKey') return '';
            if (!v) return '';
            return `  ${k} = {${v}}`;
        })
        .filter(line => line !== '')
        .join(',\n');
    return `@${type}{${key},\n${entries}\n}`;
};


export { 
    normalizeAccents, 
    getAuthors, 
    getEntryType, 
    getExplicitAcronym,
    createInitialAcronym, 
    formatDoiUrl, 
    getMonthNumber,
    generateBibtex
};