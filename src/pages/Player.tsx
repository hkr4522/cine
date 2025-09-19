import { useParams, Navigate } from 'react-router-dom';
import {
  ExternalLink,
  Users,
  MessageSquare,
  Mic,
  Video,
  Share2,
  Lock,
  X,
  Copy,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import Navbar from '@/components/Navbar';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import VideoSourceSelector from '@/components/player/VideoSourceSelector';
import EpisodeNavigation from '@/components/player/EpisodeNavigation';
import MediaActions from '@/components/player/MediaActions';
import { useMediaPlayer } from '@/hooks/use-media-player';
import { useAuth } from '@/hooks';
import { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { videoSources } from '@/utils/video-sources';
import { cn } from '@/lib/utils';

// Initialize Socket.IO client with reconnection settings for robust connectivity
const socket = io('http://your-backend-server:3000', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
  transports: ['websocket'],
});

// Animation variants for smooth UI transitions
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
};

const modalVariants = {
  hidden: { scale: 0.8, opacity: 0, y: 50 },
  visible: { scale: 1, opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
  exit: { scale: 0.8, opacity: 0, y: 50, transition: { duration: 0.2, ease: 'easeIn' } },
};

const chatMessageVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
};

// Interfaces for type safety
interface ChatMessage {
  userId: string;
  username: string;
  message: string;
  type?: string;
  timestamp: number;
}

interface PeerConnection {
  userId: string;
  peer: Peer.Instance;
}

interface Participant {
  id: string;
  username: string;
}

