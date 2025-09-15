import { useParams } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import Navbar from '@/components/Navbar';
import { VideoPlayer } from '@/components/player/VideoPlayer';
import VideoSourceSelector from '@/components/player/VideoSourceSelector';
import EpisodeNavigation from '@/components/player/EpisodeNavigation';
import MediaActions from '@/components/player/MediaActions';
import { useMediaPlayer } from '@/hooks/use-media-player';
import { videoSources } from '@/utils/video-sources';
import { useAuth } from '@/hooks';
import { useState, useEffect, useRef } from 'react';

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
    goBack
  } = useMediaPlayer(id, season, episode, type);

  const posterUrl = mediaDetails ? 
    `https://image.tmdb.org/t/p/w1280${mediaDetails.backdrop_path}` 
    : undefined;

  // New states for collaboration features
  const [isPeerLoaded, setIsPeerLoaded] = useState(false);
  const [roomID, setRoomID] = useState<string | null>(null);
  const [roomPassword, setRoomPassword] = useState<string | null>(null);
  const [username, setUsername] = useState<string>(user?.username || 'Anonymous');
  const [peers, setPeers] = useState<Map<string, any>>(new Map()); // Map of peer ID to connection objects
  const [dataChannels, setDataChannels] = useState<Map<string, RTCDataChannel>>(new Map());
  const [chatMessages, setChatMessages] = useState<{ sender: string; message: string; timestamp: number }[]>([]);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [sharedStreams, setSharedStreams] = useState<Map<string, MediaStream>>(new Map()); // Remote streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isControlling, setIsControlling] = useState<Map<string, boolean>>(new Map());
  const [remoteControlRequests, setRemoteControlRequests] = useState<string[]>([]);
  const [myPeerID, setMyPeerID] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [roomTimeout, setRoomTimeout] = useState<NodeJS.Timeout | null>(null);

  const peerRef = useRef<any>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const chatRef = useRef<HTMLDivElement>(null);

  // Load PeerJS from CDN
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js'; // Assuming latest version as of 2025
    script.async = true;
    script.onload = () => {
      setIsPeerLoaded(true);
      console.log('PeerJS loaded');
    };
    script.onerror = () => {
      console.error('Failed to load PeerJS');
    };
    document.body.appendChild(script);

    return () => {
      if (script) {
        document.body.removeChild(script);
      }
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      if (roomTimeout) {
        clearTimeout(roomTimeout);
      }
    };
  }, []);

  // Initialize Peer when loaded
  useEffect(() => {
    if (isPeerLoaded && !peerRef.current) {
      // PeerJS is now available as window.Peer
      const Peer = (window as any).Peer;
      const tempPeerID = crypto.randomUUID(); // Temporary ID for non-room users
      peerRef.current = new Peer(tempPeerID, {
        // Use default PeerJS cloud server for signaling
      });

      peerRef.current.on('open', (id: string) => {
        setMyPeerID(id);
        console.log('My peer ID:', id);
      });

      peerRef.current.on('connection', handleIncomingDataConnection);
      peerRef.current.on('call', handleIncomingCall);
      peerRef.current.on('error', (err: any) => {
        console.error('Peer error:', err);
      });
    }
  }, [isPeerLoaded]);

  // Function to create a room
  const createRoom = () => {
    if (!peerRef.current) return;

    const newUsername = prompt('Enter your username:') || 'Anonymous';
    const password = prompt('Enter room password:');
    if (!password) {
      alert('Password is required');
      return;
    }

    const newRoomID = crypto.randomUUID();
    setRoomID(newRoomID);
    setRoomPassword(password);
    setUsername(newUsername);
    setIsCreator(true);

    // Reinitialize peer with roomID as ID
    peerRef.current.destroy();
    const Peer = (window as any).Peer;
    peerRef.current = new Peer(newRoomID);

    peerRef.current.on('open', (id: string) => {
      setMyPeerID(id);
      console.log('Room created with ID:', id);
      const roomURL = `${window.location.origin}${window.location.pathname}?room=${id}`;
      prompt('Share this URL with others:', roomURL);

      // Set timeout to delete room after 6 hours (21600000 ms)
      const timeout = setTimeout(() => {
        destroyRoom();
      }, 21600000);
      setRoomTimeout(timeout);
    });

    peerRef.current.on('connection', handleIncomingDataConnection);
    peerRef.current.on('call', handleIncomingCall);
  };

  // Function to join a room
  const joinRoom = () => {
    if (!peerRef.current) return;

    const roomURL = prompt('Enter room URL:');
    if (!roomURL) return;

    const url = new URL(roomURL);
    const joinRoomID = url.searchParams.get('room');
    if (!joinRoomID) {
      alert('Invalid room URL');
      return;
    }

    const joinUsername = prompt('Enter your username (optional):') || 'Anonymous';
    const password = prompt('Enter room password:');
    if (!password) {
      alert('Password is required');
      return;
    }

    setRoomID(joinRoomID);
    setUsername(joinUsername);
    setRoomPassword(password); // Temporarily store for verification

    // Connect to creator
    const conn = peerRef.current.connect(joinRoomID);
    conn.on('open', () => {
      conn.send({
        type: 'join-request',
        password,
        username: joinUsername,
        peerID: myPeerID
      });
    });

    conn.on('data', (data: any) => {
      if (data.type === 'join-accepted') {
        // Join successful, get peer list
        const existingPeers = data.peers || [];
        setPeers((prev) => {
          const newMap = new Map(prev);
          existingPeers.forEach((p: string) => {
            if (p !== myPeerID) {
              connectToPeer(p);
            }
          });
          return newMap;
        });
        alert('Joined room successfully');
      } else if (data.type === 'join-rejected') {
        alert('Invalid password or rejected');
        setRoomID(null);
        setRoomPassword(null);
      }
    });

    addPeerConnection(joinRoomID, conn);
  };

  // Handle incoming data connection
  const handleIncomingDataConnection = (conn: any) => {
    conn.on('open', () => {
      console.log('Data connection opened with', conn.peer);
    });

    conn.on('data', (data: any) => {
      console.log('Received data:', data);
      if (data.type === 'join-request') {
        handleJoinRequest(conn, data);
      } else if (data.type === 'chat') {
        setChatMessages((prev) => [...prev, {
          sender: data.sender,
          message: data.message,
          timestamp: Date.now()
        }]);
        if (chatRef.current) {
          chatRef.current.scrollTop = chatRef.current.scrollHeight;
        }
      } else if (data.type === 'control-request') {
        setRemoteControlRequests((prev) => [...prev, conn.peer]);
      } else if (data.type === 'control-grant') {
        setIsControlling((prev) => {
          const newMap = new Map(prev);
          newMap.set(conn.peer, true);
          return newMap;
        });
      } else if (data.type === 'control-revoke') {
        setIsControlling((prev) => {
          const newMap = new Map(prev);
          newMap.delete(conn.peer);
          return newMap;
        });
      } else if (data.type === 'control-event') {
        handleRemoteControlEvent(data.event);
      } else if (data.type === 'peer-list-update') {
        const newPeers = data.peers.filter((p: string) => p !== myPeerID);
        newPeers.forEach((p: string) => {
          connectToPeer(p);
        });
      }
    });

    conn.on('close', () => {
      removePeerConnection(conn.peer);
    });

    addPeerConnection(conn.peer, conn);
  };

  // Handle join request (for creator only)
  const handleJoinRequest = (conn: any, data: any) => {
    if (!isCreator) return;

    if (data.password === roomPassword) {
      // Accept
      conn.send({
        type: 'join-accepted',
        peers: Array.from(peers.keys())
      });

      // Broadcast new peer to existing peers
      broadcastToPeers({
        type: 'peer-list-update',
        peers: [data.peerID]
      });

      addPeerConnection(data.peerID, conn);
      alert(`${data.username} has requested to join. Accepted.`);
    } else {
      conn.send({ type: 'join-rejected' });
      conn.close();
      alert(`${data.username} has requested to join. Rejected (wrong password).`);
    }
  };

  // Connect to a new peer
  const connectToPeer = (peerID: string) => {
    if (peers.has(peerID) || peerID === myPeerID) return;

    const conn = peerRef.current.connect(peerID);
    conn.on('open', () => {
      console.log('Connected to', peerID);
    });
    conn.on('data', handleDataFromPeer);
    conn.on('close', () => removePeerConnection(peerID));

    addPeerConnection(peerID, conn);

    // If voice enabled, call with audio
    if (isVoiceEnabled && localStream) {
      callPeerWithStream(peerID, localStream);
    }

    // If sharing screen, call with screen stream
    if (isSharingScreen && localStream) { // Assuming localStream includes screen if sharing
      callPeerWithStream(peerID, localStream);
    }
  };

  // Handle data from any peer
  const handleDataFromPeer = (data: any) => {
    // Similar to handleIncomingDataConnection 'data' event, but centralized if needed
    // For now, assume handled in incoming
  };

  // Add peer connection
  const addPeerConnection = (peerID: string, conn: any) => {
    setPeers((prev) => {
      const newMap = new Map(prev);
      newMap.set(peerID, conn);
      return newMap;
    });
  };

  // Remove peer connection
  const removePeerConnection = (peerID: string) => {
    setPeers((prev) => {
      const newMap = new Map(prev);
      newMap.delete(peerID);
      return newMap;
    });
    setSharedStreams((prev) => {
      const newMap = new Map(prev);
      newMap.delete(peerID);
      return newMap;
    });
    setIsControlling((prev) => {
      const newMap = new Map(prev);
      newMap.delete(peerID);
      return newMap;
    });
    if (videoRefs.current.has(peerID)) {
      videoRefs.current.delete(peerID);
    }
  };

  // Broadcast to all peers
  const broadcastToPeers = (data: any) => {
    peers.forEach((conn) => {
      if (conn.open) {
        conn.send(data);
      }
    });
  };

  // Start screen sharing
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true // If system audio
      });
      setLocalStream(stream);
      setIsSharingScreen(true);

      // Call all peers with stream
      peers.forEach((_, peerID) => {
        callPeerWithStream(peerID, stream);
      });

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          stopScreenShare();
        };
      });
    } catch (err) {
      console.error('Screen share error:', err);
    }
  };

  // Stop screen sharing
  const stopScreenShare = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setIsSharingScreen(false);
    // Notify peers? Streams will close automatically
  };

  // Enable voice
  const enableVoice = async () => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!localStream) {
        setLocalStream(audioStream);
      } else {
        audioStream.getAudioTracks().forEach((track) => {
          localStream.addTrack(track);
        });
      }
      setIsVoiceEnabled(true);

      // Call peers with updated stream
      peers.forEach((_, peerID) => {
        callPeerWithStream(peerID, localStream!);
      });
    } catch (err) {
      console.error('Voice error:', err);
    }
  };

  // Disable voice
  const disableVoice = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => track.stop());
    }
    setIsVoiceEnabled(false);
  };

  // Call peer with media stream
  const callPeerWithStream = (peerID: string, stream: MediaStream) => {
    const call = peerRef.current.call(peerID, stream);
    call.on('stream', (remoteStream: MediaStream) => {
      // If they send back? But for one-way share, maybe not
    });
    call.on('close', () => {
      // Handle
    });
  };

  // Handle incoming call (media stream)
  const handleIncomingCall = (call: any) => {
    call.answer(null); // Answer without local stream, since receiving

    call.on('stream', (remoteStream: MediaStream) => {
      setSharedStreams((prev) => {
        const newMap = new Map(prev);
        newMap.set(call.peer, remoteStream);
        return newMap;
      });

      // Play audio if has audio
      if (remoteStream.getAudioTracks().length > 0) {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play();
      }
    });

    call.on('close', () => {
      setSharedStreams((prev) => {
        const newMap = new Map(prev);
        newMap.delete(call.peer);
        return newMap;
      });
    });
  };

  // Send chat message
  const sendChat = () => {
    if (!chatInput.trim()) return;

    const message = {
      type: 'chat',
      sender: username,
      message: chatInput
    };

    broadcastToPeers(message);
    setChatMessages((prev) => [...prev, {
      sender: username,
      message: chatInput,
      timestamp: Date.now()
    }]);
    setChatInput('');
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  };

  // Request control of a peer's screen
  const requestControl = (peerID: string) => {
    const conn = peers.get(peerID);
    if (conn) {
      conn.send({ type: 'control-request' });
    }
  };

  // Grant control to a requester
  const grantControl = (peerID: string) => {
    const conn = peers.get(peerID);
    if (conn) {
      conn.send({ type: 'control-grant' });
    }
    setRemoteControlRequests((prev) => prev.filter((id) => id !== peerID));
  };

  // Revoke control
  const revokeControl = (peerID: string) => {
    const conn = peers.get(peerID);
    if (conn) {
      conn.send({ type: 'control-revoke' });
    }
  };

  // Handle remote control event
  const handleRemoteControlEvent = (eventData: any) => {
    // Simulate event on document or specific element
    let event;
    switch (eventData.type) {
      case 'mousemove':
        event = new MouseEvent('mousemove', {
          clientX: eventData.clientX,
          clientY: eventData.clientY,
          bubbles: true,
          cancelable: true
        });
        break;
      case 'click':
        event = new MouseEvent('click', {
          clientX: eventData.clientX,
          clientY: eventData.clientY,
          button: eventData.button,
          bubbles: true,
          cancelable: true
        });
        break;
      case 'keydown':
        event = new KeyboardEvent('keydown', {
          key: eventData.key,
          code: eventData.code,
          bubbles: true,
          cancelable: true
        });
        break;
      // Add more event types as needed: mouseup, mousedown, keyup, etc.
      default:
        return;
    }
    document.dispatchEvent(event); // Dispatch on document, assuming control over whole screen
  };

  // Capture local events and send if controlling
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      sendControlEventToControlled({
        type: 'mousemove',
        clientX: e.clientX,
        clientY: e.clientY
      });
    };
    const handleClick = (e: MouseEvent) => {
      sendControlEventToControlled({
        type: 'click',
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button
      });
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      sendControlEventToControlled({
        type: 'keydown',
        key: e.key,
        code: e.code
      });
    };

    // Add listeners if controlling any
    if (Array.from(isControlling.values()).some((v) => v)) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isControlling]);

  // Send control event to all controlled peers
  const sendControlEventToControlled = (eventData: any) => {
    isControlling.forEach((isControl, peerID) => {
      if (isControl) {
        const conn = peers.get(peerID);
        if (conn) {
          conn.send({
            type: 'control-event',
            event: eventData
          });
        }
      }
    });
  };

  // Destroy room (for creator)
  const destroyRoom = () => {
    if (isCreator) {
      broadcastToPeers({ type: 'room-destroyed' });
      peers.forEach((conn) => conn.close());
      peerRef.current.destroy();
      setRoomID(null);
      setRoomPassword(null);
      setIsCreator(false);
      setPeers(new Map());
      setDataChannels(new Map());
      setChatMessages([]);
      setSharedStreams(new Map());
      if (roomTimeout) clearTimeout(roomTimeout);
      alert('Room destroyed');
    }
  };

  // UI for remote streams
  const renderSharedScreens = () => {
    return Array.from(sharedStreams.entries()).map(([peerID, stream]) => {
      if (stream.getVideoTracks().length > 0) {
        return (
          <div key={peerID} className="mt-4">
            <h4>Shared screen from {peerID}</h4>
            <video
              ref={(el) => {
                if (el) {
                  videoRefs.current.set(peerID, el);
                  el.srcObject = stream;
                  el.play();
                }
              }}
              autoPlay
              playsInline
              className="w-full h-auto border border-white/20"
            />
            <div>
              <Button onClick={() => requestControl(peerID)}>Request Control</Button>
              {isControlling.get(peerID) && <Button onClick={() => revokeControl(peerID)}>Revoke Control</Button>}
            </div>
          </div>
        );
      }
      return null;
    });
  };

  // UI for control requests (if sharing)
  const renderControlRequests = () => {
    if (isSharingScreen && remoteControlRequests.length > 0) {
      return (
        <div className="mt-4">
          <h4>Control Requests</h4>
          {remoteControlRequests.map((peerID) => (
            <div key={peerID}>
              {peerID} requests control
              <Button onClick={() => grantControl(peerID)}>Grant</Button>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Chat UI
  const renderChat = () => {
    if (isChatOpen) {
      return (
        <div className="fixed bottom-0 right-0 w-80 h-96 bg-background/95 border border-white/10 p-4">
          <h4>Group Chat</h4>
          <div ref={chatRef} className="h-72 overflow-y-auto">
            {chatMessages.map((msg, idx) => (
              <div key={idx}>
                <span className="font-bold">{msg.sender}:</span> {msg.message}
              </div>
            ))}
          </div>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            className="w-full bg-transparent border-b"
          />
          <Button onClick={sendChat}>Send</Button>
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="min-h-screen bg-background relative"
    >
      <div className="fixed inset-0 bg-gradient-to-b from-background/95 to-background pointer-events-none" />
      
      <motion.nav 
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-30"
      >
        <Navbar />
      </motion.nav>

      <div className="container mx-auto py-8">
        <MediaActions
          isFavorite={isFavorite}
          isInMyWatchlist={isInMyWatchlist}
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

          {/* New Collaboration Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Collaboration</h3>
            {!roomID ? (
              <div className="flex space-x-4">
                <Button onClick={createRoom}>Create Room</Button>
                <Button onClick={joinRoom}>Join Room</Button>
              </div>
            ) : (
              <div>
                <p>Room ID: {roomID}</p>
                {isCreator && <Button onClick={destroyRoom}>Destroy Room</Button>}
              </div>
            )}
            <div className="flex space-x-4">
              <Button onClick={startScreenShare} disabled={isSharingScreen}>Start Screen Share</Button>
              <Button onClick={stopScreenShare} disabled={!isSharingScreen}>Stop Screen Share</Button>
              <Button onClick={enableVoice} disabled={isVoiceEnabled}>Enable Voice</Button>
              <Button onClick={disableVoice} disabled={!isVoiceEnabled}>Disable Voice</Button>
              <Button onClick={() => setIsChatOpen(!isChatOpen)}>Toggle Group Chat</Button>
            </div>
            {renderSharedScreens()}
            {renderControlRequests()}
            {renderChat()}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Player;```
