'use client';

import { useState, useRef } from 'react';
import { Upload, X, FileSpreadsheet, AlertCircle, CheckCircle, Users } from 'lucide-react';
import Papa from 'papaparse';

import { Athlete } from '@/types/athletes';
import { useTranslation } from '@/providers/TranslationProvider';

interface CSVRow {
  [key: string]: string;
}

interface ParsedCSVData {
  firstName: string;
  lastName: string;
  matchedAthleteId?: string;
  matchedAthleteName?: string;
  confidence: number;
  customFields: Record<string, string>;
  standardFields: Record<string, string>;
}

interface CSVUploadComponentProps {
  athletes: Athlete[];
  onDataParsed: (data: ParsedCSVData[]) => void;
  onClose?: () => void;
  onBulkImport?: (data: ParsedCSVData[], targetUserId?: string) => void;
  isAdmin?: boolean;
  availableUsers?: Array<{ id: string; full_name: string; email: string }>;
}

const stripBom = (value: string): string => value.replace(/^\uFEFF/, '');

const normalizeHeaderLabel = (value: string): string =>
  stripBom(value).replace(/\s+/g, ' ').trim();

const normalizeHeaderForMatch = (value: string): string =>
  normalizeHeaderLabel(value).toLowerCase();

const buildCustomKeyMap = (headers: string[]): Map<string, string> => {
  const usedKeys = new Set<string>();
  const headerToKey = new Map<string, string>();

  headers.forEach((header) => {
    const baseKey = normalizeHeaderLabel(header);
    if (!baseKey) {
      headerToKey.set(header, header);
      return;
    }

    let key = baseKey;
    let suffix = 2;
    while (usedKeys.has(key)) {
      const candidate = `${baseKey}__${suffix}`;
      key = candidate.slice(0, 255);
      suffix += 1;
    }

    usedKeys.add(key);
    headerToKey.set(header, key);
  });

  return headerToKey;
};

const normalizeName = (value: string): string =>
  value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

