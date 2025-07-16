'use client';

import { useState, useEffect } from 'react';
import { X, Save, User, Home, Users, Award, Heart, AlertTriangle, Lightbulb, FileText, Instagram, Youtube, Globe } from 'lucide-react';
import { CommentatorInfo } from '@/types/athletes';
import { useUpdateCommentatorInfo } from '@/hooks/useCommentatorInfo';
import { useTranslation } from '@/hooks/useTranslation';

interface CommentatorInfoModalProps {
  athleteId: string;
  athleteName: string;
  initialData?: CommentatorInfo | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CommentatorInfoModal({
  athleteId,
  athleteName,
  initialData,
  isOpen,
  onClose,
}: CommentatorInfoModalProps) {
  const { t } = useTranslation();
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
  });

  const [isSaving, setIsSaving] = useState(false);
  const updateMutation = useUpdateCommentatorInfo();

  // Initialize form data when modal opens or data changes
  useEffect(() => {
    if (isOpen) {
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
        });
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
        });
      }
    }
  }, [isOpen, initialData]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateMutation.mutateAsync({
        athleteId,
        info: formData,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save commentator info:', error);
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
      // Block all dashboard shortcuts when modal is open
      if (e.key === 'j' || e.key === '/' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || 
          e.key === 'h' || e.key === 'l' || e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        e.stopPropagation();
      }
      
      // Only allow Escape to close modal
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

  console.log('CommentatorInfoModal rendering:', { isOpen, athleteId, athleteName });

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
          </div>

          {/* Form */}
          <div className="px-6 py-6 max-h-[70vh] overflow-y-auto">
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900 resize-none"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
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
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm text-gray-900"
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
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? t('buttons.saving') : t('buttons.save')}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
