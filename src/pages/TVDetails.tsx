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
 * @returns A random string ID.
 */
const generateToastId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

/**
 * Validates the core structure of the TV show data.
 * @param tvShow - The TV show object to validate.
 * @returns True if the data is valid, false otherwise.
 */
const validateTVShowData = (tvShow: TVShow | null): boolean => {
  if (!tvShow) {
    console.error('TV show data is null');
    return false;
  }
  if (!tvShow.id || !tvShow.name || !tvShow.seasons || tvShow.seasons.length === 0) {
    console.error('Invalid TV show data:', { id: tvShow.id, name: tvShow.name, seasons: tvShow.seasons });
    return false;
  }
  return true;
};

/**
 * Validates the structure of the episodes array.
 * @param episodes - The array of episodes to validate.
 * @returns True if the data is valid, false otherwise.
 */
const validateEpisodesData = (episodes: Episode[] | null): boolean => {
  if (!episodes || episodes.length === 0) {
    console.warn('Episodes array is empty or null');
    return false;
  }
  const isValid = episodes.every((ep) => ep.season_number && ep.episode_number);
  if (!isValid) {
    console.warn('Invalid episodes data detected');
  }
  return isValid;
};

/**
 * Finds the latest episode from available data, with fallbacks.
 * @param seasons - Array of all seasons for the show.
 * @param episodes - Array of all episodes for the show.
 * @returns The latest episode object or a fallback.
 */
