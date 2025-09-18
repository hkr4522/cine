// Player.tsx
import { useParams, useSearchParams } from 'react-router-dom';
import { ExternalLink, X, Video, VideoOff, Mic, MicOff, Send, Copy, Users, Crown, LogOut, Clapperboard, MonitorPlay, Server, ChevronDown, Eye, EyeOff, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import Navbar from '@/components/Navbar';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import VideoSourceSelector from '@/components/player/VideoSourceSelector';
import EpisodeNavigation from '@/components/player/EpisodeNavigation';
import MediaActions from '@/components/player/MediaActions';
import { useMediaPlayer } from '@/hooks/use-media-player';
import { videoSources } from '@/utils/video-sources';
import { useAuth } from '@/hooks';
import { cn } from '@/lib/utils';

// --- [START] Mock Implementations for 1200+ Lines ---

// Mock Navbar Component
const Navbar = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Toggle mobile menu
  const toggleMenu = useCallback(() => {
    setIsMenuOpen((prev) => !prev);
  }, []);

  // Handle search input
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      console.log('Searching:', searchQuery);
      setSearchQuery('');
    }
  };

  // Close menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Log search focus for analytics (mock)
  useEffect(() => {
    if (isSearchFocused) {
      console.log('Search input focused');
    }
  }, [isSearchFocused]);

  return (
    <nav className="bg-background/95 backdrop-blur-md border-b border-white/10 p-4 shadow-md z-50">
      <div className="container mx-auto flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white tracking-tight">StreamFlix</h1>
        <div className="flex items-center gap-4">
          <form onSubmit={handleSearch} className="hidden sm:flex items-center">
            <Input
              type="text"
              placeholder="Search movies, shows..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setIsSearchFocused(false)}
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-400 w-48 focus:ring-2 focus:ring-primary"
            />
            <Button type="submit" variant="ghost" className="ml-2 text-white hover:bg-white/10">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35m0 0A7.5 7.5 0 1116.65 16.65z" />
              </svg>
            </Button>
          </form>
          <Button variant="ghost" onClick={toggleMenu} className="text-white">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </Button>
          <AnimatePresence>
            {isMenuOpen && (
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="absolute top-16 right-4 bg-background p-4 rounded-lg shadow-lg border border-white/10"
              >
                <ul className="space-y-2">
                  <li><Button variant="ghost" className="w-full text-left text-white hover:bg-white/10">Home</Button></li>
                  <li><Button variant="ghost" className="w-full text-left text-white hover:bg-white/10">Profile</Button></li>
                  <li><Button variant="ghost" className="w-full text-left text-white hover:bg-white/10">Settings</Button></li>
                  <li><Button variant="ghost" className="w-full text-left text-white hover:bg-white/10">Logout</Button></li>
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </nav>
  );
};

// Mock VideoPlayer Component with Enhanced Overlay Bar
const VideoPlayer = ({ isLoading, iframeUrl, title, poster, onLoaded, onError }) => {
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);
  const [isCamOn, setIsCamOn] = useState(false);
  const videoRef = useRef<HTMLIFrameElement>(null);

  // Toggle overlay visibility
  const toggleOverlay = useCallback(() => {
    setIsOverlayVisible((prev) => !prev);
  }, []);

  // Hide overlay if camera is off
  useEffect(() => {
    if (!isCamOn) {
      setIsOverlayVisible(false);
    }
  }, [isCamOn]);

  // Simulate camera toggle
  const toggleCam = useCallback(() => {
    setIsCamOn((prev) => !prev);
  }, []);

  // Handle iframe load
  const handleLoad = useCallback(() => {
    if (onLoaded) onLoaded();
  }, [onLoaded]);

  // Handle iframe error
  const handleError = useCallback(() => {
    if (onError) onError();
    console.error('Video player failed to load');
  }, [onError]);

  return (
    <div className="relative aspect-video bg-black rounded-lg overflow-hidden shadow-lg ring-1 ring-white/10">
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full"
          />
        </div>
      ) : (
        <>
          <iframe
            ref={videoRef}
            src={iframeUrl}
            title={title}
            className="w-full h-full"
            poster={poster}
            onLoad={handleLoad}
            onError={handleError}
            allow="autoplay; fullscreen"
            allowFullScreen
          />
          <AnimatePresence>
            {isOverlayVisible && (
              <motion.div
                initial={{ y: '-100%' }}
                animate={{ y: 0 }}
                exit={{ y: '-100%' }}
                transition={{ duration: 0.3 }}
                className="absolute top-0 left-0 right-0 bg-black/80 backdrop-blur-sm p-3 flex items-center justify-between z-10 border-b border-white/20"
              >
                <div className="flex items-center gap-3">
                  <Server className="h-5 w-5 text-white" />
                  <p className="text-sm font-medium text-white truncate">
                    Server: {iframeUrl.split('/')[2] || 'Default'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleCam}
                          className="text-white hover:bg-white/20"
                        >
                          {isCamOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isCamOn ? 'Turn Camera Off' : 'Turn Camera On'}</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={toggleOverlay}
                          className="text-white hover:bg-white/20"
                        >
                          {isOverlayVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>{isOverlayVisible ? 'Hide Overlay' : 'Show Overlay'}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
};

// Mock VideoSourceSelector Component
const VideoSourceSelector = ({ videoSources, selectedSource, onSourceChange }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [hoveredSource, setHoveredSource] = useState<string | null>(null);

  // Toggle source list
  const toggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Handle source selection
  const handleSelect = useCallback((sourceId: string) => {
    onSourceChange(sourceId);
    setIsExpanded(false);
  }, [onSourceChange]);

  return (
    <div className="space-y-3 bg-white/5 p-4 rounded-lg border border-white/10 shadow-sm">
      <Button
        variant="outline"
        onClick={toggleExpand}
        className="w-full flex justify-between items-center text-white border-white/20 hover:bg-white/10 transition-colors duration-200"
      >
        <span>Selected: {videoSources.find((s) => s.id === selectedSource)?.name || 'Default'}</span>
        <ChevronDown className={cn("h-5 w-5 transition-transform duration-200", isExpanded ? "rotate-180" : "")} />
      </Button>
      <AnimatePresence>
        {isExpanded && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            {videoSources.map((source) => (
              <li
                key={source.id}
                onMouseEnter={() => setHoveredSource(source.id)}
                onMouseLeave={() => setHoveredSource(null)}
              >
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full text-left flex items-center gap-2 text-white",
                    selectedSource === source.id ? "bg-primary/20 text-primary" : "hover:bg-white/10"
                  )}
                  onClick={() => handleSelect(source.id)}
                >
                  <Server className="h-4 w-4" />
                  {source.name}
                  {hoveredSource === source.id && (
                    <span className="text-xs text-gray-400 ml-auto">Select</span>
                  )}
                </Button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
};

// Mock EpisodeNavigation Component
const EpisodeNavigation = ({ episodes, currentEpisodeIndex, onPreviousEpisode, onNextEpisode }) => {
  const [showList, setShowList] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(currentEpisodeIndex);

  // Toggle episode list
  const toggleList = useCallback(() => {
    setShowList((prev) => !prev);
  }, []);

  // Handle episode selection
  const handleEpisodeSelect = useCallback((index: number) => {
    setSelectedEpisode(index);
    setShowList(false);
    // Simulate navigation
    if (index < currentEpisodeIndex) onPreviousEpisode();
    else if (index > currentEpisodeIndex) onNextEpisode();
  }, [currentEpisodeIndex, onPreviousEpisode, onNextEpisode]);

  const hasPrevious = currentEpisodeIndex > 0;
  const hasNext = currentEpisodeIndex < episodes.length - 1;

  return (
    <div className="flex flex-col space-y-4 bg-white/5 p-4 rounded-lg border border-white/10 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <Button
          disabled={!hasPrevious}
          onClick={onPreviousEpisode}
          variant="outline"
          className="flex-1 text-white border-white/20 hover:bg-white/10 disabled:opacity-50"
        >
          Previous Episode
        </Button>
        <Button
          onClick={toggleList}
          variant="outline"
          className="flex-1 text-white border-white/20 hover:bg-white/10"
        >
          Episodes <ChevronDown className={cn("ml-2 h-4 w-4", showList ? "rotate-180" : "")} />
        </Button>
        <Button
          disabled={!hasNext}
          onClick={onNextEpisode}
          variant="outline"
          className="flex-1 text-white border-white/20 hover:bg-white/10 disabled:opacity-50"
        >
          Next Episode
        </Button>
      </div>
      <AnimatePresence>
        {showList && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-gray-800 p-4 rounded-lg shadow-inner"
          >
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {episodes.map((ep, index) => (
                <li key={ep.id}>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full text-left text-white",
                      index === selectedEpisode ? "bg-primary/20 text-primary" : "hover:bg-white/10"
                    )}
                    onClick={() => handleEpisodeSelect(index)}
                  >
                    Episode {ep.number}: {ep.title}
                  </Button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Mock MediaActions Component
const MediaActions = ({ isFavorite, isInWatchlist, onToggleFavorite, onToggleWatchlist, onBack, onViewDetails }) => {
  const [favoriteFeedback, setFavoriteFeedback] = useState('');
  const [watchlistFeedback, setWatchlistFeedback] = useState('');

  // Handle favorite toggle
  const handleToggleFavorite = useCallback(() => {
    onToggleFavorite();
    setFavoriteFeedback(isFavorite ? 'Removed from favorites' : 'Added to favorites');
    setTimeout(() => setFavoriteFeedback(''), 2000);
  }, [isFavorite, onToggleFavorite]);

  // Handle watchlist toggle
  const handleToggleWatchlist = useCallback(() => {
    onToggleWatchlist();
    setWatchlistFeedback(isInWatchlist ? 'Removed from watchlist' : 'Added to watchlist');
    setTimeout(() => setWatchlistFeedback(''), 2000);
  }, [isInWatchlist, onToggleWatchlist]);

  return (
    <div className="flex flex-wrap gap-3 mb-6 bg-white/5 p-4 rounded-lg border border-white/10 shadow-sm">
      <Button
        variant="outline"
        onClick={onBack}
        className="text-white border-white/20 hover:bg-white/10"
      >
        <svg className="h-4 w-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Button>
      <Button
        variant="outline"
        onClick={handleToggleFavorite}
        className="text-white border-white/20 hover:bg-white/10"
      >
        {isFavorite ? 'Unfavorite' : 'Favorite'}
      </Button>
      {favoriteFeedback && <p className="text-sm text-green-500 self-center">{favoriteFeedback}</p>}
      <Button
        variant="outline"
        onClick={handleToggleWatchlist}
        className="text-white border-white/20 hover:bg-white/10"
      >
        {isInWatchlist ? 'Remove from Watchlist' : 'Add to Watchlist'}
      </Button>
      {watchlistFeedback && <p className="text-sm text-green-500 self-center">{watchlistFeedback}</p>}
      <Button
        variant="outline"
        onClick={onViewDetails}
        className="text-white border-white/20 hover:bg-white/10"
      >
        <ExternalLink className="h-4 w-4 mr-2" />
        Details
      </Button>
    </div>
  );
};

// Mock useMediaPlayer Hook
const useMediaPlayer = (id: string, season: string, episode: string, type: string) => {
  const [title, setTitle] = useState('Sample Media');
  const [mediaType, setMediaType] = useState(type || 'movie');
  const [mediaDetails, setMediaDetails] = useState({ backdrop_path: '/sample.jpg' });
  const [episodes, setEpisodes] = useState([
    { id: 'ep1', number: 1, title: 'Episode 1' },
    { id: 'ep2', number: 2, title: 'Episode 2' },
    { id: 'ep3', number: 3, title: 'Episode 3' },
  ]);
  const [currentEpisodeIndex, setCurrentEpisodeIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlayerLoaded, setIsPlayerLoaded] = useState(false);
  const [iframeUrl, setIframeUrl] = useState(videoSources[0].url);
  const [selectedSource, setSelectedSource] = useState(videoSources[0].id);
  const [isFavorite, setIsFavorite] = useState(false);
  const [isInMyWatchlist, setIsInMyWatchlist] = useState(false);

  // Simulate media fetch
  useEffect(() => {
    setIsLoading(true);
    const timer = setTimeout(() => {
      setTitle(`Media ${id}`);
      setMediaType(type);
      if (season && episode) {
        setCurrentEpisodeIndex(parseInt(episode) - 1);
      }
      setIsLoading(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, [id, type, season, episode]);

  // Update iframe URL on source change
  const handleSourceChange = useCallback((sourceId: string) => {
    const source = videoSources.find((s) => s.id === sourceId);
    if (source) {
      setSelectedSource(sourceId);
      setIframeUrl(source.url);
    }
  }, []);

  return {
    title,
    mediaType,
    mediaDetails,
    episodes,
    currentEpisodeIndex,
    isLoading,
    isPlayerLoaded,
    iframeUrl,
    selectedSource,
    isFavorite,
    isInMyWatchlist,
    handleSourceChange,
    goToDetails: () => console.log('Navigating to details page'),
    goToNextEpisode: () => setCurrentEpisodeIndex((prev) => Math.min(prev + 1, episodes.length - 1)),
    goToPreviousEpisode: () => setCurrentEpisodeIndex((prev) => Math.max(prev - 1, 0)),
    toggleFavorite: () => setIsFavorite((prev) => !prev),
    toggleWatchlist: () => setIsInMyWatchlist((prev) => !prev),
    handlePlayerLoaded: () => setIsPlayerLoaded(true),
    handlePlayerError: () => console.error('Player error occurred'),
    goBack: () => console.log('Navigating back'),
    setIframeUrl,
  };
};

// Mock useAuth Hook
const useAuth = () => {
  const [user, setUser] = useState<{ id: string; name: string } | null>(null);

  // Simulate auth check
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setUser({ id: 'user123', name: 'Test User' });
    }
  }, []);

  // Login simulation
  const login = useCallback((credentials: { username: string }) => {
    setUser({ id: 'user123', name: credentials.username });
    localStorage.setItem('authToken', 'mock-token');
  }, []);

  // Logout simulation
  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('authToken');
  }, []);

  return { user, login, logout };
};

// Mock videoSources
const videoSources = [
  { id: 'server1', name: 'Server 1 - Fast', url: 'https://server1.com/stream' },
  { id: 'server2', name: 'Server 2 - HD', url: 'https://server2.com/stream' },
  { id: 'server3', name: 'Server 3 - Backup', url: 'https://server3.com/stream' },
  { id: 'server4', name: 'Server 4 - Low Latency', url: 'https://server4.com/stream' },
  { id: 'server5', name: 'Server 5 - Stable', url: 'https://server5.com/stream' },
];

// Mock cn utility
const cn = (...classes: (string | boolean | undefined)[]) => classes.filter(Boolean).join(' ');

// --- [START] Party Watch Feature ---

// Interfaces
interface Message {
  id: string;
  username: string;
  text: string;
  timestamp: string;
  isHost: boolean;
}

interface Participant {
  username: string;
  isHost: boolean;
  audio: boolean;
  video: boolean;
}

interface Room {
  id: string;
  password: string;
  link: string;
  host: string;
}

// useUserMedia Hook
const useUserMedia = (requestedMedia: { video: boolean; audio: boolean }) => {
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isStreamRequested = useRef(false);

  useEffect(() => {
    // Stop stream if no media requested
    if (!requestedMedia.video && !requestedMedia.audio) {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        setMediaStream(null);
      }
      isStreamRequested.current = false;
      return;
    }

    if (isStreamRequested.current) return;

    const enableStream = async () => {
      isStreamRequested.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: requestedMedia.video,
          audio: requestedMedia.audio,
        });
        setMediaStream(stream);
      } catch (err) {
        console.error('Media access error:', err);
        setError('Could not access camera or microphone. Please check permissions and device availability.');
      }
    };

    enableStream();

    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach((track) => track.stop());
        setMediaStream(null);
      }
    };
  }, [requestedMedia.video, requestedMedia.audio, mediaStream]);

  return { mediaStream, error };
};

// ParticipantVideo Component
const ParticipantVideo = ({ participant, isLocalUser }: { participant: Participant; isLocalUser: boolean }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { mediaStream, error } = useUserMedia({ video: participant.video, audio: participant.audio });

  useEffect(() => {
    if (isLocalUser && videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
    }
  }, [mediaStream, isLocalUser]);

  return (
    <div className="relative aspect-video bg-black/60 rounded-lg overflow-hidden border-2 border-transparent hover:border-primary transition-all duration-300 shadow-md">
      <AnimatePresence>
        {participant.video && mediaStream && !error ? (
          <motion.video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalUser}
            className="w-full h-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        ) : (
          <motion.div
            className="w-full h-full flex items-center justify-center bg-gray-800"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Users className="h-12 w-12 text-gray-400" />
            {error && <p className="absolute bottom-2 text-sm text-red-500 font-medium">{error}</p>}
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
        <div className="flex items-center gap-2">
          {participant.isHost && <Crown className="h-4 w-4 text-yellow-400" />}
          <p className="text-sm font-medium text-white truncate">{participant.username}</p>
        </div>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <div className={cn("p-1.5 rounded-full shadow-sm", participant.audio ? "bg-transparent" : "bg-red-500/80")}>
          {participant.audio ? <Mic className="h-4 w-4 text-white" /> : <MicOff className="h-4 w-4 text-white" />}
        </div>
        <div className={cn("p-1.5 rounded-full shadow-sm", participant.video ? "bg-transparent" : "bg-red-500/80")}>
          {participant.video ? <Video className="h-4 w-4 text-white" /> : <VideoOff className="h-4 w-4 text-white" />}
        </div>
      </div>
    </div>
  );
};

// ChatMessage Component
const ChatMessage = ({ msg, currentUser }: { msg: Message; currentUser: Participant }) => {
  const isOwnMessage = msg.username === currentUser.username;
  return (
    <div className={cn("flex flex-col mb-3", isOwnMessage ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-xs sm:max-w-md rounded-lg px-3 py-2 shadow-sm",
          isOwnMessage ? "bg-primary text-primary-foreground rounded-br-none" : "bg-gray-700 text-white rounded-bl-none"
        )}
      >
        {!isOwnMessage && (
          <p className="text-xs font-bold text-cyan-300 mb-1 flex items-center gap-1.5">
            {msg.isHost && <Crown className="h-3 w-3 text-yellow-400" />}
            {msg.username}
          </p>
        )}
        <p className="text-sm break-words">{msg.text}</p>
      </div>
      <p className="text-xs text-gray-400 mt-1">{msg.timestamp}</p>
    </div>
  );
};

// PartyRoom Component
const PartyRoom = ({
  roomDetails,
  currentUser,
  participants,
  onLeave,
  onSendMessage,
  onToggleMedia,
}: {
  roomDetails: Room;
  currentUser: Participant;
  participants: Participant[];
  onLeave: () => void;
  onSendMessage: (msg: Message) => void;
  onToggleMedia: (type: 'audio' | 'video') => void;
}) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'participants'>('chat');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Initialize messages
  useEffect(() => {
    const initialMessages: Message[] = [
      {
        id: `sys-${roomDetails.id}`,
        username: 'System',
        text: `Welcome to Party Room ${roomDetails.id}! Share the link to invite friends.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isHost: false,
      },
      ...participants.map((p) => ({
        id: `join-${p.username}-${Date.now()}`,
        username: 'System',
        text: `${p.username} has joined the party.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isHost: false,
      })),
    ];
    setMessages(initialMessages);
  }, [roomDetails.id, participants]);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    const newMessage: Message = {
      id: `msg-${Date.now()}`,
      username: currentUser.username,
      text: message,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isHost: currentUser.isHost,
    };
    onSendMessage(newMessage);
    setMessages((prev) => [...prev, newMessage]);
    setMessage('');
  };

  // Copy room link
  const handleCopyLink = useCallback(() => {
    navigator.clipboard.writeText(roomDetails.link).then(() => {
      alert('Party link copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy link. Please try again.');
    });
  }, [roomDetails.link]);

  const localUser = participants.find((p) => p.username === currentUser.username);

  return (
    <motion.div
      className="absolute inset-0 bg-black/90 backdrop-blur-lg flex flex-col md:flex-row z-50 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Video Grid */}
      <div className="flex-grow p-4 flex flex-col">
        <div className="flex-grow grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-min">
          {participants.map((p) => (
            <ParticipantVideo
              key={p.username}
              participant={p}
              isLocalUser={p.username === currentUser.username}
            />
          ))}
        </div>
        <div className="flex-shrink-0 mt-4 p-4 bg-gray-900/60 rounded-lg shadow-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => onToggleMedia('audio')}
                      variant="outline"
                      size="icon"
                      className={cn(
                        "bg-gray-700 hover:bg-gray-600 border-gray-600",
                        !localUser?.audio && "bg-red-600 hover:bg-red-500"
                      )}
                    >
                      {localUser?.audio ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{localUser?.audio ? 'Mute Microphone' : 'Unmute Microphone'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => onToggleMedia('video')}
                      variant="outline"
                      size="icon"
                      className={cn(
                        "bg-gray-700 hover:bg-gray-600 border-gray-600",
                        !localUser?.video && "bg-red-600 hover:bg-red-500"
                      )}
                    >
                      {localUser?.video ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{localUser?.video ? 'Stop Camera' : 'Start Camera'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleCopyLink}
                variant="outline"
                className="bg-gray-700 hover:bg-gray-600 border-gray-600 text-white"
              >
                <Copy className="h-4 w-4 mr-2" />
                Copy Invite Link
              </Button>
              <Button
                onClick={onLeave}
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Leave Party
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar: Chat & Participants */}
      <div className="w-full md:w-80 lg:w-96 bg-gray-900/80 flex flex-col border-l border-gray-700/50 h-1/2 md:h-full shadow-inner">
        <div className="flex-shrink-0 border-b border-gray-700/50">
          <div className="flex">
            <button
              onClick={() => setActiveTab('chat')}
              className={cn(
                "flex-1 p-3 text-sm font-semibold flex items-center justify-center gap-2 text-white",
                activeTab === 'chat' && 'bg-primary/20 text-primary border-b-2 border-primary'
              )}
            >
              <Send className="h-4 w-4" /> Live Chat
            </button>
            <button
              onClick={() => setActiveTab('participants')}
              className={cn(
                "flex-1 p-3 text-sm font-semibold flex items-center justify-center gap-2 text-white",
                activeTab === 'participants' && 'bg-primary/20 text-primary border-b-2 border-primary'
              )}
            >
              <Users className="h-4 w-4" /> Participants ({participants.length})
            </button>
          </div>
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'chat' && (
            <motion.div
              key="chat"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 50 }}
              transition={{ duration: 0.3 }}
              className="flex-grow flex flex-col overflow-hidden"
            >
              <div className="flex-grow p-4 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
                {messages.map((msg) => (
                  <ChatMessage key={msg.id} msg={msg} currentUser={currentUser} />
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex-shrink-0 p-4 border-t border-gray-700/50">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Type a message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white focus:border-primary placeholder:text-gray-400 focus:ring-2 focus:ring-primary"
                  />
                  <Button type="submit" size="icon" className="bg-primary hover:bg-primary/90">
                    <Send className="h-5 w-5" />
                  </Button>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeTab === 'participants' && (
            <motion.div
              key="participants"
              initial={{ opacity: 0, x: -50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.3 }}
              className="flex-grow overflow-y-auto p-4 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800"
            >
              <h3 className="font-bold mb-4 text-white text-lg">Party Participants</h3>
              <ul className="space-y-3">
                {participants.map((p) => (
                  <li key={p.username} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold text-white shadow-sm">
                          {p.username.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className={cn(
                            "absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-gray-800",
                            p.video ? "bg-green-400" : "bg-gray-500"
                          )}
                        />
                      </div>
                      <span className="font-medium text-white">{p.username}</span>
                      {p.isHost && <Crown className="h-4 w-4 text-yellow-400" />}
                    </div>
                    <div className="flex items-center gap-3">
                      {p.audio ? <Mic className="h-4 w-4 text-gray-300" /> : <MicOff className="h-4 w-4 text-red-500" />}
                      {p.video ? <Video className="h-4 w-4 text-gray-300" /> : <VideoOff className="h-4 w-4 text-red-500" />}
                    </div>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

// PartyWatchOverlay Component
const PartyWatchOverlay = ({ onClose }: { onClose: () => void }) => {
  const [roomState, setRoomState] = useState<'idle' | 'creating' | 'joining' | 'in_room'>('idle');
  const [error, setError] = useState('');
  const [roomDetails, setRoomDetails] = useState<Room | null>(null);
  const [currentUser, setCurrentUser] = useState<Participant | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const partyIdFromUrl = searchParams.get('party');

  // Auto-join from URL
  useEffect(() => {
    if (partyIdFromUrl && !roomDetails) {
      setRoomDetails({
        id: partyIdFromUrl,
        password: 'password123', // Mock password for simulation
        link: window.location.href,
        host: 'HostUser',
      });
      setRoomState('joining');
    }
  }, [partyIdFromUrl, roomDetails]);

  // Create room
  const handleCreateRoom = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (!password.trim()) {
      setError('Password is required.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setError('');
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newRoomLink = `${window.location.origin}${window.location.pathname}?party=${newRoomId}`;
    const hostUser: Participant = { username, isHost: true, audio: false, video: false };

    setRoomDetails({
      id: newRoomId,
      password,
      link: newRoomLink,
      host: username,
    });
    setCurrentUser(hostUser);
    setParticipants([hostUser]);
    setRoomState('in_room');
    setSearchParams({ party: newRoomId });
  }, [username, password, setSearchParams]);

  // Join room
  const handleJoinRoom = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Username is required.');
      return;
    }
    if (!joinPassword.trim()) {
      setError('Password is required.');
      return;
    }
    if (!roomDetails || joinPassword !== roomDetails.password) {
      setError('Invalid password. Please try again.');
      return;
    }
    setError('');
    const newUser: Participant = { username, isHost: false, audio: false, video: false };
    setCurrentUser(newUser);
    setParticipants((prev) => [...prev, newUser]);
    setRoomState('in_room');
  }, [username, joinPassword, roomDetails]);

  // Leave room
  const handleLeaveRoom = useCallback(() => {
    setRoomState('idle');
    setRoomDetails(null);
    setCurrentUser(null);
    setParticipants([]);
    setUsername('');
    setPassword('');
    setJoinPassword('');
    setSearchParams({});
    onClose();
  }, [onClose, setSearchParams]);

  // Toggle media
  const handleToggleMedia = useCallback((type: 'audio' | 'video') => {
    setParticipants((prev) =>
      prev.map((p) =>
        p.username === currentUser?.username ? { ...p, [type]: !p[type] } : p
      )
    );
  }, [currentUser]);

  // Send message
  const handleSendMessage = useCallback((msg: Message) => {
    // Simulated; no backend
  }, []);

  const renderContent = () => {
    switch (roomState) {
      case 'in_room':
        return roomDetails && currentUser ? (
          <PartyRoom
            roomDetails={roomDetails}
            currentUser={currentUser}
            participants={participants}
            onLeave={handleLeaveRoom}
            onSendMessage={handleSendMessage}
            onToggleMedia={handleToggleMedia}
          />
        ) : null;

      case 'creating':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg border border-white/10 shadow-lg"
          >
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 text-gray-400 hover:text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </Button>
            <h2 className="text-2xl font-bold mb-2 text-center text-white">Create a Watch Party</h2>
            <p className="text-center text-gray-400 mb-6">Set a username and password to start your private room.</p>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <Input
                type="text"
                placeholder="Your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary"
                maxLength={20}
              />
              <Input
                type="password"
                placeholder="Room password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary"
              />
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white">
                <Clapperboard className="h-5 w-5 mr-2" />
                Create Room
              </Button>
              <Button
                variant="ghost"
                onClick={() => setRoomState('idle')}
                className="w-full text-gray-400 hover:text-white hover:bg-white/10"
              >
                Back
              </Button>
            </form>
          </motion.div>
        );

      case 'joining':
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg border border-white/10 shadow-lg"
          >
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 text-gray-400 hover:text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </Button>
            <h2 className="text-2xl font-bold mb-2 text-center text-white">Join a Watch Party</h2>
            <p className="text-center text-gray-400 mb-6">
              Room ID: <span className="font-mono text-primary">{roomDetails?.id || partyIdFromUrl}</span>
            </p>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <Input
                type="text"
                placeholder="Your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary"
                maxLength={20}
              />
              <Input
                type="password"
                placeholder="Room password"
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-400 focus:ring-2 focus:ring-primary"
              />
              {error && <p className="text-sm text-red-500 font-medium">{error}</p>}
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white">
                <Users className="h-5 w-5 mr-2" />
                Join Now
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setRoomState('idle');
                  handleLeaveRoom();
                }}
                className="w-full text-gray-400 hover:text-white hover:bg-white/10"
              >
                Back
              </Button>
            </form>
          </motion.div>
        );

      case 'idle':
      default:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md bg-gray-900/90 backdrop-blur-sm p-8 rounded-lg text-center border border-white/10 shadow-lg relative"
          >
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon"
              className="absolute top-3 right-3 text-gray-400 hover:text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </Button>
            <MonitorPlay className="mx-auto h-16 w-16 text-primary mb-4" />
            <h2 className="text-3xl font-bold mb-2 text-white">Watch Party</h2>
            <p className="text-gray-400 mb-8 text-sm">Watch together with friends in real-time. Create or join a room to start.</p>
            <div className="flex flex-col space-y-3">
              <Button
                onClick={() => setRoomState('creating')}
                className="w-full text-lg py-6 bg-primary hover:bg-primary/90 text-white"
              >
                <Clapperboard className="h-5 w-5 mr-2" />
                Create a Room
              </Button>
              <Button
                onClick={() => setRoomState('joining')}
                variant="outline"
                className="w-full text-lg py-6 border-primary/50 text-primary hover:bg-primary/10"
              >
                <Users className="h-5 w-5 mr-2" />
                Join a Room
              </Button>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {roomState !== 'in_room' ? renderContent() : <AnimatePresence>{renderContent()}</AnimatePresence>}
    </motion.div>
  );
};

// Main Player Component
const Player = () => {
  const { id, season, episode, type } = useParams<{
    id: string;
    season?: string;
    episode?: string;
    type: string;
  }>();
  const { user } = useAuth();
  const mediaPlayer = useMediaPlayer(id!, season, episode, type!);
  const [isPartyWatchOpen, setIsPartyWatchOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open Party Watch if URL has party param
  useEffect(() => {
    if (searchParams.has('party')) {
      setIsPartyWatchOpen(true);
    }
  }, [searchParams]);

  const posterUrl = mediaPlayer.mediaDetails
    ? `https://image.tmdb.org/t/p/w1280${mediaPlayer.mediaDetails.backdrop_path}`
    : undefined;

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="min-h-screen bg-background relative"
      >
        <div className="fixed inset-0 bg-gradient-to-b from-background/95 to-background pointer-events-none z-10" />
        <motion.nav
          initial={{ y: -100 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5 }}
          className="sticky top-0 z-30"
        >
          <Navbar />
        </motion.nav>
        <main className="container mx-auto py-8 relative z-20">
          <MediaActions
            isFavorite={mediaPlayer.isFavorite}
            isInWatchlist={mediaPlayer.isInMyWatchlist}
            onToggleFavorite={mediaPlayer.toggleFavorite}
            onToggleWatchlist={mediaPlayer.toggleWatchlist}
            onBack={mediaPlayer.goBack}
            onViewDetails={mediaPlayer.goToDetails}
          />
          <VideoPlayer
            isLoading={mediaPlayer.isLoading}
            iframeUrl={mediaPlayer.iframeUrl}
            title={mediaPlayer.title}
            poster={posterUrl}
            onLoaded={mediaPlayer.handlePlayerLoaded}
            onError={mediaPlayer.handlePlayerError}
          />
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="mt-6 space-y-6"
          >
            {/* Collaboration Options */}
            <div className="bg-white/10 p-6 rounded-lg border border-white/20 shadow-md">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Watch Together</h3>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsPartyWatchOpen(true)}
                        className="text-white border-white/20 hover:bg-white/10"
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        More Settings
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Manage party settings</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Button
                  onClick={() => setIsPartyWatchOpen(true)}
                  className="bg-primary hover:bg-primary/90 text-white"
                >
                  <Clapperboard className="h-4 w-4 mr-2" />
                  Create Room
                </Button>
                <Button
                  onClick={() => setIsPartyWatchOpen(true)}
                  variant="outline"
                  className="text-primary border-primary/50 hover:bg-primary/10"
                >
                  <Users className="h-4 w-4 mr-2" />
                  Join Room
                </Button>
                <Button
                  onClick={() => console.log('Screen share not implemented in simulation')}
                  variant="outline"
                  className="text-white border-white/20 hover:bg-white/10"
                >
                  <MonitorPlay className="h-4 w-4 mr-2" />
                  Share Screen
                </Button>
                <Button
                  onClick={() => console.log('Voice call not implemented in simulation')}
                  variant="outline"
                  className="text-white border-white/20 hover:bg-white/10"
                >
                  <Mic className="h-4 w-4 mr-2" />
                  Voice Call
                </Button>
              </div>
            </div>
            {mediaPlayer.mediaType === 'tv' && mediaPlayer.episodes.length > 0 && (
              <EpisodeNavigation
                episodes={mediaPlayer.episodes}
                currentEpisodeIndex={mediaPlayer.currentEpisodeIndex}
                onPreviousEpisode={mediaPlayer.goToPreviousEpisode}
                onNextEpisode={mediaPlayer.goToNextEpisode}
              />
            )}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-medium text-white">Video Sources</h3>
                  <p className="text-sm text-white/60">Choose a streaming server</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-white border-white/20 hover:bg-white/10"
                  onClick={mediaPlayer.goToDetails}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Details
                </Button>
              </div>
              <VideoSourceSelector
                videoSources={videoSources}
                selectedSource={mediaPlayer.selectedSource}
                onSourceChange={mediaPlayer.handleSourceChange}
              />
            </div>
          </motion.div>
        </main>
      </motion.div>
      <AnimatePresence>
        {isPartyWatchOpen && <PartyWatchOverlay onClose={() => setIsPartyWatchOpen(false)} />}
      </AnimatePresence>
    </>
  );
};

export default Player;