const Player = () => {
  // Route parameters for media playback
  const { id, season, episode, type } = useParams<{
    id: string;
    season?: string;
    episode?: string;
    type: string;
  }>();

  // Authentication hook for user data
  const { user, isLoading: isAuthLoading } = useAuth();

  // Media player hook for playback controls and data
  const {
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
    goToDetails,
    goToNextEpisode,
    goToPreviousEpisode,
    toggleFavorite,
    toggleWatchlist,
    handlePlayerLoaded,
    handlePlayerError,
    goBack,
  } = useMediaPlayer(id, season, episode, type);

  // Poster URL for video player
  const posterUrl = mediaDetails
    ? `https://image.tmdb.org/t/p/w1280${mediaDetails.backdrop_path}`
    : undefined;

  // State for Party Watch feature
  const [isPartyWatchOpen, setIsPartyWatchOpen] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinRoomPassword, setJoinRoomPassword] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [isVideoChatActive, setIsVideoChatActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peers, setPeers] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState('');
  const [isRoomCreated, setIsRoomCreated] = useState(false);
  const [isSocketConnected, setIsSocketConnected] = useState(socket.connected);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isLoadingRoom, setIsLoadingRoom] = useState(false);
  const [isServiceWorkerError, setIsServiceWorkerError] = useState(false);

  // References for DOM elements and WebRTC streams
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareRef = useRef<HTMLVideoElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<PeerConnection[]>([]);

  // Check for service worker support
  useEffect(() => {
    if (!navigator.serviceWorker) {
      setIsServiceWorkerError(true);
      setError('Service worker not supported. Some features may be unavailable.');
      toast.error('Service worker not supported');
    }
  }, []);

  // Redirect to login if user is not authenticated
  if (!isAuthLoading && !user) {
    toast.error('Please log in to access Party Watch');
    return <Navigate to="/login" replace />;
  }

  // Generate random room ID
  const generateRoomId = useCallback(() => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }, []);

  // Create a new room
  const createRoom = useCallback(() => {
    if (!user) {
      setError('Authentication required to create a room');
      toast.error('Please log in to create a room');
      return;
    }
    if (!roomPassword.trim()) {
      setError('Please enter a password to create a room');
      toast.error('Password is required');
      return;
    }
    setIsLoadingRoom(true);
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    setIsRoomCreated(true);
    socket.emit('create-room', {
      roomId: newRoomId,
      password: roomPassword,
      userId: user.id,
      username: user.username || 'Anonymous',
    });
  }, [roomPassword, user]);

  // Join an existing room
  const joinRoom = useCallback(() => {
    if (!user) {
      setError('Authentication required to join a room');
      toast.error('Please log in to join a room');
      return;
    }
    if (!joinRoomId.trim() || !joinRoomPassword.trim()) {
      setError('Room ID and password are required');
      toast.error('Room ID and password are required');
      return;
    }
    setIsLoadingRoom(true);
    socket.emit('join-room', {
      roomId: joinRoomId,
      password: joinRoomPassword,
      userId: user.id,
      username: user.username || 'Anonymous',
    });
  }, [joinRoomId, joinRoomPassword, user]);

  // Initialize WebRTC for voice/video communication
  const initWebRTC = useCallback(async () => {
    if (!user) {
      setError('Authentication required for voice/video chat');
      toast.error('Please log in to use voice/video chat');
      return;
    }
    try {
      const constraints = {
        video: isVideoChatActive,
        audio: isVoiceChatActive,
      };
      localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      socket.emit('webrtc-offer', { roomId, userId: user.id });
      toast.success('WebRTC initialized successfully');
    } catch (err) {
      setError(`Failed to initialize WebRTC: ${err.message}`);
      toast.error(`WebRTC error: ${err.message}`);
    }
  }, [isVideoChatActive, isVoiceChatActive, roomId, user]);

  // Start screen sharing
  const startScreenSharing = useCallback(async () => {
    if (!user) {
      setError('Authentication required for screen sharing');
      toast.error('Please log in to share your screen');
      return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });
      setIsScreenSharing(true);
      if (screenShareRef.current) {
        screenShareRef.current.srcObject = screenStream;
      }

      // Update WebRTC peers with screen stream
      peersRef.current.forEach(({ peer }) => {
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        } else if (localStreamRef.current) {
          peer.addTrack(videoTrack, localStreamRef.current);
        }
      });

      // Handle screen share end
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenSharing();
      };
      toast.success('Screen sharing started');
    } catch (err) {
      setError(`Failed to start screen sharing: ${err.message}`);
      toast.error(`Screen sharing error: ${err.message}`);
    }
  }, [user]);

  // Stop screen sharing
  const stopScreenSharing = useCallback(async () => {
    if (screenShareRef.current?.srcObject) {
      (screenShareRef.current.srcObject as MediaStream).getTracks().forEach((track) => track.stop());
      screenShareRef.current.srcObject = null;
      setIsScreenSharing(false);

      if (isVideoChatActive && localStreamRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          localStreamRef.current.addTrack(stream.getVideoTracks()[0]);
          peersRef.current.forEach(({ peer }) => {
            const videoTrack = stream.getVideoTracks()[0];
            const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
          toast.success('Screen sharing stopped, video restored');
        } catch (err) {
          setError(`Failed to restore video stream: ${err.message}`);
          toast.error(`Video restore error: ${err.message}`);
        }
      } else {
        toast.success('Screen sharing stopped');
      }
    }
  }, [isVideoChatActive]);

  // Toggle voice chat
  const toggleVoiceChat = useCallback(async () => {
    if (!user) {
      setError('Authentication required for voice chat');
      toast.error('Please log in to use voice chat');
      return;
    }
    if (!isVoiceChatActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!localStreamRef.current) {
          localStreamRef.current = new MediaStream();
        }
        localStreamRef.current.addTrack(stream.getAudioTracks()[0]);
        peersRef.current.forEach(({ peer }) => {
          const audioTrack = stream.getAudioTracks()[0];
          const sender = peer.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) {
            sender.replaceTrack(audioTrack);
          } else {
            peer.addTrack(audioTrack, localStreamRef.current!);
          }
        });
        setIsVoiceChatActive(true);
        toast.success('Voice chat enabled');
      } catch (err) {
        setError(`Failed to start voice chat: ${err.message}`);
        toast.error(`Voice chat error: ${err.message}`);
      }
    } else {
      localStreamRef.current?.getAudioTracks().forEach((track) => track.stop());
      setIsVoiceChatActive(false);
      toast.info('Voice chat disabled');
    }
  }, [isVoiceChatActive, user]);

  // Toggle video chat
  const toggleVideoChat = useCallback(async () => {
    if (!user) {
      setError('Authentication required for video chat');
      toast.error('Please log in to use video chat');
      return;
    }
    if (!isVideoChatActive) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (!localStreamRef.current) {
          localStreamRef.current = new MediaStream();
        }
        localStreamRef.current.addTrack(stream.getVideoTracks()[0]);
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
        }
        peersRef.current.forEach(({ peer }) => {
          const videoTrack = stream.getVideoTracks()[0];
          const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          } else {
            peer.addTrack(videoTrack, localStreamRef.current!);
          }
        });
        setIsVideoChatActive(true);
        toast.success('Video chat enabled');
      } catch (err) {
        setError(`Failed to start video chat: ${err.message}`);
        toast.error(`Video chat error: ${err.message}`);
      }
    } else {
      localStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
      setIsVideoChatActive(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      toast.info('Video chat disabled');
    }
  }, [isVideoChatActive, user]);

  // Send chat message
  const sendChatMessage = useCallback(() => {
    if (!user) {
      setError('Authentication required to send messages');
      toast.error('Please log in to send messages');
      return;
    }
    if (chatInput.trim()) {
      const message: ChatMessage = {
        roomId,
        userId: user.id,
        username: user.username || 'Anonymous',
        message: chatInput,
        timestamp: Date.now(),
      };
      socket.emit('chat-message', message);
      setChatInput('');
    }
  }, [chatInput, roomId, user]);

  // Copy room ID to clipboard
  const copyRoomId = useCallback(() => {
    navigator.clipboard.writeText(roomId).then(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          userId: '',
          username: 'System',
          message: 'Room ID copied to clipboard',
          type: 'system',
          timestamp: Date.now(),
        },
      ]);
      toast.success('Room ID copied');
    });
  }, [roomId]);

  // Handle Socket.IO events
  useEffect(() => {
    // Socket connection status
    socket.on('connect', () => {
      setIsSocketConnected(true);
      toast.info('Connected to server');
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
      setError('Disconnected from server. Attempting to reconnect...');
      toast.error('Disconnected from server');
    });

    // Room joined successfully
    socket.on('room-joined', ({ roomId, users }) => {
      setRoomId(roomId);
      setIsPartyWatchOpen(true);
      setIsLoadingRoom(false);
      setError('');
      setParticipants(users);
      initWebRTC();
      setChatMessages((prev) => [
        ...prev,
        {
          userId: '',
          username: 'System',
          message: `Joined room ${roomId}`,
          type: 'system',
          timestamp: Date.now(),
        },
      ]);
      toast.success(`Joined room ${roomId}`);
    });

    // Room error
    socket.on('room-error', ({ message }) => {
      setError(message);
      setIsRoomCreated(false);
      setIsLoadingRoom(false);
      toast.error(message);
    });

    // Receive chat message
    socket.on('chat-message', ({ userId, username, message, timestamp }) => {
      setChatMessages((prev) => [...prev, { userId, username, message, timestamp }]);
    });

    // User joined room
    socket.on('user-joined', ({ userId, username }) => {
      setChatMessages((prev) => [
        ...prev,
        {
          userId,
          username,
          message: `${username} joined the room`,
          type: 'system',
          timestamp: Date.now(),
        },
      ]);
      setParticipants((prev) => [...prev, { id: userId, username }]);
      toast.info(`${username} joined the room`);
    });

    // User left room
    socket.on('user-left', ({ userId, username }) => {
      setChatMessages((prev) => [
        ...prev,
        {
          userId,
          username,
          message: `${username} left the room`,
          type: 'system',
          timestamp: Date.now(),
        },
      ]);
      setParticipants((prev) => prev.filter((p) => p.id !== userId));
      const peer = peersRef.current.find((p) => p.userId === userId);
      if (peer) {
        peer.peer.destroy();
        peersRef.current = peersRef.current.filter((p) => p.userId !== userId);
        setPeers((prev) => {
          const newPeers = { ...prev };
          delete newPeers[userId];
          return newPeers;
        });
      }
      toast.info(`${username} left the room`);
    });

    // WebRTC offer
    socket.on('webrtc-offer', ({ from, offer }) => {
      if (!user) return;
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: localStreamRef.current || undefined,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            // Add TURN server for production
          ],
        },
      });

      peer.on('signal', (data) => {
        socket.emit('webrtc-answer', { to: from, answer: data, roomId });
      });

      peer.on('stream', (stream) => {
        setPeers((prev) => ({
          ...prev,
          [from]: stream,
        }));
      });

      peer.on('error', (err) => {
        setError(`WebRTC peer error: ${err.message}`);
        toast.error(`WebRTC peer error: ${err.message}`);
      });

      peer.signal(offer);
      peersRef.current.push({ userId: from, peer });
    });

    // WebRTC answer
    socket.on('webrtc-answer', ({ from, answer }) => {
      const peer = peersRef.current.find((p) => p.userId === from);
      if (peer) {
        peer.peer.signal(answer);
      }
    });

    // Cleanup socket listeners
    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room-joined');
      socket.off('room-error');
      socket.off('chat-message');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
    };
  }, [roomId, initWebRTC, user]);

  // Auto-scroll chat container
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      peersRef.current.forEach(({ peer }) => peer.destroy());
      if (roomId && user) {
        socket.emit('leave-room', { roomId, userId: user.id });
      }
      socket.disconnect();
    };
  }, [roomId, user]);

  // Render participant list
  const renderParticipantList = () => (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-white mb-2">Participants ({participants.length})</h4>
      <ScrollArea className="h-24">
        {participants.length === 0 ? (
          <p className="text-white/60 text-sm">No participants yet</p>
        ) : (
          <ul className="space-y-2">
            {participants.map((participant) => (
              <li
                key={participant.id}
                className="text-white/80 text-sm flex items-center"
              >
                <span className="h-2 w-2 bg-green-500 rounded-full mr-2"></span>
                {participant.username}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-background relative"
    >
      {/* Background Gradient for Visual Depth */}
      <div className="fixed inset-0 bg-gradient-to-b from-background/95 to-background pointer-events-none" />

      {/* Navbar */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-30"
      >
        <Navbar />
      </motion.nav>

      {/* Main Content */}
      <div className="container mx-auto py-8">
        {/* Media Actions */}
        <MediaActions
          isFavorite={isFavorite}
          isInWatchlist={isInMyWatchlist}
          onToggleFavorite={toggleFavorite}
          onToggleWatchlist={toggleWatchlist}
          onBack={goBack}
          onViewDetails={goToDetails}
        />

        {/* Video Player with Screen Sharing Overlay */}
        <div className="relative">
          <VideoPlayer
            isLoading={isLoading}
            iframeUrl={iframeUrl}
            title={title}
            poster={posterUrl}
            onLoaded={handlePlayerLoaded}
            onError={handlePlayerError}
          />
          <AnimatePresence>
            {isScreenSharing && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute top-0 left-0 w-full h-full bg-black/90 flex items-center justify-center"
              >
                <video
                  ref={screenShareRef}
                  autoPlay
                  className="w-full h-full object-contain rounded-lg"
                />
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="destructive"
                        size="sm"
                        className="absolute top-4 right-4"
                        onClick={stopScreenSharing}
                      >
                        Stop Sharing
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>End screen sharing</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Controls and Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mt-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300',
                      (!isSocketConnected || isServiceWorkerError || !user) && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => user && setIsPartyWatchOpen(true)}
                    disabled={!isSocketConnected || isServiceWorkerError || !user}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Party Watch
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {user
                      ? 'Start or join a watch party'
                      : 'Please log in to use Party Watch'}
                  </p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300',
                      (isScreenSharing || !roomId || isServiceWorkerError || !user) && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={startScreenSharing}
                    disabled={isScreenSharing || !roomId || isServiceWorkerError || !user}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    {isScreenSharing ? 'Sharing Screen' : 'Share Screen'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>
                    {user
                      ? isScreenSharing
                        ? 'Screen is being shared'
                        : 'Share your screen with the room'
                      : 'Please log in to share your screen'}
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Episode Navigation for TV Shows */}
          {mediaType === 'tv' && episodes.length > 0 && (
            <EpisodeNavigation
              episodes={episodes}
              currentEpisodeIndex={currentEpisodeIndex}
              onPreviousEpisode={goToPreviousEpisode}
              onNextEpisode={goToNextEpisode}
            />
          )}

          {/* Video Source Selector */}
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-medium text-white">Video Sources</h3>
                <p className="text-sm text-white/60">Select your preferred streaming source</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 mt-2 sm:mt-0"
                onClick={goToDetails}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                View Details
              </Button>
            </div>
            <VideoSourceSelector
              videoSources={videoSources}
              selectedSource={selectedSource}
              onSourceChange={handleSourceChange}
            />
          </div>
        </motion.div>
      </div>

      {/* Party Watch Overlay */}
      <AnimatePresence>
        {isPartyWatchOpen && user && (
          <motion.div
            variants={overlayVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          >
            <motion.div
              variants={modalVariants}
              className="bg-background rounded-lg shadow-lg w-full max-w-5xl h-[90vh] flex flex-col md:flex-row overflow-hidden"
            >
              {/* Room Management Section */}
              <div className="w-full md:w-1/3 p-6 border-r border-white/10">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-white">Party Watch</h2>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (roomId && user) {
                              socket.emit('leave-room', { roomId, userId: user.id });
                              setRoomId('');
                              setChatMessages([]);
                              setIsVoiceChatActive(false);
                              setIsVideoChatActive(false);
                              stopScreenSharing();
                              setParticipants([]);
                            }
                            setIsPartyWatchOpen(false);
                            setIsRoomCreated(false);
                            setRoomPassword('');
                            setJoinRoomId('');
                            setJoinRoomPassword('');
                            setError('');
                          }}
                        >
                          <X className="h-5 w-5 text-white" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Close Party Watch</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                {error && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-red-500 mb-4 p-3 bg-red-500/10 rounded flex items-center"
                  >
                    <AlertCircle className="h-5 w-5 mr-2" />
                    {error}
                  </motion.div>
                )}
                {!roomId ? (
                  <div className="space-y-6">
                    {/* Create Room */}
                    <div>
                      <h3 className="text-lg font-medium text-white mb-2">Create a New Room</h3>
                      <p className="text-sm text-white/60 mb-2">
                        Create a private room to watch together with friends
                      </p>
                      <Input
                        type="password"
                        placeholder="Enter room password"
                        value={roomPassword}
                        onChange={(e) => setRoomPassword(e.target.value)}
                        className="mb-3 bg-white/5 border-white/10 text-white"
                        disabled={isLoadingRoom || isServiceWorkerError}
                      />
                      <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 transition-all duration-200"
                        onClick={createRoom}
                        disabled={!roomPassword.trim() || isLoadingRoom || isServiceWorkerError}
                      >
                        {isLoadingRoom ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Lock className="h-4 w-4 mr-2" />
                        )}
                        Create Room
                      </Button>
                    </div>
                    {/* Join Room */}
                    <div>
                      <h3 className="text-lg font-medium text-white mb-2">Join an Existing Room</h3>
                      <p className="text-sm text-white/60 mb-2">
                        Enter the room ID and password to join a watch party
                      </p>
                      <Input
                        type="text"
                        placeholder="Enter room ID"
                        value={joinRoomId}
                        onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                        className="mb-3 bg-white/5 border-white/10 text-white"
                        disabled={isLoadingRoom || isServiceWorkerError}
                      />
                      <Input
                        type="password"
                        placeholder="Enter room password"
                        value={joinRoomPassword}
                        onChange={(e) => setJoinRoomPassword(e.target.value)}
                        className="mb-3 bg-white/5 border-white/10 text-white"
                        disabled={isLoadingRoom || isServiceWorkerError}
                      />
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700 transition-all duration-200"
                        onClick={joinRoom}
                        disabled={!joinRoomId.trim() || !joinRoomPassword.trim() || isLoadingRoom || isServiceWorkerError}
                      >
                        {isLoadingRoom ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Users className="h-4 w-4 mr-2" />
                        )}
                        Join Room
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-white/5 p-4 rounded-lg">
                      <p className="text-white font-medium">
                        Room ID: <span className="font-bold">{roomId}</span>
                      </p>
                      <p className="text-white/60 text-sm mt-1">
                        Share this ID and password with others to join
                      </p>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 w-full border-white/10 bg-white/5 hover:bg-white/10"
                              onClick={copyRoomId}
                            >
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Room ID
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Copy room ID to clipboard</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    {renderParticipantList()}
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        if (user) {
                          socket.emit('leave-room', { roomId, userId: user.id });
                          setRoomId('');
                          setChatMessages([]);
                          setIsVoiceChatActive(false);
                          setIsVideoChatActive(false);
                          stopScreenSharing();
                          setIsRoomCreated(false);
                          setRoomPassword('');
                          setParticipants([]);
                          toast.info('Left the room');
                        }
                      }}
                    >
                      Leave Room
                    </Button>
                  </div>
                )}
              </div>

              {/* Chat and Video Section */}
              <div className="w-full md:w-2/3 p-6 flex flex-col">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-medium text-white">Room Interaction</h3>
                  <div className="flex space-x-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isVoiceChatActive ? 'destructive' : 'outline'}
                            size="sm"
                            className="border-white/10 bg-white/5 hover:bg-white/10"
                            onClick={toggleVoiceChat}
                            disabled={!roomId || isServiceWorkerError || !user}
                          >
                            <Mic className="h-4 w-4 mr-2" />
                            {isVoiceChatActive ? 'Stop Voice' : 'Start Voice'}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{user ? (isVoiceChatActive ? 'Disable voice chat' : 'Enable voice chat') : 'Please log in'}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isVideoChatActive ? 'destructive' : 'outline'}
                            size="sm"
                            className="border-white/10 bg-white/5 hover:bg-white/10"
                            onClick={toggleVideoChat}
                            disabled={!roomId || isServiceWorkerError || !user}
                          >
                            <Video className="h-4 w-4 mr-2" />
                            {isVideoChatActive ? 'Stop Video' : 'Start Video'}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{user ? (isVideoChatActive ? 'Disable video chat' : 'Enable video chat') : 'Please log in'}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>

                {/* Video Streams */}
                <ScrollArea className="flex flex-wrap gap-3 mb-4 h-32">
                  {isVideoChatActive && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-40 h-28 bg-black rounded-lg overflow-hidden relative"
                    >
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-2 py-1 rounded">
                        You
                      </span>
                    </motion.div>
                  )}
                  {Object.keys(peers).map((peerId) => (
                    <motion.div
                      key={peerId}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-40 h-28 bg-black rounded-lg overflow-hidden relative"
                    >
                      <video
                        ref={(el) => {
                          if (el && peers[peerId]) el.srcObject = peers[peerId];
                        }}
                        autoPlay
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-2 py-1 rounded">
                        {participants.find((p) => p.id === peerId)?.username || `User ${peerId.slice(0, 4)}`}
                      </span>
                    </motion.div>
                  ))}
                </ScrollArea>

                {/* Chat Area */}
                <ScrollArea className="flex-1 p-4 bg-white/5 rounded-lg mb-4">
                  {chatMessages.length === 0 && (
                    <p className="text-white/60 text-center py-4">No messages yet. Start chatting!</p>
                  )}
                  {chatMessages.map((msg, index) => (
                    <motion.div
                      key={index}
                      variants={chatMessageVariants}
                      initial="hidden"
                      animate="visible"
                      className={cn(
                        'mb-3 p-3 rounded-lg',
                        msg.type === 'system'
                          ? 'text-white/60 bg-white/5'
                          : msg.userId === user?.id
                          ? 'bg-blue-600/20 text-white ml-auto max-w-[80%]'
                          : 'bg-white/10 text-white max-w-[80%]'
                      )}
                    >
                      <div className="flex justify-between items-baseline">
                        <span className="font-medium text-sm">
                          {msg.type === 'system' ? 'System' : msg.username}
                        </span>
                        <span className="text-xs text-white/50">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <span>{msg.message}</span>
                    </motion.div>
                  ))}
                  <div ref={chatContainerRef} />
                </ScrollArea>

                {/* Chat Input */}
                <div className="flex items-center">
                  <Textarea
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    className="flex-1 bg-white/5 border-white/10 text-white resize-none h-12"
                    disabled={!roomId || isServiceWorkerError || !user}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendChatMessage();
                      }
                    }}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="ml-2 bg-blue-600 hover:bg-blue-700"
                          onClick={sendChatMessage}
                          disabled={!roomId || !chatInput.trim() || isServiceWorkerError || !user}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{user ? 'Send message' : 'Please log in to send messages'}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default Player;
