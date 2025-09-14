import { Check } from 'lucide-react';
import { triggerHapticFeedback, triggerSuccessHaptic } from '@/utils/haptic-feedback';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { VideoSource } from '@/utils/types';
import { useToast } from '@/hooks/use-toast';
import { useUserPreferences } from '@/hooks/user-preferences';
import { useAuth } from '@/hooks';
import { useState, useEffect, useRef } from 'react';

interface VideoSourceSelectorProps {
  videoSources: VideoSource[];
  selectedSource: string;
  onSourceChange: (sourceKey: string) => void;
}

const VideoSourceSelector = ({
  videoSources,
  selectedSource,
  onSourceChange,
}: VideoSourceSelectorProps) => {
  const { toast } = useToast();
  const { updatePreferences } = useUserPreferences();
  const { user } = useAuth();
  const [isChanging, setIsChanging] = useState(false);
  const [mode, setMode] = useState<'select' | 'room-setup' | 'create' | 'join' | 'in-room'>('select');
  const [roomId, setRoomId] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinUsername, setJoinUsername] = useState('');
  const [joinPassword, setJoinPassword] = useState('');
  const [peer, setPeer] = useState<any>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [messages, setMessages] = useState<{ from: string; text: string }[]>([]);
  const [chatText, setChatText] = useState('');
  const [createTime, setCreateTime] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);
  const [isCreator, setIsCreator] = useState(false);
  const [controlGranted, setControlGranted] = useState(false); // For joiner
  const [remoteCursors, setRemoteCursors] = useState<{ [key: string]: { x: number; y: number } }>({});
  const [peerLoaded, setPeerLoaded] = useState(false);
  const [streamDimensions, setStreamDimensions] = useState({ width: 0, height: 0 });
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const conns = useRef<any[]>([]); // For joiner, since only one conn
  const audioElements = useRef<{ [key: string]: HTMLAudioElement }>({});

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#room=')) {
      const id = hash.slice(6);
      setJoinRoomId(id);
      setMode('join');
    }
  }, []);

  useEffect(() => {
    if (selectedSource === 'screen-share') {
      loadPeerJS();
    }
  }, [selectedSource]);

  useEffect(() => {
    if (!controlGranted || isCreator || !remoteVideoRef.current || conns.current.length === 0) return;

    const video = remoteVideoRef.current;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = video.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const relX = x / rect.width;
      const relY = y / rect.height;
      const absX = relX * streamDimensions.width;
      const absY = relY * streamDimensions.height;
      conns.current[0].send({
        type: 'event',
        event: { type: 'mousemove', absX, absY },
      });
    };

    const handleClick = (e: MouseEvent) => {
      const rect = video.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const relX = x / rect.width;
      const relY = y / rect.height;
      const absX = relX * streamDimensions.width;
      const absY = relY * streamDimensions.height;
      conns.current[0].send({
        type: 'event',
        event: { type: 'click', absX, absY, button: e.button },
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      conns.current[0].send({
        type: 'event',
        event: {
          type: 'keydown',
          key: e.key,
          code: e.code,
          shiftKey: e.shiftKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
        },
      });
    };

    video.addEventListener('mousemove', handleMouseMove);
    video.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      video.removeEventListener('mousemove', handleMouseMove);
      video.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [controlGranted, isCreator, streamDimensions]);

  const loadPeerJS = () => {
    if (window.Peer) {
      setPeerLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    script.onload = () => setPeerLoaded(true);
    document.body.appendChild(script);
  };

  const handleSourceChange = async (sourceKey: string) => {
    triggerSuccessHaptic();
    setIsChanging(true);
    onSourceChange(sourceKey);
    if (user) {
      await updatePreferences({ preferred_source: sourceKey });
    }
    const sourceName = effectiveSources.find((s) => s.key === sourceKey)?.name || 'new source';
    toast({
      title: 'Source Changed',
      description: `Switched to ${sourceName}`,
      duration: 3000,
    });
    setIsChanging(false);
    if (sourceKey === 'screen-share') {
      setMode('room-setup');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerLoaded) {
      toast({ title: 'Error', description: 'PeerJS not loaded yet' });
      return;
    }
    const id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
    setRoomId(id);
    setCreateTime(Date.now());
    setIsCreator(true);
    const newPeer = new (window as any).Peer(id);
    setPeer(newPeer);

    newPeer.on('open', () => {
      toast({ title: 'Success', description: 'Room created' });
    });

    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(mic);
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const audioTrack = mic.getAudioTracks()[0];
      screen.addTrack(audioTrack);
      setStream(screen);
      if (localVideoRef.current) localVideoRef.current.srcObject = screen;
      const settings = screen.getVideoTracks()[0].getSettings();
      setStreamDimensions({ width: settings.width, height: settings.height });
      screen.getVideoTracks()[0].onended = () => {
        toast({ title: 'Info', description: 'Screen share ended' });
      };
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to get media streams' });
      return;
    }

    newPeer.on('connection', (conn: any) => {
      conn.on('data', (data: any) => {
        if (data.type === 'join') {
          if (data.pass !== password) {
            conn.send({ type: 'error', msg: 'Wrong password' });
            conn.close();
            return;
          }
          const userName = data.username || 'Anonymous';
          toast({ title: 'Info', description: `${userName} joined` });
          const newUser = { conn, username: userName, id: conn.peer };
          setUsers((prev) => [...prev, newUser]);
          if (Date.now() - createTime > 21600000) {
            conn.send({ type: 'error', msg: 'Room expired' });
            conn.close();
            return;
          }
          conn.send({ type: 'accepted', createTime });
        } else if (data.type === 'message') {
          const fromUser = users.find((u) => u.id === conn.peer);
          if (fromUser) {
            const msg = { from: fromUser.username, text: data.text };
            setMessages((prev) => [...prev, msg]);
            users.forEach((u) => u.conn.send({ type: 'message', from: msg.from, text: msg.text }));
          }
        } else if (data.type === 'request-control') {
          const fromUser = users.find((u) => u.id === conn.peer);
          if (fromUser) {
            const accept = window.confirm(`Allow ${fromUser.username} to control your screen?`);
            if (accept) {
              conn.controlGranted = true;
              conn.send({
                type: 'control-granted',
                streamWidth: streamDimensions.width,
                streamHeight: streamDimensions.height,
              });
            }
          }
        } else if (data.type === 'event') {
          if (conn.controlGranted) {
            const { event } = data;
            if (event.type === 'mousemove') {
              setRemoteCursors((prev) => ({ ...prev, [conn.peer]: { x: event.absX, y: event.absY } }));
            } else {
              let evt: Event | null = null;
              const options: any = { bubbles: true, cancelable: true };
              let target: Element | Document = document;
              if (['click', 'mousemove'].includes(event.type)) {
                const x = event.absX;
                const y = event.absY;
                options.clientX = x;
                options.clientY = y;
                options.button = event.button || 0;
                target = document.elementFromPoint(x, y) || document;
                evt = new MouseEvent(event.type, options);
              } else if (event.type === 'keydown') {
                options.key = event.key;
                options.code = event.code;
                options.shiftKey = event.shiftKey;
                options.ctrlKey = event.ctrlKey;
                options.altKey = event.altKey;
                options.metaKey = event.metaKey;
                evt = new KeyboardEvent(event.type, options);
              }
              if (evt && target) {
                target.dispatchEvent(evt);
              }
            }
          }
        }
      });

      conn.on('close', () => {
        setUsers((prev) => prev.filter((u) => u.id !== conn.peer));
        setRemoteCursors((prev) => {
          const newCursors = { ...prev };
          delete newCursors[conn.peer];
          return newCursors;
        });
      });
    });

    newPeer.on('call', (call: any) => {
      if (stream) call.answer(stream);
      call.on('stream', (remoteStream: MediaStream) => {
        const audio = new Audio();
        audio.srcObject = remoteStream;
        audio.autoplay = true;
        audioElements.current[call.peer] = audio;
      });
      call.on('close', () => {
        if (audioElements.current[call.peer]) {
          audioElements.current[call.peer].pause();
          delete audioElements.current[call.peer];
        }
      });
    });

    setMode('in-room');
  };

  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!peerLoaded) {
      toast({ title: 'Error', description: 'PeerJS not loaded yet' });
      return;
    }
    const newPeer = new (window as any).Peer();
    setPeer(newPeer);

    let conn: any;
    newPeer.on('open', () => {
      conn = newPeer.connect(joinRoomId);
      conns.current = [conn];

      conn.on('open', () => {
        conn.send({ type: 'join', pass: joinPassword, username: joinUsername });
      });

      conn.on('data', (data: any) => {
        if (data.type === 'accepted') {
          setCreateTime(data.createTime);
          if (Date.now() - data.createTime > 21600000) {
            toast({ title: 'Error', description: 'Room has expired' });
            conn.close();
            return;
          }
          toast({ title: 'Success', description: 'Joined room' });
          setMode('in-room');
          setRoomId(joinRoomId);
          setIsCreator(false);
        } else if (data.type === 'error') {
          toast({ title: 'Error', description: data.msg });
        } else if (data.type === 'message') {
          setMessages((prev) => [...prev, { from: data.from, text: data.text }]);
        } else if (data.type === 'control-granted') {
          setControlGranted(true);
          setStreamDimensions({ width: data.streamWidth, height: data.streamHeight });
          toast({ title: 'Info', description: 'Control granted' });
        }
      });

      conn.on('close', () => {
        toast({ title: 'Info', description: 'Disconnected from room' });
        setMode('room-setup');
      });
    });

    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(mic);
      // Wait for accepted to call, but since on('data') is async, we move the call inside accepted
      // But for simplicity, assume we call after open, but to ensure, add a listener
      const interval = setInterval(() => {
        if (mode === 'in-room' && !isCreator) {
          const call = newPeer.call(joinRoomId, mic);
          call.on('stream', (remoteStream: MediaStream) => {
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
          });
          clearInterval(interval);
        }
      }, 1000);
      setTimeout(() => clearInterval(interval), 10000); // timeout
    } catch (err) {
      toast({ title: 'Error', description: 'Failed to get microphone' });
    }
  };

  const sendMessage = () => {
    if (!chatText) return;
    if (isCreator) {
      const msg = { from: username || 'Host', text: chatText };
      setMessages((prev) => [...prev, msg]);
      users.forEach((u) => u.conn.send({ type: 'message', from: msg.from, text: msg.text }));
    } else if (conns.current[0]) {
      conns.current[0].send({ type: 'message', text: chatText });
      setMessages((prev) => [...prev, { from: joinUsername || 'You', text: chatText }]);
    }
    setChatText('');
  };

  const requestControl = () => {
    if (conns.current[0]) {
      conns.current[0].send({ type: 'request-control' });
      toast({ title: 'Info', description: 'Control requested' });
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (peer) peer.destroy();
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (micStream) micStream.getTracks().forEach((track) => track.stop());
      Object.values(audioElements.current).forEach((audio) => audio.pause());
    };
  }, []);

  let effectiveSources: VideoSource[] = videoSources;
  if (!videoSources.some((s) => s.key === 'screen-share')) {
    effectiveSources = [...videoSources, { key: 'screen-share', name: 'Screen Share' }];
  }

  return (
    <div>
      <motion.div
        className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 md:gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        {effectiveSources.map((source, index) => (
          <motion.button
            key={source.key}
            onClick={() => handleSourceChange(source.key)}
            className={cn(
              'relative group p-4 rounded-xl border transition-all duration-300 overflow-hidden',
              'bg-gradient-to-br backdrop-blur-sm shadow-sm transform hover:-translate-y-0.5',
              'hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
              selectedSource === source.key
                ? 'from-white/20 to-white/10 border-white/50 shadow-white/10'
                : 'from-white/5 to-transparent border-white/10 hover:border-white/30',
              isChanging && selectedSource === source.key && 'animate-pulse',
            )}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
            aria-label={`Select ${source.name} video source`}
            aria-pressed={selectedSource === source.key}
          >
            {selectedSource === source.key && (
              <motion.div
                className="absolute inset-0 rounded-xl border border-white/30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{
                  repeat: Infinity,
                  repeatType: 'reverse',
                  duration: 2,
                }}
              />
            )}

            <div className="relative z-10 space-y-2 text-left">
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'text-sm font-semibold transition-colors',
                    selectedSource === source.key ? 'text-white' : 'text-white/90 group-hover:text-white',
                  )}
                >
                  {source.name}
                </span>
                {selectedSource === source.key && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-white flex items-center justify-center"
                  >
                    <Check className="h-2.5 w-2.5 text-black" />
                  </motion.div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {selectedSource === source.key ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-xs font-medium text-white/90 flex items-center gap-1"
                  >
                    <Check className="h-3 w-3" />
                    Currently active
                  </motion.div>
                ) : (
                  <span className="text-xs text-white/50 group-hover:text-white/70">Click to select</span>
                )}
              </div>
            </div>

            <div
              className={cn(
                'absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300',
                'bg-gradient-to-br from-white/10 via-transparent to-transparent',
                'group-hover:opacity-100',
                selectedSource === source.key && 'opacity-30',
              )}
            />
          </motion.button>
        ))}
      </motion.div>

      {selectedSource === 'screen-share' && (
        <motion.div
          className="mt-8 p-6 rounded-xl bg-gradient-to-br from-white/5 to-transparent border border-white/10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          {mode === 'room-setup' && (
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => setMode('create')}
                className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
              >
                Create Room
              </button>
              <button
                onClick={() => setMode('join')}
                className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
              >
                Join Room
              </button>
            </div>
          )}

          {mode === 'create' && (
            <form onSubmit={handleCreateRoom} className="space-y-4">
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/50"
                required
              />
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                type="password"
                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/50"
                required
              />
              <button
                type="submit"
                className="w-full px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
              >
                Create Room
              </button>
            </form>
          )}

          {mode === 'join' && (
            <form onSubmit={handleJoinRoom} className="space-y-4">
              <input
                value={joinRoomId}
                onChange={(e) => setJoinRoomId(e.target.value)}
                placeholder="Room ID"
                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/50"
                required
              />
              <input
                value={joinUsername}
                onChange={(e) => setJoinUsername(e.target.value)}
                placeholder="Username (optional)"
                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/50"
              />
              <input
                value={joinPassword}
                onChange={(e) => setJoinPassword(e.target.value)}
                placeholder="Password"
                type="password"
                className="w-full p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/50"
                required
              />
              <button
                type="submit"
                className="w-full px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
              >
                Join Room
              </button>
            </form>
          )}

          {mode === 'in-room' && (
            <div className="space-y-6">
              {isCreator && (
                <p className="text-white/80">
                  Share this URL: {window.location.origin}#room={roomId}
                </p>
              )}
              <div className="flex flex-col md:flex-row gap-4">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className={cn('rounded-lg w-full md:w-1/2', isCreator ? '' : 'hidden')}
                />
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className={cn('rounded-lg w-full md:w-1/2', isCreator ? 'hidden' : '')}
                />
              </div>
              <div className="relative">
                {isCreator &&
                  Object.entries(remoteCursors).map(([id, pos]) => (
                    <div
                      key={id}
                      style={{
                        position: 'absolute',
                        left: `${pos.x}px`,
                        top: `${pos.y}px`,
                        pointerEvents: 'none',
                        width: '20px',
                        height: '20px',
                        backgroundColor: 'red',
                        borderRadius: '50%',
                        opacity: 0.5,
                      }}
                    />
                  ))}
              </div>
              <div className="chat space-y-2">
                <div className="h-40 overflow-y-auto p-3 rounded-lg bg-white/5 border border-white/10">
                  {messages.map((msg, idx) => (
                    <p key={idx} className="text-white/90">
                      <span className="font-semibold">{msg.from}:</span> {msg.text}
                    </p>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    value={chatText}
                    onChange={(e) => setChatText(e.target.value)}
                    placeholder="Type a message"
                    className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/50"
                  />
                  <button
                    onClick={sendMessage}
                    className="px-4 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
                  >
                    Send
                  </button>
                </div>
              </div>
              {!isCreator && (
                <button
                  onClick={requestControl}
                  className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition"
                >
                  Request Control
                </button>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
};

export default VideoSourceSelector;
