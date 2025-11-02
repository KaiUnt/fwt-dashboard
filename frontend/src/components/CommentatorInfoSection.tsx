'use client';

import { useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Edit, Home, Users, Award, Heart, AlertTriangle, Lightbulb, FileText, Instagram, Youtube, Globe } from 'lucide-react';
import { CommentatorInfo, CommentatorInfoWithAuthor, TabData } from '@/types/athletes';
import { useTranslation } from '@/hooks/useTranslation';
import { useFriends } from '@/hooks/useFriends';

interface CommentatorInfoSectionProps {
  athleteId: string;
  athleteName: string;
  commentatorInfo: CommentatorInfoWithAuthor[]; // All commentator info passed as prop
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
  const [activeTab, setActiveTab] = useState<string>('mine');

  // Friends System Data
  const { data: friends } = useFriends();

  // Debug logging
  console.log('[CommentatorInfoSection] Received commentatorInfo:', commentatorInfo);
  console.log('[CommentatorInfoSection] commentatorInfo length:', commentatorInfo?.length);

  // Split commentatorInfo into mine and friends data
  const myData = useMemo(() => {
    const mine = commentatorInfo.filter(info => info.is_own_data);
    console.log('[CommentatorInfoSection] myData:', mine);
    return mine;
  }, [commentatorInfo]);

  const friendsData = useMemo(() => {
    const friends = commentatorInfo.filter(info => !info.is_own_data);
    console.log('[CommentatorInfoSection] friendsData:', friends);
    return friends;
  }, [commentatorInfo]);

