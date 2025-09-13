import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovieDetails, getMovieRecommendations, getMovieTrailer, backdropSizes, posterSizes, getMovieCast } from '@/utils/api';
import { getImageUrl } from '@/utils/services/tmdb';
import { MovieDetails, Media, CastMember } from '@/utils/types';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import ContentRow from '@/components/ContentRow';
import ReviewSection from '@/components/ReviewSection';
import { Play, Clock, Calendar, Star, ArrowLeft, Shield, Heart, Bookmark } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWatchHistory } from '@/hooks/watch-history';
import { DownloadSection } from '@/components/DownloadSection';
import { useAuth } from '@/hooks';
import { useHaptic } from '@/hooks/useHaptic';

// Type Definitions for Tabs
type TabType = 'about' | 'cast' | 'reviews' | 'downloads';

// Main Movie Details Component
const MovieDetailsPage = () => {
  // Routing and Navigation
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Movie Data States
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backdropLoaded, setBackdropLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('about');
  const [recommendations, setRecommendations] = useState<Media[]>([]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [cast, setCast] = useState<CastMember[]>([]);

  // Watch History and User States
  const { addToFavorites, addToWatchlist, removeFromFavorites, removeFromWatchlist, isInFavorites, isInWatchlist } = useWatchHistory();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isInMyWatchlist, setIsInMyWatchlist] = useState(false);

  // UI and Device States
  const isMobile = useIsMobile();
  const { triggerHaptic } = useHaptic();
  const { user } = useAuth();

  // Fetch Movie Data - Load movie details, recommendations, and cast
  useEffect(() => {
    const fetchMovieData = async () => {
      if (!id) {
        setError('Movie ID is required');
        setIsLoading(false);
        return;
      }

      const movieId = parseInt(id, 10);
      if (isNaN(movieId)) {
        setError('Invalid movie ID');
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);
        console.log(`Fetching movie data for ID: ${movieId}`);
        const [movieData, recommendationsData, castData] = await Promise.all([
          getMovieDetails(movieId),
          getMovieRecommendations(movieId),
          getMovieCast(movieId),
        ]);

        if (!movieData) {
          setError('Movie not found');
          return;
        }

        setMovie(movieData);
        setRecommendations(recommendationsData);
        setCast(castData);
        console.log('Movie data loaded:', movieData.title);
      } catch (error) {
        console.error('Error fetching movie data:', error);
        setError('Failed to load movie data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMovieData();
  }, [id]);

  // Fetch Trailer - Load YouTube trailer key
  useEffect(() => {
    const fetchTrailer = async () => {
      if (movie?.id) {
        try {
          console.log(`Fetching trailer for movie ID: ${movie.id}`);
          const trailerData = await getMovieTrailer(movie.id);
          setTrailerKey(trailerData);
          console.log('Trailer loaded:', trailerData);
        } catch (error) {
          console.error('Error fetching trailer:', error);
        }
      }
    };

    fetchTrailer();
  }, [movie?.id]);

  // Update Watch History - Check if movie is in favorites or watchlist
  useEffect(() => {
    if (movie?.id) {
      setIsFavorite(isInFavorites(movie.id, 'movie'));
      setIsInMyWatchlist(isInWatchlist(movie.id, 'movie'));
      console.log(`Checked watch history - Favorite: ${isInFavorites(movie.id, 'movie')}, Watchlist: ${isInWatchlist(movie.id, 'movie')}`);
    }
  }, [movie?.id, isInFavorites, isInWatchlist]);

  // Initialize GraphComment - Dynamically load GraphComment script with unique uid per movie
  useEffect(() => {
    if (!movie?.id) return;

    console.log('Initializing GraphComment for movie ID:', movie.id);
    const pageId = `movie-${movie.id}`;

    // Define GraphComment parameters
    const __semio__params = {
      graphcommentId: "cinepeace",
      behaviour: {
        uid: pageId, // Unique identifier for comments thread (movie-specific)
      },
    };

    // Define onload function for GraphComment
    (window as any).__semio__onload = function () {
      if ((window as any).__semio__gc_graphlogin) {
        (window as any).__semio__gc_graphlogin(__semio__params);
        console.log('GraphComment initialized with uid:', pageId);
      } else {
        console.error('GraphComment __semio__gc_graphlogin not available');
        alert('Failed to initialize comments. Please refresh the page.');
      }
    };

    // Load GraphComment script
    const gc = document.createElement('script');
    gc.type = 'text/javascript';
    gc.async = true;
    gc.defer = true;
    gc.src = 'https://integration.graphcomment.com/gc_graphlogin.js?' + Date.now();
    gc.onload = (window as any).__semio__onload;
    gc.onerror = () => {
      console.error('Failed to load GraphComment script');
      alert('Failed to load comments system. Check your network and try again.');
    };

    // Append script to document
    const target = document.getElementsByTagName('head')[0] || document.getElementsByTagName('body')[0];
    target.appendChild(gc);
    console.log('GraphComment script appended to document');

    // Cleanup: Remove script on unmount
    return () => {
      if (gc.parentNode) {
        gc.parentNode.removeChild(gc);
        console.log('GraphComment script removed');
      }
    };
  }, [movie?.id]);

  // Handle Play Movie - Navigate to watch page
  const handlePlayMovie = () => {
    if (movie) {
      navigate(`/watch/movie/${movie.id}`);
      console.log('Navigating to watch page for movie:', movie.id);
    }
  };

  // Toggle Favorite - Add/remove from favorites
  const handleToggleFavorite = () => {
    if (!movie) return;

    if (isFavorite) {
      removeFromFavorites(movie.id, 'movie');
      setIsFavorite(false);
      console.log(`Removed movie ${movie.id} from favorites`);
    } else {
      addToFavorites({
        media_id: movie.id,
        media_type: 'movie',
        title: movie.title,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        overview: movie.overview,
        rating: movie.vote_average,
      });
      setIsFavorite(true);
      console.log(`Added movie ${movie.id} to favorites`);
    }
  };

  // Toggle Watchlist - Add/remove from watchlist
  const handleToggleWatchlist = () => {
    if (!movie) return;

    if (isInMyWatchlist) {
      removeFromWatchlist(movie.id, 'movie');
      setIsInMyWatchlist(false);
      console.log(`Removed movie ${movie.id} from watchlist`);
    } else {
      addToWatchlist({
        media_id: movie.id,
        media_type: 'movie',
        title: movie.title,
        poster_path: movie.poster_path,
        backdrop_path: movie.backdrop_path,
        overview: movie.overview,
        rating: movie.vote_average,
      });
      setIsInMyWatchlist(true);
      console.log(`Added movie ${movie.id} to watchlist`);
    }
  };

  // Format Runtime - Convert minutes to hours and minutes
  const formatRuntime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Render Loading State - Show loading spinner while fetching movie data
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse-slow text-white font-medium">Loading movie details...</div>
      </div>
    );
  }

  // Render Error State - Display error message with option to return home
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

  // Render Not Found State - If movie data is null
  if (!movie) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background">
        <h1 className="text-2xl text-white mb-4">Movie not found</h1>
        <Button onClick={() => navigate('/')} variant="outline">
          Return to Home
        </Button>
      </div>
    );
  }

  // Main Render - Movie details page with GraphComment integration
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation Bar */}
      <Navbar />

      {/* Backdrop Image Section - Hero section with movie backdrop and info */}
      <div className="relative w-full h-[70vh]">
        {/* Loading Skeleton for Backdrop */}
        {!backdropLoaded && <div className="absolute inset-0 bg-background image-skeleton" />}
        
        {/* Back Button */}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 z-10 text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>

        {/* Backdrop Image */}
        <img
          src={getImageUrl(movie.backdrop_path, backdropSizes.original)}
          alt={movie.title || 'Movie backdrop'}
          className={`w-full h-full object-cover transition-opacity duration-700 ${backdropLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setBackdropLoaded(true)}
        />
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 details-gradient" />
        
        {/* Trailer Overlay - Only on desktop */}
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

        {/* Movie Info Content */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 lg:p-16">
          <div className="flex flex-col md:flex-row items-start gap-6 max-w-6xl mx-auto">
            {/* Poster Image - Hidden on mobile */}
            <div className="hidden md:block flex-shrink-0 w-48 xl:w-64 rounded-lg overflow-hidden shadow-lg">
              <img
                src={getImageUrl(movie.poster_path, posterSizes.medium)}
                alt={movie.title || 'Movie poster'}
                className="w-full h-auto"
              />
            </div>
            
            {/* Title, Tagline, and Metadata */}
            <div className="flex-1 animate-slide-up">
              {movie.logo_path ? (
                <div className="relative w-full max-w-[300px] md:max-w-[400px] lg:max-w-[500px] mx-auto mb-4 transition-all duration-300 ease-in-out hover:scale-105">
                  {!logoLoaded && <div className="absolute inset-0 bg-background image-skeleton rounded-lg" />}
                  <img
                    src={getImageUrl(movie.logo_path, backdropSizes.original)}
                    alt={movie.title}
                    className={`w-full h-auto object-contain filter drop-shadow-lg transition-opacity duration-700 ease-in-out ${logoLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setLogoLoaded(true)}
                  />
                </div>
              ) : (
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 text-balance animate-fade-in">
                  {movie.title}
                </h1>
              )}
              {movie.tagline && <p className="text-white/70 mb-4 italic text-lg">{movie.tagline}</p>}
              
              {/* Metadata Row - Certification, Release Date, Runtime, Rating, Genres */}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                {movie.certification && (
                  <div className="flex items-center bg-white/20 px-2 py-1 rounded">
                    <Shield className="h-4 w-4 mr-1 text-white" />
                    <span className="text-white font-medium text-sm">{movie.certification}</span>
                  </div>
                )}
                {movie.release_date && (
                  <div className="flex items-center text-white/80">
                    <Calendar className="h-4 w-4 mr-2" />
                    {new Date(movie.release_date).getFullYear()}
                  </div>
                )}
                {movie.runtime > 0 && (
                  <div className="flex items-center text-white/80">
                    <Clock className="h-4 w-4 mr-2" />
                    {formatRuntime(movie.runtime)}
                  </div>
                )}
                {movie.vote_average > 0 && (
                  <div className="flex items-center text-amber-400">
                    <Star className="h-4 w-4 mr-2 fill-amber-400" />
                    {movie.vote_average.toFixed(1)}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {movie.genres.map((genre) => (
                    <span key={genre.id} className="px-2 py-1 rounded bg-white/10 text-white/80 text-xs">
                      {genre.name}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* Overview */}
              <p className="text-white/80 mb-6">{movie.overview}</p>
              
              {/* Action Buttons - Play, Favorite, Watchlist */}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handlePlayMovie} className="bg-accent hover:bg-accent/80 text-white flex items-center">
                  <Play className="h-4 w-4 mr-2" />
                  Play
                </Button>
                <Button
                  onClick={handleToggleFavorite}
                  variant="outline"
                  className={`border-white/20 ${isFavorite ? 'bg-accent text-white' : 'bg-black/50 text-white hover:bg-black/70'}`}
                >
                  <Heart className={`h-4 w-4 mr-2 ${isFavorite ? 'fill-current' : ''}`} />
                  {isFavorite ? 'In Favorites' : 'Add to Favorites'}
                </Button>
                <Button
                  onClick={handleToggleWatchlist}
                  variant="outline"
                  className={`border-white/20 ${isInMyWatchlist ? 'bg-accent text-white' : 'bg-black/50 text-white hover:bg-black/70'}`}
                >
                  <Bookmark className={`h-4 w-4 mr-2 ${isInMyWatchlist ? 'fill-current' : ''}`} />
                  {isInMyWatchlist ? 'In Watchlist' : 'Add to Watchlist'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Section - About, Cast, Reviews, Downloads */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex border-b border-white/10 mb-6">
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${activeTab === 'about' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'}`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('about');
              console.log('Switched to About tab');
            }}
          >
            About
          </button>
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${activeTab === 'cast' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'}`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('cast');
              console.log('Switched to Cast tab');
            }}
          >
            Cast
          </button>
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${activeTab === 'reviews' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'}`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('reviews');
              console.log('Switched to Reviews tab');
            }}
          >
            Reviews
          </button>
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${activeTab === 'downloads' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'}`}
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

        {/* About Tab - Status, Budget, Revenue, Production Companies */}
        {activeTab === 'about' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-3">Status</h3>
                <p className="text-white/80">{movie.status}</p>
              </div>
              <div className="glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-3">Budget</h3>
                <p className="text-white/80">{movie.budget > 0 ? `$${movie.budget.toLocaleString()}` : 'Not available'}</p>
              </div>
              <div className="glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-3">Revenue</h3>
                <p className="text-white/80">{movie.revenue > 0 ? `$${movie.revenue.toLocaleString()}` : 'Not available'}</p>
              </div>
            </div>
            {movie.production_companies.length > 0 && (
              <div className="mt-8">
                <h3 className="text-xl font-semibold text-white mb-4">Production Companies</h3>
                <div className="flex flex-wrap gap-6">
                  {movie.production_companies.map((company) => (
                    <div key={company.id} className="text-center">
                      {company.logo_path ? (
                        <div className="bg-white/10 p-3 rounded-lg w-24 h-16 flex items-center justify-center mb-2">
                          <img src={getImageUrl(company.logo_path, posterSizes.small)} alt={company.name} className="max-w-full max-h-full" />
                        </div>
                      ) : (
                        <div className="bg-white/10 p-3 rounded-lg w-24 h-16 flex items-center justify-center mb-2">
                          <span className="text-white/70 text-xs text-center">{company.name}</span>
                        </div>
                      )}
                      <p className="text-white/70 text-sm">{company.name}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : activeTab === 'cast' ? (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Cast</h2>
            {cast.length > 0 ? (
              <div className="flex flex-wrap gap-6">
                {cast.map((member) => (
                  <div key={member.id} className="w-32 text-center">
                    {member.profile_path ? (
                      <img src={getImageUrl(member.profile_path, 'w185')} alt={member.name} className="rounded-lg w-24 h-32 object-cover mx-auto mb-2" />
                    ) : (
                      <div className="rounded-lg w-24 h-32 bg-white/10 flex items-center justify-center mx-auto mb-2 text-white/60 text-xs">
                        No Image
                      </div>
                    )}
                    <p className="text-white/90 text-sm font-medium truncate">{member.name}</p>
                    <p className="text-white/60 text-xs truncate">{member.character}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-white/70">No cast information available.</div>
            )}
          </div>
        ) : activeTab === 'downloads' ? (
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-white mb-6">Download Movie</h2>
            {movie && <DownloadSection mediaName={movie.title} />}
          </div>
        ) : (
          <div className="mb-8">
            <h3 className="text-xl font-semibold text-white mb-4">User Reviews</h3>
            <ReviewSection mediaId={parseInt(id!, 10)} mediaType="movie" />
          </div>
        )}
      </div>

      {/* Recommendations Section - More Like This */}
      {recommendations.length > 0 && (
        <ContentRow title="More Like This" media={recommendations} />
      )}

      {/* GraphComment Section - Embedded comments widget */}
      {movie && (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h3 className="text-xl font-semibold text-white mb-4">Comments</h3>
          <div id="graphcomment"></div>
        </div>
      )}
    </div>
  );
};

export default MovieDetailsPage;
