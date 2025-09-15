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

// Player component with collaboration features (screen sharing, voice, chat, room management)
const Player = () => {
  // Extract URL parameters for media playback
  const { id, season, episode, type } = useParams<{
    id: string;
    season?: string;
    episode?: string;
    type: string;
  }>();
  const { user } = useAuth();

  // Media player hook for video playback functionality
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

  // Construct poster URL for video player
  const posterUrl = mediaDetails
    ? `https://image.tmdb.org/t/p/w1280${mediaDetails.backdrop_path}`
    : undefined;

  // State for collaboration features
  const [isPeerLoaded, setIsPeerLoaded] = useState(false); // Tracks if PeerJS is loaded
  const [roomID, setRoomID] = useState<string | null>(null); // Current room ID
  const [roomPassword, setRoomPassword] = useState<string | null>(null); // Room password
  const [username, setUsername] = useState<string>(user?.username || 'Anonymous'); // User display name
  const [peers, setPeers] = useState<Map<string, any>>(new Map()); // Connected peers
  const [dataChannels, setDataChannels] = useState<Map<string, RTCDataChannel>>(new Map()); // Data channels for peers
  const [chatMessages, setChatMessages] = useState<
    { sender: string; message: string; timestamp: number }[]
  >([]); // Chat message history
  const [isSharingScreen, setIsSharingScreen] = useState(false); // Screen sharing status
  const [sharedStreams, setSharedStreams] = useState<Map<string, MediaStream>>(new Map()); // Remote peer streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null); // Local media stream
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false); // Voice chat status
  const [isChatOpen, setIsChatOpen] = useState(false); // Chat panel visibility
  const [chatInput, setChatInput] = useState(''); // Chat input field
  const [isControlling, setIsControlling] = useState<Map<string, boolean>>(new Map()); // Remote control permissions
  const [remoteControlRequests, setRemoteControlRequests] = useState<string[]>([]); // Pending control requests
  const [myPeerID, setMyPeerID] = useState<string | null>(null); // Local peer ID
  const [isCreator, setIsCreator] = useState(false); // Room creator status
  const [roomTimeout, setRoomTimeout] = useState<NodeJS.Timeout | null>(null); // Room expiration timer
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected'); // Peer connection status

  // Refs for DOM and WebRTC
  const peerRef = useRef<any>(null); // PeerJS instance
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map()); // Remote video elements
  const chatRef = useRef<HTMLDivElement>(null); // Chat container

  // Load PeerJS from CDN
  useEffect(() => {
    // Create script element for PeerJS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    script.async = true;
    script.onload = () => {
      setIsPeerLoaded(true);
      console.log('PeerJS loaded successfully');
    };
    script.onerror = () => {
      console.error('Failed to load PeerJS');
      setConnectionStatus('Failed to load PeerJS');
    };
    document.body.appendChild(script);

    // Cleanup on unmount
    return () => {
      document.body.removeChild(script);
      if (peerRef.current) {
        peerRef.current.destroy();
        console.log('PeerJS instance destroyed');
      }
      if (roomTimeout) {
        clearTimeout(roomTimeout);
        console.log('Room timeout cleared');
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        console.log('Local stream stopped');
      }
    };
  }, []);

  // Initialize PeerJS when loaded
  useEffect(() => {
    if (isPeerLoaded && !peerRef.current) {
      const Peer = (window as any).Peer;
      const tempPeerID = crypto.randomUUID();
      peerRef.current = new Peer(tempPeerID, {
        debug: 2, // Enable detailed logging
      });

      peerRef.current.on('open', (id: string) => {
        setMyPeerID(id);
        setConnectionStatus('Connected');
        console.log('Peer connection opened, ID:', id);
      });

      peerRef.current.on('connection', handleIncomingDataConnection);
      peerRef.current.on('call', handleIncomingCall);
      peerRef.current.on('error', (err: any) => {
        console.error('PeerJS error:', err);
        setConnectionStatus(`Error: ${err.message}`);
      });
    }
  }, [isPeerLoaded]);

  // Create a new room
  const createRoom = () => {
    if (!peerRef.current) {
      alert('PeerJS not loaded');
      return;
    }

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
    setConnectionStatus('Creating room...');

    // Reinitialize peer with room ID
    peerRef.current.destroy();
    const Peer = (window as any).Peer;
    peerRef.current = new Peer(newRoomID);

    peerRef.current.on('open', (id: string) => {
      setMyPeerID(id);
      setConnectionStatus('Room created');
      console.log('Room created with ID:', id);
      const roomURL = `${window.location.origin}${window.location.pathname}?room=${id}`;
      prompt('Share this URL with others:', roomURL);

      // Set room to expire after 6 hours (21600000 ms)
      const timeout = setTimeout(() => {
        destroyRoom();
      }, 21600000);
      setRoomTimeout(timeout);
      console.log('Room timeout set for 6 hours');
    });

    peerRef.current.on('connection', handleIncomingDataConnection);
    peerRef.current.on('call', handleIncomingCall);
    peerRef.current.on('error', (err: any) => {
      console.error('Room creation error:', err);
      setConnectionStatus(`Room error: ${err.message}`);
    });
  };

  // Join an existing room
  const joinRoom = () => {
    if (!peerRef.current) {
      alert('PeerJS not loaded');
      return;
    }

    const roomURL = prompt('Enter room URL:');
    if (!roomURL) {
      alert('Room URL is required');
      return;
    }

    try {
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
      setRoomPassword(password);
      setConnectionStatus('Joining room...');

      const conn = peerRef.current.connect(joinRoomID);
      conn.on('open', () => {
        console.log('Connected to room creator:', joinRoomID);
        conn.send({
          type: 'join-request',
          password,
          username: joinUsername,
          peerID: myPeerID,
        });
      });

      conn.on('data', (data: any) => {
        if (data.type === 'join-accepted') {
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
          setConnectionStatus('Joined room');
          alert('Joined room successfully');
        } else if (data.type === 'join-rejected') {
          alert('Invalid password or rejected');
          setRoomID(null);
          setRoomPassword(null);
          setConnectionStatus('Join rejected');
        }
      });

      conn.on('error', (err: any) => {
        console.error('Connection error:', err);
        setConnectionStatus(`Connection error: ${err.message}`);
      });

      addPeerConnection(joinRoomID, conn);
    } catch (err) {
      console.error('Invalid URL:', err);
      alert('Invalid room URL format');
      setConnectionStatus('Invalid URL');
    }
  };

  // Handle incoming data connection
  const handleIncomingDataConnection = (conn: any) => {
    conn.on('open', () => {
      console.log('Data connection opened with peer:', conn.peer);
      setConnectionStatus(`Connected to ${conn.peer}`);
    });

    conn.on('data', (data: any) => {
      console.log('Received data from', conn.peer, ':', data);
      if (data.type === 'join-request') {
        handleJoinRequest(conn, data);
      } else if (data.type === 'chat') {
        setChatMessages((prev) => [
          ...prev,
          {
            sender: data.sender,
            message: data.message,
            timestamp: Date.now(),
          },
        ]);
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
      } else if (data.type === 'room-destroyed') {
        alert('Room has been destroyed by creator');
        leaveRoom();
      }
    });

    conn.on('close', () => {
      console.log('Data connection closed with', conn.peer);
      removePeerConnection(conn.peer);
    });

    conn.on('error', (err: any) => {
      console.error('Data connection error with', conn.peer, ':', err);
    });

    addPeerConnection(conn.peer, conn);
  };

  // Handle join request (creator only)
  const handleJoinRequest = (conn: any, data: any) => {
    if (!isCreator) return;

    if (data.password === roomPassword) {
      conn.send({
        type: 'join-accepted',
        peers: Array.from(peers.keys()),
      });
      broadcastToPeers({
        type: 'peer-list-update',
        peers: [data.peerID],
      });
      addPeerConnection(data.peerID, conn);
      alert(`${data.username} has joined the room`);
      setConnectionStatus(`${data.username} joined`);
    } else {
      conn.send({ type: 'join-rejected' });
      conn.close();
      alert(`${data.username} attempted to join with wrong password`);
      setConnectionStatus('Join attempt rejected');
    }
  };

  // Connect to a peer
  const connectToPeer = (peerID: string) => {
    if (peers.has(peerID) || peerID === myPeerID) {
      console.log('Already connected to', peerID, 'or self');
      return;
    }

    const conn = peerRef.current.connect(peerID);
    conn.on('open', () => {
      console.log('Connected to peer:', peerID);
      setConnectionStatus(`Connected to ${peerID}`);
    });
    conn.on('data', handleDataFromPeer);
    conn.on('close', () => {
      console.log('Disconnected from peer:', peerID);
      removePeerConnection(peerID);
    });
    conn.on('error', (err: any) => {
      console.error('Peer connection error:', err);
      setConnectionStatus(`Peer error: ${err.message}`);
    });

    addPeerConnection(peerID, conn);

    if (isVoiceEnabled && localStream) {
      callPeerWithStream(peerID, localStream);
    }
    if (isSharingScreen && localStream) {
      callPeerWithStream(peerID, localStream);
    }
  };

  // Handle data from peers
  const handleDataFromPeer = (data: any) => {
    // Centralized handling if needed
    console.log('Data from peer:', data);
  };

  // Add peer connection
  const addPeerConnection = (peerID: string, conn: any) => {
    setPeers((prev) => {
      const newMap = new Map(prev);
      newMap.set(peerID, conn);
      return newMap;
    });
    console.log('Added peer connection:', peerID);
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
    setDataChannels((prev) => {
      const newMap = new Map(prev);
      newMap.delete(peerID);
      return newMap;
    });
    if (videoRefs.current.has(peerID)) {
      videoRefs.current.delete(peerID);
    }
    console.log('Removed peer connection:', peerID);
    setConnectionStatus(`Disconnected from ${peerID}`);
  };

  // Broadcast message to all peers
  const broadcastToPeers = (data: any) => {
    peers.forEach((conn) => {
      if (conn.open) {
        try {
          conn.send(data);
          console.log('Sent data to', conn.peer, ':', data);
        } catch (err) {
          console.error('Error sending to', conn.peer, ':', err);
        }
      }
    });
  };

  // Start screen sharing
  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      setIsSharingScreen(true);
      setConnectionStatus('Screen sharing started');

      peers.forEach((_, peerID) => {
        callPeerWithStream(peerID, stream);
      });

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          stopScreenShare();
          console.log('Screen share ended by user');
        };
      });
    } catch (err) {
      console.error('Screen share error:', err);
      alert('Failed to start screen sharing');
      setConnectionStatus('Screen share failed');
    }
  };

  // Stop screen sharing
  const stopScreenShare = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setIsSharingScreen(false);
    setConnectionStatus('Screen sharing stopped');
    console.log('Screen sharing stopped');
  };

  // Enable voice chat
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
      setConnectionStatus('Voice enabled');

      peers.forEach((_, peerID) => {
        callPeerWithStream(peerID, localStream!);
      });
    } catch (err) {
      console.error('Voice enable error:', err);
      alert('Failed to enable voice');
      setConnectionStatus('Voice enable failed');
    }
  };

  // Disable voice chat
  const disableVoice = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => track.stop());
    }
    setIsVoiceEnabled(false);
    setConnectionStatus('Voice disabled');
    console.log('Voice disabled');
  };

  // Call peer with media stream
  const callPeerWithStream = (peerID: string, stream: MediaStream) => {
    try {
      const call = peerRef.current.call(peerID, stream);
      call.on('stream', (remoteStream: MediaStream) => {
        console.log('Received stream from', peerID);
      });
      call.on('close', () => {
        console.log('Call with', peerID, 'closed');
      });
      call.on('error', (err: any) => {
        console.error('Call error with', peerID, ':', err);
        setConnectionStatus(`Call error with ${peerID}`);
      });
    } catch (err) {
      console.error('Failed to call', peerID, ':', err);
    }
  };

  // Handle incoming call (media stream)
  const handleIncomingCall = (call: any) => {
    call.answer(null); // Receive stream without sending back
    call.on('stream', (remoteStream: MediaStream) => {
      setSharedStreams((prev) => {
        const newMap = new Map(prev);
        newMap.set(call.peer, remoteStream);
        return newMap;
      });
      setConnectionStatus(`Receiving stream from ${call.peer}`);
      console.log('Received stream from', call.peer);

      if (remoteStream.getAudioTracks().length > 0) {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.play().catch((err) => console.error('Audio play error:', err));
      }
    });
    call.on('close', () => {
      setSharedStreams((prev) => {
        const newMap = new Map(prev);
        newMap.delete(call.peer);
        return newMap;
      });
      console.log('Stream from', call.peer, 'closed');
      setConnectionStatus(`Stream from ${call.peer} closed`);
    });
    call.on('error', (err: any) => {
      console.error('Call error:', err);
      setConnectionStatus(`Call error: ${err.message}`);
    });
  };

  // Send chat message
  const sendChat = () => {
    if (!chatInput.trim()) {
      alert('Cannot send empty message');
      return;
    }

    const message = {
      type: 'chat',
      sender: username,
      message: chatInput,
    };

    broadcastToPeers(message);
    setChatMessages((prev) => [
      ...prev,
      {
        sender: username,
        message: chatInput,
        timestamp: Date.now(),
      },
    ]);
    setChatInput('');
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
    setConnectionStatus('Chat message sent');
    console.log('Sent chat message:', chatInput);
  };

  // Request remote control
  const requestControl = (peerID: string) => {
    const conn = peers.get(peerID);
    if (conn) {
      conn.send({ type: 'control-request' });
      console.log('Requested control from', peerID);
      setConnectionStatus(`Requested control from ${peerID}`);
    } else {
      console.error('No connection to', peerID);
      setConnectionStatus('Control request failed: No connection');
    }
  };

  // Grant remote control
  const grantControl = (peerID: string) => {
    const conn = peers.get(peerID);
    if (conn) {
      conn.send({ type: 'control-grant' });
      setRemoteControlRequests((prev) => prev.filter((id) => id !== peerID));
      console.log('Granted control to', peerID);
      setConnectionStatus(`Granted control to ${peerID}`);
    }
  };

  // Revoke remote control
  const revokeControl = (peerID: string) => {
    const conn = peers.get(peerID);
    if (conn) {
      conn.send({ type: 'control-revoke' });
      console.log('Revoked control from', peerID);
      setConnectionStatus(`Revoked control from ${peerID}`);
    }
  };

  // Handle remote control events
  const handleRemoteControlEvent = (eventData: any) => {
    try {
      let event;
      switch (eventData.type) {
        case 'mousemove':
          event = new MouseEvent('mousemove', {
            clientX: eventData.clientX,
            clientY: eventData.clientY,
            bubbles: true,
            cancelable: true,
          });
          break;
        case 'click':
          event = new MouseEvent('click', {
            clientX: eventData.clientX,
            clientY: eventData.clientY,
            button: eventData.button,
            bubbles: true,
            cancelable: true,
          });
          break;
        case 'keydown':
          event = new KeyboardEvent('keydown', {
            key: eventData.key,
            code: eventData.code,
            bubbles: true,
            cancelable: true,
          });
          break;
        default:
          console.warn('Unknown control event:', eventData.type);
          return;
      }
      document.dispatchEvent(event);
      console.log('Dispatched control event:', eventData.type);
    } catch (err) {
      console.error('Control event error:', err);
      setConnectionStatus('Control event error');
    }
  };

  // Capture local control events
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      sendControlEventToControlled({
        type: 'mousemove',
        clientX: e.clientX,
        clientY: e.clientY,
      });
    };
    const handleClick = (e: MouseEvent) => {
      sendControlEventToControlled({
        type: 'click',
        clientX: e.clientX,
        clientY: e.clientY,
        button: e.button,
      });
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      sendControlEventToControlled({
        type: 'keydown',
        key: e.key,
        code: e.code,
      });
    };

    if (Array.from(isControlling.values()).some((v) => v)) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('click', handleClick);
      document.addEventListener('keydown', handleKeyDown);
      console.log('Control event listeners added');
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      console.log('Control event listeners removed');
    };
  }, [isControlling]);

  // Send control events to controlled peers
  const sendControlEventToControlled = (eventData: any) => {
    isControlling.forEach((isControl, peerID) => {
      if (isControl) {
        const conn = peers.get(peerID);
        if (conn) {
          try {
            conn.send({
              type: 'control-event',
              event: eventData,
            });
            console.log('Sent control event to', peerID, ':', eventData);
          } catch (err) {
            console.error('Error sending control event to', peerID, ':', err);
          }
        }
      }
    });
  };

  // Destroy room (creator only)
  const destroyRoom = () => {
    if (isCreator) {
      broadcastToPeers({ type: 'room-destroyed' });
      peers.forEach((conn) => {
        try {
          conn.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      });
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      setRoomID(null);
      setRoomPassword(null);
      setIsCreator(false);
      setPeers(new Map());
      setDataChannels(new Map());
      setChatMessages([]);
      setSharedStreams(new Map());
      if (roomTimeout) {
        clearTimeout(roomTimeout);
      }
      setConnectionStatus('Room destroyed');
      alert('Room destroyed');
      console.log('Room destroyed');
    }
  };

  // Leave room (non-creator)
  const leaveRoom = () => {
    if (!isCreator) {
      peers.forEach((conn) => {
        try {
          conn.close();
        } catch (err) {
          console.error('Error closing connection:', err);
        }
      });
      if (peerRef.current) {
        peerRef.current.destroy();
      }
      setRoomID(null);
      setRoomPassword(null);
      setPeers(new Map());
      setDataChannels(new Map());
      setChatMessages([]);
      setSharedStreams(new Map());
      setIsSharingScreen(false);
      setIsVoiceEnabled(false);
      setLocalStream(null);
      setConnectionStatus('Left room');
      console.log('Left room');
    }
  };

  // Format timestamp for chat
  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Render shared screens
  const renderSharedScreens = () => {
    return Array.from(sharedStreams.entries()).map(([peerID, stream]) => {
      if (stream.getVideoTracks().length > 0) {
        return (
          <div key={peerID} className="mt-4">
            <h4 className="text-white">Shared screen from {peerID}</h4>
            <video
              ref={(el) => {
                if (el) {
                  videoRefs.current.set(peerID, el);
                  el.srcObject = stream;
                  el.play().catch((err) => console.error('Video play error:', err));
                }
              }}
              autoPlay
              playsInline
              className="w-full h-auto border border-white/20"
            />
            <div className="flex space-x-2 mt-2">
              <Button
                onClick={() => requestControl(peerID)}
                disabled={isControlling.get(peerID)}
              >
                Request Control
              </Button>
              {isControlling.get(peerID) && (
                <Button onClick={() => revokeControl(peerID)}>Revoke Control</Button>
              )}
            </div>
          </div>
        );
      }
      return null;
    });
  };

  // Render control requests
  const renderControlRequests = () => {
    if (isSharingScreen && remoteControlRequests.length > 0) {
      return (
        <div className="mt-4">
          <h4 className="text-white">Control Requests</h4>
          {remoteControlRequests.map((peerID) => (
            <div key={peerID} className="flex items-center space-x-2">
              <span>{peerID} requests control</span>
              <Button onClick={() => grantControl(peerID)}>Grant</Button>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  // Render chat panel
  const renderChat = () => {
    return (
      <div
        className={`fixed bottom-0 right-0 w-80 h-96 bg-background/95 border border-white/10 p-4 transition-all ${
          isChatOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <h4 className="text-white">Group Chat</h4>
        <div
          ref={chatRef}
          className="h-72 overflow-y-auto bg-black/20 p-2 rounded"
        >
          {chatMessages.map((msg, idx) => (
            <div key={idx} className="mb-2">
              <span className="font-bold text-white">{msg.sender}</span>
              <span className="text-gray-400 text-sm ml-2">
                [{formatTimestamp(msg.timestamp)}]
              </span>
              <span className="ml-2 text-white">{msg.message}</span>
            </div>
          ))}
        </div>
        <input
          type="text"
          value={chatInput}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && sendChat()}
          className="w-full bg-transparent border-b border-white/20 text-white"
          placeholder="Type a message..."
        />
        <Button onClick={sendChat} className="mt-2 w-full">
          Send
        </Button>
      </div>
    );
  };

  // Render collaboration controls
  const renderCollaborationControls = () => {
    return (
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-white">Collaboration</h3>
        <p className="text-sm text-white/60">Connection Status: {connectionStatus}</p>
        <div className="flex items-center justify-between">
          <div className="flex space-x-4">
            {!roomID ? (
              <>
                <Button onClick={createRoom}>Create Room</Button>
                <Button onClick={joinRoom}>Join Room</Button>
              </>
            ) : (
              <>
                <p className="text-white">Room ID: {roomID}</p>
                {isCreator ? (
                  <Button onClick={destroyRoom}>Destroy Room</Button>
                ) : (
                  <Button onClick={leaveRoom}>Leave Room</Button>
                )}
              </>
            )}
          </div>
        </div>
        <div className="flex space-x-4">
          <Button
            onClick={startScreenShare}
            disabled={isSharingScreen}
            className={isSharingScreen ? 'bg-gray-500' : ''}
          >
            Start Screen Share
          </Button>
          <Button
            onClick={stopScreenShare}
            disabled={!isSharingScreen}
            className={!isSharingScreen ? 'bg-gray-500' : ''}
          >
            Stop Screen Share
          </Button>
          <Button
            onClick={enableVoice}
            disabled={isVoiceEnabled}
            className={isVoiceEnabled ? 'bg-gray-500' : ''}
          >
            Enable Voice
          </Button>
          <Button
            onClick={disableVoice}
            disabled={!isVoiceEnabled}
            className={!isVoiceEnabled ? 'bg-gray-500' : ''}
          >
            Disable Voice
          </Button>
          <Button onClick={() => setIsChatOpen(!isChatOpen)}>
            {isChatOpen ? 'Hide Chat' : 'Show Chat'}
          </Button>
        </div>
        {renderSharedScreens()}
        {renderControlRequests()}
        {renderChat()}
      </div>
    );
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

        {/* Video Player */}
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
          {/* Episode Navigation */}
          {mediaType === 'tv' && episodes.length > 0 && (
            <EpisodeNavigation
              episodes={episodes}
              currentEpisodeIndex={currentEpisodeIndex}
              onPreviousEpisode={goToPreviousEpisode}
              onNextEpisode={goToNextEpisode}
            />
          )}

          {/* Video Sources */}
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

          {/* Collaboration Controls (After Video Player) */}
          {renderCollaborationControls()}
        </motion.div>
      </div>
    </motion.div>
  );
};

export default Player;
