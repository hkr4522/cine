import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovieDetails, getMovieRecommendations, getMovieTrailer, backdropSizes, posterSizes, getMovieCast } from '@/utils/api';
import { getImageUrl } from '@/utils/services/tmdb';
import { MovieDetails, Media, CastMember } from '@/utils/types';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import ContentRow from '@/components/ContentRow';
import ReviewSection from '@/components/ReviewSection';
import { Play, Clock, Calendar, Star, ArrowLeft, Shield, Heart, Bookmark, Send, User } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWatchHistory } from '@/hooks/watch-history';
import { DownloadSection } from '@/components/DownloadSection';
import { useAuth } from '@/hooks';
import { useHaptic } from '@/hooks/useHaptic';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore, collection, addDoc, query, orderBy, onSnapshot, serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// Firebase Configuration
const firebaseConfig = {
  apiKey: 'AIzaSyDs4m55HdwEbh2nhr8lzauK-1vj3otkQmA',
  authDomain: 'cinecomments.firebaseapp.com',
  projectId: 'cinecomments',
  storageBucket: 'cinecomments.firebasestorage.app',
  messagingSenderId: '737334252175',
  appId: '1:737334252175:web:39c899d69a89e40ea1d6fa',
  measurementId: 'G-316F01H04G',
};

// Initialize Firebase only if not already initialized
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

// Comment Interface
interface Comment {
  id: string;
  content: string;
  author: string;
  timestamp: any; // Firestore Timestamp
  reactions: { [key: string]: string[] }; // e.g., { like: ['user1'], love: ['user2'] }
}

// Emoji Reactions
const emojiReactions = [
  { key: 'like', emoji: '👍', label: 'Like' },
  { key: 'love', emoji: '❤️', label: 'Love' },
  { key: 'laugh', emoji: '😂', label: 'Laugh' },
  { key: 'wow', emoji: '😮', label: 'Wow' },
  { key: 'sad', emoji: '😢', label: 'Sad' },
];

