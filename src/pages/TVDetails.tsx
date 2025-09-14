import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Download, Share2, Heart, Bookmark } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ContentRow from '@/components/ContentRow';
import Navbar from '@/components/Navbar';
import ReviewSection from '@/components/ReviewSection';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTVDetails } from '@/hooks/use-tv-details';
import { useAuth } from '@/hooks';
import { useHaptic } from '@/hooks/useHaptic';
import { TVShow, Season, Episode, LastWatchedEpisode } from '@/utils/types';
import { getImageUrl } from '@/utils/services/tmdb';

// ================================================================================================
// Type Definitions
// ================================================================================================
type TabType = 'episodes' | 'about' | 'cast' | 'reviews' | 'downloads';
interface Toast {
  message: string;
  isError: boolean;
  id: string;
}
interface TVShowHeaderProps {
  tvShow: TVShow;
  isFavorite: boolean;
  isInWatchlist: boolean;
  onToggleFavorite: () => void;
  onToggleWatchlist: () => void;
  onPlayEpisode: (seasonNumber: number, episodeNumber: number) => void;
  lastWatchedEpisode: LastWatchedEpisode | null;
  onShare: () => void;
  onDownload: () => void;
  onDownloadLatestEpisode: () => void;
}
interface EpisodeProps {
  seasons: Season[];
  episodes: Episode[];
  selectedSeason: number;
  onSeasonChange: (seasonNumber: number) => void;
  onPlayEpisode: (seasonNumber: number, episodeNumber: number) => void;
  onDownloadEpisode: (seasonNumber: number, episodeNumber: number) => void;
}
interface AboutProps {
  tvShow: TVShow;
}
interface CastProps {
  cast: any[];
}
interface DownloadSectionProps {
  tvShowName: string;
  seasons: Season[];
  episodesBySeason: { [key: number]: Episode[] };
}

// ================================================================================================
// Helper Functions
// ================================================================================================

/**
 * Generates a unique ID for toast notifications.
 */
const generateToastId = (): string => Math.random().toString(36).substring(2, 9);

/**
 * Validates the core structure of the TV show data.
 */
const validateTVShowData = (tvShow: TVShow | null): boolean => {
  if (!tvShow || !tvShow.id || !tvShow.name || !tvShow.seasons) {
    console.error('Invalid or incomplete TV show data:', tvShow);
    return false;
  }
  return true;
};

/**
 * Finds the latest episode, with fallbacks for incomplete data.
 */
const getLatestEpisode = (seasons: Season[], episodes: Episode[]): Episode | null => {
  if (!seasons?.length) return null;
  if (!episodes?.length) return { season_number: 1, episode_number: 1 } as Episode;
  
  const latestSeason = seasons.reduce((max, season) => (season.season_number > max.season_number ? season : max), seasons[0]);
  const episodesInLatestSeason = episodes.filter(ep => ep.season_number === latestSeason.season_number);
  
  return episodesInLatestSeason[episodesInLatestSeason.length - 1] || { season_number: 1, episode_number: 1 } as Episode;
};

