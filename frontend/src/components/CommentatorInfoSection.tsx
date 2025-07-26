'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Edit, Home, Users, Award, Heart, AlertTriangle, Lightbulb, FileText, Instagram, Youtube, Globe } from 'lucide-react';
import { CommentatorInfo } from '@/types/athletes';
import { useTranslation } from '@/hooks/useTranslation';

interface CommentatorInfoSectionProps {
  athleteId: string;
  athleteName: string;
  commentatorInfo?: CommentatorInfo | null;
  onEdit: () => void;
}

export function CommentatorInfoSection({
  athleteId: _athleteId,
  athleteName: _athleteName,
  commentatorInfo,
  onEdit,
}: CommentatorInfoSectionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  // Check if we have any commentator info to display
  const hasInfo = commentatorInfo && (
    commentatorInfo.homebase ||
    commentatorInfo.team ||
    commentatorInfo.sponsors ||
    commentatorInfo.favorite_trick ||
    commentatorInfo.achievements ||
    commentatorInfo.injuries ||
    commentatorInfo.fun_facts ||
    commentatorInfo.notes ||
    commentatorInfo.social_media?.instagram ||
    commentatorInfo.social_media?.youtube ||
    commentatorInfo.social_media?.website
  );

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="mt-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-amber-100 to-orange-100 border-b border-amber-200">
        <div className="flex items-center justify-between">
          <button
            onClick={handleToggle}
            className="flex items-center space-x-2 text-amber-800 hover:text-amber-900 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
            <span className="font-semibold text-sm">
              {hasInfo ? t('commentatorInfo.title') : t('commentatorInfo.addInfo')}
            </span>
            {hasInfo && (
              <span className="text-xs bg-amber-200 text-amber-800 px-2 py-1 rounded-full">
                {t('commentatorInfo.fieldsCount', { 
                  count: [
                    commentatorInfo.homebase,
                    commentatorInfo.team,
                    commentatorInfo.sponsors,
                    commentatorInfo.favorite_trick,
                    commentatorInfo.achievements,
                    commentatorInfo.injuries,
                    commentatorInfo.fun_facts,
                    commentatorInfo.notes,
                    commentatorInfo.social_media?.instagram,
                    commentatorInfo.social_media?.youtube,
                    commentatorInfo.social_media?.website
                  ].filter(Boolean).length 
                })}
              </span>
            )}
          </button>
          <button
            onClick={onEdit}
            className="flex items-center space-x-1 px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm"
          >
            <Edit className="h-4 w-4" />
            <span>{t('buttons.edit')}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-4">
          {!hasInfo ? (
            <div className="text-center py-8 text-amber-700">
              <FileText className="h-12 w-12 mx-auto mb-3 text-amber-400" />
              <p className="text-sm font-medium mb-2">{t('commentatorInfo.noInfoYet')}</p>
              <p className="text-xs text-amber-600">
                {t('commentatorInfo.clickEditToAdd')}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Basic Info Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {commentatorInfo?.homebase && (
                  <div className="flex items-center space-x-2">
                    <Home className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.homebase')}</p>
                      <p className="text-sm text-amber-700">{commentatorInfo.homebase}</p>
                    </div>
                  </div>
                )}

                {commentatorInfo?.team && (
                  <div className="flex items-center space-x-2">
                    <Users className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.team')}</p>
                      <p className="text-sm text-amber-700">{commentatorInfo.team}</p>
                    </div>
                  </div>
                )}

                {commentatorInfo?.favorite_trick && (
                  <div className="flex items-center space-x-2">
                    <Heart className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.favoriteTrick')}</p>
                      <p className="text-sm text-amber-700">{commentatorInfo.favorite_trick}</p>
                    </div>
                  </div>
                )}

                {commentatorInfo?.injuries && (
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.injuries')}</p>
                      <p className="text-sm text-amber-700 line-clamp-2">{commentatorInfo.injuries}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Sponsors */}
              {commentatorInfo?.sponsors && (
                <div className="flex items-start space-x-2">
                  <Award className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.sponsors')}</p>
                    <p className="text-sm text-amber-700">{commentatorInfo.sponsors}</p>
                  </div>
                </div>
              )}

              {/* Achievements */}
              {commentatorInfo?.achievements && (
                <div className="flex items-start space-x-2">
                  <Award className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.achievements')}</p>
                    <p className="text-sm text-amber-700">{commentatorInfo.achievements}</p>
                  </div>
                </div>
              )}

              {/* Fun Facts */}
              {commentatorInfo?.fun_facts && (
                <div className="flex items-start space-x-2">
                  <Lightbulb className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.funFacts')}</p>
                    <p className="text-sm text-amber-700">{commentatorInfo.fun_facts}</p>
                  </div>
                </div>
              )}

              {/* Notes */}
              {commentatorInfo?.notes && (
                <div className="flex items-start space-x-2">
                  <FileText className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.notes')}</p>
                    <p className="text-sm text-amber-700">{commentatorInfo.notes}</p>
                  </div>
                </div>
              )}

              {/* Social Media */}
              {(commentatorInfo?.social_media?.instagram || 
                commentatorInfo?.social_media?.youtube || 
                commentatorInfo?.social_media?.website) && (
                <div className="pt-3 border-t border-amber-200">
                  <p className="text-xs font-medium text-amber-800 mb-3">{t('commentatorInfo.socialMedia')}</p>
                  <div className="flex items-center space-x-4">
                    {commentatorInfo.social_media?.instagram && (
                      <a
                        href={`https://instagram.com/${commentatorInfo.social_media.instagram}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all text-sm"
                      >
                        <Instagram className="h-4 w-4" />
                        <span>@{commentatorInfo.social_media.instagram}</span>
                      </a>
                    )}

                    {commentatorInfo.social_media?.youtube && (
                      <a
                        href={commentatorInfo.social_media.youtube.startsWith('http') 
                          ? commentatorInfo.social_media.youtube 
                          : `https://${commentatorInfo.social_media.youtube}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all text-sm"
                      >
                        <Youtube className="h-4 w-4" />
                        <span>YouTube</span>
                      </a>
                    )}

                    {commentatorInfo.social_media?.website && (
                      <a
                        href={commentatorInfo.social_media.website.startsWith('http') 
                          ? commentatorInfo.social_media.website 
                          : `https://${commentatorInfo.social_media.website}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg hover:from-blue-600 hover:to-blue-700 transition-all text-sm"
                      >
                        <Globe className="h-4 w-4" />
                        <span>Website</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
} 