MEETSY — NO JITSI / WEBSOCKET / WEBRTC
=========================================

Files:
  server.js
  package.json
  public/index.html
  public/style.css
  public/app.js

RUN:
  npm install
  npm start

Then open http://localhost:3000

WHAT IT DOES:
- WebSocket signaling
- WebRTC camera + microphone
- Screen sharing
- Multi-user rooms
- Live chat
- Shareable room URLs
- No Jitsi dependency

HOSTING:
The WebSocket server requires a Node.js-capable host.
InfinityFree's normal PHP/static hosting cannot run server.js or keep WebSockets.
The complete project can be deployed on a Node host.

HTTPS:
Production camera/microphone access should use HTTPS/WSS.

30+ USERS:
This implementation uses WebRTC full mesh. It is suitable for testing and
small rooms, but 30+ participants can become very heavy because each browser
maintains many peer connections. A production 30+ system should use an SFU
such as self-hosted mediasoup, Janus, or LiveKit rather than full mesh.
