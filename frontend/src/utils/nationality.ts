/**
 * Centralized nationality utilities for consistent flag display and country handling
 */

export interface CountryInfo {
  name: string;
  flag: string;
  iso2: string;
  iso3: string;
  variants: string[];
}

// Comprehensive country database for FWT events
const COUNTRIES: Record<string, CountryInfo> = {
  // Switzerland
  'SWITZERLAND': {
    name: 'Switzerland',
    flag: '🇨🇭',
    iso2: 'CH',
    iso3: 'SUI',
    variants: ['SUI', 'CH', 'Switzerland', 'Schweiz']
  },
  
  // France
  'FRANCE': {
    name: 'France',
    flag: '🇫🇷',
    iso2: 'FR',
    iso3: 'FRA',
    variants: ['FRA', 'FR', 'France', 'Frankreich']
  },
  
  // Austria
  'AUSTRIA': {
    name: 'Austria',
    flag: '🇦🇹',
    iso2: 'AT',
    iso3: 'AUT',
    variants: ['AUT', 'AT', 'Austria', 'Österreich']
  },
  
  // Germany
  'GERMANY': {
    name: 'Germany',
    flag: '🇩🇪',
    iso2: 'DE',
    iso3: 'GER',
    variants: ['GER', 'DE', 'Germany', 'Deutschland']
  },
  
  // Italy
  'ITALY': {
    name: 'Italy',
    flag: '🇮🇹',
    iso2: 'IT',
    iso3: 'ITA',
    variants: ['ITA', 'IT', 'Italy', 'Italien']
  },
  
  // United States
  'USA': {
    name: 'USA',
    flag: '🇺🇸',
    iso2: 'US',
    iso3: 'USA',
    variants: ['USA', 'US', 'United States', 'United States of America', 'America']
  },
  
  // Canada
  'CANADA': {
    name: 'Canada',
    flag: '🇨🇦',
    iso2: 'CA',
    iso3: 'CAN',
    variants: ['CAN', 'CA', 'Canada', 'Kanada']
  },
  
  // Norway
  'NORWAY': {
    name: 'Norway',
    flag: '🇳🇴',
    iso2: 'NO',
    iso3: 'NOR',
    variants: ['NOR', 'NO', 'Norway', 'Norwegen']
  },
  
  // Sweden
  'SWEDEN': {
    name: 'Sweden',
    flag: '🇸🇪',
    iso2: 'SE',
    iso3: 'SWE',
    variants: ['SWE', 'SE', 'Sweden', 'Schweden']
  },
  
  // Finland
  'FINLAND': {
    name: 'Finland',
    flag: '🇫🇮',
    iso2: 'FI',
    iso3: 'FIN',
    variants: ['FIN', 'FI', 'Finland', 'Finnland']
  },
  
  // Spain
  'SPAIN': {
    name: 'Spain',
    flag: '🇪🇸',
    iso2: 'ES',
    iso3: 'ESP',
    variants: ['ESP', 'ES', 'Spain', 'Spanien']
  },
  
  // Andorra
  'ANDORRA': {
    name: 'Andorra',
    flag: '🇦🇩',
    iso2: 'AD',
    iso3: 'AND',
    variants: ['AND', 'AD', 'Andorra']
  },
  
  // Australia
  'AUSTRALIA': {
    name: 'Australia',
    flag: '🇦🇺',
    iso2: 'AU',
    iso3: 'AUS',
    variants: ['AUS', 'AU', 'Australia', 'Australien']
  },
  
  // United Kingdom
  'UK': {
    name: 'United Kingdom',
    flag: '🇬🇧',
    iso2: 'GB',
    iso3: 'GBR',
    variants: ['GBR', 'GB', 'UK', 'United Kingdom', 'United Kingdom of Great Britain and Northern Ireland', 'Great Britain', 'Britain']
  },
  
  // New Zealand
  'NEW_ZEALAND': {
    name: 'New Zealand',
    flag: '🇳🇿',
    iso2: 'NZ',
    iso3: 'NZL',
    variants: ['NZL', 'NZ', 'New Zealand', 'Neuseeland']
  },
  
  // Japan
  'JAPAN': {
    name: 'Japan',
    flag: '🇯🇵',
    iso2: 'JP',
    iso3: 'JPN',
    variants: ['JPN', 'JP', 'Japan']
  },
  
  // Chile
  'CHILE': {
    name: 'Chile',
    flag: '🇨🇱',
    iso2: 'CL',
    iso3: 'CHI',
    variants: ['CHI', 'CL', 'Chile']
  },
  
  // Argentina
  'ARGENTINA': {
    name: 'Argentina',
    flag: '🇦🇷',
    iso2: 'AR',
    iso3: 'ARG',
    variants: ['ARG', 'AR', 'Argentina', 'Argentinien']
  },
  
  // Poland
  'POLAND': {
    name: 'Poland',
    flag: '🇵🇱',
    iso2: 'PL',
    iso3: 'POL',
    variants: ['POL', 'PL', 'Poland', 'Polen']
  },
  
  // Czech Republic
  'CZECH_REPUBLIC': {
    name: 'Czech Republic',
    flag: '🇨🇿',
    iso2: 'CZ',
    iso3: 'CZE',
    variants: ['CZE', 'CZ', 'Czech Republic', 'Czechia', 'Tschechien']
  },
  
  // Slovakia
  'SLOVAKIA': {
    name: 'Slovakia',
    flag: '🇸🇰',
    iso2: 'SK',
    iso3: 'SVK',
    variants: ['SVK', 'SK', 'Slovakia', 'Slowakei']
  },
  
  // Slovenia
  'SLOVENIA': {
    name: 'Slovenia',
    flag: '🇸🇮',
    iso2: 'SI',
    iso3: 'SVN',
    variants: ['SVN', 'SI', 'Slovenia', 'Slowenien']
  },
  
  // Russia
  'RUSSIA': {
    name: 'Russia',
    flag: '🇷🇺',
    iso2: 'RU',
    iso3: 'RUS',
    variants: ['RUS', 'RU', 'Russia', 'Russian Federation', 'Russland']
  },
  
  // Denmark
  'DENMARK': {
    name: 'Denmark',
    flag: '🇩🇰',
    iso2: 'DK',
    iso3: 'DEN',
    variants: ['DEN', 'DK', 'Denmark', 'Dänemark']
  },
  
  // Netherlands
  'NETHERLANDS': {
    name: 'Netherlands',
    flag: '🇳🇱',
    iso2: 'NL',
    iso3: 'NED',
    variants: ['NED', 'NL', 'Netherlands', 'Holland', 'Niederlande']
  },
  
  // Belgium
  'BELGIUM': {
    name: 'Belgium',
    flag: '🇧🇪',
    iso2: 'BE',
    iso3: 'BEL',
    variants: ['BEL', 'BE', 'Belgium', 'Belgien']
  },
  
  // Iceland
  'ICELAND': {
    name: 'Iceland',
    flag: '🇮🇸',
    iso2: 'IS',
    iso3: 'ISL',
    variants: ['ISL', 'IS', 'Iceland', 'Island']
  },
  
  // South Korea
  'SOUTH_KOREA': {
    name: 'South Korea',
    flag: '🇰🇷',
    iso2: 'KR',
    iso3: 'KOR',
    variants: ['KOR', 'KR', 'South Korea', 'Korea', 'Republic of Korea', 'Südkorea']
  },
  
  // China
  'CHINA': {
    name: 'China',
    flag: '🇨🇳',
    iso2: 'CN',
    iso3: 'CHN',
    variants: ['CHN', 'CN', 'China', "People's Republic of China"]
  },

  // Ireland
  'IRELAND': {
    name: 'Ireland',
    flag: '🇮🇪',
    iso2: 'IE',
    iso3: 'IRL',
    variants: ['IRL', 'IE', 'Ireland', 'Irland']
  },

  // Bulgaria
  'BULGARIA': {
    name: 'Bulgaria',
    flag: '🇧🇬',
    iso2: 'BG',
    iso3: 'BGR',
    variants: ['BGR', 'BG', 'Bulgaria', 'Bulgarien']
  },

  // Liechtenstein
  'LIECHTENSTEIN': {
    name: 'Liechtenstein',
    flag: '🇱🇮',
    iso2: 'LI',
    iso3: 'LIE',
    variants: ['LIE', 'LI', 'Liechtenstein']
  },

  // Ukraine
  'UKRAINE': {
    name: 'Ukraine',
    flag: '🇺🇦',
    iso2: 'UA',
    iso3: 'UKR',
    variants: ['UKR', 'UA', 'Ukraine']
  },

  // Romania
  'ROMANIA': {
    name: 'Romania',
    flag: '🇷🇴',
    iso2: 'RO',
    iso3: 'ROU',
    variants: ['ROU', 'RO', 'Romania', 'Rumänien']
  },

  // Hungary
  'HUNGARY': {
    name: 'Hungary',
    flag: '🇭🇺',
    iso2: 'HU',
    iso3: 'HUN',
    variants: ['HUN', 'HU', 'Hungary', 'Ungarn']
  },

  // Croatia
  'CROATIA': {
    name: 'Croatia',
    flag: '🇭🇷',
    iso2: 'HR',
    iso3: 'HRV',
    variants: ['HRV', 'HR', 'Croatia', 'Kroatien']
  },

  // Serbia
  'SERBIA': {
    name: 'Serbia',
    flag: '🇷🇸',
    iso2: 'RS',
    iso3: 'SRB',
    variants: ['SRB', 'RS', 'Serbia', 'Serbien']
  },

  // Bosnia and Herzegovina
  'BOSNIA': {
    name: 'Bosnia and Herzegovina',
    flag: '🇧🇦',
    iso2: 'BA',
    iso3: 'BIH',
    variants: ['BIH', 'BA', 'Bosnia and Herzegovina', 'Bosnia', 'Bosnien']
  },

  // Montenegro
  'MONTENEGRO': {
    name: 'Montenegro',
    flag: '🇲🇪',
    iso2: 'ME',
    iso3: 'MNE',
    variants: ['MNE', 'ME', 'Montenegro']
  },

  // Lithuania
  'LITHUANIA': {
    name: 'Lithuania',
    flag: '🇱🇹',
    iso2: 'LT',
    iso3: 'LTU',
    variants: ['LTU', 'LT', 'Lithuania', 'Litauen']
  },

  // Latvia
  'LATVIA': {
    name: 'Latvia',
    flag: '🇱🇻',
    iso2: 'LV',
    iso3: 'LVA',
    variants: ['LVA', 'LV', 'Latvia', 'Lettland']
  },

  // Estonia
  'ESTONIA': {
    name: 'Estonia',
    flag: '🇪🇪',
    iso2: 'EE',
    iso3: 'EST',
    variants: ['EST', 'EE', 'Estonia', 'Estland']
  },

  // Greece
  'GREECE': {
    name: 'Greece',
    flag: '🇬🇷',
    iso2: 'GR',
    iso3: 'GRC',
    variants: ['GRC', 'GR', 'Greece', 'Griechenland']
  },

  // Turkey
  'TURKEY': {
    name: 'Turkey',
    flag: '🇹🇷',
    iso2: 'TR',
    iso3: 'TUR',
    variants: ['TUR', 'TR', 'Turkey', 'Türkei']
  },

  // Portugal
  'PORTUGAL': {
    name: 'Portugal',
    flag: '🇵🇹',
    iso2: 'PT',
    iso3: 'PRT',
    variants: ['PRT', 'PT', 'Portugal']
  },

  // Luxembourg
  'LUXEMBOURG': {
    name: 'Luxembourg',
    flag: '🇱🇺',
    iso2: 'LU',
    iso3: 'LUX',
    variants: ['LUX', 'LU', 'Luxembourg', 'Luxemburg']
  },

  // Belarus
  'BELARUS': {
    name: 'Belarus',
    flag: '🇧🇾',
    iso2: 'BY',
    iso3: 'BLR',
    variants: ['BLR', 'BY', 'Belarus', 'Weißrussland']
  },

  // Kazakhstan
  'KAZAKHSTAN': {
    name: 'Kazakhstan',
    flag: '🇰🇿',
    iso2: 'KZ',
    iso3: 'KAZ',
    variants: ['KAZ', 'KZ', 'Kazakhstan', 'Kasachstan']
  },

  // Georgia
  'GEORGIA': {
    name: 'Georgia',
    flag: '🇬🇪',
    iso2: 'GE',
    iso3: 'GEO',
    variants: ['GEO', 'GE', 'Georgia', 'Georgien']
  },

  // Armenia
  'ARMENIA': {
    name: 'Armenia',
    flag: '🇦🇲',
    iso2: 'AM',
    iso3: 'ARM',
    variants: ['ARM', 'AM', 'Armenia', 'Armenien']
  },

  // Moldova
  'MOLDOVA': {
    name: 'Moldova',
    flag: '🇲🇩',
    iso2: 'MD',
    iso3: 'MDA',
    variants: ['MDA', 'MD', 'Moldova', 'Republic of Moldova', 'Moldawien']
  },

  // Israel
  'ISRAEL': {
    name: 'Israel',
    flag: '🇮🇱',
    iso2: 'IL',
    iso3: 'ISR',
    variants: ['ISR', 'IL', 'Israel']
  },

  // Cyprus
  'CYPRUS': {
    name: 'Cyprus',
    flag: '🇨🇾',
    iso2: 'CY',
    iso3: 'CYP',
    variants: ['CYP', 'CY', 'Cyprus', 'Zypern']
  },

  // Malta
  'MALTA': {
    name: 'Malta',
    flag: '🇲🇹',
    iso2: 'MT',
    iso3: 'MLT',
    variants: ['MLT', 'MT', 'Malta']
  },

  // Monaco
  'MONACO': {
    name: 'Monaco',
    flag: '🇲🇨',
    iso2: 'MC',
    iso3: 'MCO',
    variants: ['MCO', 'MC', 'Monaco']
  },

  // San Marino
  'SAN_MARINO': {
    name: 'San Marino',
    flag: '🇸🇲',
    iso2: 'SM',
    iso3: 'SMR',
    variants: ['SMR', 'SM', 'San Marino']
  },

  // Brazil
  'BRAZIL': {
    name: 'Brazil',
    flag: '🇧🇷',
    iso2: 'BR',
    iso3: 'BRA',
    variants: ['BRA', 'BR', 'Brazil', 'Brasil', 'Brasilien']
  },

  // Peru
  'PERU': {
    name: 'Peru',
    flag: '🇵🇪',
    iso2: 'PE',
    iso3: 'PER',
    variants: ['PER', 'PE', 'Peru']
  },

  // Uruguay
  'URUGUAY': {
    name: 'Uruguay',
    flag: '🇺🇾',
    iso2: 'UY',
    iso3: 'URY',
    variants: ['URY', 'UY', 'Uruguay']
  },

  // Ecuador
  'ECUADOR': {
    name: 'Ecuador',
    flag: '🇪🇨',
    iso2: 'EC',
    iso3: 'ECU',
    variants: ['ECU', 'EC', 'Ecuador']
  },

  // Colombia
  'COLOMBIA': {
    name: 'Colombia',
    flag: '🇨🇴',
    iso2: 'CO',
    iso3: 'COL',
    variants: ['COL', 'CO', 'Colombia', 'Kolumbien']
  },

  // Venezuela
  'VENEZUELA': {
    name: 'Venezuela',
    flag: '🇻🇪',
    iso2: 'VE',
    iso3: 'VEN',
    variants: ['VEN', 'VE', 'Venezuela']
  },

  // Bolivia
  'BOLIVIA': {
    name: 'Bolivia',
    flag: '🇧🇴',
    iso2: 'BO',
    iso3: 'BOL',
    variants: ['BOL', 'BO', 'Bolivia', 'Bolivien']
  },

  // Paraguay
  'PARAGUAY': {
    name: 'Paraguay',
    flag: '🇵🇾',
    iso2: 'PY',
    iso3: 'PRY',
    variants: ['PRY', 'PY', 'Paraguay']
  },

  // Mexico
  'MEXICO': {
    name: 'Mexico',
    flag: '🇲🇽',
    iso2: 'MX',
    iso3: 'MEX',
    variants: ['MEX', 'MX', 'Mexico', 'Mexiko']
  },

  // South Africa
  'SOUTH_AFRICA': {
    name: 'South Africa',
    flag: '🇿🇦',
    iso2: 'ZA',
    iso3: 'RSA',
    variants: ['RSA', 'ZA', 'South Africa', 'Südafrika']
  },

  // India
  'INDIA': {
    name: 'India',
    flag: '🇮🇳',
    iso2: 'IN',
    iso3: 'IND',
    variants: ['IND', 'IN', 'India', 'Indien']
  },

  // Iran
  'IRAN': {
    name: 'Iran',
    flag: '🇮🇷',
    iso2: 'IR',
    iso3: 'IRN',
    variants: ['IRN', 'IR', 'Iran', 'Islamic Republic of Iran']
  },

  // Lebanon
  'LEBANON': {
    name: 'Lebanon',
    flag: '🇱🇧',
    iso2: 'LB',
    iso3: 'LBN',
    variants: ['LBN', 'LB', 'Lebanon', 'Libanon']
  },

  // Morocco
  'MOROCCO': {
    name: 'Morocco',
    flag: '🇲🇦',
    iso2: 'MA',
    iso3: 'MAR',
    variants: ['MAR', 'MA', 'Morocco', 'Marokko']
  }
};

