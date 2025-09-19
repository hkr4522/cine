import { useParams } from 'react-router-dom';
import { ExternalLink, Users, MessageSquare, Mic, Video, Share2, Lock, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import Navbar from '@/components/Navbar';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import VideoSourceSelector from '@/components/player/VideoSourceSelector';
import EpisodeNavigation from '@/components/player/EpisodeNavigation';
import MediaActions from '@/components/player/MediaActions';
import { useMediaPlayer } from '@/hooks/use-media-player';
import { useAuth } from '@/hooks';
import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { videoSources } from '@/utils/video-sources';

// Initialize Socket.IO client
const socket = io('http://your-backend-server:3000', {
  reconnection: true,
  reconnectionAttempts: 5,
  reconnectionDelay: 1000,
});

// Animation variants for overlay
const overlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } },
};

const modalVariants = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: { scale: 1, opacity: 1, transition: { duration: 0.3 } },
  exit: { scale: 0.8, opacity: 0, transition: { duration: 0.2 } },
};

const Player = () => {
  const { id, season, episode, type } = useParams<{
    id: string;
    season?: string;
    episode?: string;
    type: string;
  }>();
  const { user } = useAuth();

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

  const posterUrl = mediaDetails
    ? `https://image.tmdb.org/t/p/w1280${mediaDetails.backdrop_path}`
    : undefined;

  // Party Watch state
  const [isPartyWatchOpen, setIsPartyWatchOpen] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinRoomPassword, setJoinRoomPassword] = useState('');
  const [chatMessages, setChatMessages] = useState<
    Array<{ userId: string; username: string; message: string; type?: string }>
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [isVoiceChatActive, setIsVoiceChatActive] = useState(false);
  const [isVideoChatActive, setIsVideoChatActive] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [peers, setPeers] = useState<Record<string, MediaStream>>({});
  const [error, setError] = useState('');
  const [isRoomCreated, setIsRoomCreated] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const screenShareRef = useRef<HTMLVideoElement | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Array<{ userId: string; peer: Peer.Instance }>>([]);

  // Generate random room ID
  const generateRoomId = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  // Create a new room
  const createRoom = () => {
    if (!roomPassword.trim()) {
      setError('Password is required to create a room');
      return;
    }
    const newRoomId = generateRoomId();
    setRoomId(newRoomId);
    setIsRoomCreated(true);
    socket.emit('create-room', {
      roomId: newRoomId,
      password: roomPassword,
      userId: user.id,
      username: user.username,
    });
    setError('');
  };

  // Join an existing room
  const joinRoom = () => {
    if (!joinRoomId.trim() || !joinRoomPassword.trim()) {
      setError('Room ID and password are required');
      return;
    }
    socket.emit('join-room', {
      roomId: joinRoomId,
      password: joinRoomPassword,
      userId: user.id,
      username: user.username,
    });
  };

  // Initialize WebRTC
  const initWebRTC = async () => {
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
    } catch (err) {
      setError(`Failed to initialize WebRTC: ${err.message}`);
    }
  };

  // Start screen sharing
  const startScreenSharing = async () => {
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false,
      });
      setIsScreenSharing(true);
      if (screenShareRef.current) {
        screenShareRef.current.srcObject = screenStream;
      }

      // Replace video track in WebRTC peers
      peersRef.current.forEach(({ peer }) => {
        const videoTrack = screenStream.getVideoTracks()[0];
        const sender = peer.getSenders().find((s) => s.track?.kind === 'video');
        if (sender) {
          sender.replaceTrack(videoTrack);
        }
      });

      // Handle screen share end
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenSharing();
      };
    } catch (err) {
      setError(`Failed to start screen sharing: ${err.message}`);
    }
  };

  // Stop screen sharing
  const stopScreenSharing = async () => {
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
        } catch (err) {
          setError(`Failed to restore video stream: ${err.message}`);
        }
      }
    }
  };

  // Toggle voice chat
  const toggleVoiceChat = async () => {
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
      } catch (err) {
        setError(`Failed to start voice chat: ${err.message}`);
      }
    } else {
      localStreamRef.current?.getAudioTracks().forEach((track) => track.stop());
      setIsVoiceChatActive(false);
    }
  };

  // Toggle video chat
  const toggleVideoChat = async () => {
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
      } catch (err) {
        setError(`Failed to start video chat: ${err.message}`);
      }
    } else {
      localStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
      setIsVideoChatActive(false);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }
    }
  };

  // Send chat message
  const sendChatMessage = () => {
    if (chatInput.trim()) {
      socket.emit('chat-message', {
        roomId,
        userId: user.id,
        username: user.username,
        message: chatInput,
      });
      setChatInput('');
    }
  };

  // Socket.IO event handlers
  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to Socket.IO server');
    });

    socket.on('room-joined', ({ roomId, users }) => {
      setRoomId(roomId);
      setIsPartyWatchOpen(true);
      setError('');
      initWebRTC();
      setChatMessages((prev) => [
        ...prev,
        { userId: '', username: 'System', message: `Joined room ${roomId}`, type: 'system' },
      ]);
    });

    socket.on('room-error', ({ message }) => {
      setError(message);
      setIsRoomCreated(false);
    });

    socket.on('chat-message', ({ userId, username, message }) => {
      setChatMessages((prev) => [...prev, { userId, username, message }]);
    });

    socket.on('user-joined', ({ userId, username }) => {
      setChatMessages((prev) => [
        ...prev,
        { userId, username, message: `${username} joined the room`, type: 'system' },
      ]);
    });

    socket.on('user-left', ({ userId, username }) => {
      setChatMessages((prev) => [
        ...prev,
        { userId, username, message: `${username} left the room`, type: 'system' },
      ]);
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
    });

    socket.on('webrtc-offer', ({ from, offer }) => {
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: localStreamRef.current || undefined,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            // Add TURN server here if available
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
      });

      peer.signal(offer);
      peersRef.current.push({ userId: from, peer });
    });

    socket.on('webrtc-answer', ({ from, answer }) => {
      const peer = peersRef.current.find((p) => p.userId === from);
      if (peer) {
        peer.peer.signal(answer);
      }
    });

    return () => {
      socket.off('connect');
      socket.off('room-joined');
      socket.off('room-error');
      socket.off('chat-message');
      socket.off('user-joined');
      socket.off('user-left');
      socket.off('webrtc-offer');
      socket.off('webrtc-answer');
    };
  }, [roomId]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      peersRef.current.forEach(({ peer }) => peer.destroy());
      if (roomId) {
        socket.emit('leave-room', { roomId, userId: user.id });
      }
      socket.disconnect();
    };
  }, [roomId]);

  // Copy room ID to clipboard
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setChatMessages((prev) => [
      ...prev,
      { userId: '', username: 'System', message: 'Room ID copied to clipboard', type: 'system' },
    ]);
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-background relative"
    >
      {/* Background Gradient */}
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
              <Button
                variant="destructive"
                size="sm"
                className="absolute top-4 right-4"
                onClick={stopScreenSharing}
              >
                Stop Sharing
              </Button>
            </motion.div>
          )}
        </div>

        {/* Controls and Navigation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
              onClick={() => setIsPartyWatchOpen(true)}
            >
              <Users className="h-4 w-4 mr-2" />
              Party Watch
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
              onClick={startScreenSharing}
              disabled={isScreenSharing}
            >
              <Share2 className="h-4 w-4 mr-2" />
              {isScreenSharing ? 'Sharing Screen' : 'Share Screen'}
            </Button>
          </div>

          {mediaType === 'tv' && episodes.length > 0 && (
            <EpisodeNavigation
              episodes={episodes}
              currentEpisodeIndex={currentEpisodeIndex}
              onPreviousEpisode={goToPreviousEpisode}
              onNextEpisode={goToNextEpisode}
            />
          )}

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
              <div className="w-full md:w-1/3 p-6 border-r border-white/10 overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-xl font-bold text-white">Party Watch</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (roomId) {
                        socket.emit('leave-room', { roomId, userId: user.id });
                        setRoomId('');
                        setChatMessages([]);
                        setIsVoiceChatActive(false);
                        setIsVideoChatActive(false);
                        stopScreenSharing();
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
                </div>
                {error && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-red-500 mb-4 p-2 bg-red-500/10 rounded"
                  >
                    {error}
                  </motion.p>
                )}
                {!roomId ? (
                  <div className="space-y-6">
                    {/* Create Room */}
                    <div>
                      <h3 className="text-lg font-medium text-white mb-2">Create Room</h3>
                      <Input
                        type="password"
                        placeholder="Enter room password"
                        value={roomPassword}
                        onChange={(e) => setRoomPassword(e.target.value)}
                        className="mb-3 bg-white/5 border-white/10 text-white"
                      />
                      <Button
                        className="w-full bg-blue-600 hover:bg-blue-700"
                        onClick={createRoom}
                        disabled={!roomPassword.trim()}
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        Create Room
                      </Button>
                    </div>
                    {/* Join Room */}
                    <div>
                      <h3 className="text-lg font-medium text-white mb-2">Join Room</h3>
                      <Input
                        type="text"
                        placeholder="Enter room ID"
                        value={joinRoomId}
                        onChange={(e) => setJoinRoomId(e.target.value.toUpperCase())}
                        className="mb-3 bg-white/5 border-white/10 text-white"
                      />
                      <Input
                        type="password"
                        placeholder="Enter room password"
                        value={joinRoomPassword}
                        onChange={(e) => setJoinRoomPassword(e.target.value)}
                        className="mb-3 bg-white/5 border-white/10 text-white"
                      />
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700"
                        onClick={joinRoom}
                        disabled={!joinRoomId.trim() || !joinRoomPassword.trim()}
                      >
                        <Users className="h-4 w-4 mr-2" />
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full border-white/10 bg-white/5 hover:bg-white/10"
                        onClick={copyRoomId}
                      >
                        Copy Room ID
                      </Button>
                    </div>
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={() => {
                        socket.emit('leave-room', { roomId, userId: user.id });
                        setRoomId('');
                        setChatMessages([]);
                        setIsVoiceChatActive(false);
                        setIsVideoChatActive(false);
                        stopScreenSharing();
                        setIsRoomCreated(false);
                        setRoomPassword('');
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
                    <Button
                      variant={isVoiceChatActive ? 'destructive' : 'outline'}
                      size="sm"
                      className="border-white/10 bg-white/5 hover:bg-white/10"
                      onClick={toggleVoiceChat}
                      disabled={!roomId}
                    >
                      <Mic className="h-4 w-4 mr-2" />
                      {isVoiceChatActive ? 'Stop Voice' : 'Start Voice'}
                    </Button>
                    <Button
                      variant={isVideoChatActive ? 'destructive' : 'outline'}
                      size="sm"
                      className="border-white/10 bg-white/5 hover:bg-white/10"
                      onClick={toggleVideoChat}
                      disabled={!roomId}
                    >
                      <Video className="h-4 w-4 mr-2" />
                      {isVideoChatActive ? 'Stop Video' : 'Start Video'}
                    </Button>
                  </div>
                </div>

                {/* Video Streams */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {isVideoChatActive && (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-32 h-24 bg-black rounded-lg overflow-hidden relative"
                    >
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-1 rounded">
                        You
                      </span>
                    </motion.div>
                  )}
                  {Object.keys(peers).map((peerId) => (
                    <motion.div
                      key={peerId}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-32 h-24 bg-black rounded-lg overflow-hidden relative"
                    >
                      <video
                        ref={(el) => {
                          if (el && peers[peerId]) el.srcObject = peers[peerId];
                        }}
                        autoPlay
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-1 left-1 text-xs text-white bg-black/50 px-1 rounded">
                        User {peerId.slice(0, 4)}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* Chat Area */}
                <div
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto p-4 bg-white/5 rounded-lg mb-4 max-h-[50vh]"
                >
                  {chatMessages.length === 0 && (
                    <p className="text-white/60 text-center">No messages yet</p>
                  )}
                  {chatMessages.map((msg, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mb-3 p-2 rounded ${
                        msg.type === 'system'
                          ? 'text-white/60 bg-white/5'
                          : msg.userId === user.id
                          ? 'bg-blue-600/20 text-white ml-auto max-w-[80%]'
                          : 'bg-white/10 text-white max-w-[80%]'
                      }`}
                    >
                      <span className="font-medium block text-sm">
                        {msg.type === 'system' ? 'System' : msg.username}
                      </span>
                      <span>{msg.message}</span>
                    </motion.div>
                  ))}
                </div>

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
                        sendChatMessage();
                      }
                    }}
                  />
                  <Button
                    className="ml-2 bg-blue-600 hover:bg-blue-700"
                    onClick={sendChatMessage}
                    disabled={!roomId || !chatInput.trim()}
                  >
                    <MessageSquare className="h-4 w-4" />
                  </Button>
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
