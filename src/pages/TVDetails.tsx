import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Download, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ContentRow from '@/components/ContentRow';
import Navbar from '@/components/Navbar';
import ReviewSection from '@/components/ReviewSection';
import TVShowHeader from '@/components/tv/TVShowHeader';
import TVShowEpisodes from '@/components/tv/TVShowEpisodes';
import TVShowAbout from '@/components/tv/TVShowAbout';
import TVShowCast from '@/components/tv/TVShowCast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTVDetails } from '@/hooks/use-tv-details';
import { DownloadSection } from '@/components/DownloadSection';
import { TVDownloadSection } from '@/components/tv/TVDownloadSection';
import { useAuth } from '@/hooks';
import { useHaptic } from '@/hooks/useHaptic';

// Type Definitions for Tabs
type TabType = 'episodes' | 'about' | 'cast' | 'reviews' | 'downloads';

const TVDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { triggerHaptic } = useHaptic();
  const [activeTab, setActiveTab] = useState<TabType>('episodes');
  const [showDownloadOverlay, setShowDownloadOverlay] = useState(false);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(null);
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState<number | null>(null);
  const [showToast, setShowToast] = useState<{ message: string; isError: boolean } | null>(null);

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

  // Initialize Season and Episode for Download Overlay
  useEffect(() => {
    if (tvShow && episodes) {
      const lastWatched = getLastWatchedEpisode();
      if (lastWatched) {
        setSelectedSeasonNumber(lastWatched.season_number);
        setSelectedEpisodeNumber(lastWatched.episode_number);
      } else {
        const latestSeason = tvShow.seasons.reduce((max, season) => 
          season.season_number > max.season_number ? season : max, tvShow.seasons[0]
        );
        const latestEpisodes = episodes.filter(ep => ep.season_number === latestSeason.season_number);
        const latestEpisode = latestEpisodes[latestEpisodes.length - 1];
        setSelectedSeasonNumber(latestSeason.season_number);
        setSelectedEpisodeNumber(latestEpisode?.episode_number || 1);
      }
      console.log(`Initialized download overlay - Season: ${selectedSeasonNumber}, Episode: ${selectedEpisodeNumber}`);
    }
  }, [tvShow, episodes, getLastWatchedEpisode]);

  // Initialize Commento
  useEffect(() => {
    if (!tvShow?.id) return;

    console.log('Initializing Commento for TV show ID:', tvShow.id);
    const pageId = `tv-${tvShow.id}`;

    const script = document.createElement('script');
    script.src = 'https://cdn.commento.io/js/commento.js';
    script.defer = true;
    script.async = true;
    script.onload = () => {
      console.log('Commento script loaded successfully');
      const commentoDiv = document.getElementById('commento');
      if (commentoDiv) {
        commentoDiv.setAttribute('data-page-id', pageId);
        console.log(`Commento initialized with data-page-id: ${pageId}`);
      } else {
        console.error('Commento div not found');
        setShowToast({ message: 'Failed to initialize comments. Please refresh the page.', isError: true });
        setTimeout(() => setShowToast(null), 3000);
      }
    };
    script.onerror = () => {
      console.error('Failed to load Commento script');
      setShowToast({ message: 'Failed to load comments system. Check your network and try again.', isError: true });
      setTimeout(() => setShowToast(null), 3000);
    };

    const target = document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0];
    target.appendChild(script);
    console.log('Commento script appended to document');

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
        console.log('Commento script removed');
      }
    };
  }, [tvShow?.id]);

  // Handle Share
  const handleShare = async () => {
    if (!tvShow) return;

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
      } else {
        await navigator.clipboard.writeText(shareUrl);
        triggerHaptic();
        setShowToast({ message: 'Link copied to clipboard!', isError: false });
        console.log(`Copied TV show ${tvShow.id} URL to clipboard: ${shareUrl}`);
        setTimeout(() => setShowToast(null), 3000);
      }
    } catch (error) {
      console.error('Error sharing TV show:', error);
      setShowToast({ message: 'Failed to share. Please try again.', isError: true });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  // Handle Watch Latest Episode
  const handleWatchLatestEpisode = () => {
    if (tvShow && episodes) {
      const latestSeason = tvShow.seasons.reduce((max, season) => 
        season.season_number > max.season_number ? season : max, tvShow.seasons[0]
      );
      const latestEpisodes = episodes.filter(ep => ep.season_number === latestSeason.season_number);
      const latestEpisode = latestEpisodes[latestEpisodes.length - 1];
      if (latestEpisode) {
        handlePlayEpisode(latestSeason.season_number, latestEpisode.episode_number);
        console.log(`Playing latest episode - TV show ID: ${tvShow.id}, Season: ${latestSeason.season_number}, Episode: ${latestEpisode.episode_number}`);
      }
    }
  };

  // Handle Download Latest Episode
  const handleDownloadLatestEpisode = () => {
    if (tvShow && episodes) {
      const latestSeason = tvShow.seasons.reduce((max, season) => 
        season.season_number > max.season_number ? season : max, tvShow.seasons[0]
      );
      const latestEpisodes = episodes.filter(ep => ep.season_number === latestSeason.season_number);
      const latestEpisode = latestEpisodes[latestEpisodes.length - 1];
      setSelectedSeasonNumber(latestSeason.season_number);
      setSelectedEpisodeNumber(latestEpisode?.episode_number || 1);
      setShowDownloadOverlay(true);
      triggerHaptic();
      console.log(`Opened download overlay for latest episode - TV show ID: ${tvShow.id}, Season: ${latestSeason.season_number}, Episode: ${latestEpisode?.episode_number || 1}`);
    }
  };

  // Handle Download
  const handleOpenDownload = () => {
    if (tvShow && selectedSeasonNumber && selectedEpisodeNumber) {
      setShowDownloadOverlay(true);
      triggerHaptic();
      console.log(`Opened download overlay for TV show ID: ${tvShow.id}, Season: ${selectedSeasonNumber}, Episode: ${selectedEpisodeNumber}`);
    }
  };

  // Handle Close Overlay
  const handleCloseDownload = () => {
    setShowDownloadOverlay(false);
    triggerHaptic();
    console.log('Closed download overlay');
  };

  // Handle Play Episode in Overlay
  const handlePlayEpisodeInOverlay = () => {
    if (tvShow && selectedSeasonNumber && selectedEpisodeNumber) {
      handlePlayEpisode(selectedSeasonNumber, selectedEpisodeNumber);
      console.log(`Playing TV show ${tvShow.id}, Season: ${selectedSeasonNumber}, Episode: ${selectedEpisodeNumber}`);
    }
  };

  // Render Loading State
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse-slow text-white font-medium">Loading...</div>
      </div>
    );
  }

  // Render Error State
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <h1 className="text-2xl text-white mb-4">{error}</h1>
        <Button onClick={() => navigate('/')} variant="outline">
          Return to Home
        </Button>
      </div>
    );
  }

  // Render Not Found State
  if (!tvShow) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <h1 className="text-2xl text-white mb-4">TV Show not found</h1>
        <Button onClick={() => navigate('/')} variant="outline">
          Return to Home
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Toast Notification */}
      {showToast && (
        <div
          className={`fixed top-5 left-1/2 transform -translate-x-1/2 z-[1000] px-6 py-3 rounded-lg text-white text-sm font-medium shadow-lg transition-opacity duration-300 ${
            showToast.isError ? 'bg-red-600 border-red-400' : 'bg-background border-white/20'
          } animate-fade-in`}
        >
          {showToast.message}
        </div>
      )}

      <div className="relative">
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 z-10 text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {!isMobile && trailerKey && (
          <div className="absolute inset-0 bg-black/60">
            <iframe
              className="w-full h-full"
              src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${trailerKey}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

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
          onWatchLatestEpisode={handleWatchLatestEpisode}
          onDownloadLatestEpisode={handleDownloadLatestEpisode}
        />
      </div>

      {/* Download Overlay */}
      {showDownloadOverlay && tvShow && selectedSeasonNumber && selectedEpisodeNumber && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="relative bg-background rounded-lg shadow-xl w-full max-w-4xl p-6">
            <button
              onClick={handleCloseDownload}
              className="absolute top-4 right-4 text-white p-2 rounded-full bg-black/50 hover:bg-black/70 transition-colors"
              aria-label="Close download overlay"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <p className="text-white text-center mb-4">
              Please solve this due to security requirements
            </p>

            <div className="flex flex-wrap gap-4 mb-4">
              <select
                value={selectedSeasonNumber}
                onChange={(e) => {
                  const seasonNum = parseInt(e.target.value, 10);
                  setSelectedSeasonNumber(seasonNum);
                  const seasonEpisodes = episodes.filter(ep => ep.season_number === seasonNum);
                  setSelectedEpisodeNumber(seasonEpisodes[0]?.episode_number || 1);
                  console.log(`Selected Season: ${seasonNum}, Episode: ${seasonEpisodes[0]?.episode_number || 1}`);
                }}
                className="bg-background border border-white/20 text-white rounded px-3 py-2"
              >
                {tvShow.seasons.map(season => (
                  <option key={season.season_number} value={season.season_number}>
                    Season {season.season_number}
                  </option>
                ))}
              </select>
              <select
                value={selectedEpisodeNumber}
                onChange={(e) => {
                  const epNum = parseInt(e.target.value, 10);
                  setSelectedEpisodeNumber(epNum);
                  console.log(`Selected Episode: ${epNum}`);
                }}
                className="bg-background border border-white/20 text-white rounded px-3 py-2"
              >
                {episodes
                  .filter(ep => ep.season_number === selectedSeasonNumber)
                  .map(ep => (
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

            <iframe
              className="w-full h-[60vh] rounded-lg border-2 border-white/10"
              src={`https://dl.vidsrc.vip/tv/${tvShow.id}/${selectedSeasonNumber}/${selectedEpisodeNumber}`}
              allowFullScreen
              title={`Download TV Show - Season ${selectedSeasonNumber}, Episode ${selectedEpisodeNumber}`}
              onLoad={() => console.log(`Download iframe loaded for TV show ID: ${tvShow.id}, Season: ${selectedSeasonNumber}, Episode: ${selectedEpisodeNumber}`)}
              onError={() => {
                console.error('Failed to load download iframe');
                setShowToast({ message: 'Failed to load download content. Please try again.', isError: true });
                setTimeout(() => setShowToast(null), 3000);
              }}
            />
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex border-b border-white/10 mb-6 overflow-x-auto pb-1 hide-scrollbar">
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${
              activeTab === 'episodes'
                ? 'text-white border-b-2 border-accent'
                : 'text-white/60 hover:text-white'
            }`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('episodes');
              console.log('Switched to Episodes tab');
            }}
          >
            Episodes
          </button>
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${
              activeTab === 'about' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'
            }`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('about');
              console.log('Switched to About tab');
            }}
          >
            About
          </button>
          <button
            className={activeTab === 'cast' ? 'text-white border-b-2 border-accent py-2 px-4 font-medium whitespace-nowrap' : 'text-white/60 hover:text-white py-2 px-4 font-medium whitespace-nowrap'}
            onClick={() => {
              triggerHaptic();
              setActiveTab('cast');
              console.log('Switched to Cast tab');
            }}
          >
            Cast
          </button>
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${
              activeTab === 'reviews' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'
            }`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('reviews');
              console.log('Switched to Reviews tab');
            }}
          >
            Reviews
          </button>
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${
              activeTab === 'downloads' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'
            }`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('downloads');
              console.log('Switched to Downloads tab');
            }}
            style={{ display: user ? undefined : 'none' }}
          >
            Downloads
          </button>
        </div>

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
              triggerHaptic();
              console.log(`Opened download overlay for TV show ID: ${tvShow.id}, Season: ${seasonNumber}, Episode: ${episodeNumber}`);
            }}
          />
        )}

        {activeTab === 'about' && <TVShowAbout tvShow={tvShow} />}

        {activeTab === 'cast' && <TVShowCast cast={cast} />}

        {activeTab === 'reviews' && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">User Reviews</h2>
            <ReviewSection mediaId={parseInt(id!, 10)} mediaType="tv" />
          </div>
        )}

        {activeTab === 'downloads' && (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Download Episodes</h2>
            <TVDownloadSection
              tvShowName={tvShow.name}
              seasons={tvShow.seasons}
              episodesBySeason={Object.fromEntries(
                tvShow.seasons.map((season) => [
                  season.season_number,
                  (episodes || []).filter((ep) => ep.season_number === season.season_number),
                ])
              )}
            />
          </div>
        )}
      </div>

      {recommendations.length > 0 && (
        <ContentRow title="More Like This" media={recommendations} />
      )}

      {/* Commento Section */}
      {tvShow && (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h3 className="text-xl font-semibold text-white mb-4">Comments</h3>
          <div id="commento" data-page-id={`tv-${tvShow.id}`}></div>
        </div>
      )}
    </div>
  );
};

export default TVDetailsPage;