// Create a reverse lookup map for quick normalization
const NATIONALITY_LOOKUP: Record<string, string> = {};
Object.entries(COUNTRIES).forEach(([key, country]) => {
  country.variants.forEach(variant => {
    NATIONALITY_LOOKUP[variant.toLowerCase()] = key;
  });
});

/**
 * Normalize a nationality string to a standard country key
 */
export function normalizeNationality(nationality?: string): string | null {
  if (!nationality || nationality.trim() === '') {
    return null;
  }
  
  const normalized = nationality.trim().toLowerCase();
  return NATIONALITY_LOOKUP[normalized] || null;
}

/**
 * Get country information for a nationality
 */
export function getCountryInfo(nationality?: string): CountryInfo | null {
  const normalizedKey = normalizeNationality(nationality);
  return normalizedKey ? COUNTRIES[normalizedKey] : null;
}

/**
 * Get country flag emoji for a nationality
 */
export function getCountryFlag(nationality?: string): string {
  const countryInfo = getCountryInfo(nationality);
  return countryInfo?.flag || '🌍';
}

/**
 * Get display name for a nationality
 */
export function getNationalityDisplay(nationality?: string): string {
  if (!nationality || nationality.trim() === '') {
    return 'No data found';
  }
  
  const countryInfo = getCountryInfo(nationality);
  if (countryInfo) {
    return countryInfo.name;
  }
  
  // Fallback: try to clean up long names
  const shortNames: Record<string, string> = {
    'United States of America': 'USA',
    'United Kingdom of Great Britain and Northern Ireland': 'United Kingdom',
  };
  
  return shortNames[nationality] || nationality;
}

