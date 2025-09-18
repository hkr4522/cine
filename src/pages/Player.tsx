import { useParams, useSearchParams } from 'react-router-dom';
import { ExternalLink, X, Video, VideoOff, Mic, MicOff, Send, Copy, Users, Crown, LogOut, Clapperboard, MonitorPlay } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import Navbar from '@/components/Navbar';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import VideoSourceSelector from '@/components/player/VideoSourceSelector';
import EpisodeNavigation from '@/components/player/EpisodeNavigation';
import MediaActions from '@/components/player/MediaActions';
import { useMediaPlayer } from '@/hooks/use-media-player';
import { videoSources } from '@/utils/video-sources';
import { useAuth } from '@/hooks';
import { cn } from "@/lib/utils"; // Ensure you have a utility for class names

// --- [START] Party Watch Feature Components & Hooks ---

// NOTE: In a real-world application, you would use a WebSocket library like Socket.io
// or a service like Firebase for real-time communication. This implementation simulates
// the behavior using React state for demonstration purposes.

// --- Helper Hook: useUserMedia for Camera/Microphone access ---
const useUserMedia = (requestedMedia) => {
  const [mediaStream, setMediaStream] = useState(null);
  const [error, setError] = useState(null);
  const isStreamRequested = useRef(false);

  useEffect(() => {
    if (!requestedMedia.video && !requestedMedia.audio) {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        setMediaStream(null);
      }
      isStreamRequested.current = false;
      return;
    }
    
    if (isStreamRequested.current) return;

    const enableStream = async () => {
      isStreamRequested.current = true;
      try {
        const stream = await navigator.mediaDevices.getUserMedia(requestedMedia);
        setMediaStream(stream);
      } catch (err) {
        console.error("Error accessing media devices.", err);
        setError("Could not access camera or microphone. Please check permissions.");
      }
    };

    enableStream();

    return () => {
      if (mediaStream) {
        mediaStream.getTracks().forEach(track => {
          track.stop();
        });
      }
    };
  }, [requestedMedia.video, requestedMedia.audio, mediaStream]);

  return { mediaStream, error };
};


// --- UI Component: Participant Video Tile ---
const ParticipantVideo = ({ participant, isLocalUser }) => {
  const videoRef = useRef(null);
  const { mediaStream } = useUserMedia({ video: participant.video, audio: participant.audio });

  useEffect(() => {
    if (isLocalUser && videoRef.current && mediaStream) {
      videoRef.current.srcObject = mediaStream;
    }
    // In a real WebRTC implementation, you would attach the remote stream here.
    // e.g., videoRef.current.srcObject = participant.remoteStream;
  }, [mediaStream, isLocalUser]);

  return (
    <div className="relative aspect-video bg-black/50 rounded-lg overflow-hidden border-2 border-transparent group-hover:border-primary transition-all duration-300">
      <AnimatePresence>
        {participant.video && mediaStream ? (
          <motion.video
            ref={videoRef}
            autoPlay
            playsInline
            muted={isLocalUser} // Local video should be muted to prevent echo
            className="w-full h-full object-cover"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        ) : (
          <motion.div 
            className="w-full h-full flex items-center justify-center bg-gray-800"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Users className="h-12 w-12 text-gray-500" />
          </motion.div>
        )}
      </AnimatePresence>
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <div className="flex items-center gap-2">
          {participant.isHost && <Crown className="h-4 w-4 text-yellow-400" />}
          <p className="text-sm font-medium text-white truncate">{participant.username}</p>
        </div>
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <div className={`p-1.5 rounded-full ${participant.audio ? 'bg-transparent' : 'bg-red-500/80'}`}>
          {participant.audio ? <Mic className="h-4 w-4 text-white" /> : <MicOff className="h-4 w-4 text-white" />}
        </div>
      </div>
    </div>
  );
};


