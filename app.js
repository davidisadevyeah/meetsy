const SIGNALING_URL = "wss://meetsy-qtvi.onrender.com";

let ws = null;
let roomId = null;
let myId = null;

let localStream = null;
let screenStream = null;

const peers = new Map();
const remoteStreams = new Map();

const rtcConfig = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    },
    {
      urls: "stun:stun1.l.google.com:19302"
    },
    {
      urls: "stun:stun2.l.google.com:19302"
    }
  ]
};

function send(data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function createPeer(userId, initiator) {
  if (peers.has(userId)) {
    return peers.get(userId);
  }

  const pc = new RTCPeerConnection(rtcConfig);

  peers.set(userId, pc);

  if (localStream) {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream);
    }
  }

  pc.onicecandidate = event => {
    if (event.candidate) {
      send({
        type: "ice",
        to: userId,
        candidate: event.candidate
      });
    }
  };

  pc.ontrack = event => {
    let stream = remoteStreams.get(userId);

    if (!stream) {
      stream = new MediaStream();
      remoteStreams.set(userId, stream);
    }

    if (!stream.getTracks().some(t => t.id === event.track.id)) {
      stream.addTrack(event.track);
    }

    addRemoteVideo(userId, stream);
  };

  pc.onconnectionstatechange = () => {
    if (
      pc.connectionState === "failed" ||
      pc.connectionState === "closed" ||
      pc.connectionState === "disconnected"
    ) {
      removePeer(userId);
    }
  };

  if (initiator) {
    makeOffer(userId, pc);
  }

  return pc;
}

async function makeOffer(userId, pc) {
  try {
    const offer = await pc.createOffer();

    await pc.setLocalDescription(offer);

    send({
      type: "offer",
      to: userId,
      offer: pc.localDescription
    });
  } catch (err) {
    console.error("Offer error:", err);
  }
}

async function handleOffer(msg) {
  const pc = createPeer(msg.from, false);

  try {
    await pc.setRemoteDescription(
      new RTCSessionDescription(msg.offer)
    );

    const answer = await pc.createAnswer();

    await pc.setLocalDescription(answer);

    send({
      type: "answer",
      to: msg.from,
      answer: pc.localDescription
    });
  } catch (err) {
    console.error("Answer error:", err);
  }
}

async function handleAnswer(msg) {
  const pc = peers.get(msg.from);

  if (!pc) return;

  try {
    await pc.setRemoteDescription(
      new RTCSessionDescription(msg.answer)
    );
  } catch (err) {
    console.error("Remote answer error:", err);
  }
}

async function handleIce(msg) {
  const pc = peers.get(msg.from);

  if (!pc || !msg.candidate) return;

  try {
    await pc.addIceCandidate(
      new RTCIceCandidate(msg.candidate)
    );
  } catch (err) {
    console.error("ICE error:", err);
  }
}

function removePeer(userId) {
  const pc = peers.get(userId);

  if (pc) {
    pc.close();
  }

  peers.delete(userId);
  remoteStreams.delete(userId);

  const video = document.querySelector(
    `[data-peer-id="${CSS.escape(userId)}"]`
  );

  if (video) {
    video.remove();
  }

  updateVideoLayout();
}

function addRemoteVideo(userId, stream) {
  let video = document.querySelector(
    `[data-peer-id="${CSS.escape(userId)}"]`
  );

  if (!video) {
    video = document.createElement("video");

    video.dataset.peerId = userId;
    video.autoplay = true;
    video.playsInline = true;

    const container =
      document.querySelector("#videos") ||
      document.querySelector("#videoGrid") ||
      document.body;

    container.appendChild(video);
  }

  video.srcObject = stream;

  updateVideoLayout();
}

function updateVideoLayout() {
  const container =
    document.querySelector("#videos") ||
    document.querySelector("#videoGrid");

  if (!container) return;

  const videos = container.querySelectorAll("video");

  const count = videos.length;

  if (count <= 1) {
    container.style.gridTemplateColumns = "1fr";
  } else if (count <= 4) {
    container.style.gridTemplateColumns =
      "repeat(2, minmax(0, 1fr))";
  } else if (count <= 9) {
    container.style.gridTemplateColumns =
      "repeat(3, minmax(0, 1fr))";
  } else {
    container.style.gridTemplateColumns =
      "repeat(4, minmax(0, 1fr))";
  }
}