  const countFields = (info: CommentatorInfo | null): number => {
    if (!info) return 0;
    const standardFieldsCount = [
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
    
    const customFieldsCount = info.custom_fields ? Object.values(info.custom_fields).filter(Boolean).length : 0;
    
    return standardFieldsCount + customFieldsCount;
  };

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
      count: countFields((() => {
        const merged = [...(myData || []), ...(friendsData || [])]
        // derive a simple count by creating a synthetic merged object like before
        const first = merged[0] || null
        return first as unknown as CommentatorInfo | null
      })()),
      data: [...(myData || []), ...(friendsData || [])]
    }
  ];

  // Check if we have any commentator info to display from all sources (mine + friends)
  const hasInfo = (myData && myData.length > 0 && countFields(myData[0]) > 0) ||
                  (friendsData && friendsData.length > 0);

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
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

    // For "all" tab, show all individual entries
    if (activeTab === 'all' && data.length > 1) {
      return (
        <div className="space-y-6">
          {data.map((info, index) => (
            <div key={`${info.athlete_id}-${info.created_by || 'own'}-${index}`} className="border-b border-amber-200 last:border-b-0 pb-4 last:pb-0">
              {renderSingleCommentatorInfo(info)}
            </div>
          ))}
        </div>
      );
    }

    // For single entries or other tabs, show just the first item
    return renderSingleCommentatorInfo(data[0]);
  };

  const renderSingleCommentatorInfo = (info: CommentatorInfoWithAuthor) => {
    const isOwnData = info.is_own_data;
    const hasFieldAuthors = info.fieldAuthors && Object.keys(info.fieldAuthors).length > 0;

    // Helper function to render field with author attribution
    const renderFieldWithAuthor = (
      fieldKey: string, 
      value: string, 
      icon: React.ReactNode, 
      label: string,
      isTextArea: boolean = false
    ) => {
      if (!value) return null;
      
      const fieldAuthor = hasFieldAuthors ? info.fieldAuthors?.[fieldKey] : null;
      const authorName = fieldAuthor 
        ? (fieldAuthor.author === 'You' ? t('commentatorInfo.you') : fieldAuthor.author)
        : (isOwnData ? t('commentatorInfo.you') : info.author_name || 'Unknown');
      const authorIsOwn = fieldAuthor ? fieldAuthor.isOwnData : isOwnData;

      return (
        <div className="flex items-start space-x-2">
          <div className="flex-shrink-0 mt-0.5">{icon}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-medium text-amber-800">{label}</p>
              {hasFieldAuthors && (
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  authorIsOwn 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {authorName}
                </span>
              )}
            </div>
            <p className={`text-sm text-amber-700 ${isTextArea ? 'whitespace-pre-wrap' : ''}`}>
              {value}
            </p>
          </div>
        </div>
      );
    };

    return (
      <div className="space-y-4">
        {/* Author attribution for single-source data */}
        {!hasFieldAuthors && !isOwnData && info.author_name && (
          <div className="flex items-center space-x-2 mb-3 p-2 bg-blue-50 rounded-lg">
            <Users className="h-4 w-4 text-blue-600" />
            <span className="text-sm text-blue-800 font-medium">
              {t('commentatorInfo.byAuthor', { author: info.author_name })}
            </span>
          </div>
        )}

        {/* Basic Info Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {renderFieldWithAuthor('homebase', info?.homebase || '', 
            <Home className="h-4 w-4 text-amber-600" />, 
            t('commentatorInfo.homebase')
          )}

          {renderFieldWithAuthor('team', info?.team || '', 
            <Users className="h-4 w-4 text-amber-600" />, 
            t('commentatorInfo.team')
          )}

          {renderFieldWithAuthor('favorite_trick', info?.favorite_trick || '', 
            <Heart className="h-4 w-4 text-amber-600" />, 
            t('commentatorInfo.favoriteTrick')
          )}

          {renderFieldWithAuthor('injuries', info?.injuries || '', 
            <AlertTriangle className="h-4 w-4 text-amber-600" />, 
            t('commentatorInfo.injuries')
          )}
        </div>

        {/* Sponsors */}
        {renderFieldWithAuthor('sponsors', info?.sponsors || '', 
          <Award className="h-4 w-4 text-amber-600" />, 
          t('commentatorInfo.sponsors'), true
        )}

        {/* Achievements */}
        {renderFieldWithAuthor('achievements', info?.achievements || '', 
          <Award className="h-4 w-4 text-amber-600" />, 
          t('commentatorInfo.achievements'), true
        )}

        {/* Fun Facts */}
        {renderFieldWithAuthor('fun_facts', info?.fun_facts || '', 
          <Lightbulb className="h-4 w-4 text-amber-600" />, 
          t('commentatorInfo.funFacts'), true
        )}

        {/* Notes */}
        {renderFieldWithAuthor('notes', info?.notes || '', 
          <FileText className="h-4 w-4 text-amber-600" />, 
          t('commentatorInfo.notes'), true
        )}

        {/* Social Media */}
        {(info?.social_media?.instagram || 
          info?.social_media?.youtube || 
          info?.social_media?.website) && (
          <div className="pt-3 border-t border-amber-200">
            <p className="text-xs font-medium text-amber-800 mb-3">{t('commentatorInfo.socialMedia')}</p>
            <div className="space-y-2">
              {info.social_media?.instagram && (
                <div className="flex items-center justify-between">
                  <a
                    href={`https://instagram.com/${info.social_media.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center space-x-1 px-3 py-1 bg-gradient-to-r from-pink-500 to-rose-500 text-white rounded-lg hover:from-pink-600 hover:to-rose-600 transition-all text-sm"
                  >
                    <Instagram className="h-4 w-4" />
                    <span>@{info.social_media.instagram}</span>
                  </a>
                  {hasFieldAuthors && info.fieldAuthors?.instagram && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      info.fieldAuthors.instagram.isOwnData 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {info.fieldAuthors.instagram.author === 'You' 
                        ? t('commentatorInfo.you') 
                        : info.fieldAuthors.instagram.author}
                    </span>
                  )}
                </div>
              )}

              {info.social_media?.youtube && (
                <div className="flex items-center justify-between">
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
                  {hasFieldAuthors && info.fieldAuthors?.youtube && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      info.fieldAuthors.youtube.isOwnData 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {info.fieldAuthors.youtube.author === 'You' 
                        ? t('commentatorInfo.you') 
                        : info.fieldAuthors.youtube.author}
                    </span>
                  )}
                </div>
              )}

              {info.social_media?.website && (
                <div className="flex items-center justify-between">
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
                  {hasFieldAuthors && info.fieldAuthors?.website && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      info.fieldAuthors.website.isOwnData 
                        ? 'bg-green-100 text-green-700' 
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {info.fieldAuthors.website.author === 'You' 
                        ? t('commentatorInfo.you') 
                        : info.fieldAuthors.website.author}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Custom Fields */}
        {info.custom_fields && Object.keys(info.custom_fields).length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium text-amber-800 mb-2 flex items-center space-x-2">
              <FileText className="h-4 w-4" />
              <span>Custom Fields</span>
            </h4>
            <div className="space-y-2">
              {Object.entries(info.custom_fields).map(([key, value]) => (
                value && (
                  <div key={key} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-amber-800">{key}</div>
                      <div className="text-sm text-amber-700">{String(value)}</div>
                    </div>
                    {hasFieldAuthors && info.fieldAuthors?.[`custom_${key}`] && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        info.fieldAuthors[`custom_${key}`].isOwnData 
                          ? 'bg-green-100 text-green-700' 
                          : 'bg-blue-100 text-blue-700'
                      }`}>
                        {info.fieldAuthors[`custom_${key}`].author === 'You' 
                          ? t('commentatorInfo.you') 
                          : info.fieldAuthors[`custom_${key}`].author}
                      </span>
                    )}
                  </div>
                )
              ))}
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
                  count: tabs.find(t => t.id === activeTab)?.count || 0
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
          {renderCommentatorInfo(tabs.find(t => t.id === activeTab)?.data || [])}
        </div>
      )}
    </div>
  );
} 