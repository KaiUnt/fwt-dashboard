'use client';

import { useState, useEffect } from 'react';
import { X, Save, User, Home, Users, Award, Heart, AlertTriangle, Lightbulb, FileText, Instagram, Youtube, Globe, Upload, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { CommentatorInfo, Athlete } from '@/types/athletes';
import { useUpdateCommentatorInfo, useBulkImportCommentatorInfo } from '@/hooks/useCommentatorInfo';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth, useAccessToken } from '@/providers/AuthProvider';
import { CSVUploadComponent } from './CSVUploadComponent';

type CustomFieldEntry = { id: string; key: string; value: string };

const generateFieldId = (): string =>
  (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2, 10));

const mapObjectToEntries = (fields?: Record<string, string>): CustomFieldEntry[] =>
  Object.entries(fields || {}).map(([key, value]) => ({
    id: generateFieldId(),
    key,
    value: String(value ?? ''),
  }));

const mapEntriesToObject = (entries: CustomFieldEntry[]): Record<string, string> => {
  const result: Record<string, string> = {};
  entries.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return;
    }
    if (!value.trim()) {
      return;
    }
    result[trimmedKey] = value;
  });
  return result;
};

interface CommentatorInfoModalProps {
  athleteId: string;
  athleteName: string;
  initialData?: CommentatorInfo | null;
  isOpen: boolean;
  onClose: () => void;
  athletes?: Athlete[]; // For CSV upload matching
  commentatorBatchKey: string;
}

