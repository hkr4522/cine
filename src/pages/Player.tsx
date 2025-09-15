import { useParams, useLocation } from 'react-router-dom';
import { ExternalLink, X } from 'lucide-react';
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
import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Player component for video playback with collaboration features.
 * Includes room creation/joining, screen sharing, voice chat, group chat, and remote control.
 * Collaboration options are shown in an overlay triggered by a "More Settings" button.
 * Automatically prompts for password when joining via URL (?room=ID).
 */
const Player = () => {
  // Extract URL parameters for media playback
  const { id, season, episode, type } = useParams<{
    id: string;
    season?: string;
    episode?: string;
    type: string;
  }>();
  const { user } = useAuth();
  const location = useLocation();

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
  const [isPeerLoaded, setIsPeerLoaded] = useState(false); // Tracks PeerJS loading
  const [roomID, setRoomID] = useState<string | null>(null); // Current room ID
  const [roomPassword, setRoomPassword] = useState<string | null>(null); // Room password
  const [username, setUsername] = useState<string>(user?.username || 'Anonymous'); // User display name
  const [peers, setPeers] = useState<Map<string, any>>(new Map()); // Connected peers
  const [dataChannels, setDataChannels] = useState<Map<string, RTCDataChannel>>(new Map()); // Data channels
  const [chatMessages, setChatMessages] = useState<
    { sender: string; message: string; timestamp: number; color: string }[]
  >([]); // Chat message history
  const [isSharingScreen, setIsSharingScreen] = useState(false); // Screen sharing status
  const [sharedStreams, setSharedStreams] = useState<Map<string, MediaStream>>(new Map()); // Remote streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null); // Local media stream
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false); // Voice chat status
  const [isChatOpen, setIsChatOpen] = useState(false); // Chat panel visibility
  const [chatInput, setChatInput] = useState(''); // Chat input field
  const [isControlling, setIsControlling] = useState<Map<string, boolean>>(new Map()); // Remote control permissions
  const [remoteControlRequests, setRemoteControlRequests] = useState<string[]>([]); // Control requests
  const [myPeerID, setMyPeerID] = useState<string | null>(null); // Local peer ID
  const [isCreator, setIsCreator] = useState(false); // Room creator status
  const [roomTimeout, setRoomTimeout] = useState<NodeJS.Timeout | null>(null); // Room expiration timer
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected'); // Connection status
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // Error modal message
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]); // Connection log history
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Overlay visibility

  // Refs for DOM and WebRTC
  const peerRef = useRef<any>(null); // PeerJS instance
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map()); // Remote video elements
  const chatRef = useRef<HTMLDivElement>(null); // Chat container
  const logRef = useRef<HTMLDivElement>(null); // Connection log container

  /**
   * Generates a random color for chat messages
   * @returns {string} Hex color code
   */
  const generateUserColor = useCallback(() => {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }, []);

  /**
   * Sanitizes user input to prevent XSS
   * @param {string} input - User input
   * @returns {string} Sanitized input
   */
  const sanitizeInput = useCallback((input: string) => {
    return input.replace(/[<>&"']/g, (char) => {
      const escapes: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;',
        "'": '&#x27;',
      };
      return escapes[char] || char;
    });
  }, []);

  /**
   * Logs a connection event
   * @param {string} message - Log message
   */
  const logConnectionEvent = useCallback((message: string) => {
    setConnectionLogs((prev) => [...prev, `${new Date().toLocaleString()}: ${message}`]);
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    console.log(message);
  }, []);

  /**
   * Loads PeerJS from CDN
   */
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    script.async = true;
    script.onload = () => {
      setIsPeerLoaded(true);
      logConnectionEvent('PeerJS loaded successfully');
    };
    script.onerror = () => {
      setErrorMessage('Failed to load PeerJS');
      logConnectionEvent('Failed to load PeerJS');
    };
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
      if (peerRef.current) {
        peerRef.current.destroy();
        logConnectionEvent('PeerJS instance destroyed');
      }
      if (roomTimeout) {
        clearTimeout(roomTimeout);
        logConnectionEvent('Room timeout cleared');
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        logConnectionEvent('Local stream stopped');
      }
    };
  }, [logConnectionEvent]);

  /**
   * Initializes PeerJS connection
   */
  useEffect(() => {
    if (isPeerLoaded && !peerRef.current) {
      const Peer = (window as any).Peer;
      const tempPeerID = crypto.randomUUID();
      peerRef.current = new Peer(tempPeerID, { debug: 3 });

      peerRef.current.on('open', (id: string) => {
        setMyPeerID(id);
        setConnectionStatus('Connected');
        logConnectionEvent(`Peer connection opened, ID: ${id}`);
      });

      peerRef.current.on('connection', handleIncomingDataConnection);
      peerRef.current.on('call', handleIncomingCall);
      peerRef.current.on('error', (err: any) => {
        setErrorMessage(`PeerJS error: ${err.message}`);
        logConnectionEvent(`PeerJS error: ${err.message}`);
      });
    }
  }, [isPeerLoaded, logConnectionEvent]);

  /**
   * Checks for room ID in URL and prompts for password
   */
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const joinRoomID = searchParams.get('room');
    if (joinRoomID && !roomID && isPeerLoaded) {
      const password = prompt('Enter room password:');
      if (!password) {
        setErrorMessage('Password is required to join the room');
        logConnectionEvent('Password prompt cancelled');
        return;
      }
      joinRoom(joinRoomID, password);
    }
  }, [location.search, isPeerLoaded, roomID, logConnectionEvent]);

  /**
   * Creates a new collaboration room
   */
  const createRoom = useCallback(() => {
    if (!peerRef.current) {
      setErrorMessage('PeerJS not loaded');
      return;
    }

    const newUsername = prompt('Enter your username:') || 'Anonymous';
    const password = prompt('Enter room password:');
    if (!password) {
      setErrorMessage('Password is required');
      return;
    }

    const sanitizedUsername = sanitizeInput(newUsername);
    const sanitizedPassword = sanitizeInput(password);
    const newRoomID = crypto.randomUUID();

    setRoomID(newRoomID);
    setRoomPassword(sanitizedPassword);
    setUsername(sanitizedUsername);
    setIsCreator(true);
    setConnectionStatus('Creating room...');
    logConnectionEvent('Creating room...');

    peerRef.current.destroy();
    const Peer = (window as any).Peer;
    peerRef.current = new Peer(newRoomID);

    peerRef.current.on('open', (id: string) => {
      setMyPeerID(id);
      setConnectionStatus('Room created');
      const roomURL = `${window.location.origin}${window.location.pathname}?room=${id}`;
      prompt('Share this URL with others:', roomURL);
      logConnectionEvent(`Room created with ID: ${id}`);

      const timeout = setTimeout(() => {
        destroyRoom();
      }, 21600000); // 6 hours
      setRoomTimeout(timeout);
    });

    peerRef.current.on('connection', handleIncomingDataConnection);
    peerRef.current.on('call', handleIncomingCall);
    peerRef.current.on('error', (err: any) => {
      setErrorMessage(`Room creation error: ${err.message}`);
      logConnectionEvent(`Room creation error: ${err.message}`);
    });
  }, [logConnectionEvent, sanitizeInput]);

  /**
   * Joins a room with a given ID and password
   * @param {string} joinRoomID - Room ID
   * @param {string} password - Room password
   */
  const joinRoom = useCallback(
    (joinRoomID?: string, providedPassword?: string) => {
      if (!peerRef.current) {
        setErrorMessage('PeerJS not loaded');
        return;
      }

      let finalRoomID = joinRoomID;
      let password = providedPassword;

      if (!joinRoomID) {
        const roomURL = prompt('Enter room URL:');
        if (!roomURL) {
          setErrorMessage('Room URL is required');
          return;
        }

        try {
          const url = new URL(roomURL);
          finalRoomID = url.searchParams.get('room');
          if (!finalRoomID) {
            setErrorMessage('Invalid room URL');
            return;
          }
          password = prompt('Enter room password:');
          if (!password) {
            setErrorMessage('Password is required');
            return;
          }
        } catch (err) {
          setErrorMessage('Invalid room URL format');
          logConnectionEvent(`Invalid URL: ${err.message}`);
          return;
        }
      }

      const joinUsername = prompt('Enter your username (optional):') || 'Anonymous';
      const sanitizedUsername = sanitizeInput(joinUsername);
      const sanitizedPassword = sanitizeInput(password || '');

      setRoomID(finalRoomID!);
      setUsername(sanitizedUsername);
      setRoomPassword(sanitizedPassword);
      setConnectionStatus('Joining room...');
      logConnectionEvent('Joining room...');

      const conn = peerRef.current.connect(finalRoomID!);
      conn.on('open', () => {
        conn.send({
          type: 'join-request',
          password: sanitizedPassword,
          username: sanitizedUsername,
          peerID: myPeerID,
        });
        logConnectionEvent(`Connected to room creator: ${finalRoomID}`);
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
          logConnectionEvent('Joined room successfully');
        } else if (data.type === 'join-rejected') {
          setErrorMessage('Invalid password or rejected');
          setRoomID(null);
          setRoomPassword(null);
          setConnectionStatus('Join rejected');
          logConnectionEvent('Join rejected');
        }
      });

      conn.on('error', (err: any) => {
        setErrorMessage(`Connection error: ${err.message}`);
        logConnectionEvent(`Connection error: ${err.message}`);
      });

      addPeerConnection(finalRoomID!, conn);
    },
    [myPeerID, sanitizeInput, logConnectionEvent]
  );

  /**
   * Handles incoming data connections from peers
   * @param {any} conn - PeerJS connection object
   */
  const handleIncomingDataConnection = useCallback(
    (conn: any) => {
      conn.on('open', () => {
        logConnectionEvent(`Data connection opened with peer: ${conn.peer}`);
      });

      conn.on('data', (data: any) => {
        if (data.type === 'join-request') {
          handleJoinRequest(conn, data);
        } else if (data.type === 'chat') {
          setChatMessages((prev) => [
            ...prev,
            {
              sender: data.sender,
              message: sanitizeInput(data.message),
              timestamp: Date.now(),
              color: generateUserColor(),
            },
          ]);
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
          }
        } else if (data.type === 'control-request') {
          setRemoteControlRequests((prev) => [...prev, conn.peer]);
          logConnectionEvent(`Control request from ${conn.peer}`);
        } else if (data.type === 'control-grant') {
          setIsControlling((prev) => {
            const newMap = new Map(prev);
            newMap.set(conn.peer, true);
            return newMap;
          });
          logConnectionEvent(`Control granted by ${conn.peer}`);
        } else if (data.type === 'control-revoke') {
          setIsControlling((prev) => {
            const newMap = new Map(prev);
            newMap.delete(conn.peer);
            return newMap;
          });
          logConnectionEvent(`Control revoked by ${conn.peer}`);
        } else if (data.type === 'control-event') {
          handleRemoteControlEvent(data.event);
        } else if (data.type === 'peer-list-update') {
          const newPeers = data.peers.filter((p: string) => p !== myPeerID);
          newPeers.forEach((p: string) => connectToPeer(p));
        } else if (data.type === 'room-destroyed') {
          setErrorMessage('Room has been destroyed by creator');
          leaveRoom();
        }
      });

      conn.on('close', () => {
        removePeerConnection(conn.peer);
        logConnectionEvent(`Data connection closed with ${conn.peer}`);
      });

      conn.on('error', (err: any) => {
        logConnectionEvent(`Data connection error with ${conn.peer}: ${err.message}`);
      });

      addPeerConnection(conn.peer, conn);
    },
    [myPeerID, sanitizeInput, generateUserColor, logConnectionEvent]
  );

  /**
   * Handles join requests from peers (creator only)
   * @param {any} conn - PeerJS connection
   * @param {any} data - Join request data
   */
  const handleJoinRequest = useCallback(
    (conn: any, data: any) => {
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
        logConnectionEvent(`${data.username} joined room`);
      } else {
        conn.send({ type: 'join-rejected' });
        conn.close();
        setErrorMessage(`${data.username} attempted to join with wrong password`);
        logConnectionEvent(`${data.username} rejected: wrong password`);
      }
    },
    [isCreator, roomPassword, logConnectionEvent]
  );

  /**
   * Connects to a new peer
   * @param {string} peerID - Peer ID to connect to
   */
  const connectToPeer = useCallback(
    (peerID: string) => {
      if (peers.has(peerID) || peerID === myPeerID) {
        logConnectionEvent(`Skipped connection to ${peerID} (already connected or self)`);
        return;
      }

      const conn = peerRef.current.connect(peerID);
      conn.on('open', () => {
        setConnectionStatus(`Connected to ${peerID}`);
        logConnectionEvent(`Connected to peer: ${peerID}`);
      });
      conn.on('data', handleDataFromPeer);
      conn.on('close', () => {
        removePeerConnection(peerID);
      });
      conn.on('error', (err: any) => {
        setErrorMessage(`Peer connection error: ${err.message}`);
        logConnectionEvent(`Peer connection error: ${err.message}`);
      });

      addPeerConnection(peerID, conn);

      if (isVoiceEnabled && localStream) {
        callPeerWithStream(peerID, localStream);
      }
      if (isSharingScreen && localStream) {
        callPeerWithStream(peerID, localStream);
      }
    },
    [myPeerID, isVoiceEnabled, isSharingScreen, localStream, logConnectionEvent]
  );

  /**
   * Handles data from peers
   * @param {any} data - Received data
   */
  const handleDataFromPeer = useCallback((data: any) => {
    logConnectionEvent(`Received data: ${JSON.stringify(data)}`);
  }, [logConnectionEvent]);

  /**
   * Adds a peer connection
   * @param {string} peerID - Peer ID
   * @param {any} conn - Connection object
   */
  const addPeerConnection = useCallback((peerID: string, conn: any) => {
    setPeers((prev) => {
      const newMap = new Map(prev);
      newMap.set(peerID, conn);
      return newMap;
    });
    logConnectionEvent(`Added peer connection: ${peerID}`);
  }, [logConnectionEvent]);

  /**
   * Removes a peer connection
   * @param {string} peerID - Peer ID
   */
  const removePeerConnection = useCallback(
    (peerID: string) => {
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
      logConnectionEvent(`Removed peer connection: ${peerID}`);
    },
    [logConnectionEvent]
  );

  /**
   * Broadcasts data to all connected peers
   * @param {any} data - Data to send
   */
  const broadcastToPeers = useCallback(
    (data: any) => {
      peers.forEach((conn) => {
        if (conn.open) {
          try {
            conn.send(data);
            logConnectionEvent(`Sent data to ${conn.peer}: ${JSON.stringify(data)}`);
          } catch (err) {
            logConnectionEvent(`Error sending to ${conn.peer}: ${err.message}`);
          }
        }
      });
    },
    [peers, logConnectionEvent]
  );

  /**
   * Starts screen sharing
   */
  const startScreenShare = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      setIsSharingScreen(true);
      setConnectionStatus('Screen sharing started');
      logConnectionEvent('Screen sharing started');

      peers.forEach((_, peerID) => {
        callPeerWithStream(peerID, stream);
      });

      stream.getTracks().forEach((track) => {
        track.onended = () => {
          stopScreenShare();
          logConnectionEvent('Screen share ended by user');
        };
      });
    } catch (err) {
      setErrorMessage('Failed to start screen sharing');
      logConnectionEvent(`Screen share error: ${err.message}`);
    }
  }, [peers, logConnectionEvent]);

  /**
   * Stops screen sharing
   */
  const stopScreenShare = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
    }
    setIsSharingScreen(false);
    setConnectionStatus('Screen sharing stopped');
    logConnectionEvent('Screen sharing stopped');
  }, [localStream, logConnectionEvent]);

  /**
   * Enables voice chat
   */
  const enableVoice = useCallback(async () => {
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
      logConnectionEvent('Voice enabled');

      peers.forEach((_, peerID) => {
        callPeerWithStream(peerID, localStream!);
      });
    } catch (err) {
      setErrorMessage('Failed to enable voice');
      logConnectionEvent(`Voice enable error: ${err.message}`);
    }
  }, [localStream, peers, logConnectionEvent]);

  /**
   * Disables voice chat
   */
  const disableVoice = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => track.stop());
    }
    setIsVoiceEnabled(false);
    setConnectionStatus('Voice disabled');
    logConnectionEvent('Voice disabled');
  }, [localStream, logConnectionEvent]);

  /**
   * Calls a peer with a media stream
   * @param {string} peerID - Peer ID
   * @param {MediaStream} stream - Media stream
   */
  const callPeerWithStream = useCallback(
    (peerID: string, stream: MediaStream) => {
      try {
        const call = peerRef.current.call(peerID, stream);
        call.on('stream', (remoteStream: MediaStream) => {
          logConnectionEvent(`Received stream from ${peerID}`);
        });
        call.on('close', () => {
          logConnectionEvent(`Call with ${peerID} closed`);
        });
        call.on('error', (err: any) => {
          setErrorMessage(`Call error with ${peerID}`);
          logConnectionEvent(`Call error with ${peerID}: ${err.message}`);
        });
      } catch (err) {
        setErrorMessage(`Failed to call ${peerID}`);
        logConnectionEvent(`Failed to call ${peerID}: ${err.message}`);
      }
    },
    [logConnectionEvent]
  );

  /**
   * Handles incoming media calls
   * @param {any} call - PeerJS call object
   */
  const handleIncomingCall = useCallback(
    (call: any) => {
      call.answer(null);
      call.on('stream', (remoteStream: MediaStream) => {
        setSharedStreams((prev) => {
          const newMap = new Map(prev);
          newMap.set(call.peer, remoteStream);
          return newMap;
        });
        logConnectionEvent(`Receiving stream from ${call.peer}`);

        if (remoteStream.getAudioTracks().length > 0) {
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.play().catch((err) => logConnectionEvent(`Audio play error: ${err.message}`));
        }
      });
      call.on('close', () => {
        setSharedStreams((prev) => {
          const newMap = new Map(prev);
          newMap.delete(call.peer);
          return newMap;
        });
        logConnectionEvent(`Stream from ${call.peer} closed`);
      });
      call.on('error', (err: any) => {
        setErrorMessage(`Call error: ${err.message}`);
        logConnectionEvent(`Call error: ${err.message}`);
      });
    },
    [logConnectionEvent]
  );

  /**
   * Sends a chat message
   */
  const sendChat = useCallback(() => {
    if (!chatInput.trim()) {
      setErrorMessage('Cannot send empty message');
      return;
    }

    const sanitizedMessage = sanitizeInput(chatInput);
    const message = {
      type: 'chat',
      sender: username,
      message: sanitizedMessage,
    };

    broadcastToPeers(message);
    setChatMessages((prev) => [
      ...prev,
      {
        sender: username,
        message: sanitizedMessage,
        timestamp: Date.now(),
        color: generateUserColor(),
      },
    ]);
    setChatInput('');
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
    setConnectionStatus('Chat message sent');
    logConnectionEvent(`Sent chat message: ${sanitizedMessage}`);
  }, [chatInput, username, sanitizeInput, generateUserColor, logConnectionEvent]);

  /**
   * Requests remote control from a peer
   * @param {string} peerID - Peer ID
   */
  const requestControl = useCallback(
    (peerID: string) => {
      const conn = peers.get(peerID);
      if (conn) {
        conn.send({ type: 'control-request' });
        logConnectionEvent(`Requested control from ${peerID}`);
      } else {
        setErrorMessage('No connection to peer');
        logConnectionEvent(`Control request failed: No connection to ${peerID}`);
      }
    },
    [peers, logConnectionEvent]
  );

  /**
   * Grants remote control to a peer
   * @param {string} peerID - Peer ID
   */
  const grantControl = useCallback(
    (peerID: string) => {
      const conn = peers.get(peerID);
      if (conn) {
        conn.send({ type: 'control-grant' });
        setRemoteControlRequests((prev) => prev.filter((id) => id !== peerID));
        logConnectionEvent(`Granted control to ${peerID}`);
      }
    },
    [peers, logConnectionEvent]
  );

  /**
   * Revokes remote control from a peer
   * @param {string} peerID - Peer ID
   */
  const revokeControl = useCallback(
    (peerID: string) => {
      const conn = peers.get(peerID);
      if (conn) {
        conn.send({ type: 'control-revoke' });
        logConnectionEvent(`Revoked control from ${peerID}`);
      }
    },
    [peers, logConnectionEvent]
  );

  /**
   * Handles remote control events
   * @param {any} eventData - Event data
   */
  const handleRemoteControlEvent = useCallback(
    (eventData: any) => {
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
            logConnectionEvent(`Unknown control event: ${eventData.type}`);
            return;
        }
        document.dispatchEvent(event);
        logConnectionEvent(`Dispatched control event: ${eventData.type}`);
      } catch (err) {
        setErrorMessage('Control event error');
        logConnectionEvent(`Control event error: ${err.message}`);
      }
    },
    [logConnectionEvent]
  );

  /**
   * Captures local control events for remote peers
   */
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
      logConnectionEvent('Control event listeners added');
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
      logConnectionEvent('Control event listeners removed');
    };
  }, [isControlling, logConnectionEvent]);

  /**
   * Sends control events to controlled peers
   * @param {any} eventData - Event data
   */
  const sendControlEventToControlled = useCallback(
    (eventData: any) => {
      isControlling.forEach((isControl, peerID) => {
        if (isControl) {
          const conn = peers.get(peerID);
          if (conn) {
            try {
              conn.send({
                type: 'control-event',
                event: eventData,
              });
              logConnectionEvent(`Sent control event to ${peerID}: ${eventData.type}`);
            } catch (err) {
              logConnectionEvent(`Error sending control event to ${peerID}: ${err.message}`);
            }
          }
        }
      });
    },
    [isControlling, peers, logConnectionEvent]
  );

  /**
   * Destroys the room (creator only)
   */
  const destroyRoom = useCallback(() => {
    if (isCreator) {
      broadcastToPeers({ type: 'room-destroyed' });
      peers.forEach((conn) => {
        try {
          conn.close();
        } catch (err) {
          logConnectionEvent(`Error closing connection: ${err.message}`);
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
      setErrorMessage('Room destroyed');
      logConnectionEvent('Room destroyed');
    }
  }, [isCreator, peers, roomTimeout, logConnectionEvent]);

  /**
   * Leaves the room (non-creator)
   */
  const leaveRoom = useCallback(() => {
    if (!isCreator) {
      peers.forEach((conn) => {
        try {
          conn.close();
        } catch (err) {
          logConnectionEvent(`Error closing connection: ${err.message}`);
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
      logConnectionEvent('Left room');
    }
  }, [isCreator, peers, logConnectionEvent]);

  /**
   * Formats timestamp for chat messages
   * @param {number} timestamp - Timestamp
   * @returns {string} Formatted time
   */
  const formatTimestamp = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  /**
   * Renders error modal
   */
  const renderErrorModal = () => {
    if (!errorMessage) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-background p-6 rounded-lg border border-white/20">
          <h3 className="text-white">Error</h3>
          <p className="text-white/80">{errorMessage}</p>
          <Button onClick={() => setErrorMessage(null)} className="mt-4">
            Close
          </Button>
        </div>
      </div>
    );
  };

  /**
   * Renders connected peers list
   */
  const renderPeerList = () => {
    return (
      <div className="mt-4">
        <h4 className="text-white">Connected Peers</h4>
        {peers.size === 0 ? (
          <p className="text-white/60">No peers connected</p>
        ) : (
          <ul className="text-white">
            {Array.from(peers.keys()).map((peerID) => (
              <li key={peerID}>{peerID}</li>
            ))}
          </ul>
        )}
      </div>
    );
  };

  /**
   * Renders connection logs
   */
  const renderConnectionLogs = () => {
    return (
      <div className="mt-4">
        <h4 className="text-white">Connection Logs</h4>
        <div
          ref={logRef}
          className="h-40 overflow-y-auto bg-black/20 p-2 rounded text-white/80"
        >
          {connectionLogs.map((log, idx) => (
            <div key={idx} className="text-sm">{log}</div>
          ))}
        </div>
      </div>
    );
  };

  /**
   * Renders shared screens
   */
  const renderSharedScreens = () => {
    return Array.from(sharedStreams.entries()).map(([peerID, stream]) => {
      if (stream.getVideoTracks().length > 0) {
        return (
          <div key={peerID} className="mt-4">
            <h4 className="text-white">Shared Screen from {peerID}</h4>
            <video
              ref={(el) => {
                if (el) {
                  videoRefs.current.set(peerID, el);
                  el.srcObject = stream;
                  el.play().catch((err) => logConnectionEvent(`Video play error: ${err.message}`));
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

  /**
   * Renders control requests
   */
  const renderControlRequests = () => {
    if (isSharingScreen && remoteControlRequests.length > 0) {
      return (
        <div className="mt-4">
          <h4 className="text-white">Control Requests</h4>
          {remoteControlRequests.map((peerID) => (
            <div key={peerID} className="flex items-center space-x-2">
              <span className="text-white">{peerID} requests control</span>
              <Button onClick={() => grantControl(peerID)}>Grant</Button>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  /**
   * Renders group chat panel
   */
  const renderChat = () => {
    return (
      <div
        className={`w-full h-96 bg-background/95 border border-white/10 p-4 transition-all ${
          isChatOpen ? 'block' : 'hidden'
        }`}
      >
        <h4 className="text-white">Group Chat</h4>
        <div
          ref={chatRef}
          className="h-72 overflow-y-auto bg-black/20 p-2 rounded"
        >
          {chatMessages.map((msg, idx) => (
            <div key={idx} className="mb-2">
              <span className="font-bold" style={{ color: msg.color }}>
                {msg.sender}
              </span>
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

  /**
   * Renders collaboration controls in an overlay
   */
  const renderCollaborationControls = () => {
    if (!isSettingsOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
        <div className="bg-background p-8 rounded-lg border border-white/20 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-medium text-white">Collaboration Settings</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsOpen(false)}
              className="text-white"
            >
              <X className="h-6 w-6" />
            </Button>
          </div>
          <p className="text-sm text-white/60 mb-4">Connection Status: {connectionStatus}</p>
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex space-x-4">
                {!roomID ? (
                  <>
                    <Button
                      onClick={createRoom}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Create Room
                    </Button>
                    <Button
                      onClick={() => joinRoom()}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Join Room
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-white">Room ID: {roomID}</p>
                    {isCreator ? (
                      <Button
                        onClick={destroyRoom}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Destroy Room
                      </Button>
                    ) : (
                      <Button
                        onClick={leaveRoom}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Leave Room
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
            <div className="flex space-x-4">
              <Button
                onClick={startScreenShare}
                disabled={isSharingScreen}
                className={isSharingScreen ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}
              >
                Start Screen Share
              </Button>
              <Button
                onClick={stopScreenShare}
                disabled={!isSharingScreen}
                className={!isSharingScreen ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}
              >
                Stop Screen Share
              </Button>
              <Button
                onClick={enableVoice}
                disabled={isVoiceEnabled}
                className={isVoiceEnabled ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}
              >
                Enable Voice
              </Button>
              <Button
                onClick={disableVoice}
                disabled={!isVoiceEnabled}
                className={!isVoiceEnabled ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}
              >
                Disable Voice
              </Button>
              <Button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isChatOpen ? 'Hide Chat' : 'Show Chat'}
              </Button>
            </div>
            {renderPeerList()}
            {renderSharedScreens()}
            {renderControlRequests()}
            {renderConnectionLogs()}
            {renderChat()}
          </div>
        </div>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-background relative"
    >
      <div className="fixed inset-0 bg-gradient-to-b from-background/95 to-background pointer-events-none z-0" />
      
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
          transition={{ duration: 0.5 }}
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
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
                  onClick={goToDetails}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 transition-all duration-300"
                  onClick={() => setIsSettingsOpen(true)}
                >
                  More Settings
                </Button>
              </div>
            </div>
            <VideoSourceSelector
              videoSources={videoSources}
              selectedSource={selectedSource}
              onSourceChange={handleSourceChange}
            />
          </div>
        </motion.div>
      </div>

      {/* Collaboration Overlay */}
      {renderCollaborationControls()}

      {/* Error Modal */}
      {renderErrorModal()}
    </motion.div>
  );
};

export default Player;
