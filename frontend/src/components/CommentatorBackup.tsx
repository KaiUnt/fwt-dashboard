'use client';

import React, { useState, useRef } from 'react';
import { useTranslation } from '@/hooks/useTranslation';

interface BackupData {
  export_timestamp: string;
  total_records: number;
  version: string;
  data: Array<{
    athlete_id: string;
    homebase?: string;
    team?: string;
    sponsors?: string;
    favorite_trick?: string;
    achievements?: string;
    injuries?: string;
    fun_facts?: string;
    notes?: string;
    social_media?: Record<string, string>;
  }>;
}

interface ImportResult {
  success: boolean;
  imported_count: number;
  updated_count: number;
  errors: string[];
  total_processed: number;
}

export function CommentatorBackup() {
  const { t } = useTranslation();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = async () => {
    setIsExporting(true);
    setError(null);
    
    try {
      const response = await fetch('/api/commentator-info/export');
      if (!response.ok) throw new Error('Export failed');
      
      const backupData: BackupData = await response.json();
      
      // Create downloadable file
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `commentator-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setError(null);
    setImportResult(null);

    try {
      const text = await file.text();
      const backupData = JSON.parse(text);
      
      // Validate backup data
      if (!backupData.data || !Array.isArray(backupData.data)) {
        throw new Error('Invalid backup file format');
      }

      const response = await fetch('/api/commentator-info/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(backupData),
      });

      if (!response.ok) throw new Error('Import failed');
      
      const result: ImportResult = await response.json();
      setImportResult(result);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsImporting(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto bg-white rounded-lg shadow-lg border border-gray-200">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-2">
          <svg className="h-5 w-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 2.676-.732 5.016-2.297 6.824-4.397.294-.34.565-.704.799-1.087A12.02 12.02 0 0021 9a12.02 12.02 0 00-.382-3.016z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900">{t('backup.title')}</h2>
        </div>
        <p className="text-gray-600 mb-6">
          {t('backup.description')}
        </p>
        
        <div className="space-y-6">
          {/* Export Section */}
          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2 text-gray-900">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('backup.createBackup')}
            </h3>
            <p className="text-sm text-gray-600">
              {t('backup.createBackupDescription')}
            </p>
            <button 
              onClick={handleExport}
              disabled={isExporting}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors"
            >
              {isExporting ? t('backup.exporting') : t('backup.downloadBackup')}
            </button>
          </div>

          {/* Import Section */}
          <div className="space-y-3">
            <h3 className="font-medium flex items-center gap-2 text-gray-900">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              {t('backup.restoreBackup')}
            </h3>
            <p className="text-sm text-gray-600">
              {t('backup.restoreBackupDescription')}
            </p>
            
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                disabled={isImporting}
                className="hidden"
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="w-full bg-gray-100 hover:bg-gray-200 disabled:bg-gray-300 text-gray-700 font-medium py-2 px-4 rounded-md border border-gray-300 transition-colors"
              >
                {isImporting ? t('backup.importing') : t('backup.selectBackupFile')}
              </button>
            </div>
          </div>

          {/* Results and Errors */}
          {error && (
            <div className="border border-red-200 bg-red-50 p-4 rounded-md">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-red-800">{error}</span>
              </div>
            </div>
          )}

          {importResult && (
            <div className="border border-green-200 bg-green-50 p-4 rounded-md">
              <div className="text-green-800 space-y-1">
                <div className="font-medium">{t('backup.importSuccessful')}</div>
                <div className="text-sm">
                  • {t('backup.newEntriesAdded', { count: importResult.imported_count })}
                </div>
                <div className="text-sm">
                  • {t('backup.entriesUpdated', { count: importResult.updated_count })}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="text-sm text-orange-600 mt-2">
                    <div className="font-medium">{t('backup.warnings')}:</div>
                    {importResult.errors.map((error, idx) => (
                      <div key={idx} className="ml-2">• {error}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Info Section */}
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('backup.recommendations')}
            </h4>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• {t('backup.recommendation1')}</li>
              <li>• {t('backup.recommendation2')}</li>
              <li>• {t('backup.recommendation3')}</li>
              <li>• {t('backup.recommendation4')}</li>
            </ul>
          </div>
          
          {/* Connection to Offline Storage */}
          <div className="bg-green-50 p-4 rounded-lg border border-green-200">
            <h4 className="font-medium text-green-900 mb-2 flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {t('backup.multiLevelProtection')}
            </h4>
            <div className="text-sm text-green-800 space-y-1">
              <div className="font-medium">🛡️ {t('backup.level1')}</div>
              <div className="ml-4">• {t('backup.level1Desc1')}</div>
              <div className="ml-4">• {t('backup.level1Desc2')}</div>
              <div className="font-medium">🔒 {t('backup.level2')}</div>
              <div className="ml-4">• {t('backup.level2Desc1')}</div>
              <div className="ml-4">• {t('backup.level2Desc2')}</div>
              <div className="font-medium">☁️ {t('backup.level3')}</div>
              <div className="ml-4">• {t('backup.level3Desc1')}</div>
              <div className="ml-4">• {t('backup.level3Desc2')}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 