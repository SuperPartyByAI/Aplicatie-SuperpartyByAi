'use strict';

/**
 * Role Detection Layer
 * 
 * Detects roles/services from user input with synonym support and confidence scoring.
 * Handles Romanian language with and without diacritics.
 */

const admin = require('firebase-admin');

class RoleDetector {
  constructor(db) {
    // In unit tests we don't want to require Firebase initialization.
    // Only use Firestore if an explicit db is provided OR firebase-admin is initialized.
    this.db = db || (admin.apps && admin.apps.length ? admin.firestore() : null);
    this.overridesCollection = 'aiOverrides';
    
    // Base role definitions with synonyms
    this.baseRoles = {
      animator: {
        label: 'Animator',
        synonyms: [
          'animator', 'animatori', 'animatoare',
          'personaj', 'personaje',
          'mascota', 'mascotă', 'mascote',
          'mc', 'm.c.',
          // Character names
          'elsa', 'ana', 'olaf', 'frozen',
          'spiderman', 'spider-man', 'omul-paianjen', 'omul paianjen',
          'batman', 'superman', 'flash',
          'mickey', 'minnie', 'donald',
          'peppa', 'peppa pig',
          'paw patrol', 'patrula catelusilor', 'patrula cățelușilor',
          'princess', 'printesa', 'prințesă',
        ],
        requiresDetails: true,
        detailsSchema: {
          sarbatoritNume: { required: true, type: 'string' },
          dataNastere: { required: true, type: 'date' },
          varstaReala: { required: false, type: 'number' },
          personaj: { required: false, type: 'string' },
          numarCopiiAprox: { required: false, type: 'number' },
          parentName: { required: false, type: 'string' },
        },
      },
      ursitoare: {
        label: 'Ursitoare',
        synonyms: [
          'ursitoare', 'ursitoarea', 'ursitoarele',
          'zana', 'zână', 'zane', 'zâne',
          'fairy', 'fairies',
        ],
        requiresDetails: true,
        detailsSchema: {
          count: { required: true, type: 'number', default: 3, options: [3, 4] },
          sarbatoritNume: { required: true, type: 'string' },
          dataNastere: { required: true, type: 'date' },
        },
        fixedDuration: 60, // minutes
      },
      vata: {
        label: 'Vată de zahăr',
        synonyms: [
          'vata', 'vată', 'vata de zahar', 'vată de zahăr',
          'cotton candy', 'candy floss',
          'zahar ars', 'zahăr ars',
        ],
        requiresDetails: false,
      },
      popcorn: {
        label: 'Popcorn',
        synonyms: [
          'popcorn', 'pop-corn', 'pop corn',
          'floricele', 'porumb',
        ],
        requiresDetails: false,
      },
      vataPopcorn: {
        label: 'Vată + Popcorn',
        synonyms: [
          'vata si popcorn', 'vată și popcorn',
          'vata + popcorn', 'vată + popcorn',
          'combo vata popcorn', 'combo vată popcorn',
        ],
        requiresDetails: false,
      },
      decoratiuni: {
        label: 'Decorațiuni',
        synonyms: [
          'decoratiuni', 'decorațiuni', 'decoratiune', 'decorațiune',
          'decor', 'decorare',
          'aranjamente', 'amenajare',
        ],
        requiresDetails: false,
      },
      baloane: {
        label: 'Baloane',
        synonyms: [
          'baloane', 'balon', 'balons',
          'balloon', 'balloons',
        ],
        requiresDetails: false,
      },
      baloaneHeliu: {
        label: 'Baloane cu heliu',
        synonyms: [
          'baloane cu heliu', 'baloane heliu',
          'heliu', 'helium',
          'baloane zburatoare', 'baloane zburătoare',
        ],
        requiresDetails: false,
      },
      aranjamenteMasa: {
        label: 'Aranjamente de masă',
        synonyms: [
          'aranjamente de masa', 'aranjamente de masă',
          'aranjamente masa', 'aranjamente masă',
          'decoratiuni masa', 'decorațiuni masă',
        ],
        requiresDetails: false,
      },
      mosCraciun: {
        label: 'Moș Crăciun',
        synonyms: [
          'mos craciun', 'moș crăciun', 'mos', 'moș',
          'santa', 'santa claus',
          'craciunul', 'crăciunul',
        ],
        requiresDetails: false,
      },
      gheataCarbonicaLabel: {
        label: 'Gheață carbonică',
        synonyms: [
          'gheata carbonica', 'gheață carbonică',
          'fum greu', 'fum',
          'dry ice',
          'efect fum', 'fum artificial',
        ],
        requiresDetails: false,
      },
      arcade: {
        label: 'Arcadă',
        synonyms: [
          'arcada', 'arcadă', 'arcade',
          'jocuri', 'jocuri arcade',
          'console', 'console jocuri',
        ],
        requiresDetails: false,
      },
      picturaPeFata: {
        label: 'Pictură pe față',
        synonyms: [
          'pictura pe fata', 'pictură pe față',
          'face painting', 'facepainting',
          'pictura fata', 'pictură față',
          'machiaj copii',
        ],
        requiresDetails: false,
      },
      sofer: {
        label: 'Șofer',
        synonyms: [
          'sofer', 'șofer', 'soferi', 'șoferi',
          'transport', 'masina', 'mașină',
          'driver',
        ],
        requiresDetails: false,
      },
    };
  }

