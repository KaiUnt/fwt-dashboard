'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Edit, Home, Users, Award, Heart, AlertTriangle, Lightbulb, FileText, Instagram, Youtube, Globe } from 'lucide-react';
import { CommentatorInfo, CommentatorInfoWithAuthor, TabData } from '@/types/athletes';
import { useTranslation } from '@/hooks/useTranslation';
import { useCommentatorInfoWithFriends, useMergedCommentatorInfo } from '@/hooks/useCommentatorInfo';
import { useFriends } from '@/hooks/useFriends';

interface CommentatorInfoSectionProps {
  athleteId: string;
  athleteName: string;
  commentatorInfo?: CommentatorInfo | null;
  onEdit: () => void;
}

export function CommentatorInfoSection({
  athleteId,
  athleteName: _athleteName,
  commentatorInfo,
  onEdit,
}: CommentatorInfoSectionProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('mine');

  // Friends System Data
  const { data: friends } = useFriends();
  const { data: myData } = useCommentatorInfoWithFriends(athleteId, 'mine');
  const { data: friendsData } = useCommentatorInfoWithFriends(athleteId, 'friends');
  const { data: mergedData } = useMergedCommentatorInfo(athleteId);

  // Build tabs
  const tabs: TabData[] = [
    {
      id: 'mine',
      label: t('commentatorInfo.tabs.mine'),
      count: countFields(myData?.[0] || null),
      data: myData || []
    },
    ...(friends?.data || []).map(friend => ({
      id: friend.friend.id,
      label: friend.friend.full_name || friend.friend.email,
      author_name: friend.friend.full_name || friend.friend.email,
      count: countFields(friendsData?.find(d => d.created_by === friend.friend.id) || null),
      data: friendsData?.filter(d => d.created_by === friend.friend.id) || []
    })),
    {
      id: 'all',
      label: t('commentatorInfo.tabs.all'),
      count: countFields(mergedData),
      data: [mergedData]
    }
  ];

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

  const countFields = (info: CommentatorInfo | null): number => {
    if (!info) return 0;
    return [
      info.homebase,
      info.team,
      info.sponsors,
      info.favorite_trick,
      info.achievements,
      info.injuries,
      info.fun_facts,
      info.notes,
      info.social_media?.instagram,
      info.social_media?.youtube,
      info.social_media?.website
    ].filter(Boolean).length;
  };

  const renderCommentatorInfo = (data: CommentatorInfoWithAuthor[]) => {
    if (!data || data.length === 0) {
      return (
        <div className="text-center py-8 text-amber-700">
          <FileText className="h-12 w-12 mx-auto mb-3 text-amber-400" />
          <p className="text-sm font-medium mb-2">{t('commentatorInfo.noInfoYet')}</p>
          <p className="text-xs text-amber-600">
            {t('commentatorInfo.clickEditToAdd')}
          </p>
        </div>
      );
    }

    const info = data[0]; // For now, show first entry
    const isOwnData = info.is_own_data;

    return (
      <div className="space-y-4">
        {/* Author attribution */}
        {!isOwnData && info.author_name && (
          <div className="flex items-center space-x-2 mb-3 p-2 bg-blue-50 rounded-lg">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-800 font-medium">
              {t('commentatorInfo.byAuthor', { author: info.author_name })}
            </span>
          </div>
        )}

        {/* Basic Info Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {info?.homebase && (
            <div className="flex items-center space-x-2">
              <Home className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.homebase')}</p>
                <p className="text-sm text-amber-700">{info.homebase}</p>
              </div>
            </div>
          )}

          {info?.team && (
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.team')}</p>
                <p className="text-sm text-amber-700">{info.team}</p>
              </div>
            </div>
          )}

          {info?.favorite_trick && (
            <div className="flex items-center space-x-2">
              <Heart className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.favoriteTrick')}</p>
                <p className="text-sm text-amber-700">{info.favorite_trick}</p>
              </div>
            </div>
          )}

          {info?.injuries && (
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <div>
                <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.injuries')}</p>
                <p className="text-sm text-amber-700 line-clamp-2">{info.injuries}</p>
              </div>
            </div>
          )}
        </div>

        {/* Sponsors */}
        {info?.sponsors && (
          <div className="flex items-start space-x-2">
            <Award className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.sponsors')}</p>
              <p className="text-sm text-amber-700">{info.sponsors}</p>
            </div>
          </div>
        )}

        {/* Achievements */}
        {info?.achievements && (
          <div className="flex items-start space-x-2">
            <Award className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.achievements')}</p>
              <p className="text-sm text-amber-700">{info.achievements}</p>
            </div>
          </div>
        )}

        {/* Fun Facts */}
        {info?.fun_facts && (
          <div className="flex items-start space-x-2">
            <Lightbulb className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.funFacts')}</p>
              <p className="text-sm text-amber-700">{info.fun_facts}</p>
            </div>
          </div>
        )}

        {/* Notes */}
        {info?.notes && (
          <div className="flex items-start space-x-2">
            <FileText className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-medium text-amber-800">{t('commentatorInfo.notes')}</p>
              <p className="text-sm text-amber-700">{info.notes}</p>
            </div>
          </div>
        )}

        {/* Social Media */}
        {(info?.social_media?.instagram || 
          info?.social_media?.youtube || 
          info?.social_media?.website) && (
          <div className="pt-3 border-t border-amber-200">
            <p className="text-xs font-medium text-amber-800 mb-3">{t('commentatorInfo.socialMedia')}</p>
            <div className="flex items-center space-x-4">
              {info.social_media?.instagram && (
                <a
                  href={`https://instagram.com/${info.social_media.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all text-sm"
                >
                  <Instagram className="h-4 w-4" />
                  <span>@{info.social_media.instagram}</span>
                </a>
              )}

              {info.social_media?.youtube && (
                <a
                  href={info.social_media.youtube.startsWith('http') 
                    ? info.social_media.youtube 
                    : `https://${info.social_media.youtube}`
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg hover:from-red-600 hover:to-red-700 transition-all text-sm"
                >
                  <Youtube className="h-4 w-4" />
                  <span>YouTube</span>
                </a>
              )}

              {info.social_media?.website && (
                <a
                  href={info.social_media.website.startsWith('http') 
                    ? info.social_media.website 
                    : `https://${info.social_media.website}`
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
    );
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
                  count: countFields(commentatorInfo)
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

        {/* Tab Navigation */}
        {isExpanded && tabs.length > 1 && (
          <div className="flex space-x-1 mt-3">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 text-sm font-medium border rounded-md transition-all ${
                  activeTab === tab.id
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                }`}
              >
                {tab.label} {tab.count > 0 && <span className="text-xs">({tab.count})</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="px-4 py-4">
          {tabs.length > 1 ? (
            // Friends System: Show tab-specific content
            renderCommentatorInfo(tabs.find(t => t.id === activeTab)?.data || [])
          ) : (
            // Fallback to original behavior
            renderCommentatorInfo([commentatorInfo as CommentatorInfoWithAuthor])
          )}
        </div>
      )}
    </div>
  );
} 