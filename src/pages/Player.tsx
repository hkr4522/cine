import { useParams } from 'react-router-dom';
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
  Wifi,
  WifiOff,
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
import io, { Socket } from 'socket.io-client';
import Peer from 'simple-peer';
import { videoSources } from '@/utils/video-sources';
import { cn } from '@/lib/utils';
import { v4 as uuidv4 } from 'uuid';

// Initialize Socket.IO client with reconnection settings
const socket: Socket = io('http://your-backend-server:3000', {
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
  const [tempUserId] = useState(user?.id || uuidv4()); // Generate temp ID for guests
  const [tempUsername] = useState(user?.username || `Guest_${tempUserId.slice(0, 4)}`);

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
      setError('Service worker not supported. Some features may be limited.');
      toast.warning('Service worker not supported');
      console.warn('Service worker not supported');
    }
  }, []);

  // Generate random room ID
  const generateRoomId = useCallback(() => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  }, []);

  // Create a new room
  const createRoom = useCallback(() => {
    if (!roomPassword.trim()) {
      setError('Please enter a password to create a room');
      toast.error('Password is required');
      console.error('Create room failed: Password missing');
      return;
    }
    setIsLoadingRoom(true);
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    setIsRoomCreated(true);
    socket.emit('create-room', {
      roomId: newRoomId,
      password: roomPassword,
      userId: tempUserId,
      username: tempUsername,
    });
    console.log('Creating room:', { roomId: newRoomId, userId: tempUserId });
  }, [roomPassword, tempUserId, tempUsername]);

  // Join an existing room
  const joinRoom = useCallback(() => {
    if (!joinRoomId.trim() || !joinRoomPassword.trim()) {
      setError('Room ID and password are required');
      toast.error('Room ID and password are required');
      console.error('Join room failed: Missing room ID or password');
      return;
    }
    setIsLoadingRoom(true);
    socket.emit('join-room', {
      roomId: joinRoomId,
      password: joinRoomPassword,
      userId: tempUserId,
      username: tempUsername,
    });
    console.log('Joining room:', { roomId: joinRoomId, userId: tempUserId });
  }, [joinRoomId, joinRoomPassword, tempUserId, tempUsername]);

  // Initialize WebRTC for voice/video communication
  const initWebRTC = useCallback(async () => {
    try {
      const constraints = {
        video: isVideoChatActive,
        audio: isVoiceChatActive,
      };
      localStreamRef.current = await navigator.mediaDevices.getUserMedia(constraints);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      socket.emit('webrtc-offer', { roomId, userId: tempUserId });
      console.log('WebRTC initialized for user:', tempUserId);
      toast.success('WebRTC initialized successfully');
    } catch (err) {
      setError(`Failed to initialize WebRTC: ${err.message}`);
      toast.error(`WebRTC error: ${err.message}`);
      console.error('WebRTC initialization error:', err);
    }
  }, [isVideoChatActive, isVoiceChatActive, roomId, tempUserId]);

  // Start screen sharing
  const startScreenSharing = useCallback(async () => {
    console.log('Screen share button clicked, attempting to start sharing');
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
      console.log('Screen sharing started for user:', tempUserId);
      toast.success('Screen sharing started');
    } catch (err) {
      setError(`Failed to start screen sharing: ${err.message}`);
      toast.error(`Screen sharing error: ${err.message}`);
      console.error('Screen sharing error:', err);
    }
  }, [tempUserId]);

  // Stop screen sharing
  const stopScreenSharing = useCallback(async () => {
    console.log('Stopping screen sharing');
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
          console.log('Screen sharing stopped, video restored');
          toast.success('Screen sharing stopped, video restored');
        } catch (err) {
          setError(`Failed to restore video stream: ${err.message}`);
          toast.error(`Video restore error: ${err.message}`);
          console.error('Video restore error:', err);
        }
      } else {
        console.log('Screen sharing stopped');
        toast.success('Screen sharing stopped');
      }
    }
  }, [isVideoChatActive]);

  // Toggle voice chat
  const toggleVoiceChat = useCallback(async () => {
    console.log('Voice chat button clicked, active:', !isVoiceChatActive);
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
        console.log('Voice chat enabled for user:', tempUserId);
        toast.success('Voice chat enabled');
      } catch (err) {
        setError(`Failed to start voice chat: ${err.message}`);
        toast.error(`Voice chat error: ${err.message}`);
        console.error('Voice chat error:', err);
      }
    } else {
      localStreamRef.current?.getAudioTracks().forEach((track) => track.stop());
      setIsVoiceChatActive(false);
      console.log('Voice chat disabled');
      toast.info('Voice chat disabled');
    }
  }, [isVoiceChatActive, tempUserId]);

  // Toggle video chat
  const toggleVideoChat = useCallback(async () => {
    console.log('Video chat button clicked, active:', !isVideoChatActive);
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
        console.log('Video chat enabled for user:', tempUserId);
        toast.success('Video chat enabled');
      } catch (err) {
        setError(`Failed to start video chat: ${err.message}`);
        toast.error(`Video chat error: ${err.message}`);
        console.error('Video chat error:', err);
      }
    } else {
      localStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
      setIsVideoChatActive(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
      console.log('Video chat disabled');
      toast.info('Video chat disabled');
    }
  }, [isVideoChatActive, tempUserId]);

  // Send chat message
  const sendChatMessage = useCallback(() => {
    if (chatInput.trim()) {
      const message: ChatMessage = {
        roomId,
        userId: tempUserId,
        username: tempUsername,
        message: chatInput,
        timestamp: Date.now(),
      };
      socket.emit('chat-message', message);
      setChatInput('');
      console.log('Chat message sent:', message);
    }
  }, [chatInput, roomId, tempUserId, tempUsername]);

  // Copy room ID to clipboard
  const copyRoomId = useCallback(() => {
    console.log('Copy room ID button clicked');
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
      console.log('Room ID copied:', roomId);
      toast.success('Room ID copied');
    }).catch((err) => {
      setError('Failed to copy room ID');
      toast.error('Failed to copy room ID');
      console.error('Copy room ID error:', err);
    });
  }, [roomId]);

  // Handle Socket.IO events
  useEffect(() => {
    socket.on('connect', () => {
      setIsSocketConnected(true);
      setError('');
      console.log('Socket connected');
      toast.info('Connected to server');
    });

    socket.on('disconnect', () => {
      setIsSocketConnected(false);
      setError('Disconnected from server. Attempting to reconnect...');
      console.warn('Socket disconnected');
      toast.error('Disconnected from server');
    });

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
      console.log('Room joined:', { roomId, users });
      toast.success(`Joined room ${roomId}`);
    });

    socket.on('room-error', ({ message }) => {
      setError(message);
      setIsRoomCreated(false);
      setIsLoadingRoom(false);
      console.error('Room error:', message);
      toast.error(message);
    });

    socket.on('chat-message', ({ userId, username, message, timestamp }) => {
      setChatMessages((prev) => [...prev, { userId, username, message, timestamp }]);
      console.log('Received chat message:', { userId, username, message });
    });

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
      console.log('User joined:', { userId, username });
      toast.info(`${username} joined the room`);
    });

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
      console.log('User left:', { userId, username });
      toast.info(`${username} left the room`);
    });

    socket.on('webrtc-offer', ({ from, offer }) => {
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
        console.error('WebRTC peer error:', err);
        toast.error(`WebRTC peer error: ${err.message}`);
      });

      peer.signal(offer);
      peersRef.current.push({ userId: from, peer });
      console.log('WebRTC offer received from:', from);
    });

    socket.on('webrtc-answer', ({ from, answer }) => {
      const peer = peersRef.current.find((p) => p.userId === from);
      if (peer) {
        peer.peer.signal(answer);
        console.log('WebRTC answer received from:', from);
      }
    });

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
  }, [roomId, initWebRTC]);

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
      if (roomId) {
        socket.emit('leave-room', { roomId, userId: tempUserId });
      }
      socket.disconnect();
      console.log('Component unmounted, cleaned up resources');
    };
  }, [roomId, tempUserId]);

  // Render participant list
  const renderParticipantList = () => (
    <div className="mt-4">
      <h4 className="text-sm font-medium text-white mb-2">Participants ({participants.length})</h4>
      <ScrollArea className="h-24 rounded-lg bg-white/5 p-2">
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

  // Render connection status
  const renderConnectionStatus = () => (
    <div className="flex items-center space-x-2 text-sm text-white/60 mb-4">
      {isSocketConnected ? (
        <>
          <Wifi className="h-4 w-4 text-green-500" />
          <span>Connected to server</span>
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 text-red-500" />
          <span>Disconnected. Reconnecting...</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-2 border-white/10 bg-white/5 hover:bg-white/10"
            onClick={() => {
              console.log('Retry connection button clicked');
              socket.connect();
            }}
          >
            Retry
          </Button>
        </>
      )}
    </div>
  );

  // Render more settings overlay
  const renderMoreSettings = () => (
    <motion.div
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
    >
      <motion.div
        variants={modalVariants}
        className="bg-background rounded-lg shadow-lg w-full max-w-md p-6"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-white">More Settings</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              console.log('More Settings closed');
              setIsPartyWatchOpen(false);
            }}
          >
            <X className="h-5 w-5 text-white" />
          </Button>
        </div>
        <div className="space-y-4">
          <Button
            variant="outline"
            className="w-full border-white/10 bg-white/5 hover:bg-white/10"
            onClick={() => {
              console.log('Party Watch button clicked in More Settings');
              setIsPartyWatchOpen(true);
            }}
            disabled={!isSocketConnected}
          >
            <Users className="h-4 w-4 mr-2" />
            Open Party Watch
          </Button>
          <Button
            variant="outline"
            className="w-full border-white/10 bg-white/5 hover:bg-white/10"
            onClick={() => {
              console.log('Screen Share button clicked in More Settings');
              startScreenSharing();
            }}
            disabled={isScreenSharing || !roomId || isServiceWorkerError}
          >
            <Share2 className="h-4 w-4 mr-2" />
            {isScreenSharing ? 'Sharing Screen' : 'Share Screen'}
          </Button>
          <Button
            variant="outline"
            className="w-full border-white/10 bg-white/5 hover:bg-white/10"
            onClick={() => console.log('Placeholder for additional settings')}
          >
            Additional Settings
          </Button>
        </div>
      </motion.div>
    </motion.div>
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
                        onClick={() => {
                          console.log('Stop screen sharing button clicked');
                          stopScreenSharing();
                        }}
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
                      'border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 z-10',
                      (!isSocketConnected || isServiceWorkerError) && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => {
                      console.log('Party Watch button clicked');
                      setIsPartyWatchOpen(true);
                    }}
                    disabled={!isSocketConnected}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Party Watch
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Start or join a watch party</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      'border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 z-10',
                      (isScreenSharing || !roomId || isServiceWorkerError) && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => {
                      console.log('Screen Share button clicked');
                      startScreenSharing();
                    }}
                    disabled={isScreenSharing || !roomId}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    {isScreenSharing ? 'Sharing Screen' : 'Share Screen'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{isScreenSharing ? 'Screen is being shared' : 'Share your screen with the room'}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300 z-10"
                    onClick={() => {
                      console.log('More Settings button clicked');
                      setIsPartyWatchOpen(true); // Reuse Party Watch overlay for settings
                    }}
                  >
                    More Settings
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Additional collaboration options</p>
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
        {isPartyWatchOpen && (
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
                            console.log('Close Party Watch button clicked');
                            if (roomId) {
                              socket.emit('leave-room', { roomId, userId: tempUserId });
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
                {renderConnectionStatus()}
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
                        disabled={isLoadingRoom}
                      />
                      <Button
                        className="w-full bg-blue-600 hover:bg-blue-700 transition-all duration-200"
                        onClick={() => {
                          console.log('Create Room button clicked');
                          createRoom();
                        }}
                        disabled={!roomPassword.trim() || isLoadingRoom}
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
                        disabled={isLoadingRoom}
                      />
                      <Input
                        type="password"
                        placeholder="Enter room password"
                        value={joinRoomPassword}
                        onChange={(e) => setJoinRoomPassword(e.target.value)}
                        className="mb-3 bg-white/5 border-white/10 text-white"
                        disabled={isLoadingRoom}
                      />
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700 transition-all duration-200"
                        onClick={() => {
                          console.log('Join Room button clicked');
                          joinRoom();
                        }}
                        disabled={!joinRoomId.trim() || !joinRoomPassword.trim() || isLoadingRoom}
                      >
                        {isLoadingRoom ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Users className="h-4 w-4 mr-2" />
                        )}
                        Join Room
                      </Button>
                    </div>
                    {!user && (
                      <p className="text-sm text-white/60">
                        You're joining as a guest ({tempUsername}).{' '}
                        <a href="/login" className="text-blue-500 hover:underline">
                          Log in
                        </a>{' '}
                        for a personalized experience.
                      </p>
                    )}
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
                        console.log('Leave Room button clicked');
                        socket.emit('leave-room', { roomId, userId: tempUserId });
                        setRoomId('');
                        setChatMessages([]);
                        setIsVoiceChatActive(false);
                        setIsVideoChatActive(false);
                        stopScreenSharing();
                        setIsRoomCreated(false);
                        setRoomPassword('');
                        setParticipants([]);
                        toast.info('Left the room');
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
                            onClick={() => {
                              console.log('Voice Chat button clicked in Room Interaction');
                              toggleVoiceChat();
                            }}
                            disabled={!roomId}
                          >
                            <Mic className="h-4 w-4 mr-2" />
                            {isVoiceChatActive ? 'Stop Voice' : 'Start Voice'}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isVoiceChatActive ? 'Disable voice chat' : 'Enable voice chat'}</p>
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant={isVideoChatActive ? 'destructive' : 'outline'}
                            size="sm"
                            className="border-white/10 bg-white/5 hover:bg-white/10"
                            onClick={() => {
                              console.log('Video Chat button clicked in Room Interaction');
                              toggleVideoChat();
                            }}
                            disabled={!roomId}
                          >
                            <Video className="h-4 w-4 mr-2" />
                            {isVideoChatActive ? 'Stop Video' : 'Start Video'}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{isVideoChatActive ? 'Disable video chat' : 'Enable video chat'}</p>
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
                        {tempUsername}
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
                          : msg.userId === tempUserId
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
                    disabled={!roomId}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        console.log('Chat send button clicked via Enter');
                        sendChatMessage();
                      }
                    }}
                  />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          className="ml-2 bg-blue-600 hover:bg-blue-700"
                          onClick={() => {
                            console.log('Chat send button clicked');
                            sendChatMessage();
                          }}
                          disabled={!roomId || !chatInput.trim()}
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Send message</p>
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
