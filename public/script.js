import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getDatabase, ref, set, update, increment, onValue } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-database.js";

const firebaseConfig = {
    apiKey: window.ENV.FIREBASE_API_KEY,
    authDomain: window.ENV.FIREBASE_AUTH_DOMAIN,
    databaseURL: window.ENV.FIREBASE_DATABASE_URL,
    projectId: window.ENV.FIREBASE_PROJECT_ID,
    storageBucket: window.ENV.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: window.ENV.FIREBASE_MESSAGING_SENDER_ID,
    appId: window.ENV.FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const db = getDatabase();

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
    const streamerOptions = document.getElementById("streamer-options")
    const viewerOptions = document.getElementById("viewer-options")

    if (role === "streamer") {
        document.title = "Streamer"
        roleDisplay.textContent = "Yayıncı Modu"
        roleDisplay.className = "streamer"
        viewerOptions.remove()

        // Streamer: get camera/mic and broadcast
        navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        }).then(stream => {
            myStream = stream
            addVideoStream(myVideo, stream)
        }).catch(err => {
            console.log("Camera/mic error:", err)
            roleDisplay.textContent = "Erişim reddedildi."
        })
    } else {
        document.title = "Viewer"
        roleDisplay.textContent = "İzleyici Modu"
        roleDisplay.className = "viewer"
        streamerOptions.remove()
        document.body.setAttribute("id", "watching")

        // check database
        let boombasticRoomId = location.toString().split("//fototobb.onrender.com/")[1]; //- //fototobb.onrender.com
        onValue(ref(db, "rooms/" + boombasticRoomId), (snapshot) => {
            const data = snapshot.val();
            roleDisplay.textContent = data.name;
            document.getElementById("viewers").textContent = data.viewers;
            document.getElementById("heart").textContent = data.reactions.heart;
            document.getElementById("applause").textContent = data.reactions.applause;
            document.getElementById("conffetti").textContent = data.reactions.conffetti;
            document.getElementById("funny").textContent = data.reactions.funny;
            document.getElementById("shocked").textContent = data.reactions.shocked;
            document.getElementById("think").textContent = data.reactions.think;

            timeElapsed(data.timestamp);



            document.body.innerHTML = document.body.innerHTML + `<div id="dialog" style="position: fixed;top: 0;left: 0;width: 100%;height: 100%;z-index: 999;background: rgb(0 0 0 / 15%);display: flex;justify-content: center;align-items: center;"><div style="padding: 2rem 3rem;background: #fff;border-radius: 1rem;display: flex;justify-content: center;align-items: center;gap: 0.5rem;color: #111;font-size: 1.2rem;flex-direction: column;"><p style="padding: 0;margin: 0;">Yayına hoş geldiniz!</p><span style="font-size: 1rem;opacity: 0.8;">${data.name}</span><button id="continue" style="font-size: 1rem;background: #222;margin-top: 1rem;">Devam et</button></div></div>`;

            document.getElementById("continue").addEventListener("click", () => {
                document.querySelector("#dialog").remove();
            });
        })
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

                let boombasticRoomId = location.toString().split("//fototobb.onrender.com/")[1]; //- //fototobb.onrender.com
                update(ref(db, "rooms/" + boombasticRoomId), {
                    viewers: increment(1)
                })
            }
        }, 500)
    }
})

// Streamer disconnected - notify viewers
socket.on("streamer-disconnected", () => {
    const roleDisplay = document.getElementById("role-display")
    roleDisplay.textContent = "Yayın sonlandırıldı."
    roleDisplay.className = ""
    videoGrid.innerHTML = '' // Clear the video feed

    let boombasticRoomId = location.toString().split("//fototobb.onrender.com/")[1]; //- //fototobb.onrender.com

    set(ref(db, 'rooms/' + boombasticRoomId), {});
})

socket.on("user-disconnected", userId => {
    if (peers[userId]) {
        peers[userId].close()
        let boombasticRoomId = location.toString().split("//fototobb.onrender.com/")[1]; //- //fototobb.onrender.com
        update(ref(db, "rooms/" + boombasticRoomId), {
            viewers: increment(-1)
        })
    }
})

document.addEventListener('click', () => {
    if (document.querySelector("video")) { document.querySelector("video").play() }
})

