import { useParams, useLocation } from 'react-router-dom';
import { ExternalLink, X, Copy, Mic, MicOff, Video, VideoOff, Circle, StopCircle } from 'lucide-react';
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
 * Supports room creation/joining, voice and video calls, group chat with emojis and voice messages,
 * session recording, and synchronized video source selection.
 * Enhanced with robust error handling for service worker issues, WebRTC, and media operations.
 * Responsive design for mobile and desktop using Tailwind CSS.
 * Comprehensive logging for debugging and user feedback.
 * Fallback UI for service worker errors to maintain core functionality.
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
  const [isPeerLoaded, setIsPeerLoaded] = useState(false); // Tracks PeerJS loading status
  const [roomID, setRoomID] = useState<string | null>(null); // Current party room ID
  const [roomPassword, setRoomPassword] = useState<string | null>(null); // Room password
  const [username, setUsername] = useState<string>(user?.username || 'Anonymous'); // User's display name
  const [peers, setPeers] = useState<Map<string, any>>(new Map()); // Connected peers
  const [dataChannels, setDataChannels] = useState<Map<string, RTCDataChannel>>(new Map()); // Peer data channels
  const [chatMessages, setChatMessages] = useState<
    { sender: string; message: string; timestamp: number; color: string; type: 'text' | 'voice'; data?: string }[]
  >([]); // Chat message history
  const [sharedStreams, setSharedStreams] = useState<Map<string, MediaStream>>(new Map()); // Remote video streams
  const [localStream, setLocalStream] = useState<MediaStream | null>(null); // Local media stream
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false); // Microphone status
  const [isVideoEnabled, setIsVideoEnabled] = useState(false); // Camera status
  const [isChatOpen, setIsChatOpen] = useState(false); // Chat panel visibility
  const [chatInput, setChatInput] = useState(''); // Chat input text
  const [myPeerID, setMyPeerID] = useState<string | null>(null); // Local peer ID
  const [isCreator, setIsCreator] = useState(false); // Room creator status
  const [roomTimeout, setRoomTimeout] = useState<NodeJS.Timeout | null>(null); // Room auto-deletion timer
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected'); // Connection status
  const [errorMessage, setErrorMessage] = useState<string | null>(null); // General error message
  const [serviceWorkerError, setServiceWorkerError] = useState<string | null>('Service worker failed to initialize: Cannot access \'D\' before initialization'); // Service worker error
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]); // Connection event logs
  const [isSettingsOpen, setIsSettingsOpen] = useState(false); // Party watch overlay visibility
  const [isLogsOpen, setIsLogsOpen] = useState(false); // Logs panel visibility
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false); // Create room modal visibility
  const [createUsername, setCreateUsername] = useState(''); // Create room username input
  const [createPassword, setCreatePassword] = useState(''); // Create room password input
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false); // Join room modal visibility
  const [joinRoomID, setJoinRoomID] = useState(''); // Join room ID input
  const [joinUsername, setJoinUsername] = useState(''); // Join room username input
  const [joinPassword, setJoinPassword] = useState(''); // Join room password input
  const [isRoomURLModalOpen, setIsRoomURLModalOpen] = useState(false); // Room URL sharing modal visibility
  const [currentRoomURL, setCurrentRoomURL] = useState(''); // Generated room URL
  const [isRecordingVoice, setIsRecordingVoice] = useState(false); // Voice message recording status
  const [isRecordingSession, setIsRecordingSession] = useState(false); // Session recording status
  const [retryCount, setRetryCount] = useState(0); // Service worker retry attempts

  // Refs for DOM elements and WebRTC objects
  const peerRef = useRef<any>(null); // PeerJS instance
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map()); // Remote video elements
  const chatRef = useRef<HTMLDivElement>(null); // Chat container
  const logRef = useRef<HTMLDivElement>(null); // Logs container
  const voiceRecorder = useRef<MediaRecorder | null>(null); // Voice message recorder
  const sessionRecorder = useRef<MediaRecorder | null>(null); // Session recorder
  const recordedVoiceChunks = useRef<Blob[]>([]); // Voice message blobs
  const recordedSessionChunks = useRef<Blob[]>([]); // Session recording blobs

  /**
   * Generates a random hex color for user messages in chat to visually distinguish users.
   * Ensures unique visual identification for each participant's messages.
   * @returns {string} A 6-digit hex color code with '#' prefix.
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
   * Sanitizes user input to prevent XSS attacks by escaping HTML characters.
   * Ensures safe rendering of user-generated content in the UI.
   * @param {string} input - The raw user input string.
   * @returns {string} The sanitized string safe for HTML rendering.
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
   * Logs a connection or party watch event for debugging and UI display.
   * Automatically scrolls the logs container to the latest entry when visible.
   * Persists logs in state for user inspection.
   * @param {string} message - The event message to log.
   */
  const logConnectionEvent = useCallback((message: string) => {
    setConnectionLogs((prev) => [...prev, `${new Date().toLocaleString()}: ${message}`]);
    if (logRef.current && isLogsOpen) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    console.log(`[Party Watch] ${message}`);
  }, [isLogsOpen]);

  /**
   * Attempts to retry service worker registration with a maximum of 3 attempts.
   * Updates the UI with retry status and logs the outcome.
   */
  const retryServiceWorker = useCallback(() => {
    if (retryCount >= 3) {
      setServiceWorkerError('Maximum retry attempts reached. Offline features may be unavailable.');
      logConnectionEvent('Service worker retry limit reached');
      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          setServiceWorkerError(null);
          setConnectionStatus('Service worker registered successfully');
          logConnectionEvent(`Service worker registered with scope: ${registration.scope}`);
        })
        .catch((err) => {
          setServiceWorkerError(`Service worker retry failed: ${err.message}`);
          logConnectionEvent(`Service worker retry failed: ${err.message}`);
          setRetryCount((prev) => prev + 1);
        });
    } else {
      setServiceWorkerError('Service workers not supported in this browser');
      logConnectionEvent('Service workers not supported in this browser');
    }
  }, [retryCount, logConnectionEvent]);

  /**
   * Loads the PeerJS library from CDN and checks service worker status.
   * Handles cleanup of resources on component unmount to prevent memory leaks.
   * Logs all loading and error events for debugging.
   */
  useEffect(() => {
    // Load PeerJS
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    script.async = true;
    script.onload = () => {
      setIsPeerLoaded(true);
      logConnectionEvent('PeerJS loaded successfully from CDN');
    };
    script.onerror = () => {
      setErrorMessage('Failed to load PeerJS library');
      logConnectionEvent('Failed to load PeerJS from CDN');
    };
    document.body.appendChild(script);

    // Check service worker status
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        if (!registrations.length) {
          logConnectionEvent('No active service worker found');
          retryServiceWorker();
        } else {
          logConnectionEvent('Service worker found');
        }
      }).catch((err) => {
        setServiceWorkerError(`Service worker check failed: ${err.message}`);
        logConnectionEvent(`Service worker check failed: ${err.message}`);
      });
    } else {
      setServiceWorkerError('Service workers not supported in this browser');
      logConnectionEvent('Service workers not supported in this browser');
    }

    // Cleanup on unmount
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
        logConnectionEvent('PeerJS script removed on cleanup');
      }
      if (peerRef.current) {
        peerRef.current.destroy();
        logConnectionEvent('PeerJS instance destroyed on cleanup');
      }
      if (roomTimeout) {
        clearTimeout(roomTimeout);
        logConnectionEvent('Room timeout cleared on cleanup');
      }
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
        logConnectionEvent('Local media stream stopped on cleanup');
      }
      if (voiceRecorder.current) {
        voiceRecorder.current.stop();
        logConnectionEvent('Voice recorder stopped on cleanup');
      }
      if (sessionRecorder.current) {
        sessionRecorder.current.stop();
        logConnectionEvent('Session recorder stopped on cleanup');
      }
    };
  }, [logConnectionEvent, retryServiceWorker]);

  /**
   * Initializes the PeerJS connection once the library is loaded.
   * Sets up event listeners for peer connections, calls, and errors.
   * Ensures robust error handling for WebRTC failures.
   */
  useEffect(() => {
    if (isPeerLoaded && !peerRef.current) {
      try {
        const Peer = (window as any).Peer;
        const tempPeerID = crypto.randomUUID();
        peerRef.current = new Peer(tempPeerID, { debug: 3 });

        peerRef.current.on('open', (id: string) => {
          setMyPeerID(id);
          setConnectionStatus('Connected to PeerJS');
          logConnectionEvent(`Peer connection opened with ID: ${id}`);
        });

        peerRef.current.on('connection', handleIncomingDataConnection);
        peerRef.current.on('call', handleIncomingCall);
        peerRef.current.on('error', (err: any) => {
          const errorMsg = `PeerJS error: ${err.type || err.message}`;
          setErrorMessage(errorMsg);
          logConnectionEvent(errorMsg);
        });
      } catch (err: any) {
        setErrorMessage(`Failed to initialize PeerJS: ${err.message}`);
        logConnectionEvent(`Failed to initialize PeerJS: ${err.message}`);
      }
    }
  }, [isPeerLoaded, logConnectionEvent]);

  /**
   * Checks the URL for a room ID parameter and opens the join modal if present.
   * Enables seamless joining via shared links.
   */
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const urlRoomID = searchParams.get('room');
    if (urlRoomID && !roomID && isPeerLoaded) {
      setJoinRoomID(urlRoomID);
      setIsJoinModalOpen(true);
      logConnectionEvent(`Detected room ID from URL: ${urlRoomID}, opening join modal`);
    }
  }, [location.search, isPeerLoaded, roomID, logConnectionEvent]);

  /**
   * Handles synchronized video source changes across all party members.
   * Broadcasts the new source to ensure everyone switches simultaneously.
   * @param {string} newSource - The new video source to select.
   */
  const syncedHandleSourceChange = useCallback(
    (newSource: string) => {
      try {
        handleSourceChange(newSource);
        if (roomID) {
          broadcastToPeers({ type: 'source-change', source: newSource });
          logConnectionEvent(`Synchronized video source change to: ${newSource}`);
        }
      } catch (err: any) {
        setErrorMessage(`Failed to change video source: ${err.message}`);
        logConnectionEvent(`Failed to change video source: ${err.message}`);
      }
    },
    [handleSourceChange, roomID, logConnectionEvent]
  );

  /**
   * Creates a new party room after validating modal inputs.
   * Sets up the peer connection and room timeout.
   * Shows the sharing modal with the generated room URL.
   */
  const createRoomAction = useCallback(() => {
    if (!createUsername.trim() || !createPassword.trim()) {
      setErrorMessage('Username and password are required for room creation');
      logConnectionEvent('Room creation failed: Missing username or password');
      return;
    }
    const sanitizedUsername = sanitizeInput(createUsername.trim());
    const sanitizedPassword = sanitizeInput(createPassword.trim());
    const newRoomID = crypto.randomUUID();

    setRoomID(newRoomID);
    setRoomPassword(sanitizedPassword);
    setUsername(sanitizedUsername);
    setIsCreator(true);
    setConnectionStatus('Creating party room...');
    logConnectionEvent('Initiating party room creation...');

    try {
      if (peerRef.current) {
        peerRef.current.destroy();
        logConnectionEvent('Existing PeerJS instance destroyed for room creation');
      }
      const Peer = (window as any).Peer;
      peerRef.current = new Peer(newRoomID, { debug: 3 });

      peerRef.current.on('open', (id: string) => {
        setMyPeerID(id);
        setConnectionStatus('Party room created successfully');
        const generatedURL = `${window.location.origin}${window.location.pathname}?room=${id}`;
        setCurrentRoomURL(generatedURL);
        setIsRoomURLModalOpen(true);
        setIsCreateModalOpen(false);
        logConnectionEvent(`Party room created with ID: ${id}, URL generated`);

        const timeout = setTimeout(() => {
          destroyRoom();
        }, 21600000); // 6 hours
        setRoomTimeout(timeout);
        logConnectionEvent('Room auto-deletion timer set for 6 hours');
      });

      peerRef.current.on('connection', handleIncomingDataConnection);
      peerRef.current.on('call', handleIncomingCall);
      peerRef.current.on('error', (err: any) => {
        const errorMsg = `Room creation error: ${err.type || err.message}`;
        setErrorMessage(errorMsg);
        logConnectionEvent(errorMsg);
      });
    } catch (err: any) {
      setErrorMessage(`Failed to create party room: ${err.message}`);
      logConnectionEvent(`Failed to create party room: ${err.message}`);
    }
  }, [createUsername, createPassword, logConnectionEvent, sanitizeInput]);

  /**
   * Joins an existing party room after validating modal inputs.
   * Sends a join request to the creator and handles acceptance/rejection.
   */
  const joinRoomAction = useCallback(() => {
    if (!joinRoomID.trim() || !joinPassword.trim()) {
      setErrorMessage('Room ID and password are required to join');
      logConnectionEvent('Join failed: Missing room ID or password');
      return;
    }
    const sanitizedUsername = sanitizeInput(joinUsername.trim() || 'Anonymous');
    const sanitizedPassword = sanitizeInput(joinPassword.trim());

    setRoomID(joinRoomID.trim());
    setUsername(sanitizedUsername);
    setRoomPassword(sanitizedPassword);
    setConnectionStatus('Joining party room...');
    logConnectionEvent('Attempting to join party room...');

    try {
      const conn = peerRef.current.connect(joinRoomID.trim());
      conn.on('open', () => {
        conn.send({
          type: 'join-request',
          password: sanitizedPassword,
          username: sanitizedUsername,
          peerID: myPeerID,
        });
        logConnectionEvent(`Join request sent to room creator: ${joinRoomID.trim()}`);
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
          setConnectionStatus('Joined party room successfully');
          setIsJoinModalOpen(false);
          logConnectionEvent('Successfully joined party room');
        } else if (data.type === 'join-rejected') {
          setErrorMessage('Invalid password or room rejected the join request');
          setRoomID(null);
          setRoomPassword(null);
          setConnectionStatus('Join rejected');
          logConnectionEvent('Join request rejected by room');
        } else if (data.type === 'source-change') {
          syncedHandleSourceChange(data.source);
          logConnectionEvent(`Received synchronized source change: ${data.source}`);
        }
      });

      conn.on('error', (err: any) => {
        const errorMsg = `Connection error while joining: ${err.type || err.message}`;
        setErrorMessage(errorMsg);
        logConnectionEvent(errorMsg);
      });

      addPeerConnection(joinRoomID.trim(), conn);
    } catch (err: any) {
      setErrorMessage(`Failed to join room: ${err.message}`);
      logConnectionEvent(`Failed to join room: ${err.message}`);
    }
  }, [joinRoomID, joinUsername, joinPassword, myPeerID, logConnectionEvent, sanitizeInput, syncedHandleSourceChange]);

  /**
   * Handles incoming data connections from peers.
   * Processes join requests, chat messages, voice messages, and source changes.
   * @param {any} conn - The PeerJS connection object.
   */
  const handleIncomingDataConnection = useCallback(
    (conn: any) => {
      conn.on('open', () => {
        logConnectionEvent(`Data connection opened with peer: ${conn.peer}`);
      });

      conn.on('data', (data: any) => {
        try {
          if (data.type === 'join-request') {
            handleJoinRequest(conn, data);
          } else if (data.type === 'chat') {
            const sanitizedMessage = sanitizeInput(data.message || '');
            setChatMessages((prev) => [
              ...prev,
              {
                sender: data.sender || 'Unknown',
                message: sanitizedMessage,
                timestamp: Date.now(),
                color: generateUserColor(),
                type: 'text' as const,
              },
            ]);
            if (chatRef.current) {
              chatRef.current.scrollTop = chatRef.current.scrollHeight;
            }
            logConnectionEvent(`Received chat message from ${data.sender}: ${sanitizedMessage}`);
          } else if (data.type === 'voice-message') {
            setChatMessages((prev) => [
              ...prev,
              {
                sender: data.sender || 'Unknown',
                message: '',
                timestamp: Date.now(),
                color: generateUserColor(),
                type: 'voice' as const,
                data: data.url,
              },
            ]);
            if (chatRef.current) {
              chatRef.current.scrollTop = chatRef.current.scrollHeight;
            }
            logConnectionEvent(`Received voice message from ${data.sender}`);
          } else if (data.type === 'source-change') {
            syncedHandleSourceChange(data.source);
          } else if (data.type === 'peer-list-update') {
            const newPeers = (data.peers || []).filter((p: string) => p !== myPeerID);
            newPeers.forEach((p: string) => connectToPeer(p));
            logConnectionEvent(`Updated peer list with ${newPeers.length} peers`);
          } else if (data.type === 'room-destroyed') {
            setErrorMessage('Party room has been destroyed by the creator');
            leaveRoom();
            logConnectionEvent('Room destroyed notification received');
          }
        } catch (err: any) {
          setErrorMessage(`Error processing peer data: ${err.message}`);
          logConnectionEvent(`Error processing peer data: ${err.message}`);
        }
      });

      conn.on('close', () => {
        removePeerConnection(conn.peer);
        logConnectionEvent(`Data connection closed with ${conn.peer}`);
      });

      conn.on('error', (err: any) => {
        logConnectionEvent(`Data connection error with ${conn.peer}: ${err.type || err.message}`);
      });

      addPeerConnection(conn.peer, conn);
    },
    [myPeerID, generateUserColor, logConnectionEvent, sanitizeInput, syncedHandleSourceChange]
  );

  /**
   * Handles join requests from peers (creator only).
   * Validates password and updates peer list.
   * @param {any} conn - The peer connection.
   * @param {any} data - The join request data.
   */
  const handleJoinRequest = useCallback(
    (conn: any, data: any) => {
      if (!isCreator) {
        logConnectionEvent('Received join request but not room creator - ignoring');
        return;
      }

      try {
        if (data.password === roomPassword) {
          conn.send({
            type: 'join-accepted',
            peers: Array.from(peers.keys()),
          });
          broadcastToPeers({
            type: 'peer-list-update',
            peers: [data.peerID || conn.peer],
          });
          addPeerConnection(data.peerID || conn.peer, conn);
          logConnectionEvent(`${data.username || 'Anonymous'} joined the party room`);
        } else {
          conn.send({ type: 'join-rejected' });
          conn.close();
          const rejectMsg = `${data.username || 'Anonymous'} attempted to join with incorrect password`;
          setErrorMessage(rejectMsg);
          logConnectionEvent(rejectMsg);
        }
      } catch (err: any) {
        setErrorMessage(`Error handling join request: ${err.message}`);
        logConnectionEvent(`Error handling join request: ${err.message}`);
      }
    },
    [isCreator, roomPassword, peers, logConnectionEvent, broadcastToPeers]
  );

  /**
   * Connects to a new peer in the party room.
   * Initiates data and media connections.
   * @param {string} peerID - The ID of the peer to connect to.
   */
  const connectToPeer = useCallback(
    (peerID: string) => {
      if (peers.has(peerID) || peerID === myPeerID) {
        logConnectionEvent(`Skipped redundant connection to peer: ${peerID}`);
        return;
      }

      try {
        const conn = peerRef.current?.connect(peerID);
        if (!conn) {
          logConnectionEvent(`Failed to create connection to peer: ${peerID} (PeerJS not ready)`);
          return;
        }

        conn.on('open', () => {
          setConnectionStatus(`Connected to peer: ${peerID}`);
          logConnectionEvent(`Successfully connected to peer: ${peerID}`);
        });

        conn.on('data', handleDataFromPeer);
        conn.on('close', () => {
          removePeerConnection(peerID);
          logConnectionEvent(`Connection closed with peer: ${peerID}`);
        });

        conn.on('error', (err: any) => {
          setErrorMessage(`Peer connection error with ${peerID}: ${err.type || err.message}`);
          logConnectionEvent(`Peer connection error with ${peerID}: ${err.type || err.message}`);
        });

        addPeerConnection(peerID, conn);

        if ((isVoiceEnabled || isVideoEnabled) && localStream) {
          callPeerWithStream(peerID, localStream);
        }
      } catch (err: any) {
        setErrorMessage(`Failed to connect to peer ${peerID}: ${err.message}`);
        logConnectionEvent(`Failed to connect to peer ${peerID}: ${err.message}`);
      }
    },
    [myPeerID, isVoiceEnabled, isVideoEnabled, localStream, logConnectionEvent]
  );

  /**
   * Handles arbitrary data received from peers.
   * Logs data for debugging purposes.
   * @param {any} data - The data object received.
   */
  const handleDataFromPeer = useCallback(
    (data: any) => {
      logConnectionEvent(`Received arbitrary data from peer: ${JSON.stringify(data).substring(0, 50)}...`);
    },
    [logConnectionEvent]
  );

  /**
   * Adds a peer connection to the state map.
   * Tracks all active peer connections for management.
   * @param {string} peerID - The peer's ID.
   * @param {any} conn - The PeerJS connection object.
   */
  const addPeerConnection = useCallback(
    (peerID: string, conn: any) => {
      setPeers((prev) => {
        const newMap = new Map(prev);
        newMap.set(peerID, conn);
        return newMap;
      });
      logConnectionEvent(`Added peer connection: ${peerID} (total peers: ${newMap.size})`);
    },
    [logConnectionEvent]
  );

  /**
   * Removes a peer connection and cleans up resources.
   * Ensures no stale connections or streams remain.
   * @param {string} peerID - The peer's ID to remove.
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
      setDataChannels((prev) => {
        const newMap = new Map(prev);
        newMap.delete(peerID);
        return newMap;
      });
      if (videoRefs.current.has(peerID)) {
        videoRefs.current.delete(peerID);
      }
      logConnectionEvent(`Removed peer connection: ${peerID} (remaining peers: ${peers.size - 1})`);
    },
    [logConnectionEvent, peers]
  );

  /**
   * Broadcasts data to all connected peers.
   * Ensures reliable message delivery across the party room.
   * @param {any} data - The data object to broadcast.
   */
  const broadcastToPeers = useCallback(
    (data: any) => {
      let sentCount = 0;
      peers.forEach((conn, peerID) => {
        if (conn && conn.open) {
          try {
            conn.send(data);
            sentCount++;
            logConnectionEvent(`Broadcast sent to peer ${peerID}: ${JSON.stringify(data).substring(0, 50)}...`);
          } catch (err: any) {
            logConnectionEvent(`Failed to broadcast to peer ${peerID}: ${err.message}`);
          }
        }
      });
      logConnectionEvent(`Broadcast completed to ${sentCount} peers`);
    },
    [peers, logConnectionEvent]
  );

  /**
   * Enables the microphone for voice calls.
   * Requests user media and adds audio tracks to the local stream.
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
      setConnectionStatus('Microphone enabled for party voice call');
      logConnectionEvent('Microphone enabled for voice call');

      peers.forEach((_, peerID) => {
        if (localStream) {
          callPeerWithStream(peerID, localStream);
        }
      });
    } catch (err: any) {
      setErrorMessage(`Failed to enable microphone: ${err.message}`);
      logConnectionEvent(`Failed to enable microphone: ${err.message}`);
    }
  }, [localStream, peers, logConnectionEvent]);

  /**
   * Disables the microphone and stops audio tracks.
   * Cleans up audio resources to prevent leaks.
   */
  const disableVoice = useCallback(() => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.stop();
        localStream.removeTrack(track);
      });
    }
    setIsVoiceEnabled(false);
    setConnectionStatus('Microphone disabled');
    logConnectionEvent('Microphone disabled');
  }, [localStream, logConnectionEvent]);

  /**
   * Enables the camera for video calls.
   * Requests user media and adds video tracks to the local stream.
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
      setConnectionStatus('Camera enabled for party video call');
      logConnectionEvent('Camera enabled for video call');

      peers.forEach((_, peerID) => {
        if (localStream) {
          callPeerWithStream(peerID, localStream);
        }
      });
    } catch (err: any) {
      setErrorMessage(`Failed to enable camera: ${err.message}`);
      logConnectionEvent(`Failed to enable camera: ${err.message}`);
    }
  }, [localStream, peers, logConnectionEvent]);

  /**
   * Disables the camera and stops video tracks.
   * Cleans up video resources to prevent leaks.
   */
  const disableVideo = useCallback(() => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.stop();
        localStream.removeTrack(track);
      });
    }
    setIsVideoEnabled(false);
    setConnectionStatus('Camera disabled');
    logConnectionEvent('Camera disabled');
  }, [localStream, logConnectionEvent]);

  /**
   * Starts recording a voice message for the chat.
   * Captures audio using MediaRecorder and broadcasts as base64.
   */
  const startRecordingVoice = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceRecorder.current = new MediaRecorder(stream);
      recordedVoiceChunks.current = [];

      voiceRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedVoiceChunks.current.push(e.data);
        }
      };

      voiceRecorder.current.onstop = () => {
        const blob = new Blob(recordedVoiceChunks.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64Data = reader.result as string;
          const voiceMessage = {
            type: 'voice-message',
            sender: username,
            url: base64Data,
          };
          broadcastToPeers(voiceMessage);
          setChatMessages((prev) => [
            ...prev,
            {
              sender: username,
              message: '',
              timestamp: Date.now(),
              color: generateUserColor(),
              type: 'voice',
              data: base64Data,
            },
          ]);
          if (chatRef.current) {
            chatRef.current.scrollTop = chatRef.current.scrollHeight;
          }
          logConnectionEvent('Voice message recorded and broadcasted');
        };
        reader.readAsDataURL(blob);

        stream.getTracks().forEach((track) => track.stop());
      };

      voiceRecorder.current.start(1000);
      setIsRecordingVoice(true);
      logConnectionEvent('Started recording voice message');
    } catch (err: any) {
      setErrorMessage(`Failed to start voice recording: ${err.message}`);
      logConnectionEvent(`Failed to start voice recording: ${err.message}`);
    }
  }, [username, generateUserColor, logConnectionEvent, broadcastToPeers]);

  /**
   * Stops the current voice message recording.
   * Ensures proper cleanup of the recorder.
   */
  const stopRecordingVoice = useCallback(() => {
    if (voiceRecorder.current && isRecordingVoice) {
      voiceRecorder.current.stop();
      setIsRecordingVoice(false);
      logConnectionEvent('Stopped voice message recording');
    }
  }, [isRecordingVoice, logConnectionEvent]);

  /**
   * Starts recording the session (memories) as a video file.
   * Captures the local stream and downloads on stop.
   */
  const startRecordingSession = useCallback(() => {
    if (!localStream) {
      setErrorMessage('No media stream available for session recording');
      logConnectionEvent('Session recording failed: No media stream');
      return;
    }

    try {
      sessionRecorder.current = new MediaRecorder(localStream);
      recordedSessionChunks.current = [];

      sessionRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedSessionChunks.current.push(e.data);
        }
      };

      sessionRecorder.current.onstop = () => {
        const blob = new Blob(recordedSessionChunks.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `party_memories_${new Date().toISOString().split('T')[0]}.webm`;
        a.click();
        URL.revokeObjectURL(url);
        setIsRecordingSession(false);
        logConnectionEvent('Session memories downloaded as webm file');
      };

      sessionRecorder.current.start(1000);
      setIsRecordingSession(true);
      logConnectionEvent('Started recording party session memories');
    } catch (err: any) {
      setErrorMessage(`Failed to start session recording: ${err.message}`);
      logConnectionEvent(`Failed to start session recording: ${err.message}`);
    }
  }, [localStream, logConnectionEvent]);

  /**
   * Stops the current session recording.
   * Ensures proper cleanup of the recorder.
   */
  const stopRecordingSession = useCallback(() => {
    if (sessionRecorder.current && isRecordingSession) {
      sessionRecorder.current.stop();
      setIsRecordingSession(false);
      logConnectionEvent('Stopped recording party session memories');
    }
  }, [isRecordingSession, logConnectionEvent]);

  /**
   * Copies the room URL to the clipboard for sharing.
   * Supports modern and fallback clipboard APIs.
   */
  const copyRoomURL = useCallback(() => {
    if (navigator.clipboard && currentRoomURL) {
      navigator.clipboard
        .writeText(currentRoomURL)
        .then(() => {
          logConnectionEvent('Room URL copied to clipboard successfully');
          setIsRoomURLModalOpen(false);
        })
        .catch((err: any) => {
          setErrorMessage(`Failed to copy room URL: ${err.message}`);
          logConnectionEvent(`Failed to copy room URL: ${err.message}`);
        });
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = currentRoomURL;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
        logConnectionEvent('Room URL copied via fallback method');
        setIsRoomURLModalOpen(false);
      } catch (err: any) {
        setErrorMessage(`Fallback copy failed: ${err.message}`);
        logConnectionEvent(`Fallback copy failed: ${err.message}`);
      }
      document.body.removeChild(textArea);
    }
  }, [currentRoomURL, logConnectionEvent]);

  /**
   * Sends a text chat message to all peers.
   * Supports emojis and sanitizes input for security.
   */
  const sendChat = useCallback(() => {
    const input = chatInput.trim();
    if (!input) {
      setErrorMessage('Cannot send empty chat message');
      logConnectionEvent('Chat message send failed: Empty input');
      return;
    }

    const sanitizedMessage = sanitizeInput(input);
    const chatData = {
      type: 'chat',
      sender: username,
      message: sanitizedMessage,
    };

    broadcastToPeers(chatData);
    setChatMessages((prev) => [
      ...prev,
      {
        sender: username,
        message: sanitizedMessage,
        timestamp: Date.now(),
        color: generateUserColor(),
        type: 'text',
      },
    ]);
    setChatInput('');
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
    setConnectionStatus('Chat message sent');
    logConnectionEvent(`Sent chat message: ${sanitizedMessage.substring(0, 50)}...`);
  }, [chatInput, username, sanitizeInput, generateUserColor, logConnectionEvent, broadcastToPeers]);

  /**
   * Calls a peer with the local media stream for voice/video calls.
   * Handles media call setup and errors.
   * @param {string} peerID - The target peer ID.
   * @param {MediaStream} stream - The local media stream.
   */
  const callPeerWithStream = useCallback(
    (peerID: string, stream: MediaStream) => {
      if (!peerRef.current) {
        logConnectionEvent('Cannot call peer: PeerJS not initialized');
        return;
      }

      try {
        const call = peerRef.current.call(peerID, stream);
        call.on('stream', (remoteStream: MediaStream) => {
          setSharedStreams((prev) => {
            const newMap = new Map(prev);
            newMap.set(peerID, remoteStream);
            return newMap;
          });
          logConnectionEvent(`Received remote stream from peer: ${peerID}`);
        });
        call.on('close', () => {
          setSharedStreams((prev) => {
            const newMap = new Map(prev);
            newMap.delete(peerID);
            return newMap;
          });
          logConnectionEvent(`Media call closed with peer: ${peerID}`);
        });
        call.on('error', (err: any) => {
          setErrorMessage(`Media call error with ${peerID}: ${err.message}`);
          logConnectionEvent(`Media call error with ${peerID}: ${err.message}`);
        });
      } catch (err: any) {
        setErrorMessage(`Failed to initiate media call to ${peerID}: ${err.message}`);
        logConnectionEvent(`Failed to initiate media call to ${peerID}: ${err.message}`);
      }
    },
    [logConnectionEvent]
  );

  /**
   * Handles incoming media calls from peers.
   * Answers with the local stream and manages remote streams.
   * @param {any} call - The incoming PeerJS call object.
   */
  const handleIncomingCall = useCallback(
    (call: any) => {
      try {
        call.answer(localStream || null);

        call.on('stream', (remoteStream: MediaStream) => {
          setSharedStreams((prev) => {
            const newMap = new Map(prev);
            newMap.set(call.peer, remoteStream);
            return newMap;
          });

          if (remoteStream.getAudioTracks().length > 0) {
            const audio = new Audio();
            audio.srcObject = remoteStream;
            audio.play().catch((err: any) => {
              logConnectionEvent(`Failed to play remote audio: ${err.message}`);
            });
          }

          logConnectionEvent(`Received incoming media stream from peer: ${call.peer}`);
        });

        call.on('close', () => {
          setSharedStreams((prev) => {
            const newMap = new Map(prev);
            newMap.delete(call.peer);
            return newMap;
          });
          logConnectionEvent(`Incoming media call closed from peer: ${call.peer}`);
        });

        call.on('error', (err: any) => {
          setErrorMessage(`Incoming media call error: ${err.message}`);
          logConnectionEvent(`Incoming media call error: ${err.message}`);
        });
      } catch (err: any) {
        setErrorMessage(`Error handling incoming call: ${err.message}`);
        logConnectionEvent(`Error handling incoming call: ${err.message}`);
      }
    },
    [localStream, logConnectionEvent]
  );

  /**
   * Destroys the party room (creator only).
   * Broadcasts destruction and cleans up resources.
   */
  const destroyRoom = useCallback(() => {
    if (!isCreator) {
      logConnectionEvent('Destroy room called but user is not creator');
      return;
    }

    try {
      broadcastToPeers({ type: 'room-destroyed' });
      peers.forEach((conn) => {
        if (conn && conn.open) {
          conn.close();
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
      setConnectionStatus('Party room destroyed');
      setErrorMessage('Party room has been destroyed');
      logConnectionEvent('Party room destroyed by creator');
    } catch (err: any) {
      setErrorMessage(`Failed to destroy room: ${err.message}`);
      logConnectionEvent(`Failed to destroy room: ${err.message}`);
    }
  }, [isCreator, peers, roomTimeout, logConnectionEvent, broadcastToPeers]);

  /**
   * Leaves the party room (non-creator).
   * Closes connections and resets states.
   */
  const leaveRoom = useCallback(() => {
    if (isCreator) {
      logConnectionEvent('Leave room called but user is creator - use destroy instead');
      return;
    }

    try {
      peers.forEach((conn) => {
        if (conn && conn.open) {
          conn.close();
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
      setIsVoiceEnabled(false);
      setIsVideoEnabled(false);
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop());
        setLocalStream(null);
      }
      setConnectionStatus('Left party room');
      logConnectionEvent('Left party room');
    } catch (err: any) {
      setErrorMessage(`Failed to leave room: ${err.message}`);
      logConnectionEvent(`Failed to leave room: ${err.message}`);
    }
  }, [isCreator, peers, localStream, logConnectionEvent]);

  /**
   * Formats a timestamp for display in chat messages.
   * Provides a consistent time format for user readability.
   * @param {number} timestamp - Unix timestamp in milliseconds.
   * @returns {string} Formatted time string (HH:MM:SS).
   */
  const formatTimestamp = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  /**
   * Renders an error modal for general and service worker errors.
   * Includes retry option for service worker errors with limited attempts.
   * @returns {JSX.Element | null} The modal if an error is present.
   */
  const renderErrorModal = () => {
    if (!errorMessage && !serviceWorkerError) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
        <div className="bg-background p-6 rounded-lg border border-white/20 min-w-[280px] max-w-md">
          <h3 className="text-white text-lg font-medium mb-2">Error</h3>
          <p className="text-white/80 mb-4 whitespace-pre-wrap">{errorMessage || serviceWorkerError}</p>
          <div className="flex space-x-2">
            {serviceWorkerError && retryCount < 3 ? (
              <Button
                onClick={() => {
                  setErrorMessage(null);
                  retryServiceWorker();
                }}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                Retry ({3 - retryCount} attempts left)
              </Button>
            ) : null}
            <Button
              onClick={() => {
                setErrorMessage(null);
                setServiceWorkerError(null);
              }}
              className="flex-1 bg-gray-600 hover:bg-gray-700"
            >
              Close
            </Button>
          </div>
          {serviceWorkerError && (
            <p className="text-xs text-white/60 mt-2">
              Offline features may be limited due to service worker issues.
            </p>
          )}
        </div>
      </div>
    );
  };

  /**
   * Renders the list of connected peers in the party room.
   * Displays peer IDs in a compact, scrollable list.
   * @returns {JSX.Element} The peer list UI.
   */
  const renderPeerList = () => (
    <div className="mt-4 p-4 bg-black/20 rounded-lg">
      <h4 className="text-white font-medium mb-2">Connected Peers ({peers.size})</h4>
      {peers.size === 0 ? (
        <p className="text-white/60 text-sm">No peers connected yet</p>
      ) : (
        <ul className="space-y-1 max-h-40 overflow-y-auto">
          {Array.from(peers.keys()).map((peerID) => (
            <li key={peerID} className="text-white/80 text-sm truncate">
              • {peerID.substring(0, 8)}...
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  /**
   * Renders the connection logs panel.
   * Provides a scrollable view of all logged events for debugging.
   * @returns {JSX.Element | null} The logs UI if visible.
   */
  const renderConnectionLogs = () => {
    if (!isLogsOpen) return null;
    return (
      <div className="mt-4 p-4 bg-black/20 rounded-lg">
        <h4 className="text-white font-medium mb-2">Party Logs</h4>
        <div
          ref={logRef}
          className="h-40 sm:h-48 overflow-y-auto bg-black/50 p-2 rounded text-white/80 text-xs leading-tight"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#888 #333' }}
        >
          {connectionLogs.map((log, idx) => (
            <div key={idx} className="mb-1 break-words">{log}</div>
          ))}
        </div>
      </div>
    );
  };

  /**
   * Renders remote camera streams for video call participants.
   * Ensures smooth playback with error handling.
   * @returns {JSX.Element[]} Array of video elements for each stream.
   */
  const renderCameraStreams = () => {
    return Array.from(sharedStreams.entries()).map(([peerID, stream]) => {
      if (stream.getVideoTracks().length === 0) return null;
      return (
        <div key={peerID} className="mt-4 p-2 bg-black/20 rounded-lg">
          <h5 className="text-white text-sm font-medium mb-2">Video from {peerID.substring(0, 8)}...</h5>
          <video
            ref={(el) => {
              if (el) {
                videoRefs.current.set(peerID, el);
                el.srcObject = stream;
                el.play().catch((err) => {
                  logConnectionEvent(`Video playback error for ${peerID}: ${err.message}`);
                });
              }
            }}
            autoPlay
            playsInline
            muted
            className="w-full max-w-xs sm:max-w-sm h-auto border border-white/20 rounded"
          />
        </div>
      );
    });
  };

  /**
   * Renders the group chat panel with text input, voice recording, and message history.
   * Supports emojis via standard input and provides a responsive layout.
   * @returns {JSX.Element | null} The chat UI if visible.
   */
  const renderChat = () => {
    if (!isChatOpen) return null;
    return (
      <div className="mt-4 p-4 bg-black/20 rounded-lg">
        <h4 className="text-white font-medium mb-3 flex items-center">
          Group Chat ({chatMessages.length} messages)
        </h4>
        <div
          ref={chatRef}
          className="h-48 sm:h-56 md:h-64 overflow-y-auto bg-black/50 p-3 rounded mb-3 text-sm leading-relaxed"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#888 #333' }}
        >
          {chatMessages.length === 0 ? (
            <p className="text-white/60 italic text-center py-4">No messages yet. Start the conversation!</p>
          ) : (
            chatMessages.map((msg, idx) => (
              <div key={idx} className="mb-2 p-2 bg-white/10 rounded">
                <div className="flex items-start space-x-2">
                  <span className="font-bold text-xs" style={{ color: msg.color }}>
                    {msg.sender}
                  </span>
                  <span className="text-gray-400 text-xs">[{formatTimestamp(msg.timestamp)}]</span>
                </div>
                {msg.type === 'text' ? (
                  <span className="text-white ml-2 break-words">{msg.message}</span>
                ) : (
                  <div className="ml-2 mt-1">
                    <audio
                      controls
                      src={msg.data}
                      className="w-full max-w-xs"
                      onError={(e) => logConnectionEvent(`Audio playback error: ${e.message}`)}
                    />
                    <span className="text-gray-400 text-xs block">Voice message</span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
        <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
          <Input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChat();
              }
            }}
            placeholder="Type a message or emoji... (Shift+Enter for new line)"
            className="flex-1 bg-transparent border-b border-white/20 text-white placeholder-white/50"
          />
          <div className="flex space-x-2">
            <Button
              onClick={sendChat}
              disabled={!chatInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 px-4"
            >
              Send
            </Button>
            <Button
              onClick={isRecordingVoice ? stopRecordingVoice : startRecordingVoice}
              className={`px-4 ${isRecordingVoice ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}
            >
              {isRecordingVoice ? <StopCircle className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Renders the create room modal form.
   * Provides input fields for username and password with validation.
   * @returns {JSX.Element | null} The modal if open.
   */
  const renderCreateModal = () => {
    if (!isCreateModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md sm:max-w-lg">
          <h3 className="text-white text-lg font-medium mb-4">Create Party Room</h3>
          <Input
            value={createUsername}
            onChange={(e) => setCreateUsername(e.target.value)}
            placeholder="Enter your username"
            className="mb-3"
          />
          <Input
            type="password"
            value={createPassword}
            onChange={(e) => setCreatePassword(e.target.value)}
            placeholder="Enter room password"
            className="mb-4"
          />
          <div className="flex space-x-2">
            <Button
              onClick={createRoomAction}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={!createUsername.trim() || !createPassword.trim()}
            >
              Create Room
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreateModalOpen(false);
                setCreateUsername('');
                setCreatePassword('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Renders the join room modal form.
   * Auto-fills room ID from URL if present.
   * @returns {JSX.Element | null} The modal if open.
   */
  const renderJoinModal = () => {
    if (!isJoinModalOpen) return null;
    const isFromURL = !!new URLSearchParams(location.search).get('room');
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md sm:max-w-lg">
          <h3 className="text-white text-lg font-medium mb-4">Join Party Room</h3>
          <Input
            value={joinRoomID}
            onChange={(e) => setJoinRoomID(e.target.value)}
            placeholder="Enter room ID or URL"
            className="mb-3"
            disabled={isFromURL}
          />
          <Input
            value={joinUsername}
            onChange={(e) => setJoinUsername(e.target.value)}
            placeholder="Enter your username (optional)"
            className="mb-3"
          />
          <Input
            type="password"
            value={joinPassword}
            onChange={(e) => setJoinPassword(e.target.value)}
            placeholder="Enter room password"
            className="mb-4"
          />
          <div className="flex space-x-2">
            <Button
              onClick={joinRoomAction}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              disabled={!joinRoomID.trim() || !joinPassword.trim()}
            >
              Join Room
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsJoinModalOpen(false);
                setJoinRoomID('');
                setJoinUsername('');
                setJoinPassword('');
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
          {isFromURL && <p className="text-xs text-white/60 mt-2">Room ID auto-filled from URL</p>}
        </div>
      </div>
    );
  };

  /**
   * Renders the room URL sharing modal.
   * Allows copying the room link for sharing.
   * @returns {JSX.Element | null} The modal if open.
   */
  const renderRoomURLModal = () => {
    if (!isRoomURLModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md sm:max-w-lg">
          <h3 className="text-white text-lg font-medium mb-4">Party Room Created</h3>
          <p className="text-white/80 mb-3">Share this link with friends:</p>
          <Input
            value={currentRoomURL}
            readOnly
            className="mb-3 text-sm"
            onFocus={(e) => e.target.select()}
          />
          <div className="flex space-x-2">
            <Button onClick={copyRoomURL} className="flex-1 bg-green-600 hover:bg-green-700">
              <Copy className="h-4 w-4 mr-2" />
              Copy Link
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setIsRoomURLModalOpen(false);
                setCurrentRoomURL('');
              }}
              className="flex-1"
            >
              Close
            </Button>
          </div>
        </div>
      </div>
    );
  };

  /**
   * Renders the party watch overlay with all controls.
   * Responsive layout with grid system for mobile and desktop.
   * @returns {JSX.Element | null} The overlay if open.
   */
  const renderPartyWatchControls = () => {
    if (!isSettingsOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 sm:p-6">
        <div className="bg-background p-4 sm:p-6 md:p-8 rounded-lg border border-white/20 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
            <h3 className="text-xl sm:text-2xl font-medium text-white">Party Watch Controls</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsOpen(false)}
              className="text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <p className="text-sm text-white/60 mb-6">Connection Status: {connectionStatus}</p>
          {serviceWorkerError && (
            <p className="text-sm text-yellow-400 mb-4">
              Warning: Offline features may be limited due to service worker issues.
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="text-lg font-medium text-white mb-4">Room Management</h4>
              {!roomID ? (
                <div className="flex flex-col space-y-3">
                  <Button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 w-full"
                  >
                    Create Party Room
                  </Button>
                  <Button
                    onClick={() => setIsJoinModalOpen(true)}
                    className="bg-green-600 hover:bg-green-700 w-full"
                  >
                    Join Party Room
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-white text-sm">Room ID: {roomID}</p>
                  {isCreator ? (
                    <Button
                      onClick={destroyRoom}
                      className="bg-red-600 hover:bg-red-700 w-full"
                    >
                      Destroy Room
                    </Button>
                  ) : (
                    <Button
                      onClick={leaveRoom}
                      className="bg-orange-600 hover:bg-orange-700 w-full"
                    >
                      Leave Room
                    </Button>
                  )}
                </div>
              )}
            </div>

            <div>
              <h4 className="text-lg font-medium text-white mb-4">Media Controls</h4>
              <div className="grid grid-cols-2 gap-3">
                <Button
                  onClick={isVoiceEnabled ? disableVoice : enableVoice}
                  className={`flex items-center justify-center ${isVoiceEnabled ? 'bg-gray-500' : 'bg-blue-600 hover:bg-blue-700'}`}
                >
                  {isVoiceEnabled ? <MicOff className="h-4 w-4 mr-2" /> : <Mic className="h-4 w-4 mr-2" />}
                  {isVoiceEnabled ? 'Mute' : 'Unmute'}
                </Button>
                <Button
                  onClick={isVideoEnabled ? disableVideo : enableVideo}
                  className={`flex items-center justify-center ${isVideoEnabled ? 'bg-gray-500' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                  {isVideoEnabled ? <VideoOff className="h-4 w-4 mr-2" /> : <Video className="h-4 w-4 mr-2" />}
                  {isVideoEnabled ? 'Cam Off' : 'Cam On'}
                </Button>
                <Button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="flex items-center justify-center bg-green-600 hover:bg-green-700"
                >
                  💬 {isChatOpen ? 'Hide Chat' : 'Show Chat'}
                </Button>
                <Button
                  onClick={isRecordingSession ? stopRecordingSession : startRecordingSession}
                  className={`flex items-center justify-center ${isRecordingSession ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
                >
                  {isRecordingSession ? <StopCircle className="h-4 w-4 mr-2" /> : <Circle className="h-4 w-4 mr-2" />}
                  {isRecordingSession ? 'Stop Rec' : 'Record'}
                </Button>
                <Button
                  onClick={() => setIsLogsOpen(!isLogsOpen)}
                  className="col-span-2 flex items-center justify-center bg-gray-600 hover:bg-gray-700"
                >
                  📋 {isLogsOpen ? 'Hide Logs' : 'Show Logs'}
                </Button>
              </div>
            </div>
          </div>

          {renderPeerList()}
          {renderCameraStreams()}
          {renderChat()}
          {renderConnectionLogs()}
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
      className="min-h-screen bg-background relative overflow-hidden"
    >
      {/* Background gradient for visual appeal */}
      <div className="fixed inset-0 bg-gradient-to-b from-background/95 to-background pointer-events-none z-0" />

      {/* Navbar with consistent styling */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-30"
      >
        <Navbar />
      </motion.nav>

      <div className="container mx-auto py-6 px-4 sm:px-6 md:px-8 max-w-7xl">
        {/* Media Actions for favorite, watchlist, and navigation */}
        <MediaActions
          isFavorite={isFavorite}
          isInMyWatchlist={isInMyWatchlist}
          onToggleFavorite={toggleFavorite}
          onToggleWatchlist={toggleWatchlist}
          onBack={goBack}
          onViewDetails={goToDetails}
        />

        {/* Video Player with responsive sizing */}
        <div className="relative z-10 mb-6">
          <VideoPlayer
            isLoading={isLoading}
            iframeUrl={iframeUrl}
            title={title}
            poster={posterUrl}
            onLoaded={handlePlayerLoaded}
            onError={handlePlayerError}
          />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-6 relative z-10"
        >
          {/* Episode Navigation for TV shows */}
          {mediaType === 'tv' && episodes.length > 0 && (
            <EpisodeNavigation
              episodes={episodes}
              currentEpisodeIndex={currentEpisodeIndex}
              onPreviousEpisode={goToPreviousEpisode}
              onNextEpisode={goToNextEpisode}
            />
          )}

          {/* Video Sources Selector with Sync */}
          <div className="space-y-4 bg-black/10 p-4 rounded-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1">
                <h3 className="text-lg font-medium text-white">Video Sources</h3>
                <p className="text-sm text-white/60">Select your preferred streaming source (syncs with party)</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 min-w-[120px]"
                  onClick={goToDetails}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 bg-white/5 backdrop-blur-sm hover:bg-white/10 min-w-[120px]"
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

      {/* Modals for Room Management */}
      {renderCreateModal()}
      {renderJoinModal()}
      {renderRoomURLModal()}

      {/* Error Modal for General and Service Worker Errors */}
      {renderErrorModal()}
    </motion.div>
  );
};

export default Player;
