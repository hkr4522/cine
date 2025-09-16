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
 * Includes room creation/joining, voice call, video call, group chat with emojis and voice messages,
 * session recording for memories, and synchronized video source selection.
 * Responsive design for mobile and desktop with Tailwind CSS.
 * Enhanced error handling for service worker and WebRTC.
 */
const Player = () => {
  const { id, season, episode, type } = useParams<{
    id: string;
    season?: string;
    episode?: string;
    type: string;
  }>();
  const { user } = useAuth();
  const location = useLocation();

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

  // State for party watch features
  const [isPeerLoaded, setIsPeerLoaded] = useState(false);
  const [roomID, setRoomID] = useState<string | null>(null);
  const [roomPassword, setRoomPassword] = useState<string | null>(null);
  const [username, setUsername] = useState<string>(user?.username || 'Anonymous');
  const [peers, setPeers] = useState<Map<string, any>>(new Map());
  const [dataChannels, setDataChannels] = useState<Map<string, RTCDataChannel>>(new Map());
  const [chatMessages, setChatMessages] = useState<
    { sender: string; message: string; timestamp: number; color: string; type: 'text' | 'voice'; data?: string }[]
  >([]);
  const [sharedStreams, setSharedStreams] = useState<Map<string, MediaStream>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [myPeerID, setMyPeerID] = useState<string | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [roomTimeout, setRoomTimeout] = useState<NodeJS.Timeout | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinRoomID, setJoinRoomID] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [isRoomURLModalOpen, setIsRoomURLModalOpen] = useState(false);
  const [currentRoomURL, setCurrentRoomURL] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isRecordingSession, setIsRecordingSession] = useState(false);
  const [serviceWorkerError, setServiceWorkerError] = useState<string | null>(null);

  // Refs for DOM elements and WebRTC objects
  const peerRef = useRef<any>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const chatRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const voiceRecorder = useRef<MediaRecorder | null>(null);
  const sessionRecorder = useRef<MediaRecorder | null>(null);
  const recordedVoiceChunks = useRef<Blob[]>([]);
  const recordedSessionChunks = useRef<Blob[]>([]);

  /**
   * Generates a random hex color for user messages in chat.
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
   * Sanitizes user input to prevent XSS attacks.
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
   * Logs connection or party watch events.
   */
  const logConnectionEvent = useCallback((message: string) => {
    setConnectionLogs((prev) => [...prev, `${new Date().toLocaleString()}: ${message}`]);
    if (logRef.current && isLogsOpen) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
    console.log(`[Party Watch] ${message}`);
  }, [isLogsOpen]);

  /**
   * Loads PeerJS library from CDN.
   */
  useEffect(() => {
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
          setServiceWorkerError('No active service worker found. Some features may be unavailable.');
        }
      }).catch((err) => {
        setServiceWorkerError(`Service Worker error: ${err.message}`);
        logConnectionEvent(`Service Worker error: ${err.message}`);
      });
    }

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
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
        logConnectionEvent('Local media stream stopped on cleanup');
      }
    };
  }, [logConnectionEvent]);

  /**
   * Initializes PeerJS connection.
   */
  useEffect(() => {
    if (isPeerLoaded && !peerRef.current) {
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
    }
  }, [isPeerLoaded, logConnectionEvent]);

  /**
   * Checks URL for room ID and opens join modal.
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
   * Handles synchronized video source changes.
   */
  const syncedHandleSourceChange = useCallback((newSource: string) => {
    handleSourceChange(newSource);
    if (roomID) {
      broadcastToPeers({ type: 'source-change', source: newSource });
      logConnectionEvent(`Synchronized video source change to: ${newSource}`);
    }
  }, [handleSourceChange, roomID, logConnectionEvent]);

  /**
   * Creates a new party room.
   */
  const createRoomAction = useCallback(() => {
    if (!createUsername.trim() || !createPassword.trim()) {
      setErrorMessage('Username and password are required');
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

    if (peerRef.current) {
      peerRef.current.destroy();
    }
    const Peer = (window as any).Peer;
    peerRef.current = new Peer(newRoomID, { debug: 3 });

    peerRef.current.on('open', (id: string) => {
      setMyPeerID(id);
      setConnectionStatus('Party room created');
      const generatedURL = `${window.location.origin}${window.location.pathname}?room=${id}`;
      setCurrentRoomURL(generatedURL);
      setIsRoomURLModalOpen(true);
      setIsCreateModalOpen(false);
      logConnectionEvent(`Party room created with ID: ${id}`);

      const timeout = setTimeout(() => {
        destroyRoom();
      }, 21600000);
      setRoomTimeout(timeout);
      logConnectionEvent('Room auto-deletion timer set for 6 hours');
    });

    peerRef.current.on('connection', handleIncomingDataConnection);
    peerRef.current.on('call', handleIncomingCall);
    peerRef.current.on('error', (err: any) => {
      setErrorMessage(`Room creation error: ${err.type || err.message}`);
      logConnectionEvent(`Room creation error: ${err.type || err.message}`);
    });
  }, [createUsername, createPassword, logConnectionEvent, sanitizeInput]);

  /**
   * Joins an existing party room.
   */
  const joinRoomAction = useCallback(() => {
    if (!joinRoomID.trim() || !joinPassword.trim()) {
      setErrorMessage('Room ID and password are required');
      return;
    }
    const sanitizedUsername = sanitizeInput(joinUsername.trim() || 'Anonymous');
    const sanitizedPassword = sanitizeInput(joinPassword.trim());

    setRoomID(joinRoomID.trim());
    setUsername(sanitizedUsername);
    setRoomPassword(sanitizedPassword);
    setConnectionStatus('Joining party room...');
    logConnectionEvent('Attempting to join party room...');

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
        setConnectionStatus('Joined party room');
        setIsJoinModalOpen(false);
        logConnectionEvent('Successfully joined party room');
      } else if (data.type === 'join-rejected') {
        setErrorMessage('Invalid password or room rejected the join request');
        setRoomID(null);
        setRoomPassword(null);
        setConnectionStatus('Join rejected');
        logConnectionEvent('Join request rejected');
      } else if (data.type === 'source-change') {
        syncedHandleSourceChange(data.source);
        logConnectionEvent(`Received synchronized source change: ${data.source}`);
      }
    });

    conn.on('error', (err: any) => {
      setErrorMessage(`Connection error while joining: ${err.type || err.message}`);
      logConnectionEvent(`Connection error while joining: ${err.type || err.message}`);
    });

    addPeerConnection(joinRoomID.trim(), conn);
  }, [joinRoomID, joinUsername, joinPassword, myPeerID, logConnectionEvent, sanitizeInput, syncedHandleSourceChange]);

  /**
   * Handles incoming data connections.
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
   * Handles join requests from peers.
   */
  const handleJoinRequest = useCallback(
    (conn: any, data: any) => {
      if (!isCreator) {
        logConnectionEvent('Received join request but not room creator');
        return;
      }

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
        setErrorMessage(`${data.username || 'Anonymous'} attempted to join with incorrect password`);
        logConnectionEvent(`${data.username || 'Anonymous'} attempted to join with incorrect password`);
      }
    },
    [isCreator, roomPassword, peers, logConnectionEvent, broadcastToPeers]
  );

  /**
   * Connects to a new peer.
   */
  const connectToPeer = useCallback(
    (peerID: string) => {
      if (peers.has(peerID) || peerID === myPeerID) {
        logConnectionEvent(`Skipped redundant connection to peer: ${peerID}`);
        return;
      }

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
    },
    [myPeerID, isVoiceEnabled, isVideoEnabled, localStream, logConnectionEvent]
  );

  /**
   * Handles arbitrary data from peers.
   */
  const handleDataFromPeer = useCallback((data: any) => {
    logConnectionEvent(`Received arbitrary data from peer: ${JSON.stringify(data)}`);
  }, [logConnectionEvent]);

  /**
   * Adds a peer connection to state.
   */
  const addPeerConnection = useCallback((peerID: string, conn: any) => {
    setPeers((prev) => {
      const newMap = new Map(prev);
      newMap.set(peerID, conn);
      return newMap;
    });
    logConnectionEvent(`Added peer connection: ${peerID} (total peers: ${newMap.size})`);
  }, [logConnectionEvent]);

  /**
   * Removes a peer connection.
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
   * Broadcasts data to all peers.
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
   * Enables microphone for voice call.
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
      setConnectionStatus('Microphone enabled');
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
   * Disables microphone.
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
   * Enables camera for video call.
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
      setConnectionStatus('Camera enabled');
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
   * Disables camera.
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
   * Starts recording a voice message.
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
   * Stops voice message recording.
   */
  const stopRecordingVoice = useCallback(() => {
    if (voiceRecorder.current && isRecordingVoice) {
      voiceRecorder.current.stop();
      setIsRecordingVoice(false);
      logConnectionEvent('Stopped voice message recording');
    }
  }, [isRecordingVoice, logConnectionEvent]);

  /**
   * Starts session recording.
   */
  const startRecordingSession = useCallback(() => {
    if (!localStream) {
      setErrorMessage('No media stream available for session recording');
      return;
    }

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
      logConnectionEvent('Session memories downloaded');
    };

    sessionRecorder.current.start(1000);
    setIsRecordingSession(true);
    logConnectionEvent('Started recording party session');
  }, [localStream, logConnectionEvent]);

  /**
   * Stops session recording.
   */
  const stopRecordingSession = useCallback(() => {
    if (sessionRecorder.current && isRecordingSession) {
      sessionRecorder.current.stop();
      logConnectionEvent('Stopped recording party session');
    }
  }, [isRecordingSession, logConnectionEvent]);

  /**
   * Copies room URL to clipboard.
   */
  const copyRoomURL = useCallback(() => {
    if (navigator.clipboard && currentRoomURL) {
      navigator.clipboard.writeText(currentRoomURL).then(() => {
        logConnectionEvent('Room URL copied to clipboard');
        setIsRoomURLModalOpen(false);
      }).catch((err: any) => {
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
        logConnectionEvent('Room URL copied via fallback');
      } catch (err: any) {
        setErrorMessage(`Fallback copy failed: ${err.message}`);
        logConnectionEvent(`Fallback copy failed: ${err.message}`);
      }
      document.body.removeChild(textArea);
      setIsRoomURLModalOpen(false);
    }
  }, [currentRoomURL, logConnectionEvent]);

  /**
   * Sends a chat message.
   */
  const sendChat = useCallback(() => {
    const input = chatInput.trim();
    if (!input) {
      setErrorMessage('Cannot send empty chat message');
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
   * Calls a peer with media stream.
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
   * Handles incoming media calls.
   */
  const handleIncomingCall = useCallback(
    (call: any) => {
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
    },
    [localStream, logConnectionEvent]
  );

  /**
   * Destroys the party room.
   */
  const destroyRoom = useCallback(() => {
    if (!isCreator) {
      logConnectionEvent('Destroy room called but user is not creator');
      return;
    }

    broadcastToPeers({ type: 'room-destroyed' });
    peers.forEach((conn) => {
      try {
        if (conn && conn.open) {
          conn.close();
        }
      } catch (err: any) {
        logConnectionEvent(`Error closing peer connection: ${err.message}`);
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
  }, [isCreator, peers, roomTimeout, logConnectionEvent, broadcastToPeers]);

  /**
   * Leaves the party room.
   */
  const leaveRoom = useCallback(() => {
    if (isCreator) {
      logConnectionEvent('Leave room called but user is creator - use destroy instead');
      return;
    }

    peers.forEach((conn) => {
      try {
        if (conn && conn.open) {
          conn.close();
        }
      } catch (err: any) {
        logConnectionEvent(`Error closing peer connection on leave: ${err.message}`);
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
  }, [isCreator, peers, localStream, logConnectionEvent]);

  /**
   * Formats timestamp for chat messages.
   */
  const formatTimestamp = useCallback((timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, []);

  /**
   * Renders error modal.
   */
  const renderErrorModal = () => {
    if (!errorMessage && !serviceWorkerError) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
        <div className="bg-background p-6 rounded-lg border border-white/20 min-w-[280px] max-w-md">
          <h3 className="text-white text-lg font-medium mb-2">Error</h3>
          <p className="text-white/80 mb-4 whitespace-pre-wrap">{errorMessage || serviceWorkerError}</p>
          <Button
            onClick={() => {
              setErrorMessage(null);
              setServiceWorkerError(null);
              // Retry service worker registration
              if (serviceWorkerError && 'serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch((err) => {
                  setServiceWorkerError(`Retry failed: ${err.message}`);
                });
              }
            }}
            className="w-full bg-red-600 hover:bg-red-700"
          >
            {serviceWorkerError ? 'Retry' : 'Close'}
          </Button>
        </div>
      </div>
    );
  };

  /**
   * Renders peer list.
   */
  const renderPeerList = () => (
    <div className="mt-4 p-4 bg-black/20 rounded-lg">
      <h4 className="text-white font-medium mb-2">Connected Peers ({peers.size})</h4>
      {peers.size === 0 ? (
        <p className="text-white/60 text-sm">No peers connected</p>
      ) : (
        <ul className="space-y-1">
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
   * Renders connection logs.
   */
  const renderConnectionLogs = () => {
    if (!isLogsOpen) return null;
    return (
      <div className="mt-4 p-4 bg-black/20 rounded-lg">
        <h4 className="text-white font-medium mb-2">Party Logs</h4>
        <div
          ref={logRef}
          className="h-40 overflow-y-auto bg-black/50 p-2 rounded text-white/80 text-xs"
        >
          {connectionLogs.map((log, idx) => (
            <div key={idx} className="mb-1 break-words">{log}</div>
          ))}
        </div>
      </div>
    );
  };

  /**
   * Renders camera streams.
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
                el.play().catch((err) => logConnectionEvent(`Video playback error for ${peerID}: ${err.message}`));
              }
            }}
            autoPlay
            playsInline
            muted
            className="w-full max-w-xs h-auto border border-white/20 rounded"
          />
        </div>
      );
    });
  };

  /**
   * Renders group chat panel.
   */
  const renderChat = () => {
    if (!isChatOpen) return null;
    return (
      <div className="mt-4 p-4 bg-black/20 rounded-lg">
        <h4 className="text-white font-medium mb-3">Group Chat ({chatMessages.length})</h4>
        <div
          ref={chatRef}
          className="h-48 sm:h-56 md:h-64 overflow-y-auto bg-black/50 p-3 rounded mb-3 text-sm"
        >
          {chatMessages.length === 0 ? (
            <p className="text-white/60 italic text-center py-4">No messages yet</p>
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
                    <audio controls src={msg.data} className="w-full max-w-xs" />
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
            placeholder="Type a message or emoji..."
            className="flex-1 bg-transparent border-b border-white/20 text-white placeholder-white/50"
          />
          <div className="flex space-x-2">
            <Button
              onClick={sendChat}
              disabled={!chatInput.trim()}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500"
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
   * Renders create room modal.
   */
  const renderCreateModal = () => {
    if (!isCreateModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md">
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
            <Button onClick={createRoomAction} className="flex-1 bg-blue-600 hover:bg-blue-700">
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
   * Renders join room modal.
   */
  const renderJoinModal = () => {
    if (!isJoinModalOpen) return null;
    const isFromURL = !!new URLSearchParams(location.search).get('room');
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md">
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
            <Button onClick={joinRoomAction} className="flex-1 bg-blue-600 hover:bg-blue-700">
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
   * Renders room URL sharing modal.
   */
  const renderRoomURLModal = () => {
    if (!isRoomURLModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-60 p-4">
        <div className="bg-background p-6 rounded-lg border border-white/20 w-full max-w-md">
          <h3 className="text-white text-lg font-medium mb-4">Party Room Created</h3>
          <p className="text-white/80 mb-3">Share this link:</p>
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
   * Renders party watch controls.
   */
  const renderPartyWatchControls = () => {
    if (!isSettingsOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
        <div className="bg-background p-4 sm:p-6 md:p-8 rounded-lg border border-white/20 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex justify-between items-center mb-6">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <h4 className="text-lg font-medium text-white mb-4">Room Management</h4>
              <p className="text-sm text-white/60 mb-4">Status: {connectionStatus}</p>
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

          {renderCameraStreams()}
          {renderConnectionLogs()}
          {renderChat()}
          {renderPeerList()}
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

      <div className="container mx-auto py-6 px-4 sm:px-6 md:px-8 max-w-7xl">
        <MediaActions
          isFavorite={isFavorite}
          isInMyWatchlist={isInMyWatchlist}
          onToggleFavorite={toggleFavorite}
          onToggleWatchlist={toggleWatchlist}
          onBack={goBack}
          onViewDetails={goToDetails}
        />

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
          className="space-y-6"
        >
          {mediaType === 'tv' && episodes.length > 0 && (
            <EpisodeNavigation
              episodes={episodes}
              currentEpisodeIndex={currentEpisodeIndex}
              onPreviousEpisode={goToPreviousEpisode}
              onNextEpisode={goToNextEpisode}
            />
          )}

          <div className="space-y-4 bg-black/10 p-4 rounded-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-medium text-white">Video Sources</h3>
                <p className="text-sm text-white/60">Select your preferred streaming source</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 bg-white/5 hover:bg-white/10 min-w-[120px]"
                  onClick={goToDetails}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View Details
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-white/10 bg-white/5 hover:bg-white/10 min-w-[120px]"
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

      {renderPartyWatchControls()}
      {renderCreateModal()}
      {renderJoinModal()}
      {renderRoomURLModal()}
      {renderErrorModal()}
    </motion.div>
  );
};

export default Player;