/**
 * Count unique nationalities from a list of athletes
 * This function properly normalizes nationalities to avoid double-counting
 */
export function countUniqueNationalities(athletes: Array<{ nationality?: string }>): number {
  const uniqueCountries = new Set<string>();
  
  athletes.forEach(athlete => {
    const normalizedKey = normalizeNationality(athlete.nationality);
    if (normalizedKey) {
      uniqueCountries.add(normalizedKey);
    } else if (!athlete.nationality || athlete.nationality.trim() === '') {
      // Count "No data found" as a separate category
      uniqueCountries.add('NO_DATA_FOUND');
    }
  });
  
  return uniqueCountries.size;
}

/**
 * Get list of all nationalities present in a list of athletes
 * Returns normalized country names
 */
export function getNationalitiesList(athletes: Array<{ nationality?: string }>): string[] {
  const uniqueCountries = new Set<string>();
  
  athletes.forEach(athlete => {
    const countryInfo = getCountryInfo(athlete.nationality);
    if (countryInfo) {
      uniqueCountries.add(countryInfo.name);
    } else if (!athlete.nationality || athlete.nationality.trim() === '') {
      uniqueCountries.add('No data found');
    }
  });
  
  return Array.from(uniqueCountries).sort();
}

/**
 * Check if a nationality search query matches an athlete
 */
export function matchesNationalitySearch(nationality?: string, query: string): boolean {
  // Handle "No data found" case
  if (!nationality || nationality.trim() === '') {
    const queryLower = query.toLowerCase();
    return ['no data', 'no data found', 'unknown', 'missing', 'null', 'none'].some(term => 
      queryLower.includes(term) || term.includes(queryLower)
    );
  }
  
  const countryInfo = getCountryInfo(nationality);
  if (!countryInfo) {
    // Fallback to direct string matching
    return nationality.toLowerCase().includes(query.toLowerCase());
  }
  
  // Check all variants and country info
  const searchTargets = [
    countryInfo.name,
    countryInfo.iso2,
    countryInfo.iso3,
    ...countryInfo.variants
  ];
  
  return searchTargets.some(target => 
    target.toLowerCase().includes(query.toLowerCase())
  );
}