export function CommentatorInfoModal({
  athleteId,
  athleteName,
  initialData,
  isOpen,
  onClose,
  athletes = [],
  commentatorBatchKey,
}: CommentatorInfoModalProps) {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { getAccessToken } = useAccessToken();
  const [availableUsers, setAvailableUsers] = useState<Array<{ id: string; full_name: string; email: string }>>([]);
  const [csvAthletes, setCsvAthletes] = useState<Athlete[]>(athletes);
  const [formData, setFormData] = useState<Partial<CommentatorInfo>>({
    homebase: '',
    team: '',
    sponsors: '',
    favorite_trick: '',
    achievements: '',
    injuries: '',
    fun_facts: '',
    notes: '',
    social_media: {
      instagram: '',
      youtube: '',
      website: '',
    },
    custom_fields: {},
  });
  const [customFields, setCustomFields] = useState<CustomFieldEntry[]>([]);
  const [isCustomFieldsOpen, setIsCustomFieldsOpen] = useState(false);

  const applyCustomFieldsUpdate = (
    updater: (prev: CustomFieldEntry[]) => CustomFieldEntry[]
  ) => {
    setCustomFields(prev => {
      const next = updater(prev);
      setFormData(current => ({
        ...current,
        custom_fields: mapEntriesToObject(next),
      }));
      return next;
    });
  };

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'csv'>('form');
  const updateMutation = useUpdateCommentatorInfo();
  const bulkImportMutation = useBulkImportCommentatorInfo();

  useEffect(() => {
    setCsvAthletes(athletes);
  }, [athletes]);

  useEffect(() => {
    if (!isOpen || !isAdmin) return;
    if (athletes.length > 0 || csvAthletes.length > 0) return;

    let isMounted = true;
    const loadAllAthletes = async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;

        const response = await fetch('/api/admin/athletes/search?limit=1000', {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          console.error('Failed to load admin athlete directory:', response.status);
          return;
        }

        const data = await response.json() as { athletes?: Array<{ id?: string; name?: string; full_name?: string }>; data?: Array<{ id?: string; name?: string; full_name?: string }> };
        const rawAthletes = data.athletes || data.data || [];
        if (!Array.isArray(rawAthletes)) return;

        const normalized = rawAthletes
          .filter(entry => entry?.id && (entry.name || entry.full_name))
          .map(entry => ({
            id: entry.id as string,
            name: (entry.name || entry.full_name || '').trim(),
            status: 'confirmed' as const,
          }));

        if (isMounted && normalized.length > 0) {
          setCsvAthletes(normalized);
        }
      } catch (error) {
        console.error('Failed to load admin athlete directory:', error);
      }
    };

    loadAllAthletes();
    return () => {
      isMounted = false;
    };
  }, [athletes.length, csvAthletes.length, getAccessToken, isAdmin, isOpen]);

  // Load available users for admins
  useEffect(() => {
    if (isOpen && isAdmin) {
      const loadUsers = async () => {
        try {
          const token = await getAccessToken();
          
          const response = await fetch('/api/admin/users', {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          });
          if (response.ok) {
            const data = await response.json();
            const users = Array.isArray(data.users) ? data.users : Array.isArray(data.data) ? data.data : [];
            setAvailableUsers(users);
          } else {
            console.error('Failed to load users:', response.status);
            // Keep availableUsers empty on API failure - this will hide the user selection
          }
        } catch (error) {
          console.error('Failed to load users:', error);
        }
      };
      loadUsers();
    }
  }, [isOpen, isAdmin, getAccessToken]);

  // Initialize form data when modal opens or data changes
  useEffect(() => {
    if (isOpen) {
      setError(null); // Clear any previous errors
      setShowSuccess(false); // Clear success message
      
      if (initialData) {
        setFormData({
          homebase: initialData.homebase || '',
          team: initialData.team || '',
          sponsors: initialData.sponsors || '',
          favorite_trick: initialData.favorite_trick || '',
          achievements: initialData.achievements || '',
          injuries: initialData.injuries || '',
          fun_facts: initialData.fun_facts || '',
          notes: initialData.notes || '',
          social_media: {
            instagram: initialData.social_media?.instagram || '',
            youtube: initialData.social_media?.youtube || '',
            website: initialData.social_media?.website || '',
          },
          custom_fields: initialData.custom_fields || {},
        });
        const initialCustomEntries = mapObjectToEntries(initialData.custom_fields);
        setCustomFields(initialCustomEntries);
        setIsCustomFieldsOpen(initialCustomEntries.length > 0);
      } else {
        // Reset form for new data
        setFormData({
          homebase: '',
          team: '',
          sponsors: '',
          favorite_trick: '',
          achievements: '',
          injuries: '',
          fun_facts: '',
          notes: '',
          social_media: {
            instagram: '',
            youtube: '',
            website: '',
          },
          custom_fields: {},
        });
        setCustomFields([]);
        setIsCustomFieldsOpen(false);
      }
    }
  }, [isOpen, initialData, athleteId]);

  // Also update form data when initialData changes while modal is open
  useEffect(() => {
    if (isOpen && initialData && !isSaving && !showSuccess) {
      setFormData({
        homebase: initialData.homebase || '',
        team: initialData.team || '',
        sponsors: initialData.sponsors || '',
        favorite_trick: initialData.favorite_trick || '',
        achievements: initialData.achievements || '',
        injuries: initialData.injuries || '',
        fun_facts: initialData.fun_facts || '',
        notes: initialData.notes || '',
        social_media: {
          instagram: initialData.social_media?.instagram || '',
          youtube: initialData.social_media?.youtube || '',
          website: initialData.social_media?.website || '',
        },
        custom_fields: initialData.custom_fields || {},
      });
        setCustomFields(mapObjectToEntries(initialData.custom_fields));
    }
  }, [initialData, isOpen, isSaving, showSuccess]); // ✅ Removed formData dependency!

  const handleSave = async () => {
    if (isSaving) return; // Prevent double-clicks

    const activeCustomFields = customFields.filter(field => field.key.trim().length > 0 || field.value.trim().length > 0);
    const hasEmptyKey = activeCustomFields.some(field => field.key.trim().length === 0);
    const hasEmptyValue = activeCustomFields.some(field => field.key.trim().length > 0 && field.value.trim().length === 0);
    const normalizedKeys = activeCustomFields
      .map(field => field.key.trim().toLowerCase())
      .filter(key => key.length > 0);
    const hasDuplicateKeys = new Set(normalizedKeys).size !== normalizedKeys.length;

    if (hasEmptyKey || hasEmptyValue || hasDuplicateKeys) {
      setError(t('commentatorInfo.customFields.validation.summary'));
      return;
    }

    setIsSaving(true);
    setError(null);

    const customFieldsPayload = mapEntriesToObject(activeCustomFields);

    try {
      const payload: Partial<CommentatorInfo> = {
        ...formData,
        custom_fields: Object.keys(customFieldsPayload).length > 0 ? customFieldsPayload : {},
      };

      await updateMutation.mutateAsync({
        athleteId,
        info: payload,
        batchKey: commentatorBatchKey,
      });
      
      // Show success message briefly before closing
      setShowSuccess(true);
      
      // Close modal after a brief delay to show success
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (error: unknown) {
      console.error('Failed to save commentator info:', error);
      
      // Extract meaningful error message with enhanced auth handling
      let errorMessage = 'Failed to save commentator info.';
      
      console.error('Save error details:', {
        error,
        type: typeof error,
        message: error instanceof Error ? error.message : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      if (error instanceof Error) {
        errorMessage = error.message;
        
        // Enhanced auth error detection
        if (error.message.includes('Authentication') || 
            error.message.includes('authorization') ||
            error.message.includes('token') ||
            error.message.includes('401')) {
          errorMessage = 'Authentication required. Please log in and try again.';
        }
      } else if (error && typeof error === 'object' && 'response' in error) {
        const responseError = error as { response?: { data?: { detail?: string }; status?: number } };
        
        console.error('Response error details:', {
          status: responseError.response?.status,
          detail: responseError.response?.data?.detail,
          data: responseError.response?.data
        });
        
        if (responseError.response?.data?.detail) {
          errorMessage = responseError.response.data.detail;
        } else if (responseError.response?.status === 401) {
          errorMessage = 'Authentication failed. Please refresh the page and log in again.';
        } else if (responseError.response?.status === 403) {
          errorMessage = 'You do not have permission to edit this information.';
        } else if (responseError.response?.status === 500) {
          errorMessage = 'Server error occurred. Please check the browser console and try again.';
        }
      } else if (!navigator.onLine) {
        errorMessage = 'No internet connection. Changes will be saved when you come back online.';
      }
      
      // Additional check for common auth issues
      if (errorMessage.includes('Failed to update commentator info:') && !errorMessage.includes('Authentication')) {
        errorMessage += ' This might be an authentication issue. Please refresh the page and try again.';
      }
      
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleInputChange = (field: keyof CommentatorInfo, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSocialMediaChange = (platform: keyof NonNullable<CommentatorInfo['social_media']>, value: string) => {
    setFormData(prev => ({
      ...prev,
      social_media: {
        ...prev.social_media,
        [platform]: value,
      },
    }));
  };

  const handleCSVDataParsed = (csvData: Array<{ matchedAthleteId?: string; standardFields: Record<string, string>; customFields: Record<string, string> }>) => {
    // Prefill the form with the current athlete's data if present,
    // but stay on the CSV tab to allow bulk import
    const firstMatch = csvData.find(d => d.matchedAthleteId === athleteId);
    if (firstMatch) {
      const currentCustomFieldsObject = mapEntriesToObject(customFields);
      const mergedCustomFields = {
        ...currentCustomFieldsObject,
        ...firstMatch.customFields,
      };
      setFormData(prev => ({
        ...prev,
        ...firstMatch.standardFields,
        custom_fields: {
          ...mergedCustomFields,
        },
      }));
      setCustomFields(mapObjectToEntries(mergedCustomFields));
      if (Object.keys(mergedCustomFields).length > 0) {
        setIsCustomFieldsOpen(true);
      }
    }
  };

  const handleBulkImport = async (csvData: Array<{ matchedAthleteId?: string; standardFields: Record<string, string>; customFields: Record<string, string> }>, targetUserId?: string) => {
    try {
      setIsSaving(true);
      setError(null);

      // Transform CSV data to API format
      const importData = csvData
        .filter(item => item.matchedAthleteId) // Filter out items without matched athlete ID
        .map(item => {
          const { instagram, youtube, website, ...otherStandardFields } = item.standardFields;
          
          return {
            athlete_id: item.matchedAthleteId!,
            ...otherStandardFields,
            social_media: {
              instagram: instagram || '',
              youtube: youtube || '',
              website: website || '',
            },
            custom_fields: item.customFields,
          };
        });

      await bulkImportMutation.mutateAsync({ 
        data: importData, 
        targetUserId 
      });
      
      setShowSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
      
    } catch (error: unknown) {
      console.error('Bulk import failed:', error);
      setError('Failed to import CSV data. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop all keyboard events from bubbling to prevent dashboard shortcuts
    e.stopPropagation();
    
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      handleSave();
    }
  };

  // Prevent dashboard keyboard shortcuts when modal is open
  useEffect(() => {
    if (!isOpen) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Check if the target is an input field
      const target = e.target as HTMLElement;
      const isInputField = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA');
      
      // If in input field, allow normal typing but still block dashboard shortcuts
      if (isInputField) {
        // Only block dashboard navigation keys when in input field
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Home' || e.key === 'End') {
          e.preventDefault();
          e.stopPropagation();
        }
        // Allow normal typing (including 'l', 'h', 'j', '/') in input fields
        return;
      }
      
      // If not in input field, block all dashboard shortcuts
      if (e.key === 'j' || e.key === '/' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
          e.key === 'h' || e.key === 'l' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        e.stopPropagation();
      }
      
      // Always allow Escape to close modal
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    // Add event listener to document to capture all keyboard events
    document.addEventListener('keydown', handleGlobalKeyDown, true);
    
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;


  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" 
          onClick={onClose}
        />

        {/* Center the modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>

        {/* Modal */}
        <div 
          className="relative inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <User className="h-6 w-6 text-white" />
                <div>
                  <h3 className="text-xl font-bold text-white">
                    {t('commentatorInfo.editTitle')}
                  </h3>
                  <p className="text-blue-100 text-sm">{athleteName}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-white hover:text-gray-300 transition-colors"
              >
                <X className="h-6 w-6" />
              </button>
            </div>
            
            {/* Tab Navigation */}
            <div className="flex space-x-1 mt-4">
              <button
                onClick={() => setActiveTab('form')}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'form'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-blue-100 hover:text-white hover:bg-blue-500/20'
                }`}
              >
                {t('commentatorInfo.tabs.manualEntry')}
              </button>
              <button
                onClick={() => setActiveTab('csv')}
                className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  activeTab === 'csv'
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-blue-100 hover:text-white hover:bg-blue-500/20'
                }`}
              >
                <Upload className="h-4 w-4" />
                <span>{t('commentatorInfo.tabs.csvUpload')}</span>
              </button>
            </div>
          </div>

          {/* Success Message */}
          {showSuccess && (
            <div className="px-6 py-4 bg-green-50 border-b border-green-200">
              <div className="flex items-center space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-green-800">Changes saved successfully</h3>
                  <div className="mt-1 text-sm text-green-700">Your commentator information has been updated.</div>
                </div>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="px-6 py-4 bg-red-50 border-b border-red-200">
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-red-800">Error saving changes</h3>
                  <div className="mt-1 text-sm text-red-700">{error}</div>
                </div>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="flex-shrink-0 ml-4 text-red-400 hover:text-red-500"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
            {activeTab === 'csv' && csvAthletes.length > 0 ? (
              <CSVUploadComponent
                athletes={csvAthletes}
                onDataParsed={handleCSVDataParsed}
                onClose={() => setActiveTab('form')}
                onBulkImport={handleBulkImport}
                isAdmin={isAdmin}
                availableUsers={availableUsers}
              />
            ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left column */}
              <div className="space-y-6">
                {/* Homebase */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-900 mb-2">
                    <Home className="h-4 w-4" />
                    <span>{t('commentatorInfo.homebase')}</span>
                  </label>
                  <input
                    type="text"
                    value={formData.homebase || ''}
                    onChange={(e) => handleInputChange('homebase', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('commentatorInfo.homebasePlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-950"
                  />
                </div>

                {/* Team */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-900 mb-2">
                    <Users className="h-4 w-4" />
                    <span>{t('commentatorInfo.team')}</span>
                  </label>
                  <input
                    type="text"
                    value={formData.team || ''}
                    onChange={(e) => handleInputChange('team', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('commentatorInfo.teamPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-950"
                  />
                </div>

                {/* Sponsors */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-900 mb-2">
                    <Award className="h-4 w-4" />
                    <span>{t('commentatorInfo.sponsors')}</span>
                  </label>
                  <textarea
                    value={formData.sponsors || ''}
                    onChange={(e) => handleInputChange('sponsors', e.target.value)}
                    placeholder={t('commentatorInfo.sponsorsPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-950 resize-none"
                  />
                </div>

                {/* Favorite Trick */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-900 mb-2">
                    <Heart className="h-4 w-4" />
                    <span>{t('commentatorInfo.favoriteTrick')}</span>
                  </label>
                  <input
                    type="text"
                    value={formData.favorite_trick || ''}
                    onChange={(e) => handleInputChange('favorite_trick', e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t('commentatorInfo.favoriteTrickPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-950"
                  />
                </div>

                {/* Social Media */}
                <div>
                  <label className="text-sm font-medium text-gray-900 mb-3 block">
                    {t('commentatorInfo.socialMedia')}
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Instagram className="h-4 w-4 text-pink-500" />
                      <input
                        type="text"
                        value={formData.social_media?.instagram || ''}
                        onChange={(e) => handleSocialMediaChange('instagram', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('commentatorInfo.instagramPlaceholder')}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-950"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Youtube className="h-4 w-4 text-red-500" />
                      <input
                        type="text"
                        value={formData.social_media?.youtube || ''}
                        onChange={(e) => handleSocialMediaChange('youtube', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('commentatorInfo.youtubePlaceholder')}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-950"
                      />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Globe className="h-4 w-4 text-blue-500" />
                      <input
                        type="text"
                        value={formData.social_media?.website || ''}
                        onChange={(e) => handleSocialMediaChange('website', e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={t('commentatorInfo.websitePlaceholder')}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Right column */}
              <div className="space-y-6">
                {/* Achievements */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-900 mb-2">
                    <Award className="h-4 w-4" />
                    <span>{t('commentatorInfo.achievements')}</span>
                  </label>
                  <textarea
                    value={formData.achievements || ''}
                    onChange={(e) => handleInputChange('achievements', e.target.value)}
                    placeholder={t('commentatorInfo.achievementsPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 resize-none"
                  />
                </div>

                {/* Injuries */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-900 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    <span>{t('commentatorInfo.injuries')}</span>
                  </label>
                  <textarea
                    value={formData.injuries || ''}
                    onChange={(e) => handleInputChange('injuries', e.target.value)}
                    placeholder={t('commentatorInfo.injuryPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 resize-none"
                  />
                </div>

                {/* Fun Facts */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-900 mb-2">
                    <Lightbulb className="h-4 w-4" />
                    <span>{t('commentatorInfo.funFacts')}</span>
                  </label>
                  <textarea
                    value={formData.fun_facts || ''}
                    onChange={(e) => handleInputChange('fun_facts', e.target.value)}
                    placeholder={t('commentatorInfo.funFactsPlaceholder')}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 resize-none"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="flex items-center space-x-2 text-sm font-medium text-gray-900 mb-2">
                    <FileText className="h-4 w-4" />
                    <span>{t('commentatorInfo.notes')}</span>
                  </label>
                  <textarea
                    value={formData.notes || ''}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    placeholder={t('commentatorInfo.notesPlaceholder')}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 resize-none"
                  />
                </div>

              </div>
            </div>
            )}
            {activeTab !== 'csv' && (
            <div className="mt-6">
              <button
                type="button"
                onClick={() => setIsCustomFieldsOpen(prev => !prev)}
                className="flex w-full items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left text-sm font-medium text-blue-900 transition-colors hover:bg-blue-100"
              >
                <span>{t('commentatorInfo.customFields.sectionTitle')}</span>
                {isCustomFieldsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
              {isCustomFieldsOpen && (
                <div className="mt-3 space-y-3 rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
                  {customFields.length === 0 && (
                    <p className="text-sm text-blue-700">{t('commentatorInfo.customFields.emptyState')}</p>
                  )}
                  {customFields.map((field) => {
                    const normalizedKey = field.key.trim().toLowerCase();
                    const duplicated = normalizedKey.length > 0 && customFields.filter(entry => entry.id !== field.id && entry.key.trim().toLowerCase() === normalizedKey).length > 0;
                    const keyMissing = field.key.trim().length === 0;
                    const valueMissing = field.value.trim().length === 0;
                    return (
                      <div key={field.id} className="rounded-lg border border-blue-100 bg-white p-4">
                        <div className="flex flex-col gap-4 md:flex-row">
                          <div className="flex-1">
                            <label className="text-xs font-medium text-blue-900">{t('commentatorInfo.customFields.fieldLabel')}</label>
                            <input
                              type="text"
                              value={field.key}
                              onChange={(e) => {
                                const nextKey = e.target.value;
                                applyCustomFieldsUpdate(prev => prev.map(entry => entry.id === field.id ? { ...entry, key: nextKey } : entry));
                              }}
                              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-gray-900 ${keyMissing || duplicated ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-blue-200 focus:border-blue-500 focus:ring-blue-500'}`}
                            />
                            {(keyMissing || duplicated) && (
                              <p className="mt-1 text-xs text-red-600">
                                {keyMissing
                                  ? t('commentatorInfo.customFields.validation.missingKey')
                                  : t('commentatorInfo.customFields.validation.duplicateKey')}
                              </p>
                            )}
                          </div>
                          <div className="flex-1">
                            <label className="text-xs font-medium text-blue-900">{t('commentatorInfo.customFields.valueLabel')}</label>
                            <input
                              type="text"
                              value={field.value}
                              onChange={(e) => {
                                const nextValue = e.target.value;
                                applyCustomFieldsUpdate(prev => prev.map(entry => entry.id === field.id ? { ...entry, value: nextValue } : entry));
                              }}
                              className={`mt-1 w-full rounded-md border px-3 py-2 text-sm text-gray-900 ${valueMissing ? 'border-red-400 focus:border-red-500 focus:ring-red-500' : 'border-blue-200 focus:border-blue-500 focus:ring-blue-500'}`}
                            />
                            {valueMissing && (
                              <p className="mt-1 text-xs text-red-600">{t('commentatorInfo.customFields.validation.missingValue')}</p>
                            )}
                          </div>
                          <div className="flex items-start justify-end">
                            <button
                              type="button"
                              onClick={() => applyCustomFieldsUpdate(prev => prev.filter(entry => entry.id !== field.id))}
                              className="rounded-md border border-red-200 bg-white p-2 text-red-600 transition-colors hover:bg-red-50"
                              aria-label={t('commentatorInfo.customFields.deleteAriaLabel')}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => {
                      setIsCustomFieldsOpen(true);
                      applyCustomFieldsUpdate(prev => (
                        [...prev, {
                          id: generateFieldId(),
                          key: '',
                          value: '',
                        }]
                      ));
                    }}
                    className="flex items-center space-x-2 rounded-lg border border-blue-200 px-3 py-2 text-sm font-medium text-blue-900 transition-colors hover:bg-blue-100"
                  >
                    <Plus className="h-4 w-4" />
                    <span>{t('commentatorInfo.customFields.addField')}</span>
                  </button>
                </div>
              )}
            </div>
            )}
          </div>

          {/* Footer */}
          <div className="bg-gray-50 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-500">
                <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">Ctrl+Enter</kbd> {t('commentatorInfo.toSave')}
                <span className="mx-2">•</span>
                <kbd className="px-2 py-1 bg-gray-200 rounded text-xs">Esc</kbd> {t('commentatorInfo.toClose')}
              </div>
              <div className="flex items-center space-x-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-gray-900 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t('buttons.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                    isSaving
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md active:bg-blue-800'
                  } text-white disabled:opacity-50`}
                >
                  {isSaving ? (
                    <div className="flex items-center space-x-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>{t('buttons.saving')}</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Save className="h-4 w-4" />
                      <span>{t('buttons.save')}</span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