async function startCamera() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });

    const localVideo =
      document.querySelector("#localVideo") ||
      document.querySelector("#local-video");

    if (localVideo) {
      localVideo.srcObject = localStream;
      localVideo.muted = true;
      localVideo.autoplay = true;
      localVideo.playsInline = true;
    }

    for (const [userId, pc] of peers) {
      for (const track of localStream.getTracks()) {
        pc.addTrack(track, localStream);
      }

      await makeOffer(userId, pc);
    }
  } catch (err) {
    console.error("Camera/microphone error:", err);
    alert("Camera or microphone permission was denied.");
  }
}

async function toggleCamera() {
  if (!localStream) return;

  const track = localStream.getVideoTracks()[0];

  if (track) {
    track.enabled = !track.enabled;
  }
}

async function toggleMicrophone() {
  if (!localStream) return;

  const track = localStream.getAudioTracks()[0];

  if (track) {
    track.enabled = !track.enabled;
  }
}

async function toggleScreenShare() {
  if (!screenStream) {
    try {
      screenStream =
        await navigator.mediaDevices.getDisplayMedia({
          video: true
        });

      const screenTrack = screenStream.getVideoTracks()[0];

      for (const pc of peers.values()) {
        const sender = pc
          .getSenders()
          .find(s => s.track && s.track.kind === "video");

        if (sender) {
          await sender.replaceTrack(screenTrack);
        }
      }

      const localVideo =
        document.querySelector("#localVideo") ||
        document.querySelector("#local-video");

      if (localVideo) {
        localVideo.srcObject = screenStream;
      }

      screenTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.error("Screen share error:", err);
    }

    return;
  }

  stopScreenShare();
}

async function stopScreenShare() {
  if (!screenStream) return;

  screenStream.getTracks().forEach(track => track.stop());

  screenStream = null;

  const cameraTrack =
    localStream?.getVideoTracks()?.[0];

  if (cameraTrack) {
    for (const pc of peers.values()) {
      const sender = pc
        .getSenders()
        .find(s => s.track && s.track.kind === "video");

      if (sender) {
        await sender.replaceTrack(cameraTrack);
      }
    }
  }

  const localVideo =
    document.querySelector("#localVideo") ||
    document.querySelector("#local-video");

  if (localVideo && localStream) {
    localVideo.srcObject = localStream;
  }
}

function connectToRoom(id) {
  roomId = id;

  ws = new WebSocket(SIGNALING_URL);

  ws.onopen = () => {
    send({
      type: "join",
      room: roomId
    });
  };

  ws.onmessage = async event => {
    let msg;

    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }

    if (msg.type === "connected") {
      myId = msg.id;
      return;
    }

    if (msg.type === "room-users") {
      for (const userId of msg.users) {
        createPeer(userId, true);
      }

      return;
    }

    if (msg.type === "user-joined") {
      return;
    }

    if (msg.type === "offer") {
      await handleOffer(msg);
      return;
    }

    if (msg.type === "answer") {
      await handleAnswer(msg);
      return;
    }

    if (msg.type === "ice") {
      await handleIce(msg);
      return;
    }

    if (msg.type === "user-left") {
      removePeer(msg.id);
      return;
    }

    if (msg.type === "chat") {
      receiveChat(msg);
    }
  };

  ws.onclose = () => {
    console.log("Disconnected from Meetsy signaling server.");
  };

  ws.onerror = err => {
    console.error("WebSocket error:", err);
  };
}

function receiveChat(msg) {
  const chat =
    document.querySelector("#chatMessages") ||
    document.querySelector("#messages");

  if (!chat) return;

  const item = document.createElement("div");

  item.className = "chat-message";

  item.textContent =
    `${msg.from === myId ? "You" : "User"}: ${msg.message}`;

  chat.appendChild(item);
  chat.scrollTop = chat.scrollHeight;
}

function sendChat(message) {
  if (!message.trim()) return;

  send({
    type: "chat",
    message: message.trim()
  });
}

function getRoomFromURL() {
  const params = new URLSearchParams(location.search);

  return params.get("room");
}

function createRoomId() {
  return Math.random()
    .toString(36)
    .substring(2, 10)
    .toUpperCase();
}

function openRoom() {
  let id = getRoomFromURL();

  if (!id) {
    id = createRoomId();

    const url =
      location.origin +
      location.pathname +
      "?room=" +
      encodeURIComponent(id);

    history.replaceState({}, "", url);
  }

  connectToRoom(id);
}

window.Meetsy = {
  startCamera,
  toggleCamera,
  toggleMicrophone,
  toggleScreenShare,
  stopScreenShare,
  sendChat,
  connectToRoom,
  createRoomId
};

document.addEventListener("DOMContentLoaded", () => {
  openRoom();
});
