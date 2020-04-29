const getNumberWithOrdinal = require("../util/numberHelper")
const PLAYER_STATES = require("../lib/playerStates")
const {
  initKaraokeUserSocket,
  teardownKaraokeUserSocket,
} = require("./karaoke-user-socket")
const debug = require("debug")("KaraokeRoom")

/**
 * Room Class:
 * Attributes:
 * * Song Queue <Song[]>
 * * nowPlaying <Song>
 * * videoPosition
 * * users <Socket
 *
 * API:
 * * Add song
 * * Play (todo: auto play for now)
 * * Stop (todo)
 *
 * Events:
 * * 'now-playing': new song has been moved to playing position (room data)
 * * 'song-added': new song added to queue (room data)
 * * 'empty-queue': no more songs left in queue (room data)
 * * 'clients-ready': all clients have loaded
 *
 */

class KaraokeRoom {
  constructor(props) {
    const requiredProps = ["id", "io"]
    requiredProps.forEach((prop) => {
      if (!props[prop]) {
        throw new Error(`KaraokeRoom requires ${prop}`)
      }
    })

    this.id = props.id
    this.io = props.io
    this.songQueue = []
    this.nowPlaying = null
    this.videoPosition = 0
    this.users = {}
    this.awaitingClients = []
    this.playerStatus = null
  }

  addUser = (socket) => {
    socket.join(this.id)
    initKaraokeUserSocket(socket, this)
    this.users[socket.id] = socket
    this.sendRoomData(this.roomData(), socket)
    if (this.awaitingClients.length > 0) this.awaitingClients.push(socket.id)
    debug("Added user %s. %s total", socket.id, Object.keys(this.users).length)
  }

  removeUser = (socket) => {
    teardownKaraokeUserSocket(socket)
    this.updateAwaitingClients(socket)

    // If this was the current user, trash that video
    if (this.nowPlaying && this.nowPlaying.singerId === socket.id) {
      this.stopVideo()
      this.cycleSongs()
    }
    delete this.users[socket.id]
  }

  // Adds song data and singerId to song queue
  // Notifies room
  // Sends success to user
  // Sends room data to room
  addToSongQueue = (videoData, userId) => {
    this.songQueue.push({
      singerId: userId,
      videoData,
    })
    this.songQueueUpdated()
    // Send success feedback to user
    let message
    if (this.songQueue.length === 0) {
      message = `Song added. Get ready to sing!`
    } else {
      const placeInLine = getNumberWithOrdinal(this.songQueue.length)
      message = `Song added. It's ${placeInLine} in line. 🔥`
    }

    this.users[userId].emit("song-added-success", {
      message,
    })
  }

  songQueueUpdated = () => {
    this.notifyRoom(
      `A new song was just added to the queue 👻 (${this.songQueue.length} total)`
    )

    if (this.nowPlaying) {
      this.sendRoomData(this.roomData())
    } else {
      this.cycleSongs()
    }
  }

  songIsPlaying = () => {
    return this.playerStatus === PLAYER_STATES.PLAYING
  }

  // This method can be called at any time (even to skip current song)
  cycleSongs = (cb) => {
    const currentSong = (this.nowPlaying = this.songQueue.shift() || null)
    this.videoPosition = 0

    if (currentSong) {
      this.playerStatus = PLAYER_STATES.UNSTARTED
      this.refreshAwaitingClients()
      this.notifyRoom(`Queueing up ${currentSong.videoData.title}`)
    } else {
      this.playerStatus = null
      this.awaitingClients = []
      this.notifyRoom(`Song Queue is empty. Add more!`)
    }
  }

  refreshAwaitingClients = () => {
    this.awaitingClients = Object.keys(this.users)
  }

  removeUserFromAwaiting = (socket) => {
    this.awaitingClients = this.awaitingClients.filter((id) => id !== socket.id)
  }

  updateAwaitingClients = (socket) => {
    this.removeUserFromAwaiting(socket)
    // If waiting list is now empty and a song is queued up,
    // set status to PLAYING and notify room
    if (this.awaitingClients.length === 0 && this.nowPlaying) {
      this.notifyRoom(`Now playing: ${this.nowPlaying.videoData.title}`)
      this.playVideo()
    } else {
      debug("Still waiting on %s clients", this.awaitingClients.length)
    }
  }

  playVideo = (socket = null) => {
    this.playerStatus = PLAYER_STATES.PLAYING
    this.#videoControl(PLAYER_STATES.PLAYING, socket)
  }

  stopVideo = (socket = null) => {
    this.#videoControl(PLAYER_STATES.ENDED, socket)
  }

  #videoControl = (code, socket = null) => {
    const emitter = socket ? socket : this.io.to(this.id)
    emitter.emit("video-control", code)
  }

  notifyRoom = (message) => {
    this.io.to(this.id).emit("notification", {
      message,
    })
  }

  sendRoomData = (data, socket = null) => {
    const emitter = socket ? socket : this.io.to(this.id)
    emitter.emit("room-data", data)
  }

  roomData = () => ({
    currentSong: this.nowPlaying,
    currentSinger: this.nowPlaying ? this.nowPlaying.singerId : null,
    upNext: this.songQueue[0],
    position: this.videoPosition,
  })
}

module.exports = {
  KaraokeRoom,
}