// ================================================================================================
// Main Component: TVShowDetailsPage
// ================================================================================================
const TVShowDetailsPage = () => {
  // --- Core Hooks ---
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { triggerHaptic } = useHaptic();

  // --- State Management ---
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('episodes');
  const [showDownloadOverlay, setShowDownloadOverlay] = useState(false);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState<number | null>(null);
  const [expandedEpisodes, setExpandedEpisodes] = useState<number[]>([]);
  const [commentoError, setCommentoError] = useState<string | null>(null);

  // --- Refs ---
  const toastShownRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);

  // --- Custom Hook for fetching data ---
  const {
    tvShow, episodes, selectedSeason, setSelectedSeason, isLoading, error,
    recommendations, cast, trailerKey, isFavorite, isInMyWatchlist,
    handlePlayEpisode, handleToggleFavorite, handleToggleWatchlist, getLastWatchedEpisode,
  } = useTVDetails(id);

  // --- Memoized Validation ---
  const isTVShowValid = useMemo(() => validateTVShowData(tvShow), [tvShow]);

  // --- Callbacks ---
  const addToast = useCallback((message: string, isError: boolean) => {
    if (toastShownRef.current.has(message)) return;
    const toastId = generateToastId();
    const newToast: Toast = { message, isError, id: toastId };
    setToasts(prev => [...prev, newToast]);
    toastShownRef.current.add(message);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId));
      toastShownRef.current.delete(message);
    }, 3000);
  }, []);

  // --- Effects ---

  /**
   * Initializes the download overlay state with the last watched or latest episode.
   * Runs only once when the TV show data is available.
   */
  useEffect(() => {
    if (!isTVShowValid || hasInitializedRef.current || !tvShow) return;

    hasInitializedRef.current = true;
    const lastWatched = getLastWatchedEpisode();
    if (lastWatched) {
      setSelectedSeasonNumber(lastWatched.season_number);
      setSelectedEpisodeNumber(lastWatched.episode_number);
    } else {
      const latestEpisode = getLatestEpisode(tvShow.seasons, episodes);
      if (latestEpisode) {
        setSelectedSeasonNumber(latestEpisode.season_number);
        setSelectedEpisodeNumber(latestEpisode.episode_number);
      }
    }
  }, [tvShow, episodes, getLastWatchedEpisode, isTVShowValid]);

  /**
   * Dynamically loads and initializes the Commento.io script.
   * This ensures the script only loads when needed and cleans up after itself.
   */
  useEffect(() => {
    if (activeTab !== 'reviews' || !tvShow?.id) return;

    const pageId = `tv-${tvShow.id}`;
    // Prevents script from being added multiple times on re-renders
    if (document.getElementById('commento-script')) return;

    const script = document.createElement('script');
    script.id = 'commento-script';
    script.src = 'https://cdn.commento.io/js/commento.js';
    script.defer = true;
    script.async = true;

    script.onload = () => {
      // Small delay to ensure the DOM element is fully ready
      setTimeout(() => {
        const commentoDiv = document.getElementById('commento');
        if (commentoDiv) {
          if (window.commento && typeof window.commento.main === 'function') {
            setCommentoError(null);
          } else {
            setCommentoError("Failed to load comments: Initialization function not found.");
          }
        } else {
          setCommentoError("Failed to load comments: Comment container not found.");
        }
      }, 100);
    };

    script.onerror = () => {
      setCommentoError("Failed to load comments: The script could not be loaded. Check your network or ad-blocker.");
    };

    document.head.appendChild(script);

    return () => {
      // Cleanup: remove the script when the component unmounts or tab changes
      const existingScript = document.getElementById('commento-script');
      if (existingScript) {
        existingScript.remove();
      }
    };
  }, [activeTab, tvShow?.id]);

  // --- Event Handlers ---

  const handleShare = useCallback(async () => {
    if (!tvShow) return addToast('TV show data not available.', true);
    triggerHaptic();
    const shareUrl = window.location.href;
    const shareData = {
      title: tvShow.name,
      text: `Check out ${tvShow.name}!`,
      url: shareUrl,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
        addToast('Shared successfully!', false);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        addToast('Link copied to clipboard!', false);
      }
    } catch (err) {
      console.error('Share failed:', err);
      addToast('Could not share.', true);
    }
  }, [tvShow, addToast, triggerHaptic]);

  const handleDownloadLatestEpisode = useCallback(() => {
    if (!tvShow) return addToast('TV show data not available.', true);
    triggerHaptic();
    const latestEpisode = getLatestEpisode(tvShow.seasons, episodes);
    if (latestEpisode) {
      setSelectedSeasonNumber(latestEpisode.season_number);
      setSelectedEpisodeNumber(latestEpisode.episode_number);
      setShowDownloadOverlay(true);
    } else {
      addToast('No episodes available to download.', true);
    }
  }, [tvShow, episodes, addToast, triggerHaptic]);

  const handleOpenDownload = useCallback(() => {
    if (!selectedSeasonNumber || !selectedEpisodeNumber) {
        return addToast('Please select an episode to download.', true);
    }
    triggerHaptic();
    setShowDownloadOverlay(true);
  }, [selectedSeasonNumber, selectedEpisodeNumber, addToast, triggerHaptic]);
  
  const handleCloseDownload = useCallback(() => {
    setShowDownloadOverlay(false);
  }, []);

  // --- Render Functions ---

  if (isLoading) {
    return <div className="flex items-center justify-center min-h-screen bg-background text-white">Loading...</div>;
  }
  if (error) {
    return <div className="flex flex-col items-center justify-center min-h-screen bg-background text-red-500">
        <p>Error: {error}</p>
        <Button onClick={() => navigate('/')} variant="outline" className="mt-4">Go Home</Button>
    </div>;
  }
  if (!tvShow) {
    return <div className="flex flex-col items-center justify-center min-h-screen bg-background text-white">
        <p>TV Show not found.</p>
        <Button onClick={() => navigate('/')} variant="outline" className="mt-4">Go Home</Button>
    </div>;
  }
  
  // Renders the trailer background on desktop
  const renderTrailerBackground = () => {
    if (isMobile || !trailerKey) return null;
    return (
      <div className="absolute inset-0 z-0 bg-black/60">
        <iframe
          className="w-full h-full"
          // FIXED: Corrected the YouTube embed URL and template literal
          src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${trailerKey}`}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="TV Show Trailer"
        />
      </div>
    );
  };

  // Main render output
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Toast Notifications */}
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-[1000] space-y-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`px-6 py-3 rounded-lg text-white text-sm shadow-lg ${toast.isError ? 'bg-red-600' : 'bg-gray-800'}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header Section */}
      <div className="relative">
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 z-20 text-white p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        {renderTrailerBackground()}
        <TVShowHeader
          tvShow={tvShow}
          isFavorite={isFavorite}
          isInWatchlist={isInMyWatchlist}
          onToggleFavorite={handleToggleFavorite}
          onToggleWatchlist={handleToggleWatchlist}
          onPlayEpisode={handlePlayEpisode}
          lastWatchedEpisode={getLastWatchedEpisode()}
          onShare={handleShare}
          onDownload={handleOpenDownload}
          onDownloadLatestEpisode={handleDownloadLatestEpisode}
        />
      </div>

      {/* Download Overlay */}
      {showDownloadOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="relative bg-background rounded-lg shadow-xl w-full max-w-4xl p-6">
                <button onClick={handleCloseDownload} className="absolute top-4 right-4 text-white/70 hover:text-white">&times;</button>
                <h3 className="text-lg font-bold text-white mb-4">Download Episode</h3>
                <p className="text-white/70 text-center mb-4">Please solve this captcha for security.</p>
                <div className="w-full h-[60vh] rounded-lg border-2 border-white/10">
                    {selectedSeasonNumber && selectedEpisodeNumber && (
                        <iframe
                            className="w-full h-full"
                            src={`https://dl.vidsrc.vip/tv/${tvShow.id}/${selectedSeasonNumber}/${selectedEpisodeNumber}`}
                            allowFullScreen
                            title={`Download S${selectedSeasonNumber} E${selectedEpisodeNumber}`}
                        />
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Tabs Navigation */}
        <div className="flex border-b border-white/10 mb-6 overflow-x-auto">
            {['episodes', 'about', 'cast', 'reviews', user && 'downloads'].filter(Boolean).map(tabName => (
                <button
                    key={tabName}
                    className={`py-2 px-4 font-medium whitespace-nowrap capitalize ${activeTab === tabName ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'}`}
                    onClick={() => setActiveTab(tabName as TabType)}
                >
                    {tabName}
                </button>
            ))}
        </div>
        
        {/* Tab Content */}
        <div>
          {activeTab === 'episodes' && (
              <TVShowEpisodes
                seasons={tvShow.seasons}
                episodes={episodes}
                selectedSeason={selectedSeason}
                onSeasonChange={setSelectedSeason}
                onPlayEpisode={handlePlayEpisode}
                onDownloadEpisode={(seasonNumber, episodeNumber) => {
                    setSelectedSeasonNumber(seasonNumber);
                    setSelectedEpisodeNumber(episodeNumber);
                    setShowDownloadOverlay(true);
                }}
              />
          )}
          {activeTab === 'about' && <TVShowAbout tvShow={tvShow} />}
          {activeTab === 'cast' && <TVShowCast cast={cast} />}
          {activeTab === 'reviews' && (
            <div>
              <h2 className="text-2xl font-bold text-white mb-6">User Reviews</h2>
              {commentoError ? (
                <p className="text-red-500">{commentoError}</p>
              ) : (
                <div id="commento" data-page-id={`tv-${tvShow.id}`}></div>
              )}
              <ReviewSection mediaId={parseInt(id!, 10)} mediaType="tv" />
            </div>
          )}
          {activeTab === 'downloads' && user && (
            <TVDownloadSection
              tvShowName={tvShow.name}
              seasons={tvShow.seasons}
              episodesBySeason={episodes.reduce((acc, ep) => {
                  (acc[ep.season_number] = acc[ep.season_number] || []).push(ep);
                  return acc;
              }, {} as {[key: number]: Episode[]})}
            />
          )}
        </div>
      </main>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <ContentRow
          title="More Like This"
          media={recommendations}
          onItemClick={(mediaId) => navigate(`/tv/${mediaId}`)}
        />
      )}
    </div>
  );
};


