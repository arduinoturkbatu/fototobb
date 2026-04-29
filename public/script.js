const socket = io("/")
const videoGrid = document.getElementById("video-grid")
const myPeer = new Peer()
const myVideo = document.createElement("video")
myVideo.muted = true // Streamer shouldn't hear themselves
const peers = {}
let myRole = "viewer"
let myStream = null

myPeer.on("open", id => {
    console.log("My peer ID:", id)
    socket.emit("join-room", ROOM_ID, id)
})

// Handle incoming calls (This handles the Viewer side)
myPeer.on("call", call => {
    console.log("Received call from:", call.peer)

    if (myRole === "viewer") {
        // Viewer: Answer the streamer's call without sending our own stream
        console.log("Answering streamer's call...")
        call.answer()

        const video = document.createElement("video")
        call.on("stream", userVideoStream => {
            console.log("Received stream from streamer!")
            // Clear grid to prevent duplicate videos if the streamer reconnects
            videoGrid.innerHTML = ''
            addVideoStream(video, userVideoStream)
        })
    } else if (myRole === "streamer" && myStream) {
        // Fallback just in case a viewer somehow calls the streamer
        call.answer(myStream)
    }
})

// Handle role assignment from server
socket.on("user-role", role => {
    myRole = role
    console.log("Your role:", role)

    const roleDisplay = document.getElementById("role-display")
    if (role === "streamer") {
        document.title = "Streamer"
        roleDisplay.textContent = "Yayıncı Modu"
        roleDisplay.className = "streamer"

        // Streamer: get camera/mic and broadcast
        navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        }).then(stream => {
            myStream = stream
            addVideoStream(myVideo, stream)
        }).catch(err => {
            console.log("Camera/mic error:", err)
            roleDisplay.textContent = "Camera/Mic access denied!"
        })
    } else {
        document.title = "Viewer"
        roleDisplay.textContent = "İzleyici Modu"
        roleDisplay.className = "viewer"
    }
})

// Streamer: when a new viewer joins, call them (This handles the Streamer side)
socket.on("viewer-joined", userId => {
    console.log("Viewer joined:", userId)
    if (myRole === "streamer") {
        // Ensure the streamer's media is fully loaded before calling the viewer
        const checkStream = setInterval(() => {
            if (myStream) {
                clearInterval(checkStream)
                connectToNewViewer(userId, myStream)
            }
        }, 500)
    }
})

// Streamer disconnected - notify viewers
socket.on("streamer-disconnected", () => {
    const roleDisplay = document.getElementById("role-display")
    roleDisplay.textContent = "Streamer has left the room"
    roleDisplay.className = ""
    videoGrid.innerHTML = '' // Clear the video feed
})

socket.on("user-disconnected", userId => {
    if (peers[userId]) peers[userId].close()
})

function addVideoStream(video, stream) {
    video.srcObject = stream
    video.addEventListener("loadedmetadata", () => {
        video.play()
    })
    videoGrid.append(video)
}

function connectToNewViewer(userId, stream) {
    console.log("Calling new viewer:", userId)

    // Streamer calls the viewer and passes the media stream
    const call = myPeer.call(userId, stream)

    call.on("close", () => {
        console.log("Connection to viewer closed")
    })

    call.on("error", err => {
        console.error("Call error:", err)
    })

    peers[userId] = call
}