// Timestamp Formatter
const formatTimestamp = (date: Date | undefined) => {
  if (!date) return 'Just now';
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

type TabType = 'about' | 'cast' | 'reviews' | 'downloads';

const MovieDetailsPage = () => {
  const { id } = useParams<{ id: string }>();
  const [movie, setMovie] = useState<MovieDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [backdropLoaded, setBackdropLoaded] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('about');
  const [recommendations, setRecommendations] = useState<Media[]>([]);
  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [cast, setCast] = useState<CastMember[]>([]);
  const {
    addToFavorites,
    addToWatchlist,
    removeFromFavorites,
    removeFromWatchlist,
    isInFavorites,
    isInWatchlist,
  } = useWatchHistory();
  const [isFavorite, setIsFavorite] = useState(false);
  const [isInMyWatchlist, setIsInMyWatchlist] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { triggerHaptic } = useHaptic();
  const { user } = useAuth();

  // Comment States
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Fetch Movie Data
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
      } catch (error) {
        console.error('Error fetching movie data:', error);
        setError('Failed to load movie data. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMovieData();
  }, [id]);

  // Fetch Trailer
  useEffect(() => {
    const fetchTrailer = async () => {
      if (movie?.id) {
        try {
          const trailerData = await getMovieTrailer(movie.id);
          setTrailerKey(trailerData);
        } catch (error) {
          console.error('Error fetching trailer:', error);
        }
      }
    };

    fetchTrailer();
  }, [movie?.id]);

  // Watch History
  useEffect(() => {
    if (movie?.id) {
      setIsFavorite(isInFavorites(movie.id, 'movie'));
      setIsInMyWatchlist(isInWatchlist(movie.id, 'movie'));
    }
  }, [movie?.id, isInFavorites, isInWatchlist]);

  // Firebase Comments Logic
  useEffect(() => {
    // Sign in anonymously
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error('Error signing in anonymously:', error);
        }
      }
    });

    // Fetch comments in real-time
    if (movie?.id) {
      const q = query(collection(db, `comments/movie-${movie.id}/items`), orderBy('timestamp', 'desc'));
      const unsubscribeSnapshot = onSnapshot(q, (snapshot) => {
        const loadedComments: Comment[] = [];
        snapshot.forEach((doc) => {
          loadedComments.push({ id: doc.id, ...doc.data() } as Comment);
        });
        setComments(loadedComments);
        setCommentsLoading(false);
      }, (error) => {
        console.error('Error fetching comments:', error);
        setCommentsLoading(false);
      });

      return () => {
        unsubscribeAuth();
        unsubscribeSnapshot();
      };
    }
  }, [movie?.id]);

  const sendComment = async () => {
    if (!newComment.trim() || !movie?.id || !auth.currentUser) return;

    setSending(true);
    try {
      await addDoc(collection(db, `comments/movie-${movie.id}/items`), {
        content: newComment,
        author: authorName.trim() || 'Anonymous',
        timestamp: serverTimestamp(),
        reactions: {
          like: [],
          love: [],
          laugh: [],
          wow: [],
          sad: [],
        },
      });
      setNewComment('');
      setAuthorName('');
    } catch (error) {
      console.error('Error adding comment:', error);
    } finally {
      setSending(false);
    }
  };

  const reactToComment = async (commentId: string, reaction: string) => {
    if (!auth.currentUser || !movie?.id) return;

    const userId = auth.currentUser.uid;
    const commentRef = doc(db, `comments/movie-${movie.id}/items`, commentId);

    try {
      // Optimistically update UI
      setComments((prev) =>
        prev.map((c) =>
          c.id === commentId
            ? {
                ...c,
                reactions: {
                  ...c.reactions,
                  [reaction]: c.reactions[reaction].includes(userId)
                    ? c.reactions[reaction].filter((id) => id !== userId)
                    : [...c.reactions[reaction], userId],
                },
              }
            : c
        )
      );

      // Update Firestore
      await updateDoc(commentRef, {
        [`reactions.${reaction}`]: c.reactions[reaction].includes(userId)
          ? arrayRemove(userId)
          : arrayUnion(userId),
      });
    } catch (error) {
      console.error('Error updating reaction:', error);
    }
  };

  const handlePlayMovie = () => {
    if (movie) {
      navigate(`/watch/movie/${movie.id}`);
    }
  };

  const handleToggleFavorite = () => {
    if (!movie) return;

    if (isFavorite) {
      removeFromFavorites(movie.id, 'movie');
      setIsFavorite(false);
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
    }
  };

  const handleToggleWatchlist = () => {
    if (!movie) return;

    if (isInMyWatchlist) {
      removeFromWatchlist(movie.id, 'movie');
      setIsInMyWatchlist(false);
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
    }
  };

  const formatRuntime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse-slow text-white font-medium">Loading...</div>
      </div>
    );
  }

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Backdrop Image */}
      <div className="relative w-full h-[70vh]">
        {!backdropLoaded && <div className="absolute inset-0 bg-background image-skeleton" />}
        <button
          onClick={() => navigate(-1)}
          className="absolute top-20 left-6 z-10 text-white p-2 rounded-full bg-black/30 hover:bg-black/50 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <img
          src={getImageUrl(movie.backdrop_path, backdropSizes.original)}
          alt={movie.title || 'Movie backdrop'}
          className={`w-full h-full object-cover transition-opacity duration-700 ${
            backdropLoaded ? 'opacity-100' : 'opacity-0'
          }`}
          onLoad={() => setBackdropLoaded(true)}
        />
        <div className="absolute inset-0 details-gradient" />
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
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 lg:p-16">
          <div className="flex flex-col md:flex-row items-start gap-6 max-w-6xl mx-auto">
            <div className="hidden md:block flex-shrink-0 w-48 xl:w-64 rounded-lg overflow-hidden shadow-lg">
              <img
                src={getImageUrl(movie.poster_path, posterSizes.medium)}
                alt={movie.title || 'Movie poster'}
                className="w-full h-auto"
              />
            </div>
            <div className="flex-1 animate-slide-up">
              {movie.logo_path ? (
                <div
                  className="relative w-full max-w-[300px] md:max-w-[400px] lg:max-w-[500px] mx-auto mb-4 
                              transition-all duration-300 ease-in-out hover:scale-105"
                >
                  {!logoLoaded && <div className="absolute inset-0 bg-background image-skeleton rounded-lg" />}
                  <img
                    src={getImageUrl(movie.logo_path, backdropSizes.original)}
                    alt={movie.title}
                    className={`w-full h-auto object-contain filter drop-shadow-lg
                              transition-opacity duration-700 ease-in-out
                              ${logoLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={() => setLogoLoaded(true)}
                  />
                </div>
              ) : (
                <h1
                  className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-2 text-balance
                             animate-fade-in"
                >
                  {movie.title}
                </h1>
              )}
              {movie.tagline && <p className="text-white/70 mb-4 italic text-lg">{movie.tagline}</p>}
              <div className="flex flex-wrap items-center gap-4 mb-6">
                {movie.certification && (
                  <div className="flex items-center bg-white/20 px-2 py-1 rounded">
                    <Shield className="h-4 w-4 mr-1 text-white" />
                    <span className="text-white font-medium text-sm">{movie.certification}</ quitspan>
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
              <p className="text-white/80 mb-6">{movie.overview}</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={handlePlayMovie}
                  className="bg-accent hover:bg-accent/80 text-white flex items-center"
                >
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

      {/* Tabs for About, Cast, Reviews, and Downloads */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex border-b border-white/10 mb-6">
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${
              activeTab === 'about' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'
            }`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('about');
            }}
          >
            About
          </button>
          <button
            className={`py-2 px-4 font-medium whitespace-nowrap ${
              activeTab === 'cast' ? 'text-white border-b-2 border-accent' : 'text-white/60 hover:text-white'
            }`}
            onClick={() => {
              triggerHaptic();
              setActiveTab('cast');
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
            }}
            style={{ display: user ? undefined : 'none' }}
          >
            Downloads
          </button>
        </div>

        {activeTab === 'about' ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-3">Status</h3>
                <p className="text-white/80">{movie.status}</p>
              </div>
              <div className="glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-3">Budget</h3>
                <p className="text-white/80">
                  {movie.budget > 0 ? `$${movie.budget.toLocaleString()}` : 'Not available'}
                </p>
              </div>
              <div className="glass p-6 rounded-xl">
                <h3 className="text-lg font-semibold text-white mb-3">Revenue</h3>
                <p className="text-white/80">
                  {movie.revenue > 0 ? `$${movie.revenue.toLocaleString()}` : 'Not available'}
                </p>
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
                          <img
                            src={getImageUrl(company.logo_path, posterSizes.small)}
                            alt={company.name}
                            className="max-w-full max-h-full"
                          />
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
                      <img
                        src={getImageUrl(member.profile_path, 'w185')}
                        alt={member.name}
                        className="rounded-lg w-24 h-32 object-cover mx-auto mb-2"
                      />
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

      {/* Recommendations Section */}
      {recommendations.length > 0 && (
        <ContentRow title="More Like This" media={recommendations} />
      )}

      {/* Custom Comments Section */}
      {movie && (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h3 className="text-xl font-semibold text-white mb-4">Comments</h3>
          <div className="space-y-4">
            {/* Comment Form */}
            <div className="glass p-4 rounded-lg">
              <div className="flex gap-2 mb-2">
                <User className="h-5 w-5 text-white/50 mt-1" />
                <input
                  type="text"
                  placeholder="Your name (optional)"
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  className="flex-1 bg-transparent text-white placeholder-white/50 border-b border-white/20 focus:outline-none"
                  maxLength={50}
                />
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendComment()}
                  className="flex-1 bg-transparent text-white placeholder-white/50 border-b border-white/20 focus:outline-none"
                  maxLength={500}
                />
                <Button onClick={sendComment} disabled={sending || !newComment.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Comments List */}
            <div className="space-y-4">
              {commentsLoading ? (
                <p className="text-white/70 text-center">Loading comments...</p>
              ) : comments.length === 0 ? (
                <p className="text-white/70 text-center">No comments yet. Be the first!</p>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="glass p-4 rounded-lg">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-white">{comment.author || 'Anonymous'}</span>
                          <Clock className="h-3 w-3 text-white/50" />
                          <span className="text-xs text-white/50">
                            {formatTimestamp(comment.timestamp?.toDate())}
                          </span>
                        </div>
                        <p className="text-white mb-3">{comment.content}</p>
                        <div className="flex items-center gap-2">
                          {emojiReactions.map(({ key, emoji, label }) => (
                            <button
                              key={key}
                              onClick={() => reactToComment(comment.id, key)}
                              className="flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors"
                              title={label}
                            >
                              <span>{emoji}</span>
                              <span>{comment.reactions[key]?.length || 0}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovieDetailsPage;