// ================================================================================================
// Inline Sub-Components
// These are kept in the same file for simplicity but could be moved to their own files.
// ================================================================================================

const TVShowHeader = ({ tvShow, isFavorite, isInWatchlist, onToggleFavorite, onToggleWatchlist, onPlayEpisode, lastWatchedEpisode, onShare, onDownloadLatestEpisode }: TVShowHeaderProps) => (
  <div className="relative w-full h-[70vh] flex items-end">
    <div className="absolute inset-0">
      <img src={getImageUrl(tvShow.backdrop_path, 'original')} alt={tvShow.name} className="w-full h-full object-cover" />
      <div className="absolute inset-0 details-gradient" />
    </div>
    <div className="relative z-10 p-6 md:p-12 lg:p-16 max-w-6xl mx-auto w-full">
      <h1 className="text-3xl md:text-5xl font-bold text-white mb-2">{tvShow.name}</h1>
      {tvShow.tagline && <p className="text-white/70 mb-4 italic">{tvShow.tagline}</p>}
      <div className="flex flex-wrap items-center gap-4 mb-6">
          {tvShow.first_air_date && <span>{new Date(tvShow.first_air_date).getFullYear()}</span>}
          {tvShow.vote_average > 0 && <span className="text-amber-400">{tvShow.vote_average.toFixed(1)} ★</span>}
          <div className="flex flex-wrap gap-2">{tvShow.genres.map(g => <span key={g.id} className="px-2 py-1 rounded bg-white/10 text-xs">{g.name}</span>)}</div>
      </div>
      <p className="text-white/80 mb-6 max-w-2xl">{tvShow.overview}</p>
      <div className="flex flex-wrap gap-3">
        <Button onClick={() => lastWatchedEpisode ? onPlayEpisode(lastWatchedEpisode.season_number, lastWatchedEpisode.episode_number) : onPlayEpisode(1, 1)}>
            <Play className="h-4 w-4 mr-2" />
            {lastWatchedEpisode ? `Continue S${lastWatchedEpisode.season_number} E${lastWatchedEpisode.episode_number}` : 'Play First Episode'}
        </Button>
        <Button onClick={onDownloadLatestEpisode}><Download className="h-4 w-4 mr-2" /> Download Latest</Button>
        <Button onClick={onShare}><Share2 className="h-4 w-4 mr-2" /> Share</Button>
        <Button onClick={onToggleFavorite} variant="outline" className={isFavorite ? 'bg-accent text-white' : ''}><Heart className={`h-4 w-4 mr-2 ${isFavorite ? 'fill-current' : ''}`} /> Favorite</Button>
        <Button onClick={onToggleWatchlist} variant="outline" className={isInWatchlist ? 'bg-accent text-white' : ''}><Bookmark className={`h-4 w-4 mr-2 ${isInWatchlist ? 'fill-current' : ''}`} /> Watchlist</Button>
      </div>
    </div>
  </div>
);

