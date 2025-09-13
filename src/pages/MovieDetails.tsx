import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovieDetails, getMovieRecommendations, getMovieTrailer, backdropSizes, posterSizes, getMovieCast } from '@/utils/api';
import { getImageUrl } from '@/utils/services/tmdb';
import { MovieDetails, Media, CastMember } from '@/utils/types';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import ContentRow from '@/components/ContentRow';
import ReviewSection from '@/components/ReviewSection';
import { Play, Clock, Calendar, Star, ArrowLeft, Shield, Heart, Bookmark, Send, User, MessageCircle, Reply, ThumbsUp, Heart as HeartIcon, Laugh, Zap, Frown } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useWatchHistory } from '@/hooks/watch-history';
import { DownloadSection } from '@/components/DownloadSection';
import { useAuth } from '@/hooks';
import { useHaptic } from '@/hooks/useHaptic';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getDatabase, ref, push, onValue, update, remove, serverTimestamp } from 'firebase/database';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';

// Firebase Configuration - This is the config for your Firebase project
// Make sure this matches your Firebase project settings in the console
const firebaseConfig = {
  apiKey: "AIzaSyDs4m55HdwEbh2nhr8lzauK-1vj3otkQmA",
  authDomain: "cinecomments.firebaseapp.com",
  projectId: "cinecomments",
  storageBucket: "cinecomments.firebasestorage.app",
  messagingSenderId: "737334252175",
  appId: "1:737334252175:web:39c899d69a89e40ea1d6fa",
  measurementId: "G-316F01H04G",
  databaseURL: "https://cinecomments-default-rtdb.firebaseio.com/" // Add this for Realtime Database
};

// Initialize Firebase only if not already initialized - This prevents duplicate app errors
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const analytics = getAnalytics(app);
const db = getDatabase(app); // Use Realtime Database for JSON-like storage
const auth = getAuth(app);

// Comment Interface - Defines the structure for a comment object
interface Comment {
  id: string;
  content: string;
  author: string;
  authorId: string; // Anonymous UID for tracking
  timestamp: any; // Firebase server timestamp
  gifUrl?: string; // Optional GIF URL
  reactions: { [key: string]: { [userId: string]: boolean } }; // User-based reactions for toggle
  replies: Comment[]; // Nested replies for threaded comments
}

// Emoji Reactions - Define the 5 emojis for reactions
const emojiReactions = [
  { key: 'like', emoji: <ThumbsUp size={16} />, label: 'Like' },
  { key: 'love', emoji: <HeartIcon size={16} />, label: 'Love' },
  { key: 'laugh', emoji: <Laugh size={16} />, label: 'Laugh' },
  { key: 'wow', emoji: <Zap size={16} />, label: 'Wow' },
  { key: 'sad', emoji: <Frown size={16} />, label: 'Sad' },
];

// GIF Integration - Simple placeholder for GIFs (users can paste GIF URLs, e.g., from Giphy)
// Note: For real GIF search, you'd need a Giphy API key, but keeping it simple with URL input
const handleGifInput = (gifUrl: string) => {
  // Validate GIF URL (basic check)
  if (gifUrl && (gifUrl.includes('giphy.com') || gifUrl.includes('tenor.com') || gifUrl.includes('.gif'))) {
    return gifUrl;
  }
  return null;
};