function addVideoStream(video, stream) {
    video.srcObject = stream
    video.addEventListener("loadedmetadata", () => {
        video.autoplay = true
        video.playsInline = true
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



//firebasesal
document.getElementById("startStream").addEventListener("click", () => {
    let roomId = location.toString().split("//fototobb.onrender.com/")[1]; //- //fototobb.onrender.com
    let name = document.getElementById("name").value;
    const time = Date.now(); 

    set(ref(db, 'rooms/' + roomId), {
        viewers: 0,
        name: name,
        timestamp: time,
        reactions: {
            heart: 0,
            applause: 0,
            conffetti: 0,
            funny: 0,
            shocked: 0,
            think: 0,
        }
    }).then(() => {
        document.getElementById("streamer-options").innerHTML = `<p>${name}</p>
        <i>0 kişi şuan canlı izliyor.</i>
        <button class="display:block;width:100%;" id="endStream">Yayını sonlandır</button>
        <div id="heartStat">
            <span>❤️</span>
            <span></span>
        </div>
        <div id="applauseStat">
            <span>👏</span>
            <span></span>
        </div>
        <div id="conffettiStat">
            <span>🎉</span>
            <span></span>
        </div>
        <div id="funnyStat">
            <span>😂</span>
            <span></span>
        </div>
        <div id="shockedStat">
            <span>😦</span>
            <span></span>
        </div>
        <div id="thinkStat">
            <span>🤔</span>
            <span></span>
        </div>
        `;

        let boombasticRoomId = location.toString().split("//fototobb.onrender.com/")[1]; //- //fototobb.onrender.com
        onValue(ref(db, "rooms/" + boombasticRoomId), (snapshot) => {
            const data = snapshot.val();
            document.querySelector("i").innerText = data.viewers + " kişi şuan canlı izliyor.";
            document.querySelector("#heartStat > span:nth-child(2)").innerText = data.reactions.heart;
            document.querySelector("#applauseStat > span:nth-child(2)").innerText = data.reactions.applause;
            document.querySelector("#conffettiStat > span:nth-child(2)").innerText = data.reactions.conffetti;
            document.querySelector("#funnyStat > span:nth-child(2)").innerText = data.reactions.funny;
            document.querySelector("#shockedStat > span:nth-child(2)").innerText = data.reactions.shocked;
            document.querySelector("#thinkStat > span:nth-child(2)").innerText = data.reactions.think;

            let equalReactions = data.reactions.heart + data.reactions.applause + data.reactions.conffetti + data.reactions.funny + data.reactions.shocked + data.reactions.think;
            document.querySelector("#heartStat").setAttribute("style", `background: linear-gradient(to right, rgb(255 255 255 / 0.2) 0% ${Math.round(data.reactions.heart / equalReactions * 100)}%, transparent ${Math.round(data.reactions.heart / equalReactions * 100)}% 100%)`);
            document.querySelector("#applauseStat").setAttribute("style", `background: linear-gradient(to right, rgb(255 255 255 / 0.2) 0% ${Math.round(data.reactions.applause / equalReactions * 100)}%, transparent ${Math.round(data.reactions.applause / equalReactions * 100)}% 100%)`);
            document.querySelector("#conffettiStat").setAttribute("style", `background: linear-gradient(to right, rgb(255 255 255 / 0.2) 0% ${Math.round(data.reactions.conffetti / equalReactions * 100)}%, transparent ${Math.round(data.reactions.conffetti / equalReactions * 100)}% 100%)`);
            document.querySelector("#funnyStat").setAttribute("style", `background: linear-gradient(to right, rgb(255 255 255 / 0.2) 0% ${Math.round(data.reactions.funny / equalReactions * 100)}%, transparent ${Math.round(data.reactions.funny / equalReactions * 100)}% 100%)`);
            document.querySelector("#shockedStat").setAttribute("style", `background: linear-gradient(to right, rgb(255 255 255 / 0.2) 0% ${Math.round(data.reactions.shocked / equalReactions * 100)}%, transparent ${Math.round(data.reactions.shocked / equalReactions * 100)}% 100%)`);
            document.querySelector("#thinkStat").setAttribute("style", `background: linear-gradient(to right, rgb(255 255 255 / 0.2) 0% ${Math.round(data.reactions.think / equalReactions * 100)}%, transparent ${Math.round(data.reactions.think / equalReactions * 100)}% 100%)`);
        })

        document.getElementById("endStream").addEventListener("click", () => {
            set(ref(db, "rooms/" + roomId), {}).then(() => {
                location.href = "about:blank";
            })
        });
    })
})

function timeElapsed(timestamp) {
    setInterval(() => {
        const seconds = Math.floor((Date.now() - timestamp) / 1000);

        if (seconds < 60) {
            document.getElementById("time").textContent = `${seconds} sn`;
        }

        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;

        document.getElementById("time").textContent = `${minutes }dk ${remainingSeconds} sn`;
    }, 500);
    
}

document.getElementById("addHeart").addEventListener("click", () => { increase("heart") });
document.getElementById("addApplause").addEventListener("click", () => { increase("applause") });
document.getElementById("addConffetti").addEventListener("click", () => { increase("conffetti") });
document.getElementById("addFunny").addEventListener("click", () => { increase("funny") });
document.getElementById("addShocked").addEventListener("click", () => { increase("shocked") });
document.getElementById("addThink").addEventListener("click", () => { increase("think") });

function increase(thing) {
    let boombasticRoomId = location.toString().split("//fototobb.onrender.com/")[1]; //- //fototobb.onrender.com
    let what = `reactions/${thing}`;

    update(ref(db, "rooms/" + boombasticRoomId), {
        [what]: increment(1)
    });
}

document.getElementById("fullscreenBtn").addEventListener("click", () => {
    document.getElementById("options").style.display = "none";
    document.body.setAttribute("style", "padding: 0; background: #000");
    videoGrid.setAttribute("style", "width: 100dvw !important; height: 100dvh; display: flex; justify-content: center; align-items: center;");
    
    let btn = document.createElement("button");
    btn.setAttribute("id", "unscreen");
    btn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6"><path stroke-linecap="round" stroke-linejoin="round" d="M9 9V4.5M9 9H4.5M9 9 3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5 5.25 5.25" /></svg>';

    videoGrid.append(btn);

    document.getElementById("unscreen").addEventListener("click", () => {
        document.getElementById("options").style.display = "";
        document.body.setAttribute("style", "");
        videoGrid.setAttribute("style", "");

        document.getElementById("unscreen").remove();
    });
});