const TVShowEpisodes = ({ seasons, episodes, selectedSeason, onSeasonChange, onPlayEpisode, onDownloadEpisode }: EpisodeProps) => (
  <div>
    <h2 className="text-2xl font-bold text-white mb-6">Seasons & Episodes</h2>
    <select value={selectedSeason} onChange={e => onSeasonChange(parseInt(e.target.value))} className="bg-background border border-white/20 text-white rounded px-3 py-2 mb-4">
        {seasons.map(season => <option key={season.id} value={season.season_number}>Season {season.season_number}</option>)}
    </select>
    <div className="space-y-4">
        {episodes.filter(ep => ep.season_number === selectedSeason).map(episode => (
            <div key={episode.id} className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center gap-4">
                <img src={getImageUrl(episode.still_path, 'w300')} alt={episode.name} className="w-32 h-18 object-cover rounded hidden sm:block"/>
                <div className="flex-1">
                    <h3 className="text-white font-medium">{episode.episode_number}. {episode.name}</h3>
                    <p className="text-white/70 text-sm mt-1 line-clamp-2">{episode.overview || 'No description available.'}</p>
                    <div className="flex gap-2 mt-3">
                        <Button size="sm" onClick={() => onPlayEpisode(episode.season_number, episode.episode_number)}><Play className="h-4 w-4 mr-2" /> Play</Button>
                        <Button size="sm" onClick={() => onDownloadEpisode(episode.season_number, episode.episode_number)}><Download className="h-4 w-4 mr-2" /> Download</Button>
                    </div>
                </div>
            </div>
        ))}
    </div>
  </div>
);

