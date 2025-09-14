// src/pages/TVShowDetailsPage.tsx
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
  
  // --- State Management (Original structure preserved) ---
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
  const commentoRef = useRef<HTMLDivElement>(null); // Ref for the Commento container div

  // --- Custom hook to fetch all TV show data ---
  const {
    tvShow, episodes, selectedSeason, setSelectedSeason, isLoading, error,
    recommendations, cast, trailerKey, isFavorite, isInMyWatchlist,
    handlePlayEpisode, handleToggleFavorite, handleToggleWatchlist, getLastWatchedEpisode,
  } = useTVDetails(id);

  // --- Memoized data validation ---
  const isTVShowValid = useMemo(() => validateTVShowData(tvShow), [tvShow]);

  /**
   * Displays a toast notification and prevents duplicates.
   */
  const addToast = useCallback((message: string, isError: boolean) => {
    if (toastShownRef.current.has(message)) return;
    const toastId = generateToastId();
    setToasts(prev => [...prev, { message, isError, id: toastId }]);
    toastShownRef.current.add(message);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toastId));
      toastShownRef.current.delete(message);
    }, 3000);
  }, []);

  /**
   * Initializes the download overlay state once when data is ready.
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
   * FIXED: Effect to dynamically load the Commento.io script.
   * Uses a ref to ensure the container div exists before loading, preventing errors.
   */
  useEffect(() => {
    if (commentoRef.current && tvShow?.id) {
      const pageId = `tv-${tvShow.id}`;
      commentoRef.current.setAttribute('data-page-id', pageId);

      if (document.getElementById('commento-script')) {
        return;
      }
      
      const script = document.createElement('script');
      script.id = 'commento-script';
      script.src = 'https://cdn.commento.io/js/commento.js';
      script.async = true;
      script.defer = true;

      script.onload = () => {
        if (!window.commento) {
          setCommentoError("Failed to initialize comments: Script loaded but main object not found.");
        } else {
          setCommentoError(null);
        }
      };
      script.onerror = () => {
        setCommentoError("Failed to load comments: The script could not be loaded.");
      };

      document.head.appendChild(script);

      return () => {
        const existingScript = document.getElementById('commento-script');
        if (existingScript) {
          existingScript.remove();
        }
      };
    }
  }, [tvShow?.id]);

  /**
   * Handles the share functionality.
   */
  const handleShare = useCallback(async () => {
    if (!tvShow) return addToast('TV show data not available.', true);
    triggerHaptic();
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: tvShow.name, text: `Check out ${tvShow.name}!`, url: shareUrl });
        addToast('Shared successfully!', false);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        addToast('Link copied to clipboard!', false);
      }
    } catch (err) {
      addToast('Could not share.', true);
    }
  }, [tvShow, addToast, triggerHaptic]);

  /**
   * Opens the download overlay for the latest episode.
   */
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
  
  /**
   * Opens the download overlay for the currently selected episode.
   */
  const handleOpenDownload = useCallback(() => {
    if (!selectedSeasonNumber || !selectedEpisodeNumber) {
        return addToast('Please select an episode to download.', true);
    }
    triggerHaptic();
    setShowDownloadOverlay(true);
  }, [selectedSeasonNumber, selectedEpisodeNumber, addToast, triggerHaptic]);
  
  /**
   * Closes the download overlay.
   */
  const handleCloseDownload = useCallback(() => {
    setShowDownloadOverlay(false);
  }, []);


  // --- Render Logic ---

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Toast Notifications */}
      <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[1000] space-y-2">
        {toasts.map(toast => (
          <div key={toast.id} className={`px-6 py-3 rounded-lg text-white text-sm shadow-lg ${toast.isError ? 'bg-red-600' : 'bg-background border-white/20'}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {/* Header Section */}
      <div className="relative">
        <button onClick={() => navigate(-1)} className="absolute top-20 left-6 z-10 text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors" aria-label="Go back">
          <ArrowLeft className="h-5 w-5" />
        </button>
        {/* FIXED: Trailer background now uses the correct URL */}
        { !isMobile && trailerKey &&
            <div className="absolute inset-0 bg-black/60">
                <iframe
                className="w-full h-full"
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${trailerKey}`}
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="TV Show Trailer"
                />
            </div>
        }
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
                <button onClick={handleCloseDownload} className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors" aria-label="Close download overlay">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
                <p className="text-white text-center mb-4">Please solve this due to security requirements</p>
                <div className="w-full h-[60vh] rounded-lg border-2 border-white/10">
                    {selectedSeasonNumber && selectedEpisodeNumber && (
                        <iframe
                            className="w-full h-full"
                            src={`https://dl.vidsrc.vip/tv/${tvShow.id}/${selectedSeasonNumber}/${selectedEpisodeNumber}`}
                            allowFullScreen
                            title={`Download TV Show - Season ${selectedSeasonNumber}, Episode ${selectedEpisodeNumber}`}
                        />
                    )}
                </div>
            </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Tabs Navigation */}
        <div className="flex border-b border-white/10 mb-6 overflow-x-auto pb-1 hide-scrollbar">
            {[{ id: 'episodes', label: 'Episodes' }, { id: 'about', label: 'About' }, { id: 'cast', label: 'Cast' }, { id: 'reviews', label: 'Reviews' }, { id: 'downloads', label: 'Downloads', hide: !user }].map((tab) => (
                <button key={tab.id} className={`py-2 px-4 font-medium whitespace-nowrap ${activeTab === tab.id ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'}`} style={{ display: tab.hide ? 'none' : undefined }} onClick={() => setActiveTab(tab.id as TabType)}>
                {tab.label}
                </button>
            ))}
        </div>
        
        {/* Tab Content */}
        <div>
          {activeTab === 'episodes' && <TVShowEpisodes seasons={tvShow.seasons} episodes={episodes} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} onPlayEpisode={handlePlayEpisode} onDownloadEpisode={(seasonNumber, episodeNumber) => { setSelectedSeasonNumber(seasonNumber); setSelectedEpisodeNumber(episodeNumber); setShowDownloadOverlay(true); }} />}
          {activeTab === 'about' && <TVShowAbout tvShow={tvShow} />}
          {activeTab === 'cast' && <TVShowCast cast={cast} />}
          {activeTab === 'reviews' && <div className="mb-8"><h2 className="text-2xl font-bold text-white mb-6">User Reviews</h2><ReviewSection mediaId={parseInt(id!, 10)} mediaType="tv" /></div>}
          {activeTab === 'downloads' && user && <TVDownloadSection tvShowName={tvShow.name} seasons={tvShow.seasons} episodesBySeason={episodes.reduce((acc, ep) => { (acc[ep.season_number] = acc[ep.season_number] || []).push(ep); return acc; }, {} as {[key: number]: Episode[]})} />}
        </div>
      </main>

      {/* Recommendations */}
      {recommendations.length > 0 && <ContentRow title="More Like This" media={recommendations} onItemClick={(mediaId) => navigate(`/tv/${mediaId}`)} />}

      {/* Comments Section */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h3 className="text-xl font-semibold text-white mb-4">Comments</h3>
        {commentoError ? (
          <p className="text-red-600">{commentoError}</p>
        ) : (
          // FIXED: This div now has a ref attached to it to ensure it exists before the script runs.
          <div ref={commentoRef} id="commento"></div>
        )}
      </div>
    </div>
  );
};