export function CSVUploadComponent({ 
  athletes, 
  onDataParsed, 
  onClose,
  onBulkImport,
  isAdmin = false,
  availableUsers = []
}: CSVUploadComponentProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isDragOver, setIsDragOver] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [_csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [_csvData, setCsvData] = useState<CSVRow[]>([]);
  const [parsedData, setParsedData] = useState<ParsedCSVData[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [manualAssignments, setManualAssignments] = useState<Record<number, string>>({});

  // Handle manual athlete assignment
  const handleManualAssign = (rowIndex: number, athleteId: string) => {
    const athlete = athletes.find(a => a.id === athleteId);

    setManualAssignments(prev => ({
      ...prev,
      [rowIndex]: athleteId
    }));

    // Update parsedData with the manual assignment
    setParsedData(prev => prev.map((row, idx) => {
      if (idx === rowIndex) {
        return {
          ...row,
          matchedAthleteId: athleteId || undefined,
          matchedAthleteName: athlete?.name || undefined,
          confidence: athleteId ? 100 : 0
        };
      }
      return row;
    }));
  };

  // Simple fuzzy matching for athlete names
  const matchAthlete = (firstName: string, lastName: string): { athlete?: Athlete; confidence: number } => {
    const fullName = normalizeName(`${firstName} ${lastName}`);
    
    let bestMatch: Athlete | undefined;
    let bestScore = 0;
    
    for (const athlete of athletes) {
      const athleteName = normalizeName(athlete.name);
      
      // Exact match
      if (athleteName === fullName) {
        return { athlete, confidence: 100 };
      }
      
      // Partial match - check if all parts of input are in athlete name
      const inputParts = fullName.split(' ').filter(p => p.length > 0);
      const athleteParts = athleteName.split(' ').filter(p => p.length > 0);
      
      let matchedParts = 0;
      for (const inputPart of inputParts) {
        for (const athletePart of athleteParts) {
          if (athletePart.includes(inputPart) || inputPart.includes(athletePart)) {
            matchedParts++;
            break;
          }
        }
      }
      
      const score = (matchedParts / inputParts.length) * 100;
      if (score > bestScore && score >=80) { // Minimum 60% confidence
        bestScore = score;
        bestMatch = athlete;
      }
    }
    
    return { athlete: bestMatch, confidence: bestScore };
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError(t('credits.csvUpload.errors.selectCSV'));
      return;
    }

    setIsLoading(true);
    setError(null);

    const processResults = (results: Papa.ParseResult<CSVRow>) => {
      try {
        if (results.errors.length > 0) {
          console.warn('CSV parse warnings:', results.errors);
        }

        const data = results.data as CSVRow[];
        const headers = results.meta.fields || [];

        if (headers.length < 3) {
          setError(t('credits.csvUpload.errors.minimumColumns'));
          setIsLoading(false);
          return;
        }

        setCsvHeaders(headers);
        setCsvData(data);
        const customKeyMap = buildCustomKeyMap(headers);

        // Process the data
        const processed: ParsedCSVData[] = data.map(row => {
          const firstName = (row[headers[0]] || '').trim();
          const lastName = (row[headers[1]] || '').trim();
          
          const { athlete, confidence } = matchAthlete(firstName, lastName);
          
          // Separate custom fields (from column C onwards)
          const customFields: Record<string, string> = {};
          const standardFields: Record<string, string> = {};
          
          for (let i = 2; i < headers.length; i++) {
            const header = headers[i];
            const value = (row[header] || '').trim();
            
            if (value) {
              // Map known headers to standard fields
              const lowerHeader = normalizeHeaderForMatch(header);
              if (lowerHeader.includes('homebase') || lowerHeader.includes('home')) {
                standardFields.homebase = value;
              } else if (lowerHeader.includes('team')) {
                standardFields.team = value;
              } else if (lowerHeader.includes('sponsor')) {
                standardFields.sponsors = value;
              } else if (lowerHeader.includes('trick') || lowerHeader.includes('favorite')) {
                standardFields.favorite_trick = value;
              } else if (lowerHeader.includes('achievement')) {
                standardFields.achievements = value;
              } else if (lowerHeader.includes('injur')) {
                standardFields.injuries = value;
              } else if (lowerHeader.includes('fun') || lowerHeader.includes('fact')) {
                standardFields.fun_facts = value;
              } else if (lowerHeader.includes('note')) {
                standardFields.notes = value;
              } else if (lowerHeader.includes('instagram')) {
                standardFields.instagram = value;
              } else if (lowerHeader.includes('youtube')) {
                standardFields.youtube = value;
              } else if (lowerHeader.includes('website')) {
                standardFields.website = value;
              } else {
                // Custom field
                const customKey = customKeyMap.get(header) || normalizeHeaderLabel(header);
                customFields[customKey] = value;
              }
            }
          }

          return {
            firstName,
            lastName,
            matchedAthleteId: athlete?.id,
            matchedAthleteName: athlete?.name,
            confidence,
            customFields,
            standardFields
          };
        });

        setParsedData(processed);
        onDataParsed(processed);
        setIsLoading(false);
      } catch (err) {
        setError(t('credits.csvUpload.errors.parseError', { error: (err as Error).message }));
        setIsLoading(false);
      }
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      delimiter: ';',
      transformHeader: normalizeHeaderLabel,
      complete: (results) => {
        const typedResults = results as Papa.ParseResult<CSVRow>;
        const headers = typedResults.meta.fields || [];
        if (headers.length < 3) {
          Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: 'UTF-8',
            transformHeader: normalizeHeaderLabel,
            complete: (fallbackResults) => processResults(fallbackResults as Papa.ParseResult<CSVRow>),
            error: (error) => {
              setError(t('credits.csvUpload.errors.readError', { error: error.message }));
              setIsLoading(false);
            }
          });
          return;
        }
        processResults(typedResults);
      },
      error: (error) => {
        setError(t('credits.csvUpload.errors.readError', { error: error.message }));
        setIsLoading(false);
      }
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(f => f.name.endsWith('.csv'));
    
    if (csvFile) {
      handleFileSelect(csvFile);
    } else {
      setError(t('credits.csvUpload.errors.dropCSV'));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const getMatchingStats = () => {
    const matched = parsedData.filter(d => d.matchedAthleteId).length;
    const total = parsedData.length;
    return { matched, total, unmatched: total - matched };
  };

  if (parsedData.length > 0) {
    const stats = getMatchingStats();
    
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">{t('credits.csvUpload.dataPreview')}</h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Statistics */}
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex items-center space-x-4 text-sm">
            <div className="flex items-center space-x-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-green-700">
                {t('credits.csvUpload.athletesMatched', { count: stats.matched })}
              </span>
            </div>
            {stats.unmatched > 0 && (
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-orange-500" />
                <span className="text-orange-700">
                  {t('credits.csvUpload.notMatched', { count: stats.unmatched })}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Data Preview */}
        <div className="max-h-64 overflow-y-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Name
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Match
                </th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  {t('credits.csvUpload.fields')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {parsedData.map((row, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-900 font-medium">
                    {row.firstName} {row.lastName}
                  </td>
                  <td className="px-3 py-2">
                    {row.matchedAthleteName && !manualAssignments[index] ? (
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-green-500" />
                        <span className="text-green-700">
                          {row.matchedAthleteName}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({row.confidence}%)
                        </span>
                      </div>
                    ) : manualAssignments[index] ? (
                      <div className="flex items-center space-x-2">
                        <CheckCircle className="h-4 w-4 text-blue-500" />
                        <span className="text-blue-700">
                          {row.matchedAthleteName}
                        </span>
                        <span className="text-xs text-gray-500">
                          (manuell)
                        </span>
                        <button
                          onClick={() => handleManualAssign(index, '')}
                          className="text-gray-400 hover:text-red-500"
                          title="Zuweisung entfernen"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <AlertCircle className="h-4 w-4 text-orange-500 flex-shrink-0" />
                        <select
                          value={manualAssignments[index] || ''}
                          onChange={(e) => handleManualAssign(index, e.target.value)}
                          className="text-sm border border-orange-300 rounded px-2 py-1 text-gray-900 bg-white focus:ring-2 focus:ring-orange-500 focus:border-orange-500 max-w-[200px]"
                        >
                          <option value="">{t('credits.csvUpload.selectAthlete')}</option>
                          {athletes
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map(athlete => (
                              <option key={athlete.id} value={athlete.id} className="text-gray-900">
                                {athlete.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="text-xs text-gray-600">
                      {Object.keys({...row.standardFields, ...row.customFields}).length} {t('credits.csvUpload.fields')}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Admin User Selection */}
        {isAdmin && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-4">
            <div className="text-xs text-yellow-800">
              Debug: isAdmin={isAdmin ? 'true' : 'false'}, availableUsers.length={availableUsers.length}
            </div>
          </div>
        )}
        {isAdmin && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-3">
              <Users className="h-4 w-4 text-blue-600" />
              <h4 className="text-sm font-medium text-blue-800">
                {t('credits.csvUpload.adminSelectUser')}
              </h4>
            </div>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 bg-white"
            >
              <option value="" className="text-gray-900">{t('credits.csvUpload.uploadForCurrentUser')}</option>
              {availableUsers.length === 0 ? (
                <option disabled className="text-gray-500">Loading users...</option>
              ) : (
                availableUsers.map(user => (
                  <option key={user.id} value={user.id} className="text-gray-900">
                    {user.full_name || user.email} ({user.email})
                  </option>
                ))
              )}
            </select>
            <p className="text-xs text-blue-600 mt-2">
              {t('credits.csvUpload.adminSelectUserHelp')}
            </p>
          </div>
        )}

        {/* Bulk Import Actions */}
        {onBulkImport && stats.matched > 0 && (
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              {t('credits.csvUpload.readyToImport', { count: stats.matched })}
            </div>
            <button
              onClick={() => onBulkImport(parsedData.filter(d => d.matchedAthleteId), selectedUserId || undefined)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2"
            >
              <Upload className="h-4 w-4" />
              <span>{t('credits.csvUpload.importAllMatched')}</span>
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">{t('credits.csvUpload.title')}</h3>
        {onClose && (
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Upload Area */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-400 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        } ${isLoading ? 'opacity-50 pointer-events-none' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {isLoading ? (
          <div className="flex flex-col items-center space-y-2">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-gray-600">{t('credits.csvUpload.processingFile')}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4">
            <FileSpreadsheet className="h-12 w-12 text-gray-400" />
            <div>
              <p className="text-lg font-medium text-gray-900">
                {t('credits.csvUpload.dropFileHere')}
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {t('credits.csvUpload.fileDescription')}
              </p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Upload className="h-4 w-4 inline mr-2" />
              {t('credits.csvUpload.selectFile')}
            </button>
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileInputChange}
        className="hidden"
      />

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-2">
            <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-red-800">{t('credits.csvUpload.errors.error')}</h4>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-2">{t('credits.csvUpload.formatRequirements.title')}</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• {t('credits.csvUpload.formatRequirements.columnA')}</li>
          <li>• {t('credits.csvUpload.formatRequirements.columnB')}</li>
          <li>• {t('credits.csvUpload.formatRequirements.columnC')}</li>
          <li>• {t('credits.csvUpload.formatRequirements.supportedFields')}</li>
        </ul>
      </div>
    </div>
  );
}