const TVShowAbout = ({ tvShow }: AboutProps) => (
    <div>
        <h2 className="text-2xl font-bold text-white mb-6">About {tvShow.name}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-white/80">
            <div><strong>First Air Date:</strong> {new Date(tvShow.first_air_date).toLocaleDateString()}</div>
            <div><strong>Status:</strong> {tvShow.status}</div>
            <div><strong>Seasons:</strong> {tvShow.number_of_seasons}</div>
            <div><strong>Episodes:</strong> {tvShow.number_of_episodes}</div>
        </div>
    </div>
);

const TVShowCast = ({ cast }: CastProps) => (
    <div>
        <h2 className="text-2xl font-bold text-white mb-6">Cast</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cast.slice(0, 12).map(actor => (
                <div key={actor.id}>
                    <p className="font-medium text-white">{actor.name}</p>
                    <p className="text-sm text-white/70">{actor.character}</p>
                </div>
            ))}
        </div>
    </div>
);

const TVDownloadSection = ({ tvShowName, seasons, episodesBySeason }: DownloadSectionProps) => {
    const [season, setSeason] = useState(seasons[0]?.season_number || 1);
    return (
        <div>
            <h2 className="text-2xl font-bold text-white mb-6">Download Episodes</h2>
            <select value={season} onChange={e => setSeason(parseInt(e.target.value))} className="bg-background border border-white/20 text-white rounded px-3 py-2 mb-4">
                {seasons.map(s => <option key={s.id} value={s.season_number}>Season {s.season_number}</option>)}
            </select>
            <div className="space-y-2">
                {(episodesBySeason[season] || []).map(ep => (
                    <div key={ep.id} className="bg-white/5 p-3 rounded flex justify-between items-center">
                        <p>{ep.episode_number}. {ep.name}</p>
                        <Button size="sm"><Download className="h-4 w-4" /></Button>
                    </div>
                ))}
            </div>
        </div>
    );
};


export default TVShowDetailsPage;