  /**
   * Normalize text for matching (remove diacritics, lowercase, trim)
   */
  normalizeText(text) {
    if (!text) return '';
    
    return text
      .toLowerCase()
      .trim()
      .replace(/ă/g, 'a')
      .replace(/â/g, 'a')
      .replace(/î/g, 'i')
      .replace(/ș/g, 's')
      .replace(/ț/g, 't');
  }

  /**
   * Load AI overrides from Firestore
   */
  async loadOverrides() {
    // Safe fallback if db is not initialized (e.g., in tests)
    if (!this.db) {
      return {};
    }
    
    try {
      const overridesSnap = await this.db
        .collection(this.overridesCollection)
        .where('scope', 'in', ['global', 'roleType'])
        .get();

      const overrides = {};
      
      overridesSnap.forEach(doc => {
        const data = doc.data();
        if (data.roleType && data.synonyms) {
          if (!overrides[data.roleType]) {
            overrides[data.roleType] = [];
          }
          overrides[data.roleType].push(...data.synonyms);
        }
      });

      return overrides;
    } catch (error) {
      console.error('Error loading AI overrides:', error);
      return {};
    }
  }

  /**
   * Detect roles from user input text
   */
  async detectRoles(text) {
    const normalizedText = this.normalizeText(text);
    const words = normalizedText.split(/\s+/);
    
    // Load overrides
    const overrides = await this.loadOverrides();

    const detectedRoles = [];

    // Check each role definition
    for (const [roleKey, roleDef] of Object.entries(this.baseRoles)) {
      // Combine base synonyms with overrides
      const allSynonyms = [
        ...roleDef.synonyms,
        ...(overrides[roleKey] || []),
      ].map(s => this.normalizeText(s));

      let confidence = 0;
      let matchedSynonym = null;

      // Check for exact phrase match
      for (const synonym of allSynonyms) {
        if (normalizedText.includes(synonym)) {
          confidence = 1.0;
          matchedSynonym = synonym;
          break;
        }
      }

      // Check for word match if no phrase match
      if (confidence === 0) {
        for (const synonym of allSynonyms) {
          const synonymWords = synonym.split(/\s+/);
          const matchCount = synonymWords.filter(sw => words.includes(sw)).length;
          
          if (matchCount > 0) {
            const wordConfidence = matchCount / synonymWords.length;
            if (wordConfidence > confidence) {
              confidence = wordConfidence;
              matchedSynonym = synonym;
            }
          }
        }
      }

      // If confidence is high enough, add to detected roles
      if (confidence >= 0.5) {
        detectedRoles.push({
          roleKey,
          label: roleDef.label,
          confidence,
          matchedSynonym,
          requiresDetails: roleDef.requiresDetails || false,
          detailsSchema: roleDef.detailsSchema || null,
          fixedDuration: roleDef.fixedDuration || null,
        });
      }
    }

    // Sort by confidence (highest first)
    detectedRoles.sort((a, b) => b.confidence - a.confidence);

    return detectedRoles;
  }

  /**
   * Extract role details from text (for animator, ursitoare, etc.)
   */
  extractRoleDetails(text, roleKey) {
    const roleDef = this.baseRoles[roleKey];
    if (!roleDef || !roleDef.requiresDetails) {
      return null;
    }

    const details = {};

    // Extract based on schema
    if (roleDef.detailsSchema) {
      // Extract name (common patterns)
      const namePatterns = [
        /pentru\s+([a-zA-ZăâîșțĂÂÎȘȚ]+)/i,
        /nume[a-z\s]*:\s*([a-zA-ZăâîșțĂÂÎȘȚ]+)/i,
        /sarbatorit[a-z\s]*:\s*([a-zA-ZăâîșțĂÂÎȘȚ]+)/i,
      ];

      for (const pattern of namePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          details.sarbatoritNume = match[1].trim();
          break;
        }
      }

      // Extract age
      const agePatterns = [
        /(\d+)\s*ani/i,
        /varsta[a-z\s]*:\s*(\d+)/i,
        /age[a-z\s]*:\s*(\d+)/i,
      ];

      for (const pattern of agePatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          details.varstaReala = parseInt(match[1], 10);
          break;
        }
      }

      // Extract date of birth
      const dobPatterns = [
        /(\d{2}[-/.]\d{2}[-/.]\d{4})/,
        /nascut[a-z\s]*:\s*(\d{2}[-/.]\d{2}[-/.]\d{4})/i,
      ];

