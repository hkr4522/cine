import { useParams, useLocation } from 'react-router-dom';
import { ExternalLink, X, Copy, Mic, MicOff, Video, VideoOff, Record, StopCircle } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
 * Player component for video playback with party watch features.
 * Includes room creation/joining, voice call, video call, group chat, voice messages, session recording, and video source sync.
 * Party watch options are shown in an overlay triggered by a "More Settings" button.
 * Automatically shows join modal when joining via URL (?room=ID).
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

  // State for party watch features
  const [isPeerLoaded, setIsPeerLoaded] = useState(false); // Tracks PeerJS loading
  const [roomID, setRoomID] = useState<string | null>(null); // Current room ID
  const [roomPassword, setRoomPassword] = useState<string | null>(null); // Room password
  const [username, setUsername] = useState<string>(user?.username || 'Anonymous'); // User display name
  const [peers, setPeers] = useState<Map<string, any>>(new Map()); // Connected peers
  const [dataChannels, setDataChannels] = useState<Map<string, RTCDataChannel>>(new Map()); // Data channels
  const [chatMessages, setChatMessages] = useState<
    { sender: string; message: string; timestamp: number; color: string; type: 'text' | 'voice'; data?: string }[]
  >([]); // Chat message history with voice messages
  const [sharedStreams, setSharedStreams] = useState<Map<string, MediaStream>>(new Map()); // Remote streams for video call
  const [localStream, setLocalStream] = useState<MediaStream | null>(null); // Local media stream for voice/video
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false); // Voice call status
  const [isVideoEnabled, setIsVideoEnabled] = useState(false); // Video call status
  const [isChatOpen, setIsChatOpen] = useState(false); // Chat panel visibility
  const [chatInput, setChatInput] = useState(''); // Chat input field
  const [isControlling, setIsControlling] = useState<Map<string, boolean>>(new Map()); // Remote control permissions (if kept)
  const [remoteControlRequests, setRemoteControlRequests] = useState<string[]>([]); // Control requests (if kept)
  const [myPeerID, setMyPeerID] = useState<string | null>(null); // Local peer ID
  const [isCreator, setIsCreator] = useState(false); // Room creator status
  const [roomTimeout, setRoomTimeout] = useState<NodeJS.Timeout | null>(null); // Room expiration timer
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected'); // Connection status
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // Error modal message
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]); // Connection log history
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Overlay visibility
  const [isLogsOpen, setIsLogsOpen] = useState(false); // Logs visibility
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false); // Create room modal
  const [createUsername, setCreateUsername] = useState(''); // Create username input
  const [createPassword, setCreatePassword] = useState(''); // Create password input
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false); // Join room modal
  const [joinRoomID, setJoinRoomID] = useState(''); // Join room ID input
  const [joinUsername, setJoinUsername] = useState(''); // Join username input
  const [joinPassword, setJoinPassword] = useState(''); // Join password input
  const [isRoomURLModalOpen, setIsRoomURLModalOpen] = useState(false); // Room URL modal
  const [currentRoomURL, setCurrentRoomURL] = useState(''); // Generated room URL
  const [isRecordingVoice, setIsRecordingVoice] = useState(false); // Voice message recording status
  const [isRecordingSession, setIsRecordingSession] = useState(false); // Session recording status

  // Refs for DOM and WebRTC
  const peerRef = useRef<any>(null); // PeerJS instance
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map()); // Remote video elements for video call
  const chatRef = useRef<HTMLDivElement>(null); // Chat container
  const logRef = useRef<HTMLDivElement>(null); // Connection log container
  const voiceRecorder = useRef<MediaRecorder | null>(null); // Voice message recorder
  const sessionRecorder = useRef<MediaRecorder | null>(null); // Session recorder
  const recordedVoiceChunks = useRef<Blob[]>([]); // Voice message chunks
  const recordedSessionChunks = useRef<Blob[]>([]); // Session chunks

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
    if (logRef.current && isLogsOpen) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    console.log(message);
  }, [isLogsOpen]);

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
   * Checks for room ID in URL and opens join modal
   */
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const urlRoomID = searchParams.get('room');
    if (urlRoomID && !roomID && isPeerLoaded) {
      setJoinRoomID(urlRoomID);
      setIsJoinModalOpen(true);
    }
  }, [location.search, isPeerLoaded, roomID]);

  /**
   * Handles video source change and broadcasts to peers
   */
  const syncedHandleSourceChange = useCallback((newSource: string) => {
    handleSourceChange(newSource);
    broadcastToPeers({ type: 'source-change', source: newSource });
  }, [handleSourceChange]);

  /**
   * Creates a new party room
   */
  const createRoomAction = useCallback(() => {
    if (!createUsername || !createPassword) {
      setErrorMessage('Username and password are required');
      return;
    }
    const sanitizedUsername = sanitizeInput(createUsername);
    const sanitizedPassword = sanitizeInput(createPassword);
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
      const url = `${window.location.origin}${window.location.pathname}?room=${id}`;
      setCurrentRoomURL(url);
      setIsRoomURLModalOpen(true);
      setIsCreateModalOpen(false);
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
  }, [createUsername, createPassword, logConnectionEvent, sanitizeInput]);

  /**
   * Joins a party room
   */
  const joinRoomAction = useCallback(() => {
    if (!joinRoomID || !joinUsername || !joinPassword) {
      setErrorMessage('Room ID, username, and password are required');
      return;
    }
    const sanitizedUsername = sanitizeInput(joinUsername);
    const sanitizedPassword = sanitizeInput(joinPassword);

    setRoomID(joinRoomID);
    setUsername(sanitizedUsername);
    setRoomPassword(sanitizedPassword);
    setConnectionStatus('Joining room...');
    logConnectionEvent('Joining room...');

    const conn = peerRef.current.connect(joinRoomID);
    conn.on('open', () => {
      conn.send({
        type: 'join-request',
        password: sanitizedPassword,
        username: sanitizedUsername,
        peerID: myPeerID,
      });
      logConnectionEvent(`Connected to room creator: ${joinRoomID}`);
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
        setIsJoinModalOpen(false);
        logConnectionEvent('Joined room successfully');
      } else if (data.type === 'join-rejected') {
        setErrorMessage('Invalid password or rejected');
        setRoomID(null);
        setRoomPassword(null);
        setConnectionStatus('Join rejected');
        logConnectionEvent('Join rejected');
      } else if (data.type === 'source-change') {
        syncedHandleSourceChange(data.source);
      }
    });

    conn.on('error', (err: any) => {
      setErrorMessage(`Connection error: ${err.message}`);
      logConnectionEvent(`Connection error: ${err.message}`);
    });

    addPeerConnection(joinRoomID, conn);
  }, [joinRoomID, joinUsername, joinPassword, myPeerID, logConnectionEvent, sanitizeInput]);

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
              message: data.message,
              timestamp: Date.now(),
              color: generateUserColor(),
              type: 'text',
            },
          ]);
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
          }
        } else if (data.type === 'voice-message') {
          setChatMessages((prev) => [
            ...prev,
            {
              sender: data.sender,
              message: '',
              timestamp: Date.now(),
              color: generateUserColor(),
              type: 'voice',
              data: data.url, // Assume base64 or blob URL
            },
          ]);
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
          }
        } else if (data.type === 'source-change') {
          syncedHandleSourceChange(data.source);
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
    [myPeerID, generateUserColor, logConnectionEvent]
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

      if (isVoiceEnabled || isVideoEnabled) {
        callPeerWithStream(peerID, localStream!);
      }
    },
    [myPeerID, isVoiceEnabled, isVideoEnabled, localStream, logConnectionEvent]
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
      if (videoRefs.current.has(peerID) ) {
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
   * Enables video call
   */
  const enableVideo = useCallback(async () => {
    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!localStream) {
        setLocalStream(videoStream);
      } else {
        videoStream.getVideoTracks().forEach((track) => {
          localStream.addTrack(track);
        });
      }
      setIsVideoEnabled(true);
      setConnectionStatus('Video enabled');
      logConnectionEvent('Video enabled');

      peers.forEach((_, peerID) => {
        callPeerWithStream(peerID, localStream!);
      });
    } catch (err) {
      setErrorMessage('Failed to enable video');
      logConnectionEvent(`Video enable error: ${err.message}`);
    }
  }, [localStream, peers, logConnectionEvent]);

  /**
   * Disables video call
   */
  const disableVideo = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => track.stop());
    }
    setIsVideoEnabled(false);
    setConnectionStatus('Video disabled');
    logConnectionEvent('Video disabled');
  }, [localStream, logConnectionEvent]);

  /**
   * Starts recording voice message
   */
  const startRecordingVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceRecorder.current = new MediaRecorder(stream);
      voiceRecorder.current.ondataavailable = (e) => {
        recordedVoiceChunks.current.push(e.data);
      };
      voiceRecorder.current.onstop = () => {
        const blob = new Blob(recordedVoiceChunks.current, { type: 'audio/webm' });
        recordedVoiceChunks.current = [];
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          const message = {
            type: 'voice-message',
            sender: username,
            url: base64,
          };
          broadcastToPeers(message);
          setChatMessages((prev) => [
            ...prev,
            {
              sender: username,
              message: '',
              timestamp: Date.now(),
              color: generateUserColor(),
              type: 'voice',
              data: base64,
            },
          ]);
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
          }
          logConnectionEvent('Voice message sent');
        };
        reader.readAsDataURL(blob);
      };
      voiceRecorder.current.start();
      setIsRecordingVoice(true);
      logConnectionEvent('Voice recording started');
    } catch (err) {
      setErrorMessage('Failed to start voice recording');
      logConnectionEvent(`Voice recording error: ${err.message}`);
    }
  }, [username, generateUserColor, logConnectionEvent]);

  /**
   * Stops recording voice message
   */
  const stopRecordingVoice = useCallback(() => {
    if (voiceRecorder.current) {
      voiceRecorder.current.stop();
      setIsRecordingVoice(false);
      logConnectionEvent('Voice recording stopped');
    }
  }, [logConnectionEvent]);

  /**
   * Starts recording session
   */
  const startRecordingSession = useCallback(() => {
    if (localStream) {
      sessionRecorder.current = new MediaRecorder(localStream);
      sessionRecorder.current.ondataavailable = (e) => {
        recordedSessionChunks.current.push(e.data);
      };
      sessionRecorder.current.onstop = () => {
        const blob = new Blob(recordedSessionChunks.current, { type: 'video/webm' });
        recordedSessionChunks.current = [];
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'party_memories.webm';
        a.click();
        URL.revokeObjectURL(url);
        logConnectionEvent('Session recording downloaded');
      };
      sessionRecorder.current.start();
      setIsRecordingSession(true);
      logConnectionEvent('Session recording started');
    } else {
      setErrorMessage('No stream to record');
    }
  }, [localStream, logConnectionEvent]);

  /**
   * Stops recording session
   */
  const stopRecordingSession = useCallback(() => {
    if (sessionRecorder.current) {
      sessionRecorder.current.stop();
      setIsRecordingSession(false);
      logConnectionEvent('Session recording stopped');
    }
  }, [logConnectionEvent]);

  /**
   * Copies room URL to clipboard
   */
  const copyRoomURL = useCallback(() => {
    navigator.clipboard.writeText(currentRoomURL).then(() => {
      logConnectionEvent('Room URL copied to clipboard');
      setIsRoomURLModalOpen(false);
    }).catch((err) => {
      setErrorMessage('Failed to copy URL');
      logConnectionEvent(`Copy error: ${err.message}`);
    });
  }, [currentRoomURL, logConnectionEvent]);

  // Other functions remain similar, but remove screen share related

  /**
   * Renders create room modal
   */
  const renderCreateModal = () => {
    if (!isCreateModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md">
          <h3 className="text-white">Create Party Room</h3>
          <Input
            value={createUsername}
            onChange={(e) => setCreateUsername(e.target.value)}
            placeholder="Username"
            className="mt-4"
          />
          <Input
            type="password"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            placeholder="Password"
            className="mt-2"
          />
          <div className="flex space-x-2 mt-4">
            <Button onClick={createRoomAction}>Create</Button>
            <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Renders join room modal
   */
  const renderJoinModal = () => {
    if (!isJoinModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md">
          <h3 className="text-white">Join Party Room</h3>
          <Input
            value={joinRoomID}
            onChange={(e) => setJoinRoomID(e.target.value)}
            placeholder="Room ID"
            className="mt-4"
            disabled={!!new URLSearchParams(location.search).get('room')}
          />
          <Input
            value={joinUsername}
            onChange={(e) => setJoinUsername(e.target.value)}
            placeholder="Username (optional)"
            className="mt-2"
          />
          <Input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            placeholder="Password"
            className="mt-2"
          />
          <div className="flex space-x-2 mt-4">
            <Button onClick={joinRoomAction}>Join</Button>
            <Button variant="ghost" onClick={() => setIsJoinModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Renders room URL modal
   */
  const renderRoomURLModal = () => {
    if (!isRoomURLModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md">
          <h3 className="text-white">Room Created</h3>
          <p className="text-white/80 mt-2">Share this URL:</p>
          <Input value={currentRoomURL} readOnly className="mt-2" />
          <div className="flex space-x-2 mt-4">
            <Button onClick={copyRoomURL}><Copy className="h-4 w-4 mr-2" /> Copy</Button>
            <Button variant="ghost" onClick={() => setIsRoomURLModalOpen(false)}>Close</Button>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Renders camera streams
   */
  const renderCameraStreams = () => {
    return Array.from(sharedStreams.entries()).map(([peerID, stream]) => {
      if (stream.getVideoTracks().length > 0) {
        return (
          <div key={peerID} className="mt-4">
            <h4 className="text-white">Video from {peerID}</h4>
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
          </div>
        );
      }
      return null;
    });
  };

  // Other render functions like renderErrorModal, renderPeerList, renderConnectionLogs, renderControlRequests (if kept), renderChat

  const renderChat = () => {
    return (
      <div
        className={`w-full h-96 bg-background/95 border border-white/10 p-4 transition-all md:h-80 lg:h-96 ${
          isChatOpen ? 'block' : 'hidden'
        }`}
      >
        <h4 className="text-white">Group Chat</h4>
        <div
          ref={chatRef}
          className="h-72 overflow-y-auto bg-black/20 p-2 rounded md:h-64 lg:h-80"
        >
          {chatMessages.map((msg, idx) => (
            <div key={idx} className="mb-2">
              <span className="font-bold" style={{ color: msg.color }}>
                {msg.sender}
              </span>
              <span className="text-gray-400 text-sm ml-2">
                [{formatTimestamp(msg.timestamp)}]
              </span>
              {msg.type === 'text' ? (
                <span className="ml-2 text-white">{msg.message}</span>
              ) : (
                <audio controls src={msg.data} className="ml-2" />
              )}
            </div>
          ))}
        </div>
        <div className="flex space-x-2 mt-2">
          <Input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            className="flex-1 bg-transparent border-b border-white/20 text-white"
            placeholder="Type a message or emoji..."
          />
          <Button onClick={sendChat}>Send</Button>
          <Button onClick={isRecordingVoice ? stopRecordingVoice : startRecordingVoice}>
            {isRecordingVoice ? <StopCircle /> : <Record />}
          </Button>
        </div>
      </div>
    );
  };

  /**
   * Renders party watch controls in an overlay
   */
  const renderPartyWatchControls = () => {
    if (!isSettingsOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 overflow-y-auto">
        <div className="bg-background p-8 rounded-lg border border-white/20 w-11/12 md:w-3/4 lg:w-1/2 max-h-[80vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6 flex-wrap">
            <h3 className="text-lg font-medium text-white">Party Watch</h3>
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
            <div className="flex items-center justify-between flex-wrap">
              <div className="flex space-x-4 flex-wrap gap-4">
                {!roomID ? (
                  <>
                    <Button
                      onClick={() => setIsCreateModalOpen(true)}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Create Room
                    </Button>
                    <Button
                      onClick={() => setIsJoinModalOpen(true)}
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
            <div className="flex space-x-4 flex-wrap gap-4">
              <Button
                onClick={isVoiceEnabled ? disableVoice : enableVoice}
                className={isVoiceEnabled ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}
              >
                {isVoiceEnabled ? <MicOff className="mr-2" /> : <Mic className="mr-2" />}
                {isVoiceEnabled ? 'Disable Mic' : 'Enable Mic'}
              </Button>
              <Button
                onClick={isVideoEnabled ? disableVideo : enableVideo}
                className={isVideoEnabled ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}
              >
                {isVideoEnabled ? <VideoOff className="mr-2" /> : <Video className="mr-2" />}
                {isVideoEnabled ? 'Disable Camera' : 'Enable Camera'}
              </Button>
              <Button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isChatOpen ? 'Hide Chat' : 'Show Chat'}
              </Button>
              <Button
                onClick={isRecordingSession ? stopRecordingSession : startRecordingSession}
                className={isRecordingSession ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}
              >
                {isRecordingSession ? 'Stop Recording' : 'Record Memories'}
              </Button>
              <Button onClick={() => setIsLogsOpen(!isLogsOpen)}>
                {isLogsOpen ? 'Hide Logs' : 'Show Logs'}
              </Button>
            </div>
            {renderCameraStreams()}
            {renderControlRequests()} {/* If keeping remote control */}
            {isLogsOpen && renderConnectionLogs()}
            {isChatOpen && renderChat()}
            {renderPeerList()}
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
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-lg font-medium text-white">Video Sources</h3>
                <p className="text-sm text-white/60">Select your preferred streaming source</p>
              </div>
              <div className="flex space-x-2 flex-wrap gap-2">
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
                  Party Watch
                </Button>
              </div>
            </div>
            <VideoSourceSelector 
              videoSources={videoSources}
              selectedSource={selectedSource}
              onSourceChange={syncedHandleSourceChange}
            />
          </div>
        </motion.div>
      </div>

      {/* Party Watch Overlay */}
      {renderPartyWatchControls()}

      {/* Modals */}
      {renderCreateModal()}
      {renderJoinModal()}
      {renderRoomURLModal()}

      {/* Error Modal */}
      {renderErrorModal()}
    </motion.div>
  );
};

export default Player;