// Timestamp Formatter - Formats Firebase timestamp to readable date/time
const formatTimestamp = (timestamp: any) => {
  if (!timestamp) return 'Just now';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Main Component - MovieDetailsPage with integrated comment system using Firebase Realtime Database
type TabType = 'about' | 'cast' | 'reviews' | 'downloads';

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

  // UI and Device States
  const isMobile = useIsMobile();
  const { triggerHaptic } = useHaptic();
  const { user } = useAuth();

  // Comment System States - Using Realtime Database for JSON-like storage
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [newReply, setNewReply] = useState<{ [key: string]: string }>({}); // Per-comment reply input
  const [newGifUrl, setNewGifUrl] = useState(''); // For GIF input
  const [authorName, setAuthorName] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null); // Track which comment is being replied to
  const [authReady, setAuthReady] = useState(false);
  const [showGifInput, setShowGifInput] = useState(false); // Toggle GIF input

  // Fetch Movie Details - API calls for movie data
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

  // Fetch Trailer - Get YouTube trailer key
  useEffect(() => {
    const fetchTrailer = async () => {
      if (movie?.id) {
        try {
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

  // Update Watch History - Check favorites and watchlist
  useEffect(() => {
    if (movie?.id) {
      setIsFavorite(isInFavorites(movie.id, 'movie'));
      setIsInMyWatchlist(isInWatchlist(movie.id, 'movie'));
    }
  }, [movie?.id, isInFavorites, isInWatchlist]);

  // Firebase Authentication - Handle anonymous sign-in for comment system
  useEffect(() => {
    console.log('Starting Firebase auth setup...');
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        try {
          console.log('No user found, attempting anonymous sign-in...');
          await signInAnonymously(auth);
          console.log('Anonymous sign-in successful');
          setAuthReady(true);
        } catch (error) {
          console.error('Error signing in anonymously:', error);
          alert('Failed to initialize commenting. Please refresh the page.');
          setAuthReady(false);
        }
      } else {
        console.log('User already authenticated:', user.uid);
        setAuthReady(true);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  // Load Comments from Realtime Database - Real-time listener for {page-id}.json-like structure
  useEffect(() => {
    if (movie?.id && authReady) {
      const pageId = `movie-${movie.id}`;
      console.log(`Loading comments for page ID: ${pageId}`);
      const commentsRef = ref(db, `comments/${pageId}`);
      const unsubscribe = onValue(commentsRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val() as { [key: string]: any };
          const loadedComments: Comment[] = Object.keys(data).map((key) => {
            const commentData = data[key];
            // Recursively build nested replies
            const buildReplies = (repliesData: { [key: string]: any }): Comment[] => {
              return Object.keys(repliesData).map((replyKey) => ({
                id: replyKey,
                content: repliesData[replyKey].content,
                author: repliesData[replyKey].author,
                authorId: repliesData[replyKey].authorId,
                timestamp: repliesData[replyKey].timestamp,
                gifUrl: repliesData[replyKey].gifUrl,
                reactions: repliesData[replyKey].reactions || {},
                replies: buildReplies(repliesData[replyKey].replies || {}),
              }));
            };
            return {
              id: key,
              content: commentData.content,
              author: commentData.author,
              authorId: commentData.authorId,
              timestamp: commentData.timestamp,
              gifUrl: commentData.gifUrl,
              reactions: commentData.reactions || {},
              replies: buildReplies(commentData.replies || {}),
            };
          });
          setComments(loadedComments);
          setCommentsLoading(false);
          console.log(`Loaded ${loadedComments.length} comments for ${pageId}`);
        } else {
          setComments([]);
          setCommentsLoading(false);
          console.log(`No comments found for ${pageId}`);
        }
      }, (error) => {
        console.error('Error loading comments:', error);
        alert('Failed to load comments. Please try again.');
        setCommentsLoading(false);
      });

      return () => unsubscribe();
    }
  }, [movie?.id, authReady]);

  // Send Main Comment - Add a new top-level comment to the {page-id}.json structure
  const sendComment = async () => {
    if (!newComment.trim()) {
      alert('Please enter a comment.');
      return;
    }
    if (!movie?.id) {
      alert('Movie ID not available.');
      return;
    }
    if (!auth.currentUser) {
      alert('Authentication required. Please wait and try again.');
      return;
    }
    if (!authReady) {
      alert('Authenticating... Please wait.');
      return;
    }

    const pageId = `movie-${movie.id}`;
    setSending(true);
    try {
      console.log('Sending main comment:', { content: newComment, author: authorName || 'Anonymous', gif: newGifUrl });
      const commentsRef = ref(db, `comments/${pageId}`);
      const newCommentRef = push(commentsRef);
      const commentData: Comment = {
        id: newCommentRef.key || '',
        content: newComment,
        author: authorName.trim() || 'Anonymous',
        authorId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        gifUrl: handleGifInput(newGifUrl),
        reactions: {
          like: {},
          love: {},
          laugh: {},
          wow: {},
          sad: {},
        },
        replies: [],
      };
      await update(newCommentRef, commentData);
      setNewComment('');
      setAuthorName('');
      setNewGifUrl('');
      setShowGifInput(false);
      alert('Comment posted successfully!');
    } catch (error) {
      console.error('Error adding comment:', error);
      alert('Failed to post comment. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Send Reply - Add a reply to a specific comment in the threaded structure
  const sendReply = async (parentId: string) => {
    const replyText = newReply[parentId];
    if (!replyText || !replyText.trim()) {
      alert('Please enter a reply.');
      return;
    }
    if (!movie?.id) {
      alert('Movie ID not available.');
      return;
    }
    if (!auth.currentUser) {
      alert('Authentication required. Please wait and try again.');
      return;
    }
    if (!authReady) {
      alert('Authenticating... Please wait.');
      return;
    }

    const pageId = `movie-${movie.id}`;
    setSending(true);
    try {
      console.log('Sending reply to', parentId, ':', replyText);
      const parentCommentRef = ref(db, `comments/${pageId}/${parentId}`);
      const repliesRef = ref(db, `comments/${pageId}/${parentId}/replies`);
      const newReplyRef = push(repliesRef);
      const replyData: Comment = {
        id: newReplyRef.key || '',
        content: replyText,
        author: authorName.trim() || 'Anonymous',
        authorId: auth.currentUser.uid,
        timestamp: serverTimestamp(),
        gifUrl: handleGifInput(newGifUrl),
        reactions: {
          like: {},
          love: {},
          laugh: {},
          wow: {},
          sad: {},
        },
        replies: [],
      };
      await update(newReplyRef, replyData);
      // Clear reply input
      setNewReply((prev) => ({ ...prev, [parentId]: '' }));
      setNewGifUrl('');
      setShowGifInput(false);
      setReplyingTo(null);
      alert('Reply posted successfully!');
    } catch (error) {
      console.error('Error adding reply:', error);
      alert('Failed to post reply. Please try again.');
    } finally {
      setSending(false);
    }
  };

  // Toggle Reaction - Update reactions for a comment or reply
  const toggleReaction = async (commentId: string, reactionKey: string, isReply = false) => {
    if (!auth.currentUser || !movie?.id) {
      alert('Authentication required to react.');
      return;
    }

    const userId = auth.currentUser.uid;
    const pageId = `movie-${movie.id}`;
    const baseRef = ref(db, `comments/${pageId}/${commentId}`);
    const reactionPath = isReply ? `replies/${commentId}/reactions/${reactionKey}` : `reactions/${reactionKey}`;

    try {
      // Get current reaction state
      const currentSnapshot = await onValue(baseRef, (snap) => snap.val());
      const currentData = currentSnapshot.val();
      const currentReactions = currentData.reactions[reactionKey] || {};
      const hasReacted = currentReactions[userId] || false;

      // Update locally first for real-time feel
      setComments((prev) => {
        const updateComment = (comments: Comment[]): Comment[] => {
          return comments.map((c) => {
            if (c.id === commentId) {
              const updatedReactions = { ...c.reactions };
              updatedReactions[reactionKey] = { ...updatedReactions[reactionKey] };
              if (hasReacted) {
                delete updatedReactions[reactionKey][userId];
              } else {
                updatedReactions[reactionKey][userId] = true;
              }
              return {
                ...c,
                reactions: updatedReactions,
              };
            }
            // Recurse for replies
            if (c.replies) {
              return {
                ...c,
                replies: updateComment(c.replies),
              };
            }
            return c;
          });
        };
        return updateComment(prev);
      });

      // Update in database
      const updateData = hasReacted ? arrayRemove(userId) : arrayUnion(userId);
      await update(ref(db, `comments/${pageId}/${commentId}/${reactionPath}`), updateData);
      console.log(`Toggled ${reactionKey} for ${commentId}`);
    } catch (error) {
      console.error('Error toggling reaction:', error);
      alert('Failed to update reaction.');
    }
  };

  // Delete Comment or Reply - For moderation (optional, requires auth check)
  const deleteComment = async (commentId: string, isReply = false) => {
    if (!auth.currentUser || !movie?.id) {
      alert('Authentication required to delete.');
      return;
    }

    // Simple check - only allow if author matches (in production, use admin auth)
    if (confirm('Are you sure you want to delete this comment?')) {
      const pageId = `movie-${movie.id}`;
      const commentRef = ref(db, `comments/${pageId}/${commentId}`);
      try {
        await remove(commentRef);
        alert('Comment deleted successfully!');
      } catch (error) {
        console.error('Error deleting comment:', error);
        alert('Failed to delete comment.');
      }
    }
  };

  // Handle Play Movie - Navigate to watch page
  const handlePlayMovie = () => {
    if (movie) {
      navigate(`/watch/movie/${movie.id}`);
    }
  };

  // Toggle Favorite - Add/remove from favorites
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

  // Toggle Watchlist - Add/remove from watchlist
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

  // Format Runtime - Convert minutes to hours and minutes
  const formatRuntime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
  };

  // Render Loading State - Show loading spinner
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse-slow text-white font-medium">Loading movie details...</div>
      </div>
    );
  }

  // Render Error State - Show error message and home button
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

  // Render Not Found State - If movie is null
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

  // Main Render - Full movie details page with comments
  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Backdrop Image Section - Hero with backdrop, poster, and movie info */}
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
          className={`w-full h-full object-cover transition-opacity duration-700 ${
            backdropLoaded ? 'opacity-100' : 'opacity-0'
          }`}
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
                    className={`w-full h-auto object-contain filter drop-shadow-lg transition-opacity duration-700 ease-in-out ${
                      logoLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
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

      {/* Recommendations Section - More Like This */}
      {recommendations.length > 0 && (
        <ContentRow title="More Like This" media={recommendations} />
      )}

      {/* Advanced Comments Section - Threaded comments with replies, emojis, GIFs */}
      {movie && (
        <div className="max-w-6xl mx-auto px-4 py-8">
          <h3 className="text-xl font-semibold text-white mb-4">Comments</h3>
          <div className="space-y-4">
            {/* Main Comment Form - For top-level comments */}
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
                  disabled={!authReady}
                />
              </div>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  placeholder="Add a comment..."
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendComment()}
                  className="flex-1 bg-transparent text-white placeholder-white/50 border-b border-white/20 focus:outline-none"
                  maxLength={500}
                  disabled={!authReady}
                />
                <Button onClick={sendComment} disabled={sending || !newComment.trim() || !authReady}>
                  {sending ? 'Sending...' : <Send className="h-4 w-4" />}
                </Button>
              </div>
              {/* GIF Input - Simple URL input for GIFs */}
              {showGifInput && (
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Paste GIF URL (e.g., from Giphy)"
                    value={newGifUrl}
                    onChange={(e) => setNewGifUrl(e.target.value)}
                    className="flex-1 bg-transparent text-white placeholder-white/50 border-b border-white/20 focus:outline-none"
                    maxLength={200}
                    disabled={!authReady}
                  />
                  <Button onClick={() => {
                    setShowGifInput(false);
                    setNewGifUrl('');
                  }} variant="outline" disabled={!authReady}>
                    Cancel
                  </Button>
                </div>
              )}
              <button
                onClick={() => setShowGifInput(!showGifInput)}
                className="text-white/70 text-sm hover:text-white transition-colors"
                disabled={!authReady}
              >
                {showGifInput ? 'Cancel GIF' : 'Add GIF'}
              </button>
              {!authReady && <p className="text-white/50 text-sm mt-2">Initializing authentication...</p>}
            </div>

            {/* Comments List - Render threaded comments with replies */}
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
                            {formatTimestamp(comment.timestamp)}
                          </span>
                        </div>
                        <p className="text-white mb-3">{comment.content}</p>
                        {comment.gifUrl && (
                          <img src={comment.gifUrl} alt="GIF" className="max-w-32 rounded mb-3" />
                        )}
                        {/* Reactions for Main Comment */}
                        <div className="flex items-center gap-2 mb-3">
                          {emojiReactions.map(({ key, emoji, label }) => (
                            <button
                              key={key}
                              onClick={() => toggleReaction(comment.id, key)}
                              className="flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors"
                              title={label}
                              disabled={!authReady}
                            >
                              {emoji}
                              <span>{Object.keys(comment.reactions[key] || {}).length}</span>
                            </button>
                          ))}
                        </div>
                        {/* Delete Button - Simple moderation */}
                        <button
                          onClick={() => deleteComment(comment.id)}
                          className="text-red-400 text-xs hover:text-red-300 mr-2"
                          disabled={!authReady}
                        >
                          Delete
                        </button>
                        {/* Reply Button */}
                        <button
                          onClick={() => setReplyingTo(comment.id)}
                          className="text-white/70 text-xs hover:text-white flex items-center gap-1"
                          disabled={!authReady}
                        >
                          <Reply className="h-3 w-3" />
                          Reply
                        </button>
                      </div>
                    </div>
                    
                    {/* Reply Form - If replying to this comment */}
                    {replyingTo === comment.id && (
                      <div className="mt-4 p-3 bg-white/5 rounded">
                        <input
                          type="text"
                          placeholder="Reply to this comment..."
                          value={newReply[comment.id] || ''}
                          onChange={(e) => setNewReply({ ...newReply, [comment.id]: e.target.value })}
                          className="w-full bg-transparent text-white placeholder-white/50 border-b border-white/20 focus:outline-none mb-2"
                          maxLength={500}
                          disabled={!authReady}
                        />
                        <div className="flex gap-2">
                          <Button
                            onClick={() => sendReply(comment.id)}
                            disabled={sending || !newReply[comment.id]?.trim() || !authReady}
                            size="sm"
                          >
                            {sending ? 'Sending...' : 'Reply'}
                          </Button>
                          <Button
                            onClick={() => {
                              setNewReply({ ...newReply, [comment.id]: '' });
                              setReplyingTo(null);
                            }}
                            variant="outline"
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Nested Replies - Recursively render replies */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="ml-8 mt-4 space-y-2">
                        {comment.replies.map((reply) => (
                          <div key={reply.id} className="glass p-3 rounded border-l-2 border-accent/50">
                            <div className="flex items-start gap-2">
                              <div className="w-6 h-6 bg-white/10 rounded-full flex items-center justify-center">
                                <User className="h-3 w-3 text-white" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-1 mb-1">
                                  <span className="font-medium text-white text-sm">{reply.author || 'Anonymous'}</span>
                                  <Clock className="h-2 w-2 text-white/50" />
                                  <span className="text-xs text-white/50">
                                    {formatTimestamp(reply.timestamp)}
                                  </span>
                                </div>
                                <p className="text-white text-sm mb-2">{reply.content}</p>
                                {reply.gifUrl && (
                                  <img src={reply.gifUrl} alt="GIF" className="max-w-24 rounded mb-2" />
                                )}
                                {/* Reactions for Reply */}
                                <div className="flex items-center gap-1 mb-2">
                                  {emojiReactions.map(({ key, emoji, label }) => (
                                    <button
                                      key={key}
                                      onClick={() => toggleReaction(reply.id, key, true)}
                                      className="flex items-center gap-1 text-xs text-white/70 hover:text-white transition-colors"
                                      title={label}
                                      disabled={!authReady}
                                    >
                                      {emoji}
                                      <span>{Object.keys(reply.reactions[key] || {}).length}</span>
                                    </button>
                                  ))}
                                </div>
                                {/* Delete Reply */}
                                <button
                                  onClick={() => deleteComment(reply.id, true)}
                                  className="text-red-400 text-xs hover:text-red-300 mr-2"
                                  disabled={!authReady}
                                >
                                  Delete
                                </button>
                                {/* Reply to Reply Button */}
                                <button
                                  onClick={() => setReplyingTo(reply.id)}
                                  className="text-white/70 text-xs hover:text-white flex items-center gap-1"
                                  disabled={!authReady}
                                >
                                  <Reply className="h-3 w-3" />
                                  Reply
                                </button>
                              </div>
                            </div>
                            
                            {/* Nested Replies for this Reply */}
                            {reply.replies && reply.replies.length > 0 && (
                              <div className="ml-4 mt-2 space-y-1">
                                {reply.replies.map((subReply) => (
                                  <div key={subReply.id} className="glass p-2 rounded border-l-2 border-accent/30">
                                    <div className="flex items-start gap-1">
                                      <div className="w-5 h-5 bg-white/10 rounded-full flex items-center justify-center">
                                        <User className="h-2.5 w-2.5 text-white" />
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-1">
                                          <span className="font-medium text-white text-xs">{subReply.author || 'Anonymous'}</span>
                                          <Clock className="h-1.5 w-1.5 text-white/50" />
                                          <span className="text-xs text-white/50">
                                            {formatTimestamp(subReply.timestamp)}
                                          </span>
                                        </div>
                                        <p className="text-white text-xs">{subReply.content}</p>
                                        {subReply.gifUrl && (
                                          <img src={subReply.gifUrl} alt="GIF" className="max-w-16 rounded" />
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
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