// --- UI Component: Chat Message ---
const ChatMessage = ({ msg, currentUser }) => {
  const isOwnMessage = msg.username === currentUser.username;
  return (
    <div className={cn("flex flex-col mb-3", isOwnMessage ? "items-end" : "items-start")}>
      <div className={cn(
        "max-w-xs md:max-w-md rounded-lg px-3 py-2",
        isOwnMessage ? "bg-primary text-primary-foreground rounded-br-none" : "bg-gray-700 text-white rounded-bl-none"
      )}>
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


// --- Main Party Room Component ---
const PartyRoom = ({ roomDetails, currentUser, participants, onLeave, onSendMessage, onToggleMedia }) => {
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]); // Simulated chat messages
  const [activeTab, setActiveTab] = useState('chat'); // 'chat' or 'participants'
  const chatEndRef = useRef(null);

  // SIMULATION: Welcome message and new user join message
  useEffect(() => {
    setMessages([
        {
            username: 'System',
            text: `Welcome to the party! Room ID: ${roomDetails.id}`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isHost: false,
        },
        ...participants.map(p => ({
            username: 'System',
            text: `${p.username} has joined the party.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            isHost: false,
        }))
    ]);
  }, []);
  
  // SIMULATION: Listen for new messages
  useEffect(() => {
    // In a real app, a WebSocket listener would push new messages here.
    // For this demo, we'll just handle locally sent messages.
    // Example: socket.on('newMessage', (newMessage) => setMessages(prev => [...prev, newMessage]));
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (message.trim()) {
      const newMessage = {
        username: currentUser.username,
        text: message,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isHost: currentUser.isHost,
      };
      // SIMULATION: Add message locally. In real app, you'd emit this to the server.
      // onSendMessage(newMessage);
      setMessages(prev => [...prev, newMessage]);
      setMessage('');
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(roomDetails.link);
    // You could add a toast notification here for better UX
    alert("Party link copied to clipboard!");
  };

  const localUser = participants.find(p => p.username === currentUser.username);

  return (
    <motion.div 
      className="absolute inset-0 bg-black/80 backdrop-blur-lg flex flex-col md:flex-row z-50 text-white"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Main Content: Video Grid */}
      <div className="flex-grow p-4 flex flex-col">
        <div className="flex-grow grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-min group">
           {/* In a real WebRTC app, you would map over connected peers */}
           {participants.map(p => (
            <ParticipantVideo 
              key={p.username} 
              participant={p} 
              isLocalUser={p.username === currentUser.username}
            />
           ))}
        </div>
        <div className="flex-shrink-0 mt-4 p-4 bg-gray-900/50 rounded-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={() => onToggleMedia('audio')} variant="outline" size="icon" className={cn("bg-gray-700 hover:bg-gray-600 border-gray-600", !localUser.audio && "bg-red-600 hover:bg-red-500")}>
                      {localUser.audio ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{localUser.audio ? 'Mute Mic' : 'Unmute Mic'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                     <Button onClick={() => onToggleMedia('video')} variant="outline" size="icon" className={cn("bg-gray-700 hover:bg-gray-600 border-gray-600", !localUser.video && "bg-red-600 hover:bg-red-500")}>
                      {localUser.video ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{localUser.video ? 'Stop Video' : 'Start Video'}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className='flex items-center gap-2'>
              <Button onClick={handleCopyLink} variant="outline" className="bg-gray-700 hover:bg-gray-600 border-gray-600">
                <Copy className="h-4 w-4 mr-2" />
                Copy Invite Link
              </Button>
              <Button onClick={onLeave} variant="destructive">
                <LogOut className="h-4 w-4 mr-2" />
                Leave Party
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sidebar: Chat & Participants */}
      <div className="w-full md:w-80 lg:w-96 bg-gray-900/70 flex flex-col border-l border-gray-700/50 h-1/2 md:h-full">
        <div className="flex-shrink-0 border-b border-gray-700/50">
          <div className="flex">
            <button onClick={() => setActiveTab('chat')} className={cn("flex-1 p-3 text-sm font-semibold flex items-center justify-center gap-2", activeTab === 'chat' && 'bg-primary/20 text-primary border-b-2 border-primary')}>
                <Send className="h-4 w-4" /> Live Chat
            </button>
            <button onClick={() => setActiveTab('participants')} className={cn("flex-1 p-3 text-sm font-semibold flex items-center justify-center gap-2", activeTab === 'participants' && 'bg-primary/20 text-primary border-b-2 border-primary')}>
                <Users className="h-4 w-4" /> Participants ({participants.length})
            </button>
          </div>
        </div>
        
        {/* Chat Panel */}
        <AnimatePresence mode="wait">
        {activeTab === 'chat' && (
          <motion.div 
            key="chat"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className="flex-grow flex flex-col overflow-hidden"
          >
            <div className="flex-grow p-4 overflow-y-auto">
              {messages.map((msg, index) => (
                <ChatMessage key={index} msg={msg} currentUser={currentUser} />
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
                  className="bg-gray-800 border-gray-700 focus:border-primary"
                />
                <Button type="submit" size="icon">
                  <Send className="h-5 w-5" />
                </Button>
              </form>
            </div>
          </motion.div>
        )}
        </AnimatePresence>

        {/* Participants Panel */}
        <AnimatePresence mode="wait">
        {activeTab === 'participants' && (
          <motion.div 
            key="participants"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            className="flex-grow overflow-y-auto p-4"
          >
            <h3 className='font-bold mb-4'>In The Party</h3>
            <ul className='space-y-3'>
                {participants.map(p => (
                    <li key={p.username} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center font-bold">
                                    {p.username.charAt(0).toUpperCase()}
                                </div>
                                <span className={cn("absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ring-2 ring-gray-800", p.video ? "bg-green-400" : "bg-gray-500")}></span>
                            </div>
                            <span className="font-medium">{p.username}</span>
                            {p.isHost && <Crown className="h-4 w-4 text-yellow-400" />}
                        </div>
                        <div className="flex items-center gap-3">
                            {p.audio ? <Mic className="h-4 w-4 text-gray-300"/> : <MicOff className="h-4 w-4 text-red-500"/>}
                            {p.video ? <Video className="h-4 w-4 text-gray-300"/> : <VideoOff className="h-4 w-4 text-red-500"/>}
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


// --- Party Watch Orchestrator Component (The Overlay) ---
const PartyWatchOverlay = ({ onClose }) => {
  const [roomState, setRoomState] = useState('idle'); // 'idle', 'creating', 'joining', 'in_room'
  const [error, setError] = useState('');
  
  // These would typically be managed on a server
  const [roomDetails, setRoomDetails] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [participants, setParticipants] = useState([]);

  // Form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  
  const [searchParams] = useSearchParams();
  const partyIdFromUrl = searchParams.get('party');

  // Effect to handle joining from a URL
  useEffect(() => {
    if (partyIdFromUrl) {
        // SIMULATION: In a real app, you'd fetch room info from your server using this ID.
        // For now, we assume if a party link is present, a room exists.
        // We'll use a mock room to join.
        if (!roomDetails) {
            setRoomDetails({
                id: partyIdFromUrl,
                password: 'password123', // Mock password for demo
                link: window.location.href,
                host: 'HostUser'
            });
        }
        setRoomState('joining');
    }
  }, [partyIdFromUrl]);


  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Username and password are required.');
      return;
    }
    setError('');

    // SIMULATION: In a real app, you would send a request to your backend to create a room.
    // The backend would return a unique room ID and link.
    const newRoomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    const newRoomLink = `${window.location.origin}${window.location.pathname}?party=${newRoomId}`;
    
    const hostUser = { username, isHost: true, audio: false, video: false };

    setRoomDetails({
      id: newRoomId,
      password: password,
      link: newRoomLink,
      host: username
    });
    setCurrentUser(hostUser);
    setParticipants([hostUser]);
    setRoomState('in_room');
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (!username) {
      setError('Your username is required.');
      return;
    }
    // SIMULATION: Check password against the stored state.
    // In a real app, an API call would validate this.
    if (joinPassword !== roomDetails?.password) {
      setError('Invalid password. Please try again.');
      return;
    }
    setError('');
    
    const newUser = { username, isHost: false, audio: false, video: false };
    
    // SIMULATION: Add user to participants list.
    setCurrentUser(newUser);
    setParticipants(prev => [...prev, newUser]);
    setRoomState('in_room');
  };

  const handleLeaveRoom = () => {
    // Reset all state
    setRoomState('idle');
    setRoomDetails(null);
    setCurrentUser(null);
    setParticipants([]);
    setUsername('');
    setPassword('');
    setJoinPassword('');
    // Also remove party param from URL
    const url = new URL(window.location);
    url.searchParams.delete('party');
    window.history.pushState({}, '', url);
  };

  const handleToggleMedia = (type) => {
    setParticipants(prev =>
        prev.map(p => 
            p.username === currentUser.username ? { ...p, [type]: !p[type] } : p
        )
    );
  };

  const renderContent = () => {
    switch (roomState) {
      case 'in_room':
        return <PartyRoom 
                    roomDetails={roomDetails} 
                    currentUser={currentUser} 
                    participants={participants} 
                    onLeave={handleLeaveRoom}
                    onToggleMedia={handleToggleMedia}
                    // onSendMessage would be passed to a real chat system
                />;
      
      case 'creating':
        return (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-gray-900/80 backdrop-blur-sm p-8 rounded-lg border border-white/10">
            <h2 className="text-2xl font-bold mb-2 text-center text-white">Create a Party</h2>
            <p className="text-center text-gray-400 mb-6">Set a password for your private room.</p>
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <Input 
                type="text" 
                placeholder="Enter your username" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)} 
                className="bg-gray-800 border-gray-700"
              />
              <Input 
                type="password" 
                placeholder="Create a room password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                className="bg-gray-800 border-gray-700"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Create Room</Button>
              <Button variant="ghost" onClick={() => setRoomState('idle')} className="w-full text-gray-400 hover:text-white">Back</Button>
            </form>
          </motion.div>
        );
      
      case 'joining':
        return (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-gray-900/80 backdrop-blur-sm p-8 rounded-lg border border-white/10">
            <h2 className="text-2xl font-bold mb-2 text-center text-white">Join Party</h2>
            <p className="text-center text-gray-400 mb-6">Joining Room: <span className="font-mono text-primary">{roomDetails?.id || partyIdFromUrl}</span></p>
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <Input 
                type="text" 
                placeholder="Enter your username" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
                className="bg-gray-800 border-gray-700" 
              />
              <Input 
                type="password" 
                placeholder="Enter room password" 
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" className="w-full bg-primary hover:bg-primary/90">Join Now</Button>
              <Button variant="ghost" onClick={() => { setRoomState('idle'); handleLeaveRoom(); }} className="w-full text-gray-400 hover:text-white">Back</Button>
            </form>
          </motion.div>
        );

      case 'idle':
      default:
        return (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-gray-900/80 backdrop-blur-sm p-8 rounded-lg text-center border border-white/10 relative">
            <Button onClick={onClose} variant="ghost" size="icon" className="absolute top-2 right-2 text-gray-400 hover:text-white"><X/></Button>
            <MonitorPlay className="mx-auto h-16 w-16 text-primary mb-4" />
            <h2 className="text-3xl font-bold mb-2 text-white">Watch Party</h2>
            <p className="text-gray-400 mb-8">Watch with friends in real-time. Create or join a room to get started.</p>
            <div className="flex flex-col space-y-3">
              <Button onClick={() => setRoomState('creating')} className="w-full text-lg py-6 bg-primary hover:bg-primary/90">
                <Clapperboard className="h-5 w-5 mr-2" />
                Create a Room
              </Button>
               <Button onClick={() => setRoomState('joining')} variant="outline" className="w-full text-lg py-6 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary">
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
    >
      {roomState !== 'in_room' ? (
          renderContent()
      ) : (
          <AnimatePresence>{renderContent()}</AnimatePresence>
      )}
    </motion.div>
  );
};

// --- [END] Party Watch Feature ---


// --- Main Player Component (Modified) ---
const Player = () => {
  const { id, season, episode, type } = useParams();
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
    goBack
  } = useMediaPlayer(id, season, episode, type);
  
  const [isPartyWatchOpen, setIsPartyWatchOpen] = useState(false);
  const [searchParams] = useSearchParams();

  // Automatically open Party Watch if the URL contains a party ID
  useEffect(() => {
    if (searchParams.has('party')) {
        setIsPartyWatchOpen(true);
    }
  }, [searchParams]);

  const posterUrl = mediaDetails ? 
    `https://image.tmdb.org/t/p/w1280${mediaDetails.backdrop_path}` 
    : undefined;

  return (
    <>
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
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
            isFavorite={isFavorite}
            isInWatchlist={isInMyWatchlist}
            onToggleFavorite={toggleFavorite}
            onToggleWatchlist={toggleWatchlist}
            onBack={goBack}
            onViewDetails={goToDetails}
          />

          <VideoPlayer 
            isLoading={isLoading}
            iframeUrl={iframeUrl}
            title={title}
            poster={posterUrl}
            onLoaded={handlePlayerLoaded}
            onError={handlePlayerError}
          />

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 space-y-6"
          >
            {mediaType === 'tv' && episodes.length > 0 && (
              <EpisodeNavigation 
                episodes={episodes}
                currentEpisodeIndex={currentEpisodeIndex}
                onPreviousEpisode={goToPreviousEpisode}
                onNextEpisode={goToNextEpisode}
              />
            )}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-xl font-bold text-white">More Info & Options</h3>
                  <p className="text-sm text-white/60">Select sources or start a party with friends.</p>
                </div>
                {/* --- Party Watch Button --- */}
                <Button
                  variant="default"
                  size="lg"
                  className="bg-primary hover:bg-primary/90 transition-all duration-300 shadow-lg shadow-primary/20 w-full sm:w-auto"
                  onClick={() => setIsPartyWatchOpen(true)}
                >
                  <Users className="h-5 w-5 mr-2" />
                  Party Watch
                </Button>
              </div>

               <div className="mt-6 space-y-4 p-6 bg-white/5 border border-white/10 rounded-lg">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-medium text-white">Video Sources</h3>
                        <p className="text-sm text-white/60">Select your preferred streaming source</p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
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

            </div>
          </motion.div>
        </main>
      </motion.div>

      {/* --- Party Watch Overlay Render --- */}
      <AnimatePresence>
        {isPartyWatchOpen && <PartyWatchOverlay onClose={() => setIsPartyWatchOpen(false)} />}
      </AnimatePresence>
    </>
  );
};

export default Player;