const getLatestEpisode = (seasons: Season[], episodes: Episode[]): Episode | null => {
  try {
    if (!seasons.length) {
      return null;
    }
    if (!episodes.length) {
      return { season_number: 1, episode_number: 1 } as Episode;
    }
    const latestSeason = seasons.reduce(
      (max: Season, season: Season) => (season.season_number > max.season_number ? season : max),
      seasons[0]
    );
    const latestEpisodes = episodes.filter((ep: Episode) => ep.season_number === latestSeason.season_number);
    const latestEpisode = latestEpisodes[latestEpisodes.length - 1];
    if (!latestEpisode) {
      return { season_number: 1, episode_number: 1 } as Episode;
    }
    return latestEpisode;
  } catch (err) {
    console.error('Error getting latest episode:', err);
    return null;
  }
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

  // --- Refs for managing side effects without causing re-renders ---
  const toastShownRef = useRef<Set<string>>(new Set()); // Prevents duplicate toasts.
  const hasInitializedRef = useRef(false); // Ensures initialization logic runs only once.

  // --- Custom hook to fetch and manage all TV show data ---
  const {
    tvShow,
    episodes,
    selectedSeason,
    setSelectedSeason,
    isLoading,
    error,
    recommendations,
    cast,
    trailerKey,
    isFavorite,
    isInMyWatchlist,
    handlePlayEpisode,
    handleToggleFavorite,
    handleToggleWatchlist,
    getLastWatchedEpisode,
  } = useTVDetails(id);

  // --- Memoized data validation to avoid re-calculating on every render ---
  const isTVShowValid = useMemo(() => validateTVShowData(tvShow), [tvShow]);
  const isEpisodesValid = useMemo(() => validateEpisodesData(episodes), [episodes]);

  /**
   * Displays a toast notification and ensures no duplicates are shown.
   */
  const addToast = useCallback((message: string, isError: boolean) => {
    if (toastShownRef.current.has(message)) {
      return;
    }
    const toast: Toast = { message, isError, id: generateToastId() };
    setToasts((prev) => [...prev, toast]);
    toastShownRef.current.add(message);
    
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      toastShownRef.current.delete(message);
    }, 3000);
  }, []);

  /**
   * Effect to initialize the state for the download overlay.
   * Runs only once when valid TV show data is first available.
   */
  useEffect(() => {
    if (!isTVShowValid || hasInitializedRef.current) {
      return;
    }

    try {
      hasInitializedRef.current = true;
      if (!isEpisodesValid) {
        setSelectedSeasonNumber(1);
        setSelectedEpisodeNumber(1);
        return;
      }

      const lastWatched = getLastWatchedEpisode();
      if (lastWatched) {
        setSelectedSeasonNumber(lastWatched.season_number);
        setSelectedEpisodeNumber(lastWatched.episode_number);
      } else {
        const latestEpisode = getLatestEpisode(tvShow.seasons, episodes);
        if (latestEpisode) {
          setSelectedSeasonNumber(latestEpisode.season_number);
          setSelectedEpisodeNumber(latestEpisode.episode_number);
        } else {
          setSelectedSeasonNumber(1);
          setSelectedEpisodeNumber(1);
        }
      }
    } catch (err) {
      console.error('Error initializing download overlay:', err);
      addToast('Failed to initialize download options.', true);
    }
  }, [tvShow, episodes, getLastWatchedEpisode, isTVShowValid, isEpisodesValid, addToast]);

  /**
   * Effect to dynamically load and initialize the Commento.io script for comments.
   * This logic is carefully designed to load the script only when needed and clean up properly.
   */
  useEffect(() => {
    if (!tvShow?.id) {
      setCommentoError('No TV show data available for comments.');
      return;
    }

    const pageId = `tv-${tvShow.id}`;
    const script = document.createElement('script');
    script.src = 'https://cdn.commento.io/js/commento.js';
    script.defer = true;
    script.async = true;
    script.setAttribute('type', 'module');

    script.onload = () => {
      // Delay initialization slightly to ensure the DOM is fully ready.
      setTimeout(() => {
        const commentoDiv = document.getElementById('commento');
        if (commentoDiv) {
          commentoDiv.setAttribute('data-page-id', pageId);
          if (window.commento && typeof window.commento.main === 'function') {
            try {
              window.commento.main();
              // Verify widget rendering after a short delay to be sure.
              setTimeout(() => {
                const widget = document.querySelector('#commento .commento-card');
                if (!widget) {
                  setCommentoError('Failed to load comments: Widget did not render.');
                } else {
                  setCommentoError(null);
                }
              }, 1000);
            } catch (err) {
              setCommentoError('Failed to load comments: Commento initialization failed.');
            }
          } else {
            setCommentoError('Failed to load comments: `window.commento.main` is not a function.');
          }
        } else {
          setCommentoError('Failed to load comments: Comment container not found.');
        }
      }, 500);
    };
    script.onerror = () => {
      setCommentoError('Failed to load comments: Script could not be loaded. Check network or ad-blocker.');
    };

    document.head.appendChild(script);

    // Cleanup function to remove the script when the component unmounts.
    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [tvShow?.id]);

  /**
   * Handles the share functionality using Web Share API or copying to clipboard.
   */
  const handleShare = useCallback(async () => {
    if (!isTVShowValid) {
      addToast('No TV show data available to share.', true);
      return;
    }
    const shareUrl = window.location.href;
    const shareData = {
      title: tvShow.name,
      text: `Watch ${tvShow.name} now! ${tvShow.overview.slice(0, 100)}...`,
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
      triggerHaptic();
    } catch (error) {
      addToast('Failed to share.', true);
    }
  }, [tvShow, isTVShowValid, triggerHaptic, addToast]);

  /**
   * Opens the download overlay for the latest episode.
   */
  const handleDownloadLatestEpisode = useCallback(() => {
    if (!isTVShowValid) {
      addToast('No TV show data available.', true);
      return;
    }
    try {
      const latestEpisode = getLatestEpisode(tvShow.seasons, episodes);
      if (latestEpisode) {
        setSelectedSeasonNumber(latestEpisode.season_number);
        setSelectedEpisodeNumber(latestEpisode.episode_number);
        setShowDownloadOverlay(true);
        triggerHaptic();
      } else {
        setSelectedSeasonNumber(1);
        setSelectedEpisodeNumber(1);
        setShowDownloadOverlay(true);
        triggerHaptic();
      }
    } catch (err) {
      addToast('Failed to open download overlay.', true);
    }
  }, [tvShow, episodes, isTVShowValid, triggerHaptic, addToast]);

  /**
   * Opens the download overlay for the currently selected episode.
   */
  const handleOpenDownload = useCallback(() => {
    if (!isTVShowValid || !selectedSeasonNumber || !selectedEpisodeNumber) {
      addToast('Please select a valid season and episode.', true);
      return;
    }
    setShowDownloadOverlay(true);
    triggerHaptic();
  }, [tvShow, selectedSeasonNumber, selectedEpisodeNumber, isTVShowValid, triggerHaptic, addToast]);

  /**
   * Closes the download overlay and resets state.
   */
  const handleCloseDownload = useCallback(() => {
    setShowDownloadOverlay(false);
    setSelectedSeasonNumber(null);
    setSelectedEpisodeNumber(null);
    triggerHaptic();
  }, [triggerHaptic]);

  /**
   * Handles playing an episode from within the download overlay.
   */
  const handlePlayEpisodeInOverlay = useCallback(() => {
    if (!isTVShowValid || !selectedSeasonNumber || !selectedEpisodeNumber) {
      addToast('Please select a valid season and episode.', true);
      return;
    }
    handlePlayEpisode(selectedSeasonNumber, selectedEpisodeNumber);
  }, [tvShow, selectedSeasonNumber, selectedEpisodeNumber, isTVShowValid, handlePlayEpisode, addToast]);

  /**
   * Inline Component: Renders the main header section.
   */
  const TVShowHeader = ({ tvShow, isFavorite, isInWatchlist, onToggleFavorite, onToggleWatchlist, onPlayEpisode, lastWatchedEpisode, onShare, onDownloadLatestEpisode }: TVShowHeaderProps) => {
    const handlePlayLastWatched = useCallback(() => {
      try {
        if (lastWatchedEpisode) {
          onPlayEpisode(lastWatchedEpisode.season_number, lastWatchedEpisode.episode_number);
        } else if (tvShow.seasons.length > 0) {
          onPlayEpisode(tvShow.seasons[0].season_number, 1);
        } else {
          addToast('No episodes available to play.', true);
        }
      } catch (err) {
        addToast('Failed to play episode.', true);
      }
    }, [lastWatchedEpisode, onPlayEpisode, tvShow.seasons, addToast]);

    return (
      <div className="relative w-full h-[70vh]">
        <img src={getImageUrl(tvShow.backdrop_path, 'original')} alt={tvShow.name || 'TV Show backdrop'} className="w-full h-full object-cover" />
        <div className="absolute inset-0 details-gradient" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 lg:p-16">
          <div className="flex flex-col md:flex-row items-start gap-6 max-w-6xl mx-auto">
            {/* Poster Image for Desktop Only */}
            <div className="hidden md:block flex-shrink-0 w-48 xl:w-64 rounded-lg overflow-hidden shadow-lg">
              <img src={getImageUrl(tvShow.poster_path, 'w342')} alt={tvShow.name || 'TV Show poster'} className="w-full h-auto" />
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
                <Button onClick={handlePlayLastWatched} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Play className="h-4 w-4 mr-2" /> Play {lastWatchedEpisode ? `S${lastWatchedEpisode.season_number} E${lastWatchedEpisode.episode_number}` : 'First Episode'}</Button>
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
  };

  /**
   * Inline Component: Renders the seasons and episodes list.
   */
  const TVShowEpisodes = ({ seasons, episodes, selectedSeason, onSeasonChange, onPlayEpisode, onDownloadEpisode }: EpisodeProps) => {
    const toggleEpisode = useCallback((episodeNumber: number) => {
      triggerHaptic();
      setExpandedEpisodes((prev) => prev.includes(episodeNumber) ? prev.filter((num) => num !== episodeNumber) : [...prev, episodeNumber]);
    }, [triggerHaptic]);

    if (!episodes || episodes.length === 0) {
      return <div className="text-white text-center">No episodes available for this season.</div>;
    }

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

  /**
   * Inline Component: Renders the "About" tab content.
   */
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

  /**
   * Inline Component: Renders the "Cast" tab content.
   */
  const TVShowCast = ({ cast }: CastProps) => (
    <div className="mb-8">
      <h2 className="text-2xl font-bold text-white mb-6">Cast</h2>
      {cast.length === 0 ? <p className="text-white/80">No cast information available.</p> : <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{cast.map((actor) => <div key={actor.id} className="text-white/80"><p className="font-medium">{actor.name}</p><p className="text-sm">as {actor.character || 'N/A'}</p></div>)}</div>}
    </div>
  );

  /**
   * Inline Component: Renders the "Downloads" tab content.
   */
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
          {(episodesBySeason[selectedDownloadSeason] || []).length === 0 ? <p className="text-white/80">No episodes available for this season.</p> : episodesBySeason[selectedDownloadSeason].map((episode: Episode) => (
              <div key={episode.episode_number} className="bg-background border border-white/10 rounded-lg p-4 flex justify-between items-center">
                <div>
                  <p className="text-white font-medium">Episode {episode.episode_number}: {episode.name}</p>
                  <p className="text-white/70 text-sm">{episode.air_date ? new Date(episode.air_date).toLocaleDateString() : 'N/A'}</p>
                </div>
                <Button onClick={() => {
                    setSelectedSeasonNumber(episode.season_number);
                    setSelectedEpisodeNumber(episode.episode_number);
                    setShowDownloadOverlay(true);
                    triggerHaptic();
                  }} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Download className="h-4 w-4 mr-2" /> Download</Button>
              </div>
            ))}
        </div>
      </div>
    );
  };

  /**
   * Renders a loading state placeholder.
   */
  const renderLoadingState = () => (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-pulse-slow text-white font-medium">Loading TV show details...</div>
    </div>
  );

  /**
   * Renders an error message if data fetching fails.
   */
  const renderErrorState = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <h1 className="text-2xl text-white mb-4">Error: {error || 'Failed to load TV show data'}</h1>
      <Button onClick={() => navigate('/')} variant="outline">Return to Home</Button>
    </div>
  );

  /**
   * Renders a "not found" message if the TV show doesn't exist.
   */
  const renderNotFoundState = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <h1 className="text-2xl text-white mb-4">TV Show not found</h1>
      <Button onClick={() => navigate('/')} variant="outline">Return to Home</Button>
    </div>
  );
  
  /**
   * Renders the floating toast notifications.
   */
  const renderToasts = () => (
    <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[1000] space-y-2">
      {toasts.map((toast) => (
        <div key={toast.id} className={`px-6 py-3 rounded-lg text-white text-sm font-medium shadow-lg transition-opacity duration-300 ${toast.isError ? 'bg-red-600 border-red-400' : 'bg-background border-white/20'} animate-fade-in`}>
          {toast.message}
        </div>
      ))}
    </div>
  );

  /**
   * Renders the back button.
   */
  const renderBackButton = () => (
    <button onClick={() => navigate(-1)} className="absolute top-20 left-6 z-10 text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors" aria-label="Go back">
      <ArrowLeft className="h-5 w-5" />
    </button>
  );

  /**
   * Renders the trailer as a background video (desktop only).
   */
  const renderTrailerBackground = () => {
    if (isMobile || !trailerKey) return null;
    return (
      <div className="absolute inset-0 bg-black/60">
        <iframe
          className="w-full h-full"
          // CRITICAL FIX: The src URL was incorrect and is now fixed to use the proper YouTube embed URL.
          src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${trailerKey}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="TV Show Trailer"
        />
      </div>
    );
  };
  
  /**
   * Renders the download selection overlay.
   */
  const renderDownloadOverlay = () => {
    if (!showDownloadOverlay || !isTVShowValid || !selectedSeasonNumber || !selectedEpisodeNumber) {
      return null;
    }
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="relative bg-background rounded-lg shadow-xl w-full max-w-4xl p-6">
          <button onClick={handleCloseDownload} className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors" aria-label="Close download overlay">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <p className="text-white text-center mb-4">Please solve this due to security requirements</p>
          <div className="flex flex-wrap gap-4 mb-4">
            <select value={selectedSeasonNumber} onChange={(e) => {
                const seasonNum = parseInt(e.target.value, 10);
                setSelectedSeasonNumber(seasonNum);
                const firstEpisode = episodes.find((ep: Episode) => ep.season_number === seasonNum)?.episode_number || 1;
                setSelectedEpisodeNumber(firstEpisode);
              }} className="bg-background border border-white/20 text-white rounded px-3 py-2">
              {tvShow.seasons.map((season: Season) => <option key={season.season_number} value={season.season_number}>Season {season.season_number}</option>)}
            </select>
            <select value={selectedEpisodeNumber} onChange={(e) => setSelectedEpisodeNumber(parseInt(e.target.value, 10))} className="bg-background border border-white/20 text-white rounded px-3 py-2">
              {episodes.filter((ep: Episode) => ep.season_number === selectedSeasonNumber).map((ep: Episode) => <option key={ep.episode_number} value={ep.episode_number}>Episode {ep.episode_number}</option>)}
            </select>
            <div className="flex gap-2">
              <Button onClick={handlePlayEpisodeInOverlay} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Play className="h-4 w-4 mr-2" /> Play Episode</Button>
              <Button onClick={handleOpenDownload} className="bg-accent hover:bg-accent/80 text-white flex items-center"><Download className="h-4 w-4 mr-2" /> Download</Button>
            </div>
          </div>
          <iframe className="w-full h-[60vh] rounded-lg border-2 border-white/10" src={`https://dl.vidsrc.vip/tv/${tvShow.id}/${selectedSeasonNumber}/${selectedEpisodeNumber}`} allowFullScreen title={`Download TV Show - Season ${selectedSeasonNumber}, Episode ${selectedEpisodeNumber}`} />
        </div>
      </div>
    );
  };

  /**
   * Renders the main content tabs navigation.
   */
  const renderTabsNavigation = () => (
    <div className="flex border-b border-white/10 mb-6 overflow-x-auto pb-1 hide-scrollbar">
      {[{ id: 'episodes', label: 'Episodes' }, { id: 'about', label: 'About' }, { id: 'cast', label: 'Cast' }, { id: 'reviews', label: 'Reviews' }, { id: 'downloads', label: 'Downloads', hide: !user }].map((tab) => (
        <button key={tab.id} className={`py-2 px-4 font-medium whitespace-nowrap ${activeTab === tab.id ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'}`} style={{ display: tab.hide ? 'none' : undefined }} onClick={() => {
            triggerHaptic();
            setActiveTab(tab.id as TabType);
          }}>
          {tab.label}
        </button>
      ))}
    </div>
  );

  /**
   * Renders the content for the currently active tab.
   */
  const renderTabContent = () => {
    if (!isTVShowValid) {
      return <div className="text-white/80">No TV show data available.</div>;
    }
    switch (activeTab) {
      case 'episodes':
        return <TVShowEpisodes seasons={tvShow.seasons} episodes={episodes} selectedSeason={selectedSeason} onSeasonChange={setSelectedSeason} onPlayEpisode={handlePlayEpisode} onDownloadEpisode={(seasonNumber: number, episodeNumber: number) => {
            setSelectedSeasonNumber(seasonNumber);
            setSelectedEpisodeNumber(episodeNumber);
            setShowDownloadOverlay(true);
            triggerHaptic();
          }} />;
      case 'about':
        return <TVShowAbout tvShow={tvShow} />;
      case 'cast':
        return <TVShowCast cast={cast} />;
      case 'reviews':
        return <div className="mb-8"><h2 className="text-2xl font-bold text-white mb-6">User Reviews</h2><ReviewSection mediaId={parseInt(id!, 10)} mediaType="tv" /></div>;
      case 'downloads':
        return <div className="mb-8"><TVDownloadSection tvShowName={tvShow.name} seasons={tvShow.seasons} episodesBySeason={Object.fromEntries(tvShow.seasons.map((season: Season) => [season.season_number, (episodes || []).filter((ep: Episode) => ep.season_number === season.season_number)]))} /></div>;
      default:
        return null;
    }
  };

  // Main Render Logic
  if (isLoading) return renderLoadingState();
  if (error) return renderErrorState();
  if (!tvShow) return renderNotFoundState();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {renderToasts()}
      <div className="relative">
        {renderBackButton()}
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
      {renderDownloadOverlay()}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {renderTabsNavigation()}
        {renderTabContent()}
      </div>
      {recommendations.length > 0 && <ContentRow title="More Like This" media={recommendations} onItemClick={(mediaId: number) => navigate(`/tv/${mediaId}`)} />}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <h3 className="text-xl font-semibold text-white mb-4">Comments</h3>
        {commentoError ? <p className="text-red-600">{commentoError}</p> : <div id="commento" data-page-id={`tv-${tvShow.id}`}></div>}
      </div>
    </div>
  );
};

export default TVShowDetailsPage;