// ================================================================================================
// Inline Sub-Components (Original structure and logic are preserved)
// ================================================================================================

const TVShowHeader = ({ tvShow, isFavorite, isInWatchlist, onToggleFavorite, onToggleWatchlist, onPlayEpisode, lastWatchedEpisode, onShare, onDownloadLatestEpisode }: TVShowHeaderProps) => (
  <div className="relative w-full h-[70vh]">
    <img src={getImageUrl(tvShow.backdrop_path, 'original')} alt={tvShow.name} className="w-full h-full object-cover" />
    <div className="absolute inset-0 details-gradient" />
    <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 lg:p-16">
      <div className="flex flex-col md:flex-row items-start gap-6 max-w-6xl mx-auto">
        <div className="hidden md:block flex-shrink-0 w-48 xl:w-64 rounded-lg overflow-hidden shadow-lg">
          <img src={getImageUrl(tvShow.poster_path, 'w342')} alt={tvShow.name} className="w-full h-auto" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 text-balance">{tvShow.name}</h1>
          {tvShow.tagline && <p className="text-white/70 mb-4 italic text-lg">{tvShow.tagline}</p>}
          <div className="flex flex-wrap items-center gap-4 mb-6">
            {tvShow.first_air_date && <div className="flex items-center text-white/80"><span>{new Date(tvShow.first_air_date).toLocaleDateString('en-US', { year: 'numeric' })}</span></div>}
            {tvShow.vote_average > 0 && <div className="flex items-center text-amber-400"><span>{tvShow.vote_average.toFixed(1)}</span></div>}
            <div className="flex flex-wrap gap-2">{tvShow.genres.map((genre) => <span key={genre.id} className="px-2 py-1 rounded bg-white/10 text-white/80 text-xs">{genre.name}</span>)}</div>
          </div>
          <p className="text-white/80 mb-6">{tvShow.overview}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => lastWatchedEpisode ? onPlayEpisode(lastWatchedEpisode.season_number, lastWatchedEpisode.episode_number) : onPlayEpisode(1, 1)} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Play className="h-4 w-4 mr-2" /> Play {lastWatchedEpisode ? `S${lastWatchedEpisode.season_number} E${lastWatchedEpisode.episode_number}` : 'First Episode'}</Button>
            <Button onClick={onDownloadLatestEpisode} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Download className="h-4 w-4 mr-2" /> Download Latest</Button>
            <Button onClick={onShare} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Share2 className="h-4 w-4 mr-2" /> Share</Button>
            <Button onClick={onToggleFavorite} variant="outline" className={`border-white/20 ${isFavorite ? 'bg-accent text-white' : 'bg-black/50 text-white hover:bg-black/70'}`}><Heart className={`h-4 w-4 mr-2 ${isFavorite ? 'fill-current' : ''}`} /> {isFavorite ? 'In Favorites' : 'Add to Favorites'}</Button>
            <Button onClick={onToggleWatchlist} variant="outline" className={`border-white/20 ${isInWatchlist ? 'bg-accent text-white' : 'bg-black/50 text-white hover:bg-black/70'}`}><Bookmark className={`h-4 w-4 mr-2 ${isInWatchlist ? 'fill-current' : ''}`} /> {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}</Button>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const TVShowEpisodes = ({ seasons, episodes, selectedSeason, onSeasonChange, onPlayEpisode, onDownloadEpisode }: EpisodeProps) => {
    // Note: This component's internal logic and state are preserved from the original script.
    const [expandedEpisodes, setExpandedEpisodes] = useState<number[]>([]);
    const toggleEpisode = (episodeNumber: number) => {
        setExpandedEpisodes((prev) => prev.includes(episodeNumber) ? prev.filter((num) => num !== episodeNumber) : [...prev, episodeNumber]);
    };

    return (
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">Seasons & Episodes</h2>
        <div className="mb-4">
          <select value={selectedSeason} onChange={(e) => onSeasonChange(parseInt(e.target.value, 10))} className="bg-background border border-white/20 text-white rounded px-3 py-2">
            {seasons.map((season: Season) => <option key={season.season_number} value={season.season_number}>Season {season.season_number}</option>)}
          </select>
        </div>
        <div className="space-y-4">
          {episodes.filter((ep: Episode) => ep.season_number === selectedSeason).map((episode: Episode) => (
              <div key={episode.episode_number} className="bg-background border border-white/10 rounded-lg p-4">
                <div className="flex items-center gap-4">
                  {episode.still_path ? <img src={getImageUrl(episode.still_path, 'w300')} alt={`Episode ${episode.episode_number}`} className="w-32 h-18 object-cover rounded" /> : <div className="w-32 h-18 bg-white/10 rounded flex items-center justify-center"><span className="text-white/70 text-xs">No Image</span></div>}
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <h3 className="text-white font-medium">{episode.episode_number}. {episode.name}</h3>
                      <Button variant="ghost" size="sm" onClick={() => toggleEpisode(episode.episode_number)} className="text-white/70 hover:text-white">{expandedEpisodes.includes(episode.episode_number) ? 'Hide' : 'Show'}</Button>
                    </div>
                    <p className="text-white/70 text-sm">{episode.air_date && new Date(episode.air_date).toLocaleDateString()}</p>
                    <div className="flex gap-2 mt-2">
                      <Button onClick={() => onPlayEpisode(episode.season_number, episode.episode_number)} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Play className="h-4 w-4 mr-2" /> Play Episode</Button>
                      <Button onClick={() => onDownloadEpisode(episode.season_number, episode.episode_number)} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Download className="h-4 w-4 mr-2" /> Download</Button>
                    </div>
                    {expandedEpisodes.includes(episode.episode_number) && <p className="text-white/80 mt-2">{episode.overview || 'No description available.'}</p>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
};

const TVShowAbout = ({ tvShow }: AboutProps) => (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-white mb-6">About {tvShow.name}</h2>
      <p className="text-white/80 mb-4">{tvShow.overview}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Details</h3>
          <p className="text-white/80"><strong>First Air Date:</strong> {tvShow.first_air_date ? new Date(tvShow.first_air_date).toLocaleDateString() : 'N/A'}</p>
          <p className="text-white/80"><strong>Status:</strong> {tvShow.status || 'N/A'}</p>
          <p className="text-white/80"><strong>Number of Seasons:</strong> {tvShow.number_of_seasons || 'N/A'}</p>
          <p className="text-white/80"><strong>Number of Episodes:</strong> {tvShow.number_of_episodes || 'N/A'}</p>
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Genres</h3>
          <div className="flex flex-wrap gap-2">{tvShow.genres.map((genre) => <span key={genre.id} className="px-2 py-1 rounded bg-white/10 text-white/80 text-xs">{genre.name}</span>)}</div>
        </div>
      </div>
    </div>
);

const TVShowCast = ({ cast }: CastProps) => (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-white mb-6">Cast</h2>
      {cast.length === 0 ? <p className="text-white/80">No cast information available.</p> : <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{cast.map((actor) => <div key={actor.id} className="text-white/80"><p className="font-medium">{actor.name}</p><p className="text-sm">as {actor.character || 'N/A'}</p></div>)}</div>}
    </div>
);

const TVDownloadSection = ({ tvShowName, seasons, episodesBySeason }: DownloadSectionProps) => {
    const [selectedDownloadSeason, setSelectedDownloadSeason] = useState<number>(seasons[0]?.season_number || 1);
    return (
        <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Download Episodes for {tvShowName}</h2>
            <div className="mb-4">
                <select value={selectedDownloadSeason} onChange={(e) => setSelectedDownloadSeason(parseInt(e.target.value, 10))} className="bg-background border border-white/20 text-white rounded px-3 py-2">
                    {seasons.map((season: Season) => <option key={season.season_number} value={season.season_number}>Season {season.season_number}</option>)}
                </select>
            </div>
            <div className="space-y-4">
                {(episodesBySeason[selectedDownloadSeason] || []).length === 0 ? <p className="text-white/80">No episodes available.</p> : episodesBySeason[selectedDownloadSeason].map((episode: Episode) => (
                    <div key={episode.episode_number} className="bg-background border border-white/10 rounded-lg p-4 flex justify-between items-center">
                        <div>
                        <p className="text-white font-medium">Episode {episode.episode_number}: {episode.name}</p>
                        <p className="text-white/70 text-sm">{episode.air_date ? new Date(episode.air_date).toLocaleDateString() : 'N/A'}</p>
                        </div>
                        <Button className="bg-accent hover:bg-accent/80 text-white flex items-center"><Download className="h-4 w-4 mr-2" /> Download</Button>
                    </div>
                ))}
            </div>
        </div>
    );
};


export default TVShowDetailsPage;
