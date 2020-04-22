import initializePeer from "./peer"
import io from "socket.io-client"

export default function (parent) {
  const socket = io("/", { query: `room=${parent.roomId}` })
  parent.socket = socket

  // parent.startLocalVideo()

  socket.on("connect", () => {
    console.log("Connected to signalling server, Peer ID: %s", socket.id)

    /* On connect, we will send and receive data from all connected peers */
    socket.on("peer", (data) => {
      const peerId = data.peerId
      const peer = initializePeer(parent, socket, data)
      console.log("Peer added", peerId)

      parent.setState((prevState) => ({
        peers: {
          ...prevState.peers,
          [peerId]: {
            id: peerId,
            peer: peer,
            name: "",
            muted: false,
            volume: 1,
          },
        },
      }))
    })

    socket.on("room-data", (data) => {
      parent.setState({
        currentSong: data.nowPlaying.videoData,
        currentSinger: data.nowPlaying.singerId,
      })
    })

    socket.on("destroy", (id) => {
      parent.setState((prevState) => {
        const { peers, videoStreams } = prevState
        delete peers[id]
        delete videoStreams[id]
        return {
          peers,
          videoStreams,
        }
      })
    })

    socket.on("notification", (data) => {
      parent.setState({ notification: null })
      parent.setState({ notification: data.message })

      setTimeout(() => {
        if (parent.state.notification === data.message) {
          parent.setState({ notification: null })
        }
      }, 5000)
    })

    socket.on("song-added-success", (data) => {
      parent.setState({
        songInputNotification: data.message,
      })

      setTimeout(() => {
        parent.setState({
          songInputNotification: null,
        })
      }, 3000)
    })

    socket.on("new-song", ({ currentSong, currentSinger, upNext }) => {
      console.log(arguments, "new-song")

      parent.setState({
        currentSong,
        currentSinger,
        upNext,
      })
    })
  })
}
