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

// Type Definitions for Type Safety
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

// Helper Function: Generate unique ID for toasts
const generateToastId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

// Helper Function: Validate TV show data
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

// Helper Function: Validate episodes data
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

// Helper Function: Get latest episode with fallback
const getLatestEpisode = (seasons: Season[], episodes: Episode[]): Episode | null => {
  try {
    if (!seasons.length) {
      console.warn('No seasons available for latest episode calculation');
      return null;
    }
    if (!episodes.length) {
      console.warn('No episodes available; defaulting to Season 1, Episode 1');
      return { season_number: 1, episode_number: 1 } as Episode;
    }
    const latestSeason = seasons.reduce(
      (max: Season, season: Season) => (season.season_number > max.season_number ? season : max),
      seasons[0]
    );
    const latestEpisodes = episodes.filter((ep: Episode) => ep.season_number === latestSeason.season_number);
    const latestEpisode = latestEpisodes[latestEpisodes.length - 1];
    if (!latestEpisode) {
      console.warn('No episodes found for the latest season; defaulting to Season 1, Episode 1');
      return { season_number: 1, episode_number: 1 } as Episode;
    }
    return latestEpisode;
  } catch (err) {
    console.error('Error getting latest episode:', err);
    return null;
  }
};

// Main Component
const TVShowDetailsPage = () => {
  // Navigation and URL params
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { triggerHaptic } = useHaptic();
  const toastShownRef = useRef<Set<string>>(new Set()); // Track shown toasts
  const hasInitializedRef = useRef(false); // Prevent multiple initializations
  const [commentoError, setCommentoError] = useState<string | null>(null); // Track Commento loading errors

  // State Management
  const [activeTab, setActiveTab] = useState<TabType>('episodes');
  const [showDownloadOverlay, setShowDownloadOverlay] = useState(false);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState<number | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [expandedEpisodes, setExpandedEpisodes] = useState<number[]>([]);

  // Fetch TV show details using custom hook
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

  // Memoized validation of TV show and episodes
  const isTVShowValid = useMemo(() => validateTVShowData(tvShow), [tvShow]);
  const isEpisodesValid = useMemo(() => validateEpisodesData(episodes), [episodes]);

  // Add toast notification with deduplication
  const addToast = useCallback((message: string, isError: boolean) => {
    if (toastShownRef.current.has(message)) {
      console.log(`Skipped duplicate toast: ${message}`);
      return;
    }
    const toast: Toast = { message, isError, id: generateToastId() };
    setToasts((prev) => [...prev, toast]);
    toastShownRef.current.add(message);
    console.log(`Added toast: ${message}, isError: ${isError}, ID: ${toast.id}`);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      toastShownRef.current.delete(message);
      console.log(`Removed toast: ${message}, ID: ${toast.id}`);
    }, 3000);
  }, []);

  // Initialize Download Overlay
  useEffect(() => {
    if (!isTVShowValid || hasInitializedRef.current) {
      console.log('Skipping download overlay initialization: Invalid TV show or already initialized');
      return;
    }

    try {
      hasInitializedRef.current = true;
      if (!isEpisodesValid) {
        console.warn('No valid episodes; silently setting default Season 1, Episode 1');
        setSelectedSeasonNumber(1);
        setSelectedEpisodeNumber(1);
        return;
      }

      const lastWatched = getLastWatchedEpisode();
      if (lastWatched) {
        setSelectedSeasonNumber(lastWatched.season_number);
        setSelectedEpisodeNumber(lastWatched.episode_number);
        console.log(
          `Initialized download overlay with last watched - Season: ${lastWatched.season_number}, Episode: ${lastWatched.episode_number}`
        );
      } else {
        const latestEpisode = getLatestEpisode(tvShow.seasons, episodes);
        if (latestEpisode) {
          setSelectedSeasonNumber(latestEpisode.season_number);
          setSelectedEpisodeNumber(latestEpisode.episode_number);
          console.log(
            `Initialized download overlay with latest episode - Season: ${latestEpisode.season_number}, Episode: ${latestEpisode.episode_number}`
          );
        } else {
          console.warn('No valid episodes found; silently setting default Season 1, Episode 1');
          setSelectedSeasonNumber(1);
          setSelectedEpisodeNumber(1);
        }
      }
    } catch (err) {
      console.error('Error initializing download overlay:', err);
      addToast('Failed to initialize download options.', true);
    }
  }, [tvShow, episodes, getLastWatchedEpisode, isTVShowValid, isEpisodesValid, addToast]);

  // Initialize Commento with MutationObserver
  useEffect(() => {
    if (!tvShow?.id) {
      console.warn('No TV show ID for Commento initialization');
      setCommentoError('No TV show data available for comments.');
      return;
    }

    const pageId = `tv-${tvShow.id}`;
    console.log('Setting up Commento with pageId:', pageId);

    const initializeCommento = () => {
      const commentoDiv = document.getElementById('commento');
      if (commentoDiv) {
        commentoDiv.setAttribute('data-page-id', pageId);
        console.log(`Commento container found, set data-page-id: ${pageId}`);
        // Check if Commento widget is initialized
        setTimeout(() => {
          if (!window.commento) {
            console.error('Commento widget not initialized');
            setCommentoError('Failed to initialize comments. Please refresh the page or check your Commento configuration.');
          } else {
            console.log('Commento widget initialized successfully');
            setCommentoError(null);
            // Force Commento to reinitialize
            if (typeof window.commento.main === 'function') {
              window.commento.main();
              console.log('Commento reinitialized via window.commento.main()');
            }
          }
        }, 2000);
      } else {
        console.error('Commento container not found');
        setCommentoError('Failed to load comments: Comment container not found. Please refresh the page.');
      }
    };

    // MutationObserver to detect when #commento is added to DOM
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length) {
          const commentoDiv = document.getElementById('commento');
          if (commentoDiv) {
            console.log('Commento container detected via MutationObserver');
            initializeCommento();
            observer.disconnect(); // Stop observing once found
          }
        }
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Initial check in case container is already present
    if (document.getElementById('commento')) {
      console.log('Commento container already present on mount');
      initializeCommento();
      observer.disconnect();
    }

    // Fallback: Retry after 5 seconds if not found
    const retryTimeout = setTimeout(() => {
      if (!document.getElementById('commento')) {
        console.error('Commento container not found after 5 seconds');
        setCommentoError('Failed to load comments: Comment container not found after retry. Please refresh the page.');
      }
    }, 5000);

    return () => {
      observer.disconnect();
      clearTimeout(retryTimeout);
      console.log('Cleaned up Commento observer and timeout');
    };
  }, [tvShow?.id]);

  // Handle Share functionality
  const handleShare = useCallback(async () => {
    if (!isTVShowValid) {
      console.error('No valid TV show data for sharing');
      addToast('No TV show data available.', true);
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
        triggerHaptic();
        console.log(`Shared TV show ${tvShow.id} via Web Share API: ${shareUrl}`);
        addToast('Shared successfully!', false);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        triggerHaptic();
        addToast('Link copied to clipboard!', false);
        console.log(`Copied TV show ${tvShow.id} URL to clipboard: ${shareUrl}`);
      }
    } catch (error) {
      console.error('Error sharing TV show:', error);
      addToast('Failed to share. Please try again.', true);
    }
  }, [tvShow, isTVShowValid, triggerHaptic, addToast]);

  // Handle Download Latest Episode
  const handleDownloadLatestEpisode = useCallback(() => {
    if (!isTVShowValid) {
      console.warn('No valid TV show data for download');
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
        console.log(
          `Opened download overlay for latest episode - TV show ID: ${tvShow.id}, Season: ${latestEpisode.season_number}, Episode: ${latestEpisode.episode_number}`
        );
      } else {
        console.warn('No latest episode found for download; setting default Season 1, Episode 1');
        setSelectedSeasonNumber(1);
        setSelectedEpisodeNumber(1);
        setShowDownloadOverlay(true);
        triggerHaptic();
      }
    } catch (err) {
      console.error('Error opening download overlay for latest episode:', err);
      addToast('Failed to open download overlay.', true);
    }
  }, [tvShow, episodes, isTVShowValid, triggerHaptic, addToast]);

  // Handle Download for specific episode
  const handleOpenDownload = useCallback(() => {
    if (!isTVShowValid || !selectedSeasonNumber || !selectedEpisodeNumber) {
      console.warn('Invalid TV show, season, or episode for download');
      addToast('Please select a valid season and episode.', true);
      return;
    }

    setShowDownloadOverlay(true);
    triggerHaptic();
    console.log(
      `Opened download overlay for TV show ID: ${tvShow.id}, Season: ${selectedSeasonNumber}, Episode: ${selectedEpisodeNumber}`
    );
  }, [tvShow, selectedSeasonNumber, selectedEpisodeNumber, isTVShowValid, triggerHaptic, addToast]);

  // Handle Close Download Overlay
  const handleCloseDownload = useCallback(() => {
    setShowDownloadOverlay(false);
    setSelectedSeasonNumber(null);
    setSelectedEpisodeNumber(null);
    triggerHaptic();
    console.log('Closed download overlay and reset season/episode');
  }, [triggerHaptic]);

  // Handle Play Episode in Download Overlay
  const handlePlayEpisodeInOverlay = useCallback(() => {
    if (!isTVShowValid || !selectedSeasonNumber || !selectedEpisodeNumber) {
      console.warn('Invalid TV show, season, or episode for playback');
      addToast('Please select a valid season and episode.', true);
      return;
    }

    handlePlayEpisode(selectedSeasonNumber, selectedEpisodeNumber);
    console.log(
      `Playing TV show ${tvShow.id}, Season: ${selectedSeasonNumber}, Episode: ${selectedEpisodeNumber}`
    );
  }, [tvShow, selectedSeasonNumber, selectedEpisodeNumber, isTVShowValid, handlePlayEpisode, addToast]);

  // TV Show Header Component (Inline)
  const TVShowHeader = ({
    tvShow,
    isFavorite,
    isInWatchlist,
    onToggleFavorite,
    onToggleWatchlist,
    onPlayEpisode,
    lastWatchedEpisode,
    onShare,
    onDownload,
    onDownloadLatestEpisode,
  }: TVShowHeaderProps) => {
    const handlePlayLastWatched = useCallback(() => {
      try {
        if (lastWatchedEpisode) {
          onPlayEpisode(lastWatchedEpisode.season_number, lastWatchedEpisode.episode_number);
          console.log(
            `Playing last watched episode - Season: ${lastWatchedEpisode.season_number}, Episode: ${lastWatchedEpisode.episode_number}`
          );
        } else if (tvShow.seasons.length > 0) {
          onPlayEpisode(tvShow.seasons[0].season_number, 1);
          console.log(`Playing first episode - Season: ${tvShow.seasons[0].season_number}, Episode: 1`);
        } else {
          console.warn('No seasons available for playback');
          addToast('No episodes available to play.', true);
        }
      } catch (err) {
        console.error('Error playing episode:', err);
        addToast('Failed to play episode.', true);
      }
    }, [lastWatchedEpisode, onPlayEpisode, tvShow.seasons, addToast]);

    return (
      <div className="relative w-full h-[70vh]">
        {/* Backdrop Image */}
        <img
          src={getImageUrl(tvShow.backdrop_path, 'original')}
          alt={tvShow.name || 'TV Show backdrop'}
          className="w-full h-full object-cover"
          onError={() => {
            console.error('Failed to load backdrop image');
            addToast('Failed to load backdrop image.', true);
          }}
        />
        <div className="absolute inset-0 details-gradient" />
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 lg:p-16">
          <div className="flex flex-col md:flex-row items-start gap-6 max-w-6xl mx-auto">
            {/* Poster Image (Desktop Only) */}
            <div className="hidden md:block flex-shrink-0 w-48 xl:w-64 rounded-lg overflow-hidden shadow-lg">
              <img
                src={getImageUrl(tvShow.poster_path, 'w342')}
                alt={tvShow.name || 'TV Show poster'}
                className="w-full h-auto"
                onError={() => {
                  console.error('Failed to load poster image');
                  addToast('Failed to load poster image.', true);
                }}
              />
            </div>
            <div className="flex-1">
              {/* Title */}
              <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 text-balance">
                {tvShow.name}
              </h1>
              {/* Tagline */}
              {tvShow.tagline && (
                <p className="text-white/70 mb-4 italic text-lg">{tvShow.tagline}</p>
              )}
              {/* Metadata */}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                {tvShow.first_air_date && (
                  <div className="flex items-center text-white/80">
                    <span>{new Date(tvShow.first_air_date).toLocaleDateString('en-US', { year: 'numeric' })}</span>
                  </div>
                )}
                {tvShow.vote_average > 0 && (
                  <div className="flex items-center text-amber-400">
                    <span>{tvShow.vote_average.toFixed(1)}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {tvShow.genres.map((genre) => (
                    <span
                      key={genre.id}
                      className="px-2 py-1 rounded bg-white/10 text-white/80 text-xs"
                    >
                      {genre.name}
                    </span>
                  ))}
                </div>
              </div>
              {/* Overview */}
              <p className="text-white/80 mb-6">{tvShow.overview}</p>
              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handlePlayLastWatched}
                  className="bg-accent hover:bg-accent/80 text-white flex items-center"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Play {lastWatchedEpisode ? `S${lastWatchedEpisode.season_number} E${lastWatchedEpisode.episode_number}` : 'First Episode'}
                </Button>
                <Button
                  onClick={onDownloadLatestEpisode}
                  className="bg-accent hover:bg-accent/80 text-white flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Latest
                </Button>
                <Button
                  onClick={onShare}
                  className="bg-accent hover:bg-accent/80 text-white flex items-center"
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  Share
                </Button>
                <Button
                  onClick={onToggleFavorite}
                  variant="outline"
                  className={`border-white/20 ${isFavorite ? 'bg-accent text-white' : 'bg-black/50 text-white hover:bg-black/70'}`}
                >
                  <Heart className={`h-4 w-4 mr-2 ${isFavorite ? 'fill-current' : ''}`} />
                  {isFavorite ? 'In Favorites' : 'Add to Favorites'}
                </Button>
                <Button
                  onClick={onToggleWatchlist}
                  variant="outline"
                  className={`border-white/20 ${isInWatchlist ? 'bg-accent text-white' : 'bg-black/50 text-white hover:bg-black/70'}`}
                >
                  <Bookmark className={`h-4 w-4 mr-2 ${isInWatchlist ? 'fill-current' : ''}`} />
                  {isInWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Episodes Component (Inline)
  const TVShowEpisodes = ({
    seasons,
    episodes,
    selectedSeason,
    onSeasonChange,
    onPlayEpisode,
    onDownloadEpisode,
  }: EpisodeProps) => {
    const toggleEpisode = useCallback((episodeNumber: number) => {
      try {
        triggerHaptic();
        setExpandedEpisodes((prev) =>
          prev.includes(episodeNumber)
            ? prev.filter((num) => num !== episodeNumber)
            : [...prev, episodeNumber]
        );
        console.log(`Toggled episode ${episodeNumber} description`);
      } catch (err) {
        console.error('Error toggling episode description:', err);
        addToast('Failed to toggle episode description.', true);
      }
    }, [addToast, triggerHaptic]);

    if (!episodes || episodes.length === 0) {
      console.warn('No episodes available for rendering');
      return (
        <div className="text-white text-center">
          No episodes available for this season.
        </div>
      );
    }

    return (
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">Seasons & Episodes</h2>
        {/* Season Selector */}
        <div className="mb-4">
          <select
            value={selectedSeason}
            onChange={(e) => {
              try {
                const seasonNum = parseInt(e.target.value, 10);
                onSeasonChange(seasonNum);
                console.log(`Selected season: ${seasonNum}`);
              } catch (err) {
                console.error('Error selecting season:', err);
                addToast('Failed to select season.', true);
              }
            }}
            className="bg-background border border-white/20 text-white rounded px-3 py-2"
          >
            {seasons.map((season: Season) => (
              <option key={season.season_number} value={season.season_number}>
                Season {season.season_number}
              </option>
            ))}
          </select>
        </div>
        {/* Episode List */}
        <div className="space-y-4">
          {episodes
            .filter((ep: Episode) => ep.season_number === selectedSeason)
            .map((episode: Episode) => (
              <div
                key={episode.episode_number}
                className="bg-background border border-white/10 rounded-lg p-4"
              >
                <div className="flex items-center gap-4">
                  {/* Episode Thumbnail */}
                  {episode.still_path ? (
                    <img
                      src={getImageUrl(episode.still_path, 'w300')}
                      alt={`Episode ${episode.episode_number}`}
                      className="w-32 h-18 object-cover rounded"
                      onError={() => {
                        console.error(`Failed to load image for Episode ${episode.episode_number}`);
                        addToast('Failed to load episode image.', true);
                      }}
                    />
                  ) : (
                    <div className="w-32 h-18 bg-white/10 rounded flex items-center justify-center">
                      <span className="text-white/70 text-xs">No Image</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <h3 className="text-white font-medium">
                        {episode.episode_number}. {episode.name}
                      </h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleEpisode(episode.episode_number)}
                        className="text-white/70 hover:text-white"
                      >
                        {expandedEpisodes.includes(episode.episode_number) ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    <p className="text-white/70 text-sm">
                      {episode.air_date && new Date(episode.air_date).toLocaleDateString()}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <Button
                        onClick={() => {
                          try {
                            onPlayEpisode(episode.season_number, episode.episode_number);
                            triggerHaptic();
                            console.log(
                              `Playing episode S${episode.season_number}E${episode.episode_number}`
                            );
                          } catch (err) {
                            console.error('Error playing episode:', err);
                            addToast('Failed to play episode.', true);
                          }
                        }}
                        className="bg-accent hover:bg-accent/80 text-white flex items-center"
                      >
                        <Play className="h-4 w-4 mr-2" />
                        Play Episode
                      </Button>
                      <Button
                        onClick={() => {
                          try {
                            onDownloadEpisode(episode.season_number, episode.episode_number);
                            triggerHaptic();
                            console.log(
                              `Downloading episode S${episode.season_number}E${episode.episode_number}`
                            );
                          } catch (err) {
                            console.error('Error initiating download:', err);
                            addToast('Failed to initiate download.', true);
                          }
                        }}
                        className="bg-accent hover:bg-accent/80 text-white flex items-center"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Download
                      </Button>
                    </div>
                    {expandedEpisodes.includes(episode.episode_number) && (
                      <p className="text-white/80 mt-2">
                        {episode.overview || 'No description available.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    );
  };

  // About Component (Inline)
  const TVShowAbout = ({ tvShow }: AboutProps) => {
    return (
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">About {tvShow.name}</h2>
        <p className="text-white/80 mb-4">{tvShow.overview}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Details</h3>
            <p className="text-white/80">
              <strong>First Air Date:</strong>{' '}
              {tvShow.first_air_date
                ? new Date(tvShow.first_air_date).toLocaleDateString()
                : 'N/A'}
            </p>
            <p className="text-white/80">
              <strong>Status:</strong> {tvShow.status || 'N/A'}
            </p>
            <p className="text-white/80">
              <strong>Number of Seasons:</strong> {tvShow.number_of_seasons || 'N/A'}
            </p>
            <p className="text-white/80">
              <strong>Number of Episodes:</strong> {tvShow.number_of_episodes || 'N/A'}
            </p>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white mb-2">Genres</h3>
            <div className="flex flex-wrap gap-2">
              {tvShow.genres.map((genre) => (
                <span
                  key={genre.id}
                  className="px-2 py-1 rounded bg-white/10 text-white/80 text-xs"
                >
                  {genre.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Cast Component (Inline)
  const TVShowCast = ({ cast }: CastProps) => {
    return (
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">Cast</h2>
        {cast.length === 0 ? (
          <p className="text-white/80">No cast information available.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {cast.map((actor) => (
              <div key={actor.id} className="text-white/80">
                <p className="font-medium">{actor.name}</p>
                <p className="text-sm">as {actor.character || 'N/A'}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Download Section Component (Inline)
  const TVDownloadSection = ({ tvShowName, seasons, episodesBySeason }: DownloadSectionProps) => {
    const [selectedDownloadSeason, setSelectedDownloadSeason] = useState<number>(seasons[0]?.season_number || 1);

    return (
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-6">Download Episodes for {tvShowName}</h2>
        {/* Season Selector */}
        <div className="mb-4">
          <select
            value={selectedDownloadSeason}
            onChange={(e) => {
              try {
                const seasonNum = parseInt(e.target.value, 10);
                setSelectedDownloadSeason(seasonNum);
                console.log(`Selected download season: ${seasonNum}`);
              } catch (err) {
                console.error('Error selecting download season:', err);
                addToast('Failed to select season.', true);
              }
            }}
            className="bg-background border border-white/20 text-white rounded px-3 py-2"
          >
            {seasons.map((season: Season) => (
              <option key={season.season_number} value={season.season_number}>
                Season {season.season_number}
              </option>
            ))}
          </select>
        </div>
        {/* Episode List for Download */}
        <div className="space-y-4">
          {(episodesBySeason[selectedDownloadSeason] || []).length === 0 ? (
            <p className="text-white/80">No episodes available for this season.</p>
          ) : (
            episodesBySeason[selectedDownloadSeason].map((episode: Episode) => (
              <div
                key={episode.episode_number}
                className="bg-background border border-white/10 rounded-lg p-4 flex justify-between items-center"
              >
                <div>
                  <p className="text-white font-medium">
                    Episode {episode.episode_number}: {episode.name}
                  </p>
                  <p className="text-white/70 text-sm">
                    {episode.air_date ? new Date(episode.air_date).toLocaleDateString() : 'N/A'}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    try {
                      setSelectedSeasonNumber(episode.season_number);
                      setSelectedEpisodeNumber(episode.episode_number);
                      setShowDownloadOverlay(true);
                      triggerHaptic();
                      console.log(
                        `Opened download overlay for S${episode.season_number}E${episode.episode_number}`
                      );
                    } catch (err) {
                      console.error('Error initiating download:', err);
                      addToast('Failed to initiate download.', true);
                    }
                  }}
                  className="bg-accent hover:bg-accent/80 text-white flex items-center"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  // Helper Function: Render loading state
  const renderLoadingState = () => (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="animate-pulse-slow text-white font-medium">Loading TV show details...</div>
    </div>
  );

  // Helper Function: Render error state
  const renderErrorState = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <h1 className="text-2xl text-white mb-4">Error: {error}</h1>
      <Button
        onClick={() => {
          navigate('/');
          console.log('Navigated to home due to error');
        }}
        variant="outline"
      >
        Return to Home
      </Button>
    </div>
  );

  // Helper Function: Render not found state
  const renderNotFoundState = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background">
      <h1 className="text-2xl text-white mb-4">TV Show not found</h1>
      <Button
        onClick={() => {
          navigate('/');
          console.log('Navigated to home: TV show not found');
        }}
        variant="outline"
      >
        Return to Home
      </Button>
    </div>
  );

  // Helper Function: Render toast notifications
  const renderToasts = () => (
    <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-[1000] space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`px-6 py-3 rounded-lg text-white text-sm font-medium shadow-lg transition-opacity duration-300 ${
            toast.isError ? 'bg-red-600 border-red-400' : 'bg-background border-white/20'
          } animate-fade-in`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );

  // Helper Function: Render back button
  const renderBackButton = () => (
    <button
      onClick={() => {
        navigate(-1);
        triggerHaptic();
        console.log('Navigated back from TVShowDetailsPage');
      }}
      className="absolute top-20 left-6 z-10 text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors"
      aria-label="Go back"
    >
      <ArrowLeft className="h-5 w-5" />
    </button>
  );

  // Helper Function: Render trailer background
  const renderTrailerBackground = () => {
    if (isMobile || !trailerKey) return null;
    return (
      <div className="absolute inset-0 bg-black/60">
        <iframe
          className="w-full h-full"
          src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${trailerKey}`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title="TV Show Trailer"
          onLoad={() => console.log('Trailer iframe loaded')}
          onError={() => {
            console.error('Failed to load trailer iframe');
            addToast('Failed to load trailer.', true);
          }}
        />
      </div>
    );
  };

  // Helper Function: Render download overlay
  const renderDownloadOverlay = () => {
    if (!showDownloadOverlay || !isTVShowValid || !selectedSeasonNumber || !selectedEpisodeNumber) {
      console.log('Download overlay not rendered: Invalid state', {
        showDownloadOverlay,
        isTVShowValid,
        selectedSeasonNumber,
        selectedEpisodeNumber,
      });
      return null;
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="relative bg-background rounded-lg shadow-xl w-full max-w-4xl p-6">
          {/* Close Button */}
          <button
            onClick={handleCloseDownload}
            className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
            aria-label="Close download overlay"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Security Message */}
          <p className="text-white text-center mb-4">
            Please solve this due to security requirements
          </p>

          {/* Season and Episode Selectors */}
          <div className="flex flex-wrap gap-4 mb-4">
            <select
              value={selectedSeasonNumber}
              onChange={(e) => {
                try {
                  const seasonNum = parseInt(e.target.value, 10);
                  setSelectedSeasonNumber(seasonNum);
                  const seasonEpisodes = episodes.filter((ep: Episode) => ep.season_number === seasonNum);
                  const firstEpisode = seasonEpisodes[0]?.episode_number || 1;
                  setSelectedEpisodeNumber(firstEpisode);
                  console.log(`Selected Season: ${seasonNum}, Episode: ${firstEpisode}`);
                } catch (err) {
                  console.error('Error selecting season:', err);
                  addToast('Failed to select season.', true);
                }
              }}
              className="bg-background border border-white/20 text-white rounded px-3 py-2"
            >
              {tvShow.seasons.map((season: Season) => (
                <option key={season.season_number} value={season.season_number}>
                  Season {season.season_number}
                </option>
              ))}
            </select>
            <select
              value={selectedEpisodeNumber}
              onChange={(e) => {
                try {
                  const epNum = parseInt(e.target.value, 10);
                  setSelectedEpisodeNumber(epNum);
                  console.log(`Selected Episode: ${epNum}`);
                } catch (err) {
                  console.error('Error selecting episode:', err);
                  addToast('Failed to select episode.', true);
                }
              }}
              className="bg-background border border-white/20 text-white rounded px-3 py-2"
            >
              {episodes
                .filter((ep: Episode) => ep.season_number === selectedSeasonNumber)
                .map((ep: Episode) => (
                  <option key={ep.episode_number} value={ep.episode_number}>
                    Episode {ep.episode_number}
                  </option>
                ))}
            </select>
            <div className="flex gap-2">
              <Button
                onClick={handlePlayEpisodeInOverlay}
                className="bg-accent hover:bg-accent/80 text-white flex items-center"
              >
                <Play className="h-4 w-4 mr-2" />
                Play Episode
              </Button>
              <Button
                onClick={handleOpenDownload}
                className="bg-accent hover:bg-accent/80 text-white flex items-center"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
          </div>

          {/* Download Iframe */}
          <iframe
            className="w-full h-[60vh] rounded-lg border-2 border-white/10"
            src={`https://dl.vidsrc.vip/tv/${tvShow.id}/${selectedSeasonNumber}/${selectedEpisodeNumber}`}
            allowFullScreen
            title={`Download TV Show - Season ${selectedSeasonNumber}, Episode ${selectedEpisodeNumber}`}
            onLoad={() =>
              console.log(
                `Download iframe loaded for TV show ID: ${tvShow.id}, Season: ${selectedSeasonNumber}, Episode: ${selectedEpisodeNumber}`
              )
            }
            onError={() => {
              console.error('Failed to load download iframe');
              addToast('Failed to load download content.', true);
            }}
          />
        </div>
      </div>
    );
  };

  // Helper Function: Render tabs navigation
  const renderTabsNavigation = () => (
    <div className="flex border-b border-white/10 mb-6 overflow-x-auto pb-1 hide-scrollbar">
      {[
        { id: 'episodes', label: 'Episodes' },
        { id: 'about', label: 'About' },
        { id: 'cast', label: 'Cast' },
        { id: 'reviews', label: 'Reviews' },
        { id: 'downloads', label: 'Downloads' },
      ].map((tab) => (
        <button
          key={tab.id}
          className={`py-2 px-4 font-medium whitespace-nowrap ${
            activeTab === tab.id
              ? 'text-white border-b-2 border-accent'
              : 'text-white/60 hover:text-white'
          }`}
          onClick={() => {
            triggerHaptic();
            setActiveTab(tab.id as TabType);
            console.log(`Switched to ${tab.label} tab`);
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  // Helper Function: Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'episodes':
        return (
          <TVShowEpisodes
            seasons={tvShow.seasons}
            episodes={episodes}
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
            onPlayEpisode={handlePlayEpisode}
            onDownloadEpisode={(seasonNumber: number, episodeNumber: number) => {
              setSelectedSeasonNumber(seasonNumber);
              setSelectedEpisodeNumber(episodeNumber);
              setShowDownloadOverlay(true);
              triggerHaptic();
              console.log(
                `Opened download overlay for TV show ID: ${tvShow.id}, Season: ${seasonNumber}, Episode: ${episodeNumber}`
              );
            }}
          />
        );
      case 'about':
        return <TVShowAbout tvShow={tvShow} />;
      case 'cast':
        return <TVShowCast cast={cast} />;
      case 'reviews':
        return (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">User Reviews</h2>
            <ReviewSection mediaId={parseInt(id!, 10)} mediaType="tv" />
          </div>
        );
      case 'downloads':
        return (
          <div className="mb-8">
            <TVDownloadSection
              tvShowName={tvShow.name}
              seasons={tvShow.seasons}
              episodesBySeason={Object.fromEntries(
                tvShow.seasons.map((season: Season) => [
                  season.season_number,
                  (episodes || []).filter((ep: Episode) => ep.season_number === season.season_number),
                ])
              )}
            />
          </div>
        );
      default:
        return null;
    }
  };

  // Main Render
  if (isLoading) return renderLoadingState();
  if (error) return renderErrorState();
  if (!tvShow) return renderNotFoundState();

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <Navbar />

      {/* Toast Notifications */}
      {renderToasts()}

      {/* Header Section */}
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

      {/* Download Overlay */}
      {renderDownloadOverlay()}

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {renderTabsNavigation()}
        {renderTabContent()}
      </div>

      {/* Recommendations */}
      {recommendations.length > 0 && (
        <ContentRow
          title="More Like This"
          media={recommendations}
          onItemClick={(mediaId: number) => {
            try {
              navigate(`/tv/${mediaId}`);
              console.log(`Navigated to TV show ${mediaId}`);
            } catch (err) {
              console.error('Error navigating to recommendation:', err);
              addToast('Failed to load recommendation.', true);
            }
          }}
        />
      )}

      {/* Commento Section */}
      {tvShow && (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h3 className="text-xl font-semibold text-white mb-4">Comments</h3>
          {commentoError ? (
            <p className="text-red-600">
              {commentoError} Please ensure your domain is registered in Commento and try refreshing the page. Contact support if the issue persists.
            </p>
          ) : (
            <div id="commento" data-page-id={`tv-${tvShow.id}`}></div>
          )}
        </div>
      )}
    </div>
  );
};

export default TVShowDetailsPage;