      for (const pattern of dobPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
          details.dataNastere = match[1].replace(/[/.]/g, '-');
          break;
        }
      }

      // Extract character/theme (for animator)
      if (roleKey === 'animator') {
        const characterPatterns = [
          /personaj[a-z\s]*:\s*([a-zA-ZăâîșțĂÂÎȘȚ\s-]+)/i,
          /tema[a-z\s]*:\s*([a-zA-ZăâîșțĂÂÎȘȚ\s-]+)/i,
          /costum[a-z\s]*:\s*([a-zA-ZăâîșțĂÂÎȘȚ\s-]+)/i,
        ];

        for (const pattern of characterPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            details.personaj = match[1].trim();
            break;
          }
        }

        // Check if any character name is mentioned
        const characterNames = [
          'elsa', 'ana', 'olaf', 'frozen',
          'spiderman', 'spider-man', 'batman', 'superman', 'flash',
          'mickey', 'minnie', 'donald',
          'peppa', 'paw patrol',
        ];

        const normalizedText = this.normalizeText(text);
        for (const charName of characterNames) {
          if (normalizedText.includes(charName)) {
            details.personaj = charName;
            break;
          }
        }

        // Check for MC
        if (/\bmc\b/i.test(text) || /m\.c\./i.test(text)) {
          details.personaj = 'MC';
        }
      }

      // Extract count (for ursitoare)
      if (roleKey === 'ursitoare') {
        const countPatterns = [
          /(\d+)\s*ursitoare/i,
          /ursitoare[a-z\s]*:\s*(\d+)/i,
        ];

        for (const pattern of countPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            details.count = parseInt(match[1], 10);
            break;
          }
        }

        // Default to 3 if not specified
        if (!details.count) {
          details.count = 3;
        }

        // If 4 ursitoare, automatically include 1 rea
        if (details.count === 4) {
          details.includesRea = true;
        }
      }
    }

    return Object.keys(details).length > 0 ? details : null;
  }

  /**
   * Parse duration from various formats
   */
  parseDuration(text) {
    if (!text || typeof text !== 'string') {
      return null;
    }
    
    const normalizedText = this.normalizeText(text);

    // Special cases first (before number patterns)
    // "o oră jumătate" = 1.5 hours = 90 minutes
    if (/o\s+ora\s+jumatate|o\s+ora\s+si\s+jumatate|o\s+ora\s+si\s+o\s+jumatate/.test(normalizedText)) {
      return 90;
    }
    
    // "jumătate de oră" = 0.5 hours = 30 minutes
    if (/jumatate\s+de\s+ora|jumatate\s+ora/.test(normalizedText)) {
      return 30;
    }

    // Hours and minutes combined: "2 ore si 30 minute", "1 oră și 15 minute"
    const hoursAndMinutesPattern = /(\d+)\s*(?:ora|ore|hour|hours|h)\s*(?:si|și|and)?\s*(\d+)\s*(?:minute|min|m)/i;
    const hoursAndMinutesMatch = normalizedText.match(hoursAndMinutesPattern);
    if (hoursAndMinutesMatch) {
      const hours = parseInt(hoursAndMinutesMatch[1], 10);
      const minutes = parseInt(hoursAndMinutesMatch[2], 10);
      return hours * 60 + minutes;
    }

    // Hours patterns: "1 oră", "2 ore", "3h", "1.5 ore", "2,5 ore"
    const hoursPatterns = [
      /(\d+(?:[.,]\d+)?)\s*(?:ora|ore|hour|hours|h|hr|hrs)/i,
    ];

    for (const pattern of hoursPatterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        const hours = parseFloat(match[1].replace(',', '.'));
        return Math.round(hours * 60);
      }
    }

    // Minutes patterns: "90 minute", "30 min", "45m"
    const minutesPatterns = [
      /(\d+)\s*(?:minute|min|m)/i,
    ];

    for (const pattern of minutesPatterns) {
      const match = normalizedText.match(pattern);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    // Direct number (assume hours if < 10, otherwise minutes)
    const directNumber = /^(\d+)$/.exec(normalizedText);
    if (directNumber) {
      const num = parseInt(directNumber[1], 10);
      // If number is small (< 10), assume hours, otherwise minutes
      return num < 10 ? num * 60 : num;
    }

    return null;
  }

  /**
   * Get role definition by key
   */
  getRoleDefinition(roleKey) {
    return this.baseRoles[roleKey] || null;
  }

  /**
   * Get all available roles
   */
  getAllRoles() {
    return Object.entries(this.baseRoles).map(([key, def]) => ({
      key,
      label: def.label,
      requiresDetails: def.requiresDetails || false,
      fixedDuration: def.fixedDuration || null,
    }));
  }
}

module.exports = RoleDetector;
