require("dotenv").config()

const express = require("express")
const app = express()
const server = require("http").Server(app)
const io = require("socket.io")(server)
const { v4: uuidV4 } = require("uuid")

app.set("view engine", "ejs")
app.use(express.static("public"))

app.locals.firebaseApiKey = process.env.FIREBASE_API_KEY
app.locals.firebaseAuthDomain = process.env.FIREBASE_AUTH_DOMAIN
app.locals.firebaseProjectId = process.env.FIREBASE_PROJECT_ID
app.locals.firebaseStorageBucket = process.env.FIREBASE_STORAGE_BUCKET
app.locals.firebaseMessagingSenderId = process.env.FIREBASE_MESSAGING_SENDER_ID
app.locals.firebaseAppId = process.env.FIREBASE_APP_ID
app.locals.firebaseDatabaseURL = process.env.FIREBASE_DATABASE_URL

app.get("/", (req, res) => {
    res.redirect(`/${uuidV4()}`)
})

app.get("/:room", (req, res) => {
    res.render("room", { roomId: req.params.room })
})

// Track streamer for each room
const roomStreamer = {}

io.on("connection", socket => {
    socket.on("join-room", (roomId, userId) => {
        socket.join(roomId)
        
        // Determine if user is streamer or viewer
        const isStreamer = !roomStreamer[roomId]
        if (isStreamer) {
            roomStreamer[roomId] = userId
            // Notify existing users that streamer joined
            socket.to(roomId).emit("streamer-joined", userId)
        } else {
            // Tell new viewer who the streamer is
            socket.emit("streamer-id", roomStreamer[roomId])
        }
        
        // Tell the user their role
        socket.emit("user-role", isStreamer ? "streamer" : "viewer")
        
        // Notify streamer of new viewer
        socket.to(roomId).emit("viewer-joined", userId)

        socket.on("disconnect", () => {
            // If streamer disconnects, clear the room
            if (roomStreamer[roomId] === userId) {
                delete roomStreamer[roomId]
                // Notify viewers that stream ended
                io.to(roomId).emit("streamer-disconnected")
            }
            socket.to(roomId).emit("user-disconnected", userId)
        })
    })
})

const PORT = process.env.PORT || 3000
server.listen(PORT, () => {
    console.log(`Sunucu ${PORT} portunda çalışıyor`)
})