import Peer from "simple-peer";

export default function (chatComponent, socket, data) {
  const peerId = data.peerId;
  const socketId = socket.id;

  const peer = new Peer({
    initiator: data.initiator,
    trickle: true,
    objectMode: true,
  });

  console.log(
    "Peer available for connection discovered from signalling server, Peer ID: %s",
    peerId
  );

  /* Handle receiving signal from new peer */
  socket.on("signal", (data) => {
    if (data.peerId === peerId && chatComponent.state.peers[peerId]) {
      if (!peer.destroyed) {
        peer.signal(data.signal);
      }
    }
  });

  /* Allow peer to handle receiving signal from this peer */
  /**
   * 1. This peer sends signal (automatic)
   * 2. Our instance of peerX here receives signal event
   * 3. Pass data through socket.io so that it is received by the other client
   */
  peer.on("signal", function (data) {
    socket.emit("signal", {
      signal: data,
      peerId: peerId,
    });
  });

  peer.on("connect", function () {
    if (chatComponent.state.videoEnabled && chatComponent.peerStream) {
      console.log(chatComponent.state.videoEnabled, "videoEnabled " + socketId);

      if (peer.streams.length === 0) {
        console.log("Adding stream to new connection");
        // debugger;
        // peer.addStream(chatComponent.peerStream);
      }
    }
    peer.send("Hello from " + socket.id);
  });

  socket.on("disconnect-video", (socketId) => {
    const vid = document.getElementById(`${socketId}-video`);
    if (vid) {
      vid.srcObject = null;
    }
  });

  // We are receiving a stream from this peer, feed it to respective video element
  peer.on("stream", function (stream) {
    console.log("Receiving stream from " + peerId);
    let vid;

    function addPeerVid() {
      const vidId = `${peerId}-video`;
      console.log(vidId);
      vid = document.getElementById(vidId);
      if (!vid) {
        console.log("element not in dom, retrying");
        setTimeout(() => {
          addPeerVid();
        }, 1000);
      } else if (vid.srcObject) {
        console.log("Already streaming peer");
      } else {
        console.log("Element found, adding stream");
        vid.srcObject = stream;
      }
    }

    addPeerVid();
  });

  peer.on("data", (data) => {
    console.log(data);
  });

  peer.on("destroy", () => {
    console.log("destroy");

    socket.emit("destroy", peerId);
  });

  return peer;
}
